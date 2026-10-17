from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel
from app.models.waiting_queue import QueueStatus

class QueueJoinRequest(BaseModel):
    seat_id: Optional[int] = None

class QueueItemResponse(BaseModel):
    id: str
    user_id: str
    user_name: Optional[str] = None
    seat_id: Optional[int] = None
    seat_number: Optional[str] = None
    status: QueueStatus
    position: Optional[int] = None
    notified_at: Optional[datetime] = None
    offer_expires_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}

class QueueStatusResponse(BaseModel):
    is_in_queue: bool
    position: Optional[int] = None
    total_in_queue: int
    queue_item: Optional[QueueItemResponse] = None
    opportunity_seat_id: Optional[int] = None
    message: str
