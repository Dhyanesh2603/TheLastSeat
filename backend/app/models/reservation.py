from datetime import datetime
from enum import Enum
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, Integer, DateTime, ForeignKey, Enum as SQLEnum, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, generate_uuid, utc_now

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.seat import Seat
    from app.models.booking import Booking
    from app.models.payment import Payment

class ReservationStatus(str, Enum):
    PENDING = "Pending"
    CONFIRMED = "Confirmed"
    EXPIRED = "Expired"
    CANCELLED = "Cancelled"
    PAYMENT_FAILED = "Payment Failed"

class Reservation(Base):
    __tablename__ = "reservations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    seat_id: Mapped[int] = mapped_column(Integer, ForeignKey("seats.id", ondelete="CASCADE"), index=True, nullable=False)
    status: Mapped[ReservationStatus] = mapped_column(
        SQLEnum(ReservationStatus, native_enum=False, length=25),
        default=ReservationStatus.PENDING,
        nullable=False,
        index=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False
    )

    user: Mapped["User"] = relationship("User", back_populates="reservations")
    seat: Mapped["Seat"] = relationship("Seat", back_populates="reservations")
    booking: Mapped[Optional["Booking"]] = relationship("Booking", back_populates="reservation", uselist=False)
    payments: Mapped[list["Payment"]] = relationship("Payment", back_populates="reservation")

    __table_args__ = (
        Index("ix_reservations_status_expires_at", "status", "expires_at"),
    )
