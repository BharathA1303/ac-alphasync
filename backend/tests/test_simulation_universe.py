"""
Universe resolution must track the app's REAL supported symbol set and
must never be able to trigger a runaway download.

The two properties under test:

    SOURCED  — instruments come from the live production registries
               (symbol_mapper / futures_contract_registry), not from a
               hardcoded list that would drift out of sync.
    CAPPED   — no matter how large those registries get, resolution stays
               bounded, and the cap drops equities before indices/options.
"""

from unittest.mock import AsyncMock, patch

import pytest

from services import simulation_universe as su
from services.simulation_universe import (
    UniverseInstrument,
    build_universe,
    _equity_instruments,
    _futures_underlyings,
    _index_instruments,
    _option_instruments,
    _option_underlyings,
)


def _contract(token: str, tsym: str, exchange: str = "NFO") -> dict:
    return {"token": token, "symbol": tsym, "exchange": exchange}


def _fake_mapper_entries(n_equities=5):
    """Mimic get_all_zebu_tokens(): indices ('^') plus equities."""
    entries = [
        {"canonical": "^NSEI", "trading_symbol": "Nifty 50", "token": "26000", "exchange": "NSE"},
        {"canonical": "^NSEBANK", "trading_symbol": "Nifty Bank", "token": "26009", "exchange": "NSE"},
    ]
    for i in range(n_equities):
        name = f"EQ{i:03d}"
        entries.append(
            {
                "canonical": f"{name}.NS",
                "trading_symbol": f"{name}-EQ",
                "token": str(1000 + i),
                "exchange": "NSE",
            }
        )
    return entries


class TestUniverseIsSourcedFromTheApp:
    def test_equities_come_from_the_symbol_mapper(self):
        """Not a hardcoded list — the real mapper is the source."""
        with patch.object(
            su, "_mapped_symbols", return_value=_fake_mapper_entries(3)
        ):
            out = _equity_instruments()

        symbols = sorted(i.underlying for i in out)
        assert symbols == ["EQ000", "EQ001", "EQ002"]
        assert all(i.instrument_type == "EQUITY" for i in out)
        # Indices must not leak into the equity bucket.
        assert not any(i.canonical_symbol.startswith("^") for i in out)

    def test_indices_come_from_the_symbol_mapper(self):
        with patch.object(
            su, "_mapped_symbols", return_value=_fake_mapper_entries(3)
        ):
            out = _index_instruments()

        canonicals = sorted(i.canonical_symbol for i in out)
        assert canonicals == ["^NSEBANK", "^NSEI"]
        assert all(i.instrument_type == "INDEX" for i in out)
        # Friendly names resolve back from INDEX_CANONICAL.
        assert sorted(i.underlying for i in out) == ["BANKNIFTY", "NIFTY"]

    def test_adding_a_symbol_to_the_app_adds_it_to_the_universe(self):
        """
        The point of sourcing from the mapper: the universe grows with the
        app automatically, with no edit to this module.
        """
        with patch.object(su, "_mapped_symbols", return_value=_fake_mapper_entries(2)):
            before = len(_equity_instruments())
        with patch.object(su, "_mapped_symbols", return_value=_fake_mapper_entries(7)):
            after = len(_equity_instruments())

        assert after == before + 5

    def test_futures_underlyings_come_from_the_registry(self):
        from services.futures_contract_registry import futures_contract_registry

        fake = {"NIFTY": [{}], "BANKNIFTY": [{}], "RELIANCE": [{}], "TCS": [{}]}
        with patch.object(
            futures_contract_registry, "underlying_to_contracts", fake
        ):
            out = _futures_underlyings()

        assert set(out) == {"NIFTY", "BANKNIFTY", "RELIANCE", "TCS"}
        # Index underlyings are prioritized ahead of the equity tail.
        assert out[0] in ("NIFTY", "BANKNIFTY")

    def test_universe_is_empty_when_registries_are_empty(self):
        """No fabricated fallback list when the app knows no symbols."""
        with patch.object(su, "_mapped_symbols", return_value=[]):
            assert _equity_instruments() == []
            assert _index_instruments() == []


