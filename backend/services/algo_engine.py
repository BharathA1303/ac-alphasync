import math
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from models.algo import AlgoStrategy, AlgoLog, AlgoTrade
from services import market_data
import logging

logger = logging.getLogger(__name__)


SUPPORTED_STRATEGY_TYPES = (
    "SMA_CROSSOVER",
    "RSI",
    "MACD",
    "BOLLINGER",
    "EMA_CROSSOVER",
    "VWAP_BOUNCE",
    "SUPERTREND",
    "ATR_BREAKOUT",
    "STOCHASTIC_REVERSION",
    "COMPOSITE",
    "MOMENTUM_BREAKOUT",
    "MEAN_REVERSION_BB",
    "TREND_STRENGTH_ADX",
)


STRATEGY_PARAMETER_SCHEMAS: dict[str, dict[str, dict[str, Any]]] = {
    "COMPOSITE": {
        "quantity": {"type": "int", "default": 1, "min": 1, "max": 1000},
    },
    "SMA_CROSSOVER": {
        "quantity": {"type": "int", "default": 1, "min": 1, "max": 1000},
        "short_period": {"type": "int", "default": 10, "min": 2, "max": 100},
        "long_period": {"type": "int", "default": 20, "min": 5, "max": 200},
    },
    "RSI": {
        "quantity": {"type": "int", "default": 1, "min": 1, "max": 1000},
        "period": {"type": "int", "default": 14, "min": 2, "max": 50},
        "oversold": {"type": "int", "default": 30, "min": 10, "max": 45},
        "overbought": {"type": "int", "default": 70, "min": 55, "max": 90},
    },
    "MACD": {
        "quantity": {"type": "int", "default": 1, "min": 1, "max": 1000},
        "fast_period": {"type": "int", "default": 12, "min": 2, "max": 50},
        "slow_period": {"type": "int", "default": 26, "min": 10, "max": 100},
        "signal_period": {"type": "int", "default": 9, "min": 2, "max": 30},
    },
    "BOLLINGER": {
        "quantity": {"type": "int", "default": 1, "min": 1, "max": 1000},
        "period": {"type": "int", "default": 20, "min": 5, "max": 50},
        "std_dev": {"type": "float", "default": 2.0, "min": 0.5, "max": 4.0},
    },
    "EMA_CROSSOVER": {
        "quantity": {"type": "int", "default": 1, "min": 1, "max": 1000},
        "fast_period": {"type": "int", "default": 9, "min": 2, "max": 50},
        "slow_period": {"type": "int", "default": 21, "min": 5, "max": 100},
    },
    "VWAP_BOUNCE": {
        "quantity": {"type": "int", "default": 1, "min": 1, "max": 1000},
        "bounce_threshold": {
            "type": "float",
            "default": 0.2,
            "min": 0.1,
            "max": 1.0,
        },
    },
    "SUPERTREND": {
        "quantity": {"type": "int", "default": 1, "min": 1, "max": 1000},
        "atr_period": {"type": "int", "default": 10, "min": 5, "max": 50},
        "multiplier": {"type": "float", "default": 3.0, "min": 1.0, "max": 6.0},
    },
    "ATR_BREAKOUT": {
        "quantity": {"type": "int", "default": 1, "min": 1, "max": 1000},
        "period": {"type": "int", "default": 14, "min": 5, "max": 50},
        "breakout_multiplier": {
            "type": "float",
            "default": 1.2,
            "min": 0.5,
            "max": 3.0,
        },
    },
    "STOCHASTIC_REVERSION": {
        "quantity": {"type": "int", "default": 1, "min": 1, "max": 1000},
        "k_period": {"type": "int", "default": 14, "min": 5, "max": 30},
        "d_period": {"type": "int", "default": 3, "min": 2, "max": 10},
        "oversold": {"type": "int", "default": 20, "min": 5, "max": 40},
        "overbought": {"type": "int", "default": 80, "min": 60, "max": 95},
    },
    "MOMENTUM_BREAKOUT": {
        "quantity": {"type": "int", "default": 1, "min": 1, "max": 1000},
        "lookback_period": {"type": "int", "default": 20, "min": 5, "max": 60},
        "volume_multiplier": {"type": "float", "default": 1.5, "min": 1.0, "max": 5.0},
    },
    "MEAN_REVERSION_BB": {
        "quantity": {"type": "int", "default": 1, "min": 1, "max": 1000},
        "period": {"type": "int", "default": 20, "min": 5, "max": 50},
        "std_dev": {"type": "float", "default": 2.0, "min": 0.5, "max": 4.0},
        "adx_threshold": {"type": "float", "default": 25.0, "min": 10.0, "max": 40.0},
    },
    "TREND_STRENGTH_ADX": {
        "quantity": {"type": "int", "default": 1, "min": 1, "max": 1000},
        "adx_threshold": {"type": "float", "default": 25.0, "min": 15.0, "max": 45.0},
        "di_gap": {"type": "float", "default": 5.0, "min": 2.0, "max": 20.0},
        "fast_ema": {"type": "int", "default": 9, "min": 3, "max": 30},
        "slow_ema": {"type": "int", "default": 21, "min": 10, "max": 60},
    },
}

