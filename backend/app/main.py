import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.cache.redis_client import close_redis
from app.config import settings
from app.graphql.resolvers.grades import resolve_grade_count, resolve_overall_average_gpa
from app.graphql.resolvers.semesters import resolve_semester_comparison
from app.graphql.schema import graphql_app
from app.kafka.consumer import cache_invalidator_consumer, subscription_pusher_consumer
from app.kafka.producer import close_producer
from app.kafka.simulator import grade_simulator_task
from app.ml.classifier import load_model

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def _warm_cache() -> None:
    """Pre-populate expensive cache entries at startup so the first user never hits a cold DB."""
    try:
        await resolve_semester_comparison(None)
        await resolve_overall_average_gpa()
        await resolve_grade_count()
        logger.info("Cache pre-warm complete.")
    except Exception as exc:
        logger.warning("Cache pre-warm failed (non-fatal): %s", exc)


def _on_task_done(t: asyncio.Task) -> None:
    if not t.cancelled():
        exc = t.exception()
        if exc:
            logger.error("Background task %s exited unexpectedly: %s", t.get_name(), exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_model()
    asyncio.create_task(_warm_cache(), name="cache-warm")
    task1 = asyncio.create_task(cache_invalidator_consumer(), name="cache-invalidator")
    task2 = asyncio.create_task(subscription_pusher_consumer(), name="subscription-pusher")
    task1.add_done_callback(_on_task_done)
    task2.add_done_callback(_on_task_done)
    tasks = [task1, task2]
    logger.info("Kafka consumers started")
    if settings.kafka_simulate_interval > 0:
        task3 = asyncio.create_task(
            grade_simulator_task(settings.kafka_simulate_interval), name="grade-simulator"
        )
        task3.add_done_callback(_on_task_done)
        tasks.append(task3)
    try:
        yield
    finally:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await close_producer()
        await close_redis()
        logger.info("Shutdown complete")


app = FastAPI(title="Student Performance Analytics API", lifespan=lifespan)
app.include_router(graphql_app, prefix="/graphql")
