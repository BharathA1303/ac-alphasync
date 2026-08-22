"""
Regression tests for the hard constraints of the simulation feature:

  1. MarketDataMode is a NEW concept, distinct from settings.SIMULATION_MODE.
  2. Weekend/holiday/closed market-session behavior is IDENTICAL regardless
     of MarketDataMode.
  3. Options chain reads replayed data in SIMULATION mode and live REST in
     LIVE mode.
  4. Simulated orders never reach Zebu (order-placement endpoints stay
     structurally blocked).
"""

from datetime import date, datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest

from config.settings import settings
from core.market_data_mode import MarketDataMode, market_data_mode
from engines.market_session import (
    NSE_HOLIDAYS_2026,
    IST,
    MarketSessionEngine,
    MarketState,
    market_session,
)


@pytest.fixture(autouse=True)
def _restore_mode():
    """Every test starts and ends in LIVE mode."""
    market_data_mode.reset()
    yield
    market_data_mode.reset()


# ── 1. Mode is distinct and defaults to LIVE ───────────────────────


class TestMarketDataMode:
    def test_defaults_to_live(self):
        assert market_data_mode.get_mode() == MarketDataMode.LIVE
        assert market_data_mode.is_live()
        assert not market_data_mode.is_simulation()

    def test_switching_modes(self):
        market_data_mode.set_mode(MarketDataMode.SIMULATION)
        assert market_data_mode.is_simulation()
        assert not market_data_mode.is_live()

        market_data_mode.set_mode(MarketDataMode.LIVE)
        assert market_data_mode.is_live()

    def test_accepts_string_values(self):
        market_data_mode.set_mode("simulation")
        assert market_data_mode.is_simulation()

    def test_is_independent_of_settings_simulation_mode(self):
        """
        settings.SIMULATION_MODE gates algo demo signals only. Toggling it
        must not change the market data source mode.
        """
        original = settings.SIMULATION_MODE
        try:
            settings.SIMULATION_MODE = True
            assert market_data_mode.is_live(), "SIMULATION_MODE must not flip data mode"

            settings.SIMULATION_MODE = False
            market_data_mode.set_mode(MarketDataMode.SIMULATION)
            assert market_data_mode.is_simulation(), (
                "data mode must be settable regardless of SIMULATION_MODE"
            )
        finally:
            settings.SIMULATION_MODE = original


# ── 2. Market session is mode-independent ──────────────────────────


class TestMarketSessionUnaffectedByMode:
    """Weekend/holiday/closed detection must NOT regress under either mode."""

    def _state_at(self, engine, when: datetime) -> MarketState:
        class _FrozenDatetime(datetime):
            @classmethod
            def now(cls, tz=None):
                return when

        with patch("engines.market_session.datetime", _FrozenDatetime):
            return engine.get_current_state()

    @pytest.mark.parametrize("mode", [MarketDataMode.LIVE, MarketDataMode.SIMULATION])
    @pytest.mark.parametrize(
        "when,expected",
        [
            (datetime(2026, 8, 22, 11, 0, tzinfo=IST), MarketState.WEEKEND),   # Saturday
            (datetime(2026, 8, 23, 11, 0, tzinfo=IST), MarketState.WEEKEND),   # Sunday
            (datetime(2026, 1, 26, 11, 0, tzinfo=IST), MarketState.HOLIDAY),   # Republic Day
            (datetime(2026, 12, 25, 11, 0, tzinfo=IST), MarketState.HOLIDAY),  # Christmas
            (datetime(2026, 8, 20, 3, 0, tzinfo=IST), MarketState.CLOSED),     # pre-dawn
            (datetime(2026, 8, 20, 20, 0, tzinfo=IST), MarketState.CLOSED),    # night
            (datetime(2026, 8, 20, 9, 5, tzinfo=IST), MarketState.PRE_MARKET),
            (datetime(2026, 8, 20, 11, 0, tzinfo=IST), MarketState.OPEN),
            (datetime(2026, 8, 20, 15, 35, tzinfo=IST), MarketState.CLOSING),
            (datetime(2026, 8, 20, 15, 50, tzinfo=IST), MarketState.AFTER_MARKET),
        ],
    )
    def test_state_identical_in_both_modes(self, mode, when, expected):
        market_data_mode.set_mode(mode)
        engine = MarketSessionEngine()
        assert self._state_at(engine, when) == expected

    @pytest.mark.parametrize("mode", [MarketDataMode.LIVE, MarketDataMode.SIMULATION])
    def test_frozen_flag_on_weekend_in_both_modes(self, mode):
        market_data_mode.set_mode(mode)
        engine = MarketSessionEngine()
        saturday = datetime(2026, 8, 22, 11, 0, tzinfo=IST)
        assert self._state_at(engine, saturday) == MarketState.WEEKEND
        # Frozen behavior derives from state != OPEN, which is mode-independent.
        assert self._state_at(engine, saturday) != MarketState.OPEN

    def test_holiday_calendar_untouched(self):
        """The 2026 holiday set must not have been modified by this feature."""
        assert date(2026, 1, 26) in NSE_HOLIDAYS_2026
        assert date(2026, 12, 25) in NSE_HOLIDAYS_2026
        assert len(NSE_HOLIDAYS_2026) == 16

    def test_market_session_engine_has_no_market_data_mode_coupling(self):
        """market_session.py must not import or branch on MarketDataMode."""
        import inspect

        import engines.market_session as ms

        source = inspect.getsource(ms)
        assert "MarketDataMode" not in source
        assert "market_data_mode" not in source


