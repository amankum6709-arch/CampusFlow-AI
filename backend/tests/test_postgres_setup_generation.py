"""Guardrailed PostgreSQL integration test for setup -> sync -> generation."""
import os
import re
import time
import uuid

import pytest
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

pytest.importorskip("ortools")

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "").strip()
if not TEST_DATABASE_URL:
    pytest.skip(
        "TEST_DATABASE_URL is not set; skipping disposable PostgreSQL integration tests.",
        allow_module_level=True,
    )

test_url = make_url(TEST_DATABASE_URL)
if test_url.drivername not in {"postgresql", "postgresql+psycopg"}:
    pytest.skip("TEST_DATABASE_URL must use PostgreSQL with psycopg.", allow_module_level=True)
if not test_url.database or not re.search(r"(test|tmp|temp|ci|scratch)", test_url.database, re.I):
    pytest.skip("TEST_DATABASE_URL must name a disposable test database.", allow_module_level=True)

app_database_url = os.environ.get("DATABASE_URL")
if app_database_url:
    try:
        if make_url(app_database_url).database == test_url.database:
            pytest.skip("TEST_DATABASE_URL must not point at the application database.", allow_module_level=True)
    except Exception:
        pass

TEST_DATABASE_URL = test_url.set(drivername="postgresql+psycopg").render_as_string(hide_password=False)

from fastapi.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.db.session import get_db
from app.main import app
from app.models.base import Base
from app.models.entities import (
    AcademicClass,
    AcademicSession,
    Course,
    Faculty,
    Organization,
    Room,
    TimetableRun,
    User,
)
from workers.scheduler import runner as scheduler_runner

pytestmark = pytest.mark.postgres


def _seed(session_factory, org_id, user_id):
    db = session_factory()
    try:
        db.add(Organization(id=org_id, name="Postgres Test Org", slug=f"pg-{uuid.uuid4().hex}"))
        db.flush()
        user = User(
            id=user_id,
            organization_id=org_id,
            email=f"{user_id}@test.com",
            name="Postgres Admin",
            password_hash=hash_password("pass"),
            role="admin",
        )
        db.add(user)
        db.commit()
        return {"Authorization": f"Bearer {create_access_token(user)}"}
    finally:
        db.close()


