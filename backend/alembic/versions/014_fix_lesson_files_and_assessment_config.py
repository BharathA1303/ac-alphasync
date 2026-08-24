"""Fix lessons/assessments schema drift from an earlier draft migration

Revision ID: 014_fix_course_builder_drift
Revises: 014_student_progress
Create Date: 2026-08-23 00:00:00.000000

An earlier deploy attempt applied a draft version of the course-builder
schema before it was finalized and crashed partway through, leaving some
databases stamped at a revision id ("013_mcq_lesson_files") that no
longer matches any file in this repo, with the schema in a different
shape than the current Course/Lesson/Assessment/Question/Choice models
expect:

  - lessons.file_path  -> should be lessons.file_url
  - lessons may be missing file_type, extracted_text
  - assessments may be missing question_count, difficulty
  - a leftover empty "mcq_questions" table from before it was renamed
    to "questions"

Every operation here is defensive (checks information_schema / pg_class
first) so this migration is a no-op on a database that was never
affected by the draft, and a corrective fix on one that was — either
way it ends up matching the current models. Databases stuck on the
stale "013_mcq_lesson_files" stamp must be re-stamped to
"013_mcq_questions" first (`alembic stamp 013_mcq_questions`) so this
migration is recognized as the next step.
"""

import sqlalchemy as sa
from alembic import op

revision = "014_fix_course_builder_drift"
down_revision = "014_student_progress"
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

    # ── lessons: file_path -> file_url (draft-schema rename) ─────
    if _has_column(bind, "lessons", "file_path") and not _has_column(bind, "lessons", "file_url"):
        op.alter_column("lessons", "file_path", new_column_name="file_url")

    if not _has_column(bind, "lessons", "file_type"):
        op.add_column("lessons", sa.Column("file_type", sa.String(length=20), nullable=True))

    if not _has_column(bind, "lessons", "extracted_text"):
        op.add_column("lessons", sa.Column("extracted_text", sa.Text(), nullable=True))

    # ── assessments: add missing AI-generation config columns ────
    if not _has_column(bind, "assessments", "question_count"):
        op.add_column("assessments", sa.Column("question_count", sa.Integer(), nullable=False, server_default=sa.text("5")))

    if not _has_column(bind, "assessments", "difficulty"):
        op.add_column("assessments", sa.Column("difficulty", sa.String(length=20), nullable=False, server_default=sa.text("'medium'")))

    # ── drop orphaned empty table from the earlier draft ─────────
    if _has_table(bind, "mcq_questions"):
        op.drop_table("mcq_questions")


def downgrade() -> None:
    bind = op.get_bind()

    if not _has_table(bind, "mcq_questions"):
        op.create_table(
            "mcq_questions",
            sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("assessment_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("assessments.id", ondelete="CASCADE"), nullable=False),
            sa.Column("text", sa.Text(), nullable=False),
            sa.Column("order_index", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("source", sa.String(length=10), nullable=False, server_default=sa.text("'manual'")),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        )

    if _has_column(bind, "assessments", "difficulty"):
        op.drop_column("assessments", "difficulty")
    if _has_column(bind, "assessments", "question_count"):
        op.drop_column("assessments", "question_count")

    if _has_column(bind, "lessons", "extracted_text"):
        op.drop_column("lessons", "extracted_text")
    if _has_column(bind, "lessons", "file_type"):
        op.drop_column("lessons", "file_type")
    if _has_column(bind, "lessons", "file_url") and not _has_column(bind, "lessons", "file_path"):
        op.alter_column("lessons", "file_url", new_column_name="file_path")
