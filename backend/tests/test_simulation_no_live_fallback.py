"""
SIMULATION mode must NEVER fall back to live Zebu market data.

The dangerous failure this guards against is silent: replay has no candle
for an instrument, so some code path helpfully "fills the gap" from the
live feed, and a simulated session quietly mixes in real market prices.

The correct behavior everywhere is: no replayed data -> no data.

Covered here:
    1. Live websocket ticks are dropped before touching the pipeline.
    2. Quote reads never reach the live provider in SIMULATION mode.
    3. No replay/downloader/simulation code can place an order.
"""

import inspect
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from core.market_data_mode import MarketDataMode, market_data_mode
from services.historical_replay import historical_replay_engine


@pytest.fixture(autouse=True)
def _clean_state():
    market_data_mode.reset()
    historical_replay_engine.reset()
    yield
    market_data_mode.reset()
    historical_replay_engine.reset()


@pytest.mark.asyncio
class TestLiveTicksBlockedInSimulation:
    """ZebuProvider websocket ticks must not reach the pipeline."""

    async def _provider(self):
        """
        A ZebuProvider with only the attributes _handle_tick reads, so the
        tick path can be exercised without a real broker connection.
        """
        from providers.zebu_provider import ZebuProvider

        provider = ZebuProvider.__new__(ZebuProvider)
        provider._price_cache = {}
        provider._last_tick_at = 0
        provider._redis = None
        return provider

    async def test_live_tick_is_dropped_in_simulation_mode(self):
        """
        The socket may still be connected when the mode flips. A tick
        arriving then must not reach quote_coordinator or the EventBus.
        """
        provider = await self._provider()
        provider._price_cache = {}
        provider._last_tick_at = 0

        tick = {
            "e": "NSE",
            "tk": "2885",
            "ts": "RELIANCE-EQ",
            "lp": "2513.45",
            "v": "1234567",
        }

        market_data_mode.set_mode(MarketDataMode.SIMULATION)

        # Patch the mapper to a valid canonical so this proves the MODE
        # guard specifically — not merely that the token was unmapped.
        with patch(
            "providers.zebu_provider.zebu_token_to_canonical",
            return_value="RELIANCE",
        ), patch(
            "market.quote_coordinator.quote_coordinator.ingest_equity_quote",
            new=AsyncMock(),
        ) as ingest, patch(
            "core.event_bus.event_bus.emit", new=AsyncMock()
        ) as emit:
            await provider._handle_tick(tick)

            ingest.assert_not_called()
            emit.assert_not_called()

        # The price cache must also stay clean — it is read by other paths.
        assert provider._price_cache == {}, (
            "a live tick must not populate the price cache in SIMULATION mode"
        )

    async def test_live_tick_still_flows_normally_in_live_mode(self):
        """The guard must not change LIVE behavior at all."""
        provider = await self._provider()
        provider._price_cache = {}
        provider._last_tick_at = 0

        tick = {
            "e": "NSE",
            "tk": "2885",
            "ts": "RELIANCE-EQ",
            "lp": "2513.45",
            "v": "1234567",
        }

        assert market_data_mode.is_live()

        # The contract master isn't loaded in tests, so the token would
        # otherwise resolve to None and the tick would be dropped as
        # "unmapped" regardless of mode. Patch the mapper so this test
        # actually exercises the LIVE ingest path.
        with patch(
            "providers.zebu_provider.zebu_token_to_canonical",
            return_value="RELIANCE",
        ), patch(
            "market.quote_coordinator.quote_coordinator.ingest_equity_quote",
            new=AsyncMock(),
        ) as ingest, patch("core.event_bus.event_bus.emit", new=AsyncMock()):
            await provider._handle_tick(tick)

            assert ingest.called, "LIVE mode must still ingest live ticks"

    async def test_futures_tick_blocked_in_simulation(self):
        """NFO/BFO ticks emit FUTURES_QUOTE — also must be blocked."""
        provider = await self._provider()
        provider._price_cache = {}
        provider._last_tick_at = 0

        market_data_mode.set_mode(MarketDataMode.SIMULATION)

        with patch(
            "providers.zebu_provider.zebu_token_to_canonical",
            return_value="NIFTY26AUGFUT",
        ), patch("core.event_bus.event_bus.emit", new=AsyncMock()) as emit, patch(
            "market.quote_coordinator.quote_coordinator.ingest_equity_quote",
            new=AsyncMock(),
        ):
            await provider._handle_tick(
                {"e": "NFO", "tk": "35000", "ts": "NIFTY26AUGFUT", "lp": "24500"}
            )
            emit.assert_not_called()


