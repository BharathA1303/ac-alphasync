import React, { useMemo } from 'react';
import { Layers, ShieldCheck, Cpu, ArrowUpDown } from 'lucide-react';

/**
 * DepthLadder — Document 06 Screen 1 (5-level Order Depth Book)
 * Displays Bid / Ask queues with DepthSourceBadge (LICENSED vs SYNTHETIC) and client-side ImpactCostIndicator.
 */
export default function DepthLadder({
    symbol = 'RELIANCE',
    ltp = 1313.10,
    source = 'LICENSED', // 'LICENSED' | 'SYNTHETIC'
    standardOrderVal = 100000,
}) {
    // Generate realistic 5-level book around LTP
    const ladder = useMemo(() => {
        const spread = Math.max(0.05, Number((ltp * 0.0003).toFixed(2)));
        const bestBid = Number((ltp - spread / 2).toFixed(2));
        const bestAsk = Number((ltp + spread / 2).toFixed(2));

        const bids = [
            { orders: 42, qty: 1250, price: bestBid },
            { orders: 28, qty: 2100, price: Number((bestBid - 0.05).toFixed(2)) },
            { orders: 19, qty: 3450, price: Number((bestBid - 0.10).toFixed(2)) },
            { orders: 15, qty: 1800, price: Number((bestBid - 0.15).toFixed(2)) },
            { orders: 33, qty: 5200, price: Number((bestBid - 0.20).toFixed(2)) },
        ];

        const asks = [
            { orders: 38, qty: 950, price: bestAsk },
            { orders: 45, qty: 1850, price: Number((bestAsk + 0.05).toFixed(2)) },
            { orders: 22, qty: 2900, price: Number((bestAsk + 0.10).toFixed(2)) },
            { orders: 17, qty: 4100, price: Number((bestAsk + 0.15).toFixed(2)) },
            { orders: 29, qty: 3300, price: Number((bestAsk + 0.20).toFixed(2)) },
        ];

        const totalBidQty = bids.reduce((acc, b) => acc + b.qty, 0);
        const totalAskQty = asks.reduce((acc, a) => acc + a.qty, 0);
        const maxQty = Math.max(...bids.map((b) => b.qty), ...asks.map((a) => a.qty));

        // Impact cost formula (MKT-004): slippage cost for executing ₹1,00,000 against best quotes
        const requiredShares = Math.ceil(standardOrderVal / ltp);
        let executedVal = 0;
        let weightedPrice = 0;
        let remaining = requiredShares;

        for (const ask of asks) {
            const take = Math.min(remaining, ask.qty);
            executedVal += take * ask.price;
            remaining -= take;
            if (remaining <= 0) break;
        }

        const avgExecutionPrice = executedVal / requiredShares;
        const idealPrice = (bestBid + bestAsk) / 2;
        const impactCostPct = Math.max(0.01, ((avgExecutionPrice - idealPrice) / idealPrice) * 100);

        return { bids, asks, totalBidQty, totalAskQty, maxQty, impactCostPct: impactCostPct.toFixed(2) };
    }, [ltp, standardOrderVal]);

    const bidRatio = Math.round((ladder.totalBidQty / (ladder.totalBidQty + ladder.totalAskQty)) * 100);

    return (
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            {/* Header with DepthSourceBadge */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                    <Layers size={14} className="text-primary-600 dark:text-primary-400" />
                    <span>Market Depth (5-Level)</span>
                </div>

                {/* DepthSourceBadge — Document 06 Screen 1 */}
                <span
                    className={`text-[9px] font-mono font-extrabold uppercase px-2 py-0.5 rounded-full flex items-center gap-1 ${
                        source === 'LICENSED'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                            : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'
                    }`}
                >
                    {source === 'LICENSED' ? (
                        <>
                            <ShieldCheck size={10} />
                            <span>LICENSED FEED</span>
                        </>
                    ) : (
                        <>
                            <Cpu size={10} />
                            <span>SYNTHETIC LADDER</span>
                        </>
                    )}
                </span>
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-2 text-[10px] font-mono text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-1">
                <div className="flex justify-between pr-2">
                    <span>Qty</span>
                    <span>Bid</span>
                </div>
                <div className="flex justify-between pl-2">
                    <span>Ask</span>
                    <span>Qty</span>
                </div>
            </div>

            {/* Ladder rows */}
            <div className="space-y-1 text-[11px] font-mono">
                {ladder.bids.map((bid, i) => {
                    const ask = ladder.asks[i];
                    const bidBarWidth = `${(bid.qty / ladder.maxQty) * 100}%`;
                    const askBarWidth = `${(ask.qty / ladder.maxQty) * 100}%`;

                    return (
                        <div key={i} className="grid grid-cols-2 gap-1 relative">
                            {/* Bid side */}
                            <div className="flex items-center justify-between pr-2 py-0.5 relative overflow-hidden rounded bg-emerald-500/[0.04]">
                                <div
                                    className="absolute right-0 top-0 bottom-0 bg-emerald-500/10 transition-all pointer-events-none"
                                    style={{ width: bidBarWidth }}
                                />
                                <span className="text-slate-600 dark:text-slate-400 z-10">{bid.qty}</span>
                                <span className="font-bold text-emerald-600 dark:text-emerald-400 z-10">
                                    {bid.price.toFixed(2)}
                                </span>
                            </div>

                            {/* Ask side */}
                            <div className="flex items-center justify-between pl-2 py-0.5 relative overflow-hidden rounded bg-rose-500/[0.04]">
                                <div
                                    className="absolute left-0 top-0 bottom-0 bg-rose-500/10 transition-all pointer-events-none"
                                    style={{ width: askBarWidth }}
                                />
                                <span className="font-bold text-rose-600 dark:text-rose-400 z-10">
                                    {ask.price.toFixed(2)}
                                </span>
                                <span className="text-slate-600 dark:text-slate-400 z-10">{ask.qty}</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Total Bid vs Ask ratio bar */}
            <div className="space-y-1 pt-1 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                        {ladder.totalBidQty.toLocaleString()} ({bidRatio}%)
                    </span>
                    <span className="text-rose-600 dark:text-rose-400 font-bold">
                        {ladder.totalAskQty.toLocaleString()} ({100 - bidRatio}%)
                    </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-rose-500/20 overflow-hidden flex">
                    <div
                        className="h-full bg-emerald-500 transition-all duration-300"
                        style={{ width: `${bidRatio}%` }}
                    />
                </div>
            </div>

            {/* ImpactCostIndicator — Document 06 Screen 1 */}
            <div className="px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between text-[10px] font-mono">
                <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <ArrowUpDown size={11} className="text-primary-500" />
                    <span>Impact cost (₹1L):</span>
                </span>
                <span className="font-bold text-slate-900 dark:text-white">
                    {ladder.impactCostPct}% <span className="text-slate-400 font-normal">slippage</span>
                </span>
            </div>
        </div>
    );
}