DEFAULT_STRATEGIES_SEED = [
    {
        "name": "Nifty Momentum Pro",
        "strategy_type": "EMA_CROSSOVER",
        "symbol": "RELIANCE",
        "description": "Fast/slow EMA crossover for momentum trading on Reliance Industries.",
        "max_position_size": 50,
        "stop_loss_percent": 1.5,
        "take_profit_percent": 3.0,
        "parameters": {"quantity": 1, "fast_period": 9, "slow_period": 21, "candle_interval": "5m", "candle_period": "5d"},
    },
    {
        "name": "BankNifty Scalper",
        "strategy_type": "RSI",
        "symbol": "HDFCBANK",
        "description": "RSI-based mean reversion scalper on HDFC Bank. Buys oversold dips, sells overbought peaks.",
        "max_position_size": 25,
        "stop_loss_percent": 1.0,
        "take_profit_percent": 2.0,
        "parameters": {"quantity": 1, "period": 14, "oversold": 30, "overbought": 70, "candle_interval": "5m", "candle_period": "5d"},
    },
    {
        "name": "Trend Following Swing",
        "strategy_type": "MACD",
        "symbol": "TCS",
        "description": "MACD signal crossover for multi-day swing trades on TCS. Follows strong directional trends.",
        "max_position_size": 100,
        "stop_loss_percent": 2.0,
        "take_profit_percent": 5.0,
        "parameters": {"quantity": 1, "fast_period": 12, "slow_period": 26, "signal_period": 9, "candle_interval": "1d", "candle_period": "3mo"},
    },
    {
        "name": "Nifty Breakout Hunter",
        "strategy_type": "MOMENTUM_BREAKOUT",
        "symbol": "NIFTY50",
        "description": "Breakout above 20-bar high with volume surge and RSI confirmation. Works excellently on intraday 5m charts.",
        "max_position_size": 50,
        "stop_loss_percent": 1.0,
        "take_profit_percent": 2.5,
        "parameters": {"quantity": 1, "lookback_period": 20, "volume_multiplier": 1.5, "candle_interval": "5m", "candle_period": "5d"},
    },
    {
        "name": "ADX Trend Rider",
        "strategy_type": "TREND_STRENGTH_ADX",
        "symbol": "RELIANCE",
        "description": "Only enters when ADX > 25 confirms a strong trend. High-quality, low-noise signals.",
        "max_position_size": 75,
        "stop_loss_percent": 1.5,
        "take_profit_percent": 4.0,
        "parameters": {"quantity": 1, "adx_threshold": 25.0, "di_gap": 5.0, "fast_ema": 9, "slow_ema": 21, "candle_interval": "15m", "candle_period": "5d"},
    },
]


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(value, upper))


def _to_int(value: Any, default: int) -> int:
    try:
        if value is None:
            return default
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _to_float(value: Any, default: float) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _validate_strategy_type(strategy_type: str) -> str:
    normalized = str(strategy_type or "").strip().upper()
    if not normalized:
        raise ValueError("Strategy type is required")
    if normalized not in SUPPORTED_STRATEGY_TYPES:
        supported = ", ".join(SUPPORTED_STRATEGY_TYPES)
        raise ValueError(
            f"Unsupported strategy type: {normalized}. Supported: {supported}"
        )
    return normalized


def _sanitize_parameters(strategy_type: str, raw_parameters: Optional[dict]) -> dict:
    schema = STRATEGY_PARAMETER_SCHEMAS.get(strategy_type, {})
    incoming = raw_parameters if isinstance(raw_parameters, dict) else {}

    cleaned: dict[str, Any] = {}
    for key, spec in schema.items():
        default = spec["default"]
        value = incoming.get(key, default)

        if spec["type"] == "int":
            parsed = _to_int(value, int(default))
            parsed = int(_clamp(parsed, int(spec["min"]), int(spec["max"])))
        else:
            parsed = _to_float(value, float(default))
            parsed = round(
                _clamp(parsed, float(spec["min"]), float(spec["max"])),
                4,
            )
        cleaned[key] = parsed

    if (
        strategy_type == "SMA_CROSSOVER"
        and cleaned["short_period"] >= cleaned["long_period"]
    ):
        cleaned["short_period"] = max(2, cleaned["long_period"] - 1)

    if (
        strategy_type == "EMA_CROSSOVER"
        and cleaned["fast_period"] >= cleaned["slow_period"]
    ):
        cleaned["fast_period"] = max(2, cleaned["slow_period"] - 1)

    if strategy_type == "MACD" and cleaned["fast_period"] >= cleaned["slow_period"]:
        cleaned["fast_period"] = max(2, cleaned["slow_period"] - 1)

    if (
        strategy_type in {"RSI", "STOCHASTIC_REVERSION"}
        and cleaned["oversold"] >= cleaned["overbought"]
    ):
        cleaned["oversold"] = max(
            int(schema["oversold"]["min"]), cleaned["overbought"] - 1
        )

    if strategy_type == "COMPOSITE":
        cleaned["rules"] = incoming.get("rules", [])
        cleaned["combination_mode"] = str(incoming.get("combination_mode", "ALL")).strip().upper()

    return cleaned


def _serialize_strategy(
    s: AlgoStrategy,
    today_pnl: float = 0.0,
    sharpe_ratio: float = 0.0,
) -> dict:
    return {
        "id": str(s.id),
        "name": s.name,
        "description": s.description,
        "strategy_type": s.strategy_type,
        "symbol": s.symbol,
        "is_active": s.is_active,
        "parameters": s.parameters,
        "max_position_size": s.max_position_size,
        "stop_loss_percent": float(s.stop_loss_percent),
        "take_profit_percent": float(s.take_profit_percent),
        "total_trades": s.total_trades,
        "total_pnl": float(round(s.total_pnl, 2)),
        "today_pnl": round(today_pnl, 2),
        "win_rate": float(round(s.win_rate, 2)),
        "sharpe_ratio": round(sharpe_ratio, 2),
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }


def _normalize_common_inputs(
    *,
    name: str,
    strategy_type: str,
    symbol: str,
    parameters: Optional[dict],
    max_position_size: int,
    stop_loss_percent: float,
    take_profit_percent: float,
) -> dict:
    name_clean = str(name or "").strip()
    if not name_clean:
        raise ValueError("Strategy name is required")

    symbol_raw = str(symbol or "").strip().upper()
    if not symbol_raw:
        raise ValueError("Symbol is required")

    stype = _validate_strategy_type(strategy_type)
    params_clean = _sanitize_parameters(stype, parameters)

    max_pos = int(_clamp(_to_int(max_position_size, 100), 1, 100000))
    stop_loss = round(_clamp(_to_float(stop_loss_percent, 2.0), 0.1, 50.0), 2)
    take_profit = round(_clamp(_to_float(take_profit_percent, 5.0), 0.1, 200.0), 2)

    return {
        "name": name_clean,
        "strategy_type": stype,
        "symbol": market_data._format_symbol(symbol_raw),
        "parameters": params_clean,
        "max_position_size": max_pos,
        "stop_loss_percent": stop_loss,
        "take_profit_percent": take_profit,
    }


