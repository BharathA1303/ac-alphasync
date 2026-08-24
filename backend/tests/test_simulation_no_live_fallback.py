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
class TestWebSocketNeverConnectsInSimulation:
    """
    Regression coverage for a real production bug (found 2026-08-24): the
    master Zebu session is authenticated once at app startup (before
    market hours logic runs) so the historical downloader has a session to
    read /TPSeries from. That authentication also opened a live WebSocket
    connection (ZebuProvider.start() -> _connect()) unconditionally — the
    earlier _handle_tick guard only stopped ticks from that connection
    being WRITTEN into the pipeline, it never stopped the connection
    (and its live subscribe/receive loop) from existing in the first
    place. Two consecutive requests to the same /api/market/quote/NIFTY
    endpoint in production returned DIFFERENT sources ("frozen" then
    "live") 45 seconds apart, proving live ticks were still reaching
    quotes through a path the earlier fixes didn't cover.

    The fix is at the true boundary: ZebuProvider.start() must not call
    _connect() (which opens the WebSocket, authenticates it, subscribes,
    and starts the receive loop) while SIMULATION mode is active — but it
    must still leave the provider constructed and REST-usable, since
    _rest_post() (used by the historical downloader's /TPSeries and
    /EODChartData calls) has no dependency on the WebSocket at all.
    """

    async def _provider(self):
        from providers.zebu_provider import ZebuProvider

        return ZebuProvider(
            ws_url="wss://example.invalid/NorenWSTP/",
            api_url="https://example.invalid/NorenWClientTP",
            user_id="test-user",
            session_token="test-token",
        )

    async def test_start_skips_connect_in_simulation_mode(self):
        market_data_mode.set_mode(MarketDataMode.SIMULATION)
        provider = await self._provider()

        with patch.object(
            provider, "_connect", new=AsyncMock()
        ) as connect:
            await provider.start()

        connect.assert_not_called()

    async def test_start_still_connects_in_live_mode(self):
        """LIVE behavior must be completely unchanged."""
        assert market_data_mode.is_live()
        provider = await self._provider()

        with patch.object(provider, "_connect", new=AsyncMock()) as connect:
            await provider.start()

        connect.assert_called_once()

    async def test_rest_calls_still_work_with_no_websocket_open(self):
        """
        The historical downloader's whole reason for needing a session:
        _rest_post must keep working even though start() never opened a
        WebSocket in SIMULATION mode.
        """
        market_data_mode.set_mode(MarketDataMode.SIMULATION)
        provider = await self._provider()

        with patch.object(provider, "_connect", new=AsyncMock()):
            await provider.start()

        assert provider._ws is None, "no WebSocket object should exist"
        assert provider._api_url, "REST base URL must still be set"
        assert provider._session_token, "REST auth token must still be set"


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

    async def test_get_batch_quotes_never_reaches_live_provider_in_simulation(self):
        """
        Regression test for a real production bug (found 2026-08-24):
        get_batch_quotes() was the one sibling of get_quote /
        get_quote_safe / get_system_quote / get_system_quote_safe that
        never got the SIMULATION guard those four received. It is called
        by workers/market_worker.py's main sweep loop, which ran
        unconditionally through OPEN market hours regardless of
        MarketDataMode — the actual root cause of live prices reaching
        users even after the WebSocket-connect fix closed the tick-stream
        path: this REST-polling path was independent of that fix entirely.
        """
        import services.market_data as md

        market_data_mode.set_mode(MarketDataMode.SIMULATION)

        with (
            patch.object(md, "_is_market_frozen", return_value=False),
            patch(
                "cache.redis_client.get_batch_prices",
                new=AsyncMock(return_value={}),
            ),
            patch(
                "cache.redis_client.get_last_price",
                new=AsyncMock(return_value=None),
            ),
            patch.object(
                md,
                "_get_any_provider",
                side_effect=AssertionError(
                    "live provider must never be used in SIMULATION mode"
                ),
            ),
        ):
            result = await md.get_batch_quotes(["RELIANCE", "TCS"])

        assert result == {}

    async def test_get_batch_quotes_still_serves_replayed_redis_data(self):
        """A symbol with a fresh replayed Redis quote must still be served."""
        import services.market_data as md

        market_data_mode.set_mode(MarketDataMode.SIMULATION)
        # get_batch_quotes formats symbols before the Redis lookup
        # (RELIANCE -> RELIANCE.NS), so the mocked cache must be keyed the
        # same way the real call would be.
        replayed = {"symbol": "RELIANCE.NS", "price": 2500.0, "source": "historical_replay"}

        with (
            patch.object(md, "_is_market_frozen", return_value=False),
            patch(
                "cache.redis_client.get_batch_prices",
                new=AsyncMock(return_value={"RELIANCE.NS": replayed}),
            ),
            patch(
                "cache.redis_client.get_last_price",
                new=AsyncMock(return_value=None),
            ),
            patch.object(
                md, "_align_quote_to_history", new=AsyncMock(side_effect=lambda s, q: q)
            ),
            patch.object(md, "_is_quote_stale", return_value=False),
            patch.object(md, "_adjust_for_market_state", side_effect=lambda q: q),
            patch.object(
                md,
                "_get_any_provider",
                side_effect=AssertionError(
                    "live provider must never be used in SIMULATION mode"
                ),
            ),
        ):
            result = await md.get_batch_quotes(["RELIANCE"])

        assert result.get("RELIANCE.NS", {}).get("price") == 2500.0


