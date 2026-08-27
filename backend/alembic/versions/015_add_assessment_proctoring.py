"""Add assessment proctoring fields and retake grant table

Revision ID: 015_assessment_proctoring
Revises: 014_fix_course_builder_drift
Create Date: 2026-08-24 00:00:00.000000

Adds flagged/flag_reason/started_at to assessment_attempts (timed,
proctored, one-attempt-only assessments) and a new
assessment_retake_grants table an Institution Admin uses to grant a
specific student one more attempt.

Defensive (checks column/table existence first): a prior deploy already
applied some of this schema directly against a database still stamped
below this revision (same class of drift as 014_fix_course_builder_drift),
so this must be a no-op wherever the column/table is already present.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "015_assessment_proctoring"
down_revision = "014_fix_course_builder_drift"
branch_labels = None
depends_on = None


def _has_column(bind, table: str, column: str) -> bool:
    inspector = sa.inspect(bind)
    return column in {c["name"] for c in inspector.get_columns(table)}


def _has_table(bind, table: str) -> bool:
    inspector = sa.inspect(bind)
    return inspector.has_table(table)


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_column(bind, "assessment_attempts", "flagged"):
        op.add_column("assessment_attempts", sa.Column("flagged", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    if not _has_column(bind, "assessment_attempts", "flag_reason"):
        op.add_column("assessment_attempts", sa.Column("flag_reason", sa.Text(), nullable=True))
    if not _has_column(bind, "assessment_attempts", "started_at"):
        op.add_column("assessment_attempts", sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")))

    if not _has_table(bind, "assessment_retake_grants"):
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
    bind = op.get_bind()

    if _has_table(bind, "assessment_retake_grants"):
        op.drop_index("ix_assessment_retake_grants_assessment_id", table_name="assessment_retake_grants")
        op.drop_index("ix_assessment_retake_grants_user_id", table_name="assessment_retake_grants")
        op.drop_table("assessment_retake_grants")
    if _has_column(bind, "assessment_attempts", "started_at"):
        op.drop_column("assessment_attempts", "started_at")
    if _has_column(bind, "assessment_attempts", "flag_reason"):
        op.drop_column("assessment_attempts", "flag_reason")
    if _has_column(bind, "assessment_attempts", "flagged"):
        op.drop_column("assessment_attempts", "flagged")
