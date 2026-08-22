"""
Backend restart during an active simulation.

These tests are deliberately NOT mocked at the persistence layer: they use a
real on-disk SQLite database that survives the "restart", so state genuinely
crosses the process boundary rather than being asserted about in memory.

A "restart" here means: dispose the engine and drop every in-memory service
object (replay engine + controller), then rebuild them against the SAME
database file — which is exactly what the real process does on boot.

What must hold after a restart:
    - SimulationSession rows survive with their simulation_time intact.
    - A session left RUNNING is reconciled to PAUSED, never silently
      auto-resumed and never left claiming to be RUNNING.
    - MarketDataMode comes back LIVE (the engine holds nothing after a
      restart, so any other mode would be a lie).
    - User / Portfolio / Order rows are completely untouched.
"""

import uuid
from datetime import date, datetime, timezone

import pytest
import pytest_asyncio
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from core.market_data_mode import MarketDataMode, market_data_mode
from database.connection import Base
from engines.market_session import IST
from models.market_data import (
    SIM_ENDED,
    SIM_PAUSED,
    SIM_READY,
    SIM_RUNNING,
    HistoricalCandle,
    Instrument,
    SimulationSession,
)
from models.order import Order
from models.portfolio import Portfolio
from models.user import User
from services.historical_replay import HistoricalReplayEngine
from services.simulation_control import SimulationController

SIM_DATE = date(2026, 8, 20)


def _epoch(hh, mm):
    return int(datetime(2026, 8, 20, hh, mm, tzinfo=IST).timestamp())


@pytest_asyncio.fixture
async def persistent_db(tmp_path):
    """
    A real file-backed DB plus a session factory.

    Yields the factory (not a session) so each "process lifetime" can open
    its own connection, the way a restarted app would.
    """
    db_path = tmp_path / "restart_test.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        yield factory
    finally:
        await engine.dispose()


@pytest.fixture(autouse=True)
def _clean_mode():
    market_data_mode.reset()
    yield
    market_data_mode.reset()


async def _seed_market_data(db):
    inst = Instrument(
        token="9001",
        trading_symbol="RESTARTCO",
        exchange="NSE",
        instrument_type="EQUITY",
    )
    db.add(inst)
    await db.flush()
    for i, close in enumerate((100.0, 101.0, 102.0)):
        db.add(
            HistoricalCandle(
                instrument_id=inst.id,
                trading_date=SIM_DATE,
                timestamp=datetime.fromtimestamp(_epoch(9, 15 + i), tz=timezone.utc),
                open=close,
                high=close,
                low=close,
                close=close,
                volume=10,
                source="zebu_tp_series",
            )
        )
    await db.flush()
    return inst


async def _seed_user_state(db):
    """A user with a portfolio and a filled order — must survive untouched."""
    user = User(
        username="restart_trader",
        email="restart@alphasync.com",
        full_name="Restart Trader",
        virtual_capital=500000.0,
    )
    db.add(user)
    await db.flush()

    portfolio = Portfolio(
        user_id=user.id,
        available_capital=450000.0,
        total_invested=50000.0,
        current_value=52000.0,
        total_pnl=2000.0,
        total_pnl_percent=4.0,
    )
    db.add(portfolio)

    order = Order(
        user_id=user.id,
        symbol="RELIANCE",
        order_type="MARKET",
        side="BUY",
        quantity=10,
        price=2500.0,
        status="FILLED",
    )
    db.add(order)
    await db.flush()
    return user, portfolio, order


