"""
Tests for SimulationController — the only component that transitions
MarketDataMode alongside the replay engine lifecycle.
"""

from datetime import date, datetime, timezone

import pytest

from core.market_data_mode import MarketDataMode, market_data_mode
from engines.market_session import IST
from models.market_data import HistoricalCandle, Instrument
from services.historical_replay import historical_replay_engine
from services.simulation_control import SimulationController

SIM_DATE = date(2026, 8, 20)


def _epoch(hh, mm):
    return int(datetime(2026, 8, 20, hh, mm, tzinfo=IST).timestamp())


async def _seed(db, tsym="CTRLCO", token="4001", closes=(100.0, 101.0)):
    inst = Instrument(
        token=token,
        trading_symbol=tsym,
        exchange="NSE",
        instrument_type="EQUITY",
    )
    db.add(inst)
    await db.flush()
    for i, close in enumerate(closes):
        db.add(
            HistoricalCandle(
                instrument_id=inst.id,
                trading_date=SIM_DATE,
                timestamp=datetime.fromtimestamp(_epoch(9, 15 + i), tz=timezone.utc),
                open=close, high=close, low=close, close=close,
                volume=10, source="zebu_tp_series",
            )
        )
    await db.flush()
    return inst


@pytest.fixture(autouse=True)
def _clean_state():
    market_data_mode.reset()
    historical_replay_engine.reset()
    yield
    market_data_mode.reset()
    historical_replay_engine.reset()


@pytest.mark.asyncio
class TestSimulationController:
    async def test_start_switches_mode_and_runs_replay(self, db):
        ctrl = SimulationController()
        await _seed(db)

        assert market_data_mode.is_live()
        status = await ctrl.start(db, SIM_DATE, speed=2.0)

        assert market_data_mode.is_simulation()
        assert status["market_data_mode"] == "simulation"
        assert status["replay"]["speed"] == 2.0
        assert ctrl.is_active

        await ctrl.stop(db)

    async def test_stop_returns_pipeline_to_live(self, db):
        ctrl = SimulationController()
        await _seed(db, "STOPCO", "4002")

        await ctrl.start(db, SIM_DATE)
        assert market_data_mode.is_simulation()

        status = await ctrl.stop(db)
        assert market_data_mode.is_live(), "stop must always restore LIVE mode"
        assert status["market_data_mode"] == "live"
        assert not ctrl.is_active

    async def test_start_without_stored_candles_refuses_and_stays_live(self, db):
        """Never enter a simulation with no data — and never leave LIVE."""
        ctrl = SimulationController()

        with pytest.raises(RuntimeError, match="No historical candles"):
            await ctrl.start(db, date(2026, 7, 1))

        assert market_data_mode.is_live(), "failed start must not flip the mode"
        assert not ctrl.is_active

    async def test_pause_and_resume(self, db):
        ctrl = SimulationController()
        await _seed(db, "PAUSECO", "4003")

        await ctrl.start(db, SIM_DATE)
        await ctrl.pause(db)
        assert not ctrl.is_active  # paused is not "running"

        await ctrl.resume(db)
        assert ctrl.is_active

        await ctrl.stop(db)

    async def test_speed_change_is_reflected(self, db):
        ctrl = SimulationController()
        await _seed(db, "SPDCO", "4004")
        await ctrl.start(db, SIM_DATE, speed=1.0)

        status = ctrl.set_speed(10)
        assert status["replay"]["speed"] == 10.0

        await ctrl.stop(db)

    async def test_status_is_readable_before_any_simulation(self):
        ctrl = SimulationController()
        status = ctrl.status()
        assert status["market_data_mode"] == "live"
        assert status["active"] is False
