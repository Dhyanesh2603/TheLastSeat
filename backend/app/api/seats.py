from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as aioredis

from app.core.database import get_db
from app.core.redis_client import get_redis
from app.core.dependencies import get_current_user
from app.models.user import User, UserRole
from app.models.seat import SeatStatus
from app.schemas.seat import (
    SeatResponse,
    SeatListResponse,
    SeatReserveResponse,
    SeatConfirmRequest,
    SeatConfirmResponse,
    SeatCancelResponse
)
from app.services.seat_service import seat_service
from app.services.booking_service import booking_service

router = APIRouter(prefix="/seats", tags=["Seats"])

@router.get("", response_model=SeatListResponse)
async def list_seats(
    db: AsyncSession = Depends(get_db),
    redis_client: aioredis.Redis = Depends(get_redis)
):
    seats = await seat_service.get_all_seats(db, redis_client)
    available_c = sum(1 for s in seats if s.status == SeatStatus.AVAILABLE)
    reserved_c = sum(1 for s in seats if s.status == SeatStatus.RESERVED)
    booked_c = sum(1 for s in seats if s.status == SeatStatus.BOOKED)
    unavail_c = sum(1 for s in seats if s.status == SeatStatus.UNAVAILABLE)

    return SeatListResponse(
        total=len(seats),
        available_count=available_c,
        reserved_count=reserved_c,
        booked_count=booked_c,
        unavailable_count=unavail_c,
        seats=[SeatResponse.model_validate(s) for s in seats]
    )

@router.get("/{seat_id}", response_model=SeatResponse)
async def get_seat(
    seat_id: int,
    db: AsyncSession = Depends(get_db)
):
    seat = await seat_service.get_seat_by_id(db, seat_id)
    return seat

@router.post("/{seat_id}/reserve", response_model=SeatReserveResponse)
async def reserve_seat(
    seat_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis_client: aioredis.Redis = Depends(get_redis)
):
    ip_addr = request.client.host if request.client else None
    result = await seat_service.reserve_seat(
        db=db,
        redis_client=redis_client,
        user_id=current_user.id,
        seat_id=seat_id,
        ip_address=ip_addr
    )
    return result

@router.post("/{seat_id}/confirm", response_model=SeatConfirmResponse)
async def confirm_booking(
    seat_id: int,
    payload: SeatConfirmRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis_client: aioredis.Redis = Depends(get_redis)
):
    ip_addr = request.client.host if request.client else None
    result = await booking_service.confirm_booking(
        db=db,
        redis_client=redis_client,
        user_id=current_user.id,
        seat_id=seat_id,
        reservation_id=payload.reservation_id,
        force_outcome=payload.force_outcome,
        ip_address=ip_addr
    )
    return result

@router.delete("/{seat_id}/cancel", response_model=SeatCancelResponse)
async def cancel_booking(
    seat_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis_client: aioredis.Redis = Depends(get_redis)
):
    ip_addr = request.client.host if request.client else None
    is_admin = current_user.role == UserRole.ADMIN
    result = await booking_service.cancel_booking(
        db=db,
        redis_client=redis_client,
        user_id=current_user.id,
        seat_id=seat_id,
        is_admin=is_admin,
        ip_address=ip_addr
    )
    return result

@router.post("/simulate-rush")
async def simulate_rush_wave(
    batch_size: int = 5,
    db: AsyncSession = Depends(get_db),
    redis_client: aioredis.Redis = Depends(get_redis)
):
    """
    Simulates a wave of concurrent student bookings filling up the concert hall in real time.
    """
    from app.services.rush_simulator import rush_simulator
    capped_batch = max(1, min(batch_size, 30))
    actions = await rush_simulator.simulate_rush_batch(db, redis_client, batch_size=capped_batch)
    return {
        "status": "success",
        "wave_size": len(actions),
        "actions": actions
    }

@router.post("/reset-all")
async def reset_seats(
    db: AsyncSession = Depends(get_db),
    redis_client: aioredis.Redis = Depends(get_redis)
):
    """
    Resets all 500 seats back to Available and clears active holds, bookings, and queues.
    """
    from app.services.rush_simulator import rush_simulator
    res = await rush_simulator.reset_all_seats(db, redis_client)
    return res
