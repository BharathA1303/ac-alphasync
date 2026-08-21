"""
Master Session — single shared Zebu/MYNT account used as the app-wide
market data feed. Credentials come from ZEBU_MASTER_* settings (populated
via GitHub Secrets in production). Registers its provider under
BrokerSessionManager's MASTER_SESSION_ID so all existing per-user/any-session
lookups (get_any_session, market_data._get_any_provider, etc.) pick it up
with no changes to those call sites.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from config.settings import settings

logger = logging.getLogger(__name__)

# Daily re-login target time (IST)
DAILY_REFRESH_HOUR_IST = 8
DAILY_REFRESH_MINUTE_IST = 30


class MasterSessionService:
    """Owns the lifecycle of the single master Zebu data-feed session."""

    def __init__(self):
        self._initialized = False
        self._last_login_at: Optional[datetime] = None
        self._last_error: Optional[str] = None
        self._broker_user_id: Optional[str] = None
        self._refresh_task: Optional[asyncio.Task] = None
        self._running = False

    def _is_configured(self) -> bool:
        return bool(
            settings.ZEBU_MASTER_USER_ID
            and settings.ZEBU_MASTER_PASSWORD
            and settings.ZEBU_MASTER_TOTP_SECRET
            and (settings.ZEBU_MASTER_API_KEY or settings.ZEBU_API_SECRET)
        )

    async def initialize(self) -> bool:
        """Log in to the master Zebu account and register its provider."""
        from services.broker_auth import broker_auth_service
        from services.broker_session import broker_session_manager, MASTER_SESSION_ID
        from providers.factory import create_zebu_provider

        if not self._is_configured():
            self._last_error = "Master session disabled — ZEBU_MASTER_* settings not configured"
            logger.info(self._last_error)
            return False

        try:
            result = await broker_auth_service.zebu_master_login()
        except Exception as e:
            self._last_error = str(e)
            logger.error(f"Master Zebu login failed: {e}")
            return False

        try:
            provider = await create_zebu_provider(
                result["broker_user_id"],
                result["session_token"],
                api_key=result.get("api_key", ""),
            )
            await provider.start()
            broker_session_manager.register_session(MASTER_SESSION_ID, provider)
        except Exception as e:
            self._last_error = f"Failed to start master provider: {e}"
            logger.error(self._last_error)
            return False

        self._initialized = True
        self._last_login_at = datetime.now(timezone.utc)
        self._last_error = None
        self._broker_user_id = result["broker_user_id"]
        logger.info(f"Master Zebu session initialized (broker_user={self._broker_user_id})")
        return True

    async def refresh(self) -> bool:
        """Tear down the existing master provider (if any) and log in again."""
        from services.broker_session import broker_session_manager, MASTER_SESSION_ID

        existing = broker_session_manager.get_session(MASTER_SESSION_ID)
        if existing:
            try:
                await existing.stop()
            except Exception as e:
                logger.warning(f"Error stopping previous master provider: {e}")

        return await self.initialize()

    def is_active(self) -> bool:
        from services.broker_session import broker_session_manager, MASTER_SESSION_ID
        from providers.base import ProviderStatus

        provider = broker_session_manager.get_session(MASTER_SESSION_ID)
        if provider is None:
            return False
        return getattr(provider, "_status", None) == ProviderStatus.CONNECTED

    def get_provider(self):
        from services.broker_session import broker_session_manager, MASTER_SESSION_ID

        return broker_session_manager.get_session(MASTER_SESSION_ID)

    def get_status(self) -> dict:
        return {
            "active": self.is_active(),
            "configured": self._is_configured(),
            "user_id": self._broker_user_id,
            "missing": [] if self._is_configured() else ["ZEBU_MASTER_* settings"],
            "last_login_at": self._last_login_at.isoformat() if self._last_login_at else None,
            "last_error": self._last_error,
        }

    # ── Daily scheduled refresh (8:30 AM IST) ───────────────────────

    def start_daily_refresh(self) -> None:
        """Start the background task that re-logs-in every day at 8:30 IST."""
        self._running = True
        self._refresh_task = asyncio.create_task(self._daily_refresh_loop())

    async def stop(self) -> None:
        self._running = False
        if self._refresh_task and not self._refresh_task.done():
            self._refresh_task.cancel()

    async def _seconds_until_next_run(self) -> float:
        from zoneinfo import ZoneInfo
        from datetime import timedelta

        ist = ZoneInfo("Asia/Kolkata")
        now = datetime.now(ist)
        target = now.replace(
            hour=DAILY_REFRESH_HOUR_IST,
            minute=DAILY_REFRESH_MINUTE_IST,
            second=0,
            microsecond=0,
        )
        if target <= now:
            target = target + timedelta(days=1)
        return (target - now).total_seconds()

    async def _daily_refresh_loop(self) -> None:
        try:
            while self._running:
                delay = await self._seconds_until_next_run()
                await asyncio.sleep(delay)
                if not self._running:
                    return
                logger.info("Master Zebu session: running scheduled 8:30 AM IST refresh")
                try:
                    await self.refresh()
                except Exception as e:
                    logger.error(f"Scheduled master session refresh failed: {e}")
        except asyncio.CancelledError:
            return


master_session_service = MasterSessionService()
