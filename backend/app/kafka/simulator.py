import asyncio
import datetime
import json
import logging
import random

from aiokafka import AIOKafkaProducer
from sqlalchemy import text

from app.config import settings
from app.db.session import AsyncSessionLocal

logger = logging.getLogger(__name__)

SUBJECT_CODES = [
    "CS101", "CS102", "CS103", "CS104", "CS105",
    "ENG101", "ENG102", "ENG103", "ENG104", "ENG105",
]
SEMESTER_IDS = list(range(1, 16))


async def grade_simulator_task(interval: int) -> None:
    producer = AIOKafkaProducer(
        bootstrap_servers=settings.kafka_bootstrap_servers,
        value_serializer=lambda v: json.dumps(v).encode(),
    )
    await producer.start()
    logger.info("Grade simulator started (interval=%ds)", interval)
    try:
        while True:
            student_id = random.randint(1, 100)
            subject_code = random.choice(SUBJECT_CODES)
            semester_id = random.choice(SEMESTER_IDS)
            ts = datetime.datetime.utcnow().isoformat()

            async with AsyncSessionLocal() as session:
                row = (
                    await session.execute(
                        text("SELECT at_risk_score FROM students WHERE student_id = :sid"),
                        {"sid": student_id},
                    )
                ).fetchone()

                if row is not None:
                    # Grade centered on student tendency with noise so at-risk students
                    # can rebound and safe students can occasionally slip.
                    # at_risk_score=1.0 → center≈60, at_risk_score=0.0 → center≈90
                    center = 90.0 - float(row.at_risk_score) * 30.0
                    grade = round(max(50.0, min(100.0, random.gauss(center, 15.0))), 2)
                else:
                    grade = round(random.uniform(60.0, 100.0), 2)

                await session.execute(
                    text(
                        "INSERT INTO grades (student_id, subject_code, semester_id, grade) "
                        "VALUES (:sid, :sc, :sem, :g)"
                    ),
                    {"sid": student_id, "sc": subject_code, "sem": semester_id, "g": grade},
                )
                await session.commit()

            await producer.send(
                settings.kafka_topic,
                {
                    "student_id": student_id,
                    "subject_code": subject_code,
                    "semester_id": semester_id,
                    "grade": grade,
                    "timestamp": ts,
                },
            )
            logger.debug("Simulated grade: student=%d %s sem=%d grade=%.2f", student_id, subject_code, semester_id, grade)
            await asyncio.sleep(interval)
    finally:
        await producer.stop()
        logger.info("Grade simulator stopped")
