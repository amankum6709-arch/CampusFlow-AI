"""Tests for room CRUD, full-sync room upsert, room type persistence, and bulk-delete."""
from datetime import datetime, timedelta

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, StaticPool
from sqlalchemy.orm import sessionmaker

from app.db.session import get_db
from app.main import app
from app.models.base import Base
from app.models.entities import AcademicClass, AcademicSession, Course, Organization, Room, TimetableRun, User
from app.core.security import create_access_token, hash_password

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

ORG_ID = "org-room-test"
OTHER_ORG_ID = "org-other"
USER_ID = "user-room-test"
MEMBER_ID = "user-room-member"
NULL_ORG_USER_ID = "user-room-no-org"
CAMPUS_ID = "campus-r1"
BUILDING_ID = "building-r1"
BUILDING_ID_2 = "building-r2"


def _setup_data():
    db = TestSessionLocal()
    try:
        db.add_all([
            Organization(id=ORG_ID, name="Room Test Org", slug="room-test"),
            Organization(id=OTHER_ORG_ID, name="Other Org", slug="other-rd"),
        ])
        db.flush()
        db.add(User(
            id=USER_ID, organization_id=ORG_ID, email="room@test.com",
            name="Room Tester", password_hash=hash_password("pass"), role="admin",
        ))
        db.add(User(
            id=MEMBER_ID, organization_id=ORG_ID, email="member@test.com",
            name="Room Member", password_hash=hash_password("pass"), role="member",
        ))
        db.add(User(
            id=NULL_ORG_USER_ID, organization_id=None, email="no-org@test.com",
            name="No Org", password_hash=hash_password("pass"), role="admin",
        ))
        db.commit()
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    _setup_data()
    yield
    Base.metadata.drop_all(bind=engine)


def _auth_header(user_id=USER_ID):
    db = TestSessionLocal()
    try:
        user = db.get(User, user_id)
        token = create_access_token(user)
    finally:
        db.close()
    return {"Authorization": f"Bearer {token}"}


def _create_room(org_id=ORG_ID, name="101", room_type="classroom", capacity=30,
                 campus_id=CAMPUS_ID, building_id=BUILDING_ID):
    db = TestSessionLocal()
    try:
        room = Room(
            organization_id=org_id, name=name, capacity=capacity,
            room_type=room_type, facilities={},
            availability={"campusId": campus_id, "buildingId": building_id},
        )
        db.add(room)
        db.commit()
        db.refresh(room)
        return room.id
    finally:
        db.close()


def _count_rooms(org_id=ORG_ID):
    db = TestSessionLocal()
    try:
        return len(list(db.scalars(select(Room).where(Room.organization_id == org_id)).all()))
    finally:
        db.close()


# ============================================================
# Room CRUD
# ============================================================

def test_create_room():
    resp = client.post(
        "/api/v1/rooms",
        json={
            "organization_id": ORG_ID, "name": "101", "capacity": 60,
            "room_type": "classroom", "facilities": {"projector": True},
            "availability": {"campusId": CAMPUS_ID, "buildingId": BUILDING_ID},
        },
        headers=_auth_header(),
    )
    assert resp.status_code == 201
    assert resp.json()["name"] == "101"
    assert _count_rooms() == 1


def test_list_rooms():
    _create_room(name="101")
    _create_room(name="102")
    resp = client.get(f"/api/v1/rooms?organization_id={ORG_ID}", headers=_auth_header())
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_update_room_type():
    room_id = _create_room(name="101", room_type="classroom")
    resp = client.patch(
        f"/api/v1/rooms/{room_id}?organization_id={ORG_ID}",
        json={"room_type": "laboratory"},
        headers=_auth_header(),
    )
    assert resp.status_code == 200
    assert resp.json()["room_type"] == "laboratory"


def test_delete_room():
    room_id = _create_room(name="101")
    assert _count_rooms() == 1
    resp = client.delete(
        f"/api/v1/rooms/{room_id}?organization_id={ORG_ID}",
        headers=_auth_header(),
    )
    assert resp.status_code == 204
    assert _count_rooms() == 0


