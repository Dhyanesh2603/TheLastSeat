import secrets
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional, Sequence
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.booking import Booking, BookingStatus

class BookingRepository:
    def generate_booking_reference(self) -> str:
        # Format: BK-XXXX-YYYY (uppercase alphanumeric)
        part1 = secrets.token_hex(2).upper()
        part2 = secrets.token_hex(2).upper()
        return f"BK-{part1}-{part2}"

    async def get_by_id(self, db: AsyncSession, booking_id: str) -> Optional[Booking]:
        stmt = (
            select(Booking)
            .options(selectinload(Booking.seat), selectinload(Booking.user))
            .where(Booking.id == booking_id)
        )
        result = await db.execute(stmt)
        return result.scalars().first()

    async def get_by_reference(self, db: AsyncSession, reference: str) -> Optional[Booking]:
        stmt = (
            select(Booking)
            .options(selectinload(Booking.seat), selectinload(Booking.user))
            .where(Booking.booking_reference == reference)
        )
        result = await db.execute(stmt)
        return result.scalars().first()

    async def get_confirmed_by_seat(self, db: AsyncSession, seat_id: int) -> Optional[Booking]:
        stmt = select(Booking).where(
            and_(
                Booking.seat_id == seat_id,
                Booking.status == BookingStatus.CONFIRMED
            )
        )
        result = await db.execute(stmt)
        return result.scalars().first()

    async def create(
        self,
        db: AsyncSession,
        user_id: str,
        seat_id: int,
        total_amount: Decimal,
        reservation_id: Optional[str] = None
    ) -> Booking:
        ref = self.generate_booking_reference()
        booking = Booking(
            booking_reference=ref,
            user_id=user_id,
            seat_id=seat_id,
            reservation_id=reservation_id,
            status=BookingStatus.CONFIRMED,
            total_amount=total_amount
        )
        db.add(booking)
        await db.flush()
        return booking

    async def cancel(self, db: AsyncSession, booking: Booking) -> Booking:
        booking.status = BookingStatus.CANCELLED
        booking.cancelled_at = datetime.now(timezone.utc)
        await db.flush()
        return booking

    async def list_by_user(self, db: AsyncSession, user_id: str) -> Sequence[Booking]:
        stmt = (
            select(Booking)
            .options(selectinload(Booking.seat))
            .where(Booking.user_id == user_id)
            .order_by(Booking.created_at.desc())
        )
        result = await db.execute(stmt)
        return result.scalars().all()

    async def list_all(self, db: AsyncSession, limit: int = 100, offset: int = 0) -> Sequence[Booking]:
        stmt = (
            select(Booking)
            .options(selectinload(Booking.seat), selectinload(Booking.user))
            .order_by(Booking.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await db.execute(stmt)
        return result.scalars().all()

booking_repo = BookingRepository()
