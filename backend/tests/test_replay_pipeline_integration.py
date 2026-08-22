"""
End-to-end integration checks: replayed quotes must flow through the SAME
pipeline live ticks use, so order fills, portfolio P&L, and the websocket
layer keep working with no changes of their own.
"""

from datetime import date, datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest

from core.market_data_mode import MarketDataMode, market_data_mode
from engines.market_session import IST
from models.market_data import HistoricalCandle, Instrument
from services.historical_replay import HistoricalReplayEngine, REPLAY_SOURCE

SIM_DATE = date(2026, 8, 20)


def _epoch(hh, mm):
    return int(datetime(2026, 8, 20, hh, mm, tzinfo=IST).timestamp())


async def _seed(db, tsym, itype, token, exchange, closes):
    inst = Instrument(
        token=token,
        trading_symbol=tsym,
        exchange=exchange,
        instrument_type=itype,
    )
    db.add(inst)
    await db.flush()
    for i, close in enumerate(closes):
        db.add(
            HistoricalCandle(
                instrument_id=inst.id,
                trading_date=SIM_DATE,
                timestamp=datetime.fromtimestamp(_epoch(9, 15 + i), tz=timezone.utc),
                open=close,
                high=close + 1,
                low=close - 1,
                close=close,
                volume=100,
                source="zebu_tp_series",
            )
        )
    await db.flush()
    return inst


@pytest.fixture(autouse=True)
def _live_mode():
    market_data_mode.reset()
    yield
    market_data_mode.reset()


@pytest.mark.asyncio
class TestReplayQuoteFreshness:
    async def test_replay_quote_is_not_treated_as_stale(self, db):
        """
        The replay quote's `timestamp` must be wall-clock publish time.

        market_data._is_quote_stale rejects quotes older than 120s. If replay
        stamped the historical simulation date here, every replayed quote
        would be discarded by get_quote_safe and order fills would silently
        stop working.
        """
        from services.market_data import _is_quote_stale

        engine = HistoricalReplayEngine()
        await _seed(db, "FRESHCO", "EQUITY", "5001", "NSE", [100.0])
        await engine.load_session(db, SIM_DATE)

        with patch(
            "market.quote_coordinator.quote_coordinator.ingest_equity_quote",
            new=AsyncMock(return_value=True),
        ) as ingest:
            await engine.advance_to(_epoch(9, 15))

        quote = ingest.await_args[0][1]
        assert not _is_quote_stale(quote), "replayed quote must not read as stale"
        engine.reset()

    async def test_simulated_time_is_still_available_on_the_quote(self, db):
        """Wall-clock timestamp must not lose the simulated instant."""
        engine = HistoricalReplayEngine()
        await _seed(db, "SIMTIMECO", "EQUITY", "5002", "NSE", [100.0])
        await engine.load_session(db, SIM_DATE)

        with patch(
            "market.quote_coordinator.quote_coordinator.ingest_equity_quote",
            new=AsyncMock(return_value=True),
        ) as ingest:
            await engine.advance_to(_epoch(9, 15))

        quote = ingest.await_args[0][1]
        assert quote["simulated_timestamp"].startswith("2026-08-20")
        assert quote["source"] == REPLAY_SOURCE
        engine.reset()

    async def test_futures_replay_quote_also_fresh(self, db):
        from services.market_data import _is_quote_stale

        engine = HistoricalReplayEngine()
        await _seed(db, "NIFTYFUT", "FUTURES", "5003", "NFO", [24000.0])
        await engine.load_session(db, SIM_DATE)

        with patch("services.historical_replay.event_bus.emit", new=AsyncMock()) as emit:
            await engine.advance_to(_epoch(9, 15))

        quote = emit.await_args[0][0].data["quote"]
        quote_for_check = {**quote, "price": quote["ltp"]}
        assert not _is_quote_stale(quote_for_check)
        engine.reset()


@pytest.mark.asyncio
class TestPipelineReuse:
    async def test_replay_uses_the_single_existing_quote_coordinator(self, db):
        """No second ingestion path — replay calls the same singleton."""
        import inspect

        import services.historical_replay as hr
        from market.quote_coordinator import QuoteCoordinator
        from market.quote_coordinator import quote_coordinator as singleton

        source = inspect.getsource(hr.HistoricalReplayEngine._emit_for_track)
        assert "from market.quote_coordinator import quote_coordinator" in source
        assert "quote_coordinator.ingest_equity_quote(" in source
        # Replay must not construct its own coordinator.
        assert "QuoteCoordinator()" not in inspect.getsource(hr)
        assert isinstance(singleton, QuoteCoordinator)

    async def test_replay_emits_on_the_single_existing_event_bus(self):
        """No second EventBus — replay imports the shared singleton."""
        import core.event_bus as eb
        import services.historical_replay as hr

        assert hr.event_bus is eb.event_bus

    async def test_replay_defines_no_new_event_types(self):
        """Futures replay reuses EventType.FUTURES_QUOTE, adds nothing."""
        import inspect

        import services.historical_replay as hr

        source = inspect.getsource(hr)
        assert "EventType.FUTURES_QUOTE" in source
        assert "class EventType" not in source

    async def test_replay_does_not_write_redis_directly(self, db):
        """
        Redis writes must go through quote_coordinator, exactly as live ticks
        do — replay must not open a second market-data Redis path.
        """
        import inspect

        import services.historical_replay as hr

        source = inspect.getsource(hr)
        for forbidden in ("set_price", "get_redis", "redis_client"):
            assert forbidden not in source, (
                f"replay must not touch Redis directly ({forbidden})"
            )

    async def test_websocket_manager_untouched_by_this_feature(self):
        """
        The websocket layer already subscribes to PRICE_UPDATED and
        FUTURES_QUOTE; publishing correct event types is sufficient.
        """
        import inspect

        import websocket.manager as wm

        source = inspect.getsource(wm)
        assert "historical_replay" not in source
        assert "market_data_mode" not in source
