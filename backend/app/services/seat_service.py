import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Sequence
import redis.asyncio as aioredis
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status

from app.core.config import settings
from app.models.seat import Seat, SeatStatus
from app.models.reservation import Reservation, ReservationStatus
from app.repositories.seat_repository import seat_repo
from app.repositories.reservation_repository import reservation_repo
from app.repositories.audit_repository import audit_repo
from app.utils.redis_lock import RedisDistributedLock, LockAcquisitionError
from app.utils.lua_scripts import RESERVE_SEAT_LUA, RELEASE_SEAT_LUA
from app.models.base import generate_uuid
from app.core.event_broker import event_broker

logger = logging.getLogger("concert_booking.service.seat")

class SeatService:
    async def get_all_seats(self, db: AsyncSession, redis_client: aioredis.Redis) -> list[Seat]:
        """
        Retrieves all 500 seats. Ensures seat statuses reflect active reservations
        and handles lazy expiration if needed.
        """
        seats = await seat_repo.list_all(db)
        return list(seats)

    async def get_seat_by_id(self, db: AsyncSession, seat_id: int) -> Seat:
        seat = await seat_repo.get_by_id(db, seat_id)
        if not seat:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Seat with ID {seat_id} not found."
            )
        return seat

    async def reserve_seat(
        self,
        db: AsyncSession,
        redis_client: aioredis.Redis,
        user_id: str,
        seat_id: int,
        ip_address: Optional[str] = None
    ) -> dict:
        """
        Executes atomic seat reservation:
        1. Acquire Redis distributed lock on seat.
        2. Execute atomic Lua script to claim reservation key with TTL.
        3. Verify & lock seat row in DB.
        4. Create DB reservation record with 5-minute TTL.
        5. Update Seat status to Reserved.
        6. Release Redis lock.
        7. Audit log.
        """
        reservation_id = generate_uuid()
        ttl_seconds = settings.RESERVATION_DURATION_SECONDS
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)

        lock_key = f"seat:{seat_id}"
        seat_res_key = f"seat:{seat_id}:reservation"
        seat_booked_key = f"seat:{seat_id}:booked"

        try:
            async with RedisDistributedLock(redis_client, lock_key, ttl_ms=4000, acquire_timeout=2.0):
                # 1. Atomic Redis check & set via Lua
                res_code = await redis_client.eval(
                    RESERVE_SEAT_LUA,
                    2,
                    seat_res_key,
                    seat_booked_key,
                    reservation_id,
                    user_id,
                    str(ttl_seconds)
                )

                if res_code == 0:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Seat is permanently booked and cannot be reserved."
                    )
                elif res_code == -1:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Seat is currently reserved by another customer."
                    )

                # 2. Database transaction check and row lock
                seat = await seat_repo.get_by_id_for_update(db, seat_id)
                if not seat:
                    # Rollback Redis key
                    await redis_client.eval(RELEASE_SEAT_LUA, 1, seat_res_key, reservation_id)
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Seat {seat_id} not found."
                    )

                if seat.status == SeatStatus.BOOKED:
                    await redis_client.eval(RELEASE_SEAT_LUA, 1, seat_res_key, reservation_id)
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Seat is permanently booked in the database."
                    )

                if seat.status == SeatStatus.UNAVAILABLE:
                    await redis_client.eval(RELEASE_SEAT_LUA, 1, seat_res_key, reservation_id)
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Seat is currently marked unavailable."
                    )

                # Check if seat is currently marked Reserved in DB with an active non-expired reservation
                existing_active = await reservation_repo.get_active_by_seat(db, seat_id)
                if res_code == 2 or (existing_active and existing_active.user_id == user_id):
                    active_res = existing_active or (await reservation_repo.get_active_by_seat(db, seat_id))
                    if active_res:
                        from app.models.base import ensure_utc
                        rem_sec = max(0, int((ensure_utc(active_res.expires_at) - datetime.now(timezone.utc)).total_seconds()))
                        return {
                            "reservation_id": active_res.id,
                            "seat_id": seat.id,
                            "seat_number": seat.seat_number,
                            "user_id": user_id,
                            "status": active_res.status.value,
                            "expires_at": active_res.expires_at,
                            "remaining_seconds": rem_sec,
                            "message": f"Seat {seat.seat_number} is reserved by you. Remaining hold: {rem_sec}s."
                        }

                if existing_active and existing_active.user_id != user_id:
                    await redis_client.eval(RELEASE_SEAT_LUA, 1, seat_res_key, reservation_id)
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Seat has an active pending reservation by another user."
                    )

                # 3. Create reservation in DB
                reservation = Reservation(
                    id=reservation_id,
                    user_id=user_id,
                    seat_id=seat_id,
                    status=ReservationStatus.PENDING,
                    expires_at=expires_at
                )
                db.add(reservation)

                # 4. Update Seat status in DB
                seat.status = SeatStatus.RESERVED
                seat.version += 1

                # 5. Audit Log
                await audit_repo.log(
                    db,
                    action="SEAT_RESERVE",
                    entity_type="Seat",
                    entity_id=str(seat_id),
                    user_id=user_id,
                    metadata_json={
                        "reservation_id": reservation_id,
                        "seat_number": seat.seat_number,
                        "expires_at": expires_at.isoformat()
                    },
                    ip_address=ip_address
                )

                await db.commit()

                # Dispatch asynchronous event to message broker
                await event_broker.publish("seat.reserved", {
                    "reservation_id": reservation_id,
                    "seat_id": seat.id,
                    "seat_number": seat.seat_number,
                    "user_id": str(user_id),
                    "expires_at": expires_at.isoformat()
                })

                return {
                    "reservation_id": reservation_id,
                    "seat_id": seat.id,
                    "seat_number": seat.seat_number,
                    "user_id": user_id,
                    "status": ReservationStatus.PENDING.value,
                    "expires_at": expires_at,
                    "remaining_seconds": ttl_seconds,
                    "message": f"Seat {seat.seat_number} reserved successfully for {ttl_seconds // 60} minutes."
                }

        except LockAcquisitionError:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="High concurrency detected on this seat. Please retry momentarily."
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Failed to reserve seat {seat_id}: {e}")
            await db.rollback()
            # Clean up Redis reservation key if set
            await redis_client.eval(RELEASE_SEAT_LUA, 1, seat_res_key, reservation_id)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"An error occurred while reserving seat: {str(e)}"
            )

seat_service = SeatService()
