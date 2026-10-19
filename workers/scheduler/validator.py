"""Independent timetable validator.

The validator intentionally does not reuse CP-SAT constraints. It is a second,
plain-Python line of defence that checks hard scheduling rules on the generated
result and can also validate imported/manual timetables.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any


def _available(resource: dict[str, Any], day: str, period: int) -> bool:
    availability = resource.get("availability") or {}
    days = resource.get("availableDays") or availability.get("days")
    if days and day not in days:
        return False
    if day in (resource.get("leaveDates") or resource.get("leave_dates") or []):
        return False
    return not any(str(x.get("day")) == day and int(x.get("period", -1)) == period for x in availability.get("blocked", []) or [])


def _room_matches(room: dict[str, Any], session: dict[str, Any], student_count: int) -> list[str]:
    errors = []
    if not room.get("timetableAvailable", True):
        errors.append("room_not_available_for_timetable")
    if int(room.get("capacity", 0)) < student_count:
        errors.append("room_capacity")
    required_type = session.get("room_type")
    actual_type = room.get("room_type", room.get("roomType"))
    if required_type and str(actual_type).lower() != str(required_type).lower():
        errors.append("room_type")
    facilities = room.get("facilities") or {}
    if any(not facilities.get(f) for f in session.get("required_facilities", [])):
        errors.append("room_facility")
    return errors


def validate_entries(
    entries: list[dict[str, Any]],
    *,
    sessions: list[dict[str, Any]] | None = None,
    rooms: list[dict[str, Any]] | None = None,
    faculty: list[dict[str, Any]] | None = None,
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    config = config or {}
    errors: list[str] = []
    warnings: list[str] = []
    rooms_by_id = {str(r.get("id")): r for r in (rooms or [])}
    faculty_by_id = {str(f.get("id")): f for f in (faculty or [])}
    sessions_by_id = {str(s.get("id")): s for s in (sessions or [])}

    room_slots = Counter()
    faculty_slots = Counter()
    section_slots = defaultdict(list)
    batch_slots = defaultdict(list)
    course_counts = Counter()
    session_units = defaultdict(list)
    faculty_day = Counter()
    faculty_week = Counter()

    for entry in entries:
        day = entry.get("day")
        period = int(entry.get("period"))
        room_id = str(entry.get("room_id") or entry.get("roomId") or "")
        faculty_id = str(entry.get("faculty_id") or entry.get("facultyId") or "")
        section = entry.get("section_name") or entry.get("sectionName")
        batch = entry.get("batch_id") or entry.get("batchId")
        course_id = entry.get("course_id") or entry.get("courseId")
        sid = entry.get("session_id") or entry.get("sessionId")

        room_slots[(room_id, day, period)] += 1
        if faculty_id:
            faculty_slots[(faculty_id, day, period)] += 1
            faculty_day[(faculty_id, day)] += 1
            faculty_week[faculty_id] += 1
        if section:
            section_slots[(str(section), day, period)].append(str(sid or course_id))
        if batch:
            batch_slots[(str(batch), day, period)].append(str(sid or course_id))
        if course_id is not None:
            course_counts[str(course_id)] += 1
        if sid:
            session_units[str(sid)].append(entry)

        room = rooms_by_id.get(room_id)
        session = sessions_by_id.get(str(sid), {})
        if room:
            errors.extend(f"{sid or course_id}: {reason}" for reason in _room_matches(room, session, int(entry.get("student_count", session.get("student_count", 0)) or 0)))
            if not _available(room, str(day), period):
                errors.append(f"{sid or course_id}: room unavailable at {day} period {period}")
        faculty_item = faculty_by_id.get(faculty_id)
        if faculty_item and not _available(faculty_item, str(day), period):
            errors.append(f"{sid or course_id}: faculty unavailable at {day} period {period}")

    errors.extend(f"Room conflict: {k}" for k, v in room_slots.items() if v > 1)
    errors.extend(f"Faculty conflict: {k}" for k, v in faculty_slots.items() if v > 1)
    errors.extend(f"Section conflict: {k}" for k, v in section_slots.items() if len(set(v)) > 1)
    errors.extend(f"Batch conflict: {k}" for k, v in batch_slots.items() if len(set(v)) > 1)

    # Required occurrence count and lab synchronization.
    if sessions:
        required = Counter()
        for session in sessions:
            required[str(session.get("course_id"))] += 1
            sid = str(session["id"])
            expected_units = len(session.get("units") or [{"id": "unit"}])
            actual_units = len(session_units.get(sid, []))
            if actual_units != expected_units:
                errors.append(f"Session {sid} has {actual_units} unit entries; expected {expected_units}")
            if session.get("is_lab") and actual_units:
                positions = {(x.get("day"), int(x.get("period"))) for x in session_units[sid]}
                if len(positions) != 1:
                    errors.append(f"Lab session {sid} groups are not synchronized")
                if len({x.get("room_id") for x in session_units[sid]}) != actual_units:
                    errors.append(f"Lab session {sid} groups share a room")
                if len({x.get("faculty_id") for x in session_units[sid]}) != actual_units:
                    errors.append(f"Lab session {sid} groups share a faculty member")
        for course_id, count in required.items():
            if course_id != "None" and course_counts[course_id] < count:
                errors.append(f"Course {course_id} has {course_counts[course_id]} generated entries; expected at least {count}")

        # Same-subject daily and spacing checks.
        grouped = defaultdict(list)
        for session in sessions:
            for entry in session_units.get(str(session["id"]), []):
                grouped[(str(session.get("subject_id")), str(session.get("section_name") or ""), entry.get("day"))].append(int(entry.get("period")))
        max_same = int(config.get("max_same_subject_per_day", config.get("maxSameSubjectPerDay", 0)) or 0)
        gap = int(config.get("min_gap_between_same_subject", config.get("minGapBetweenSameSubject", 0)) or 0)
        for key, periods in grouped.items():
            if max_same and len(periods) > max_same:
                errors.append(f"Subject frequency exceeded for {key}: {len(periods)} > {max_same}")
            if gap:
                sorted_periods = sorted(periods)
                if any(b - a <= gap for a, b in zip(sorted_periods, sorted_periods[1:])):
                    errors.append(f"Subject spacing violated for {key}")

    max_daily = int(config.get("max_classes_per_day", config.get("maxClassesPerDay", 0)) or 0)
    if max_daily:
        for key, count in faculty_day.items():
            if count > max_daily:
                errors.append(f"Faculty daily cap exceeded: {key} = {count} > {max_daily}")

    period_hours = float(config.get("period_duration_hours", config.get("periodDurationHours", 1)))
    for fid, count in faculty_week.items():
        person = faculty_by_id.get(fid)
        if person:
            cap = float(person.get("max_weekly_hours", person.get("maxWeeklyHours", 0)) or 0)
            if cap and count * period_hours > cap + 1e-9:
                errors.append(f"Faculty weekly workload exceeded: {fid}")

    return {
        "valid": not errors,
        "errors": errors,
        "warnings": warnings,
        "metrics": {
            "entries": len(entries),
            "room_conflicts": sum(v > 1 for v in room_slots.values()),
            "faculty_conflicts": sum(v > 1 for v in faculty_slots.values()),
            "section_conflicts": sum(len(set(v)) > 1 for v in section_slots.values()),
            "batch_conflicts": sum(len(set(v)) > 1 for v in batch_slots.values()),
            "courses": len(course_counts),
        },
    }