class TestOptionsChainNeverReachesLiveRest:
    """
    The options chain is the one surface with a live REST fallback baked
    into its normal flow, so it gets its own guard.
    """

    def test_unknown_leg_yields_empty_quote_not_none(self):
        """
        None is the signal that means "fall through to live /GetQuotes".
        In SIMULATION mode that signal must never be produced.
        """
        from routes.options import _replay_option_quote

        market_data_mode.set_mode(MarketDataMode.SIMULATION)
        with patch(
            "services.historical_replay.historical_replay_engine.get_option_quote",
            return_value=None,
        ):
            got = _replay_option_quote("NOSUCH24000CE", "0")

        assert got is not None
        assert got["lp"] == 0
        assert got["source"] == "historical_replay_no_data"

    def test_lookup_failure_still_does_not_fall_through(self):
        """Even an exception must not open the door to live data."""
        from routes.options import _replay_option_quote

        market_data_mode.set_mode(MarketDataMode.SIMULATION)
        with patch(
            "services.historical_replay.historical_replay_engine.get_option_quote",
            side_effect=RuntimeError("engine exploded"),
        ):
            got = _replay_option_quote("BOOM24000CE", "1")

        assert got is not None, (
            "a replay lookup error must not degrade into a live quote"
        )
        assert got["lp"] == 0

    def test_live_mode_still_returns_none_to_use_the_rest_path(self):
        """LIVE behavior must be completely unchanged."""
        from routes.options import _replay_option_quote

        assert market_data_mode.is_live()
        with patch(
            "services.historical_replay.historical_replay_engine.get_option_quote",
            return_value={"lp": 42.0},
        ) as lookup:
            assert _replay_option_quote("NIFTY24000CE", "1234") is None
            lookup.assert_not_called()

    @pytest.mark.asyncio
    async def test_underlying_future_price_never_hits_live_zebu_in_simulation(self):
        """
        _zebu_underlying_future_price is a live-only spot-price fallback
        (/SearchScrip + /GetQuotes), reached from _zebu_option_chain when
        the primary quote pipeline has no spot price yet. That "no spot
        price" outcome is the NORMAL SIMULATION-mode state whenever replay
        hasn't produced data for this underlying — the fallback itself must
        still never call live Zebu; the correct answer stays 0.0.
        """
        from routes.options import _zebu_underlying_future_price

        market_data_mode.set_mode(MarketDataMode.SIMULATION)
        provider = AsyncMock()
        price = await _zebu_underlying_future_price(provider, "NIFTY", "NFO")

        assert price == 0.0
        provider._rest_post.assert_not_called()

    @pytest.mark.asyncio
    async def test_live_mode_underlying_future_price_still_calls_zebu(self):
        """The LIVE-mode fallback path itself must be unchanged."""
        from routes.options import _zebu_underlying_future_price

        assert market_data_mode.is_live()
        provider = AsyncMock()
        provider._rest_post.return_value = {"stat": "Not_Ok"}
        await _zebu_underlying_future_price(provider, "NIFTY", "NFO")

        provider._rest_post.assert_called()

    @pytest.mark.asyncio
    async def test_option_chain_never_falls_through_to_live_discovery_in_simulation(
        self,
    ):
        """
        _zebu_option_chain's tail (/SearchScrip, /GetOptionChain, /GetQuotes)
        has no replay awareness of its own — it must never run in
        SIMULATION mode. When the primary contract-master path finds
        nothing (e.g. this underlying/expiry is outside the replay
        universe), the correct SIMULATION-mode answer is "no chain", not a
        live discovery sequence.
        """
        from routes.options import _zebu_option_chain

        market_data_mode.set_mode(MarketDataMode.SIMULATION)

        with (
            patch(
                "routes.options._get_active_zebu_provider",
                new=AsyncMock(return_value=AsyncMock()),
            ),
            patch(
                "routes.options.get_system_quote_live_only",
                new=AsyncMock(return_value=None),
            ),
            patch(
                "routes.options._zebu_contract_master_chain",
                new=AsyncMock(return_value=None),
            ) as contract_master,
        ):
            result = await _zebu_option_chain("NIFTY", None, 5)

        assert result is None
        contract_master.assert_called()

    @pytest.mark.asyncio
    async def test_get_system_quote_live_only_refuses_fallback_in_simulation(self):
        """
        get_system_quote_live_only is the spot-price source _zebu_option_chain
        consults before falling back to a live REST call. If it silently
        served a live quote in SIMULATION mode, the fallback guard above
        would never even engage — real prices would flow through here
        first. Must return None, not a live-fetched quote, when replay
        (Redis) has nothing. market_frozen is forced False so this actually
        exercises the SIMULATION guard rather than the (separately-tested,
        pre-existing, mode-independent) frozen-market path.
        """
        import services.market_data as md

        market_data_mode.set_mode(MarketDataMode.SIMULATION)
        with (
            patch.object(md, "_is_market_frozen", return_value=False),
            patch("cache.redis_client.get_price", new=AsyncMock(return_value=None)),
            patch.object(
                md,
                "_get_any_provider_live",
                side_effect=AssertionError(
                    "live provider must never be used in SIMULATION mode"
                ),
            ),
        ):
            result = await md.get_system_quote_live_only("^NSEI")

        assert result is None

    @pytest.mark.asyncio
    async def test_chain_endpoint_accepts_an_all_zero_simulation_chain(self):
        """
        Regression test for a real production bug (found 2026-08-24): a
        SIMULATION-mode chain where every leg legitimately has ltp=0 (no
        replayed candle yet for those strikes) was being treated as "the
        fetch failed" by the /chain/{symbol} route's own success check,
        which fell through to the LIVE-only 503 "Zebu live feed is
        unavailable" error — even though nothing was actually broken and
        _replay_option_quote() had already done its job correctly.

        A non-empty chain returned while in SIMULATION mode must always be
        served, regardless of whether its legs happen to be priced at 0.
        """
        from fastapi import HTTPException

        import routes.options as opt

        market_data_mode.set_mode(MarketDataMode.SIMULATION)

        all_zero_chain = {
            "symbol": "NIFTY",
            "underlying_price": 24300.0,
            "expiry_dates": ["2026-08-25"],
            "selected_expiry": "2026-08-25",
            "chain": [
                {
                    "CE": {"tsym": "NIFTY25AUG2624000CE", "ltp": 0, "token": "1"},
                    "PE": {"tsym": "NIFTY25AUG2624000PE", "ltp": 0, "token": "2"},
                }
            ],
            "stream_symbols": [],
            "timestamp": "2026-08-24T04:00:00Z",
            "source": "historical_replay_no_data",
        }

        with (
            patch.object(
                opt, "_zebu_option_chain", new=AsyncMock(return_value=all_zero_chain)
            ),
            patch.object(opt, "_set_redis_options_cache", new=AsyncMock()),
        ):
            result = await opt.option_chain(
                "NIFTY",
                expiry=None,
                strikes=20,
                snapshot=0,
                reconcile=0,
                user=None,
            )

        assert result["chain"], "a fetched SIMULATION chain must not be discarded"
        assert result["chain"][0]["CE"]["ltp"] == 0

    @pytest.mark.asyncio
    async def test_chain_endpoint_still_503s_on_a_genuinely_failed_live_fetch(self):
        """LIVE-mode "nothing came back" must still 503, unchanged."""
        from fastapi import HTTPException

        import routes.options as opt

        assert market_data_mode.is_live()

        with (
            patch.object(opt, "_zebu_option_chain", new=AsyncMock(return_value=None)),
            patch.object(opt, "_get_redis_options_cache", new=AsyncMock(return_value=None)),
        ):
            with pytest.raises(HTTPException) as exc_info:
                await opt.option_chain(
                    "NIFTY",
                    expiry=None,
                    strikes=20,
                    snapshot=0,
                    reconcile=0,
                    user=None,
                )

        assert exc_info.value.status_code == 503


