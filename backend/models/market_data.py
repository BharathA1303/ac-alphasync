"""
Market data persistence models — historical candle store for simulation replay.

These tables hold ONLY market data downloaded from Zebu (identity + OHLCV).
They never hold user, order, position, portfolio, or auth data.

Tables:
    instruments          — identity/metadata for a tradable instrument
    historical_candles   — 1-minute (and daily) OHLCV rows per instrument
    download_status      — per-instrument outcome of a day's download job
    simulation_sessions  — replay clock state for a simulated trading day
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    String,
    Integer,
    Numeric,
    DateTime,
    Date,
    ForeignKey,
    Index,
    UniqueConstraint,
    CheckConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID

from database.connection import Base


def _utcnow():
    return datetime.now(timezone.utc)


# ── Instrument type constants ──────────────────────────────────────
INSTRUMENT_TYPE_EQUITY = "EQUITY"
INSTRUMENT_TYPE_INDEX = "INDEX"
INSTRUMENT_TYPE_FUTURES = "FUTURES"
INSTRUMENT_TYPE_OPTIONS = "OPTIONS"

VALID_INSTRUMENT_TYPES = (
    INSTRUMENT_TYPE_EQUITY,
    INSTRUMENT_TYPE_INDEX,
    INSTRUMENT_TYPE_FUTURES,
    INSTRUMENT_TYPE_OPTIONS,
)

# ── Download status constants ──────────────────────────────────────
DOWNLOAD_SUCCESS = "SUCCESS"
DOWNLOAD_PARTIAL = "PARTIAL"
DOWNLOAD_FAILED = "FAILED"

# ── Simulation session status constants ────────────────────────────
SIM_READY = "READY"
SIM_RUNNING = "RUNNING"
SIM_PAUSED = "PAUSED"
SIM_ENDED = "ENDED"
SIM_FAILED = "FAILED"


class Instrument(Base):
    """Identity record for one tradable instrument (equity/index/futures/option)."""

    __tablename__ = "instruments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Broker identity
    token = Column(String(32), nullable=False, index=True)
    trading_symbol = Column(String(80), nullable=False, index=True)
    exchange = Column(String(12), nullable=False)  # NSE, NFO, BFO, BSE

    # Classification
    underlying = Column(String(40), nullable=True, index=True)  # e.g. "NIFTY"
    instrument_type = Column(String(12), nullable=False, index=True)

    # Derivatives-only attributes (NULL for equity/index)
    expiry_date = Column(Date, nullable=True, index=True)
    strike_price = Column(Numeric(precision=14, scale=2), nullable=True)
    option_type = Column(String(2), nullable=True)  # CE / PE

    # Trading parameters
    lot_size = Column(Integer, nullable=False, default=1, server_default=text("1"))
    tick_size = Column(
        Numeric(precision=10, scale=4),
        nullable=False,
        default=0.05,
        server_default=text("0.05"),
    )
    price_precision = Column(
        Integer, nullable=False, default=2, server_default=text("2")
    )
    freeze_quantity = Column(Integer, nullable=True)

    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=_utcnow,
        onupdate=_utcnow,
        nullable=False,
    )

    __table_args__ = (
        # Identity is (exchange, trading_symbol) — the natural upsert key.
        UniqueConstraint(
            "exchange", "trading_symbol", name="uq_instruments_exchange_tsym"
        ),
        Index("ix_instruments_underlying_type", "underlying", "instrument_type"),
        Index("ix_instruments_type_expiry", "instrument_type", "expiry_date"),
        CheckConstraint("lot_size > 0", name="ck_instruments_lot_size_positive"),
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return (
            f"<Instrument {self.exchange}:{self.trading_symbol} "
            f"type={self.instrument_type}>"
        )


class HistoricalCandle(Base):
    """One OHLCV bar for an instrument at a point in time."""

    __tablename__ = "historical_candles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    instrument_id = Column(
        UUID(as_uuid=True),
        ForeignKey("instruments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # trading_date is the IST calendar session date this bar belongs to.
    trading_date = Column(Date, nullable=False, index=True)
    # timestamp is the canonical UTC bar-open time.
    timestamp = Column(DateTime(timezone=True), nullable=False, index=True)

    open = Column(Numeric(precision=14, scale=2), nullable=False)
    high = Column(Numeric(precision=14, scale=2), nullable=False)
    low = Column(Numeric(precision=14, scale=2), nullable=False)
    close = Column(Numeric(precision=14, scale=2), nullable=False)
    volume = Column(Integer, nullable=False, default=0, server_default=text("0"))
    # Only futures/options carry OI. Equities/indices stay NULL — never zero-filled.
    open_interest = Column(Integer, nullable=True)

    source = Column(String(32), nullable=False)  # zebu_tp_series / zebu_eod

    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    __table_args__ = (
        # Idempotency: re-running a download collapses onto the same row.
        UniqueConstraint(
            "instrument_id", "timestamp", name="uq_historical_candles_instrument_ts"
        ),
        Index(
            "ix_historical_candles_instrument_date",
            "instrument_id",
            "trading_date",
        ),
        Index(
            "ix_historical_candles_date_ts",
            "trading_date",
            "timestamp",
        ),
        Index(
            "ix_historical_candles_lookup",
            "instrument_id",
            "trading_date",
            "timestamp",
        ),
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<HistoricalCandle {self.instrument_id} @ {self.timestamp} c={self.close}>"


class DownloadStatus(Base):
    """Per-instrument outcome of one trading day's historical download."""

    __tablename__ = "download_status"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    trading_date = Column(Date, nullable=False, index=True)
    # NULL instrument_id = batch-level summary row for the whole run.
    instrument_id = Column(
        UUID(as_uuid=True),
        ForeignKey("instruments.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    status = Column(String(12), nullable=False)  # SUCCESS / PARTIAL / FAILED
    started_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    rows = Column(Integer, nullable=False, default=0, server_default=text("0"))
    retry_count = Column(Integer, nullable=False, default=0, server_default=text("0"))
    error = Column(String(1000), nullable=True)

    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=_utcnow,
        onupdate=_utcnow,
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint(
            "trading_date", "instrument_id", name="uq_download_status_date_instrument"
        ),
        Index("ix_download_status_date_status", "trading_date", "status"),
    )


class SimulationSession(Base):
    """Replay clock state for one simulated trading day."""

    __tablename__ = "simulation_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    simulation_date = Column(Date, nullable=False, index=True)
    status = Column(
        String(12),
        nullable=False,
        default=SIM_READY,
        server_default=text("'READY'"),
    )
    speed = Column(
        Numeric(precision=6, scale=2),
        nullable=False,
        default=1,
        server_default=text("1"),
    )
    # Current position of the simulated clock (UTC instant).
    simulation_time = Column(DateTime(timezone=True), nullable=True)

    started_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=_utcnow,
        onupdate=_utcnow,
        nullable=False,
    )

    __table_args__ = (
        Index("ix_simulation_sessions_status", "status"),
        CheckConstraint("speed > 0", name="ck_simulation_speed_positive"),
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return (
            f"<SimulationSession {self.simulation_date} "
            f"status={self.status} t={self.simulation_time}>"
        )
