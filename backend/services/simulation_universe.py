"""
Instrument universe for historical download + replay.

The universe TRACKS THE APP'S REAL SUPPORTED SYMBOL SET rather than
maintaining its own list. Sources, all of them existing production
registries populated from the Zebu contract master at startup:

    equities/indices -> providers.symbol_mapper (_ZEBU_SYMBOL_MAP via
                        get_all_zebu_tokens) — the same map the live quote
                        pipeline resolves tokens through
    futures          -> services.futures_contract_registry
                        (underlying_to_contracts)
    options          -> routes.options._load_zebu_option_contracts

Because those registries grow to the full contract master in production,
resolution is CAPPED. Downloading per-minute candles for the entire NSE
would be a very expensive accident, so:

    MAX_UNIVERSE_SIZE      hard ceiling on total instruments
    MAX_EQUITY_INSTRUMENTS ceiling on equities specifically
    UNIVERSE_OVERRIDE      explicit allow-list; when set, ONLY these
                           symbols resolve (escape hatch for a small run)

Caps are applied deterministically (sorted) so repeated runs pick the same
instruments rather than drifting with dict ordering.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date
from typing import Optional

logger = logging.getLogger(__name__)

# ── Caps ───────────────────────────────────────────────────────────
# Safety ceilings so a full contract master can never trigger a runaway
# download. Tunable by callers via build_universe(...) arguments.
MAX_UNIVERSE_SIZE = 250
MAX_EQUITY_INSTRUMENTS = 100
MAX_FUTURES_UNDERLYINGS = 10
MAX_OPTION_UNDERLYINGS = 3

# Explicit allow-list. Empty = "use the app's full supported set (capped)".
# Set to e.g. ["RELIANCE", "TCS"] to pin a small, predictable run.
UNIVERSE_OVERRIDE: list[str] = []

# Underlyings whose option chains are worth replaying. Index options carry
# the volume; equity option chains would multiply the universe enormously.
PREFERRED_OPTION_UNDERLYINGS = ["NIFTY", "BANKNIFTY", "FINNIFTY"]

# ATM +/- N strikes per expiry
OPTION_STRIKE_WIDTH = 10
# Current + next expiry
EXPIRY_DEPTH = 2

# Canonical symbols for the index spots, as used across the quote pipeline.
INDEX_CANONICAL = {
    "NIFTY": "^NSEI",
    "BANKNIFTY": "^NSEBANK",
    "FINNIFTY": "^CNXFIN",
    "SENSEX": "^BSESN",
}


@dataclass
class UniverseInstrument:
    """One instrument to download/replay, resolved to Zebu identity."""

    token: str
    trading_symbol: str
    exchange: str
    instrument_type: str  # EQUITY / INDEX / FUTURES / OPTIONS
    underlying: Optional[str] = None
    expiry_date: Optional[date] = None
    strike_price: Optional[float] = None
    option_type: Optional[str] = None  # CE / PE
    lot_size: int = 1
    tick_size: float = 0.05
    price_precision: int = 2
    freeze_quantity: Optional[int] = None
    # Canonical pipeline symbol for equities/indices (e.g. "^NSEI", "RELIANCE").
    canonical_symbol: Optional[str] = None

    @property
    def key(self) -> str:
        """Stable identity key: EXCHANGE:TRADING_SYMBOL."""
        return f"{self.exchange}:{self.trading_symbol}".upper()


def _is_index_canonical(canonical: str) -> bool:
    """Index canonicals are the '^'-prefixed ones (e.g. ^NSEI)."""
    return str(canonical or "").startswith("^")


def _mapped_symbols() -> list[dict]:
    """
    Every symbol the app currently supports, from the live symbol mapper.

    This is the same map the production quote pipeline resolves tokens
    through, so the historical universe automatically tracks whatever the
    app supports — no separate list to drift out of sync.
    """
    try:
        from providers.symbol_mapper import get_all_zebu_tokens

        return get_all_zebu_tokens() or []
    except Exception as exc:
        logger.warning(f"Universe: symbol mapper unavailable: {exc}")
        return []


def _equity_instruments(
    max_equities: int = MAX_EQUITY_INSTRUMENTS,
    override: Optional[list[str]] = None,
) -> list[UniverseInstrument]:
    """
    Equities from the app's real supported set, capped.

    Sorted before capping so the selection is deterministic across runs.
    """
    override_set = {s.upper() for s in (override or [])}
    out: list[UniverseInstrument] = []

    for entry in sorted(_mapped_symbols(), key=lambda e: str(e.get("canonical") or "")):
        canonical = str(entry.get("canonical") or "").strip()
        if not canonical or _is_index_canonical(canonical):
            continue

        token = str(entry.get("token") or "").strip()
        tsym = str(entry.get("trading_symbol") or "").upper().strip()
        if not token or not tsym:
            continue

        # Base symbol without the exchange suffix (RELIANCE.NS -> RELIANCE).
        base = canonical.split(".")[0].upper()
        if override_set and base not in override_set and canonical.upper() not in override_set:
            continue

        out.append(
            UniverseInstrument(
                token=token,
                trading_symbol=tsym,
                exchange=str(entry.get("exchange") or "NSE").upper(),
                instrument_type="EQUITY",
                underlying=base,
                canonical_symbol=canonical,
            )
        )

    if len(out) > max_equities:
        logger.info(
            "Universe: capping equities from %d to %d (MAX_EQUITY_INSTRUMENTS)",
            len(out),
            max_equities,
        )
        out = out[:max_equities]
    return out


def _index_instruments(
    override: Optional[list[str]] = None,
) -> list[UniverseInstrument]:
    """Indices from the app's real supported set. Never capped — small set."""
    override_set = {s.upper() for s in (override or [])}
    out: list[UniverseInstrument] = []

    for entry in sorted(_mapped_symbols(), key=lambda e: str(e.get("canonical") or "")):
        canonical = str(entry.get("canonical") or "").strip()
        if not canonical or not _is_index_canonical(canonical):
            continue

        token = str(entry.get("token") or "").strip()
        tsym = str(entry.get("trading_symbol") or "").upper().strip()
        if not token or not tsym:
            continue

        # Friendly name for the index (^NSEI -> NIFTY), when we know one.
        name = next(
            (k for k, v in INDEX_CANONICAL.items() if v == canonical),
            canonical.lstrip("^"),
        )
        if override_set and name.upper() not in override_set and canonical.upper() not in override_set:
            continue

        out.append(
            UniverseInstrument(
                token=token,
                trading_symbol=tsym,
                exchange=str(entry.get("exchange") or "NSE").upper(),
                instrument_type="INDEX",
                underlying=name.upper(),
                canonical_symbol=canonical,
            )
        )
    return out


