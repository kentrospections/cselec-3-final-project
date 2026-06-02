from typing import Optional

import numpy as np
from sqlalchemy import text

from app.cache.redis_client import (
    get_cached_semester_comparison,
    set_cached_semester_comparison,
)
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


def _trend_to_dict(t: SemesterTrend) -> dict:
    return {
        "semester": t.semester,
        "school_year": t.school_year,
        "average_gpa": t.average_gpa,
        "pass_rate": t.pass_rate,
        "at_risk_count": t.at_risk_count,
        "trend_slope": t.trend_slope,
        "trend_intercept": t.trend_intercept,
    }


async def resolve_semester_comparison(school_year: Optional[int]) -> list[SemesterTrend]:
    cached = await get_cached_semester_comparison(school_year)
    if cached is not None:
        return [SemesterTrend(**row) for row in cached]

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
                        SUM(g.grade * sub.units) / SUM(sub.units) AS avg_gpa,
                        COUNT(*) FILTER (WHERE g.grade >= 75)::float
                            / NULLIF(COUNT(*), 0) AS pass_rate,
                        (SELECT COUNT(*) FROM students WHERE is_at_risk = TRUE) AS at_risk_count
                    FROM grades g
                    JOIN semesters sem ON g.semester_id = sem.semester_id
                    JOIN subjects sub ON g.subject_code = sub.subject_code
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

    result = [
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

    await set_cached_semester_comparison(school_year, [_trend_to_dict(t) for t in result])
    return result
