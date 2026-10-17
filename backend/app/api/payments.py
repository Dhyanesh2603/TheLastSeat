from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User, UserRole
from app.models.payment import PaymentStatus
from app.schemas.payment import PaymentResponse, PaymentListResponse
from app.repositories.payment_repository import payment_repo

router = APIRouter(prefix="/payments", tags=["Payments"])

@router.get("", response_model=PaymentListResponse)
async def list_payments(
    status_filter: Optional[PaymentStatus] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role == UserRole.ADMIN:
        payments = await payment_repo.list_all(db, status=status_filter)
    else:
        payments = await payment_repo.list_by_user(db, current_user.id)

    counts = await payment_repo.get_counts_by_status(db)

    return PaymentListResponse(
        total=len(payments),
        successful_count=counts.get(PaymentStatus.SUCCEEDED.value, 0),
        failed_count=counts.get(PaymentStatus.FAILED.value, 0),
        timeout_count=counts.get(PaymentStatus.TIMEOUT.value, 0),
        delayed_success_count=counts.get(PaymentStatus.DELAYED_SUCCESS.value, 0),
        payments=[PaymentResponse.model_validate(p) for p in payments]
    )

@router.get("/{payment_id}", response_model=PaymentResponse)
async def get_payment_by_id(
    payment_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    p = await payment_repo.get_by_id(db, payment_id)
    if not p:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Payment record with ID {payment_id} not found."
        )
    if p.user_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    return PaymentResponse.model_validate(p)
