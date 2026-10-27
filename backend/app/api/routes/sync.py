"""Full-sync endpoint for saving all setup resources at once.

When the frontend wizard saves progress, it sends the complete resource list
(faculty, rooms, courses, classes, sessions) and the backend replaces all
existing resources for the organization atomically.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ...core.security import get_current_user, require_admin_for_writes, require_org_scoped
from ...db.session import get_db
from ...models import AcademicClass, AcademicSession, Course, Faculty, Organization, Room, User

router = APIRouter(tags=["sync"], dependencies=[Depends(require_admin_for_writes)])


class SyncPayload:
    """Pydantic-free dict payload — validated at call site."""
    pass


def _client_id(item: dict) -> str | None:
    value = item.get("client_id") or item.get("id")
    return str(value) if value else None


def _id_map(result: list[dict]) -> dict[str, str]:
    return {item["client_id"]: item["id"] for item in result if item.get("client_id")}


def _upsert_faculty(db: Session, org_id: str, items: list[dict]) -> list[dict]:
    existing = list(db.scalars(select(Faculty).where(Faculty.organization_id == org_id)).all())
    existing_map = {f.name: f for f in existing}
    incoming_names = {item.get("name", "").strip() for item in items}
    result = []
    for item in items:
        name = (item.get("name") or "").strip()
        if not name:
            continue
        if name in existing_map:
            f = existing_map[name]
            for key in ("employee_code", "max_weekly_hours", "availability", "preferences"):
                if key in item:
                    setattr(f, key, item[key])
        else:
            f = Faculty(
                organization_id=org_id,
                name=name,
                employee_code=item.get("employee_code", ""),
                max_weekly_hours=item.get("max_weekly_hours", 18),
                availability=item.get("availability") or {},
                preferences=item.get("preferences") or {},
            )
            db.add(f)
        db.flush()
        result.append({"id": f.id, "name": f.name, "client_id": _client_id(item)})
    for f in existing:
        if f.name not in incoming_names:
            db.delete(f)
    return result


def _upsert_rooms(db: Session, org_id: str, items: list[dict]) -> list[dict]:
    existing = list(db.scalars(select(Room).where(Room.organization_id == org_id)).all())
    # Deduplicate by composite key: (name, campus_id, building_id)
    # Campus and building are stored in the availability JSON field.
    def _room_key(r):
        avail = r.availability or {}
        return (r.name.strip().lower(), str(avail.get("campusId", "")), str(avail.get("buildingId", "")))

    existing_map = {_room_key(r): r for r in existing}
    incoming_keys = set()
    result = []
    for item in items:
        name = (item.get("name") or "").strip()
        if not name:
            continue
        avail = item.get("availability") or {}
        key = (name.strip().lower(), str(avail.get("campusId", "")), str(avail.get("buildingId", "")))
        incoming_keys.add(key)
        if key in existing_map:
            r = existing_map[key]
            r.capacity = item.get("capacity", r.capacity)
            r.room_type = item.get("room_type", r.room_type)
            r.facilities = item.get("facilities") or r.facilities
            r.availability = item.get("availability") or r.availability
        else:
            r = Room(
                organization_id=org_id,
                name=name,
                capacity=item.get("capacity", 30),
                room_type=item.get("room_type", "classroom"),
                facilities=item.get("facilities") or {},
                availability=item.get("availability") or {},
            )
            db.add(r)
        db.flush()
        result.append({"id": r.id, "name": r.name, "client_id": _client_id(item)})
    for r in existing:
        if _room_key(r) not in incoming_keys:
            db.delete(r)
    return result


def _upsert_courses(db: Session, org_id: str, items: list[dict]) -> list[dict]:
    existing = list(db.scalars(select(Course).where(Course.organization_id == org_id)).all())
    existing_map = {c.name: c for c in existing}
    incoming_names = {item.get("name", "").strip() for item in items}
    result = []
    for item in items:
        name = (item.get("name") or "").strip()
        if not name:
            continue
        if name in existing_map:
            c = existing_map[name]
            c.code = item.get("code", c.code)
            c.metadata_json = item.get("metadata_json") or c.metadata_json
        else:
            c = Course(
                organization_id=org_id,
                name=name,
                code=item.get("code", ""),
                metadata_json=item.get("metadata_json") or {},
            )
            db.add(c)
        db.flush()
        result.append({"id": c.id, "name": c.name, "client_id": _client_id(item)})
    for c in existing:
        if c.name not in incoming_names:
            db.delete(c)
    return result


def _upsert_classes(db: Session, org_id: str, items: list[dict], course_id_map: dict[str, str]) -> list[dict]:
    existing = list(db.scalars(select(AcademicClass).where(AcademicClass.organization_id == org_id)).all())
    existing_map = {(c.course_id, c.name): c for c in existing}
    incoming_keys = set()
    result = []
    for item in items:
        name = (item.get("name") or "").strip()
        course_id = course_id_map.get(item.get("course_id") or item.get("courseName") or "")
        if not name:
            continue
        key = (course_id, name)
        incoming_keys.add(key)
        if key in existing_map:
            ac = existing_map[key]
            ac.batch_name = item.get("batch_name", ac.batch_name)
            ac.section_number = item.get("section_number", ac.section_number)
            ac.student_count = item.get("student_count", ac.student_count)
            ac.semester = item.get("semester", ac.semester)
            ac.metadata_json = item.get("metadata_json") or ac.metadata_json
        else:
            ac = AcademicClass(
                organization_id=org_id,
                course_id=course_id,
                name=name,
                batch_name=item.get("batch_name", ""),
                section_number=item.get("section_number", 1),
                student_count=item.get("student_count", 0),
                semester=item.get("semester", 1),
                metadata_json=item.get("metadata_json") or {},
            )
            db.add(ac)
        db.flush()
        result.append({
            "id": ac.id,
            "name": ac.name,
            "course_id": ac.course_id,
            "client_id": _client_id(item),
        })
    for ac in existing:
        if (ac.course_id, ac.name) not in incoming_keys:
            db.delete(ac)
    return result


def _upsert_sessions(db: Session, org_id: str, items: list[dict], course_id_map: dict[str, str], class_id_map: dict[str, str]) -> list[dict]:
    existing = list(db.scalars(select(AcademicSession).where(AcademicSession.organization_id == org_id)).all())
    existing_map = {}
    for s in existing:
        key = (s.course_id, s.subject_code or s.subject_name, s.section_name)
        existing_map[key] = s
    incoming_keys = set()
    result = []
    for item in items:
        name = (item.get("subject_name") or item.get("name") or "").strip()
        code = (item.get("subject_code") or item.get("code") or "").strip()
        course_id = course_id_map.get(item.get("course_id") or item.get("courseName") or "")
        class_id = class_id_map.get(item.get("class_id") or item.get("className") or "")
        section_name = item.get("section_name", "")
        if not name and not code:
            continue
        key = (course_id, code or name, section_name)
        incoming_keys.add(key)
        if key in existing_map:
            s = existing_map[key]
            s.subject_name = name or s.subject_name
            s.weekly_periods = item.get("weekly_periods", s.weekly_periods)
            s.duration_minutes = item.get("duration_minutes", s.duration_minutes)
            s.mode = item.get("mode", s.mode)
            s.student_count = item.get("student_count", s.student_count)
            s.faculty_ids = item.get("faculty_ids") or s.faculty_ids
        else:
            s = AcademicSession(
                organization_id=org_id,
                course_id=course_id,
                subject_name=name,
                subject_code=code,
                class_id=class_id,
                section_name=section_name,
                batch_id=item.get("batch_id", ""),
                weekly_periods=item.get("weekly_periods", 1),
                duration_minutes=item.get("duration_minutes", 60),
                mode=item.get("mode", "theory"),
                student_count=item.get("student_count", 0),
                faculty_ids=item.get("faculty_ids") or [],
            )
            db.add(s)
        db.flush()
        result.append({
            "id": s.id,
            "subject_code": s.subject_code,
            "client_id": _client_id(item),
        })
    for s in existing:
        key = (s.course_id, s.subject_code or s.subject_name, s.section_name)
        if key not in incoming_keys:
            db.delete(s)
    return result


@router.post("/sync")
def full_sync(payload: dict, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Replace all resources for the organization atomically."""
    org_id = payload.get("organization_id")
    if not org_id:
        raise HTTPException(400, "organization_id is required")
    require_org_scoped(org_id, user)
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(404, "Organization not found")

    courses_raw = payload.get("courses") or []
    faculty_raw = payload.get("faculty") or []
    rooms_raw = payload.get("rooms") or []
    classes_raw = payload.get("classes") or []
    sessions_raw = payload.get("sessions") or []

    course_result = _upsert_courses(db, org_id, courses_raw)
    course_id_map = {c["name"]: c["id"] for c in course_result}
    course_id_map.update(_id_map(course_result))

    faculty_result = _upsert_faculty(db, org_id, faculty_raw)
    rooms_result = _upsert_rooms(db, org_id, rooms_raw)

    class_result = _upsert_classes(db, org_id, classes_raw, course_id_map)
    class_id_map = {c["name"]: c["id"] for c in class_result}
    class_id_map.update(_id_map(class_result))

    session_result = _upsert_sessions(db, org_id, sessions_raw, course_id_map, class_id_map)

    db.commit()
    return {
        "status": "ok",
        "courses": len(course_result),
        "faculty": len(faculty_result),
        "rooms": len(rooms_result),
        "classes": len(class_result),
        "sessions": len(session_result),
        "id_map": {
            "courses": _id_map(course_result),
            "faculty": _id_map(faculty_result),
            "rooms": _id_map(rooms_result),
            "classes": _id_map(class_result),
            "sessions": _id_map(session_result),
        },
    }
