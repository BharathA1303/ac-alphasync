"""Add assigned_faculty_id and faculty_practice_windows

Revision ID: 018_faculty_practice
Revises: 017_institution_limits
Create Date: 2026-09-18 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "018_faculty_practice"
down_revision = "017_institution_limits"
branch_labels = None
depends_on = None


def _has_table(bind, table: str) -> bool:
    inspector = sa.inspect(bind)
    return table in inspector.get_table_names()


def _has_column(bind, table: str, column: str) -> bool:
    inspector = sa.inspect(bind)
    if table not in inspector.get_table_names():
        return False
    return column in {c["name"] for c in inspector.get_columns(table)}


def _has_index(bind, table: str, name: str) -> bool:
    inspector = sa.inspect(bind)
    if table not in inspector.get_table_names():
        return False
    return name in {idx["name"] for idx in inspector.get_indexes(table)}


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"
    uuid_type = postgresql.UUID(as_uuid=True) if is_pg else sa.String(36)

    if not _has_column(bind, "users", "assigned_faculty_id"):
        op.add_column(
            "users",
            sa.Column("assigned_faculty_id", uuid_type, nullable=True),
        )
        op.create_foreign_key(
            "fk_users_assigned_faculty_id",
            "users",
            "users",
            ["assigned_faculty_id"],
            ["id"],
        )

    if not _has_index(bind, "users", "ix_users_assigned_faculty_id"):
        op.create_index(
            "ix_users_assigned_faculty_id",
            "users",
            ["assigned_faculty_id"],
        )

    if not _has_table(bind, "faculty_practice_windows"):
        op.create_table(
            "faculty_practice_windows",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("faculty_id", uuid_type, nullable=False),
            sa.Column("institution_id", uuid_type, nullable=False),
            sa.Column("start_date", sa.Date(), nullable=False),
            sa.Column("end_date", sa.Date(), nullable=False),
            sa.Column("replay_date", sa.Date(), nullable=False),
            sa.Column(
                "status",
                sa.String(16),
                nullable=False,
                server_default=sa.text("'active'"),
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.ForeignKeyConstraint(
                ["faculty_id"], ["users.id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(
                ["institution_id"], ["institutions.id"], ondelete="CASCADE"
            ),
            sa.UniqueConstraint(
                "faculty_id", name="uq_faculty_practice_windows_faculty"
            ),
        )
        op.create_index(
            "ix_faculty_practice_windows_institution",
            "faculty_practice_windows",
            ["institution_id"],
        )
        op.create_index(
            "ix_faculty_practice_windows_status",
            "faculty_practice_windows",
            ["status"],
        )


def downgrade() -> None:
    bind = op.get_bind()

    if _has_table(bind, "faculty_practice_windows"):
        op.drop_table("faculty_practice_windows")

    if _has_index(bind, "users", "ix_users_assigned_faculty_id"):
        op.drop_index("ix_users_assigned_faculty_id", table_name="users")

    if _has_column(bind, "users", "assigned_faculty_id"):
        op.drop_constraint(
            "fk_users_assigned_faculty_id", "users", type_="foreignkey"
        )
        op.drop_column("users", "assigned_faculty_id")