def _parse_expiry(value) -> Optional[date]:
    if isinstance(value, date):
        return value
    if not value:
        return None
    from datetime import datetime

    for fmt in ("%Y-%m-%d", "%d-%b-%Y", "%d-%m-%Y", "%d%b%Y"):
        try:
            return datetime.strptime(str(value).strip(), fmt).date()
        except (ValueError, TypeError):
            continue
    return None


def _futures_underlyings(
    max_underlyings: int = MAX_FUTURES_UNDERLYINGS,
    override: Optional[list[str]] = None,
) -> list[str]:
    """
    Underlyings that actually have futures contracts, from the real
    registry. Index underlyings are preferred (they carry the volume),
    then the rest alphabetically, then capped.
    """
    try:
        from services.futures_contract_registry import futures_contract_registry

        available = sorted(
            str(u).upper()
            for u in (futures_contract_registry.underlying_to_contracts or {}).keys()
        )
    except Exception as exc:
        logger.warning(f"Universe: futures registry unavailable: {exc}")
        return []

    override_set = {s.upper() for s in (override or [])}
    if override_set:
        available = [u for u in available if u in override_set]

    preferred = [u for u in PREFERRED_OPTION_UNDERLYINGS if u in available]
    rest = [u for u in available if u not in preferred]
    return (preferred + rest)[:max_underlyings]


