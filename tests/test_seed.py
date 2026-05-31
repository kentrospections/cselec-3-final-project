"""
Tests for scripts/seed.py.

Runs a mini-seed (20 students instead of 500K) against the test PostgreSQL
container to verify the data pipeline and model training without taking hours.

The seed script uses asyncpg.connect(DB_DSN) which needs a plain DSN
(no SQLAlchemy driver prefix).
"""

import pytest
from sqlalchemy import text

import scripts.seed as seed_mod


def _plain_url(pg_container) -> str:
    """asyncpg-compatible plain URL (no SQLAlchemy +driver prefix)."""
    url = pg_container.get_connection_url()
    return (
        url.replace("+psycopg2", "")
           .replace("+asyncpg", "")
           .replace("postgresql+", "postgresql")
    )


@pytest.fixture
def mini_seed(monkeypatch, pg, tmp_path, _run_migrations):
    """Override seed module-level constants for a small, fast run."""
    monkeypatch.setattr(seed_mod, "DB_DSN", _plain_url(pg))
    monkeypatch.setattr(seed_mod, "NUM_STUDENTS", 20)
    monkeypatch.setattr(seed_mod, "MODEL_PATH", str(tmp_path / "test_model.joblib"))
    return tmp_path


async def test_seed_inserts_correct_student_count(mini_seed, session_factory):
    await seed_mod.main()
    async with session_factory() as session:
        count = (await session.execute(text("SELECT COUNT(*) FROM students"))).scalar_one()
    assert count == 20


async def test_seed_inserts_all_subjects(mini_seed, session_factory):
    await seed_mod.main()
    async with session_factory() as session:
        count = (await session.execute(text("SELECT COUNT(*) FROM subjects"))).scalar_one()
    assert count == 10


async def test_seed_inserts_all_semesters(mini_seed, session_factory):
    await seed_mod.main()
    async with session_factory() as session:
        count = (await session.execute(text("SELECT COUNT(*) FROM semesters"))).scalar_one()
    assert count == 15


async def test_seed_grade_row_count(mini_seed, session_factory):
    """20 students × 15 semesters × 5 subjects/semester = 1500 grade rows."""
    await seed_mod.main()
    async with session_factory() as session:
        count = (await session.execute(text("SELECT COUNT(*) FROM grades"))).scalar_one()
    assert count == 20 * 15 * 5


async def test_seed_saves_model_file(mini_seed):
    model_path = mini_seed / "test_model.joblib"
    await seed_mod.main()
    assert model_path.exists(), "Model file was not written by seed.py"


async def test_seed_at_risk_ratio(mini_seed, session_factory):
    """int(20 × 0.15) = 3 students should be flagged at-risk."""
    await seed_mod.main()
    async with session_factory() as session:
        count = (
            await session.execute(
                text("SELECT COUNT(*) FROM students WHERE is_at_risk = true")
            )
        ).scalar_one()
    assert count == 3


async def test_seed_grade_ranges(mini_seed, session_factory):
    """All generated grades must fall within 50–100."""
    await seed_mod.main()
    async with session_factory() as session:
        row = (
            await session.execute(text("SELECT MIN(grade), MAX(grade) FROM grades"))
        ).fetchone()
    assert row.min >= 50.0
    assert row.max <= 100.0


async def test_seed_stores_at_risk_scores(mini_seed, session_factory):
    """at_risk_score must be non-trivially populated — not left at the 0.0 default."""
    await seed_mod.main()
    async with session_factory() as session:
        row = (
            await session.execute(
                text("SELECT MIN(at_risk_score), MAX(at_risk_score) FROM students")
            )
        ).fetchone()
    # With 20 students (3 at-risk, 17 normal) the model should produce a range
    # of scores well above 0.0 for at-risk students.
    assert row.max > 0.0
