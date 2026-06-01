from sqlalchemy import text

from app.db.session import AsyncSessionLocal
from app.graphql.types import GradeEvent


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