class TestMarketDataWorkerNeverPollsLiveInSimulation:
    """
    Regression coverage for the actual root cause of a real production
    incident (2026-08-24): workers/market_worker.py runs an independent
    background sweep loop that calls provider.get_batch_quotes() (a live
    Zebu /GetQuotes REST call) for every subscribed symbol, on its own
    timer, completely unconditionally through OPEN market hours — with no
    relationship to MarketDataMode, the WebSocket-connect guard, or any of
    the other SIMULATION-mode fixes. It was the one live-data path none of
    those fixes ever touched, confirmed via two consecutive real
    production API calls returning "source":"market_data_worker" with a
    genuinely moving price, 45 seconds apart, during SIMULATION mode.
    """

    def test_run_loop_checks_simulation_mode_before_fetching_quotes(self):
        """
        Static structural proof: the SIMULATION check must appear in
        run()'s source BEFORE the line that calls get_batch_quotes,
        exactly like the pre-existing market_frozen check it sits beside.
        A guard added anywhere else in the method (e.g. after the fetch)
        would not actually prevent the live call.
        """
        import inspect

        import workers.market_worker as mw

        source = inspect.getsource(mw.MarketDataWorker.run)
        guard_pos = source.find("market_data_mode.is_simulation()")
        fetch_pos = source.find("get_batch_quotes")

        assert guard_pos != -1, "run() must check MarketDataMode.is_simulation()"
        assert fetch_pos != -1, "run() must still call get_batch_quotes somewhere"
        assert guard_pos < fetch_pos, (
            "the SIMULATION guard must appear before the live quote fetch, "
            "not after it"
        )

    def test_simulation_guard_continues_the_loop_like_the_frozen_market_guard(self):
        """
        The SIMULATION check must short-circuit the same way the existing
        market_frozen check does (sleep + continue), not merely be present
        somewhere without actually skipping the fetch.
        """
        import inspect

        import workers.market_worker as mw

        source = inspect.getsource(mw.MarketDataWorker.run)
        idx = source.find("market_data_mode.is_simulation()")
        assert idx != -1
        # The next ~150 characters after the guard must contain a continue,
        # mirroring "if market_frozen: ... continue" immediately above it.
        window = source[idx : idx + 200]
        assert "continue" in window, (
            "the SIMULATION guard must skip the rest of this loop iteration"
        )


