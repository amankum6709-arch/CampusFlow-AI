"""Add users, academic classes and academic sessions.

Revision ID: 0003_users_classes_sessions
Revises: 0002_timetable_entry_details
"""
from alembic import op
import sqlalchemy as sa

revision = "0003_users_classes_sessions"
down_revision = "0002_timetable_entry_details"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(30), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_users_organization_id", "users", ["organization_id"])
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "academic_classes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("course_id", sa.String(36), sa.ForeignKey("courses.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("batch_name", sa.String(120), nullable=True),
        sa.Column("section_number", sa.Integer(), nullable=False),
        sa.Column("student_count", sa.Integer(), nullable=False),
        sa.Column("semester", sa.Integer(), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
    )
    op.create_index("ix_academic_classes_organization_id", "academic_classes", ["organization_id"])

    op.create_table(
        "academic_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("course_id", sa.String(36), sa.ForeignKey("courses.id", ondelete="SET NULL"), nullable=True),
        sa.Column("subject_name", sa.String(200), nullable=True),
        sa.Column("subject_code", sa.String(80), nullable=True),
        sa.Column("class_id", sa.String(36), sa.ForeignKey("academic_classes.id", ondelete="SET NULL"), nullable=True),
        sa.Column("section_name", sa.String(120), nullable=True),
        sa.Column("batch_id", sa.String(120), nullable=True),
        sa.Column("weekly_periods", sa.Integer(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("mode", sa.String(30), nullable=False),
        sa.Column("student_count", sa.Integer(), nullable=False),
        sa.Column("required_facilities", sa.JSON(), nullable=False),
        sa.Column("room_type", sa.String(80), nullable=True),
        sa.Column("faculty_ids", sa.JSON(), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
    )
    op.create_index("ix_academic_sessions_organization_id", "academic_sessions", ["organization_id"])


def downgrade():
    op.drop_index("ix_academic_sessions_organization_id", table_name="academic_sessions")
    op.drop_table("academic_sessions")
    op.drop_index("ix_academic_classes_organization_id", table_name="academic_classes")
    op.drop_table("academic_classes")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_index("ix_users_organization_id", table_name="users")
    op.drop_table("users")
