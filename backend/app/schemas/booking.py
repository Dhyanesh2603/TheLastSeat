from datetime import datetime
from decimal import Decimal
from typing import Optional, List, Any
from pydantic import BaseModel
from app.models.booking import BookingStatus
from app.schemas.seat import SeatResponse

class BookingResponse(BaseModel):
    id: str
    booking_reference: str
    user_id: str
    seat_id: int
    seat: Optional[SeatResponse] = None
    reservation_id: Optional[str] = None
    status: BookingStatus
    total_amount: Decimal
    cancelled_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

class BookingHistoryItem(BaseModel):
    id: str
    type: str  # 'booking', 'reservation', 'payment'
    title: str
    seat_id: int
    seat_number: str
    status: str
    amount: Optional[Decimal] = None
    timestamp: datetime
    details: Optional[dict[str, Any]] = None

class BookingHistoryResponse(BaseModel):
    total_bookings: int
    active_bookings: int
    cancelled_bookings: int
    history: List[BookingHistoryItem]
