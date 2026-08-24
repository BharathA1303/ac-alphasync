"""
Auto Simulation Worker — drives historical replay from the market session,
with no admin action and no LIVE/SIMULATION switch.

Architecture (deliberate, replaces the old admin-toggle model):
    There is no LIVE market data for users any more. During NSE open hours
    the site replays the previous complete trading day's stored candles;
    outside those hours the last replayed price stays frozen. Nothing a
    user or admin does is required for this to happen.

State machine, polled every _CHECK_INTERVAL seconds:

    market_session.get_current_state() == OPEN
        -> ensure a replay of latest_complete_trading_day() is RUNNING
           (start it via simulation_controller.start(), reusing that
           method's existing load/verify/mode-flip/task-spawn logic)

    anything else (PRE_MARKET, CLOSING, AFTER_MARKET, CLOSED, WEEKEND,
    HOLIDAY)
        -> ensure the replay clock is halted via simulation_controller.halt()

Two properties this worker relies on rather than reimplements:

    1. Freeze is not built here. halt() stops the clock and leaves the last
       replayed quotes exactly where they are — in Redis under the same keys
       live ticks use. cache/redis_client._get_price_ttl() already extends
       those keys to PRICE_TTL_CLOSED whenever market_session is not OPEN,
       and _enrich_frozen_day_change_payload() already serves them as frozen
       quotes. That is the same code path that froze live prices before.

    2. MarketDataMode is never returned to LIVE. halt() holds it at
       SIMULATION on purpose so zebu_provider._handle_tick keeps hard-
       dropping any websocket tick that arrives after hours. Using stop()
       here would re-open that door; stop() remains for the admin routes,
       where going back to LIVE is an explicit operator choice.

Every transition is idempotent: re-running the check when the desired state
already holds does nothing. The loop never propagates an exception — a day
with no downloaded candles logs a warning and is retried on the next poll.
"""

import asyncio
import logging
from datetime import date
from typing import Optional

from core.market_data_mode import MarketDataMode, market_data_mode
from database.connection import async_session_factory
from engines.market_session import MarketState, market_session
from services.historical_downloader import latest_complete_trading_day
from services.historical_replay import historical_replay_engine
from services.simulation_control import simulation_controller

logger = logging.getLogger(__name__)

# Poll often enough that the 09:15 / 15:30 boundaries are picked up
# promptly, but nowhere near often enough to be a load concern.
_CHECK_INTERVAL = 30
# Let the rest of the app (DB, Redis, event bus, workers) finish booting
# before the first transition attempt.
_STARTUP_DELAY = 15
# Source candles are real 1-minute bars (see historical_replay.py's
# advance_to() — an instrument's quote only updates when a new candle
# comes into effect, by design, never fabricated between them). At 1.0x
# that is one visible update per real-world minute, which reads as
# "frozen" next to a live tick feed even though nothing is broken. At
# 10x a trading day (~6h15m) compresses to ~37.5 real minutes and
# updates land roughly every 6 seconds instead. A day that finishes
# replaying restarts automatically from session open on this worker's
# next poll (_ensure_running() is idempotent per-date, not per-run), so
# a full trading day loops several times across real market hours.
_REPLAY_SPEED = 10.0


