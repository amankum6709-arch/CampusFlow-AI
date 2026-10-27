# CampusFlow AI

CampusFlow AI is a university timetable and resource-management application with:

- React + Vite frontend
- FastAPI + SQLAlchemy backend
- PostgreSQL for production/local Docker development
- OR-Tools CP-SAT timetable optimization
- Independent timetable validation
- Server-side generation runs with a review/edit workspace

## Table of contents

- [Project structure](#project-structure)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Timetable generation flow](#timetable-generation-flow)
- [Lab scheduling](#lab-scheduling)
- [Editing generated timetables](#editing-generated-timetables)
- [AI assistant (proposals)](#ai-assistant-proposals)
- [Tests](#tests)
- [Optional local E2E scripts](#optional-local-e2e-scripts)
- [Important development rule](#important-development-rule)

## Project structure

```text
CampusFlow AI/
├── backend/
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/          # 0001_initial … 0004_assistant_proposals
│   ├── app/
│   │   ├── api/routes/
│   │   ├── core/
│   │   ├── db/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── services/
│   │   └── main.py
│   ├── tests/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   ├── layouts/
│   │   ├── pages/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── styles/
│   │   ├── utils/
│   │   └── workers/
│   ├── debug-steps.cjs
│   ├── e2e.test.cjs
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── .env.example
├── workers/
│   └── scheduler/
├── docs/
├── scripts/
├── alembic.ini
├── docker-compose.yml
├── e2e_test.py
├── pytest.ini
├── .env.example
├── ARCHITECTURE.md
├── DEV_SETUP.md
├── PHASE-2-STATUS.md
├── PHASE-3-STATUS.md
└── LICENSE
```

Local virtual environments (`.venv`/`.venv312`), `node_modules`, `.env` files, logs, and generated database files are ignored by Git and are not part of the repository. Recreate them with the steps below.

## Quick start

**Prerequisites:** Python 3.12+, Node.js 20+, and Docker Desktop (recommended) or PostgreSQL 17+.

### 1. Start PostgreSQL

Recommended:

```powershell
docker compose up postgres -d
```

Or use an existing PostgreSQL 17+ server with the same database URL format.

### 2. Create the backend environment

From the repository root:

```powershell
python -m venv backend\.venv
.\backend\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
Copy-Item .env.example .env
```

Re-activate the virtual environment in each new terminal. The API loads `.env` from the repository root and then lets `backend/.env` override it when present, so this guide creates it at the repository root.

For PowerShell execution-policy issues, run the activation command using your normal Windows Python environment policy, or start the API with the virtual-environment interpreter directly.

### 3. Run migrations

From the repository root:

```powershell
alembic upgrade head
```

`0002_timetable_entry_details` adds the timetable occurrence fields required by the server scheduler:

- `session_id`
- `unit_id`
- `batch_id`
- `group_name`
- `student_count`

The current migration head is `0004_assistant_proposals`.

### 4. Start the API

```powershell
uvicorn backend.app.main:app --reload --port 8000
```

- Swagger/OpenAPI: <http://localhost:8000/docs>
- Health check: <http://localhost:8000/health>

### 5. Start the frontend

In a second terminal:

```powershell
Set-Location frontend
npm install
npm run dev
```

Open <http://localhost:5173>.

If the API uses a different address, create `frontend/.env` from `frontend/.env.example` and set `VITE_API_URL`.

## Environment variables

| Variable | Used by | Required | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | backend | yes | PostgreSQL connection string (`postgresql+psycopg://…`) |
| `CORS_ORIGINS` | backend | yes in deployment | Comma-separated allowed frontend origins; defaults to none |
| `SECRET_KEY` | backend | yes | JWT signing secret — at least 32 characters; generate a random value per environment |
| `AI_PROVIDER` / `AI_API_KEY` | backend | no | Optional external AI provider; the assistant uses its rule-based engine when unset |
| `VITE_API_URL` | frontend | yes in production build | API base URL including `/api/v1`; local development defaults to `http://localhost:8000/api/v1` |

Copy the provided `.env.example` files to `.env` and fill in real values, including a random `SECRET_KEY`. For the workflow above, the backend `.env` is created at the repository root; `frontend/.env` is optional. Never commit `.env` files.

> **Security note:** `SECRET_KEY` is required and validated at startup; there is no hardcoded fallback. Rotating it invalidates existing tokens, so users must sign in again.

## Timetable generation flow

The server generation flow is:

```text
Setup wizard
    ↓
buildSchedulerConfiguration()
    ↓
POST /api/v1/timetable/generate
    ↓
TimetableRun = QUEUED
    ↓
background scheduler job
    ↓
normalize sessions
    ↓
CP-SAT solve
    ↓
independent validation
    ↓
save TimetableEntry rows
    ↓
TimetableRun = COMPLETED / FAILED
    ↓
Timetable workspace
```

A valid generation request must contain schedulable `sessions`, usable `rooms`, and `faculty`. The setup wizard builds these from the saved subjects, batches, sections and groups.

## Lab scheduling

Multi-group labs are represented as one `session_id` with multiple `unit_id` rows.

Hard rules:

- every lab group uses the same day/period
- groups use different rooms
- groups use different faculty
- rooms must satisfy capacity/type/facility requirements
- faculty availability and workload limits still apply

Section/batch collision rules are applied per session, not per lab unit. This prevents the solver from incorrectly treating the intended lab groups as a conflict.

## Editing generated timetables

The workspace supports:

- filtering all/conflicts/locked entries
- locking/unlocking entries
- drag-and-drop movement
- server-side faculty/room/section/batch conflict checks

Moving a multi-group lab occurrence moves its complete group set together so the lab cannot become partially synchronized.

## AI assistant (proposals)

The timetable page includes an action-taking assistant backed by `POST /api/v1/assistant/...` endpoints:

| Method | Endpoint |
| --- | --- |
| `POST` | `/api/v1/assistant/runs/{run_id}/analyze` |
| `POST` | `/api/v1/assistant/runs/{run_id}/propose` |
| `GET` | `/api/v1/assistant/proposals/{proposal_id}` |
| `POST` | `/api/v1/assistant/proposals/{proposal_id}/approve` |
| `POST` | `/api/v1/assistant/proposals/{proposal_id}/cancel` |
| `POST` | `/api/v1/assistant/runs/{run_id}/chat` |
| `GET` | `/api/v1/assistant/runs/{run_id}/proposals` |

`propose` accepts `fix_all`, `optimize`, or `move_class` as the intent.

Proposals are stored in the `assistant_proposals` table (migration `0004_assistant_proposals`) and are only applied after explicit approval, staleness checks, and full constraint revalidation.

## Tests

From the repository root:

```powershell
python -m pytest -q backend/tests
```

The CP-SAT test requires OR-Tools, which is installed by `backend/requirements.txt`.

## Optional local E2E scripts

`frontend/e2e.test.cjs` and `frontend/debug-steps.cjs` drive a local Chrome via `puppeteer-core` against `http://localhost:5173` using the local demo account. They need a Chrome installation and are not part of `package.json`, so install `puppeteer-core` separately to use them.

## Important development rule

Do not commit `.env`, `.venv`, `node_modules`, or generated database files. Use the provided `.env.example` files instead.
