import asyncio
import logging
import uuid
from typing import Optional
import redis.asyncio as aioredis
from app.utils.lua_scripts import RELEASE_LOCK_LUA

logger = logging.getLogger("concert_booking.lock")

class LockAcquisitionError(Exception):
    """Raised when a distributed lock could not be acquired within timeout."""
    pass

class RedisDistributedLock:
    def __init__(
        self,
        redis_client: aioredis.Redis,
        resource_key: str,
        ttl_ms: int = 5000,
        acquire_timeout: float = 2.0,
        retry_delay_ms: int = 50
    ):
        self.redis = redis_client
        self.resource_key = f"lock:{resource_key}"
        self.ttl_ms = ttl_ms
        self.acquire_timeout = acquire_timeout
        self.retry_delay_ms = retry_delay_ms
        self.token = str(uuid.uuid4())
        self._acquired = False

    async def acquire(self) -> bool:
        start_time = asyncio.get_event_loop().time()
        while (asyncio.get_event_loop().time() - start_time) < self.acquire_timeout:
            # SET key token NX PX ttl_ms
            ok = await self.redis.set(
                self.resource_key,
                self.token,
                nx=True,
                px=self.ttl_ms
            )
            if ok:
                self._acquired = True
                return True
            await asyncio.sleep(self.retry_delay_ms / 1000.0)
        
        raise LockAcquisitionError(
            f"Could not acquire distributed lock for resource: {self.resource_key} "
            f"within {self.acquire_timeout}s timeout"
        )

    async def release(self) -> bool:
        if not self._acquired:
            return False
        try:
            res = await self.redis.eval(
                RELEASE_LOCK_LUA,
                1,
                self.resource_key,
                self.token
            )
            self._acquired = False
            return bool(res)
        except Exception as e:
            logger.error(f"Error releasing Redis distributed lock {self.resource_key}: {e}")
            return False

    async def __aenter__(self):
        await self.acquire()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.release()
