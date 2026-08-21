"""
Invite link service — institution/faculty/student invite token lifecycle.

Tokens are created by Super Admin (target_role="institution_admin") or by an
Institution Admin (target_role="faculty"/"student", scoped to their own
institution). Consuming a valid token instantly assigns the target role and
institution — no manual approval step.
"""

import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.institution import Institution
from models.invite_link import InviteLink
from models.user import User

VALID_TARGET_ROLES = {"institution_admin", "faculty", "student"}


def _utcnow():
    return datetime.now(timezone.utc)


def _as_uuid(value) -> Optional[uuid.UUID]:
    """Coerce a client-supplied id (str or UUID) into a uuid.UUID, or None if invalid."""
    if isinstance(value, uuid.UUID):
        return value
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None


def _as_aware_utc(value):
    """SQLite stores DateTime(timezone=True) values as naive — treat naive as UTC."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def generate_token() -> str:
    return secrets.token_urlsafe(32)


async def create_invite_link(
    db: AsyncSession,
    institution_id,
    target_role: str,
    created_by_user_id,
    expires_in_hours: int,
    max_uses: int = 0,
) -> dict:
    if target_role not in VALID_TARGET_ROLES:
        return {"success": False, "error": "Invalid target role"}

    institution_uuid = _as_uuid(institution_id)
    if not institution_uuid:
        return {"success": False, "error": "Institution not found"}

    institution = await db.get(Institution, institution_uuid)
    if not institution:
        return {"success": False, "error": "Institution not found"}

    link = InviteLink(
        token=generate_token(),
        institution_id=institution_uuid,
        target_role=target_role,
        created_by_user_id=created_by_user_id,
        max_uses=max_uses or 0,
        expires_at=_utcnow() + timedelta(hours=expires_in_hours),
    )
    db.add(link)
    await db.flush()
    await db.refresh(link)

    return {
        "success": True,
        "invite_link": _serialize_link(link, institution.name),
    }


def _serialize_link(link: InviteLink, institution_name: Optional[str] = None) -> dict:
    return {
        "id": str(link.id),
        "token": link.token,
        "institution_id": str(link.institution_id),
        "institution_name": institution_name,
        "target_role": link.target_role,
        "max_uses": link.max_uses,
        "use_count": link.use_count,
        "expires_at": link.expires_at.isoformat() if link.expires_at else None,
        "is_active": link.is_active,
        "created_at": link.created_at.isoformat() if link.created_at else None,
    }


async def list_active_invite_links(
    db: AsyncSession,
    institution_id,
    target_role: Optional[str] = None,
) -> list[dict]:
    """Active (not expired, not deactivated, not exhausted) links for an institution.

    Expired/deactivated/exhausted links are simply omitted — they "disappear"
    once no longer usable, matching the invite-link lifecycle end to end.
    """
    institution_uuid = _as_uuid(institution_id)
    if not institution_uuid:
        return []

    filters = [
        InviteLink.institution_id == institution_uuid,
        InviteLink.is_active == True,  # noqa: E712
        InviteLink.expires_at > _utcnow(),
    ]
    if target_role:
        filters.append(InviteLink.target_role == target_role)

    result = await db.execute(
        select(InviteLink).where(*filters).order_by(InviteLink.created_at.desc())
    )
    links = result.scalars().all()

    active = []
    for link in links:
        if link.max_uses and link.use_count >= link.max_uses:
            continue
        active.append(_serialize_link(link))
    return active


async def _get_link_by_token(db: AsyncSession, token: str) -> Optional[InviteLink]:
    token = (token or "").strip()
    if not token:
        return None
    result = await db.execute(select(InviteLink).where(InviteLink.token == token))
    return result.scalar_one_or_none()


async def validate_invite_token(db: AsyncSession, token: str) -> dict:
    link = await _get_link_by_token(db, token)
    if not link:
        return {"valid": False, "reason": "Invite link not found"}
    if not link.is_active:
        return {"valid": False, "reason": "Invite link has been deactivated"}
    if link.expires_at and _as_aware_utc(link.expires_at) < _utcnow():
        return {"valid": False, "reason": "Invite link has expired"}
    if link.max_uses and link.use_count >= link.max_uses:
        return {"valid": False, "reason": "Invite link has reached its usage limit"}

    institution = await db.get(Institution, link.institution_id)
    if not institution or institution.status != "active":
        return {"valid": False, "reason": "Institution is not active"}

    return {
        "valid": True,
        "institution_id": str(institution.id),
        "institution_name": institution.name,
        "target_role": link.target_role,
    }


async def consume_invite_token(db: AsyncSession, token: str, user: User) -> dict:
    validation = await validate_invite_token(db, token)
    if not validation["valid"]:
        return validation

    link = await _get_link_by_token(db, token)

    user.role = link.target_role
    user.institution_id = link.institution_id
    user.invited_via_token = link.token
    user.account_status = "active"
    user.approved_at = _utcnow()
    user.access_expires_at = None
    user.access_duration_days = None

    link.use_count = (link.use_count or 0) + 1

    return validation
