"""
Direct authentication routes — no Firebase required.

Provides username+password register and login that stores users in the
same `users` table and issues a signed JWT that the existing
`get_current_user` dependency can also verify.
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from jose import jwt, JWTError
from passlib.context import CryptContext

from database.connection import get_db
from models.user import User
from models.portfolio import Portfolio
from config.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["DirectAuth"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

_AUTO_APPROVAL_DURATION_DAYS = 30


# ── Helpers ───────────────────────────────────────────────────────────────


def _hash_password(password: str) -> str:
    return pwd_context.hash(password)


def _verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def _create_jwt(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload = {"sub": user_id, "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def _decode_jwt(token: str) -> Optional[str]:
    """Return user_id (sub) from a valid JWT, else None."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None


def _serialize_user(user: User) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "username": user.username,
        "full_name": user.full_name,
        "phone": user.phone,
        "role": user.role,
        "avatar_url": user.avatar_url,
        "is_active": user.is_active,
        "is_verified": user.is_verified,
        "account_status": user.account_status,
        "access_expires_at": user.access_expires_at.isoformat() if user.access_expires_at else None,
        "access_duration_days": user.access_duration_days,
        "virtual_capital": float(user.virtual_capital or 0),
        "auth_provider": user.auth_provider,
        "admin_level": user.admin_level,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


# ── Schemas ───────────────────────────────────────────────────────────────


class DirectRegisterRequest(BaseModel):
    username: str
    password: str
    full_name: Optional[str] = None
    email: Optional[str] = None
    group_token: Optional[str] = None


class DirectLoginRequest(BaseModel):
    username: str
    password: str


# ── Routes ────────────────────────────────────────────────────────────────


@router.post("/register-direct")
async def register_direct(
    req: DirectRegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    """Register a new user with username + password (no Firebase)."""
    username = req.username.strip().lower()
    if not username:
        raise HTTPException(status_code=400, detail="Username is required")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    # Check username uniqueness
    existing = await db.execute(select(User).where(func.lower(User.username) == username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username already taken")

    # Check if first user (becomes root admin)
    count_res = await db.execute(select(func.count(User.id)))
    total_users = count_res.scalar() or 0
    is_first_user = total_users == 0

    # Build synthetic email if none provided
    email = (req.email or "").strip() or f"{username}@ac.alphasync.app"

    # Check email uniqueness
    existing_email = await db.execute(select(User).where(User.email == email))
    if existing_email.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    full_name = (req.full_name or username).strip()

    user = User(
        email=email,
        username=username,
        full_name=full_name,
        password_hash=_hash_password(req.password),
        auth_provider="direct",
        is_verified=True,
        is_active=True,
        virtual_capital=settings.DEFAULT_VIRTUAL_CAPITAL,
        role="admin" if is_first_user else "user",
        admin_level="root" if is_first_user else None,
        account_status="active" if is_first_user else "pending_approval",
        approved_at=datetime.now(timezone.utc) if is_first_user else None,
        access_duration_days=None if is_first_user else _AUTO_APPROVAL_DURATION_DAYS,
        access_expires_at=(
            None if is_first_user
            else datetime.now(timezone.utc) + timedelta(days=_AUTO_APPROVAL_DURATION_DAYS)
        ),
    )
    db.add(user)
    await db.flush()

    portfolio = Portfolio(
        user_id=user.id,
        available_capital=settings.DEFAULT_VIRTUAL_CAPITAL,
    )
    db.add(portfolio)
    await db.commit()
    await db.refresh(user)

    token = _create_jwt(str(user.id))
    logger.info("Direct register: %s (first_user=%s)", username, is_first_user)
    return {
        "token": token,
        "is_new_user": True,
        "user": _serialize_user(user),
    }


@router.post("/login-direct")
async def login_direct(
    req: DirectLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Login with username + password (no Firebase)."""
    username = req.username.strip().lower()
    if not username:
        raise HTTPException(status_code=400, detail="Username is required")

    result = await db.execute(select(User).where(func.lower(User.username) == username))
    user = result.scalar_one_or_none()

    if not user or not user.password_hash:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if not _verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is inactive")

    token = _create_jwt(str(user.id))
    logger.info("Direct login: %s", username)
    return {
        "token": token,
        "is_new_user": False,
        "user": _serialize_user(user),
    }
