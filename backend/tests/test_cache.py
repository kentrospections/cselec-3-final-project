"""
Redis cache tests.

Verifies GPA caching behavior:
  - Cache miss returns None
  - After set, cache hit returns the stored value
  - Invalidation deletes the key
  - The students resolver stores GPA in Redis on a cache miss and returns it
    from Redis on subsequent calls
"""

import pytest
from sqlalchemy import text

from app.cache.redis_client import (
    GPA_TTL,
    get_cached_gpa,
    invalidate_gpa,
    set_cached_gpa,
)


# ─── Unit tests for cache helpers ────────────────────────────────────────────

async def test_cache_miss_returns_none(test_redis):
    result = await get_cached_gpa(999)
    assert result is None


async def test_set_then_get_returns_value(test_redis):
    await set_cached_gpa(1, 87.5)
    result = await get_cached_gpa(1)
    assert result == pytest.approx(87.5)


async def test_set_stores_with_ttl(test_redis):
    await set_cached_gpa(2, 75.0)
    ttl = await test_redis.ttl("gpa:2")
    assert 0 < ttl <= GPA_TTL


async def test_invalidate_deletes_key(test_redis):
    await set_cached_gpa(3, 91.0)
    assert await get_cached_gpa(3) is not None

    await invalidate_gpa(3)
    assert await get_cached_gpa(3) is None


async def test_invalidate_nonexistent_key_is_safe(test_redis):
    """Deleting a key that doesn't exist must not raise."""
    await invalidate_gpa(99999)  # should not raise


async def test_multiple_students_independent_keys(test_redis):
    await set_cached_gpa(10, 80.0)
    await set_cached_gpa(11, 70.0)

    assert await get_cached_gpa(10) == pytest.approx(80.0)
    assert await get_cached_gpa(11) == pytest.approx(70.0)

    await invalidate_gpa(10)
    assert await get_cached_gpa(10) is None
    assert await get_cached_gpa(11) == pytest.approx(70.0)  # unaffected


# ─── Integration: resolver populates and reads cache ─────────────────────────

async def test_resolver_populates_cache_on_miss(client, seeded_db, test_redis):
    alice_id = seeded_db["Alice"]

    # Ensure key is absent before the query
    await test_redis.delete(f"gpa:{alice_id}")

    await client.post(
        "/graphql",
        json={"query": "{ students { studentId gpa } }"},
    )

    cached = await test_redis.get(f"gpa:{alice_id}")
    assert cached is not None, "Resolver did not populate Redis after a cache miss"
    assert abs(float(cached) - 89.0) < 0.01


async def test_resolver_reads_from_cache_on_hit(client, seeded_db, test_redis):
    alice_id = seeded_db["Alice"]

    # Inject a fake GPA into Redis
    await test_redis.set(f"gpa:{alice_id}", "42.0", ex=GPA_TTL)

    data = (
        await client.post(
            "/graphql",
            json={
                "query": f"query {{ student(id: {alice_id}) {{ gpa }} }}"
            },
        )
    ).json()

    # The overall GPA on StudentDetail is computed from DB (student resolver),
    # but StudentSummary GPA in the list resolver comes through cache.
    list_data = (
        await client.post("/graphql", json={"query": "{ students { studentId gpa } }"})
    ).json()

    alice_summary = next(
        s for s in list_data["data"]["students"] if s["studentId"] == alice_id
    )
    # The cached value (42.0) should be served, not the DB value (89.0)
    assert abs(alice_summary["gpa"] - 42.0) < 0.01
