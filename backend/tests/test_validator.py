from workers.scheduler.validator import validate_entries


def test_validator_detects_room_faculty_and_section_conflicts():
    entries = [
        {"course_id": "c1", "faculty_id": "f1", "room_id": "r1", "section_name": "A", "day": "Monday", "period": 1},
        {"course_id": "c2", "faculty_id": "f1", "room_id": "r1", "section_name": "A", "day": "Monday", "period": 1},
    ]
    result = validate_entries(entries)
    assert not result["valid"]
    assert result["metrics"]["room_conflicts"] == 1
    assert result["metrics"]["faculty_conflicts"] == 1
    assert result["metrics"]["section_conflicts"] == 1
