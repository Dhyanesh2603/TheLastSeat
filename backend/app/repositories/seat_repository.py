import logging
from decimal import Decimal
from typing import Optional, Sequence
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.seat import Seat, SeatStatus, SeatTier

logger = logging.getLogger("concert_booking.repository.seat")

class SeatRepository:
    async def get_by_id(self, db: AsyncSession, seat_id: int) -> Optional[Seat]:
        result = await db.execute(select(Seat).where(Seat.id == seat_id))
        return result.scalars().first()

    async def get_by_id_for_update(self, db: AsyncSession, seat_id: int) -> Optional[Seat]:
        """
        Executes SELECT ... FOR UPDATE.
        Acquires an exclusive row-level lock in PostgreSQL during the current transaction.
        Other concurrent transactions attempting to read/update this seat row with FOR UPDATE
        will wait until this transaction completes.
        """
        stmt = select(Seat).where(Seat.id == seat_id).with_for_update()
        result = await db.execute(stmt)
        return result.scalars().first()

    async def list_all(self, db: AsyncSession) -> Sequence[Seat]:
        result = await db.execute(select(Seat).order_by(Seat.id.asc()))
        return result.scalars().all()

    async def update_status(self, db: AsyncSession, seat: Seat, new_status: SeatStatus) -> Seat:
        seat.status = new_status
        seat.version += 1
        await db.flush()
        return seat

    async def seed_seats_if_empty(self, db: AsyncSession, total_seats: int = 500) -> int:
        result = await db.execute(select(Seat.id).limit(1))
        if result.scalars().first() is not None:
            return 0  # Already seeded
        
        logger.info(f"Seeding {total_seats} seats into database...")
        # 20 rows (A to T), 25 seats per row = 500 seats
        rows = [chr(ord('A') + i) for i in range(20)]
        seats = []
        seat_index = 1

        for row in rows:
            for col in range(1, 26):
                if seat_index > total_seats:
                    break
                # Tier allocation:
                # Rows A-D (100 seats) -> VIP ($150.00)
                # Rows E-N (250 seats) -> Standard ($75.00)
                # Rows O-T (150 seats) -> Balcony ($45.00)
                if row in ['A', 'B', 'C', 'D']:
                    tier = SeatTier.VIP
                    price = Decimal("150.00")
                elif row in ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N']:
                    tier = SeatTier.STANDARD
                    price = Decimal("75.00")
                else:
                    tier = SeatTier.BALCONY
                    price = Decimal("45.00")

                seat_num = f"{row}-{col:02d}"
                seat = Seat(
                    id=seat_index,
                    seat_number=seat_num,
                    row_identifier=row,
                    column_number=col,
                    tier=tier,
                    price=price,
                    status=SeatStatus.AVAILABLE,
                    version=1
                )
                seats.append(seat)
                seat_index += 1

        db.add_all(seats)
        await db.commit()
        logger.info(f"Successfully seeded {len(seats)} seats.")
        return len(seats)

seat_repo = SeatRepository()
