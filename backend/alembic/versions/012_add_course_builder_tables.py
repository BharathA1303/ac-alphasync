"""Add course builder tables (courses, lessons, assessments)

Revision ID: 012_course_builder
Revises: 011_password_reset_tokens
Create Date: 2026-08-22 00:00:00.000000

Faculty upload courses (status="pending") scoped to their institution;
Institution Admin approves/rejects. Purely additive — no existing table
is touched.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "012_course_builder"
down_revision = "011_password_reset"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "courses",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("institution_id", UUID(as_uuid=True), sa.ForeignKey("institutions.id"), nullable=True),
        sa.Column("created_by_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("review_note", sa.Text(), nullable=True),
        sa.Column("reviewed_by_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.CheckConstraint("status in ('pending','approved','rejected')", name="ck_courses_status"),
    )
    op.create_index("ix_courses_institution_id", "courses", ["institution_id"])

    op.create_table(
        "lessons",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("course_id", UUID(as_uuid=True), sa.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_lessons_course_id", "lessons", ["course_id"])

    op.create_table(
        "assessments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("course_id", UUID(as_uuid=True), sa.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("instructions", sa.Text(), nullable=True),
        sa.Column("pass_score", sa.Integer(), nullable=False, server_default=sa.text("70")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_assessments_course_id", "assessments", ["course_id"])


def downgrade() -> None:
    op.drop_index("ix_assessments_course_id", table_name="assessments")
    op.drop_table("assessments")
    op.drop_index("ix_lessons_course_id", table_name="lessons")
    op.drop_table("lessons")
    op.drop_index("ix_courses_institution_id", table_name="courses")
    op.drop_table("courses")