@pytest.fixture
def postgres_api(monkeypatch):
    schema = f"campusflow_test_{uuid.uuid4().hex}"
    admin_engine = create_engine(TEST_DATABASE_URL, isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as conn:
        conn.execute(text(f'CREATE SCHEMA "{schema}"'))

    engine = create_engine(
        TEST_DATABASE_URL,
        connect_args={"options": f"-csearch_path={schema}"},
    )
    session_factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    previous_override = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db
    monkeypatch.setattr(scheduler_runner, "SessionLocal", session_factory)

    org_id = f"org-{uuid.uuid4().hex}"
    user_id = f"user-{uuid.uuid4().hex}"
    headers = _seed(session_factory, org_id, user_id)
    client = TestClient(app)

    try:
        yield client, session_factory, org_id, headers
    finally:
        if previous_override is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = previous_override
        engine.dispose()
        with admin_engine.connect() as conn:
            conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        admin_engine.dispose()


def _sync_payload(org_id):
    return {
        "organization_id": org_id,
        "courses": [
            {"client_id": "client-course", "name": "BSc CS", "code": "BSC"},
        ],
        "faculty": [
            {"client_id": "client-faculty", "name": "Dr Rao", "max_weekly_hours": 12},
        ],
        "rooms": [
            {
                "client_id": "client-room",
                "name": "101",
                "capacity": 40,
                "room_type": "classroom",
                "facilities": {},
                "availability": {"campusId": "campus-1", "buildingId": "building-1"},
            },
        ],
        "classes": [
            {
                "client_id": "client-class",
                "name": "BSc CS Batch A",
                "course_id": "client-course",
                "courseName": "BSc CS",
                "batch_name": "Batch A",
                "section_number": 1,
                "student_count": 30,
                "semester": 1,
            },
        ],
        "sessions": [
            {
                "client_id": "client-session",
                "subject_name": "Mathematics",
                "subject_code": "MTH101",
                "course_id": "client-course",
                "class_id": "client-class",
                "section_name": "Batch A Section 1",
                "weekly_periods": 1,
                "duration_minutes": 60,
                "mode": "theory",
                "student_count": 30,
            },
        ],
    }


def _generation_configuration(id_map):
    return {
        "days": ["Monday"],
        "periods": [1],
        "period_count": 1,
        "day_start": "09:00",
        "day_end": "10:00",
        "period_duration_minutes": 60,
        "allowSaturday": False,
        "time_limit_seconds": 5,
        "num_workers": 2,
        "rooms": [
            {
                "id": id_map["rooms"]["client-room"],
                "name": "101",
                "capacity": 40,
                "room_type": "classroom",
                "facilities": {},
                "timetableAvailable": True,
            },
        ],
        "faculty": [
            {
                "id": id_map["faculty"]["client-faculty"],
                "name": "Dr Rao",
                "max_weekly_hours": 12,
                "availableDays": ["Monday"],
            },
        ],
        "sessions": [
            {
                "id": "client-session:client-class:client-section",
                "courseId": id_map["courses"]["client-course"],
                "facultyIds": [id_map["faculty"]["client-faculty"]],
                "sectionName": "Batch A Section 1",
                "batchId": "client-class",
                "studentCount": 30,
                "weeklyPeriods": 1,
                "mode": "theory",
            },
        ],
    }


def _wait_for_run(client, headers, run_id):
    latest = None
    for _ in range(100):
        response = client.get(f"/api/v1/timetable/runs/{run_id}", headers=headers)
        assert response.status_code == 200, response.text
        latest = response.json()
        if latest["status"] in {"COMPLETED", "FAILED"}:
            return latest
        time.sleep(0.1)
    return latest


def test_setup_sync_generation_writes_valid_postgres_fks(postgres_api):
    client, session_factory, org_id, headers = postgres_api

    synced = client.post("/api/v1/sync", json=_sync_payload(org_id), headers=headers)
    assert synced.status_code == 200, synced.text
    id_map = synced.json()["id_map"]
    assert id_map["courses"]["client-course"] != "client-course"
    assert id_map["faculty"]["client-faculty"] != "client-faculty"
    assert id_map["rooms"]["client-room"] != "client-room"
    assert id_map["classes"]["client-class"] != "client-class"
    assert id_map["sessions"]["client-session"] != "client-session"

    db = session_factory()
    try:
        academic_class = db.get(AcademicClass, id_map["classes"]["client-class"])
        session = db.get(AcademicSession, id_map["sessions"]["client-session"])
        assert academic_class.course_id == id_map["courses"]["client-course"]
        assert session.course_id == id_map["courses"]["client-course"]
        assert session.class_id == academic_class.id
    finally:
        db.close()

    generated = client.post(
        "/api/v1/timetable/generate",
        json={
            "organization_id": org_id,
            "configuration": _generation_configuration(id_map),
        },
        headers=headers,
    )
    assert generated.status_code == 202, generated.text
    run_id = generated.json()["id"]

    run = _wait_for_run(client, headers, run_id)
    assert run is not None
    assert run["status"] == "COMPLETED", run.get("error")

    entries_response = client.get(f"/api/v1/timetable/runs/{run_id}/entries", headers=headers)
    assert entries_response.status_code == 200, entries_response.text
    entries = entries_response.json()
    assert entries
    assert entries[0]["course_name"] == "BSc CS"
    assert entries[0]["faculty_name"] == "Dr Rao"
    assert entries[0]["room_name"] == "101"

    db = session_factory()
    try:
        for entry in entries:
            course = db.get(Course, entry["course_id"])
            faculty = db.get(Faculty, entry["faculty_id"])
            room = db.get(Room, entry["room_id"])
            assert course is not None and course.organization_id == org_id
            assert faculty is not None and faculty.organization_id == org_id
            assert room is not None and room.organization_id == org_id
    finally:
        db.close()


def test_generate_rejects_unknown_ids_in_postgres(postgres_api):
    client, session_factory, org_id, headers = postgres_api

    response = client.post(
        "/api/v1/timetable/generate",
        json={
            "organization_id": org_id,
            "configuration": {
                "rooms": [{"id": "client-room"}],
                "faculty": [{"id": "client-faculty"}],
                "sessions": [{"id": "client-session", "courseId": "client-course"}],
            },
        },
        headers=headers,
    )
    assert response.status_code == 400, response.text
    assert "unknown or cross-organization" in response.json()["detail"].lower()

    db = session_factory()
    try:
        assert db.scalars(select(TimetableRun).where(TimetableRun.organization_id == org_id)).first() is None
    finally:
        db.close()
