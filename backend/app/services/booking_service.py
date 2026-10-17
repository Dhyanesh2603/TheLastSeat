import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional, Any
import redis.asyncio as aioredis
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status

from app.models.base import generate_uuid, ensure_utc
from app.models.seat import Seat, SeatStatus
from app.models.reservation import Reservation, ReservationStatus
from app.models.booking import Booking, BookingStatus
from app.models.payment import Payment, PaymentStatus
from app.repositories.seat_repository import seat_repo
from app.repositories.reservation_repository import reservation_repo
from app.repositories.booking_repository import booking_repo
from app.repositories.payment_repository import payment_repo
from app.repositories.audit_repository import audit_repo
from app.services.payment_simulator import payment_simulator
from app.services.queue_service import queue_service
from app.utils.redis_lock import RedisDistributedLock, LockAcquisitionError
from app.utils.lua_scripts import RELEASE_SEAT_LUA
from app.core.event_broker import event_broker

logger = logging.getLogger("concert_booking.service.booking")

class BookingService:
    async def confirm_booking(
        self,
        db: AsyncSession,
        redis_client: aioredis.Redis,
        user_id: str,
        seat_id: int,
        reservation_id: Optional[str] = None,
        force_outcome: Optional[str] = None,
        ip_address: Optional[str] = None,
        simulate_sleep: bool = True
    ) -> dict:
        """
        Confirms a seat booking through strict ACID database transaction with
        row-level locking (SELECT ... FOR UPDATE) and payment simulation.
        Guarantees: ONE SEAT -> ONE SUCCESSFUL BOOKING -> NEVER TWO WINNERS.
        """
        lock_key = f"seat:{seat_id}"
        seat_res_key = f"seat:{seat_id}:reservation"
        seat_booked_key = f"seat:{seat_id}:booked"

        try:
            async with RedisDistributedLock(redis_client, lock_key, ttl_ms=10000, acquire_timeout=3.0):
                # 1. Begin atomic row-level lock check on Seat inside DB transaction
                seat = await seat_repo.get_by_id_for_update(db, seat_id)
                if not seat:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Seat with ID {seat_id} not found."
                    )

                if seat.status == SeatStatus.BOOKED:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=f"Seat {seat.seat_number} is already permanently booked."
                    )

                # 2. Verify active reservation
                now = datetime.now(timezone.utc)
                if reservation_id:
                    reservation = await reservation_repo.get_by_id_for_update(db, reservation_id)
                else:
                    reservation = await reservation_repo.get_active_by_seat(db, seat_id)

                if not reservation:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="No active reservation found for this seat. You must reserve first."
                    )

                if reservation.user_id != user_id:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="You do not own this reservation."
                    )

                if reservation.status not in [ReservationStatus.PENDING, ReservationStatus.PAYMENT_FAILED]:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Reservation is not active (current status: {reservation.status.value})."
                    )

                if ensure_utc(reservation.expires_at) <= now:
                    reservation.status = ReservationStatus.EXPIRED
                    seat.status = SeatStatus.AVAILABLE
                    await db.commit()
                    # Release Redis reservation key
                    await redis_client.eval(RELEASE_SEAT_LUA, 1, seat_res_key, reservation.id)
                    raise HTTPException(
                        status_code=status.HTTP_410_GONE,
                        detail="Your reservation has expired. Please reserve the seat again."
                    )

                # 3. Simulate payment processing
                payment_result = await payment_simulator.process_payment(
                    amount=float(seat.price),
                    force_outcome=force_outcome,
                    simulate_sleep=simulate_sleep
                )

                # 4. Handle Payment Outcome
                if payment_result.is_successful:
                    # Create permanent Booking
                    booking = await booking_repo.create(
                        db=db,
                        user_id=user_id,
                        seat_id=seat.id,
                        total_amount=seat.price,
                        reservation_id=reservation.id
                    )

                    # Update Seat status to Booked
                    seat.status = SeatStatus.BOOKED
                    seat.version += 1

                    # Update Reservation status to Confirmed
                    reservation.status = ReservationStatus.CONFIRMED

                    # Create Payment record linked to booking
                    payment = await payment_repo.create(
                        db=db,
                        user_id=user_id,
                        reservation_id=reservation.id,
                        amount=seat.price,
                        status=payment_result.status,
                        simulated_delay=payment_result.delay_seconds,
                        booking_id=booking.id
                    )

                    # Mark Redis seat permanently booked and remove temporary reservation
                    await redis_client.set(seat_booked_key, "1")
                    await redis_client.eval(RELEASE_SEAT_LUA, 1, seat_res_key, reservation.id)

                    # Audit Log
                    await audit_repo.log(
                        db,
                        action="BOOKING_CONFIRM",
                        entity_type="Booking",
                        entity_id=booking.id,
                        user_id=user_id,
                        metadata_json={
                            "booking_reference": booking.booking_reference,
                            "seat_id": seat.id,
                            "seat_number": seat.seat_number,
                            "amount": float(seat.price),
                            "payment_status": payment.status.value
                        },
                        ip_address=ip_address
                    )

                    await db.commit()

                    # Dispatch asynchronous event to message broker
                    await event_broker.publish("booking.confirmed", {
                        "booking_id": booking.id,
                        "booking_reference": booking.booking_reference,
                        "seat_id": seat.id,
                        "seat_number": seat.seat_number,
                        "user_id": str(user_id),
                        "total_amount": float(seat.price),
                        "payment_status": payment.status.value
                    })

                    return {
                        "booking_id": booking.id,
                        "booking_reference": booking.booking_reference,
                        "seat_id": seat.id,
                        "seat_number": seat.seat_number,
                        "total_amount": seat.price,
                        "payment_id": payment.id,
                        "payment_status": payment.status.value,
                        "booking_status": booking.status.value,
                        "message": f"Seat {seat.seat_number} booked successfully! Ref: {booking.booking_reference}"
                    }
                else:
                    # Payment Failed or Timed Out
                    # As specified: "If payment fails: Reservation should remain active until expiration."
                    reservation.status = ReservationStatus.PAYMENT_FAILED

                    payment = await payment_repo.create(
                        db=db,
                        user_id=user_id,
                        reservation_id=reservation.id,
                        amount=seat.price,
                        status=payment_result.status,
                        simulated_delay=payment_result.delay_seconds,
                        booking_id=None,
                        failure_reason=payment_result.failure_reason
                    )

                    await audit_repo.log(
                        db,
                        action="PAYMENT_FAILED",
                        entity_type="Payment",
                        entity_id=payment.id,
                        user_id=user_id,
                        metadata_json={
                            "reason": payment_result.failure_reason,
                            "seat_id": seat.id,
                            "status": payment_result.status.value
                        },
                        ip_address=ip_address
                    )

                    await db.commit()

                    # Dispatch asynchronous event to message broker
                    await event_broker.publish("payment.failed", {
                        "payment_id": payment.id,
                        "user_id": str(user_id),
                        "seat_id": seat.id,
                        "reason": payment_result.failure_reason,
                        "status": payment_result.status.value
                    })

                    return {
                        "booking_id": None,
                        "booking_reference": None,
                        "seat_id": seat.id,
                        "seat_number": seat.seat_number,
                        "total_amount": seat.price,
                        "payment_id": payment.id,
                        "payment_status": payment.status.value,
                        "booking_status": "Failed",
                        "message": f"Payment {payment_result.status.value.lower()}: {payment_result.failure_reason}. Your reservation remains held until expiry."
                    }

        except LockAcquisitionError:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Lock contention on seat confirmation. Please retry."
            )

    async def cancel_booking(
        self,
        db: AsyncSession,
        redis_client: aioredis.Redis,
        user_id: str,
        seat_id: int,
        is_admin: bool = False,
        ip_address: Optional[str] = None
    ) -> dict:
        """
        Cancels a booking, releases the seat to Available, removes Redis booked keys,
        and triggers the Waiting Queue notification for the next user.
        """
        lock_key = f"seat:{seat_id}"
        seat_booked_key = f"seat:{seat_id}:booked"
        seat_res_key = f"seat:{seat_id}:reservation"

        async with RedisDistributedLock(redis_client, lock_key, ttl_ms=5000, acquire_timeout=2.0):
            # 1. Lock seat in DB
            seat = await seat_repo.get_by_id_for_update(db, seat_id)
            if not seat:
                raise HTTPException(status_code=404, detail="Seat not found.")

            # 2. Find confirmed booking
            booking = await booking_repo.get_confirmed_by_seat(db, seat_id)
            if not booking:
                raise HTTPException(status_code=400, detail="No active confirmed booking found for this seat.")

            if booking.user_id != user_id and not is_admin:
                raise HTTPException(status_code=403, detail="You do not own this booking.")

            # 3. Cancel booking & restore seat
            await booking_repo.cancel(db, booking)
            seat.status = SeatStatus.AVAILABLE
            seat.version += 1

            # 4. Clean Redis keys
            await redis_client.delete(seat_booked_key)
            await redis_client.delete(seat_res_key)

            # 5. Notify waiting queue!
            await queue_service.notify_next_in_queue(db, redis_client, seat_id=seat.id)

            # 6. Audit log
            await audit_repo.log(
                db,
                action="BOOKING_CANCEL",
                entity_type="Booking",
                entity_id=booking.id,
                user_id=user_id,
                metadata_json={"seat_id": seat.id, "seat_number": seat.seat_number},
                ip_address=ip_address
            )

            await db.commit()

            # Dispatch asynchronous event to message broker
            await event_broker.publish("booking.cancelled", {
                "booking_id": booking.id,
                "booking_reference": booking.booking_reference,
                "seat_id": seat.id,
                "seat_number": seat.seat_number,
                "user_id": str(user_id)
            })

            return {
                "booking_id": booking.id,
                "seat_id": seat.id,
                "status": "Cancelled",
                "message": f"Booking {booking.booking_reference} for seat {seat.seat_number} cancelled. Seat released."
            }

    async def get_booking_history(self, db: AsyncSession, user_id: str) -> dict:
        """Aggregates bookings, reservations, and payment attempts into a structured timeline."""
        bookings = await booking_repo.list_by_user(db, user_id)
        reservations = await reservation_repo.list_by_user(db, user_id)
        payments = await payment_repo.list_by_user(db, user_id)

        history_items = []

        for b in bookings:
            history_items.append({
                "id": b.id,
                "type": "booking",
                "title": f"Booking Ref {b.booking_reference}",
                "seat_id": b.seat_id,
                "seat_number": b.seat.seat_number if b.seat else f"Seat #{b.seat_id}",
                "status": b.status.value,
                "amount": b.total_amount,
                "timestamp": b.created_at,
                "details": {
                    "reference": b.booking_reference,
                    "cancelled_at": b.cancelled_at.isoformat() if b.cancelled_at else None
                }
            })

        for r in reservations:
            # Only add reservation if it didn't turn into a confirmed booking (to avoid noise)
            if r.status != ReservationStatus.CONFIRMED:
                history_items.append({
                    "id": r.id,
                    "type": "reservation",
                    "title": f"Reservation Attempt",
                    "seat_id": r.seat_id,
                    "seat_number": r.seat.seat_number if r.seat else f"Seat #{r.seat_id}",
                    "status": r.status.value,
                    "amount": None,
                    "timestamp": r.created_at,
                    "details": {"expires_at": r.expires_at.isoformat()}
                })

        for p in payments:
            if p.status != PaymentStatus.SUCCEEDED:
                history_items.append({
                    "id": p.id,
                    "type": "payment",
                    "title": f"Payment {p.status.value}",
                    "seat_id": 0,
                    "seat_number": "N/A",
                    "status": p.status.value,
                    "amount": p.amount,
                    "timestamp": p.created_at,
                    "details": {
                        "reason": p.failure_reason,
                        "reference": p.transaction_reference
                    }
                })

        history_items.sort(key=lambda x: x["timestamp"], reverse=True)

        active_count = sum(1 for b in bookings if b.status == BookingStatus.CONFIRMED)
        cancelled_count = sum(1 for b in bookings if b.status == BookingStatus.CANCELLED)

        return {
            "total_bookings": len(bookings),
            "active_bookings": active_count,
            "cancelled_bookings": cancelled_count,
            "history": history_items
        }

booking_service = BookingService()
