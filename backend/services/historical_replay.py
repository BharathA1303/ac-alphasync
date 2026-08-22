"""
HistoricalReplayEngine — replays stored candles into the existing quote
pipeline as if they were live ticks.

Feeds exactly the same downstream systems as the live Zebu feed:
    equity/index -> quote_coordinator.ingest_equity_quote(source="historical_replay")
    futures      -> event_bus EventType.FUTURES_QUOTE (same field set as live)
    options      -> in-memory replay state, read by routes/options.py in
                    SIMULATION mode (options have no live tick pipeline)

Data integrity rules:
    - Never fabricate intra-minute movement. Between candle boundaries the
      last candle's close is HELD as current state.
    - Missing candles (instrument didn't trade that minute) carry forward the
      last known state — never zero-filled, never interpolated.
    - Replay only ever substitutes for the live open-hours feed. It never
      alters weekend/holiday/closed detection or frozen-data behavior.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

from sqlalchemy import select

from core.event_bus import Event, EventType, event_bus
from core.market_data_mode import market_data_mode
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

logger = logging.getLogger(__name__)

SESSION_START = time(9, 15)
SESSION_END = time(15, 30)

REPLAY_SOURCE = "historical_replay"

# Wall-clock seconds between replay loop iterations.
TICK_INTERVAL_SEC = 1.0
# Simulated seconds advanced per loop iteration at speed=1.
SIM_SECONDS_PER_TICK = 1.0


@dataclass
class ReplayInstrument:
    """One instrument's replay track: its identity plus its ordered candles."""

    instrument_id: object
    trading_symbol: str
    exchange: str
    instrument_type: str
    canonical_symbol: str
    token: str = ""
    underlying: Optional[str] = None
    expiry_date: Optional[date] = None
    strike_price: Optional[float] = None
    option_type: Optional[str] = None
    # Candles sorted ascending by epoch seconds.
    candles: list[dict] = field(default_factory=list)
    # Index of the candle currently in effect (-1 = before first candle).
    cursor: int = -1

    @property
    def key(self) -> str:
        return f"{self.exchange}:{self.trading_symbol}".upper()


def _to_epoch(dt: datetime) -> int:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp())


