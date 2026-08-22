"""
Simulation control — starts/stops the historical replay and flips the
market data source mode together, so the two can never disagree.

This is the only place that transitions MarketDataMode alongside the
replay engine lifecycle.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date
from typing import Optional

from sqlalchemy import select

from core.market_data_mode import MarketDataMode, market_data_mode
from models.market_data import (
    SIM_PAUSED,
    SIM_RUNNING,
    SimulationSession,
)
from services.historical_downloader import latest_complete_trading_day
from services.historical_replay import historical_replay_engine

logger = logging.getLogger(__name__)


class SimulationController:
    """Owns the replay task and the LIVE/SIMULATION transition."""

    def __init__(self) -> None:
        self._task: Optional[asyncio.Task] = None

    @property
    def is_active(self) -> bool:
        return market_data_mode.is_simulation() and historical_replay_engine.is_running

    async def start(
        self,
        db,
        simulation_date: Optional[date] = None,
        speed: float = 1.0,
    ) -> dict:
        """
        Load a day's candles, switch to SIMULATION mode, and start replaying.

        Raises RuntimeError if the requested day has no stored candles, so
        the caller never silently enters a simulation with no data.
        """
        target = simulation_date or latest_complete_trading_day()

        await historical_replay_engine.load_session(db, target, speed=speed)
        if not historical_replay_engine.get_stats()["instruments"]:
            raise RuntimeError(
                f"No historical candles stored for {target}; run the downloader first"
            )

        # Flip the mode only after data is confirmed loaded.
        market_data_mode.set_mode(MarketDataMode.SIMULATION)
        await historical_replay_engine.start(db)

        if self._task is None or self._task.done():
            self._task = asyncio.create_task(historical_replay_engine.run())

        logger.info(f"Simulation started for {target} at {speed}x")
        return self.status()

    async def recover_orphaned_sessions(self, db) -> dict:
        """
        Reconcile DB simulation state with reality after a process restart.

        The replay engine lives entirely in memory. After a restart the
        process starts in LIVE mode with no engine, but the DB may still
        hold a session marked RUNNING from before the crash/restart. That
        combination is a lie: the UI would report an active simulation
        while the live Zebu feed drives the pipeline.

        Safe behavior — deliberately NOT auto-resume:
            RUNNING -> PAUSED, preserving simulation_date/simulation_time.

        Auto-resuming would silently restart a market simulation nobody
        asked for (and, at speed, race far ahead of where it stopped).
        An operator must explicitly restart it. The simulated clock
        position is preserved so nothing is lost.

        Portfolio/holding/order rows are never touched here.
        """
        stale = (
            await db.execute(
                select(SimulationSession).where(
                    SimulationSession.status == SIM_RUNNING
                )
            )
        ).scalars().all()

        recovered = []
        for session in stale:
            session.status = SIM_PAUSED
            recovered.append(
                {
                    "id": str(session.id),
                    "simulation_date": str(session.simulation_date),
                    "simulation_time": (
                        session.simulation_time.isoformat()
                        if session.simulation_time
                        else None
                    ),
                }
            )

        if recovered:
            await db.flush()
            logger.warning(
                "Recovered %d orphaned RUNNING simulation session(s) after "
                "restart; marked PAUSED. Explicit resume required — market "
                "data mode stays LIVE until then.",
                len(recovered),
            )

        # The in-memory engine holds nothing after a restart, so the mode
        # must be LIVE regardless of what the DB said.
        market_data_mode.set_mode(MarketDataMode.LIVE)

        return {"recovered": recovered, "count": len(recovered)}

    async def stop(self, db=None) -> dict:
        """Stop replaying and return the pipeline to the live Zebu feed."""
        await historical_replay_engine.stop(db)
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
        self._task = None

        market_data_mode.set_mode(MarketDataMode.LIVE)
        logger.info("Simulation stopped; market data mode returned to LIVE")
        return self.status()

    async def pause(self, db=None) -> dict:
        await historical_replay_engine.pause(db)
        return self.status()

    async def resume(self, db=None) -> dict:
        await historical_replay_engine.resume(db)
        return self.status()

    def set_speed(self, speed: float) -> dict:
        historical_replay_engine.set_speed(speed)
        return self.status()

    def status(self) -> dict:
        return {
            "market_data_mode": market_data_mode.get_mode().value,
            "active": self.is_active,
            "replay": historical_replay_engine.get_stats(),
        }


simulation_controller = SimulationController()
