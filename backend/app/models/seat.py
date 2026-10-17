from datetime import datetime
from enum import Enum
from decimal import Decimal
from typing import List, TYPE_CHECKING
from sqlalchemy import String, Integer, Numeric, DateTime, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, utc_now

if TYPE_CHECKING:
    from app.models.reservation import Reservation
    from app.models.booking import Booking

class SeatStatus(str, Enum):
    AVAILABLE = "Available"
    RESERVED = "Reserved"
    BOOKED = "Booked"
    UNAVAILABLE = "Unavailable"

class SeatTier(str, Enum):
    VIP = "VIP"
    STANDARD = "Standard"
    BALCONY = "Balcony"

class Seat(Base):
    __tablename__ = "seats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    seat_number: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    row_identifier: Mapped[str] = mapped_column(String(5), nullable=False)
    column_number: Mapped[int] = mapped_column(Integer, nullable=False)
    tier: Mapped[SeatTier] = mapped_column(
        SQLEnum(SeatTier, native_enum=False, length=20),
        default=SeatTier.STANDARD,
        nullable=False,
        index=True
    )
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    status: Mapped[SeatStatus] = mapped_column(
        SQLEnum(SeatStatus, native_enum=False, length=20),
        default=SeatStatus.AVAILABLE,
        nullable=False,
        index=True
    )
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False
    )

    reservations: Mapped[List["Reservation"]] = relationship("Reservation", back_populates="seat")
    bookings: Mapped[List["Booking"]] = relationship("Booking", back_populates="seat")
