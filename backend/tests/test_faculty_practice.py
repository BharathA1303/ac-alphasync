"""Faculty student assignment, practice windows, and overlay quotes."""

import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from models.faculty_practice import WINDOW_ACTIVE, FacultyPracticeWindow
from models.institution import Institution
from models.market_data import HistoricalCandle, Instrument
from models.portfolio import Portfolio
from models.user import User
from services.faculty_students import get_faculty_students
from services.historical_downloader import is_trading_day, trading_days_between
from services import faculty_practice as practice
from workers.historical_retention_worker import RETENTION_DAYS


async def _make_institution(db, name="Practice Uni"):
    inst = Institution(
        name=name,
        code=f"{name[:6].upper().replace(' ', '')}{uuid.uuid4().hex[:6]}",
    )
    db.add(inst)
    await db.flush()
    return inst


async def _make_user(db, role, institution_id, username, assigned_faculty_id=None):
    user = User(
        username=username,
        email=f"{username}@test.ac.alphasync.app",
        full_name=username.replace("_", " ").title(),
        role=role,
        institution_id=institution_id,
        assigned_faculty_id=assigned_faculty_id,
        account_status="active",
        is_active=True,
        virtual_capital=1000000,
    )
    db.add(user)
    await db.flush()
    db.add(Portfolio(user_id=user.id, available_capital=1000000))
    await db.flush()
    return user


@pytest.mark.asyncio
class TestFacultyStudentScoping:
    async def test_faculty_only_sees_assigned_students(self, db):
        inst = await _make_institution(db)
        fac_a = await _make_user(db, "faculty", inst.id, "fac_a")
        fac_b = await _make_user(db, "faculty", inst.id, "fac_b")
        s1 = await _make_user(db, "student", inst.id, "stu_a1", fac_a.id)
        await _make_user(db, "student", inst.id, "stu_a2", fac_a.id)
        await _make_user(db, "student", inst.id, "stu_b1", fac_b.id)
        await _make_user(db, "student", inst.id, "stu_unassigned")

        a_students = await get_faculty_students(fac_a, db)
        b_students = await get_faculty_students(fac_b, db)
        assert {s.username for s in a_students} == {"stu_a1", "stu_a2"}
        assert {s.username for s in b_students} == {"stu_b1"}
        assert s1.id in {s.id for s in a_students}


@pytest.mark.asyncio
class TestPracticeWindow:
    async def test_rejects_range_older_than_one_year(self, db):
        inst = await _make_institution(db, "Window Uni")
        faculty = await _make_user(db, "faculty", inst.id, "fac_window")
        too_old = practice.practice_min_date() - timedelta(days=1)
        result = await practice.set_practice_window(
            db, faculty, too_old, too_old + timedelta(days=2)
        )
        assert result["success"] is False
        assert "last" in (result.get("error") or "").lower() or "365" in (result.get("error") or "")

    async def test_saves_window_inside_lookback(self, db):
        inst = await _make_institution(db, "Window Uni 2")
        faculty = await _make_user(db, "faculty", inst.id, "fac_window2")
        end = practice.practice_max_date()
        start = end
        for _ in range(14):
            if is_trading_day(start):
                break
            start = start - timedelta(days=1)
            end = start
        result = await practice.set_practice_window(db, faculty, start, end)
        assert result["success"] is True
        window = (
            await db.execute(
                select(FacultyPracticeWindow).where(
                    FacultyPracticeWindow.faculty_id == faculty.id
                )
            )
        ).scalar_one()
        assert window.status == WINDOW_ACTIVE
        assert window.start_date == start


@pytest.mark.asyncio
class TestOverlayQuote:
    async def test_assigned_student_gets_faculty_candle_not_global(self, db):
        inst = await _make_institution(db, "Overlay Uni")
        faculty = await _make_user(db, "faculty", inst.id, "fac_overlay")
        student = await _make_user(db, "student", inst.id, "stu_overlay", faculty.id)
        trading_day = date(2026, 9, 17)
        inst_row = Instrument(
            token="1111",
            trading_symbol="RELIANCE-EQ",
            exchange="NSE",
            instrument_type="EQUITY",
        )
        db.add(inst_row)
        await db.flush()
        bar_time = datetime(2026, 9, 17, 3, 45, tzinfo=timezone.utc)
        db.add(
            HistoricalCandle(
                instrument_id=inst_row.id,
                trading_date=trading_day,
                timestamp=bar_time,
                open=100,
                high=110,
                low=99,
                close=105,
                volume=1000,
                source="zebu_tp_series",
            )
        )
        window = FacultyPracticeWindow(
            faculty_id=faculty.id,
            institution_id=inst.id,
            start_date=trading_day,
            end_date=trading_day,
            current_date=trading_day,
            status=WINDOW_ACTIVE,
        )
        db.add(window)
        await db.flush()

        await practice.refresh_overlay_index(db)
        assert practice.is_overlay_user(str(student.id))
        quote = await practice.quote_for_user(db, str(student.id), "RELIANCE.NS")
        assert quote is not None
        assert float(quote["price"]) == 105.0
        assert quote["source"] == "faculty_practice"

        outsider = await _make_user(db, "student", inst.id, "stu_global")
        assert practice.is_overlay_user(str(outsider.id)) is False
        assert await practice.quote_for_user(db, str(outsider.id), "RELIANCE.NS") is None


def test_retention_matches_practice_lookback():
    assert RETENTION_DAYS == 365
    assert practice.practice_min_date(date(2026, 9, 18)) == date(2025, 9, 18)


def test_trading_days_skip_weekends():
    days = trading_days_between(date(2026, 9, 18), date(2026, 9, 21))
    # Fri 18, skip Sat 19 Sun 20, Mon 21
    assert date(2026, 9, 19) not in days
    assert date(2026, 9, 20) not in days
    assert date(2026, 9, 18) in days
    assert date(2026, 9, 21) in days
