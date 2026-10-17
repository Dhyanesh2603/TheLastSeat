import asyncio
import logging
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from app.core import database
from app.core.redis_client import get_redis
from app.models.reservation import ReservationStatus
from app.models.seat import SeatStatus
from app.repositories.reservation_repository import reservation_repo
from app.repositories.seat_repository import seat_repo
from app.services.queue_service import queue_service
from app.utils.lua_scripts import RELEASE_SEAT_LUA
from app.repositories.audit_repository import audit_repo
from app.core.event_broker import event_broker

logger = logging.getLogger("concert_booking.worker.expiry")

class ReservationExpiryWorker:
    def __init__(self, check_interval_seconds: float = 5.0):
        self.check_interval_seconds = check_interval_seconds
        self._is_running = False
        self._task: asyncio.Task | None = None

    async def sweep_expired_reservations(self):
        """
        Sweeps pending reservations past their expiration timestamp.
        Uses database row locking (SKIP LOCKED) to allow multiple worker processes
        to run concurrently without collision or deadlocks.
        """
        async with database.AsyncSessionLocal() as db:
            now = datetime.now(timezone.utc)
            expired_reservations = await reservation_repo.get_expired_pending(db, now, limit=50)
            if not expired_reservations:
                return 0

            redis_client = await get_redis()
            reclaimed_count = 0

            for res in expired_reservations:
                try:
                    res.status = ReservationStatus.EXPIRED
                    
                    # Check seat status
                    seat = await seat_repo.get_by_id_for_update(db, res.seat_id)
                    if seat and seat.status == SeatStatus.RESERVED:
                        seat.status = SeatStatus.AVAILABLE
                        seat.version += 1

                    # Remove Redis reservation key
                    seat_res_key = f"seat:{res.seat_id}:reservation"
                    await redis_client.eval(RELEASE_SEAT_LUA, 1, seat_res_key, res.id)

                    # Notify waiting queue
                    await queue_service.notify_next_in_queue(db, redis_client, seat_id=res.seat_id)

                    # Audit log
                    await audit_repo.log(
                        db,
                        action="RESERVATION_EXPIRE",
                        entity_type="Reservation",
                        entity_id=res.id,
                        user_id=res.user_id,
                        metadata_json={"seat_id": res.seat_id}
                    )
                    # Dispatch asynchronous event to message broker
                    await event_broker.publish("reservation.expired", {
                        "reservation_id": res.id,
                        "seat_id": res.seat_id,
                        "user_id": str(res.user_id)
                    })

                    reclaimed_count += 1
                except Exception as e:
                    logger.error(f"Error expiring reservation {res.id}: {e}")

            await db.commit()
            if reclaimed_count > 0:
                logger.info(f"Sweeper expired {reclaimed_count} reservations and notified waiting queue.")
            return reclaimed_count

    async def _run_loop(self):
        logger.info(f"ReservationExpiryWorker started (interval: {self.check_interval_seconds}s)")
        while self._is_running:
            try:
                await self.sweep_expired_reservations()
            except Exception as e:
                logger.error(f"Unexpected error in reservation expiry worker loop: {e}")
            await asyncio.sleep(self.check_interval_seconds)

    def start(self):
        if not self._is_running:
            self._is_running = True
            self._task = asyncio.create_task(self._run_loop())

    async def stop(self):
        if self._is_running:
            self._is_running = False
            if self._task:
                self._task.cancel()
                try:
                    await self._task
                except asyncio.CancelledError:
                    pass
            logger.info("ReservationExpiryWorker stopped.")

expiry_worker = ReservationExpiryWorker()
