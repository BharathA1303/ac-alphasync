# Professional Trader's Proposal: Futures Workspace Upgrades

This document outlines key technical and visual upgrades to elevate the **Futures Page** from a retail interface to a terminal-grade workspace optimized for high-frequency trading, order flow analysis, and risk management.

---

## 1. High-Performance Execution (UI & Backend)

Professional futures traders prioritize execution speed above all else. Click-and-drag and multi-step modal forms are too slow for fast-moving markets.

### UI Upgrades
*   **Depth of Market (DOM) / Price Ladder**:
    *   An interactive, vertical ladder showing the bid/ask sizes at individual price levels.
    *   Allows traders to place Limit and Stop orders with a single click at the desired price step, and drag-and-drop active orders on the ladder to modify prices.
*   **Chart Trading (Direct Visual Control)**:
    *   Visual horizontal lines on the chart indicating active orders and average entry price.
    *   Drag-and-drop lines to adjust Limit/Stop orders directly on the price chart.
*   **Workspace Hotkeys**:
    *   Standardizable keyboard triggers (e.g., `Shift + B` to Buy Market, `Shift + S` to Sell Market, `Ctrl + C` to cancel all pending orders for the selected contract).

### Backend Upgrades
*   **Bracket Orders (OCO - One-Cancels-Other)**:
    *   Support for entering entry order + profit target + stop-loss simultaneously.
    *   The engine must group these orders in memory/DB. If the profit target fills, the stop-loss order is immediately cancelled via WebSocket callback.
*   **Auto-Trailing Stop Engine**:
    *   A backend worker tracking the LTP and updating the stop-loss trigger price dynamically in the DB once price moves in favor of the trade by a set tick distance.

---

## 2. Order Flow & Volume Analytics (UI & Backend)

Standard candlestick charts only show Open, High, Low, and Close. Professional traders look inside the candles to see the auction process.

```
┌───────────────────────────────────────────────┐
│              Order Flow Delta                 │
├─────────┬──────────────────────┬──────────────┤
│ Price   │ Aggressive Sellers   │ Bid/Ask Size │
├─────────┼──────────────────────┼──────────────┤
│ 24470.0 │ CE Buying Pressure   │   12.4K      │
│ 24465.0 │ PE Selling Pressure  │    8.2K      │
└─────────┴──────────────────────┴──────────────┘
```

### UI Upgrades
*   **Footprint Charts (Bid/Ask Volume at Price)**:
    *   Candlestick charts that display horizontal volume distributions inside each bar, splitting volume into buy-side (at-ask) and sell-side (at-bid).
*   **Cumulative Delta Indicator**:
    *   An indicator showing the net difference between buying and selling volume to detect institutional absorption vs. retail exhaustion.
*   **Volume Profile (Point of Control)**:
    *   Horizontal volume histogram overlay highlighting the **Point of Control (POC)** (the price level with the highest traded volume during the session).

### Backend Upgrades
*   **Order Book Delta Calculator**:
    *   A real-time parser of the Zebu live level-2 feed (5 bid/ask levels depth) that aggregates changes in depth to build cumulative volume delta indicators.

---

## 3. Advanced Derivatives Intelligence

Currently, the workspace calculates Spot vs. Future Premium/Basis as static numeric fields. We can leverage these numbers for structural trading.

### UI Upgrades
*   **Historical Basis Chart**:
    *   A secondary sub-chart plotting the Basis (Future LTP - Spot LTP) over time. Sudden drops/spikes indicate arbitrage opportunities or market sentiment extremes.
*   **Calendar Spread Matrix**:
    *   A dedicated grid showing the pricing differences (Spreads) between Near vs. Mid and Near vs. Far contracts.
    *   Direct click on a calendar spread to load a spread order entry panel (simultaneously buying Near and selling Mid).

### Backend Upgrades
*   **Basis Deviation Alerts**:
    *   Backend threshold checker alerting the client if the basis spread exceeds normal standard deviation limits.

---

## 4. Institutional Risk & Position Controls

Derivatives leverage requires tight, fail-safe risk parameters.

### UI Upgrades
*   **Emergency Panic Button ("Flatten All & Cancel")**:
    *   A prominent red header button that instantly closes all open positions and deletes all pending limit/stop orders.
*   **Dynamic Margin & Leverage Calculator**:
    *   Displays real-time margin utilization as position sizing is adjusted in the order panel, alerting the trader if the position exceeds account leverage limits.

### Backend Upgrades
*   **Risk Engine Interceptor**:
    *   A backend middleware checking every virtual/paper order against account margins, daily loss limits, and maximum drawdown limits before forwarding it to the order book database.
