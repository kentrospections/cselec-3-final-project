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
) -> list[StudentSummary]:
    # ── Phase 1: fetch student rows (no GPA aggregation) ──────────────────────
    # Join grades only when a semester_id filter is requested.
    async with AsyncSessionLocal() as session:
        if semester_id is not None:
            params: dict = {"semester_id": semester_id}
            course_clause = "AND s.course = :course" if course is not None else ""
            if course is not None:
                params["course"] = course
            student_rows = (
                await session.execute(
                    text(f"""
                        SELECT DISTINCT s.student_id, s.name, s.course,
                                        s.is_at_risk, s.at_risk_score
                        FROM students s
                        JOIN grades g ON s.student_id = g.student_id
                        WHERE g.semester_id = :semester_id {course_clause}
                    """),
                    params,
                )
            ).fetchall()
        else:
            params = {}
            where = ""
            if course is not None:
                where = "WHERE course = :course"
                params["course"] = course
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
                        SELECT student_id, AVG(grade) AS gpa
                        FROM grades
                        WHERE student_id = ANY(:ids)
                        GROUP BY student_id
                    """),
                    {"ids": miss_ids},
                )
            ).fetchall()

        for r in gpa_rows:
            gpa = float(r.gpa) if r.gpa is not None else 0.0
            gpas[r.student_id] = gpa
            await set_cached_gpa(r.student_id, gpa)

    # ── Filter by stored at_risk_score when atRisk: true ─────────────────────
    if at_risk is True:
        student_rows = [r for r in student_rows if r.at_risk_score >= 0.5]

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
            }
        sem_map[r.semester_id]["grades"].append(
            GradeRecord(subject_code=r.subject_code, description=r.description, grade=r.grade)
        )

    semesters_out = []
    all_grades: list[float] = []
    for sem in sem_map.values():
        grades = sem["grades"]
        sem_gpa = sum(g.grade for g in grades) / len(grades) if grades else 0.0
        all_grades.extend(g.grade for g in grades)
        semesters_out.append(
            SemesterGrades(
                semester_id=sem["semester_id"],
                semester=sem["semester"],
                school_year=sem["school_year"],
                gpa=round(sem_gpa, 4),
                grades=grades,
            )
        )

    overall_gpa = sum(all_grades) / len(all_grades) if all_grades else 0.0

    return StudentDetail(
        student_id=student_row.student_id,
        name=student_row.name,
        course=student_row.course,
        gpa=round(overall_gpa, 4),
        is_at_risk=bool(student_row.is_at_risk),
        at_risk_score=round(float(student_row.at_risk_score), 4),
        semesters=semesters_out,
    )
