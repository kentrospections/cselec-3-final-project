"""
Standalone seed script — run BEFORE starting the API.

Usage:
    uv run python scripts/seed.py

Requires PostgreSQL to be running and accessible via DATABASE_DSN in .env.
Inserts 500,000 students, 15 semesters, 10 subjects, and ~37.5M grade rows,
then trains the at-risk logistic regression classifier and saves it.
"""
import asyncio
import os
import random
import sys
from collections import defaultdict
from pathlib import Path

import asyncpg
import joblib
import numpy as np
from dotenv import load_dotenv
from faker import Faker
from sklearn.linear_model import LogisticRegression

load_dotenv(Path(__file__).parent.parent / ".env")

DB_DSN = os.environ.get("DATABASE_DSN", "postgresql://postgres:password@localhost:5432/analytics")
MODEL_PATH = os.environ.get("MODEL_PATH", "model/at_risk_classifier.joblib")

SUBJECTS = [
    ("CS101", "Intro to Programming", 3),
    ("CS102", "Data Structures", 3),
    ("CS103", "Database Systems", 3),
    ("CS104", "Operating Systems", 3),
    ("CS105", "Artificial Intelligence", 3),
    ("ENG101", "Engineering Math", 4),
    ("ENG102", "Physics", 4),
    ("ENG103", "Circuits", 4),
    ("ENG104", "Thermodynamics", 4),
    ("ENG105", "Control Systems", 4),
]

SEMESTERS = [
    (sem, year)
    for year in range(2020, 2025)
    for sem in ["FirstSem", "SecondSem", "Summer"]
]  # 15 entries

COURSES = ["BSCS", "BSECE", "BSME", "BSEE", "BSIT"]
SUBJECTS_PER_SEMESTER = 5
NUM_STUDENTS = 500_000
AT_RISK_RATIO = 0.15
BATCH_SIZE = 10_000

fake = Faker()
Faker.seed(42)
random.seed(42)
np.random.seed(42)


async def main() -> None:
    print(f"Connecting to {DB_DSN} ...")
    conn = await asyncpg.connect(DB_DSN)

    print("Inserting subjects and semesters ...")
    await conn.executemany(
        "INSERT INTO subjects(subject_code, description, units) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        SUBJECTS,
    )

    for i, (sem, year) in enumerate(SEMESTERS, start=1):
        await conn.execute(
            "INSERT INTO semesters(semester_id, semester, school_year) "
            "VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
            i, sem, year,
        )

    sem_ids = list(range(1, len(SEMESTERS) + 1))
    subject_codes = [s[0] for s in SUBJECTS]

    # ------------------------------------------------------------------
    # Generate student records
    # ------------------------------------------------------------------
    print(f"Generating {NUM_STUDENTS:,} student records ...")
    n_at_risk = int(NUM_STUDENTS * AT_RISK_RATIO)
    student_records = [
        (fake.name(), random.choice(COURSES), idx < n_at_risk)
        for idx in range(NUM_STUDENTS)
    ]

    print("Bulk-inserting students via COPY ...")
    async with conn.transaction():
        await conn.copy_records_to_table(
            "students",
            columns=["name", "course", "is_at_risk"],
            records=student_records,
        )

    print("Fetching student IDs ...")
    id_rows = await conn.fetch("SELECT student_id, is_at_risk FROM students ORDER BY student_id")
    student_ids = [(r["student_id"], bool(r["is_at_risk"])) for r in id_rows]
    print(f"Loaded {len(student_ids):,} students")

    # ------------------------------------------------------------------
    # Generate and stream-insert grades in batches
    # ------------------------------------------------------------------
    print("Generating and inserting grade rows ...")
    total_grades = 0
    grade_buffer: list[tuple] = []

    async def flush(buf: list[tuple]) -> None:
        await conn.copy_records_to_table(
            "grades",
            columns=["student_id", "subject_code", "semester_id", "grade"],
            records=buf,
        )

    for student_id, is_at_risk in student_ids:
        for sem_idx, semester_id in enumerate(sem_ids):
            chosen = random.sample(subject_codes, SUBJECTS_PER_SEMESTER)
            for subject_code in chosen:
                if is_at_risk:
                    base = random.uniform(60.0, 79.0)
                    grade = max(50.0, base - sem_idx * 0.5)
                else:
                    base = random.uniform(80.0, 100.0)
                    grade = min(100.0, base + sem_idx * 0.1)
                grade_buffer.append((student_id, subject_code, semester_id, round(grade, 2)))

        if len(grade_buffer) >= BATCH_SIZE:
            await flush(grade_buffer)
            total_grades += len(grade_buffer)
            grade_buffer.clear()
            if total_grades % 1_000_000 == 0:
                print(f"  Inserted {total_grades:,} grade rows ...")

    if grade_buffer:
        await flush(grade_buffer)
        total_grades += len(grade_buffer)

    print(f"Total grade rows inserted: {total_grades:,}")

    # ------------------------------------------------------------------
    # Feature extraction for ML training
    # ------------------------------------------------------------------
    print("Extracting features for model training ...")

    agg_rows = await conn.fetch("""
        SELECT
            s.student_id,
            s.is_at_risk,
            AVG(g.grade)                                            AS gpa,
            COUNT(*) FILTER (WHERE g.grade < 75)                   AS fail_count,
            COUNT(DISTINCT g.subject_code) FILTER (WHERE g.grade < 75) AS fail_subjects
        FROM students s
        JOIN grades g ON s.student_id = g.student_id
        GROUP BY s.student_id, s.is_at_risk
    """)

    print("Extracting per-semester GPA for slope computation ...")
    sem_gpa_rows = await conn.fetch("""
        SELECT student_id, semester_id, AVG(grade) AS sem_gpa
        FROM grades
        GROUP BY student_id, semester_id
        ORDER BY student_id, semester_id
    """)

    sem_gpas: dict[int, list[float]] = defaultdict(list)
    for r in sem_gpa_rows:
        sem_gpas[int(r["student_id"])].append(float(r["sem_gpa"]))

    print("Building feature matrix ...")
    X, y = [], []
    for row in agg_rows:
        sid = int(row["student_id"])
        gpa = float(row["gpa"])
        gpas = sem_gpas[sid]
        slope = float(np.polyfit(range(len(gpas)), gpas, 1)[0]) if len(gpas) >= 2 else 0.0
        X.append([gpa, slope, float(row["fail_count"]), float(row["fail_subjects"])])
        y.append(int(row["is_at_risk"]))

    print(f"Training logistic regression on {len(X):,} students ...")
    model = LogisticRegression(max_iter=1000, random_state=42)
    model.fit(X, y)

    Path(MODEL_PATH).parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_PATH)
    print(f"Model saved to {MODEL_PATH}")

    await conn.close()
    print("Seed complete.")


if __name__ == "__main__":
    asyncio.run(main())