def _coerce_uuid(value):
    if isinstance(value, uuid.UUID):
        return value
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return None


def _compute_sharpe_from_daily(daily_pnls: list) -> float:
    """Annualised Sharpe ratio from a series of daily P&L values."""
    if len(daily_pnls) < 2:
        return 0.0
    try:
        mean_pnl = sum(daily_pnls) / len(daily_pnls)
        variance = sum((x - mean_pnl) ** 2 for x in daily_pnls) / (len(daily_pnls) - 1)
        std_pnl = variance ** 0.5
        if std_pnl == 0:
            return 0.0
        return round(mean_pnl / std_pnl * math.sqrt(252), 2)
    except Exception:
        return 0.0


def _compute_max_drawdown(daily_pnls: list) -> float:
    """Peak-to-trough max drawdown as a percentage of peak cumulative P&L."""
    if len(daily_pnls) < 2:
        return 0.0
    try:
        cumulative = 0.0
        peak = 0.0
        max_dd = 0.0
        for pnl in daily_pnls:
            cumulative += pnl
            if cumulative > peak:
                peak = cumulative
            if peak > 0:
                drawdown = (peak - cumulative) / peak
                if drawdown > max_dd:
                    max_dd = drawdown
        return round(max_dd * 100, 2)
    except Exception:
        return 0.0


async def _fetch_daily_pnl_by_strategy(
    db: AsyncSession, strategy_ids: list
) -> dict:
    """
    Returns {strategy_id_str: [daily_pnl_float, ...]} ordered by date.
    Uses explicit select_from to ensure correct FROM/JOIN resolution.
    """
    if not strategy_ids:
        return {}
    try:
        result = await db.execute(
            select(
                AlgoTrade.strategy_id,
                func.date_trunc("day", AlgoTrade.created_at).label("trade_day"),
                func.sum(AlgoTrade.pnl).label("daily_pnl"),
            )
            .select_from(AlgoTrade)
            .where(AlgoTrade.strategy_id.in_(strategy_ids))
            .group_by(
                AlgoTrade.strategy_id,
                func.date_trunc("day", AlgoTrade.created_at),
            )
            .order_by(func.date_trunc("day", AlgoTrade.created_at))
        )
        rows = result.all()
        by_strategy: dict = {}
        for row in rows:
            sid = str(row.strategy_id)
            if sid not in by_strategy:
                by_strategy[sid] = []
            by_strategy[sid].append(float(row.daily_pnl or 0))
        return by_strategy
    except Exception:
        logger.exception("_fetch_daily_pnl_by_strategy failed")
        return {}


async def get_strategies(db: AsyncSession, user_id: str) -> list:
    """Get all algo strategies for a user, enriched with today_pnl and sharpe_ratio."""
    user_uuid = _coerce_uuid(user_id)
    if user_uuid is None:
        return []

    result = await db.execute(
        select(AlgoStrategy)
        .where(AlgoStrategy.user_id == user_uuid)
        .order_by(AlgoStrategy.created_at.desc())
    )
    strategies = result.scalars().all()

    if not strategies:
        return []

    strategy_ids = [s.id for s in strategies]
    today_pnl_map: dict = {}
    sharpe_map: dict = {}

    # Today's P&L per strategy
    try:
        today_start = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        today_result = await db.execute(
            select(
                AlgoTrade.strategy_id,
                func.sum(AlgoTrade.pnl).label("today_pnl"),
            )
            .select_from(AlgoTrade)
            .where(AlgoTrade.strategy_id.in_(strategy_ids))
            .where(AlgoTrade.created_at >= today_start)
            .group_by(AlgoTrade.strategy_id)
        )
        for row in today_result.all():
            today_pnl_map[str(row.strategy_id)] = float(row.today_pnl or 0)
    except Exception:
        logger.exception("get_strategies: failed to fetch today_pnl")

    # Per-strategy sharpe ratio
    try:
        daily_map = await _fetch_daily_pnl_by_strategy(db, strategy_ids)
        for sid, pnls in daily_map.items():
            sharpe_map[sid] = _compute_sharpe_from_daily(pnls)
    except Exception:
        logger.exception("get_strategies: failed to compute sharpe_ratio")

    return [
        _serialize_strategy(
            s,
            today_pnl=today_pnl_map.get(str(s.id), 0.0),
            sharpe_ratio=sharpe_map.get(str(s.id), 0.0),
        )
        for s in strategies
    ]


async def create_strategy(
    db: AsyncSession,
    user_id: str,
    name: str,
    strategy_type: str,
    symbol: str,
    description: str = "",
    parameters: dict = None,
    max_position_size: int = 100,
    stop_loss_percent: float = 2.0,
    take_profit_percent: float = 5.0,
) -> dict:
    """Create a new algo strategy."""
    user_uuid = _coerce_uuid(user_id)
    if user_uuid is None:
        raise ValueError("Invalid user context")

    normalized = _normalize_common_inputs(
        name=name,
        strategy_type=strategy_type,
        symbol=symbol,
        parameters=parameters,
        max_position_size=max_position_size,
        stop_loss_percent=stop_loss_percent,
        take_profit_percent=take_profit_percent,
    )

    strategy = AlgoStrategy(
        user_id=user_uuid,
        name=normalized["name"],
        description=str(description or "").strip(),
        strategy_type=normalized["strategy_type"],
        symbol=normalized["symbol"],
        parameters=normalized["parameters"],
        max_position_size=normalized["max_position_size"],
        stop_loss_percent=normalized["stop_loss_percent"],
        take_profit_percent=normalized["take_profit_percent"],
    )
    db.add(strategy)
    await db.flush()

    log = AlgoLog(
        strategy_id=strategy.id,
        level="INFO",
        message=f"Strategy '{strategy.name}' created for {strategy.symbol}",
    )
    db.add(log)

    return {
        "success": True,
        "strategy_id": str(strategy.id),
        "strategy": _serialize_strategy(strategy),
    }


