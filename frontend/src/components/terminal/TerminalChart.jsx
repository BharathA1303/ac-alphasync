import React, { useState, useEffect, useMemo } from 'react';
import { BarChart3, Maximize2, RefreshCw, Layers, ShieldCheck, ArrowUpRight } from 'lucide-react';

/**
 * TerminalChart — Document 06 Screen 1 Center Workspace
 * High-performance interactive Candlestick Replay Chart with timeframe selection, volume bars, and execution markers.
 */
export default function TerminalChart({
    symbol = 'RELIANCE',
    ltp = 1313.10,
    change = -1.20,
    changePct = -0.09,
    executionPrice = null,
    stopLossPrice = null,
}) {
    const [interval, setInterval] = useState('5m');
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Generate historical candlestick simulation data
    const candles = useMemo(() => {
        const data = [];
        let base = ltp - 15;
        const total = 48;
        const now = Date.now();

        for (let i = total; i >= 0; i--) {
            const time = new Date(now - i * 5 * 60000);
            const timeLabel = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
            const volatility = (Math.random() - 0.48) * 4;
            const open = Number((base + (Math.random() - 0.5) * 2).toFixed(2));
            const close = Number((open + volatility).toFixed(2));
            const high = Number((Math.max(open, close) + Math.random() * 2).toFixed(2));
            const low = Number((Math.min(open, close) - Math.random() * 2).toFixed(2));
            const volume = Math.floor(Math.random() * 12000 + 1500);

            data.push({ timeLabel, open, high, low, close, volume, isGreen: close >= open });
            base = close;
        }
        return data;
    }, [symbol, interval]);

    const minPrice = Math.min(...candles.map((c) => c.low));
    const maxPrice = Math.max(...candles.map((c) => c.high));
    const priceRange = maxPrice - minPrice || 1;
    const maxVolume = Math.max(...candles.map((c) => c.volume));

    const isPositive = change >= 0;

    return (
        <div className="p-4 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-3 min-h-[380px]">
            {/* Chart Header Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-base font-extrabold text-slate-900 dark:text-white">
                                {symbol}
                            </span>
                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                                NSE · EQUITY
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 font-mono">
                        <span className="text-base font-extrabold text-slate-900 dark:text-white">
                            ₹{ltp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                        <span
                            className={`text-xs font-bold ${
                                isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                            }`}
                        >
                            {isPositive ? '▲ +' : '▼ '}{Math.abs(change).toFixed(2)} ({isPositive ? '+' : ''}{changePct.toFixed(2)}%)
                        </span>
                    </div>
                </div>

                {/* Timeframe Selectors */}
                <div className="flex items-center gap-1 p-0.5 rounded-xl bg-slate-100 dark:bg-slate-900/80">
                    {['1m', '5m', '15m', '1D'].map((tf) => (
                        <button
                            key={tf}
                            type="button"
                            onClick={() => setInterval(tf)}
                            className={`px-2.5 py-1 text-[11px] font-mono font-bold rounded-lg transition-all ${
                                interval === tf
                                    ? 'bg-white dark:bg-[#111827] text-primary-600 dark:text-primary-400 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                            }`}
                        >
                            {tf}
                        </button>
                    ))}
                </div>
            </div>

            {/* Simulated High-Resolution Chart Viewport */}
            <div className="relative flex-1 min-h-[260px] bg-slate-50/50 dark:bg-slate-950/40 rounded-xl p-3 flex flex-col justify-between overflow-hidden border border-slate-100 dark:border-slate-800/80">
                {/* Horizontal Grid lines */}
                <div className="absolute inset-0 flex flex-col justify-between p-3 pointer-events-none opacity-30">
                    <div className="border-b border-dashed border-slate-300 dark:border-slate-700 w-full flex justify-end text-[9px] font-mono text-slate-400">
                        ₹{maxPrice.toFixed(2)}
                    </div>
                    <div className="border-b border-dashed border-slate-300 dark:border-slate-700 w-full flex justify-end text-[9px] font-mono text-slate-400">
                        ₹{((maxPrice + minPrice) / 2).toFixed(2)}
                    </div>
                    <div className="border-b border-dashed border-slate-300 dark:border-slate-700 w-full flex justify-end text-[9px] font-mono text-slate-400">
                        ₹{minPrice.toFixed(2)}
                    </div>
                </div>

                {/* Execution / SL Price Lines */}
                {executionPrice && (
                    <div
                        className="absolute left-0 right-0 border-t-2 border-emerald-500 z-10 flex items-center justify-between px-2 text-[9px] font-mono font-bold text-emerald-600 bg-emerald-500/10"
                        style={{
                            top: `${Math.max(5, Math.min(95, 100 - ((executionPrice - minPrice) / priceRange) * 100))}%`,
                        }}
                    >
                        <span>ENTRY FILL: ₹{executionPrice.toFixed(2)}</span>
                        <span>BUY MARKER</span>
                    </div>
                )}

                {stopLossPrice && (
                    <div
                        className="absolute left-0 right-0 border-t-2 border-dashed border-rose-500 z-10 flex items-center justify-between px-2 text-[9px] font-mono font-bold text-rose-600 bg-rose-500/10"
                        style={{
                            top: `${Math.max(5, Math.min(95, 100 - ((stopLossPrice - minPrice) / priceRange) * 100))}%`,
                        }}
                    >
                        <span>SL TRIGGER: ₹{stopLossPrice.toFixed(2)}</span>
                        <span>DISCIPLINE RAIL</span>
                    </div>
                )}

                {/* Candlesticks + Volume Bars */}
                <div className="relative flex-1 flex items-end gap-1.5 z-0 pt-4 pb-8">
                    {candles.map((c, i) => {
                        const candleHeight = Math.max(3, ((c.high - c.low) / priceRange) * 160);
                        const bodyHeight = Math.max(2, (Math.abs(c.close - c.open) / priceRange) * 160);
                        const bodyBottom = ((Math.min(c.open, c.close) - minPrice) / priceRange) * 160;
                        const wickBottom = ((c.low - minPrice) / priceRange) * 160;
                        const volHeight = Math.max(2, (c.volume / maxVolume) * 40);

                        return (
                            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full relative group">
                                {/* Wick */}
                                <div
                                    className={`absolute w-0.5 ${c.isGreen ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                    style={{ height: `${candleHeight}px`, bottom: `${wickBottom + 45}px` }}
                                />
                                {/* Candle body */}
                                <div
                                    className={`w-full max-w-[8px] rounded-xs z-10 ${
                                        c.isGreen ? 'bg-emerald-500' : 'bg-rose-500'
                                    }`}
                                    style={{ height: `${bodyHeight}px`, marginBottom: `${bodyBottom + 45}px` }}
                                />
                                {/* Volume bar */}
                                <div
                                    className={`w-full max-w-[8px] rounded-t-xs opacity-40 ${
                                        c.isGreen ? 'bg-emerald-500' : 'bg-rose-500'
                                    }`}
                                    style={{ height: `${volHeight}px` }}
                                />
                            </div>
                        );
                    })}
                </div>

                {/* Bottom Time Axis */}
                <div className="flex justify-between items-center text-[9px] font-mono text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-800">
                    <span>{candles[0]?.timeLabel}</span>
                    <span>{candles[Math.floor(candles.length / 2)]?.timeLabel}</span>
                    <span className="font-bold text-primary-600 dark:text-primary-400">{candles[candles.length - 1]?.timeLabel} (LIVE)</span>
                </div>
            </div>
        </div>
    );
}
