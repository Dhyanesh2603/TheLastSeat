from datetime import datetime, timezone
from typing import Optional, Sequence
from sqlalchemy import select, and_, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.waiting_queue import WaitingQueue, QueueStatus

class WaitingQueueRepository:
    async def get_active_by_user(self, db: AsyncSession, user_id: str) -> Optional[WaitingQueue]:
        stmt = (
            select(WaitingQueue)
            .options(selectinload(WaitingQueue.seat))
            .where(
                and_(
                    WaitingQueue.user_id == user_id,
                    WaitingQueue.status.in_([QueueStatus.QUEUED, QueueStatus.NOTIFIED])
                )
            )
        )
        result = await db.execute(stmt)
        return result.scalars().first()

    async def add(self, db: AsyncSession, user_id: str, seat_id: Optional[int] = None) -> WaitingQueue:
        queue_item = WaitingQueue(
            user_id=user_id,
            seat_id=seat_id,
            status=QueueStatus.QUEUED
        )
        db.add(queue_item)
        await db.flush()
        return queue_item

    async def get_user_position(self, db: AsyncSession, queue_item: WaitingQueue) -> int:
        stmt = select(func.count(WaitingQueue.id)).where(
            and_(
                WaitingQueue.status == QueueStatus.QUEUED,
                WaitingQueue.created_at <= queue_item.created_at
            )
        )
        result = await db.execute(stmt)
        pos = result.scalar()
        return pos or 1

    async def count_queued(self, db: AsyncSession) -> int:
        stmt = select(func.count(WaitingQueue.id)).where(
            WaitingQueue.status.in_([QueueStatus.QUEUED, QueueStatus.NOTIFIED])
        )
        result = await db.execute(stmt)
        return result.scalar() or 0

    async def pop_next_queued(self, db: AsyncSession, seat_id: Optional[int] = None) -> Optional[WaitingQueue]:
        stmt = (
            select(WaitingQueue)
            .where(WaitingQueue.status == QueueStatus.QUEUED)
            .order_by(WaitingQueue.created_at.asc())
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        result = await db.execute(stmt)
        return result.scalars().first()

    async def list_active(self, db: AsyncSession, limit: int = 50) -> Sequence[WaitingQueue]:
        stmt = (
            select(WaitingQueue)
            .options(selectinload(WaitingQueue.user), selectinload(WaitingQueue.seat))
            .where(WaitingQueue.status.in_([QueueStatus.QUEUED, QueueStatus.NOTIFIED]))
            .order_by(WaitingQueue.created_at.asc())
            .limit(limit)
        )
        result = await db.execute(stmt)
        return result.scalars().all()

queue_repo = WaitingQueueRepository()
