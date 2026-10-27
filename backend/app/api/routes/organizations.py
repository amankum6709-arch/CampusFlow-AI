from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from ...core.security import get_current_user, require_admin_for_writes, require_org_scoped
from ...db.session import get_db
from ...models import (
    AcademicClass,
    AcademicSession,
    Constraint,
    Course,
    Department,
    Faculty,
    Organization,
    Room,
    TimetableEntry,
    TimetableRun,
    User,
)
from ...schemas.common import (
    OrganizationCreate,
    OrganizationRead,
    SetupPayload,
    SetupResetResponse,
    SetupResponse,
)

router = APIRouter(
    prefix="/organizations",
    tags=["organizations"],
    dependencies=[Depends(require_admin_for_writes)],
)

SETUP_SETTING_KEYS = ("institution", "campusMode", "campuses", "availability", "constraints")
SETUP_RESOURCE_MODELS = (
    AcademicSession,
    AcademicClass,
    Course,
    Faculty,
    Room,
    Department,
    Constraint,
)


def _count_for_org(db: Session, model, organization_id: str) -> int:
    return int(db.scalar(
        select(func.count()).select_from(model).where(model.organization_id == organization_id)
    ) or 0)


@router.post("", response_model=OrganizationRead, status_code=201)
def create_organization(payload: OrganizationCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    existing = db.scalar(select(Organization).where(Organization.slug == payload.slug))
    if existing:
        raise HTTPException(409, "Organization slug already exists")
    org = Organization(**payload.model_dump())
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


@router.get("/{organization_id}", response_model=OrganizationRead)
def get_organization(organization_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    org = db.get(Organization, organization_id)
    if not org:
        raise HTTPException(404, "Organization not found")
    require_org_scoped(organization_id, user)
    return org


# ============================================================
# Setup persistence — saves institution, campus, availability,
# constraints into Organization.settings JSON field.
# ============================================================

@router.get("/{organization_id}/setup", response_model=SetupResponse)
def get_setup(organization_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    org = db.get(Organization, organization_id)
    if not org:
        raise HTTPException(404, "Organization not found")
    require_org_scoped(organization_id, user)
    settings = org.settings or {}
    return SetupResponse(
        institution=settings.get("institution", {}),
        campusMode=settings.get("campusMode", "single"),
        campuses=settings.get("campuses", []),
        availability=settings.get("availability", {}),
        constraints=settings.get("constraints", {}),
    )


@router.put("/{organization_id}/setup", response_model=SetupResponse)
def save_setup(organization_id: str, payload: SetupPayload, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    org = db.get(Organization, organization_id)
    if not org:
        raise HTTPException(404, "Organization not found")
    require_org_scoped(organization_id, user)
    settings = org.settings or {}
    settings["institution"] = payload.institution.model_dump()
    settings["campusMode"] = payload.campusMode
    settings["campuses"] = [c.model_dump() for c in payload.campuses]
    settings["availability"] = payload.availability.model_dump()
    settings["constraints"] = payload.constraints.model_dump()
    org.settings = settings
    db.commit()
    db.refresh(org)
    return SetupResponse(
        institution=settings.get("institution", {}),
        campusMode=settings.get("campusMode", "single"),
        campuses=settings.get("campuses", []),
        availability=settings.get("availability", {}),
        constraints=settings.get("constraints", {}),
    )


@router.delete("/{organization_id}/setup", response_model=SetupResetResponse)
def reset_setup(organization_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    org = db.get(Organization, organization_id)
    if not org:
        raise HTTPException(404, "Organization not found")
    require_org_scoped(organization_id, user)

    deleted = {
        "academic_sessions": _count_for_org(db, AcademicSession, organization_id),
        "academic_classes": _count_for_org(db, AcademicClass, organization_id),
        "courses": _count_for_org(db, Course, organization_id),
        "faculty": _count_for_org(db, Faculty, organization_id),
        "rooms": _count_for_org(db, Room, organization_id),
        "departments": _count_for_org(db, Department, organization_id),
        "constraints": _count_for_org(db, Constraint, organization_id),
    }

    run_ids = select(TimetableRun.id).where(TimetableRun.organization_id == organization_id)
    db.execute(
        update(TimetableEntry)
        .where(TimetableEntry.run_id.in_(run_ids))
        .values(course_id=None, faculty_id=None, room_id=None)
    )

    for model in SETUP_RESOURCE_MODELS:
        db.execute(delete(model).where(model.organization_id == organization_id))

    settings = dict(org.settings or {})
    for key in SETUP_SETTING_KEYS:
        settings.pop(key, None)
    org.settings = settings

    db.commit()
    return SetupResetResponse(organization_id=organization_id, deleted=deleted)
