"""
Student Trading Assignments API.
Allows students to view assigned trade tasks, run live verification against their order history,
inspect rule checklists, and submit completed assignments.
"""

import logging
import uuid
from typing import Optional, Any
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from database.connection import get_db
from models.user import User
from models.assignment import TradingAssignment, AssignmentSubmission
from dependencies.student import require_student
from services.assignment_evaluator import evaluate_student_assignment

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/student/assignments", tags=["Student Assignments"])


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


class SubmitAssignmentRequest(BaseModel):
    student_notes: Optional[str] = None


@router.get("")
async def list_student_assignments(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_student),
):
    """List all active and completed trading assignments for the student's institution."""
    stmt = select(TradingAssignment).where(
        and_(
            TradingAssignment.institution_id == user.institution_id,
            TradingAssignment.status == "active",
        )
    ).order_by(TradingAssignment.created_at.desc())

    res = await db.execute(stmt)
    assignments = list(res.scalars().all())

    # Get student's submissions for these assignments
    sub_stmt = select(AssignmentSubmission).where(
        and_(
            AssignmentSubmission.student_id == user.id,
            AssignmentSubmission.institution_id == user.institution_id,
        )
    )
    sub_res = await db.execute(sub_stmt)
    submissions_by_assignment = {s.assignment_id: s for s in sub_res.scalars().all()}

    out = []
    for a in assignments:
        sub = submissions_by_assignment.get(a.id)
        out.append({
            "id": str(a.id),
            "title": a.title,
            "description": a.description,
            "status": a.status,
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
            "submission": {
                "id": str(sub.id) if sub else None,
                "status": sub.status if sub else "not_started",
                "score": sub.score if sub else 0,
                "passed": sub.passed if sub else False,
                "matched_trades_count": len(sub.matched_order_ids) if (sub and sub.matched_order_ids) else 0,
                "submitted_at": _iso(sub.submitted_at) if sub else None,
                "evaluated_at": _iso(sub.evaluated_at) if sub else None,
                "faculty_feedback": sub.faculty_feedback if sub else None,
            } if sub else None,
        })

    return {"assignments": out}


@router.get("/{assignment_id}")
async def get_student_assignment_detail(
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_student),
):
    """Get assignment details and student's progress evaluation."""
    a_uuid = _as_uuid(assignment_id)
    if not a_uuid:
        raise HTTPException(status_code=400, detail="Invalid assignment ID")

    stmt = select(TradingAssignment).where(
        and_(
            TradingAssignment.id == a_uuid,
            TradingAssignment.institution_id == user.institution_id,
        )
    )
    res = await db.execute(stmt)
    assignment = res.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Trading assignment not found")

    # Get existing submission or evaluate live
    sub_stmt = select(AssignmentSubmission).where(
        and_(
            AssignmentSubmission.assignment_id == assignment.id,
            AssignmentSubmission.student_id == user.id,
        )
    )
    sub_res = await db.execute(sub_stmt)
    submission = sub_res.scalar_one_or_none()

    # Always perform a live evaluation check so the student sees their current status
    evaluation = await evaluate_student_assignment(db, assignment, user.id)

    return {
        "id": str(assignment.id),
        "title": assignment.title,
        "description": assignment.description,
        "status": assignment.status,
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
        "live_evaluation": evaluation,
        "submission": {
            "id": str(submission.id) if submission else None,
            "status": submission.status if submission else "not_started",
            "score": submission.score if submission else evaluation["score"],
            "passed": submission.passed if submission else evaluation["passed"],
            "student_notes": submission.student_notes if submission else None,
            "faculty_feedback": submission.faculty_feedback if submission else None,
            "submitted_at": _iso(submission.submitted_at) if submission else None,
            "evaluated_at": _iso(submission.evaluated_at) if submission else None,
        } if submission else None,
    }


