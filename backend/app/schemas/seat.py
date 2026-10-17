from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, Field
from app.models.seat import SeatStatus, SeatTier

class SeatResponse(BaseModel):
    id: int
    seat_number: str
    row_identifier: str
    column_number: int
    tier: SeatTier
    price: Decimal
    status: SeatStatus
    version: int

    model_config = {"from_attributes": True}

class SeatListResponse(BaseModel):
    total: int
    available_count: int
    reserved_count: int
    booked_count: int
    unavailable_count: int
    seats: List[SeatResponse]

class SeatReserveRequest(BaseModel):
    # Optional idempotency key or client tracking
    pass

class SeatReserveResponse(BaseModel):
    reservation_id: str
    seat_id: int
    seat_number: str
    user_id: str
    status: str
    expires_at: datetime
    remaining_seconds: int
    message: str

class SeatConfirmRequest(BaseModel):
    reservation_id: Optional[str] = None
    force_outcome: Optional[str] = Field(
        None,
        description="For testing/demo: force payment simulator outcome ('success', 'failure', 'timeout')"
    )

class SeatConfirmResponse(BaseModel):
    booking_id: Optional[str] = None
    booking_reference: Optional[str] = None
    seat_id: int
    seat_number: str
    total_amount: Decimal
    payment_id: str
    payment_status: str
    booking_status: str
    message: str

class SeatCancelResponse(BaseModel):
    booking_id: str
    seat_id: int
    status: str
    message: str
