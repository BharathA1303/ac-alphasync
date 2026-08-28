"""
FuturesAnalyticsService — Institutional-grade mathematical engine for derivatives.

Calculates comprehensive micro-information for any futures contract or underlying:
    - Basis, Premium/Discount, Annualized Cost of Carry %
    - Fair Value theoretical pricing (Cost of Carry Model with RBI benchmark rate)
    - 4-Quadrant OI Buildup Classifier (Long Buildup, Short Buildup, Long Unwinding, Short Covering)
    - VWAP, Turnover in ₹ Crores, Contract Value, Estimated Margin
    - Term Structure (Near, Mid, Far calendar spreads and roll yields)

Zero external broker dependencies — operates directly on local cache and historical stores.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from engines.market_session import IST

logger = logging.getLogger(__name__)

# Benchmark risk-free interest rate (RBI Repo Rate ~ 6.50% annualized)
RISK_FREE_RATE = 0.0650
# Standard approximate margin requirement (Span + Exposure for Index/Stock futures)
MARGIN_RATE_INDEX = 0.12  # ~12-14% for liquid index futures
MARGIN_RATE_STOCK = 0.22  # ~20-25% for high-beta stock futures


@dataclass
class FuturesMicroAnalytics:
    """Complete analytical micro-information profile for a futures contract."""

    contract_symbol: str
    underlying: str
    exchange: str
    instrument_type: str  # FUTIDX / FUTSTK
    expiry_date: str
    expiry_label: str  # Near / Mid / Far
    days_to_expiry: int
    lot_size: int
    tick_size: float

    # Price & Basis Metrics
    ltp: Optional[float]
    spot_price: Optional[float]
    change: Optional[float]
    change_pct: Optional[float]
    basis: Optional[float]
    basis_pct: Optional[float]
    cost_of_carry_annualized: Optional[float]
    fair_value: Optional[float]
    arbitrage_spread: Optional[float]

    # Open Interest & Buildup
    oi: Optional[int]
    oi_change: Optional[int]
    oi_change_pct: Optional[float]
    buildup: str  # Long Buildup, Short Buildup, Long Unwinding, Short Covering, Neutral
    sentiment: str  # Bullish, Bearish, Neutral

    # Liquidity & Execution
    volume: Optional[int]
    turnover_cr: Optional[float]  # ₹ Crores
    contract_value: Optional[float]  # ₹ Total nominal value
    estimated_margin: Optional[float]  # ₹ Span + Exposure
    vwap: Optional[float]
    vwap_deviation: Optional[float]
    bid: Optional[float]
    ask: Optional[float]
    spread: Optional[float]
    spread_pct: Optional[float]


def classify_buildup(
    price_change: Optional[float], oi_change: Optional[int]
) -> tuple[str, str]:
    """
    Classify 4-quadrant futures positioning:
        Price Up   + OI Up   -> Long Buildup (Bullish)
        Price Down + OI Up   -> Short Buildup (Bearish)
        Price Down + OI Down -> Long Unwinding (Bearish Correction)
        Price Up   + OI Down -> Short Covering (Bullish Rally)
    """
    if price_change is None or oi_change is None or oi_change == 0:
        return ("Neutral", "Neutral")

    if price_change > 0:
        if oi_change > 0:
            return ("Long Buildup", "Bullish")
        else:
            return ("Short Covering", "Bullish")
    elif price_change < 0:
        if oi_change > 0:
            return ("Short Buildup", "Bearish")
        else:
            return ("Long Unwinding", "Bearish")

    return ("Neutral", "Neutral")


class FuturesAnalyticsService:
    """Calculates all micro-metrics for futures contracts."""

    @staticmethod
    def calculate_contract_analytics(
        contract_meta: dict,
        quote: dict,
        spot_quote: Optional[dict] = None,
    ) -> FuturesMicroAnalytics:
        """
        Compute full micro-information calculations for one futures contract.
        """
        contract_symbol = str(contract_meta.get("contract_symbol") or "").strip().upper()
        underlying = str(contract_meta.get("underlying") or "").strip().upper()
        if not underlying:
            underlying = contract_symbol.split("2")[0] if "2" in contract_symbol else contract_symbol

        exchange = str(contract_meta.get("exchange") or "NFO").upper()
        inst_type = str(contract_meta.get("instrument_type") or "FUTSTK").upper()
        lot_size = int(contract_meta.get("lot_size") or 1)
        tick_size = float(contract_meta.get("tick_size") or 0.05)

        # Expiry & Days remaining
        expiry_str = str(contract_meta.get("expiry_date") or "").strip()
        days_to_expiry = 1
        if expiry_str:
            try:
                exp_dt = datetime.strptime(expiry_str, "%Y-%m-%d").date()
                days_to_expiry = max(1, (exp_dt - datetime.now(IST).date()).days)
            except Exception:
                days_to_expiry = max(1, int(contract_meta.get("days_to_expiry") or 1))
        else:
            days_to_expiry = max(1, int(contract_meta.get("days_to_expiry") or 1))

        expiry_label = str(contract_meta.get("expiry_label") or "Near")

        # Price resolutions
        ltp = None
        for k in ("ltp", "price", "lp", "close", "c"):
            if quote.get(k) is not None:
                try:
                    v = float(quote[k])
                    if v > 0:
                        ltp = v
                        break
                except (ValueError, TypeError):
                    continue

        spot_price = None
        if spot_quote:
            for k in ("ltp", "price", "lp", "close", "c"):
                if spot_quote.get(k) is not None:
                    try:
                        v = float(spot_quote[k])
                        if v > 0:
                            spot_price = v
                            break
                    except (ValueError, TypeError):
                        continue

        # Day changes
        change = None
        for k in ("change", "net_change"):
            if quote.get(k) is not None:
                try:
                    change = round(float(quote[k]), 2)
                    break
                except (ValueError, TypeError):
                    pass

        change_pct = None
        for k in ("change_pct", "change_percent", "pc", "pct_change"):
            if quote.get(k) is not None:
                try:
                    change_pct = round(float(quote[k]), 2)
                    break
                except (ValueError, TypeError):
                    pass

        # Basis & Cost of Carry calculations
        basis = None
        basis_pct = None
        coc_annualized = None
        fair_value = None
        arbitrage_spread = None

        if ltp is not None and spot_price is not None and spot_price > 0:
            basis = round(ltp - spot_price, 2)
            basis_pct = round((basis / spot_price) * 100.0, 2)

            # Annualized Cost of Carry % = (Basis / Spot) * (365 / DaysToExpiry) * 100
            coc_annualized = round((basis / spot_price) * (365.0 / days_to_expiry) * 100.0, 2)

            # Fair Value = Spot * (1 + r * (t/365))
            time_fraction = days_to_expiry / 365.0
            fair_value = round(spot_price * (1.0 + (RISK_FREE_RATE * time_fraction)), 2)
            arbitrage_spread = round(ltp - fair_value, 2)

        # Open Interest & Buildup classification
        oi = int(quote.get("oi") or quote.get("open_interest") or 0)
        oi_change = int(quote.get("oi_change") or quote.get("chg_in_oi") or 0) if quote.get("oi_change") is not None else None
        
        oi_change_pct = None
        if oi > 0 and oi_change is not None:
            prev_oi = oi - oi_change
            if prev_oi > 0:
                oi_change_pct = round((oi_change / prev_oi) * 100.0, 2)

        buildup, sentiment = classify_buildup(change, oi_change)

        # Liquidity, VWAP & Turnover
        volume = int(quote.get("volume") or quote.get("v") or 0)
        turnover_cr = None
        contract_value = None
        estimated_margin = None

        if ltp is not None and ltp > 0:
            contract_value = round(ltp * lot_size, 2)
            margin_rate = MARGIN_RATE_INDEX if inst_type == "FUTIDX" else MARGIN_RATE_STOCK
            estimated_margin = round(contract_value * margin_rate, 2)

            if volume > 0:
                # Turnover in ₹ Crores = (Volume * LTP * LotSize) / 10,000,000
                nominal_turnover = volume * ltp * lot_size
                turnover_cr = round(nominal_turnover / 10_000_000.0, 2)

        vwap = None
        for k in ("vwap", "ap", "avg_price"):
            if quote.get(k) is not None:
                try:
                    v = float(quote[k])
                    if v > 0:
                        vwap = round(v, 2)
                        break
                except (ValueError, TypeError):
                    pass

        vwap_deviation = round(ltp - vwap, 2) if (ltp and vwap) else None

        bid = float(quote["bid"]) if quote.get("bid") else (float(quote["bp1"]) if quote.get("bp1") else None)
        ask = float(quote["ask"]) if quote.get("ask") else (float(quote["sp1"]) if quote.get("sp1") else None)
        spread = round(ask - bid, 2) if (bid and ask and ask >= bid) else None
        spread_pct = round((spread / ltp) * 100.0, 3) if (spread and ltp and ltp > 0) else None

        return FuturesMicroAnalytics(
            contract_symbol=contract_symbol,
            underlying=underlying,
            exchange=exchange,
            instrument_type=inst_type,
            expiry_date=expiry_str,
            expiry_label=expiry_label,
            days_to_expiry=days_to_expiry,
            lot_size=lot_size,
            tick_size=tick_size,
            ltp=ltp,
            spot_price=spot_price,
            change=change,
            change_pct=change_pct,
            basis=basis,
            basis_pct=basis_pct,
            cost_of_carry_annualized=coc_annualized,
            fair_value=fair_value,
            arbitrage_spread=arbitrage_spread,
            oi=oi,
            oi_change=oi_change,
            oi_change_pct=oi_change_pct,
            buildup=buildup,
            sentiment=sentiment,
            volume=volume,
            turnover_cr=turnover_cr,
            contract_value=contract_value,
            estimated_margin=estimated_margin,
            vwap=vwap,
            vwap_deviation=vwap_deviation,
            bid=bid,
            ask=ask,
            spread=spread,
            spread_pct=spread_pct,
        )

    @classmethod
    def calculate_ladder_analytics(
        cls,
        underlying: str,
        contracts: list[dict],
        quotes: dict[str, dict],
        spot_quote: Optional[dict] = None,
    ) -> dict:
        """
        Compute term structure, calendar spreads, and aggregate metrics for an underlying's expiry ladder.
        """
        ladder_items: list[dict] = []
        for contract in contracts:
            sym = str(contract.get("contract_symbol") or "").upper().strip()
            q = quotes.get(sym) or {}
            analytics = cls.calculate_contract_analytics(contract, q, spot_quote)
            ladder_items.append(analytics.__dict__)

        # Calculate calendar spreads between consecutive expiries
        calendar_spreads = []
        for i in range(len(ladder_items) - 1):
            near_item = ladder_items[i]
            far_item = ladder_items[i + 1]

            near_ltp = near_item.get("ltp")
            far_ltp = far_item.get("ltp")

            spread_val = round(far_ltp - near_ltp, 2) if (near_ltp and far_ltp) else None
            spread_label = f"{near_item.get('expiry_label')} → {far_item.get('expiry_label')}"

            calendar_spreads.append(
                {
                    "spread_label": spread_label,
                    "near_contract": near_item.get("contract_symbol"),
                    "far_contract": far_item.get("contract_symbol"),
                    "spread": spread_val,
                    "near_ltp": near_ltp,
                    "far_ltp": far_ltp,
                }
            )

        total_oi = sum(int(item.get("oi") or 0) for item in ladder_items)
        total_volume = sum(int(item.get("volume") or 0) for item in ladder_items)
        total_turnover = sum(float(item.get("turnover_cr") or 0.0) for item in ladder_items)

        return {
            "underlying": underlying.upper(),
            "spot_quote": spot_quote,
            "contracts": ladder_items,
            "calendar_spreads": calendar_spreads,
            "aggregate": {
                "total_oi": total_oi,
                "total_volume": total_volume,
                "total_turnover_cr": round(total_turnover, 2),
            },
        }


futures_analytics_service = FuturesAnalyticsService()
