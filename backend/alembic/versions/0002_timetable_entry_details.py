"""Add timetable occurrence and lab-unit fields.

Revision ID: 0002_timetable_entry_details
Revises: 0001_initial
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_timetable_entry_details"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("timetable_entries", sa.Column("session_id", sa.String(length=180), nullable=True))
    op.add_column("timetable_entries", sa.Column("unit_id", sa.String(length=180), nullable=True))
    op.add_column("timetable_entries", sa.Column("batch_id", sa.String(length=120), nullable=True))
    op.add_column("timetable_entries", sa.Column("group_name", sa.String(length=120), nullable=True))
    op.add_column("timetable_entries", sa.Column("student_count", sa.Integer(), nullable=False, server_default="0"))
    op.create_index("ix_timetable_entries_session_id", "timetable_entries", ["session_id"])
    op.create_index("ix_timetable_entries_batch_id", "timetable_entries", ["batch_id"])


def downgrade():
    op.drop_index("ix_timetable_entries_batch_id", table_name="timetable_entries")
    op.drop_index("ix_timetable_entries_session_id", table_name="timetable_entries")
    op.drop_column("timetable_entries", "student_count")
    op.drop_column("timetable_entries", "group_name")
    op.drop_column("timetable_entries", "batch_id")
    op.drop_column("timetable_entries", "unit_id")
    op.drop_column("timetable_entries", "session_id")
