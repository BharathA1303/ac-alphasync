import React, { useState } from 'react';
import { Search, TrendingUp, TrendingDown, Plus, Sparkles } from 'lucide-react';

const DEFAULT_SYMBOLS = [
    { symbol: 'RELIANCE', name: 'Reliance Industries Ltd.', ltp: 1313.10, change: -1.20, changePct: -0.09, segment: 'EQ' },
    { symbol: 'TCS', name: 'Tata Consultancy Services', ltp: 4180.50, change: 35.80, changePct: 0.86, segment: 'EQ' },
    { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd.', ltp: 1642.30, change: -12.40, changePct: -0.75, segment: 'EQ' },
    { symbol: 'INFY', name: 'Infosys Ltd.', ltp: 1820.75, change: 24.10, changePct: 1.34, segment: 'EQ' },
    { symbol: 'ICICIBANK', name: 'ICICI Bank Ltd.', ltp: 1245.90, change: 8.30, changePct: 0.67, segment: 'EQ' },
    { symbol: 'SBIN', name: 'State Bank of India', ltp: 814.20, change: -4.50, changePct: -0.55, segment: 'EQ' },
    { symbol: 'NIFTY 50', name: 'Nifty 50 Index', ltp: 24850.30, change: 110.20, changePct: 0.45, segment: 'INDX' },
    { symbol: 'BANKNIFTY', name: 'Nifty Bank Index', ltp: 51240.80, change: -180.40, changePct: -0.35, segment: 'INDX' },
];

/**
 * TerminalWatchlist — Document 06 Screen 1
 * 236px Watchlist with explicit +/- and ▲/▼ geometric indicators (NFR-08).
 */
export default function TerminalWatchlist({
    selectedSymbol = 'RELIANCE',
    onSelectSymbol,
    watchlist = DEFAULT_SYMBOLS,
}) {
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('ALL');

    const filteredList = (watchlist.length > 0 ? watchlist : DEFAULT_SYMBOLS).filter((item) => {
        const matchesSearch =
            item.symbol.toLowerCase().includes(search.toLowerCase()) ||
            (item.name && item.name.toLowerCase().includes(search.toLowerCase()));
        const matchesFilter =
            filter === 'ALL' ||
            (filter === 'INDX' ? item.segment === 'INDX' : item.segment !== 'INDX');
        return matchesSearch && matchesFilter;
    });

    return (
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                    <TrendingUp size={14} className="text-primary-600 dark:text-primary-400" />
                    <span>Watchlist</span>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                    {filteredList.length} symbols
                </span>
            </div>

            {/* Search Input */}
            <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search stock or index..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-primary-500 transition-colors font-mono"
                />
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 p-0.5 rounded-xl bg-slate-100 dark:bg-slate-900/80">
                {['ALL', 'EQUITY', 'INDX'].map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        onClick={() => setFilter(tab)}
                        className={`flex-1 py-1 text-[10px] font-mono font-bold rounded-lg transition-all ${
                            filter === tab
                                ? 'bg-white dark:bg-[#111827] text-primary-600 dark:text-primary-400 shadow-sm'
                                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* List */}
            <div className="space-y-1 max-h-[260px] overflow-y-auto pr-0.5">
                {filteredList.map((item) => {
                    const isSelected = item.symbol === selectedSymbol;
                    const isPositive = item.change >= 0;

                    return (
                        <div
                            key={item.symbol}
                            onClick={() => onSelectSymbol && onSelectSymbol(item)}
                            className={`group flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                                isSelected
                                    ? 'bg-primary-500/10 border-primary-500/40 shadow-sm'
                                    : 'bg-slate-50/70 dark:bg-slate-900/40 border-transparent hover:border-slate-200 dark:hover:border-slate-800'
                            }`}
                        >
                            <div className="min-w-0 pr-2">
                                <div className="flex items-center gap-1.5">
                                    <span className="font-mono text-xs font-bold text-slate-900 dark:text-white truncate">
                                        {item.symbol}
                                    </span>
                                    <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-slate-200/60 dark:bg-slate-800 text-slate-500">
                                        {item.segment}
                                    </span>
                                </div>
                                <div className="text-[10px] text-slate-400 truncate">
                                    {item.name}
                                </div>
                            </div>

                            <div className="text-right font-mono flex-shrink-0">
                                <div className="text-xs font-extrabold text-slate-900 dark:text-white">
                                    ₹{item.ltp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </div>
                                {/* NFR-08 Compliance: explicit + / - sign and geometric triangle */}
                                <div
                                    className={`text-[10px] font-bold flex items-center justify-end gap-0.5 ${
                                        isPositive
                                            ? 'text-emerald-600 dark:text-emerald-400'
                                            : 'text-rose-600 dark:text-rose-400'
                                    }`}
                                >
                                    <span>{isPositive ? '▲ +' : '▼ '}</span>
                                    <span>{Math.abs(item.change).toFixed(2)}</span>
                                    <span>({isPositive ? '+' : ''}{item.changePct.toFixed(2)}%)</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
