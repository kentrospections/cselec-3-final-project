"""initial schema with partitioned grades

Revision ID: 0001
Revises:
Create Date: 2024-01-01 00:00:00.000000
"""
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE students (
            student_id SERIAL PRIMARY KEY,
            name VARCHAR NOT NULL,
            course VARCHAR NOT NULL,
            is_at_risk BOOLEAN NOT NULL DEFAULT FALSE
        )
    """)

    op.execute("""
        CREATE TABLE subjects (
            subject_code VARCHAR PRIMARY KEY,
            description VARCHAR NOT NULL,
            units INT NOT NULL
        )
    """)

    op.execute("""
        CREATE TABLE semesters (
            semester_id SERIAL PRIMARY KEY,
            semester VARCHAR NOT NULL,
            school_year INT NOT NULL
        )
    """)

    # Partitioned parent table — no PK on parent (partition key must be in PK)
    op.execute("""
        CREATE TABLE grades (
            grade_id BIGSERIAL,
            student_id INT NOT NULL REFERENCES students(student_id),
            subject_code VARCHAR NOT NULL REFERENCES subjects(subject_code),
            semester_id INT NOT NULL REFERENCES semesters(semester_id),
            grade FLOAT NOT NULL
        ) PARTITION BY RANGE (semester_id)
    """)

    # 15 child partitions, one per semester_id value 1..15
    for i in range(1, 16):
        op.execute(f"""
            CREATE TABLE grades_semester_{i}
            PARTITION OF grades
            FOR VALUES FROM ({i}) TO ({i + 1})
        """)

    # Indexes on parent propagate to all partitions automatically
    op.execute("CREATE INDEX idx_grades_student ON grades (student_id)")
    op.execute("CREATE INDEX idx_grades_semester ON grades (semester_id)")
    op.execute("CREATE INDEX idx_grades_subject ON grades (subject_code)")


def downgrade() -> None:
    for i in range(1, 16):
        op.execute(f"DROP TABLE IF EXISTS grades_semester_{i}")
    op.execute("DROP TABLE IF EXISTS grades")
    op.execute("DROP TABLE IF EXISTS semesters")
    op.execute("DROP TABLE IF EXISTS subjects")
    op.execute("DROP TABLE IF EXISTS students")
