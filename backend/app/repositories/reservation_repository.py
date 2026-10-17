from datetime import datetime, timezone
from typing import Optional, Sequence
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.reservation import Reservation, ReservationStatus

class ReservationRepository:
    async def get_by_id(self, db: AsyncSession, reservation_id: str) -> Optional[Reservation]:
        result = await db.execute(
            select(Reservation)
            .options(selectinload(Reservation.seat))
            .where(Reservation.id == reservation_id)
        )
        return result.scalars().first()

    async def get_by_id_for_update(self, db: AsyncSession, reservation_id: str) -> Optional[Reservation]:
        stmt = (
            select(Reservation)
            .where(Reservation.id == reservation_id)
            .with_for_update()
        )
        result = await db.execute(stmt)
        return result.scalars().first()

    async def get_active_by_seat(self, db: AsyncSession, seat_id: int) -> Optional[Reservation]:
        now = datetime.now(timezone.utc)
        stmt = select(Reservation).where(
            and_(
                Reservation.seat_id == seat_id,
                Reservation.status == ReservationStatus.PENDING,
                Reservation.expires_at > now
            )
        )
        result = await db.execute(stmt)
        return result.scalars().first()

    async def create(
        self,
        db: AsyncSession,
        user_id: str,
        seat_id: int,
        expires_at: datetime
    ) -> Reservation:
        reservation = Reservation(
            user_id=user_id,
            seat_id=seat_id,
            status=ReservationStatus.PENDING,
            expires_at=expires_at
        )
        db.add(reservation)
        await db.flush()
        return reservation

    async def update_status(
        self,
        db: AsyncSession,
        reservation: Reservation,
        status: ReservationStatus
    ) -> Reservation:
        reservation.status = status
        await db.flush()
        return reservation

    async def list_by_user(self, db: AsyncSession, user_id: str) -> Sequence[Reservation]:
        stmt = (
            select(Reservation)
            .options(selectinload(Reservation.seat))
            .where(Reservation.user_id == user_id)
            .order_by(Reservation.created_at.desc())
        )
        result = await db.execute(stmt)
        return result.scalars().all()

    async def get_expired_pending(self, db: AsyncSession, current_time: datetime, limit: int = 100) -> Sequence[Reservation]:
        """Fetch pending reservations whose TTL has lapsed using SELECT FOR UPDATE SKIP LOCKED."""
        stmt = (
            select(Reservation)
            .where(
                and_(
                    Reservation.status == ReservationStatus.PENDING,
                    Reservation.expires_at <= current_time
                )
            )
            .with_for_update(skip_locked=True)
            .limit(limit)
        )
        result = await db.execute(stmt)
        return result.scalars().all()

reservation_repo = ReservationRepository()
