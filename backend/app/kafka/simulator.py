import asyncio
import logging
import random

from sqlalchemy import text

from app.db.session import AsyncSessionLocal
from app.graphql.resolvers.grades import insert_grade_and_produce

logger = logging.getLogger(__name__)

SUBJECT_CODES = [
    "CS101", "CS102", "CS103", "CS104", "CS105",
    "ENG101", "ENG102", "ENG103", "ENG104", "ENG105",
]
SEMESTER_IDS = list(range(1, 16))

# Per-student per-subject aptitude offset, lazily populated so the simulator
# produces consistent subject-strength patterns across runs.
_aptitude: dict[tuple[int, str], float] = {}


def _get_aptitude(student_id: int, subject_code: str) -> float:
    key = (student_id, subject_code)
    if key not in _aptitude:
        _aptitude[key] = random.gauss(0, 12.0)
    return _aptitude[key]


async def _simulate_one(student_id: int) -> None:
    subject_code = random.choice(SUBJECT_CODES)
    semester_id = random.choice(SEMESTER_IDS)

    async with AsyncSessionLocal() as session:
        row = (
            await session.execute(
                text("SELECT at_risk_score FROM students WHERE student_id = :sid"),
                {"sid": student_id},
            )
        ).fetchone()

    if row is not None:
        # Grade centred on the student's risk tendency with per-subject aptitude and noise.
        # at_risk_score=1.0 → centre≈60, at_risk_score=0.0 → centre≈90
        center = 90.0 - float(row.at_risk_score) * 30.0
        aptitude = _get_aptitude(student_id, subject_code)
        grade = round(max(50.0, min(100.0, random.gauss(center + aptitude, 20.0))), 2)
    else:
        grade = round(random.uniform(55.0, 100.0), 2)

    await insert_grade_and_produce(student_id, subject_code, semester_id, grade)
    logger.debug(
        "Simulated grade: student=%d %s sem=%d grade=%.2f",
        student_id, subject_code, semester_id, grade,
    )


async def grade_simulator_task(interval: int) -> None:
    """Continuously simulate grade events.

    `interval` is kept in the signature for config backwards-compatibility but is
    ignored — timing is now random between 3–10 s with a batch of 1–5 grades per tick.
    """
    logger.info("Grade simulator started")
    try:
        while True:
            batch_size = random.randint(1, 5)
            tasks = [_simulate_one(random.randint(1, 1000)) for _ in range(batch_size)]
            await asyncio.gather(*tasks)
            await asyncio.sleep(random.uniform(3.0, 10.0))
    except asyncio.CancelledError:
        pass
    finally:
        logger.info("Grade simulator stopped")
