from typing import Optional

import numpy as np
from sqlalchemy import text

from app.db.session import AsyncSessionLocal
from app.graphql.types import Semester, SemesterTrend


async def resolve_semesters() -> list[Semester]:
    async with AsyncSessionLocal() as session:
        rows = (
            await session.execute(
                text("SELECT * FROM semesters ORDER BY school_year, semester_id")
            )
        ).fetchall()
    return [Semester(semester_id=r.semester_id, semester=r.semester, school_year=r.school_year) for r in rows]


async def resolve_semester_comparison(school_year: Optional[int]) -> list[SemesterTrend]:
    params: dict = {}
    year_filter = ""
    if school_year is not None:
        year_filter = "WHERE sem.school_year = :school_year"
        params["school_year"] = school_year

    async with AsyncSessionLocal() as session:
        rows = (
            await session.execute(
                text(f"""
                    SELECT
                        sem.semester_id,
                        sem.semester,
                        sem.school_year,
                        AVG(g.grade) AS avg_gpa,
                        COUNT(*) FILTER (WHERE g.grade >= 75)::float
                            / NULLIF(COUNT(*), 0) AS pass_rate,
                        COUNT(DISTINCT s.student_id) FILTER (WHERE s.is_at_risk) AS at_risk_count
                    FROM grades g
                    JOIN semesters sem ON g.semester_id = sem.semester_id
                    JOIN students s ON g.student_id = s.student_id
                    {year_filter}
                    GROUP BY sem.semester_id, sem.semester, sem.school_year
                    ORDER BY sem.semester_id
                """),
                params,
            )
        ).fetchall()

    if not rows:
        return []

    x = np.arange(len(rows), dtype=float)
    y = np.array([float(r.avg_gpa or 0) for r in rows])
    slope, intercept = np.polyfit(x, y, 1) if len(rows) >= 2 else (0.0, float(y[0]) if len(y) else 0.0)

    return [
        SemesterTrend(
            semester=r.semester,
            school_year=r.school_year,
            average_gpa=round(float(r.avg_gpa or 0), 4),
            pass_rate=round(float(r.pass_rate or 0), 4),
            at_risk_count=int(r.at_risk_count or 0),
            trend_slope=round(float(slope), 6),
            trend_intercept=round(float(intercept), 6),
        )
        for r in rows
    ]
