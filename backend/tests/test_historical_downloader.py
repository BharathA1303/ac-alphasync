"""
Tests for the historical market data layer: models, trading-day logic,
candle validation, idempotent persistence, and per-instrument failure
isolation in ZebuHistoricalDownloader.

The Zebu HTTP layer is mocked throughout — no network access required.
"""

import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy import select

from engines.market_session import IST
from models.market_data import (
    DOWNLOAD_FAILED,
    DOWNLOAD_PARTIAL,
    DOWNLOAD_SUCCESS,
    DownloadStatus,
    HistoricalCandle,
    Instrument,
)
from services.historical_downloader import (
    ZebuHistoricalDownloader,
    is_trading_day,
    latest_complete_trading_day,
)
from services.simulation_universe import UniverseInstrument


# ── Helpers ────────────────────────────────────────────────────────

TRADING_DAY = date(2026, 8, 20)  # a Thursday, not an NSE 2026 holiday


def _epoch(day: date, hh: int, mm: int) -> int:
    return int(datetime(day.year, day.month, day.day, hh, mm, tzinfo=IST).timestamp())


def _candle(day: date, hh: int, mm: int, close: float, **kw) -> dict:
    return {
        "time": _epoch(day, hh, mm),
        "open": kw.get("open", close),
        "high": kw.get("high", close + 1),
        "low": kw.get("low", close - 1),
        "close": close,
        "volume": kw.get("volume", 100),
        **{k: v for k, v in kw.items() if k == "oi"},
    }


def _equity(symbol="RELIANCE", token="2885") -> UniverseInstrument:
    return UniverseInstrument(
        token=token,
        trading_symbol=symbol,
        exchange="NSE",
        instrument_type="EQUITY",
        underlying=symbol,
        canonical_symbol=symbol,
    )


class _FakeProvider:
    """Stands in for an authenticated ZebuProvider's historical methods."""

    def __init__(self, candles_by_token=None, fail_tokens=()):
        self.candles_by_token = candles_by_token or {}
        self.fail_tokens = set(fail_tokens)
        self.tp_calls = []
        self.eod_calls = []

    async def _fetch_tp_series(self, exchange, token, st_epoch, et_epoch, interval):
        self.tp_calls.append((exchange, token, st_epoch, et_epoch, interval))
        if token in self.fail_tokens:
            raise RuntimeError(f"Zebu TPSeries unavailable for {token}")
        return list(self.candles_by_token.get(token, []))

    async def _fetch_eod_data(self, exchange, trading_symbol, st_epoch, et_epoch):
        self.eod_calls.append((exchange, trading_symbol, st_epoch, et_epoch))
        if trading_symbol in self.fail_tokens:
            raise RuntimeError(f"Zebu EOD unavailable for {trading_symbol}")
        return list(self.candles_by_token.get(trading_symbol, []))


# ── Trading day logic ──────────────────────────────────────────────


class TestTradingDayLogic:
    def test_weekend_is_not_a_trading_day(self):
        assert is_trading_day(date(2026, 8, 22)) is False  # Saturday
        assert is_trading_day(date(2026, 8, 23)) is False  # Sunday

    def test_nse_holiday_is_not_a_trading_day(self):
        # Republic Day 2026 (Monday) is in NSE_HOLIDAYS_2026.
        assert is_trading_day(date(2026, 1, 26)) is False

    def test_regular_weekday_is_a_trading_day(self):
        assert is_trading_day(TRADING_DAY) is True

    def test_latest_complete_day_excludes_today_before_close(self):
        now = datetime(2026, 8, 20, 11, 0, tzinfo=IST)  # mid-session Thursday
        assert latest_complete_trading_day(now) == date(2026, 8, 19)

    def test_latest_complete_day_includes_today_after_close(self):
        now = datetime(2026, 8, 20, 16, 0, tzinfo=IST)
        assert latest_complete_trading_day(now) == date(2026, 8, 20)

    def test_latest_complete_day_skips_back_over_weekend(self):
        now = datetime(2026, 8, 23, 10, 0, tzinfo=IST)  # Sunday
        assert latest_complete_trading_day(now) == date(2026, 8, 21)  # Friday


# ── Candle validation ──────────────────────────────────────────────


