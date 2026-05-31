"""
Kafka integration tests.

Verifies:
  1. cache_invalidator_consumer — when a grade-update event arrives, the
     corresponding gpa:{student_id} Redis key is deleted.
  2. subscription_pusher_consumer — when a grade-update event arrives, it is
     broadcast to all registered asyncio.Queue instances.

Both tests spin up real aiokafka producers against the testcontainers Kafka
instance and run the consumer functions as background asyncio tasks.
"""

import asyncio
import json

import pytest
import pytest_asyncio
from aiokafka import AIOKafkaProducer

from app.cache.redis_client import get_cached_gpa, set_cached_gpa
from app.kafka.consumer import (
    _subscription_queues,
    add_subscription_queue,
    cache_invalidator_consumer,
    remove_subscription_queue,
    subscription_pusher_consumer,
)

TOPIC = "grade-updates"
TIMEOUT = 15  # seconds to wait for consumer to process a message


@pytest.fixture
def kafka_bootstrap(kafka, monkeypatch):
    """Patch app settings so consumers connect to the test Kafka container."""
    from app.config import settings
    bootstrap = kafka.get_bootstrap_server()
    object.__setattr__(settings, "kafka_bootstrap_servers", bootstrap)
    object.__setattr__(settings, "kafka_topic", TOPIC)
    yield bootstrap
    # Restore originals
    object.__setattr__(settings, "kafka_bootstrap_servers", "kafka:9092")
    object.__setattr__(settings, "kafka_topic", "grade-updates")


async def _produce(bootstrap: str, event: dict) -> None:
    producer = AIOKafkaProducer(
        bootstrap_servers=bootstrap,
        value_serializer=lambda v: json.dumps(v).encode(),
    )
    await producer.start()
    try:
        await producer.send_and_wait(TOPIC, value=event)
    finally:
        await producer.stop()


# ─── Test 1: cache invalidator ────────────────────────────────────────────────

async def test_cache_invalidator_deletes_gpa_key(kafka_bootstrap, test_redis):
    student_id = 55

    # Pre-populate the cache
    await set_cached_gpa(student_id, 85.0)
    assert await get_cached_gpa(student_id) is not None

    # Start the consumer in the background
    task = asyncio.create_task(cache_invalidator_consumer())

    # Give the consumer time to connect and subscribe
    await asyncio.sleep(5)

    # Produce a grade-update event for student 55
    event = {
        "student_id": student_id,
        "subject_code": "CS101",
        "semester_id": 1,
        "grade": 78.0,
        "timestamp": "2024-01-01T00:00:00",
    }
    await _produce(kafka_bootstrap, event)

    # Wait for the consumer to process the message and delete the key
    try:
        async def _wait_for_invalidation():
            while True:
                if await get_cached_gpa(student_id) is None:
                    return
                await asyncio.sleep(0.5)

        await asyncio.wait_for(_wait_for_invalidation(), timeout=TIMEOUT)
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)

    assert await get_cached_gpa(student_id) is None


# ─── Test 2: subscription pusher ─────────────────────────────────────────────

async def test_subscription_pusher_delivers_to_queue(kafka_bootstrap, test_redis):
    q: asyncio.Queue = asyncio.Queue()
    add_subscription_queue(q)

    task = asyncio.create_task(subscription_pusher_consumer())
    await asyncio.sleep(5)  # wait for consumer to subscribe

    event = {
        "student_id": 77,
        "subject_code": "CS102",
        "semester_id": 2,
        "grade": 91.5,
        "timestamp": "2024-06-01T00:00:00",
    }
    await _produce(kafka_bootstrap, event)

    try:
        received = await asyncio.wait_for(q.get(), timeout=TIMEOUT)
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
        remove_subscription_queue(q)

    assert received["student_id"] == 77
    assert received["subject_code"] == "CS102"
    assert received["grade"] == pytest.approx(91.5)


async def test_subscription_pusher_broadcasts_to_multiple_queues(kafka_bootstrap, test_redis):
    queues = [asyncio.Queue(), asyncio.Queue(), asyncio.Queue()]
    for q in queues:
        add_subscription_queue(q)

    task = asyncio.create_task(subscription_pusher_consumer())
    await asyncio.sleep(5)

    event = {
        "student_id": 88,
        "subject_code": "ENG101",
        "semester_id": 1,
        "grade": 83.0,
        "timestamp": "2024-03-01T00:00:00",
    }
    await _produce(kafka_bootstrap, event)

    try:
        results = await asyncio.gather(
            *[asyncio.wait_for(q.get(), timeout=TIMEOUT) for q in queues]
        )
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
        for q in queues:
            remove_subscription_queue(q)

    assert all(r["student_id"] == 88 for r in results)


# ─── Test 3: subscription resolver generator ─────────────────────────────────

async def test_grade_updates_subscription_generator():
    """
    Unit test: the grade_updates_resolver async generator yields GradeEvent
    objects by reading from its own internal queue, without needing Kafka.

    grade_updates_resolver() creates its own asyncio.Queue internally and
    registers it in _subscription_queues.  We must start the generator first
    (so it registers the queue), then inject an event into that registered queue.
    """
    from app.graphql.resolvers.subscriptions import grade_updates_resolver
    from app.graphql.types import GradeEvent

    received: list = []

    async def _consume(gen):
        async for event in gen:
            received.append(event)
            return  # stop after one event

    gen = grade_updates_resolver()
    task = asyncio.create_task(_consume(gen))

    # Let the generator start and register its internal queue
    await asyncio.sleep(0.2)

    test_event = {
        "student_id": 1,
        "subject_code": "CS101",
        "semester_id": 1,
        "grade": 90.0,
        "timestamp": "2024-01-01",
    }
    # Broadcast to all registered queues (the generator's queue is now in the list)
    for q in list(_subscription_queues):
        await q.put(test_event)

    try:
        await asyncio.wait_for(task, timeout=5)
    finally:
        await gen.aclose()

    assert len(received) == 1
    assert isinstance(received[0], GradeEvent)
    assert received[0].student_id == 1
    assert received[0].grade == pytest.approx(90.0)
