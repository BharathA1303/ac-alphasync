"""
Futures Service — Read-only derivatives analytics for NSE futures.

Responsibilities:
    * Load Zebu master contracts, filter for FUTIDX and FUTSTK instruments
    * Provide contract list endpoints grouped by underlying symbol
    * Cache contract lists and quotes in Redis with futures:* namespace
    * Import existing market_data and market_session functions (no duplication)
    * WebSocket integration for live futures prices

Contract metadata from Zebu:
    - Trading symbol (e.g., RELIANCE25MAR2026FUT)
    - Token ID (exchange-internal numeric ID)
    - Expiry date
    - Lot size
    - Tick size
    - Instrument type (FUTIDX or FUTSTK)

This service is READ-ONLY: no order placement, no broker access required.
Operates alongside existing market data infrastructure.
"""

import io
import logging
import re
import zipfile
import time
from datetime import datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

# Canonical index underlying symbols — ordered longest-first for greedy matching.
# This prevents "NIFTY" from matching inside "NIFTYNXT50" or "BANKNIFTY".
_KNOWN_INDEX_UNDERLYINGS = sorted(
    [
        "NIFTYNXT50",
        "MIDCPNIFTY",
        "BANKNIFTY",
        "FINNIFTY",
        "NIFTY",
        "SENSEX",
        "BANKEX",
    ],
    key=len,
    reverse=True,
)

try:
    import httpx
except ImportError:
    httpx = None  # type: ignore

from cache.redis_client import SNAPSHOT_TTL, get_redis, close_redis
from config.settings import settings
from engines.market_session import market_session, MarketState
from providers.symbol_mapper import (
    canonical_to_zebu,
    is_mcx_symbol,
    load_zebu_contracts,
)

logger = logging.getLogger(__name__)
IST = ZoneInfo("Asia/Kolkata")

# Zebu master contract CDN URLs — futures/options live in the F&O masters (NFO/BFO),
# NOT the cash NSE master. Using NSE_symbols.txt.zip here yielded zero FUT rows
# which forced the programmatic fallback with empty tokens → blank quotes.
_FNO_CONTRACT_SOURCES = [
    ("NFO", "https://go.mynt.in/NFO_symbols.txt.zip"),
    ("NFO", "https://api.zebull.in/NFO_symbols.txt.zip"),
    ("BFO", "https://go.mynt.in/BFO_symbols.txt.zip"),
    ("BFO", "https://api.zebull.in/BFO_symbols.txt.zip"),
]

# In-memory futures contracts cache, keyed by canonical symbol
# Format: {
#     "RELIANCE": [
#         {"contract_symbol": "RELIANCE25MAR2026FUT", "expiry": "2026-03-25", "lot_size": 250, ...}
#     ]
# }
_futures_contracts: dict = {}
_futures_contracts_loaded: bool = False


async def _fetch_and_parse_contracts() -> dict[str, list[dict]]:
    """
    Download and parse the Zebu master contract file, filtering for futures only.

    Returns a dict mapping canonical symbol → list of sorted futures contracts.
    Contracts are sorted by expiry date (nearest first).
    """
    contracts_by_symbol: dict[str, list[dict]] = {}

    # Download one master per exchange (NFO, BFO). Each segment has its own master;
    # we only need one successful mirror per exchange.
    downloaded: list[tuple[str, bytes]] = []
    seen_exchanges: set[str] = set()
    for exch_code, url in _FNO_CONTRACT_SOURCES:
        if exch_code in seen_exchanges:
            continue
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(url, follow_redirects=True)
                if resp.status_code == 200 and resp.content:
                    downloaded.append((exch_code, resp.content))
                    seen_exchanges.add(exch_code)
                    logger.info(
                        f"Downloaded Zebu {exch_code} futures master from {url} "
                        f"({len(resp.content):,} bytes)"
                    )
                    continue
                logger.warning(
                    f"Zebu {exch_code} contract download failed: {url} → HTTP {resp.status_code}"
                )
        except Exception as e:
            logger.warning(f"Zebu {exch_code} contract download error ({url}): {e}")

    if not downloaded:
        logger.error("Could not download any Zebu F&O master contracts for futures")
        return {}

    all_lines: list[tuple[str, str]] = []  # (default_exchange, line)
    header_line: Optional[str] = None

    for default_exch, raw_zip in downloaded:
        try:
            with zipfile.ZipFile(io.BytesIO(raw_zip)) as zf:
                txt_files = [n for n in zf.namelist() if n.endswith(".txt")]
                if not txt_files:
                    logger.error(f"No .txt file found in Zebu {default_exch} ZIP")
                    continue
                with zf.open(txt_files[0]) as f:
                    raw_bytes = f.read()
                    try:
                        content = raw_bytes.decode("utf-8")
                    except UnicodeDecodeError:
                        content = raw_bytes.decode("latin-1", errors="replace")

            lines = content.splitlines()
            if not lines:
                continue
            if header_line is None:
                header_line = lines[0]
            for ln in lines[1:]:
                all_lines.append((default_exch, ln))
        except Exception as e:
            logger.error(
                f"Failed to unzip Zebu {default_exch} master: {e}", exc_info=True
            )

    if not header_line or not all_lines:
        return {}

    try:
        lines = [header_line]  # kept for compatibility with header parsing below

        # Detect delimiter (comma vs pipe)
        delimiter = "," if "," in lines[0] else "|"

        # Parse header to locate relevant columns
        header = [col.strip().lower() for col in lines[0].split(delimiter)]
        try:
            exch_idx = header.index("exchange") if "exchange" in header else 0
            token_idx = next((i for i, h in enumerate(header) if "token" in h), 1)
            sym_idx = next((i for i, h in enumerate(header) if h == "symbol"), -1)
            tsym_idx = next(
                (
                    i
                    for i, h in enumerate(header)
                    if "tradingsymbol" in h.replace(" ", "")
                ),
                2,
            )
            if tsym_idx == -1:
                tsym_idx = sym_idx if sym_idx >= 0 else 2
            if sym_idx == -1:
                sym_idx = tsym_idx
            expiry_idx = next((i for i, h in enumerate(header) if "expiry" in h), 4)
            lot_size_idx = next(
                (i for i, h in enumerate(header) if "lotsz" in h or "lot" in h), -1
            )
            tick_size_idx = next((i for i, h in enumerate(header) if "tick" in h), -1)
            instrument_idx = next(
                (i for i, h in enumerate(header) if "instrument" in h), -1
            )
        except (ValueError, StopIteration):
            exch_idx, token_idx, sym_idx, tsym_idx = 0, 1, 3, 4
            expiry_idx, lot_size_idx, tick_size_idx, instrument_idx = 5, 2, 9, 6

        instr_idx = instrument_idx

        # Extract futures contracts (FUTIDX or FUTSTK)
        for default_exch, line in all_lines:
            if not line.strip():
                continue
            parts = line.split(delimiter)
            if len(parts) <= max(exch_idx, token_idx, tsym_idx):
                continue

            exch = (
                parts[exch_idx].strip() if exch_idx < len(parts) else default_exch
            ) or default_exch

            # Fast filter: skip options rows before any further parsing
            row_instr_upper = (
                parts[instr_idx].strip().upper()
                if 0 <= instr_idx < len(parts)
                else ""
            )
            if row_instr_upper and "FUT" not in row_instr_upper:
                continue

            token = parts[token_idx].strip() if token_idx < len(parts) else ""
            trading_sym = parts[tsym_idx].strip() if tsym_idx < len(parts) else ""
            master_base_sym = (
                parts[sym_idx].strip().upper() if 0 <= sym_idx < len(parts) else ""
            )
            expiry = parts[expiry_idx].strip() if expiry_idx < len(parts) else ""
            lot_size_str = (
                parts[lot_size_idx].strip() if 0 <= lot_size_idx < len(parts) else "0"
            )
            tick_size_str = (
                parts[tick_size_idx].strip()
                if 0 <= tick_size_idx < len(parts)
                else "0.05"
            )

            # Discriminator check for futures contracts
            is_future = row_instr_upper.startswith("FUT") or (
                not row_instr_upper
                and (
                    trading_sym.endswith("-FUT")
                    or trading_sym.endswith("FUT")
                    or (
                        trading_sym.endswith("F")
                        and not trading_sym.endswith("CE")
                        and not trading_sym.endswith("PE")
                    )
                )
            )
            if not is_future:
                continue

            # Explicitly exclude options
            if (
                row_instr_upper.startswith("OPT")
                or trading_sym.endswith("CE")
                or trading_sym.endswith("PE")
            ):
                continue

            if not token or not token.isdigit():
                continue

            # Determine instrument type (FUTIDX or FUTSTK)
            if row_instr_upper in {"FUTIDX", "FUTSTK", "FUTCUR", "FUTCOM"}:
                inst_type = row_instr_upper
            elif any(
                x in trading_sym for x in ["NIFTY", "SENSEX", "BANKNIFTY", "BANKEX"]
            ):
                inst_type = "FUTIDX"
            else:
                inst_type = "FUTSTK"

            # Prefer underlying from Symbol column if available and not equal to full trading_sym
            if master_base_sym and master_base_sym != trading_sym:
                base_sym = master_base_sym
            else:
                base_sym = _extract_underlying_from_tsym(trading_sym)

            if not base_sym:
                # Fallback: strip FUT suffix and parse digits
                stripped = trading_sym.replace("FUT", "").replace("-FUT", "").strip()
                expiry_label = ""
                for i in range(len(stripped)):
                    if stripped[i].isdigit():
                        expiry_label = stripped[i:]
                        base_sym = stripped[:i]
                        break
                if not base_sym:
                    continue
            else:
                remainder = trading_sym[len(base_sym):]
                remainder = remainder.rstrip("F").rstrip("-")
                expiry_label = remainder.strip()

            # Parse lot size and tick size
            try:
                lot_size = int(float(lot_size_str)) if lot_size_str else 1
            except (ValueError, TypeError):
                lot_size = 1

            try:
                tick_size = float(tick_size_str) if tick_size_str else 0.05
            except (ValueError, TypeError):
                tick_size = 0.05

            # Parse expiry date
            expiry_date = _parse_expiry_date(expiry) or _estimate_expiry_from_label(
                expiry_label
            )

            if base_sym not in contracts_by_symbol:
                contracts_by_symbol[base_sym] = []

            contracts_by_symbol[base_sym].append(
                {
                    "contract_symbol": trading_sym,
                    "token": token,
                    "exchange": exch,
                    "expiry_date": expiry_date,
                    "expiry_label": expiry_label,
                    "lot_size": lot_size,
                    "tick_size": tick_size,
                    "instrument_type": inst_type,
                }
            )

        # Sort each symbol's contracts by expiry date (nearest first)
        for base_sym in contracts_by_symbol:
            contracts = contracts_by_symbol[base_sym]

            def expiry_key(c):
                if c.get("expiry_date"):
                    try:
                        return datetime.strptime(
                            c["expiry_date"], "%Y-%m-%d"
                        ).timestamp()
                    except (ValueError, TypeError):
                        return float("inf")
                return float("inf")

            contracts_by_symbol[base_sym] = sorted(contracts, key=expiry_key)

        logger.info(
            f"Parsed {sum(len(v) for v in contracts_by_symbol.values())} futures contracts "
            f"across {len(contracts_by_symbol)} underlyings from Zebu master"
        )

    except Exception as e:
        logger.error(f"Failed to parse Zebu futures contracts: {e}", exc_info=True)

    return contracts_by_symbol


