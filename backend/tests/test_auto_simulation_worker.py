"""
AutoSimulationWorker — the component that makes historical replay the
automatic, only market data source.

The worker opens its own DB sessions via async_session_factory (it has no
caller to hand it one), so these tests patch that factory in the worker
module to point at a real file-backed SQLite DB, and patch
market_session.get_current_state to drive the state machine deterministically
instead of waiting for 09:15 IST.

Invariants under test:
    - OPEN starts a replay of latest_complete_trading_day().
    - Non-OPEN states halt the replay clock.
    - Every transition is idempotent — a second identical poll is a no-op.
    - A day with no downloaded candles is a logged skip, never a crash.
    - MarketDataMode is NEVER returned to LIVE by this worker, in any state.
      There is no live data source any more; flipping to LIVE would re-open
      zebu_provider's tick path after hours.
"""

from datetime import date, datetime, timezone
from unittest.mock import patch

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from core.market_data_mode import MarketDataMode, market_data_mode
from database.connection import Base
from engines.market_session import IST, MarketState
from models.market_data import HistoricalCandle, Instrument
from services.historical_replay import historical_replay_engine
from workers.auto_simulation_worker import AutoSimulationWorker

SIM_DATE = date(2026, 8, 20)

NON_OPEN_STATES = [
    MarketState.PRE_MARKET,
    MarketState.CLOSING,
    MarketState.AFTER_MARKET,
    MarketState.CLOSED,
    MarketState.WEEKEND,
    MarketState.HOLIDAY,
]


def _epoch(hh, mm, on: date = SIM_DATE):
    """Epoch seconds for an IST wall-clock time on a given trading date."""
    return int(
        datetime(on.year, on.month, on.day, hh, mm, tzinfo=IST).timestamp()
    )


@pytest_asyncio.fixture
async def session_factory(tmp_path):
    """A real file-backed DB the worker can open its own sessions against."""
    db_path = tmp_path / "auto_sim.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        yield factory
    finally:
        await engine.dispose()


@pytest.fixture(autouse=True)
def _clean_state():
    market_data_mode.reset()
    historical_replay_engine.reset()
    yield
    market_data_mode.reset()
    historical_replay_engine.reset()


async def seed(factory, trading_date=SIM_DATE):
    """Store one instrument's candles for `trading_date`, reusing the
    instrument row if a previous seed already created it."""
    from sqlalchemy import select

    async with factory() as db:
        inst = (
            await db.execute(
                select(Instrument).where(Instrument.trading_symbol == "AUTOCO")
            )
        ).scalar_one_or_none()
        if inst is None:
            inst = Instrument(
                token="7001",
                trading_symbol="AUTOCO",
                exchange="NSE",
                instrument_type="EQUITY",
            )
            db.add(inst)
            await db.flush()
        for i, close in enumerate((100.0, 101.0, 102.0)):
            db.add(
                HistoricalCandle(
                    instrument_id=inst.id,
                    trading_date=trading_date,
                    timestamp=datetime.fromtimestamp(
                        _epoch(9, 15 + i, on=trading_date), tz=timezone.utc
                    ),
                    open=close,
                    high=close,
                    low=close,
                    close=close,
                    volume=10,
                    source="zebu_tp_series",
                )
            )
        await db.commit()


def _worker(factory, state, target=SIM_DATE):
    """A worker wired to a fixed market state and a fixed replay target."""
    worker = AutoSimulationWorker()
    patches = [
        patch(
            "workers.auto_simulation_worker.async_session_factory",
            factory,
        ),
        patch(
            "workers.auto_simulation_worker.market_session.get_current_state",
            return_value=state,
        ),
        patch(
            "workers.auto_simulation_worker.latest_complete_trading_day",
            return_value=target,
        ),
    ]
    return worker, patches


class _Ctx:
    """Apply a list of patches as one context manager."""

    def __init__(self, patches):
        self._patches = patches

    def __enter__(self):
        for p in self._patches:
            p.start()
        return self

    def __exit__(self, *exc):
        for p in reversed(self._patches):
            p.stop()
        return False


