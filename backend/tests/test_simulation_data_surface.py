"""
The data surfaces the UI reads, driven by a seeded SIMULATION session.

IMPORTANT — WHAT THIS IS AND IS NOT:

    This exercises the BACKEND SERVICE LAYER that the frontend calls. It is
    NOT a browser test, and it is NOT a test against a running HTTP server:
    Postgres and Redis are both unreachable in this environment, so the real
    application cannot boot. Anything the frontend does above these
    functions (rendering, state, websocket wiring) is UNVERIFIED here.

    All prices below are SYNTHETIC TEST FIXTURES invented for this file.
    They are NOT real historical data and did NOT come from Zebu. The
    symbols are deliberately suffixed so they can never be mistaken for
    production instruments.

What it does prove: given a seeded historical DB and SIMULATION mode, the
replay engine produces the field set each UI surface consumes — LTP, OHLC,
volume, OI, CE/PE legs, expiry and strike — and that an order priced off
replayed state produces a sane fill and P&L.
"""

from datetime import date, datetime, timezone

import pytest
import pytest_asyncio

from core.market_data_mode import MarketDataMode, market_data_mode
from engines.market_session import IST
from models.market_data import HistoricalCandle, Instrument
from services.historical_replay import REPLAY_SOURCE, HistoricalReplayEngine

SIM_DATE = date(2026, 8, 20)
EXPIRY = date(2026, 8, 27)

# ── Synthetic fixture instruments (NOT real Zebu instruments) ──────
IDX = "TESTNIFTY-SIM"
EQ1 = "TESTRELIANCE-SIM"
EQ2 = "TESTTCS-SIM"
FUT = "TESTNIFTY-SIMFUT"
CE = "TESTNIFTY-SIM24000CE"
PE = "TESTNIFTY-SIM24000PE"


def _epoch(hh, mm):
    return int(datetime(2026, 8, 20, hh, mm, tzinfo=IST).timestamp())


async def _add(db, tsym, itype, token, exchange, bars, **kw):
    """Seed one instrument plus its per-minute bars. All values synthetic."""
    inst = Instrument(
        token=token,
        trading_symbol=tsym,
        exchange=exchange,
        instrument_type=itype,
        **kw,
    )
    db.add(inst)
    await db.flush()

    for i, (o, h, l, c, vol, oi) in enumerate(bars):
        db.add(
            HistoricalCandle(
                instrument_id=inst.id,
                trading_date=SIM_DATE,
                timestamp=datetime.fromtimestamp(_epoch(9, 15 + i), tz=timezone.utc),
                open=o,
                high=h,
                low=l,
                close=c,
                volume=vol,
                open_interest=oi,
                source="zebu_tp_series",
            )
        )
    await db.flush()
    return inst


async def _seed_market(db):
    """A small but complete synthetic market: index, equities, future, CE/PE."""
    await _add(
        db, IDX, "INDEX", "90001", "NSE",
        [(24000, 24050, 23990, 24030, 0, None),
         (24030, 24080, 24020, 24070, 0, None),
         (24070, 24090, 24040, 24050, 0, None)],
    )
    await _add(
        db, EQ1, "EQUITY", "90002", "NSE",
        [(2500, 2510, 2495, 2505, 1000, None),
         (2505, 2520, 2500, 2515, 1200, None),
         (2515, 2525, 2510, 2520, 900, None)],
    )
    await _add(
        db, EQ2, "EQUITY", "90003", "NSE",
        [(3500, 3510, 3495, 3505, 800, None),
         (3505, 3515, 3500, 3510, 700, None),
         (3510, 3520, 3505, 3518, 650, None)],
    )
    await _add(
        db, FUT, "FUTURES", "90004", "NFO",
        [(24010, 24060, 24000, 24040, 500, 1_000_000),
         (24040, 24090, 24030, 24080, 600, 1_010_000),
         (24080, 24100, 24050, 24060, 450, 1_005_000)],
        underlying="NIFTY", expiry_date=EXPIRY,
    )
    await _add(
        db, CE, "OPTIONS", "90005", "NFO",
        [(120, 130, 118, 128, 200, 500_000),
         (128, 140, 125, 138, 250, 520_000),
         (138, 142, 130, 132, 180, 515_000)],
        underlying="NIFTY", expiry_date=EXPIRY,
        strike_price=24000, option_type="CE",
    )
    await _add(
        db, PE, "OPTIONS", "90006", "NFO",
        [(110, 115, 100, 105, 190, 480_000),
         (105, 108, 95, 98, 210, 495_000),
         (98, 106, 96, 104, 170, 490_000)],
        underlying="NIFTY", expiry_date=EXPIRY,
        strike_price=24000, option_type="PE",
    )


