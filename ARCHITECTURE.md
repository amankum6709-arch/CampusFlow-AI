# CampusFlow AI 2.0 Architecture

## Core principle

AI interprets requirements. The optimization engine generates schedules. An independent validator verifies them. AI explains the result.

```text
React Web App
      |
      v
FastAPI API ---- PostgreSQL
      |
      +---- timetable job ---- Scheduler Worker ---- CP-SAT / hybrid solver
      |
      +---- AI Copilot ---- structured constraints / explanations / simulations
```

## Migration strategy

- Preserve the existing React setup wizard and heuristic scheduler.
- Move persistence from localStorage to API/PostgreSQL.
- Extract the scheduler behind a service boundary.
- Add an independent validator before introducing advanced optimization.
- Add AI only through validated backend tools, never direct database writes.
- Add timetable versioning and locked entries before partial regeneration.

## Production boundaries

`apps/web` should own UI state and presentation.

`backend` should own identity, organization isolation, validation, persistence and API contracts.

`scheduler` should own optimization and deterministic scheduling.

`AI` should translate natural language into safe, reviewable operations.
