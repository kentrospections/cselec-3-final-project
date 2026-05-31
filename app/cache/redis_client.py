import redis.asyncio as aioredis
from app.config import settings

GPA_TTL = 300  # 5 minutes

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


async def get_cached_gpa(student_id: int) -> float | None:
    r = await get_redis()
    val = await r.get(f"gpa:{student_id}")
    return float(val) if val is not None else None


async def set_cached_gpa(student_id: int, gpa: float) -> None:
    r = await get_redis()
    await r.set(f"gpa:{student_id}", gpa, ex=GPA_TTL)


async def invalidate_gpa(student_id: int) -> None:
    r = await get_redis()
    await r.delete(f"gpa:{student_id}")
