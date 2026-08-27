import React from 'react';
import { Wallet, ShieldAlert, Sparkles, AlertTriangle, CheckCircle2 } from 'lucide-react';

/**
 * TerminalFundsAndRails — Document 06 Screen 1
 * Displays virtual capital (₹10,00,000 baseline), margin utilization, and risk rails constraints.
 */
export default function TerminalFundsAndRails({
    availableCash = 1000000,
    utilisedMargin = 0,
    realisedPnl = 0,
    unrealisedPnl = 0,
    maxPositionSize = 200000,
    maxDailyLoss = 25000,
    stopLossEnforced = true,
}) {
    const netPnl = realisedPnl + unrealisedPnl;
    const isNetPositive = netPnl >= 0;
    const marginUsagePct = Math.min(100, Math.round((utilisedMargin / availableCash) * 100));

    return (
        <div className="space-y-4">
            {/* 1. Virtual Funds Summary */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                        <Wallet size={14} className="text-primary-600 dark:text-primary-400" />
                        <span>Virtual Capital Account</span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
                        SEBI Compliant Margin
                    </span>
                </div>

                {/* Capital & P&L Cards */}
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800">
                        <span className="text-[10px] text-slate-400 block">Available Margin</span>
                        <span className="font-extrabold text-slate-900 dark:text-white">
                            ₹{availableCash.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800">
                        <span className="text-[10px] text-slate-400 block">Net Session P&L</span>
                        <span className={`font-extrabold ${isNetPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {isNetPositive ? '+' : ''}₹{netPnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                    </div>
                </div>

                {/* Margin Utilisation Bar */}
                <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                        <span>Utilised Margin: ₹{utilisedMargin.toLocaleString('en-IN')}</span>
                        <span className="font-bold">{marginUsagePct}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all ${
                                marginUsagePct > 80 ? 'bg-rose-500' : marginUsagePct > 50 ? 'bg-amber-500' : 'bg-primary-500'
                            }`}
                            style={{ width: `${marginUsagePct}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* 2. Risk Discipline Rails Panel */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                        <ShieldAlert size={14} className="text-amber-600 dark:text-amber-400" />
                        <span>Exercise Risk Rails</span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 font-bold">
                        Enforced
                    </span>
                </div>

                <div className="space-y-2 text-[11px] font-mono">
                    <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800">
                        <span className="text-slate-500">Max Single Position:</span>
                        <span className="font-bold text-slate-900 dark:text-white">₹{maxPositionSize.toLocaleString('en-IN')}</span>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800">
                        <span className="text-slate-500">Max Daily Loss:</span>
                        <span className="font-bold text-slate-900 dark:text-white">₹{maxDailyLoss.toLocaleString('en-IN')}</span>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                        <span className="flex items-center gap-1">
                            <CheckCircle2 size={12} />
                            <span>Stop-Loss Mandate</span>
                        </span>
                        <span className="font-bold">Active</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
