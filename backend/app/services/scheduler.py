"""Compatibility facade for the scheduler engine."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from workers.scheduler.engine import SchedulingError, normalize_sessions, solve  # noqa: E402,F401
from workers.scheduler.runner import run_timetable_job  # noqa: E402,F401