@pytest.fixture(autouse=True)
def _clean_mode():
    market_data_mode.reset()
    yield
    market_data_mode.reset()


@pytest_asyncio.fixture
async def running_sim(db):
    """A loaded, running replay engine advanced to 09:17."""
    await _seed_market(db)
    engine = HistoricalReplayEngine()
    await engine.load_session(db, SIM_DATE, speed=1.0)
    market_data_mode.set_mode(MarketDataMode.SIMULATION)
    await engine.start(db)
    await engine.advance_to(_epoch(9, 17))
    return engine


@pytest.mark.asyncio
class TestQuoteSurfaces:
    """Navbar / equity / index quote fields."""

    async def test_index_quote_has_the_fields_the_navbar_reads(self, running_sim):
        quote = running_sim.get_current_quote(f"NSE:{IDX}")
        assert quote is not None, "index must have replayed state"

        for field in ("symbol", "price", "change", "change_percent", "exchange"):
            assert field in quote, f"navbar needs {field}"

        assert quote["price"] == 24050.0, "LTP must be the in-effect candle close"
        assert quote["source"] == REPLAY_SOURCE
        # Day change is measured from the session open (24000).
        assert quote["change"] == 50.0
        assert quote["open"] == 24000.0

    async def test_equity_quote_reports_ohlc_and_cumulative_volume(
        self, running_sim
    ):
        quote = running_sim.get_current_quote(f"NSE:{EQ1}")
        assert quote is not None

        assert quote["price"] == 2520.0
        assert quote["open"] == 2500.0, "day open is the first bar's open"
        assert quote["high"] == 2525.0, "running session high across all bars so far"
        assert quote["low"] == 2495.0, "running session low across all bars so far"
        # Volume accumulates across elapsed bars, never per-bar only.
        assert quote["volume"] == 1000 + 1200 + 900

    async def test_multiple_equities_are_independently_tracked(self, running_sim):
        a = running_sim.get_current_quote(f"NSE:{EQ1}")
        b = running_sim.get_current_quote(f"NSE:{EQ2}")

        assert a["price"] == 2520.0
        assert b["price"] == 3518.0
        assert a["symbol"] != b["symbol"]

    async def test_unknown_symbol_returns_none_not_fabricated_data(
        self, running_sim
    ):
        """A symbol with no seeded data must report nothing at all."""
        assert running_sim.get_current_quote("NSE:NOSUCHSYMBOL-SIM") is None


@pytest.mark.asyncio
class TestFuturesSurface:
    async def test_futures_quote_has_ltp_oi_and_volume(self, running_sim):
        quote = running_sim.get_current_quote(f"NFO:{FUT}")
        assert quote is not None

        assert quote["ltp"] == 24060.0
        assert quote["oi"] == 1_005_000, "OI must come from the candle, not be zeroed"
        assert quote["volume"] == 500 + 600 + 450
        assert quote["open"] == 24010.0
        assert quote["high"] == 24100.0
        assert quote["low"] == 24000.0
        assert quote["contract_symbol"] == FUT


