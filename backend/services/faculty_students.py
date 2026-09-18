"""Helpers for faculty-to-student assignment scoping."""

from typing import List, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.user import User


def _as_uuid(value) -> Optional[UUID]:
    if isinstance(value, UUID):
        return value
    try:
        return UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None


async def get_faculty_students(
    faculty: User, db: AsyncSession, course_id: Optional[str] = None
) -> List[User]:
    """Active students assigned to this faculty (same institution)."""
    stmt = select(User).where(
        User.role == "student",
        User.is_active == True,  # noqa: E712
        User.assigned_faculty_id == faculty.id,
    )
    if faculty.institution_id:
        stmt = stmt.where(User.institution_id == faculty.institution_id)
    stmt = stmt.order_by(User.full_name.asc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def assign_students_to_faculty(
    db: AsyncSession,
    *,
    institution_id,
    student_ids: list,
    faculty: Optional[User] = None,
) -> dict:
    """Assign many students in one institution to one faculty (or clear)."""
    assigned = 0
    skipped = 0
    target_id = faculty.id if faculty else None
    for raw_id in student_ids or []:
        student_uuid = _as_uuid(raw_id)
        student = await db.get(User, student_uuid) if student_uuid else None
        if (
            not student
            or student.role != "student"
            or student.institution_id != institution_id
        ):
            skipped += 1
            continue
        student.assigned_faculty_id = target_id
        assigned += 1
    await db.flush()
    return {
        "assigned": assigned,
        "skipped": skipped,
        "assigned_faculty_id": str(target_id) if target_id else None,
        "assigned_faculty_name": (faculty.full_name or faculty.username) if faculty else None,
    }
