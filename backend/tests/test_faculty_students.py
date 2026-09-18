"""Tests for faculty student scoping."""

import pytest

from models.user import User
from services.faculty_students import get_faculty_students
from workers.historical_retention_worker import RETENTION_DAYS


def test_practice_retention_is_one_year():
    assert RETENTION_DAYS == 365


@pytest.mark.asyncio
async def test_faculty_only_sees_assigned_students(db):
    faculty_a = User(
        email="fa@test.local",
        username="fa",
        full_name="Faculty A",
        role="faculty",
        is_active=True,
        account_status="active",
    )
    faculty_b = User(
        email="fb@test.local",
        username="fb",
        full_name="Faculty B",
        role="faculty",
        is_active=True,
        account_status="active",
    )
    db.add_all([faculty_a, faculty_b])
    await db.flush()

    student_a = User(
        email="sa@test.local",
        username="sa",
        full_name="Student A",
        role="student",
        is_active=True,
        account_status="active",
        assigned_faculty_id=faculty_a.id,
    )
    student_b = User(
        email="sb@test.local",
        username="sb",
        full_name="Student B",
        role="student",
        is_active=True,
        account_status="active",
        assigned_faculty_id=faculty_b.id,
    )
    db.add_all([student_a, student_b])
    await db.flush()

    seen = await get_faculty_students(faculty_a, db)
    assert [u.username for u in seen] == ["sa"]
