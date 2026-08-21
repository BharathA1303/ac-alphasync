from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field
from typing import Any, Optional
import logging
from database.connection import get_db
from models.user import User
from routes.auth import get_current_user
from services.algo_engine import (
    get_strategies,
    create_strategy,
    toggle_strategy,
    stop_all_strategies,
    get_strategy_logs,
    delete_strategy,
    update_strategy,
    ensure_default_strategies,
    get_overview_stats,
    get_performance_chart,
    get_recent_signals,
    execute_strategy_now,
    run_backtest,
    get_marketplace_strategies,
    get_risk_settings_for_user,
    save_risk_settings_for_user,
    SUPPORTED_STRATEGY_TYPES,
    STRATEGY_PARAMETER_SCHEMAS,
)

router = APIRouter(prefix="/api/algo", tags=["Algo Trading"])
logger = logging.getLogger(__name__)


class CreateStrategyRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    strategy_type: str = Field(..., min_length=2, max_length=50)
    symbol: str = Field(..., min_length=1, max_length=30)
    description: str = ""
    parameters: Optional[dict[str, Any]] = None
    max_position_size: int = Field(default=100, ge=1, le=100000)
    stop_loss_percent: float = Field(default=2.0, gt=0)
    take_profit_percent: float = Field(default=5.0, gt=0)


