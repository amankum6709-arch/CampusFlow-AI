from datetime import datetime

from pydantic import BaseModel, Field, ConfigDict


class SignupRequest(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=6, max_length=255)
    organization_name: str = Field(min_length=2, max_length=200)


class LoginRequest(BaseModel):
    email: str
    password: str


class UserRead(BaseModel):
    id: str
    email: str
    name: str
    role: str
    organization_id: str | None = None
    model_config = {"from_attributes": True}


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    slug: str = Field(min_length=2, max_length=120, pattern=r"^[a-z0-9-]+$")
    timezone: str = "Asia/Kolkata"


class OrganizationRead(OrganizationCreate):
    id: str

    model_config = {"from_attributes": True}


class FacultyCreate(BaseModel):
    organization_id: str
    name: str = Field(min_length=2, max_length=200)
    employee_code: str | None = None
    department_id: str | None = None
    max_weekly_hours: float = 18
    availability: dict = Field(default_factory=dict)
    preferences: dict = Field(default_factory=dict)


class FacultyRead(FacultyCreate):
    id: str
    model_config = {"from_attributes": True}


class RoomCreate(BaseModel):
    organization_id: str
    name: str = Field(min_length=1, max_length=120)
    capacity: int = Field(gt=0)
    room_type: str = "classroom"
    facilities: dict = Field(default_factory=dict)
    availability: dict = Field(default_factory=dict)


class RoomRead(RoomCreate):
    id: str
    model_config = {"from_attributes": True}


class CourseCreate(BaseModel):
    organization_id: str
    name: str = Field(min_length=2, max_length=200)
    code: str | None = None
    metadata_json: dict = Field(default_factory=dict)


class CourseRead(CourseCreate):
    id: str
    model_config = {"from_attributes": True}


class GenerateRequest(BaseModel):
    organization_id: str
    configuration: dict = Field(default_factory=dict)


class RunRead(BaseModel):
    id: str
    organization_id: str
    status: str
    score: float | None = None
    configuration: dict
    error: str | None = None
    created_at: datetime | None = None
    model_config = {"from_attributes": True}


class TimetableEntryRead(BaseModel):
    id: str
    run_id: str
    session_id: str | None = None
    unit_id: str | None = None
    course_id: str | None = None
    course_name: str | None = None
    course_code: str | None = None
    subject_name: str | None = None
    subject_code: str | None = None
    mode: str | None = None
    faculty_id: str | None = None
    faculty_name: str | None = None
    room_id: str | None = None
    room_name: str | None = None
    section_name: str | None = None
    batch_id: str | None = None
    group_name: str | None = None
    student_count: int = 0
    day: str
    period: int
    locked: bool
    reasons: list = Field(default_factory=list)
    model_config = {"from_attributes": True}


class TimetableEntryUpdate(BaseModel):
    day: str | None = None
    period: int | None = Field(default=None, ge=1)
    locked: bool | None = None


# ============================================================
# Action-taking assistant — proposals and chat
# ============================================================

class AssistantProposeRequest(BaseModel):
    intent: str = "fix_all"
    params: dict = Field(default_factory=dict)


class AssistantChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


class AssistantProposalRead(BaseModel):
    id: str
    organization_id: str
    run_id: str
    intent: str
    status: str
    base_fingerprint: str
    changes: list = Field(default_factory=list)
    impact: dict = Field(default_factory=dict)
    error: str | None = None
    stale: bool = False
    model_config = {"from_attributes": True}


class DepartmentCreate(BaseModel):
    organization_id: str
    name: str
    code: str | None = None


class DepartmentRead(BaseModel):
    id: str
    organization_id: str
    name: str
    code: str | None = None

    model_config = ConfigDict(from_attributes=True)


class AcademicClassCreate(BaseModel):
    organization_id: str
    course_id: str | None = None
    name: str = Field(min_length=1, max_length=200)
    batch_name: str | None = None
    section_number: int = 1
    student_count: int = 0
    semester: int = 1
    metadata_json: dict = Field(default_factory=dict)


class AcademicClassRead(AcademicClassCreate):
    id: str
    model_config = ConfigDict(from_attributes=True)


class AcademicClassUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    course_id: str | None = None
    batch_name: str | None = None
    section_number: int | None = None
    student_count: int | None = None
    semester: int | None = None
    metadata_json: dict | None = None