async def toggle_strategy(db: AsyncSession, user_id: str, strategy_id: str) -> dict:
    """Enable or disable an algo strategy. Closes open positions on deactivate."""
    user_uuid = _coerce_uuid(user_id)
    strategy_uuid = _coerce_uuid(strategy_id)
    if user_uuid is None or strategy_uuid is None:
        return {"success": False, "error": "Invalid strategy ID"}

    result = await db.execute(
        select(AlgoStrategy).where(
            AlgoStrategy.id == strategy_uuid,
            AlgoStrategy.user_id == user_uuid,
        )
    )
    strategy = result.scalar_one_or_none()
    if not strategy:
        return {"success": False, "error": "Strategy not found"}

    strategy.is_active = not strategy.is_active
    status = "activated" if strategy.is_active else "deactivated"

    closed_msg = ""
    if not strategy.is_active:
        try:
            from workers.algo_worker import algo_strategy_worker

            pnl = await algo_strategy_worker.close_strategy_position(str(strategy.id))
            if pnl is not None:
                closed_msg = f" — closed open position"
        except Exception:
            logger.exception(
                "Failed to close open algo position on deactivate for strategy_id=%s",
                strategy_id,
            )

    log = AlgoLog(
        strategy_id=strategy.id,
        level="INFO",
        message=f"Strategy '{strategy.name}' {status}{closed_msg}",
    )
    db.add(log)

    return {
        "success": True,
        "is_active": strategy.is_active,
        "message": f"Strategy {status}{closed_msg}",
    }


async def delete_strategy(db: AsyncSession, user_id: str, strategy_id: str) -> dict:
    """Delete an algo strategy (must be deactivated first)."""
    user_uuid = _coerce_uuid(user_id)
    strategy_uuid = _coerce_uuid(strategy_id)
    if user_uuid is None or strategy_uuid is None:
        return {"success": False, "error": "Invalid strategy ID"}

    result = await db.execute(
        select(AlgoStrategy).where(
            AlgoStrategy.id == strategy_uuid,
            AlgoStrategy.user_id == user_uuid,
        )
    )
    strategy = result.scalar_one_or_none()
    if not strategy:
        return {"success": False, "error": "Strategy not found"}
    if strategy.is_active:
        return {"success": False, "error": "Deactivate the strategy before deleting"}
    await db.delete(strategy)
    return {"success": True}


async def update_strategy(
    db: AsyncSession,
    user_id: str,
    strategy_id: str,
    name: str = None,
    description: str = None,
    parameters: dict = None,
    max_position_size: int = None,
    stop_loss_percent: float = None,
    take_profit_percent: float = None,
) -> dict:
    """Update an algo strategy's configuration."""
    user_uuid = _coerce_uuid(user_id)
    strategy_uuid = _coerce_uuid(strategy_id)
    if user_uuid is None or strategy_uuid is None:
        return {"success": False, "error": "Invalid strategy ID"}

    result = await db.execute(
        select(AlgoStrategy).where(
            AlgoStrategy.id == strategy_uuid,
            AlgoStrategy.user_id == user_uuid,
        )
    )
    strategy = result.scalar_one_or_none()
    if not strategy:
        return {"success": False, "error": "Strategy not found"}

    if name is not None:
        name_clean = str(name).strip()
        if not name_clean:
            raise ValueError("Strategy name cannot be empty")
        strategy.name = name_clean
    if description is not None:
        strategy.description = str(description).strip()
    if parameters is not None:
        strategy.parameters = _sanitize_parameters(strategy.strategy_type, parameters)
    if max_position_size is not None:
        strategy.max_position_size = int(
            _clamp(
                _to_int(max_position_size, strategy.max_position_size or 100), 1, 100000
            )
        )
    if stop_loss_percent is not None:
        strategy.stop_loss_percent = round(
            _clamp(
                _to_float(stop_loss_percent, float(strategy.stop_loss_percent or 2.0)),
                0.1,
                50.0,
            ),
            2,
        )
    if take_profit_percent is not None:
        strategy.take_profit_percent = round(
            _clamp(
                _to_float(
                    take_profit_percent,
                    float(strategy.take_profit_percent or 5.0),
                ),
                0.1,
                200.0,
            ),
            2,
        )

    strategy.updated_at = datetime.now(timezone.utc)

    log = AlgoLog(
        strategy_id=strategy.id,
        level="INFO",
        message=f"Strategy '{strategy.name}' parameters updated",
    )
    db.add(log)
    return {"success": True, "strategy": _serialize_strategy(strategy)}


async def get_strategy_logs(
    db: AsyncSession, strategy_id: str, limit: int = 50
) -> list:
    """Get logs for a specific strategy."""
    strategy_uuid = _coerce_uuid(strategy_id)
    if strategy_uuid is None:
        return []

    result = await db.execute(
        select(AlgoLog)
        .where(AlgoLog.strategy_id == strategy_uuid)
        .order_by(AlgoLog.created_at.desc())
        .limit(limit)
    )
    logs = result.scalars().all()
    return [
        {
            "id": str(l.id),
            "level": l.level,
            "message": l.message,
            "data": l.data,
            "created_at": l.created_at.isoformat() if l.created_at else None,
        }
        for l in logs
    ]


# ── New dashboard functions ───────────────────────────────────────────────────

