import logging
from typing import AsyncGenerator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool
from app.core.config import settings
from app.models.base import Base

logger = logging.getLogger("concert_booking.database")

# Primary Engine Setup
def create_engine_instance():
    # If using postgresql, set up asyncpg pool
    db_url = settings.DATABASE_URL
    connect_args = {}
    
    if "sqlite" in db_url:
        connect_args["check_same_thread"] = False
        return create_async_engine(
            db_url,
            connect_args=connect_args,
            echo=False,
            future=True,
            poolclass=NullPool
        )
    else:
        return create_async_engine(
            db_url,
            pool_size=20,
            max_overflow=40,
            pool_pre_ping=True,
            pool_recycle=300,
            echo=False,
            future=True
        )

engine = create_engine_instance()
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields an active database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

async def init_db():
    """Initializes database tables and verifies connectivity."""
    global engine, AsyncSessionLocal
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database schema verified/created successfully.")
    except Exception as e:
        logger.warning(f"Could not connect to primary database ({settings.DATABASE_URL}): {e}")
        if settings.USE_SQLITE_IF_NO_PG and not str(settings.DATABASE_URL).startswith("sqlite"):
            logger.info("Falling back to SQLite async storage for local development...")
            engine = create_async_engine(
                settings.SQLITE_FALLBACK_URL,
                connect_args={"check_same_thread": False, "timeout": 30},
                poolclass=NullPool
            )
            AsyncSessionLocal = async_sessionmaker(
                bind=engine,
                class_=AsyncSession,
                expire_on_commit=False,
                autocommit=False,
                autoflush=False
            )
            async with engine.begin() as conn:
                await conn.execute(text("PRAGMA journal_mode=WAL;"))
                await conn.execute(text("PRAGMA busy_timeout=30000;"))
                await conn.run_sync(Base.metadata.create_all)
            logger.info("SQLite fallback initialized with WAL mode and 30s busy timeout.")
        else:
            raise e
