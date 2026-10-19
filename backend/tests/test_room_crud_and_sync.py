"""Tests for room CRUD, full-sync room upsert, room type persistence, and bulk-delete."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, StaticPool
from sqlalchemy.orm import sessionmaker

from app.db.session import get_db
from app.main import app
from app.models.base import Base
from app.models.entities import Organization, Room, User
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
            name="Room Tester", password_hash=hash_password("pass"),
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


def _auth_header():
    db = TestSessionLocal()
    try:
        user = db.get(User, USER_ID)
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