# ============================================================
# Full-Sync Room Tests
# ============================================================

def test_full_sync_creates_rooms():
    resp = client.post(
        "/api/v1/sync",
        json={
            "organization_id": ORG_ID,
            "rooms": [
                {"name": "101", "capacity": 60, "room_type": "classroom", "facilities": {}, "availability": {"campusId": CAMPUS_ID, "buildingId": BUILDING_ID}},
                {"name": "102", "capacity": 40, "room_type": "laboratory", "facilities": {"computers": True}, "availability": {"campusId": CAMPUS_ID, "buildingId": BUILDING_ID}},
                {"name": "201", "capacity": 100, "room_type": "auditorium", "facilities": {}, "availability": {"campusId": CAMPUS_ID, "buildingId": BUILDING_ID_2}},
            ],
        },
        headers=_auth_header(),
    )
    assert resp.status_code == 200
    assert resp.json()["rooms"] == 3
    assert _count_rooms() == 3


def test_full_sync_replaces_all_rooms():
    _create_room(name="old-101")
    _create_room(name="old-102")
    assert _count_rooms() == 2

    resp = client.post(
        "/api/v1/sync",
        json={
            "organization_id": ORG_ID,
            "rooms": [
                {"name": "new-201", "capacity": 50, "room_type": "classroom", "facilities": {}, "availability": {"campusId": CAMPUS_ID, "buildingId": BUILDING_ID}},
            ],
        },
        headers=_auth_header(),
    )
    assert resp.status_code == 200
    assert _count_rooms() == 1

    db = TestSessionLocal()
    try:
        room = db.scalars(select(Room).where(Room.organization_id == ORG_ID)).one()
        assert room.name == "new-201"
    finally:
        db.close()


def test_full_sync_preserves_room_type():
    resp = client.post(
        "/api/v1/sync",
        json={
            "organization_id": ORG_ID,
            "rooms": [
                {"name": "lab-101", "capacity": 30, "room_type": "computer_lab", "facilities": {}, "availability": {"campusId": CAMPUS_ID, "buildingId": BUILDING_ID}},
            ],
        },
        headers=_auth_header(),
    )
    assert resp.status_code == 200

    db = TestSessionLocal()
    try:
        room = db.scalars(select(Room).where(Room.organization_id == ORG_ID)).one()
        assert room.room_type == "computer_lab"
    finally:
        db.close()


def test_full_sync_deduplicates_against_existing_db():
    _create_room(name="101", room_type="classroom")
    assert _count_rooms() == 1

    resp = client.post(
        "/api/v1/sync",
        json={
            "organization_id": ORG_ID,
            "rooms": [
                {"name": "101", "capacity": 80, "room_type": "laboratory", "facilities": {}, "availability": {"campusId": CAMPUS_ID, "buildingId": BUILDING_ID}},
            ],
        },
        headers=_auth_header(),
    )
    assert resp.status_code == 200
    assert _count_rooms() == 1

    db = TestSessionLocal()
    try:
        room = db.scalars(select(Room).where(Room.organization_id == ORG_ID)).one()
        assert room.capacity == 80
        assert room.room_type == "laboratory"
    finally:
        db.close()


def test_full_sync_same_name_different_building_keeps_both():
    resp = client.post(
        "/api/v1/sync",
        json={
            "organization_id": ORG_ID,
            "rooms": [
                {"name": "101", "capacity": 60, "room_type": "classroom", "facilities": {}, "availability": {"campusId": CAMPUS_ID, "buildingId": BUILDING_ID}},
                {"name": "101", "capacity": 40, "room_type": "lab", "facilities": {}, "availability": {"campusId": CAMPUS_ID, "buildingId": BUILDING_ID_2}},
            ],
        },
        headers=_auth_header(),
    )
    assert resp.status_code == 200
    assert _count_rooms() == 2


