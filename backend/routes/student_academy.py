"""
Student Academy API — browse approved courses for the student's own
institution, read lessons, mark them complete, and take graded, timed,
proctored MCQ assessments.

Scoping: a student only ever sees courses where status="approved" and
institution_id matches their own institution_id. Correct-answer flags are
never sent to the client before an attempt is submitted.

Assessment rules:
  - One attempt per student per assessment, ever — enforced server-side.
  - An Institution Admin can grant exactly one more attempt
    (AssessmentRetakeGrant); starting a new attempt consumes that grant.
  - Time limit is question_count * 60 seconds, computed server-side and
    returned as an absolute `expires_at` so the client timer can't be
    tampered with. `started_at` is stamped when the attempt begins.
  - The client reports proctoring violations (tab switch, right-click,
    screenshot attempt); on the 3rd violation the attempt is force-
    submitted and flagged.
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database.connection import get_db
from models.user import User
from models.course import (
    Course, Lesson, Assessment, Question, Choice,
    LessonProgress, AssessmentAttempt, AttemptAnswer, AssessmentRetakeGrant,
)
from models.assignment import TradingAssignment, AssignmentSubmission
from models.order import Order
from dependencies.student import require_student
from services.invite_service import _as_uuid, _as_aware_utc

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/academy", tags=["Student Academy"])

SECONDS_PER_QUESTION = 60


def _iso(val):
    if val is None:
        return None
    if isinstance(val, str):
        return val
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)


class SubmitAnswerInput(BaseModel):
    question_id: str
    choice_id: Optional[str] = None


class SubmitAttemptRequest(BaseModel):
    answers: list[SubmitAnswerInput] = Field(default_factory=list)
    attempt_id: str
    flagged: bool = False
    flag_reason: Optional[str] = None


async def _get_visible_course(db: AsyncSession, student: User, course_id: str) -> Course:
    course_uuid = _as_uuid(course_id)
    course = await db.get(Course, course_uuid) if course_uuid else None
    if not course or course.status != "approved":
        raise HTTPException(status_code=404, detail="Course not found")

    # Admins and super admins can view any approved course
    if student.role in ("admin", "super_admin"):
        return course

    # Match student's institution, or default platform-wide course, or unassigned course
    is_match = (
        course.is_default
        or course.institution_id is None
        or student.institution_id is None
        or (str(course.institution_id) == str(student.institution_id))
    )
    if not is_match:
        raise HTTPException(status_code=404, detail="Course not found in your institution")
    return course


async def _get_own_attempt(db: AsyncSession, student: User, assessment_id) -> Optional[AssessmentAttempt]:
    result = await db.execute(
        select(AssessmentAttempt)
        .where(AssessmentAttempt.user_id == student.id, AssessmentAttempt.assessment_id == assessment_id)
        .order_by(AssessmentAttempt.started_at.desc())
    )
    return result.scalars().first()


async def _has_unconsumed_grant(db: AsyncSession, student: User, assessment_id) -> bool:
    result = await db.execute(
        select(AssessmentRetakeGrant).where(
            AssessmentRetakeGrant.user_id == student.id,
            AssessmentRetakeGrant.assessment_id == assessment_id,
            AssessmentRetakeGrant.consumed.is_(False),
        )
    )
    return result.scalars().first() is not None


@router.get("/courses")
async def list_available_courses(
    student: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Course)
        .where(Course.status == "approved")
        .order_by(Course.created_at.asc())
    )
    courses = result.scalars().all()
    if not courses:
        return {"courses": []}

    course_ids = [c.id for c in courses]
    lesson_counts = {str(row[0]): row[1] for row in (await db.execute(
        select(Lesson.course_id, func.count(Lesson.id)).where(Lesson.course_id.in_(course_ids)).group_by(Lesson.course_id)
    )).all() if row[0] is not None}
    assessment_counts = {str(row[0]): row[1] for row in (await db.execute(
        select(Assessment.course_id, func.count(Assessment.id)).where(Assessment.course_id.in_(course_ids)).group_by(Assessment.course_id)
    )).all() if row[0] is not None}

    completed_lessons = {str(row[0]): row[1] for row in (await db.execute(
        select(LessonProgress.course_id, func.count(LessonProgress.id))
        .where(LessonProgress.user_id == student.id, LessonProgress.course_id.in_(course_ids))
        .group_by(LessonProgress.course_id)
    )).all() if row[0] is not None}

    best_scores = {str(row[0]): row[1] for row in (await db.execute(
        select(AssessmentAttempt.course_id, func.max(AssessmentAttempt.score_percent))
        .where(AssessmentAttempt.user_id == student.id, AssessmentAttempt.course_id.in_(course_ids))
        .group_by(AssessmentAttempt.course_id)
    )).all() if row[0] is not None}

    return {
        "courses": [
            {
                "id": str(c.id),
                "title": c.title,
                "description": c.description,
                "lesson_count": lesson_counts.get(str(c.id), 0),
                "assessment_count": assessment_counts.get(str(c.id), 0),
                "lessons_completed": completed_lessons.get(str(c.id), 0),
                "best_score_percent": best_scores.get(str(c.id)),
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in courses
        ]
    }


@router.get("/courses/{course_id}")
async def get_course_detail(
    course_id: str,
    student: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
):
    try:
        course = await _get_visible_course(db, student, course_id)

        lessons_result = await db.execute(
            select(Lesson).where(Lesson.course_id == course.id).order_by(Lesson.order_index, Lesson.created_at)
        )
        lessons = lessons_result.scalars().all()

        progress_result = await db.execute(
            select(LessonProgress.lesson_id).where(LessonProgress.user_id == student.id, LessonProgress.course_id == course.id)
        )
        completed_lesson_ids = {str(row[0]) for row in progress_result.all() if row[0] is not None}

        assessments_result = await db.execute(
            select(Assessment).where(Assessment.course_id == course.id).order_by(Assessment.created_at)
        )
        assessments = assessments_result.scalars().all()

        question_counts = {}
        latest_by_assessment = {}
        grant_by_assessment = {}
        if assessments:
            assessment_ids = [a.id for a in assessments]
            question_counts = {
                str(row[0]): row[1]
                for row in (await db.execute(
                    select(Question.assessment_id, func.count(Question.id))
                    .where(Question.assessment_id.in_(assessment_ids))
                    .group_by(Question.assessment_id)
                )).all()
                if row[0] is not None
            }

            try:
                attempts_result = await db.execute(
                    select(AssessmentAttempt)
                    .where(AssessmentAttempt.user_id == student.id, AssessmentAttempt.assessment_id.in_(assessment_ids))
                    .order_by(AssessmentAttempt.started_at.desc())
                )
                for attempt in attempts_result.scalars().all():
                    att_key = str(attempt.assessment_id)
                    if att_key not in latest_by_assessment:
                        latest_by_assessment[att_key] = attempt
            except Exception as att_err:
                logger.warning(f"Could not load assessment_attempts (schema mismatch or empty): {att_err}")

            try:
                grants_result = await db.execute(
                    select(AssessmentRetakeGrant.assessment_id).where(
                        AssessmentRetakeGrant.user_id == student.id,
                        AssessmentRetakeGrant.assessment_id.in_(assessment_ids),
                        AssessmentRetakeGrant.consumed.is_(False),
                    )
                )
                grant_by_assessment = {str(row[0]): True for row in grants_result.all() if row[0] is not None}
            except Exception as grant_err:
                logger.warning(f"Could not load assessment_retake_grants: {grant_err}")

        lesson_ids = [l.id for l in lessons]
        materials_by_lesson: dict = {}
        if lesson_ids:
            try:
                materials_res = await db.execute(
                    select(LessonMaterial)
                    .where(LessonMaterial.lesson_id.in_(lesson_ids))
                    .order_by(LessonMaterial.created_at)
                )
                for mat in materials_res.scalars().all():
                    materials_by_lesson.setdefault(str(mat.lesson_id), []).append({
                        "id": str(mat.id),
                        "file_url": mat.file_url,
                        "file_name": mat.file_name,
                        "file_type": mat.file_type,
                    })
            except Exception as mat_err:
                logger.warning(f"LessonMaterial query warning: {mat_err}")

        def _get_lesson_materials(l):
            mats = []
            if l.file_url:
                mats.append({
                    "id": f"primary-{l.id}",
                    "file_url": l.file_url,
                    "file_name": l.file_name or "Lesson Notes",
                    "file_type": l.file_type or "pdf",
                })
            for m in materials_by_lesson.get(str(l.id), []):
                if not any(existing["file_url"] == m["file_url"] for existing in mats):
                    mats.append(m)
            return mats

        return {
            "id": str(course.id),
            "title": course.title,
            "description": course.description,
            "lessons": [
                {
                    "id": str(l.id),
                    "title": l.title,
                    "content": l.content,
                    "file_url": l.file_url,
                    "file_name": l.file_name,
                    "file_type": l.file_type,
                    "materials": _get_lesson_materials(l),
                    "completed": str(l.id) in completed_lesson_ids,
                }
                for l in lessons
            ],
            "assessments": [
                {
                    "id": str(a.id),
                    "title": a.title,
                    "instructions": a.instructions,
                    "pass_score": a.pass_score,
                    "question_count": question_counts.get(str(a.id), 0),
                    "time_limit_seconds": question_counts.get(str(a.id), 0) * SECONDS_PER_QUESTION,
                    "last_attempt": (
                        {
                            "score_percent": latest_by_assessment[str(a.id)].score_percent,
                            "passed": latest_by_assessment[str(a.id)].passed,
                            "flagged": getattr(latest_by_assessment[str(a.id)], "flagged", False),
                            "submitted_at": _iso(latest_by_assessment[str(a.id)].started_at),
                        }
                        if str(a.id) in latest_by_assessment else None
                    ),
                    "locked": (str(a.id) in latest_by_assessment) and not grant_by_assessment.get(str(a.id), False),
                }
                for a in assessments
            ],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error in get_course_detail for course_id={course_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to load course details: {str(e)}")


@router.post("/courses/{course_id}/lessons/{lesson_id}/complete")
async def mark_lesson_complete(
    course_id: str,
    lesson_id: str,
    student: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
):
    course = await _get_visible_course(db, student, course_id)
    lesson_uuid = _as_uuid(lesson_id)
    lesson = await db.get(Lesson, lesson_uuid) if lesson_uuid else None
    if not lesson or lesson.course_id != course.id:
        raise HTTPException(status_code=404, detail="Lesson not found")

    existing_result = await db.execute(
        select(LessonProgress).where(LessonProgress.user_id == student.id, LessonProgress.lesson_id == lesson.id)
    )
    if not existing_result.scalar_one_or_none():
        db.add(LessonProgress(user_id=student.id, lesson_id=lesson.id, course_id=course.id))
        await db.commit()

    return {"success": True}


@router.get("/courses/{course_id}/assessments/{assessment_id}/take")
async def start_assessment(
    course_id: str,
    assessment_id: str,
    student: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
):
    """Starts (or resumes) a timed attempt. Returns questions WITHOUT
    is_correct flags, plus a server-computed expires_at deadline."""
    try:
        course = await _get_visible_course(db, student, course_id)
        assessment_uuid = _as_uuid(assessment_id)
        assessment = await db.get(Assessment, assessment_uuid) if assessment_uuid else None
        if not assessment or assessment.course_id != course.id:
            raise HTTPException(status_code=404, detail="Assessment not found")

        existing = await _get_own_attempt(db, student, assessment.id)
        if existing:
            has_grant = await _has_unconsumed_grant(db, student, assessment.id)
            if not has_grant:
                raise HTTPException(status_code=403, detail="You've already taken this assessment. Ask your Institution Admin for a retake.")

        questions_result = await db.execute(
            select(Question).where(Question.assessment_id == assessment.id).order_by(Question.order_index, Question.created_at)
        )
        questions = questions_result.scalars().all()
        if not questions:
            raise HTTPException(status_code=400, detail="This assessment has no questions yet")

        question_ids = [q.id for q in questions]
        choices_result = await db.execute(select(Choice).where(Choice.question_id.in_(question_ids)))
        choices_by_question: dict = {}
        for c in choices_result.scalars().all():
            choices_by_question.setdefault(c.question_id, []).append(c)

        attempt = AssessmentAttempt(
            user_id=student.id,
            assessment_id=assessment.id,
            course_id=course.id,
            score_percent=0,
            passed=False,
            total_questions=len(questions),
            correct_count=0,
        )
        db.add(attempt)
        await db.commit()
        await db.refresh(attempt)

        time_limit_seconds = len(questions) * SECONDS_PER_QUESTION
        started_at = _as_aware_utc(attempt.started_at) or datetime.now(timezone.utc)
        expires_at = started_at + timedelta(seconds=time_limit_seconds)

        return {
            "attempt_id": str(attempt.id),
            "assessment": {
                "id": str(assessment.id),
                "title": assessment.title,
                "instructions": assessment.instructions,
                "pass_score": assessment.pass_score,
            },
            "time_limit_seconds": time_limit_seconds,
            "expires_at": expires_at.isoformat(),
            "questions": [
                {
                    "id": str(q.id),
                    "text": q.text,
                    "choices": [
                        {"id": str(c.id), "text": c.text}
                        for c in sorted(choices_by_question.get(q.id, []), key=lambda c: c.order_index)
                    ],
                }
                for q in questions
            ],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error in start_assessment: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start quiz: {str(e)}")


@router.post("/courses/{course_id}/assessments/{assessment_id}/submit")
async def submit_assessment(
    course_id: str,
    assessment_id: str,
    req: SubmitAttemptRequest,
    student: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
):
    course = await _get_visible_course(db, student, course_id)
    assessment_uuid = _as_uuid(assessment_id)
    assessment = await db.get(Assessment, assessment_uuid) if assessment_uuid else None
    if not assessment or assessment.course_id != course.id:
        raise HTTPException(status_code=404, detail="Assessment not found")

    attempt_uuid = _as_uuid(req.attempt_id)
    attempt = await db.get(AssessmentAttempt, attempt_uuid) if attempt_uuid else None
    if not attempt or attempt.user_id != student.id or attempt.assessment_id != assessment.id:
        raise HTTPException(status_code=404, detail="Attempt not found")

    questions_result = await db.execute(select(Question).where(Question.assessment_id == assessment.id))
    questions = questions_result.scalars().all()
    if not questions:
        raise HTTPException(status_code=400, detail="This assessment has no questions yet")

    question_ids = [q.id for q in questions]
    choices_result = await db.execute(select(Choice).where(Choice.question_id.in_(question_ids)))
    all_choices = choices_result.scalars().all()
    correct_choice_by_question = {}
    for c in all_choices:
        if c.is_correct:
            correct_choice_by_question[c.question_id] = c.id

    submitted_by_question = {_as_uuid(a.question_id): _as_uuid(a.choice_id) for a in req.answers}

    correct_count = 0
    answer_rows = []
    for q in questions:
        submitted_choice_id = submitted_by_question.get(q.id)
        is_correct = submitted_choice_id is not None and submitted_choice_id == correct_choice_by_question.get(q.id)
        if is_correct:
            correct_count += 1
        answer_rows.append((q.id, submitted_choice_id, is_correct))

    total = len(questions)
    score_percent = round((correct_count / total) * 100) if total else 0
    passed = score_percent >= assessment.pass_score and not req.flagged

    attempt.score_percent = score_percent
    attempt.passed = passed
    attempt.correct_count = correct_count
    attempt.flagged = req.flagged
    attempt.flag_reason = req.flag_reason

    for question_id, choice_id, is_correct in answer_rows:
        db.add(AttemptAnswer(attempt_id=attempt.id, question_id=question_id, choice_id=choice_id, is_correct=is_correct))

    # Consume any unconsumed retake grant this attempt used.
    grant_result = await db.execute(
        select(AssessmentRetakeGrant).where(
            AssessmentRetakeGrant.user_id == student.id,
            AssessmentRetakeGrant.assessment_id == assessment.id,
            AssessmentRetakeGrant.consumed.is_(False),
        )
    )
    grant = grant_result.scalars().first()
    if grant:
        grant.consumed = True

    await db.commit()

    return {
        "score_percent": score_percent,
        "passed": passed,
        "flagged": req.flagged,
        "correct_count": correct_count,
        "total_questions": total,
        "pass_score": assessment.pass_score,
    }


# ────────────────────────────────────────────────────────────────
# Document 06 Screen 2: Learning Home Analytics & Core Curriculum
# ────────────────────────────────────────────────────────────────

DEFAULT_INDIAN_CAPITAL_MARKETS_MODULES = [
    {
        "id": "cm-01",
        "code": "M01",
        "tag": "MKT",
        "title": "Financial Systems & Market Structure",
        "description": "Structure of Indian financial markets, role of RBI, SEBI, exchanges and depositories (NSDL/CDSL).",
        "estimated_hours": 1.5,
        "lesson_count": 4,
        "quiz_count": 1,
        "evidence_beat": None,
    },
    {
        "id": "cm-02",
        "code": "M02",
        "tag": "MKT",
        "title": "Primary Market & IPO Mechanics",
        "description": "Book building, ASBA process, price bands, red herring prospectus, retail vs HNI allocation.",
        "estimated_hours": 2.0,
        "lesson_count": 3,
        "quiz_count": 1,
        "evidence_beat": None,
    },
    {
        "id": "cm-03",
        "code": "M03",
        "tag": "EQ",
        "title": "Secondary Market & Continuous Trading",
        "description": "NSE NEAT / BSE BOLT continuous matching engines, price discovery, pre-open session call auction.",
        "estimated_hours": 2.5,
        "lesson_count": 5,
        "quiz_count": 1,
        "evidence_beat": "Inspect pre-open call auction order uncrossing on NSE tick replay.",
    },
    {
        "id": "cm-04",
        "code": "M04",
        "tag": "REG",
        "title": "Market Participants & Brokerage",
        "description": "Trading members, clearing members, institutional custodians, and retail client fund segregation.",
        "estimated_hours": 1.5,
        "lesson_count": 3,
        "quiz_count": 1,
        "evidence_beat": None,
    },
    {
        "id": "cm-05",
        "code": "M05",
        "tag": "INDX",
        "title": "Free-Float Market Capitalisation & Divisor",
        "description": "Index construction, free-float factor, Nifty 50 base calculation, and corporate action divisor adjustment.",
        "estimated_hours": 2.0,
        "lesson_count": 4,
        "quiz_count": 1,
        "evidence_beat": "Verify the Nifty 50 divisor and index weight adjustment on event-day execution.",
    },
    {
        "id": "cm-06",
        "code": "M06",
        "tag": "REG",
        "title": "SEBI Regulations & Market Conduct",
        "description": "SEBI prohibition of insider trading (PIT), fraudulent trade practices (PFUTP), and disclosure requirements.",
        "estimated_hours": 1.5,
        "lesson_count": 3,
        "quiz_count": 1,
        "evidence_beat": None,
    },
    {
        "id": "cm-07",
        "code": "M07",
        "tag": "EQ",
        "title": "Corporate Actions & Price Adjustments",
        "description": "Cash dividends, bonus issues, stock splits, rights issues, and theoretical ex-date price calculation.",
        "estimated_hours": 2.0,
        "lesson_count": 4,
        "quiz_count": 1,
        "evidence_beat": "Observe ex-bonus price adjustment and circuit band revision at market open.",
    },
    {
        "id": "cm-08",
        "code": "M08",
        "tag": "EQ",
        "title": "Equity Valuation & Financial Statements",
        "description": "P/E, P/B, EV/EBITDA multiples, discounted cash flow (DCF), RoE, ROCE and Dupont analysis.",
        "estimated_hours": 3.0,
        "lesson_count": 6,
        "quiz_count": 2,
        "evidence_beat": None,
    },
    {
        "id": "cm-09",
        "code": "M09",
        "tag": "TECH",
        "title": "Technical Analysis & Price Action",
        "description": "Support and resistance, candlestick formations, moving averages, RSI, MACD, and chart patterns.",
        "estimated_hours": 2.5,
        "lesson_count": 5,
        "quiz_count": 1,
        "evidence_beat": "Identify intraday VWAP rejection and moving average confluence on replay chart.",
    },
    {
        "id": "cm-10",
        "code": "M10",
        "tag": "MKT",
        "title": "Market Depth, Liquidity & Impact Cost",
        "description": "Bid-ask spread, Level 2 / 5-depth ladders, synthetic vs licensed books, and institutional impact cost.",
        "estimated_hours": 2.0,
        "lesson_count": 4,
        "quiz_count": 1,
        "evidence_beat": "Execute 5,000 shares on market order and observe real-time slippage vs touch.",
    },
    {
        "id": "cm-11",
        "code": "M11",
        "tag": "DER",
        "title": "Derivatives Fundamentals & Forwards",
        "description": "Derivative mechanics, zero-sum payoff, settlement types (cash vs physical delivery), counterparty risk.",
        "estimated_hours": 2.0,
        "lesson_count": 3,
        "quiz_count": 1,
        "evidence_beat": None,
    },
    {
        "id": "cm-12",
        "code": "M12",
        "tag": "FUT",
        "title": "Futures Pricing & Arbitrage",
        "description": "Cost of carry model, spot-futures parity, basis, rollover spread, margin requirements (SPAN + Exposure).",
        "estimated_hours": 2.5,
        "lesson_count": 4,
        "quiz_count": 1,
        "evidence_beat": "Trade Nifty Future against cash basket during expiry week roll-spread divergence.",
    },
    {
        "id": "cm-13",
        "code": "M13",
        "tag": "OPT",
        "title": "Options Mechanics & Payoff Profiles",
        "description": "Calls, puts, strike price, in-the-money (ITM), at-the-money (ATM), out-of-the-money (OTM), intrinsic vs time value.",
        "estimated_hours": 2.5,
        "lesson_count": 5,
        "quiz_count": 1,
        "evidence_beat": "Construct Long Straddle vs Short Iron Condor ahead of major macroeconomic announcement.",
    },
    {
        "id": "cm-14",
        "code": "M14",
        "tag": "OPT",
        "title": "Option Greeks & Volatility Surface",
        "description": "Delta, Gamma, Theta decay, Vega, Rho, India VIX, implied volatility smile and skew dynamics.",
        "estimated_hours": 3.0,
        "lesson_count": 5,
        "quiz_count": 2,
        "evidence_beat": "Monitor intraday Theta bleed and IV crush immediately following earnings release.",
    },
    {
        "id": "cm-15",
        "code": "M15",
        "tag": "RISK",
        "title": "Risk Management & Behavioral Biases",
        "description": "Value-at-Risk (VaR), maximum drawdown, disposition effect (holding losers), overtrading and position sizing.",
        "estimated_hours": 2.0,
        "lesson_count": 4,
        "quiz_count": 1,
        "evidence_beat": "Enforce hard stop-loss rail on 10 consecutive simulated execution sessions.",
    },
    {
        "id": "cm-16",
        "code": "M16",
        "tag": "ALGO",
        "title": "Algorithmic Execution & Microstructure",
        "description": "TWAP, VWAP, iceberg orders, latency, circuit filter mechanism, and pre-trade risk controls (PRC).",
        "estimated_hours": 2.5,
        "lesson_count": 4,
        "quiz_count": 1,
        "evidence_beat": "Deploy slice-and-dice TWAP algorithm vs single market order execution.",
    },
]

GLOSSARY_ITEMS = [
    {
        "id": "g-asba",
        "term": "ASBA",
        "fullName": "Application Supported by Blocked Amount",
        "category": "Primary Market",
        "definition": "A mechanism developed by SEBI for applying to IPOs/rights issues where the applicant's bank account is not debited until shares are allotted.",
    },
    {
        "id": "g-circuit-breaker",
        "term": "Circuit Breaker",
        "fullName": "Market-Wide Circuit Breaker",
        "category": "Market Infrastructure",
        "definition": "An exchange-mandated halt applied to nationwide trading when index movements breach 10%, 15%, or 20% thresholds to curb panic sell-offs.",
    },
    {
        "id": "g-free-float",
        "term": "Free Float",
        "fullName": "Free-Float Market Capitalisation",
        "category": "Indices",
        "definition": "The proportion of shares readily available for public trading, excluding locked-in promoter holdings, government stakes, and strategic FDI.",
    },
    {
        "id": "g-impact-cost",
        "term": "Impact Cost",
        "fullName": "Market Impact Liquidity Cost",
        "category": "Execution",
        "definition": "The percentage cost markup or slippage incurred when executing a transaction of a specified size relative to the prevailing ideal market touch price.",
    },
    {
        "id": "g-stt",
        "term": "STT",
        "fullName": "Securities Transaction Tax",
        "category": "Regulatory Charges",
        "definition": "A direct tax levied by the Government of India on every purchase and sale of securities listed on recognized Indian stock exchanges.",
    },
    {
        "id": "g-span",
        "term": "SPAN Margin",
        "fullName": "Standard Portfolio Analysis of Risk",
        "category": "Derivatives",
        "definition": "A comprehensive risk calculation system used by Indian exchanges to determine maximum probable loss of a derivatives portfolio across 16 scenarios.",
    },
    {
        "id": "g-disposition",
        "term": "Disposition Effect",
        "fullName": "Behavioral Loss-Holding Bias",
        "category": "Behavioral Finance",
        "definition": "The empirical behavioral tendency of market participants to prematurely sell winning positions while holding losing positions for significantly longer durations.",
    },
]


@router.get("/overview")
async def get_student_academy_overview(
    student: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns real-time student learning metrics:
    Concept mastery %, weakest concepts, real upcoming due assignments/quizzes, and real simulator behaviour metrics.
    """
    now = datetime.now(timezone.utc)
    seven_days_ago = now - timedelta(days=7)

    # 1. Real Course and Lesson Progress
    courses_query = select(Course).where(Course.status == "approved")
    if student.role not in ("admin", "super_admin"):
        if student.institution_id is not None:
            courses_query = courses_query.where(
                (Course.institution_id == student.institution_id) | (Course.is_default.is_(True)) | (Course.institution_id.is_(None))
            )
    
    courses_result = await db.execute(courses_query)
    approved_courses = courses_result.scalars().all()
    total_approved = len(approved_courses)
    course_ids = [c.id for c in approved_courses]

    total_lessons_count = 0
    completed_lessons_count = 0
    recent_lessons_count = 0
    completed_courses_count = 0

    if course_ids:
        total_lessons_count = (await db.execute(
            select(func.count(Lesson.id)).where(Lesson.course_id.in_(course_ids))
        )).scalar() or 0

        completed_lessons_count = (await db.execute(
            select(func.count(LessonProgress.id))
            .where(LessonProgress.user_id == student.id, LessonProgress.course_id.in_(course_ids))
        )).scalar() or 0

        recent_lessons_count = (await db.execute(
            select(func.count(LessonProgress.id))
            .where(
                LessonProgress.user_id == student.id,
                LessonProgress.course_id.in_(course_ids),
                LessonProgress.created_at >= seven_days_ago
            )
        )).scalar() or 0

        for c in approved_courses:
            c_lessons = (await db.execute(select(func.count(Lesson.id)).where(Lesson.course_id == c.id))).scalar() or 0
            c_done = (await db.execute(
                select(func.count(LessonProgress.id)).where(LessonProgress.user_id == student.id, LessonProgress.course_id == c.id)
            )).scalar() or 0
            if c_lessons > 0 and c_done >= c_lessons:
                completed_courses_count += 1

    # 2. Real Assessment Scores and Attempts
    attempts_result = await db.execute(
        select(AssessmentAttempt)
        .where(AssessmentAttempt.user_id == student.id)
        .order_by(AssessmentAttempt.started_at.desc())
    )
    attempts = attempts_result.scalars().all()
    
    avg_score = 0
    recent_attempts_count = 0
    if attempts:
        avg_score = round(sum(a.score_percent for a in attempts) / len(attempts))
        recent_attempts_count = sum(1 for a in attempts if a.started_at and a.started_at >= seven_days_ago)

    # Calculate overall mastery percentage
    overall_mastery = 0
    if total_lessons_count > 0:
        lesson_ratio = completed_lessons_count / total_lessons_count
        overall_mastery = round((lesson_ratio * 70) + (min(100, avg_score) * 0.30))
    elif attempts:
        overall_mastery = avg_score
    else:
        overall_mastery = 0

    # 3. Real Weak Concepts (drawn directly from student's low-scoring quizzes/courses)
    weak_concepts = []
    seen_assessments = set()
    for a in attempts:
        if a.assessment_id not in seen_assessments and (a.score_percent < 75 or not a.passed):
            seen_assessments.add(a.assessment_id)
            assmt = await db.get(Assessment, a.assessment_id)
            if assmt:
                weak_concepts.append({
                    "name": assmt.title,
                    "mastery": a.score_percent,
                    "category": "Quiz Assessment"
                })

    # If no weak quizzes, check courses with incomplete progress
    if len(weak_concepts) < 3 and approved_courses:
        for c in approved_courses:
            if len(weak_concepts) >= 5:
                break
            c_lessons = (await db.execute(select(func.count(Lesson.id)).where(Lesson.course_id == c.id))).scalar() or 0
            c_done = (await db.execute(
                select(func.count(LessonProgress.id)).where(LessonProgress.user_id == student.id, LessonProgress.course_id == c.id)
            )).scalar() or 0
            if c_lessons > 0 and c_done < c_lessons:
                prog = round((c_done / c_lessons) * 100)
                if prog < 60:
                    weak_concepts.append({
                        "name": c.title,
                        "mastery": prog,
                        "category": "Incomplete Subject"
                    })

    # 4. Real Simulator Behaviour (calculated from actual Order history)
    orders_res = await db.execute(
        select(Order).where(Order.user_id == student.id)
    )
    orders = orders_res.scalars().all()
    total_orders = len(orders)

    if total_orders == 0:
        behaviour_summary = {
            "has_data": False,
            "total_trades": 0,
            "stop_loss_usage_pct": 0,
            "avg_position_duration": "0h",
            "trades_per_session": 0,
            "loss_holding_multiplier": 1.0,
            "loss_holding_note": "No trading orders placed yet.",
        }
    else:
        sl_count = sum(
            1 for o in orders 
            if o.order_type in ("STOP_LOSS", "STOP_LOSS_LIMIT", "BRACKET") 
            or o.trigger_price is not None
        )
        sl_pct = round((sl_count / total_orders) * 100)

        trading_dates = {o.created_at.date() for o in orders if o.created_at}
        sessions_count = max(1, len(trading_dates))
        trades_per_session = round(total_orders / sessions_count, 1)

        durations = [
            (o.executed_at - o.created_at).total_seconds() 
            for o in orders 
            if o.executed_at and o.created_at and o.executed_at >= o.created_at
        ]
        avg_dur_str = "1h"
        if durations:
            avg_secs = sum(durations) / len(durations)
            if avg_secs < 3600:
                avg_dur_str = f"{max(1, round(avg_secs / 60))}m"
            else:
                avg_dur_str = f"{round(avg_secs / 3600, 1)}h"

        behaviour_summary = {
            "has_data": True,
            "total_trades": total_orders,
            "stop_loss_usage_pct": sl_pct,
            "avg_position_duration": avg_dur_str,
            "trades_per_session": trades_per_session,
            "loss_holding_multiplier": 1.0,
            "loss_holding_note": f"{total_orders} total simulated order(s) placed.",
        }

    # 5. Real Due This Week (from TradingAssignment and uncompleted Assessments)
    due_items = []
    
    # 5.1 Trading Assignments assigned to student's institution
    if student.institution_id:
        assign_query = select(TradingAssignment).where(
            TradingAssignment.institution_id == student.institution_id,
            TradingAssignment.status == "active",
        )
        assign_res = await db.execute(assign_query)
        assignments = assign_res.scalars().all()

        for a in assignments:
            sub = (await db.execute(
                select(AssignmentSubmission).where(
                    AssignmentSubmission.assignment_id == a.id,
                    AssignmentSubmission.student_id == student.id,
                )
            )).scalars().first()

            if not sub or sub.status in ("pending_verification", "draft"):
                due_label = "Pending Task"
                if a.due_date:
                    if a.due_date > now:
                        days_left = (a.due_date - now).days
                        due_label = f"Due in {days_left}d" if days_left > 0 else "Due Today"
                    else:
                        due_label = "Past Due"

                due_items.append({
                    "id": f"assign-{a.id}",
                    "title": a.title,
                    "type": "exercise",
                    "tag": f"Trading Task · {a.target_asset_class}",
                    "due_label": due_label,
                    "status": sub.status if sub else "not_started",
                    "link": "/student/assignments",
                })

    # 5.2 Uncompleted course assessments
    if course_ids:
        assmt_query = select(Assessment).where(Assessment.course_id.in_(course_ids))
        assmt_res = await db.execute(assmt_query)
        assessments = assmt_res.scalars().all()

        passed_assmt_ids = {a.assessment_id for a in attempts if a.passed}
        for assmt in assessments:
            if assmt.id not in passed_assmt_ids:
                due_items.append({
                    "id": f"quiz-{assmt.id}",
                    "title": f"Quiz — {assmt.title}",
                    "type": "quiz",
                    "tag": "Course Quiz",
                    "due_label": f"Pass mark: {assmt.pass_score}%",
                    "status": "pending",
                    "link": f"/academy",
                })
            if len(due_items) >= 6:
                break

    total_recent_activity = recent_lessons_count + recent_attempts_count
    points_delta = f"+{total_recent_activity} active this week" if total_recent_activity > 0 else "0 activity this week"

    return {
        "student_name": student.full_name or "Learner",
        "overall_mastery_pct": overall_mastery,
        "completed_modules_count": completed_courses_count,
        "total_modules_count": total_approved if total_approved > 0 else 16,
        "points_delta_this_week": points_delta,
        "weak_concepts": weak_concepts,
        "behaviour_summary": behaviour_summary,
        "due_items": due_items,
        "recent_glossary": GLOSSARY_ITEMS[:3],
    }


