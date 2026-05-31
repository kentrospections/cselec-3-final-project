from collections import defaultdict
from typing import Optional

import numpy as np
from sqlalchemy import text

from app.cache.redis_client import get_cached_gpa, set_cached_gpa
from app.db.session import AsyncSessionLocal
from app.graphql.types import GradeRecord, SemesterGrades, StudentDetail, StudentSummary
from app.ml.classifier import get_model


async def resolve_students(
    at_risk: Optional[bool],
    course: Optional[str],
    semester_id: Optional[int],
) -> list[StudentSummary]:
    async with AsyncSessionLocal() as session:
        filters = []
        params: dict = {}
        if course is not None:
            filters.append("s.course = :course")
            params["course"] = course
        if semester_id is not None:
            filters.append("g.semester_id = :semester_id")
            params["semester_id"] = semester_id

        where = ("WHERE " + " AND ".join(filters)) if filters else ""

        rows = (
            await session.execute(
                text(f"""
                    SELECT
                        s.student_id,
                        s.name,
                        s.course,
                        s.is_at_risk,
                        AVG(g.grade) AS gpa
                    FROM students s
                    JOIN grades g ON s.student_id = g.student_id
                    {where}
                    GROUP BY s.student_id, s.name, s.course, s.is_at_risk
                """),
                params,
            )
        ).fetchall()

    # Hydrate GPAs through Redis cache
    student_data = []
    cache_misses = []
    for row in rows:
        cached = await get_cached_gpa(row.student_id)
        if cached is not None:
            gpa = cached
        else:
            gpa = float(row.gpa) if row.gpa is not None else 0.0
            cache_misses.append((row.student_id, gpa))
        student_data.append((row, gpa))

    for sid, gpa in cache_misses:
        await set_cached_gpa(sid, gpa)

    if at_risk:
        model = get_model()
        if model is None:
            return []

        # Compute per-semester GPA for all students in one global aggregate —
        # avoids passing a 500K-element ID list as a SQL parameter.
        async with AsyncSessionLocal() as session:
            slope_rows = (
                await session.execute(
                    text("""
                        SELECT student_id, semester_id, AVG(grade) AS sem_gpa
                        FROM grades
                        GROUP BY student_id, semester_id
                        ORDER BY student_id, semester_id
                    """)
                )
            ).fetchall()

            fail_rows = (
                await session.execute(
                    text("""
                        SELECT
                            student_id,
                            COUNT(*) FILTER (WHERE grade < 75)                    AS fail_count,
                            COUNT(DISTINCT subject_code) FILTER (WHERE grade < 75) AS fail_subjects
                        FROM grades
                        GROUP BY student_id
                    """)
                )
            ).fetchall()

        sem_gpas: dict[int, list[float]] = defaultdict(list)
        for r in slope_rows:
            sem_gpas[r.student_id].append(float(r.sem_gpa))

        fail_map = {r.student_id: (int(r.fail_count), int(r.fail_subjects)) for r in fail_rows}

        feature_list = []
        for row, gpa in student_data:
            gpas = sem_gpas[row.student_id]
            slope = float(np.polyfit(range(len(gpas)), gpas, 1)[0]) if len(gpas) >= 2 else 0.0
            fc, fs = fail_map.get(row.student_id, (0, 0))
            feature_list.append([gpa, slope, float(fc), float(fs)])

        X = np.array(feature_list, dtype=float)
        probs = model.predict_proba(X)[:, 1]

        return [
            StudentSummary(
                student_id=row.student_id,
                name=row.name,
                course=row.course,
                gpa=round(gpa, 4),
                is_at_risk=bool(row.is_at_risk),
            )
            for (row, gpa), prob in zip(student_data, probs)
            if prob >= 0.5
        ]

    return [
        StudentSummary(
            student_id=row.student_id,
            name=row.name,
            course=row.course,
            gpa=round(gpa, 4),
            is_at_risk=bool(row.is_at_risk),
        )
        for row, gpa in student_data
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
        semesters=semesters_out,
    )