@router.post("/kill-switch")
async def kill_switch_all_algo(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Deactivate all active automated strategies immediately."""
    result = await stop_all_strategies(db, str(user.id))
    return result


@router.get("/strategy-types")
async def list_strategy_types(
    _user: User = Depends(get_current_user),
):
    strategy_types = []
    for strategy_type in SUPPORTED_STRATEGY_TYPES:
        schema = STRATEGY_PARAMETER_SCHEMAS.get(strategy_type, {})
        strategy_types.append(
            {
                "value": strategy_type,
                "default_parameters": {
                    key: rule.get("default") for key, rule in schema.items()
                },
            }
        )
    return {"strategy_types": strategy_types}


@router.get("/strategies")
async def list_strategies(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    strategies = await get_strategies(db, user.id)
    return {"strategies": strategies}


@router.post("/strategies")
async def new_strategy(
    req: CreateStrategyRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await create_strategy(
            db=db,
            user_id=user.id,
            name=req.name,
            strategy_type=req.strategy_type,
            symbol=req.symbol,
            description=req.description,
            parameters=req.parameters,
            max_position_size=req.max_position_size,
            stop_loss_percent=req.stop_loss_percent,
            take_profit_percent=req.take_profit_percent,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception:
        logger.exception("Failed to create strategy for user_id=%s", user.id)
        raise HTTPException(status_code=500, detail="Failed to create strategy")


@router.put("/strategies/{strategy_id}/toggle")
async def toggle(
    strategy_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await toggle_strategy(db, user.id, strategy_id)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


class UpdateStrategyRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = None
    parameters: Optional[dict[str, Any]] = None
    max_position_size: Optional[int] = Field(default=None, ge=1, le=100000)
    stop_loss_percent: Optional[float] = Field(default=None, gt=0)
    take_profit_percent: Optional[float] = Field(default=None, gt=0)


@router.put("/strategies/{strategy_id}")
async def update(
    strategy_id: str,
    req: UpdateStrategyRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await update_strategy(
            db=db,
            user_id=user.id,
            strategy_id=strategy_id,
            name=req.name,
            description=req.description,
            parameters=req.parameters,
            max_position_size=req.max_position_size,
            stop_loss_percent=req.stop_loss_percent,
            take_profit_percent=req.take_profit_percent,
        )
        if not result["success"]:
            raise HTTPException(status_code=400, detail=result["error"])
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.delete("/strategies/{strategy_id}")
async def delete(
    strategy_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await delete_strategy(db, user.id, strategy_id)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.get("/strategies/{strategy_id}/logs")
async def strategy_logs(
    strategy_id: str,
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    logs = await get_strategy_logs(db, strategy_id, limit)
    return {"logs": logs}


# ── New dashboard endpoints ───────────────────────────────────────────────────

@router.post("/ensure-defaults")
async def seed_default_strategies(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Seed 3 default strategies for new users. Safe to call repeatedly."""
    result = await ensure_default_strategies(db, user.id)
    return result


@router.get("/overview-stats")
async def overview_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Aggregate stats across all strategies for the dashboard header cards."""
    stats = await get_overview_stats(db, user.id)
    return stats


@router.get("/performance-chart")
async def performance_chart(
    range: str = Query("1W", regex="^(1D|1W|1M|3M|1Y|All)$"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cumulative daily P&L series for the performance chart."""
    data = await get_performance_chart(db, user.id, range_key=range)
    return data


@router.get("/recent-signals")
async def recent_signals(
    limit: int = Query(5, ge=1, le=20),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Most recent algo trade signals across all user strategies."""
    signals = await get_recent_signals(db, user.id, limit=limit)
    return {"signals": signals}


# ── Instant Manual Execution ─────────────────────────────────────────────────

@router.post("/strategies/{strategy_id}/execute-now")
async def execute_now(
    strategy_id: str,
    force: bool = Query(False),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Force immediate evaluation and signal execution for a strategy."""
    result = await execute_strategy_now(db, user.id, strategy_id, force=force)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Execution failed"))
    return result


# ── Interactive Backtest Endpoint ────────────────────────────────────────────

class BacktestRequest(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=30)
    strategy_type: str = Field(..., min_length=2, max_length=50)
    parameters: Optional[dict[str, Any]] = None
    period: str = Field(default="6mo")
    initial_capital: float = Field(default=100000.0, ge=1000)
    stop_loss_percent: float = Field(default=2.0, gt=0)
    take_profit_percent: float = Field(default=5.0, gt=0)


@router.post("/backtest")
async def backtest_strategy(
    req: BacktestRequest,
    user: User = Depends(get_current_user),
):
    """Run bar-by-bar historical backtest simulation."""
    try:
        results = await run_backtest(
            user_id=user.id,
            symbol=req.symbol,
            strategy_type=req.strategy_type,
            parameters=req.parameters,
            period=req.period,
            initial_capital=req.initial_capital,
            stop_loss_percent=req.stop_loss_percent,
            take_profit_percent=req.take_profit_percent,
        )
        return results
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.exception("Backtest error for user=%s", user.id)
        raise HTTPException(status_code=500, detail=f"Backtest execution failed: {str(e)}") from e


# ── Strategy Marketplace Endpoint ─────────────────────────────────────────────

@router.get("/marketplace")
async def marketplace_templates(
    _user: User = Depends(get_current_user),
):
    """Get ready-to-deploy strategy templates."""
    templates = await get_marketplace_strategies()
    return {"templates": templates}


# ── Global Risk Settings Endpoints ───────────────────────────────────────────

class RiskSettingsRequest(BaseModel):
    max_daily_loss: Optional[float] = Field(default=5000, ge=0)
    max_active_algos: Optional[int] = Field(default=5, ge=1, le=50)
    auto_squareoff_time: Optional[str] = Field(default="15:15")
    global_stop_loss_pct: Optional[float] = Field(default=3.0, ge=0.5, le=20.0)
    max_capital_per_algo: Optional[float] = Field(default=50000, ge=1000)
    trailing_stop_loss_enabled: Optional[bool] = Field(default=True)
    risk_reward_min_ratio: Optional[float] = Field(default=1.5, ge=0.5)


@router.get("/risk-settings")
async def get_risk_settings(
    user: User = Depends(get_current_user),
):
    """Get user's global algo risk management parameters."""
    return get_risk_settings_for_user(user.id)


@router.post("/risk-settings")
async def save_risk_settings(
    req: RiskSettingsRequest,
    user: User = Depends(get_current_user),
):
    """Save user's global algo risk management parameters."""
    updated = save_risk_settings_for_user(user.id, req.dict(exclude_unset=True))
    return {"success": True, "settings": updated}

