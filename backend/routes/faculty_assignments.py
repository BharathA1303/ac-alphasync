"""
Faculty Order-Log Trading Assignments API.
Allows faculty to create, manage, track, and grade trade-based assignments.
Scoped strictly to the caller's own institution and authored assignments.
"""

import logging
import uuid
from typing import Optional, List, Any
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from database.connection import get_db
from models.user import User
from models.assignment import TradingAssignment, AssignmentSubmission
from models.course import Course
from dependencies.faculty import require_faculty
from services.assignment_evaluator import evaluate_student_assignment

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/faculty/assignments", tags=["Faculty Assignments"])


def _as_uuid(val: Any) -> Optional[uuid.UUID]:
    if val is None:
        return None
    if isinstance(val, uuid.UUID):
        return val
    try:
        return uuid.UUID(str(val))
    except (ValueError, TypeError):
        return None


def _iso(val: Any) -> Optional[str]:
    if val is None:
        return None
    if isinstance(val, str):
        return val
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)


# ── Pydantic Request Schemas ──────────────────────────────────────────

class CreateAssignmentRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    course_id: Optional[str] = None
    pass_score: int = Field(default=70, ge=0, le=100)
    start_date: Optional[datetime] = None
    due_date: Optional[datetime] = None

    target_asset_class: str = Field(default="EQUITY")  # EQUITY | FUTURES | OPTIONS | ANY
    target_symbols: Optional[List[str]] = Field(default_factory=list)
    min_trades: int = Field(default=1, ge=1, le=50)
    require_stop_loss: bool = True
    max_sl_percent: Optional[float] = Field(default=None, ge=0.1, le=100.0)
    require_take_profit: bool = False
    min_risk_reward_ratio: Optional[float] = Field(default=None, ge=0.5, le=20.0)
    allowed_sides: str = Field(default="BOTH")  # BUY | SELL | BOTH
    allowed_product_types: Optional[List[str]] = Field(default_factory=lambda: ["ALL"])
    rules_config: Optional[dict] = Field(default_factory=dict)


class UpdateAssignmentRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    status: Optional[str] = None  # active | draft | archived
    course_id: Optional[str] = None
    pass_score: Optional[int] = Field(default=None, ge=0, le=100)
    start_date: Optional[datetime] = None
    due_date: Optional[datetime] = None

    target_asset_class: Optional[str] = None
    target_symbols: Optional[List[str]] = None
    min_trades: Optional[int] = Field(default=None, ge=1, le=50)
    require_stop_loss: Optional[bool] = None
    max_sl_percent: Optional[float] = None
    require_take_profit: Optional[bool] = None
    min_risk_reward_ratio: Optional[float] = None
    allowed_sides: Optional[str] = None
    allowed_product_types: Optional[List[str]] = None
    rules_config: Optional[dict] = None


class GradeSubmissionRequest(BaseModel):
    score: Optional[int] = Field(default=None, ge=0, le=100)
    passed: Optional[bool] = None
    faculty_feedback: Optional[str] = None


# ── Faculty Routes ──────────────────────────────────────────────────

@router.get("")
async def list_faculty_assignments(
    course_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_faculty),
):
    """List all trading assignments created by the current faculty member."""
    stmt = select(TradingAssignment).where(
        and_(
            TradingAssignment.institution_id == user.institution_id,
            TradingAssignment.created_by_user_id == user.id,
        )
    )
    if course_id:
        c_uuid = _as_uuid(course_id)
        if c_uuid:
            stmt = stmt.where(TradingAssignment.course_id == c_uuid)

    stmt = stmt.order_by(TradingAssignment.created_at.desc())
    res = await db.execute(stmt)
    assignments = list(res.scalars().all())

    # Get submission counts per assignment
    out = []
    for a in assignments:
        sub_stmt = select(
            func.count(AssignmentSubmission.id).label("total"),
            func.count(AssignmentSubmission.id).filter(AssignmentSubmission.status == "passed").label("passed"),
            func.count(AssignmentSubmission.id).filter(AssignmentSubmission.status == "submitted").label("submitted"),
        ).where(AssignmentSubmission.assignment_id == a.id)
        sub_res = await db.execute(sub_stmt)
        sub_row = sub_res.one()

        out.append({
            "id": str(a.id),
            "title": a.title,
            "description": a.description,
            "status": a.status,
            "course_id": str(a.course_id) if a.course_id else None,
            "pass_score": a.pass_score,
            "start_date": _iso(a.start_date),
            "due_date": _iso(a.due_date),
            "target_asset_class": a.target_asset_class,
            "target_symbols": a.target_symbols or [],
            "min_trades": a.min_trades,
            "require_stop_loss": a.require_stop_loss,
            "max_sl_percent": float(a.max_sl_percent) if a.max_sl_percent is not None else None,
            "require_take_profit": a.require_take_profit,
            "min_risk_reward_ratio": float(a.min_risk_reward_ratio) if a.min_risk_reward_ratio is not None else None,
            "allowed_sides": a.allowed_sides,
            "allowed_product_types": a.allowed_product_types or ["ALL"],
            "created_at": _iso(a.created_at),
            "updated_at": _iso(a.updated_at),
            "stats": {
                "total_submissions": sub_row.total or 0,
                "passed_count": sub_row.passed or 0,
                "pending_review": sub_row.submitted or 0,
            }
        })

    return {"assignments": out}