class TestCandleValidation:
    def test_valid_candles_pass_through_sorted(self):
        raw = [
            _candle(TRADING_DAY, 10, 0, 105.0),
            _candle(TRADING_DAY, 9, 30, 100.0),
        ]
        out = ZebuHistoricalDownloader.validate_candles(raw, TRADING_DAY)
        assert [c["close"] for c in out] == [100.0, 105.0]

    def test_missing_ohlc_component_is_rejected_not_zero_filled(self):
        bad = _candle(TRADING_DAY, 10, 0, 105.0)
        del bad["high"]
        out = ZebuHistoricalDownloader.validate_candles([bad], TRADING_DAY)
        assert out == []

    def test_none_and_nonpositive_prices_rejected(self):
        none_close = _candle(TRADING_DAY, 10, 0, 105.0)
        none_close["close"] = None
        zero_open = _candle(TRADING_DAY, 10, 1, 105.0)
        zero_open["open"] = 0
        out = ZebuHistoricalDownloader.validate_candles(
            [none_close, zero_open], TRADING_DAY
        )
        assert out == []

    def test_bars_outside_session_window_dropped(self):
        raw = [
            _candle(TRADING_DAY, 8, 0, 100.0),   # pre-market
            _candle(TRADING_DAY, 12, 0, 110.0),  # in session
            _candle(TRADING_DAY, 17, 0, 120.0),  # post close
        ]
        out = ZebuHistoricalDownloader.validate_candles(raw, TRADING_DAY)
        assert [c["close"] for c in out] == [110.0]

    def test_duplicate_timestamps_collapse(self):
        raw = [
            _candle(TRADING_DAY, 10, 0, 100.0),
            _candle(TRADING_DAY, 10, 0, 101.0),
        ]
        out = ZebuHistoricalDownloader.validate_candles(raw, TRADING_DAY)
        assert len(out) == 1
        assert out[0]["close"] == 101.0

    def test_open_interest_preserved_and_absent_stays_none(self):
        with_oi = _candle(TRADING_DAY, 10, 0, 100.0, oi="4500")
        without_oi = _candle(TRADING_DAY, 10, 1, 100.0)
        out = ZebuHistoricalDownloader.validate_candles(
            [with_oi, without_oi], TRADING_DAY
        )
        assert out[0]["open_interest"] == 4500
        assert out[1]["open_interest"] is None


# ── Persistence + idempotency ──────────────────────────────────────


@pytest.mark.asyncio
class TestDownloaderPersistence:
    async def test_instrument_upsert_is_idempotent(self, db):
        dl = ZebuHistoricalDownloader(provider=_FakeProvider())
        inst = _equity("UPSERTCO", "9001")

        first = await dl.upsert_instrument(db, inst)
        second = await dl.upsert_instrument(db, inst)

        assert first.id == second.id
        rows = (
            await db.execute(
                select(Instrument).where(Instrument.trading_symbol == "UPSERTCO")
            )
        ).scalars().all()
        assert len(rows) == 1

    async def test_download_persists_candles_and_success_status(self, db):
        inst = _equity("PERSISTCO", "9002")
        provider = _FakeProvider(
            {"9002": [_candle(TRADING_DAY, 9, 30, 100.0), _candle(TRADING_DAY, 9, 31, 101.0)]}
        )
        dl = ZebuHistoricalDownloader(provider=provider)

        result = await dl.download_instrument(db, inst, TRADING_DAY)

        assert result.status == DOWNLOAD_SUCCESS
        assert result.rows == 2

        candles = (
            await db.execute(
                select(HistoricalCandle)
                .join(Instrument)
                .where(Instrument.trading_symbol == "PERSISTCO")
            )
        ).scalars().all()
        assert len(candles) == 2
        assert sorted(float(c.close) for c in candles) == [100.0, 101.0]

        status = (
            await db.execute(
                select(DownloadStatus).where(DownloadStatus.trading_date == TRADING_DAY)
            )
        ).scalars().all()
        assert any(s.status == DOWNLOAD_SUCCESS and s.rows == 2 for s in status)

    async def test_rerunning_download_does_not_duplicate_rows(self, db):
        """Idempotency: the same day downloaded twice yields the same row count."""
        inst = _equity("IDEMPOTENTCO", "9003")
        candles = [
            _candle(TRADING_DAY, 9, 30, 100.0),
            _candle(TRADING_DAY, 9, 31, 101.0),
            _candle(TRADING_DAY, 9, 32, 102.0),
        ]
        dl = ZebuHistoricalDownloader(provider=_FakeProvider({"9003": candles}))

        await dl.download_instrument(db, inst, TRADING_DAY)
        first_count = len(
            (
                await db.execute(
                    select(HistoricalCandle)
                    .join(Instrument)
                    .where(Instrument.trading_symbol == "IDEMPOTENTCO")
                )
            ).scalars().all()
        )

        await dl.download_instrument(db, inst, TRADING_DAY)
        second = (
            await db.execute(
                select(HistoricalCandle)
                .join(Instrument)
                .where(Instrument.trading_symbol == "IDEMPOTENTCO")
            )
        ).scalars().all()

        assert first_count == 3
        assert len(second) == 3

    async def test_rerun_updates_revised_candle_values(self, db):
        inst = _equity("REVISECO", "9004")
        original = [_candle(TRADING_DAY, 9, 30, 100.0)]
        revised = [_candle(TRADING_DAY, 9, 30, 111.0)]

        dl = ZebuHistoricalDownloader(provider=_FakeProvider({"9004": original}))
        await dl.download_instrument(db, inst, TRADING_DAY)

        dl2 = ZebuHistoricalDownloader(provider=_FakeProvider({"9004": revised}))
        await dl2.download_instrument(db, inst, TRADING_DAY)

        rows = (
            await db.execute(
                select(HistoricalCandle)
                .join(Instrument)
                .where(Instrument.trading_symbol == "REVISECO")
            )
        ).scalars().all()
        assert len(rows) == 1
        assert float(rows[0].close) == 111.0


