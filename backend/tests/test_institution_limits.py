"""
Unit tests for Institution Role Limits and Quota Enforcement.
Covers:
- Super Admin setting and updating limits (institution admin, faculty, students)
- Super Admin invite generation blocked when institution admin limit is reached
- Institution Admin invite generation blocked when faculty or student limit is reached
- Invite token validation and consumption blocked when capacity is reached
- Institution dashboard reporting quota limits and usage
"""

import uuid
from datetime import datetime, timezone
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from main import app
from database.connection import Base, get_db
from models.user import User
from models.institution import Institution
from models.invite_link import InviteLink
from services import invite_service
from dependencies.admin import get_admin_user
from dependencies.institution import require_institution_admin


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
async def test_create_and_update_institution_limits(test_session: AsyncSession):
    admin = User(
        id=uuid.uuid4(),
        email="superadmin@test.com",
        username="superadmin",
        full_name="Super Admin",
        role="admin",
        admin_level="root",
    )
    test_session.add(admin)
    await test_session.commit()

    async def override_get_db():
        yield test_session

    async def override_get_admin():
        return admin

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_admin_user] = override_get_admin

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Create institution with custom limits
        res = await ac.post(
            "/api/admin/academic/institutions",
            json={
                "name": "MIT World",
                "code": "MITW",
                "email_domain": "mitworld.edu",
                "max_institution_admins": 3,
                "max_faculty": 10,
                "max_students": 50,
            },
        )
        assert res.status_code == 200, res.text
        data = res.json()
        inst = data["institution"]
        assert inst["max_institution_admins"] == 3
        assert inst["max_faculty"] == 10
        assert inst["max_students"] == 50
        inst_id = inst["id"]

        # Update limits
        patch_res = await ac.patch(
            f"/api/admin/academic/institutions/{inst_id}",
            json={
                "max_institution_admins": 4,
                "max_faculty": 15,
                "max_students": 100,
            },
        )
        assert patch_res.status_code == 200, patch_res.text
        updated = patch_res.json()["institution"]
        assert updated["max_institution_admins"] == 4
        assert updated["max_faculty"] == 15
        assert updated["max_students"] == 100

        # Get institution details
        get_res = await ac.get(f"/api/admin/academic/institutions/{inst_id}")
        assert get_res.status_code == 200
        inst_details = get_res.json()["institution"]
        assert inst_details["max_institution_admins"] == 4
        assert inst_details["max_faculty"] == 15
        assert inst_details["max_students"] == 100

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_super_admin_invite_quota_enforcement(test_session: AsyncSession):
    inst_id = uuid.uuid4()
    inst = Institution(
        id=inst_id,
        name="Apex University",
        code="APEX",
        max_institution_admins=1,  # limit is 1
        max_faculty=5,
        max_students=10,
    )
    test_session.add(inst)

    super_admin = User(
        id=uuid.uuid4(),
        email="super@test.com",
        username="super",
        full_name="Super Admin",
        role="admin",
    )
    test_session.add(super_admin)
    await test_session.commit()

    # When no institution admins exist yet (0/1), creating an invite link succeeds
    link_res = await invite_service.create_invite_link(
        test_session,
        institution_id=inst_id,
        target_role="institution_admin",
        created_by_user_id=super_admin.id,
        expires_in_hours=24,
    )
    assert link_res["success"] is True
    token = link_res["invite_link"]["token"]

    # Validate token works
    val = await invite_service.validate_invite_token(test_session, token)
    assert val["valid"] is True

    # User consumes token and registers as institution admin
    new_admin = User(
        id=uuid.uuid4(),
        email="instadmin@test.com",
        username="instadmin",
        full_name="Inst Admin",
        role="user",
    )
    test_session.add(new_admin)
    await test_session.commit()

    consumed = await invite_service.consume_invite_token(test_session, token, new_admin)
    assert consumed["valid"] is True
    assert new_admin.role == "institution_admin"
    assert new_admin.institution_id == inst_id
    await test_session.commit()

    # Now institution admin count is 1/1 (limit reached!)
    # Attempting to create another institution_admin invite link should fail:
    link_res2 = await invite_service.create_invite_link(
        test_session,
        institution_id=inst_id,
        target_role="institution_admin",
        created_by_user_id=super_admin.id,
        expires_in_hours=24,
    )
    assert link_res2["success"] is False
    assert "limit reached (1/1)" in link_res2["error"].lower()

    # Existing token validation should also report capacity reached
    val2 = await invite_service.validate_invite_token(test_session, token)
    assert val2["valid"] is False
    assert "limit reached" in val2["reason"].lower()


