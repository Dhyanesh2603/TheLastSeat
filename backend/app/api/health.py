import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as aioredis

from app.core.config import settings
from app.core.database import get_db
from app.core.redis_client import get_redis
from app.schemas.admin import SystemHealthResponse
from app.services.seat_service import seat_service
from app.services.booking_service import booking_service
from app.core.dependencies import get_current_admin
from app.models.user import User

router = APIRouter(tags=["Health & Metrics"])

@router.get("/health", response_model=SystemHealthResponse)
async def health_check(
    db: AsyncSession = Depends(get_db),
    redis_client: aioredis.Redis = Depends(get_redis)
):
    db_ok = False
    try:
        res = await db.execute(text("SELECT 1"))
        if res.scalar() == 1:
            db_ok = True
    except Exception:
        db_ok = False

    redis_ok = False
    try:
        pong = await redis_client.ping()
        redis_ok = bool(pong)
    except Exception:
        redis_ok = False

    status_str = "healthy" if (db_ok and redis_ok) else "degraded"

    return SystemHealthResponse(
        status=status_str,
        database=db_ok,
        redis=redis_ok,
        version=settings.VERSION,
        timestamp=datetime.now(timezone.utc)
    )

@router.get("/metrics")
async def get_metrics(
    db: AsyncSession = Depends(get_db),
    redis_client: aioredis.Redis = Depends(get_redis)
):
    """Exposes structured metrics for monitoring tools."""
    # Active Redis keys
    seat_reservations = len(await redis_client.keys("seat:*:reservation"))
    waiting_queue_len = await redis_client.zcard("queue:waiting_list")

    return {
        "app_name": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "metrics": {
            "active_redis_reservations": seat_reservations,
            "waiting_queue_length": waiting_queue_len,
            "max_seat_capacity": settings.TOTAL_SEATS
        }
    }

@router.post("/admin/simulate-concurrency-burst")
async def simulate_concurrency_burst(
    seat_id: int = 1,
    concurrency_level: int = 25,
    admin_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    redis_client: aioredis.Redis = Depends(get_redis)
):
    """
    Stress-tests concurrency protection live:
    Simulates N concurrent users attempting to reserve and book the same seat simultaneously.
    Guarantees that at most 1 user succeeds and all others receive 409 Conflict.
    """
    results = []

    async def attempt_booking(user_idx: int):
        sim_user_id = f"sim-user-{user_idx:03d}"
        try:
            # 1. Attempt Reserve
            res = await seat_service.reserve_seat(
                db=db,
                redis_client=redis_client,
                user_id=sim_user_id,
                seat_id=seat_id
            )
            # 2. Attempt Confirm
            conf = await booking_service.confirm_booking(
                db=db,
                redis_client=redis_client,
                user_id=sim_user_id,
                seat_id=seat_id,
                reservation_id=res["reservation_id"],
                force_outcome="success"
            )
            return {"user": sim_user_id, "status": "WINNER", "ref": conf.get("booking_reference")}
        except Exception as e:
            return {"user": sim_user_id, "status": "REJECTED", "detail": str(getattr(e, "detail", e))}

    tasks = [attempt_booking(i) for i in range(1, concurrency_level + 1)]
    outcomes = await asyncio.gather(*tasks, return_exceptions=False)

    winners = [o for o in outcomes if o.get("status") == "WINNER"]
    rejected = [o for o in outcomes if o.get("status") == "REJECTED"]

    return {
        "seat_id": seat_id,
        "concurrency_level": concurrency_level,
        "winners_count": len(winners),
        "rejected_count": len(rejected),
        "guarantee_preserved": len(winners) <= 1,
        "winners": winners,
        "summary": "PERFECT: Zero double bookings under concurrent race condition." if len(winners) <= 1 else "FAILED: Invariant violated!"
    }