@router.post("/{assignment_id}/evaluate")
async def evaluate_assignment_progress(
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_student),
):
    """Run live automated evaluation against current order history and update submission."""
    a_uuid = _as_uuid(assignment_id)
    if not a_uuid:
        raise HTTPException(status_code=400, detail="Invalid assignment ID")

    stmt = select(TradingAssignment).where(
        and_(
            TradingAssignment.id == a_uuid,
            TradingAssignment.institution_id == user.institution_id,
        )
    )
    res = await db.execute(stmt)
    assignment = res.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Trading assignment not found")

    evaluation = await evaluate_student_assignment(db, assignment, user.id)

    # Upsert Submission record
    sub_stmt = select(AssignmentSubmission).where(
        and_(
            AssignmentSubmission.assignment_id == assignment.id,
            AssignmentSubmission.student_id == user.id,
        )
    )
    sub_res = await db.execute(sub_stmt)
    submission = sub_res.scalar_one_or_none()

    if not submission:
        submission = AssignmentSubmission(
            assignment_id=assignment.id,
            student_id=user.id,
            institution_id=user.institution_id,
            status="in_progress",
            score=evaluation["score"],
            passed=evaluation["passed"],
            matched_order_ids=evaluation["matched_order_ids"],
            evaluation_summary=evaluation,
            evaluated_at=datetime.now(timezone.utc),
        )
        db.add(submission)
    else:
        # Update progress unless already officially graded by faculty
        if submission.status not in ["passed"]:
            submission.score = evaluation["score"]
            submission.passed = evaluation["passed"]
            submission.matched_order_ids = evaluation["matched_order_ids"]
            submission.evaluation_summary = evaluation
            submission.evaluated_at = datetime.now(timezone.utc)
            if submission.status == "not_started":
                submission.status = "in_progress"

    await db.commit()
    await db.refresh(submission)

    return {
        "message": "Evaluation completed",
        "evaluation": evaluation,
        "submission_id": str(submission.id),
        "status": submission.status,
    }


@router.post("/{assignment_id}/submit")
async def submit_assignment_for_grading(
    assignment_id: str,
    req: SubmitAssignmentRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_student),
):
    """Officially submit completed trading task for faculty review."""
    a_uuid = _as_uuid(assignment_id)
    if not a_uuid:
        raise HTTPException(status_code=400, detail="Invalid assignment ID")

    stmt = select(TradingAssignment).where(
        and_(
            TradingAssignment.id == a_uuid,
            TradingAssignment.institution_id == user.institution_id,
        )
    )
    res = await db.execute(stmt)
    assignment = res.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Trading assignment not found")

    evaluation = await evaluate_student_assignment(db, assignment, user.id)

    sub_stmt = select(AssignmentSubmission).where(
        and_(
            AssignmentSubmission.assignment_id == assignment.id,
            AssignmentSubmission.student_id == user.id,
        )
    )
    sub_res = await db.execute(sub_stmt)
    submission = sub_res.scalar_one_or_none()

    now = datetime.now(timezone.utc)
    if not submission:
        submission = AssignmentSubmission(
            assignment_id=assignment.id,
            student_id=user.id,
            institution_id=user.institution_id,
            status="passed" if evaluation["passed"] else "submitted",
            score=evaluation["score"],
            passed=evaluation["passed"],
            matched_order_ids=evaluation["matched_order_ids"],
            evaluation_summary=evaluation,
            student_notes=req.student_notes.strip() if req.student_notes else None,
            submitted_at=now,
            evaluated_at=now,
        )
        db.add(submission)
    else:
        submission.status = "passed" if evaluation["passed"] else "submitted"
        submission.score = evaluation["score"]
        submission.passed = evaluation["passed"]
        submission.matched_order_ids = evaluation["matched_order_ids"]
        submission.evaluation_summary = evaluation
        if req.student_notes:
            submission.student_notes = req.student_notes.strip()
        submission.submitted_at = now
        submission.evaluated_at = now

    await db.commit()
    await db.refresh(submission)

    return {
        "message": "Assignment submitted successfully",
        "submission_id": str(submission.id),
        "status": submission.status,
        "score": submission.score,
        "passed": submission.passed,
        "evaluation": evaluation,
    }
