import logging
from typing import Optional
import redis.asyncio as aioredis
from app.core.config import settings

logger = logging.getLogger("concert_booking.redis")

_redis_client: Optional[aioredis.Redis] = None

async def init_redis() -> aioredis.Redis:
    """Initializes and tests connection to Redis. Falls back to fakeredis if configured."""
    global _redis_client
    try:
        client = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            socket_timeout=2.0,
            socket_connect_timeout=2.0
        )
        await client.ping()
        _redis_client = client
        logger.info(f"Connected to Redis at {settings.REDIS_URL}")
        return _redis_client
    except Exception as e:
        logger.warning(f"Could not connect to Redis server ({settings.REDIS_URL}): {e}")
        if settings.USE_FAKEREDIS_IF_NO_REDIS:
            try:
                import fakeredis.aioredis
                logger.info("Initializing in-memory FakeRedis (supporting Lua scripts, TTLs, and SortedSets)...")
                _redis_client = fakeredis.aioredis.FakeRedis(decode_responses=True)
                await _redis_client.ping()
                logger.info("FakeRedis initialized successfully.")
                return _redis_client
            except ImportError:
                logger.error("fakeredis is not installed.")
                raise e
        else:
            raise e

async def get_redis() -> aioredis.Redis:
    """FastAPI dependency to retrieve the active Redis client."""
    global _redis_client
    if _redis_client is None:
        _redis_client = await init_redis()
    return _redis_client

async def close_redis():
    """Closes Redis connections on shutdown."""
    global _redis_client
    if _redis_client is not None:
        await _redis_client.close()
        _redis_client = None
        logger.info("Redis connection closed.")
