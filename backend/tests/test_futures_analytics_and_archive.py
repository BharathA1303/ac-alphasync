"""
Unit Tests for Futures Analytics & Archive Ingestion Engine.
"""

import pytest
from datetime import date
from services.futures_analytics_service import (
    classify_buildup,
    FuturesAnalyticsService,
    FuturesMicroAnalytics,
)


def test_buildup_classification():
    # Long Buildup: Price Up, OI Up
    buildup, sentiment = classify_buildup(price_change=25.5, oi_change=15000)
    assert buildup == "Long Buildup"
    assert sentiment == "Bullish"

    # Short Buildup: Price Down, OI Up
    buildup, sentiment = classify_buildup(price_change=-15.0, oi_change=8000)
    assert buildup == "Short Buildup"
    assert sentiment == "Bearish"

    # Long Unwinding: Price Down, OI Down
    buildup, sentiment = classify_buildup(price_change=-10.0, oi_change=-5000)
    assert buildup == "Long Unwinding"
    assert sentiment == "Bearish"

    # Short Covering: Price Up, OI Down
    buildup, sentiment = classify_buildup(price_change=12.0, oi_change=-12000)
    assert buildup == "Short Covering"
    assert sentiment == "Bullish"

    # Neutral
    buildup, sentiment = classify_buildup(price_change=0, oi_change=0)
    assert buildup == "Neutral"


def test_contract_micro_analytics_calculation():
    contract_meta = {
        "contract_symbol": "RELIANCE26MARFUT",
        "underlying": "RELIANCE",
        "exchange": "NFO",
        "instrument_type": "FUTSTK",
        "expiry_date": "2026-03-26",
        "expiry_label": "Near",
        "days_to_expiry": 20,
        "lot_size": 250,
        "tick_size": 0.05,
    }

    quote = {
        "ltp": 3050.0,
        "open": 3010.0,
        "high": 3060.0,
        "low": 3000.0,
        "close": 3000.0,
        "change": 50.0,
        "change_pct": 1.67,
        "volume": 20000,
        "oi": 150000,
        "oi_change": 10000,
        "vwap": 3035.0,
        "bid": 3049.5,
        "ask": 3050.5,
    }

    spot_quote = {
        "symbol": "RELIANCE.NS",
        "ltp": 3000.0,
        "change": 45.0,
        "change_pct": 1.52,
    }

    analytics = FuturesAnalyticsService.calculate_contract_analytics(
        contract_meta, quote, spot_quote
    )

    assert analytics.contract_symbol == "RELIANCE26MARFUT"
    assert analytics.underlying == "RELIANCE"
    assert analytics.basis == 50.0  # 3050 - 3000
    assert analytics.basis_pct == 1.67  # (50/3000)*100
    assert analytics.cost_of_carry_annualized > 0
    assert analytics.buildup == "Long Buildup"
    assert analytics.sentiment == "Bullish"
    assert analytics.contract_value == 3050.0 * 250
    assert analytics.turnover_cr is not None
    assert analytics.vwap_deviation == 15.0  # 3050 - 3035
    assert analytics.spread == 1.0  # 3050.5 - 3049.5


def test_ladder_analytics_calculation():
    contracts = [
        {
            "contract_symbol": "NIFTY26MARFUT",
            "underlying": "NIFTY",
            "expiry_label": "Near",
            "days_to_expiry": 10,
            "lot_size": 65,
            "instrument_type": "FUTIDX",
        },
        {
            "contract_symbol": "NIFTY30APRFUT",
            "underlying": "NIFTY",
            "expiry_label": "Mid",
            "days_to_expiry": 45,
            "lot_size": 65,
            "instrument_type": "FUTIDX",
        },
    ]

    quotes = {
        "NIFTY26MARFUT": {"ltp": 24100.0, "oi": 50000, "volume": 10000, "change": 100.0},
        "NIFTY30APRFUT": {"ltp": 24220.0, "oi": 20000, "volume": 3000, "change": 110.0},
    }

    spot_quote = {"symbol": "^NSEI", "ltp": 24000.0}

    ladder = FuturesAnalyticsService.calculate_ladder_analytics(
        "NIFTY", contracts, quotes, spot_quote
    )

    assert ladder["underlying"] == "NIFTY"
    assert len(ladder["contracts"]) == 2
    assert len(ladder["calendar_spreads"]) == 1
    assert ladder["calendar_spreads"][0]["spread"] == 120.0  # 24220 - 24100
    assert ladder["aggregate"]["total_oi"] == 70000
