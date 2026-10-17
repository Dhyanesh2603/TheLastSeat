from datetime import datetime, timezone
from typing import Optional, Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit import AuditLog
from app.models.idempotency import IdempotencyKey

class AuditRepository:
    async def log(
        self,
        db: AsyncSession,
        action: str,
        entity_type: str,
        entity_id: str,
        user_id: Optional[str] = None,
        metadata_json: Optional[Any] = None,
        ip_address: Optional[str] = None
    ) -> AuditLog:
        entry = AuditLog(
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id),
            user_id=user_id,
            metadata_json=metadata_json,
            ip_address=ip_address
        )
        db.add(entry)
        await db.flush()
        return entry

    async def get_recent(self, db: AsyncSession, limit: int = 50) -> list[AuditLog]:
        stmt = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
        result = await db.execute(stmt)
        return list(result.scalars().all())

class IdempotencyRepository:
    async def get(self, db: AsyncSession, idempotency_key: str) -> Optional[IdempotencyKey]:
        stmt = select(IdempotencyKey).where(IdempotencyKey.idempotency_key == idempotency_key)
        result = await db.execute(stmt)
        return result.scalars().first()

    async def save(
        self,
        db: AsyncSession,
        idempotency_key: str,
        user_id: str,
        request_path: str,
        request_hash: str,
        response_code: int,
        response_body: Any,
        expires_at: datetime
    ) -> IdempotencyKey:
        record = IdempotencyKey(
            idempotency_key=idempotency_key,
            user_id=user_id,
            request_path=request_path,
            request_hash=request_hash,
            response_code=response_code,
            response_body=response_body,
            expires_at=expires_at
        )
        db.add(record)
        await db.flush()
        return record

audit_repo = AuditRepository()
idempotency_repo = IdempotencyRepository()
