# Campus Flow AI Scheduler Core

This phase is the scheduler-core milestone. The browser heuristic remains available for compatibility, but the production scheduling contract now lives in `workers/scheduler/engine.py`.

## Supported hard constraints

- Faculty collision prevention
- Room collision prevention
- Section collision prevention
- Batch collision prevention
- Faculty day/blocked-slot/leave-date availability
- Faculty weekly workload cap
- Optional faculty daily class cap
- Room timetable availability
- Room day/blocked-slot availability
- Room capacity
- Room type
- Required room facilities
- Optional campus and building matching
- Working days and blocked timetable periods
- Required weekly occurrences
- Same-subject daily frequency cap
- Same-subject minimum period gap
- Locked entries
- Multi-group lab sessions: same slot, unique faculty and unique physical room per group

## Soft objectives

- Preferred days
- Preferred periods
- Avoid last period
- Room-capacity waste minimization

## Input contract

`POST /api/v1/timetable/generate` accepts a configuration containing `days`, `periods`, `rooms`, `faculty`, and `sessions`. `weeklyPeriods` is expanded into occurrences.

A lab session can contain:

```json
{
  "id": "db-lab",
  "mode": "lab",
  "sectionName": "CSE-3A",
  "weeklyPeriods": 1,
  "groups": [
    {"id": "g1", "name": "A", "studentCount": 20},
    {"id": "g2", "name": "B", "studentCount": 20}
  ]
}
```

## Locked entries

Use `locked_entries` to pin a session/unit to a day and period, optionally with a specific faculty or room.

## Validation

Every generated result is checked by the independent plain-Python validator before the solver returns success. The validator is intentionally separate from the CP-SAT model.

## Verification

- Python source compilation is checked in CI/local verification.
- Normalization and validator tests do not require OR-Tools.
- CP-SAT integration tests run when `ortools==9.15.6755` is installed.
- The current development environment cannot download packages from the internet, so CP-SAT runtime execution must be verified on a machine or Docker build with package access.
