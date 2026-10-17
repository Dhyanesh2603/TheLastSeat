from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.base import ensure_utc
from app.models.user import User, UserRole
from app.models.reservation import ReservationStatus
from app.schemas.reservation import ReservationResponse, ReservationListResponse
from app.repositories.reservation_repository import reservation_repo

router = APIRouter(prefix="/reservations", tags=["Reservations"])

@router.get("", response_model=ReservationListResponse)
async def list_reservations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    reservations = await reservation_repo.list_by_user(db, current_user.id)
    now = datetime.now(timezone.utc)

    results = []
    for r in reservations:
        exp_utc = ensure_utc(r.expires_at)
        is_exp = (r.status == ReservationStatus.EXPIRED) or (r.status == ReservationStatus.PENDING and exp_utc <= now)
        rem = max(0, int((exp_utc - now).total_seconds())) if not is_exp else 0
        res_dict = {
            "id": r.id,
            "user_id": r.user_id,
            "seat_id": r.seat_id,
            "seat": r.seat,
            "status": r.status if not (r.status == ReservationStatus.PENDING and is_exp) else ReservationStatus.EXPIRED,
            "expires_at": r.expires_at,
            "created_at": r.created_at,
            "is_expired": is_exp,
            "remaining_seconds": rem
        }
        results.append(ReservationResponse.model_validate(res_dict))

    return ReservationListResponse(total=len(results), reservations=results)

@router.get("/{reservation_id}", response_model=ReservationResponse)
async def get_reservation_by_id(
    reservation_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    res = await reservation_repo.get_by_id(db, reservation_id)
    if not res:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Reservation {reservation_id} not found."
        )
    if res.user_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    now = datetime.now(timezone.utc)
    exp_utc = ensure_utc(res.expires_at)
    is_exp = (res.status == ReservationStatus.EXPIRED) or (res.status == ReservationStatus.PENDING and exp_utc <= now)
    rem = max(0, int((exp_utc - now).total_seconds())) if not is_exp else 0

    return ReservationResponse(
        id=res.id,
        user_id=res.user_id,
        seat_id=res.seat_id,
        seat=res.seat,
        status=res.status if not (res.status == ReservationStatus.PENDING and is_exp) else ReservationStatus.EXPIRED,
        expires_at=res.expires_at,
        created_at=res.created_at,
        is_expired=is_exp,
        remaining_seconds=rem
    )
