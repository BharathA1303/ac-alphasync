"""
Student dependencies — FastAPI Depends() guards for student-scoped routes.

Mirrors dependencies/faculty.py's pattern:
  1. get_current_user() (existing) -> identity
  2. role='student' + institution_id set -> require_student()
"""

from fastapi import Depends, HTTPException

from models.user import User
from routes.auth import get_current_user


async def require_student(
    user: User = Depends(get_current_user),
) -> User:
    """Require the current user to be a student scoped to an institution."""
    if user.role != "student" or not user.institution_id:
        raise HTTPException(status_code=403, detail="Student access required")
    return user
