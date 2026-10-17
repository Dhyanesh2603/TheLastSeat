from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as aioredis

from app.core.database import get_db
from app.core.redis_client import get_redis
from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.waiting_queue import QueueJoinRequest, QueueStatusResponse, QueueItemResponse
from app.services.queue_service import queue_service

router = APIRouter(prefix="/queue", tags=["Waiting Queue"])

@router.post("/join", response_model=QueueStatusResponse)
async def join_waiting_queue(
    payload: QueueJoinRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis_client: aioredis.Redis = Depends(get_redis)
):
    await queue_service.join_queue(
        db=db,
        redis_client=redis_client,
        user_id=current_user.id,
        seat_id=payload.seat_id
    )
    status_info = await queue_service.get_user_status(db, redis_client, current_user.id)
    return QueueStatusResponse(
        is_in_queue=status_info["is_in_queue"],
        position=status_info["position"],
        total_in_queue=status_info["total_in_queue"],
        queue_item=QueueItemResponse.model_validate(status_info["queue_item"]) if status_info["queue_item"] else None,
        opportunity_seat_id=status_info.get("opportunity_seat_id"),
        message=status_info["message"]
    )

@router.get("/status", response_model=QueueStatusResponse)
async def get_queue_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis_client: aioredis.Redis = Depends(get_redis)
):
    status_info = await queue_service.get_user_status(db, redis_client, current_user.id)
    return QueueStatusResponse(
        is_in_queue=status_info["is_in_queue"],
        position=status_info["position"],
        total_in_queue=status_info["total_in_queue"],
        queue_item=QueueItemResponse.model_validate(status_info["queue_item"]) if status_info["queue_item"] else None,
        opportunity_seat_id=status_info.get("opportunity_seat_id"),
        message=status_info["message"]
    )
