"""Add default-course fields and fix lesson_materials/lesson_ids schema drift

Revision ID: 016_default_courses
Revises: 015_assessment_proctoring
Create Date: 2026-08-27 00:00:00.000000

Two things bundled here:

1. Schema drift fix: models/course.py already defines LessonMaterial
   (table "lesson_materials") and Assessment.lesson_ids, added directly to
   the model at some point without a matching migration — same class of
   bug as migration 014_fix_course_builder_drift. Every operation here is
   defensive (checks table/column existence first) so it's a no-op on a
   database that already has them.

2. Default-course support: Course.created_by_user_id becomes nullable
   (platform-wide default courses have no authoring user), plus
   default_order_index (sequential unlock among default courses) and
   content_generated (AI generates a default course's content once,
   lazily, on first open — this flag avoids regenerating it every time).
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "016_default_courses"
down_revision = "015_assessment_proctoring"
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

    # ── Drift fix: lesson_materials / assessments.lesson_ids ─────
    if not _has_table(bind, "lesson_materials"):
        op.create_table(
            "lesson_materials",
            sa.Column("id", UUID(as_uuid=True), primary_key=True),
            sa.Column("lesson_id", UUID(as_uuid=True), sa.ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False),
            sa.Column("file_url", sa.String(length=500), nullable=False),
            sa.Column("file_name", sa.String(length=255), nullable=False),
            sa.Column("file_type", sa.String(length=20), nullable=False),
            sa.Column("extracted_text", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        )
        op.create_index("ix_lesson_materials_lesson_id", "lesson_materials", ["lesson_id"])

    if not _has_column(bind, "assessments", "lesson_ids"):
        op.add_column("assessments", sa.Column("lesson_ids", sa.JSON(), nullable=True))

    # ── Default-course support ────────────────────────────────────
    op.alter_column("courses", "created_by_user_id", nullable=True)

    if not _has_column(bind, "courses", "default_order_index"):
        op.add_column("courses", sa.Column("default_order_index", sa.Integer(), nullable=False, server_default=sa.text("0")))

    if not _has_column(bind, "courses", "content_generated"):
        op.add_column("courses", sa.Column("content_generated", sa.Boolean(), nullable=False, server_default=sa.text("false")))


def downgrade() -> None:
    bind = op.get_bind()

    if _has_column(bind, "courses", "content_generated"):
        op.drop_column("courses", "content_generated")
    if _has_column(bind, "courses", "default_order_index"):
        op.drop_column("courses", "default_order_index")

    op.alter_column("courses", "created_by_user_id", nullable=False)

    if _has_column(bind, "assessments", "lesson_ids"):
        op.drop_column("assessments", "lesson_ids")

    if _has_table(bind, "lesson_materials"):
        op.drop_index("ix_lesson_materials_lesson_id", table_name="lesson_materials")
        op.drop_table("lesson_materials")
