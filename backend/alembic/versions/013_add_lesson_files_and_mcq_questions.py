"""Add lesson material file fields and MCQ question/choice tables

Revision ID: 013_mcq_questions
Revises: 012_course_builder
Create Date: 2026-08-23 00:00:00.000000

Adds file_url/file_name/file_type/extracted_text to lessons (uploaded
material for AI context), question_count/difficulty config to assessments,
and new questions/choices tables for structured MCQ assessments (manual or
AI-generated). Purely additive.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "013_mcq_questions"
down_revision = "012_course_builder"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("lessons", sa.Column("file_url", sa.String(length=500), nullable=True))
    op.add_column("lessons", sa.Column("file_name", sa.String(length=255), nullable=True))
    op.add_column("lessons", sa.Column("file_type", sa.String(length=20), nullable=True))
    op.add_column("lessons", sa.Column("extracted_text", sa.Text(), nullable=True))

    op.add_column("assessments", sa.Column("question_count", sa.Integer(), nullable=False, server_default=sa.text("5")))
    op.add_column("assessments", sa.Column("difficulty", sa.String(length=20), nullable=False, server_default=sa.text("'medium'")))

    op.create_table(
        "questions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("assessment_id", UUID(as_uuid=True), sa.ForeignKey("assessments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("source", sa.String(length=10), nullable=False, server_default=sa.text("'manual'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.CheckConstraint("source in ('ai','manual')", name="ck_questions_source"),
    )
    op.create_index("ix_questions_assessment_id", "questions", ["assessment_id"])

    op.create_table(
        "choices",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("question_id", UUID(as_uuid=True), sa.ForeignKey("questions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("is_correct", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.create_index("ix_choices_question_id", "choices", ["question_id"])


def downgrade() -> None:
    op.drop_index("ix_choices_question_id", table_name="choices")
    op.drop_table("choices")
    op.drop_index("ix_questions_assessment_id", table_name="questions")
    op.drop_table("questions")
    op.drop_column("assessments", "difficulty")
    op.drop_column("assessments", "question_count")
    op.drop_column("lessons", "extracted_text")
    op.drop_column("lessons", "file_type")
    op.drop_column("lessons", "file_name")
    op.drop_column("lessons", "file_url")
