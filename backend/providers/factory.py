"""
Provider Factory — Create MarketProvider instances by broker type.

Each user gets their own provider instance managed by BrokerSessionManager.
"""

import logging
from typing import Optional

from providers.base import MarketProvider

logger = logging.getLogger(__name__)


async def create_provider(broker: str, user_id: str, creds: dict) -> Optional[MarketProvider]:
    """
    Dispatch to the correct broker provider factory.

    creds dict structure:
        zebu:       { user_id, session_token }
        aliceblue:  { user_id, session_token }  (access_token stored as session_token)
        zerodha:    { api_key, access_token }
    """
    broker = (broker or "").lower().strip()
    if broker == "zebu":
        # ZebuProvider's user_id is sent as `uid`/`actid` in the live Zebu
        # WebSocket auth payload — it must be the broker's own client ID,
        # not AlphaSync's internal UUID (creds.get("user_id") is the broker
        # uid per BrokerSessionManager._load_credentials).
        return await create_zebu_provider(
            creds.get("user_id", user_id),
            creds.get("session_token", ""),
            api_key=creds.get("api_key", ""),
        )
    if broker == "aliceblue":
        return await create_alice_blue_provider(
            user_id=user_id,
            user_id_broker=creds.get("user_id", user_id),
            session_token=creds.get("session_token", ""),
        )
    if broker == "zerodha":
        return await create_zerodha_provider(
            user_id=creds.get("user_id", user_id),
            api_key=creds.get("api_key", ""),
            access_token=creds.get("session_token", ""),
        )
    logger.warning(f"Unknown broker: {broker}")
    return None


async def create_zebu_provider(
    user_id: str,
    session_token: str,
    api_key: str = "",
) -> MarketProvider:
    from config.settings import settings
    from providers.zebu_provider import ZebuProvider
    from cache.redis_client import get_redis

    redis_cache = await get_redis(settings.REDIS_URL)
    provider = ZebuProvider(
        ws_url=settings.ZEBU_WS_URL,
        api_url=settings.ZEBU_API_URL,
        user_id=user_id,
        api_key=api_key or settings.ZEBU_API_SECRET or settings.ZEBU_API_KEY,
        session_token=session_token,
        redis_client=redis_cache,
    )
    logger.info(f"Created ZebuProvider for user {str(user_id)[:8] if user_id else '?'}...")
    return provider


async def create_alice_blue_provider(
    user_id: str,
    user_id_broker: str,
    session_token: str,
) -> MarketProvider:
    from config.settings import settings
    from providers.alice_blue_provider import AliceBlueProvider
    from cache.redis_client import get_redis

    redis_cache = await get_redis(settings.REDIS_URL)
    provider = AliceBlueProvider(
        ws_url=settings.ALICE_BLUE_WS_URL,
        api_url=settings.ALICE_BLUE_API_URL,
        user_id=user_id_broker,
        session_token=session_token,
        redis_client=redis_cache,
    )
    logger.info(f"Created AliceBlueProvider for user {str(user_id)[:8] if user_id else '?'}...")
    return provider


async def create_zerodha_provider(
    user_id: str,
    api_key: str,
    access_token: str,
) -> MarketProvider:
    from config.settings import settings
    from providers.zerodha_provider import ZerodhaProvider
    from cache.redis_client import get_redis

    redis_cache = await get_redis(settings.REDIS_URL)
    provider = ZerodhaProvider(
        ws_url=settings.ZERODHA_WS_URL,
        api_key=api_key or settings.ZERODHA_API_KEY,
        access_token=access_token,
        user_id=user_id,
        api_url=settings.ZERODHA_API_URL,
        redis_client=redis_cache,
    )
    logger.info(f"Created ZerodhaProvider for user {str(user_id)[:8] if user_id else '?'}...")
    return provider
