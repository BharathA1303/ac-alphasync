"""Add institution user limits (max_institution_admins, max_faculty, max_students)

Revision ID: 017_institution_limits
Revises: 016_default_courses
Create Date: 2026-08-28 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

revision = "017_institution_limits"
down_revision = "016_default_courses"
branch_labels = None
depends_on = None


def _has_column(bind, table: str, column: str) -> bool:
    inspector = sa.inspect(bind)
    return column in {c["name"] for c in inspector.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_column(bind, "institutions", "max_institution_admins"):
        op.add_column(
            "institutions",
            sa.Column(
                "max_institution_admins",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("5"),
            ),
        )

    if not _has_column(bind, "institutions", "max_faculty"):
        op.add_column(
            "institutions",
            sa.Column(
                "max_faculty",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("20"),
            ),
        )

    if not _has_column(bind, "institutions", "max_students"):
        op.add_column(
            "institutions",
            sa.Column(
                "max_students",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("200"),
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()

    if _has_column(bind, "institutions", "max_students"):
        op.drop_column("institutions", "max_students")
    if _has_column(bind, "institutions", "max_faculty"):
        op.drop_column("institutions", "max_faculty")
    if _has_column(bind, "institutions", "max_institution_admins"):
        op.drop_column("institutions", "max_institution_admins")
