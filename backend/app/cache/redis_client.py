import json
from typing import Any, Optional

import redis.asyncio as aioredis

from app.config import settings

GPA_TTL = 300        # 5 minutes — per-student GPA, Kafka-invalidated
ANALYTICS_TTL = 600  # 10 minutes — population-level analytics, TTL-only
GRADE_COUNT_TTL = 60 # 1 minute — grade count, TTL-only

_redis: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis


async def close_redis() -> None:
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None


# ── Generic helpers ──────────────────────────────────────────────────────────

async def _get_json(key: str) -> Any | None:
    r = await get_redis()
    val = await r.get(key)
    return json.loads(val) if val is not None else None


async def _set_json(key: str, value: Any, ex: int) -> None:
    r = await get_redis()
    await r.set(key, json.dumps(value), ex=ex)


async def _delete(key: str) -> None:
    r = await get_redis()
    await r.delete(key)


# ── Student GPA (Kafka-invalidated) ──────────────────────────────────────────

async def get_cached_gpa(student_id: int) -> float | None:
    val = await _get_json(f"gpa:{student_id}")
    return float(val) if val is not None else None


async def set_cached_gpa(student_id: int, gpa: float) -> None:
    await _set_json(f"gpa:{student_id}", gpa, GPA_TTL)


async def invalidate_gpa(student_id: int) -> None:
    await _delete(f"gpa:{student_id}")


# ── Semester comparison (TTL-only) ───────────────────────────────────────────

def _sem_cmp_key(school_year: Optional[int]) -> str:
    return f"sem_cmp:{school_year if school_year is not None else 'all'}"


async def get_cached_semester_comparison(school_year: Optional[int]) -> list | None:
    return await _get_json(_sem_cmp_key(school_year))


async def set_cached_semester_comparison(school_year: Optional[int], data: list) -> None:
    await _set_json(_sem_cmp_key(school_year), data, ANALYTICS_TTL)


# ── Subject analytics (Kafka-invalidated per subject) ────────────────────────

async def get_cached_subject_analytics(subject_code: str) -> dict | None:
    return await _get_json(f"subj_analytics:{subject_code}")


async def set_cached_subject_analytics(subject_code: str, data: dict) -> None:
    await _set_json(f"subj_analytics:{subject_code}", data, ANALYTICS_TTL)


async def invalidate_subject_analytics(subject_code: str) -> None:
    await _delete(f"subj_analytics:{subject_code}")


# ── Overall average GPA (TTL-only) ───────────────────────────────────────────

async def get_cached_overall_avg_gpa() -> float | None:
    val = await _get_json("overall_avg_gpa")
    return float(val) if val is not None else None


async def set_cached_overall_avg_gpa(val: float) -> None:
    await _set_json("overall_avg_gpa", val, ANALYTICS_TTL)


# ── Grade count (TTL-only) ───────────────────────────────────────────────────

async def get_cached_grade_count() -> int | None:
    val = await _get_json("grade_count")
    return int(val) if val is not None else None


async def set_cached_grade_count(val: int) -> None:
    await _set_json("grade_count", val, GRADE_COUNT_TTL)
