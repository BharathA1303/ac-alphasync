"""Add password_reset_tokens table

Revision ID: 011_password_reset
Revises: 010_market_data
Create Date: 2026-08-22 00:00:00.000000

Purely additive — no existing table is touched.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.dialects.postgresql import UUID

revision = "011_password_reset"
down_revision = "010_market_data"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    bind = op.get_bind()
    return table_name in sa_inspect(bind).get_table_names()


def upgrade() -> None:
    uuid_type = UUID(as_uuid=True)

    if not _has_table("password_reset_tokens"):
        op.create_table(
            "password_reset_tokens",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("token", sa.String(64), nullable=False, unique=True),
            sa.Column(
                "user_id",
                uuid_type,
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
        )
        op.create_index(
            "ix_password_reset_tokens_token", "password_reset_tokens", ["token"]
        )


def downgrade() -> None:
    if _has_table("password_reset_tokens"):
        op.drop_index(
            "ix_password_reset_tokens_token", table_name="password_reset_tokens"
        )
        op.drop_table("password_reset_tokens")
