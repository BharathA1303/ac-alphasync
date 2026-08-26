"""
Assignment Evaluator Service — evaluates student trade executions against
faculty-defined TradingAssignment rules and criteria.
"""

from datetime import datetime
from typing import Any, Dict, List, Tuple
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from models.assignment import TradingAssignment, AssignmentSubmission
from models.order import Order
from models.futures_order import FuturesOrder


def _safe_float(val: Any) -> float:
    if val is None:
        return 0.0
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0


async def evaluate_student_assignment(
    db: AsyncSession,
    assignment: TradingAssignment,
    student_id: Any,
) -> Dict[str, Any]:
    """
    Evaluates a student's real orders against the specified TradingAssignment rules.
    Returns a comprehensive evaluation dictionary containing score, pass status,
    matched order IDs, and detailed rule checks.
    """
    # 1. Determine evaluation timeframe
    start_time = assignment.start_date or assignment.created_at
    end_time = assignment.due_date

    # 2. Fetch student equity orders
    equity_query = select(Order).where(
        and_(
            Order.user_id == student_id,
            Order.created_at >= start_time,
            Order.status.in_(["FILLED", "PARTIALLY_FILLED"]),
        )
    )
    if end_time:
        equity_query = equity_query.where(Order.created_at <= end_time)
    equity_query = equity_query.order_by(Order.created_at.asc())
    
    equity_res = await db.execute(equity_query)
    equity_orders: List[Order] = list(equity_res.scalars().all())

    # 3. Fetch student futures orders if asset class is FUTURES or ANY
    futures_orders: List[FuturesOrder] = []
    if assignment.target_asset_class in ["FUTURES", "ANY"]:
        fut_query = select(FuturesOrder).where(
            and_(
                FuturesOrder.user_id == student_id,
                FuturesOrder.created_at >= start_time,
                FuturesOrder.status.in_(["FILLED", "PARTIALLY_FILLED"]),
            )
        )
        if end_time:
            fut_query = fut_query.where(FuturesOrder.created_at <= end_time)
        fut_query = fut_query.order_by(FuturesOrder.created_at.asc())
        fut_res = await db.execute(fut_query)
        futures_orders = list(fut_res.scalars().all())

    # 4. Prepare target symbols list
    target_symbols = [s.upper().strip() for s in (assignment.target_symbols or []) if s and isinstance(s, str)]
    allowed_sides = assignment.allowed_sides or "BOTH"
    allowed_products = assignment.allowed_product_types or ["ALL"]
    if isinstance(allowed_products, str):
        allowed_products = [allowed_products]

    matched_orders_info = []
    matched_order_ids = []

    # Evaluate Equity Orders
    if assignment.target_asset_class in ["EQUITY", "ANY"]:
        for o in equity_orders:
            reasons = []
            is_valid = True

            # Check Symbol
            sym = o.symbol.upper()
            if target_symbols and sym not in target_symbols:
                is_valid = False
                reasons.append(f"Symbol {sym} not in target list")

            # Check Side
            if allowed_sides != "BOTH" and o.side.upper() != allowed_sides:
                is_valid = False
                reasons.append(f"Side {o.side} does not match allowed {allowed_sides}")

            # Check Product Type
            if "ALL" not in allowed_products and o.product_type.upper() not in [p.upper() for p in allowed_products]:
                is_valid = False
                reasons.append(f"Product {o.product_type} not in allowed {allowed_products}")

            # Check Stop-Loss presence & discipline
            entry_price = _safe_float(o.filled_price or o.price)
            sl_price = _safe_float(o.trigger_price)
            has_sl = (sl_price > 0) or (o.order_type in ["STOP_LOSS", "STOP_LOSS_LIMIT", "BRACKET"])

            sl_percent = None
            if has_sl and entry_price > 0 and sl_price > 0:
                sl_percent = round((abs(entry_price - sl_price) / entry_price) * 100.0, 2)

            if assignment.require_stop_loss:
                if not has_sl:
                    is_valid = False
                    reasons.append("Missing Stop-Loss trigger price")
                elif assignment.max_sl_percent is not None:
                    max_sl = _safe_float(assignment.max_sl_percent)
                    if sl_percent is not None and sl_percent > max_sl:
                        is_valid = False
                        reasons.append(f"Stop-Loss {sl_percent}% exceeds max allowed {max_sl}%")

            # Check Take-Profit & Risk-Reward
            tp_price = _safe_float(o.take_profit_price)
            has_tp = tp_price > 0
            rr_ratio = None
            if has_tp and sl_price > 0 and entry_price > 0:
                risk = abs(entry_price - sl_price)
                reward = abs(tp_price - entry_price)
                if risk > 0:
                    rr_ratio = round(reward / risk, 2)

            if assignment.require_take_profit:
                if not has_tp:
                    is_valid = False
                    reasons.append("Missing Take-Profit target price")
                elif assignment.min_risk_reward_ratio is not None:
                    min_rr = _safe_float(assignment.min_risk_reward_ratio)
                    if rr_ratio is not None and rr_ratio < min_rr:
                        is_valid = False
                        reasons.append(f"Risk-Reward {rr_ratio}:1 below minimum required {min_rr}:1")

            order_summary = {
                "order_id": str(o.id),
                "asset_class": "EQUITY",
                "symbol": o.symbol,
                "side": o.side,
                "product_type": o.product_type,
                "quantity": o.quantity,
                "price": entry_price,
                "trigger_price": sl_price if sl_price > 0 else None,
                "sl_percent": sl_percent,
                "take_profit_price": tp_price if tp_price > 0 else None,
                "risk_reward_ratio": rr_ratio,
                "status": o.status,
                "executed_at": o.executed_at.isoformat() if o.executed_at else (o.created_at.isoformat() if o.created_at else None),
                "is_qualifying": is_valid,
                "notes": ", ".join(reasons) if reasons else "Fully compliant with rules",
            }
            matched_orders_info.append(order_summary)
            if is_valid:
                matched_order_ids.append(str(o.id))

    # Evaluate Futures Orders
    if assignment.target_asset_class in ["FUTURES", "ANY"]:
        for fo in futures_orders:
            reasons = []
            is_valid = True

            sym = fo.symbol.upper()
            if target_symbols and sym not in target_symbols:
                is_valid = False
                reasons.append(f"Symbol {sym} not in target list")

            if allowed_sides != "BOTH" and fo.side.upper() != allowed_sides:
                is_valid = False
                reasons.append(f"Side {fo.side} does not match allowed {allowed_sides}")

            if "ALL" not in allowed_products and fo.product_type.upper() not in [p.upper() for p in allowed_products]:
                is_valid = False
                reasons.append(f"Product {fo.product_type} not in allowed {allowed_products}")

            entry_price = _safe_float(fo.filled_price or fo.price)
            sl_price = _safe_float(fo.trigger_price)
            has_sl = (sl_price > 0) or (fo.order_type in ["STOP_LOSS", "STOP_LOSS_LIMIT", "BRACKET"])

            sl_percent = None
            if has_sl and entry_price > 0 and sl_price > 0:
                sl_percent = round((abs(entry_price - sl_price) / entry_price) * 100.0, 2)

            if assignment.require_stop_loss:
                if not has_sl:
                    is_valid = False
                    reasons.append("Missing Stop-Loss trigger price")
                elif assignment.max_sl_percent is not None:
                    max_sl = _safe_float(assignment.max_sl_percent)
                    if sl_percent is not None and sl_percent > max_sl:
                        is_valid = False
                        reasons.append(f"Stop-Loss {sl_percent}% exceeds max allowed {max_sl}%")

            order_summary = {
                "order_id": str(fo.id),
                "asset_class": "FUTURES",
                "symbol": fo.symbol,
                "side": fo.side,
                "product_type": fo.product_type,
                "quantity": fo.quantity,
                "price": entry_price,
                "trigger_price": sl_price if sl_price > 0 else None,
                "sl_percent": sl_percent,
                "take_profit_price": None,
                "risk_reward_ratio": None,
                "status": fo.status,
                "executed_at": fo.created_at.isoformat() if fo.created_at else None,
                "is_qualifying": is_valid,
                "notes": ", ".join(reasons) if reasons else "Fully compliant with rules",
            }
            matched_orders_info.append(order_summary)
            if is_valid:
                matched_order_ids.append(str(fo.id))

    # 5. Rule Checklist & Score Calculation
    total_qualifying = len(matched_order_ids)
    min_required = assignment.min_trades or 1
    trades_progress = min(100, int((total_qualifying / min_required) * 100)) if min_required > 0 else 100

    checklist = [
        {
            "rule": "trade_count",
            "title": f"Execute at least {min_required} qualifying trade{'s' if min_required > 1 else ''}",
            "required": min_required,
            "actual": total_qualifying,
            "satisfied": total_qualifying >= min_required,
            "weight": 50 if (assignment.require_stop_loss or assignment.require_take_profit) else 100,
        }
    ]

    if assignment.require_stop_loss:
        sl_met = all(
            m["trigger_price"] is not None and (
                assignment.max_sl_percent is None or 
                (m["sl_percent"] is not None and m["sl_percent"] <= _safe_float(assignment.max_sl_percent))
            )
            for m in matched_orders_info if m["is_qualifying"]
        ) if total_qualifying > 0 else False

        max_sl_text = f" <= {assignment.max_sl_percent}%" if assignment.max_sl_percent else ""
        checklist.append({
            "rule": "stop_loss_discipline",
            "title": f"Stop-Loss Discipline (SL trigger set{max_sl_text})",
            "satisfied": sl_met and total_qualifying >= min_required,
            "weight": 30 if assignment.require_take_profit else 50,
        })

    if assignment.require_take_profit:
        tp_met = all(
            m["take_profit_price"] is not None and (
                assignment.min_risk_reward_ratio is None or 
                (m["risk_reward_ratio"] is not None and m["risk_reward_ratio"] >= _safe_float(assignment.min_risk_reward_ratio))
            )
            for m in matched_orders_info if m["is_qualifying"]
        ) if total_qualifying > 0 else False

        rr_text = f" with RR >= {assignment.min_risk_reward_ratio}:1" if assignment.min_risk_reward_ratio else ""
        checklist.append({
            "rule": "take_profit_ratio",
            "title": f"Take-Profit & Risk-Reward Target{rr_text}",
            "satisfied": tp_met and total_qualifying >= min_required,
            "weight": 20,
        })

    # Calculate overall score percentage
    score = 0
    total_weight = sum(item.get("weight", 0) for item in checklist)
    if total_weight > 0:
        for item in checklist:
            if item.get("satisfied"):
                score += item.get("weight", 0)
            elif item.get("rule") == "trade_count" and total_qualifying > 0 and min_required > 0:
                # Partial credit for trade count
                score += int((total_qualifying / min_required) * item.get("weight", 0))

    pass_threshold = assignment.pass_score or 70
    is_passed = score >= pass_threshold and total_qualifying >= min_required

    return {
        "score": min(100, score),
        "passed": is_passed,
        "pass_score": pass_threshold,
        "total_qualifying_trades": total_qualifying,
        "min_required_trades": min_required,
        "trades_progress_pct": trades_progress,
        "matched_order_ids": matched_order_ids,
        "orders_evaluated": matched_orders_info,
        "checklist": checklist,
        "evaluated_at": datetime.utcnow().isoformat(),
    }
