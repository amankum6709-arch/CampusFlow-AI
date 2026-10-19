from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


def uuid_str() -> str:
    return str(uuid4())


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    organization_id: Mapped[str | None] = mapped_column(ForeignKey("organizations.id", ondelete="SET NULL"), index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(30), default="admin")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    organization = relationship("Organization")


class Organization(Base):
    __tablename__ = "organizations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Kolkata")
    settings: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    departments = relationship("Department", back_populates="organization", cascade="all, delete-orphan")
    faculty = relationship("Faculty", back_populates="organization", cascade="all, delete-orphan")
    rooms = relationship("Room", back_populates="organization", cascade="all, delete-orphan")
    courses = relationship("Course", back_populates="organization", cascade="all, delete-orphan")
    constraints = relationship("Constraint", back_populates="organization", cascade="all, delete-orphan")


class Department(Base):
    __tablename__ = "departments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str | None] = mapped_column(String(40))
    organization = relationship("Organization", back_populates="departments")


class Faculty(Base):
    __tablename__ = "faculty"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    department_id: Mapped[str | None] = mapped_column(ForeignKey("departments.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    employee_code: Mapped[str | None] = mapped_column(String(80))
    max_weekly_hours: Mapped[float] = mapped_column(Float, default=18)
    availability: Mapped[dict] = mapped_column(JSON, default=dict)
    preferences: Mapped[dict] = mapped_column(JSON, default=dict)
    organization = relationship("Organization", back_populates="faculty")


class Room(Base):
    __tablename__ = "rooms"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    room_type: Mapped[str] = mapped_column(String(80), default="classroom")
    facilities: Mapped[dict] = mapped_column(JSON, default=dict)
    availability: Mapped[dict] = mapped_column(JSON, default=dict)
    organization = relationship("Organization", back_populates="rooms")


class Course(Base):
    __tablename__ = "courses"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str | None] = mapped_column(String(80))
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    organization = relationship("Organization", back_populates="courses")


class AcademicClass(Base):
    """A section/batch within a course that students attend sessions in."""
    __tablename__ = "academic_classes"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    course_id: Mapped[str | None] = mapped_column(ForeignKey("courses.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    batch_name: Mapped[str | None] = mapped_column(String(120))
    section_number: Mapped[int] = mapped_column(Integer, default=1)
    student_count: Mapped[int] = mapped_column(Integer, default=0)
    semester: Mapped[int] = mapped_column(Integer, default=1)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)


class AcademicSession(Base):
    """A schedulable teaching requirement: what needs to be scheduled each week."""
    __tablename__ = "academic_sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    course_id: Mapped[str | None] = mapped_column(ForeignKey("courses.id", ondelete="SET NULL"))
    subject_name: Mapped[str | None] = mapped_column(String(200))
    subject_code: Mapped[str | None] = mapped_column(String(80))
    class_id: Mapped[str | None] = mapped_column(ForeignKey("academic_classes.id", ondelete="SET NULL"))
    section_name: Mapped[str | None] = mapped_column(String(120))
    batch_id: Mapped[str | None] = mapped_column(String(120))
    weekly_periods: Mapped[int] = mapped_column(Integer, default=1)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=60)
    mode: Mapped[str] = mapped_column(String(30), default="theory")
    student_count: Mapped[int] = mapped_column(Integer, default=0)
    required_facilities: Mapped[list] = mapped_column(JSON, default=list)
    room_type: Mapped[str | None] = mapped_column(String(80))
    faculty_ids: Mapped[list] = mapped_column(JSON, default=list)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)


class Constraint(Base):
    __tablename__ = "constraints"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[str] = mapped_column(String(80), nullable=False)
    category: Mapped[str] = mapped_column(String(20), default="SOFT")
    priority: Mapped[int] = mapped_column(Integer, default=50)
    weight: Mapped[float] = mapped_column(Float, default=1)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    configuration: Mapped[dict] = mapped_column(JSON, default=dict)
    organization = relationship("Organization", back_populates="constraints")


class TimetableRun(Base):
    __tablename__ = "timetable_runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(30), default="QUEUED")
    score: Mapped[float | None] = mapped_column(Float)
    configuration: Mapped[dict] = mapped_column(JSON, default=dict)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)


class AssistantProposal(Base):
    """A reviewed-but-unapplied set of timetable changes.

    The assistant never mutates entries when proposing; rows are only
    updated by the approve endpoint, which revalidates against live data
    (staleness fingerprint + full constraint check) before committing.
    """
    __tablename__ = "assistant_proposals"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("timetable_runs.id", ondelete="CASCADE"), index=True)
    intent: Mapped[str] = mapped_column(String(40), default="fix_all")
    status: Mapped[str] = mapped_column(String(20), default="pending")
    base_fingerprint: Mapped[str] = mapped_column(String(64), default="")
    changes: Mapped[list] = mapped_column(JSON, default=list)
    impact: Mapped[dict] = mapped_column(JSON, default=dict)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class TimetableEntry(Base):
    __tablename__ = "timetable_entries"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    run_id: Mapped[str] = mapped_column(ForeignKey("timetable_runs.id", ondelete="CASCADE"), index=True)
    session_id: Mapped[str | None] = mapped_column(String(180), index=True)
    unit_id: Mapped[str | None] = mapped_column(String(180))
    course_id: Mapped[str | None] = mapped_column(ForeignKey("courses.id", ondelete="SET NULL"))
    faculty_id: Mapped[str | None] = mapped_column(ForeignKey("faculty.id", ondelete="SET NULL"))
    room_id: Mapped[str | None] = mapped_column(ForeignKey("rooms.id", ondelete="SET NULL"))
    section_name: Mapped[str | None] = mapped_column(String(120))
    batch_id: Mapped[str | None] = mapped_column(String(120), index=True)
    group_name: Mapped[str | None] = mapped_column(String(120))
    student_count: Mapped[int] = mapped_column(Integer, default=0)
    day: Mapped[str] = mapped_column(String(20))
    period: Mapped[int] = mapped_column(Integer)
    locked: Mapped[bool] = mapped_column(Boolean, default=False)
    reasons: Mapped[list] = mapped_column(JSON, default=list)
