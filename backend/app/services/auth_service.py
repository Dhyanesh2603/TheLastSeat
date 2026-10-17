import logging
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status
from app.models.user import User, UserRole
from app.models.base import utc_now
from app.schemas.user import UserRegisterRequest
from app.core.security import hash_password, verify_password, create_access_token
from app.repositories.audit_repository import audit_repo

logger = logging.getLogger("concert_booking.service.auth")

class AuthService:
    async def get_by_email(self, db: AsyncSession, email: str) -> Optional[User]:
        result = await db.execute(select(User).where(User.email == email))
        return result.scalars().first()

    async def get_by_id(self, db: AsyncSession, user_id: str) -> Optional[User]:
        result = await db.execute(select(User).where(User.id == user_id))
        return result.scalars().first()

    async def register_user(self, db: AsyncSession, req: UserRegisterRequest, ip_address: Optional[str] = None) -> User:
        existing = await self.get_by_email(db, req.email)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A user with this email address already exists."
            )
        
        user = User(
            email=req.email.lower().strip(),
            hashed_password=hash_password(req.password),
            full_name=req.full_name.strip(),
            role=req.role,
            is_active=True
        )
        db.add(user)
        await db.flush()

        await audit_repo.log(
            db,
            action="USER_REGISTER",
            entity_type="User",
            entity_id=user.id,
            user_id=user.id,
            metadata_json={"email": user.email, "role": user.role.value},
            ip_address=ip_address
        )
        await db.commit()
        return user

    async def authenticate_user(self, db: AsyncSession, email: str, password: str, ip_address: Optional[str] = None) -> tuple[User, str]:
        user = await self.get_by_email(db, email.lower().strip())
        if not user or not verify_password(password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password."
            )
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is inactive."
            )

        token = create_access_token(data={
            "sub": user.id,
            "email": user.email,
            "role": user.role.value
        })

        await audit_repo.log(
            db,
            action="USER_LOGIN",
            entity_type="User",
            entity_id=user.id,
            user_id=user.id,
            metadata_json={"email": user.email},
            ip_address=ip_address
        )
        await db.commit()
        return user, token

    async def seed_default_users_if_empty(self, db: AsyncSession):
        """Seed default admin and test student accounts if not already present."""
        admin_email = "admin@college.edu"
        admin = await self.get_by_email(db, admin_email)
        if not admin:
            admin_user = User(
                email=admin_email,
                hashed_password=hash_password("AdminPass123!"),
                full_name="Concert Admin",
                role=UserRole.ADMIN,
                is_active=True
            )
            db.add(admin_user)
            logger.info("Default admin user seeded (admin@college.edu / AdminPass123!)")

        student_email = "student@college.edu"
        student = await self.get_by_email(db, student_email)
        if not student:
            student_user = User(
                email=student_email,
                hashed_password=hash_password("StudentPass123!"),
                full_name="Alex Student",
                role=UserRole.STUDENT,
                is_active=True
            )
            db.add(student_user)
            logger.info("Default student user seeded (student@college.edu / StudentPass123!)")

        await db.commit()

auth_service = AuthService()
