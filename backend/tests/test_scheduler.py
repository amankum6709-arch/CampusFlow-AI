import pytest
pytest.importorskip("ortools")

from workers.scheduler.engine import solve


def test_solver_assigns_non_conflicting_sessions():
    result = solve({
        "days": ["Monday"],
        "periods": [1, 2],
        "time_limit_seconds": 2,
        "num_workers": 2,
        "faculty": [{"id": "f1", "availability": {"days": ["Monday"]}}],
        "rooms": [
            {"id": "r1", "capacity": 40, "room_type": "classroom", "facilities": {}},
            {"id": "r2", "capacity": 40, "room_type": "classroom", "facilities": {}},
        ],
        "sessions": [
            {"id": "c1", "weeklyPeriods": 1, "facultyId": "f1", "sectionName": "A", "studentCount": 30},
            {"id": "c2", "weeklyPeriods": 1, "facultyId": "f1", "sectionName": "B", "studentCount": 30},
        ],
    })
    assert len(result["entries"]) == 2
    assert len({(x["day"], x["period"]) for x in result["entries"]}) == 2
