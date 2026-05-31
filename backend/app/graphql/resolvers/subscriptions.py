import asyncio
from typing import AsyncGenerator

from app.graphql.types import GradeEvent
from app.kafka.consumer import add_subscription_queue, remove_subscription_queue


async def grade_updates_resolver() -> AsyncGenerator[GradeEvent, None]:
    q: asyncio.Queue = asyncio.Queue()
    add_subscription_queue(q)
    try:
        while True:
            event = await q.get()
            yield GradeEvent(
                student_id=int(event["student_id"]),
                subject_code=str(event["subject_code"]),
                semester_id=int(event["semester_id"]),
                grade=float(event["grade"]),
                timestamp=str(event.get("timestamp", "")),
            )
    except asyncio.CancelledError:
        pass
    finally:
        remove_subscription_queue(q)
