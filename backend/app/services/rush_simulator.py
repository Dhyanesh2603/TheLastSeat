import random
import uuid
import logging
from typing import List, Dict, Any
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as aioredis

from app.models.seat import Seat, SeatStatus
from app.models.booking import Booking, BookingStatus
from app.models.reservation import Reservation, ReservationStatus
from app.models.payment import Payment, PaymentStatus
from app.models.waiting_queue import WaitingQueue
from app.models.idempotency import IdempotencyKey
from app.models.user import User
from app.services.seat_service import seat_service
from app.services.booking_service import booking_service
from app.core.event_broker import event_broker

logger = logging.getLogger("concert_booking.service.rush_simulator")

SIMULATED_STUDENT_NAMES = [
    "Aarav Sharma", "Priya Patel", "Rohan Mehta", "Ananya Iyer", "Vikram Malhotra",
    "Sneha Reddy", "Aditya Verma", "Neha Nair", "Kavya Deshmukh", "Rahul Joshi",
    "Diya Sengupta", "Arjun Kapoor", "Ishita Choudhury", "Siddharth Rao", "Tanvi Bhatia",
    "Manish Trivedi", "Rhea Pillai", "Gaurav Nambiar", "Pooja Hegde", "Devansh Saxena"
]

class RushSimulator:
    async def reset_all_seats(self, db: AsyncSession, redis_client: aioredis.Redis) -> dict:
        """
        Instantly clears all bookings, reservations, payments, and queues,
        and reverts all 500 seats back to Available.
        """
        # 1. Reset all seats to Available
        await db.execute(
            update(Seat).values(status=SeatStatus.AVAILABLE, version=0)
        )

        # 2. Delete transactional records
        await db.execute(delete(Payment))
        await db.execute(delete(Booking))
        await db.execute(delete(Reservation))
        await db.execute(delete(WaitingQueue))
        await db.execute(delete(IdempotencyKey))

        await db.commit()

        # 3. Clean Redis keys
        try:
            res_keys = await redis_client.keys("seat:*:reservation")
            booked_keys = await redis_client.keys("seat:*:booked")
            lock_keys = await redis_client.keys("seat:*:lock*")
            queue_keys = await redis_client.keys("queue:*")
            all_keys = res_keys + booked_keys + lock_keys + queue_keys
            if all_keys:
                await redis_client.delete(*all_keys)
        except Exception as e:
            logger.warning(f"Could not clear all Redis keys during reset: {e}")

        # 4. Publish reset event
        await event_broker.publish("seats.reset", {"total_seats": 500})

        return {
            "message": "All 500 seats successfully reset to Available. All reservations and bookings cleared.",
            "total_available": 500
        }

    async def simulate_rush_batch(
        self,
        db: AsyncSession,
        redis_client: aioredis.Redis,
        batch_size: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Simulates an incoming wave of students rushing to reserve and book seats.
        Each student picks an available seat, attempts atomic reservation, and
        either confirms booking with simulated payment or leaves it held.
        """
        # Find currently available seats
        stmt = select(Seat).where(Seat.status == SeatStatus.AVAILABLE).limit(100)
        available_seats = (await db.execute(stmt)).scalars().all()

        if not available_seats:
            return [{
                "student_name": "System",
                "seat_number": "N/A",
                "action": "Concert Sold Out",
                "status": "Sold Out",
                "details": "All 500 seats are fully booked or reserved! Students joining Waiting Queue."
            }]

        # Find or create a pool of student users
        user_stmt = select(User).where(User.role == "student").limit(20)
        users = (await db.execute(user_stmt)).scalars().all()
        if not users:
            fallback_user_id = str(uuid.uuid4())
        else:
            fallback_user_id = str(users[0].id)

        actions_log = []
        selected_sample = random.sample(available_seats, min(batch_size, len(available_seats)))

        for seat in selected_sample:
            student_name = random.choice(SIMULATED_STUDENT_NAMES)
            sim_user_id = str(random.choice(users).id) if users else fallback_user_id

            try:
                # 1. Atomic reserve
                res = await seat_service.reserve_seat(
                    db=db,
                    redis_client=redis_client,
                    user_id=sim_user_id,
                    seat_id=seat.id,
                    ip_address="127.0.0.1"
                )

                # 2. Decide outcome (80% confirm immediately, 15% payment fail, 5% hold)
                rand_val = random.random()
                if rand_val < 0.80:
                    # Confirm booking
                    confirm_res = await booking_service.confirm_booking(
                        db=db,
                        redis_client=redis_client,
                        user_id=sim_user_id,
                        seat_id=seat.id,
                        reservation_id=res["reservation_id"],
                        force_outcome="success",
                        ip_address="127.0.0.1",
                        simulate_sleep=False
                    )
                    actions_log.append({
                        "student_name": student_name,
                        "seat_id": seat.id,
                        "seat_number": seat.seat_number,
                        "action": "Booked Seat",
                        "status": "Booked",
                        "details": f"Confirmed! Ref: {confirm_res.get('booking_reference')}"
                    })
                elif rand_val < 0.95:
                    # Simulated payment failure
                    actions_log.append({
                        "student_name": student_name,
                        "seat_id": seat.id,
                        "seat_number": seat.seat_number,
                        "action": "Reserved (Payment Pending)",
                        "status": "Reserved",
                        "details": "Payment declined/retry. 5-minute hold active."
                    })
                else:
                    # Hold only
                    actions_log.append({
                        "student_name": student_name,
                        "seat_id": seat.id,
                        "seat_number": seat.seat_number,
                        "action": "Temporary Hold",
                        "status": "Reserved",
                        "details": "Checking out (300s TTL hold)."
                    })

            except Exception as e:
                # Normal contention rejection
                actions_log.append({
                    "student_name": student_name,
                    "seat_id": seat.id,
                    "seat_number": seat.seat_number,
                    "action": "Contention Collision",
                    "status": "Conflict",
                    "details": str(e)
                })

        return actions_log

rush_simulator = RushSimulator()
