"""Action-taking assistant service.

Pure, testable scheduling logic sits here; HTTP lives in
``api/routes/assistant.py``. Everything is built on the trusted
building blocks:

* ``workers.scheduler.validator.validate_entries`` — the single source
  of truth for hard-constraint checking (analyze + proposal validation).
* ``workers.scheduler.engine.normalize_sessions`` — session shapes for
  the validator.
* ``TimetableEntry`` rows — proposals never mutate data; only the
  approve path writes, in one transaction, after revalidation.

There is deliberately no LLM here: the "AI layer" interprets requests
and explains results, while detection, validation and persistence stay
in deterministic application code.
"""
from __future__ import annotations

import hashlib
import json
from collections import Counter, defaultdict
from typing import Any


# ------------------------------------------------------------------
# Context loading
# ------------------------------------------------------------------

def _entry_to_dict(e) -> dict[str, Any]:
    return {
        "id": str(e.id),
        "session_id": e.session_id,
        "unit_id": e.unit_id,
        "course_id": str(e.course_id) if e.course_id else None,
        "faculty_id": str(e.faculty_id) if e.faculty_id else None,
        "room_id": str(e.room_id) if e.room_id else None,
        "section_name": e.section_name,
        "batch_id": e.batch_id,
        "group_name": e.group_name,
        "student_count": int(e.student_count or 0),
        "day": e.day,
        "period": int(e.period),
        "locked": bool(e.locked),
    }


def _session_base(sid: str | None) -> str | None:
    if not sid:
        return None
    head, sep, tail = str(sid).rpartition(":")
    if sep and tail.isdigit():
        return head
    return str(sid)