class TestReplaySourceIsNotMislabeledFrozen:
    """
    Regression test for a real production bug (found 2026-08-24, after the
    live-data leaks above were closed): with the leaks fixed, quotes
    correctly stopped mixing in real Zebu data, but /api/market/quote/NIFTY
    then showed "source":"frozen" with a price that only changed every few
    polls — even though a raw Redis read of the same key showed
    "source":"historical_replay" with a timestamp that WAS advancing.

    The replay data itself was correct and moving. The bug was purely
    cosmetic but user-facing and confusing: _normalize_display_source()
    buckets raw source strings into "frozen" / "live" / official-EOD for
    API responses, and its live_sources allowlist predated this feature —
    "historical_replay" matched neither the frozen nor live sets, so it
    fell through to the function's default-to-frozen fallthrough branch,
    regardless of how fresh the underlying data actually was.
    """

    def test_historical_replay_source_displays_as_live_during_open_hours(self):
        from services.market_data import _normalize_display_source

        assert _normalize_display_source("historical_replay", market_open=True) == "live"

    def test_historical_replay_source_still_treated_as_frozen_outside_open_hours(self):
        """
        Outside OPEN hours the existing frozen-display behavior must be
        unchanged — this fix only affects how replay data is labeled
        DURING active hours, not the separate closed-market freeze UX.
        """
        from services.market_data import _normalize_display_source

        assert (
            _normalize_display_source("historical_replay", market_open=False) == "frozen"
        )


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
