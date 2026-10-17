from datetime import datetime
from enum import Enum
from decimal import Decimal
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, Numeric, Float, DateTime, ForeignKey, Enum as SQLEnum, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, generate_uuid, utc_now

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.reservation import Reservation
    from app.models.booking import Booking

class PaymentStatus(str, Enum):
    PENDING = "Pending"
    SUCCEEDED = "Succeeded"
    FAILED = "Failed"
    TIMEOUT = "Timeout"
    DELAYED_SUCCESS = "Delayed Success"

class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    transaction_reference: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    reservation_id: Mapped[str] = mapped_column(String(36), ForeignKey("reservations.id", ondelete="CASCADE"), index=True, nullable=False)
    booking_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("bookings.id", ondelete="SET NULL"), index=True, nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    status: Mapped[PaymentStatus] = mapped_column(
        SQLEnum(PaymentStatus, native_enum=False, length=25),
        default=PaymentStatus.PENDING,
        nullable=False,
        index=True
    )
    simulated_delay_seconds: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    failure_reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False
    )

    user: Mapped["User"] = relationship("User", back_populates="payments")
    reservation: Mapped["Reservation"] = relationship("Reservation", back_populates="payments")
    booking: Mapped[Optional["Booking"]] = relationship("Booking", back_populates="payment")

    __table_args__ = (
        Index("ix_payments_user_status", "user_id", "status"),
    )
