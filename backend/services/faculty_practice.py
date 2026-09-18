"""
Faculty practice overlay — assigned students see candles from their faculty's
date window instead of the global replay clock.

Independent traders and students with no window keep the existing global replay.
Quotes are never fabricated: missing days stay missing.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from engines.market_session import IST
from models.faculty_practice import WINDOW_ACTIVE, FacultyPracticeWindow
from models.market_data import HistoricalCandle, Instrument
from models.user import User
from services.historical_downloader import (
    dates_with_candles,
    historical_downloader,
    is_trading_day,
    latest_complete_trading_day,
    trading_days_between,
)
from workers.historical_retention_worker import RETENTION_DAYS

logger = logging.getLogger(__name__)

SESSION_START = time(9, 15)
SESSION_END = time(15, 30)

# In-memory: faculty_id -> {symbol_key: [{epoch, ohlcv...}, ...]}
_candle_cache: dict[str, dict[str, list[dict]]] = {}
_cache_dates: dict[str, date] = {}
# student_id -> faculty_id for overlay users
_student_faculty: dict[str, str] = {}
_windows: dict[str, FacultyPracticeWindow] = {}
_download_jobs: dict[str, dict] = {}


def practice_min_date(today: Optional[date] = None) -> date:
    today = today or datetime.now(IST).date()
    return today - timedelta(days=RETENTION_DAYS)


def practice_max_date() -> date:
    return latest_complete_trading_day()


def _uid(value) -> str:
    return str(value)


def is_overlay_user(user_id: Optional[str]) -> bool:
    if not user_id:
        return False
    return str(user_id) in _student_faculty


def overlay_faculty_id(user_id: Optional[str]) -> Optional[str]:
    if not user_id:
        return None
    return _student_faculty.get(str(user_id))


async def refresh_overlay_index(db: AsyncSession) -> None:
    """Reload active windows and assigned student -> faculty map."""
    global _student_faculty, _windows
    win_rows = (
        await db.execute(
            select(FacultyPracticeWindow).where(
                FacultyPracticeWindow.status == WINDOW_ACTIVE
            )
        )
    ).scalars().all()
    windows = { _uid(w.faculty_id): w for w in win_rows }

    faculty_ids = [w.faculty_id for w in win_rows]
    student_map: dict[str, str] = {}
    if faculty_ids:
        students = (
            await db.execute(
                select(User.id, User.assigned_faculty_id).where(
                    User.role == "student",
                    User.is_active == True,  # noqa: E712
                    User.assigned_faculty_id.in_(faculty_ids),
                )
            )
        ).all()
        for sid, fid in students:
            if fid:
                student_map[_uid(sid)] = _uid(fid)

    _windows = windows
    _student_faculty = student_map


def mapped_epoch(window: FacultyPracticeWindow, now: Optional[datetime] = None) -> int:
    """Wall-clock IST time-of-day mapped onto the faculty's current practice date."""
    now = now or datetime.now(IST)
    if now.tzinfo is None:
        now = now.replace(tzinfo=IST)
    else:
        now = now.astimezone(IST)

    current = window.current_date or window.start_date
    t = now.time()
    if t < SESSION_START:
        t = SESSION_START
    elif t > SESSION_END:
        t = SESSION_END
    return int(datetime.combine(current, t, tzinfo=IST).timestamp())


def _symbol_keys(symbol: str) -> list[str]:
    raw = (symbol or "").strip().upper()
    if not raw:
        return []
    keys = {raw}
    bare = raw.replace(".NS", "").replace(".BO", "").replace("-EQ", "")
    if ":" in bare:
        bare = bare.split(":", 1)[-1]
    keys.add(bare)
    keys.add(f"{bare}.NS")
    keys.add(f"{bare}.BO")
    keys.add(f"{bare}-EQ")
    keys.add(f"NSE:{bare}")
    keys.add(f"NSE:{bare}-EQ")
    return [k for k in keys if k]


def _pick_candle(bars: list[dict], epoch: int) -> Optional[dict]:
    chosen = None
    for bar in bars:
        if bar["epoch"] <= epoch:
            chosen = bar
        else:
            break
    return chosen


