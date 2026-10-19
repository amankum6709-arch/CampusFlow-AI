"""Initial CampusFlow schema."""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def _common_uuid(table, fk=None):
    return sa.Column("id", sa.String(length=36), primary_key=True)


def upgrade():
    op.create_table(
        "organizations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(120), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False),
        sa.Column("settings", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_organizations_slug", "organizations", ["slug"], unique=True)
    op.create_table(
        "departments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("code", sa.String(40)),
    )
    op.create_index("ix_departments_organization_id", "departments", ["organization_id"])
    op.create_table(
        "faculty",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("department_id", sa.String(36), sa.ForeignKey("departments.id", ondelete="SET NULL")),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("employee_code", sa.String(80)),
        sa.Column("max_weekly_hours", sa.Float(), nullable=False),
        sa.Column("availability", sa.JSON(), nullable=False),
        sa.Column("preferences", sa.JSON(), nullable=False),
    )
    op.create_index("ix_faculty_organization_id", "faculty", ["organization_id"])
    op.create_table(
        "rooms",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("capacity", sa.Integer(), nullable=False),
        sa.Column("room_type", sa.String(80), nullable=False),
        sa.Column("facilities", sa.JSON(), nullable=False),
        sa.Column("availability", sa.JSON(), nullable=False),
    )
    op.create_index("ix_rooms_organization_id", "rooms", ["organization_id"])
    op.create_table(
        "courses",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("code", sa.String(80)),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
    )
    op.create_index("ix_courses_organization_id", "courses", ["organization_id"])
    op.create_table(
        "constraints",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("type", sa.String(80), nullable=False),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("weight", sa.Float(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("configuration", sa.JSON(), nullable=False),
    )
    op.create_index("ix_constraints_organization_id", "constraints", ["organization_id"])
    op.create_table(
        "timetable_runs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("score", sa.Float()),
        sa.Column("configuration", sa.JSON(), nullable=False),
        sa.Column("error", sa.Text()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("completed_at", sa.DateTime()),
    )
    op.create_index("ix_timetable_runs_organization_id", "timetable_runs", ["organization_id"])
    op.create_table(
        "timetable_entries",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("run_id", sa.String(36), sa.ForeignKey("timetable_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("course_id", sa.String(36), sa.ForeignKey("courses.id", ondelete="SET NULL")),
        sa.Column("faculty_id", sa.String(36), sa.ForeignKey("faculty.id", ondelete="SET NULL")),
        sa.Column("room_id", sa.String(36), sa.ForeignKey("rooms.id", ondelete="SET NULL")),
        sa.Column("section_name", sa.String(120)),
        sa.Column("day", sa.String(20), nullable=False),
        sa.Column("period", sa.Integer(), nullable=False),
        sa.Column("locked", sa.Boolean(), nullable=False),
        sa.Column("reasons", sa.JSON(), nullable=False),
    )
    op.create_index("ix_timetable_entries_run_id", "timetable_entries", ["run_id"])


def downgrade():
    op.drop_table("timetable_entries")
    op.drop_table("timetable_runs")
    op.drop_table("constraints")
    op.drop_table("courses")
    op.drop_table("rooms")
    op.drop_table("faculty")
    op.drop_table("departments")
    op.drop_index("ix_organizations_slug", table_name="organizations")
    op.drop_table("organizations")