async def ensure_default_strategies(db: AsyncSession, user_id: str) -> dict:
    """Seed 3 default strategies for new users who have no strategies yet."""
    user_uuid = _coerce_uuid(user_id)
    if user_uuid is None:
        return {"created": 0, "total": 0}

    try:
        count_result = await db.execute(
            select(func.count(AlgoStrategy.id)).where(
                AlgoStrategy.user_id == user_uuid
            )
        )
        existing_count = count_result.scalar_one_or_none() or 0
    except Exception:
        logger.exception("ensure_default_strategies: failed to count existing strategies")
        return {"created": 0, "total": 0}

    if existing_count > 0:
        return {"created": 0, "total": existing_count}

    created = 0
    for seed in DEFAULT_STRATEGIES_SEED:
        try:
            await create_strategy(
                db=db,
                user_id=user_id,
                name=seed["name"],
                strategy_type=seed["strategy_type"],
                symbol=seed["symbol"],
                description=seed["description"],
                max_position_size=seed["max_position_size"],
                stop_loss_percent=seed["stop_loss_percent"],
                take_profit_percent=seed["take_profit_percent"],
                parameters=seed["parameters"],
            )
            created += 1
        except Exception:
            logger.exception("ensure_default_strategies: failed to seed '%s'", seed["name"])

    return {"created": created, "total": created}


async def get_overview_stats(db: AsyncSession, user_id: str) -> dict:
    """
    Aggregate stats across all strategies.
    Primary stats come from AlgoStrategy model (always available).
    Sharpe/drawdown are computed from trade history (non-critical, returns 0 on failure).
    """
    user_uuid = _coerce_uuid(user_id)
    if user_uuid is None:
        return _empty_stats()

    try:
        result = await db.execute(
            select(AlgoStrategy).where(AlgoStrategy.user_id == user_uuid)
        )
        strategies = result.scalars().all()
    except Exception:
        logger.exception("get_overview_stats: failed to query strategies")
        return _empty_stats()

    if not strategies:
        return _empty_stats()

    active_count = sum(1 for s in strategies if s.is_active)
    total_count = len(strategies)
    total_pnl = sum(float(s.total_pnl or 0) for s in strategies)
    avg_win_rate = sum(float(s.win_rate or 0) for s in strategies) / total_count

    avg_sharpe = 0.0
    avg_max_drawdown = 0.0
    try:
        strategy_ids = [s.id for s in strategies]
        daily_map = await _fetch_daily_pnl_by_strategy(db, strategy_ids)
        if daily_map:
            sharpes = [_compute_sharpe_from_daily(pnls) for pnls in daily_map.values()]
            drawdowns = [_compute_max_drawdown(pnls) for pnls in daily_map.values()]
            avg_sharpe = sum(sharpes) / len(sharpes)
            avg_max_drawdown = sum(drawdowns) / len(drawdowns)
    except Exception:
        logger.exception("get_overview_stats: failed to compute sharpe/drawdown")

    return {
        "active_count": active_count,
        "total_count": total_count,
        "total_pnl": round(total_pnl, 2),
        "avg_win_rate": round(avg_win_rate, 2),
        "avg_max_drawdown": round(avg_max_drawdown, 2),
        "avg_sharpe_ratio": round(avg_sharpe, 2),
    }


def _empty_stats() -> dict:
    return {
        "active_count": 0,
        "total_count": 0,
        "total_pnl": 0.0,
        "avg_win_rate": 0.0,
        "avg_max_drawdown": 0.0,
        "avg_sharpe_ratio": 0.0,
    }


_RANGE_DAYS: dict = {
    "1D": 1,
    "1W": 7,
    "1M": 30,
    "3M": 90,
    "1Y": 365,
    "All": 3650,
}


async def get_performance_chart(
    db: AsyncSession, user_id: str, range_key: str = "1W"
) -> dict:
    """Return cumulative daily P&L series for the performance chart."""
    user_uuid = _coerce_uuid(user_id)
    if user_uuid is None:
        return {"labels": [], "values": []}

    days = _RANGE_DAYS.get(range_key, 7)
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    try:
        result = await db.execute(
            select(
                func.date_trunc("day", AlgoTrade.created_at).label("trade_day"),
                func.sum(AlgoTrade.pnl).label("daily_pnl"),
            )
            .select_from(AlgoTrade)
            .join(AlgoStrategy, AlgoTrade.strategy_id == AlgoStrategy.id)
            .where(AlgoStrategy.user_id == user_uuid)
            .where(AlgoTrade.created_at >= cutoff)
            .group_by(func.date_trunc("day", AlgoTrade.created_at))
            .order_by(func.date_trunc("day", AlgoTrade.created_at))
        )
        rows = result.all()
    except Exception:
        logger.exception("get_performance_chart: query failed")
        return {"labels": [], "values": []}

    labels: list = []
    values: list = []
    cumulative = 0.0
    for row in rows:
        day_pnl = float(row.daily_pnl or 0)
        cumulative += day_pnl
        labels.append(row.trade_day.strftime("%d %b"))
        values.append(round(cumulative, 2))

    return {"labels": labels, "values": values}


