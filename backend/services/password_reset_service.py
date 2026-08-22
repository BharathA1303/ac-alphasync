"""
Password reset service — one-time token lifecycle for direct-auth users.

Only users with a password_hash (auth_provider == "direct") can reset a
password this way — Firebase/Google users have no password to reset.
"""

import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.password_reset_token import PasswordResetToken
from models.user import User

TOKEN_TTL_MINUTES = 30


def _utcnow():
    return datetime.now(timezone.utc)


def _as_aware_utc(value):
    """SQLite stores DateTime(timezone=True) values as naive — treat naive as UTC."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def generate_token() -> str:
    return secrets.token_urlsafe(32)


async def create_reset_token(db: AsyncSession, user: User) -> str:
    """Create a fresh reset token for the user, invalidating any prior unused ones."""
    existing = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
        )
    )
    for stale in existing.scalars().all():
        stale.used_at = _utcnow()

    record = PasswordResetToken(
        id=uuid.uuid4(),
        token=generate_token(),
        user_id=user.id,
        expires_at=_utcnow() + timedelta(minutes=TOKEN_TTL_MINUTES),
    )
    db.add(record)
    await db.flush()
    return record.token


async def _get_token_record(db: AsyncSession, token: str) -> Optional[PasswordResetToken]:
    token = (token or "").strip()
    if not token:
        return None
    result = await db.execute(
        select(PasswordResetToken).where(PasswordResetToken.token == token)
    )
    return result.scalar_one_or_none()


async def validate_reset_token(db: AsyncSession, token: str) -> dict:
    record = await _get_token_record(db, token)
    if not record:
        return {"valid": False, "reason": "Reset link is invalid"}
    if record.used_at is not None:
        return {"valid": False, "reason": "Reset link has already been used"}
    if _as_aware_utc(record.expires_at) < _utcnow():
        return {"valid": False, "reason": "Reset link has expired"}

    return {"valid": True, "user_id": str(record.user_id)}


async def consume_reset_token(db: AsyncSession, token: str) -> dict:
    """Validate and mark the token used. Caller is responsible for updating the
    user's password_hash within the same transaction/commit."""
    validation = await validate_reset_token(db, token)
    if not validation["valid"]:
        return validation

    record = await _get_token_record(db, token)
    record.used_at = _utcnow()

    return validation
