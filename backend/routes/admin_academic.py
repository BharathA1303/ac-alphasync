"""
Super Admin Academic Management API — institutions & institution_admin invite links.

All endpoints under /api/admin/academic/*, guarded by role='admin' (same
guard as the rest of /api/admin/*).
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from database.connection import get_db
from models.user import User
from models.institution import Institution
from models.invite_link import InviteLink
from dependencies.admin import get_admin_user
from services import invite_service
from services.invite_service import _as_uuid

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/academic", tags=["AdminAcademic"])

ACADEMIC_ROLES = ("institution_admin", "faculty", "student")
_EXPIRY_HOURS = {"24h": 24, "7d": 24 * 7, "30d": 24 * 30}


class CreateInstitutionRequest(BaseModel):
    name: str
    code: str
    email_domain: Optional[str] = None


class UpdateInstitutionRequest(BaseModel):
    name: Optional[str] = None
    email_domain: Optional[str] = None
    status: Optional[str] = None


class CreateInviteLinkRequest(BaseModel):
    institution_id: str
    expiry: str = "7d"  # "24h" | "7d" | "30d"
    max_uses: int = 0


@router.get("/institutions")
async def list_institutions(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Institution).order_by(Institution.created_at.desc()))
    institutions = result.scalars().all()
    if not institutions:
        return {"institutions": []}

    inst_ids = [inst.id for inst in institutions]
    counts_result = await db.execute(
        select(User.institution_id, User.role, func.count(User.id))
        .where(User.institution_id.in_(inst_ids))
        .group_by(User.institution_id, User.role)
    )
    counts: dict = {}
    for inst_id, role, count in counts_result.all():
        bucket = counts.setdefault(str(inst_id), {"institution_admin": 0, "faculty": 0, "student": 0})
        if role in bucket:
            bucket[role] = count

    return {
        "institutions": [
            {
                "id": str(inst.id),
                "name": inst.name,
                "code": inst.code,
                "email_domain": inst.email_domain,
                "status": inst.status,
                "created_at": inst.created_at.isoformat() if inst.created_at else None,
                "admin_count": counts.get(str(inst.id), {}).get("institution_admin", 0),
                "faculty_count": counts.get(str(inst.id), {}).get("faculty", 0),
                "student_count": counts.get(str(inst.id), {}).get("student", 0),
            }
            for inst in institutions
        ]
    }


@router.get("/institutions/{institution_id}")
async def get_institution(
    institution_id: str,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    institution_uuid = _as_uuid(institution_id)
    institution = await db.get(Institution, institution_uuid) if institution_uuid else None
    if not institution:
        raise HTTPException(status_code=404, detail="Institution not found")

    counts_result = await db.execute(
        select(User.role, func.count(User.id))
        .where(User.institution_id == institution.id)
        .group_by(User.role)
    )
    counts = {"institution_admin": 0, "faculty": 0, "student": 0}
    for role, count in counts_result.all():
        if role in counts:
            counts[role] = count

    return {
        "institution": {
            "id": str(institution.id),
            "name": institution.name,
            "code": institution.code,
            "email_domain": institution.email_domain,
            "status": institution.status,
            "created_at": institution.created_at.isoformat() if institution.created_at else None,
            "admin_count": counts["institution_admin"],
            "faculty_count": counts["faculty"],
            "student_count": counts["student"],
        }
    }


@router.post("/institutions")
async def create_institution(
    req: CreateInstitutionRequest,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    name = req.name.strip()
    code = req.code.strip().upper()
    if not name or not code:
        raise HTTPException(status_code=400, detail="Name and code are required")

    existing = await db.execute(
        select(Institution).where(
            or_(func.lower(Institution.name) == name.lower(), Institution.code == code)
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="An institution with this name or code already exists")

    institution = Institution(
        name=name,
        code=code,
        email_domain=(req.email_domain or "").strip() or None,
        created_by_user_id=admin.id,
    )
    db.add(institution)
    await db.commit()
    await db.refresh(institution)

    return {
        "success": True,
        "institution": {
            "id": str(institution.id),
            "name": institution.name,
            "code": institution.code,
            "email_domain": institution.email_domain,
            "status": institution.status,
            "created_at": institution.created_at.isoformat() if institution.created_at else None,
        },
    }


@router.patch("/institutions/{institution_id}")
async def update_institution(
    institution_id: str,
    req: UpdateInstitutionRequest,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    institution_uuid = _as_uuid(institution_id)
    institution = await db.get(Institution, institution_uuid) if institution_uuid else None
    if not institution:
        raise HTTPException(status_code=404, detail="Institution not found")

    if req.name is not None and req.name.strip():
        institution.name = req.name.strip()
    if req.email_domain is not None:
        institution.email_domain = req.email_domain.strip() or None
    if req.status is not None:
        if req.status not in ("active", "suspended"):
            raise HTTPException(status_code=400, detail="Invalid status")
        institution.status = req.status

    await db.commit()
    await db.refresh(institution)

    return {
        "success": True,
        "institution": {
            "id": str(institution.id),
            "name": institution.name,
            "code": institution.code,
            "email_domain": institution.email_domain,
            "status": institution.status,
        },
    }


@router.post("/invite-link")
async def create_institution_admin_invite(
    req: CreateInviteLinkRequest,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    expires_in_hours = _EXPIRY_HOURS.get(req.expiry, _EXPIRY_HOURS["7d"])
    result = await invite_service.create_invite_link(
        db,
        institution_id=req.institution_id,
        target_role="institution_admin",
        created_by_user_id=admin.id,
        expires_in_hours=expires_in_hours,
        max_uses=req.max_uses,
    )
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    await db.commit()
    return result


@router.get("/institutions/{institution_id}/invite-links")
async def list_institution_admin_invites(
    institution_id: str,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    links = await invite_service.list_active_invite_links(
        db, institution_id, target_role="institution_admin"
    )
    return {"invite_links": links}


@router.delete("/institutions/{institution_id}/invite-links/{link_id}")
async def delete_institution_admin_invite(
    institution_id: str,
    link_id: str,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await invite_service.revoke_invite_link(db, link_id, institution_id)
    if not result["success"]:
        raise HTTPException(status_code=404, detail=result["error"])
    await db.commit()
    return {"success": True}


@router.get("/users")
async def list_academic_users(
    institution_id: Optional[str] = None,
    role: Optional[str] = None,
    page: int = 1,
    page_size: int = 25,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    filters = [User.role.in_(ACADEMIC_ROLES)]
    if institution_id:
        institution_uuid = _as_uuid(institution_id)
        if not institution_uuid:
            raise HTTPException(status_code=400, detail="Invalid institution_id")
        filters.append(User.institution_id == institution_uuid)
    if role:
        if role not in ACADEMIC_ROLES:
            raise HTTPException(status_code=400, detail="Invalid role filter")
        filters.append(User.role == role)

    count_result = await db.execute(select(func.count(User.id)).where(*filters))
    total = count_result.scalar() or 0

    page = max(page, 1)
    page_size = max(min(page_size, 100), 1)
    result = await db.execute(
        select(User)
        .where(*filters)
        .order_by(User.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    users = result.scalars().all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "users": [
            {
                "id": str(u.id),
                "username": u.username,
                "email": u.email,
                "full_name": u.full_name,
                "role": u.role,
                "institution_id": str(u.institution_id) if u.institution_id else None,
                "account_status": u.account_status,
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u in users
        ],
    }