def _futures_instruments(
    max_underlyings: int = MAX_FUTURES_UNDERLYINGS,
    override: Optional[list[str]] = None,
) -> list[UniverseInstrument]:
    """Current + next expiry futures for each supported underlying."""
    from services.futures_contract_registry import futures_contract_registry

    out: list[UniverseInstrument] = []
    for underlying in _futures_underlyings(max_underlyings, override):
        try:
            contracts = futures_contract_registry.get_contracts_for_underlying(underlying)
        except Exception as exc:
            logger.warning(f"Universe: futures registry lookup failed for {underlying}: {exc}")
            continue

        for contract in contracts[:EXPIRY_DEPTH]:
            token = str(contract.get("token") or "").strip()
            tsym = str(
                contract.get("trading_symbol")
                or contract.get("contract_symbol")
                or ""
            ).upper()
            if not token or not tsym:
                continue
            out.append(
                UniverseInstrument(
                    token=token,
                    trading_symbol=tsym,
                    exchange=str(contract.get("exchange") or "NFO").upper(),
                    instrument_type="FUTURES",
                    underlying=underlying.upper(),
                    expiry_date=_parse_expiry(contract.get("expiry_date") or contract.get("expiry")),
                    lot_size=int(contract.get("lot_size") or 1),
                    canonical_symbol=tsym,
                )
            )
    return out


def _option_underlyings(
    max_underlyings: int = MAX_OPTION_UNDERLYINGS,
    override: Optional[list[str]] = None,
) -> list[str]:
    """
    Underlyings to build option chains for.

    Restricted to the index underlyings by default: an option chain is
    ~40 legs per expiry, so opening this up to every equity would blow
    past any sane universe size.
    """
    override_set = {s.upper() for s in (override or [])}
    candidates = list(PREFERRED_OPTION_UNDERLYINGS)
    if override_set:
        candidates = [u for u in candidates if u in override_set]
    return candidates[:max_underlyings]


async def _option_instruments(
    spot_by_underlying: Optional[dict] = None,
    max_underlyings: int = MAX_OPTION_UNDERLYINGS,
    override: Optional[list[str]] = None,
) -> list[UniverseInstrument]:
    """
    ATM +/- OPTION_STRIKE_WIDTH strikes for current + next expiry.

    Reuses routes.options._load_zebu_option_contracts (contract master parsing)
    — identity data, shared between LIVE and SIMULATION modes.
    """
    from routes.options import _load_zebu_option_contracts

    spot_by_underlying = spot_by_underlying or {}
    out: list[UniverseInstrument] = []

    for underlying in _option_underlyings(max_underlyings, override):
        try:
            by_expiry = await _load_zebu_option_contracts(underlying)
        except Exception as exc:
            logger.warning(f"Universe: option contract master failed for {underlying}: {exc}")
            continue

        if not by_expiry:
            logger.warning(f"Universe: no option contracts for {underlying}")
            continue

        # Parse first, THEN sort by the parsed date — sorting the raw
        # strings alphabetically (as before) does not sort chronologically
        # (e.g. "2026-09-29" vs "2027-03-30" vs "2029-06-26" are already
        # fine as ISO strings, but far-dated placeholder/LEAPS-style
        # expiries some underlyings carry can still land ahead of the real
        # near-term expiry once EXPIRY_DEPTH truncates the list). Sorting
        # by the parsed date is the only way to guarantee "current + next"
        # actually means the two nearest real expiries.
        today = date.today()
        all_expiries = [(e, _parse_expiry(e)) for e in by_expiry.keys()]
        all_expiries = [(e, d) for e, d in all_expiries if d is not None]

        expiries = sorted(
            (item for item in all_expiries if item[1] >= today),
            key=lambda item: item[1],
        )
        if not expiries:
            # Nothing on-or-after today (a stale contract master). Fall
            # back to the expiries CLOSEST to today (i.e. the most recent
            # past ones), not the oldest — a wrong "nearest" pick here is
            # exactly the class of bug this function used to have.
            expiries = sorted(
                all_expiries, key=lambda item: abs((item[1] - today).days)
            )
        expiries = sorted(expiries[:EXPIRY_DEPTH], key=lambda item: item[1])

        spot = float(spot_by_underlying.get(underlying.upper()) or 0.0)

        for exp_str, exp_date in expiries:
            strike_map = by_expiry.get(exp_str) or {}
            strikes = sorted(float(s) for s in strike_map.keys())
            if not strikes:
                continue

            if spot > 0:
                atm_idx = min(range(len(strikes)), key=lambda i: abs(strikes[i] - spot))
            else:
                atm_idx = len(strikes) // 2

            lo = max(0, atm_idx - OPTION_STRIKE_WIDTH)
            hi = min(len(strikes), atm_idx + OPTION_STRIKE_WIDTH + 1)

            for strike in strikes[lo:hi]:
                legs = strike_map.get(strike) or strike_map.get(str(strike)) or {}
                for opt_type in ("CE", "PE"):
                    leg = legs.get(opt_type)
                    if not leg:
                        continue
                    token = str(leg.get("token") or "").strip()
                    tsym = str(leg.get("symbol") or "").upper().strip()
                    if not token or not tsym:
                        continue
                    out.append(
                        UniverseInstrument(
                            token=token,
                            trading_symbol=tsym,
                            exchange=str(leg.get("exchange") or "NFO").upper(),
                            instrument_type="OPTIONS",
                            underlying=underlying.upper(),
                            expiry_date=exp_date,
                            strike_price=float(strike),
                            option_type=opt_type,
                            canonical_symbol=tsym,
                        )
                    )
    return out