@pytest.mark.asyncio
class TestOpenStartsReplay:
    async def test_open_starts_replay_for_latest_complete_trading_day(
        self, session_factory
    ):
        await seed(session_factory)
        worker, patches = _worker(session_factory, MarketState.OPEN)

        with _Ctx(patches):
            result = await worker.check_once()

        assert result == {"state": "open", "action": "start"}
        assert historical_replay_engine.is_running
        assert historical_replay_engine.simulation_date == SIM_DATE
        assert market_data_mode.is_simulation()
        assert worker.get_stats()["starts"] == 1

        await historical_replay_engine.stop()

    async def test_repeated_open_polls_are_idempotent(self, session_factory):
        """The steady state during market hours must not restart anything."""
        await seed(session_factory)
        worker, patches = _worker(session_factory, MarketState.OPEN)

        with _Ctx(patches):
            first = await worker.check_once()
            second = await worker.check_once()
            third = await worker.check_once()

        assert first["action"] == "start"
        assert second["action"] == "noop", "already-running replay must not restart"
        assert third["action"] == "noop"
        assert worker.get_stats()["starts"] == 1, "start must have run exactly once"
        assert historical_replay_engine.is_running

        await historical_replay_engine.stop()

    async def test_missing_candles_are_skipped_not_crashed(self, session_factory):
        """
        The download worker may not have stored the day yet (no overnight
        Zebu session). That is a retry, not a failure.
        """
        # Deliberately seed nothing for the target date.
        worker, patches = _worker(
            session_factory, MarketState.OPEN, target=date(2026, 7, 1)
        )

        with _Ctx(patches):
            result = await worker.check_once()  # must not raise

        assert result["action"] == "noop"
        assert not historical_replay_engine.is_running
        stats = worker.get_stats()
        assert stats["starts"] == 0
        assert "No historical candles" in (stats["last_skip_reason"] or "")
        assert stats["last_error"] is None, "a missing day is not a worker error"

    async def test_stale_replay_date_is_restarted_on_new_target(
        self, session_factory
    ):
        """
        The calendar rolls over: a replay still running yesterday's date is
        stale and must be replaced, not treated as current.
        """
        new_target = date(2026, 8, 21)
        await seed(session_factory, trading_date=SIM_DATE)
        await seed(session_factory, trading_date=new_target)

        worker, patches = _worker(session_factory, MarketState.OPEN, target=SIM_DATE)
        with _Ctx(patches):
            await worker.check_once()
        assert historical_replay_engine.simulation_date == SIM_DATE

        worker2, patches2 = _worker(
            session_factory, MarketState.OPEN, target=new_target
        )
        with _Ctx(patches2):
            result = await worker2.check_once()

        assert result["action"] == "start"
        assert historical_replay_engine.simulation_date == new_target

        await historical_replay_engine.stop()