# ── 3. Options chain source switching ──────────────────────────────


class TestOptionsChainModeSwitching:
    def test_live_mode_returns_none_so_rest_path_runs(self):
        from routes.options import _replay_option_quote

        market_data_mode.set_mode(MarketDataMode.LIVE)
        with patch(
            "services.historical_replay.historical_replay_engine.get_option_quote",
            return_value={"lp": 99.0},
        ) as lookup:
            assert _replay_option_quote("NIFTY24000CE", "1234") is None
            lookup.assert_not_called()

    def test_simulation_mode_returns_replayed_quote(self):
        from routes.options import _replay_option_quote

        market_data_mode.set_mode(MarketDataMode.SIMULATION)
        replayed = {"tsym": "NIFTY24000CE", "lp": 120.5, "stat": "Ok", "oi": 300}
        with patch(
            "services.historical_replay.historical_replay_engine.get_option_quote",
            return_value=replayed,
        ):
            got = _replay_option_quote("NIFTY24000CE", "1234")

        assert got is not None
        assert got["lp"] == 120.5

    def test_simulation_mode_without_replay_data_never_falls_through_to_live(self):
        """
        No replayed state must NOT return None in SIMULATION mode.

        Returning None would let the caller drop through to Zebu's live
        /GetQuotes and price a simulated chain off real market data. The
        correct answer is an explicit empty quote: "no data", zeroed.
        """
        from routes.options import _replay_option_quote

        market_data_mode.set_mode(MarketDataMode.SIMULATION)
        with patch(
            "services.historical_replay.historical_replay_engine.get_option_quote",
            return_value=None,
        ):
            got = _replay_option_quote("UNKNOWNCE", "999")

        assert got is not None, (
            "SIMULATION mode must never fall through to the live REST path"
        )
        assert got["lp"] == 0, "an unknown leg must price as zero, not live"
        assert got["oi"] == 0
        assert got["source"] == "historical_replay_no_data"

    def test_replayed_quote_normalizes_into_option_side(self):
        """A replay-shaped quote must flow through the existing normalizer."""
        from routes.options import _to_option_side

        replayed = {
            "tsym": "NIFTY28AUG2624000CE",
            "token": "7301",
            "lp": 120.5,
            "c": 100.0,
            "v": 5000,
            "oi": 300,
            "stat": "Ok",
        }
        side = _to_option_side(replayed, "CE", 24000.0, "2026-08-28")

        assert side["ltp"] == 120.5
        assert side["oi"] == 300
        assert side["volume"] == 5000
        assert side["tsym"] == "NIFTY28AUG2624000CE"

    def test_contract_master_loader_is_not_mode_dependent(self):
        """Contract-master parsing is identity data, shared by both modes."""
        import inspect

        from routes.options import _load_zebu_option_contracts

        source = inspect.getsource(_load_zebu_option_contracts)
        assert "market_data_mode" not in source
        assert "historical_replay" not in source


