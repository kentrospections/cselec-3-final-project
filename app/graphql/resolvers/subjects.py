from typing import Optional

from sqlalchemy import text

from app.db.session import AsyncSessionLocal
from app.graphql.types import Subject, SubjectAnalytics


async def resolve_subjects() -> list[Subject]:
    async with AsyncSessionLocal() as session:
        rows = (await session.execute(text("SELECT * FROM subjects ORDER BY subject_code"))).fetchall()
    return [Subject(subject_code=r.subject_code, description=r.description, units=r.units) for r in rows]


async def resolve_subject_analytics(subject_code: str) -> Optional[SubjectAnalytics]:
    async with AsyncSessionLocal() as session:
        subject_row = (
            await session.execute(
                text("SELECT * FROM subjects WHERE subject_code = :code"),
                {"code": subject_code},
            )
        ).fetchone()

        if subject_row is None:
            return None

        agg = (
            await session.execute(
                text("""
                    SELECT
                        AVG(grade) AS avg_grade,
                        COUNT(*) FILTER (WHERE grade >= 75)::float / NULLIF(COUNT(*), 0) AS pass_rate,
                        COUNT(*) FILTER (WHERE grade >= 60 AND grade < 70)  AS b60,
                        COUNT(*) FILTER (WHERE grade >= 70 AND grade < 75)  AS b70,
                        COUNT(*) FILTER (WHERE grade >= 75 AND grade < 80)  AS b75,
                        COUNT(*) FILTER (WHERE grade >= 80 AND grade < 90)  AS b80,
                        COUNT(*) FILTER (WHERE grade >= 90 AND grade <= 100) AS b90
                    FROM grades
                    WHERE subject_code = :code
                """),
                {"code": subject_code},
            )
        ).fetchone()

    return SubjectAnalytics(
        subject_code=subject_row.subject_code,
        description=subject_row.description,
        average_grade=round(float(agg.avg_grade or 0), 4),
        pass_rate=round(float(agg.pass_rate or 0), 4),
        grade_distribution={
            "60-69": int(agg.b60),
            "70-74": int(agg.b70),
            "75-79": int(agg.b75),
            "80-89": int(agg.b80),
            "90-100": int(agg.b90),
        },
    )
