import asyncio
import json
import logging

import numpy as np
from aiokafka import AIOKafkaConsumer
from sqlalchemy import text

from app.cache.redis_client import invalidate_gpa
from app.config import settings
from app.db.session import AsyncSessionLocal
from app.ml.classifier import get_model

logger = logging.getLogger(__name__)

# Registry of queues for active GraphQL subscription connections
_subscription_queues: list[asyncio.Queue] = []


def add_subscription_queue(q: asyncio.Queue) -> None:
    _subscription_queues.append(q)


def remove_subscription_queue(q: asyncio.Queue) -> None:
    try:
        _subscription_queues.remove(q)
    except ValueError:
        pass


async def _make_consumer(group_id: str) -> AIOKafkaConsumer:
    for attempt in range(12):
        try:
            consumer = AIOKafkaConsumer(
                settings.kafka_topic,
                bootstrap_servers=settings.kafka_bootstrap_servers,
                group_id=group_id,
                value_deserializer=lambda v: json.loads(v.decode()),
                auto_offset_reset="latest",
            )
            await consumer.start()
            return consumer
        except Exception as exc:
            wait = 2 ** min(attempt, 5)
            logger.warning("Kafka not ready (%s), retrying in %ds...", exc, wait)
            await asyncio.sleep(wait)
    raise RuntimeError("Could not connect to Kafka after multiple retries")


async def _recompute_at_risk_score(student_id: int) -> None:
    model = get_model()
    if model is None:
        return

    async with AsyncSessionLocal() as session:
        agg = (
            await session.execute(
                text("""
                    SELECT
                        AVG(grade)                                             AS gpa,
                        COUNT(*) FILTER (WHERE grade < 75)                    AS fail_count,
                        COUNT(DISTINCT subject_code) FILTER (WHERE grade < 75) AS fail_subjects
                    FROM grades
                    WHERE student_id = :sid
                """),
                {"sid": student_id},
            )
        ).fetchone()

        if agg is None or agg.gpa is None:
            return

        sem_rows = (
            await session.execute(
                text("""
                    SELECT AVG(grade) AS sem_gpa
                    FROM grades
                    WHERE student_id = :sid
                    GROUP BY semester_id
                    ORDER BY semester_id
                """),
                {"sid": student_id},
            )
        ).fetchall()

        gpas = [float(r.sem_gpa) for r in sem_rows]
        slope = float(np.polyfit(range(len(gpas)), gpas, 1)[0]) if len(gpas) >= 2 else 0.0

        features = np.array([[
            float(agg.gpa),
            slope,
            float(agg.fail_count),
            float(agg.fail_subjects),
        ]])
        score = float(model.predict_proba(features)[0, 1])

        await session.execute(
            text("UPDATE students SET at_risk_score = :score WHERE student_id = :sid"),
            {"score": score, "sid": student_id},
        )
        await session.commit()


async def cache_invalidator_consumer() -> None:
    consumer = await _make_consumer("cache-invalidator")
    try:
        async for msg in consumer:
            student_id = msg.value.get("student_id")
            if student_id is not None:
                await invalidate_gpa(int(student_id))
                await _recompute_at_risk_score(int(student_id))
    finally:
        await consumer.stop()


async def subscription_pusher_consumer() -> None:
    consumer = await _make_consumer("subscription-pusher")
    try:
        async for msg in consumer:
            event = msg.value
            for q in list(_subscription_queues):
                await q.put(event)
    finally:
        await consumer.stop()
