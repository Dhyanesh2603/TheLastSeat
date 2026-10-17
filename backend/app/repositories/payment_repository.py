import secrets
from decimal import Decimal
from typing import Optional, Sequence
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.payment import Payment, PaymentStatus

class PaymentRepository:
    def generate_transaction_ref(self) -> str:
        return f"TX-SIM-{secrets.token_hex(8).upper()}"

    async def create(
        self,
        db: AsyncSession,
        user_id: str,
        reservation_id: str,
        amount: Decimal,
        status: PaymentStatus,
        simulated_delay: float,
        booking_id: Optional[str] = None,
        failure_reason: Optional[str] = None
    ) -> Payment:
        payment = Payment(
            transaction_reference=self.generate_transaction_ref(),
            user_id=user_id,
            reservation_id=reservation_id,
            booking_id=booking_id,
            amount=amount,
            currency="USD",
            status=status,
            simulated_delay_seconds=simulated_delay,
            failure_reason=failure_reason
        )
        db.add(payment)
        await db.flush()
        return payment

    async def get_by_id(self, db: AsyncSession, payment_id: str) -> Optional[Payment]:
        result = await db.execute(select(Payment).where(Payment.id == payment_id))
        return result.scalars().first()

    async def list_by_user(self, db: AsyncSession, user_id: str) -> Sequence[Payment]:
        stmt = (
            select(Payment)
            .where(Payment.user_id == user_id)
            .order_by(Payment.created_at.desc())
        )
        result = await db.execute(stmt)
        return result.scalars().all()

    async def list_all(
        self,
        db: AsyncSession,
        status: Optional[PaymentStatus] = None,
        limit: int = 100,
        offset: int = 0
    ) -> Sequence[Payment]:
        stmt = select(Payment)
        if status:
            stmt = stmt.where(Payment.status == status)
        stmt = stmt.order_by(Payment.created_at.desc()).limit(limit).offset(offset)
        result = await db.execute(stmt)
        return result.scalars().all()

    async def get_counts_by_status(self, db: AsyncSession) -> dict[str, int]:
        stmt = select(Payment.status, func.count(Payment.id)).group_by(Payment.status)
        result = await db.execute(stmt)
        counts = {s.value: 0 for s in PaymentStatus}
        for st, count in result.all():
            counts[st.value] = count
        return counts

payment_repo = PaymentRepository()
