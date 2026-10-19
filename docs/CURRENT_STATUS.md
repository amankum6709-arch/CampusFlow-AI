# Current Project Status

This document records the cleanup pass applied to the uploaded Campus Glow project.

## Fixed

### Backend
- Fixed the timetable-entry database model so scheduler output fields (`session_id`, `unit_id`, `batch_id`, `group_name`, `student_count`) can actually be persisted.
- Added Alembic migration `0002_timetable_entry_details`.
- Fixed the timetable entry update route using an undefined `run` variable.
- Added organization existence validation to timetable generation.
- Added complete scheduler fields to the timetable API response.
- Made multi-group lab movement atomic at the timetable-entry API level.
- Preserved server-side conflict checks for faculty and rooms while allowing the intended shared section/batch slot for groups belonging to the same lab occurrence.
- Fixed the CP-SAT section/batch collision model so multi-group labs are not incorrectly rejected as section/batch conflicts.
- Kept an independent validator after solving.

### Frontend
- Updated timetable conflict highlighting so intended multi-group lab rows sharing a section/batch/slot are not shown as conflicts.
- Reloads timetable rows after moving a lab occurrence so all groups immediately reflect the new slot.
- Kept the existing local/browser scheduler and server scheduler as separate paths.

### Project hygiene
- Removed the uploaded Windows virtual environment from the deliverable.
- Removed local `.env` files containing environment-specific values.
- Added a root `.gitignore`.
- Removed the stray root npm dependency metadata; the frontend has its own npm project.
- Updated the main README with the clean architecture and exact startup flow.

## Verification performed

- Python source compilation: passed.
- FastAPI application import: passed.
- OpenAPI generation: passed with 12 API paths.
- Organization and timetable-generation API smoke test: passed.
- Scheduler runner persistence smoke test with a mocked solver: passed, including all new timetable-entry fields.
- Python test suite: 5 passed, 1 skipped.

The one skipped test is the real CP-SAT integration test because this verification environment cannot install OR-Tools from the internet. The uploaded Windows virtual environment did contain OR-Tools, but its compiled Windows binaries cannot be executed by this Linux verification environment.

## Before first run

Create `backend/.env`, create the Python virtual environment, install `backend/requirements.txt`, start PostgreSQL, run `alembic upgrade head`, then start FastAPI and the Vite frontend.

For Swagger, use:

```text
http://localhost:8000/docs
```
