"""Helpers for faculty-to-student assignment scoping."""

from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.user import User


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
