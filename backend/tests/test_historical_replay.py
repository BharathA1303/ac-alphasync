"""
Tests for HistoricalReplayEngine: session loading, clock advance,
candle-at-or-before lookup, carry-forward (no fabrication) semantics,
and emission into the existing quote pipeline.
"""

from datetime import date, datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest

from core.event_bus import EventType
from core.market_data_mode import MarketDataMode, market_data_mode
from engines.market_session import IST
from models.market_data import (
    SIM_ENDED,
    SIM_PAUSED,
    SIM_RUNNING,
    HistoricalCandle,
    Instrument,
    SimulationSession,
)
from services.historical_replay import (
    HistoricalReplayEngine,
    ReplayInstrument,
    REPLAY_SOURCE,
)

SIM_DATE = date(2026, 8, 20)


def _epoch(hh: int, mm: int, day: date = SIM_DATE) -> int:
    return int(datetime(day.year, day.month, day.day, hh, mm, tzinfo=IST).timestamp())


async def _make_instrument(db, tsym, itype, token, exchange="NSE", **kw):
    inst = Instrument(
        token=token,
        trading_symbol=tsym,
        exchange=exchange,
        instrument_type=itype,
        underlying=kw.get("underlying"),
        expiry_date=kw.get("expiry_date"),
        strike_price=kw.get("strike_price"),
        option_type=kw.get("option_type"),
        lot_size=kw.get("lot_size", 1),
    )
    db.add(inst)
    await db.flush()
    return inst


async def _add_candles(db, instrument, specs, day=SIM_DATE):
    """specs: list of (hh, mm, close) or (hh, mm, close, oi)."""
    for spec in specs:
        hh, mm, close = spec[0], spec[1], spec[2]
        oi = spec[3] if len(spec) > 3 else None
        db.add(
            HistoricalCandle(
                instrument_id=instrument.id,
                trading_date=day,
                timestamp=datetime.fromtimestamp(_epoch(hh, mm, day), tz=timezone.utc),
                open=close,
                high=close + 2,
                low=close - 2,
                close=close,
                volume=10,
                open_interest=oi,
                source="zebu_tp_series",
            )
        )
    await db.flush()


# ── Candle lookup (pure logic) ─────────────────────────────────────


class TestCandleLookup:
    def _track(self):
        return ReplayInstrument(
            instrument_id="x",
            trading_symbol="T",
            exchange="NSE",
            instrument_type="EQUITY",
            canonical_symbol="T",
            candles=[
                {"epoch": _epoch(9, 15), "open": 100, "high": 101, "low": 99, "close": 100, "volume": 1, "open_interest": None},
                {"epoch": _epoch(9, 16), "open": 101, "high": 102, "low": 100, "close": 101, "volume": 1, "open_interest": None},
                {"epoch": _epoch(9, 20), "open": 105, "high": 106, "low": 104, "close": 105, "volume": 1, "open_interest": None},
            ],
        )

    def test_before_first_candle_returns_none(self):
        assert HistoricalReplayEngine.candle_at_or_before(self._track(), _epoch(9, 0)) is None

    def test_exact_boundary_returns_that_candle(self):
        got = HistoricalReplayEngine.candle_at_or_before(self._track(), _epoch(9, 16))
        assert got["close"] == 101

    def test_between_candles_holds_previous(self):
        """The gap at 9:17-9:19 must hold 9:16's close, not interpolate."""
        got = HistoricalReplayEngine.candle_at_or_before(self._track(), _epoch(9, 18))
        assert got["close"] == 101

    def test_after_last_candle_holds_last(self):
        got = HistoricalReplayEngine.candle_at_or_before(self._track(), _epoch(15, 0))
        assert got["close"] == 105


# ── Session loading ────────────────────────────────────────────────


