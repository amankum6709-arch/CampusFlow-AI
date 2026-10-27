# Deploy CampusFlow AI to Render and Neon

This repository has a Vite frontend and a FastAPI backend. The backend Docker image does not run migrations during normal startup. Configure production values in Render's environment settings; do not commit `.env` files or generated secrets.

## Neon database

1. Create a Neon project and database, and copy its connection string from the Neon dashboard.
2. Set `DATABASE_URL` on the Render backend service. Use SQLAlchemy's psycopg driver form, `postgresql+psycopg://...`, and retain Neon-required connection options such as `sslmode=require`. URL-encode special characters in credentials.
3. Generate a strong key locally with `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Put the output directly in Render's `SECRET_KEY` setting; do not add it to the repository.

## Backend web service

Create a Render **Docker** web service for this repository:

- Docker context: repository root
- Dockerfile path: `backend/Dockerfile`
- Health check path: `/health`
- Environment variables: `DATABASE_URL`, `SECRET_KEY`, and `CORS_ORIGINS`
- Set `CORS_ORIGINS` to the exact public frontend origin, for example `https://your-frontend.onrender.com` (no trailing slash). Add additional trusted origins as a comma-separated list.

The image starts `uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"`. Render supplies `PORT`; local Docker uses port 8000 when it is absent.

## Frontend static site

Create a Render **Static Site** from the same repository:

- Root directory: `frontend`
- Build command: `npm ci && npm run build`
- Publish directory: `dist`
- Build-time environment variable: `VITE_API_URL=https://your-backend.onrender.com/api/v1`

Replace the example origins with the actual Render service URLs. `VITE_API_URL` is embedded at build time, so set it before the static-site build and rebuild after changing it.

## Controlled schema migration

Do not add migrations to the web-service start command. Before first production traffic, review the pending migration files and confirm the Neon target and backup/restore plan. Then use the Render service Shell (or an explicitly configured one-off job using the same backend image and environment) to run this command once:

```sh
alembic upgrade head
```

Run the same controlled procedure for later schema upgrades, with a reviewed backup and deployment plan. Do not run this command against a production database until the target has been verified. Normal web-service restarts do not migrate the database.

## Pre-traffic checks

1. Confirm backend service starts and `/health` returns `{"status":"ok",...}`.
2. Confirm the frontend was built with the backend's public `/api/v1` URL.
3. Confirm `CORS_ORIGINS` exactly matches the deployed frontend origin.
4. Test signup/login and a basic authenticated API request in staging before directing production users.