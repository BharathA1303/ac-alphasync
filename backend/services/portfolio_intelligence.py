from typing import Any, Dict

class PortfolioIntelligence:
    """
    Computes real-time portfolio performance, exposure, and risk indicators 
    from active database contexts to supply Sarah with deep trading intelligence.
    """

    @staticmethod
    def analyze_portfolio(user_context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Calculates advanced portfolio risk metrics.
        Returns a detailed structure containing:
          - capital_base_inr
          - exposure_pct
          - pnl_today_pct
          - open_positions_count
          - largest_holding: { symbol, value_inr }
          - largest_loss: { symbol, loss_inr }
          - risk_score (0-100)
          - risk_category ("low", "medium", "high")
        """
        available = float(user_context.get("available_capital_inr") or 0.0)
        invested = float(user_context.get("invested_capital_inr") or 0.0)
        pnl_today = float(user_context.get("pnl_today_inr") or 0.0)
        open_positions = user_context.get("open_positions") or []
        active_strategy = user_context.get("active_strategy")
        alpha_auto_status = user_context.get("alpha_auto_status")

        capital_base = max(available + invested, 1.0)
        exposure_ratio = invested / capital_base
        pnl_ratio = pnl_today / capital_base

        # Find largest holding and largest loss position
        largest_holding_symbol = "None"
        largest_holding_value = 0.0
        largest_loss_symbol = "None"
        largest_loss_amt = 0.0

        for pos in open_positions:
            qty = abs(pos.get("qty", 0))
            cmp = pos.get("cmp", 0.0)
            pnl = pos.get("pnl_inr", 0.0)
            value = qty * cmp
            if value > largest_holding_value:
                largest_holding_value = value
                largest_holding_symbol = pos.get("symbol", "Unknown")
            if pnl < largest_loss_amt:
                largest_loss_amt = pnl
                largest_loss_symbol = pos.get("symbol", "Unknown")

        # Compute Risk Score (0-100)
        risk_score = 0
        
        # 1. Exposure contribution (up to 30 points)
        if exposure_ratio > 0.8:
            risk_score += 30
        elif exposure_ratio > 0.5:
            risk_score += 15
        elif exposure_ratio > 0.2:
            risk_score += 5

        # 2. Overtrading / Position count contribution (up to 20 points)
        pos_count = len(open_positions)
        if pos_count > 6:
            risk_score += 20
        elif pos_count >= 4:
            risk_score += 12
        elif pos_count >= 2:
            risk_score += 5

        # 3. P&L contribution (up to 30 points)
        if pnl_ratio < -0.05:  # Loss > 5%
            risk_score += 30
        elif pnl_ratio < -0.02:  # Loss > 2%
            risk_score += 20
        elif pnl_ratio < 0:  # Any loss
            risk_score += 10

        # 4. Strategy execution (up to 20 points)
        if active_strategy is None:
            risk_score += 10
        if alpha_auto_status == "OFF":
            risk_score += 10

        # Determine risk category
        if risk_score > 65:
            risk_category = "high"
        elif risk_score >= 35:
            risk_category = "medium"
        else:
            risk_category = "low"

        return {
            "capital_base_inr": round(capital_base, 2),
            "exposure_pct": round(exposure_ratio * 100, 2),
            "pnl_today_pct": round(pnl_ratio * 100, 2),
            "open_positions_count": pos_count,
            "largest_holding": {
                "symbol": largest_holding_symbol,
                "value_inr": round(largest_holding_value, 2)
            },
            "largest_loss": {
                "symbol": largest_loss_symbol,
                "loss_inr": round(largest_loss_amt, 2)
            },
            "risk_score": risk_score,
            "risk_category": risk_category,
        }


# Export service instance
portfolio_intelligence = PortfolioIntelligence()
