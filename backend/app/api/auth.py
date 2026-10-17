from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.schemas.user import UserRegisterRequest, UserLoginRequest, TokenResponse, UserResponse
from app.services.auth_service import auth_service
from app.core.dependencies import get_current_user
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/register", response_model=UserResponse, status_code=201)
async def register(
    req: UserRegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    ip_addr = request.client.host if request.client else None
    user = await auth_service.register_user(db, req, ip_address=ip_addr)
    return user

@router.post("/login", response_model=TokenResponse)
async def login(
    req: UserLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    ip_addr = request.client.host if request.client else None
    user, token = await auth_service.authenticate_user(db, req.email, req.password, ip_address=ip_addr)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user)
    )

@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user)
):
    return current_user
