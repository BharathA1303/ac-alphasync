"""
Faculty Course Builder API — scoped strictly to the caller's own institution
and their own authored courses.

A faculty member uploads a course (status="pending"); it is only visible to
students once their Institution Admin approves it (see routes/institution_admin.py).
Faculty can always see and edit their own courses regardless of status, but
never another faculty member's courses.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database.connection import get_db
from models.user import User
from models.course import Course, Lesson, Assessment
from dependencies.faculty import require_faculty
from services.invite_service import _as_uuid

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/faculty", tags=["Faculty"])


class CreateCourseRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None


class UpdateCourseRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None


class LessonRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: Optional[str] = None
    order_index: int = 0


class AssessmentRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    instructions: Optional[str] = None
    pass_score: int = Field(default=70, ge=0, le=100)


def _course_out(course: Course, lesson_count: int = 0, assessment_count: int = 0) -> dict:
    return {
        "id": str(course.id),
        "title": course.title,
        "description": course.description,
        "status": course.status,
        "review_note": course.review_note,
        "reviewed_at": course.reviewed_at.isoformat() if course.reviewed_at else None,
        "lesson_count": lesson_count,
        "assessment_count": assessment_count,
        "created_at": course.created_at.isoformat() if course.created_at else None,
        "updated_at": course.updated_at.isoformat() if course.updated_at else None,
    }


async def _get_own_course(db: AsyncSession, faculty: User, course_id: str) -> Course:
    course_uuid = _as_uuid(course_id)
    course = await db.get(Course, course_uuid) if course_uuid else None
    if not course or course.created_by_user_id != faculty.id:
        raise HTTPException(status_code=404, detail="Course not found")
    return course


@router.get("/dashboard")
async def get_faculty_dashboard(
    faculty: User = Depends(require_faculty),
    db: AsyncSession = Depends(get_db),
):
    counts_result = await db.execute(
        select(Course.status, func.count(Course.id))
        .where(Course.created_by_user_id == faculty.id)
        .group_by(Course.status)
    )
    counts = {status: count for status, count in counts_result.all()}
    return {
        "total_courses": sum(counts.values()),
        "pending": counts.get("pending", 0),
        "approved": counts.get("approved", 0),
        "rejected": counts.get("rejected", 0),
    }


@router.get("/courses")
async def list_my_courses(
    faculty: User = Depends(require_faculty),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Course)
        .where(Course.created_by_user_id == faculty.id)
        .order_by(Course.created_at.desc())
    )
    courses = result.scalars().all()

    if not courses:
        return {"courses": []}

    course_ids = [c.id for c in courses]
    lesson_counts_result = await db.execute(
        select(Lesson.course_id, func.count(Lesson.id)).where(Lesson.course_id.in_(course_ids)).group_by(Lesson.course_id)
    )
    lesson_counts = dict(lesson_counts_result.all())
    assessment_counts_result = await db.execute(
        select(Assessment.course_id, func.count(Assessment.id)).where(Assessment.course_id.in_(course_ids)).group_by(Assessment.course_id)
    )
    assessment_counts = dict(assessment_counts_result.all())

    return {
        "courses": [
            _course_out(c, lesson_counts.get(c.id, 0), assessment_counts.get(c.id, 0))
            for c in courses
        ]
    }


@router.post("/courses")
async def create_course(
    req: CreateCourseRequest,
    faculty: User = Depends(require_faculty),
    db: AsyncSession = Depends(get_db),
):
    course = Course(
        institution_id=faculty.institution_id,  # forced server-side
        created_by_user_id=faculty.id,           # forced server-side
        title=req.title.strip(),
        description=(req.description or "").strip() or None,
        status="pending",
    )
    db.add(course)
    await db.commit()
    await db.refresh(course)
    return _course_out(course)


@router.get("/courses/{course_id}")
async def get_course(
    course_id: str,
    faculty: User = Depends(require_faculty),
    db: AsyncSession = Depends(get_db),
):
    course = await _get_own_course(db, faculty, course_id)

    lessons_result = await db.execute(
        select(Lesson).where(Lesson.course_id == course.id).order_by(Lesson.order_index, Lesson.created_at)
    )
    lessons = lessons_result.scalars().all()

    assessments_result = await db.execute(
        select(Assessment).where(Assessment.course_id == course.id).order_by(Assessment.created_at)
    )
    assessments = assessments_result.scalars().all()

    return {
        **_course_out(course, len(lessons), len(assessments)),
        "lessons": [
            {"id": str(l.id), "title": l.title, "content": l.content, "order_index": l.order_index}
            for l in lessons
        ],
        "assessments": [
            {"id": str(a.id), "title": a.title, "instructions": a.instructions, "pass_score": a.pass_score}
            for a in assessments
        ],
    }


@router.patch("/courses/{course_id}")
async def update_course(
    course_id: str,
    req: UpdateCourseRequest,
    faculty: User = Depends(require_faculty),
    db: AsyncSession = Depends(get_db),
):
    course = await _get_own_course(db, faculty, course_id)
    if course.status == "approved":
        raise HTTPException(status_code=400, detail="Approved courses can't be edited — contact your Institution Admin")

    if req.title is not None:
        course.title = req.title.strip()
    if req.description is not None:
        course.description = req.description.strip() or None
    # editing a rejected course resubmits it for review
    if course.status == "rejected":
        course.status = "pending"
        course.review_note = None

    await db.commit()
    await db.refresh(course)
    return _course_out(course)


@router.delete("/courses/{course_id}")
async def delete_course(
    course_id: str,
    faculty: User = Depends(require_faculty),
    db: AsyncSession = Depends(get_db),
):
    course = await _get_own_course(db, faculty, course_id)
    await db.delete(course)
    await db.commit()
    return {"success": True}


@router.post("/courses/{course_id}/lessons")
async def add_lesson(
    course_id: str,
    req: LessonRequest,
    faculty: User = Depends(require_faculty),
    db: AsyncSession = Depends(get_db),
):
    course = await _get_own_course(db, faculty, course_id)
    if course.status == "approved":
        raise HTTPException(status_code=400, detail="Approved courses can't be edited — contact your Institution Admin")

    lesson = Lesson(course_id=course.id, title=req.title.strip(), content=req.content, order_index=req.order_index)
    db.add(lesson)
    await db.commit()
    await db.refresh(lesson)
    return {"id": str(lesson.id), "title": lesson.title, "content": lesson.content, "order_index": lesson.order_index}


@router.delete("/courses/{course_id}/lessons/{lesson_id}")
async def delete_lesson(
    course_id: str,
    lesson_id: str,
    faculty: User = Depends(require_faculty),
    db: AsyncSession = Depends(get_db),
):
    course = await _get_own_course(db, faculty, course_id)
    lesson_uuid = _as_uuid(lesson_id)
    lesson = await db.get(Lesson, lesson_uuid) if lesson_uuid else None
    if not lesson or lesson.course_id != course.id:
        raise HTTPException(status_code=404, detail="Lesson not found")
    await db.delete(lesson)
    await db.commit()
    return {"success": True}


@router.post("/courses/{course_id}/assessments")
async def add_assessment(
    course_id: str,
    req: AssessmentRequest,
    faculty: User = Depends(require_faculty),
    db: AsyncSession = Depends(get_db),
):
    course = await _get_own_course(db, faculty, course_id)
    if course.status == "approved":
        raise HTTPException(status_code=400, detail="Approved courses can't be edited — contact your Institution Admin")

    assessment = Assessment(
        course_id=course.id,
        title=req.title.strip(),
        instructions=req.instructions,
        pass_score=req.pass_score,
    )
    db.add(assessment)
    await db.commit()
    await db.refresh(assessment)
    return {"id": str(assessment.id), "title": assessment.title, "instructions": assessment.instructions, "pass_score": assessment.pass_score}


@router.delete("/courses/{course_id}/assessments/{assessment_id}")
async def delete_assessment(
    course_id: str,
    assessment_id: str,
    faculty: User = Depends(require_faculty),
    db: AsyncSession = Depends(get_db),
):
    course = await _get_own_course(db, faculty, course_id)
    assessment_uuid = _as_uuid(assessment_id)
    assessment = await db.get(Assessment, assessment_uuid) if assessment_uuid else None
    if not assessment or assessment.course_id != course.id:
        raise HTTPException(status_code=404, detail="Assessment not found")
    await db.delete(assessment)
    await db.commit()
    return {"success": True}