# ── 4. Orders never reach Zebu ─────────────────────────────────────


class TestNoRealOrdersReachBroker:
    def test_order_placement_patterns_are_blocked(self):
        from services.broker_safety import BLOCKED_PATTERNS

        joined = " ".join(BLOCKED_PATTERNS).lower()
        for dangerous in ("placeorder", "modifyorder", "cancelorder", "exitorder"):
            assert dangerous in joined, f"{dangerous} must remain blocked"

    @pytest.mark.parametrize(
        "path",
        [
            "/PlaceOrder",
            "/placeorder",
            "/ModifyOrder",
            "/CancelOrder",
            "/ExitOrder",
            "/NorenWClientTP/PlaceOrder",
            "https://api.zebu.example/NorenWClientTP/PlaceOrder",
        ],
    )
    def test_order_endpoints_rejected_by_safety_layer(self, path):
        from services.broker_safety import BrokerSafetyError, validate_api_call

        with pytest.raises(BrokerSafetyError):
            validate_api_call(path, "POST")

    def test_readonly_market_endpoints_still_allowed(self):
        """The safety layer must not have become over-restrictive."""
        from services.broker_safety import validate_api_call

        for path in ("/TPSeries", "/GetQuotes", "/GetOptionChain", "/SearchScrip"):
            assert validate_api_call(path, "POST") is True, (
                f"{path} is read-only and must stay allowed"
            )

    def test_trading_engine_contains_no_broker_order_calls(self):
        """place_order must be entirely local — no Zebu REST/order calls."""
        import inspect

        import services.trading_engine as te

        source = inspect.getsource(te)
        for forbidden in ("PlaceOrder", "placeorder", "_rest_post"):
            assert forbidden not in source, (
                f"trading_engine must not reference {forbidden}"
            )

    def test_replay_engine_places_no_orders(self):
        """The replay engine only publishes quotes; it never touches orders."""
        import inspect

        import services.historical_replay as hr

        source = inspect.getsource(hr)
        for forbidden in ("place_order", "PlaceOrder", "_rest_post"):
            assert forbidden not in source

    def test_primary_download_path_uses_whitelisted_endpoint(self):
        """
        Replay data is sourced from /TPSeries, which IS whitelisted. This
        test pins the endpoint the simulation pipeline actually depends on.
        """
        from services.broker_safety import validate_api_call

        assert validate_api_call("/TPSeries", "POST") is True

    def test_eod_chart_data_is_narrowly_scoped(self):
        """
        /EODChartData was added to ALLOWED_ENDPOINTS (it's read-only OHLCV,
        used by the daily-interval leg of the historical downloader). The
        pattern must be an exact, anchored match — not a wildcard that
        could be exploited to reach an unrelated or dangerous endpoint by
        smuggling it into the same path.
        """
        from services.broker_safety import BrokerSafetyError, validate_api_call

        assert validate_api_call("/EODChartData", "POST") is True

        # Adjacent-but-different paths must still be rejected — the
        # whitelist entry must not have accidentally become a prefix or
        # substring match.
        for path in (
            "/EODChartDataExtra",
            "/NotEODChartData",
            "/EODChartData/PlaceOrder",
            "/api/EODChartData/PlaceOrder",
        ):
            with pytest.raises(BrokerSafetyError):
                validate_api_call(path, "POST")

    def test_eod_chart_data_cannot_be_combined_with_an_order_path(self):
        """
        BLOCKED_PATTERNS is checked before ALLOWED_ENDPOINTS and always
        wins (services/broker_safety.py:validate_api_call). A path that
        matches both must still be blocked.
        """
        from services.broker_safety import BrokerSafetyError, validate_api_call

        with pytest.raises(BrokerSafetyError):
            validate_api_call("/EODChartData/PlaceOrder", "POST")

    def test_downloader_only_uses_readonly_historical_endpoints(self):
        """The downloader must reuse only read-only Zebu fetch methods."""
        import inspect

        import services.historical_downloader as hd

        source = inspect.getsource(hd)
        assert "_fetch_tp_series" in source
        assert "_fetch_eod_data" in source
        for forbidden in ("PlaceOrder", "placeorder", "ModifyOrder"):
            assert forbidden not in source