class AcademicSessionCreate(BaseModel):
    organization_id: str
    course_id: str | None = None
    subject_name: str | None = None
    subject_code: str | None = None
    class_id: str | None = None
    section_name: str | None = None
    batch_id: str | None = None
    weekly_periods: int = 1
    duration_minutes: int = 60
    mode: str = "theory"
    student_count: int = 0
    required_facilities: list = Field(default_factory=list)
    room_type: str | None = None
    faculty_ids: list = Field(default_factory=list)
    metadata_json: dict = Field(default_factory=dict)


class AcademicSessionRead(AcademicSessionCreate):
    id: str
    model_config = ConfigDict(from_attributes=True)


class AcademicSessionUpdate(BaseModel):
    course_id: str | None = None
    subject_name: str | None = None
    subject_code: str | None = None
    class_id: str | None = None
    section_name: str | None = None
    batch_id: str | None = None
    weekly_periods: int | None = None
    duration_minutes: int | None = None
    mode: str | None = None
    student_count: int | None = None
    required_facilities: list | None = None
    room_type: str | None = None
    faculty_ids: list | None = None
    metadata_json: dict | None = None


class ConstraintCreate(BaseModel):
    organization_id: str
    name: str = Field(min_length=2, max_length=200)
    type: str = Field(min_length=2, max_length=80)
    category: str = "SOFT"
    priority: int = 50
    weight: float = 1.0
    enabled: bool = True
    configuration: dict = Field(default_factory=dict)


class ConstraintRead(ConstraintCreate):
    id: str
    model_config = ConfigDict(from_attributes=True)


class ConstraintUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    type: str | None = None
    category: str | None = None
    priority: int | None = None
    weight: float | None = None
    enabled: bool | None = None
    configuration: dict | None = None


# ============================================================
# Setup persistence — stored in Organization.settings JSON
# ============================================================

class InstitutionSettings(BaseModel):
    name: str = ""
    shortName: str = ""
    type: str = ""
    academicYearStart: int = 0
    city: str = ""
    state: str = ""
    country: str = ""
    established: str = ""
    website: str = ""


class CampusBuilding(BaseModel):
    id: str = ""
    name: str = ""
    code: str = ""


class CampusItem(BaseModel):
    id: str = ""
    name: str = ""
    buildings: list[CampusBuilding] = Field(default_factory=list)


class AvailabilitySettings(BaseModel):
    workingDays: list[str] = Field(default_factory=lambda: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"])
    dayStart: str = "09:00"
    dayEnd: str = "17:00"
    slotDuration: int = 60
    workingHours: int = 8


class ConstraintSettings(BaseModel):
    maxClassesPerDay: int = 6
    maxSameSubjectPerDay: int = 1
    minGapBetweenSameSubject: int = 1
    avoidLastPeriod: bool = False
    lunchStart: str = "12:30"
    lunchDuration: int = 60
    breakAfterPeriods: int = 2
    breakDuration: int = 15
    avoidFloorJump: bool = True
    maxFloorJump: int = 1
    allowSaturday: bool = False


class SetupPayload(BaseModel):
    """Full setup data to save into Organization.settings."""
    institution: InstitutionSettings = Field(default_factory=InstitutionSettings)
    campusMode: str = "single"
    campuses: list[CampusItem] = Field(default_factory=list)
    availability: AvailabilitySettings = Field(default_factory=AvailabilitySettings)
    constraints: ConstraintSettings = Field(default_factory=ConstraintSettings)


class SetupResponse(BaseModel):
    """Full setup data loaded from Organization.settings."""
    institution: InstitutionSettings = Field(default_factory=InstitutionSettings)
    campusMode: str = "single"
    campuses: list[CampusItem] = Field(default_factory=list)
    availability: AvailabilitySettings = Field(default_factory=AvailabilitySettings)
    constraints: ConstraintSettings = Field(default_factory=ConstraintSettings)


class SetupResetResponse(BaseModel):
    status: str = "ok"
    organization_id: str
    deleted: dict[str, int] = Field(default_factory=dict)


class FacultyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    employee_code: str | None = None
    department_id: str | None = None
    max_weekly_hours: float | None = None
    availability: dict | None = None
    preferences: dict | None = None


class RoomUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    capacity: int | None = Field(default=None, gt=0)
    room_type: str | None = None
    facilities: dict | None = None
    availability: dict | None = None


class CourseUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    code: str | None = None
    metadata_json: dict | None = None