import datetime

from sqlalchemy import text

from app.config import settings
from app.db.session import AsyncSessionLocal
from app.graphql.types import GradeEvent, GradeInput
from app.kafka.producer import get_producer


async def insert_grade_and_produce(
    student_id: int, subject_code: str, semester_id: int, grade: float
) -> tuple[int, str]:
    """Insert a grade row and publish the event to Kafka. Returns (grade_id, timestamp)."""
    ts = datetime.datetime.utcnow().isoformat()
    async with AsyncSessionLocal() as session:
        row = await session.execute(
            text(
                "INSERT INTO grades (student_id, subject_code, semester_id, grade)"
                " VALUES (:sid, :sc, :sem, :g) RETURNING grade_id"
            ),
            {"sid": student_id, "sc": subject_code, "sem": semester_id, "g": grade},
        )
        grade_id = int(row.scalar())
        await session.commit()
    producer = await get_producer()
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
    return grade_id, ts


async def resolve_submit_grade(input: GradeInput) -> GradeEvent:
    grade_id, ts = await insert_grade_and_produce(
        input.student_id, input.subject_code, input.semester_id, input.grade
    )
    return GradeEvent(
        grade_id=grade_id,
        student_id=input.student_id,
        subject_code=input.subject_code,
        semester_id=input.semester_id,
        grade=input.grade,
        timestamp=ts,
    )


async def resolve_overall_average_gpa() -> float:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("""
                SELECT SUM(g.grade * sub.units) / SUM(sub.units)
                FROM grades g
                JOIN subjects sub ON g.subject_code = sub.subject_code
            """)
        )
        val = result.scalar()
        return round(float(val or 0), 4)


async def resolve_grade_count() -> int:
    async with AsyncSessionLocal() as session:
        result = await session.execute(text("SELECT COUNT(*) FROM grades"))
        return int(result.scalar())


async def resolve_recent_grades(limit: int) -> list[GradeEvent]:
    async with AsyncSessionLocal() as session:
        rows = (
            await session.execute(
                text(
                    "SELECT grade_id, student_id, subject_code, semester_id, grade "
                    "FROM grades ORDER BY grade_id DESC LIMIT :limit"
                ),
                {"limit": limit},
            )
        ).fetchall()
    return [
        GradeEvent(
            grade_id=r.grade_id,
            student_id=r.student_id,
            subject_code=r.subject_code,
            semester_id=r.semester_id,
            grade=r.grade,
            timestamp=None,
        )
        for r in rows
    ]


async def resolve_grades_before(before_id: int, limit: int) -> list[GradeEvent]:
    async with AsyncSessionLocal() as session:
        rows = (
            await session.execute(
                text(
                    "SELECT grade_id, student_id, subject_code, semester_id, grade "
                    "FROM grades WHERE grade_id < :before_id ORDER BY grade_id DESC LIMIT :limit"
                ),
                {"before_id": before_id, "limit": limit},
            )
        ).fetchall()
    return [
        GradeEvent(
            grade_id=r.grade_id,
            student_id=r.student_id,
            subject_code=r.subject_code,
            semester_id=r.semester_id,
            grade=r.grade,
            timestamp=None,
        )
        for r in rows
    ]
