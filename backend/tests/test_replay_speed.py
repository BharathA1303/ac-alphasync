"""
Replay speed controls: 1x, 2x, 5x, 10x.

Two properties matter and are tested separately:

    RATE — simulated time advances at `speed` x wall-clock time.
    SYNCHRONY — every instrument sits at the SAME simulated instant.
                There is one clock, not one timer per instrument. A
                per-instrument drift would let one leg of a spread lead
                another, which is exactly the bug this guards against.

Rate is tested against _advance_clock() with injected elapsed times rather
than by sleeping for real seconds: deterministic, and it isolates the clock
arithmetic from scheduler jitter. One slower end-to-end test then drives the
actual loop to confirm the wiring.
"""

import asyncio
from datetime import date, datetime, timezone

import pytest

from core.market_data_mode import MarketDataMode, market_data_mode
from engines.market_session import IST
from models.market_data import HistoricalCandle, Instrument
from services.historical_replay import HistoricalReplayEngine, historical_replay_engine

SIM_DATE = date(2026, 8, 20)
SPEEDS = [1, 2, 5, 10]


def _epoch(hh, mm, ss=0):
    return int(datetime(2026, 8, 20, hh, mm, ss, tzinfo=IST).timestamp())


@pytest.fixture(autouse=True)
def _clean_state():
    market_data_mode.reset()
    historical_replay_engine.reset()
    yield
    market_data_mode.reset()
    historical_replay_engine.reset()


async def _seed(db, symbols=("SPEEDA", "SPEEDB"), minutes=30):
    """Several instruments, each with a candle every minute from 09:15."""
    for idx, tsym in enumerate(symbols):
        inst = Instrument(
            token=f"70{idx:02d}",
            trading_symbol=tsym,
            exchange="NSE",
            instrument_type="EQUITY",
        )
        db.add(inst)
        await db.flush()
        for m in range(minutes):
            price = 100.0 + idx * 10 + m
            db.add(
                HistoricalCandle(
                    instrument_id=inst.id,
                    trading_date=SIM_DATE,
                    # Offset in seconds from 09:15 so minute counts above
                    # 59 roll into the next hour correctly.
                    timestamp=datetime.fromtimestamp(
                        _epoch(9, 15) + m * 60, tz=timezone.utc
                    ),
                    open=price,
                    high=price,
                    low=price,
                    close=price,
                    volume=100,
                    source="zebu_tp_series",
                )
            )
    await db.flush()


class TestClockRate:
    """simulated_delta == wall_elapsed * speed."""

    @pytest.mark.parametrize("speed", SPEEDS)
    def test_clock_advances_at_the_configured_multiple(self, speed):
        engine = HistoricalReplayEngine()
        engine._sim_epoch = _epoch(9, 15)
        engine.set_speed(speed)

        start = engine._sim_epoch
        # 60 iterations of 1 wall-second each.
        for _ in range(60):
            engine._sim_epoch = engine._advance_clock(1.0)

        advanced = engine._sim_epoch - start
        assert advanced == 60 * speed, (
            f"at {speed}x, 60 wall-seconds must advance simulated time by "
            f"{60 * speed}s, got {advanced}s"
        )

    @pytest.mark.parametrize("speed", SPEEDS)
    def test_rate_is_independent_of_tick_granularity(self, speed):
        """
        The same wall-clock duration must produce the same simulated
        advance whether it arrives as many small ticks or few large ones.
        """
        results = []
        for tick in (0.25, 1.0, 2.5):
            engine = HistoricalReplayEngine()
            engine._sim_epoch = _epoch(9, 15)
            engine.set_speed(speed)
            iterations = int(60 / tick)
            for _ in range(iterations):
                engine._sim_epoch = engine._advance_clock(tick)
            results.append(engine._sim_epoch - _epoch(9, 15))

        assert len(set(results)) == 1, (
            f"at {speed}x, tick granularity changed the rate: {results}"
        )
        assert results[0] == 60 * speed

    def test_fractional_speed_does_not_stall_the_clock(self):
        """
        Regression: int() truncation per tick made speed=0.5 advance the
        clock by exactly zero, freezing the simulation silently.
        """
        engine = HistoricalReplayEngine()
        engine._sim_epoch = _epoch(9, 15)
        engine.set_speed(0.5)

        start = engine._sim_epoch
        for _ in range(60):
            engine._sim_epoch = engine._advance_clock(1.0)

        assert engine._sim_epoch - start == 30, (
            "0.5x must advance 30s per 60 wall-seconds, not stall"
        )

    def test_speed_change_takes_effect_immediately(self):
        engine = HistoricalReplayEngine()
        engine._sim_epoch = _epoch(9, 15)
        engine.set_speed(1)

        for _ in range(10):
            engine._sim_epoch = engine._advance_clock(1.0)
        after_1x = engine._sim_epoch - _epoch(9, 15)
        assert after_1x == 10

        engine.set_speed(10)
        mark = engine._sim_epoch
        for _ in range(10):
            engine._sim_epoch = engine._advance_clock(1.0)

        assert engine._sim_epoch - mark == 100, (
            "a speed change must apply from that moment on"
        )

    def test_speed_must_be_positive(self):
        engine = HistoricalReplayEngine()
        for bad in (0, -1, -0.5):
            with pytest.raises(ValueError):
                engine.set_speed(bad)