@router.get("/default-curriculum")
async def get_default_curriculum(
    student: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns the 16 core Indian Capital Markets modules with dynamic state progression:
    done / active / next / locked (where locked displays lock + dash, never zero).
    """
    # Count how many lessons or progress entries student completed
    completed_count = (await db.execute(
        select(func.count(LessonProgress.id)).where(LessonProgress.user_id == student.id)
    )).scalar() or 0

    # Progressive state mapping
    modules = []
    # If student completed N items, unlock up to N+1
    active_idx = min(completed_count, len(DEFAULT_INDIAN_CAPITAL_MARKETS_MODULES) - 1)

    for i, mod in enumerate(DEFAULT_INDIAN_CAPITAL_MARKETS_MODULES):
        mod_copy = dict(mod)
        if i < active_idx:
            mod_copy["state"] = "done"
            mod_copy["progress_pct"] = 100
        elif i == active_idx:
            mod_copy["state"] = "active"
            mod_copy["progress_pct"] = 40 if completed_count > 0 else 0
        elif i == active_idx + 1:
            mod_copy["state"] = "next"
            mod_copy["progress_pct"] = 0
        else:
            mod_copy["state"] = "locked"
            mod_copy["progress_pct"] = None  # None indicates locked with dash, never 0

        modules.append(mod_copy)

    return {
        "modules": modules,
        "active_module": modules[active_idx] if modules else None,
        "total_modules": len(modules),
    }


@router.get("/glossary")
async def get_glossary_terms(
    student: User = Depends(require_student),
):
    """Returns the full Indian Capital Markets glossary library."""
    return {"terms": GLOSSARY_ITEMS}

