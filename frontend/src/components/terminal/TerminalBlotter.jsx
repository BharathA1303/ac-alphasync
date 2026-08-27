import React, { useState } from 'react';
import { Briefcase, ListOrdered, CheckCheck, BookOpen, XCircle, ArrowRight, Trash2 } from 'lucide-react';

/**
 * TerminalBlotter — Document 06 Screen 1
 * Center workspace blotter with tabs: Positions, Orders, Trades, and Ledger.
 */
export default function TerminalBlotter({
    positions = [],
    orders = [],
    trades = [],
    onClosePosition,
    onCancelOrder,
}) {
    const [activeTab, setActiveTab] = useState('positions');

    return (
        <div className="p-4 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            {/* Tab Navigation */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                <div className="flex items-center gap-1">
                    {[
                        { key: 'positions', label: `Positions (${positions.length})`, icon: Briefcase },
                        { key: 'orders', label: `Orders (${orders.length})`, icon: ListOrdered },
                        { key: 'trades', label: `Trades (${trades.length})`, icon: CheckCheck },
                        { key: 'ledger', label: 'Ledger', icon: BookOpen },
                    ].map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.key;
                        return (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setActiveTab(tab.key)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-xs font-bold transition-all ${
                                    isActive
                                        ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400'
                                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                }`}
                            >
                                <Icon size={13} />
                                <span>{tab.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Content Area */}
            <div className="overflow-x-auto min-h-[140px]">
                {activeTab === 'positions' && (
                    positions.length === 0 ? (
                        <div className="py-8 text-center text-xs text-slate-400 font-mono">
                            No open virtual positions. Place an order above to execute.
                        </div>
                    ) : (
                        <table className="w-full text-left text-xs font-mono">
                            <thead>
                                <tr className="text-[10px] text-slate-400 border-b border-slate-100 dark:border-slate-800">
                                    <th className="pb-2">Product</th>
                                    <th className="pb-2">Symbol</th>
                                    <th className="pb-2 text-right">Net Qty</th>
                                    <th className="pb-2 text-right">Avg Cost</th>
                                    <th className="pb-2 text-right">LTP</th>
                                    <th className="pb-2 text-right">P&L</th>
                                    <th className="pb-2 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                {positions.map((pos, idx) => {
                                    const pnl = (pos.ltp - pos.avgPrice) * pos.quantity;
                                    const isPos = pnl >= 0;
                                    return (
                                        <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                                            <td className="py-2.5">
                                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                                    {pos.product || 'CNC'}
                                                </span>
                                            </td>
                                            <td className="py-2.5 font-bold text-slate-900 dark:text-white">
                                                {pos.symbol}
                                            </td>
                                            <td className="py-2.5 text-right text-slate-800 dark:text-slate-200">
                                                {pos.quantity}
                                            </td>
                                            <td className="py-2.5 text-right text-slate-800 dark:text-slate-200">
                                                ₹{pos.avgPrice.toFixed(2)}
                                            </td>
                                            <td className="py-2.5 text-right font-bold text-slate-900 dark:text-white">
                                                ₹{pos.ltp.toFixed(2)}
                                            </td>
                                            <td className={`py-2.5 text-right font-extrabold ${
                                                isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                                            }`}>
                                                {isPos ? '+' : ''}₹{pnl.toFixed(2)}
                                            </td>
                                            <td className="py-2.5 text-right">
                                                <button
                                                    type="button"
                                                    onClick={() => onClosePosition && onClosePosition(pos)}
                                                    className="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-[10px] font-bold transition-colors"
                                                >
                                                    Exit Position
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )
                )}

                {activeTab === 'orders' && (
                    orders.length === 0 ? (
                        <div className="py-8 text-center text-xs text-slate-400 font-mono">
                            No pending virtual orders.
                        </div>
                    ) : (
                        <table className="w-full text-left text-xs font-mono">
                            <thead>
                                <tr className="text-[10px] text-slate-400 border-b border-slate-100 dark:border-slate-800">
                                    <th className="pb-2">Side</th>
                                    <th className="pb-2">Symbol</th>
                                    <th className="pb-2">Type</th>
                                    <th className="pb-2 text-right">Qty</th>
                                    <th className="pb-2 text-right">Limit Price</th>
                                    <th className="pb-2">Status</th>
                                    <th className="pb-2 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                {orders.map((ord, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                                        <td className="py-2.5">
                                            <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded ${
                                                ord.side === 'BUY' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'
                                            }`}>
                                                {ord.side}
                                            </span>
                                        </td>
                                        <td className="py-2.5 font-bold text-slate-900 dark:text-white">{ord.symbol}</td>
                                        <td className="py-2.5 text-slate-500">{ord.order_type || 'MARKET'}</td>
                                        <td className="py-2.5 text-right">{ord.quantity}</td>
                                        <td className="py-2.5 text-right">₹{Number(ord.price || 0).toFixed(2)}</td>
                                        <td className="py-2.5">
                                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 font-bold">
                                                {ord.status || 'OPEN'}
                                            </span>
                                        </td>
                                        <td className="py-2.5 text-right">
                                            <button
                                                type="button"
                                                onClick={() => onCancelOrder && onCancelOrder(ord)}
                                                className="px-2 py-1 rounded-lg bg-slate-200/60 dark:bg-slate-800 hover:bg-rose-500/20 hover:text-rose-600 text-slate-600 dark:text-slate-400 text-[10px] font-bold transition-colors"
                                            >
                                                Cancel
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )
                )}

                {activeTab === 'trades' && (
                    trades.length === 0 ? (
                        <div className="py-8 text-center text-xs text-slate-400 font-mono">
                            No trades executed in this session.
                        </div>
                    ) : (
                        <table className="w-full text-left text-xs font-mono">
                            <thead>
                                <tr className="text-[10px] text-slate-400 border-b border-slate-100 dark:border-slate-800">
                                    <th className="pb-2">Time</th>
                                    <th className="pb-2">Side</th>
                                    <th className="pb-2">Symbol</th>
                                    <th className="pb-2 text-right">Filled Qty</th>
                                    <th className="pb-2 text-right">Executed Price</th>
                                    <th className="pb-2 text-right">Charges</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                {trades.map((t, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                                        <td className="py-2.5 text-slate-500">{t.time || '10:14 IST'}</td>
                                        <td className="py-2.5 font-bold text-emerald-600">{t.side}</td>
                                        <td className="py-2.5 font-bold text-slate-900 dark:text-white">{t.symbol}</td>
                                        <td className="py-2.5 text-right">{t.quantity}</td>
                                        <td className="py-2.5 text-right font-bold">₹{Number(t.price).toFixed(2)}</td>
                                        <td className="py-2.5 text-right text-slate-500">₹{Number(t.charges || 23.40).toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )
                )}

                {activeTab === 'ledger' && (
                    <div className="py-4 space-y-2 font-mono text-xs text-slate-600 dark:text-slate-300">
                        <div className="flex justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/40">
                            <span>Starting Virtual Simulation Capital</span>
                            <span className="font-bold text-slate-900 dark:text-white">₹10,00,000.00</span>
                        </div>
                        <div className="flex justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/40">
                            <span>SEBI Statutory Deductions &amp; Charges</span>
                            <span className="font-bold text-amber-600">₹0.00</span>
                        </div>
                        <div className="flex justify-between p-2.5 rounded-xl bg-primary-500/10 text-primary-600 dark:text-primary-400 font-bold">
                            <span>Current Net Available Margin</span>
                            <span>₹10,00,000.00</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
