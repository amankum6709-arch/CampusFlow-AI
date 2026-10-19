from workers.scheduler.engine import normalize_sessions


def test_normalize_expands_weekly_periods():
    sessions = normalize_sessions({
        "sessions": [{"id": "db", "courseId": "c1", "weeklyPeriods": 3, "sectionName": "A"}]
    })
    assert [s["id"] for s in sessions] == ["db:1", "db:2", "db:3"]


def test_normalize_preserves_lab_groups_and_resources():
    sessions = normalize_sessions({
        "sessions": [{
            "id": "lab",
            "courseId": "c1",
            "weeklyPeriods": 1,
            "sectionName": "A",
            "mode": "lab",
            "groups": [
                {"id": "g1", "name": "A", "studentCount": 20, "campusId": "campus-1"},
                {"id": "g2", "name": "B", "studentCount": 20, "campusId": "campus-1"},
            ],
        }]
    })
    assert len(sessions) == 1
    assert sessions[0]["is_lab"] is True
    assert {u["id"] for u in sessions[0]["units"]} == {"g1", "g2"}
    assert sessions[0]["units"][0]["campus_id"] == "campus-1"
