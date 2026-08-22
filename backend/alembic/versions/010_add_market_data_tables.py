"""Add historical market data tables for simulation replay

Revision ID: 010_market_data
Revises: 009_clear_broker_credentials
Create Date: 2026-08-22 00:00:00.000000

Creates instruments, historical_candles, download_status and
simulation_sessions. Purely additive — no existing table is touched.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "010_market_data"
down_revision = "009_clear_broker_credentials"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "instruments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("token", sa.String(length=32), nullable=False),
        sa.Column("trading_symbol", sa.String(length=80), nullable=False),
        sa.Column("exchange", sa.String(length=12), nullable=False),
        sa.Column("underlying", sa.String(length=40), nullable=True),
        sa.Column("instrument_type", sa.String(length=12), nullable=False),
        sa.Column("expiry_date", sa.Date(), nullable=True),
        sa.Column("strike_price", sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column("option_type", sa.String(length=2), nullable=True),
        sa.Column("lot_size", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column(
            "tick_size",
            sa.Numeric(precision=10, scale=4),
            nullable=False,
            server_default=sa.text("0.05"),
        ),
        sa.Column(
            "price_precision", sa.Integer(), nullable=False, server_default=sa.text("2")
        ),
        sa.Column("freeze_quantity", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "exchange", "trading_symbol", name="uq_instruments_exchange_tsym"
        ),
        sa.CheckConstraint("lot_size > 0", name="ck_instruments_lot_size_positive"),
    )
    op.create_index("ix_instruments_token", "instruments", ["token"])
    op.create_index("ix_instruments_trading_symbol", "instruments", ["trading_symbol"])
    op.create_index("ix_instruments_underlying", "instruments", ["underlying"])
    op.create_index("ix_instruments_instrument_type", "instruments", ["instrument_type"])
    op.create_index("ix_instruments_expiry_date", "instruments", ["expiry_date"])
    op.create_index(
        "ix_instruments_underlying_type", "instruments", ["underlying", "instrument_type"]
    )
    op.create_index(
        "ix_instruments_type_expiry", "instruments", ["instrument_type", "expiry_date"]
    )

    op.create_table(
        "historical_candles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "instrument_id",
            UUID(as_uuid=True),
            sa.ForeignKey("instruments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("trading_date", sa.Date(), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("open", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("high", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("low", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("close", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("volume", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("open_interest", sa.Integer(), nullable=True),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "instrument_id", "timestamp", name="uq_historical_candles_instrument_ts"
        ),
    )
    op.create_index(
        "ix_historical_candles_instrument_id", "historical_candles", ["instrument_id"]
    )
    op.create_index(
        "ix_historical_candles_trading_date", "historical_candles", ["trading_date"]
    )
    op.create_index("ix_historical_candles_timestamp", "historical_candles", ["timestamp"])
    op.create_index(
        "ix_historical_candles_instrument_date",
        "historical_candles",
        ["instrument_id", "trading_date"],
    )
    op.create_index(
        "ix_historical_candles_date_ts",
        "historical_candles",
        ["trading_date", "timestamp"],
    )
    op.create_index(
        "ix_historical_candles_lookup",
        "historical_candles",
        ["instrument_id", "trading_date", "timestamp"],
    )

    op.create_table(
        "download_status",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("trading_date", sa.Date(), nullable=False),
        sa.Column(
            "instrument_id",
            UUID(as_uuid=True),
            sa.ForeignKey("instruments.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("status", sa.String(length=12), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rows", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column(
            "retry_count", sa.Integer(), nullable=False, server_default=sa.text("0")
        ),
        sa.Column("error", sa.String(length=1000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "trading_date", "instrument_id", name="uq_download_status_date_instrument"
        ),
    )
    op.create_index("ix_download_status_trading_date", "download_status", ["trading_date"])
    op.create_index(
        "ix_download_status_instrument_id", "download_status", ["instrument_id"]
    )
    op.create_index(
        "ix_download_status_date_status", "download_status", ["trading_date", "status"]
    )

    op.create_table(
        "simulation_sessions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("simulation_date", sa.Date(), nullable=False),
        sa.Column(
            "status",
            sa.String(length=12),
            nullable=False,
            server_default=sa.text("'READY'"),
        ),
        sa.Column(
            "speed",
            sa.Numeric(precision=6, scale=2),
            nullable=False,
            server_default=sa.text("1"),
        ),
        sa.Column("simulation_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("speed > 0", name="ck_simulation_speed_positive"),
    )
    op.create_index(
        "ix_simulation_sessions_simulation_date",
        "simulation_sessions",
        ["simulation_date"],
    )
    op.create_index("ix_simulation_sessions_status", "simulation_sessions", ["status"])


def downgrade() -> None:
    op.drop_table("simulation_sessions")
    op.drop_table("download_status")
    op.drop_table("historical_candles")
    op.drop_table("instruments")
