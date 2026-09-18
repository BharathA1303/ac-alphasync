"""Tests for faculty student scoping."""

import uuid

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


@pytest.mark.asyncio
async def test_bulk_assign_students_to_one_faculty(db):
    from models.institution import Institution
    from services.faculty_students import assign_students_to_faculty

    inst = Institution(name="Bulk Uni", code=f"BU{uuid.uuid4().hex[:6]}")
    db.add(inst)
    await db.flush()
    faculty = User(
        email="bulkfac@test.local",
        username="bulkfac",
        full_name="Bulk Faculty",
        role="faculty",
        is_active=True,
        account_status="active",
        institution_id=inst.id,
    )
    s1 = User(
        email="bs1@test.local",
        username="bs1",
        full_name="Bulk Student 1",
        role="student",
        is_active=True,
        account_status="active",
        institution_id=inst.id,
    )
    s2 = User(
        email="bs2@test.local",
        username="bs2",
        full_name="Bulk Student 2",
        role="student",
        is_active=True,
        account_status="active",
        institution_id=inst.id,
    )
    db.add_all([faculty, s1, s2])
    await db.flush()

    result = await assign_students_to_faculty(
        db,
        institution_id=inst.id,
        student_ids=[str(s1.id), str(s2.id)],
        faculty=faculty,
    )
    assert result["assigned"] == 2
    seen = await get_faculty_students(faculty, db)
    assert {u.username for u in seen} == {"bs1", "bs2"}