class TestUniverseCaps:
    def test_equity_cap_is_enforced(self):
        with patch.object(
            su, "_mapped_symbols", return_value=_fake_mapper_entries(500)
        ):
            out = _equity_instruments(max_equities=25)

        assert len(out) == 25, "the equity cap must bound resolution"

    def test_equity_cap_selection_is_deterministic(self):
        """Repeated runs must pick the SAME instruments, not drift."""
        entries = _fake_mapper_entries(200)
        with patch.object(su, "_mapped_symbols", return_value=entries):
            first = [i.key for i in _equity_instruments(max_equities=10)]
        with patch.object(su, "_mapped_symbols", return_value=list(reversed(entries))):
            second = [i.key for i in _equity_instruments(max_equities=10)]

        assert first == second, "cap selection must be order-independent"

    def test_popular_stocks_survive_the_cap_over_alphabetically_earlier_symbols(self):
        """
        Regression test for a real production bug (found 2026-08-24): the
        mapped equity set grows to the full NSE contract master (~4000
        symbols) in production. Capping it with a plain alphabetical sort
        picked "20MICRONS", "21STCENMGM", ... — legitimate NSE tickers
        that happen to sort first — ahead of RELIANCE, TCS, HDFCBANK, and
        the rest of the app's own POPULAR_INDIAN_STOCKS list (exactly
        what workers/market_worker.py auto-subscribes on every live boot,
        and what every watchlist/navbar view of this app actually shows).
        Those symbols were correctly downloaded and replayed internally
        the whole time — they were simply never selected into the
        universe at all, so their quotes were never reachable via the API.
        """
        # Symbols that alphabetically precede "RELIANCE" and "TCS", to
        # prove they do NOT win the cap purely by sorting first anymore.
        early_alphabet = [
            {
                "canonical": f"{name}.NS",
                "trading_symbol": f"{name}-EQ",
                "token": f"9{i:04d}",
                "exchange": "NSE",
            }
            for i, name in enumerate(
                ["20MICRONS", "21STCENMGM", "360ONE", "3BBLACKBIO", "3MINDIA"]
            )
        ]
        popular = [
            {
                "canonical": "RELIANCE.NS",
                "trading_symbol": "RELIANCE-EQ",
                "token": "2885",
                "exchange": "NSE",
            },
            {
                "canonical": "TCS.NS",
                "trading_symbol": "TCS-EQ",
                "token": "11536",
                "exchange": "NSE",
            },
        ]
        entries = early_alphabet + popular

        with patch.object(su, "_mapped_symbols", return_value=entries):
            out = _equity_instruments(max_equities=3)

        selected = {i.canonical_symbol for i in out}
        assert "RELIANCE.NS" in selected, "RELIANCE must survive a tight cap"
        assert "TCS.NS" in selected, "TCS must survive a tight cap"

    def test_futures_underlying_cap_is_enforced(self):
        from services.futures_contract_registry import futures_contract_registry

        fake = {f"SYM{i:03d}": [{}] for i in range(100)}
        with patch.object(
            futures_contract_registry, "underlying_to_contracts", fake
        ):
            out = _futures_underlyings(max_underlyings=4)

        assert len(out) == 4

    def test_option_underlyings_stay_index_only(self):
        """
        Equity option chains would multiply the universe; options are
        restricted to the index underlyings.
        """
        out = _option_underlyings()
        assert out, "expected at least one option underlying"
        assert set(out).issubset(set(su.PREFERRED_OPTION_UNDERLYINGS))

    @pytest.mark.asyncio
    async def test_total_universe_cap_drops_equities_before_indices(self):
        """
        When the hard ceiling bites it must sacrifice the equity tail, never
        an index — losing an index would break the chain views.
        """
        with patch.object(
            su, "_mapped_symbols", return_value=_fake_mapper_entries(400)
        ), patch.object(su, "_futures_instruments", return_value=[]), patch.object(
            su, "_option_instruments", new=AsyncMock(return_value=[])
        ):
            out = await build_universe(
                include_options=False, max_universe_size=20, max_equities=400
            )

        assert len(out) == 20
        types = {i.instrument_type for i in out}
        assert "INDEX" in types, "indices must survive the cap"
        index_count = sum(1 for i in out if i.instrument_type == "INDEX")
        assert index_count == 2, "both indices must be retained"

    @pytest.mark.asyncio
    async def test_full_registry_cannot_trigger_unbounded_download(self):
        """The headline safety property: a huge master stays bounded."""
        with patch.object(
            su, "_mapped_symbols", return_value=_fake_mapper_entries(5000)
        ), patch.object(su, "_futures_instruments", return_value=[]), patch.object(
            su, "_option_instruments", new=AsyncMock(return_value=[])
        ):
            out = await build_universe(include_options=False)

        assert len(out) <= su.MAX_UNIVERSE_SIZE, (
            "the whole NSE must never resolve into a download run"
        )


