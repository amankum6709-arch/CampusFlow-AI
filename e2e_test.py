"""End-to-end test of the CampusFlow API."""
import json
import sys
import time
import urllib.request


class API:
    def __init__(self, base="http://localhost:8000"):
        self.base = base
        self.token = None

    def _headers(self, auth=True):
        headers = {"Content-Type": "application/json"}
        if auth and self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def request(self, method, path, body=None, auth=True):
        url = self.base + path
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, headers=self._headers(auth), method=method)
        try:
            with urllib.request.urlopen(req) as resp:
                content = resp.read()
                return resp.status, json.loads(content) if content else None
        except urllib.error.HTTPError as e:
            content = e.read()
            try:
                detail = json.loads(content).get("detail", str(e))
            except Exception:
                detail = content.decode()
            return e.code, detail


api = API()

print("=" * 60)
print("1. SIGNUP")
print("=" * 60)
r = api.request("POST", "/api/v1/auth/signup", {
    "name": "E2E Admin",
    "email": "e2e@test.com",
    "password": "password123",
    "organization_name": "E2E University",
})
print("Signup:", r)
api.token = r[1]["access_token"]
org_id = r[1]["user"]["organization_id"]

print("\n2. CREATE RESOURCES")
fac_ids = []
for i in range(3):
    status, fac = api.request("POST", "/api/v1/faculty", {
        "organization_id": org_id,
        "name": f"Dr. Faculty {i+1}",
        "max_weekly_hours": 20,
        "availability": {"days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]},
    })
    fac_ids.append(fac["id"])
    print(f"  Faculty {i+1}: {fac['name']}")

room_ids = []
for i in range(3):
    status, room = api.request("POST", "/api/v1/rooms", {
        "organization_id": org_id,
        "name": f"Room {100 + i}",
        "capacity": 60,
        "room_type": "classroom",
        "facilities": {},
    })
    room_ids.append(room["id"])
    print(f"  Room {i+1}: {room['name']}")

course_ids = []
for i, code in enumerate(["MATH101", "CS201", "PHY101", "ENG101", "DBMS1"]):
    status, course = api.request("POST", "/api/v1/courses", {
        "organization_id": org_id,
        "name": f"Course {code}",
        "code": code,
    })
    course_ids.append(course["id"])
    print(f"  Course: {course['name']}")

print("\n3. CREATE CLASSES")
class_ids = []
for c in range(3):
    status, cls = api.request("POST", "/api/v1/classes", {
        "organization_id": org_id,
        "course_id": course_ids[0],
        "name": f"Section {c+1}",
        "batch_name": f"Batch 2024",
        "section_number": c + 1,
        "student_count": 45 + c * 5,
        "semester": 5,
    })
    class_ids.append(cls["id"])
    print(f"  Class: {cls['name']}")

print("\n4. CREATE SESSIONS")
for i in range(5):
    status, sess = api.request("POST", "/api/v1/sessions", {
        "organization_id": org_id,
        "course_id": course_ids[i],
        "class_id": class_ids[i % 3],
        "subject_name": f"Subject {i+1}",
        "subject_code": f"SUB{i+1}",
        "section_name": f"Section {(i % 3) + 1}",
        "weekly_periods": 3,
        "duration_minutes": 60,
        "mode": "theory",
        "student_count": 45,
        "faculty_ids": [fac_ids[i % 3]],
    })
    print(f"  Session {i+1}: status={status}")

sessions_all = api.request("GET", f"/api/v1/sessions?organization_id={org_id}")[1]
print(f"  Total sessions listed: {len(sessions_all)}")

print("\n5. BUILD SCHEDULER CONFIG")
config = {
    "organization_id": org_id,
    "configuration": {
        "days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        "period_count": 8,
        "period_duration_hours": 1.0,
        "sessions": [],
        "rooms": [],
        "faculty": [],
    },
}
for sess in api.request("GET", f"/api/v1/sessions?organization_id={org_id}")[1]:
    config["configuration"]["sessions"].append({
        "id": sess["id"],
        "courseId": sess["course_id"],
        "subjectId": sess["id"],
        "facultyId": sess["faculty_ids"][0] if sess["faculty_ids"] else None,
        "facultyIds": sess["faculty_ids"],
        "sectionName": sess["section_name"],
        "studentCount": sess["student_count"],
        "weeklyPeriods": sess["weekly_periods"],
        "mode": sess["mode"],
        "requiredFacilities": [],
    })
for room in api.request("GET", f"/api/v1/rooms?organization_id={org_id}")[1]:
    config["configuration"]["rooms"].append({
        "id": room["id"],
        "name": room["name"],
        "capacity": room["capacity"],
        "room_type": room["room_type"],
        "facilities": room["facilities"],
        "timetableAvailable": True,
        "availability": room["availability"],
    })
for fac in api.request("GET", f"/api/v1/faculty?organization_id={org_id}")[1]:
    config["configuration"]["faculty"].append({
        "id": fac["id"],
        "name": fac["name"],
        "max_weekly_hours": fac["max_weekly_hours"],
        "availability": fac["availability"],
        "availableDays": fac["availability"].get("days", []),
    })

print("\n6. GENERATE TIMETABLE")
status, run = api.request("POST", "/api/v1/timetable/generate", config)
print(f"  Run created: status={run['status']}, id={run['id']}")
run_id = run["id"]

for _ in range(20):
    time.sleep(1)
    status, latest = api.request("GET", f"/api/v1/timetable/runs/{run_id}")
    if latest["status"] in ("COMPLETED", "FAILED"):
        break

print(f"  Final run status: {latest['status']}")
if latest.get("error"):
    print(f"  Error: {latest['error']}")
if latest.get("score") is not None:
    print(f"  Score: {latest['score']}")

print("\n7. FETCH ENTRIES")
status, entries = api.request("GET", f"/api/v1/timetable/runs/{run_id}/entries")
print(f"  Entries: {len(entries) if isinstance(entries, list) else entries}")
if isinstance(entries, list):
    for e in entries[:8]:
        print(f"    {e['session_id']} {e['day']} P{e['period']} {e['course_name']} {e['faculty_name']} {e['room_name']} {e['section_name']}")

print("\n8. ANALYTICS")
status, analytics = api.request("GET", f"/api/v1/timetable/runs/{run_id}/analytics")
print(f"  Analytics status={status}:")
if isinstance(analytics, dict):
    print(f"  total_entries={analytics.get('total_entries')}")
    print(f"  faculty_workload={analytics.get('faculty_workload')}")

print("\n9. AI ASSISTANT")
status, ai = api.request("POST", f"/api/v1/timetable/runs/{run_id}/ai?question=Which%20faculty%20has%20the%20highest%20workload")
print(f"  AI status={status}: {ai}")

print("\nDONE")
