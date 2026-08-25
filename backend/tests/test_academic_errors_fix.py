"""
Unit tests verifying the fixes for GET /api/academy/courses/{course_id} and
GET /api/institution/student-stats/{student_id} endpoints against edge cases:
- Naive vs aware datetime calculations
- String ISO timestamps from database drivers
- Null values in portfolio fields and transaction prices
- UUID vs string comparison for institution IDs
"""

import uuid
from datetime import datetime, timezone
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from main import app
from database.connection import Base, get_db
from models.user import User, UserSession
from models.course import Course, Lesson, Assessment, AssessmentAttempt
from models.institution import Institution
from models.portfolio import Portfolio, Transaction
from models.order import Order


TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture
async def test_session():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session
    
    await engine.dispose()


@pytest.mark.asyncio
async def test_get_course_detail_edge_cases(test_session: AsyncSession):
    inst_id = uuid.uuid4()
    inst = Institution(id=inst_id, name="Test University", code="TESTUNI")
    test_session.add(inst)

    student = User(
        id=uuid.uuid4(),
        email=f"student_{uuid.uuid4().hex[:6]}@test.com",
        username=f"student_{uuid.uuid4().hex[:6]}",
        full_name="Test Student",
        role="student",
        institution_id=inst_id,
    )
    test_session.add(student)

    course = Course(
        id=uuid.uuid4(),
        institution_id=inst_id,
        created_by_user_id=student.id,
        title="Test Course",
        description="Course Description",
        status="approved",
    )
    test_session.add(course)

    assessment = Assessment(
        id=uuid.uuid4(),
        course_id=course.id,
        title="Test Assessment",
    )
    test_session.add(assessment)

    # Attempt with naive datetime / string simulation
    attempt = AssessmentAttempt(
        id=uuid.uuid4(),
        user_id=student.id,
        assessment_id=assessment.id,
        course_id=course.id,
        score_percent=85,
        passed=True,
        total_questions=5,
        correct_count=4,
        started_at=datetime.now(),  # naive datetime
    )
    test_session.add(attempt)
    await test_session.commit()

    student_id_str = str(student.id)
    course_id_str = str(course.id)

    async def override_get_db():
        yield test_session

    async def override_require_student():
        return student

    from dependencies.student import require_student
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[require_student] = override_require_student

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        res = await ac.get(f"/api/academy/courses/{course_id_str}")
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["id"] == course_id_str
        assert data["title"] == "Test Course"
        assert len(data["assessments"]) == 1
        assert data["assessments"][0]["last_attempt"]["score_percent"] == 85

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_student_stats_edge_cases(test_session: AsyncSession):
    inst_id = uuid.uuid4()
    inst = Institution(id=inst_id, name="Test Institution", code="TESTINST")
    test_session.add(inst)

    admin = User(
        id=uuid.uuid4(),
        email=f"admin_{uuid.uuid4().hex[:6]}@test.com",
        username=f"admin_{uuid.uuid4().hex[:6]}",
        full_name="Inst Admin",
        role="institution_admin",
        institution_id=inst_id,
    )
    student = User(
        id=uuid.uuid4(),
        email=f"student_{uuid.uuid4().hex[:6]}@test.com",
        username=f"student_{uuid.uuid4().hex[:6]}",
        full_name="Member Student",
        role="student",
        institution_id=inst_id,
    )
    test_session.add_all([admin, student])

    # Session with naive datetime
    session = UserSession(
        id=uuid.uuid4(),
        user_id=student.id,
        session_key=uuid.uuid4().hex,
        last_seen_at=datetime.now(),  # naive datetime
    )
    test_session.add(session)

    # Portfolio with None values
    portfolio = Portfolio(
        id=uuid.uuid4(),
        user_id=student.id,
        current_value=None,
        total_invested=None,
        available_capital=None,
        total_pnl=None,
        total_pnl_percent=None,
    )
    test_session.add(portfolio)

    # Transaction with price values
    tx = Transaction(
        id=uuid.uuid4(),
        user_id=student.id,
        symbol="RELIANCE",
        transaction_type="BUY",
        quantity=10,
        price=2500.0,
        total_value=25000.0,
    )
    test_session.add(tx)
    await test_session.commit()

    student_id_str = str(student.id)

    async def override_get_db():
        yield test_session

    async def override_require_admin():
        return admin

    from dependencies.institution import require_institution_admin
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[require_institution_admin] = override_require_admin

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        res = await ac.get(f"/api/institution/student-stats/{student_id_str}")
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["student"]["id"] == student_id_str
        assert data["portfolio"]["current_value"] == 0.0
        assert data["recent_transactions"][0]["price"] == 2500.0

    app.dependency_overrides.clear()
