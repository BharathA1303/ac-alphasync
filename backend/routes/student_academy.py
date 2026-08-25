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
from datetime import timedelta
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
        .order_by(Course.created_at.desc())
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

            attempts_result = await db.execute(
                select(AssessmentAttempt)
                .where(AssessmentAttempt.user_id == student.id, AssessmentAttempt.assessment_id.in_(assessment_ids))
                .order_by(AssessmentAttempt.started_at.desc())
            )
            for attempt in attempts_result.scalars().all():
                att_key = str(attempt.assessment_id)
                if att_key not in latest_by_assessment:
                    latest_by_assessment[att_key] = attempt

            grants_result = await db.execute(
                select(AssessmentRetakeGrant.assessment_id).where(
                    AssessmentRetakeGrant.user_id == student.id,
                    AssessmentRetakeGrant.assessment_id.in_(assessment_ids),
                    AssessmentRetakeGrant.consumed.is_(False),
                )
            )
            grant_by_assessment = {str(row[0]): True for row in grants_result.all() if row[0] is not None}

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
                            "flagged": latest_by_assessment[str(a.id)].flagged,
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

    # Create the in-progress attempt row now so the deadline is anchored
    # server-side and can't be reset by refreshing the page.
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
