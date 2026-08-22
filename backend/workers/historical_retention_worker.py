"""
Historical Retention Worker — prunes market data older than the retention
window (default 100 days).

Deletes ONLY from historical_candles and download_status.
NEVER touches users, orders, positions, portfolios, auth, broker config,
or an active simulation session.
"""

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import delete, func, select

from database.connection import async_session_factory
from models.market_data import DownloadStatus, HistoricalCandle

logger = logging.getLogger(__name__)

RETENTION_DAYS = 100
_CHECK_INTERVAL = 86400  # once daily
_STARTUP_DELAY = 300  # let the system stabilize first


def cutoff_date(retention_days: int = RETENTION_DAYS, today: date = None) -> date:
    """Rows with trading_date strictly BEFORE this date are deleted."""
    today = today or datetime.now(timezone.utc).date()
    return today - timedelta(days=retention_days)


async def purge_old_market_data(
    db, retention_days: int = RETENTION_DAYS, today: date = None, commit: bool = True
) -> dict:
    """
    Delete candles and download-status rows older than the retention window.

    Returns a summary dict of what was removed. Rows exactly AT the cutoff
    are retained — only strictly older rows are deleted.

    `commit=False` leaves the transaction open so callers (notably tests)
    control the transaction boundary.
    """
    cutoff = cutoff_date(retention_days, today)

    candle_count = (
        await db.execute(
            select(func.count())
            .select_from(HistoricalCandle)
            .where(HistoricalCandle.trading_date < cutoff)
        )
    ).scalar_one()

    status_count = (
        await db.execute(
            select(func.count())
            .select_from(DownloadStatus)
            .where(DownloadStatus.trading_date < cutoff)
        )
    ).scalar_one()

    if candle_count:
        await db.execute(
            delete(HistoricalCandle).where(HistoricalCandle.trading_date < cutoff)
        )
    if status_count:
        await db.execute(
            delete(DownloadStatus).where(DownloadStatus.trading_date < cutoff)
        )

    if commit:
        await db.commit()
    else:
        await db.flush()

    summary = {
        "cutoff": str(cutoff),
        "retention_days": retention_days,
        "candles_deleted": int(candle_count),
        "download_status_deleted": int(status_count),
    }

    if candle_count or status_count:
        logger.info(
            "Historical retention purge: deleted %d candles and %d download_status "
            "rows with trading_date < %s",
            candle_count,
            status_count,
            cutoff,
        )
    else:
        logger.debug(f"Historical retention purge: nothing older than {cutoff}")

    return summary


class HistoricalRetentionWorker:
    """Runs the retention purge once per day."""

    def __init__(self):
        self._running = False
        self._last_summary: dict = {}
        self._runs = 0

    async def run(self):
        self._running = True
        logger.info("Historical retention worker started")

        try:
            await asyncio.sleep(_STARTUP_DELAY)
        except asyncio.CancelledError:
            return

        while self._running:
            try:
                async with async_session_factory() as db:
                    self._last_summary = await purge_old_market_data(db)
                self._runs += 1
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error(f"Historical retention purge failed: {exc}", exc_info=True)

            try:
                await asyncio.sleep(_CHECK_INTERVAL)
            except asyncio.CancelledError:
                break

        logger.info("Historical retention worker stopped")

    async def stop(self):
        self._running = False

    def get_stats(self) -> dict:
        return {
            "running": self._running,
            "runs": self._runs,
            "retention_days": RETENTION_DAYS,
            "last_summary": self._last_summary,
        }


historical_retention_worker = HistoricalRetentionWorker()