@pytest.mark.asyncio
class TestQuoteReadsNeverFallBackToLive:
    """market_data quote helpers must not call the provider in SIMULATION."""

    async def test_get_quote_safe_returns_none_instead_of_live_fetch(self):
        """
        No replayed data + SIMULATION mode => None, and crucially the live
        provider is never constructed or called.
        """
        import services.market_data as md

        market_data_mode.set_mode(MarketDataMode.SIMULATION)

        with patch.object(
            md, "_get_provider_for_user", side_effect=AssertionError(
                "live provider must never be used in SIMULATION mode"
            )
        ), patch.object(md, "_is_market_frozen", return_value=False), patch(
            "cache.redis_client.get_price", new=AsyncMock(return_value=None)
        ):
            result = await md.get_quote_safe("RELIANCE", "user-1")

        assert result is None, "must report no data rather than serving live prices"

    async def test_get_system_quote_safe_returns_none_instead_of_live_fetch(self):
        import services.market_data as md

        market_data_mode.set_mode(MarketDataMode.SIMULATION)

        with patch.object(
            md, "_get_any_provider", side_effect=AssertionError(
                "live provider must never be used in SIMULATION mode"
            )
        ), patch.object(md, "_is_market_frozen", return_value=False), patch(
            "cache.redis_client.get_price", new=AsyncMock(return_value=None)
        ):
            result = await md.get_system_quote_safe("RELIANCE")

        assert result is None

    async def test_get_quote_raises_rather_than_serving_live_data(self):
        """The raising variant must surface unavailability, not live data."""
        import services.market_data as md
        from services.market_data import ProviderDataUnavailable

        market_data_mode.set_mode(MarketDataMode.SIMULATION)

        with patch.object(
            md, "_get_provider_for_user", side_effect=AssertionError(
                "live provider must never be used in SIMULATION mode"
            )
        ), patch("cache.redis_client.get_price", new=AsyncMock(return_value=None)):
            with pytest.raises(ProviderDataUnavailable, match="SIMULATION"):
                await md.get_quote("RELIANCE", "user-1")

    async def test_live_mode_quote_path_is_unchanged(self):
        """Sanity: LIVE mode still reaches the provider exactly as before."""
        import services.market_data as md

        assert market_data_mode.is_live()

        provider = MagicMock()
        provider.get_quote = AsyncMock(
            return_value={"symbol": "RELIANCE", "price": 2500.0}
        )

        with patch.object(md, "_get_provider_for_user", return_value=provider), patch.object(
            md, "_align_quote_to_history", new=AsyncMock(side_effect=lambda s, q: q)
        ), patch.object(md, "_adjust_for_market_state", side_effect=lambda q: q):
            result = await md.get_quote("RELIANCE", "user-1")

        assert provider.get_quote.called, "LIVE mode must still call the provider"
        assert result["price"] == 2500.0


class TestNoOrderPlacementInSimulationCode:
    """
    Static proof that nothing in the replay/download/simulation surface can
    place an order, transfer funds, or otherwise mutate a real account.
    """

    MODULES = [
        "services.historical_replay",
        "services.historical_downloader",
        "services.simulation_control",
        "services.simulation_universe",
        "routes.simulation",
        "workers.historical_download_worker",
        "workers.historical_retention_worker",
    ]

    # Read-only Zebu endpoints the historical pipeline is allowed to touch.
    ALLOWED_ZEBU_CALLS = {"/TPSeries", "/EODChartData", "/SearchScrip", "/GetQuotes"}

    def _source(self, module_name):
        import importlib

        return inspect.getsource(importlib.import_module(module_name))

    @pytest.mark.parametrize("module_name", MODULES)
    def test_no_order_placement_calls(self, module_name):
        source = self._source(module_name)
        forbidden = [
            "PlaceOrder",
            "ModifyOrder",
            "CancelOrder",
            "ExitOrder",
            "place_order",
            "modify_order",
            "cancel_order",
            "BasketOrder",
            "/Funds",
            "payin",
            "payout",
            "withdraw",
        ]
        for token in forbidden:
            assert token not in source, (
                f"{module_name} must never reference {token!r} — "
                f"simulation code must not be able to touch a real account"
            )

    @pytest.mark.parametrize("module_name", MODULES)
    def test_no_direct_rest_post_calls(self, module_name):
        """
        Historical fetching goes through the provider's existing read-only
        helpers (_fetch_tp_series / _fetch_eod_data), never raw _rest_post,
        so no new Zebu HTTP surface is introduced here.
        """
        source = self._source(module_name)
        assert "_rest_post" not in source, (
            f"{module_name} must not call _rest_post directly; use the "
            f"existing read-only historical fetch helpers"
        )

    def test_broker_safety_blocks_order_endpoints(self):
        """The central guard still rejects order placement outright."""
        from services.broker_safety import BrokerSafetyError, validate_api_call

        for path in (
            "https://api.zebull.in/NorenWClientTP/PlaceOrder",
            "https://api.zebull.in/NorenWClientTP/ModifyOrder",
            "https://api.zebull.in/NorenWClientTP/CancelOrder",
            "https://api.zebull.in/NorenWClientTP/FundsTransfer",
        ):
            with pytest.raises(BrokerSafetyError):
                validate_api_call(path, "POST")

    def test_broker_safety_allows_readonly_historical_endpoints(self):
        """
        The endpoints the downloader relies on must be whitelisted, or the
        historical download would be blocked in production.
        """
        from services.broker_safety import validate_api_call

        for path in (
            "https://api.zebull.in/NorenWClientTP/TPSeries",
            "https://api.zebull.in/NorenWClientTP/EODChartData",
            "https://api.zebull.in/NorenWClientTP/SearchScrip",
            "https://api.zebull.in/NorenWClientTP/GetQuotes",
        ):
            assert validate_api_call(path, "POST") is True
