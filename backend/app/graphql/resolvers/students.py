from typing import Optional

import numpy as np
from sqlalchemy import text

from app.cache.redis_client import get_cached_gpa, set_cached_gpa
from app.db.session import AsyncSessionLocal
from app.graphql.types import GradeRecord, SemesterGrades, StudentDetail, StudentSummary


async def resolve_students(
    at_risk: Optional[bool],
    course: Optional[str],
    semester_id: Optional[int],
    subject_code: Optional[str] = None,
) -> list[StudentSummary]:
    # ── Phase 1: fetch student rows (no GPA aggregation) ──────────────────────
    async with AsyncSessionLocal() as session:
        if semester_id is not None:
            conditions = ["g.semester_id = :semester_id"]
            params: dict = {"semester_id": semester_id}
            if course is not None:
                conditions.append("s.course = :course")
                params["course"] = course
            if subject_code is not None:
                conditions.append("g.subject_code = :subject_code")
                params["subject_code"] = subject_code
            student_rows = (
                await session.execute(
                    text(f"""
                        SELECT DISTINCT s.student_id, s.name, s.course,
                                        s.is_at_risk, s.at_risk_score
                        FROM students s
                        JOIN grades g ON s.student_id = g.student_id
                        WHERE {" AND ".join(conditions)}
                    """),
                    params,
                )
            ).fetchall()
        else:
            conditions = []
            params = {}
            if course is not None:
                conditions.append("course = :course")
                params["course"] = course
            if subject_code is not None:
                conditions.append(
                    "student_id IN (SELECT DISTINCT student_id FROM grades WHERE subject_code = :subject_code)"
                )
                params["subject_code"] = subject_code
            where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
            student_rows = (
                await session.execute(
                    text(f"SELECT student_id, name, course, is_at_risk, at_risk_score FROM students {where}"),
                    params,
                )
            ).fetchall()

    # ── Phase 2: check Redis first; hit DB only for cache misses ──────────────
    gpas: dict[int, float] = {}
    miss_ids: list[int] = []

    for row in student_rows:
        cached = await get_cached_gpa(row.student_id)
        if cached is not None:
            gpas[row.student_id] = cached
        else:
            miss_ids.append(row.student_id)

    if miss_ids:
        async with AsyncSessionLocal() as session:
            gpa_rows = (
                await session.execute(
                    text("""
                        SELECT g.student_id,
                               SUM(g.grade * sub.units) / SUM(sub.units) AS gpa
                        FROM grades g
                        JOIN subjects sub ON g.subject_code = sub.subject_code
                        WHERE g.student_id = ANY(:ids)
                        GROUP BY g.student_id
                    """),
                    {"ids": miss_ids},
                )
            ).fetchall()

        for r in gpa_rows:
            gpa = float(r.gpa) if r.gpa is not None else 0.0
            gpas[r.student_id] = gpa
            await set_cached_gpa(r.student_id, gpa)

    if at_risk is True:
        student_rows = [r for r in student_rows if r.at_risk_score >= 0.5]
    elif at_risk is False:
        student_rows = [r for r in student_rows if r.at_risk_score < 0.5]

    return [
        StudentSummary(
            student_id=row.student_id,
            name=row.name,
            course=row.course,
            gpa=round(gpas.get(row.student_id, 0.0), 4),
            is_at_risk=bool(row.is_at_risk),
            at_risk_score=round(float(row.at_risk_score), 4),
        )
        for row in student_rows
    ]


async def resolve_student(student_id: int) -> Optional[StudentDetail]:
    async with AsyncSessionLocal() as session:
        student_row = (
            await session.execute(
                text("SELECT * FROM students WHERE student_id = :id"),
                {"id": student_id},
            )
        ).fetchone()

        if student_row is None:
            return None

        grade_rows = (
            await session.execute(
                text("""
                    SELECT
                        g.semester_id,
                        sem.semester,
                        sem.school_year,
                        g.subject_code,
                        sub.description,
                        sub.units,
                        g.grade
                    FROM grades g
                    JOIN semesters sem ON g.semester_id = sem.semester_id
                    JOIN subjects sub ON g.subject_code = sub.subject_code
                    WHERE g.student_id = :id
                    ORDER BY sem.school_year, sem.semester_id
                """),
                {"id": student_id},
            )
        ).fetchall()

    # Group rows by semester
    sem_map: dict[int, dict] = {}
    for r in grade_rows:
        if r.semester_id not in sem_map:
            sem_map[r.semester_id] = {
                "semester_id": r.semester_id,
                "semester": r.semester,
                "school_year": r.school_year,
                "grades": [],
                "units": [],
            }
        sem_map[r.semester_id]["grades"].append(
            GradeRecord(subject_code=r.subject_code, description=r.description, grade=r.grade)
        )
        sem_map[r.semester_id]["units"].append(int(r.units))

    semesters_out = []
    total_weight = 0.0
    weighted_sum = 0.0
    for sem in sem_map.values():
        grades = sem["grades"]
        units_list = sem["units"]
        sem_units = sum(units_list)
        sem_gpa = (
            sum(g.grade * u for g, u in zip(grades, units_list)) / sem_units
            if sem_units else 0.0
        )
        weighted_sum += sum(g.grade * u for g, u in zip(grades, units_list))
        total_weight += sem_units
        semesters_out.append(
            SemesterGrades(
                semester_id=sem["semester_id"],
                semester=sem["semester"],
                school_year=sem["school_year"],
                gpa=round(sem_gpa, 4),
                grades=grades,
            )
        )

    overall_gpa = weighted_sum / total_weight if total_weight else 0.0

    return StudentDetail(
        student_id=student_row.student_id,
        name=student_row.name,
        course=student_row.course,
        gpa=round(overall_gpa, 4),
        is_at_risk=bool(student_row.is_at_risk),
        at_risk_score=round(float(student_row.at_risk_score), 4),
        semesters=semesters_out,
    )