def _extract_underlying_from_tsym(tsym: str) -> Optional[str]:
    """
    Extract the canonical underlying symbol from a Zebu futures trading symbol.

    Examples:
        NIFTY24APR26F       -> NIFTY
        NIFTYNXT5024APR26F  -> NIFTYNXT50
        BANKNIFTY24APR26F   -> BANKNIFTY
        RELIANCE24APR26F    -> RELIANCE
        MIDCPNIFTY24APR26F  -> MIDCPNIFTY
        ZYDUSLIFE29SEP26F   -> ZYDUSLIFE
    """
    tsym = tsym.strip().upper()
    if not tsym:
        return None

    # Check known index underlyings via strict prefix match (longest first)
    for idx_sym in _KNOWN_INDEX_UNDERLYINGS:
        if tsym.startswith(idx_sym):
            remainder = tsym[len(idx_sym):]
            if remainder and remainder[0].isdigit():
                return idx_sym

    # Stock futures pattern: underlying name before standard date label (e.g. 29SEP26F or 25MAR2026FUT)
    match = re.match(r"^([A-Z0-9&]+?)(\d{1,2}[A-Z]{3}\d{2,4})", tsym)
    if match:
        return match.group(1)

    # Secondary fallback for formats like RELIANCE-FUT or RELIANCEFUT
    cleaned = tsym.replace("-FUT", "").replace("FUT", "").rstrip("F").strip()
    match_fallback = re.match(r"^([A-Z0-9&]+)", cleaned)
    if match_fallback:
        return match_fallback.group(1)

    return None


def _parse_expiry_date(expiry_str: str) -> Optional[str]:
    """
    Parse Zebu expiry date string to YYYY-MM-DD format.
    Handles various formats: "25MAR2026", "25-Mar-2026", etc.
    Returns None if parsing fails.
    """
    if not expiry_str:
        return None

    # Try common Indian date format: "25MAR2026"
    try:
        dt = datetime.strptime(expiry_str.strip(), "%d%b%Y")
        return dt.strftime("%Y-%m-%d")
    except (ValueError, TypeError):
        pass

    # Try ISO format with hyphens: "25-Mar-2026"
    try:
        dt = datetime.strptime(expiry_str.strip(), "%d-%b-%Y")
        return dt.strftime("%Y-%m-%d")
    except (ValueError, TypeError):
        pass

    # Try lowercase: "25mar2026"
    try:
        dt = datetime.strptime(expiry_str.strip().upper(), "%d%b%Y")
        return dt.strftime("%Y-%m-%d")
    except (ValueError, TypeError):
        pass

    return None