# ── Failure isolation ──────────────────────────────────────────────


@pytest.mark.asyncio
class TestDownloaderFailureIsolation:
    async def test_one_instrument_failure_does_not_block_others(self, db):
        good_a = _equity("GOODA", "8001")
        bad = _equity("BADCO", "8002")
        good_b = _equity("GOODB", "8003")

        provider = _FakeProvider(
            candles_by_token={
                "8001": [_candle(TRADING_DAY, 9, 30, 100.0)],
                "8003": [_candle(TRADING_DAY, 9, 30, 300.0)],
            },
            fail_tokens={"8002"},
        )
        dl = ZebuHistoricalDownloader(provider=provider)

        run = await dl.download_day(
            db, TRADING_DAY, instruments=[good_a, bad, good_b], commit=False
        )

        by_key = {r.key: r for r in run.results}
        assert by_key["NSE:GOODA"].status == DOWNLOAD_SUCCESS
        assert by_key["NSE:GOODB"].status == DOWNLOAD_SUCCESS
        assert by_key["NSE:BADCO"].status == DOWNLOAD_FAILED
        assert "unavailable" in (by_key["NSE:BADCO"].error or "")

        # The run is PARTIAL, not FAILED — good data still landed.
        assert run.overall_status == DOWNLOAD_PARTIAL

        # Both good instruments actually persisted candles.
        for symbol in ("GOODA", "GOODB"):
            rows = (
                await db.execute(
                    select(HistoricalCandle)
                    .join(Instrument)
                    .where(Instrument.trading_symbol == symbol)
                )
            ).scalars().all()
            assert len(rows) == 1, f"{symbol} should have persisted despite BADCO failing"

    async def test_per_instrument_download_status_reflects_outcome(self, db):
        good = _equity("STATUSGOOD", "8101")
        bad = _equity("STATUSBAD", "8102")
        provider = _FakeProvider(
            candles_by_token={"8101": [_candle(TRADING_DAY, 9, 30, 100.0)]},
            fail_tokens={"8102"},
        )
        dl = ZebuHistoricalDownloader(provider=provider)

        await dl.download_day(db, TRADING_DAY, instruments=[good, bad], commit=False)

        rows = (
            await db.execute(
                select(DownloadStatus, Instrument)
                .join(Instrument, DownloadStatus.instrument_id == Instrument.id)
                .where(DownloadStatus.trading_date == TRADING_DAY)
            )
        ).all()
        by_symbol = {inst.trading_symbol: status for status, inst in rows}

        assert by_symbol["STATUSGOOD"].status == DOWNLOAD_SUCCESS
        assert by_symbol["STATUSGOOD"].rows == 1
        assert by_symbol["STATUSBAD"].status == DOWNLOAD_FAILED
        assert by_symbol["STATUSBAD"].error

    async def test_empty_candle_response_records_partial(self, db):
        inst = _equity("EMPTYCO", "8201")
        dl = ZebuHistoricalDownloader(provider=_FakeProvider({"8201": []}))

        result = await dl.download_instrument(db, inst, TRADING_DAY)
        assert result.status == DOWNLOAD_PARTIAL
        assert result.rows == 0

    async def test_non_trading_day_is_skipped(self, db):
        dl = ZebuHistoricalDownloader(provider=_FakeProvider())
        run = await dl.download_day(db, date(2026, 8, 22), instruments=[_equity()], commit=False)
        assert run.results == []

    async def test_missing_provider_records_failure_not_crash(self, db):
        dl = ZebuHistoricalDownloader(provider=None)
        # No broker session configured in tests -> get_any_session returns None.
        result = await dl.download_instrument(db, _equity("NOPROV", "8301"), TRADING_DAY)
        assert result.status == DOWNLOAD_FAILED
