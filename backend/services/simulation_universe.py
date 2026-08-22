"""
Scoped instrument universe for historical download + replay.

Deliberately small for this pass — prove the pipeline end-to-end before
widening. Covers:
    - NIFTY index (spot)
    - RELIANCE, TCS equities
    - NIFTY futures: current + next expiry
    - NIFTY options: ATM +/- 10 strikes, current + next expiry

Instrument discovery reuses existing systems:
    - equities/index  -> providers.symbol_mapper.canonical_to_zebu
    - futures         -> services.futures_contract_registry
    - options         -> routes.options._load_zebu_option_contracts
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date
from typing import Optional

logger = logging.getLogger(__name__)

# ── Scope for this pass ────────────────────────────────────────────
SCOPED_EQUITIES = ["RELIANCE", "TCS"]
SCOPED_INDICES = ["NIFTY"]
SCOPED_OPTION_UNDERLYINGS = ["NIFTY"]
SCOPED_FUTURES_UNDERLYINGS = ["NIFTY"]

# ATM +/- N strikes per expiry
OPTION_STRIKE_WIDTH = 10
# Current + next expiry
EXPIRY_DEPTH = 2

# Canonical symbol used across the quote pipeline for the NIFTY index.
INDEX_CANONICAL = {"NIFTY": "^NSEI"}


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


def _equity_instruments() -> list[UniverseInstrument]:
    """Resolve scoped equities via the existing Zebu symbol mapper."""
    from providers.symbol_mapper import canonical_to_zebu

    out: list[UniverseInstrument] = []
    for symbol in SCOPED_EQUITIES:
        mapped = canonical_to_zebu(symbol)
        if not mapped:
            logger.warning(f"Universe: no Zebu mapping for equity {symbol}; skipping")
            continue
        out.append(
            UniverseInstrument(
                token=str(mapped.get("token") or "").strip(),
                trading_symbol=str(mapped.get("trading_symbol") or symbol).upper(),
                exchange=str(mapped.get("exchange") or "NSE").upper(),
                instrument_type="EQUITY",
                underlying=symbol.upper(),
                canonical_symbol=symbol.upper(),
            )
        )
    return out


def _index_instruments() -> list[UniverseInstrument]:
    """Resolve scoped indices via the existing Zebu symbol mapper."""
    from providers.symbol_mapper import canonical_to_zebu

    out: list[UniverseInstrument] = []
    for name in SCOPED_INDICES:
        canonical = INDEX_CANONICAL.get(name, name)
        mapped = canonical_to_zebu(canonical) or canonical_to_zebu(name)
        if not mapped:
            logger.warning(f"Universe: no Zebu mapping for index {name}; skipping")
            continue
        out.append(
            UniverseInstrument(
                token=str(mapped.get("token") or "").strip(),
                trading_symbol=str(mapped.get("trading_symbol") or name).upper(),
                exchange=str(mapped.get("exchange") or "NSE").upper(),
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


def _futures_instruments() -> list[UniverseInstrument]:
    """Current + next expiry NIFTY futures from the existing registry."""
    from services.futures_contract_registry import futures_contract_registry

    out: list[UniverseInstrument] = []
    for underlying in SCOPED_FUTURES_UNDERLYINGS:
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


async def _option_instruments(spot_by_underlying: Optional[dict] = None) -> list[UniverseInstrument]:
    """
    ATM +/- OPTION_STRIKE_WIDTH strikes for current + next expiry.

    Reuses routes.options._load_zebu_option_contracts (contract master parsing)
    — identity data, shared between LIVE and SIMULATION modes.
    """
    from routes.options import _load_zebu_option_contracts

    spot_by_underlying = spot_by_underlying or {}
    out: list[UniverseInstrument] = []

    for underlying in SCOPED_OPTION_UNDERLYINGS:
        try:
            by_expiry = await _load_zebu_option_contracts(underlying)
        except Exception as exc:
            logger.warning(f"Universe: option contract master failed for {underlying}: {exc}")
            continue

        if not by_expiry:
            logger.warning(f"Universe: no option contracts for {underlying}")
            continue

        today = date.today()
        expiries = []
        for exp_str in sorted(by_expiry.keys()):
            parsed = _parse_expiry(exp_str)
            if parsed and parsed >= today:
                expiries.append((exp_str, parsed))
        if not expiries:
            expiries = [(e, _parse_expiry(e)) for e in sorted(by_expiry.keys())]
        expiries = expiries[:EXPIRY_DEPTH]

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
) -> list[UniverseInstrument]:
    """
    Resolve the full scoped instrument universe.

    Each category is resolved independently — a failure in one category
    (e.g. option contract master download) never blocks the others.
    """
    instruments: list[UniverseInstrument] = []

    for label, resolver in (("index", _index_instruments), ("equity", _equity_instruments), ("futures", _futures_instruments)):
        try:
            instruments.extend(resolver())
        except Exception as exc:
            logger.warning(f"Universe: {label} resolution failed: {exc}", exc_info=True)

    if include_options:
        try:
            instruments.extend(await _option_instruments(spot_by_underlying))
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

    logger.info(
        "Universe resolved: %d instruments (%s)",
        len(unique),
        ", ".join(
            f"{t}={sum(1 for i in unique if i.instrument_type == t)}"
            for t in ("INDEX", "EQUITY", "FUTURES", "OPTIONS")
        ),
    )
    return unique
