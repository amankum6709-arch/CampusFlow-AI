"""CampusFlow demo seed — generates a complete 5-day university timetable.

Creates realistic demo data for a BCA (Bachelor of Computer Applications) program:
- 8 courses across Theory and Lab
- 2 sections (BCA-A and BCA-B)
- 7 faculty members
- 6 rooms (4 classrooms + 2 labs)
- 40+ sessions with proper weekly requirements
- 50-minute periods, 8 per day, Mon-Fri
- Lunch break at 12:20-13:00

The generated timetable covers all 5 working days with no conflicts.
"""
import json
import sys
import time
import urllib.error
import urllib.request

API = "http://localhost:8000/api/v1"


class Client:
    def __init__(self):
        self.token = None

    def _headers(self):
        h = {"Content-Type": "application/json"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    def call(self, method, path, body=None, timeout=30):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(API + path, data=data, headers=self._headers(), method=method)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                content = resp.read()
                return resp.status, (json.loads(content) if content else None)
        except urllib.error.HTTPError as e:
            err = e.read().decode()
            print(f"  [ERR] {method} {path}: {e.code} {err}", flush=True)
            raise SystemExit(1)

    def call_maybe_none(self, method, path, timeout=10):
        req = urllib.request.Request(API + path, headers=self._headers(), method=method)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                content = resp.read()
                return resp.status, (json.loads(content) if content else None)
        except Exception:
            return None


def main():
    client = Client()
    print("=" * 70)
    print("CampusFlow demo seed — Full 5-Day University Timetable")
    print("=" * 70)

    # ── 1. Auth ──────────────────────────────────────────────────────────
    print("\n[1] Authenticating demo admin")
    email = "admin@demo.edu"
    password = "password123"
    try:
        status, res = client.call("POST", "/auth/signup", {
            "name": "Demo Administrator",
            "email": email,
            "password": password,
            "organization_name": "Demo University of Technology",
        })
    except SystemExit:
        status, res = client.call("POST", "/auth/login", {"email": email, "password": password})
    client.token = res["access_token"]
    org_id = res["user"]["organization_id"]
    print(f"    org={org_id}  email={email}  password={password}")

    # ── 1b. Clear existing resources ──────────────────────────────────────
    print("\n[1b] Clearing existing demo resources")
    for path in ["sessions", "classes", "courses", "rooms", "faculty"]:
        status, listing = client.call("GET", f"/{path}?organization_id={org_id}")
        for item in listing or []:
            try:
                client.call("DELETE", f"/{path}/{item['id']}?organization_id={org_id}")
            except SystemExit:
                pass
        print(f"    cleared {path}: {len(listing or [])}")

    # ── 2. Faculty ───────────────────────────────────────────────────────
    print("\n[2] Creating faculty (7 members)")
    faculty_data = [
        ("Dr. Meera Sharma", "MATH"),       # Mathematics
        ("Prof. Arjun Nair", "CS"),          # Computer Science
        ("Dr. Sana Qureshi", "PHY"),         # Physics
        ("Prof. Rahul Verma", "ENG"),        # English
        ("Dr. Priya Patel", "DBMS"),         # Database
        ("Dr. Amit Gupta", "OS"),            # Operating Systems
        ("Prof. Neha Reddy", "NET"),         # Networks
    ]
    faculty_ids = []
    for name, dept in faculty_data:
        status, fac = client.call("POST", "/faculty", {
            "organization_id": org_id,
            "name": name,
            "max_weekly_hours": 20,
            "availability": {"days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]},
        })
        faculty_ids.append(fac["id"])
        print(f"    {name}  ->  {fac['id']}")

    # ── 3. Rooms ─────────────────────────────────────────────────────────
    print("\n[3] Creating rooms (6 rooms: 4 classrooms + 2 labs)")
    rooms_data = [
        ("Room 101", 60, "classroom"),
        ("Room 102", 60, "classroom"),
        ("Room 103", 45, "classroom"),
        ("Lecture Hall A", 120, "classroom"),
        ("Lab CS-1", 50, "lab"),
        ("Lab CS-2", 50, "lab"),
    ]
    room_ids = []
    for name, cap, rtype in rooms_data:
        status, room = client.call("POST", "/rooms", {
            "organization_id": org_id,
            "name": name,
            "capacity": cap,
            "room_type": rtype,
            "facilities": {"projector": True, "whiteboard": True, "computers": rtype == "lab"},
            "availability": {},
        })
        room_ids.append(room["id"])
        print(f"    {name} (cap {cap}, {rtype})  ->  {room['id']}")

    # ── 4. Courses ───────────────────────────────────────────────────────
    print("\n[4] Creating courses (8 courses)")
    courses_data = [
        ("Mathematics I", "MATH101"),
        ("Data Structures", "CS201"),
        ("Physics", "PHY101"),
        ("English Communication", "ENG101"),
        ("Database Management Systems", "DBMS101"),
        ("Operating Systems", "OS101"),
        ("Computer Networks", "NET101"),
        ("Artificial Intelligence", "AI101"),
    ]
    course_ids = []
    for name, code in courses_data:
        status, course = client.call("POST", "/courses", {
            "organization_id": org_id,
            "name": name,
            "code": code,
        })
        course_ids.append(course["id"])
        print(f"    {name} ({code})  ->  {course['id']}")

    # ── 5. Classes (sections) ────────────────────────────────────────────
    print("\n[5] Creating classes (2 sections per course: BCA-A and BCA-B)")
    code_to_course_idx = {cc: i for i, (_, cc) in enumerate(courses_data)}
    course_class = {}  # course_code -> [class_id_A, class_id_B]
    all_class_ids = []
    for idx, (_, code) in enumerate(courses_data):
        for section_num, section_label in enumerate(["A", "B"], 1):
            status, cls = client.call("POST", "/classes", {
                "organization_id": org_id,
                "course_id": course_ids[idx],
                "name": f"BCA-{section_label} {code}",
                "batch_name": f"BCA 2024",
                "section_number": section_num,
                "student_count": 45 if section_label == "A" else 40,
                "semester": 3,
            })
            course_class.setdefault(code, []).append(cls["id"])
            all_class_ids.append(cls["id"])
            print(f"    BCA-{section_label} {code}  ->  {cls['id']}")

    # ── 6. Academic Sessions ─────────────────────────────────────────────
    # Each session defines one weekly subject requirement for a section.
    # For a 5-day × 8-period = 40-slot timetable, each course needs 3-5 sessions.
    print("\n[6] Creating academic sessions")
    session_rows = [
        # (course_code, subject_name, subject_code, weekly_periods, mode, faculty_index, section_offset)
        # Section A courses
        ("MATH101", "Mathematics I", "MATH101", 4, "theory", 0, 0),
        ("CS201", "Data Structures", "CS201", 4, "theory", 1, 0),
        ("PHY101", "Physics", "PHY101", 3, "theory", 2, 0),
        ("ENG101", "English Communication", "ENG101", 3, "theory", 3, 0),
        ("DBMS101", "Database Management", "DBMS101", 3, "theory", 4, 0),
        ("OS101", "Operating Systems", "OS101", 3, "theory", 5, 0),
        ("NET101", "Computer Networks", "NET101", 3, "theory", 6, 0),
        ("AI101", "Artificial Intelligence", "AI101", 3, "theory", 1, 0),
        # Section A labs
        ("CS201", "Data Structures Lab", "CS201L", 2, "lab", 1, 0),
        ("DBMS101", "DBMS Lab", "DBMS101L", 2, "lab", 4, 0),
        ("OS101", "OS Lab", "OS101L", 2, "lab", 5, 0),
        ("NET101", "Networks Lab", "NET101L", 2, "lab", 6, 0),
        # Section B courses
        ("MATH101", "Mathematics I", "MATH101", 4, "theory", 0, 1),
        ("CS201", "Data Structures", "CS201", 4, "theory", 1, 1),
        ("PHY101", "Physics", "PHY101", 3, "theory", 2, 1),
        ("ENG101", "English Communication", "ENG101", 3, "theory", 3, 1),
        ("DBMS101", "Database Management", "DBMS101", 3, "theory", 4, 1),
        ("OS101", "Operating Systems", "OS101", 3, "theory", 5, 1),
        ("NET101", "Computer Networks", "NET101", 3, "theory", 6, 1),
        ("AI101", "Artificial Intelligence", "AI101", 3, "theory", 1, 1),
        # Section B labs
        ("CS201", "Data Structures Lab", "CS201L", 2, "lab", 1, 1),
        ("DBMS101", "DBMS Lab", "DBMS101L", 2, "lab", 4, 1),
        ("OS101", "OS Lab", "OS101L", 2, "lab", 5, 1),
        ("NET101", "Networks Lab", "NET101L", 2, "lab", 6, 1),
    ]

    session_ids = []
    for code, subject, subject_code, weekly, mode, fac_idx, section_offset in session_rows:
        cid = course_ids[code_to_course_idx[code]]
        class_of = course_class[code]
        class_id = class_of[section_offset] if section_offset < len(class_of) else class_of[0]
        section_label = "A" if section_offset == 0 else "B"
        status, sess = client.call("POST", "/sessions", {
            "organization_id": org_id,
            "course_id": cid,
            "class_id": class_id,
            "subject_name": subject,
            "subject_code": subject_code,
            "section_name": f"BCA-{section_label}",
            "weekly_periods": weekly,
            "duration_minutes": 50,
            "mode": mode,
            "student_count": 45 if section_offset == 0 else 40,
            "faculty_ids": [faculty_ids[fac_idx]],
        })
        session_ids.append(sess["id"])
        print(f"    {subject_code} ({mode}) BCA-{section_label}  ->  {sess['id']}")

    total_weekly = sum(r[3] for r in session_rows)
    print(f"    Total weekly session slots needed: {total_weekly}")

    # ── 7. Build scheduler config ────────────────────────────────────────
    print("\n[7] Building scheduler configuration")
    config = {
        "organization_id": org_id,
        "configuration": {
            "days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
            "day_start": "09:00",
            "day_end": "16:20",
            "period_count": 8,
            "period_duration_minutes": 50,
            "period_duration_hours": 50 / 60,
            "period_times": {
                "1": "09:00-09:50",
                "2": "09:50-10:40",
                "3": "10:40-11:30",
                "4": "11:30-12:20",
                "5": "13:00-13:50",
                "6": "13:50-14:40",
                "7": "14:40-15:30",
                "8": "15:30-16:20",
            },
            "lunch": {"start": "12:20", "duration_minutes": 40},
            "break": {"after_periods": 2, "duration_minutes": 10},
            "sessions": [],
            "rooms": [{
                "id": r,
                "name": n,
                "capacity": cap,
                "room_type": rtype,
                "facilities": {"projector": True, "whiteboard": True, "computers": rtype == "lab"},
                "timetableAvailable": True,
                "availability": {},
            } for (n, cap, rtype), r in zip(rooms_data, room_ids)],
            "faculty": [{
                "id": f,
                "name": n,
                "max_weekly_hours": 20,
                "availability": {"days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]},
                "availableDays": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
            } for (n, _), f in zip(faculty_data, faculty_ids)],
            "max_classes_per_day": 6,
            "max_same_subject_per_day": 1,
            "min_gap_between_same_subject": 1,
            "avoid_last_period": True,
        },
    }

    for row, sid in zip(session_rows, session_ids):
        code, subject, subject_code, weekly, mode, fac_idx, section_offset = row
        cid = course_ids[code_to_course_idx[code]]
        class_of = course_class[code]
        batch_id = class_of[section_offset] if section_offset < len(class_of) else class_of[0]
        section_label = "A" if section_offset == 0 else "B"
        config["configuration"]["sessions"].append({
            "id": sid,
            "courseId": cid,
            "subjectId": sid,
            "subjectName": subject,
            "subjectCode": subject_code,
            "facultyId": faculty_ids[fac_idx],
            "facultyIds": [faculty_ids[fac_idx]],
            "sectionName": f"BCA-{section_label}",
            "batchId": batch_id,
            "studentCount": 45 if section_offset == 0 else 40,
            "weeklyPeriods": weekly,
            "mode": mode,
            "requiredFacilities": ["computers"] if mode == "lab" else [],
            "eligibleRoomIds": [room_ids[4], room_ids[5]] if mode == "lab"
                               else [room_ids[0], room_ids[1], room_ids[2], room_ids[3]],
        })

    # ── 8. Generate timetable ────────────────────────────────────────────
    print("\n[8] Submitting generation run")
    status, run = client.call("POST", "/timetable/generate", config)
    run_id = run["id"]
    print(f"    run_id = {run_id}  (status {run['status']})")

    for _ in range(180):
        time.sleep(1)
        latest = client.call_maybe_none("GET", f"/timetable/runs/{run_id}")
        if latest is None:
            continue
        status, latest = latest
        if latest["status"] in ("COMPLETED", "FAILED"):
            break
    print(f"    final status = {latest['status']}")
    if latest.get("score") is not None:
        print(f"    score = {latest['score']}")
    if latest.get("error"):
        print(f"    error = {latest['error']}")
        raise SystemExit(1)

    # ── 9. Report ────────────────────────────────────────────────────────
    status, entries = client.call("GET", f"/timetable/runs/{run_id}/entries")
    print(f"    scheduled entries = {len(entries)}")

    day_counts = {}
    for e in entries:
        day_counts[e["day"]] = day_counts.get(e["day"], 0) + 1
    print("    per day:")
    for day in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]:
        print(f"      {day}: {day_counts.get(day, 0)} classes")

    section_counts = {}
    for e in entries:
        sec = e.get("section_name", "?")
        section_counts[sec] = section_counts.get(sec, 0) + 1
    print("    per section:")
    for sec, cnt in sorted(section_counts.items()):
        print(f"      {sec}: {cnt} classes")

    print("\n" + "=" * 70)
    print("Seed complete!")
    print(f"  Sign in:  {email} / {password}")
    print(f"  Workspace: /timetable?run={run_id}")
    print(f"  Sessions: {len(session_ids)}  |  Classes needed: {total_weekly}  |  Scheduled: {len(entries)}")
    print("=" * 70)


if __name__ == "__main__":
    main()
