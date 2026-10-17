import os
from typing import Optional
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "College Concert Ticket Booking Platform"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://postgres:postgres@localhost:5432/concert_booking"
    )
    # Allows zero-configuration standalone running when PostgreSQL is not installed locally
    SQLITE_FALLBACK_URL: str = "sqlite+aiosqlite:///./concert_booking.db"
    USE_SQLITE_IF_NO_PG: bool = True
    
    # Redis & Message Broker
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    USE_FAKEREDIS_IF_NO_REDIS: bool = True
    RABBITMQ_URL: Optional[str] = os.getenv("RABBITMQ_URL", None)
    ENABLE_ASYNC_EVENT_BROKER: bool = True
    
    # JWT
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "prod-grade-jwt-secret-key-concert-booking-platform-2026")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    
    # Concurrency & Booking Rules
    RESERVATION_DURATION_SECONDS: int = 300  # 5 minutes
    TOTAL_SEATS: int = 500
    SEAT_ROWS: int = 20
    SEATS_PER_ROW: int = 25
    
    # Payment Simulation Defaults (seconds)
    PAYMENT_SIM_MIN_DELAY: float = 1.0
    PAYMENT_SIM_MAX_DELAY: float = 8.0
    
    # Waiting queue offer expiry
    QUEUE_OFFER_DURATION_SECONDS: int = 180  # 3 minutes for queue winner to claim seat
    
    # Idempotency
    IDEMPOTENCY_EXPIRY_SECONDS: int = 86400  # 24 hours

    model_config = {
        "env_file": ".env",
        "extra": "ignore"
    }

settings = Settings()
