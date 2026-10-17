from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel
from app.models.reservation import ReservationStatus
from app.schemas.seat import SeatResponse

class ReservationResponse(BaseModel):
    id: str
    user_id: str
    seat_id: int
    seat: Optional[SeatResponse] = None
    status: ReservationStatus
    expires_at: datetime
    created_at: datetime
    is_expired: bool = False
    remaining_seconds: int = 0

    model_config = {"from_attributes": True}

class ReservationListResponse(BaseModel):
    total: int
    reservations: List[ReservationResponse]
