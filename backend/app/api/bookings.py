from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User, UserRole
from app.schemas.booking import BookingResponse, BookingHistoryResponse
from app.repositories.booking_repository import booking_repo
from app.services.booking_service import booking_service

router = APIRouter(prefix="/bookings", tags=["Bookings"])

@router.get("", response_model=List[BookingResponse])
async def list_user_bookings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role == UserRole.ADMIN:
        bookings = await booking_repo.list_all(db)
    else:
        bookings = await booking_repo.list_by_user(db, current_user.id)
    return [BookingResponse.model_validate(b) for b in bookings]

@router.get("/history", response_model=BookingHistoryResponse)
async def get_booking_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    history = await booking_service.get_booking_history(db, current_user.id)
    return history

@router.get("/{booking_id}", response_model=BookingResponse)
async def get_booking_by_id(
    booking_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    booking = await booking_repo.get_by_id(db, booking_id)
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Booking with ID {booking_id} not found."
        )
    if booking.user_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this booking."
        )
    return BookingResponse.model_validate(booking)
