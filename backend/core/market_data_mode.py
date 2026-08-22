"""
Market data source mode — LIVE vs SIMULATION.

This controls exactly ONE thing: which source feeds the quote pipeline
(quote_coordinator / event_bus) during open-hours-equivalent time.

    LIVE       — ZebuProvider websocket ticks (today's behavior, unchanged)
    SIMULATION — HistoricalReplayEngine replaying stored candles

Explicitly NOT related to `settings.SIMULATION_MODE`, which only gates algo
demo-signal behavior (can_run_algo / ZeroLoss strategies) and has nothing to
do with price data sourcing.

This mode NEVER affects weekend/holiday/closed detection. Market session state
(engines/market_session.py) and frozen-data behavior (cache/redis_client.py)
are entirely independent of it.
"""

from __future__ import annotations

import logging
from enum import Enum
from threading import Lock

logger = logging.getLogger(__name__)


class MarketDataMode(Enum):
    """Which source feeds the quote pipeline."""

    LIVE = "live"
    SIMULATION = "simulation"


class _MarketDataModeState:
    """Thread-safe holder for the active market data mode."""

    def __init__(self, mode: MarketDataMode = MarketDataMode.LIVE) -> None:
        self._lock = Lock()
        self._mode = mode

    def get_mode(self) -> MarketDataMode:
        with self._lock:
            return self._mode

    def set_mode(self, mode: MarketDataMode) -> MarketDataMode:
        if not isinstance(mode, MarketDataMode):
            mode = MarketDataMode(str(mode).strip().lower())
        with self._lock:
            previous = self._mode
            self._mode = mode
        if previous != mode:
            logger.info(
                f"Market data mode changed: {previous.value} -> {mode.value}"
            )
        return mode

    def is_simulation(self) -> bool:
        return self.get_mode() == MarketDataMode.SIMULATION

    def is_live(self) -> bool:
        return self.get_mode() == MarketDataMode.LIVE

    def reset(self) -> None:
        """Restore the default LIVE mode (used by tests)."""
        self.set_mode(MarketDataMode.LIVE)


# ── Singleton instance ─────────────────────────────────────────────
# Default is LIVE so behavior is identical to today unless explicitly switched.
market_data_mode = _MarketDataModeState(MarketDataMode.LIVE)