class TestOptionExpirySelection:
    """
    Regression coverage for a real production bug: _option_instruments used
    to sort expiry STRINGS alphabetically before truncating to
    EXPIRY_DEPTH, instead of sorting by the parsed date. Zebu's contract
    master carries far-dated placeholder/LEAPS-style expiries (e.g.
    "2029-06-26", "2031-06-24") alongside the real near-term ones — on
    production this meant the two nearest REAL expiries were dropped in
    favor of two thin, multi-year-out placeholder expiries, collapsing the
    live options chain down to a single unusable strike.
    """

    @pytest.mark.asyncio
    async def test_nearest_two_real_expiries_are_selected_not_alphabetical_ones(self):
        by_expiry = {
            # Far-dated placeholder expiries, deliberately given dense
            # strike maps so a wrong pick would be immediately visible.
            "2029-06-26": {
                24000.0: {"CE": _contract("1", "NIFTY26JUN2924000CE")},
            },
            "2031-06-24": {
                24000.0: {"CE": _contract("2", "NIFTY24JUN3124000CE")},
            },
            # The two real near-term expiries.
            "2026-08-25": {
                24000.0: {"CE": _contract("3", "NIFTY25AUG2624000CE")},
                24050.0: {"CE": _contract("4", "NIFTY25AUG2624050CE")},
            },
            "2026-09-29": {
                24000.0: {"CE": _contract("5", "NIFTY29SEP2624000CE")},
            },
        }

        with patch.object(su, "_option_underlyings", return_value=["NIFTY"]), patch(
            "routes.options._load_zebu_option_contracts",
            new=AsyncMock(return_value=by_expiry),
        ):
            out = await _option_instruments()

        expiries_selected = {inst.expiry_date.isoformat() for inst in out}
        assert expiries_selected == {"2026-08-25", "2026-09-29"}, (
            f"expected the two nearest real expiries, got {expiries_selected}"
        )
        # Both strikes from the richer near-term expiry must survive.
        strikes_2508 = {
            inst.strike_price for inst in out if inst.expiry_date.isoformat() == "2026-08-25"
        }
        assert strikes_2508 == {24000.0, 24050.0}

    @pytest.mark.asyncio
    async def test_all_expiries_in_the_past_still_returns_the_nearest_ones(self):
        """
        If every stored expiry is already in the past (contract master
        stale / not yet refreshed), fall back to the nearest ones by date
        rather than returning nothing.
        """
        by_expiry = {
            "2020-01-02": {
                100.0: {"CE": _contract("1", "NIFTY02JAN20100CE")},
            },
            "2020-01-09": {
                100.0: {"CE": _contract("2", "NIFTY09JAN20100CE")},
            },
            "2019-01-03": {
                100.0: {"CE": _contract("3", "NIFTY03JAN19100CE")},
            },
        }

        with patch.object(su, "_option_underlyings", return_value=["NIFTY"]), patch(
            "routes.options._load_zebu_option_contracts",
            new=AsyncMock(return_value=by_expiry),
        ):
            out = await _option_instruments()

        expiries_selected = {inst.expiry_date.isoformat() for inst in out}
        assert expiries_selected == {"2020-01-02", "2020-01-09"}, (
            "fallback must pick the nearest (least-stale) expiries, not an "
            f"arbitrary alphabetical pair; got {expiries_selected}"
        )


class TestUniverseOverride:
    def test_override_pins_resolution_to_an_explicit_list(self):
        with patch.object(
            su, "_mapped_symbols", return_value=_fake_mapper_entries(50)
        ):
            out = _equity_instruments(override=["EQ001", "EQ007"])

        assert sorted(i.underlying for i in out) == ["EQ001", "EQ007"]

    def test_override_applies_to_indices(self):
        with patch.object(
            su, "_mapped_symbols", return_value=_fake_mapper_entries(3)
        ):
            out = _index_instruments(override=["NIFTY"])

        assert [i.canonical_symbol for i in out] == ["^NSEI"]

    @pytest.mark.asyncio
    async def test_empty_override_means_full_supported_set(self):
        """An empty override is 'no restriction', not 'nothing'."""
        with patch.object(
            su, "_mapped_symbols", return_value=_fake_mapper_entries(5)
        ), patch.object(su, "_futures_instruments", return_value=[]), patch.object(
            su, "_option_instruments", new=AsyncMock(return_value=[])
        ):
            out = await build_universe(include_options=False, override=[])

        assert len(out) == 7, "2 indices + 5 equities"


class TestUniverseResilience:
    @pytest.mark.asyncio
    async def test_one_category_failing_does_not_block_the_others(self):
        """A broken futures registry must not lose the equities."""
        with patch.object(
            su, "_mapped_symbols", return_value=_fake_mapper_entries(3)
        ), patch.object(
            su, "_futures_instruments", side_effect=RuntimeError("registry down")
        ), patch.object(
            su, "_option_instruments", new=AsyncMock(side_effect=RuntimeError("boom"))
        ):
            out = await build_universe()

        assert len(out) == 5, "2 indices + 3 equities survive"

    @pytest.mark.asyncio
    async def test_universe_is_deduplicated(self):
        dupe = UniverseInstrument(
            token="1", trading_symbol="DUP", exchange="NSE", instrument_type="EQUITY"
        )
        with patch.object(su, "_index_instruments", return_value=[dupe]), patch.object(
            su, "_equity_instruments", return_value=[dupe]
        ), patch.object(su, "_futures_instruments", return_value=[]), patch.object(
            su, "_option_instruments", new=AsyncMock(return_value=[])
        ):
            out = await build_universe()

        assert len(out) == 1
