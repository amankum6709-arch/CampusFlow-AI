from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...core.security import get_current_user, require_org_scoped
from ...db.session import get_db
from ...models import (
    AcademicClass,
    AcademicSession,
    Constraint,
    Course,
    Department,
    Faculty,
    Room,
    User,
)
from ...models.entities import Faculty as FacultyModel
from ...schemas.common import (
    AcademicClassCreate,
    AcademicClassRead,
    AcademicClassUpdate,
    AcademicSessionCreate,
    AcademicSessionRead,
    AcademicSessionUpdate,
    ConstraintCreate,
    ConstraintRead,
    ConstraintUpdate,
    CourseCreate,
    CourseRead,
    CourseUpdate,
    DepartmentCreate,
    DepartmentRead,
    FacultyCreate,
    FacultyRead,
    FacultyUpdate,
    RoomCreate,
    RoomRead,
    RoomUpdate,
)

router = APIRouter(tags=["resources"])


def _get_owned(db: Session, model, entity_id: str, organization_id: str):
    item = db.get(model, entity_id)
    if not item or str(item.organization_id) != str(organization_id):
        raise HTTPException(404, f"{model.__name__} not found")
    return item


# ============================================================
# DEPARTMENTS
# ============================================================

@router.post("/departments", response_model=DepartmentRead, status_code=201)
def create_department(payload: DepartmentCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_org_scoped(payload.organization_id, user)
    item = Department(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/departments", response_model=list[DepartmentRead])
def list_departments(organization_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_org_scoped(organization_id, user)
    return list(db.scalars(select(Department).where(Department.organization_id == organization_id)).all())


@router.delete("/departments/{department_id}", status_code=204)
def delete_department(department_id: str, organization_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_org_scoped(organization_id, user)
    item = _get_owned(db, Department, department_id, organization_id)
    db.delete(item)
    db.commit()


# ============================================================
# FACULTY
# ============================================================

@router.post("/faculty", response_model=FacultyRead, status_code=201)
def create_faculty(payload: FacultyCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_org_scoped(payload.organization_id, user)
    item = Faculty(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/faculty", response_model=list[FacultyRead])
def list_faculty(organization_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_org_scoped(organization_id, user)
    return list(db.scalars(select(Faculty).where(Faculty.organization_id == organization_id)).all())


@router.patch("/faculty/{faculty_id}", response_model=FacultyRead)
def update_faculty(faculty_id: str, payload: FacultyUpdate, organization_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_org_scoped(organization_id, user)
    item = _get_owned(db, Faculty, faculty_id, organization_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/faculty/{faculty_id}", status_code=204)
def delete_faculty(faculty_id: str, organization_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_org_scoped(organization_id, user)
    item = _get_owned(db, Faculty, faculty_id, organization_id)
    db.delete(item)
    db.commit()


# ============================================================
# ROOMS
# ============================================================

@router.post("/rooms", response_model=RoomRead, status_code=201)
def create_room(payload: RoomCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_org_scoped(payload.organization_id, user)
    item = Room(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/rooms", response_model=list[RoomRead])
def list_rooms(organization_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_org_scoped(organization_id, user)
    return list(db.scalars(select(Room).where(Room.organization_id == organization_id)).all())


@router.patch("/rooms/{room_id}", response_model=RoomRead)
def update_room(room_id: str, payload: RoomUpdate, organization_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_org_scoped(organization_id, user)
    item = _get_owned(db, Room, room_id, organization_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/rooms/{room_id}", status_code=204)
def delete_room(room_id: str, organization_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_org_scoped(organization_id, user)
    item = _get_owned(db, Room, room_id, organization_id)
    db.delete(item)
    db.commit()


@router.post("/rooms/bulk-delete")
def bulk_delete_rooms(payload: dict, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete all rooms belonging to a specific campus+building for an organization."""
    org_id = payload.get("organization_id")
    campus_id = (payload.get("campus_id") or "").strip()
    building_id = (payload.get("building_id") or "").strip()

    if not org_id:
        raise HTTPException(400, "organization_id is required")
    if not campus_id or not building_id:
        raise HTTPException(400, "campus_id and building_id are required")

    require_org_scoped(org_id, user)

    all_rooms = list(db.scalars(select(Room).where(Room.organization_id == org_id)).all())
    to_delete = []
    for room in all_rooms:
        avail = room.availability or {}
        if str(avail.get("campusId", "")).strip() == campus_id and str(avail.get("buildingId", "")).strip() == building_id:
            to_delete.append(room)

    for room in to_delete:
        db.delete(room)

    db.commit()
    return {"deleted": len(to_delete)}


# ============================================================
# COURSES
# ============================================================

@router.post("/courses", response_model=CourseRead, status_code=201)
def create_course(payload: CourseCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_org_scoped(payload.organization_id, user)
    item = Course(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/courses", response_model=list[CourseRead])
def list_courses(organization_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_org_scoped(organization_id, user)
    return list(db.scalars(select(Course).where(Course.organization_id == organization_id)).all())


@router.patch("/courses/{course_id}", response_model=CourseRead)
def update_course(course_id: str, payload: CourseUpdate, organization_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_org_scoped(organization_id, user)
    item = _get_owned(db, Course, course_id, organization_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/courses/{course_id}", status_code=204)
def delete_course(course_id: str, organization_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_org_scoped(organization_id, user)
    item = _get_owned(db, Course, course_id, organization_id)
    db.delete(item)
    db.commit()


# ============================================================
# CONSTRAINTS
# ============================================================

@router.post("/constraints", response_model=ConstraintRead, status_code=201)
def create_constraint(payload: ConstraintCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_org_scoped(payload.organization_id, user)
    item = Constraint(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/constraints", response_model=list[ConstraintRead])
def list_constraints(organization_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_org_scoped(organization_id, user)
    return list(db.scalars(select(Constraint).where(Constraint.organization_id == organization_id)).all())


@router.patch("/constraints/{constraint_id}", response_model=ConstraintRead)
def update_constraint(constraint_id: str, payload: ConstraintUpdate, organization_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_org_scoped(organization_id, user)
    item = _get_owned(db, Constraint, constraint_id, organization_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/constraints/{constraint_id}", status_code=204)
def delete_constraint(constraint_id: str, organization_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_org_scoped(organization_id, user)
    item = _get_owned(db, Constraint, constraint_id, organization_id)
    db.delete(item)
    db.commit()


# ============================================================
# ACADEMIC CLASSES (sections/batches)
# ============================================================

@router.post("/classes", response_model=AcademicClassRead, status_code=201)
def create_class(payload: AcademicClassCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_org_scoped(payload.organization_id, user)
    item = AcademicClass(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/classes", response_model=list[AcademicClassRead])
def list_classes(organization_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_org_scoped(organization_id, user)
    return list(db.scalars(select(AcademicClass).where(AcademicClass.organization_id == organization_id)).all())


@router.patch("/classes/{class_id}", response_model=AcademicClassRead)
def update_class(class_id: str, payload: AcademicClassUpdate, organization_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_org_scoped(organization_id, user)
    item = _get_owned(db, AcademicClass, class_id, organization_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/classes/{class_id}", status_code=204)
def delete_class(class_id: str, organization_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_org_scoped(organization_id, user)
    item = _get_owned(db, AcademicClass, class_id, organization_id)
    db.delete(item)
    db.commit()


# ============================================================
# ACADEMIC SESSIONS
# ============================================================

@router.post("/sessions", response_model=AcademicSessionRead, status_code=201)
def create_session(payload: AcademicSessionCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_org_scoped(payload.organization_id, user)
    item = AcademicSession(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/sessions", response_model=list[AcademicSessionRead])
def list_sessions(organization_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_org_scoped(organization_id, user)
    return list(db.scalars(select(AcademicSession).where(AcademicSession.organization_id == organization_id)).all())


@router.patch("/sessions/{session_id}", response_model=AcademicSessionRead)
def update_session(session_id: str, payload: AcademicSessionUpdate, organization_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_org_scoped(organization_id, user)
    item = _get_owned(db, AcademicSession, session_id, organization_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(session_id: str, organization_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_org_scoped(organization_id, user)
    item = _get_owned(db, AcademicSession, session_id, organization_id)
    db.delete(item)
    db.commit()
