"""Seed 3 faculty and 9 students (3 students each) for Academic AlphaSync.

Run inside the backend container or locally with DATABASE_URL set:

    python scripts/seed_demo_cohorts.py
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database.connection import async_session_factory, init_db
from models.institution import Institution
from models.portfolio import Portfolio
from models.user import User
from routes.direct_auth import _hash_password
from config.settings import settings

PASSWORD = os.environ.get("SEED_DEMO_PASSWORD")
if not PASSWORD:
    raise SystemExit("Set SEED_DEMO_PASSWORD before running this seed script.")
INSTITUTION_ADMIN_USERNAME = "devbharath2513"

FACULTY = [
    ("facdemo1", "Faculty Demo One"),
    ("facdemo2", "Faculty Demo Two"),
    ("facdemo3", "Faculty Demo Three"),
]
STUDENTS = [
    ("studemo1", "Student Demo One"),
    ("studemo2", "Student Demo Two"),
    ("studemo3", "Student Demo Three"),
    ("studemo4", "Student Demo Four"),
    ("studemo5", "Student Demo Five"),
    ("studemo6", "Student Demo Six"),
    ("studemo7", "Student Demo Seven"),
    ("studemo8", "Student Demo Eight"),
    ("studemo9", "Student Demo Nine"),
]


async def _get_by_username(db: AsyncSession, username: str) -> User | None:
    result = await db.execute(select(User).where(User.username == username.lower()))
    return result.scalar_one_or_none()


async def _ensure_user(
    db: AsyncSession,
    *,
    username: str,
    full_name: str,
    role: str,
    institution_id,
    assigned_faculty_id=None,
) -> User:
    user = await _get_by_username(db, username)
    if user is None:
        user = User(
            username=username.lower(),
            email=f"{username.lower()}@ac.alphasync.app",
            full_name=full_name,
            password_hash=_hash_password(PASSWORD),
            role=role,
            auth_provider="direct",
            is_verified=True,
            is_active=True,
            account_status="active",
            virtual_capital=settings.DEFAULT_VIRTUAL_CAPITAL,
            institution_id=institution_id,
            assigned_faculty_id=assigned_faculty_id,
        )
        db.add(user)
        await db.flush()
        db.add(
            Portfolio(
                user_id=user.id,
                available_capital=settings.DEFAULT_VIRTUAL_CAPITAL,
            )
        )
        print(f"created {role} {username}")
    else:
        user.role = role
        user.institution_id = institution_id
        user.assigned_faculty_id = assigned_faculty_id
        user.account_status = "active"
        user.is_active = True
        if not user.password_hash:
            user.password_hash = _hash_password(PASSWORD)
        print(f"updated {role} {username}")
    return user


async def seed() -> None:
    await init_db()
    async with async_session_factory() as db:
        admin = await _get_by_username(db, INSTITUTION_ADMIN_USERNAME)
        institution_id = admin.institution_id if admin else None
        if institution_id is None:
            inst = (
                await db.execute(select(Institution).order_by(Institution.created_at.asc()))
            ).scalars().first()
            if inst is None:
                raise SystemExit("No institution found. Create one before seeding.")
            institution_id = inst.id
            print(f"using institution {inst.name}")
        else:
            print(f"using institution of {INSTITUTION_ADMIN_USERNAME}")

        faculty_rows = []
        for username, full_name in FACULTY:
            faculty_rows.append(
                await _ensure_user(
                    db,
                    username=username,
                    full_name=full_name,
                    role="faculty",
                    institution_id=institution_id,
                )
            )

        goat_faculty = await _get_by_username(db, "goat003")
        if goat_faculty:
            goat_faculty.role = "faculty"
            goat_faculty.institution_id = institution_id
            goat_faculty.account_status = "active"

        for index, (username, full_name) in enumerate(STUDENTS):
            faculty = faculty_rows[index // 3]
            await _ensure_user(
                db,
                username=username,
                full_name=full_name,
                role="student",
                institution_id=institution_id,
                assigned_faculty_id=faculty.id,
            )

        goat_student = await _get_by_username(db, "goat004")
        if goat_student and goat_faculty:
            goat_student.role = "student"
            goat_student.institution_id = institution_id
            goat_student.assigned_faculty_id = goat_faculty.id
            goat_student.account_status = "active"

        await db.commit()
        print("seed complete: 3 faculty x 3 students")


if __name__ == "__main__":
    asyncio.run(seed())
