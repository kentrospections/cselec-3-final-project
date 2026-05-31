import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.cache.redis_client import close_redis
from app.graphql.schema import graphql_app
from app.kafka.consumer import cache_invalidator_consumer, subscription_pusher_consumer
from app.ml.classifier import load_model

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_model()
    task1 = asyncio.create_task(cache_invalidator_consumer())
    task2 = asyncio.create_task(subscription_pusher_consumer())
    logger.info("Kafka consumers started")
    try:
        yield
    finally:
        task1.cancel()
        task2.cancel()
        await asyncio.gather(task1, task2, return_exceptions=True)
        await close_redis()
        logger.info("Shutdown complete")


app = FastAPI(title="Student Performance Analytics API", lifespan=lifespan)
app.include_router(graphql_app, prefix="/graphql")