def load_context(db, run) -> dict[str, Any]:
    """Load everything the assistant needs for one run (read-only)."""
    from ..models import AcademicSession, Course, Faculty, Room, TimetableEntry

    config = dict(run.configuration or {})
    rows = (
        db.query(TimetableEntry)
        .filter(TimetableEntry.run_id == run.id)
        .order_by(TimetableEntry.day, TimetableEntry.period)
        .all()
    )
    entries = [_entry_to_dict(e) for e in rows]

    from workers.scheduler.engine import normalize_sessions
    try:
        sessions = normalize_sessions(config)
    except Exception:
        sessions = []
    rooms = list(config.get("rooms") or [])
    faculty = list(config.get("faculty") or [])

    org_id = run.organization_id
    faculty_names = {r.id: r.name for r in db.query(Faculty).filter(Faculty.organization_id == org_id).all()}
    room_names = {r.id: r.name for r in db.query(Room).filter(Room.organization_id == org_id).all()}
    course_names = {r.id: r.name for r in db.query(Course).filter(Course.organization_id == org_id).all()}
    session_rows = db.query(AcademicSession).filter(AcademicSession.organization_id == org_id).all()
    subject_names = {}
    for s in session_rows:
        if s.subject_name:
            subject_names[str(s.id)] = s.subject_name

    sessions_by_id = {str(s.get("id")): s for s in sessions}
    sessions_by_base = {}
    for s in sessions:
        sessions_by_base.setdefault(_session_base(str(s.get("id"))), s)

    def session_of(entry):
        sid = entry.get("session_id")
        if not sid:
            return {}
        return sessions_by_id.get(str(sid)) or sessions_by_base.get(_session_base(str(sid))) or {}

    def subject_of(entry):
        base = _session_base(entry.get("session_id"))
        if base and base in subject_names:
            return subject_names[base]
        sess = session_of(entry)
        for key in ("subject_name", "subject", "name"):
            if sess.get(key):
                return str(sess[key])
        return None

    days = list(config.get("days") or config.get("working_days") or
                ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"])
    if config.get("periods"):
        periods = sorted({int(p) for p in config["periods"]})
    elif isinstance(config.get("period_times"), dict) and config["period_times"]:
        periods = sorted({int(p) for p in config["period_times"].keys()})
    else:
        periods = list(range(1, int(config.get("period_count", 8)) + 1))

    return {
        "run": run,
        "config": config,
        "entries": entries,
        "sessions": sessions,
        "rooms": rooms,
        "faculty": faculty,
        "faculty_names": faculty_names,
        "room_names": room_names,
        "course_names": course_names,
        "subject_names": subject_names,
        "session_of": session_of,
        "subject_of": subject_of,
        "days": days,
        "periods": periods,
    }


def compute_fingerprint(entries: list[dict], status: str = "") -> str:
    payload = {
        "status": status,
        "entries": sorted(
            [
                [e.get("id"), e.get("day"), e.get("period"),
                 e.get("faculty_id"), e.get("room_id"),
                 bool(e.get("locked")), e.get("session_id"), e.get("unit_id")]
                for e in entries
            ],
            key=lambda r: str(r[0]),
        ),
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


def validate_current(ctx: dict[str, Any], entries: list[dict] | None = None) -> dict[str, Any]:
    from workers.scheduler.validator import validate_entries
    return validate_entries(
        entries if entries is not None else ctx["entries"],
        sessions=ctx["sessions"],
        rooms=ctx["rooms"],
        faculty=ctx["faculty"],
        config=ctx["config"],
    )


def usable_slots(ctx: dict[str, Any]) -> list[tuple[str, int]]:
    """Slots a class may legally occupy (config days/periods minus blocks)."""
    config, days, periods = ctx["config"], ctx["days"], ctx["periods"]
    blocked: set[tuple[str, int]] = set()
    for item in list(config.get("blocked_slots") or config.get("blockedSlots") or []) + \
            list(config.get("break_slots") or config.get("breakSlots") or []):
        try:
            d = item.get("day", "*")
            if d == "*":
                for day in days:
                    blocked.add((day, int(item.get("period"))))
            else:
                blocked.add((str(d), int(item.get("period"))))
        except (TypeError, ValueError):
            continue
    try:
        # Same lunch/break mapping the solver itself uses.
        from workers.scheduler.engine import _compute_blocked_periods
        for item in _compute_blocked_periods(dict(config), list(days), list(periods)):
            try:
                blocked.add((str(item.get("day")), int(item.get("period"))))
            except (TypeError, ValueError):
                continue
    except Exception:
        pass
    return [(d, p) for d in days for p in periods if (d, p) not in blocked]


# ------------------------------------------------------------------
# Conflict classification (validator strings -> structured cards)
# ------------------------------------------------------------------

_SLOT_RE = r"\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*(\d+)\s*\)"


def _entries_at_slot(ctx, day, period, resource=None, value=None):
    out = []
    for e in ctx["entries"]:
        if str(e.get("day")) != str(day) or int(e.get("period")) != int(period):
            continue
        if resource and str(e.get(resource) or "") != str(value):
            continue
        out.append(e)
    return out


def _entries_for_session(ctx, sid):
    base = _session_base(sid)
    return [e for e in ctx["entries"] if _session_base(e.get("session_id")) == base]


def _label(ctx, entry):
    subj = ctx["subject_of"](entry) or "Class"
    return f"{subj} ({entry.get('day')} P{entry.get('period')})"


_RECOMMENDATIONS = {
    "room_conflict": ("Move one of the classes sharing this room to a free slot, or assign an alternative room.", "One room per slot"),
    "faculty_conflict": ("Move one of the classes to a slot where the faculty member is free.", "One faculty per slot"),
    "section_conflict": ("A section cannot attend two classes at once — move one class to another slot.", "One class per section per slot"),
    "batch_conflict": ("A batch cannot attend two classes at once — move one class to another slot.", "One class per batch per slot"),
    "room_unavailable": ("Move the class to a slot where the room is available, or extend room availability.", "Room availability"),
    "faculty_unavailable": ("Move the class to a slot where the faculty member is available, or update leave.", "Faculty availability"),
    "room_capacity": ("Assign a larger room or split the batch into smaller groups.", "Room capacity"),
    "room_type": ("Assign a room of the required type (e.g. lab vs classroom).", "Room type requirement"),
    "room_facility": ("Assign a room with the required facilities.", "Room facility requirement"),
    "faculty_daily_cap": ("Spread this faculty member's classes across more days.", "Max classes per day"),
    "faculty_weekly_cap": ("Reduce this faculty member's weekly load or raise their cap.", "Max weekly hours"),
    "subject_frequency": ("Spread this subject across more days.", "Max same subject per day"),
    "subject_spacing": ("Increase the gap between same-subject periods.", "Minimum gap between same subject"),
    "lab_sync": ("Keep all lab groups in the same slot with distinct rooms and faculty.", "Lab group synchronization"),
    "session_units": ("A session is missing unit entries — regenerate or review the setup data.", "Session completeness"),
    "course_count": ("Some required sessions are unscheduled — review setup data or regenerate.", "Session completeness"),
}

_SEVERITY = {
    "room_conflict": "high", "faculty_conflict": "high",
    "section_conflict": "high", "batch_conflict": "high",
    "room_unavailable": "high", "faculty_unavailable": "high",
    "room_capacity": "high", "room_type": "high", "room_facility": "high",
    "lab_sync": "high", "session_units": "high",
    "faculty_daily_cap": "medium", "faculty_weekly_cap": "medium",
    "subject_frequency": "medium", "subject_spacing": "medium",
    "course_count": "medium",
}


def classify_conflicts(validation: dict[str, Any], ctx: dict[str, Any]) -> list[dict[str, Any]]:
    import re
    conflicts = []
    for i, err in enumerate(validation.get("errors", []), start=1):
        ctype, affected, detail = "unknown", [], err
        m = re.match(r"Room conflict: " + _SLOT_RE + r"$", err)
        if m:
            rid, day, period = m.group(1), m.group(2), int(m.group(3))
            ctype, affected = "room_conflict", _entries_at_slot(ctx, day, period, "room_id", rid)
            detail = f"Room {ctx['room_names'].get(rid, rid)} is booked twice at {day} period {period}."
        else:
            m = re.match(r"Faculty conflict: " + _SLOT_RE + r"$", err)
            if m:
                fid, day, period = m.group(1), m.group(2), int(m.group(3))
                ctype, affected = "faculty_conflict", _entries_at_slot(ctx, day, period, "faculty_id", fid)
                detail = f"{ctx['faculty_names'].get(fid, fid)} is booked twice at {day} period {period}."
            else:
                m = re.match(r"Section conflict: " + _SLOT_RE + r"$", err)
                if m:
                    sec, day, period = m.group(1), m.group(2), int(m.group(3))
                    ctype = "section_conflict"
                    affected = [e for e in _entries_at_slot(ctx, day, period) if str(e.get("section_name") or "") == sec]
                    detail = f"Section {sec} has overlapping classes at {day} period {period}."
                else:
                    m = re.match(r"Batch conflict: " + _SLOT_RE + r"$", err)
                    if m:
                        batch, day, period = m.group(1), m.group(2), int(m.group(3))
                        ctype = "batch_conflict"
                        affected = [e for e in _entries_at_slot(ctx, day, period) if str(e.get("batch_id") or "") == batch]
                        detail = f"Batch {batch} has overlapping classes at {day} period {period}."
                    else:
                        m = re.match(r"(.+): room unavailable at (.+) period (\d+)$", err)
                        if m:
                            ctype, affected = "room_unavailable", _entries_for_session(ctx, m.group(1))
                            detail = f"Scheduled in a room that is unavailable at {m.group(2)} period {m.group(3)}."
                        else:
                            m = re.match(r"(.+): faculty unavailable at (.+) period (\d+)$", err)
                            if m:
                                ctype, affected = "faculty_unavailable", _entries_for_session(ctx, m.group(1))
                                detail = f"Faculty is unavailable at {m.group(2)} period {m.group(3)} (leave or blocked day)."
                            else:
                                m = re.match(r"(.+): (room_capacity|room_type|room_facility|room_not_available_for_timetable)$", err)
                                if m:
                                    ctype = {"room_capacity": "room_capacity", "room_type": "room_type",
                                             "room_facility": "room_facility"}.get(m.group(2), "room_unavailable")
                                    affected = _entries_for_session(ctx, m.group(1))
                                    detail = {"room_capacity": "Assigned room capacity is smaller than the class size.",
                                              "room_type": "Assigned room type does not match the session requirement.",
                                              "room_facility": "Assigned room lacks required facilities."}.get(m.group(2), err)
                                else:
                                    m = re.match(r"Faculty daily cap exceeded: \('([^']*)', '([^']*)'\)", err)
                                    if m:
                                        ctype = "faculty_daily_cap"
                                        affected = [e for e in ctx["entries"] if str(e.get("faculty_id") or "") == m.group(1) and str(e.get("day")) == m.group(2)]
                                        detail = f"{ctx['faculty_names'].get(m.group(1), m.group(1))} exceeds the daily class cap on {m.group(2)}."
                                    else:
                                        m = re.match(r"Faculty weekly workload exceeded: (.*)$", err)
                                        if m:
                                            ctype = "faculty_weekly_cap"
                                            affected = [e for e in ctx["entries"] if str(e.get("faculty_id") or "") == m.group(1).strip()]
                                            detail = f"{ctx['faculty_names'].get(m.group(1).strip(), m.group(1).strip())} exceeds the weekly hour cap."
                                        else:
                                            m = re.match(r"Subject (frequency exceeded|spacing violated) for \('([^']*)', '([^']*)', '([^']*)'\)", err)
                                            if m:
                                                ctype = "subject_frequency" if "frequency" in m.group(1) else "subject_spacing"
                                                affected = [e for e in ctx["entries"]
                                                            if str((ctx["session_of"](e).get("subject_id"))) == m.group(2)
                                                            and str(e.get("section_name") or "") == m.group(3)
                                                            and str(e.get("day")) == m.group(4)]
                                                detail = err
                                            else:
                                                m = re.match(r"Lab session (\S+) (groups are not synchronized|groups share a room|groups share a faculty member)", err)
                                                if m:
                                                    ctype = "lab_sync"
                                                    affected = _entries_for_session(ctx, m.group(1))
                                                    detail = err
                                                else:
                                                    m = re.match(r"Session (\S+) has (\d+) unit entries; expected (\d+)", err)
                                                    if m:
                                                        ctype = "session_units"
                                                        affected = _entries_for_session(ctx, m.group(1))
                                                        detail = err
                                                    else:
                                                        m = re.match(r"Course (\S+) has (\d+) generated entries; expected at least (\d+)", err)
                                                        if m:
                                                            ctype = "course_count"
                                                            affected = [e for e in ctx["entries"] if str(e.get("course_id") or "") == m.group(1)]
                                                            detail = err
        rec, constraint = _RECOMMENDATIONS.get(ctype, ("Review this violation against the setup constraints.", "Timetable constraint"))
        first = affected[0] if affected else {}
        conflicts.append({
            "id": f"c{i}",
            "type": ctype,
            "severity": _SEVERITY.get(ctype, "medium"),
            "course": ctx["course_names"].get(str(first.get("course_id") or "")),
            "subject": ctx["subject_of"](first) if first else None,
            "faculty": ctx["faculty_names"].get(str(first.get("faculty_id") or "")) if first else None,
            "faculty_id": (str(first.get("faculty_id")) if first and first.get("faculty_id") else None),
            "room": ctx["room_names"].get(str(first.get("room_id") or "")) if first else None,
            "room_id": (str(first.get("room_id")) if first and first.get("room_id") else None),
            "section": first.get("section_name") if first else None,
            "batch": first.get("batch_id") if first else None,
            "day": first.get("day") if first else None,
            "period": first.get("period") if first else None,
            "entry_ids": [e["id"] for e in affected],
            "explanation": detail,
            "constraint": constraint,
            "recommendation": rec,
            "raw": err,
        })
    return conflicts


# ------------------------------------------------------------------
# Candidate generation
# ------------------------------------------------------------------

def _group_entries(ctx, entry):
    sid = entry.get("session_id")
    if sid:
        sibs = [e for e in ctx["entries"] if e.get("session_id") == sid]
        if len(sibs) > 1:
            return sibs
    return [entry]


def _eligible_faculty_ids(ctx, session):
    ids = [str(x) for x in (session.get("faculty_ids") or []) if x is not None]
    if session.get("faculty_id") is not None:
        ids.append(str(session["faculty_id"]))
    ids = list(dict.fromkeys(ids))
    if ids:
        known = {str(p.get("id")) for p in ctx["faculty"]}
        return [i for i in ids if i in known]
    subj = {str(x) for x in (session.get("subject_faculty_ids") or [])}
    if subj:
        return [str(p.get("id")) for p in ctx["faculty"] if str(p.get("id")) in subj]
    return [str(p.get("id")) for p in ctx["faculty"] if p.get("id") is not None]


def _room_fits(room, session, students):
    if not room.get("timetableAvailable", True):
        return False
    try:
        if students and int(room.get("capacity", 0)) < int(students):
            return False
    except (TypeError, ValueError):
        return False
    required = session.get("room_type")
    if required and str(room.get("room_type", room.get("roomType")) or "").strip().lower() != str(required).strip().lower():
        return False
    facilities = room.get("facilities") or {}
    return all(bool(facilities.get(name)) for name in (session.get("required_facilities") or []))


def _slot_sort_key(day, period, entry, days):
    try:
        day_rank = days.index(day) - days.index(entry.get("day"))
    except ValueError:
        day_rank = 99
    return (0 if day == entry.get("day") else 1, abs(day_rank), abs(int(period) - int(entry.get("period", 0))))


def _patched_entries(entries, group_ids, day, period, room_id=None, faculty_id=None):
    out = []
    for e in entries:
        if e["id"] in group_ids:
            c = dict(e)
            c["day"], c["period"] = day, period
            if room_id is not None:
                c["room_id"] = room_id
            if faculty_id is not None:
                c["faculty_id"] = faculty_id
            out.append(c)
        else:
            out.append(e)
    return out


def _validate_patched(ctx, patched):
    return validate_current(ctx, patched)


def _describe_change(ctx, group, day, period, room_id, faculty_id, reason, resolved):
    first = group[0]
    before_room = ctx["room_names"].get(str(first.get("room_id") or ""), first.get("room_id"))
    before_fac = ctx["faculty_names"].get(str(first.get("faculty_id") or ""), first.get("faculty_id"))
    after_room = ctx["room_names"].get(str(room_id), room_id)
    after_fac = ctx["faculty_names"].get(str(faculty_id), faculty_id)
    checks = [
        f"Target slot {day} period {period} is inside the configured timetable.",
        f"Room {after_room} capacity/type/facilities verified for {first.get('student_count', 0)} students.",
        "Room and faculty are free at the target slot.",
        "Full timetable revalidated — no new hard-constraint violations.",
    ]
    subj = ctx["subject_of"](first) or "Class"
    return {
        "entry_ids": [e["id"] for e in group],
        "session_id": first.get("session_id"),
        "subject": subj,
        "course": ctx["course_names"].get(str(first.get("course_id") or "")),
        "section": first.get("section_name"),
        "batch": first.get("batch_id"),
        "before": {"day": first.get("day"), "period": first.get("period"),
                   "room_id": first.get("room_id"), "room": before_room,
                   "faculty_id": first.get("faculty_id"), "faculty": before_fac},
        "after": {"day": day, "period": period, "room_id": room_id, "room": after_room,
                  "faculty_id": faculty_id, "faculty": after_fac},
        "reason": reason,
        "conflicts_resolved": sorted(resolved),
        "new_conflicts": [],
        "checks": checks,
        "validation": "validated",
    }


def _try_repair_group(ctx, group, usable, baseline_errors, patched_so_far):
    """Find the best validated move for one group. Returns (change, new_patched) or None."""
    first = group[0]
    group_ids = {e["id"] for e in group}
    session = ctx["session_of"](first)
    students = max([int(e.get("student_count", 0) or 0) for e in group] + [0])
    faculty_pool = [first.get("faculty_id")] + [f for f in _eligible_faculty_ids(ctx, session) if f != first.get("faculty_id")]
    faculty_pool = [f for f in dict.fromkeys(faculty_pool) if f]
    room_pool = [r for r in ctx["rooms"] if _room_fits(r, session, students)]
    room_pool = sorted(room_pool, key=lambda r: 0 if str(r.get("id")) == str(first.get("room_id")) else 1)
    if not room_pool and first.get("room_id"):
        room_pool = [{"id": first.get("room_id")}]
    best = None
    baseline_set = set(baseline_errors)
    for day, period in sorted(usable, key=lambda s: _slot_sort_key(s[0], s[1], first, ctx["days"])):
        if day == first.get("day") and int(period) == int(first.get("period")):
            continue
        for room in room_pool:
            rid = str(room.get("id"))
            for fid in faculty_pool or [first.get("faculty_id")]:
                patched = _patched_entries(patched_so_far, group_ids, day, period, rid, fid)
                result = _validate_patched(ctx, patched)
                new_errors = set(result["errors"]) - baseline_set
                if new_errors:
                    continue
                resolved = baseline_set - set(result["errors"])
                if not resolved:
                    continue
                disruption = (0 if day == first.get("day") else 1,
                              0 if rid == str(first.get("room_id")) else 1,
                              0 if str(fid) == str(first.get("faculty_id")) else 1)
                key = (-len(resolved), disruption)
                if best is None or key < best[0]:
                    best = (key, day, period, rid, fid, resolved, patched)
                if rid == str(first.get("room_id")) and str(fid) == str(first.get("faculty_id")):
                    break
            else:
                continue
            break
    if not best:
        return None
    _, day, period, rid, fid, resolved, patched = best
    change = _describe_change(ctx, group, day, period, rid, fid,
                              f"Moves {_label(ctx, first)} out of its conflicted slot.", resolved)
    return change, patched


def generate_fix_proposal(ctx, budget: int = 12) -> tuple[list[dict], list[str], list[str]]:
    baseline = validate_current(ctx)["errors"]
    if not baseline:
        return [], [], []
    usable = usable_slots(ctx)
    if not usable:
        return [], baseline, baseline
    working = [dict(e) for e in ctx["entries"]]
    current_errors = list(baseline)
    changes = []
    seen_groups: set[str] = set()
    for _ in range(budget):
        progressed = False
        order = sorted(
            ({e["id"] for e in _group_entries(ctx, e)} for e in
             sorted(working, key=lambda e: (str(e.get("session_id") or ""), str(e.get("id"))))),
            key=lambda s: sorted(s),
        )
        tried: set[str] = set()
        for group_ids in order:
            key = ",".join(sorted(group_ids))
            if key in tried or key in seen_groups:
                continue
            tried.add(key)
            group = [e for e in working if e["id"] in group_ids]
            if not group or any(e.get("locked") for e in group):
                continue
            found = _try_repair_group(ctx, group, usable, current_errors, working)
            if found:
                change, working = found
                change["change_id"] = f"chg-{len(changes) + 1}"
                changes.append(change)
                current_errors = validate_current(ctx, working)["errors"]
                seen_groups.add(key)
                progressed = True
                break
        if not progressed:
            break
    return changes, baseline, current_errors


def _soft_cost(ctx, entries):
    day_load: dict[tuple[str, str], int] = Counter()
    for e in entries:
        if e.get("faculty_id"):
            day_load[(str(e["faculty_id"]), str(e.get("day")))] += 1
    loads = list(day_load.values())
    variance = (sum((v - sum(loads) / len(loads)) ** 2 for v in loads) / len(loads)) if loads else 0.0
    room_changes = 0
    gaps = 0
    per_section_day: dict[tuple[str, str], list] = defaultdict(list)
    for e in entries:
        per_section_day[(str(e.get("section_name") or e.get("batch_id") or ""), str(e.get("day")))].append(e)
    for items in per_section_day.values():
        ordered = sorted(items, key=lambda e: int(e.get("period")))
        rooms = [str(e.get("room_id") or "") for e in ordered]
        room_changes += sum(1 for a, b in zip(rooms, rooms[1:]) if a != b)
        ps = sorted({int(e.get("period")) for e in ordered})
        if len(ps) > 1:
            gaps += sum(1 for a, b in zip(ps, ps[1:]) if b - a > 1)
    return variance + 2.0 * room_changes + 1.5 * gaps


def generate_optimize_proposal(ctx, budget: int = 8) -> tuple[list[dict], list[str], list[str], dict]:
    baseline = validate_current(ctx)["errors"]
    baseline_set = set(baseline)
    usable = usable_slots(ctx)
    working = [dict(e) for e in ctx["entries"]]
    base_cost = _soft_cost(ctx, working)
    changes = []
    for _ in range(budget):
        best = None
        for e in sorted(working, key=lambda x: str(x.get("id"))):
            group = [x for x in working if x["id"] in {g["id"] for g in _group_entries(ctx, e)}]
            if any(g.get("locked") for g in group):
                continue
            group_ids = {g["id"] for g in group}
            first = group[0]
            for day, period in sorted(usable, key=lambda s: _slot_sort_key(s[0], s[1], first, ctx["days"])):
                if day == first.get("day") and int(period) == int(first.get("period")):
                    continue
                patched = _patched_entries(working, group_ids, day, period,
                                           str(first.get("room_id")),
                                           str(first.get("faculty_id")) if first.get("faculty_id") else None)
                result = _validate_patched(ctx, patched)
                if set(result["errors"]) - baseline_set:
                    continue
                cost = _soft_cost(ctx, patched)
                if cost < base_cost - 1e-9 and (best is None or cost < best[0]):
                    best = (cost, group, day, period)
        if not best:
            break
        cost, group, day, period = best
        first = group[0]
        change = _describe_change(ctx, group, day, period, str(first.get("room_id")),
                                  str(first.get("faculty_id")) if first.get("faculty_id") else None,
                                  "Improves workload balance / room stability / fewer gaps.", set())
        change["change_id"] = f"opt-{len(changes) + 1}"
        changes.append(change)
        working = _patched_entries(working, {g["id"] for g in group}, day, period,
                                   str(first.get("room_id")),
                                   str(first.get("faculty_id")) if first.get("faculty_id") else None)
        base_cost = cost
    proposed = validate_current(ctx, working)["errors"]
    info = {"cost_before": _soft_cost(ctx, ctx["entries"]), "cost_after": base_cost}
    return changes, baseline, proposed, info


def resolve_move(ctx, params: dict) -> tuple[dict | None, str]:
    """Resolve a single move request into one validated change (no storage)."""
    usable = usable_slots(ctx)
    target_day = params.get("day")
    target_period = params.get("period")
    try:
        target_period = int(target_period) if target_period is not None else None
    except (TypeError, ValueError):
        return None, "The period must be a number."
    candidates = list(ctx["entries"])
    entry_id = params.get("entry_id")
    if entry_id:
        candidates = [e for e in candidates if str(e.get("id")) == str(entry_id)]
    for key in ("subject", "subject_name"):
        if params.get(key):
            q = str(params[key]).lower()
            candidates = [e for e in candidates if q in str(ctx["subject_of"](e) or "").lower()]
    if params.get("faculty_id"):
        candidates = [e for e in candidates if str(e.get("faculty_id") or "") == str(params["faculty_id"])]
    if not candidates:
        return None, "I could not find a matching class. Please name the subject as it appears in the timetable."
    if len(candidates) > 1 and not entry_id:
        names = sorted({f"{ctx['subject_of'](e) or 'Class'} ({e.get('day')} P{e.get('period')})" for e in candidates})
        return None, "Multiple classes match. Which one did you mean: " + "; ".join(names[:8]) + "?"
    group = _group_entries(ctx, candidates[0])
    if any(e.get("locked") for e in group):
        return None, "That class is locked. Unlock it before rescheduling."
    group_ids = {e["id"] for e in group}
    first = group[0]
    baseline = validate_current(ctx)["errors"]
    baseline_set = set(baseline)
    if target_day and target_period:
        slots = [(target_day, target_period)]
    else:
        slots = sorted(usable, key=lambda s: _slot_sort_key(s[0], s[1], first, ctx["days"]))
    usable_set = set(usable)
    for day, period in slots:
        if str(day) == str(first.get("day")) and int(period) == int(first.get("period")):
            continue
        if (str(day), int(period)) not in usable_set:
            if target_day and target_period:
                return None, f"{day} period {period} is outside the configured timetable."
            continue
        room_id = str(params["room_id"]) if params.get("room_id") else str(first.get("room_id"))
        faculty_id = str(params["faculty_id"]) if params.get("faculty_id") else (str(first.get("faculty_id")) if first.get("faculty_id") else None)
        patched = _patched_entries([dict(e) for e in ctx["entries"]], group_ids, str(day), int(period), room_id, faculty_id)
        result = _validate_patched(ctx, patched)
        new_errors = set(result["errors"]) - baseline_set
        if target_day and target_period:
            if new_errors:
                return None, f"That slot is not free: {sorted(new_errors)[0]}."
            resolved = baseline_set - set(result["errors"])
            change = _describe_change(ctx, group, str(day), int(period), room_id, faculty_id,
                                      f"Moves {_label(ctx, first)} as requested.", resolved)
            change["change_id"] = "chg-1"
            return change, "ok"
        if not new_errors:
            resolved = baseline_set - set(result["errors"])
            change = _describe_change(ctx, group, str(day), int(period), room_id, faculty_id,
                                      f"Alternative free slot for {_label(ctx, first)}.", resolved)
            change["change_id"] = "chg-1"
            return change, "ok"
    return None, "No free validated slot is available. Review room capacity, availability, or constraints."


def compute_impact(ctx, baseline_errors, proposed_errors, changes, soft_info=None):
    base, prop = set(baseline_errors), set(proposed_errors)
    faculty, rooms, batches = set(), set(), set()
    for ch in changes:
        if ch.get("faculty"):
            faculty.add(str(ch["faculty"]))
        if ch.get("room"):
            rooms.add(str(ch["room"]))
        if ch.get("section"):
            batches.add(str(ch["section"]))
        if ch.get("batch"):
            batches.add(str(ch["batch"]))
    impact = {
        "total_changes": len(changes),
        "resolved": sorted(base - prop),
        "resolved_count": len(base - prop),
        "unresolved": sorted(base & prop),
        "unresolved_count": len(base & prop),
        "new_conflicts": sorted(prop - base),
        "new_conflict_count": len(prop - base),
        "faculty_affected": sorted(faculty),
        "rooms_affected": sorted(rooms),
        "batches_affected": sorted(batches),
        "hard_constraints": "satisfied" if not (prop - base) else "violated",
        "valid": not (prop - base),
    }
    if soft_info:
        impact["soft"] = soft_info
    return impact


# ------------------------------------------------------------------
# Chat (rule-based NLU over real data; no LLM, no direct mutation)
# ------------------------------------------------------------------

def _workload_table(ctx):
    load = Counter()
    names = ctx["faculty_names"]
    for e in ctx["entries"]:
        if e.get("faculty_id"):
            load[str(e["faculty_id"])] += 1
    return [{"faculty_id": fid, "name": names.get(fid, fid), "classes": n}
            for fid, n in load.most_common()]


def _period_mentioned(q: str) -> bool:
    import re
    return bool(re.search(r"\bp\s*\d|\bperiod\b", q.lower()))


def _extract_subject(ctx, q: str) -> str | None:
    ql = q.lower()
    names = sorted({str(ctx["subject_of"](e) or "") for e in ctx["entries"] if ctx["subject_of"](e)}, key=len, reverse=True)
    for name in names:
        if name.lower() in ql:
            return name
    return None


def answer_chat(db, run, message: str) -> dict[str, Any]:
    # Lazy import: sibling route helpers only (no import cycle at module load).
    from ..api.routes import timetable as tt
    ctx = load_context(db, run)
    q = (message or "").strip()
    ql = q.lower()
    if not q:
        return {"answer": "Please type a request, for example 'Fix all conflicts'.", "action": None}

    if any(w in ql for w in ("fix all", "fix every", "resolve all", "fix all conflicts", "fix conflict", "solve all")) or \
            (("fix" in ql or "resolve" in ql) and "conflict" in ql):
        validation = validate_current(ctx)
        n = len(validation["errors"])
        if not n:
            return {"answer": "I checked the timetable against all hard constraints — no conflicts found. Nothing to fix.", "action": None}
        return {"answer": f"I found {n} conflict(s). I will generate a validated proposal; review it before approving.",
                "action": {"type": "propose", "intent": "fix_all", "params": {}}}

    if "optim" in ql or "improve" in ql or "balance" in ql or "utilization" in ql or "utilisation" in ql:
        return {"answer": "I will look for safe improvements that keep every hard constraint satisfied.",
                "action": {"type": "propose", "intent": "optimize", "params": {}}}

    if ql.startswith("what happens if") or ("what if" in ql and "move" in ql):
        params = {}
        day = tt._normalize_day(q)
        if day:
            params["day"] = day
        num = tt._extract_number(q)
        if num is not None:
            params["period"] = num
        subj = _extract_subject(ctx, q)
        if subj:
            params["subject"] = subj
        if not subj or not day:
            return {"answer": "Tell me the class and the target day, e.g. 'What happens if I move Mathematics to Wednesday?'", "action": None}
        change, note = resolve_move(ctx, params)
        if change:
            if change["conflicts_resolved"]:
                resolved = "; ".join(change["conflicts_resolved"][:3])
                return {"answer": f"That move is safe and would resolve: {resolved}. I can prepare it as a proposal on request.", "action": None}
            return {"answer": "That move is safe — no new conflicts. I can prepare it as a proposal on request.", "action": None}
        return {"answer": note, "action": None}

    move_words = ("move ", "move this", "reschedul", "shift ", "another slot", "alternative slot")
    slot_words = ("slot", "move", "reschedul", "shift", "afternoon", "morning", "wednesday", "monday",
                  "tuesday", "thursday", "friday", "saturday", "period", "class")
    if any(w in ql for w in move_words) and any(w in ql for w in slot_words):
        params: dict[str, Any] = {}
        day = tt._normalize_day(q)
        if day:
            params["day"] = day
        num = tt._extract_number(q)
        if num is not None and _period_mentioned(q):
            params["period"] = num
        fac_name = tt._extract_faculty_name_from_text(q)
        if fac_name:
            fac = tt._find_faculty(fac_name, run.organization_id, db)
            if fac:
                params["faculty_id"] = str(fac.id)
        room_name = tt._extract_room_name_from_text(q)
        if room_name:
            room = tt._find_room(room_name, run.organization_id, db)
            if room:
                params["room_id"] = str(room.id)
        subj = _extract_subject(ctx, q)
        if subj:
            params["subject"] = subj
        if ("afternoon" in ql or "morning" in ql) and not day and num is None:
            return {"answer": "Which class should I move, and to which day? For example: 'Move Mathematics to Wednesday afternoon'.", "action": None}
        if not subj and not params.get("faculty_id") and not any(w in ql for w in ("subject", "class", "this")):
            return {"answer": "Which class should I reschedule? Name the subject as it appears in the timetable.", "action": None}
        change, note = resolve_move(ctx, params)
        if change:
            return {"answer": "Proposed move validated — review it before approving.",
                    "action": {"type": "propose", "intent": "move_class", "params": params}}
        return {"answer": note, "action": None}

    if "highest workload" in ql or "busiest" in ql or "workload" in ql or "overload" in ql:
        table = _workload_table(ctx)
        if not table:
            return {"answer": "No faculty assignments found in this timetable.", "action": None}
        lines = ", ".join(f"{t['name']} ({t['classes']} classes)" for t in table[:3])
        return {"answer": f"Highest workloads: {lines}.", "action": None}

    if any(w in ql for w in ("why", "explain", "conflict", "problem", "issue", "wrong")):
        validation = validate_current(ctx)
        conflicts = classify_conflicts(validation, ctx)
        if not conflicts:
            return {"answer": "The timetable passes all hard-constraint checks. No conflicts to explain.", "action": None}
        top = conflicts[:3]
        lines = "; ".join(f"{c['type'].replace('_', ' ')}: {c['explanation']}" for c in top)
        extra = f" (+{len(conflicts) - 3} more)" if len(conflicts) > 3 else ""
        return {"answer": f"Found {len(conflicts)} conflict(s). {lines}{extra} Use 'Fix all conflicts' to generate a validated proposal.",
                "action": {"type": "analyze"}}

    if any(w in ql for w in ("analyz", "analyse", "check", "status", "summary", "health")):
        validation = validate_current(ctx)
        n = len(validation["errors"])
        if not n:
            return {"answer": f"Analysis complete: {len(ctx['entries'])} entries checked, timetable is conflict-free.", "action": {"type": "analyze"}}
        return {"answer": f"Analysis complete: {n} conflict(s) across {len(ctx['entries'])} entries. Opening the detailed breakdown.",
                "action": {"type": "analyze"}}

    # Fall back to the existing general Q&A over real data.
    from ..models import AcademicSession, Course, Faculty, Room, TimetableEntry
    rows = db.query(TimetableEntry).filter(TimetableEntry.run_id == run.id).all()
    course_names = {r.id: r.name for r in db.query(Course).all()}
    course_codes = {r.id: r.code for r in db.query(Course).all()}
    faculty_names = {r.id: r.name for r in db.query(Faculty).all()}
    room_names = {r.id: r.name for r in db.query(Room).all()}
    try:
        result = tt._rule_based_ai(q, rows, course_names, course_codes, faculty_names, room_names, run)
        return {"answer": result.get("answer", "I could not answer that."), "action": None}
    except Exception as exc:
        return {"answer": f"I encountered an error: {exc}", "action": None}