@router.post("")
async def create_faculty_assignment(
    req: CreateAssignmentRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_faculty),
):
    """Create a new trading assignment with custom rule parameters."""
    course_uuid = _as_uuid(req.course_id) if req.course_id else None

    # Validate course belongs to same institution if specified
    if course_uuid:
        c_res = await db.execute(
            select(Course).where(
                and_(
                    Course.id == course_uuid,
                    Course.institution_id == user.institution_id,
                )
            )
        )
        if not c_res.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Specified course not found in your institution")

    assignment = TradingAssignment(
        institution_id=user.institution_id,
        created_by_user_id=user.id,
        course_id=course_uuid,
        title=req.title.strip(),
        description=req.description.strip() if req.description else None,
        status="active",
        pass_score=req.pass_score,
        start_date=req.start_date,
        due_date=req.due_date,
        target_asset_class=req.target_asset_class.upper(),
        target_symbols=[s.upper().strip() for s in req.target_symbols if s.strip()] if req.target_symbols else [],
        min_trades=req.min_trades,
        require_stop_loss=req.require_stop_loss,
        max_sl_percent=req.max_sl_percent,
        require_take_profit=req.require_take_profit,
        min_risk_reward_ratio=req.min_risk_reward_ratio,
        allowed_sides=req.allowed_sides.upper(),
        allowed_product_types=req.allowed_product_types or ["ALL"],
        rules_config=req.rules_config or {},
    )
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)

    logger.info(f"Faculty {user.id} created trading assignment {assignment.id} ('{assignment.title}')")
    return {
        "id": str(assignment.id),
        "title": assignment.title,
        "status": assignment.status,
        "message": "Trading assignment created successfully",
    }


@router.get("/{assignment_id}")
async def get_faculty_assignment_detail(
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_faculty),
):
    """Get assignment details including full rules and student submissions list."""
    a_uuid = _as_uuid(assignment_id)
    if not a_uuid:
        raise HTTPException(status_code=400, detail="Invalid assignment ID")

    stmt = select(TradingAssignment).where(
        and_(
            TradingAssignment.id == a_uuid,
            TradingAssignment.institution_id == user.institution_id,
            TradingAssignment.created_by_user_id == user.id,
        )
    )
    res = await db.execute(stmt)
    assignment = res.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Trading assignment not found")

    # Fetch all students in the institution
    students_stmt = select(User).where(
        and_(
            User.institution_id == user.institution_id,
            User.role == "student",
            User.is_active == True,
        )
    ).order_by(User.full_name.asc())
    students_res = await db.execute(students_stmt)
    students = list(students_res.scalars().all())

    # Fetch existing submissions for this assignment
    sub_stmt = select(AssignmentSubmission).where(
        AssignmentSubmission.assignment_id == assignment.id
    )
    sub_res = await db.execute(sub_stmt)
    submissions_by_student = {s.student_id: s for s in sub_res.scalars().all()}

    submissions_list = []
    for st in students:
        sub = submissions_by_student.get(st.id)
        submissions_list.append({
            "submission_id": str(sub.id) if sub else None,
            "student_id": str(st.id),
            "student_name": st.full_name,
            "student_email": st.email,
            "status": sub.status if sub else "not_started",
            "score": sub.score if sub else 0,
            "passed": sub.passed if sub else False,
            "matched_trades_count": len(sub.matched_order_ids) if (sub and sub.matched_order_ids) else 0,
            "evaluation_summary": sub.evaluation_summary if sub else None,
            "student_notes": sub.student_notes if sub else None,
            "faculty_feedback": sub.faculty_feedback if sub else None,
            "submitted_at": _iso(sub.submitted_at) if sub else None,
            "evaluated_at": _iso(sub.evaluated_at) if sub else None,
        })

    return {
        "id": str(assignment.id),
        "title": assignment.title,
        "description": assignment.description,
        "status": assignment.status,
        "course_id": str(assignment.course_id) if assignment.course_id else None,
        "pass_score": assignment.pass_score,
        "start_date": _iso(assignment.start_date),
        "due_date": _iso(assignment.due_date),
        "target_asset_class": assignment.target_asset_class,
        "target_symbols": assignment.target_symbols or [],
        "min_trades": assignment.min_trades,
        "require_stop_loss": assignment.require_stop_loss,
        "max_sl_percent": float(assignment.max_sl_percent) if assignment.max_sl_percent is not None else None,
        "require_take_profit": assignment.require_take_profit,
        "min_risk_reward_ratio": float(assignment.min_risk_reward_ratio) if assignment.min_risk_reward_ratio is not None else None,
        "allowed_sides": assignment.allowed_sides,
        "allowed_product_types": assignment.allowed_product_types or ["ALL"],
        "created_at": _iso(assignment.created_at),
        "submissions": submissions_list,
    }