def test_full_sync_empty_rooms_clears_all():
    _create_room(name="101")
    _create_room(name="102")
    assert _count_rooms() == 2

    resp = client.post(
        "/api/v1/sync",
        json={"organization_id": ORG_ID, "rooms": []},
        headers=_auth_header(),
    )
    assert resp.status_code == 200
    assert _count_rooms() == 0


def test_full_sync_preserves_facilities():
    resp = client.post(
        "/api/v1/sync",
        json={
            "organization_id": ORG_ID,
            "rooms": [
                {"name": "101", "capacity": 60, "room_type": "classroom",
                 "facilities": {"projector": True, "smartBoard": False, "computers": True, "ac": True},
                 "availability": {"campusId": CAMPUS_ID, "buildingId": BUILDING_ID}},
            ],
        },
        headers=_auth_header(),
    )
    assert resp.status_code == 200

    db = TestSessionLocal()
    try:
        room = db.scalars(select(Room).where(Room.organization_id == ORG_ID)).one()
        assert room.facilities["projector"] is True
        assert room.facilities["computers"] is True
        assert room.facilities["smartBoard"] is False
    finally:
        db.close()


def test_full_sync_returns_client_id_maps_and_resolves_db_references():
    payload = {
        "organization_id": ORG_ID,
        "courses": [
            {"client_id": "client-course-1", "name": "BSc CS", "code": "BSC"},
        ],
        "faculty": [
            {"client_id": "client-faculty-1", "name": "Dr Rao", "max_weekly_hours": 12},
        ],
        "rooms": [
            {
                "client_id": "client-room-1",
                "name": "101",
                "capacity": 40,
                "room_type": "classroom",
                "availability": {"campusId": CAMPUS_ID, "buildingId": BUILDING_ID},
            },
        ],
        "classes": [
            {
                "client_id": "client-class-1",
                "name": "BSc CS Batch A",
                "course_id": "client-course-1",
                "courseName": "BSc CS",
                "batch_name": "Batch A",
                "section_number": 1,
                "student_count": 30,
                "semester": 1,
            },
        ],
        "sessions": [
            {
                "client_id": "client-session-1",
                "subject_name": "Mathematics",
                "subject_code": "MTH101",
                "course_id": "client-course-1",
                "class_id": "client-class-1",
                "section_name": "Batch A Section 1",
                "weekly_periods": 2,
                "duration_minutes": 60,
                "mode": "theory",
                "student_count": 30,
            },
        ],
    }

    resp = client.post("/api/v1/sync", json=payload, headers=_auth_header())
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "ok"
    assert {key: body[key] for key in ("courses", "faculty", "rooms", "classes", "sessions")} == {
        "courses": 1,
        "faculty": 1,
        "rooms": 1,
        "classes": 1,
        "sessions": 1,
    }

    id_map = body["id_map"]
    for kind, client_id in (
        ("courses", "client-course-1"),
        ("faculty", "client-faculty-1"),
        ("rooms", "client-room-1"),
        ("classes", "client-class-1"),
        ("sessions", "client-session-1"),
    ):
        assert client_id in id_map[kind]
        assert id_map[kind][client_id] != client_id

    db = TestSessionLocal()
    try:
        course = db.get(Course, id_map["courses"]["client-course-1"])
        academic_class = db.get(AcademicClass, id_map["classes"]["client-class-1"])
        session = db.get(AcademicSession, id_map["sessions"]["client-session-1"])
        assert course is not None
        assert academic_class.course_id == course.id
        assert academic_class.course_id != "client-course-1"
        assert session.course_id == course.id
        assert session.class_id == academic_class.id
        assert session.class_id != "client-class-1"
    finally:
        db.close()

    repeated = client.post("/api/v1/sync", json=payload, headers=_auth_header())
    assert repeated.status_code == 200, repeated.text
    assert repeated.json()["id_map"] == id_map
    assert repeated.json()["courses"] == 1
    assert repeated.json()["classes"] == 1
    assert repeated.json()["sessions"] == 1


