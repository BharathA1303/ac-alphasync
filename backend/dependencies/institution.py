"""
Institution Admin dependencies — FastAPI Depends() guards for institution-scoped routes.

Mirrors dependencies/admin.py's pattern:
  1. get_current_user() (existing) → identity
  2. role='institution_admin' + institution_id set → require_institution_admin()

Every institution-scoped query must filter using the admin's own
institution_id (never a client-supplied value) so Institution Admin A can
never see Institution B's data.
"""

from fastapi import Depends, HTTPException

from models.user import User
from routes.auth import get_current_user


async def require_institution_admin(
    user: User = Depends(get_current_user),
) -> User:
    """Require the current user to be an institution_admin scoped to an institution."""
    if user.role != "institution_admin" or not user.institution_id:
        raise HTTPException(status_code=403, detail="Institution admin access required")
    return user