@pytest.mark.asyncio
class TestSessionLoading:
    async def test_load_session_builds_tracks_and_clock(self, db):
        engine = HistoricalReplayEngine()
        inst = await _make_instrument(db, "LOADCO", "EQUITY", "7001")
        await _add_candles(db, inst, [(9, 15, 100.0), (9, 16, 101.0)])

        session = await engine.load_session(db, SIM_DATE)

        assert isinstance(session, SimulationSession)
        assert engine.simulation_date == SIM_DATE
        # Clock starts at the 09:15 IST session open.
        assert int(engine.get_simulation_time().timestamp()) == _epoch(9, 15)
        stats = engine.get_stats()
        assert stats["instruments"] == 1
        engine.reset()

    async def test_load_session_only_loads_requested_date(self, db):
        engine = HistoricalReplayEngine()
        inst = await _make_instrument(db, "DATECO", "EQUITY", "7002")
        await _add_candles(db, inst, [(9, 15, 100.0)], day=SIM_DATE)
        await _add_candles(db, inst, [(9, 15, 200.0)], day=date(2026, 8, 19))

        await engine.load_session(db, SIM_DATE)
        assert engine.get_stats()["instruments"] == 1
        engine.reset()

    async def test_speed_defaults_to_one_and_is_settable(self, db):
        engine = HistoricalReplayEngine()
        inst = await _make_instrument(db, "SPEEDCO", "EQUITY", "7003")
        await _add_candles(db, inst, [(9, 15, 100.0)])
        await engine.load_session(db, SIM_DATE)
        assert engine.get_stats()["speed"] == 1.0

        assert engine.set_speed(5) == 5.0
        assert engine.get_stats()["speed"] == 5.0
        with pytest.raises(ValueError):
            engine.set_speed(0)
        engine.reset()


# ── Emission into the existing pipeline ────────────────────────────


@pytest.mark.asyncio
class TestReplayEmission:
    async def test_equity_replay_calls_quote_coordinator_with_replay_source(self, db):
        engine = HistoricalReplayEngine()
        inst = await _make_instrument(db, "EMITCO", "EQUITY", "7101")
        await _add_candles(db, inst, [(9, 15, 100.0), (9, 16, 105.0)])
        await engine.load_session(db, SIM_DATE)

        with patch(
            "market.quote_coordinator.quote_coordinator.ingest_equity_quote",
            new=AsyncMock(return_value=True),
        ) as ingest:
            await engine.advance_to(_epoch(9, 16))

        assert ingest.await_count >= 1
        _args, kwargs = ingest.await_args
        assert kwargs["source"] == REPLAY_SOURCE
        quote = ingest.await_args[0][1]
        assert quote["price"] == 105.0
        assert quote["source"] == REPLAY_SOURCE
        engine.reset()

    async def test_futures_replay_emits_futures_quote_event(self, db):
        engine = HistoricalReplayEngine()
        inst = await _make_instrument(
            db, "NIFTY28AUG26F", "FUTURES", "7201", exchange="NFO", underlying="NIFTY"
        )
        await _add_candles(db, inst, [(9, 15, 24000.0, 500), (9, 16, 24050.0, 520)])
        await engine.load_session(db, SIM_DATE)

        with patch("services.historical_replay.event_bus.emit", new=AsyncMock()) as emit:
            await engine.advance_to(_epoch(9, 16))

        assert emit.await_count >= 1
        event = emit.await_args[0][0]
        assert event.type == EventType.FUTURES_QUOTE
        quote = event.data["quote"]
        # Field set must match the live zebu_provider FUTURES_QUOTE shape.
        for key in (
            "contract_symbol", "exchange", "token", "ltp", "bid", "ask", "spread",
            "volume", "oi", "open", "high", "low", "close", "change",
            "percent_change", "avg_price", "bid_qty", "ask_qty", "timestamp",
            "last_trade_time", "source",
        ):
            assert key in quote, f"missing FUTURES_QUOTE field: {key}"
        assert quote["ltp"] == 24050.0
        assert quote["oi"] == 520
        assert quote["source"] == REPLAY_SOURCE
        engine.reset()

    async def test_options_replay_populates_state_without_events(self, db):
        """Options have no live tick pipeline — state is held in memory."""
        engine = HistoricalReplayEngine()
        inst = await _make_instrument(
            db, "NIFTY28AUG2624000CE", "OPTIONS", "7301",
            exchange="NFO", underlying="NIFTY",
            strike_price=24000, option_type="CE",
        )
        await _add_candles(db, inst, [(9, 15, 120.0, 300)])
        await engine.load_session(db, SIM_DATE)

        with patch("services.historical_replay.event_bus.emit", new=AsyncMock()) as emit:
            await engine.advance_to(_epoch(9, 15))

        assert emit.await_count == 0
        quote = engine.get_current_quote("NIFTY28AUG2624000CE")
        assert quote is not None
        assert quote["lp"] == 120.0
        assert quote["stat"] == "Ok"
        engine.reset()

    async def test_get_current_quote_resolves_by_symbol_key_and_token(self, db):
        engine = HistoricalReplayEngine()
        inst = await _make_instrument(
            db, "LOOKUPCE", "OPTIONS", "7401", exchange="NFO", option_type="CE"
        )
        await _add_candles(db, inst, [(9, 15, 55.0)])
        await engine.load_session(db, SIM_DATE)
        await engine.advance_to(_epoch(9, 15))

        assert engine.get_current_quote("LOOKUPCE")["lp"] == 55.0
        assert engine.get_current_quote("NFO:LOOKUPCE")["lp"] == 55.0
        assert engine.get_current_quote("7401")["lp"] == 55.0
        assert engine.get_current_quote("UNKNOWN") is None
        engine.reset()


