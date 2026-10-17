from decimal import Decimal
from typing import List, Dict, Any
from fastapi import APIRouter, Depends
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as aioredis

from app.core.database import get_db
from app.core.redis_client import get_redis
from app.core.dependencies import get_current_admin
from app.models.user import User
from app.models.seat import Seat, SeatStatus
from app.models.reservation import Reservation, ReservationStatus
from app.models.booking import Booking, BookingStatus
from app.models.payment import Payment, PaymentStatus
from app.models.waiting_queue import WaitingQueue, QueueStatus
from app.schemas.admin import AdminDashboardStats, AdminStatsDetailed
from app.schemas.payment import PaymentResponse
from app.schemas.waiting_queue import QueueItemResponse
from app.repositories.payment_repository import payment_repo
from app.repositories.queue_repository import queue_repo
from app.repositories.audit_repository import audit_repo

router = APIRouter(prefix="/admin", tags=["Admin"])

@router.get("/dashboard", response_model=AdminDashboardStats)
async def get_admin_dashboard(
    admin_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    redis_client: aioredis.Redis = Depends(get_redis)
):
    # Seats count
    seat_stmt = select(Seat.status, func.count(Seat.id)).group_by(Seat.status)
    seat_counts = dict((await db.execute(seat_stmt)).all())

    # Total revenue
    rev_stmt = select(func.coalesce(func.sum(Booking.total_amount), 0)).where(Booking.status == BookingStatus.CONFIRMED)
    total_rev = (await db.execute(rev_stmt)).scalar()

    # Users count
    user_stmt = select(func.count(User.id))
    total_users = (await db.execute(user_stmt)).scalar() or 0

    # Bookings count
    booking_stmt = select(func.count(Booking.id)).where(Booking.status == BookingStatus.CONFIRMED)
    total_bookings = (await db.execute(booking_stmt)).scalar() or 0

    # Reservations
    res_stmt = select(func.count(Reservation.id))
    total_res = (await db.execute(res_stmt)).scalar() or 0

    act_res_stmt = select(func.count(Reservation.id)).where(Reservation.status == ReservationStatus.PENDING)
    active_res = (await db.execute(act_res_stmt)).scalar() or 0

    # Queue size
    queue_size = await queue_repo.count_queued(db)

    # Payments
    payment_counts = await payment_repo.get_counts_by_status(db)
    succ_p = payment_counts.get(PaymentStatus.SUCCEEDED.value, 0)
    failed_p = payment_counts.get(PaymentStatus.FAILED.value, 0) + payment_counts.get(PaymentStatus.TIMEOUT.value, 0)
    total_p = sum(payment_counts.values())

    return AdminDashboardStats(
        total_seats=sum(seat_counts.values()) or 500,
        available_seats=seat_counts.get(SeatStatus.AVAILABLE, 0),
        reserved_seats=seat_counts.get(SeatStatus.RESERVED, 0),
        booked_seats=seat_counts.get(SeatStatus.BOOKED, 0),
        unavailable_seats=seat_counts.get(SeatStatus.UNAVAILABLE, 0),
        total_revenue=Decimal(str(total_rev)),
        total_users=total_users,
        total_bookings=total_bookings,
        total_reservations=total_res,
        active_reservations=active_res,
        queue_size=queue_size,
        total_payments=total_p,
        successful_payments=succ_p,
        failed_payments=failed_p
    )

@router.get("/stats", response_model=AdminStatsDetailed)
async def get_admin_detailed_stats(
    admin_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    redis_client: aioredis.Redis = Depends(get_redis)
):
    payment_counts = await payment_repo.get_counts_by_status(db)
    total_p = sum(payment_counts.values())
    succ_p = payment_counts.get(PaymentStatus.SUCCEEDED.value, 0)
    success_rate = round((succ_p / total_p * 100), 2) if total_p > 0 else 100.0

    # Verify concurrency invariant: Zero duplicate confirmed bookings for any seat!
    dup_stmt = select(Booking.seat_id, func.count(Booking.id)).where(
        Booking.status == BookingStatus.CONFIRMED
    ).group_by(Booking.seat_id).having(func.count(Booking.id) > 1)
    duplicates = (await db.execute(dup_stmt)).all()
    concurrency_violations = len(duplicates)

    # Redis active reservation keys
    redis_res_keys = await redis_client.keys("seat:*:reservation")
    queue_len = await redis_client.zcard("queue:waiting_list")

    # Recent audit events
    recent_audits = await audit_repo.get_recent(db, limit=20)
    audit_list = [
        {
            "id": a.id,
            "action": a.action,
            "entity_type": a.entity_type,
            "entity_id": a.entity_id,
            "user_id": a.user_id,
            "metadata": a.metadata_json,
            "created_at": a.created_at.isoformat()
        }
        for a in recent_audits
    ]

    return AdminStatsDetailed(
        payment_success_rate_percent=success_rate,
        concurrency_double_booking_count=concurrency_violations,
        active_redis_reservations=len(redis_res_keys),
        active_waiting_queue_count=queue_len,
        payment_outcome_breakdown=payment_counts,
        recent_audit_events=audit_list
    )

@router.get("/payments", response_model=List[PaymentResponse])
async def get_admin_payments(
    admin_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    payments = await payment_repo.list_all(db, limit=100)
    return [PaymentResponse.model_validate(p) for p in payments]

@router.get("/queue", response_model=List[QueueItemResponse])
async def get_admin_queue(
    admin_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    queue_items = await queue_repo.list_active(db, limit=100)
    res = []
    for idx, item in enumerate(queue_items, start=1):
        d = {
            "id": item.id,
            "user_id": item.user_id,
            "user_name": item.user.full_name if item.user else "Unknown",
            "seat_id": item.seat_id,
            "seat_number": item.seat.seat_number if item.seat else None,
            "status": item.status,
            "position": idx,
            "notified_at": item.notified_at,
            "offer_expires_at": item.offer_expires_at,
            "created_at": item.created_at
        }
        res.append(QueueItemResponse.model_validate(d))
    return res

@router.post("/reset-all")
async def reset_all_data(
    admin_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    redis_client: aioredis.Redis = Depends(get_redis)
):
    from app.services.rush_simulator import rush_simulator
    return await rush_simulator.reset_all_seats(db, redis_client)
