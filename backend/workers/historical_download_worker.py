"""
Historical Download Worker — fetches the previous complete trading day's
candles for the scoped simulation universe, once per day.

Runs after the NSE session has closed so the day's data is complete.
Idempotent: re-running the same day updates rather than duplicates rows.
"""

import asyncio
import logging
from datetime import date, datetime, timezone

from database.connection import async_session_factory
from engines.market_session import IST
from services.historical_downloader import (
    historical_downloader,
    latest_complete_trading_day,
)

logger = logging.getLogger(__name__)

_CHECK_INTERVAL = 3600  # re-check hourly; download at most once per day
_STARTUP_DELAY = 120


class HistoricalDownloadWorker:
    """Downloads the latest complete trading day once per calendar day."""

    def __init__(self):
        self._running = False
        self._last_downloaded: date = None
        self._last_summary: dict = {}
        self._runs = 0

    async def _download_once(self) -> bool:
        """Returns True if a download actually ran."""
        target = latest_complete_trading_day()
        if self._last_downloaded == target:
            return False

        # Only attempt when a broker session exists — otherwise wait and retry.
        from services.broker_session import broker_session_manager

        if broker_session_manager.get_any_session() is None:
            logger.debug("Historical download deferred: no authenticated Zebu session")
            return False

        async with async_session_factory() as db:
            run = await historical_downloader.download_day(db, target)

        self._last_downloaded = target
        self._last_summary = {
            "trading_date": str(run.trading_date),
            "status": run.overall_status,
            "rows": run.total_rows,
            "succeeded": len(run.succeeded),
            "failed": len(run.failed),
        }
        self._runs += 1
        logger.info(f"Historical download worker completed: {self._last_summary}")
        return True

    async def run(self):
        self._running = True
        logger.info("Historical download worker started")

        try:
            await asyncio.sleep(_STARTUP_DELAY)
        except asyncio.CancelledError:
            return

        while self._running:
            try:
                await self._download_once()
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error(f"Historical download worker error: {exc}", exc_info=True)

            try:
                await asyncio.sleep(_CHECK_INTERVAL)
            except asyncio.CancelledError:
                break

        logger.info("Historical download worker stopped")

    async def stop(self):
        self._running = False

    def get_stats(self) -> dict:
        return {
            "running": self._running,
            "runs": self._runs,
            "last_downloaded": str(self._last_downloaded) if self._last_downloaded else None,
            "last_summary": self._last_summary,
        }


historical_download_worker = HistoricalDownloadWorker()
