import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Callable
from fastapi import Request, Response, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.core.config import settings
from app.core import database
from app.core.redis_client import get_redis
from app.repositories.audit_repository import idempotency_repo

logger = logging.getLogger("concert_booking.middleware.idempotency")

class IdempotencyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Idempotency only applies to mutation requests (POST, PUT, DELETE)
        if request.method not in ["POST", "PUT", "DELETE"]:
            return await call_next(request)

        idempotency_key = request.headers.get("Idempotency-Key") or request.headers.get("X-Idempotency-Key")
        if not idempotency_key:
            return await call_next(request)

        # Read and cache request body
        body_bytes = await request.body()
        req_hash = hashlib.sha256(request.url.path.encode() + body_bytes).hexdigest()

        redis_client = await get_redis()
        redis_cache_key = f"idempotency:{idempotency_key}"

        # 1. Fast Redis check
        cached_raw = await redis_client.get(redis_cache_key)
        if cached_raw:
            try:
                cached_data = json.loads(cached_raw)
                logger.info(f"Idempotency cache HIT (Redis) for key: {idempotency_key}")
                return JSONResponse(
                    status_code=cached_data["code"],
                    content=cached_data["body"],
                    headers={"X-Idempotency-Hit": "true"}
                )
            except Exception as e:
                logger.warning(f"Failed parsing cached idempotency payload: {e}")

        # 2. Database check
        async with database.AsyncSessionLocal() as db:
            db_record = await idempotency_repo.get(db, idempotency_key)
            if db_record:
                logger.info(f"Idempotency cache HIT (DB) for key: {idempotency_key}")
                # Backfill Redis
                await redis_client.set(
                    redis_cache_key,
                    json.dumps({"code": db_record.response_code, "body": db_record.response_body}),
                    ex=settings.IDEMPOTENCY_EXPIRY_SECONDS
                )
                return JSONResponse(
                    status_code=db_record.response_code,
                    content=db_record.response_body,
                    headers={"X-Idempotency-Hit": "true"}
                )

        # 3. Process new request
        response = await call_next(request)

        # 4. Cache successful responses (200 - 299)
        if 200 <= response.status_code < 300:
            response_body_bytes = b""
            async for chunk in response.body_iterator:
                response_body_bytes += chunk

            try:
                parsed_json = json.loads(response_body_bytes.decode("utf-8"))
            except Exception:
                parsed_json = {"raw": response_body_bytes.decode("utf-8", errors="ignore")}

            # Extract user_id if present in state or token
            user_id = getattr(request.state, "user_id", "anonymous")

            # Persist to Redis
            await redis_client.set(
                redis_cache_key,
                json.dumps({"code": response.status_code, "body": parsed_json}),
                ex=settings.IDEMPOTENCY_EXPIRY_SECONDS
            )

            # Persist to DB
            try:
                async with database.AsyncSessionLocal() as db:
                    expires_at = datetime.now(timezone.utc) + timedelta(seconds=settings.IDEMPOTENCY_EXPIRY_SECONDS)
                    await idempotency_repo.save(
                        db=db,
                        idempotency_key=idempotency_key,
                        user_id=user_id if user_id != "anonymous" else "00000000-0000-0000-0000-000000000000",
                        request_path=request.url.path,
                        request_hash=req_hash,
                        response_code=response.status_code,
                        response_body=parsed_json,
                        expires_at=expires_at
                    )
                    await db.commit()
            except Exception as e:
                logger.error(f"Error persisting idempotency record: {e}")

            return JSONResponse(
                status_code=response.status_code,
                content=parsed_json,
                headers=dict(response.headers)
            )

        return response
