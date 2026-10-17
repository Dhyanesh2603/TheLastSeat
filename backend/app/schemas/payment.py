from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel
from app.models.payment import PaymentStatus

class PaymentResponse(BaseModel):
    id: str
    transaction_reference: str
    user_id: str
    reservation_id: str
    booking_id: Optional[str] = None
    amount: Decimal
    currency: str
    status: PaymentStatus
    simulated_delay_seconds: float
    failure_reason: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}

class PaymentListResponse(BaseModel):
    total: int
    successful_count: int
    failed_count: int
    timeout_count: int
    delayed_success_count: int
    payments: List[PaymentResponse]
