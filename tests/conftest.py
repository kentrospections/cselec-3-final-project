"""
Shared fixtures for all tests.

Container lifecycle:
  - PostgreSQL, Redis, Kafka containers start once per session (session scope).
  - Alembic migrations run once against the test PostgreSQL container.
  - App modules (session factory, Redis client) are monkeypatched per-function
    so each test gets isolated configuration.
  - All tables are truncated after each test (clean_db, autouse).

Requires Docker to be running (containers are managed by testcontainers).
"""

import os
import subprocess
from pathlib import Path

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from testcontainers.kafka import KafkaContainer
from testcontainers.postgres import PostgresContainer
from testcontainers.redis import RedisContainer

ROOT = Path(__file__).parent.parent


# ─── URL helpers ──────────────────────────────────────────────────────────────

def _async_url(pg_container: PostgresContainer) -> str:
    """SQLAlchemy async URL using asyncpg driver."""
    url = pg_container.get_connection_url()
    if "+psycopg2" in url:
        return url.replace("+psycopg2", "+asyncpg")
    if "postgresql://" in url and "+asyncpg" not in url:
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


def _plain_url(pg_container: PostgresContainer) -> str:
    """Plain asyncpg-compatible DSN (no SQLAlchemy driver prefix)."""
    url = pg_container.get_connection_url()
    return (
        url.replace("+psycopg2", "")
           .replace("+asyncpg", "")
           .replace("postgresql+", "postgresql")
    )


# ─── Session-scoped containers (start once per test run) ─────────────────────

@pytest.fixture(scope="session")
def pg():
    with PostgresContainer("postgres:15") as c:
        yield c


@pytest.fixture(scope="session")
def rds():
    with RedisContainer("redis:7-alpine") as c:
        yield c


@pytest.fixture(scope="session")
def kafka():
    with KafkaContainer() as c:
        yield c


# ─── Alembic migrations (run once, session scope) ─────────────────────────────

