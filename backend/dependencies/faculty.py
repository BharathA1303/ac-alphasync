"""
Faculty dependencies — FastAPI Depends() guards for faculty-scoped routes.

Mirrors dependencies/institution.py's pattern:
  1. get_current_user() (existing) → identity
  2. role='faculty' + institution_id set → require_faculty()

Every faculty-scoped query must filter using the caller's own
institution_id (never a client-supplied value) and, for course edits,
created_by_user_id, so Faculty A can never see or modify Faculty B's
courses in another institution.
"""

from fastapi import Depends, HTTPException

from models.user import User
from routes.auth import get_current_user


async def require_faculty(
    user: User = Depends(get_current_user),
) -> User:
    """Require the current user to be faculty scoped to an institution."""
    if user.role != "faculty" or not user.institution_id:
        raise HTTPException(status_code=403, detail="Faculty access required")
    return user