@pytest.mark.asyncio
class TestNonOpenHaltsReplay:
    @pytest.mark.parametrize("state", NON_OPEN_STATES)
    async def test_non_open_state_halts_running_replay(self, session_factory, state):
        await seed(session_factory)

        worker, patches = _worker(session_factory, MarketState.OPEN)
        with _Ctx(patches):
            await worker.check_once()
        assert historical_replay_engine.is_running

        closer, close_patches = _worker(session_factory, state)
        with _Ctx(close_patches):
            result = await closer.check_once()

        assert result == {"state": state.value, "action": "halt"}
        assert not historical_replay_engine.is_running, (
            "the replay clock must stop advancing outside OPEN"
        )
        assert closer.get_stats()["halts"] == 1

    @pytest.mark.parametrize("state", NON_OPEN_STATES)
    async def test_halt_never_returns_mode_to_live(self, session_factory, state):
        """
        The crux of the "no live data, ever" rule.

        zebu_provider._handle_tick drops websocket ticks ONLY while the mode
        is SIMULATION. If halting flipped back to LIVE, a still-connected
        socket would write real prices into the cache after hours.
        """
        await seed(session_factory)

        worker, patches = _worker(session_factory, MarketState.OPEN)
        with _Ctx(patches):
            await worker.check_once()

        closer, close_patches = _worker(session_factory, state)
        with _Ctx(close_patches):
            await closer.check_once()

        assert market_data_mode.is_simulation(), (
            f"mode must stay SIMULATION while market is {state.value}; "
            "LIVE would re-enable the real Zebu tick path"
        )
        assert not market_data_mode.is_live()

    async def test_halt_preserves_last_replayed_state_for_freezing(
        self, session_factory
    ):
        """
        Freeze = stop the clock and leave everything else alone. The engine
        must still be able to answer with the last replayed quote, which is
        what the existing frozen-quote path serves.
        """
        await seed(session_factory)

        worker, patches = _worker(session_factory, MarketState.OPEN)
        with _Ctx(patches):
            await worker.check_once()

        await historical_replay_engine.advance_to(_epoch(9, 17))
        assert historical_replay_engine.has_state()
        frozen = historical_replay_engine.get_current_quote("NSE:AUTOCO")
        assert frozen is not None

        closer, close_patches = _worker(session_factory, MarketState.CLOSED)
        with _Ctx(close_patches):
            await closer.check_once()

        after = historical_replay_engine.get_current_quote("NSE:AUTOCO")
        assert after is not None, "last replayed state must survive the halt"
        assert after["price"] == frozen["price"], "the frozen price must not change"

    @pytest.mark.parametrize("state", NON_OPEN_STATES)
    async def test_repeated_non_open_polls_are_idempotent(
        self, session_factory, state
    ):
        worker, patches = _worker(session_factory, state)
        with _Ctx(patches):
            first = await worker.check_once()
            second = await worker.check_once()

        assert first["action"] == "noop"
        assert second["action"] == "noop"
        assert worker.get_stats()["halts"] == 0

    async def test_non_open_with_no_replay_still_forces_simulation_mode(
        self, session_factory
    ):
        """
        A freshly booted process starts in LIVE. Even with nothing to halt,
        the worker must claim SIMULATION so live ticks stay blocked while
        waiting for the next open.
        """
        assert market_data_mode.is_live(), "precondition: boot state is LIVE"

        worker, patches = _worker(session_factory, MarketState.CLOSED)
        with _Ctx(patches):
            await worker.check_once()

        assert market_data_mode.is_simulation()


@pytest.mark.asyncio
class TestRestartDuringMarketHours:
    async def test_worker_self_heals_a_paused_session_during_open(
        self, session_factory
    ):
        """
        After a restart, recover_orphaned_sessions leaves the DB session
        PAUSED and holds the mode at SIMULATION (never LIVE — see
        SimulationController.recover_orphaned_sessions' docstring) with no
        engine running. If the market is OPEN, this worker's very next poll
        must get the site replaying again with no operator action.
        """
        from services.simulation_control import SimulationController

        await seed(session_factory)

        # Simulate post-restart reconciliation state.
        ctrl = SimulationController()
        async with session_factory() as db:
            await ctrl.recover_orphaned_sessions(db)
            await db.commit()
        assert market_data_mode.is_simulation()
        assert not historical_replay_engine.is_running

        worker, patches = _worker(session_factory, MarketState.OPEN)
        with _Ctx(patches):
            result = await worker.check_once()

        assert result["action"] == "start"
        assert historical_replay_engine.is_running
        assert market_data_mode.is_simulation()

        await historical_replay_engine.stop()


@pytest.mark.asyncio
class TestWorkerLoopSafety:
    async def test_loop_survives_an_unexpected_error(self, session_factory):
        """An exception in check_once must be logged, not propagated."""
        worker = AutoSimulationWorker()

        with patch.object(
            worker, "check_once", side_effect=ValueError("boom")
        ), patch("workers.auto_simulation_worker._STARTUP_DELAY", 0), patch(
            "workers.auto_simulation_worker._CHECK_INTERVAL", 0.01
        ):
            import asyncio

            task = asyncio.create_task(worker.run())
            await asyncio.sleep(0.08)
            await worker.stop()
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        assert worker.get_stats()["last_error"] == "boom", (
            "the error must be recorded, and the loop must have kept running"
        )

    async def test_stats_shape_is_stable(self):
        stats = AutoSimulationWorker().get_stats()
        for key in (
            "running",
            "checks",
            "starts",
            "halts",
            "last_state",
            "active_date",
            "last_error",
            "market_data_mode",
        ):
            assert key in stats