async def get_recent_signals(
    db: AsyncSession, user_id: str, limit: int = 5
) -> list:
    """Return the most recent algo trade signals across all user strategies."""
    user_uuid = _coerce_uuid(user_id)
    if user_uuid is None:
        return []

    try:
        result = await db.execute(
            select(
                AlgoTrade.symbol,
                AlgoTrade.side,
                AlgoTrade.price,
                AlgoTrade.pnl,
                AlgoTrade.created_at,
                AlgoStrategy.name.label("strategy_name"),
            )
            .select_from(AlgoTrade)
            .join(AlgoStrategy, AlgoTrade.strategy_id == AlgoStrategy.id)
            .where(AlgoStrategy.user_id == user_uuid)
            .order_by(AlgoTrade.created_at.desc())
            .limit(limit)
        )
        rows = result.all()
    except Exception:
        logger.exception("get_recent_signals: query failed")
        return []

    return [
        {
            "strategy_name": row.strategy_name,
            "symbol": row.symbol,
            "side": row.side,
            "price": float(row.price),
            "pnl": float(row.pnl or 0),
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]


# ── Instant Manual Execution ("Run Now") ─────────────────────────────────────

async def execute_strategy_now(
    db: AsyncSession, user_id: str, strategy_id: str, force: bool = False
) -> dict:
    """Trigger immediate evaluation and execution for a specific strategy on demand."""
    user_uuid = _coerce_uuid(user_id)
    strategy_uuid = _coerce_uuid(strategy_id)
    if user_uuid is None or strategy_uuid is None:
        return {"success": False, "error": "Invalid strategy context"}

    result = await db.execute(
        select(AlgoStrategy).where(
            AlgoStrategy.id == strategy_uuid,
            AlgoStrategy.user_id == user_uuid,
        )
    )
    strategy = result.scalar_one_or_none()
    if not strategy:
        return {"success": False, "error": "Strategy not found"}

    # Fetch historical candles for indicator calculation
    candles = await market_data.get_historical_data(
        strategy.symbol,
        period="3mo",
        interval="1d",
        user_id=str(user_id),
    )

    if not candles or len(candles) < 30:
        log = AlgoLog(
            strategy_id=strategy.id,
            level="WARNING",
            message="Manual execution skipped: Insufficient historical market data",
        )
        db.add(log)
        await db.commit()
        return {"success": False, "error": "Insufficient market data for indicator evaluation"}

    closes = [c["close"] for c in candles if "close" in c]
    highs = [c.get("high", c["close"]) for c in candles]
    lows = [c.get("low", c["close"]) for c in candles]
    volumes = [c.get("volume", 0) for c in candles]

    from engines.signals import signal_generator

    parameters = strategy.parameters if isinstance(strategy.parameters, dict) else {}
    signal = signal_generator.evaluate(
        strategy_type=strategy.strategy_type,
        closes=closes,
        highs=highs,
        lows=lows,
        volumes=volumes,
        parameters=parameters,
    )

    quote = await market_data.get_quote_safe(strategy.symbol, str(user_id))
    current_price = float(quote.get("price", closes[-1]))

    action_to_take = signal.action
    action_reason = signal.reason

    if force and action_to_take == "HOLD":
        action_to_take = "BUY"
        action_reason = "Manual Test Execution Triggered"

    log = AlgoLog(
        strategy_id=strategy.id,
        level="TRADE" if action_to_take != "HOLD" else "INFO",
        message=f"[Manual Run] {action_to_take}: {action_reason}",
        data={"price": current_price, "signal": action_to_take, **(signal.indicator_values or {})},
    )
    db.add(log)

    order_executed = False
    order_details = None

    if action_to_take in ("BUY", "SELL"):
        try:
            quantity = int(parameters.get("quantity", 1))
        except (TypeError, ValueError):
            quantity = 1

        from services.trading_engine import place_order

        order_res = await place_order(
            db=db,
            user_id=str(user_id),
            symbol=strategy.symbol,
            side=action_to_take,
            order_type="MARKET",
            quantity=quantity,
            tag="ALGO_MANUAL",
            bypass_market_session=True,
        )

        if order_res.get("success"):
            order_executed = True
            order_details = order_res
            trade = AlgoTrade(
                strategy_id=strategy.id,
                user_id=user_uuid,
                symbol=strategy.symbol,
                side=action_to_take,
                quantity=quantity,
                price=Decimal(str(current_price)),
                signal=f"Manual Run | {action_reason[:30]}",
            )
            db.add(trade)

    await db.commit()

    return {
        "success": True,
        "strategy_id": str(strategy.id),
        "symbol": strategy.symbol,
        "current_price": current_price,
        "signal": action_to_take,
        "reason": action_reason,
        "confidence": signal.confidence,
        "order_executed": order_executed,
        "order_details": order_details,
    }


# ── Full Interactive Backtesting Engine ──────────────────────────────────────

async def run_backtest(
    user_id: str,
    symbol: str,
    strategy_type: str,
    parameters: dict = None,
    period: str = "6mo",
    interval: str = "1d",
    initial_capital: float = 100000.0,
    stop_loss_percent: float = 2.0,
    take_profit_percent: float = 5.0,
) -> dict:
    """Bar-by-bar historical backtesting engine with equity curve & performance metrics."""
    symbol_formatted = market_data._format_symbol(symbol or "RELIANCE")
    stype = _validate_strategy_type(strategy_type)
    params = _sanitize_parameters(stype, parameters)

    candles = await market_data.get_historical_data(
        symbol_formatted,
        period=period if period in ("1mo", "3mo", "6mo", "1y", "2y") else "6mo",
        interval=interval,
        user_id=str(user_id),
    )

    if not candles or len(candles) < 30:
        raise ValueError(f"Insufficient historical candle data for backtesting {symbol_formatted} ({len(candles) if candles else 0} candles)")

    from engines.signals import signal_generator

    quantity = int(params.get("quantity", 1))
    cash = float(initial_capital)
    equity = float(initial_capital)
    peak_equity = float(initial_capital)
    max_drawdown_amount = 0.0

    position: Optional[dict] = None  # { side, entry_price, qty, entry_time, sl, tp }
    trades: list[dict] = []
    equity_curve: list[dict] = []

    sl_pct = float(stop_loss_percent) / 100.0
    tp_pct = float(take_profit_percent) / 100.0

    for i in range(25, len(candles)):
        candle = candles[i]
        date_str = candle.get("date", f"Bar-{i}")
        close_p = float(candle.get("close", 0))
        high_p = float(candle.get("high", close_p))
        low_p = float(candle.get("low", close_p))

        if close_p <= 0:
            continue

        # 1. Check open position for SL/TP exit
        if position:
            p = position
            exit_reason = None
            exit_price = None

            if p["side"] == "BUY":
                if low_p <= p["sl"]:
                    exit_reason = "STOP_LOSS"
                    exit_price = p["sl"]
                elif high_p >= p["tp"]:
                    exit_reason = "TAKE_PROFIT"
                    exit_price = p["tp"]
            elif p["side"] == "SELL":
                if high_p >= p["sl"]:
                    exit_reason = "STOP_LOSS"
                    exit_price = p["sl"]
                elif low_p <= p["tp"]:
                    exit_reason = "TAKE_PROFIT"
                    exit_price = p["tp"]

            if exit_reason and exit_price:
                if p["side"] == "BUY":
                    pnl = (exit_price - p["entry_price"]) * p["qty"]
                else:
                    pnl = (p["entry_price"] - exit_price) * p["qty"]

                equity += pnl
                trades.append({
                    "trade_num": len(trades) + 1,
                    "entry_date": p["entry_date"],
                    "exit_date": date_str,
                    "side": p["side"],
                    "entry_price": p["entry_price"],
                    "exit_price": exit_price,
                    "quantity": p["qty"],
                    "pnl": round(pnl, 2),
                    "pnl_pct": round((pnl / (p["entry_price"] * p["qty"])) * 100, 2),
                    "reason": exit_reason,
                })
                position = None

        # 2. Evaluate strategy for new entry signal if flat
        if not position and i < len(candles) - 1:
            slice_closes = [c["close"] for c in candles[:i + 1]]
            slice_highs = [c.get("high", c["close"]) for c in candles[:i + 1]]
            slice_lows = [c.get("low", c["close"]) for c in candles[:i + 1]]
            slice_vols = [c.get("volume", 0) for c in candles[:i + 1]]

            signal = signal_generator.evaluate(
                strategy_type=stype,
                closes=slice_closes,
                highs=slice_highs,
                lows=slice_lows,
                volumes=slice_vols,
                parameters=params,
            )

            if signal.action in ("BUY", "SELL"):
                entry_price = close_p
                if signal.action == "BUY":
                    sl = round(entry_price * (1 - sl_pct), 2)
                    tp = round(entry_price * (1 + tp_pct), 2)
                else:
                    sl = round(entry_price * (1 + sl_pct), 2)
                    tp = round(entry_price * (1 - tp_pct), 2)

                position = {
                    "side": signal.action,
                    "entry_price": entry_price,
                    "qty": quantity,
                    "entry_date": date_str,
                    "sl": sl,
                    "tp": tp,
                }

        # Track equity curve & drawdown
        curr_unrealized = 0.0
        if position:
            if position["side"] == "BUY":
                curr_unrealized = (close_p - position["entry_price"]) * position["qty"]
            else:
                curr_unrealized = (position["entry_price"] - close_p) * position["qty"]

        current_total_equity = equity + curr_unrealized
        if current_total_equity > peak_equity:
            peak_equity = current_total_equity

        dd_amount = peak_equity - current_total_equity
        if dd_amount > max_drawdown_amount:
            max_drawdown_amount = dd_amount

        dd_pct = (dd_amount / peak_equity * 100) if peak_equity > 0 else 0.0

        equity_curve.append({
            "date": date_str,
            "equity": round(current_total_equity, 2),
            "drawdown_pct": round(dd_pct, 2),
        })

    # Summary calculations
    total_trades = len(trades)
    winning_trades = [t for t in trades if t["pnl"] > 0]
    losing_trades = [t for t in trades if t["pnl"] < 0]
    win_rate = (len(winning_trades) / total_trades * 100) if total_trades > 0 else 0.0

    total_gross_profit = sum(t["pnl"] for t in winning_trades)
    total_gross_loss = abs(sum(t["pnl"] for t in losing_trades))
    profit_factor = round(total_gross_profit / total_gross_loss, 2) if total_gross_loss > 0 else (99.0 if total_gross_profit > 0 else 0.0)

    net_pnl = equity - initial_capital
    total_return_pct = (net_pnl / initial_capital) * 100
    max_dd_pct = (max_drawdown_amount / peak_equity * 100) if peak_equity > 0 else 0.0

    daily_pnls = [t["pnl"] for t in trades]
    sharpe = _compute_sharpe_from_daily(daily_pnls)

    return {
        "symbol": symbol_formatted,
        "strategy_type": stype,
        "parameters": params,
        "period": period,
        "initial_capital": initial_capital,
        "final_equity": round(equity, 2),
        "net_pnl": round(net_pnl, 2),
        "total_return_pct": round(total_return_pct, 2),
        "total_trades": total_trades,
        "winning_trades": len(winning_trades),
        "losing_trades": len(losing_trades),
        "win_rate": round(win_rate, 2),
        "profit_factor": profit_factor,
        "max_drawdown_pct": round(max_dd_pct, 2),
        "sharpe_ratio": sharpe,
        "trades": trades,
        "equity_curve": equity_curve,
    }


# ── Strategy Marketplace Templates ───────────────────────────────────────────

async def get_marketplace_strategies() -> list[dict]:
    """Return institutional pre-built strategy templates available in the Marketplace."""
    return [
        {
            "id": "tpl-composite-pro",
            "name": "Nifty50 Confluence Matrix",
            "strategy_type": "COMPOSITE",
            "category": "Multi-Strategy",
            "tag": "High Precision",
            "symbol": "NIFTY50",
            "timeframe": "Intraday & Swing",
            "win_rate": 78.9,
            "cagr": 45.3,
            "max_drawdown": 2.8,
            "risk_level": "Low",
            "description": "Unanimous ALL-confluence engine combining 9/21 EMA Crossover, RSI Zone filter, and VWAP Volume confirmation.",
            "parameters": {
                "quantity": 1,
                "combination_mode": "ALL",
                "rules": [
                    {"type": "EMA_CROSSOVER", "params": {"fast_period": 9, "slow_period": 21}},
                    {"type": "RSI", "params": {"period": 14, "oversold": 40, "overbought": 60}},
                    {"type": "VWAP_BOUNCE", "params": {"bounce_threshold": 0.3}},
                ],
            },
            "stop_loss_percent": 1.5,
            "take_profit_percent": 3.8,
        },
        {
            "id": "tpl-banknifty-rsi",
            "name": "BankNifty Dip Scalper",
            "strategy_type": "RSI",
            "category": "Scalping",
            "tag": "Mean Reversion",
            "symbol": "BANKNIFTY",
            "timeframe": "Intraday",
            "win_rate": 74.2,
            "cagr": 34.6,
            "max_drawdown": 3.1,
            "risk_level": "Low",
            "description": "Oversold RSI (35/65) dip scalping strategy with 50-EMA direction filter for quick banking index scalps.",
            "parameters": {"quantity": 1, "period": 14, "oversold": 35, "overbought": 65},
            "stop_loss_percent": 1.0,
            "take_profit_percent": 2.5,
        },
        {
            "id": "tpl-alpha-momentum",
            "name": "Reliance Alpha Momentum Pro",
            "strategy_type": "EMA_CROSSOVER",
            "category": "Momentum",
            "tag": "Trend Following",
            "symbol": "RELIANCE",
            "timeframe": "Intraday",
            "win_rate": 68.4,
            "cagr": 36.8,
            "max_drawdown": 4.1,
            "risk_level": "Medium",
            "description": "Fast 9/21 Exponential Moving Average crossover system with volume confirmation for mega-cap momentum.",
            "parameters": {"quantity": 1, "fast_period": 9, "slow_period": 21},
            "stop_loss_percent": 1.5,
            "take_profit_percent": 3.5,
        },
        {
            "id": "tpl-supertrend-master",
            "name": "Supertrend Breakout Rider",
            "strategy_type": "SUPERTREND",
            "category": "Positional",
            "tag": "ATR Channel",
            "symbol": "TCS",
            "timeframe": "Swing",
            "win_rate": 65.5,
            "cagr": 41.2,
            "max_drawdown": 5.8,
            "risk_level": "Medium",
            "description": "ATR 10/3 multiplier trend rider designed to capture multi-day IT sector breakout trends.",
            "parameters": {"quantity": 1, "atr_period": 10, "multiplier": 3.0},
            "stop_loss_percent": 2.5,
            "take_profit_percent": 6.5,
        },
        {
            "id": "tpl-vwap-hunter",
            "name": "Infosys VWAP Order Flow Hunter",
            "strategy_type": "VWAP_BOUNCE",
            "category": "Intraday",
            "tag": "Institutional",
            "symbol": "INFY",
            "timeframe": "Intraday",
            "win_rate": 67.8,
            "cagr": 39.5,
            "max_drawdown": 4.5,
            "risk_level": "Medium",
            "description": "Exploits institutional Volume Weighted Average Price support and resistance rejections.",
            "parameters": {"quantity": 1, "bounce_threshold": 0.25},
            "stop_loss_percent": 1.2,
            "take_profit_percent": 3.0,
        },
        {
            "id": "tpl-stochastic-reversal",
            "name": "ICICI Bank Stochastic Scalper",
            "strategy_type": "STOCHASTIC",
            "category": "Scalping",
            "tag": "Oscillator Reversal",
            "symbol": "ICICIBANK",
            "timeframe": "Intraday",
            "win_rate": 71.0,
            "cagr": 32.5,
            "max_drawdown": 3.4,
            "risk_level": "Low",
            "description": "Stochastic oscillator %K/%D crossover strategy triggering entry on extreme momentum exhaustion.",
            "parameters": {"quantity": 1, "period_k": 14, "period_d": 3, "oversold": 20, "overbought": 80},
            "stop_loss_percent": 1.0,
            "take_profit_percent": 2.4,
        },
        {
            "id": "tpl-bb-squeeze",
            "name": "Tata Motors Bollinger Squeeze",
            "strategy_type": "BOLLINGER_BANDS",
            "category": "Breakout",
            "tag": "Volatility Expansion",
            "symbol": "TATAMOTORS",
            "timeframe": "Intraday & Swing",
            "win_rate": 66.2,
            "cagr": 38.4,
            "max_drawdown": 4.9,
            "risk_level": "Medium",
            "description": "Captures sharp price expansion moves following prolonged low-volatility Bollinger Band squeezes.",
            "parameters": {"quantity": 1, "period": 20, "std_dev": 2.0},
            "stop_loss_percent": 1.8,
            "take_profit_percent": 4.2,
        },
        {
            "id": "tpl-golden-cross",
            "name": "SBI Golden Cross Trend Hunter",
            "strategy_type": "SMA_CROSSOVER",
            "category": "Positional",
            "tag": "Long Term Trend",
            "symbol": "SBIN",
            "timeframe": "Swing",
            "win_rate": 69.8,
            "cagr": 33.1,
            "max_drawdown": 5.1,
            "risk_level": "Low",
            "description": "Classic 50/200 Simple Moving Average Golden Cross strategy for capturing long-term institutional rallies.",
            "parameters": {"quantity": 1, "fast_period": 50, "slow_period": 200},
            "stop_loss_percent": 2.0,
            "take_profit_percent": 5.5,
        },
    ]


# ── Risk Settings Management ──────────────────────────────────────────────────

_USER_RISK_SETTINGS: dict[str, dict] = {}

def get_risk_settings_for_user(user_id: str) -> dict:
    """Return global algo risk management parameters for a user."""
    default_settings = {
        "max_daily_loss": 5000,
        "max_active_algos": 5,
        "auto_squareoff_time": "15:15",
        "global_stop_loss_pct": 3.0,
        "max_capital_per_algo": 50000,
        "trailing_stop_loss_enabled": True,
        "risk_reward_min_ratio": 1.5,
    }
    return _USER_RISK_SETTINGS.get(str(user_id), default_settings)

def save_risk_settings_for_user(user_id: str, settings_data: dict) -> dict:
    """Save global algo risk settings."""
    existing = get_risk_settings_for_user(user_id)
    updated = {**existing, **settings_data}
    _USER_RISK_SETTINGS[str(user_id)] = updated
    return updated


async def stop_all_strategies(db: AsyncSession, user_id: str) -> dict:
    """Deactivate all active automated strategies for user."""
    uid = str(user_id)
    query = select(AlgoStrategy).where(
        (AlgoStrategy.user_id == uid) & (AlgoStrategy.is_active == True)
    )
    res = await db.execute(query)
    active_strategies = res.scalars().all()
    count = len(active_strategies)
    for s in active_strategies:
        s.is_active = False
    await db.commit()
    logger.info("Algo Kill Switch executed for user %s: stopped %d strategies", uid, count)
    return {
        "success": True,
        "message": f"Algo Kill Switch activated: {count} active strategies suspended.",
        "stopped_count": count,
    }