# ── Carry-forward / no fabrication ─────────────────────────────────


@pytest.mark.asyncio
class TestCarryForwardSemantics:
    async def test_no_new_candle_means_no_new_emission(self, db):
        """Between candle boundaries the engine must hold, not re-emit invented ticks."""
        engine = HistoricalReplayEngine()
        inst = await _make_instrument(db, "HOLDCO", "EQUITY", "7501")
        await _add_candles(db, inst, [(9, 15, 100.0), (9, 20, 110.0)])
        await engine.load_session(db, SIM_DATE)

        with patch(
            "market.quote_coordinator.quote_coordinator.ingest_equity_quote",
            new=AsyncMock(return_value=True),
        ) as ingest:
            assert await engine.advance_to(_epoch(9, 15)) == 1
            # 9:16-9:19 have no candles — nothing should advance.
            assert await engine.advance_to(_epoch(9, 16)) == 0
            assert await engine.advance_to(_epoch(9, 18)) == 0
            assert await engine.advance_to(_epoch(9, 20)) == 1

        assert ingest.await_count == 2
        engine.reset()

    async def test_state_persists_across_gap_at_last_close(self, db):
        engine = HistoricalReplayEngine()
        inst = await _make_instrument(db, "GAPCO", "OPTIONS", "7601", exchange="NFO")
        await _add_candles(db, inst, [(9, 15, 42.0)])
        await engine.load_session(db, SIM_DATE)
        await engine.advance_to(_epoch(9, 15))
        await engine.advance_to(_epoch(11, 0))

        # Value is unchanged, not zero-filled or drifted.
        assert engine.get_current_quote("GAPCO")["lp"] == 42.0
        engine.reset()

    async def test_instrument_with_no_candles_yields_no_state(self, db):
        engine = HistoricalReplayEngine()
        traded = await _make_instrument(db, "TRADEDCO", "EQUITY", "7701")
        await _make_instrument(db, "UNTRADEDCO", "EQUITY", "7702")
        await _add_candles(db, traded, [(9, 15, 100.0)])
        await engine.load_session(db, SIM_DATE)

        with patch(
            "market.quote_coordinator.quote_coordinator.ingest_equity_quote",
            new=AsyncMock(return_value=True),
        ):
            await engine.advance_to(_epoch(15, 30))

        assert engine.get_current_quote("UNTRADEDCO") is None
        engine.reset()

    async def test_running_day_aggregates_are_correct(self, db):
        """
        Day high/low must be the running session extremes and volume must be
        cumulative — matching how live cumulative-volume ticks behave.
        """
        engine = HistoricalReplayEngine()
        inst = await _make_instrument(db, "AGGCO", "EQUITY", "7810")
        # (hh, mm, o, h, l, c, v) written directly for precise control.
        for k, (o, h, l, c, v) in enumerate(
            [(100, 102, 99, 101, 10), (101, 103, 95, 96, 20), (96, 120, 96, 118, 30)]
        ):
            db.add(
                HistoricalCandle(
                    instrument_id=inst.id,
                    trading_date=SIM_DATE,
                    timestamp=datetime.fromtimestamp(_epoch(9, 15 + k), tz=timezone.utc),
                    open=o, high=h, low=l, close=c, volume=v,
                    source="zebu_tp_series",
                )
            )
        await db.flush()
        await engine.load_session(db, SIM_DATE)

        seen = []

        async def _capture(symbol, quote, **kwargs):
            seen.append(quote)
            return True

        with patch(
            "market.quote_coordinator.quote_coordinator.ingest_equity_quote",
            new=AsyncMock(side_effect=_capture),
        ):
            for k in range(3):
                await engine.advance_to(_epoch(9, 15 + k))

        assert [q["price"] for q in seen] == [101.0, 96.0, 118.0]
        # Running extremes, not per-bar values.
        assert [q["high"] for q in seen] == [102.0, 103.0, 120.0]
        assert [q["low"] for q in seen] == [99.0, 95.0, 95.0]
        # Cumulative session volume.
        assert [q["volume"] for q in seen] == [10, 30, 60]
        # Day open is stable; change is measured from it.
        assert all(q["open"] == 100.0 for q in seen)
        assert [q["change"] for q in seen] == [1.0, -4.0, 18.0]
        engine.reset()

    async def test_ohlc_values_come_verbatim_from_stored_candles(self, db):
        engine = HistoricalReplayEngine()
        inst = await _make_instrument(db, "VERBATIMCO", "FUTURES", "7801", exchange="NFO")
        await _add_candles(db, inst, [(9, 15, 24000.0, 111)])
        await engine.load_session(db, SIM_DATE)

        with patch("services.historical_replay.event_bus.emit", new=AsyncMock()):
            await engine.advance_to(_epoch(9, 15))

        q = engine.get_current_quote("VERBATIMCO")
        assert q["ltp"] == 24000.0
        assert q["high"] == 24002.0   # stored high
        assert q["low"] == 23998.0    # stored low
        assert q["oi"] == 111
        engine.reset()