class AutoSimulationWorker:
    """Keeps historical replay aligned with the NSE session, automatically."""

    def __init__(self) -> None:
        self._running = False
        self._checks = 0
        self._starts = 0
        self._halts = 0
        self._last_state: Optional[MarketState] = None
        self._active_date: Optional[date] = None
        self._last_error: Optional[str] = None
        self._last_skip_reason: Optional[str] = None

    # ── Predicates ─────────────────────────────────────────────────

    def _replay_is_current_for(self, target: date) -> bool:
        """
        True when replay is already running for `target`.

        Both halves matter: a running engine on yesterday's date is stale
        (the calendar rolled over) and must be restarted on the new target,
        while a loaded-but-not-running engine on the right date still needs
        starting.
        """
        return (
            historical_replay_engine.is_running
            and historical_replay_engine.simulation_date == target
        )

    # ── Transitions ────────────────────────────────────────────────

    async def _ensure_running(self) -> bool:
        """Start replay for the latest complete trading day. Idempotent."""
        target = latest_complete_trading_day()

        if self._replay_is_current_for(target):
            self._active_date = target
            return False

        try:
            async with async_session_factory() as db:
                await simulation_controller.start(db, target, speed=_REPLAY_SPEED)
                await db.commit()
        except RuntimeError as exc:
            # Expected and recoverable: the download worker has not stored
            # this day yet (no Zebu session was available overnight, or it
            # is still running). Retry on the next poll — never crash.
            self._last_skip_reason = str(exc)
            logger.warning(
                "Auto simulation cannot start for %s yet: %s. "
                "Retrying in %ds.",
                target,
                exc,
                _CHECK_INTERVAL,
            )
            return False

        self._active_date = target
        self._starts += 1
        self._last_skip_reason = None
        logger.info(
            "Auto simulation started: replaying %s (market is OPEN)", target
        )
        return True

    async def _ensure_halted(self, state: MarketState) -> bool:
        """
        Stop the replay clock and freeze the last state. Idempotent.

        MarketDataMode is asserted as SIMULATION even when there is nothing
        to halt, so a process that booted into LIVE never serves — or
        accepts — live ticks while waiting for the next open.
        """
        if not historical_replay_engine.is_running:
            if not market_data_mode.is_simulation():
                market_data_mode.set_mode(MarketDataMode.SIMULATION)
                logger.info(
                    "Auto simulation: market is %s and no replay is active; "
                    "holding market data mode at SIMULATION (live feed stays "
                    "blocked)",
                    state.value,
                )
            return False

        async with async_session_factory() as db:
            await simulation_controller.halt(db)
            await db.commit()

        self._halts += 1
        logger.info(
            "Auto simulation halted (market is %s); last replayed prices are "
            "now frozen for %s",
            state.value,
            self._active_date,
        )
        return True

    # ── Poll ───────────────────────────────────────────────────────

    async def check_once(self) -> dict:
        """
        One state-machine evaluation. Safe to call repeatedly.

        Returns a small dict describing what happened, which is what the
        tests assert against.
        """
        self._checks += 1
        state = market_session.get_current_state()
        changed = state != self._last_state
        self._last_state = state

        if state == MarketState.OPEN:
            acted = await self._ensure_running()
            return {"state": state.value, "action": "start" if acted else "noop"}

        acted = await self._ensure_halted(state)
        if changed and not acted:
            logger.debug("Auto simulation: market is %s; nothing to do", state.value)
        return {"state": state.value, "action": "halt" if acted else "noop"}

    # ── Lifecycle ──────────────────────────────────────────────────

    async def run(self) -> None:
        self._running = True
        logger.info(
            "Auto simulation worker started (poll=%ds) — historical replay is "
            "now the only market data source",
            _CHECK_INTERVAL,
        )

        try:
            await asyncio.sleep(_STARTUP_DELAY)
        except asyncio.CancelledError:
            return

        while self._running:
            try:
                await self.check_once()
                self._last_error = None
            except asyncio.CancelledError:
                break
            except Exception as exc:
                # A failure here must never take the app down or stop the
                # loop; the next poll re-evaluates from scratch.
                self._last_error = str(exc)
                logger.error(f"Auto simulation worker error: {exc}", exc_info=True)

            try:
                await asyncio.sleep(_CHECK_INTERVAL)
            except asyncio.CancelledError:
                break

        logger.info("Auto simulation worker stopped")

    async def stop(self) -> None:
        self._running = False

    def get_stats(self) -> dict:
        return {
            "running": self._running,
            "checks": self._checks,
            "starts": self._starts,
            "halts": self._halts,
            "last_state": self._last_state.value if self._last_state else None,
            "active_date": str(self._active_date) if self._active_date else None,
            "last_error": self._last_error,
            "last_skip_reason": self._last_skip_reason,
            "market_data_mode": market_data_mode.get_mode().value,
        }


auto_simulation_worker = AutoSimulationWorker()
