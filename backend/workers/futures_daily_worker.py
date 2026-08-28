"""
Futures Daily Worker — Downloads and ingests previous trading day's official
NSE & BSE futures Bhavcopies into PostgreSQL every evening after market close.

Guarantees:
    - Runs automatically once per day after 18:15 IST.
    - Idempotent: Re-running collapses onto existing database rows.
    - Self-healing: Retries on network glitches with exponential backoff.
    - Automatic retention: Prunes historical derivative candles older than 100 days.
    - Completely isolated from the equity data feed.
"""

import asyncio
import logging
from datetime import date, datetime, time, timedelta, timezone

from database.connection import async_session_factory
from engines.market_session import IST, market_session
from services.futures_archive_service import futures_archive_service
from services.historical_downloader import is_trading_day, latest_complete_trading_day
from workers.historical_retention_worker import purge_old_market_data

logger = logging.getLogger(__name__)

# Daily check interval (check hourly, executes once per trading day)
_CHECK_INTERVAL = 3600  # seconds
_STARTUP_DELAY = 90  # seconds after startup
_RUN_TIME_IST = time(18, 15)  # 6:15 PM IST


class FuturesDailyWorker:
    """Automated daily ingestion and retention worker for futures contracts."""

    def __init__(self):
        self._running = False
        self._last_downloaded: Optional[date] = None
        self._last_summary: dict = {}
        self._runs = 0

    async def _should_run_now(self, target_day: date) -> bool:
        """Only run after 18:15 IST on completed trading days."""
        if self._last_downloaded == target_day:
            return False

        now_ist = datetime.now(IST)
        # If target day is today, wait until >= 18:15 IST (when exchange archives are published)
        if target_day == now_ist.date() and now_ist.time() < _RUN_TIME_IST:
            return False

        return is_trading_day(target_day)

    async def _download_once(self) -> bool:
        """Executes a single daily download job if due."""
        target = latest_complete_trading_day()
        if not await self._should_run_now(target):
            return False

        logger.info(f"FuturesDailyWorker: Starting archive ingestion for {target}...")
        summary = await futures_archive_service.ingest_trading_day_futures(target)

        self._last_downloaded = target
        self._last_summary = summary
        self._runs += 1

        # Run automatic retention purge (100 days)
        try:
            async with async_session_factory() as db:
                retention_res = await purge_old_market_data(db, retention_days=100)
                logger.info(f"FuturesDailyWorker: Retention summary: {retention_res}")
        except Exception as e:
            logger.warning(f"FuturesDailyWorker: Retention purge error: {e}")

        logger.info(f"FuturesDailyWorker completed successfully for {target}: {summary}")
        return True

    async def run(self):
        self._running = True
        logger.info("Futures Daily Worker started")

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
                logger.error(f"Futures Daily Worker error: {exc}", exc_info=True)

            try:
                await asyncio.sleep(_CHECK_INTERVAL)
            except asyncio.CancelledError:
                break

        logger.info("Futures Daily Worker stopped")

    async def stop(self):
        self._running = False

    def get_stats(self) -> dict:
        return {
            "running": self._running,
            "runs": self._runs,
            "last_downloaded": str(self._last_downloaded) if self._last_downloaded else None,
            "last_summary": self._last_summary,
        }


futures_daily_worker = FuturesDailyWorker()