# ── Lifecycle ──────────────────────────────────────────────────────


@pytest.mark.asyncio
class TestReplayLifecycle:
    async def test_start_pause_resume_stop_updates_session_row(self, db):
        engine = HistoricalReplayEngine()
        inst = await _make_instrument(db, "LIFECO", "EQUITY", "7901")
        await _add_candles(db, inst, [(9, 15, 100.0)])
        session = await engine.load_session(db, SIM_DATE)

        await engine.start(db)
        assert engine.is_running
        assert session.status == SIM_RUNNING
        assert session.started_at is not None

        await engine.pause(db)
        assert session.status == SIM_PAUSED
        assert not engine.is_running

        await engine.resume(db)
        assert session.status == SIM_RUNNING

        await engine.stop(db)
        assert session.status == SIM_ENDED
        assert session.ended_at is not None
        engine.reset()

    async def test_start_without_loaded_session_raises(self):
        engine = HistoricalReplayEngine()
        with pytest.raises(RuntimeError):
            await engine.start()

    async def test_session_end_epoch_is_1530_ist(self, db):
        engine = HistoricalReplayEngine()
        inst = await _make_instrument(db, "ENDCO", "EQUITY", "7902")
        await _add_candles(db, inst, [(9, 15, 100.0)])
        await engine.load_session(db, SIM_DATE)
        assert engine.session_end_epoch() == _epoch(15, 30)
        engine.reset()
