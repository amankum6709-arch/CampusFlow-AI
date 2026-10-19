"""Add assistant proposal store for the action-taking timetable assistant.

Revision ID: 0004_assistant_proposals
Revises: 0003_users_classes_sessions
"""
from alembic import op
import sqlalchemy as sa

revision = "0004_assistant_proposals"
down_revision = "0003_users_classes_sessions"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "assistant_proposals",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("run_id", sa.String(36), sa.ForeignKey("timetable_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("intent", sa.String(40), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("base_fingerprint", sa.String(64), nullable=False),
        sa.Column("changes", sa.JSON(), nullable=False),
        sa.Column("impact", sa.JSON(), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("decided_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_assistant_proposals_organization_id", "assistant_proposals", ["organization_id"])
    op.create_index("ix_assistant_proposals_run_id", "assistant_proposals", ["run_id"])


def downgrade():
    op.drop_index("ix_assistant_proposals_run_id", table_name="assistant_proposals")
    op.drop_index("ix_assistant_proposals_organization_id", table_name="assistant_proposals")
    op.drop_table("assistant_proposals")