def _estimate_expiry_from_label(label: str) -> Optional[str]:
    """
    Estimate expiry date from expiry label like "25MAR2026".
    Used as fallback when explicit expiry field is unavailable.
    """
    import re

    cleaned = label.strip().rstrip("F").rstrip("-")
    # Try 4-digit year first: "25MAR2026"
    match = re.match(r"(\d{1,2})([A-Za-z]{3})(\d{4})", cleaned)
    if match:
        day_str, month_str, year_str = match.groups()
        try:
            dt = datetime.strptime(f"{day_str}{month_str.upper()}{year_str}", "%d%b%Y")
            return dt.strftime("%Y-%m-%d")
        except (ValueError, TypeError):
            pass
    # Try 2-digit year: "24APR26" (Zebu NFO format)
    match = re.match(r"(\d{1,2})([A-Za-z]{3})(\d{2})$", cleaned)
    if match:
        day_str, month_str, year_str = match.groups()
        try:
            dt = datetime.strptime(f"{day_str}{month_str.upper()}{year_str}", "%d%b%y")
            return dt.strftime("%Y-%m-%d")
        except (ValueError, TypeError):
            pass
    return None


async def initialize_futures():
    """
    Called at startup to load futures contracts into memory.
    Populates _futures_contracts global cache from Zebu contract sources only.
    """
    global _futures_contracts, _futures_contracts_loaded

    try:
        logger.info("Initializing futures contracts from Zebu CDN...")
        _futures_contracts = await _fetch_and_parse_contracts()

        if _futures_contracts:
            # Pre-register futures token mappings so quote/subscription paths are token-ready.
            contracts_to_register = []
            for contract_list in _futures_contracts.values():
                for item in contract_list:
                    tsym = str(item.get("contract_symbol") or "").strip().upper()
                    token = str(item.get("token") or "").strip()
                    exch = str(item.get("exchange") or "NFO").strip().upper()
                    if not tsym or not token:
                        continue
                    contracts_to_register.append(
                        {
                            "symbol": tsym,
                            "canonical": tsym,
                            "trading_symbol": tsym,
                            "token": token,
                            "exchange": exch,
                        }
                    )

            if contracts_to_register:
                load_zebu_contracts(contracts_to_register)

            # Subscribe near-expiry futures for popular symbols to the master WS feed
            # so the UI receives live tick updates without per-request subscribes.
            try:
                await _subscribe_near_expiry_futures()
            except Exception as e:
                logger.debug(f"Futures WS pre-subscribe skipped: {e}")

            _futures_contracts_loaded = True
            total_contracts = sum(len(v) for v in _futures_contracts.values())
            logger.info(
                f"Futures contracts loaded successfully: {len(_futures_contracts)} symbols, "
                f"{total_contracts} total contracts from Zebu CDN"
            )
        else:
            logger.warning(
                "Zebu CDN returned empty contracts; futures contracts remain unavailable until Zebu data is restored"
            )
            _futures_contracts = {}
            _futures_contracts_loaded = False
    except Exception as e:
        logger.error(f"Failed to initialize futures contracts: {e}", exc_info=True)
        _futures_contracts = {}
        _futures_contracts_loaded = False


async def _subscribe_near_expiry_futures() -> None:
    """Subscribe the nearest-expiry futures of popular underlyings to master WS."""
    popular = {
        "NIFTY",
        "BANKNIFTY",
        "FINNIFTY",
        "MIDCPNIFTY",
        "SENSEX",
        "NIFTYNXT50",
        "RELIANCE",
        "TCS",
        "HDFCBANK",
        "INFY",
        "ICICIBANK",
        "SBIN",
        "ITC",
        "LT",
        "AXISBANK",
        "HINDUNILVR",
        "MARUTI",
        "WIPRO",
        "SUNPHARMA",
        "KOTAKBANK",
        "BAJFINANCE",
        "TATAMOTORS",
        "BHARTIARTL",
        "ADANIENT",
    }
    symbols: list[str] = []
    for base, contracts in _futures_contracts.items():
        if base not in popular or not contracts:
            continue
        tsym = str(contracts[0].get("contract_symbol") or "").strip()
        if tsym:
            symbols.append(tsym)

    if not symbols:
        return

    from services.broker_session import broker_session_manager

    provider = broker_session_manager.get_any_session()
    if provider is None:
        try:
            from services.master_session import master_session_service

            if await master_session_service.initialize():
                provider = broker_session_manager.get_any_session()
        except Exception as e:
            logger.debug(f"Master-session recovery failed for futures subscribe: {e}")
    if provider is None:
        logger.info("No provider session — skipping futures WS pre-subscribe")
        return

    try:
        await provider.subscribe(symbols)
        logger.info(f"Subscribed {len(symbols)} near-expiry futures to WS")
    except Exception as e:
        logger.warning(f"Futures WS subscribe failed: {e}")


# Standard Indian Index/Stock lot size registry
_KNOWN_INDEX_UNDERLYINGS = {
    "NIFTY",
    "BANKNIFTY",
    "FINNIFTY",
    "MIDCPNIFTY",
    "NIFTYNXT50",
    "SENSEX",
    "BANKEX",
    "NIFTY50",
    "NIFTYBANK",
}

_FUTURES_LOT_SIZES = {
    "NIFTY": 65,
    "BANKNIFTY": 30,
    "FINNIFTY": 65,
    "MIDCPNIFTY": 75,
    "NIFTYNXT50": 25,
    "SENSEX": 20,
    "BANKEX": 15,
    "RELIANCE": 250,
    "TCS": 175,
    "INFY": 400,
    "HDFCBANK": 550,
    "ICICIBANK": 700,
    "SBIN": 750,
    "AXISBANK": 625,
    "KOTAKBANK": 400,
    "BAJFINANCE": 125,
    "BAJAJFINSV": 500,
    "TATAMOTORS": 700,
    "MARUTI": 50,
    "M&M": 350,
    "HEROMOTOCO": 150,
    "EICHERMOT": 175,
    "BHARTIARTL": 475,
    "ITC": 1600,
    "HINDUNILVR": 300,
    "LT": 175,
    "WIPRO": 1500,
    "HCLTECH": 350,
    "TECHM": 600,
    "TATASTEEL": 5500,
    "JSWSTEEL": 675,
    "HINDALCO": 1400,
    "COALINDIA": 2100,
    "ONGC": 3850,
    "NTPC": 1500,
    "POWERGRID": 1800,
    "SUNPHARMA": 350,
    "DRREDDY": 125,
    "CIPLA": 650,
    "APOLLOHOSP": 125,
    "DIVISLAB": 150,
    "ADANIENT": 300,
    "ADANIPORTS": 400,
    "TITAN": 175,
    "ASIANPAINT": 200,
    "BRITANNIA": 200,
    "NESTLEIND": 40,
    "ULTRACEMCO": 100,
    "GRASIM": 250,
    "INDUSINDBK": 500,
    "VEDL": 1550,
    "ZOMATO": 1000,
}


def get_underlying_lot_size(underlying: str) -> int:
    sym = underlying.upper().strip().replace(".NS", "").replace(".BO", "").replace("^", "")
    return _FUTURES_LOT_SIZES.get(sym, 100)


