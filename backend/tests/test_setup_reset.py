"""Tests for the organization-scoped setup reset endpoint."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, StaticPool
from sqlalchemy.orm import sessionmaker

from app.core.security import create_access_token, hash_password
from app.db.session import get_db
from app.main import app
from app.models.base import Base
from app.models.entities import (
    AcademicClass,
    AcademicSession,
    AssistantProposal,
    Constraint,
    Course,
    Department,
    Faculty,
    Organization,
    Room,
    TimetableEntry,
    TimetableRun,
    User,
)

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def override_get_db():
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)

ORG_ID = "org-reset-test"
OTHER_ORG_ID = "org-reset-other"
ADMIN_ID = "user-reset-admin"
MEMBER_ID = "user-reset-member"
OTHER_USER_ID = "user-reset-other"

SETUP_KEYS = ("institution", "campusMode", "campuses", "availability", "constraints")


def _seed():
    db = TestSessionLocal()
    try:
        db.add_all([
            Organization(
                id=ORG_ID,
                name="Reset Test Org",
                slug="reset-test",
                settings={
                    "institution": {"name": "Old University"},
                    "campusMode": "multiple",
                    "campuses": [{"id": "c1", "name": "Main", "buildings": []}],
                    "availability": {"dayStart": "08:00"},
                    "constraints": {"maxClassesPerDay": 4},
                    "branding": {"accent": "blue"},
                },
            ),
            Organization(
                id=OTHER_ORG_ID,
                name="Other Reset Org",
                slug="reset-other",
                settings={"institution": {"name": "Other University"}},
            ),
        ])
        db.flush()

        db.add_all([
            User(
                id=ADMIN_ID,
                organization_id=ORG_ID,
                email="reset-admin@test.com",
                name="Reset Admin",
                password_hash=hash_password("pass"),
                role="admin",
            ),
            User(
                id=MEMBER_ID,
                organization_id=ORG_ID,
                email="reset-member@test.com",
                name="Reset Member",
                password_hash=hash_password("pass"),
                role="member",
            ),
            User(
                id=OTHER_USER_ID,
                organization_id=OTHER_ORG_ID,
                email="reset-other@test.com",
                name="Other Admin",
                password_hash=hash_password("pass"),
                role="admin",
            ),
        ])

        for org_id, suffix in ((ORG_ID, "a"), (OTHER_ORG_ID, "b")):
            db.add(Department(id=f"dept-{suffix}", organization_id=org_id, name=f"Dept {suffix}"))
            db.add(Course(id=f"course-{suffix}", organization_id=org_id, name=f"Course {suffix}"))
            db.add(Faculty(id=f"faculty-{suffix}", organization_id=org_id, name=f"Faculty {suffix}"))
            db.add(Room(id=f"room-{suffix}", organization_id=org_id, name=f"Room {suffix}", capacity=30))
            db.add(AcademicClass(
                id=f"class-{suffix}",
                organization_id=org_id,
                course_id=f"course-{suffix}",
                name=f"Batch {suffix}",
                metadata_json={"admissionYear": 2024},
            ))
            db.add(AcademicSession(
                id=f"session-{suffix}",
                organization_id=org_id,
                course_id=f"course-{suffix}",
                class_id=f"class-{suffix}",
                subject_name=f"Subject {suffix}",
            ))
            db.add(Constraint(
                id=f"constraint-{suffix}",
                organization_id=org_id,
                name=f"Constraint {suffix}",
                type="max_classes",
            ))

        db.add(TimetableRun(id="run-a", organization_id=ORG_ID, status="COMPLETED"))
        db.add(TimetableRun(id="run-b", organization_id=OTHER_ORG_ID, status="COMPLETED"))
        db.add(AssistantProposal(
            id="proposal-a",
            organization_id=ORG_ID,
            run_id="run-a",
            status="pending",
        ))
        db.add_all([
            TimetableEntry(
                id="entry-a",
                run_id="run-a",
                course_id="course-a",
                faculty_id="faculty-a",
                room_id="room-a",
                day="Monday",
                period=1,
            ),
            TimetableEntry(
                id="entry-b",
                run_id="run-b",
                course_id="course-b",
                faculty_id="faculty-b",
                room_id="room-b",
                day="Tuesday",
                period=2,
            ),
        ])
        db.commit()
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_db():
    previous_override = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db
    Base.metadata.create_all(bind=engine)
    _seed()
    yield
    Base.metadata.drop_all(bind=engine)
    if previous_override is not None:
        app.dependency_overrides[get_db] = previous_override
    else:
        app.dependency_overrides.pop(get_db, None)


def _auth_header(user_id=ADMIN_ID):
    db = TestSessionLocal()
    try:
        user = db.get(User, user_id)
        token = create_access_token(user)
    finally:
        db.close()
    return {"Authorization": f"Bearer {token}"}


def _count(db, model, org_id):
    return len(list(db.scalars(select(model).where(model.organization_id == org_id)).all()))


def test_reset_setup_clears_only_setup_data():
    resp = client.delete(f"/api/v1/organizations/{ORG_ID}/setup", headers=_auth_header())
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["organization_id"] == ORG_ID
    assert body["deleted"] == {
        "academic_sessions": 1,
        "academic_classes": 1,
        "courses": 1,
        "faculty": 1,
        "rooms": 1,
        "departments": 1,
        "constraints": 1,
    }

    db = TestSessionLocal()
    try:
        org = db.get(Organization, ORG_ID)
        assert org is not None
        assert db.get(User, ADMIN_ID) is not None
        assert db.get(User, MEMBER_ID) is not None
        assert db.get(Organization, OTHER_ORG_ID) is not None

        for key in SETUP_KEYS:
            assert key not in org.settings
        assert org.settings == {"branding": {"accent": "blue"}}

        for model in (AcademicClass, AcademicSession, Course, Faculty, Room, Department, Constraint):
            assert _count(db, model, ORG_ID) == 0
            assert _count(db, model, OTHER_ORG_ID) == 1

        run = db.get(TimetableRun, "run-a")
        assert run is not None
        assert db.get(AssistantProposal, "proposal-a") is not None
        entry = db.get(TimetableEntry, "entry-a")
        assert entry is not None
        assert entry.course_id is None
        assert entry.faculty_id is None
        assert entry.room_id is None

        other_entry = db.get(TimetableEntry, "entry-b")
        assert other_entry is not None
        assert other_entry.course_id == "course-b"
        assert other_entry.faculty_id == "faculty-b"
        assert other_entry.room_id == "room-b"
        assert db.get(Organization, OTHER_ORG_ID).settings == {
            "institution": {"name": "Other University"}
        }
    finally:
        db.close()

    setup = client.get(f"/api/v1/organizations/{ORG_ID}/setup", headers=_auth_header())
    assert setup.status_code == 200
    assert setup.json()["institution"]["name"] == ""
    assert setup.json()["campusMode"] == "single"
    assert setup.json()["campuses"] == []


def test_reset_setup_is_idempotent():
    first = client.delete(f"/api/v1/organizations/{ORG_ID}/setup", headers=_auth_header())
    assert first.status_code == 200

    second = client.delete(f"/api/v1/organizations/{ORG_ID}/setup", headers=_auth_header())
    assert second.status_code == 200
    assert second.json()["deleted"] == {
        "academic_sessions": 0,
        "academic_classes": 0,
        "courses": 0,
        "faculty": 0,
        "rooms": 0,
        "departments": 0,
        "constraints": 0,
    }


def test_reset_setup_requires_authentication():
    resp = client.delete(f"/api/v1/organizations/{ORG_ID}/setup")
    assert resp.status_code == 401


def test_reset_setup_requires_admin():
    resp = client.delete(
        f"/api/v1/organizations/{ORG_ID}/setup",
        headers=_auth_header(MEMBER_ID),
    )
    assert resp.status_code == 403


def test_reset_setup_rejects_other_organization():
    resp = client.delete(
        f"/api/v1/organizations/{ORG_ID}/setup",
        headers=_auth_header(OTHER_USER_ID),
    )
    assert resp.status_code == 403


def test_reset_setup_missing_organization_returns_404():
    resp = client.delete(
        "/api/v1/organizations/does-not-exist/setup",
        headers=_auth_header(),
    )
    assert resp.status_code == 404