@router.patch("/{assignment_id}")
async def update_faculty_assignment(
    assignment_id: str,
    req: UpdateAssignmentRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_faculty),
):
    """Update trading assignment settings or rules."""
    a_uuid = _as_uuid(assignment_id)
    if not a_uuid:
        raise HTTPException(status_code=400, detail="Invalid assignment ID")

    stmt = select(TradingAssignment).where(
        and_(
            TradingAssignment.id == a_uuid,
            TradingAssignment.institution_id == user.institution_id,
            TradingAssignment.created_by_user_id == user.id,
        )
    )
    res = await db.execute(stmt)
    assignment = res.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Trading assignment not found")

    if req.title is not None:
        assignment.title = req.title.strip()
    if req.description is not None:
        assignment.description = req.description.strip() if req.description else None
    if req.status is not None:
        assignment.status = req.status.lower()
    if req.pass_score is not None:
        assignment.pass_score = req.pass_score
    if req.start_date is not None:
        assignment.start_date = req.start_date
    if req.due_date is not None:
        assignment.due_date = req.due_date
    if req.target_asset_class is not None:
        assignment.target_asset_class = req.target_asset_class.upper()
    if req.target_symbols is not None:
        assignment.target_symbols = [s.upper().strip() for s in req.target_symbols if s.strip()]
    if req.min_trades is not None:
        assignment.min_trades = req.min_trades
    if req.require_stop_loss is not None:
        assignment.require_stop_loss = req.require_stop_loss
    if req.max_sl_percent is not None:
        assignment.max_sl_percent = req.max_sl_percent
    if req.require_take_profit is not None:
        assignment.require_take_profit = req.require_take_profit
    if req.min_risk_reward_ratio is not None:
        assignment.min_risk_reward_ratio = req.min_risk_reward_ratio
    if req.allowed_sides is not None:
        assignment.allowed_sides = req.allowed_sides.upper()
    if req.allowed_product_types is not None:
        assignment.allowed_product_types = req.allowed_product_types

    await db.commit()
    return {"message": "Trading assignment updated successfully"}


@router.delete("/{assignment_id}")
async def delete_faculty_assignment(
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_faculty),
):
    """Delete an assignment authored by the faculty member."""
    a_uuid = _as_uuid(assignment_id)
    if not a_uuid:
        raise HTTPException(status_code=400, detail="Invalid assignment ID")

    stmt = select(TradingAssignment).where(
        and_(
            TradingAssignment.id == a_uuid,
            TradingAssignment.institution_id == user.institution_id,
            TradingAssignment.created_by_user_id == user.id,
        )
    )
    res = await db.execute(stmt)
    assignment = res.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Trading assignment not found")

    await db.delete(assignment)
    await db.commit()
    return {"message": "Assignment deleted successfully"}


@router.post("/{assignment_id}/submissions/{submission_id}/grade")
async def grade_student_submission(
    assignment_id: str,
    submission_id: str,
    req: GradeSubmissionRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_faculty),
):
    """Faculty manually reviews, adds feedback, or overrides score on a submission."""
    a_uuid = _as_uuid(assignment_id)
    s_uuid = _as_uuid(submission_id)
    if not a_uuid or not s_uuid:
        raise HTTPException(status_code=400, detail="Invalid IDs")

    stmt = (
        select(AssignmentSubmission)
        .join(TradingAssignment, AssignmentSubmission.assignment_id == TradingAssignment.id)
        .where(
            and_(
                AssignmentSubmission.id == s_uuid,
                AssignmentSubmission.assignment_id == a_uuid,
                TradingAssignment.institution_id == user.institution_id,
                TradingAssignment.created_by_user_id == user.id,
            )
        )
    )
    res = await db.execute(stmt)
    submission = res.scalar_one_or_none()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    if req.score is not None:
        submission.score = req.score
    if req.passed is not None:
        submission.passed = req.passed
        submission.status = "passed" if req.passed else "failed"
    if req.faculty_feedback is not None:
        submission.faculty_feedback = req.faculty_feedback.strip()

    submission.faculty_graded_at = datetime.now(timezone.utc)
    submission.graded_by_user_id = user.id

    await db.commit()
    return {"message": "Submission graded successfully"}