def _quote_from_candle(symbol: str, bars: list[dict], candle: dict) -> dict:
    day_open = bars[0]["open"] if bars else candle["open"]
    elapsed = [c for c in bars if c["epoch"] <= candle["epoch"]]
    close = float(candle["close"])
    change = round(close - day_open, 2)
    change_pct = round((change / day_open) * 100.0, 2) if day_open else 0.0
    day_high = max(c["high"] for c in elapsed) if elapsed else candle["high"]
    day_low = min(c["low"] for c in elapsed) if elapsed else candle["low"]
    volume = sum(int(c.get("volume") or 0) for c in elapsed)
    return {
        "symbol": symbol,
        "name": symbol.replace(".NS", "").replace(".BO", "").replace("-EQ", ""),
        "price": close,
        "ltp": close,
        "change": change,
        "change_percent": change_pct,
        "open": day_open,
        "high": day_high,
        "low": day_low,
        "close": day_open,
        "prev_close": day_open,
        "volume": volume,
        "timestamp": candle["epoch"],
        "source": "faculty_practice",
    }


async def _load_faculty_day(db: AsyncSession, faculty_id: str, trading_day: date) -> dict[str, list[dict]]:
    rows = (
        await db.execute(
            select(HistoricalCandle, Instrument)
            .join(Instrument, HistoricalCandle.instrument_id == Instrument.id)
            .where(HistoricalCandle.trading_date == trading_day)
            .order_by(HistoricalCandle.timestamp)
        )
    ).all()

    by_key: dict[str, list[dict]] = {}
    for candle, instrument in rows:
        tsym = str(instrument.trading_symbol or "").upper()
        canonical = tsym.replace("-EQ", "")
        if instrument.exchange == "NSE":
            canonical = f"{canonical}.NS"
        elif instrument.exchange == "BSE":
            canonical = f"{canonical}.BO"
        bar = {
            "epoch": int(
                (candle.timestamp.replace(tzinfo=candle.timestamp.tzinfo or timezone.utc)).timestamp()
            ),
            "open": float(candle.open),
            "high": float(candle.high),
            "low": float(candle.low),
            "close": float(candle.close),
            "volume": int(candle.volume or 0),
        }
        for key in (tsym, canonical, tsym.replace("-EQ", ""), canonical.replace(".NS", "").replace(".BO", "")):
            by_key.setdefault(key, []).append(bar)
    return by_key


async def _ensure_cache(db: AsyncSession, faculty_id: str, window: FacultyPracticeWindow) -> dict[str, list[dict]]:
    current = window.current_date or window.start_date
    if _cache_dates.get(faculty_id) == current and faculty_id in _candle_cache:
        return _candle_cache[faculty_id]
    loaded = await _load_faculty_day(db, faculty_id, current)
    _candle_cache[faculty_id] = loaded
    _cache_dates[faculty_id] = current
    return loaded


async def quote_for_user(
    db: AsyncSession, user_id: Optional[str], symbol: str
) -> Optional[dict]:
    """Return overlay quote for an assigned student, or None to use global replay."""
    faculty_id = overlay_faculty_id(user_id)
    if not faculty_id:
        return None
    window = _windows.get(faculty_id)
    if window is None or window.status != WINDOW_ACTIVE:
        return None
    cache = await _ensure_cache(db, faculty_id, window)
    epoch = mapped_epoch(window)
    bars = None
    for key in _symbol_keys(symbol):
        if key in cache:
            bars = cache[key]
            break
    if not bars:
        return None
    candle = _pick_candle(bars, epoch)
    if candle is None:
        return None
    return _quote_from_candle(symbol, bars, candle)


def quote_for_user_cached(user_id: Optional[str], symbol: str) -> Optional[dict]:
    """Sync lookup used on the websocket hot path (cache must already be warm)."""
    faculty_id = overlay_faculty_id(user_id)
    if not faculty_id:
        return None
    window = _windows.get(faculty_id)
    if window is None:
        return None
    cache = _candle_cache.get(faculty_id) or {}
    bars = None
    for key in _symbol_keys(symbol):
        if key in cache:
            bars = cache[key]
            break
    if not bars:
        return None
    candle = _pick_candle(bars, mapped_epoch(window))
    if candle is None:
        return None
    return _quote_from_candle(symbol, bars, candle)


