"""Add assessment proctoring fields and retake grant table

Revision ID: 015_assessment_proctoring
Revises: 014_fix_course_builder_drift
Create Date: 2026-08-24 00:00:00.000000

Adds flagged/flag_reason/started_at to assessment_attempts (timed,
proctored, one-attempt-only assessments) and a new
assessment_retake_grants table an Institution Admin uses to grant a
specific student one more attempt. Purely additive.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "015_assessment_proctoring"
down_revision = "014_fix_course_builder_drift"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("assessment_attempts", sa.Column("flagged", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("assessment_attempts", sa.Column("flag_reason", sa.Text(), nullable=True))
    op.add_column("assessment_attempts", sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")))

    op.create_table(
        "assessment_retake_grants",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("assessment_id", UUID(as_uuid=True), sa.ForeignKey("assessments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("granted_by_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("consumed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_assessment_retake_grants_user_id", "assessment_retake_grants", ["user_id"])
    op.create_index("ix_assessment_retake_grants_assessment_id", "assessment_retake_grants", ["assessment_id"])


def downgrade() -> None:
    op.drop_index("ix_assessment_retake_grants_assessment_id", table_name="assessment_retake_grants")
    op.drop_index("ix_assessment_retake_grants_user_id", table_name="assessment_retake_grants")
    op.drop_table("assessment_retake_grants")
    op.drop_column("assessment_attempts", "started_at")
    op.drop_column("assessment_attempts", "flag_reason")
    op.drop_column("assessment_attempts", "flagged")
