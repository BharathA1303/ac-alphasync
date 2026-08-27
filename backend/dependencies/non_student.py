"""
Non-student dependency — FastAPI Depends() guard allowing every role except
'student' (independent trader, faculty, institution_admin, admin) to reach
platform-wide default AI-generated course content. Students have their own
separate Academy (see routes/student_academy.py) and are excluded here so
the two learning tracks never overlap for the same account.
"""

from fastapi import Depends, HTTPException

from models.user import User
from routes.auth import get_current_user


async def require_non_student(
    user: User = Depends(get_current_user),
) -> User:
    """Require the current user to be any role except 'student'."""
    if user.role == "student":
        raise HTTPException(status_code=403, detail="This section is not available for student accounts")
    return user
