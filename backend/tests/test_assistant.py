"""Tests for the action-taking timetable assistant.

Covers: conflict detection (faculty/room/section), clean-timetable
analysis, proposal generation without mutation, approval (apply +
revalidate + duplicate guard), cancellation, staleness, invalid
proposals, locked entries, empty runs, auth, and chat intents.
Uses the same sqlite TestClient pattern as the other API tests.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, StaticPool
from sqlalchemy.orm import sessionmaker

from app.db.session import get_db
from app.main import app
from app.models.base import Base
from app.models.entities import (
    AcademicSession,
    AssistantProposal,
    Course,
    Faculty,
    Organization,
    Room,
    TimetableEntry,
    TimetableRun,
    User,
)
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


try:
    # Restore the sibling API-test module's override after each test so
    # both suites stay order-independent (each module pins its own sqlite
    # engine via app.dependency_overrides at import time).
    from test_room_crud_and_sync import override_get_db as _room_override
except ImportError:  # pragma: no cover - running this module standalone
    _room_override = None

app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)

ORG_ID = "org-assistant-test"
OTHER_ORG_ID = "org-assistant-other"
USER_ID = "user-assistant-test"
OTHER_USER_ID = "user-assistant-other"
MEMBER_ID = "user-assistant-member"
RUN_ID = "run-assistant-1"
EMPTY_RUN_ID = "run-assistant-empty"

CONFIG = {
    "days": ["Monday", "Tuesday"],
    "periods": [1, 2, 3],
    "rooms": [
        {"id": "r1", "capacity": 50},
        {"id": "r2", "capacity": 50},
    ],
    "faculty": [
        {"id": "f1", "max_weekly_hours": 18},
        {"id": "f2", "max_weekly_hours": 18},
    ],
    "sessions": [
        {"id": "s1", "course_id": "c1", "weeklyPeriods": 1},
        {"id": "s2", "course_id": "c1", "weeklyPeriods": 1},
        {"id": "s3", "course_id": "c1", "weeklyPeriods": 1},
        {"id": "s4", "course_id": "c1", "weeklyPeriods": 1},
    ],
}


def _entry(eid, sid, fid, rid, section, day, period, locked=False):
    return TimetableEntry(
        id=eid, run_id=RUN_ID, session_id=sid, unit_id=f"{sid}-unit",
        course_id="c1", faculty_id=fid, room_id=rid, section_name=section,
        batch_id=None, student_count=10, day=day, period=period, locked=locked,
    )


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db
    db = TestSessionLocal()
    try:
        db.add_all([
            Organization(id=ORG_ID, name="Assistant Org", slug="assistant-org"),
            Organization(id=OTHER_ORG_ID, name="Other Org", slug="assistant-other"),
        ])
        db.flush()
        db.add(User(id=USER_ID, organization_id=ORG_ID, email="ai@test.com",
                    name="AI Tester", password_hash=hash_password("pass"), role="admin"))
        db.add(User(id=OTHER_USER_ID, organization_id=OTHER_ORG_ID, email="other@test.com",
                    name="Other", password_hash=hash_password("pass"), role="admin"))
        db.add(User(id=MEMBER_ID, organization_id=ORG_ID, email="member-ai@test.com",
                    name="AI Member", password_hash=hash_password("pass"), role="member"))
        db.add(Course(id="c1", organization_id=ORG_ID, name="BSc CS"))
        db.add_all([
            Faculty(id="f1", organization_id=ORG_ID, name="Dr Sharma"),
            Faculty(id="f2", organization_id=ORG_ID, name="Prof Verma"),
        ])
        db.add_all([
            Room(id="r1", organization_id=ORG_ID, name="A101", capacity=50),
            Room(id="r2", organization_id=ORG_ID, name="A102", capacity=50),
        ])
        db.add_all([
            AcademicSession(id="s1", organization_id=ORG_ID, course_id="c1",
                            subject_name="Mathematics", weekly_periods=1),
            AcademicSession(id="s2", organization_id=ORG_ID, course_id="c1",
                            subject_name="Physics", weekly_periods=1),
            AcademicSession(id="s3", organization_id=ORG_ID, course_id="c1",
                            subject_name="Chemistry", weekly_periods=1),
            AcademicSession(id="s4", organization_id=ORG_ID, course_id="c1",
                            subject_name="Biology", weekly_periods=1),
        ])
        db.add(TimetableRun(id=RUN_ID, organization_id=ORG_ID, status="COMPLETED", configuration=dict(CONFIG)))
        db.add(TimetableRun(id=EMPTY_RUN_ID, organization_id=ORG_ID, status="COMPLETED", configuration=dict(CONFIG)))
        # e1/e2 share faculty f1 at Mon P1; e1/e3 share room r1 at Mon P1;
        # e1/e4 share section A at Mon P1.
        db.add_all([
            _entry("e1", "s1:1", "f1", "r1", "A", "Monday", 1),
            _entry("e2", "s2:1", "f1", "r2", "B", "Monday", 1),
            _entry("e3", "s3:1", "f2", "r1", "C", "Monday", 1),
            _entry("e4", "s4:1", "f2", "r2", "A", "Monday", 2),
        ])
        # e4 shares section A with e1 but at a different slot: no section clash;
        # move it into the clash below in specific tests via direct DB edit.
        db.commit()
    finally:
        db.close()
    yield
    if _room_override is not None:
        app.dependency_overrides[get_db] = _room_override
    else:
        app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)


def _auth(user_id=USER_ID):
    db = TestSessionLocal()
    try:
        token = create_access_token(db.get(User, user_id))
    finally:
        db.close()
    return {"Authorization": f"Bearer {token}"}


def _entries_snapshot():
    db = TestSessionLocal()
    try:
        return sorted(
            (e.id, e.day, e.period, e.faculty_id, e.room_id)
            for e in db.query(TimetableEntry).filter(TimetableEntry.run_id == RUN_ID).all()
        )
    finally:
        db.close()


def _make_section_clash():
    db = TestSessionLocal()
    try:
        e4 = db.get(TimetableEntry, "e4")
        e4.period = 1  # now shares section A slot with e1
        db.commit()
    finally:
        db.close()


# ------------------------------------------------------------------
# Analyze
# ------------------------------------------------------------------

def test_analyze_detects_faculty_and_room_conflicts():
    res = client.post(f"/api/v1/assistant/runs/{RUN_ID}/analyze", headers=_auth())
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["valid"] is False
    types = {c["type"] for c in body["conflicts"]}
    assert "faculty_conflict" in types
    assert "room_conflict" in types
    fac = next(c for c in body["conflicts"] if c["type"] == "faculty_conflict")
    assert fac["severity"] == "high"
    assert set(fac["entry_ids"]) == {"e1", "e2"}
    assert fac["faculty"] == "Dr Sharma"
    assert fac["recommendation"] and fac["constraint"] and fac["explanation"]


def test_analyze_detects_section_conflict():
    _make_section_clash()
    res = client.post(f"/api/v1/assistant/runs/{RUN_ID}/analyze", headers=_auth())
    assert res.status_code == 200
    types = {c["type"] for c in res.json()["conflicts"]}
    assert "section_conflict" in types


def test_analyze_clean_timetable_is_valid():
    db = TestSessionLocal()
    try:
        for eid, period in (("e2", 2), ("e3", 3)):
            db.get(TimetableEntry, eid).period = period
        e4 = db.get(TimetableEntry, "e4")
        e4.day = "Tuesday"
        e4.period = 1
        db.commit()
    finally:
        db.close()
    res = client.post(f"/api/v1/assistant/runs/{RUN_ID}/analyze", headers=_auth())
    assert res.status_code == 200
    body = res.json()
    assert body["valid"] is True
    assert body["conflicts"] == []


def test_analyze_empty_run():
    res = client.post(f"/api/v1/assistant/runs/{EMPTY_RUN_ID}/analyze", headers=_auth())
    assert res.status_code == 200
    body = res.json()
    assert body["metrics"]["entries"] == 0
    # No entries scheduled: the validator truthfully reports the missing
    # sessions (nothing crashes, no conflicts invented).
    assert body["valid"] is False
    assert body["conflicts"], "expected unscheduled-session findings"
    assert {c["type"] for c in body["conflicts"]} <= {"session_units", "course_count"}


# ------------------------------------------------------------------
# Propose (no mutation) + approve / cancel
# ------------------------------------------------------------------

def test_propose_does_not_mutate_and_resolves():
    before = _entries_snapshot()
    res = client.post(f"/api/v1/assistant/runs/{RUN_ID}/propose",
                      json={"intent": "fix_all", "params": {}}, headers=_auth())
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "pending"
    assert body["impact"]["valid"] is True
    assert body["impact"]["new_conflict_count"] == 0
    assert body["impact"]["resolved_count"] > 0
    assert _entries_snapshot() == before  # preview only
    for change in body["changes"]:
        assert change["validation"] == "validated"
        assert change["before"] and change["after"]
        assert change["before"]["day"] and change["after"]["day"]


def test_approve_applies_and_revalidates_and_blocks_duplicates():
    pid = client.post(f"/api/v1/assistant/runs/{RUN_ID}/propose",
                      json={"intent": "fix_all", "params": {}}, headers=_auth()).json()["id"]
    res = client.post(f"/api/v1/assistant/proposals/{pid}/approve", headers=_auth())
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "approved"
    assert body["applied_changes"] > 0
    check = client.post(f"/api/v1/assistant/runs/{RUN_ID}/analyze", headers=_auth()).json()
    assert check["valid"] is True
    again = client.post(f"/api/v1/assistant/proposals/{pid}/approve", headers=_auth())
    assert again.status_code == 409


def test_cancel_leaves_timetable_unchanged():
    before = _entries_snapshot()
    pid = client.post(f"/api/v1/assistant/runs/{RUN_ID}/propose",
                      json={"intent": "fix_all", "params": {}}, headers=_auth()).json()["id"]
    res = client.post(f"/api/v1/assistant/proposals/{pid}/cancel", headers=_auth())
    assert res.status_code == 200
    assert res.json()["status"] == "cancelled"
    assert _entries_snapshot() == before
    # Cancelled proposals cannot be approved.
    assert client.post(f"/api/v1/assistant/proposals/{pid}/approve", headers=_auth()).status_code == 409


def test_stale_proposal_rejected():
    pid = client.post(f"/api/v1/assistant/runs/{RUN_ID}/propose",
                      json={"intent": "fix_all", "params": {}}, headers=_auth()).json()["id"]
    db = TestSessionLocal()
    try:
        db.get(TimetableEntry, "e4").period = 3
        db.commit()
    finally:
        db.close()
    res = client.post(f"/api/v1/assistant/proposals/{pid}/approve", headers=_auth())
    assert res.status_code == 409
    assert "changed" in res.json()["detail"].lower()
    # Staleness is also visible when fetching the proposal.
    fetched = client.get(f"/api/v1/assistant/proposals/{pid}", headers=_auth()).json()
    assert fetched["stale"] is True


def test_invalid_proposal_rejected():
    db = TestSessionLocal()
    try:
        db.add(AssistantProposal(
            id="p-bad", organization_id=ORG_ID, run_id=RUN_ID, intent="fix_all",
            status="pending", base_fingerprint="x",
            changes=[{
                "change_id": "chg-1", "entry_ids": ["e2"],
                "before": {"day": "Monday", "period": 1, "room_id": "r2", "faculty_id": "f1"},
                "after": {"day": "Monday", "period": 1, "room_id": "r1", "faculty_id": "f1"},
            }],
            impact={"valid": False},
        ))
        db.commit()
        fp = client.post(f"/api/v1/assistant/runs/{RUN_ID}/analyze", headers=_auth()).json()["fingerprint"]
        db.get(AssistantProposal, "p-bad").base_fingerprint = fp
        db.commit()
    finally:
        db.close()
    res = client.post("/api/v1/assistant/proposals/p-bad/approve", headers=_auth())
    assert res.status_code == 422


def test_locked_entries_are_not_moved():
    db = TestSessionLocal()
    try:
        db.get(TimetableEntry, "e1").locked = True
        db.commit()
    finally:
        db.close()
    body = client.post(f"/api/v1/assistant/runs/{RUN_ID}/propose",
                       json={"intent": "fix_all", "params": {}}, headers=_auth()).json()
    moved = {eid for ch in body["changes"] for eid in ch["entry_ids"]}
    assert "e1" not in moved
    if body["changes"]:
        res = client.post(f"/api/v1/assistant/proposals/{body['id']}/approve", headers=_auth())
        assert res.status_code == 200


def test_propose_with_unfixable_situation_explains():
    # Lock everything: nothing movable, conflicts remain.
    db = TestSessionLocal()
    try:
        for e in db.query(TimetableEntry).filter(TimetableEntry.run_id == RUN_ID).all():
            e.locked = True
        db.commit()
    finally:
        db.close()
    body = client.post(f"/api/v1/assistant/runs/{RUN_ID}/propose",
                       json={"intent": "fix_all", "params": {}}, headers=_auth()).json()
    assert body["changes"] == []
    assert body["error"]


# ------------------------------------------------------------------
# Auth / chat / misc
# ------------------------------------------------------------------

def test_auth_required_and_org_scoped():
    assert client.post(f"/api/v1/assistant/runs/{RUN_ID}/analyze").status_code in (401, 403)
    res = client.post(f"/api/v1/assistant/runs/{RUN_ID}/analyze", headers=_auth(OTHER_USER_ID))
    assert res.status_code == 403
    res = client.post(f"/api/v1/assistant/runs/{RUN_ID}/propose",
                      json={"intent": "fix_all", "params": {}}, headers=_auth(OTHER_USER_ID))
    assert res.status_code == 403


def test_member_can_read_but_cannot_mutate_assistant():
    member_headers = _auth(MEMBER_ID)

    assert client.post(
        f"/api/v1/assistant/runs/{RUN_ID}/analyze", headers=member_headers
    ).status_code == 200
    assert client.post(
        f"/api/v1/assistant/runs/{RUN_ID}/chat",
        json={"message": "Which faculty has the highest workload?"},
        headers=member_headers,
    ).status_code == 200

    assert client.post(
        f"/api/v1/assistant/runs/{RUN_ID}/propose",
        json={"intent": "fix_all", "params": {}},
        headers=member_headers,
    ).status_code == 403

    pid = client.post(
        f"/api/v1/assistant/runs/{RUN_ID}/propose",
        json={"intent": "fix_all", "params": {}},
        headers=_auth(),
    ).json()["id"]
    before = _entries_snapshot()

    assert client.post(
        f"/api/v1/assistant/proposals/{pid}/approve", headers=member_headers
    ).status_code == 403
    assert client.post(
        f"/api/v1/assistant/proposals/{pid}/cancel", headers=member_headers
    ).status_code == 403
    assert _entries_snapshot() == before
    assert client.get(
        f"/api/v1/assistant/proposals/{pid}", headers=_auth()
    ).json()["status"] == "pending"


def test_chat_fix_intent_returns_action():
    res = client.post(f"/api/v1/assistant/runs/{RUN_ID}/chat",
                      json={"message": "Fix all faculty and room conflicts"},
                      headers=_auth())
    assert res.status_code == 200
    body = res.json()
    assert body["action"] is not None
    assert body["action"]["type"] == "propose"
    assert body["action"]["intent"] == "fix_all"


def test_chat_workload_question_answered_from_data():
    res = client.post(f"/api/v1/assistant/runs/{RUN_ID}/chat",
                      json={"message": "Which faculty has the highest workload?"},
                      headers=_auth())
    assert res.status_code == 200
    body = res.json()
    assert body["action"] is None
    assert "Dr Sharma" in body["answer"]


def test_chat_ambiguous_move_asks_for_clarification():
    res = client.post(f"/api/v1/assistant/runs/{RUN_ID}/chat",
                      json={"message": "Move it to another slot"},
                      headers=_auth())
    assert res.status_code == 200
    body = res.json()
    assert body["action"] is None
    assert "which class" in body["answer"].lower()


def test_chat_what_if_validates_without_mutating():
    before = _entries_snapshot()
    res = client.post(f"/api/v1/assistant/runs/{RUN_ID}/chat",
                      json={"message": "What happens if I move Mathematics to Wednesday?"},
                      headers=_auth())
    assert res.status_code == 200
    assert res.json()["action"] is None
    assert _entries_snapshot() == before


def test_unknown_run_returns_404():
    assert client.post("/api/v1/assistant/runs/does-not-exist/analyze", headers=_auth()).status_code == 404
    assert client.get("/api/v1/assistant/proposals/does-not-exist", headers=_auth()).status_code == 404


def test_proposal_listing():
    client.post(f"/api/v1/assistant/runs/{RUN_ID}/propose",
                json={"intent": "fix_all", "params": {}}, headers=_auth())
    res = client.get(f"/api/v1/assistant/runs/{RUN_ID}/proposals", headers=_auth())
    assert res.status_code == 200
    assert len(res.json()) >= 1