def test_generate_rejects_unknown_configuration_ids_before_creating_run():
    resp = client.post(
        "/api/v1/timetable/generate",
        json={
            "organization_id": ORG_ID,
            "configuration": {
                "courses": [],
                "rooms": [{"id": "client-room-1"}],
                "faculty": [{"id": "client-faculty-1"}],
                "sessions": [
                    {
                        "id": "client-session-1",
                        "courseId": "client-course-1",
                        "facultyIds": ["client-faculty-1"],
                    },
                ],
            },
        },
        headers=_auth_header(),
    )
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"].lower()
    assert "course ids" in detail
    assert "faculty ids" in detail
    assert "room ids" in detail

    db = TestSessionLocal()
    try:
        assert db.scalars(select(TimetableRun).where(TimetableRun.organization_id == ORG_ID)).first() is None
    finally:
        db.close()


# ============================================================
# Bulk Delete Tests
# ============================================================

def test_bulk_delete_removes_all_building_rooms():
    _create_room(name="101")
    _create_room(name="102")
    _create_room(name="103")
    assert _count_rooms() == 3

    resp = client.post(
        f"/api/v1/rooms/bulk-delete?organization_id={ORG_ID}",
        json={"organization_id": ORG_ID, "campus_id": CAMPUS_ID, "building_id": BUILDING_ID},
        headers=_auth_header(),
    )
    assert resp.status_code == 200
    assert resp.json()["deleted"] == 3
    assert _count_rooms() == 0


def test_bulk_delete_preserves_other_building_rooms():
    _create_room(name="101", building_id=BUILDING_ID)
    _create_room(name="102", building_id=BUILDING_ID)
    _create_room(name="201", building_id=BUILDING_ID_2)

    resp = client.post(
        f"/api/v1/rooms/bulk-delete?organization_id={ORG_ID}",
        json={"organization_id": ORG_ID, "campus_id": CAMPUS_ID, "building_id": BUILDING_ID},
        headers=_auth_header(),
    )
    assert resp.status_code == 200
    assert resp.json()["deleted"] == 2
    assert _count_rooms() == 1


def test_bulk_delete_zero_rooms_returns_zero():
    resp = client.post(
        f"/api/v1/rooms/bulk-delete?organization_id={ORG_ID}",
        json={"organization_id": ORG_ID, "campus_id": CAMPUS_ID, "building_id": BUILDING_ID},
        headers=_auth_header(),
    )
    assert resp.status_code == 200
    assert resp.json()["deleted"] == 0


def test_bulk_delete_wrong_org_forbidden():
    _create_room(org_id=OTHER_ORG_ID, name="X1", campus_id="c", building_id="b")

    resp = client.post(
        f"/api/v1/rooms/bulk-delete?organization_id={OTHER_ORG_ID}",
        json={"organization_id": OTHER_ORG_ID, "campus_id": "c", "building_id": "b"},
        headers=_auth_header(),
    )
    assert resp.status_code == 403


def test_bulk_delete_unauthenticated_returns_401():
    resp = client.post(
        f"/api/v1/rooms/bulk-delete?organization_id={ORG_ID}",
        json={"organization_id": ORG_ID, "campus_id": CAMPUS_ID, "building_id": BUILDING_ID},
    )
    assert resp.status_code == 401


def test_bulk_delete_missing_fields_returns_400():
    resp = client.post(
        f"/api/v1/rooms/bulk-delete?organization_id={ORG_ID}",
        json={"organization_id": ORG_ID},
        headers=_auth_header(),
    )
    assert resp.status_code == 400


def test_bulk_delete_route_not_405():
    resp = client.post(
        f"/api/v1/rooms/bulk-delete?organization_id={ORG_ID}",
        json={},
        headers=_auth_header(),
    )
    assert resp.status_code != 405


# ============================================================
# Authentication, tenant isolation, and RBAC
# ============================================================

