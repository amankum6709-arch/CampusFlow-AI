from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.routes import assistant, auth, health, organizations, resources, sync, timetable
from .db.session import settings


app = FastAPI(title="CampusFlow AI API", version="2.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(health.router)
app.include_router(auth.router, prefix="/api/v1")
app.include_router(organizations.router, prefix="/api/v1")
app.include_router(resources.router, prefix="/api/v1")
app.include_router(sync.router, prefix="/api/v1")
app.include_router(timetable.router, prefix="/api/v1")
app.include_router(assistant.router, prefix="/api/v1")