@pytest.mark.asyncio
async def test_institution_admin_faculty_student_quota_enforcement(test_session: AsyncSession):
    inst_id = uuid.uuid4()
    inst = Institution(
        id=inst_id,
        name="Tech Institute",
        code="TECH",
        max_institution_admins=2,
        max_faculty=1,  # limit is 1
        max_students=2,  # limit is 2
    )
    test_session.add(inst)

    inst_admin = User(
        id=uuid.uuid4(),
        email="techadmin@test.com",
        username="techadmin",
        full_name="Tech Admin",
        role="institution_admin",
        institution_id=inst_id,
    )
    test_session.add(inst_admin)
    await test_session.commit()

    # 1. Create Faculty invite (0/1 allowed)
    fac_link = await invite_service.create_invite_link(
        test_session,
        institution_id=inst_id,
        target_role="faculty",
        created_by_user_id=inst_admin.id,
        expires_in_hours=24,
    )
    assert fac_link["success"] is True
    fac_token = fac_link["invite_link"]["token"]

    # Consume faculty invite
    faculty_user = User(
        id=uuid.uuid4(),
        email="prof@test.com",
        username="prof",
        full_name="Professor",
        role="user",
    )
    test_session.add(faculty_user)
    await test_session.commit()

    consumed_fac = await invite_service.consume_invite_token(test_session, fac_token, faculty_user)
    assert consumed_fac["valid"] is True
    assert faculty_user.role == "faculty"
    await test_session.commit()

    # Now faculty is 1/1. Creating another faculty invite must fail!
    fac_link2 = await invite_service.create_invite_link(
        test_session,
        institution_id=inst_id,
        target_role="faculty",
        created_by_user_id=inst_admin.id,
        expires_in_hours=24,
    )
    assert fac_link2["success"] is False
    assert "faculty limit reached (1/1)" in fac_link2["error"].lower()

    # 2. Add students up to limit (max 2)
    # First student
    stu1 = User(id=uuid.uuid4(), email="s1@test.com", username="s1", full_name="Student 1", role="student", institution_id=inst_id)
    test_session.add(stu1)
    await test_session.commit()

    # Can still create student invite when 1/2
    stu_link = await invite_service.create_invite_link(
        test_session,
        institution_id=inst_id,
        target_role="student",
        created_by_user_id=inst_admin.id,
        expires_in_hours=24,
    )
    assert stu_link["success"] is True

    # Second student (reaching 2/2)
    stu2 = User(id=uuid.uuid4(), email="s2@test.com", username="s2", full_name="Student 2", role="student", institution_id=inst_id)
    test_session.add(stu2)
    await test_session.commit()

    # Now students are 2/2. Creating student invite must fail!
    stu_link_overflow = await invite_service.create_invite_link(
        test_session,
        institution_id=inst_id,
        target_role="student",
        created_by_user_id=inst_admin.id,
        expires_in_hours=24,
    )
    assert stu_link_overflow["success"] is False
    assert "student limit reached (2/2)" in stu_link_overflow["error"].lower()


@pytest.mark.asyncio
async def test_institution_dashboard_returns_quotas(test_session: AsyncSession):
    inst_id = uuid.uuid4()
    inst = Institution(
        id=inst_id,
        name="Global College",
        code="GLO",
        max_institution_admins=3,
        max_faculty=12,
        max_students=150,
    )
    test_session.add(inst)

    inst_admin = User(
        id=uuid.uuid4(),
        email="gadmin@test.com",
        username="gadmin",
        full_name="Global Admin",
        role="institution_admin",
        institution_id=inst_id,
    )
    test_session.add(inst_admin)
    await test_session.commit()

    async def override_get_db():
        yield test_session

    async def override_require_admin():
        return inst_admin

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[require_institution_admin] = override_require_admin

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/api/institution/dashboard")
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["institution_id"] == str(inst_id)
        assert data["institution_name"] == "Global College"
        assert data["max_institution_admins"] == 3
        assert data["max_faculty"] == 12
        assert data["max_students"] == 150
        assert data["total_faculty"] == 0
        assert data["total_students"] == 0

    app.dependency_overrides.clear()
