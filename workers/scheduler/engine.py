"""Production-oriented CP-SAT timetable optimizer for Campus Flow.

The solver is deliberately independent from FastAPI and the database. It accepts a
normalized JSON scheduling model and returns a deterministic, independently validated
schedule. It supports theory sessions and multi-group lab sessions, resource
availability, hard constraints, soft preferences, locked entries, workload caps,
and campus/building constraints.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from .validator import validate_entries


@dataclass(frozen=True)
class Slot:
    day: str
    period: int


class SchedulingError(ValueError):
    """Raised when the supplied scheduling model cannot be solved."""


def _normalise_days(config: dict[str, Any]) -> list[str]:
    return list(config.get("days") or config.get("working_days") or ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"])


def _normalise_periods(config: dict[str, Any]) -> list[int]:
    periods = config.get("periods")
    if periods:
        return [int(p) for p in periods]
    count = int(config.get("period_count", 8))
    return list(range(1, count + 1))


def _norm_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, (list, tuple, set)):
        return list(value)
    return [value]


def _room_type_match(actual: Any, required: Any) -> bool:
    if not required:
        return True
    return str(actual or "").strip().lower() == str(required).strip().lower()


def _facility_match(room: dict[str, Any], required: list[str]) -> bool:
    facilities = room.get("facilities") or {}
    return all(bool(facilities.get(name)) for name in required)


def _blocked(resource: dict[str, Any], day: str, period: int) -> bool:
    availability = resource.get("availability") or {}
    for item in availability.get("blocked", []) or []:
        if str(item.get("day")) == day and int(item.get("period", -1)) == period:
            return True
    return False


def _available(resource: dict[str, Any], day: str, period: int) -> bool:
    availability = resource.get("availability") or {}
    if availability.get("days") and day not in availability["days"]:
        return False
    if _blocked(resource, day, period):
        return False
    if resource.get("leaveDates") and day in resource["leaveDates"]:
        return False
    if resource.get("leave_dates") and day in resource["leave_dates"]:
        return False
    return True


def _faculty_available(faculty: dict[str, Any], day: str, period: int, config: dict[str, Any] | None = None) -> bool:
    if faculty.get("availableDays") and day not in faculty["availableDays"]:
        return False
    if faculty.get("leaveDates") and day in faculty["leaveDates"]:
        return False

    # Faculty-specific time window availability (e.g. available only 10:00–13:00)
    availability = faculty.get("availability") or {}
    from_time = availability.get("from")
    to_time = availability.get("to")
    if (from_time or to_time) and config:
        period_times = config.get("period_times") or {}
        pt = period_times.get(str(period))
        if pt:
            parts = str(pt).split("-")
            if len(parts) == 2:
                p_start = _to_minutes(parts[0])
                p_end = _to_minutes(parts[1])
                if from_time and p_start < _to_minutes(str(from_time)):
                    return False
                if to_time and p_end > _to_minutes(str(to_time)):
                    return False

    return _available(faculty, day, period)


def _period_blocked(config: dict[str, Any], day: str, period: int) -> bool:
    for item in config.get("blocked_slots", config.get("blockedSlots", [])) or []:
        if str(item.get("day")) == day and int(item.get("period", -1)) == period:
            return True
    for item in config.get("break_slots", config.get("breakSlots", [])) or []:
        if str(item.get("day", "*")) in ("*", day) and int(item.get("period", -1)) == period:
            return True
    return False


def _candidate_faculty(session: dict[str, Any], faculty: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    ids = [str(x) for x in _norm_list(session.get("faculty_ids")) if x is not None]
    if session.get("faculty_id") is not None:
        ids.append(str(session["faculty_id"]))
    ids = list(dict.fromkeys(ids))
    if ids:
        return [faculty[x] for x in ids if x in faculty]
    subject_ids = {str(x) for x in _norm_list(session.get("subject_faculty_ids"))}
    if subject_ids:
        return [person for fid, person in faculty.items() if fid in subject_ids]
    return list(faculty.values())


def normalize_sessions(config: dict[str, Any]) -> list[dict[str, Any]]:
    """Normalize sessions, subjects/courses, and optional multi-group labs."""
    source = config.get("sessions") or config.get("subjects") or config.get("courses") or []
    sessions: list[dict[str, Any]] = []
    for item_index, item in enumerate(source):
        weekly = max(1, int(item.get("weeklyPeriods", item.get("weekly_periods", 1))))
        groups = item.get("groups") or []
        base_section = item.get("sectionName", item.get("section_name")) or item.get("section")
        base_batch = item.get("batchId", item.get("batch_id"))
        mode = str(item.get("mode", item.get("type", "theory"))).lower()
        is_lab = mode in {"lab", "practical", "lab-group"} or bool(groups)

        units = groups if is_lab and groups else [{
            "id": f"{item.get('id', item.get('code', f'session-{item_index}'))}-unit",
            "studentCount": int(item.get("studentCount", item.get("student_count", 0))),
        }]

        for occurrence in range(weekly):
            sid_base = item.get("id", item.get("code", f"session-{item_index}"))
            sid = f"{sid_base}:{occurrence + 1}"
            normalized_units = []
            for unit_index, unit in enumerate(units):
                normalized_units.append({
                    "id": str(unit.get("id", f"{sid}:unit-{unit_index + 1}")),
                    "group_name": unit.get("name", unit.get("groupName")),
                    "student_count": int(unit.get("studentCount", unit.get("student_count", item.get("studentCount", item.get("student_count", 0))))),
                    "campus_id": unit.get("campusId", unit.get("campus_id", item.get("campusId", item.get("campus_id")))),
                    "building_id": unit.get("buildingId", unit.get("building_id", item.get("buildingId", item.get("building_id")))),
                })
            sessions.append({
                "id": sid,
                "course_id": item.get("courseId", item.get("course_id"),),
                "subject_id": item.get("subjectId", item.get("subject_id", item.get("id"))),
                "faculty_id": item.get("facultyId", item.get("faculty_id")),
                "faculty_ids": item.get("facultyIds", item.get("faculty_ids", [])) or [],
                "subject_faculty_ids": item.get("subjectFacultyIds", item.get("subject_faculty_ids", [])) or [],
                "section_name": base_section,
                "batch_id": base_batch,
                "student_count": int(item.get("studentCount", item.get("student_count", 0))),
                "required_facilities": item.get("requiredFacilities", item.get("required_facilities", [])) or [],
                "room_type": item.get("roomType", item.get("room_type")),
                "occurrence": occurrence + 1,
                "preferred_days": [str(x) for x in _norm_list(item.get("preferredDays", item.get("preferred_days", [])))],
                "preferred_periods": [int(x) for x in _norm_list(item.get("preferredPeriods", item.get("preferred_periods", [])))],
                "units": normalized_units,
                "is_lab": is_lab,
                "locked": item.get("locked", False),
            })
    return sessions


def _locked_assignments(config: dict[str, Any]) -> list[dict[str, Any]]:
    return list(config.get("locked_entries") or config.get("lockedEntries") or [])


def _same_session_section(session: dict[str, Any]) -> str:
    return str(session.get("section_name") or "")


def _to_minutes(hhmm: str) -> int:
    parts = str(hhmm).split(":")
    return int(parts[0]) * 60 + int(parts[1])


def _compute_blocked_periods(config: dict[str, Any], days: list[str], periods: list[int]) -> list[dict[str, Any]]:
    """Compute periods that fall inside lunch or break windows.

    If ``period_times`` is provided (from the frontend), each period is checked
    for time-range overlap with the lunch window. Otherwise the engine replicates
    the frontend's cursor-based period generation to determine which periods
    overlap with lunch or break gaps.
    """
    lunch = config.get("lunch") or {}
    lunch_start_min = _to_minutes(lunch.get("start", "12:30")) if lunch.get("start") else None
    lunch_duration = int(lunch.get("duration_minutes", 0)) if lunch.get("duration_minutes") else 0
    lunch_end_min = (lunch_start_min + lunch_duration) if lunch_start_min is not None else None

    brk = config.get("break") or {}
    break_after = int(brk.get("after_periods", 0)) if brk.get("after_periods") else 0
    break_duration = int(brk.get("duration_minutes", 0)) if brk.get("duration_minutes") else 0

    extra_blocked: list[dict[str, Any]] = []

    # Fast path: if period_times is provided, check each period's time range
    period_times = config.get("period_times")
    if period_times and lunch_start_min is not None and lunch_end_min is not None:
        for day in days:
            for p in periods:
                pt = period_times.get(str(p))
                if not pt:
                    extra_blocked.append({"day": day, "period": p})
                    continue
                parts = str(pt).split("-")
                if len(parts) == 2:
                    p_start = _to_minutes(parts[0])
                    p_end = _to_minutes(parts[1])
                    if p_start < lunch_end_min and lunch_start_min < p_end:
                        extra_blocked.append({"day": day, "period": p})
        return extra_blocked

    # Slow path: replicate the frontend's cursor logic to find which periods overlap
    day_start = _to_minutes(config.get("day_start", config.get("dayStart", "09:00")))
    period_duration = int(config.get("period_duration_minutes", config.get("periodDurationMinutes", 60)))
    max_period = max(periods) if periods else 8

    for day in days:
        cursor = day_start
        period_num = 0
        since_break = 0
        for _ in range(max_period + 2):
            period_num += 1
            period_start = cursor
            period_end = cursor + period_duration

            # Check lunch overlap for this period
            if lunch_start_min is not None and lunch_end_min is not None:
                if period_start < lunch_end_min and lunch_start_min < period_end:
                    extra_blocked.append({"day": day, "period": period_num})

            since_break += 1
            cursor = period_end

            # Break: only if cursor (after period end) is still before lunch
            if break_after > 0 and break_duration > 0 and since_break >= break_after:
                if lunch_start_min is None or cursor < lunch_start_min:
                    # Check if the break window overlaps with the NEXT period
                    break_start = cursor
                    break_end = cursor + break_duration
                    next_period_start = break_end
                    next_period_end = next_period_start + period_duration
                    # The break itself doesn't block a period, but if the break
                    # shifts the next period into the lunch window, that will be
                    # caught by the lunch check above on the next iteration.
                    cursor = break_end
                    since_break = 0

            # Lunch: jump cursor past the lunch window
            if lunch_start_min is not None and lunch_duration > 0:
                if cursor >= lunch_start_min and cursor < lunch_start_min + lunch_duration:
                    cursor = lunch_start_min + lunch_duration

        # Any period numbers beyond what the loop produced are blocked
        for p in periods:
            if p > period_num:
                extra_blocked.append({"day": day, "period": p})

    return extra_blocked


def solve(config: dict[str, Any]) -> dict[str, Any]:
    days = _normalise_days(config)

    # Bug 3 fix: respect allowSaturday constraint
    if not config.get("allowSaturday", config.get("constraints", {}).get("allowSaturday", True)):
        days = [d for d in days if d != "Saturday"]

    periods = _normalise_periods(config)

    # If period_times is provided, restrict periods to those that have time entries
    # (the frontend skips lunch/break when computing period_times)
    period_times = config.get("period_times")
    if period_times:
        valid_periods = {int(k) for k in period_times.keys()}
        periods = [p for p in periods if p in valid_periods]

    # Compute lunch/break blocked periods and merge into config's blocked_slots
    extra_blocked = _compute_blocked_periods(config, days, periods)
    existing_blocked = list(config.get("blocked_slots", config.get("blockedSlots", [])) or [])
    existing_blocked.extend(extra_blocked)
    config["blocked_slots"] = existing_blocked

    rooms = config.get("rooms") or []
    faculty_list = config.get("faculty") or []
    faculty = {str(x.get("id")): x for x in faculty_list if x.get("id") is not None}
    sessions = normalize_sessions(config)

    if not sessions:
        raise SchedulingError("No schedulable sessions were supplied.")
    if not rooms:
        raise SchedulingError("No rooms were supplied.")
    if not faculty:
        raise SchedulingError("No faculty were supplied.")

    room_by_id = {str(r.get("id")): r for r in rooms if r.get("id") is not None}
    slots = [Slot(day, period) for day in days for period in periods if not _period_blocked(config, day, period)]
    if not slots:
        raise SchedulingError("No usable timetable slots remain after blocked periods.")

    try:
        from ortools.sat.python import cp_model
    except ImportError as exc:
        raise SchedulingError("OR-Tools is not installed. Install the backend requirements before running the CP-SAT solver.") from exc

    model = cp_model.CpModel()
    slot_vars: dict[tuple[str, str, int], cp_model.IntVar] = {}
    assign_vars: dict[tuple[str, str, str, str, int, str], cp_model.IntVar] = {}
    candidates_by_unit: dict[tuple[str, str], list[tuple[str, str, int, str]]] = defaultdict(list)
    session_by_id = {s["id"]: s for s in sessions}

    # Candidate generation and exact-one constraints.
    for session in sessions:
        sid = session["id"]
        unit_candidates = []
        for unit in session["units"]:
            uid = unit["id"]
            faculty_candidates = _candidate_faculty(session, faculty)
            if not faculty_candidates:
                raise SchedulingError(f"No eligible faculty exists for session {sid}.")
            for slot in slots:
                for person in faculty_candidates:
                    if not _faculty_available(person, slot.day, slot.period, config):
                        continue
                    for room in rooms:
                        rid = str(room.get("id"))
                        if not rid or not room.get("timetableAvailable", True):
                            continue
                        if not _available(room, slot.day, slot.period):
                            continue
                        required_capacity = int(unit.get("student_count", session["student_count"]))
                        if required_capacity and int(room.get("capacity", 0)) < required_capacity:
                            continue
                        if not _room_type_match(room.get("room_type", room.get("roomType")), session.get("room_type")):
                            continue
                        if not _facility_match(room, session["required_facilities"]):
                            continue
                        campus_id = unit.get("campus_id")
                        building_id = unit.get("building_id")
                        if campus_id and room.get("campusId", room.get("campus_id")) and str(campus_id) != str(room.get("campusId", room.get("campus_id"))):
                            continue
                        if building_id and room.get("buildingId", room.get("building_id")) and str(building_id) != str(room.get("buildingId", room.get("building_id"))):
                            continue
                        key = (sid, uid, str(person["id"]), rid, slot.period)
                        # Day is included in the variable name/key via slot_vars below.
                        var = model.NewBoolVar(f"assign_{len(assign_vars)}")
                        assign_vars[(sid, uid, str(person["id"]), rid, slot.period, slot.day)] = var
                        candidates_by_unit[(sid, uid)].append((str(person["id"]), rid, slot.day, slot.period))
                        unit_candidates.append((uid, str(person["id"]), rid, slot.day, slot.period, var))

            if not any(x[0] == uid for x in unit_candidates):
                raise SchedulingError(f"No valid faculty/room/slot exists for session {sid}, unit {uid}.")

            model.Add(sum(x[5] for x in unit_candidates if x[0] == uid) == 1)

        # All units of a lab session must share the same slot.
        for slot in slots:
            sv = model.NewBoolVar(f"session_slot_{sid}_{slot.day}_{slot.period}")
            slot_vars[(sid, slot.day, slot.period)] = sv
            for uid in [u["id"] for u in session["units"]]:
                unit_at_slot = [
                    x[5] for x in unit_candidates
                    if x[0] == uid and x[3] == slot.day and x[4] == slot.period
                ]
                if unit_at_slot:
                    model.Add(sum(unit_at_slot) == sv)
                else:
                    model.Add(sv == 0)
        model.Add(sum(slot_vars[(sid, s.day, s.period)] for s in slots) == 1)

    # Resource collision constraints. Rooms and faculty are per-unit resources,
    # while section/batch occupancy is per-session. This distinction is essential
    # for multi-group labs: all groups intentionally share one slot, but they must
    # still use different rooms and faculty members.
    room_buckets: dict[tuple[str, str, int], list[cp_model.IntVar]] = defaultdict(set)
    faculty_buckets: dict[tuple[str, str, int], list[cp_model.IntVar]] = defaultdict(set)
    section_buckets: dict[tuple[str, str, int], list[cp_model.IntVar]] = defaultdict(set)
    batch_buckets: dict[tuple[str, str, int], list[cp_model.IntVar]] = defaultdict(set)

    for (sid, _uid, fid, rid, period, day), var in assign_vars.items():
        room_buckets[(rid, day, period)].add(var)
        faculty_buckets[(fid, day, period)].add(var)
        session = session_by_id[sid]
        # Section and batch occupancy are per-session; the session occupies the
        # whole slot at once, so use the session-level slot variable and add it
        # exactly once per (session, day, period). Using a set deduplicates the
        # multiple assignment vars that a single session may generate (one per
        # candidate room) so the at-most-one constraint never sees duplicates.
        session_slot = slot_vars[(sid, day, period)]
        if session.get("section_name"):
            section_buckets[(str(session["section_name"]), day, period)].add(session_slot)
        if session.get("batch_id"):
            batch_buckets[(str(session["batch_id"]), day, period)].add(session_slot)

    for group in (*room_buckets.values(), *faculty_buckets.values(), *section_buckets.values(), *batch_buckets.values()):
        model.Add(sum(group) <= 1)

    # Faculty workload constraints.
    period_hours = float(config.get("period_duration_hours", config.get("periodDurationHours", 1)))
    max_daily_global = int(config.get("max_classes_per_day", config.get("maxClassesPerDay", 0)) or 0)
    for fid, person in faculty.items():
        weekly_cap = float(person.get("max_weekly_hours", person.get("maxWeeklyHours", 0)) or 0)
        if weekly_cap > 0:
            model.Add(sum(var for (sid, _uid, pfid, _rid, _p, _d), var in assign_vars.items() if pfid == fid) <= int(weekly_cap / period_hours + 1e-9))
        # Use the lower of faculty-specific and global daily limit
        faculty_daily = int(person.get("max_classes_per_day", person.get("maxClassesPerDay", 0)) or 0)
        effective_daily = min(faculty_daily, max_daily_global) if (faculty_daily > 0 and max_daily_global > 0) else (faculty_daily or max_daily_global)
        if effective_daily > 0:
            for day in days:
                model.Add(sum(var for (_sid, _uid, pfid, _rid, _p, d), var in assign_vars.items() if pfid == fid and d == day) <= effective_daily)

    # Same-subject spacing and daily frequency.
    by_subject_section: dict[tuple[str, str], list[str]] = defaultdict(list)
    for session in sessions:
        by_subject_section[(str(session.get("subject_id")), _same_session_section(session))].append(session["id"])
    max_same_subject_per_day = int(config.get("max_same_subject_per_day", config.get("maxSameSubjectPerDay", 0)) or 0)
    min_gap = int(config.get("min_gap_between_same_subject", config.get("minGapBetweenSameSubject", 0)) or 0)
    for (_subject, _section), sids in by_subject_section.items():
        if max_same_subject_per_day > 0:
            for day in days:
                model.Add(sum(slot_vars[(sid, day, period)] for sid in sids for period in periods if (sid, day, period) in slot_vars) <= max_same_subject_per_day)
        if min_gap > 0:
            for i, sid_a in enumerate(sids):
                for sid_b in sids[i + 1:]:
                    for day in days:
                        for pa in periods:
                            for pb in periods:
                                if pa == pb or abs(pa - pb) <= min_gap:
                                    a = slot_vars.get((sid_a, day, pa))
                                    b = slot_vars.get((sid_b, day, pb))
                                    if a is not None and b is not None:
                                        model.Add(a + b <= 1)

    # Locked entries are hard assignments. Multiple units can share the same locked slot only
    # when they belong to the same lab session and use distinct resources.
    locked = _locked_assignments(config)
    for item in locked:
        sid = str(item.get("session_id", item.get("sessionId", "")))
        if sid not in session_by_id:
            continue
        day = str(item["day"])
        period = int(item["period"])
        uid = str(item.get("unit_id", item.get("unitId", session_by_id[sid]["units"][0]["id"])))
        fid = item.get("faculty_id", item.get("facultyId"))
        rid = item.get("room_id", item.get("roomId"))
        for key, var in assign_vars.items():
            ks, ku, kf, kr, kp, kd = key
            if ks != sid or ku != uid:
                continue
            allowed = kd == day and kp == period and (fid is None or kf == str(fid)) and (rid is None or kr == str(rid))
            if not allowed:
                model.Add(var == 0)
        sv = slot_vars.get((sid, day, period))
        if sv is not None:
            model.Add(sv == 1)
        else:
            raise SchedulingError(f"Locked entry {sid} points to an unavailable slot.")

    # Objective: preferences, room efficiency, workload balance, and avoid-last-period.
    objective_terms: list[Any] = []
    for (sid, day, period), var in slot_vars.items():
        session = session_by_id[sid]
        penalty = 0
        if session["preferred_days"] and day not in session["preferred_days"]:
            penalty += int(config.get("preferred_day_penalty", 100))
        if session["preferred_periods"] and period not in session["preferred_periods"]:
            penalty += int(config.get("preferred_period_penalty", 30))
        if config.get("avoid_last_period") and period == max(periods):
            penalty += int(config.get("avoid_last_period_penalty", 10))
        if penalty:
            objective_terms.append(penalty * var)

    # Prefer the smallest room that fits. Lab groups are scored per selected room below.
    for (sid, uid, fid, rid, period, day), var in assign_vars.items():
        session = session_by_id[sid]
        required = int(next(u["student_count"] for u in session["units"] if u["id"] == uid) or session["student_count"])
        capacity = int(room_by_id[rid].get("capacity", 0))
        waste_penalty = max(0, capacity - required) // 10
        if waste_penalty:
            objective_terms.append(waste_penalty * var)

    if objective_terms:
        model.Minimize(sum(objective_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(config.get("time_limit_seconds", config.get("timeLimitSeconds", 30)))
    solver.parameters.num_search_workers = int(config.get("num_workers", config.get("numWorkers", 8)))
    solver.parameters.random_seed = int(config.get("random_seed", config.get("randomSeed", 1)))
    status = solver.Solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        raise SchedulingError("No feasible timetable satisfies the hard constraints.")

    entries: list[dict[str, Any]] = []
    for (sid, uid, fid, rid, period, day), var in assign_vars.items():
        if not solver.Value(var):
            continue
        session = session_by_id[sid]
        unit = next(u for u in session["units"] if u["id"] == uid)
        reasons = ["hard_constraints_satisfied"]
        if session["preferred_days"] and day in session["preferred_days"]:
            reasons.append("preferred_day")
        if session["preferred_periods"] and period in session["preferred_periods"]:
            reasons.append("preferred_period")
        if session["is_lab"]:
            reasons.append("lab_groups_share_slot")
        entries.append({
            "session_id": sid,
            "course_id": session["course_id"],
            "faculty_id": fid,
            "room_id": rid,
            "section_name": session["section_name"],
            "batch_id": session["batch_id"],
            "unit_id": uid,
            "group_name": unit.get("group_name"),
            "student_count": unit.get("student_count", session["student_count"]),
            "day": day,
            "period": period,
            "locked": any(str(x.get("session_id", x.get("sessionId", ""))) == sid and str(x.get("unit_id", x.get("unitId", uid))) == uid for x in locked),
            "reasons": reasons,
        })

    validation = validate_entries(entries, sessions=sessions, rooms=rooms, faculty=list(faculty.values()), config=config)
    if not validation["valid"]:
        raise SchedulingError("Independent validation failed: " + "; ".join(validation["errors"][:10]))

    return {
        "status": "SOLVED",
        "solver_status": solver.StatusName(status),
        "score": float(solver.ObjectiveValue()) if objective_terms else 0.0,
        "entries": entries,
        "validation": validation,
        "metrics": {
            "sessions": len(sessions),
            "entries": len(entries),
            "days": len(days),
            "periods_per_day": len(periods),
            "rooms": len(rooms),
            "faculty": len(faculty),
            "lab_sessions": sum(bool(s["is_lab"]) for s in sessions),
        },
    }