@pytest.mark.asyncio
class TestClockSynchrony:
    """All instruments must advance on one shared clock."""

    @pytest.mark.parametrize("speed", SPEEDS)
    async def test_all_instruments_share_one_simulation_time(self, db, speed):
        engine = HistoricalReplayEngine()
        await _seed(db, symbols=(f"SYNC{speed}A", f"SYNC{speed}B", f"SYNC{speed}C"))
        await engine.load_session(db, SIM_DATE, speed=speed)
        market_data_mode.set_mode(MarketDataMode.SIMULATION)

        target = _epoch(10, 0)
        await engine.advance_to(target)

        assert engine.get_simulation_time() == datetime.fromtimestamp(
            target, tz=timezone.utc
        )

        # Every instrument that emitted state must be stamped with the
        # SAME simulated timestamp — no per-instrument clocks.
        stamps = {
            key: state["simulated_timestamp"]
            for key, state in engine._state.items()
        }
        assert len(stamps) >= 3, "expected all seeded instruments to have state"
        assert len(set(stamps.values())) == 1, (
            f"instruments disagreed on simulation time: {stamps}"
        )

    @pytest.mark.parametrize("speed", SPEEDS)
    async def test_same_candle_index_reached_regardless_of_speed(self, db, speed):
        """
        Speed changes HOW FAST the clock moves, never WHERE it lands. At a
        given simulated instant every speed must show identical prices.
        """
        engine = HistoricalReplayEngine()
        await _seed(db, symbols=(f"IDX{speed}A", f"IDX{speed}B"))
        await engine.load_session(db, SIM_DATE, speed=speed)
        market_data_mode.set_mode(MarketDataMode.SIMULATION)

        await engine.advance_to(_epoch(9, 25))

        prices = {k: v["price"] for k, v in engine._state.items()}
        # 09:25 is the 11th candle (m=10): 100+10 and 110+10.
        assert sorted(prices.values()) == [110.0, 120.0], (
            f"speed {speed}x landed on the wrong candle: {prices}"
        )

    async def test_advance_is_monotonic_across_instruments(self, db):
        """Replaying forward must never move an instrument backwards."""
        engine = HistoricalReplayEngine()
        await _seed(db, symbols=("MONOA", "MONOB"))
        await engine.load_session(db, SIM_DATE, speed=5)
        market_data_mode.set_mode(MarketDataMode.SIMULATION)

        seen = {}
        for minute in range(16, 30):
            await engine.advance_to(_epoch(9, minute))
            for key, state in engine._state.items():
                prev = seen.get(key)
                if prev is not None:
                    assert state["price"] >= prev, (
                        f"{key} moved backwards: {prev} -> {state['price']}"
                    )
                seen[key] = state["price"]


@pytest.mark.asyncio
class TestSpeedEndToEnd:
    """Drive the real loop briefly to confirm the wiring, not just math."""

    @pytest.mark.parametrize("speed", [1, 10])
    async def test_running_loop_advances_faster_at_higher_speed(self, db, speed):
        engine = HistoricalReplayEngine()
        await _seed(db, symbols=(f"E2E{speed}",), minutes=120)
        await engine.load_session(db, SIM_DATE, speed=speed)
        market_data_mode.set_mode(MarketDataMode.SIMULATION)
        await engine.start(db)

        start_epoch = engine._sim_epoch
        task = asyncio.create_task(engine.run())
        # ~3 loop iterations at TICK_INTERVAL_SEC=1.0.
        await asyncio.sleep(3.2)
        engine._running = False
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

        advanced = engine._sim_epoch - start_epoch
        # Generous bounds: scheduler jitter, but the multiple must be clear.
        assert advanced >= speed * 2, (
            f"at {speed}x the clock advanced only {advanced}s in ~3 wall-seconds"
        )
        assert advanced <= speed * 6, (
            f"at {speed}x the clock overshot: {advanced}s in ~3 wall-seconds"
        )
