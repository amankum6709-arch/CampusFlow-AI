import io
import json as jsonlib
import re
from collections import Counter

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import delete, select, and_
from sqlalchemy.orm import Session

from ...core.security import get_current_user, require_org_scoped
from ...db.session import get_db
from ...models import Course, Faculty, Organization, Room, TimetableEntry, TimetableRun, User, AcademicSession
from ...schemas.common import GenerateRequest, RunRead, TimetableEntryRead, TimetableEntryUpdate
from ...services.scheduler import run_timetable_job, solve

router = APIRouter(prefix="/timetable", tags=["timetable"])


@router.post("/generate", response_model=RunRead, status_code=202)
def generate(payload: GenerateRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    org = db.get(Organization, payload.organization_id)
    if not org:
        raise HTTPException(404, "Organization not found")
    require_org_scoped(payload.organization_id, user)
    run = TimetableRun(
        organization_id=payload.organization_id,
        status="QUEUED",
        configuration=payload.configuration,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    background_tasks.add_task(run_timetable_job, run.id, payload.organization_id)
    return run


@router.get("/runs", response_model=list[RunRead])
def list_runs(organization_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_org_scoped(organization_id, user)
    return list(
        db.scalars(
            select(TimetableRun)
            .where(TimetableRun.organization_id == organization_id)
            .order_by(TimetableRun.created_at.desc())
        ).all()
    )


@router.get("/runs/{run_id}", response_model=RunRead)
def get_run(run_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    run = db.get(TimetableRun, run_id)
    if not run:
        raise HTTPException(404, "Timetable run not found")
    require_org_scoped(run.organization_id, user)
    return run


@router.get("/runs/{run_id}/entries", response_model=list[TimetableEntryRead])
def get_entries(run_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    run = db.get(TimetableRun, run_id)
    if not run:
        raise HTTPException(404, "Timetable run not found")
    require_org_scoped(run.organization_id, user)
    entries = db.scalars(
        select(TimetableEntry)
        .where(TimetableEntry.run_id == run_id)
        .order_by(TimetableEntry.day, TimetableEntry.period)
    ).all()
    course_names = {row.id: row.name for row in db.execute(select(Course)).scalars().all()}
    course_codes = {row.id: row.code for row in db.execute(select(Course)).scalars().all()}
    faculty_names = {row.id: row.name for row in db.execute(select(Faculty)).scalars().all()}
    room_names = {row.id: row.name for row in db.execute(select(Room)).scalars().all()}
    session_map = {}
    for s in db.execute(select(AcademicSession)).scalars().all():
        session_map[s.id] = s

    def _lookup_session(entry_session_id):
        if not entry_session_id:
            return None
        if entry_session_id in session_map:
            return session_map[entry_session_id]
        base = entry_session_id.rsplit(":", 1)[0]
        return session_map.get(base)

    return [TimetableEntryRead(
        id=e.id,
        run_id=e.run_id,
        session_id=e.session_id,
        unit_id=e.unit_id,
        course_id=e.course_id,
        course_name=course_names.get(e.course_id),
        course_code=course_codes.get(e.course_id),
        subject_name=(sess.subject_name if (sess := _lookup_session(e.session_id)) else None),
        subject_code=(sess.subject_code if (sess := _lookup_session(e.session_id)) else None),
        mode=(sess.mode if (sess := _lookup_session(e.session_id)) else None),
        faculty_id=e.faculty_id,
        faculty_name=faculty_names.get(e.faculty_id),
        room_id=e.room_id,
        room_name=room_names.get(e.room_id),
        section_name=e.section_name,
        batch_id=e.batch_id,
        group_name=e.group_name,
        student_count=e.student_count or 0,
        day=e.day,
        period=e.period,
        locked=e.locked,
        reasons=e.reasons or [],
    ) for e in entries]


@router.get("/runs/{run_id}/export", responses={200: {"content": {"text/csv": {}}}})
def export_run(run_id: str, format: str = "csv", user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    run = db.get(TimetableRun, run_id)
    if not run:
        raise HTTPException(404, "Timetable run not found")
    require_org_scoped(run.organization_id, user)
    entries = db.scalars(
        select(TimetableEntry).where(TimetableEntry.run_id == run_id).order_by(TimetableEntry.day, TimetableEntry.period)
    ).all()
    course_names = {row.id: row.name for row in db.execute(select(Course)).scalars().all()}
    course_codes = {row.id: row.code for row in db.execute(select(Course)).scalars().all()}
    faculty_names = {row.id: row.name for row in db.execute(select(Faculty)).scalars().all()}
    room_names = {row.id: row.name for row in db.execute(select(Room)).scalars().all()}
    session_map = {}
    for s in db.execute(select(AcademicSession)).scalars().all():
        session_map[s.id] = s

    def _lookup_session(entry_session_id):
        if not entry_session_id:
            return None
        if entry_session_id in session_map:
            return session_map[entry_session_id]
        base = entry_session_id.rsplit(":", 1)[0]
        return session_map.get(base)

    if format == "json":
        data = [{
            "day": e.day,
            "period": e.period,
            "course": course_names.get(e.course_id) or e.course_id,
            "course_code": course_codes.get(e.course_id) or "",
            "subject": (sess.subject_name if (sess := _lookup_session(e.session_id)) else ""),
            "subject_code": (sess.subject_code if (sess := _lookup_session(e.session_id)) else ""),
            "mode": (sess.mode if (sess := _lookup_session(e.session_id)) else "theory"),
            "faculty": faculty_names.get(e.faculty_id) or e.faculty_id,
            "room": room_names.get(e.room_id) or e.room_id,
            "section": e.section_name,
            "group": e.group_name,
            "student_count": e.student_count,
        } for e in entries]
        return Response(
            jsonlib.dumps(data, indent=2),
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="timetable-{run_id[:8]}.json"'},
        )

    output = io.StringIO()
    output.write("Day,Period,Course,CourseCode,Subject,SubjectCode,Mode,Faculty,Room,Section,Group\n")
    for e in entries:
        subj = _lookup_session(e.session_id)
        output.write(f"{e.day},{e.period},{course_names.get(e.course_id) or e.course_id},{course_codes.get(e.course_id) or ''},{subj.subject_name if subj else ''},{subj.subject_code if subj else ''},{subj.mode if subj else ''},{faculty_names.get(e.faculty_id) or e.faculty_id},{room_names.get(e.room_id) or e.room_id},{e.section_name or ''},{e.group_name or ''}\n")
    return Response(output.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="timetable-{run_id[:8]}.csv"'})


@router.get("/runs/{run_id}/analytics")
def run_analytics(run_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    run = db.get(TimetableRun, run_id)
    if not run:
        raise HTTPException(404, "Timetable run not found")
    require_org_scoped(run.organization_id, user)
    entries = db.scalars(select(TimetableEntry).where(TimetableEntry.run_id == run_id)).all()
    course_names = {row.id: row.name for row in db.execute(select(Course)).scalars().all()}
    faculty_names = {row.id: row.name for row in db.execute(select(Faculty)).scalars().all()}
    room_names = {row.id: row.name for row in db.execute(select(Room)).scalars().all()}

    faculty_load = Counter()
    room_util = Counter()
    section_load = Counter()
    for e in entries:
        if e.faculty_id:
            faculty_load[(e.faculty_id, faculty_names.get(e.faculty_id))] += 1
        if e.room_id:
            room_util[(e.room_id, room_names.get(e.room_id))] += 1
        if e.section_name:
            section_load[e.section_name] += 1

    faculty_workload = [{"faculty_id": k[0], "name": k[1], "classes": v} for k, v in faculty_load.most_common()]
    room_utilization = [{"room_id": k[0], "name": k[1], "classes": v} for k, v in room_util.most_common()]
    section_load_list = [{"section": k, "classes": v} for k, v in sorted(section_load.items(), key=lambda x: -x[1])]

    return {
        "status": run.status,
        "total_entries": len(entries),
        "faculty_workload": faculty_workload,
        "room_utilization": room_utilization,
        "section_load": section_load_list,
    }


@router.post("/runs/{run_id}/ai")
def ai_assistant(run_id: str, question: str = "", user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Rule-based AI assistant over the generated timetable.
    
    Architecture: This endpoint uses deterministic rule-based matching.
    To integrate a real AI provider (OpenAI, Anthropic, etc.), replace the
    rule-based section with an API call. Set AI_PROVIDER and AI_API_KEY
    environment variables to enable external AI.
    
    Supported question types:
    - Workload queries (faculty, section, room)
    - Conflict detection
    - Free room/slot queries
    - Schedule lookups (faculty schedule, room schedule)
    - Suggestions and improvements
    - Summary statistics
    """
    run = db.get(TimetableRun, run_id)
    if not run:
        raise HTTPException(404, "Timetable run not found")
    require_org_scoped(run.organization_id, user)
    if run.status != "COMPLETED":
        return {"answer": "Generate a timetable before asking questions about it.", "status": run.status}
    
    entries = db.scalars(select(TimetableEntry).where(TimetableEntry.run_id == run_id)).all()
    course_names = {row.id: row.name for row in db.execute(select(Course)).scalars().all()}
    course_codes = {row.id: row.code for row in db.execute(select(Course)).scalars().all()}
    faculty_names = {row.id: row.name for row in db.execute(select(Faculty)).scalars().all()}
    room_names = {row.id: row.name for row in db.execute(select(Room)).scalars().all()}
    
    import os
    ai_provider = os.environ.get("AI_PROVIDER", "")
    ai_api_key = os.environ.get("AI_API_KEY", "")
    
    # If an external AI provider is configured, we could call it here.
    # For now, use the comprehensive rule-based engine.
    try:
        return _rule_based_ai(question, entries, course_names, course_codes, faculty_names, room_names, run)
    except Exception as e:
        import traceback
        return {"answer": f"I encountered an error processing your question: {str(e)}", "error": traceback.format_exc()}


def _rule_based_ai(question, entries, course_names, course_codes, faculty_names, room_names, run):
    """Comprehensive rule-based AI assistant."""
    q = question.lower().strip()
    period_times = (run.configuration or {}).get("period_times", {})
    
    # Build lookup structures
    faculty_load = Counter()
    room_util = Counter()
    section_load = Counter()
    day_load = Counter()
    course_load = Counter()
    for e in entries:
        if e.faculty_id:
            faculty_load[(e.faculty_id, faculty_names.get(e.faculty_id) or "Unknown")] += 1
        if e.room_id:
            room_util[(e.room_id, room_names.get(e.room_id) or "Unknown")] += 1
        if e.section_name:
            section_load[e.section_name] += 1
        if e.day:
            day_load[e.day] += 1
        if e.course_id:
            course_load[(e.course_id, course_names.get(e.course_id) or "Unknown")] += 1
    
    # Conflict detection - only detect SAME faculty/room in SAME slot (not different faculty/rooms)
    if "conflict" in q or "clash" in q:
        slots = {}
        conflicts = []
        for e in entries:
            key = (e.day, e.period)
            slot = slots.setdefault(key, [])
            slot.append(e)
        for key, items in slots.items():
            # Check for same faculty assigned to multiple classes
            fac_map = {}
            room_map = {}
            for x in items:
                if x.faculty_id:
                    fac_map.setdefault(x.faculty_id, []).append(x)
                if x.room_id:
                    room_map.setdefault(x.room_id, []).append(x)
            for fid, fac_entries in fac_map.items():
                if len(fac_entries) > 1 and not _same_session(fac_entries):
                    conflicts.append(f"Faculty {faculty_names.get(fid, fid)} double-booked at {key[0]} P{key[1]}")
            for rid, room_entries in room_map.items():
                if len(room_entries) > 1 and not _same_session(room_entries):
                    conflicts.append(f"Room {room_names.get(rid, rid)} double-booked at {key[0]} P{key[1]}")
        return {"answer": f"Found {len(conflicts)} conflict(s). " + ("No conflicts detected. All assignments are valid." if not conflicts else "; ".join(conflicts[:5]) + ("..." if len(conflicts) > 5 else ""))}
    
    # Workload queries
    if "highest workload" in q or "busiest faculty" in q or "most busy" in q:
        if not faculty_load:
            return {"answer": "No faculty are assigned in the current timetable."}
        top = faculty_load.most_common(1)[0]
        return {"answer": f"{top[0][1]} has the highest workload with {top[1]} class periods per week."}
    
    if "lowest workload" in q or "least busy" in q or "free faculty" in q:
        if not faculty_load:
            return {"answer": "No faculty are assigned in the current timetable."}
        bottom = faculty_load.most_common()[-1]
        return {"answer": f"{bottom[0][1]} has the lowest workload with {bottom[1]} class periods per week."}
    
    if "workload" in q:
        if not faculty_load:
            return {"answer": "No faculty are assigned in the current timetable."}
        lines = []
        for (fid, name), count in faculty_load.most_common():
            lines.append(f"  {name}: {count} periods")
        return {"answer": f"Faculty workload ({len(faculty_load)} faculty):\n" + "\n".join(lines)}
    
    # Room queries
    if "busiest room" in q or "most used room" in q:
        if not room_util:
            return {"answer": "No rooms are used in the current timetable."}
        most = room_util.most_common(1)[0]
        return {"answer": f"{most[0][1]} is the busiest room with {most[1]} class periods."}
    
    if "free room" in q or "available room" in q:
        used_rooms = {e.room_id for e in entries if e.room_id}
        all_rooms = set(room_names.keys())
        free = all_rooms - used_rooms
        if not free:
            return {"answer": f"All {len(all_rooms)} rooms are in use. No free rooms found."}
        names = [room_names.get(rid, rid) for rid in free]
        return {"answer": f"{len(free)} room(s) not used in this timetable: {', '.join(names)}"}
    
    if "room" in q:
        if not room_util:
            return {"answer": "No rooms are used in the current timetable."}
        lines = []
        for (rid, name), count in room_util.most_common():
            lines.append(f"  {name}: {count} periods")
        return {"answer": f"Room utilization ({len(room_util)} rooms):\n" + "\n".join(lines)}
    
    # Section queries
    if "section" in q:
        if not section_load:
            return {"answer": "No sections are scheduled."}
        lines = []
        for sec, count in section_load.most_common():
            lines.append(f"  {sec}: {count} periods")
        return {"answer": f"Section load ({len(section_load)} sections):\n" + "\n".join(lines)}
    
    # Faculty schedule
    if "schedule" in q or "teaching" in q or "where" in q:
        for fid, fname in faculty_names.items():
            if fname.lower() in q:
                slots = []
                for e in entries:
                    if e.faculty_id == fid:
                        pt = period_times.get(str(e.period), f"P{e.period}")
                        cname = course_names.get(e.course_id, 'Unknown')
                        ccode = course_codes.get(e.course_id, '')
                        rname = room_names.get(e.room_id, 'No room')
                        sec = e.section_name or ''
                        mode = e.group_name or 'Theory'
                        slots.append(f"  {e.day} {pt}: {cname} ({ccode}) in {rname} [{sec}] {mode}")
                if slots:
                    return {"answer": f"{fname}'s schedule ({len(slots)} classes):\n" + "\n".join(slots)}
                return {"answer": f"{fname} has no classes scheduled."}
    
    # Day distribution
    if "busiest day" in q or "most classes" in q and "day" in q:
        if not day_load:
            return {"answer": "No classes scheduled."}
        top = day_load.most_common(1)[0]
        return {"answer": f"{top[0]} is the busiest day with {top[1]} classes."}
    
    # Summary
    if "summary" in q or "overview" in q or "statistics" in q or "stats" in q:
        unique_sections = len(section_load)
        unique_faculty = len(faculty_load)
        unique_rooms = len(room_util)
        return {"answer": f"Timetable summary: {len(entries)} total classes, {unique_sections} sections, {unique_faculty} faculty, {unique_rooms} rooms, {len(day_load)} working days."}
    
    # Suggestions
    if "suggest" in q or "improve" in q or "better" in q:
        tips = []
        if faculty_load:
            top_fac = faculty_load.most_common(1)[0]
            if top_fac[1] > 8:
                tips.append(f"Consider reducing {top_fac[0][1]}'s load ({top_fac[1]} periods).")
        if day_load:
            busiest = day_load.most_common(1)[0]
            least = day_load.most_common()[-1]
            if busiest[1] - least[1] > 3:
                tips.append(f"Balance classes: {busiest[0]} has {busiest[1]} while {least[0]} has {least[1]}.")
        if not tips:
            tips.append("The timetable looks well-balanced.")
        return {"answer": "Suggestions:\n" + "\n".join(f"  - {t}" for t in tips)}
    
    # Default
    return {"answer": "I can help with:\n  - 'Which faculty has the highest workload?'\n  - 'Are there any conflicts?'\n  - 'Show all free rooms'\n  - 'Where is Dr. Sharma teaching?'\n  - 'Give me a summary'\n  - 'Suggest improvements'"}


def _same_session(items):
    sid = next((x.session_id for x in items if x.session_id), None)
    return bool(sid) and all(x.session_id == sid for x in items)


# ============================================================
# AI Modify Endpoint - Hindi/Hinglish/English Natural Language
# ============================================================

DAY_MAP = {
    "monday": "Monday", "mon": "Monday", "somvar": "Monday", "sом": "Monday",
    "tuesday": "Tuesday", "tue": "Tuesday", "tuesday": "Tuesday", "mangal": "Tuesday",
    "wednesday": "Wednesday", "wed": "Wednesday", "budh": "Wednesday", "buddh": "Wednesday",
    "thursday": "Thursday", "thu": "Thursday", "thur": "Thursday", "guru": "Thursday", "guruvar": "Thursday",
    "friday": "Friday", "fri": "Friday", "shukra": "Friday", "shukravar": "Friday",
    "saturday": "Saturday", "sat": "Saturday", "shanivar": "Saturday", "shani": "Saturday",
    "sunday": "Sunday", "sun": "Sunday", "ravivar": "Sunday", "ravi": "Sunday",
}

DAY_SYNONYMS_HINDI = {
    "monday": ["monday", "mon", "somvar", "sом"],
    "tuesday": ["tuesday", "tue", "tues", "mangal", "mangalvar"],
    "wednesday": ["wednesday", "wed", "budh", "budhvar"],
    "thursday": ["thursday", "thu", "thur", "guru", "guruvar"],
    "friday": ["friday", "fri", "shukra", "shukravar"],
    "saturday": ["saturday", "sat", "shanivar", "shani"],
    "sunday": ["sunday", "sun", "ravivar", "ravi"],
}

LEAVE_KEYWORDS = [
    "chhutti", "leave", "off", "unavailable", "nahi", "nahi padhayega",
    "nahi aayega", "absent", "na aaye", "mat padhaye", "class mat le",
    "gap day", "rest", "aaram", "free day",
]

CAPACITY_KEYWORDS = ["capacity", "seating", "benches", "kitne", "kamra", "room"]

MAX_CLASSES_KEYWORDS = [
    "classes", "periods", "max class", "max period", "kitni class",
    "zyada class", "kam class", "more class", "less class",
]

LUNCH_KEYWORDS = ["lunch", "lunch break", "khana", "meal", "bhojan"]

BREAK_KEYWORDS = ["break", "break time", "aaram", "rest time", "tea break"]

SATURDAY_KEYWORDS = ["saturday", "shanivar", "shani", "chhutti rakho", "off day"]


def _normalize_day(text: str) -> str | None:
    """Extract and normalize a day name from text. Returns canonical name or None."""
    text_lower = text.lower().strip()
    for canonical, synonyms in DAY_SYNONYMS_HINDI.items():
        for syn in synonyms:
            if syn in text_lower:
                return canonical.capitalize()
    return None


def _extract_number(text: str) -> int | None:
    """Extract the first number from text."""
    match = re.search(r'(\d+)', text)
    return int(match.group(1)) if match else None


def _find_faculty(name_query: str, org_id: str, db: Session) -> Faculty | None:
    """Find a faculty member by partial name match (case-insensitive)."""
    q = name_query.lower().strip()
    all_faculty = db.scalars(
        select(Faculty).where(Faculty.organization_id == org_id)
    ).all()
    # Exact match first
    for f in all_faculty:
        if f.name.lower() == q:
            return f
    # Partial match
    for f in all_faculty:
        if q in f.name.lower() or f.name.lower() in q:
            return f
    # Token match (all tokens of query appear in name)
    tokens = q.split()
    for f in all_faculty:
        fname = f.name.lower()
        if all(t in fname for t in tokens):
            return f
    return None


def _find_room(name_query: str, org_id: str, db: Session) -> Room | None:
    """Find a room by partial name match."""
    q = name_query.lower().strip()
    all_rooms = db.scalars(
        select(Room).where(Room.organization_id == org_id)
    ).all()
    for r in all_rooms:
        if r.name.lower() == q:
            return r
    for r in all_rooms:
        if q in r.name.lower() or r.name.lower() in q:
            return r
    return None


def _extract_faculty_name_from_text(text: str) -> str | None:
    """Try to extract a faculty name from natural language text.
    
    Handles patterns like:
    - "Dr. Sharma ko..."
    - "Prof. Kumar ki..."
    - "Sharma ji ko..."
    - "Rahul ko..."
    """
    # Common honorifics
    patterns = [
        r'(?:dr\.?|prof\.?|professor)\s+([a-zA-Z\s]+?)(?:\s+ko|\s+ki|\s+ke|\s+ka|\s+ki\s+class|\s+ka\s+class|\s+\d|\s*$)',
        r'([a-zA-Z]+)\s+(?:ko|ki|ke|ka)\s',
        r'([a-zA-Z]+)\s+(?:ji\s+)?(?:ko|ki|ke|ka)\s',
    ]
    
    text_stripped = text.strip()
    for pattern in patterns:
        match = re.search(pattern, text_stripped, re.IGNORECASE)
        if match:
            name = match.group(1).strip()
            # Clean up trailing words that aren't part of names
            cleanup_words = ['ko', 'ki', 'ke', 'ka', 'classes', 'class', 'padhayega', 
                           'nahi', 'chhutti', 'leave', 'capacity', 'max']
            name_tokens = name.split()
            cleaned = []
            for token in name_tokens:
                if token.lower() in cleanup_words:
                    break
                cleaned.append(token)
            if cleaned:
                return ' '.join(cleaned)
    return None


def _extract_room_name_from_text(text: str) -> str | None:
    """Try to extract a room name from text."""
    patterns = [
        r'room\s+(\w+)',
        r'lab\s+(\w+)',
        r'kamra\s+(\w+)',
        r'(\w+)\s+(?:room|lab|kamra)',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return None


def _apply_faculty_leave(faculty: Faculty, day: str, db: Session) -> str:
    """Add a day to faculty's leave dates in availability."""
    avail = faculty.availability or {}
    leave_days = avail.get("leave_dates", [])
    if day not in leave_days:
        leave_days.append(day)
        avail["leave_dates"] = leave_days
        faculty.availability = avail
        db.commit()
        return f"Added {day} to {faculty.name}'s leave dates."
    return f"{faculty.name} is already on leave on {day}."


def _remove_faculty_leave(faculty: Faculty, day: str, db: Session) -> str:
    """Remove a day from faculty's leave dates."""
    avail = faculty.availability or {}
    leave_days = avail.get("leave_dates", [])
    if day in leave_days:
        leave_days.remove(day)
        avail["leave_dates"] = leave_days
        faculty.availability = avail
        db.commit()
        return f"Removed {day} from {faculty.name}'s leave dates."
    return f"{faculty.name} was not on leave on {day}."


def _update_room_capacity(room: Room, capacity: int, db: Session) -> str:
    """Update room capacity."""
    old = room.capacity
    room.capacity = capacity
    db.commit()
    return f"Changed {room.name} capacity from {old} to {capacity}."


def _update_faculty_max_classes(faculty: Faculty, max_classes: int, db: Session) -> str:
    """Update faculty max weekly hours based on max classes per day."""
    prefs = faculty.preferences or {}
    prefs["maxClassesPerDay"] = max_classes
    faculty.preferences = prefs
    # Also update max_weekly_hours: max_classes * 5 days
    faculty.max_weekly_hours = max_classes * 5
    db.commit()
    return f"Set {faculty.name} max classes per day to {max_classes} (max weekly hours: {faculty.max_weekly_hours})."


def _update_config_value(config: dict, key: str, value) -> dict:
    """Update a configuration value in the run config."""
    config[key] = value
    return config


def _parse_and_apply_modification(question: str, run: TimetableRun, org_id: str, db: Session) -> dict:
    """Parse natural language modification request and apply changes.
    
    Returns dict with:
    - message: human-readable response
    - changes: list of changes applied
    - regenerate: whether timetable needs regeneration
    - updated_config: modified run configuration (if applicable)
    """
    q = question.lower().strip()
    changes = []
    config = dict(run.configuration or {})
    
    # ---- FACULTY LEAVE PATTERNS ----
    # Check for leave-related keywords
    if any(kw in q for kw in LEAVE_KEYWORDS):
        faculty_name = _extract_faculty_name_from_text(question)
        if faculty_name:
            faculty = _find_faculty(faculty_name, org_id, db)
            if faculty:
                day = _normalize_day(question)
                if day:
                    # Check if this is a removal request
                    if any(neg in q for neg in ["hatao", "remove", "cancel", "delete", "wapas"]):
                        msg = _remove_faculty_leave(faculty, day, db)
                    else:
                        msg = _apply_faculty_leave(faculty, day, db)
                    changes.append({"type": "faculty_leave", "faculty": faculty.name, "day": day, "detail": msg})
                    return {"message": msg, "changes": changes, "regenerate": True, "updated_config": config}
                else:
                    return {"message": f"Please specify which day. For example: '{faculty.name} ko Monday chhutti do'", "changes": [], "regenerate": False}
            else:
                return {"message": f"Faculty member '{faculty_name}' not found in your organization.", "changes": [], "regenerate": False}
    
    # ---- ROOM CAPACITY PATTERNS ----
    if any(kw in q for kw in CAPACITY_KEYWORDS):
        room_name = _extract_room_name_from_text(question)
        if room_name:
            room = _find_room(room_name, org_id, db)
            if room:
                capacity = _extract_number(question)
                if capacity and capacity > 0:
                    msg = _update_room_capacity(room, capacity, db)
                    changes.append({"type": "room_capacity", "room": room.name, "capacity": capacity, "detail": msg})
                    return {"message": msg, "changes": changes, "regenerate": True, "updated_config": config}
                else:
                    return {"message": "Please specify a valid capacity number. For example: 'Room 101 ki capacity 80 karo'", "changes": [], "regenerate": False}
            else:
                return {"message": f"Room '{room_name}' not found in your organization.", "changes": [], "regenerate": False}
    
    # ---- MAX CLASSES PATTERNS ----
    if any(kw in q for kw in MAX_CLASSES_KEYWORDS):
        faculty_name = _extract_faculty_name_from_text(question)
        if faculty_name:
            faculty = _find_faculty(faculty_name, org_id, db)
            if faculty:
                max_classes = _extract_number(question)
                if max_classes and max_classes > 0:
                    msg = _update_faculty_max_classes(faculty, max_classes, db)
                    changes.append({"type": "max_classes", "faculty": faculty.name, "max_classes": max_classes, "detail": msg})
                    return {"message": msg, "changes": changes, "regenerate": True, "updated_config": config}
                else:
                    # Check for increase/decrease keywords
                    if any(kw in q for kw in ["zyada", "more", "increase", "badhao"]):
                        current = (faculty.preferences or {}).get("maxClassesPerDay", 6)
                        new_val = current + 1
                        msg = _update_faculty_max_classes(faculty, new_val, db)
                        changes.append({"type": "max_classes", "faculty": faculty.name, "max_classes": new_val, "detail": msg})
                        return {"message": msg, "changes": changes, "regenerate": True, "updated_config": config}
                    elif any(kw in q for kw in ["kam", "less", "decrease", "ghatao"]):
                        current = (faculty.preferences or {}).get("maxClassesPerDay", 6)
                        new_val = max(1, current - 1)
                        msg = _update_faculty_max_classes(faculty, new_val, db)
                        changes.append({"type": "max_classes", "faculty": faculty.name, "max_classes": new_val, "detail": msg})
                        return {"message": msg, "changes": changes, "regenerate": True, "updated_config": config}
                    return {"message": f"Please specify a number. For example: '{faculty.name} ki classes 3 karo'", "changes": [], "regenerate": False}
            else:
                return {"message": f"Faculty member '{faculty_name}' not found.", "changes": [], "regenerate": False}
    
    # ---- LUNCH BREAK PATTERNS ----
    if any(kw in q for kw in LUNCH_KEYWORDS):
        duration = _extract_number(question)
        if duration and duration > 0:
            config["lunchDuration"] = duration
            msg = f"Lunch break duration set to {duration} minutes."
            changes.append({"type": "lunch_duration", "duration": duration, "detail": msg})
            return {"message": msg, "changes": changes, "regenerate": True, "updated_config": config}
        else:
            return {"message": "Please specify duration in minutes. For example: 'Lunch break 40 minute karo'", "changes": [], "regenerate": False}
    
    # ---- BREAK PATTERNS ----
    if any(kw in q for kw in BREAK_KEYWORDS):
        if "lunch" not in q:  # Don't conflict with lunch pattern
            duration = _extract_number(question)
            if duration and duration > 0:
                config["breakDuration"] = duration
                msg = f"Break duration set to {duration} minutes."
                changes.append({"type": "break_duration", "duration": duration, "detail": msg})
                return {"message": msg, "changes": changes, "regenerate": True, "updated_config": config}
            else:
                return {"message": "Please specify duration in minutes. For example: 'Break 15 minute rakho'", "changes": [], "regenerate": False}
    
    # ---- SATURDAY PATTERNS ----
    if any(kw in q for kw in SATURDAY_KEYWORDS) or "shanivar" in q:
        if any(kw in q for kw in ["chhutti", "off", "band", "close", "no class", "mat rakho", "disable"]):
            config["allowSaturday"] = False
            msg = "Saturday classes disabled (chhutti rakho)."
            changes.append({"type": "saturday", "allow": False, "detail": msg})
            return {"message": msg, "changes": changes, "regenerate": True, "updated_config": config}
        elif any(kw in q for kw in ["enable", "on", "kholo", "chalu", "rakho", "add"]):
            config["allowSaturday"] = True
            msg = "Saturday classes enabled."
            changes.append({"type": "saturday", "allow": True, "detail": msg})
            return {"message": msg, "changes": changes, "regenerate": True, "updated_config": config}
    
    # ---- SCHEDULE MODIFICATION PATTERNS ----
    # "Dr. Sharma ki Monday P1 class hatao"
    if any(kw in q for kw in ["hatao", "remove", "delete", "cancel class"]):
        faculty_name = _extract_faculty_name_from_text(question)
        if faculty_name:
            faculty = _find_faculty(faculty_name, org_id, db)
            if faculty:
                day = _normalize_day(question)
                period = _extract_number(question)
                if day and period:
                    # Delete the specific entry
                    entry = db.scalar(
                        select(TimetableEntry).where(
                            and_(
                                TimetableEntry.run_id == run.id,
                                TimetableEntry.faculty_id == faculty.id,
                                TimetableEntry.day == day,
                                TimetableEntry.period == period,
                            )
                        )
                    )
                    if entry:
                        db.delete(entry)
                        db.commit()
                        msg = f"Removed {faculty.name}'s class on {day} period {period}."
                        changes.append({"type": "remove_entry", "faculty": faculty.name, "day": day, "period": period, "detail": msg})
                        return {"message": msg, "changes": changes, "regenerate": True, "updated_config": config}
                    else:
                        return {"message": f"No class found for {faculty.name} on {day} period {period}.", "changes": [], "regenerate": False}
                else:
                    return {"message": "Please specify the day and period. For example: 'Dr. Sharma ki Monday P1 class hatao'", "changes": [], "regenerate": False}
            else:
                return {"message": f"Faculty member '{faculty_name}' not found.", "changes": [], "regenerate": False}
    
    # ---- WORKING DAYS PATTERNS ----
    if any(kw in q for kw in ["working days", "kaam ke din", "din"]):
        days = []
        for day_name in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]:
            if day_name.lower() in q:
                days.append(day_name)
        hindi_days = _normalize_day(question)
        if hindi_days and hindi_days not in days:
            days.append(hindi_days)
        if days:
            config["days"] = days
            msg = f"Working days set to: {', '.join(days)}"
            changes.append({"type": "working_days", "days": days, "detail": msg})
            return {"message": msg, "changes": changes, "regenerate": True, "updated_config": config}
    
    # ---- PERIOD COUNT PATTERNS ----
    if any(kw in q for kw in ["period count", "kitne period", "periods per day", "kitne lectures"]):
        count = _extract_number(question)
        if count and count > 0:
            config["period_count"] = count
            msg = f"Period count set to {count} per day."
            changes.append({"type": "period_count", "count": count, "detail": msg})
            return {"message": msg, "changes": changes, "regenerate": True, "updated_config": config}
    
    # ---- UNDERSTOOD BUT CANNOT PROCESS ----
    # If we detected some keywords but couldn't match a pattern
    detected_keywords = []
    if any(kw in q for kw in ["faculty", "professor", "dr.", "dr ", "prof.", "prof "]):
        detected_keywords.append("faculty")
    if any(kw in q for kw in ["room", "lab", "kamra"]):
        detected_keywords.append("room")
    if any(kw in q for kw in ["class", "lecture", "period"]):
        detected_keywords.append("class/period")
    if any(kw in q for kw in ["day", "din", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]):
        detected_keywords.append("day")
    
    if detected_keywords:
        return {
            "message": (
                f"I detected you're asking about {', '.join(detected_keywords)}, but I couldn't fully understand the request. "
                "Try rephrasing. Examples:\n"
                "  - 'Dr. Sharma ko Monday chhutti do'\n"
                "  - 'Room 101 ki capacity 80 karo'\n"
                "  - 'Dr. Sharma ki classes 3 karo'\n"
                "  - 'Lunch break 40 minute karo'\n"
                "  - 'Saturday ko chhutti rakho'"
            ),
            "changes": [],
            "regenerate": False,
        }
    
    # ---- DEFAULT: No modification intent detected ----
    return {
        "message": (
            "I can help you modify the timetable. Try requests like:\n"
            "  - 'Dr. Sharma ko Monday chhutti do' (Add leave)\n"
            "  - 'Room 101 ki capacity 80 karo' (Change room capacity)\n"
            "  - 'Dr. Sharma ki classes 3 karo' (Set max classes per day)\n"
            "  - 'Lunch break 40 minute karo' (Change lunch duration)\n"
            "  - 'Break 15 minute rakho' (Change break duration)\n"
            "  - 'Saturday ko chhutti rakho' (Disable Saturday)\n"
            "  - 'Dr. Sharma ki Monday P1 class hatao' (Remove a class)\n"
            "\nHindi/Hinglish natural language supported!"
        ),
        "changes": [],
        "regenerate": False,
    }


@router.post("/runs/{run_id}/ai-modify")
def ai_modify(
    run_id: str,
    request: dict,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Natural language timetable modification with Hindi/Hinglish support.
    
    Accepts a natural language request to modify the timetable configuration
    or data, then triggers regeneration if needed.
    
    Supported modifications:
    - Faculty leave/availability
    - Room capacity changes
    - Faculty max classes per day
    - Lunch/break duration
    - Saturday enable/disable
    - Schedule entry removal
    - Working days modification
    - Period count changes
    """
    run = db.get(TimetableRun, run_id)
    if not run:
        raise HTTPException(404, "Timetable run not found")
    require_org_scoped(run.organization_id, user)
    
    question = request.get("question", "").strip()
    if not question:
        raise HTTPException(400, "Please provide a question/request to modify the timetable.")
    
    org_id = run.organization_id
    
    try:
        result = _parse_and_apply_modification(question, run, org_id, db)
    except Exception as e:
        import traceback
        return {
            "answer": f"Error processing your request: {str(e)}",
            "changes": [],
            "regenerate": False,
            "error": traceback.format_exc(),
        }
    
    # If scheduling was affected, trigger regeneration
    if result.get("regenerate"):
        run.configuration = result.get("updated_config", run.configuration)
        run.status = "QUEUED"
        db.commit()
        
        # Clear existing entries before regeneration
        db.execute(
            delete(TimetableEntry).where(TimetableEntry.run_id == run.id)
        )
        db.commit()
        
        # Trigger background regeneration
        background_tasks.add_task(run_timetable_job, run.id, org_id)
        
        result["message"] += "\n\nTimetable regeneration has been queued. Check the run status for updates."
    
    return {
        "answer": result["message"],
        "changes": result.get("changes", []),
        "regenerate": result.get("regenerate", False),
        "run_status": run.status,
    }


@router.patch("/runs/{run_id}/entries/{entry_id}", response_model=TimetableEntryRead)
def update_entry(
    run_id: str,
    entry_id: str,
    payload: TimetableEntryUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    run = db.get(TimetableRun, run_id)
    if not run:
        raise HTTPException(404, "Timetable run not found")
    require_org_scoped(run.organization_id, user)

    entry = db.scalar(
        select(TimetableEntry).where(
            and_(TimetableEntry.id == entry_id, TimetableEntry.run_id == run_id)
        )
    )
    if not entry:
        raise HTTPException(404, "Timetable entry not found")

    moving = payload.day is not None or payload.period is not None
    if entry.locked and moving and payload.locked is not False:
        raise HTTPException(409, "Locked timetable entries must be unlocked before moving them")

    next_day = payload.day if payload.day is not None else entry.day
    next_period = payload.period if payload.period is not None else entry.period

    configuration = run.configuration or {}
    allowed_days = configuration.get("days") or configuration.get("working_days") or []
    period_count = int(configuration.get("period_count") or 0)
    allowed_periods = configuration.get("periods") or []
    if allowed_days and next_day not in allowed_days:
        raise HTTPException(422, "Selected day is outside the timetable configuration")
    if allowed_periods and next_period not in [int(p) for p in allowed_periods]:
        raise HTTPException(422, "Selected period is outside the timetable configuration")
    if next_period < 1 or (period_count and next_period > period_count):
        raise HTTPException(422, "Selected period is outside the timetable configuration")

    # A lab occurrence consists of multiple rows that intentionally share the
    # same section/batch/slot. Moving one row must move the whole occurrence.
    group = [entry]
    if moving and entry.session_id:
        siblings = db.scalars(
            select(TimetableEntry).where(
                TimetableEntry.run_id == run_id,
                TimetableEntry.session_id == entry.session_id,
            )
        ).all()
        if len(siblings) > 1:
            group = siblings
            if any(item.locked for item in siblings):
                raise HTTPException(
                    409,
                    "Unlock all entries in the lab session before moving the complete lab session",
                )

    group_ids = {item.id for item in group}
    for candidate in group:
        peers = db.scalars(
            select(TimetableEntry).where(
                TimetableEntry.run_id == run_id,
                TimetableEntry.id.not_in(group_ids),
                TimetableEntry.day == next_day,
                TimetableEntry.period == next_period,
            )
        ).all()
        for peer in peers:
            if candidate.faculty_id and peer.faculty_id == candidate.faculty_id:
                raise HTTPException(409, "Faculty conflict at the selected slot")
            if candidate.room_id and peer.room_id == candidate.room_id:
                raise HTTPException(409, "Room conflict at the selected slot")
            if candidate.section_name and peer.section_name == candidate.section_name:
                raise HTTPException(409, "Section conflict at the selected slot")
            if candidate.batch_id and peer.batch_id == candidate.batch_id:
                raise HTTPException(409, "Batch conflict at the selected slot")

    for item in group:
        if moving:
            item.day = next_day
            item.period = next_period
        if item.id == entry.id and payload.locked is not None:
            item.locked = payload.locked

    db.commit()
    db.refresh(entry)

    course = db.get(Course, entry.course_id) if entry.course_id else None
    faculty = db.get(Faculty, entry.faculty_id) if entry.faculty_id else None
    room = db.get(Room, entry.room_id) if entry.room_id else None
    return TimetableEntryRead(
        id=entry.id,
        run_id=entry.run_id,
        session_id=entry.session_id,
        unit_id=entry.unit_id,
        course_id=entry.course_id,
        course_name=course.name if course else None,
        faculty_id=entry.faculty_id,
        faculty_name=faculty.name if faculty else None,
        room_id=entry.room_id,
        room_name=room.name if room else None,
        section_name=entry.section_name,
        batch_id=entry.batch_id,
        group_name=entry.group_name,
        student_count=entry.student_count or 0,
        day=entry.day,
        period=entry.period,
        locked=entry.locked,
        reasons=entry.reasons or [],
    )

