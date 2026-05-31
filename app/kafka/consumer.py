import asyncio
import json
import logging

from aiokafka import AIOKafkaConsumer
from app.config import settings
from app.cache.redis_client import invalidate_gpa

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


async def cache_invalidator_consumer() -> None:
    consumer = await _make_consumer("cache-invalidator")
    try:
        async for msg in consumer:
            student_id = msg.value.get("student_id")
            if student_id is not None:
                await invalidate_gpa(int(student_id))
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
