"""
Simulation control routes (admin only).

Drives the historical replay engine and the LIVE/SIMULATION market data
mode. Never places orders and never contacts the broker.
"""

import logging
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database.connection import get_db
from dependencies.admin import get_admin_user
from models.market_data import SimulationSession
from models.user import User
from services.historical_downloader import (
    historical_downloader,
    latest_complete_trading_day,
)
from services.simulation_control import simulation_controller

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/simulation", tags=["Simulation"])


class StartSimulationRequest(BaseModel):
    simulation_date: Optional[date] = None
    speed: float = Field(default=1.0, gt=0, le=100)


class SpeedRequest(BaseModel):
    speed: float = Field(gt=0, le=100)


@router.get("/status")
async def simulation_status(admin: User = Depends(get_admin_user)):
    """Current market data mode and replay engine state."""
    return simulation_controller.status()


@router.post("/start")
async def start_simulation(
    payload: StartSimulationRequest,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Switch the quote pipeline to replayed historical data."""
    try:
        status = await simulation_controller.start(
            db, payload.simulation_date, payload.speed
        )
        await db.commit()
        return status
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/stop")
async def stop_simulation(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the quote pipeline to the live Zebu feed."""
    status = await simulation_controller.stop(db)
    await db.commit()
    return status


@router.post("/pause")
async def pause_simulation(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    status = await simulation_controller.pause(db)
    await db.commit()
    return status


@router.post("/resume")
async def resume_simulation(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    status = await simulation_controller.resume(db)
    await db.commit()
    return status


@router.post("/speed")
async def set_simulation_speed(
    payload: SpeedRequest,
    admin: User = Depends(get_admin_user),
):
    return simulation_controller.set_speed(payload.speed)


@router.get("/sessions")
async def list_simulation_sessions(
    limit: int = 20,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Recent simulation sessions."""
    rows = (
        await db.execute(
            select(SimulationSession)
            .order_by(SimulationSession.created_at.desc())
            .limit(min(limit, 100))
        )
    ).scalars().all()
    return {
        "sessions": [
            {
                "id": str(s.id),
                "simulation_date": str(s.simulation_date),
                "status": s.status,
                "speed": float(s.speed),
                "simulation_time": (
                    s.simulation_time.isoformat() if s.simulation_time else None
                ),
                "started_at": s.started_at.isoformat() if s.started_at else None,
                "ended_at": s.ended_at.isoformat() if s.ended_at else None,
            }
            for s in rows
        ]
    }


@router.post("/download")
async def trigger_download(
    trading_date: Optional[date] = None,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Manually run the historical download for a trading day.

    Idempotent — re-running a day updates rather than duplicates rows.
    """
    target = trading_date or latest_complete_trading_day()
    run = await historical_downloader.download_day(db, target)
    return {
        "trading_date": str(run.trading_date),
        "status": run.overall_status,
        "rows": run.total_rows,
        "succeeded": len(run.succeeded),
        "failed": len(run.failed),
        "failures": [
            {"instrument": r.key, "error": r.error} for r in run.failed
        ],
    }
