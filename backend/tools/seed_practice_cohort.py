"""
Seed 3 faculty + 9 students (3 assigned to each faculty) into the academic DB.

Usage (from backend/):
  python tools/seed_practice_cohort.py --password "YOUR_PASSWORD"

Optional:
  --institution-username devbharath2513
  --dry-run
"""

import argparse
import asyncio
import hashlib
import base64
import os
import sys

from sqlalchemy import select

# Allow running as `python tools/seed_practice_cohort.py` from backend/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.connection import async_session_factory, init_db
from models.institution import Institution
from models.portfolio import Portfolio
from models.user import User
from config.settings import settings


FACULTY = [
    ("goatfac01", "Faculty Alpha", "goatfac01@ac.alphasync.app"),
    ("goatfac02", "Faculty Beta", "goatfac02@ac.alphasync.app"),
    ("goatfac03", "Faculty Gamma", "goatfac03@ac.alphasync.app"),
]

STUDENTS = [
    ("goatstu01", "Student Alpha 1", "goatstu01@ac.alphasync.app", "goatfac01"),
    ("goatstu02", "Student Alpha 2", "goatstu02@ac.alphasync.app", "goatfac01"),
    ("goatstu03", "Student Alpha 3", "goatstu03@ac.alphasync.app", "goatfac01"),
    ("goatstu04", "Student Beta 1", "goatstu04@ac.alphasync.app", "goatfac02"),
    ("goatstu05", "Student Beta 2", "goatstu05@ac.alphasync.app", "goatfac02"),
    ("goatstu06", "Student Beta 3", "goatstu06@ac.alphasync.app", "goatfac02"),
    ("goatstu07", "Student Gamma 1", "goatstu07@ac.alphasync.app", "goatfac03"),
    ("goatstu08", "Student Gamma 2", "goatstu08@ac.alphasync.app", "goatfac03"),
    ("goatstu09", "Student Gamma 3", "goatstu09@ac.alphasync.app", "goatfac03"),
]


def _hash_password(password: str) -> str:
    salt = base64.b64encode(os.urandom(16)).decode()
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 260000)
    return f"{salt}${base64.b64encode(dk).decode()}"


async def _get_or_create_user(db, *, username, email, full_name, role, institution_id, password_hash, assigned_faculty_id=None):
    existing = (
        await db.execute(select(User).where(User.username == username.lower()))
    ).scalar_one_or_none()
    if existing:
        existing.role = role
        existing.institution_id = institution_id
        existing.assigned_faculty_id = assigned_faculty_id
        existing.account_status = "active"
        existing.is_active = True
        existing.is_verified = True
        existing.full_name = full_name
        existing.email = email
        if password_hash:
            existing.password_hash = password_hash
        await db.flush()
        return existing, False

    user = User(
        username=username.lower(),
        email=email.lower(),
        full_name=full_name,
        role=role,
        institution_id=institution_id,
        assigned_faculty_id=assigned_faculty_id,
        password_hash=password_hash,
        auth_provider="direct",
        is_verified=True,
        is_active=True,
        account_status="active",
        virtual_capital=settings.DEFAULT_VIRTUAL_CAPITAL,
    )
    db.add(user)
    await db.flush()
    db.add(
        Portfolio(
            user_id=user.id,
            available_capital=settings.DEFAULT_VIRTUAL_CAPITAL,
        )
    )
    await db.flush()
    return user, True


async def seed(password: str, institution_username: str, dry_run: bool) -> int:
    await init_db()
    async with async_session_factory() as db:
        anchor = (
            await db.execute(
                select(User).where(User.username == institution_username.lower())
            )
        ).scalar_one_or_none()
        if not anchor or not anchor.institution_id:
            inst = (await db.execute(select(Institution).limit(1))).scalar_one_or_none()
            if not inst:
                print("No institution found. Create one before seeding.")
                return 1
            institution_id = inst.id
            print(f"Using first institution: {inst.name} ({inst.id})")
        else:
            institution_id = anchor.institution_id
            print(f"Using institution of {institution_username}: {institution_id}")

        password_hash = _hash_password(password)
        faculty_ids = {}

        for username, full_name, email in FACULTY:
            user, created = await _get_or_create_user(
                db,
                username=username,
                email=email,
                full_name=full_name,
                role="faculty",
                institution_id=institution_id,
                password_hash=password_hash,
            )
            faculty_ids[username] = user.id
            print(f"{'created' if created else 'updated'} faculty {username}")

        for username, full_name, email, faculty_username in STUDENTS:
            user, created = await _get_or_create_user(
                db,
                username=username,
                email=email,
                full_name=full_name,
                role="student",
                institution_id=institution_id,
                password_hash=password_hash,
                assigned_faculty_id=faculty_ids[faculty_username],
            )
            print(
                f"{'created' if created else 'updated'} student {username} -> {faculty_username}"
            )

        if dry_run:
            await db.rollback()
            print("Dry run: rolled back.")
            return 0

        await db.commit()
        print("Seeded 3 faculty and 9 students (3 each).")
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed faculty/student practice cohort")
    parser.add_argument("--password", required=True, help="Login password for seeded accounts")
    parser.add_argument(
        "--institution-username",
        default="devbharath2513",
        help="Existing institution admin username used to pick institution_id",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    return asyncio.run(seed(args.password, args.institution_username, args.dry_run))


if __name__ == "__main__":
    raise SystemExit(main())