class HistoricalReplayEngine:
    """Drives one simulated trading day from stored candles."""

    def __init__(self) -> None:
        self._running = False
        self._session_id = None
        self._simulation_date: Optional[date] = None
        self._sim_epoch: Optional[int] = None
        self._speed: float = 1.0
        self._status: str = SIM_READY
        self._instruments: dict[str, ReplayInstrument] = {}
        # Latest emitted state per instrument key — the "current quote".
        self._state: dict[str, dict] = {}
        # Secondary index so option lookups can go by trading symbol alone.
        self._by_trading_symbol: dict[str, str] = {}
        self._by_token: dict[str, str] = {}
        self._task: Optional[asyncio.Task] = None
        self._stats = {"ticks": 0, "quotes_emitted": 0, "loops": 0}

    # ── Introspection ──────────────────────────────────────────────

    @property
    def is_running(self) -> bool:
        return self._running and self._status == SIM_RUNNING

    @property
    def status(self) -> str:
        return self._status

    @property
    def simulation_date(self) -> Optional[date]:
        return self._simulation_date

    def get_simulation_time(self) -> Optional[datetime]:
        """Current simulated instant (UTC), or None if not loaded."""
        if self._sim_epoch is None:
            return None
        return datetime.fromtimestamp(self._sim_epoch, tz=timezone.utc)

    def get_stats(self) -> dict:
        return {
            **self._stats,
            "status": self._status,
            "running": self._running,
            "speed": self._speed,
            "simulation_date": str(self._simulation_date) if self._simulation_date else None,
            "simulation_time": (
                self.get_simulation_time().isoformat() if self._sim_epoch else None
            ),
            "instruments": len(self._instruments),
            "instruments_with_state": len(self._state),
        }

    # ── Loading ────────────────────────────────────────────────────

    async def load_session(
        self,
        db,
        simulation_date: date,
        speed: float = 1.0,
        session: Optional[SimulationSession] = None,
    ) -> SimulationSession:
        """
        Load all stored candles for a simulation date into memory and create
        (or reuse) the SimulationSession row.
        """
        self._simulation_date = simulation_date
        self._speed = float(speed) if speed and float(speed) > 0 else 1.0
        self._instruments.clear()
        self._state.clear()
        self._by_trading_symbol.clear()
        self._by_token.clear()

        rows = (
            await db.execute(
                select(HistoricalCandle, Instrument)
                .join(Instrument, HistoricalCandle.instrument_id == Instrument.id)
                .where(HistoricalCandle.trading_date == simulation_date)
                .order_by(HistoricalCandle.timestamp)
            )
        ).all()

        for candle, instrument in rows:
            key = f"{instrument.exchange}:{instrument.trading_symbol}".upper()
            track = self._instruments.get(key)
            if track is None:
                track = ReplayInstrument(
                    instrument_id=instrument.id,
                    trading_symbol=str(instrument.trading_symbol).upper(),
                    exchange=str(instrument.exchange).upper(),
                    instrument_type=str(instrument.instrument_type).upper(),
                    canonical_symbol=self._canonical_for(instrument),
                    token=str(instrument.token or ""),
                    underlying=instrument.underlying,
                    expiry_date=instrument.expiry_date,
                    strike_price=(
                        float(instrument.strike_price)
                        if instrument.strike_price is not None
                        else None
                    ),
                    option_type=instrument.option_type,
                )
                self._instruments[key] = track
                self._by_trading_symbol[track.trading_symbol] = key
                if track.token:
                    self._by_token[track.token] = key

            track.candles.append(
                {
                    "epoch": _to_epoch(candle.timestamp),
                    "open": float(candle.open),
                    "high": float(candle.high),
                    "low": float(candle.low),
                    "close": float(candle.close),
                    "volume": int(candle.volume or 0),
                    "open_interest": (
                        int(candle.open_interest)
                        if candle.open_interest is not None
                        else None
                    ),
                }
            )

        for track in self._instruments.values():
            track.candles.sort(key=lambda c: c["epoch"])
            track.cursor = -1

        # Start the clock at the session open.
        self._sim_epoch = int(
            datetime.combine(simulation_date, SESSION_START, tzinfo=IST).timestamp()
        )

        if session is None:
            session = SimulationSession(
                simulation_date=simulation_date,
                status=SIM_READY,
                speed=self._speed,
                simulation_time=self.get_simulation_time(),
            )
            db.add(session)
            await db.flush()

        self._session_id = session.id
        self._status = SIM_READY
        session.status = SIM_READY
        session.speed = self._speed
        session.simulation_time = self.get_simulation_time()
        await db.flush()

        total_candles = sum(len(t.candles) for t in self._instruments.values())
        logger.info(
            "Replay session loaded: date=%s instruments=%d candles=%d speed=%sx",
            simulation_date,
            len(self._instruments),
            total_candles,
            self._speed,
        )
        return session

    @staticmethod
    def _canonical_for(instrument) -> str:
        """
        Canonical pipeline symbol for an instrument.

        Equities/indices go through the shared symbol mapper so replay ticks
        land on exactly the same key live ticks would use.
        """
        itype = str(instrument.instrument_type or "").upper()
        tsym = str(instrument.trading_symbol or "").upper()

        if itype in ("EQUITY", "INDEX"):
            try:
                from providers.symbol_mapper import zebu_token_to_canonical

                canonical = zebu_token_to_canonical(
                    str(instrument.token or ""), str(instrument.exchange or "")
                )
                if canonical:
                    return canonical
            except Exception:
                pass
            return tsym.replace("-EQ", "")
        return tsym

    # ── Candle lookup ──────────────────────────────────────────────

    @staticmethod
    def candle_at_or_before(track: ReplayInstrument, sim_epoch: int) -> Optional[dict]:
        """
        The most recent candle at or before sim_epoch.

        Returns None when the simulated clock is still before the
        instrument's first candle. Never interpolates — the caller holds
        the returned candle's close as current state.
        """
        chosen = None
        for candle in track.candles:
            if candle["epoch"] <= sim_epoch:
                chosen = candle
            else:
                break
        return chosen

    # ── Current state (used by options routes) ─────────────────────

    def get_current_quote(self, instrument_key: str) -> Optional[dict]:
        """
        Latest replayed state for an instrument.

        Accepts "EXCHANGE:TRADING_SYMBOL", a bare trading symbol, or a token.
        Returns a Zebu-GetQuotes-shaped dict so existing normalizers work
        unchanged, or None when no replayed data exists.
        """
        if not instrument_key:
            return None
        raw = str(instrument_key).strip().upper()

        key = raw if raw in self._state else None
        if key is None:
            key = self._by_trading_symbol.get(raw)
        if key is None:
            key = self._by_token.get(str(instrument_key).strip())
        if key is None or key not in self._state:
            return None
        return dict(self._state[key])

    def get_option_quote(
        self, trading_symbol: str = "", token: str = ""
    ) -> Optional[dict]:
        """Convenience lookup for an option leg by trading symbol or token."""
        return self.get_current_quote(trading_symbol) or self.get_current_quote(token)

    def has_state(self) -> bool:
        return bool(self._state)

    # ── Quote construction ─────────────────────────────────────────

    def _build_equity_quote(self, track: ReplayInstrument, candle: dict) -> dict:
        """Mirror the shape ZebuProvider._handle_tick builds for equities."""
        prev = self._state.get(track.key) or {}
        close = candle["close"]
        # Day-open is the first candle's open; previous close is unavailable
        # from intraday candles alone, so day change is measured from the open.
        day_open = track.candles[0]["open"] if track.candles else candle["open"]
        change = round(close - day_open, 2)
        change_pct = round((change / day_open) * 100.0, 2) if day_open else 0.0

        day_high = max(c["high"] for c in track.candles[: track.cursor + 1]) if track.cursor >= 0 else candle["high"]
        day_low = min(c["low"] for c in track.candles[: track.cursor + 1]) if track.cursor >= 0 else candle["low"]
        cumulative_volume = sum(
            c["volume"] for c in track.candles[: track.cursor + 1]
        ) if track.cursor >= 0 else candle["volume"]

        token = track.token
        return {
            "symbol": track.canonical_symbol,
            "instrument_token": int(token) if token.isdigit() else token,
            "name": track.trading_symbol.replace("-EQ", ""),
            "price": close,
            "change": change,
            "change_percent": change_pct,
            "open": day_open,
            "high": day_high,
            "low": day_low,
            "close": day_open,
            "prev_close": day_open,
            "volume": int(cumulative_volume),
            # No bid/ask depth exists in candle data — carry forward, never invent.
            "bid_price": prev.get("bid_price", 0),
            "ask_price": prev.get("ask_price", 0),
            "bid_qty": prev.get("bid_qty", 0),
            "ask_qty": prev.get("ask_qty", 0),
            "oi": int(candle["open_interest"]) if candle["open_interest"] is not None else prev.get("oi", 0),
            "market_cap": 0,
            "exchange": track.exchange,
            "timestamp": datetime.fromtimestamp(
                self._sim_epoch or candle["epoch"], tz=timezone.utc
            ).isoformat(),
            "last_trade_time": str(candle["epoch"]),
            "source": REPLAY_SOURCE,
        }

    def _build_derivative_quote(self, track: ReplayInstrument, candle: dict) -> dict:
        """
        Mirror the FUTURES_QUOTE field set emitted by zebu_provider for live
        NFO/BFO ticks. Also used as options replay state.
        """
        prev = self._state.get(track.key) or {}
        close = candle["close"]
        day_open = track.candles[0]["open"] if track.candles else candle["open"]
        change = round(close - day_open, 2)
        change_pct = round((change / day_open) * 100.0, 2) if day_open else 0.0

        cumulative_volume = sum(
            c["volume"] for c in track.candles[: track.cursor + 1]
        ) if track.cursor >= 0 else candle["volume"]

        oi = candle["open_interest"]
        return {
            "contract_symbol": track.trading_symbol,
            "exchange": track.exchange,
            "token": track.token,
            "ltp": close,
            # Bid/ask are not present in candle data — hold, never fabricate.
            "bid": prev.get("bid", 0),
            "ask": prev.get("ask", 0),
            "spread": 0,
            "volume": int(cumulative_volume),
            "oi": int(oi) if oi is not None else prev.get("oi", 0),
            "open": day_open,
            "high": candle["high"],
            "low": candle["low"],
            "close": day_open,
            "change": change,
            "percent_change": change_pct,
            "avg_price": prev.get("avg_price", 0),
            "bid_qty": prev.get("bid_qty", 0),
            "ask_qty": prev.get("ask_qty", 0),
            "timestamp": datetime.fromtimestamp(
                self._sim_epoch or candle["epoch"], tz=timezone.utc
            ).isoformat(),
            "last_trade_time": str(candle["epoch"]),
            "source": REPLAY_SOURCE,
            # Fields consumed by routes/options.py normalizers (Zebu GetQuotes
            # key aliases) so option legs need no special-casing downstream.
            "tsym": track.trading_symbol,
            "lp": close,
            "c": day_open,
            "v": int(cumulative_volume),
            "stat": "Ok",
        }

    # ── Emission ───────────────────────────────────────────────────

    async def _emit_for_track(self, track: ReplayInstrument, candle: dict) -> None:
        """Publish one instrument's current state into the existing pipeline."""
        itype = track.instrument_type

        if itype in ("EQUITY", "INDEX"):
            quote = self._build_equity_quote(track, candle)
            self._state[track.key] = quote
            from market.quote_coordinator import quote_coordinator

            await quote_coordinator.ingest_equity_quote(
                track.canonical_symbol,
                quote,
                source=REPLAY_SOURCE,
                changed=True,
                emit_event=True,
            )
            self._stats["quotes_emitted"] += 1
            return

        quote = self._build_derivative_quote(track, candle)
        self._state[track.key] = quote

        if itype == "FUTURES":
            await event_bus.emit(
                Event(
                    type=EventType.FUTURES_QUOTE,
                    data={
                        "contract_symbol": track.trading_symbol,
                        "quote": quote,
                    },
                    source=REPLAY_SOURCE,
                )
            )
            self._stats["quotes_emitted"] += 1
            return

        # OPTIONS: no live tick pipeline exists. State is held in memory and
        # read by routes/options.py when MarketDataMode is SIMULATION.
        self._stats["quotes_emitted"] += 1

    # ── Clock advance ──────────────────────────────────────────────

    async def advance_to(self, sim_epoch: int) -> int:
        """
        Move the simulated clock to sim_epoch and publish any instrument
        whose in-effect candle changed.

        Instruments with no new candle keep their existing state (carry
        forward) — nothing is emitted for them and nothing is zero-filled.
        Returns the number of instruments that advanced.
        """
        self._sim_epoch = int(sim_epoch)
        advanced = 0

        for track in self._instruments.values():
            # Find the newest candle at or before the clock.
            new_cursor = track.cursor
            for idx in range(track.cursor + 1, len(track.candles)):
                if track.candles[idx]["epoch"] <= self._sim_epoch:
                    new_cursor = idx
                else:
                    break

            if new_cursor == track.cursor:
                continue  # Hold last known state — no fabrication.

            track.cursor = new_cursor
            try:
                await self._emit_for_track(track, track.candles[new_cursor])
                advanced += 1
            except Exception as exc:
                logger.warning(f"Replay emit failed for {track.key}: {exc}")

        self._stats["ticks"] += 1
        return advanced

    def session_end_epoch(self) -> Optional[int]:
        if not self._simulation_date:
            return None
        return int(
            datetime.combine(self._simulation_date, SESSION_END, tzinfo=IST).timestamp()
        )

    # ── Lifecycle ──────────────────────────────────────────────────

    async def start(self, db=None) -> None:
        """Begin replaying. Requires a loaded session."""
        if self._simulation_date is None:
            raise RuntimeError("No simulation session loaded")
        self._status = SIM_RUNNING
        self._running = True
        await self._persist_status(db)
        logger.info(f"Replay started for {self._simulation_date} at {self._speed}x")

    async def pause(self, db=None) -> None:
        self._status = SIM_PAUSED
        await self._persist_status(db)

    async def resume(self, db=None) -> None:
        if self._simulation_date is None:
            raise RuntimeError("No simulation session loaded")
        self._status = SIM_RUNNING
        await self._persist_status(db)

    async def stop(self, db=None) -> None:
        self._running = False
        self._status = SIM_ENDED
        if self._task and not self._task.done():
            self._task.cancel()
        await self._persist_status(db, ended=True)
        logger.info("Replay stopped")

    def set_speed(self, speed: float) -> float:
        """Speed is a plain multiplier on the wall-clock-to-sim-time ratio."""
        value = float(speed)
        if value <= 0:
            raise ValueError("speed must be positive")
        self._speed = value
        return self._speed

    async def _persist_status(self, db, ended: bool = False) -> None:
        if db is None or self._session_id is None:
            return
        try:
            session = (
                await db.execute(
                    select(SimulationSession).where(
                        SimulationSession.id == self._session_id
                    )
                )
            ).scalar_one_or_none()
            if session is None:
                return
            session.status = self._status
            session.speed = self._speed
            session.simulation_time = self.get_simulation_time()
            if self._status == SIM_RUNNING and session.started_at is None:
                session.started_at = datetime.now(timezone.utc)
            if ended:
                session.ended_at = datetime.now(timezone.utc)
            await db.flush()
        except Exception as exc:
            logger.debug(f"Could not persist simulation session status: {exc}")

    # ── Main loop ──────────────────────────────────────────────────

    async def run(self) -> None:
        """
        Replay loop — advances the simulated clock in real time, scaled by
        `speed`, and publishes candles as they come into effect.

        Only runs while MarketDataMode is SIMULATION; if the mode is switched
        back to LIVE the loop stops driving the pipeline immediately.
        """
        end_epoch = self.session_end_epoch()
        if end_epoch is None:
            logger.warning("Replay run() called with no loaded session")
            return

        logger.info("Replay loop running")
        while self._running:
            try:
                await asyncio.sleep(TICK_INTERVAL_SEC)
                self._stats["loops"] += 1

                if self._status != SIM_RUNNING:
                    continue

                # Mode is authoritative — never drive the pipeline in LIVE.
                if not market_data_mode.is_simulation():
                    continue

                next_epoch = int(
                    (self._sim_epoch or 0) + SIM_SECONDS_PER_TICK * self._speed
                )
                if next_epoch > end_epoch:
                    await self.advance_to(end_epoch)
                    logger.info("Replay reached session end")
                    self._running = False
                    self._status = SIM_ENDED
                    break

                await self.advance_to(next_epoch)

            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error(f"Replay loop error: {exc}", exc_info=True)

        logger.info("Replay loop stopped")

    def reset(self) -> None:
        """Clear all in-memory replay state (used by tests)."""
        self._running = False
        self._status = SIM_READY
        self._session_id = None
        self._simulation_date = None
        self._sim_epoch = None
        self._speed = 1.0
        self._instruments.clear()
        self._state.clear()
        self._by_trading_symbol.clear()
        self._by_token.clear()
        self._stats = {"ticks": 0, "quotes_emitted": 0, "loops": 0}


# ── Singleton ──────────────────────────────────────────────────────
historical_replay_engine = HistoricalReplayEngine()
