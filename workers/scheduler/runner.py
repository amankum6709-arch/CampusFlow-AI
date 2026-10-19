"""Database-backed scheduler job runner.

The API currently invokes this in-process as a BackgroundTask. The function
has no FastAPI dependency, so it can later be moved unchanged to Celery/RQ or
another durable queue worker.
"""
from datetime import datetime

from sqlalchemy import delete

try:
    from backend.app.db.session import SessionLocal
    from backend.app.models import TimetableEntry, TimetableRun
except ModuleNotFoundError:
    from app.db.session import SessionLocal
    from app.models import TimetableEntry, TimetableRun
from .engine import SchedulingError, solve


def run_timetable_job(run_id: str, organization_id: str | None = None) -> None:
    db = SessionLocal()
    try:
        run = db.get(TimetableRun, run_id)
        if not run:
            return
        run.status = "RUNNING"
        db.commit()
        try:
            result = solve(run.configuration or {})
            db.execute(delete(TimetableEntry).where(TimetableEntry.run_id == run.id))
            for entry in result["entries"]:
                db.add(TimetableEntry(run_id=run.id, **entry))
            run.status = "COMPLETED"
            run.score = result["score"]
            run.error = None
            run.completed_at = datetime.utcnow()
            db.commit()
        except SchedulingError as exc:
            run.status = "FAILED"
            run.error = str(exc)
            run.completed_at = datetime.utcnow()
            db.commit()
        except Exception as exc:
            db.rollback()
            run = db.get(TimetableRun, run_id)
            if run:
                run.status = "FAILED"
                run.error = f"Unexpected scheduler error: {exc}"
                run.completed_at = datetime.utcnow()
                db.commit()
    finally:
        db.close()
