"""
Institution Admin Workspace API — scoped strictly to the caller's own institution.

All queries filter by admin.institution_id server-side; institution_id is
never accepted from the client for these routes, so Institution Admin A can
never see Institution B's members or stats.
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from database.connection import get_db
from models.user import User, UserSession
from models.portfolio import Portfolio, Transaction
from models.order import Order
from models.course import (
    Course, Lesson, Assessment, AssessmentAttempt, LessonProgress, AssessmentRetakeGrant,
)
from dependencies.institution import require_institution_admin
from services import invite_service
from services.invite_service import _as_uuid

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/institution", tags=["InstitutionAdmin"])

_EXPIRY_HOURS = {"24h": 24, "7d": 24 * 7, "30d": 24 * 30}


class CreateMemberInviteRequest(BaseModel):
    target_role: str  # "faculty" | "student"
    expiry: str = "7d"
    max_uses: int = 0


class ReviewCourseRequest(BaseModel):
    review_note: Optional[str] = None


@router.get("/dashboard")
async def get_dashboard(
    admin: User = Depends(require_institution_admin),
    db: AsyncSession = Depends(get_db),
):
    inst_id = admin.institution_id

    counts_result = await db.execute(
        select(User.role, func.count(User.id))
        .where(User.institution_id == inst_id, User.role.in_(("faculty", "student")))
        .group_by(User.role)
    )
    counts = {role: count for role, count in counts_result.all()}

    pnl_result = await db.execute(
        select(func.coalesce(func.sum(Portfolio.total_pnl), 0))
        .join(User, User.id == Portfolio.user_id)
        .where(User.institution_id == inst_id, User.role.in_(("faculty", "student")))
    )
    total_pnl = float(pnl_result.scalar() or 0)

    top_student_result = await db.execute(
        select(User.id, User.full_name, User.username, Portfolio.total_pnl)
        .join(Portfolio, Portfolio.user_id == User.id)
        .where(User.institution_id == inst_id, User.role == "student")
        .order_by(Portfolio.total_pnl.desc())
        .limit(1)
    )
    top_row = top_student_result.first()
    top_student = (
        {
            "id": str(top_row[0]),
            "full_name": top_row[1],
            "username": top_row[2],
            "pnl": float(top_row[3] or 0),
        }
        if top_row
        else None
    )

    return {
        "institution_id": str(inst_id),
        "total_students": counts.get("student", 0),
        "total_faculty": counts.get("faculty", 0),
        "total_pnl": round(total_pnl, 2),
        "top_student": top_student,
    }


@router.post("/invite-link")
async def create_member_invite(
    req: CreateMemberInviteRequest,
    admin: User = Depends(require_institution_admin),
    db: AsyncSession = Depends(get_db),
):
    if req.target_role not in ("faculty", "student"):
        raise HTTPException(status_code=400, detail="target_role must be 'faculty' or 'student'")

    expires_in_hours = _EXPIRY_HOURS.get(req.expiry, _EXPIRY_HOURS["7d"])
    result = await invite_service.create_invite_link(
        db,
        institution_id=admin.institution_id,  # forced server-side
        target_role=req.target_role,
        created_by_user_id=admin.id,
        expires_in_hours=expires_in_hours,
        max_uses=req.max_uses,
    )
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    await db.commit()
    return result


@router.get("/invite-links")
async def list_member_invites(
    role: Optional[str] = Query(None),
    admin: User = Depends(require_institution_admin),
    db: AsyncSession = Depends(get_db),
):
    if role and role not in ("faculty", "student"):
        raise HTTPException(status_code=400, detail="Invalid role filter")
    if role:
        links = await invite_service.list_active_invite_links(
            db, admin.institution_id, target_role=role
        )
    else:
        # Institution admins only ever manage faculty/student links —
        # institution_admin links are Super-Admin-only and must never leak here.
        student_links = await invite_service.list_active_invite_links(
            db, admin.institution_id, target_role="student"
        )
        faculty_links = await invite_service.list_active_invite_links(
            db, admin.institution_id, target_role="faculty"
        )
        links = sorted(student_links + faculty_links, key=lambda l: l["created_at"] or "", reverse=True)
    return {"invite_links": links}


@router.delete("/invite-links/{link_id}")
async def delete_member_invite(
    link_id: str,
    admin: User = Depends(require_institution_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await invite_service.revoke_invite_link(
        db, link_id, admin.institution_id, allowed_roles={"faculty", "student"}
    )
    if not result["success"]:
        raise HTTPException(status_code=404, detail=result["error"])
    await db.commit()
    return {"success": True}


@router.get("/members")
async def list_members(
    role: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = 1,
    page_size: int = 25,
    admin: User = Depends(require_institution_admin),
    db: AsyncSession = Depends(get_db),
):
    filters = [User.institution_id == admin.institution_id, User.role.in_(("faculty", "student"))]
    if role:
        if role not in ("faculty", "student"):
            raise HTTPException(status_code=400, detail="Invalid role filter")
        filters.append(User.role == role)
    if search:
        like = f"%{search.strip()}%"
        filters.append(or_(User.full_name.ilike(like), User.email.ilike(like), User.username.ilike(like)))

    count_result = await db.execute(select(func.count(User.id)).where(*filters))
    total = count_result.scalar() or 0

    page = max(page, 1)
    page_size = max(min(page_size, 100), 1)
    result = await db.execute(
        select(User, Portfolio)
        .outerjoin(Portfolio, Portfolio.user_id == User.id)
        .where(*filters)
        .order_by(User.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = result.all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "members": [
            {
                "id": str(u.id),
                "full_name": u.full_name,
                "email": u.email,
                "username": u.username,
                "role": u.role,
                "pnl": float(p.total_pnl) if p else 0.0,
                "pnl_percent": float(p.total_pnl_percent) if p else 0.0,
                "current_value": float(p.current_value) if p else 0.0,
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u, p in rows
        ],
    }


ONLINE_THRESHOLD_MINUTES = 5


class GrantRetakeRequest(BaseModel):
    assessment_id: str


async def _get_own_member(db: AsyncSession, admin: User, member_id: str) -> User:
    member_uuid = _as_uuid(member_id)
    member = await db.get(User, member_uuid) if member_uuid else None
    if not member or member.institution_id != admin.institution_id or member.role not in ("student", "faculty"):
        raise HTTPException(status_code=404, detail="Member not found in your institution")
    return member


@router.get("/student-stats/{student_id}")
async def get_student_stats(
    student_id: str,
    admin: User = Depends(require_institution_admin),
    db: AsyncSession = Depends(get_db),
):
    student = await _get_own_member(db, admin, student_id)

    portfolio_result = await db.execute(select(Portfolio).where(Portfolio.user_id == student.id))
    portfolio = portfolio_result.scalar_one_or_none()

    trade_count_result = await db.execute(
        select(func.count(Order.id)).where(Order.user_id == student.id, Order.status == "FILLED")
    )
    trade_count = trade_count_result.scalar() or 0

    recent_tx_result = await db.execute(
        select(Transaction)
        .where(Transaction.user_id == student.id)
        .order_by(Transaction.created_at.desc())
        .limit(50)
    )
    recent_transactions = recent_tx_result.scalars().all()

    recent_orders_result = await db.execute(
        select(Order)
        .where(Order.user_id == student.id)
        .order_by(Order.created_at.desc())
        .limit(50)
    )
    recent_orders = recent_orders_result.scalars().all()

    last_session_result = await db.execute(
        select(UserSession)
        .where(UserSession.user_id == student.id)
        .order_by(UserSession.last_seen_at.desc())
        .limit(1)
    )
    last_session = last_session_result.scalar_one_or_none()
    is_online = bool(
        last_session
        and last_session.last_seen_at
        and (datetime.now(timezone.utc) - last_session.last_seen_at) < timedelta(minutes=ONLINE_THRESHOLD_MINUTES)
    )

    lessons_completed_result = await db.execute(
        select(func.count(LessonProgress.id)).where(LessonProgress.user_id == student.id)
    )
    lessons_completed = lessons_completed_result.scalar() or 0

    attempts_result = await db.execute(
        select(AssessmentAttempt, Assessment.title, Course.title)
        .join(Assessment, Assessment.id == AssessmentAttempt.assessment_id)
        .join(Course, Course.id == AssessmentAttempt.course_id)
        .where(AssessmentAttempt.user_id == student.id)
        .order_by(AssessmentAttempt.started_at.desc())
    )
    attempts = attempts_result.all()

    return {
        "student": {
            "id": str(student.id),
            "full_name": student.full_name,
            "email": student.email,
            "username": student.username,
            "role": student.role,
            "created_at": student.created_at.isoformat() if student.created_at else None,
        },
        "online": {
            "is_online": is_online,
            "last_seen_at": last_session.last_seen_at.isoformat() if last_session and last_session.last_seen_at else None,
            "ip_address": last_session.ip_address if last_session else None,
        },
        "portfolio": {
            "current_value": float(portfolio.current_value) if portfolio else 0.0,
            "total_invested": float(portfolio.total_invested) if portfolio else 0.0,
            "available_capital": float(portfolio.available_capital) if portfolio else 0.0,
            "total_pnl": float(portfolio.total_pnl) if portfolio else 0.0,
            "total_pnl_percent": float(portfolio.total_pnl_percent) if portfolio else 0.0,
        },
        "trade_count": trade_count,
        "recent_transactions": [
            {
                "symbol": tx.symbol,
                "type": tx.transaction_type,
                "quantity": tx.quantity,
                "price": float(tx.price),
                "total_value": float(tx.total_value),
                "created_at": tx.created_at.isoformat() if tx.created_at else None,
            }
            for tx in recent_transactions
        ],
        "recent_orders": [
            {
                "symbol": o.symbol,
                "side": o.side,
                "order_type": o.order_type,
                "quantity": o.quantity,
                "price": float(o.price) if o.price is not None else None,
                "status": o.status,
                "created_at": o.created_at.isoformat() if o.created_at else None,
            }
            for o in recent_orders
        ],
        "academy": {
            "lessons_completed": lessons_completed,
            "assessment_attempts": [
                {
                    "id": str(attempt.id),
                    "assessment_id": str(attempt.assessment_id),
                    "assessment_title": assessment_title,
                    "course_title": course_title,
                    "score_percent": attempt.score_percent,
                    "passed": attempt.passed,
                    "flagged": attempt.flagged,
                    "flag_reason": attempt.flag_reason,
                    "started_at": attempt.started_at.isoformat() if attempt.started_at else None,
                }
                for attempt, assessment_title, course_title in attempts
            ],
        },
    }


@router.post("/members/{member_id}/grant-retake")
async def grant_assessment_retake(
    member_id: str,
    req: GrantRetakeRequest,
    admin: User = Depends(require_institution_admin),
    db: AsyncSession = Depends(get_db),
):
    member = await _get_own_member(db, admin, member_id)

    assessment_uuid = _as_uuid(req.assessment_id)
    assessment = await db.get(Assessment, assessment_uuid) if assessment_uuid else None
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    course = await db.get(Course, assessment.course_id)
    if not course or course.institution_id != admin.institution_id:
        raise HTTPException(status_code=404, detail="Assessment not found in your institution")

    existing_result = await db.execute(
        select(AssessmentRetakeGrant).where(
            AssessmentRetakeGrant.user_id == member.id,
            AssessmentRetakeGrant.assessment_id == assessment.id,
            AssessmentRetakeGrant.consumed.is_(False),
        )
    )
    if existing_result.scalars().first():
        raise HTTPException(status_code=400, detail="A retake has already been granted and not yet used")

    db.add(AssessmentRetakeGrant(user_id=member.id, assessment_id=assessment.id, granted_by_user_id=admin.id))
    await db.commit()
    return {"success": True}


@router.delete("/members/{member_id}")
async def remove_member(
    member_id: str,
    admin: User = Depends(require_institution_admin),
    db: AsyncSession = Depends(get_db),
):
    member = await _get_own_member(db, admin, member_id)
    member.institution_id = None
    if member.role in ("student", "faculty"):
        member.role = "user"
    await db.commit()
    return {"success": True}


# ── Course approval — faculty-uploaded subjects for this institution only ──

def _course_out(course: Course, lesson_count: int = 0, assessment_count: int = 0, author_name: str = None) -> dict:
    return {
        "id": str(course.id),
        "title": course.title,
        "description": course.description,
        "status": course.status,
        "review_note": course.review_note,
        "author_name": author_name,
        "lesson_count": lesson_count,
        "assessment_count": assessment_count,
        "created_at": course.created_at.isoformat() if course.created_at else None,
        "reviewed_at": course.reviewed_at.isoformat() if course.reviewed_at else None,
    }


async def _get_institution_course(db: AsyncSession, admin: User, course_id: str) -> Course:
    course_uuid = _as_uuid(course_id)
    course = await db.get(Course, course_uuid) if course_uuid else None
    if not course or course.institution_id != admin.institution_id:
        raise HTTPException(status_code=404, detail="Course not found in your institution")
    return course


@router.get("/courses")
async def list_institution_courses(
    status: Optional[str] = Query(None),
    admin: User = Depends(require_institution_admin),
    db: AsyncSession = Depends(get_db),
):
    filters = [Course.institution_id == admin.institution_id]
    if status:
        if status not in ("pending", "approved", "rejected"):
            raise HTTPException(status_code=400, detail="Invalid status filter")
        filters.append(Course.status == status)

    result = await db.execute(
        select(Course, User.full_name)
        .join(User, User.id == Course.created_by_user_id)
        .where(*filters)
        .order_by(Course.created_at.desc())
    )
    rows = result.all()
    if not rows:
        return {"courses": []}

    course_ids = [c.id for c, _ in rows]
    lesson_counts = dict((await db.execute(
        select(Lesson.course_id, func.count(Lesson.id)).where(Lesson.course_id.in_(course_ids)).group_by(Lesson.course_id)
    )).all())
    assessment_counts = dict((await db.execute(
        select(Assessment.course_id, func.count(Assessment.id)).where(Assessment.course_id.in_(course_ids)).group_by(Assessment.course_id)
    )).all())

    return {
        "courses": [
            _course_out(c, lesson_counts.get(c.id, 0), assessment_counts.get(c.id, 0), author_name)
            for c, author_name in rows
        ]
    }


@router.post("/courses/{course_id}/approve")
async def approve_course(
    course_id: str,
    req: ReviewCourseRequest,
    admin: User = Depends(require_institution_admin),
    db: AsyncSession = Depends(get_db),
):
    course = await _get_institution_course(db, admin, course_id)
    course.status = "approved"
    course.review_note = req.review_note
    course.reviewed_by_user_id = admin.id
    course.reviewed_at = func.now()
    await db.commit()
    await db.refresh(course)
    return _course_out(course)


@router.post("/courses/{course_id}/reject")
async def reject_course(
    course_id: str,
    req: ReviewCourseRequest,
    admin: User = Depends(require_institution_admin),
    db: AsyncSession = Depends(get_db),
):
    course = await _get_institution_course(db, admin, course_id)
    course.status = "rejected"
    course.review_note = req.review_note
    course.reviewed_by_user_id = admin.id
    course.reviewed_at = func.now()
    await db.commit()
    await db.refresh(course)
    return _course_out(course)


@router.delete("/courses/{course_id}")
async def delete_institution_course(
    course_id: str,
    admin: User = Depends(require_institution_admin),
    db: AsyncSession = Depends(get_db),
):
    course = await _get_institution_course(db, admin, course_id)
    await db.delete(course)
    await db.commit()
    return {"success": True}
