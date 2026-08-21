"""
Direct authentication routes — no Firebase, no external JWT library required.

Uses only Python standard library for password hashing (PBKDF2-HMAC-SHA256)
and JWT signing (HMAC-SHA256) so no new pip packages are needed.

Endpoints:
    POST /api/auth/register-direct  — username + password registration
    POST /api/auth/login-direct     — username + password login
"""

import logging
import hmac
import hashlib
import base64
import json
import os
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from database.connection import get_db
from models.user import User
from models.portfolio import Portfolio
from config.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["DirectAuth"])

_AUTO_APPROVAL_DURATION_DAYS = 30

# ── Password helpers (PBKDF2-HMAC-SHA256 via stdlib) ─────────────────────────


def _hash_password(password: str) -> str:
    """Hash password with PBKDF2-HMAC-SHA256 + random salt. Returns 'salt$hash'."""
    salt = base64.b64encode(os.urandom(16)).decode()
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 260000)
    return f"{salt}${base64.b64encode(dk).decode()}"


def _verify_password(plain: str, stored: str) -> bool:
    """Verify plain-text password against stored 'salt$hash'."""
    try:
        salt, hashed = stored.split("$", 1)
        dk = hashlib.pbkdf2_hmac("sha256", plain.encode(), salt.encode(), 260000)
        return hmac.compare_digest(base64.b64encode(dk).decode(), hashed)
    except Exception:
        return False


# ── JWT helpers (HMAC-SHA256 via stdlib) ─────────────────────────────────────


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(s: str) -> bytes:
    padding = "=" * (4 - len(s) % 4)
    return base64.urlsafe_b64decode(s + padding)


def _create_jwt(user_id: str) -> str:
    """Create a signed JWT (HS256) using Python stdlib only."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    header = _b64url_encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = _b64url_encode(
        json.dumps({"sub": user_id, "exp": int(expire.timestamp())}).encode()
    )
    signing_input = f"{header}.{payload}"
    sig = hmac.new(
        settings.JWT_SECRET_KEY.encode(),
        signing_input.encode(),
        hashlib.sha256,
    ).digest()
    return f"{signing_input}.{_b64url_encode(sig)}"


def decode_direct_jwt(token: str) -> Optional[str]:
    """
    Decode and verify a direct JWT. Returns user_id (sub) or None if invalid.
    Called by get_current_user in auth.py.
    """
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header_b64, payload_b64, sig_b64 = parts
        # Verify signature
        signing_input = f"{header_b64}.{payload_b64}"
        expected_sig = hmac.new(
            settings.JWT_SECRET_KEY.encode(),
            signing_input.encode(),
            hashlib.sha256,
        ).digest()
        if not hmac.compare_digest(_b64url_decode(sig_b64), expected_sig):
            return None
        # Decode payload
        payload = json.loads(_b64url_decode(payload_b64))
        # Check expiry
        exp = payload.get("exp", 0)
        if datetime.now(timezone.utc).timestamp() > exp:
            return None
        return payload.get("sub")
    except Exception:
        return None


# ── User serializer ───────────────────────────────────────────────────────────


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


# ── Schemas ───────────────────────────────────────────────────────────────────


class DirectRegisterRequest(BaseModel):
    username: str
    password: str
    full_name: Optional[str] = None
    email: Optional[str] = None
    group_token: Optional[str] = None


class DirectLoginRequest(BaseModel):
    username: str
    password: str


# ── Routes ────────────────────────────────────────────────────────────────────


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
    existing = await db.execute(
        select(User).where(func.lower(User.username) == username)
    )
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

    result = await db.execute(
        select(User).where(func.lower(User.username) == username)
    )
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