@pytest.fixture(scope="session")
def _run_migrations(pg):
    """Run Alembic upgrade head once against the test PostgreSQL container."""
    env = {
        **os.environ,
        "DATABASE_URL": _async_url(pg),
    }
    result = subprocess.run(
        ["uv", "run", "alembic", "upgrade", "head"],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Alembic failed:\n{result.stderr}\n{result.stdout}")


# ─── Per-test async session factory ──────────────────────────────────────────

@pytest.fixture
def session_factory(pg, _run_migrations):
    engine = create_async_engine(_async_url(pg), echo=False)
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    return factory


# ─── Patch all app modules to use test containers ─────────────────────────────

@pytest.fixture(autouse=True)
def patch_app(monkeypatch, pg, rds, _run_migrations, session_factory):
    """
    Redirect every app module that touches the DB or Redis to the test containers.
    Resolvers bind AsyncSessionLocal at import time, so we patch the name in
    each resolver's module namespace directly.
    """
    import redis.asyncio as aioredis

    redis_port = rds.get_exposed_port(6379)
    test_redis = aioredis.from_url(
        f"redis://localhost:{redis_port}/0", decode_responses=True
    )

    import app.cache.redis_client as redis_mod
    import app.db.session as db_mod
    import app.graphql.resolvers.semesters as sem_mod
    import app.graphql.resolvers.students as stu_mod
    import app.graphql.resolvers.subjects as sub_mod
    import app.main as main_mod

    monkeypatch.setattr(db_mod, "AsyncSessionLocal", session_factory)
    monkeypatch.setattr(stu_mod, "AsyncSessionLocal", session_factory)
    monkeypatch.setattr(sub_mod, "AsyncSessionLocal", session_factory)
    monkeypatch.setattr(sem_mod, "AsyncSessionLocal", session_factory)
    monkeypatch.setattr(redis_mod, "_redis", test_redis)

    # Prevent Kafka consumer tasks from firing in the FastAPI lifespan.
    # Kafka-specific tests start their own consumers directly.
    async def _noop():
        pass

    monkeypatch.setattr(main_mod, "cache_invalidator_consumer", _noop)
    monkeypatch.setattr(main_mod, "subscription_pusher_consumer", _noop)

    return test_redis  # returned so tests/other fixtures can use it directly


# ─── Redis client shortcut ────────────────────────────────────────────────────

@pytest.fixture
def test_redis(patch_app):
    """The test Redis client, already wired into app modules by patch_app."""
    return patch_app


# ─── Clean DB after every test ────────────────────────────────────────────────

@pytest_asyncio.fixture(autouse=True)
async def clean_db(session_factory, patch_app):
    yield
    # Flush Redis so cached GPA values from one test don't bleed into the next
    test_redis = patch_app
    await test_redis.flushdb()
    # Truncate all DB tables and reset sequences
    async with session_factory() as session:
        await session.execute(
            text(
                "TRUNCATE grades, students, subjects, semesters "
                "RESTART IDENTITY CASCADE"
            )
        )
        await session.commit()


# ─── Minimal reference + student data ────────────────────────────────────────

@pytest_asyncio.fixture
async def seeded_db(session_factory):
    """
    Two students (Alice = normal, Bob = at-risk), 2 subjects, 2 semesters,
    grades for each combination.
    """
    async with session_factory() as session:
        await session.execute(
            text("""
                INSERT INTO subjects (subject_code, description, units) VALUES
                ('CS101', 'Intro to Programming', 3),
                ('CS102', 'Data Structures', 3)
            """)
        )
        await session.execute(
            text("""
                INSERT INTO semesters (semester_id, semester, school_year) VALUES
                (1, 'FirstSem', 2023),
                (2, 'SecondSem', 2023)
            """)
        )
        await session.execute(
            text("""
                INSERT INTO students (name, course, is_at_risk) VALUES
                ('Alice', 'BSCS', false),
                ('Bob',   'BSCS', true)
            """)
        )

        rows = (
            await session.execute(text("SELECT student_id, name FROM students ORDER BY student_id"))
        ).fetchall()
        ids = {r.name: r.student_id for r in rows}

        for sem_id in (1, 2):
            await session.execute(
                text("""
                    INSERT INTO grades (student_id, subject_code, semester_id, grade) VALUES
                    (:alice, 'CS101', :s, 90.0),
                    (:alice, 'CS102', :s, 88.0),
                    (:bob,   'CS101', :s, 62.0),
                    (:bob,   'CS102', :s, 65.0)
                """),
                {"alice": ids["Alice"], "bob": ids["Bob"], "s": sem_id},
            )
        await session.commit()

    yield ids  # {"Alice": 1, "Bob": 2}


# ─── FastAPI ASGI test client ─────────────────────────────────────────────────

@pytest_asyncio.fixture
async def client(patch_app):
    """httpx AsyncClient wired to the FastAPI ASGI app (no real HTTP server)."""
    from httpx import ASGITransport, AsyncClient
    from app.main import app as fastapi_app

    async with AsyncClient(
        transport=ASGITransport(app=fastapi_app), base_url="http://test"
    ) as c:
        yield c


# ─── Trained test model ───────────────────────────────────────────────────────

@pytest.fixture
def mock_model(monkeypatch):
    """
    Inject a tiny trained LogisticRegression into the ml.classifier module
    so atRisk resolver tests don't need a full seed run.
    Features: [gpa, slope, fail_count, fail_subjects]
    """
    import numpy as np
    from sklearn.linear_model import LogisticRegression
    from app.ml import classifier

    X = [
        [89.0,  0.1,  0,  0],
        [89.0,  0.1,  0,  0],
        [63.5, -0.5, 10,  2],
        [63.5, -0.5, 10,  2],
    ]
    y = [0, 0, 1, 1]
    model = LogisticRegression(max_iter=1000).fit(np.array(X), y)
    monkeypatch.setattr(classifier, "_model", model)
    return model
