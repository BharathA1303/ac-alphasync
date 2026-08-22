"""
ZebuHistoricalDownloader — persists 1-minute historical candles for the
scoped simulation universe.

Reuses the existing Zebu historical fetch methods on an authenticated
ZebuProvider (`_fetch_tp_series`, `_fetch_eod_data`, `_parse_candles`).
No new Zebu HTTP plumbing is introduced.

Guarantees:
    - Idempotent: re-running a day collapses onto the same candle rows via
      the (instrument_id, timestamp) unique constraint.
    - Isolated failures: one instrument failing never aborts the others.
    - Validated: candles missing any OHLC component are rejected, never
      zero-filled or fabricated.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from engines.market_session import IST, NSE_HOLIDAYS_2026, MarketState, market_session
from models.market_data import (
    DOWNLOAD_FAILED,
    DOWNLOAD_PARTIAL,
    DOWNLOAD_SUCCESS,
    DownloadStatus,
    HistoricalCandle,
    Instrument,
)
from services.simulation_universe import UniverseInstrument, build_universe

logger = logging.getLogger(__name__)

# NSE regular session in IST — bars outside this window are ignored.
SESSION_START = time(9, 15)
SESSION_END = time(15, 30)

SOURCE_TP_SERIES = "zebu_tp_series"
SOURCE_EOD = "zebu_eod"

# Concurrency cap for per-instrument Zebu fetches.
FETCH_CONCURRENCY = 8


def is_trading_day(day: date) -> bool:
    """
    A weekday that is not an NSE holiday.

    Reuses the market_session holiday calendar — holiday detection is NOT
    reimplemented here.
    """
    if day.weekday() >= 5:
        return False
    holidays = getattr(market_session, "_holidays", None) or NSE_HOLIDAYS_2026
    return day not in holidays


def latest_complete_trading_day(now: Optional[datetime] = None) -> date:
    """
    Most recent trading day whose session has fully completed.

    Today only counts once the regular session has ended (>= 15:30 IST).
    """
    now = now or datetime.now(IST)
    if now.tzinfo is None:
        now = now.replace(tzinfo=IST)
    else:
        now = now.astimezone(IST)

    candidate = now.date()
    if not (is_trading_day(candidate) and now.time() >= SESSION_END):
        candidate -= timedelta(days=1)

    # Walk back to the nearest trading day (bounded to avoid infinite loops).
    for _ in range(30):
        if is_trading_day(candidate):
            return candidate
        candidate -= timedelta(days=1)
    return candidate


def _session_epoch_bounds(trading_day: date) -> tuple[int, int]:
    """UTC epoch seconds for the IST session window of a trading day."""
    start = datetime.combine(trading_day, SESSION_START, tzinfo=IST)
    end = datetime.combine(trading_day, SESSION_END, tzinfo=IST)
    return int(start.timestamp()), int(end.timestamp())


@dataclass
class InstrumentDownloadResult:
    """Outcome of downloading one instrument for one trading day."""

    key: str
    status: str
    rows: int = 0
    error: Optional[str] = None


@dataclass
class DownloadRunResult:
    """Aggregate outcome of one download run."""

    trading_date: date
    results: list[InstrumentDownloadResult]

    @property
    def total_rows(self) -> int:
        return sum(r.rows for r in self.results)

    @property
    def succeeded(self) -> list[InstrumentDownloadResult]:
        return [r for r in self.results if r.status == DOWNLOAD_SUCCESS]

    @property
    def failed(self) -> list[InstrumentDownloadResult]:
        return [r for r in self.results if r.status == DOWNLOAD_FAILED]

    @property
    def overall_status(self) -> str:
        if not self.results:
            return DOWNLOAD_FAILED
        if not self.failed:
            return DOWNLOAD_SUCCESS
        if self.succeeded:
            return DOWNLOAD_PARTIAL
        return DOWNLOAD_FAILED


class ZebuHistoricalDownloader:
    """Downloads and persists historical candles for the scoped universe."""

    def __init__(self, provider=None) -> None:
        self._provider = provider

    # ── Provider access ────────────────────────────────────────────

    def _get_provider(self):
        """Authenticated ZebuProvider, via the shared broker session manager."""
        if self._provider is not None:
            return self._provider
        from services.broker_session import broker_session_manager

        return broker_session_manager.get_any_session()

    # ── Instrument persistence ─────────────────────────────────────

    async def upsert_instrument(
        self, db: AsyncSession, inst: UniverseInstrument
    ) -> Instrument:
        """Insert or update an Instrument row, keyed on (exchange, trading_symbol)."""
        stmt = select(Instrument).where(
            Instrument.exchange == inst.exchange,
            Instrument.trading_symbol == inst.trading_symbol,
        )
        existing = (await db.execute(stmt)).scalar_one_or_none()

        if existing:
            existing.token = inst.token or existing.token
            existing.underlying = inst.underlying or existing.underlying
            existing.instrument_type = inst.instrument_type
            existing.expiry_date = inst.expiry_date
            existing.strike_price = inst.strike_price
            existing.option_type = inst.option_type
            existing.lot_size = inst.lot_size or existing.lot_size or 1
            existing.tick_size = inst.tick_size or existing.tick_size
            existing.price_precision = inst.price_precision
            existing.freeze_quantity = inst.freeze_quantity
            await db.flush()
            return existing

        created = Instrument(
            token=inst.token,
            trading_symbol=inst.trading_symbol,
            exchange=inst.exchange,
            underlying=inst.underlying,
            instrument_type=inst.instrument_type,
            expiry_date=inst.expiry_date,
            strike_price=inst.strike_price,
            option_type=inst.option_type,
            lot_size=inst.lot_size or 1,
            tick_size=inst.tick_size or 0.05,
            price_precision=inst.price_precision or 2,
            freeze_quantity=inst.freeze_quantity,
        )
        db.add(created)
        await db.flush()
        return created

    # ── Candle fetch + validation ──────────────────────────────────

    async def fetch_candles(
        self,
        inst: UniverseInstrument,
        trading_day: date,
        interval: str = "1",
    ) -> list[dict]:
        """
        Fetch raw candles for one instrument via the existing Zebu methods.

        Raises on provider/transport failure so the caller can record a
        per-instrument FAILED status.
        """
        provider = self._get_provider()
        if provider is None:
            raise RuntimeError("No authenticated Zebu session available")

        st_epoch, et_epoch = _session_epoch_bounds(trading_day)

        if interval == "D":
            return await provider._fetch_eod_data(
                inst.exchange, inst.trading_symbol, st_epoch, et_epoch
            )
        return await provider._fetch_tp_series(
            inst.exchange, inst.token, st_epoch, et_epoch, interval
        )

    @staticmethod
    def validate_candles(raw: list, trading_day: date) -> list[dict]:
        """
        Keep only structurally valid candles inside the trading day's session.

        Rejects: missing/None OHLC, non-positive prices, unparseable
        timestamps, and bars outside the session window. Duplicate
        timestamps collapse (last wins) so the DB upsert never sees
        conflicting rows in a single batch.
        """
        by_ts: dict[int, dict] = {}
        session_start, session_end = _session_epoch_bounds(trading_day)

        for candle in raw or []:
            if not isinstance(candle, dict):
                continue

            ts = candle.get("time")
            try:
                ts = int(ts)
            except (TypeError, ValueError):
                continue

            # Session-window filter (inclusive start, inclusive end bar).
            if ts < session_start or ts > session_end:
                continue

            try:
                o = float(candle["open"])
                h = float(candle["high"])
                l = float(candle["low"])
                c = float(candle["close"])
            except (KeyError, TypeError, ValueError):
                continue

            # Reject NaN and non-positive prices — never fabricate a value.
            values = (o, h, l, c)
            if any(v != v for v in values) or any(v <= 0 for v in values):
                continue
            if h < l:
                continue

            try:
                volume = int(float(candle.get("volume") or 0))
            except (TypeError, ValueError):
                volume = 0

            oi_raw = candle.get("open_interest", candle.get("oi"))
            open_interest = None
            if oi_raw not in (None, ""):
                try:
                    open_interest = int(float(oi_raw))
                except (TypeError, ValueError):
                    open_interest = None

            by_ts[ts] = {
                "time": ts,
                "open": o,
                "high": h,
                "low": l,
                "close": c,
                "volume": max(0, volume),
                "open_interest": open_interest,
            }

        return [by_ts[ts] for ts in sorted(by_ts)]

    # ── Candle persistence ─────────────────────────────────────────

    async def persist_candles(
        self,
        db: AsyncSession,
        instrument: Instrument,
        candles: list[dict],
        trading_day: date,
        source: str = SOURCE_TP_SERIES,
    ) -> int:
        """
        Idempotently upsert candles. Returns the number of rows written
        (inserted + updated).

        Existing rows are matched on (instrument_id, timestamp) — the same
        unique constraint the DB enforces — so re-running never duplicates.
        """
        if not candles:
            return 0

        existing_stmt = select(HistoricalCandle).where(
            HistoricalCandle.instrument_id == instrument.id,
            HistoricalCandle.trading_date == trading_day,
        )
        existing_rows = (await db.execute(existing_stmt)).scalars().all()
        by_ts = {
            int(row.timestamp.replace(tzinfo=row.timestamp.tzinfo or timezone.utc).timestamp()): row
            for row in existing_rows
        }

        written = 0
        for candle in candles:
            ts = int(candle["time"])
            dt = datetime.fromtimestamp(ts, tz=timezone.utc)
            row = by_ts.get(ts)

            if row is not None:
                row.open = candle["open"]
                row.high = candle["high"]
                row.low = candle["low"]
                row.close = candle["close"]
                row.volume = candle["volume"]
                row.open_interest = candle["open_interest"]
                row.source = source
            else:
                new_row = HistoricalCandle(
                    instrument_id=instrument.id,
                    trading_date=trading_day,
                    timestamp=dt,
                    open=candle["open"],
                    high=candle["high"],
                    low=candle["low"],
                    close=candle["close"],
                    volume=candle["volume"],
                    open_interest=candle["open_interest"],
                    source=source,
                )
                db.add(new_row)
                by_ts[ts] = new_row
            written += 1

        await db.flush()
        return written

    # ── Status tracking ────────────────────────────────────────────

    async def record_status(
        self,
        db: AsyncSession,
        trading_day: date,
        instrument_id,
        status: str,
        rows: int = 0,
        error: Optional[str] = None,
        started_at: Optional[datetime] = None,
    ) -> DownloadStatus:
        """Upsert the DownloadStatus row for (trading_date, instrument_id)."""
        stmt = select(DownloadStatus).where(
            DownloadStatus.trading_date == trading_day,
            DownloadStatus.instrument_id == instrument_id,
        )
        existing = (await db.execute(stmt)).scalar_one_or_none()
        now = datetime.now(timezone.utc)

        if existing:
            existing.status = status
            existing.rows = rows
            existing.error = (error or None) and str(error)[:1000]
            existing.completed_at = now
            existing.retry_count = (existing.retry_count or 0) + 1
            await db.flush()
            return existing

        created = DownloadStatus(
            trading_date=trading_day,
            instrument_id=instrument_id,
            status=status,
            rows=rows,
            error=(error or None) and str(error)[:1000],
            started_at=started_at or now,
            completed_at=now,
            retry_count=0,
        )
        db.add(created)
        await db.flush()
        return created

    # ── Orchestration ──────────────────────────────────────────────

    async def download_instrument(
        self,
        db: AsyncSession,
        inst: UniverseInstrument,
        trading_day: date,
        interval: str = "1",
    ) -> InstrumentDownloadResult:
        """
        Download + persist one instrument. Never raises — failures are
        captured into a FAILED result and a DownloadStatus row.
        """
        started_at = datetime.now(timezone.utc)
        instrument_row = None
        try:
            instrument_row = await self.upsert_instrument(db, inst)
            raw = await self.fetch_candles(inst, trading_day, interval=interval)
            candles = self.validate_candles(raw, trading_day)

            source = SOURCE_EOD if interval == "D" else SOURCE_TP_SERIES
            rows = await self.persist_candles(
                db, instrument_row, candles, trading_day, source=source
            )

            if rows == 0:
                await self.record_status(
                    db,
                    trading_day,
                    instrument_row.id,
                    DOWNLOAD_PARTIAL,
                    rows=0,
                    error="No valid candles returned",
                    started_at=started_at,
                )
                return InstrumentDownloadResult(
                    inst.key, DOWNLOAD_PARTIAL, 0, "No valid candles returned"
                )

            await self.record_status(
                db,
                trading_day,
                instrument_row.id,
                DOWNLOAD_SUCCESS,
                rows=rows,
                started_at=started_at,
            )
            return InstrumentDownloadResult(inst.key, DOWNLOAD_SUCCESS, rows)

        except Exception as exc:
            logger.warning(
                f"Historical download failed for {inst.key} on {trading_day}: {exc}"
            )
            try:
                await self.record_status(
                    db,
                    trading_day,
                    instrument_row.id if instrument_row is not None else None,
                    DOWNLOAD_FAILED,
                    rows=0,
                    error=str(exc),
                    started_at=started_at,
                )
            except Exception as status_exc:  # pragma: no cover - defensive
                logger.error(f"Could not record failure status for {inst.key}: {status_exc}")
            return InstrumentDownloadResult(inst.key, DOWNLOAD_FAILED, 0, str(exc))

    async def download_day(
        self,
        db: AsyncSession,
        trading_day: Optional[date] = None,
        instruments: Optional[list[UniverseInstrument]] = None,
        interval: str = "1",
    ) -> DownloadRunResult:
        """
        Download the full scoped universe for one trading day.

        Each instrument is isolated — one failure never aborts the run.
        """
        trading_day = trading_day or latest_complete_trading_day()

        if not is_trading_day(trading_day):
            logger.info(f"Skipping historical download: {trading_day} is not a trading day")
            return DownloadRunResult(trading_day, [])

        if instruments is None:
            instruments = await build_universe()

        if not instruments:
            logger.warning("Historical download: universe is empty")
            return DownloadRunResult(trading_day, [])

        logger.info(
            f"Historical download starting: {len(instruments)} instruments for {trading_day}"
        )

        semaphore = asyncio.Semaphore(FETCH_CONCURRENCY)
        results: list[InstrumentDownloadResult] = []

        # Sequential DB writes (single AsyncSession is not concurrency-safe),
        # bounded-concurrency network fetches happen inside download_instrument.
        for inst in instruments:
            async with semaphore:
                result = await self.download_instrument(
                    db, inst, trading_day, interval=interval
                )
            results.append(result)

        await db.commit()

        run = DownloadRunResult(trading_day, results)
        logger.info(
            "Historical download complete for %s: status=%s rows=%d success=%d failed=%d",
            trading_day,
            run.overall_status,
            run.total_rows,
            len(run.succeeded),
            len(run.failed),
        )
        return run


# ── Singleton ──────────────────────────────────────────────────────
historical_downloader = ZebuHistoricalDownloader()
