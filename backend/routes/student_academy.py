"""
Student Academy API — browse approved courses for the student's own
institution, read lessons, mark them complete, and take graded MCQ
assessments.

Scoping: a student only ever sees courses where status="approved" and
institution_id matches their own institution_id. Correct-answer flags are
never sent to the client before an attempt is submitted.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database.connection import get_db
from models.user import User
from models.course import (
    Course, Lesson, Assessment, Question, Choice,
    LessonProgress, AssessmentAttempt, AttemptAnswer,
)
from dependencies.student import require_student
from services.invite_service import _as_uuid

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/academy", tags=["Student Academy"])


class SubmitAnswerInput(BaseModel):
    question_id: str
    choice_id: Optional[str] = None


class SubmitAttemptRequest(BaseModel):
    answers: list[SubmitAnswerInput] = Field(default_factory=list)


async def _get_visible_course(db: AsyncSession, student: User, course_id: str) -> Course:
    course_uuid = _as_uuid(course_id)
    course = await db.get(Course, course_uuid) if course_uuid else None
    if not course or course.status != "approved" or course.institution_id != student.institution_id:
        raise HTTPException(status_code=404, detail="Course not found")
    return course


@router.get("/courses")
async def list_available_courses(
    student: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Course)
        .where(Course.status == "approved", Course.institution_id == student.institution_id)
        .order_by(Course.created_at.desc())
    )
    courses = result.scalars().all()
    if not courses:
        return {"courses": []}

    course_ids = [c.id for c in courses]
    lesson_counts = dict((await db.execute(
        select(Lesson.course_id, func.count(Lesson.id)).where(Lesson.course_id.in_(course_ids)).group_by(Lesson.course_id)
    )).all())
    assessment_counts = dict((await db.execute(
        select(Assessment.course_id, func.count(Assessment.id)).where(Assessment.course_id.in_(course_ids)).group_by(Assessment.course_id)
    )).all())

    completed_lessons = dict((await db.execute(
        select(LessonProgress.course_id, func.count(LessonProgress.id))
        .where(LessonProgress.user_id == student.id, LessonProgress.course_id.in_(course_ids))
        .group_by(LessonProgress.course_id)
    )).all())

    best_scores = dict((await db.execute(
        select(AssessmentAttempt.course_id, func.max(AssessmentAttempt.score_percent))
        .where(AssessmentAttempt.user_id == student.id, AssessmentAttempt.course_id.in_(course_ids))
        .group_by(AssessmentAttempt.course_id)
    )).all())

    return {
        "courses": [
            {
                "id": str(c.id),
                "title": c.title,
                "description": c.description,
                "lesson_count": lesson_counts.get(c.id, 0),
                "assessment_count": assessment_counts.get(c.id, 0),
                "lessons_completed": completed_lessons.get(c.id, 0),
                "best_score_percent": best_scores.get(c.id),
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
    course = await _get_visible_course(db, student, course_id)

    lessons_result = await db.execute(
        select(Lesson).where(Lesson.course_id == course.id).order_by(Lesson.order_index, Lesson.created_at)
    )
    lessons = lessons_result.scalars().all()

    progress_result = await db.execute(
        select(LessonProgress.lesson_id).where(LessonProgress.user_id == student.id, LessonProgress.course_id == course.id)
    )
    completed_lesson_ids = {row[0] for row in progress_result.all()}

    assessments_result = await db.execute(
        select(Assessment).where(Assessment.course_id == course.id).order_by(Assessment.created_at)
    )
    assessments = assessments_result.scalars().all()

    question_counts = {}
    if assessments:
        assessment_ids = [a.id for a in assessments]
        question_counts = dict((await db.execute(
            select(Question.assessment_id, func.count(Question.id))
            .where(Question.assessment_id.in_(assessment_ids))
            .group_by(Question.assessment_id)
        )).all())

        best_attempts_result = await db.execute(
            select(AssessmentAttempt)
            .where(AssessmentAttempt.user_id == student.id, AssessmentAttempt.assessment_id.in_(assessment_ids))
            .order_by(AssessmentAttempt.submitted_at.desc())
        )
        latest_by_assessment = {}
        for attempt in best_attempts_result.scalars().all():
            if attempt.assessment_id not in latest_by_assessment:
                latest_by_assessment[attempt.assessment_id] = attempt
    else:
        latest_by_assessment = {}

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
                "completed": l.id in completed_lesson_ids,
            }
            for l in lessons
        ],
        "assessments": [
            {
                "id": str(a.id),
                "title": a.title,
                "instructions": a.instructions,
                "pass_score": a.pass_score,
                "question_count": question_counts.get(a.id, 0),
                "last_attempt": (
                    {
                        "score_percent": latest_by_assessment[a.id].score_percent,
                        "passed": latest_by_assessment[a.id].passed,
                        "submitted_at": latest_by_assessment[a.id].submitted_at.isoformat(),
                    }
                    if a.id in latest_by_assessment else None
                ),
            }
            for a in assessments
        ],
    }


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
    """Returns questions WITHOUT is_correct flags — safe to send before grading."""
    course = await _get_visible_course(db, student, course_id)
    assessment_uuid = _as_uuid(assessment_id)
    assessment = await db.get(Assessment, assessment_uuid) if assessment_uuid else None
    if not assessment or assessment.course_id != course.id:
        raise HTTPException(status_code=404, detail="Assessment not found")

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

    return {
        "assessment": {
            "id": str(assessment.id),
            "title": assessment.title,
            "instructions": assessment.instructions,
            "pass_score": assessment.pass_score,
        },
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
    passed = score_percent >= assessment.pass_score

    attempt = AssessmentAttempt(
        user_id=student.id,
        assessment_id=assessment.id,
        course_id=course.id,
        score_percent=score_percent,
        passed=passed,
        total_questions=total,
        correct_count=correct_count,
    )
    db.add(attempt)
    await db.flush()

    for question_id, choice_id, is_correct in answer_rows:
        db.add(AttemptAnswer(attempt_id=attempt.id, question_id=question_id, choice_id=choice_id, is_correct=is_correct))

    await db.commit()

    return {
        "score_percent": score_percent,
        "passed": passed,
        "correct_count": correct_count,
        "total_questions": total,
        "pass_score": assessment.pass_score,
    }