def test_new_users_default_to_member_role():
    db = TestSessionLocal()
    try:
        user = User(
            id="user-default-role", organization_id=ORG_ID,
            email="default-role@test.com", name="Default Role",
            password_hash=hash_password("pass"),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        assert user.role == "member"
    finally:
        db.close()


def test_signup_bootstraps_admin():
    resp = client.post(
        "/api/v1/auth/signup",
        json={
            "name": "Signup Admin",
            "email": "signup-admin@test.com",
            "password": "secret1",
            "organization_name": "Signup Org",
        },
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["user"]["role"] == "admin"


def test_member_can_read_resources():
    _create_room(name="member-read")
    resp = client.get(
        f"/api/v1/rooms?organization_id={ORG_ID}",
        headers=_auth_header(MEMBER_ID),
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_member_cannot_mutate_resources():
    room_id = _create_room(name="member-protected")
    member_headers = _auth_header(MEMBER_ID)

    create_resp = client.post(
        "/api/v1/rooms",
        json={"organization_id": ORG_ID, "name": "blocked", "capacity": 30},
        headers=member_headers,
    )
    assert create_resp.status_code == 403
    assert _count_rooms() == 1

    patch_resp = client.patch(
        f"/api/v1/rooms/{room_id}?organization_id={ORG_ID}",
        json={"name": "changed"},
        headers=member_headers,
    )
    assert patch_resp.status_code == 403

    delete_resp = client.delete(
        f"/api/v1/rooms/{room_id}?organization_id={ORG_ID}",
        headers=member_headers,
    )
    assert delete_resp.status_code == 403
    assert _count_rooms() == 1

    bulk_resp = client.post(
        f"/api/v1/rooms/bulk-delete?organization_id={ORG_ID}",
        json={"organization_id": ORG_ID, "campus_id": CAMPUS_ID, "building_id": BUILDING_ID},
        headers=member_headers,
    )
    assert bulk_resp.status_code == 403
    assert _count_rooms() == 1

    db = TestSessionLocal()
    try:
        room = db.get(Room, room_id)
        assert room.name == "member-protected"
    finally:
        db.close()


def test_member_cannot_sync_or_change_setup_or_generate():
    member_headers = _auth_header(MEMBER_ID)

    sync_resp = client.post(
        "/api/v1/sync",
        json={
            "organization_id": ORG_ID,
            "rooms": [{"name": "sync-blocked", "capacity": 30}],
        },
        headers=member_headers,
    )
    assert sync_resp.status_code == 403
    assert _count_rooms() == 0

    setup_resp = client.put(
        f"/api/v1/organizations/{ORG_ID}/setup",
        json={},
        headers=member_headers,
    )
    assert setup_resp.status_code == 403

    gen_resp = client.post(
        "/api/v1/timetable/generate",
        json={"organization_id": ORG_ID, "configuration": {}},
        headers=member_headers,
    )
    assert gen_resp.status_code == 403

    db = TestSessionLocal()
    try:
        assert db.scalars(select(TimetableRun).where(TimetableRun.organization_id == ORG_ID)).first() is None
    finally:
        db.close()


def test_user_without_organization_is_forbidden():
    headers = _auth_header(NULL_ORG_USER_ID)

    assert client.get(
        f"/api/v1/rooms?organization_id={ORG_ID}", headers=headers
    ).status_code == 403
    assert client.get(
        f"/api/v1/organizations/{ORG_ID}/setup", headers=headers
    ).status_code == 403
    assert client.post(
        "/api/v1/sync",
        json={"organization_id": ORG_ID, "rooms": [{"name": "no-org-sync"}]},
        headers=headers,
    ).status_code == 403
    assert _count_rooms() == 0


def test_token_signed_with_wrong_secret_is_rejected():
    token = jwt.encode(
        {
            "sub": USER_ID,
            "exp": datetime.utcnow() + timedelta(minutes=5),
        },
        "wrong-signing-key-that-is-not-configured",
        algorithm="HS256",
    )
    resp = client.get(
        f"/api/v1/rooms?organization_id={ORG_ID}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 401
