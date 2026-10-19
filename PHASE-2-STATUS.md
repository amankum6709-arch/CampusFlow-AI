# CampusFlow AI 2.0 - Phase 2 Scheduler Core

## Scope
This package completes the scheduler-core implementation as far as can be verified in the current offline environment.

### Implemented
- CP-SAT scheduler boundary in `workers/scheduler/engine.py`
- Weekly session expansion
- Theory and multi-group lab scheduling
- Faculty, room, section and batch collision constraints
- Faculty availability, leave dates and workload caps
- Room availability, capacity, type and facilities
- Optional campus/building matching
- Working days and blocked periods
- Same-subject daily frequency and spacing constraints
- Locked entries
- Soft preference scoring
- Independent validator
- Database job runner integration
- Scheduler normalization tests
- Extended validator tests
- Legacy browser scheduler retained for compatibility

## Verification

```text
Python compile checks       PASS
Pure-Python scheduler tests PASS (5)
Full pytest suite           5 passed, 1 skipped
CP-SAT runtime test         SKIPPED: OR-Tools unavailable offline
Docker build                NOT RUN: Docker unavailable in environment
```

The skipped CP-SAT test is expected in this environment because package downloads are blocked. The dependency is pinned in both `backend/requirements.txt` and `scheduler/requirements.txt`.

## Important
Do not call this package the final CampusFlow product yet. This is the completed **Phase 2 Scheduler Core** milestone. The next milestone is the timetable workspace/API integration, followed by authentication/multi-tenancy, AI, analytics, and production operations.
