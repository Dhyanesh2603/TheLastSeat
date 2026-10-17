from datetime import datetime
from decimal import Decimal
from typing import Optional, List, Dict, Any
from pydantic import BaseModel

class AdminDashboardStats(BaseModel):
    total_seats: int
    available_seats: int
    reserved_seats: int
    booked_seats: int
    unavailable_seats: int
    total_revenue: Decimal
    total_users: int
    total_bookings: int
    total_reservations: int
    active_reservations: int
    queue_size: int
    total_payments: int
    successful_payments: int
    failed_payments: int

class AdminStatsDetailed(BaseModel):
    payment_success_rate_percent: float
    concurrency_double_booking_count: int  # Must always be 0!
    active_redis_reservations: int
    active_waiting_queue_count: int
    payment_outcome_breakdown: Dict[str, int]
    recent_audit_events: List[Dict[str, Any]]

class SystemHealthResponse(BaseModel):
    status: str
    database: bool
    redis: bool
    version: str
    timestamp: datetime
