import logging
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core import database
from app.core.redis_client import init_redis, close_redis
from app.repositories.seat_repository import seat_repo
from app.services.auth_service import auth_service
from app.workers.expiry_worker import expiry_worker
from app.middleware.idempotency import IdempotencyMiddleware

# API Routers
from app.api.auth import router as auth_router
from app.api.seats import router as seats_router
from app.api.bookings import router as bookings_router
from app.api.reservations import router as reservations_router
from app.api.payments import router as payments_router
from app.api.queue import router as queue_router
from app.api.admin import router as admin_router
from app.api.health import router as health_router

# Configure Structured Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s]: %(message)s"
)
logger = logging.getLogger("concert_booking.main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing College Concert Ticket Booking Platform...")
    # 1. Initialize DB schema
    await database.init_db()

    # 2. Initialize Redis
    redis_conn = await init_redis()

    # 2b. Initialize Async Event Broker (RabbitMQ / Redis PubSub / in-memory)
    from app.core.event_broker import event_broker
    await event_broker.initialize(redis_client=redis_conn)

    # 3. Seed initial 500 seats and default accounts
    async with database.AsyncSessionLocal() as db:
        await seat_repo.seed_seats_if_empty(db, total_seats=settings.TOTAL_SEATS)
        await auth_service.seed_default_users_if_empty(db)

    # 4. Start background reservation expiry worker
    expiry_worker.start()
    logger.info("Application startup sequence completed successfully.")

    yield

    # Shutdown sequence
    logger.info("Shutting down application...")
    await expiry_worker.stop()
    await event_broker.close()
    await close_redis()
    logger.info("Application shutdown completed.")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="High-concurrency ticket booking platform with zero double-booking guarantee.",
    lifespan=lifespan
)

# 1. CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permits local dev Vite, Docker compose, Nginx
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Idempotency-Hit", "X-Process-Time"]
)

# 2. Idempotency Middleware
app.add_middleware(IdempotencyMiddleware)

# 3. Request Timing Middleware
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = (time.time() - start_time) * 1000
    response.headers["X-Process-Time-Ms"] = f"{process_time:.2f}"
    return response

# 4. Include Routers
app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(seats_router, prefix=settings.API_V1_STR)
app.include_router(bookings_router, prefix=settings.API_V1_STR)
app.include_router(reservations_router, prefix=settings.API_V1_STR)
app.include_router(payments_router, prefix=settings.API_V1_STR)
app.include_router(queue_router, prefix=settings.API_V1_STR)
app.include_router(admin_router, prefix=settings.API_V1_STR)
app.include_router(health_router, prefix=settings.API_V1_STR)

# Direct root health ping
@app.get("/")
async def root():
    return {
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "docs": "/docs",
        "health": f"{settings.API_V1_STR}/health"
    }
