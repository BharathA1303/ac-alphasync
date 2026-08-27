import React, { useMemo } from 'react';
import { FileText, HelpCircle, ArrowRight, ShieldCheck } from 'lucide-react';

/**
 * ContractNotePanel — Document 06 §3.1 & Screen 1
 * Pedagogical Indian fee decomposition that breaks down all statutory charges.
 * Never collapses to a single "charges" figure.
 */
export default function ContractNotePanel({
    symbol = 'RELIANCE',
    side = 'BUY',
    quantity = 50,
    price = 1313.10,
    productType = 'CNC', // 'CNC' | 'MIS'
}) {
    const calculation = useMemo(() => {
        const turnover = quantity * price;

        // 1. Brokerage (₹20 or 0.03% whichever is lower per order)
        const rawBrokerage = productType === 'CNC' ? 0 : Math.min(20, turnover * 0.0003);
        const brokerage = Number(rawBrokerage.toFixed(2));

        // 2. STT / CTT (0.1% on delivery buy/sell, 0.025% on intraday sell)
        let stt = 0;
        if (productType === 'CNC') {
            stt = Math.round(turnover * 0.001); // 0.1% delivery
        } else if (side === 'SELL') {
            stt = Math.round(turnover * 0.00025); // 0.025% intraday sell
        }

        // 3. Exchange Turnover Charge (NSE: 0.00297%)
        const exchangeTurnover = Number((turnover * 0.0000297).toFixed(2));

        // 4. SEBI Turnover Fee (₹10 per crore = 0.0001%)
        const sebiFee = Number((turnover * 0.000001).toFixed(2));

        // 5. Stamp Duty (0.015% on Buy orders only)
        const stampDuty = side === 'BUY' ? Math.round(turnover * 0.00015) : 0;

        // 6. GST (18% on Brokerage + Exchange Charge + SEBI Fee)
        const gstBase = brokerage + exchangeTurnover + sebiFee;
        const gst = Number((gstBase * 0.18).toFixed(2));

        // Total Regulatory Friction
        const totalCharges = Number((brokerage + stt + exchangeTurnover + sebiFee + stampDuty + gst).toFixed(2));

        // Break-even price and bps calculation
        const perShareCost = totalCharges / (quantity || 1);
        const breakEvenPrice = Number((price + (side === 'BUY' ? perShareCost : -perShareCost)).toFixed(2));
        const breakEvenBps = turnover > 0 ? Number(((totalCharges / turnover) * 10000).toFixed(1)) : 0;

        return {
            turnover,
            brokerage,
            stt,
            exchangeTurnover,
            sebiFee,
            stampDuty,
            gst,
            totalCharges,
            breakEvenPrice,
            breakEvenBps,
        };
    }, [symbol, side, quantity, price, productType]);

    return (
        <div className="p-4 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-sm space-y-3.5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                    <FileText size={14} className="text-primary-600 dark:text-primary-400" />
                    <span>Contract Note Fee Decomposition</span>
                </div>
                <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold">
                    SEBI Prescribed Taxes
                </span>
            </div>

            {/* Turnover & Break-even Banner */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono">
                <div>
                    <span className="text-[10px] text-slate-400 block">Gross Turnover</span>
                    <span className="font-extrabold text-slate-900 dark:text-white">
                        ₹{calculation.turnover.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                </div>
                <div>
                    <span className="text-[10px] text-slate-400 block">Total Statutory Friction</span>
                    <span className="font-extrabold text-amber-600 dark:text-amber-400">
                        ₹{calculation.totalCharges.toFixed(2)}
                    </span>
                </div>
                <div>
                    <span className="text-[10px] text-slate-400 block">Break-even ({calculation.breakEvenBps} bps)</span>
                    <span className="font-extrabold text-primary-600 dark:text-primary-400">
                        ₹{calculation.breakEvenPrice.toFixed(2)}
                    </span>
                </div>
            </div>

            {/* Pedagogical 6-Fee Breakdown Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-[11px] font-mono">
                <div className="p-2 rounded-xl bg-slate-50/70 dark:bg-slate-900/30 border border-slate-200/60 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400">Brokerage</div>
                    <div className="font-bold text-slate-900 dark:text-white">₹{calculation.brokerage.toFixed(2)}</div>
                </div>

                <div className="p-2 rounded-xl bg-slate-50/70 dark:bg-slate-900/30 border border-slate-200/60 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400">STT / CTT</div>
                    <div className="font-bold text-slate-900 dark:text-white">₹{calculation.stt.toFixed(2)}</div>
                </div>

                <div className="p-2 rounded-xl bg-slate-50/70 dark:bg-slate-900/30 border border-slate-200/60 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400">Exchange Charges</div>
                    <div className="font-bold text-slate-900 dark:text-white">₹{calculation.exchangeTurnover.toFixed(2)}</div>
                </div>

                <div className="p-2 rounded-xl bg-slate-50/70 dark:bg-slate-900/30 border border-slate-200/60 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400">SEBI Turnover Fee</div>
                    <div className="font-bold text-slate-900 dark:text-white">₹{calculation.sebiFee.toFixed(2)}</div>
                </div>

                <div className="p-2 rounded-xl bg-slate-50/70 dark:bg-slate-900/30 border border-slate-200/60 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400">Stamp Duty</div>
                    <div className="font-bold text-slate-900 dark:text-white">₹{calculation.stampDuty.toFixed(2)}</div>
                </div>

                <div className="p-2 rounded-xl bg-slate-50/70 dark:bg-slate-900/30 border border-slate-200/60 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400">GST (18%)</div>
                    <div className="font-bold text-slate-900 dark:text-white">₹{calculation.gst.toFixed(2)}</div>
                </div>
            </div>
        </div>
    );
}
