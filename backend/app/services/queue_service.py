import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Optional
import redis.asyncio as aioredis
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status
from app.core.config import settings
from app.models.waiting_queue import WaitingQueue, QueueStatus
from app.repositories.queue_repository import queue_repo
from app.repositories.audit_repository import audit_repo

logger = logging.getLogger("concert_booking.service.queue")

REDIS_QUEUE_KEY = "queue:waiting_list"

class QueueService:
    async def join_queue(
        self,
        db: AsyncSession,
        redis_client: aioredis.Redis,
        user_id: str,
        seat_id: Optional[int] = None
    ) -> WaitingQueue:
        # Check if user is already queued
        existing = await queue_repo.get_active_by_user(db, user_id)
        if existing:
            return existing

        now_epoch = time.time()
        # Add to Redis Sorted Set scored by timestamp (FIFO)
        await redis_client.zadd(REDIS_QUEUE_KEY, {user_id: now_epoch})

        # Add to PostgreSQL database
        queue_item = await queue_repo.add(db, user_id=user_id, seat_id=seat_id)

        await audit_repo.log(
            db,
            action="QUEUE_JOIN",
            entity_type="WaitingQueue",
            entity_id=queue_item.id,
            user_id=user_id,
            metadata_json={"seat_id": seat_id}
        )
        await db.commit()
        return queue_item

    async def get_user_status(
        self,
        db: AsyncSession,
        redis_client: aioredis.Redis,
        user_id: str
    ) -> dict:
        queue_item = await queue_repo.get_active_by_user(db, user_id)
        total_queued = await redis_client.zcard(REDIS_QUEUE_KEY)

        if not queue_item:
            return {
                "is_in_queue": False,
                "position": None,
                "total_in_queue": total_queued,
                "queue_item": None,
                "message": "User is not currently in the waiting queue."
            }

        # Check Redis rank (0-indexed -> +1 for human position)
        rank = await redis_client.zrank(REDIS_QUEUE_KEY, user_id)
        position = (rank + 1) if rank is not None else 1

        # Check if user has an active opportunity window
        opportunity_seat = await redis_client.get(f"queue:user_opportunity:{user_id}")

        return {
            "is_in_queue": True,
            "position": position,
            "total_in_queue": total_queued,
            "queue_item": queue_item,
            "opportunity_seat_id": int(opportunity_seat) if opportunity_seat else None,
            "message": f"You are #{position} in line." if not opportunity_seat else "A seat is available for you to reserve!"
        }

    async def notify_next_in_queue(
        self,
        db: AsyncSession,
        redis_client: aioredis.Redis,
        seat_id: Optional[int] = None
    ) -> Optional[str]:
        """
        Pops the next user in FIFO queue and grants an exclusive opportunity window.
        """
        # Pop lowest score (earliest timestamp)
        popped = await redis_client.zpopmin(REDIS_QUEUE_KEY, count=1)
        if not popped:
            return None

        user_id, _ = popped[0]
        logger.info(f"Popped user {user_id} from waiting queue for seat {seat_id}")

        # Set Redis opportunity key with TTL (e.g. 180s)
        await redis_client.set(
            f"queue:user_opportunity:{user_id}",
            str(seat_id or 0),
            ex=settings.QUEUE_OFFER_DURATION_SECONDS
        )

        # Update DB queue item
        queue_item = await queue_repo.get_active_by_user(db, user_id)
        if queue_item:
            queue_item.status = QueueStatus.NOTIFIED
            queue_item.notified_at = datetime.now(timezone.utc)
            queue_item.offer_expires_at = datetime.now(timezone.utc) + timedelta(seconds=settings.QUEUE_OFFER_DURATION_SECONDS)
            await db.flush()

        await audit_repo.log(
            db,
            action="QUEUE_NOTIFIED",
            entity_type="WaitingQueue",
            entity_id=queue_item.id if queue_item else user_id,
            user_id=user_id,
            metadata_json={"seat_id": seat_id, "window_seconds": settings.QUEUE_OFFER_DURATION_SECONDS}
        )
        return user_id

queue_service = QueueService()