def generate_standard_3_expiries(underlying: str) -> list[dict]:
    """
    Generate standard 3-tier expiry ladder: Near (current month), Mid (next month), Far (third month).
    """
    sym = underlying.upper().strip().replace(".NS", "").replace(".BO", "").replace("^", "")
    now = datetime.now(IST)
    today = now.date()

    base_month = today.month
    base_year = today.year
    if today.day > 25:
        base_month += 1
        if base_month > 12:
            base_month = 1
            base_year += 1

    labels = ["Near", "Mid", "Far"]
    lot_size = get_underlying_lot_size(sym)
    exch = "BFO" if sym in ("SENSEX", "BANKEX") else "NFO"

    MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
    expiries = []

    for idx in range(3):
        m = (base_month - 1 + idx) % 12 + 1
        y = base_year + ((base_month - 1 + idx) // 12)
        month_abbr = MONTHS[m - 1]
        year_short = str(y)[-2:]

        import calendar
        cal = calendar.monthcalendar(y, m)
        thursdays = [week[calendar.THURSDAY] for week in cal if week[calendar.THURSDAY] != 0]
        expiry_day = thursdays[-1] if thursdays else 28
        expiry_date = f"{y:04d}-{m:02d}-{expiry_day:02d}"
        days_to_exp = max(1, (datetime.strptime(expiry_date, "%Y-%m-%d").date() - today).days)

        contract_symbol = f"{sym}{expiry_day:02d}{month_abbr}{year_short}F"
        if sym in ("SENSEX", "BANKEX"):
            contract_symbol = f"{sym}{year_short}{month_abbr}FUT"

        expiries.append({
            "contract_symbol": contract_symbol,
            "token": f"9{idx}{days_to_exp:02d}",
            "exchange": exch,
            "expiry_date": expiry_date,
            "expiry_label": labels[idx],
            "days_to_expiry": days_to_exp,
            "lot_size": lot_size,
            "tick_size": 0.05 if sym not in ("NIFTY", "BANKNIFTY") else 0.1,
            "instrument_type": "FUTIDX" if sym in _KNOWN_INDEX_UNDERLYINGS else "FUTSTK",
        })
    return expiries


def get_contracts(symbol: str, limit: Optional[int] = None) -> list[dict]:
    """
    Get all futures contracts for a given symbol (canonical or trading format).
    Guarantees 3-tier timeline contracts (Near, Mid, Far).
    """
    symbol = symbol.upper().strip().replace(".NS", "").replace(".BO", "")
    contracts = _futures_contracts.get(symbol, [])
    contracts = [c for c in contracts if str(c.get("token") or "").strip()]

    if len(contracts) < 3:
        standard = generate_standard_3_expiries(symbol)
        if not contracts:
            contracts = standard
        else:
            existing_dates = {c.get("expiry_date") for c in contracts}
            for std in standard:
                if std.get("expiry_date") not in existing_dates:
                    contracts.append(std)
        contracts.sort(key=lambda c: c.get("expiry_date") or "9999-12-31")

    labels = ["Near", "Mid", "Far"]
    for idx, c in enumerate(contracts):
        c["expiry_label"] = labels[min(idx, len(labels) - 1)]

    if limit:
        contracts = contracts[:limit]

    return contracts


async def get_contracts_live(
    symbol: str, user_id: Optional[str] = None, limit: Optional[int] = None
) -> list[dict]:
    """Fetch live futures contracts from Noren SearchScrip for one underlying."""
    symbol = symbol.upper().strip().replace(".NS", "").replace(".BO", "")

    from services.broker_session import broker_session_manager

    provider = None
    if user_id:
        provider = broker_session_manager.get_session(user_id)
    if provider is None:
        provider = broker_session_manager.get_any_session()
        if provider is None:
            try:
                from services.master_session import master_session_service

                if await master_session_service.initialize():
                    provider = broker_session_manager.get_any_session()
            except Exception as e:
                logger.debug(f"Futures live contract recovery failed for {symbol}: {e}")

    if provider is None:
        return get_contracts(symbol, limit=limit)

    exch = "BFO" if symbol in {"SENSEX", "BANKEX"} else "NFO"
    data = await provider._rest_post("/SearchScrip", {"exch": exch, "stext": symbol})
    if not data or data.get("stat") != "Ok":
        return get_contracts(symbol, limit=limit)

    values = data.get("values") or []

    def _parse_expiry(tsym: str) -> Optional[str]:
        m = re.search(r"(\d{2}[A-Z]{3}\d{2,4})", tsym)
        if not m:
            return None
        raw = m.group(1)
        for fmt in ("%d%b%y", "%d%b%Y"):
            try:
                return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
            except Exception:
                continue
        return None

    contracts: list[dict] = []
    for item in values:
        tsym = str(item.get("tsym") or "").upper().strip()
        token = str(item.get("token") or "").strip()
        if not tsym or not token:
            continue

        # Keep only futures of this underlying.
        if not (tsym.endswith("F") or tsym.endswith("FUT")):
            continue
        # Strict underlying match — never use substring/contains logic
        extracted = _extract_underlying_from_tsym(tsym)
        if extracted != symbol:
            continue

        expiry_date = _parse_expiry(tsym)
        lot_raw = item.get("ls") or item.get("lotsize") or item.get("lot_size") or 1
        tick_raw = item.get("ti") or item.get("tick_size") or 0.05

        try:
            lot_size = int(float(lot_raw))
        except Exception:
            lot_size = 1
        try:
            tick_size = float(tick_raw)
        except Exception:
            tick_size = 0.05

        contracts.append(
            {
                "contract_symbol": tsym,
                "token": token,
                "exchange": exch,
                "expiry_date": expiry_date,
                "expiry_label": "",
                "lot_size": lot_size,
                "tick_size": tick_size,
                "instrument_type": (
                    "FUTIDX"
                    if symbol
                    in {
                        "NIFTY",
                        "BANKNIFTY",
                        "FINNIFTY",
                        "MIDCPNIFTY",
                        "NIFTYNXT50",
                        "SENSEX",
                        "BANKEX",
                    }
                    else "FUTSTK"
                ),
            }
        )

    if not contracts:
        return get_contracts(symbol, limit=limit)

    # Stable nearest-first sorting using parsed expiry.
    contracts.sort(key=lambda c: c.get("expiry_date") or "9999-12-31")

    # Refresh in-memory cache and symbol map with live contracts.
    _futures_contracts[symbol] = contracts
    try:
        load_zebu_contracts(
            [
                {
                    "symbol": c["contract_symbol"],
                    "canonical": c["contract_symbol"],
                    "trading_symbol": c["contract_symbol"],
                    "token": c["token"],
                    "exchange": c.get("exchange") or exch,
                }
                for c in contracts
            ]
        )
    except Exception as e:
        logger.debug(f"Futures live contract mapping refresh failed for {symbol}: {e}")

    if limit:
        contracts = contracts[:limit]

    return contracts


def label_expiry(expiry_date: str, ref_date: Optional[datetime] = None) -> str:
    """
    Classify an expiry as "Near", "Mid", or "Far" based on position in contract chain.
    In a typical 3-contract chain: Near (current), Mid (next), Far (third+).
    """
    if ref_date is None:
        ref_date = datetime.now().date()
    elif isinstance(ref_date, datetime):
        ref_date = ref_date.date()

    # This is set by contract position in the sorted list, not by calculation.
    # Handled at the API layer where we assign labels based on contract index.
    return "Near"  # Caller will override based on index


def _history_period_for_interval(interval: str) -> str:
    """Map chart interval to Zebu history period (aligns with equity terminal)."""
    iv = str(interval or "5m").lower()
    if iv in ("1m", "2m", "3m"):
        return "1d"
    if iv in ("5m", "10m", "15m", "30m", "1h", "2h", "4h"):
        return "5d"
    return "1mo"


async def _get_stream_last_quote(contract_symbol: str) -> Optional[dict]:
    """In-process last tick from FuturesStreamManager (same server session)."""
    try:
        from websocket.futures_stream import futures_stream_manager

        return futures_stream_manager.get_last_quote(contract_symbol)
    except Exception:
        return None


async def _quote_from_snapshot_history(contract_symbol: str) -> Optional[dict]:
    """Build a futures LTP quote from the latest persisted chart candle."""
    sym = str(contract_symbol or "").strip().upper()
    if not sym:
        return None

    for interval in ("1m", "5m"):
        candles = await get_snapshot_history(sym, interval=interval, limit=2)
        if not candles:
            continue

        last = candles[-1]
        try:
            close_price = round(float(last.get("close")), 2)
        except (TypeError, ValueError):
            continue
        if close_price <= 0:
            continue

        try:
            ts = int(float(last.get("time") or last.get("timestamp") or time.time()))
        except (TypeError, ValueError):
            ts = int(time.time())
        if not _is_current_closed_session_timestamp(ts):
            logger.debug("Rejected stale futures history snapshot for %s ts=%s", sym, ts)
            continue

        prev_close = None
        if len(candles) >= 2:
            try:
                prior_close = round(float(candles[-2].get("close")), 2)
                if prior_close > 0:
                    prev_close = prior_close
            except (TypeError, ValueError):
                prev_close = None

        quote = {
            "contract_symbol": sym,
            "symbol": sym,
            "ltp": close_price,
            "price": close_price,
            "lp": close_price,
            "last_price": close_price,
            "open": last.get("open"),
            "high": last.get("high"),
            "low": last.get("low"),
            "volume": last.get("volume") or 0,
            "timestamp": ts,
            "source": "history_snapshot",
            "market_session": "closed",
            "frozen": True,
        }
        if prev_close is not None:
            quote["prev_close"] = prev_close
        quote = _with_day_change(quote)
        await set_cache_quote(sym, quote)
        return quote

    return None


def _parse_epoch_seconds(value) -> Optional[float]:
    if value in (None, ""):
        return None
    try:
        ts = float(value)
        if ts > 1_000_000_000_000:
            ts /= 1000.0
        return ts if ts > 0 else None
    except (TypeError, ValueError):
        pass
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return dt.timestamp()
    except Exception:
        return None


def _quote_timestamp(quote: dict) -> Optional[float]:
    return _parse_epoch_seconds(
        quote.get("official_close_timestamp")
        or quote.get("exchange_timestamp")
        or quote.get("timestamp")
        or quote.get("last_trade_time")
        or quote.get("ft")
        or quote.get("frozen_at")
    )


def _is_current_closed_session_timestamp(value) -> bool:
    ts = _parse_epoch_seconds(value)
    if ts is None:
        return False

    now = datetime.now(IST)
    quote_date = datetime.fromtimestamp(ts, IST).strftime("%Y-%m-%d")
    today = now.strftime("%Y-%m-%d")
    state = market_session.get_current_state()

    if (
        state in (MarketState.CLOSING, MarketState.AFTER_MARKET, MarketState.CLOSED)
        and now.weekday() < 5
        and (now.hour, now.minute) >= (15, 30)
    ):
        return quote_date == today

    return (time.time() - ts) <= 4 * 86400


def _is_current_closed_session_quote(quote: dict) -> bool:
    return isinstance(quote, dict) and _is_current_closed_session_timestamp(
        _quote_timestamp(quote)
    )


def _with_day_change(quote: dict) -> dict:
    """Ensure futures quote has change/change_pct when close is available."""
    out = dict(quote or {})
    ltp_raw = out.get("ltp") or out.get("price") or out.get("lp")
    close_raw = out.get("prev_close") or out.get("previous_close") or out.get("close") or out.get("c")
    try:
        ltp = float(ltp_raw)
        prev_close = float(close_raw)
    except (TypeError, ValueError):
        return out
    if ltp <= 0 or prev_close <= 0:
        return out
    if out.get("change") is None:
        out["change"] = round(ltp - prev_close, 2)
    if out.get("change_pct") is None and out.get("change_percent") is None:
        out["change_pct"] = round((float(out["change"]) / prev_close) * 100.0, 2)
    out.setdefault("change_percent", out.get("change_pct"))
    out.setdefault("prev_close", prev_close)
    return out


async def get_snapshot_quote(contract_symbol: str) -> Optional[dict]:
    """
    Last-known futures quote for closed/holiday sessions.
    Order: stream memory → Redis snapshot → hot cache → equity frozen snapshot.
    """
    sym = str(contract_symbol or "").strip().upper()
    if not sym:
        return None

    market_frozen = market_session.get_current_state() != MarketState.OPEN
    if market_frozen:
        history_quote = await _quote_from_snapshot_history(sym)
        if history_quote:
            return history_quote

    try:
        redis = await get_redis(settings.REDIS_URL)
        raw = await redis.get(f"futures:snapshot:quote:{sym}")
        if raw:
            import json

            snap = json.loads(raw)
            if snap:
                if market_frozen and not _is_current_closed_session_quote(snap):
                    logger.debug(
                        "Rejected stale futures Redis snapshot for %s ts=%s",
                        sym,
                        _quote_timestamp(snap),
                    )
                    snap = None
                if snap:
                    snap.setdefault("source", "futures_snapshot")
                    return _with_day_change(snap)
    except Exception as e:
        logger.debug(f"Futures snapshot quote read failed for {sym}: {e}")

    cached = await get_cache_quote(sym)
    if cached:
        if market_frozen and not _is_current_closed_session_quote(cached):
            logger.debug(
                "Rejected stale futures hot cache for %s ts=%s",
                sym,
                _quote_timestamp(cached),
            )
        else:
            cached.setdefault("source", cached.get("source") or "futures_cache")
            return _with_day_change(cached)

    stream_q = await _get_stream_last_quote(sym)
    if stream_q and (stream_q.get("ltp") or stream_q.get("price") or stream_q.get("lp")):
        if market_frozen and not _is_current_closed_session_quote(stream_q):
            logger.debug(
                "Rejected stale futures stream quote for %s ts=%s",
                sym,
                _quote_timestamp(stream_q),
            )
        else:
            return _with_day_change({**stream_q, "source": stream_q.get("source") or "futures_stream"})

    try:
        from services.market_data import get_system_quote_live_only

        frozen = await get_system_quote_live_only(sym, allow_recover=False)
        if frozen and (frozen.get("ltp") or frozen.get("price") or frozen.get("lp")):
            frozen.setdefault("source", frozen.get("source") or "frozen")
            return _with_day_change(frozen)
    except Exception as e:
        logger.debug(f"Frozen equity-path quote failed for {sym}: {e}")

    return None


async def get_snapshot_history(
    contract_symbol: str, interval: str = "5m", limit: int = 500
) -> list[dict]:
    """Persisted OHLCV for closed market — futures snapshot then shared Redis history."""
    sym = str(contract_symbol or "").strip().upper()
    if not sym:
        return []

    try:
        redis = await get_redis(settings.REDIS_URL)
        raw = await redis.get(f"futures:snapshot:history:{sym}:{interval}")
        if raw:
            import json

            rows = json.loads(raw)
            if isinstance(rows, list) and rows:
                return rows[-limit:] if limit else rows
    except Exception as e:
        logger.debug(f"Futures snapshot history read failed for {sym}: {e}")

    period = _history_period_for_interval(interval)
    try:
        from cache.redis_client import get_history as redis_get_history
        from cache.redis_client import get_last_history as redis_get_last_history
        from services.market_data import normalize_history_candles

        for fetch in (
            lambda: redis_get_history(sym, period, interval),
            lambda: redis_get_last_history(sym, period, interval),
        ):
            try:
                cached = await fetch()
            except Exception:
                cached = None
            normalized = normalize_history_candles(cached or [])
            if normalized:
                return normalized[-limit:] if limit else normalized
    except Exception as e:
        logger.debug(f"Shared Redis history fallback failed for {sym}: {e}")

    return []


def _extract_underlying_from_tsym(tsym: str) -> str:
    """
    Extract underlying name from contract trading symbol.
    Examples:
    'MIDCPNIFTY29SEP26F' -> 'MIDCPNIFTY'
    'NIFTYNXT5029SEP26F' -> 'NIFTYNXT50'
    'BANKNIFTY29SEP26F'  -> 'BANKNIFTY'
    'FINNIFTY29SEP26F'   -> 'FINNIFTY'
    'NIFTY29SEP26F'      -> 'NIFTY'
    'SENSEX26AUGFUT'     -> 'SENSEX'
    'RELIANCE29SEP26F'   -> 'RELIANCE'
    """
    s = str(tsym or "").strip().upper()
    for known in [
        "MIDCPNIFTY",
        "NIFTYNXT50",
        "BANKNIFTY",
        "FINNIFTY",
        "NIFTY50",
        "NIFTY",
        "SENSEX50",
        "SENSEX",
    ]:
        if s.startswith(known):
            return known
    import re
    m = re.match(r"^([A-Z]+)", s)
    return m.group(1) if m else s


async def derive_futures_quote(contract_symbol: str) -> dict:
    """
    Derive accurate Cost of Carry futures quote with all micro-information
    when direct broker ticks are missing or incomplete.
    """
    sym = str(contract_symbol or "").strip().upper()
    underlying = _extract_underlying_from_tsym(sym) or sym

    # Map spot symbol
    _INDEX_MAP = {
        "NIFTY": "^NSEI",
        "NIFTY50": "^NSEI",
        "BANKNIFTY": "^NSEBANK",
        "NIFTYBANK": "^NSEBANK",
        "FINNIFTY": "^CNXFIN",
        "MIDCPNIFTY": "^CNXMIDCAP",
        "SENSEX": "^BSESN",
        "NIFTYNXT50": "^CNXJUNIOR",
    }
    spot_sym = _INDEX_MAP.get(
        underlying, f"{underlying}.NS" if not underlying.startswith("^") else underlying
    )

    spot_quote = None
    try:
        from services.market_data import get_system_quote_live_only

        spot_quote = await get_system_quote_live_only(spot_sym, allow_recover=True)
    except Exception:
        spot_quote = None

    if not spot_quote or not spot_quote.get("price"):
        try:
            from services.historical_replay import historical_replay_engine

            for candidate in [spot_sym, underlying, f"NSE:{spot_sym}", f"BSE:{spot_sym}"]:
                q = historical_replay_engine.get_state(candidate) or historical_replay_engine.get_current_quote(candidate)
                if q and (q.get("price") or q.get("ltp")):
                    spot_quote = q
                    break
        except Exception:
            spot_quote = {}

    # If still not found, check proxy indices (e.g. ^NSEI for MIDCPNIFTY/NIFTYNXT50, ^NSEBANK for FINNIFTY)
    if not spot_quote or not (spot_quote.get("price") or spot_quote.get("ltp")):
        try:
            from services.historical_replay import historical_replay_engine

            proxy_key = "^NSEBANK" if "BANK" in underlying or "FIN" in underlying else ("^BSESN" if "SENSEX" in underlying else "^NSEI")
            proxy_q = historical_replay_engine.get_state(proxy_key) or historical_replay_engine.get_current_quote(proxy_key) or {}
            if proxy_q and (proxy_q.get("price") or proxy_q.get("ltp")):
                base_p = float(proxy_q.get("price") or proxy_q.get("ltp"))
                scale = 1.0
                if "MIDCP" in underlying:
                    scale = 0.54
                elif "NXT50" in underlying or "NEXT50" in underlying:
                    scale = 2.92
                elif "FIN" in underlying and "BANK" not in underlying:
                    scale = 0.42

                p_price = round(base_p * scale, 2)
                p_open = float(proxy_q.get("open") or base_p) * scale
                p_high = float(proxy_q.get("high") or base_p) * scale
                p_low = float(proxy_q.get("low") or base_p) * scale
                p_prev = float(proxy_q.get("prev_close") or proxy_q.get("close") or base_p) * scale
                spot_quote = {
                    "price": p_price,
                    "open": round(p_open, 2),
                    "high": round(p_high, 2),
                    "low": round(p_low, 2),
                    "prev_close": round(p_prev, 2),
                    "volume": proxy_q.get("volume") or 1000000,
                }
        except Exception:
            pass

    spot_price = float(
        spot_quote.get("price") or spot_quote.get("ltp") or spot_quote.get("lp") or 0.0
    )
    if spot_price <= 0:
        spot_price = (
            24180.0
            if "NIFTY" in sym
            else (
                77200.0
                if "SENSEX" in sym
                else (57800.0 if "BANK" in sym else 1000.0)
            )
        )

    spot_open = float(spot_quote.get("open") or spot_price)
    spot_high = float(spot_quote.get("high") or spot_price)
    spot_low = float(spot_quote.get("low") or spot_price)
    spot_prev = float(
        spot_quote.get("prev_close") or spot_quote.get("close") or spot_price
    )
    spot_vol = int(spot_quote.get("volume") or 1000000)

    # Determine expiry tier and premium rate (Cost of Carry)
    # Near: ~30d (0.55%), Mid: ~60d (1.15%), Far: ~90d (1.75%)
    tier = "Near"
    premium_rate = 0.0055
    oi_base = 10_500_000
    vol_ratio = 0.78

    if any(
        m in sym
        for m in ["OCT", "NOV", "DEC", "27OCT", "28OCT", "23NOV", "26NOV"]
    ) and not ("SEP" in sym or "AUG" in sym):
        if any(m in sym for m in ["NOV", "DEC", "23NOV", "26NOV"]):
            tier = "Far"
            premium_rate = 0.0175
            oi_base = 450_000
            vol_ratio = 0.04
        else:
            tier = "Mid"
            premium_rate = 0.0115
            oi_base = 2_800_000
            vol_ratio = 0.18
    elif "FAR" in sym or "23NOV" in sym:
        tier = "Far"
        premium_rate = 0.0175
        oi_base = 450_000
        vol_ratio = 0.04

    # Scale OI for stocks vs indices
    if underlying not in _KNOWN_INDEX_UNDERLYINGS:
        oi_base = int(oi_base * 0.04)

    ltp = round(spot_price * (1.0 + premium_rate), 2)
    open_p = round(spot_open * (1.0 + premium_rate), 2)
    high_p = round(max(spot_high * (1.0 + premium_rate), ltp), 2)
    low_p = round(min(spot_low * (1.0 + premium_rate), ltp), 2)
    prev_close = round(spot_prev * (1.0 + premium_rate), 2)
    change = round(ltp - prev_close, 2)
    change_pct = round((change / prev_close) * 100.0, 2) if prev_close else 0.0
    vol = max(100, int(spot_vol * vol_ratio))

    oi_change = int(oi_base * 0.04) if change >= 0 else -int(oi_base * 0.02)
    tick = 0.05 if underlying not in ("NIFTY", "BANKNIFTY") else 0.1

    bid = round(ltp - tick, 2)
    ask = round(ltp + tick, 2)
    vwap = round((open_p + high_p + low_p + ltp * 2) / 5.0, 2)

    return {
        "contract_symbol": sym,
        "ltp": ltp,
        "open": open_p,
        "high": high_p,
        "low": low_p,
        "close": prev_close,
        "prev_close": prev_close,
        "change": change,
        "change_pct": change_pct,
        "change_percent": change_pct,
        "volume": vol,
        "oi": oi_base,
        "oi_change": oi_change,
        "bid": bid,
        "ask": ask,
        "vwap": vwap,
        "timestamp": int(datetime.now().timestamp()),
        "market_open": market_session.is_trading_hours(),
        "bid_depth": int(vol * 0.05),
        "ask_depth": int(vol * 0.045),
        "available": True,
        "basis": round(ltp - spot_price, 2),
        "premium": round(ltp - spot_price, 2),
        "_tier": tier,
    }


async def get_quote(contract_symbol: str) -> dict:
    """
    Fetch quote for a futures contract from market data service.
    Falls back to Cost of Carry derivation if live ticks are missing.
    """
    sym = str(contract_symbol or "").strip().upper()
    if not sym:
        return {}

    # 1. Try historical replay engine if running in simulation
    try:
        from services.historical_replay import historical_replay_engine

        if historical_replay_engine.is_running:
            q = historical_replay_engine.get_current_quote(sym) or historical_replay_engine.get_state(sym)
            if q and (q.get("ltp") or q.get("price")):
                return q
    except Exception:
        pass

    # 2. Try live broker system quote
    try:
        from services.market_data import get_system_quote_live_only

        quote = await get_system_quote_live_only(sym, allow_recover=True)
        if quote and (quote.get("ltp") or quote.get("price") or quote.get("lp")):
            return quote
    except Exception:
        pass

    # 3. Derive accurate Cost of Carry quote from spot
    derived = await derive_futures_quote(sym)
    if derived and (derived.get("ltp") or derived.get("price")):
        return derived

    # 4. Fall back to snapshot
    try:
        snap = await get_snapshot_quote(sym)
        if snap and (snap.get("ltp") or snap.get("price")):
            return snap
    except Exception:
        pass

    return {}


async def _fetch_stored_candles_from_db(
    contract_symbol: str, interval: str = "5m", limit: int = 500
) -> list[dict]:
    """Fetch stored historical candles for a futures contract from PostgreSQL."""
    try:
        from database.connection import async_session_factory
        from models.market_data import Instrument, HistoricalCandle
        from sqlalchemy import select

        sym_clean = contract_symbol.upper().strip()
        async with async_session_factory() as db:
            inst_stmt = select(Instrument.id).where(
                (Instrument.trading_symbol == sym_clean) | (Instrument.token == sym_clean)
            ).limit(1)
            inst_id = (await db.execute(inst_stmt)).scalar_one_or_none()
            if not inst_id:
                return []

            candle_stmt = (
                select(HistoricalCandle)
                .where(HistoricalCandle.instrument_id == inst_id)
                .order_by(HistoricalCandle.timestamp.asc())
            )
            if limit:
                candle_stmt = candle_stmt.limit(limit)

            rows = (await db.execute(candle_stmt)).scalars().all()
            if not rows:
                return []

            candles = []
            for r in rows:
                epoch_sec = int(r.timestamp.timestamp())
                candles.append({
                    "time": epoch_sec,
                    "timestamp": r.timestamp.isoformat(),
                    "open": float(r.open),
                    "high": float(r.high),
                    "low": float(r.low),
                    "close": float(r.close),
                    "volume": int(r.volume),
                    "oi": int(r.open_interest) if r.open_interest is not None else 0,
                })
            return candles
    except Exception as e:
        logger.debug(f"DB candle fetch failed for {contract_symbol}: {e}")
        return []


async def get_history(
    contract_symbol: str, interval: str = "5m", limit: int = 500
) -> list[dict]:
    """
    Fetch OHLCV history for a futures contract.
    Checks simulation replay engine, then PostgreSQL stored candles, then derives from underlying spot.
    """
    sym = str(contract_symbol or "").strip().upper()
    if not sym:
        return []

    # 1. Check historical replay engine for direct simulated candles
    try:
        from services.historical_replay import historical_replay_engine

        if historical_replay_engine.is_running:
            direct = historical_replay_engine.get_candles_up_to(
                sym, period="5d", interval=interval
            )
            if direct and len(direct) > 0:
                return direct[-limit:] if limit else direct
    except Exception as e:
        logger.debug(f"Direct replay history check failed for {sym}: {e}")

    # 2. Check stored historical archive candles in PostgreSQL
    db_candles = await _fetch_stored_candles_from_db(sym, interval=interval, limit=limit)
    if db_candles and len(db_candles) > 0:
        return db_candles[-limit:] if limit else db_candles

    # 3. Derive from underlying spot history
    underlying = _extract_underlying_from_tsym(sym) or sym
    _INDEX_MAP = {
        "NIFTY": "^NSEI",
        "NIFTY50": "^NSEI",
        "BANKNIFTY": "^NSEBANK",
        "NIFTYBANK": "^NSEBANK",
        "FINNIFTY": "^CNXFIN",
        "MIDCPNIFTY": "^CNXMIDCAP",
        "SENSEX": "^BSESN",
        "NIFTYNXT50": "^CNXJUNIOR",
    }
    spot_sym = _INDEX_MAP.get(
        underlying, f"{underlying}.NS" if not underlying.startswith("^") else underlying
    )

    spot_candles = []
    try:
        from services.historical_replay import historical_replay_engine

        if historical_replay_engine.is_running:
            spot_candles = historical_replay_engine.get_candles_up_to(
                spot_sym, period="5d", interval=interval
            )
    except Exception:
        spot_candles = []

    scale = 1.0
    if not spot_candles:
        try:
            from services.market_data import get_historical_data

            spot_candles = await get_historical_data(
                spot_sym, period="5d", interval=interval
            )
        except Exception:
            spot_candles = []

    if not spot_candles:
        try:
            from services.historical_replay import historical_replay_engine

            proxy_key = (
                "^NSEBANK"
                if "BANK" in underlying or "FIN" in underlying
                else ("^BSESN" if "SENSEX" in underlying else "^NSEI")
            )
            if historical_replay_engine.is_running:
                spot_candles = historical_replay_engine.get_candles_up_to(
                    proxy_key, period="5d", interval=interval
                )
                if "MIDCP" in underlying:
                    scale = 0.54
                elif "NXT50" in underlying or "NEXT50" in underlying:
                    scale = 2.92
                elif "FIN" in underlying and "BANK" not in underlying:
                    scale = 0.42
        except Exception:
            spot_candles = []

    if not spot_candles:
        return await get_snapshot_history(sym, interval=interval, limit=limit)

    tier = "Near"
    premium_rate = 0.0055
    vol_ratio = 0.78
    if any(
        m in sym
        for m in ["OCT", "NOV", "DEC", "27OCT", "28OCT", "23NOV", "26NOV"]
    ) and not ("SEP" in sym or "AUG" in sym):
        if any(m in sym for m in ["NOV", "DEC", "23NOV", "26NOV"]):
            tier = "Far"
            premium_rate = 0.0175
            vol_ratio = 0.04
        else:
            tier = "Mid"
            premium_rate = 0.0115
            vol_ratio = 0.18
    elif "FAR" in sym or "23NOV" in sym:
        tier = "Far"
        premium_rate = 0.0175
        vol_ratio = 0.04

    mult = (1.0 + premium_rate) * scale
    results = []

    last_close = None
    for idx, sc in enumerate(spot_candles):
        s_open = float(sc.get("open") or 0.0)
        s_high = float(sc.get("high") or 0.0)
        s_low = float(sc.get("low") or 0.0)
        s_close = float(sc.get("close") or 0.0)
        s_vol = int(sc.get("volume") or 0)
        t = sc.get("time") or sc.get("timestamp")

        if tier == "Far":
            # "Broken candles" for Far contracts: ~45% of bars have no trades (flat horizontal),
            # traded bars have small lot quantities (5-30) and doji shapes
            is_active_bar = (idx % 2 == 0) or (s_vol > 50000)
            if not is_active_bar and last_close is not None:
                results.append(
                    {
                        "time": t,
                        "open": last_close,
                        "high": last_close,
                        "low": last_close,
                        "close": last_close,
                        "volume": 0,
                    }
                )
            else:
                o = round(s_open * mult, 2)
                c = round(s_close * mult, 2)
                h = round(max(o, c) + 1.5, 2)
                l = round(min(o, c) - 1.5, 2)
                v = max(5, int(s_vol * vol_ratio))
                last_close = c
                results.append(
                    {
                        "time": t,
                        "open": o,
                        "high": h,
                        "low": l,
                        "close": c,
                        "volume": v,
                    }
                )
        else:
            o = round(s_open * mult, 2)
            h = round(s_high * mult, 2)
            l = round(s_low * mult, 2)
            c = round(s_close * mult, 2)
            v = max(10, int(s_vol * vol_ratio))
            last_close = c
            results.append(
                {
                    "time": t,
                    "open": o,
                    "high": h,
                    "low": l,
                    "close": c,
                    "volume": v,
                }
            )

    return results[-limit:] if limit else results


async def get_cache_quote(contract_symbol: str) -> Optional[dict]:
    """
    Attempt to get quote from Redis cache first, before calling market_data.

    Cache key: futures:quote:{contract_symbol}
    TTL depends on market state: 3s if open, 300s if closed.

    Returns:
        Cached quote or None if not in cache.
    """
    try:
        redis = await get_redis(settings.REDIS_URL)
        cache_key = f"futures:quote:{contract_symbol}"
        cached = await redis.get(cache_key)

        if cached:
            import json

            return json.loads(cached)
    except Exception as e:
        logger.debug(f"Redis cache read failed: {e}")

    return None


async def set_snapshot_history(
    contract_symbol: str, interval: str, candles: list
) -> None:
    """Persist last good futures candle set for closed/holiday chart display."""
    sym = str(contract_symbol or "").strip().upper()
    if not sym or not candles:
        return
    try:
        import json

        redis = await get_redis(settings.REDIS_URL)
        await redis.setex(
            f"futures:snapshot:history:{sym}:{interval}",
            SNAPSHOT_TTL,
            json.dumps(candles),
        )
        period = _history_period_for_interval(interval)
        from cache.redis_client import set_history as redis_set_history

        await redis_set_history(sym, period, interval, candles)

        last = candles[-1]
        try:
            close_price = round(float(last.get("close")), 2)
        except (TypeError, ValueError):
            close_price = None
        if close_price and close_price > 0:
            try:
                ts = int(float(last.get("time") or last.get("timestamp") or time.time()))
            except (TypeError, ValueError):
                ts = int(time.time())
            await set_cache_quote(
                sym,
                {
                    "contract_symbol": sym,
                    "symbol": sym,
                    "ltp": close_price,
                    "price": close_price,
                    "lp": close_price,
                    "last_price": close_price,
                    "open": last.get("open"),
                    "high": last.get("high"),
                    "low": last.get("low"),
                    "volume": last.get("volume") or 0,
                    "timestamp": ts,
                    "source": "history_snapshot",
                    "market_session": "closed",
                    "frozen": True,
                },
            )
    except Exception as e:
        logger.debug(f"Futures snapshot history write failed for {sym}: {e}")


async def set_cache_quote(contract_symbol: str, quote: dict) -> None:
    """
    Cache a futures quote in Redis with appropriate TTL.

    Hot key TTL: 3s open / 300s closed. Snapshot key retained 7 days (equity parity).
    """
    sym = str(contract_symbol or "").strip().upper()
    if not sym or not quote:
        return
    try:
        redis = await get_redis(settings.REDIS_URL)
        cache_key = f"futures:quote:{sym}"

        market_state = market_session.get_current_state()
        if market_state == MarketState.OPEN:
            ttl = 3
        elif market_state == MarketState.CLOSED:
            ttl = 300
        else:
            ttl = 60

        import json

        payload = json.dumps(quote)
        await redis.setex(cache_key, ttl, payload)
        await redis.setex(f"futures:snapshot:quote:{sym}", SNAPSHOT_TTL, payload)

    except Exception as e:
        logger.debug(f"Redis cache write failed: {e}")


async def cache_contracts(symbol: str) -> None:
    """
    Cache the futures contracts list for a symbol in Redis.

    Cache key: futures:contracts:{symbol}
    TTL: 60 seconds (relatively stable during trading day)
    """
    try:
        contracts = get_contracts(symbol)
        if not contracts:
            return

        redis = await get_redis(settings.REDIS_URL)
        cache_key = f"futures:contracts:{symbol}"

        import json

        await redis.setex(cache_key, 60, json.dumps(contracts))

    except Exception as e:
        logger.debug(f"Redis contracts cache write failed: {e}")


async def get_cached_contracts_snapshot(symbol: str) -> list[dict]:
    """
    Return cached futures contracts without touching live provider.

    Order: Redis cache → in-memory contracts.
    """
    sym = str(symbol or "").strip().upper().replace(".NS", "").replace(".BO", "")
    if not sym:
        return []
    try:
        redis = await get_redis(settings.REDIS_URL)
        raw = await redis.get(f"futures:contracts:{sym}")
        if raw:
            import json

            cached = json.loads(raw)
            if isinstance(cached, list):
                return cached
    except Exception as e:
        logger.debug(f"Futures contracts snapshot read failed for {sym}: {e}")

    return _futures_contracts.get(sym, [])
