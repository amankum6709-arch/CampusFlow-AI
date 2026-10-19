from workers.scheduler.validator import validate_entries


def test_validator_checks_capacity_availability_and_workload():
    sessions = [{
        "id": "s1", "course_id": "c1", "subject_id": "sub1", "section_name": "A",
        "student_count": 50, "units": [{"id": "u1", "student_count": 50}], "is_lab": False,
    }]
    rooms = [{"id": "r1", "capacity": 40, "room_type": "classroom", "facilities": {}, "availability": {}}]
    faculty = [{"id": "f1", "max_weekly_hours": 1, "availability": {"blocked": [{"day": "Monday", "period": 1}]}}]
    result = validate_entries([
        {"session_id": "s1", "course_id": "c1", "faculty_id": "f1", "room_id": "r1", "section_name": "A",
         "day": "Monday", "period": 1, "student_count": 50, "unit_id": "u1"}
    ], sessions=sessions, rooms=rooms, faculty=faculty, config={"period_duration_hours": 1})
    assert not result["valid"]
    assert any("room_capacity" in e for e in result["errors"])
    assert any("faculty unavailable" in e for e in result["errors"])


def test_validator_keeps_lab_groups_synchronized_and_unique():
    sessions = [{
        "id": "lab:1", "course_id": "c1", "subject_id": "lab", "section_name": "A", "is_lab": True,
        "student_count": 40, "units": [{"id": "g1", "student_count": 20}, {"id": "g2", "student_count": 20}],
    }]
    rooms = [
        {"id": "r1", "capacity": 20, "room_type": "lab", "facilities": {}, "availability": {}},
        {"id": "r2", "capacity": 20, "room_type": "lab", "facilities": {}, "availability": {}},
    ]
    faculty = [
        {"id": "f1", "max_weekly_hours": 10, "availability": {}},
        {"id": "f2", "max_weekly_hours": 10, "availability": {}},
    ]
    entries = [
        {"session_id": "lab:1", "course_id": "c1", "faculty_id": "f1", "room_id": "r1", "section_name": "A", "day": "Monday", "period": 1, "student_count": 20, "unit_id": "g1"},
        {"session_id": "lab:1", "course_id": "c1", "faculty_id": "f2", "room_id": "r2", "section_name": "A", "day": "Monday", "period": 1, "student_count": 20, "unit_id": "g2"},
    ]
    assert validate_entries(entries, sessions=sessions, rooms=rooms, faculty=faculty)["valid"]
