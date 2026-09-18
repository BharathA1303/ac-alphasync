"""Faculty practice date-range APIs — assign a 1-year lookback window to students."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from database.connection import get_db
from dependencies.faculty import require_faculty
from models.user import User
from services import faculty_practice as practice
from services.faculty_students import get_faculty_students

router = APIRouter(prefix="/api/faculty/practice-window", tags=["Faculty Practice Window"])


class SetPracticeWindowRequest(BaseModel):
    start_date: date
    end_date: date


@router.get("/dates")
async def list_practice_dates(
    faculty: User = Depends(require_faculty),
    db: AsyncSession = Depends(get_db),
):
    """Dates faculty may pick (last 365 trading days, with candle availability)."""
    return await practice.list_picker_dates(db)


@router.get("/probe")
async def probe_practice_history(
    faculty: User = Depends(require_faculty),
):
    """Read-only Zebu lookback samples used to bound the faculty date picker."""
    return await practice.probe_zebu_lookback()


@router.get("")
async def get_practice_window(
    faculty: User = Depends(require_faculty),
    db: AsyncSession = Depends(get_db),
):
    window = await practice.get_window_for_faculty(db, faculty.id)
    students = await get_faculty_students(faculty, db)
    return {
        "window": practice.serialize_window(window),
        "download": practice.download_job_for(faculty.id),
        "assigned_student_count": len(students),
        "students": [
            {
                "id": str(s.id),
                "full_name": s.full_name,
                "username": s.username,
                "email": s.email,
            }
            for s in students
        ],
    }


@router.put("")
async def set_practice_window(
    req: SetPracticeWindowRequest,
    faculty: User = Depends(require_faculty),
    db: AsyncSession = Depends(get_db),
):
    if not faculty.institution_id:
        raise HTTPException(status_code=400, detail="Faculty is not attached to an institution")
    result = await practice.set_practice_window(db, faculty, req.start_date, req.end_date)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error") or "Could not save window")
    return result


@router.delete("")
async def clear_practice_window(
    faculty: User = Depends(require_faculty),
    db: AsyncSession = Depends(get_db),
):
    return await practice.clear_practice_window(db, faculty)
