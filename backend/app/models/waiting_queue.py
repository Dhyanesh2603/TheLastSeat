from datetime import datetime
from enum import Enum
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, Integer, DateTime, ForeignKey, Enum as SQLEnum, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, generate_uuid, utc_now

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.seat import Seat

class QueueStatus(str, Enum):
    QUEUED = "Queued"
    NOTIFIED = "Notified"
    EXPIRED = "Expired"
    FULFILLED = "Fulfilled"

class WaitingQueue(Base):
    __tablename__ = "waiting_queue"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    seat_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("seats.id", ondelete="SET NULL"), index=True, nullable=True)
    status: Mapped[QueueStatus] = mapped_column(
        SQLEnum(QueueStatus, native_enum=False, length=20),
        default=QueueStatus.QUEUED,
        nullable=False,
        index=True
    )
    notified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    offer_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False
    )

    user: Mapped["User"] = relationship("User")
    seat: Mapped[Optional["Seat"]] = relationship("Seat")

    __table_args__ = (
        Index("ix_waiting_queue_status_created_at", "status", "created_at"),
    )
