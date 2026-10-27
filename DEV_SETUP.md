# CampusFlow AI 2.0 - Local Development

## Prerequisites
- Python 3.12+
- Node.js 20+
- Docker Desktop (recommended) or PostgreSQL 17+

## Option A: Docker PostgreSQL + local API/frontend

From the repository root:

```bash
docker compose up postgres -d
```

Create `backend/.env` from `backend/.env.example` and use:

```env
DATABASE_URL=postgresql+psycopg://campusflow:campusflow@localhost:5432/campusflow
CORS_ORIGINS=http://localhost:5173
```

Set `SECRET_KEY` to a generated value. Generate one with `python -c "import secrets; print(secrets.token_urlsafe(48))"`; do not use a documented placeholder or commit the generated value.

Create the Python environment:

```bash
cd backend
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cd ..
```

Run migrations from the repository root:

```bash
alembic upgrade head
```

Start the API:

```bash
uvicorn backend.app.main:app --reload --port 8000
```

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` and API docs at `http://localhost:8000/docs`.

## Option B: Full Docker API + PostgreSQL

```bash
docker compose up --build
```

The API container does not run migrations automatically. Apply schema changes deliberately before starting the API:

```bash
docker compose run --rm api alembic upgrade head
docker compose up --build
```

## Scheduler API

`POST /api/v1/timetable/generate` accepts a normalized configuration. Example shape:

```json
{
  "organization_id": "org-id",
  "configuration": {
    "days": ["Monday", "Tuesday"],
    "periods": [1, 2, 3, 4],
    "faculty": [],
    "rooms": [],
    "sessions": []
  }
}
```

The current implementation runs the scheduler as a FastAPI background task. The code is isolated so the same runner can later be moved to Redis/Celery/RQ without changing the solver.

## Validation

Run the Python test suite:

```bash
python -m pytest -q backend/tests
```

The CP-SAT test is automatically skipped when OR-Tools is not installed. In a normal development/CI environment it should run because `backend/requirements.txt` pins OR-Tools.

## Important

This is a 2.0 scheduler foundation, not the final production SaaS. Authentication/RBAC, durable job queues, complete migration of the legacy scheduler's advanced constraints, AI Copilot, and full timetable editing UI remain future milestones.
