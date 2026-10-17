from datetime import datetime
from enum import Enum
from decimal import Decimal
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, Integer, Numeric, DateTime, ForeignKey, Enum as SQLEnum, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, generate_uuid, utc_now

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.seat import Seat
    from app.models.reservation import Reservation
    from app.models.payment import Payment

class BookingStatus(str, Enum):
    CONFIRMED = "Confirmed"
    CANCELLED = "Cancelled"

class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    booking_reference: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    seat_id: Mapped[int] = mapped_column(Integer, ForeignKey("seats.id", ondelete="CASCADE"), index=True, nullable=False)
    reservation_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("reservations.id", ondelete="SET NULL"),
        unique=True,
        nullable=True
    )
    status: Mapped[BookingStatus] = mapped_column(
        SQLEnum(BookingStatus, native_enum=False, length=20),
        default=BookingStatus.CONFIRMED,
        nullable=False,
        index=True
    )
    total_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False
    )

    user: Mapped["User"] = relationship("User", back_populates="bookings")
    seat: Mapped["Seat"] = relationship("Seat", back_populates="bookings")
    reservation: Mapped[Optional["Reservation"]] = relationship("Reservation", back_populates="booking")
    payment: Mapped[Optional["Payment"]] = relationship("Payment", back_populates="booking", uselist=False)

    __table_args__ = (
        Index("ix_bookings_user_status", "user_id", "status"),
    )