@pytest.mark.asyncio
class TestRestartDuringSimulation:
    async def test_restart_resumes_or_safely_reports_simulation_state(
        self, persistent_db
    ):
        """
        The headline restart test.

        Mid-simulation the process dies. On boot the DB still says RUNNING
        but no engine exists. The system must reconcile to PAUSED and stay
        in LIVE mode — never auto-resume, never keep claiming RUNNING.
        """
        # ── Process lifetime #1: start a simulation and advance the clock ──
        async with persistent_db() as db:
            await _seed_market_data(db)
            user, portfolio, order = await _seed_user_state(db)
            user_id, portfolio_id, order_id = user.id, portfolio.id, order.id

            engine_1 = HistoricalReplayEngine()
            ctrl_1 = SimulationController()
            # Point the module-level singletons the controller uses at our
            # fresh engine instance for the duration of this lifetime.
            import services.simulation_control as sc_module

            original_engine = sc_module.historical_replay_engine
            sc_module.historical_replay_engine = engine_1
            try:
                session = await engine_1.load_session(db, SIM_DATE, speed=1.0)
                session_id = session.id

                market_data_mode.set_mode(MarketDataMode.SIMULATION)
                await engine_1.start(db)

                # Advance the simulated clock to a known, non-open instant.
                mid_epoch = _epoch(11, 30)
                await engine_1.advance_to(mid_epoch)
                await engine_1._persist_status(db)
                await db.commit()

                expected_sim_time = datetime.fromtimestamp(
                    mid_epoch, tz=timezone.utc
                )
            finally:
                sc_module.historical_replay_engine = original_engine

        # ── The crash: every in-memory object is discarded ────────────────
        del engine_1, ctrl_1

        # Confirm the DB really recorded RUNNING before the restart.
        async with persistent_db() as db:
            row = (
                await db.execute(
                    select(SimulationSession).where(
                        SimulationSession.id == session_id
                    )
                )
            ).scalar_one()
            assert row.status == SIM_RUNNING, (
                "precondition: session must be RUNNING in the DB before restart"
            )
            assert row.simulation_time is not None

        # ── Process lifetime #2: fresh objects, same database ─────────────
        market_data_mode.reset()  # a new process always boots LIVE
        engine_2 = HistoricalReplayEngine()
        ctrl_2 = SimulationController()

        # A brand-new engine knows nothing.
        assert engine_2.get_simulation_time() is None
        assert not engine_2.is_running
        assert engine_2.status == SIM_READY

        async with persistent_db() as db:
            recovery = await ctrl_2.recover_orphaned_sessions(db)
            await db.commit()

        assert recovery["count"] == 1, "the orphaned RUNNING session must be found"
        recovered = recovery["recovered"][0]
        assert recovered["id"] == str(session_id)

        # ── State survived, and is now honest ─────────────────────────────
        async with persistent_db() as db:
            row = (
                await db.execute(
                    select(SimulationSession).where(
                        SimulationSession.id == session_id
                    )
                )
            ).scalar_one()

            assert row.status == SIM_PAUSED, (
                "a RUNNING session with no engine must become PAUSED, not stay RUNNING"
            )
            assert row.simulation_date == SIM_DATE, "simulation date must survive"
            assert row.simulation_time is not None, "clock position must survive"
            # The preserved clock is where the simulation actually stopped.
            assert abs(
                (row.simulation_time.replace(tzinfo=timezone.utc) - expected_sim_time)
                .total_seconds()
            ) < 2, "simulation_time must resume from where it stopped"

        # Mode must be LIVE — never SIMULATION with no engine behind it.
        assert market_data_mode.is_live(), (
            "after a restart the pipeline must be LIVE until an explicit resume"
        )
        assert not ctrl_2.is_active

    async def test_restart_never_auto_resumes_the_clock(self, persistent_db):
        """
        Recovery must not restart replay. An unattended auto-resume would
        race the clock forward with nobody watching.
        """
        async with persistent_db() as db:
            await _seed_market_data(db)
            session = SimulationSession(
                simulation_date=SIM_DATE,
                status=SIM_RUNNING,
                speed=10,
                simulation_time=datetime.fromtimestamp(
                    _epoch(10, 0), tz=timezone.utc
                ),
            )
            db.add(session)
            await db.commit()
            session_id = session.id
            before = session.simulation_time

        ctrl = SimulationController()
        async with persistent_db() as db:
            await ctrl.recover_orphaned_sessions(db)
            await db.commit()

        # No replay task, no mode flip, and the clock did not move.
        assert market_data_mode.is_live()
        assert not ctrl.is_active

        async with persistent_db() as db:
            row = (
                await db.execute(
                    select(SimulationSession).where(
                        SimulationSession.id == session_id
                    )
                )
            ).scalar_one()
            assert row.status == SIM_PAUSED
            assert row.simulation_time.replace(tzinfo=timezone.utc) == before, (
                "recovery must not advance the simulated clock"
            )

    async def test_restart_leaves_user_orders_and_portfolio_untouched(
        self, persistent_db
    ):
        """
        Restart recovery touches market-data tables only. User money state
        is proven identical by explicit before/after comparison.
        """
        async with persistent_db() as db:
            await _seed_market_data(db)
            user, portfolio, order = await _seed_user_state(db)
            session = SimulationSession(
                simulation_date=SIM_DATE,
                status=SIM_RUNNING,
                speed=1,
                simulation_time=datetime.fromtimestamp(
                    _epoch(12, 0), tz=timezone.utc
                ),
            )
            db.add(session)
            await db.commit()

            before = {
                "users": (
                    await db.execute(select(func.count()).select_from(User))
                ).scalar_one(),
                "orders": (
                    await db.execute(select(func.count()).select_from(Order))
                ).scalar_one(),
                "portfolios": (
                    await db.execute(select(func.count()).select_from(Portfolio))
                ).scalar_one(),
                "capital": float(portfolio.available_capital),
                "pnl": float(portfolio.total_pnl),
                "order_status": order.status,
                "order_qty": order.quantity,
            }

        ctrl = SimulationController()
        async with persistent_db() as db:
            await ctrl.recover_orphaned_sessions(db)
            await db.commit()

        async with persistent_db() as db:
            after = {
                "users": (
                    await db.execute(select(func.count()).select_from(User))
                ).scalar_one(),
                "orders": (
                    await db.execute(select(func.count()).select_from(Order))
                ).scalar_one(),
                "portfolios": (
                    await db.execute(select(func.count()).select_from(Portfolio))
                ).scalar_one(),
            }
            p = (await db.execute(select(Portfolio))).scalars().one()
            o = (await db.execute(select(Order))).scalars().one()

        assert after["users"] == before["users"]
        assert after["orders"] == before["orders"]
        assert after["portfolios"] == before["portfolios"]
        assert float(p.available_capital) == before["capital"]
        assert float(p.total_pnl) == before["pnl"]
        assert o.status == before["order_status"]
        assert o.quantity == before["order_qty"]

    async def test_recovery_is_idempotent(self, persistent_db):
        """Running recovery twice must not corrupt or re-report state."""
        async with persistent_db() as db:
            await _seed_market_data(db)
            db.add(
                SimulationSession(
                    simulation_date=SIM_DATE,
                    status=SIM_RUNNING,
                    speed=1,
                    simulation_time=datetime.fromtimestamp(
                        _epoch(10, 0), tz=timezone.utc
                    ),
                )
            )
            await db.commit()

        ctrl = SimulationController()
        async with persistent_db() as db:
            first = await ctrl.recover_orphaned_sessions(db)
            await db.commit()
        async with persistent_db() as db:
            second = await ctrl.recover_orphaned_sessions(db)
            await db.commit()

        assert first["count"] == 1
        assert second["count"] == 0, "already-recovered sessions must not re-trigger"

    async def test_recovery_leaves_ended_and_ready_sessions_alone(
        self, persistent_db
    ):
        """Only RUNNING is orphaned state. ENDED/READY must be preserved."""
        async with persistent_db() as db:
            await _seed_market_data(db)
            for status in (SIM_ENDED, SIM_READY, SIM_PAUSED):
                db.add(
                    SimulationSession(
                        simulation_date=SIM_DATE,
                        status=status,
                        speed=1,
                        simulation_time=datetime.fromtimestamp(
                            _epoch(10, 0), tz=timezone.utc
                        ),
                    )
                )
            await db.commit()

        ctrl = SimulationController()
        async with persistent_db() as db:
            result = await ctrl.recover_orphaned_sessions(db)
            await db.commit()

        assert result["count"] == 0

        async with persistent_db() as db:
            rows = (await db.execute(select(SimulationSession))).scalars().all()
            statuses = sorted(r.status for r in rows)
        assert statuses == sorted([SIM_ENDED, SIM_READY, SIM_PAUSED])
