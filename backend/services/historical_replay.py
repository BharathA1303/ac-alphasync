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
from time import monotonic as _monotonic
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

# Wall-clock seconds between replay loop iterations (500ms for high responsiveness).
TICK_INTERVAL_SEC = 0.5
# Simulated seconds advanced per loop iteration at speed=1.
SIM_SECONDS_PER_TICK = 1.0


def _interpolate_candle_price(candle: dict, sim_epoch: int) -> float:
    """Interpolate intra-minute price smoothly across open, high, low, close."""
    c_open = candle["open"]
    c_high = candle["high"]
    c_low = candle["low"]
    c_close = candle["close"]

    c_epoch = candle["epoch"]
    offset = int(sim_epoch) - int(c_epoch)
    if offset <= 0 or offset >= 59 or c_open == c_high == c_low == c_close:
        return c_close

    progress = offset / 59.0

    if c_close >= c_open:
        # Bullish candle: open -> low -> high -> close
        if progress < 0.25:
            t = progress / 0.25
            return round(c_open + (c_low - c_open) * t, 2)
        elif progress < 0.75:
            t = (progress - 0.25) / 0.50
            return round(c_low + (c_high - c_low) * t, 2)
        else:
            t = (progress - 0.75) / 0.25
            return round(c_high + (c_close - c_high) * t, 2)
    else:
        # Bearish candle: open -> high -> low -> close
        if progress < 0.25:
            t = progress / 0.25
            return round(c_open + (c_high - c_open) * t, 2)
        elif progress < 0.75:
            t = (progress - 0.25) / 0.50
            return round(c_high + (c_low - c_high) * t, 2)
        else:
            t = (progress - 0.75) / 0.25
            return round(c_low + (c_close - c_low) * t, 2)


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
    last_emitted_price: Optional[float] = None

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
        # Sub-second remainder carried between ticks so fractional speeds
        # (and non-integer speed changes) never truncate away.
        self._sim_fraction: float = 0.0
        self._speed: float = 1.0
        self._status: str = SIM_READY
        self._instruments: dict[str, ReplayInstrument] = {}
        # Latest emitted state per instrument key — the "current quote".
        self._state: dict[str, dict] = {}
        # Secondary indexes for fast symbol resolution.
        self._by_trading_symbol: dict[str, str] = {}
        self._by_canonical: dict[str, str] = {}
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
        sync_clock: bool = False,
    ) -> SimulationSession:
        """
        Load all stored candles for the simulation date plus prior available trading
        dates into memory and create (or reuse) the SimulationSession row.
        """
        self._simulation_date = simulation_date
        self._speed = float(speed) if speed and float(speed) > 0 else 1.0
        self._sim_fraction = 0.0
        self._instruments.clear()
        self._state.clear()
        self._by_trading_symbol.clear()
        self._by_canonical.clear()
        self._by_token.clear()

        # Load the simulation date plus available prior trading days (for rich multi-day chart depth)
        rows = (
            await db.execute(
                select(HistoricalCandle, Instrument)
                .join(Instrument, HistoricalCandle.instrument_id == Instrument.id)
                .where(HistoricalCandle.trading_date <= simulation_date)
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
                self._by_canonical[track.canonical_symbol] = key
                if track.canonical_symbol.endswith(".NS"):
                    self._by_canonical[track.canonical_symbol.replace(".NS", "")] = key
                if track.canonical_symbol.endswith(".BO"):
                    self._by_canonical[track.canonical_symbol.replace(".BO", "")] = key
                if track.trading_symbol.endswith("-EQ"):
                    self._by_canonical[track.trading_symbol.replace("-EQ", "")] = key
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
            track.last_emitted_price = None

        if sync_clock:
            now_ist = datetime.now(IST)
            cur_time = now_ist.time()
            if SESSION_START <= cur_time <= SESSION_END:
                self._sim_epoch = int(
                    datetime.combine(simulation_date, cur_time, tzinfo=IST).timestamp()
                )
            elif cur_time > SESSION_END:
                self._sim_epoch = int(
                    datetime.combine(simulation_date, SESSION_END, tzinfo=IST).timestamp()
                )
            else:
                self._sim_epoch = int(
                    datetime.combine(simulation_date, SESSION_START, tzinfo=IST).timestamp()
                )
        else:
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

        Equities/indices must resolve to exactly the same key the frontend
        queries by (services.market_data._format_symbol("RELIANCE") ->
        "RELIANCE.NS", the same normalization the API layer applies to
        every incoming symbol) and exactly the same key live ticks would
        use — but WITHOUT depending on providers.symbol_mapper's live
        token table. That table is populated by live contract-loading
        activity (NSE/BSE master downloads, live WS registration) which
        barely runs under the "no live data, ever" architecture, so it is
        near-empty in practice: confirmed in production, only ~10 entries
        (the pre-seeded indices) existed while 54 real equities had
        already loaded into replay. Every one of those 54 fell back to
        the bare, un-suffixed trading symbol (e.g. "RELIANCE" instead of
        "RELIANCE.NS"), which the API never queries by, so no equity
        quote was ever reachable despite replaying correctly internally.

        _format_symbol() has no such dependency — it is a pure function
        of the symbol string — so it is the reliable source of truth here.
        """
        itype = str(instrument.instrument_type or "").upper()
        tsym = str(instrument.trading_symbol or "").upper()

        if itype == "EQUITY":
            from services.market_data import _format_symbol

            # trading_symbol carries Zebu's "-EQ" suffix (e.g.
            # "RELIANCE-EQ"); strip it before handing to _format_symbol,
            # which expects a bare symbol and appends ".NS" itself.
            bare = tsym[:-3] if tsym.endswith("-EQ") else tsym
            return _format_symbol(bare)

        if itype == "INDEX":
            from services.market_data import _format_symbol

            # underlying carries the clean index name (NIFTY, BANKNIFTY,
            # SENSEX, CNXIT, ...) that _format_symbol's INDEX_ALIAS_MAP is
            # keyed on — trading_symbol ("NIFTY 50", "NIFTY IT") is not.
            underlying = str(instrument.underlying or "").upper().strip()
            return _format_symbol(underlying or tsym)

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
        """Mirror the shape ZebuProvider._handle_tick builds for equities with intra-bar micro-ticks."""
        prev = self._state.get(track.key) or {}
        sim_ts = self._sim_epoch or candle["epoch"]
        close = _interpolate_candle_price(candle, sim_ts)
        
        # Day-open is the first candle's open; day change is measured from the open.
        day_open = track.candles[0]["open"] if track.candles else candle["open"]
        change = round(close - day_open, 2)
        change_pct = round((change / day_open) * 100.0, 2) if day_open else 0.0

        elapsed = track.candles[: track.cursor + 1] if track.cursor >= 0 else [candle]
        day_high = max(max(c["high"] for c in elapsed), close)
        day_low = min(min(c["low"] for c in elapsed), close)
        cumulative_volume = sum(c["volume"] for c in elapsed)

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
            # `timestamp` is PUBLISH (wall-clock) time.
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "simulated_timestamp": datetime.fromtimestamp(
                sim_ts, tz=timezone.utc
            ).isoformat(),
            "last_trade_time": str(sim_ts),
            "source": REPLAY_SOURCE,
        }

    def _build_derivative_quote(self, track: ReplayInstrument, candle: dict) -> dict:
        """
        Mirror the FUTURES_QUOTE field set emitted by zebu_provider for live
        NFO/BFO ticks. Also used as options replay state.
        """
        prev = self._state.get(track.key) or {}
        sim_ts = self._sim_epoch or candle["epoch"]
        close = _interpolate_candle_price(candle, sim_ts)
        
        day_open = track.candles[0]["open"] if track.candles else candle["open"]
        change = round(close - day_open, 2)
        change_pct = round((change / day_open) * 100.0, 2) if day_open else 0.0

        elapsed = track.candles[: track.cursor + 1] if track.cursor >= 0 else [candle]
        day_high = max(max(c["high"] for c in elapsed), close)
        day_low = min(min(c["low"] for c in elapsed), close)
        cumulative_volume = sum(c["volume"] for c in elapsed)

        oi = candle["open_interest"]
        return {
            "contract_symbol": track.trading_symbol,
            "exchange": track.exchange,
            "token": track.token,
            "ltp": close,
            "bid": prev.get("bid", 0),
            "ask": prev.get("ask", 0),
            "spread": 0,
            "volume": int(cumulative_volume),
            "oi": int(oi) if oi is not None else prev.get("oi", 0),
            "open": day_open,
            "high": day_high,
            "low": day_low,
            "close": day_open,
            "change": change,
            "percent_change": change_pct,
            "avg_price": prev.get("avg_price", 0),
            "bid_qty": prev.get("bid_qty", 0),
            "ask_qty": prev.get("ask_qty", 0),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "simulated_timestamp": datetime.fromtimestamp(
                sim_ts, tz=timezone.utc
            ).isoformat(),
            "last_trade_time": str(sim_ts),
            "source": REPLAY_SOURCE,
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

        self._stats["quotes_emitted"] += 1

    # ── Clock advance ──────────────────────────────────────────────

    async def advance_to(self, sim_epoch: int) -> int:
        """
        Move the simulated clock to sim_epoch and publish any instrument
        whose in-effect candle or intra-bar price changed.
        """
        self._sim_epoch = int(sim_epoch)
        advanced = 0

        for track in self._instruments.values():
            if not track.candles:
                continue

            # Find the newest candle at or before the clock.
            new_cursor = -1
            for idx in range(len(track.candles)):
                if track.candles[idx]["epoch"] <= self._sim_epoch:
                    new_cursor = idx
                else:
                    break

            if new_cursor < 0:
                continue

            candle = track.candles[new_cursor]
            cur_price = _interpolate_candle_price(candle, self._sim_epoch)

            # Emit whenever candle changes OR interpolated price changes
            if new_cursor != track.cursor or track.last_emitted_price != cur_price:
                track.cursor = new_cursor
                track.last_emitted_price = cur_price
                try:
                    await self._emit_for_track(track, candle)
                    advanced += 1
                except Exception as exc:
                    logger.warning(f"Replay emit failed for {track.key}: {exc}")

        self._stats["ticks"] += 1
        return advanced

    def get_candles_up_to(
        self, symbol: str, period: str = "1d", interval: str = "1d"
    ) -> list[dict]:
        """
        Return replayed candles up to the current simulation epoch.
        Aggregates 1-minute bars into requested interval (5m, 15m, 1h, 1d).
        """
        if not self._simulation_date or not self._instruments:
            return []

        raw = str(symbol or "").strip().upper()
        key = self._by_canonical.get(raw) or self._by_trading_symbol.get(raw) or self._by_token.get(raw)
        track = self._instruments.get(key) if key else None

        if track is None:
            for t in self._instruments.values():
                if (
                    t.canonical_symbol == raw
                    or t.trading_symbol == raw
                    or t.key == raw
                    or raw in (t.canonical_symbol.replace(".NS", ""), t.canonical_symbol.replace(".BO", ""), t.trading_symbol.replace("-EQ", ""))
                ):
                    track = t
                    break

        if track is None or not track.candles:
            return []

        cutoff = self._sim_epoch or track.candles[-1]["epoch"]
        if period == "1d":
            session_start = int(
                datetime.combine(self._simulation_date, SESSION_START, tzinfo=IST).timestamp()
            )
            bars = [c for c in track.candles if session_start <= c["epoch"] <= cutoff]
        else:
            bars = [c for c in track.candles if c["epoch"] <= cutoff]

        if not bars:
            return []

        # Determine interval in seconds
        interval_seconds = 60
        if interval == "2m":
            interval_seconds = 120
        elif interval == "3m":
            interval_seconds = 180
        elif interval == "5m":
            interval_seconds = 300
        elif interval == "10m":
            interval_seconds = 600
        elif interval == "15m":
            interval_seconds = 900
        elif interval == "30m":
            interval_seconds = 1800
        elif interval == "1h":
            interval_seconds = 3600
        elif interval == "2h":
            interval_seconds = 7200
        elif interval == "4h":
            interval_seconds = 14400
        elif interval in ("1d", "1wk", "1mo"):
            interval_seconds = 86400

        if interval_seconds == 60:
            res = [
                {
                    "time": b["epoch"],
                    "open": b["open"],
                    "high": b["high"],
                    "low": b["low"],
                    "close": b["close"],
                    "volume": b["volume"],
                }
                for b in bars
            ]
            if res:
                cur_price = _interpolate_candle_price(bars[-1], cutoff)
                res[-1]["close"] = round(cur_price, 2)
                res[-1]["high"] = round(max(res[-1]["high"], cur_price), 2)
                res[-1]["low"] = round(min(res[-1]["low"], cur_price), 2)
            return res

        # Aggregate 1m bars into interval buckets
        aggregated = []
        current_bucket = None
        c_open = c_high = c_low = c_close = c_vol = 0

        for b in bars:
            bucket_time = (b["epoch"] // interval_seconds) * interval_seconds
            if current_bucket is None or bucket_time != current_bucket:
                if current_bucket is not None:
                    aggregated.append({
                        "time": current_bucket,
                        "open": round(c_open, 2),
                        "high": round(c_high, 2),
                        "low": round(c_low, 2),
                        "close": round(c_close, 2),
                        "volume": int(c_vol),
                    })
                current_bucket = bucket_time
                c_open = b["open"]
                c_high = b["high"]
                c_low = b["low"]
                c_close = b["close"]
                c_vol = b["volume"]
            else:
                c_high = max(c_high, b["high"])
                c_low = min(c_low, b["low"])
                c_close = b["close"]
                c_vol += b["volume"]

        if current_bucket is not None:
            cur_price = _interpolate_candle_price(bars[-1], cutoff)
            aggregated.append({
                "time": current_bucket,
                "open": round(c_open, 2),
                "high": round(max(c_high, cur_price), 2),
                "low": round(min(c_low, cur_price), 2),
                "close": round(cur_price, 2),
                "volume": int(c_vol),
            })

        return aggregated

    def _advance_clock(self, elapsed_wall_seconds: float) -> int:
        """
        Next simulated epoch after `elapsed_wall_seconds` of real time.

        simulated_delta = elapsed_wall * speed, with the sub-second
        remainder carried across ticks so fractional speeds accumulate
        correctly instead of being truncated to zero every iteration.
        """
        delta = float(elapsed_wall_seconds) * float(self._speed) + self._sim_fraction
        whole = int(delta)
        self._sim_fraction = delta - whole
        return int(self._sim_epoch or 0) + whole

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
        self._sim_fraction = 0.0
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
        Replay loop — advances the simulated clock in real time 1:1 with IST wall-clock.
        """
        end_epoch = self.session_end_epoch()
        if end_epoch is None:
            logger.warning("Replay run() called with no loaded session")
            return

        logger.info("Replay loop running (1:1 real-time broker simulation)")
        last_wall = _monotonic()
        while self._running:
            try:
                await asyncio.sleep(TICK_INTERVAL_SEC)
                self._stats["loops"] += 1

                if self._status != SIM_RUNNING:
                    continue

                if not market_data_mode.is_simulation():
                    continue

                if self._speed == 1.0:
                    now_ist = datetime.now(IST)
                    cur_time = now_ist.time()
                    if cur_time < SESSION_START:
                        target_epoch = int(
                            datetime.combine(self._simulation_date, SESSION_START, tzinfo=IST).timestamp()
                        )
                    elif cur_time >= SESSION_END:
                        target_epoch = int(
                            datetime.combine(self._simulation_date, SESSION_END, tzinfo=IST).timestamp()
                        )
                        await self.advance_to(target_epoch)
                        logger.info("Replay reached session end (15:30 IST) — holding frozen close")
                        self._running = False
                        self._status = SIM_ENDED
                        break
                    else:
                        target_epoch = int(
                            datetime.combine(self._simulation_date, cur_time, tzinfo=IST).timestamp()
                        )
                    next_epoch = target_epoch
                else:
                    now_wall = _monotonic()
                    elapsed = now_wall - last_wall
                    last_wall = now_wall
                    next_epoch = self._advance_clock(elapsed)
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
        self._sim_fraction = 0.0
        self._speed = 1.0
        self._instruments.clear()
        self._state.clear()
        self._by_trading_symbol.clear()
        self._by_token.clear()
        self._stats = {"ticks": 0, "quotes_emitted": 0, "loops": 0}


# ── Singleton ──────────────────────────────────────────────────────
historical_replay_engine = HistoricalReplayEngine()