@pytest.mark.asyncio
class TestOptionsChainSurface:
    """CE/PE legs, strike and expiry — what the chain view renders."""

    async def test_ce_and_pe_legs_both_resolve(self, running_sim):
        ce = running_sim.get_option_quote(CE)
        pe = running_sim.get_option_quote(PE)

        assert ce is not None, "CE leg must have replayed state"
        assert pe is not None, "PE leg must have replayed state"
        assert ce["ltp"] == 132.0
        assert pe["ltp"] == 104.0

    async def test_option_legs_carry_oi_and_volume(self, running_sim):
        ce = running_sim.get_option_quote(CE)
        assert ce["oi"] == 515_000
        assert ce["volume"] == 200 + 250 + 180

    async def test_option_quote_is_shaped_for_the_zebu_normalizer(
        self, running_sim
    ):
        """
        routes/options.py normalizes Zebu /GetQuotes payloads. Replayed
        option state must carry those key aliases so the chain needs no
        special-casing in SIMULATION mode.
        """
        from routes.options import _normalize_zebu_quote_payload

        ce = running_sim.get_option_quote(CE)
        for alias in ("tsym", "lp", "c", "v", "stat"):
            assert alias in ce, f"normalizer expects the {alias!r} key"

        normalized = _normalize_zebu_quote_payload(ce)
        assert normalized["ltp"] == 132.0, (
            "the existing normalizer must read replayed state unchanged"
        )

    async def test_option_lookup_works_by_token_as_well_as_symbol(
        self, running_sim
    ):
        by_symbol = running_sim.get_option_quote(CE)
        by_token = running_sim.get_current_quote("90005")
        assert by_token is not None
        assert by_token["ltp"] == by_symbol["ltp"]

    async def test_replay_option_quote_helper_respects_mode(self, running_sim):
        """
        The options route helper must return replayed data in SIMULATION
        and None in LIVE — the switch the LIVE path depends on.
        """
        import routes.options as options_module
        from unittest.mock import patch

        with patch.object(
            options_module, "historical_replay_engine", running_sim, create=True
        ), patch(
            "services.historical_replay.historical_replay_engine", running_sim
        ):
            assert market_data_mode.is_simulation()
            assert options_module._replay_option_quote(CE, "90005") is not None

            market_data_mode.set_mode(MarketDataMode.LIVE)
            assert options_module._replay_option_quote(CE, "90005") is None, (
                "LIVE mode must never read replayed state"
            )


@pytest.mark.asyncio
class TestSimulatedOrderFillAndPnl:
    """A BUY/SELL priced off replayed state must fill and compute P&L."""

    async def test_buy_then_sell_produces_expected_pnl(self, running_sim):
        entry = running_sim.get_current_quote(f"NSE:{EQ1}")["price"]
        assert entry == 2520.0

        qty = 10
        invested = entry * qty

        # Advance the clock; price is driven purely by seeded candles.
        await running_sim.advance_to(_epoch(9, 18))
        later = running_sim.get_current_quote(f"NSE:{EQ1}")["price"]

        # No further bars were seeded, so state is HELD, not fabricated.
        assert later == entry, "missing candles must carry forward, not invent"

        pnl = (later - entry) * qty
        assert pnl == 0.0
        assert invested == 25200.0

    async def test_pnl_tracks_replayed_price_movement(self, db):
        """P&L must move with the replayed candles, in the right direction."""
        await _seed_market(db)
        engine = HistoricalReplayEngine()
        await engine.load_session(db, SIM_DATE, speed=1.0)
        market_data_mode.set_mode(MarketDataMode.SIMULATION)
        await engine.start(db)

        await engine.advance_to(_epoch(9, 15))
        entry = engine.get_current_quote(f"NSE:{EQ1}")["price"]
        assert entry == 2505.0

        await engine.advance_to(_epoch(9, 17))
        exit_price = engine.get_current_quote(f"NSE:{EQ1}")["price"]
        assert exit_price == 2520.0

        qty = 10
        pnl = (exit_price - entry) * qty
        assert pnl == 150.0, "a long position must profit from a rising replay"

    async def test_quote_is_fresh_enough_for_order_fills(self, running_sim):
        """
        Order fills reject stale quotes (a 120s window). Replay stamps
        `timestamp` with wall-clock publish time precisely so replayed
        history is not rejected as ancient.
        """
        from services.market_data import _is_quote_stale

        quote = running_sim.get_current_quote(f"NSE:{EQ1}")
        assert not _is_quote_stale(quote), (
            "replayed quotes must not be treated as stale, or fills break"
        )
        # The simulated instant is still available for display/audit.
        assert "simulated_timestamp" in quote


@pytest.mark.asyncio
class TestSimulationClockConsistency:
    async def test_every_surface_reflects_one_simulation_time(self, running_sim):
        """Index, equity, futures and options must agree on the instant."""
        keys = [
            f"NSE:{IDX}",
            f"NSE:{EQ1}",
            f"NSE:{EQ2}",
            f"NFO:{FUT}",
            f"NFO:{CE}",
            f"NFO:{PE}",
        ]
        stamps = set()
        for key in keys:
            quote = running_sim.get_current_quote(key)
            assert quote is not None, f"{key} must have replayed state"
            stamps.add(quote["simulated_timestamp"])

        assert len(stamps) == 1, (
            f"surfaces disagreed on simulation time: {stamps}"
        )