def _aggregate_bars(bars: list[dict], interval_seconds: int) -> list[dict]:
    if interval_seconds <= 60:
        return [
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
    buckets: dict[int, dict] = {}
    order = []
    for b in bars:
        bucket = (b["epoch"] // interval_seconds) * interval_seconds
        if bucket not in buckets:
            buckets[bucket] = {
                "time": bucket,
                "open": b["open"],
                "high": b["high"],
                "low": b["low"],
                "close": b["close"],
                "volume": b["volume"],
            }
            order.append(bucket)
        else:
            agg = buckets[bucket]
            agg["high"] = max(agg["high"], b["high"])
            agg["low"] = min(agg["low"], b["low"])
            agg["close"] = b["close"]
            agg["volume"] += b["volume"]
    return [buckets[k] for k in order]


_INTERVAL_SECONDS = {
    "1m": 60,
    "2m": 120,
    "3m": 180,
    "5m": 300,
    "10m": 600,
    "15m": 900,
    "30m": 1800,
    "1h": 3600,
    "2h": 7200,
    "4h": 14400,
    "1d": 86400,
}


async def candles_for_user(
    db: AsyncSession,
    user_id: Optional[str],
    symbol: str,
    period: str = "1d",
    interval: str = "1m",
) -> Optional[list[dict]]:
    faculty_id = overlay_faculty_id(user_id)
    if not faculty_id:
        return None
    window = _windows.get(faculty_id)
    if window is None:
        return None

    current = window.current_date or window.start_date
    start = window.start_date if period != "1d" else current
    end = current
    rows = (
        await db.execute(
            select(HistoricalCandle, Instrument)
            .join(Instrument, HistoricalCandle.instrument_id == Instrument.id)
            .where(
                HistoricalCandle.trading_date >= start,
                HistoricalCandle.trading_date <= end,
            )
            .order_by(HistoricalCandle.timestamp)
        )
    ).all()

    keys = set(_symbol_keys(symbol))
    bars = []
    cutoff = mapped_epoch(window)
    for candle, instrument in rows:
        tsym = str(instrument.trading_symbol or "").upper()
        canonical = tsym.replace("-EQ", "")
        if instrument.exchange == "NSE":
            canonical = f"{canonical}.NS"
        elif instrument.exchange == "BSE":
            canonical = f"{canonical}.BO"
        if not keys.intersection({tsym, canonical, tsym.replace("-EQ", ""), canonical.replace(".NS", "").replace(".BO", "")}):
            continue
        epoch = int(
            (candle.timestamp.replace(tzinfo=candle.timestamp.tzinfo or timezone.utc)).timestamp()
        )
        if epoch > cutoff:
            continue
        bars.append(
            {
                "epoch": epoch,
                "open": float(candle.open),
                "high": float(candle.high),
                "low": float(candle.low),
                "close": float(candle.close),
                "volume": int(candle.volume or 0),
            }
        )
    if not bars:
        return []
    seconds = _INTERVAL_SECONDS.get(interval, 60)
    return _aggregate_bars(bars, seconds)


def serialize_window(window: Optional[FacultyPracticeWindow], extra: Optional[dict] = None) -> Optional[dict]:
    if window is None:
        return None
    payload = {
        "id": str(window.id),
        "faculty_id": str(window.faculty_id),
        "institution_id": str(window.institution_id),
        "start_date": window.start_date.isoformat(),
        "end_date": window.end_date.isoformat(),
        "current_date": window.current_date.isoformat() if window.current_date else None,
        "status": window.status,
    }
    if extra:
        payload.update(extra)
    return payload


async def list_picker_dates(db: AsyncSession) -> dict:
    min_d = practice_min_date()
    max_d = practice_max_date()
    days = trading_days_between(min_d, max_d)
    coverage = await dates_with_candles(db, min_d, max_d)
    return {
        "min_date": min_d.isoformat(),
        "max_date": max_d.isoformat(),
        "retention_days": RETENTION_DAYS,
        "dates": [
            {
                "date": d.isoformat(),
                "available": coverage.get(d, 0) > 0,
                "candle_count": coverage.get(d, 0),
            }
            for d in days
        ],
    }


async def get_window_for_faculty(
    db: AsyncSession, faculty_id
) -> Optional[FacultyPracticeWindow]:
    return (
        await db.execute(
            select(FacultyPracticeWindow).where(
                FacultyPracticeWindow.faculty_id == faculty_id
            )
        )
    ).scalar_one_or_none()


async def set_practice_window(
    db: AsyncSession,
    faculty: User,
    start: date,
    end: date,
) -> dict:
    min_d = practice_min_date()
    max_d = practice_max_date()
    if start > end:
        return {"success": False, "error": "Start date must be on or before end date"}
    if start < min_d or end > max_d:
        return {
            "success": False,
            "error": (
                f"Practice dates must be within the last {RETENTION_DAYS} days "
                f"({min_d.isoformat()} to {max_d.isoformat()})."
            ),
        }

    trading = trading_days_between(start, end)
    if not trading:
        return {"success": False, "error": "No trading days in that range"}

    coverage = await dates_with_candles(db, start, end)
    missing = [d for d in trading if coverage.get(d, 0) <= 0]

    window = await get_window_for_faculty(db, faculty.id)
    first_ready = next((d for d in trading if coverage.get(d, 0) > 0), trading[0])
    now = datetime.now(timezone.utc)
    if window is None:
        window = FacultyPracticeWindow(
            faculty_id=faculty.id,
            institution_id=faculty.institution_id,
            start_date=start,
            end_date=end,
            current_date=first_ready,
            status=WINDOW_ACTIVE,
        )
        db.add(window)
    else:
        window.start_date = start
        window.end_date = end
        window.current_date = first_ready
        window.status = WINDOW_ACTIVE
        window.updated_at = now
    await db.flush()

    job = {
        "faculty_id": str(faculty.id),
        "status": "ready" if not missing else "downloading",
        "missing": [d.isoformat() for d in missing],
        "error": None,
    }
    _download_jobs[str(faculty.id)] = job
    await db.commit()
    await refresh_overlay_index(db)

    if missing:
        try:
            from services.broker_session import broker_session_manager

            can_download = broker_session_manager.get_any_session() is not None
        except Exception:
            can_download = False
        if can_download:
            asyncio.create_task(_download_missing_days(str(faculty.id), start, end))
        else:
            job["status"] = "unavailable"
            job["error"] = "this date is not available"
            _download_jobs[str(faculty.id)] = job

    return {
        "success": True,
        "window": serialize_window(window, {"download": job}),
        "missing_days": [d.isoformat() for d in missing],
        "message": (
            "Practice window saved. Missing days are downloading from Zebu."
            if missing
            else "Practice window saved."
        ),
    }


async def _download_missing_days(faculty_id: str, start: date, end: date) -> None:
    from database.connection import async_session_factory
    from services.historical_downloader import historical_downloader

    job = _download_jobs.get(faculty_id) or {}
    job["status"] = "downloading"
    _download_jobs[faculty_id] = job
    try:
        async with async_session_factory() as db:
            summary = await historical_downloader.download_range(db, start, end)
            coverage = await dates_with_candles(db, start, end)
            empty = [
                d["trading_date"]
                for d in summary.get("days", [])
                if d.get("status") not in ("skipped",) and d.get("rows", 0) == 0
            ]
            still_missing = [
                d.isoformat()
                for d in trading_days_between(start, end)
                if coverage.get(d, 0) <= 0
            ]
            job["status"] = "ready" if not still_missing else "partial"
            job["empty"] = empty
            job["missing"] = still_missing
            job["summary"] = {
                "downloaded": summary.get("downloaded"),
                "skipped": summary.get("skipped"),
                "empty": summary.get("empty"),
            }
            window = await get_window_for_faculty(db, UUID(faculty_id))
            if window is not None:
                ready = next(
                    (d for d in trading_days_between(start, end) if coverage.get(d, 0) > 0),
                    None,
                )
                if ready:
                    window.current_date = ready
                    await db.commit()
            await refresh_overlay_index(db)
            if window is not None:
                await _ensure_cache(db, faculty_id, window)
    except Exception as exc:
        logger.error("Faculty practice download failed for %s: %s", faculty_id, exc, exc_info=True)
        job["status"] = "failed"
        job["error"] = str(exc)
    _download_jobs[faculty_id] = job


async def clear_practice_window(db: AsyncSession, faculty: User) -> dict:
    window = await get_window_for_faculty(db, faculty.id)
    if window is None:
        return {"success": True, "window": None}
    window.status = "inactive"
    window.updated_at = datetime.now(timezone.utc)
    await db.commit()
    fid = str(faculty.id)
    _candle_cache.pop(fid, None)
    _cache_dates.pop(fid, None)
    _windows.pop(fid, None)
    await refresh_overlay_index(db)
    return {"success": True, "window": serialize_window(window)}


async def advance_windows_after_session(db: AsyncSession) -> None:
    """Move each active window to the next trading day in its range after NSE close."""
    windows = (
        await db.execute(
            select(FacultyPracticeWindow).where(
                FacultyPracticeWindow.status == WINDOW_ACTIVE
            )
        )
    ).scalars().all()
    changed = False
    for window in windows:
        days = trading_days_between(window.start_date, window.end_date)
        if not days:
            continue
        current = window.current_date or window.start_date
        nxt = None
        for d in days:
            if d > current:
                nxt = d
                break
        if nxt is None:
            continue
        window.current_date = nxt
        window.updated_at = datetime.now(timezone.utc)
        changed = True
        _candle_cache.pop(str(window.faculty_id), None)
        _cache_dates.pop(str(window.faculty_id), None)
    if changed:
        await db.commit()
        await refresh_overlay_index(db)


def download_job_for(faculty_id) -> dict:
    return _download_jobs.get(str(faculty_id)) or {"status": "idle"}


def _nearest_trading_day_on_or_before(target: date) -> date:
    cursor = target
    for _ in range(14):
        if is_trading_day(cursor):
            return cursor
        cursor -= timedelta(days=1)
    return target


async def probe_zebu_lookback() -> dict:
    """Ask Zebu for 1-minute bars at ~1y / 6mo / 3mo / latest complete day."""
    max_d = practice_max_date()
    min_d = practice_min_date()
    offsets = (0, 90, 180, 365)
    dates = []
    seen = set()
    for days_back in offsets:
        candidate = _nearest_trading_day_on_or_before(max_d - timedelta(days=days_back))
        if candidate < min_d and days_back != 365:
            continue
        if candidate in seen:
            continue
        seen.add(candidate)
        dates.append(candidate)

    results = []
    for trading_day in dates:
        results.append(await historical_downloader.probe_tpseries_day(trading_day))

    reachable = [row["date"] for row in results if row.get("ok")]
    return {
        "retention_days": RETENTION_DAYS,
        "min_date": min_d.isoformat(),
        "max_date": max_d.isoformat(),
        "samples": results,
        "oldest_reachable": reachable[-1] if reachable else None,
        "latest_reachable": reachable[0] if reachable else None,
        "one_year_ok": any(
            row.get("ok") and date.fromisoformat(row["date"]) <= min_d + timedelta(days=7)
            for row in results
        ),
    }


async def overlay_quote(user_id: Optional[str], symbol: str) -> Optional[dict]:
    """REST/WS quote lookup: cached first, then one DB warm on miss."""
    if not user_id or not is_overlay_user(user_id):
        return None
    cached = quote_for_user_cached(user_id, symbol)
    if cached:
        return cached
    try:
        from database.connection import async_session_factory

        async with async_session_factory() as db:
            return await quote_for_user(db, user_id, symbol)
    except Exception as exc:
        logger.debug("Faculty overlay quote failed for %s: %s", symbol, exc)
        return None