async def build_universe(
    spot_by_underlying: Optional[dict] = None,
    include_options: bool = True,
    max_universe_size: int = MAX_UNIVERSE_SIZE,
    max_equities: int = MAX_EQUITY_INSTRUMENTS,
    override: Optional[list[str]] = None,
) -> list[UniverseInstrument]:
    """
    Resolve the instrument universe from the app's real supported set.

    Each category is resolved independently — a failure in one category
    (e.g. option contract master download) never blocks the others.

    `override` (defaulting to the module-level UNIVERSE_OVERRIDE) pins the
    run to an explicit symbol list. Caps always apply: indices and options
    are prioritized over the long tail of equities, because losing an index
    would break the chain views while losing the 90th equity would not.
    """
    override = override if override is not None else UNIVERSE_OVERRIDE
    instruments: list[UniverseInstrument] = []

    resolvers = (
        ("index", lambda: _index_instruments(override)),
        ("equity", lambda: _equity_instruments(max_equities, override)),
        ("futures", lambda: _futures_instruments(MAX_FUTURES_UNDERLYINGS, override)),
    )
    for label, resolver in resolvers:
        try:
            instruments.extend(resolver())
        except Exception as exc:
            logger.warning(f"Universe: {label} resolution failed: {exc}", exc_info=True)

    if include_options:
        try:
            instruments.extend(
                await _option_instruments(
                    spot_by_underlying, MAX_OPTION_UNDERLYINGS, override
                )
            )
        except Exception as exc:
            logger.warning(f"Universe: option resolution failed: {exc}", exc_info=True)

    # De-duplicate on exchange:trading_symbol
    seen: set[str] = set()
    unique: list[UniverseInstrument] = []
    for inst in instruments:
        if inst.key in seen:
            continue
        seen.add(inst.key)
        unique.append(inst)

    # Hard ceiling. Trim the least critical category (equities) first so a
    # cap can never silently drop an index or an option chain leg.
    if len(unique) > max_universe_size:
        priority = {"INDEX": 0, "FUTURES": 1, "OPTIONS": 2, "EQUITY": 3}
        overflow = len(unique) - max_universe_size
        logger.warning(
            "Universe: %d instruments exceeds MAX_UNIVERSE_SIZE=%d; "
            "dropping %d lowest-priority (equity-first) instruments",
            len(unique),
            max_universe_size,
            overflow,
        )
        unique = sorted(
            unique, key=lambda i: (priority.get(i.instrument_type, 9), i.key)
        )[:max_universe_size]

    logger.info(
        "Universe resolved: %d instruments (%s)",
        len(unique),
        ", ".join(
            f"{t}={sum(1 for i in unique if i.instrument_type == t)}"
            for t in ("INDEX", "EQUITY", "FUTURES", "OPTIONS")
        ),
    )
    return unique
