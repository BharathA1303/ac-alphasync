import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { cn } from '../utils/cn';
import { pnlColorClass, cleanSymbol } from '../utils/formatters';
import {
    Zap, Play, Pause, Plus, X, Pencil, Trash2, Clock,
    MoreVertical, TrendingUp, TrendingDown, BarChart2,
    Activity, Target, Shield, ChevronRight, Upload, Layers,
    Sliders, Copy, RefreshCw, AlertTriangle, CheckCircle2,
    DollarSign, Sparkles, Filter, Settings, Award, Search
} from 'lucide-react';

// ── Strategy Type Definitions ─────────────────────────────────────────────────────
const STRATEGY_TYPES = [
    { value: 'SMA_CROSSOVER', label: 'SMA Crossover', desc: 'Golden/death cross + RSI zone + MACD momentum + volume confirmation' },
    { value: 'RSI', label: 'RSI Strategy', desc: 'Oversold/overbought bounce + EMA trend filter + MACD turning + volume surge' },
    { value: 'MACD', label: 'MACD Signal', desc: 'Signal crossover + histogram momentum + RSI zone + zero-line strength' },
    { value: 'BOLLINGER', label: 'Bollinger Bands', desc: 'Band touch + RSI divergence + trend filter (no falling knives) + volume spike' },
    { value: 'EMA_CROSSOVER', label: 'EMA Crossover', desc: 'Fast/slow EMA cross + MACD alignment + RSI confirmation + volume surge' },
    { value: 'VWAP_BOUNCE', label: 'VWAP Bounce', desc: 'VWAP support/resistance bounce + RSI + MACD + volume — best for intraday' },
    { value: 'SUPERTREND', label: 'Supertrend Pullback', desc: 'ATR channel reclaim/reject + EMA trend filter + momentum confirmation' },
    { value: 'ATR_BREAKOUT', label: 'ATR Breakout', desc: 'Breakout beyond ATR-adjusted range with volume expansion confirmation' },
    { value: 'STOCHASTIC_REVERSION', label: 'Stochastic Reversion', desc: 'K/D turn from oversold or overbought zones with momentum filter' },
    { value: 'COMPOSITE', label: 'Multi-Strategy Composite', desc: 'Combine multiple indicator rules with ALL (AND) or ANY (OR) confluence logic' },
    { value: 'MOMENTUM_BREAKOUT', label: '⚡ Momentum Breakout', desc: 'N-bar high/low breakout + RSI momentum + volume surge — powerful intraday strategy', badge: 'NEW' },
    { value: 'MEAN_REVERSION_BB', label: '🔄 Mean Reversion BB', desc: 'BB band touch + ADX ranging filter (only in sideways markets) + RSI divergence', badge: 'NEW' },
    { value: 'TREND_STRENGTH_ADX', label: '📈 ADX Trend Strength', desc: 'ADX-gated trend following — only fires when ADX > 25 confirms a strong trend', badge: 'NEW' },
];

const STRATEGY_PARAMS = {
    SMA_CROSSOVER: [
        { key: 'short_period', label: 'Short SMA', type: 'number', default: 10, min: 2, max: 100, hint: 'Fast moving average period' },
        { key: 'long_period', label: 'Long SMA', type: 'number', default: 20, min: 5, max: 200, hint: 'Slow moving average period' },
    ],
    RSI: [
        { key: 'period', label: 'RSI Period', type: 'number', default: 14, min: 2, max: 50, hint: 'Lookback period for RSI' },
        { key: 'oversold', label: 'Oversold', type: 'number', default: 30, min: 10, max: 45, hint: 'Buy below this RSI level' },
        { key: 'overbought', label: 'Overbought', type: 'number', default: 70, min: 55, max: 90, hint: 'Sell above this RSI level' },
    ],
    MACD: [
        { key: 'fast_period', label: 'Fast EMA', type: 'number', default: 12, min: 2, max: 50, hint: 'Fast EMA period' },
        { key: 'slow_period', label: 'Slow EMA', type: 'number', default: 26, min: 10, max: 100, hint: 'Slow EMA period' },
        { key: 'signal_period', label: 'Signal', type: 'number', default: 9, min: 2, max: 30, hint: 'Signal line smoothing' },
    ],
    BOLLINGER: [
        { key: 'period', label: 'BB Period', type: 'number', default: 20, min: 5, max: 50, hint: 'Moving average period' },
        { key: 'std_dev', label: 'Std Dev', type: 'number', step: 0.1, default: 2.0, min: 0.5, max: 4.0, hint: 'Band width multiplier' },
    ],
    EMA_CROSSOVER: [
        { key: 'fast_period', label: 'Fast EMA', type: 'number', default: 9, min: 2, max: 50, hint: 'Fast EMA period' },
        { key: 'slow_period', label: 'Slow EMA', type: 'number', default: 21, min: 5, max: 100, hint: 'Slow EMA period' },
    ],
    VWAP_BOUNCE: [
        { key: 'bounce_threshold', label: 'Bounce %', type: 'number', step: 0.1, default: 0.2, min: 0.1, max: 1.0, hint: 'Max distance from VWAP (%)' },
    ],
    SUPERTREND: [
        { key: 'atr_period', label: 'ATR Period', type: 'number', default: 10, min: 5, max: 50, hint: 'ATR lookback' },
        { key: 'multiplier', label: 'Multiplier', type: 'number', step: 0.1, default: 3.0, min: 1.0, max: 6.0, hint: 'ATR channel width' },
    ],
    ATR_BREAKOUT: [
        { key: 'period', label: 'ATR Period', type: 'number', default: 14, min: 5, max: 50, hint: 'ATR lookback period' },
        { key: 'breakout_multiplier', label: 'Breakout xATR', type: 'number', step: 0.1, default: 1.2, min: 0.5, max: 3.0, hint: 'Distance to confirm breakout' },
    ],
    STOCHASTIC_REVERSION: [
        { key: 'k_period', label: 'K Period', type: 'number', default: 14, min: 5, max: 30, hint: 'Fast stochastic lookback' },
        { key: 'd_period', label: 'D Smoothing', type: 'number', default: 3, min: 2, max: 10, hint: 'Signal smoothing period' },
        { key: 'oversold', label: 'Oversold', type: 'number', default: 20, min: 5, max: 40, hint: 'Buy when K exits zone' },
        { key: 'overbought', label: 'Overbought', type: 'number', default: 80, min: 60, max: 95, hint: 'Sell when K exits zone' },
    ],
    MOMENTUM_BREAKOUT: [
        { key: 'lookback_period', label: 'Lookback Bars', type: 'number', default: 20, min: 5, max: 60, hint: 'N-bar high/low breakout reference' },
        { key: 'volume_multiplier', label: 'Volume Surge', type: 'number', step: 0.1, default: 1.5, min: 1.0, max: 5.0, hint: 'Minimum volume multiple to confirm breakout' },
    ],
    MEAN_REVERSION_BB: [
        { key: 'period', label: 'BB Period', type: 'number', default: 20, min: 5, max: 50, hint: 'Bollinger Band period' },
        { key: 'std_dev', label: 'Std Dev', type: 'number', step: 0.1, default: 2.0, min: 0.5, max: 4.0, hint: 'Band width multiplier' },
        { key: 'adx_threshold', label: 'ADX Threshold', type: 'number', step: 0.5, default: 25.0, min: 10, max: 40, hint: 'Only trade when ADX < this value (ranging)' },
    ],
    TREND_STRENGTH_ADX: [
        { key: 'adx_threshold', label: 'ADX Min', type: 'number', step: 0.5, default: 25.0, min: 15, max: 45, hint: 'Trade only when ADX ≥ this (strong trend)' },
        { key: 'di_gap', label: 'DI Gap', type: 'number', step: 0.5, default: 5.0, min: 2, max: 20, hint: 'Min gap between +DI and -DI to confirm direction' },
        { key: 'fast_ema', label: 'Fast EMA', type: 'number', default: 9, min: 3, max: 30, hint: 'Fast EMA for trend direction' },
        { key: 'slow_ema', label: 'Slow EMA', type: 'number', default: 21, min: 10, max: 60, hint: 'Slow EMA for trend direction' },
    ],
    COMPOSITE: [],
};

const CANDLE_INTERVALS = [
    { value: '1m',  label: '1 min',   period: '1d',   hint: 'Ultra-fast scalping' },
    { value: '2m',  label: '2 min',   period: '5d',   hint: 'Fast scalping' },
    { value: '5m',  label: '5 min',   period: '5d',   hint: 'Intraday (recommended)' },
    { value: '15m', label: '15 min',  period: '5d',   hint: 'Intraday swing' },
    { value: '30m', label: '30 min',  period: '1mo',  hint: 'Short swing' },
    { value: '1h',  label: '1 hour',  period: '1mo',  hint: 'Swing trades' },
    { value: '1d',  label: 'Daily',   period: '3mo',  hint: 'Positional / swing' },
];

const TIMEFRAME_MAP = {
    SMA_CROSSOVER: 'Swing', MACD: 'Swing',
    RSI: 'Intraday', EMA_CROSSOVER: 'Intraday', VWAP_BOUNCE: 'Intraday',
    ATR_BREAKOUT: 'Intraday', STOCHASTIC_REVERSION: 'Intraday',
    BOLLINGER: 'Positional', SUPERTREND: 'Positional', COMPOSITE: 'Multi-Strategy',
    MOMENTUM_BREAKOUT: 'Intraday', MEAN_REVERSION_BB: 'Intraday', TREND_STRENGTH_ADX: 'Swing',
};

const DONUT_COLORS = {
    Intraday: '#f59e0b',
    Swing: '#3b82f6',
    Positional: '#8b5cf6',
    'Multi-Strategy': '#10b981',
};

const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'my-strategies', label: 'My Strategies' },
    { id: 'builder', label: 'Strategy Builder' },
    { id: 'backtesting', label: 'Backtesting Station' },
    { id: 'marketplace', label: 'Marketplace' },
    { id: 'logs', label: 'Logs & Alerts' },
    { id: 'performance', label: 'Performance & Risk' },
];

const CHART_RANGES = ['1D', '1W', '1M', '3M', '1Y', 'All'];

const POPULAR_SUGGESTED_SYMBOLS = [
    { symbol: 'NIFTY50', name: 'Nifty 50 Index', segment: 'EQUITY' },
    { symbol: 'BANKNIFTY', name: 'Nifty Bank Index', segment: 'EQUITY' },
    { symbol: 'FINNIFTY', name: 'Nifty Financial Services', segment: 'EQUITY' },
    { symbol: 'MIDCPNIFTY', name: 'Nifty Midcap 100', segment: 'EQUITY' },
    { symbol: 'SENSEX', name: 'BSE Sensex Index', segment: 'EQUITY' },
    { symbol: 'RELIANCE', name: 'Reliance Industries Ltd', segment: 'EQUITY' },
    { symbol: 'TCS', name: 'Tata Consultancy Services', segment: 'EQUITY' },
    { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd', segment: 'EQUITY' },
    { symbol: 'INFY', name: 'Infosys Ltd', segment: 'EQUITY' },
    { symbol: 'ICICIBANK', name: 'ICICI Bank Ltd', segment: 'EQUITY' },
    { symbol: 'SBIN', name: 'State Bank of India', segment: 'EQUITY' },
    { symbol: 'BHARTIARTL', name: 'Bharti Airtel Ltd', segment: 'EQUITY' },
    { symbol: 'ITC', name: 'ITC Limited', segment: 'EQUITY' },
    { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank', segment: 'EQUITY' },
    { symbol: 'LT', name: 'Larsen & Toubro', segment: 'EQUITY' },
    { symbol: 'AXISBANK', name: 'Axis Bank Ltd', segment: 'EQUITY' },
    { symbol: 'WIPRO', name: 'Wipro Limited', segment: 'EQUITY' },
    { symbol: 'HCLTECH', name: 'HCL Technologies', segment: 'EQUITY' },
    { symbol: 'TATAMOTORS', name: 'Tata Motors Ltd', segment: 'EQUITY' },
    { symbol: 'SUNPHARMA', name: 'Sun Pharma', segment: 'EQUITY' },
    { symbol: 'MARUTI', name: 'Maruti Suzuki India', segment: 'EQUITY' },
    { symbol: 'TITAN', name: 'Titan Company Ltd', segment: 'EQUITY' },
    { symbol: 'BAJFINANCE', name: 'Bajaj Finance Ltd', segment: 'EQUITY' },
    { symbol: 'NIFTY_FUT', name: 'Nifty 50 Futures Near-Month', segment: 'FUTURES' },
    { symbol: 'BANKNIFTY_FUT', name: 'BankNifty Futures Near-Month', segment: 'FUTURES' },
    { symbol: 'FINNIFTY_FUT', name: 'FinNifty Futures Near-Month', segment: 'FUTURES' },
    { symbol: 'RELIANCE_FUT', name: 'Reliance Futures Near-Month', segment: 'FUTURES' },
    { symbol: 'TCS_FUT', name: 'TCS Futures Near-Month', segment: 'FUTURES' },
    { symbol: 'INFY_FUT', name: 'Infosys Futures Near-Month', segment: 'FUTURES' },
    { symbol: 'NIFTY_CE', name: 'Nifty 50 Call Options (ATM)', segment: 'OPTIONS' },
    { symbol: 'NIFTY_PE', name: 'Nifty 50 Put Options (ATM)', segment: 'OPTIONS' },
    { symbol: 'BANKNIFTY_CE', name: 'BankNifty Call Options (ATM)', segment: 'OPTIONS' },
    { symbol: 'BANKNIFTY_PE', name: 'BankNifty Put Options (ATM)', segment: 'OPTIONS' },
];

function SymbolAutoComplete({ value, onChange, segment = 'EQUITY', placeholder = 'Type symbol e.g. RELIANCE, NIFTY50', className }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    const searchStr = (value || '').trim().toLowerCase();
    const currentSegment = (segment || 'EQUITY').toUpperCase();

    // ONLY show filtered suggestions when user has typed at least 1 letter!
    const filtered = searchStr.length === 0 ? [] : POPULAR_SUGGESTED_SYMBOLS.filter(s => {
        const matchSegment = (s.segment || 'EQUITY').toUpperCase() === currentSegment;
        const matchText = s.symbol.toLowerCase().includes(searchStr) || s.name.toLowerCase().includes(searchStr);
        return matchSegment && matchText;
    }).slice(0, 10);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div ref={ref} className="relative">
            <div className="relative">
                <input
                    type="text"
                    value={value}
                    onChange={e => { onChange(e.target.value.toUpperCase()); setOpen(true); }}
                    onFocus={() => { if (searchStr.length > 0) setOpen(true); }}
                    className={cn('input-field uppercase', className)}
                    placeholder={placeholder}
                />
                <Search className="w-3.5 h-3.5 text-gray-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            {open && searchStr.length > 0 && filtered.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-surface-800 border border-edge/10 rounded-xl shadow-2xl max-h-56 overflow-y-auto py-1">
                    {filtered.map(item => (
                        <button
                            key={item.symbol}
                            type="button"
                            onClick={() => { onChange(item.symbol); setOpen(false); }}
                            className="w-full text-left px-3 py-2 hover:bg-surface-700/60 flex items-center justify-between transition-colors border-b border-edge/5 last:border-0">
                            <div>
                                <span className="text-xs font-bold text-heading">{item.symbol}</span>
                                <span className="text-[10px] text-gray-400 block">{item.name}</span>
                            </div>
                            <span className={cn(
                                'px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase',
                                item.segment === 'FUTURES' ? 'bg-amber-500/10 text-amber-400' :
                                item.segment === 'OPTIONS' ? 'bg-purple-500/10 text-purple-400' :
                                'bg-emerald-500/10 text-emerald-400'
                            )}>
                                {item.segment || 'EQUITY'}
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

const RULE_TYPE_COLORS = {
    EMA_CROSSOVER: { badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', accent: 'border-l-4 border-l-emerald-500' },
    SMA_CROSSOVER: { badge: 'bg-teal-500/15 text-teal-400 border-teal-500/30', accent: 'border-l-4 border-l-teal-500' },
    RSI: { badge: 'bg-purple-500/15 text-purple-400 border-purple-500/30', accent: 'border-l-4 border-l-purple-500' },
    STOCHASTIC_REVERSION: { badge: 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30', accent: 'border-l-4 border-l-fuchsia-500' },
    VWAP_BOUNCE: { badge: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30', accent: 'border-l-4 border-l-cyan-500' },
    MACD: { badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30', accent: 'border-l-4 border-l-blue-500' },
    BOLLINGER: { badge: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30', accent: 'border-l-4 border-l-indigo-500' },
    SUPERTREND: { badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30', accent: 'border-l-4 border-l-amber-500' },
    ATR_BREAKOUT: { badge: 'bg-orange-500/15 text-orange-400 border-orange-500/30', accent: 'border-l-4 border-l-orange-500' },
};

function SegmentSelector({ value, onChange }) {
    const segments = [
        { id: 'EQUITY', label: '📈 Equity', desc: 'NSE Equities & Indices', activeClass: 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/25 border-emerald-400/30' },
        { id: 'FUTURES', label: '⚡ Futures', desc: 'Futures Derivatives', activeClass: 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/25 border-amber-400/30' },
        { id: 'OPTIONS', label: '🎯 Options', desc: 'Options Contracts (CE/PE)', activeClass: 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-lg shadow-purple-500/25 border-purple-400/30' },
    ];

    return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-surface-950/70 p-1.5 rounded-2xl border border-edge/10 backdrop-blur-md">
            {segments.map(seg => {
                const isActive = value === seg.id;
                return (
                    <button
                        key={seg.id}
                        type="button"
                        onClick={() => onChange(seg.id)}
                        className={cn(
                            'py-2.5 px-3.5 rounded-xl text-xs font-bold transition-all duration-200 text-left border flex items-center justify-between group',
                            isActive
                                ? seg.activeClass
                                : 'bg-surface-900/50 text-gray-400 hover:text-gray-200 hover:bg-surface-800/80 border-edge/5'
                        )}>
                        <div>
                            <span className="text-xs font-bold block">{seg.label}</span>
                            <span className={cn('text-[10px] block font-normal mt-0.5', isActive ? 'text-white/80' : 'text-gray-500')}>{seg.desc}</span>
                        </div>
                        <span className={cn('w-2 h-2 rounded-full transition-all', isActive ? 'bg-white shadow-sm animate-pulse' : 'bg-edge/20 group-hover:bg-edge/40')} />
                    </button>
                );
            })}
        </div>
    );
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function parseApiError(err, fallback = 'Request failed') {
    const detail = err?.response?.data?.detail;
    if (Array.isArray(detail)) return detail.map(d => d?.msg).filter(Boolean).join(', ') || fallback;
    if (typeof detail === 'string' && detail.trim()) return detail;
    if (typeof err?.message === 'string' && err.message.trim()) return err.message;
    return fallback;
}

function parseNumericInput(raw, fallback, min, max, decimals = null) {
    const parsed = Number(raw);
    const safe = Number.isFinite(parsed) ? parsed : fallback;
    const bounded = clamp(safe, min, max);
    if (decimals == null) return Math.round(bounded);
    return Number(bounded.toFixed(decimals));
}

function sanitizeParams(type, params = {}) {
    if (type === 'COMPOSITE') return params;
    const fields = STRATEGY_PARAMS[type] || [];
    const sanitized = { quantity: parseNumericInput(params.quantity, 1, 1, 1000, null) };
    fields.forEach(field => {
        const decimals = field.step ? 4 : null;
        sanitized[field.key] = parseNumericInput(params[field.key], field.default, field.min, field.max, decimals);
    });
    if (type === 'SMA_CROSSOVER' && sanitized.short_period >= sanitized.long_period)
        sanitized.short_period = Math.max(2, sanitized.long_period - 1);
    if (type === 'EMA_CROSSOVER' && sanitized.fast_period >= sanitized.slow_period)
        sanitized.fast_period = Math.max(2, sanitized.slow_period - 1);
    if (type === 'MACD' && sanitized.fast_period >= sanitized.slow_period)
        sanitized.fast_period = Math.max(2, sanitized.slow_period - 1);
    if ((type === 'RSI' || type === 'STOCHASTIC_REVERSION') && sanitized.oversold >= sanitized.overbought)
        sanitized.oversold = Math.max(5, sanitized.overbought - 1);
    return sanitized;
}

function getDefaultParams(type) {
    if (type === 'COMPOSITE') {
        return {
            quantity: 1,
            combination_mode: 'ALL',
            rules: [
                { type: 'EMA_CROSSOVER', params: { fast_period: 9, slow_period: 21 } },
                { type: 'RSI', params: { period: 14, oversold: 35, overbought: 65 } }
            ]
        };
    }
    const fields = STRATEGY_PARAMS[type] || [];
    const p = { quantity: 1 };
    fields.forEach(f => { p[f.key] = f.default; });
    return p;
}

function getInitialForm() {
    return {
        name: '', strategy_type: 'EMA_CROSSOVER', symbol: 'RELIANCE', segment: 'EQUITY',
        description: '', max_position_size: 100, stop_loss_percent: 2,
        take_profit_percent: 5, parameters: getDefaultParams('EMA_CROSSOVER'),
        candle_interval: '5m',
    };
}

function buildCreatePayload(form) {
    const strategyType = String(form.strategy_type || 'EMA_CROSSOVER').toUpperCase();
    const rawParams = form.parameters || {};
    const sanitized = sanitizeParams(strategyType, rawParams);
    sanitized.segment = String(form.segment || 'EQUITY').toUpperCase();
    // Store candle interval and period in parameters so the worker reads them
    const candleInterval = String(form.candle_interval || '5m');
    const intervalMeta = CANDLE_INTERVALS.find(c => c.value === candleInterval);
    sanitized.candle_interval = candleInterval;
    sanitized.candle_period = intervalMeta ? intervalMeta.period : '5d';
    return {
        name: String(form.name || '').trim(),
        strategy_type: strategyType,
        symbol: String(form.symbol || '').trim().toUpperCase(),
        description: String(form.description || '').trim(),
        max_position_size: parseNumericInput(form.max_position_size, 100, 1, 100000, null),
        stop_loss_percent: parseNumericInput(form.stop_loss_percent, 2, 0.1, 50, 2),
        take_profit_percent: parseNumericInput(form.take_profit_percent, 5, 0.1, 200, 2),
        parameters: sanitized,
    };
}

function fmtPnl(v) {
    const n = Number(v) || 0;
    return `${n >= 0 ? '+' : ''}₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtCompact(v) {
    const n = Number(v) || 0;
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`;
    if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)}L`;
    if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1)}K`;
    return `${sign}₹${abs.toFixed(2)}`;
}

// ── SVG Line Chart ────────────────────────────────────────────────────────────
function PnLChart({ labels = [], values = [] }) {
    const hasData = values.length > 1;
    if (!hasData) {
        return (
            <div className="flex flex-col items-center justify-center h-48 gap-2">
                <BarChart2 className="w-10 h-10 text-gray-700" />
                <p className="text-sm text-gray-500">No performance data yet</p>
                <p className="text-xs text-gray-600">Activate or run strategies to track P&L</p>
            </div>
        );
    }

    const W = 520, H = 180;
    const pad = { t: 12, r: 16, b: 28, l: 56 };
    const iW = W - pad.l - pad.r;
    const iH = H - pad.t - pad.b;

    const maxV = Math.max(...values, 0);
    const minV = Math.min(...values, 0);
    const range = maxV - minV || 1;

    const x = (i) => pad.l + (i / Math.max(values.length - 1, 1)) * iW;
    const y = (v) => pad.t + iH - ((v - minV) / range) * iH;

    const pathD = values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
    const areaD = `${pathD} L ${x(values.length - 1).toFixed(1)} ${(pad.t + iH).toFixed(1)} L ${x(0).toFixed(1)} ${(pad.t + iH).toFixed(1)} Z`;

    const lastVal = values[values.length - 1];
    const color = lastVal >= 0 ? '#10b981' : '#ef4444';
    const gradId = lastVal >= 0 ? 'pnlGradG' : 'pnlGradR';

    const yTicks = [minV, (minV + maxV) / 2, maxV];
    const xShow = [0, Math.floor((labels.length - 1) / 2), labels.length - 1].filter(
        (v, i, a) => a.indexOf(v) === i && labels[v]
    );

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" style={{ minHeight: 160 }}>
            <defs>
                <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.18" />
                    <stop offset="100%" stopColor={color} stopOpacity="0.02" />
                </linearGradient>
            </defs>
            {yTicks.map((tick, i) => (
                <line key={i} x1={pad.l} x2={W - pad.r} y1={y(tick)} y2={y(tick)}
                    stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
            ))}
            <path d={areaD} fill={`url(#${gradId})`} />
            <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
            <circle cx={x(values.length - 1)} cy={y(lastVal)} r="3.5" fill={color} />
            {yTicks.map((tick, i) => (
                <text key={i} x={pad.l - 6} y={y(tick) + 4} textAnchor="end"
                    fontSize="9" fill="rgba(156,163,175,0.7)">
                    {fmtCompact(tick)}
                </text>
            ))}
            {xShow.map((i) => (
                <text key={i} x={x(i)} y={H - 5} textAnchor="middle"
                    fontSize="9" fill="rgba(156,163,175,0.7)">
                    {labels[i]}
                </text>
            ))}
        </svg>
    );
}

// ── SVG Donut Chart ───────────────────────────────────────────────────────────
function DonutChart({ segments, total }) {
    if (!segments || segments.length === 0) {
        return (
            <div className="flex items-center justify-center w-32 h-32 rounded-full border-4 border-surface-700/50">
                <span className="text-xs text-gray-600">No data</span>
            </div>
        );
    }
    const r = 44;
    const cx = 60, cy = 60;
    const circ = 2 * Math.PI * r;
    let cumulativePct = 0;

    return (
        <svg viewBox="0 0 120 120" className="w-32 h-32 flex-shrink-0">
            {segments.map((seg, i) => {
                const dashLen = (seg.pct / 100) * circ;
                const dashOffset = circ / 4 - (cumulativePct / 100) * circ;
                cumulativePct += seg.pct;
                return (
                    <circle key={i} cx={cx} cy={cy} r={r}
                        fill="none" stroke={seg.color} strokeWidth="16"
                        strokeDasharray={`${dashLen} ${circ - dashLen}`}
                        strokeDashoffset={dashOffset} />
                );
            })}
            <text x={cx} y={cy - 5} textAnchor="middle"
                fontSize="16" fontWeight="700" fill="white">{total}</text>
            <text x={cx} y={cy + 10} textAnchor="middle"
                fontSize="8" fill="rgba(156,163,175,0.8)">Total</text>
        </svg>
    );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, iconBg, label, value, sub, subColor }) {
    return (
        <div className="rounded-xl border border-edge/5 bg-surface-900/60 p-4 flex items-start gap-3">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', iconBg)}>
                <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-[11px] text-gray-500 font-medium truncate">{label}</p>
                <p className="text-lg font-display font-bold text-heading leading-tight mt-0.5 truncate">{value}</p>
                {sub && (
                    <p className={cn('text-[11px] mt-0.5 font-medium', subColor || 'text-gray-500')}>{sub}</p>
                )}
            </div>
        </div>
    );
}

// ── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ isActive }) {
    return (
        <span className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide',
            isActive
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-gray-500/10 text-gray-400'
        )}>
            <span className={cn('w-1.5 h-1.5 rounded-full', isActive ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500')} />
            {isActive ? 'Running' : 'Paused'}
        </span>
    );
}

// ── Strategy Row Component ────────────────────────────────────────────────────
function StrategyRow({ s, onToggle, onRunNow, onEdit, onDelete, onViewLogs, menuOpen, onMenuOpen }) {
    const tMeta = STRATEGY_TYPES.find(t => t.value === s.strategy_type) || {};
    const timeframe = TIMEFRAME_MAP[s.strategy_type] || 'Intraday';
    const todayPnl = Number(s.today_pnl) || 0;
    const totalPnl = Number(s.total_pnl) || 0;
    const sharpe = Number(s.sharpe_ratio) || 0;
    const [executing, setExecuting] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!menuOpen) return;
        function handler(e) {
            if (ref.current && !ref.current.contains(e.target)) onMenuOpen(null);
        }
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [menuOpen, onMenuOpen]);

    const handleExecuteNow = async () => {
        setExecuting(true);
        try {
            await onRunNow(s.id);
        } finally {
            setExecuting(false);
        }
    };

    return (
        <tr className="border-b border-edge/[0.04] hover:bg-surface-800/30 transition-colors group">
            <td className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-primary-500/10 flex items-center justify-center flex-shrink-0">
                        {s.strategy_type === 'COMPOSITE' ? <Layers className="w-3.5 h-3.5 text-primary-400" /> : <Zap className="w-3.5 h-3.5 text-primary-500" />}
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-heading leading-tight flex items-center gap-1.5">
                            {s.name}
                            {s.strategy_type === 'COMPOSITE' && (
                                <span className="text-[9px] bg-primary-500/20 text-primary-400 px-1.5 py-0.2 rounded font-mono">MULTI</span>
                            )}
                            {['MOMENTUM_BREAKOUT','MEAN_REVERSION_BB','TREND_STRENGTH_ADX'].includes(s.strategy_type) && (
                                <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-mono">NEW</span>
                            )}
                        </p>
                        <p className="text-[10px] text-gray-500 flex items-center gap-1">
                            {cleanSymbol(s.symbol)} · {tMeta.label || s.strategy_type} · {timeframe}
                            {s.parameters?.candle_interval && (
                                <span className="ml-0.5 px-1 py-0 rounded text-[9px] font-mono bg-surface-700 text-gray-400 border border-edge/10">
                                    {s.parameters.candle_interval}
                                </span>
                            )}
                        </p>
                    </div>
                </div>
            </td>
            <td className="px-4 py-3">
                <StatusBadge isActive={s.is_active} />
            </td>
            <td className="px-4 py-3">
                <p className={cn('text-sm font-price font-semibold tabular-nums', pnlColorClass(totalPnl))}>
                    {fmtPnl(totalPnl)}
                </p>
                {s.total_trades > 0 && (
                    <p className="text-[10px] text-gray-600">{s.total_trades} trades</p>
                )}
            </td>
            <td className="px-4 py-3">
                <p className={cn('text-sm font-price font-semibold tabular-nums', pnlColorClass(todayPnl))}>
                    {todayPnl === 0 ? '₹0.00' : fmtPnl(todayPnl)}
                </p>
            </td>
            <td className="px-4 py-3">
                <p className="text-sm font-price text-heading tabular-nums">
                    {Number(s.win_rate).toFixed(2)}%
                </p>
            </td>
            <td className="px-4 py-3">
                <p className="text-sm font-price text-heading tabular-nums">
                    {sharpe.toFixed(2)}
                </p>
            </td>
            <td className="px-4 py-3">
                <div className="flex items-center gap-1.5">
                    <button
                        onClick={handleExecuteNow}
                        disabled={executing}
                        title="Execute Instant Evaluation & Signal Run"
                        className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 flex items-center justify-center transition-all disabled:opacity-50">
                        <Play className={cn("w-3.5 h-3.5", executing && "animate-spin")} />
                    </button>
                    <button
                        onClick={() => onToggle(s.id)}
                        title={s.is_active ? 'Pause' : 'Start'}
                        className={cn(
                            'w-7 h-7 rounded-lg flex items-center justify-center transition-all',
                            s.is_active
                                ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                                : 'bg-primary-500/10 text-primary-500 hover:bg-primary-500/20'
                        )}>
                        {s.is_active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    </button>

                    <div ref={ref} className="relative">
                        <button
                            onClick={() => onMenuOpen(menuOpen ? null : s.id)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:text-gray-300 hover:bg-surface-700/50 transition-all">
                            <MoreVertical className="w-3.5 h-3.5" />
                        </button>
                        {menuOpen && (
                            <div className="absolute right-0 top-8 z-30 w-44 bg-surface-800 border border-edge/10 rounded-xl shadow-2xl overflow-hidden py-1">
                                <button
                                    onClick={() => { onRunNow(s.id, true); onMenuOpen(null); }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-emerald-400 hover:bg-emerald-500/10 transition-colors font-medium">
                                    <Zap className="w-3.5 h-3.5 text-emerald-400" /> Force Test Trade
                                </button>
                                <button
                                    onClick={() => { onEdit(s); onMenuOpen(null); }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-300 hover:bg-surface-700/50 transition-colors">
                                    <Pencil className="w-3.5 h-3.5 text-gray-400" /> Edit Strategy
                                </button>
                                <button
                                    onClick={() => { onViewLogs(s.id); onMenuOpen(null); }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-300 hover:bg-surface-700/50 transition-colors">
                                    <Clock className="w-3.5 h-3.5 text-gray-400" /> View Activity Logs
                                </button>
                                <button
                                    onClick={() => { onDelete(s.id); onMenuOpen(null); }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors">
                                    <Trash2 className="w-3.5 h-3.5" /> Delete Strategy
                                    {s.is_active && <span className="ml-auto text-[9px] bg-amber-500/20 text-amber-400 px-1 rounded">WILL STOP</span>}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </td>
        </tr>
    );
}

// ── Param Fields ──────────────────────────────────────────────────────────────
function ParamFields({ type, params, onChange }) {
    const fields = STRATEGY_PARAMS[type] || [];
    return (
        <>
            <div>
                <label className="label-text">Trade Qty</label>
                <input type="number" min="1" max="1000"
                    value={params.quantity ?? 1}
                    onChange={e => onChange({ ...params, quantity: parseNumericInput(e.target.value, 1, 1, 1000, null) })}
                    className="input-field" />
            </div>
            {fields.map(f => (
                <div key={f.key}>
                    <label className="label-text">{f.label}</label>
                    <input type="number" step={f.step || 1} min={f.min} max={f.max}
                        value={params[f.key] ?? f.default}
                        onChange={e => onChange({
                            ...params,
                            [f.key]: parseNumericInput(e.target.value, f.default, f.min, f.max, f.step ? 4 : null),
                        })}
                        className="input-field" />
                    {f.hint && <p className="text-[10px] text-gray-600 mt-0.5">{f.hint}</p>}
                </div>
            ))}
        </>
    );
}

// ── Multi-Strategy Composite Builder Component ────────────────────────────────
function StrategyBuilderTab({ onCreate, onBacktest }) {
    const [segment, setSegment] = useState('EQUITY');
    const [name, setName] = useState('My Composite Master Strategy');
    const [symbol, setSymbol] = useState('RELIANCE');
    const [description, setDescription] = useState('Unanimous multi-indicator confluence strategy combining trend, momentum, and VWAP bounce.');
    const [combinationMode, setCombinationMode] = useState('ALL'); // ALL (AND) or ANY (OR)
    const [maxPosSize, setMaxPosSize] = useState(100);
    const [stopLoss, setStopLoss] = useState(2.0);
    const [takeProfit, setTakeProfit] = useState(5.0);
    const [rules, setRules] = useState([
        { type: 'EMA_CROSSOVER', params: { fast_period: 9, slow_period: 21 } },
        { type: 'RSI', params: { period: 14, oversold: 35, overbought: 65 } },
    ]);
    const [creating, setCreating] = useState(false);

    const addRule = () => {
        setRules(prev => [...prev, { type: 'VWAP_BOUNCE', params: { bounce_threshold: 0.2 } }]);
    };

    const removeRule = (idx) => {
        if (rules.length <= 1) {
            toast.error('At least 1 indicator rule is required');
            return;
        }
        setRules(prev => prev.filter((_, i) => i !== idx));
    };

    const updateRuleType = (idx, newType) => {
        setRules(prev => prev.map((r, i) => {
            if (i === idx) {
                return { type: newType, params: getDefaultParams(newType) };
            }
            return r;
        }));
    };

    const updateRuleParam = (idx, paramKey, val) => {
        setRules(prev => prev.map((r, i) => {
            if (i === idx) {
                return { ...r, params: { ...r.params, [paramKey]: val } };
            }
            return r;
        }));
    };

    const handleDeploy = async () => {
        if (!name.trim()) { toast.error('Strategy name is required'); return; }
        if (!symbol.trim()) { toast.error('Symbol is required'); return; }
        if (rules.length === 0) { toast.error('Add at least one strategy rule'); return; }

        const payload = {
            name,
            strategy_type: 'COMPOSITE',
            symbol: symbol.toUpperCase(),
            description,
            max_position_size: maxPosSize,
            stop_loss_percent: stopLoss,
            take_profit_percent: takeProfit,
            parameters: {
                quantity: 1,
                segment: segment,
                combination_mode: combinationMode,
                rules: rules,
            }
        };

        setCreating(true);
        try {
            await onCreate(payload);
            toast.success('Multi-strategy created successfully!');
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to build strategy'));
        } finally {
            setCreating(false);
        }
    };

    const handleRunBacktest = () => {
        onBacktest({
            symbol: symbol.toUpperCase(),
            strategy_type: 'COMPOSITE',
            parameters: {
                quantity: 1,
                segment: segment,
                combination_mode: combinationMode,
                rules: rules,
            },
            stop_loss_percent: stopLoss,
            take_profit_percent: takeProfit,
        });
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Main Studio Card */}
            <div className="rounded-3xl border border-edge/10 bg-surface-900/80 backdrop-blur-xl p-6 lg:p-8 space-y-7 shadow-2xl relative overflow-hidden">
                {/* Decorative background glow accent */}
                <div className="absolute top-0 right-1/4 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl pointer-events-none" />

                {/* Studio Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-edge/10 pb-5 relative z-10">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 rounded-lg bg-primary-500/10 text-primary-400 text-[10px] font-extrabold uppercase tracking-wider border border-primary-500/20">
                                QUANT STUDIO V2.5
                            </span>
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                        </div>
                        <h2 className="text-xl font-bold font-display text-heading flex items-center gap-2.5 mt-1.5">
                            <Layers className="w-6 h-6 text-primary-500" />
                            Interactive Multi-Strategy Builder
                        </h2>
                        <p className="text-xs text-gray-400 mt-1 max-w-2xl leading-relaxed">
                            Construct institutional-grade algorithms by layering technical indicators with unanimous (AND) or fast-trigger (OR) confluence logic across Equity, Futures, and Options.
                        </p>
                    </div>
                    <div className="flex items-center gap-2.5 self-start sm:self-center flex-shrink-0">
                        <button onClick={handleRunBacktest} className="btn-secondary text-xs py-2.5 px-4 inline-flex items-center gap-2 border-edge/20 hover:border-cyan-500/40 hover:bg-cyan-500/5 transition-all shadow-sm">
                            <BarChart2 className="w-4 h-4 text-cyan-400" /> Backtest Simulator
                        </button>
                        <button onClick={handleDeploy} disabled={creating} className="btn-primary text-xs py-2.5 px-5 inline-flex items-center gap-2 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-500 shadow-lg shadow-emerald-500/25 border-none font-bold">
                            <Sparkles className="w-4 h-4" /> {creating ? 'Building Strategy...' : 'Deploy Composite Strategy'}
                        </button>
                    </div>
                </div>

                {/* Segment Selection */}
                <div className="space-y-2 relative z-10">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-300 flex items-center gap-2">
                        <Target className="w-4 h-4 text-emerald-400" /> Target Asset Class Segment
                    </label>
                    <SegmentSelector value={segment} onChange={setSegment} />
                </div>

                {/* Primary General Configuration Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 relative z-10 bg-surface-950/40 p-5 rounded-2xl border border-edge/10">
                    <div>
                        <label className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2 block flex items-center gap-1.5">
                            <Pencil className="w-3.5 h-3.5 text-primary-400" /> Strategy Name *
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            className="w-full bg-surface-950 border border-edge/15 rounded-xl px-4 py-2.5 text-xs text-heading placeholder-gray-500 font-medium focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all shadow-inner"
                            placeholder="e.g. Multi-Indicator Confluence Matrix"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2 block flex items-center gap-1.5">
                            <Search className="w-3.5 h-3.5 text-emerald-400" /> Symbol (Search & Auto-Suggest) *
                        </label>
                        <SymbolAutoComplete
                            value={symbol}
                            segment={segment}
                            onChange={setSymbol}
                            placeholder="Type stock ticker e.g. RELIANCE, NIFTY50"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2 block flex items-center gap-1.5">
                            <Sliders className="w-3.5 h-3.5 text-amber-400" /> Combination Confluence Mode
                        </label>
                        <select
                            value={combinationMode}
                            onChange={e => setCombinationMode(e.target.value)}
                            className="w-full bg-surface-950 border border-edge/15 rounded-xl px-4 py-2.5 text-xs text-heading font-semibold focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all cursor-pointer">
                            <option value="ALL">ALL (AND) — Unanimous Confluence (Highest Accuracy)</option>
                            <option value="ANY">ANY (OR) — Fast Signal Trigger (High Frequency)</option>
                        </select>
                    </div>
                </div>

                {/* Sub-Rules Engine Container */}
                <div className="space-y-4 relative z-10">
                    <div className="flex items-center justify-between border-b border-edge/10 pb-2">
                        <div>
                            <h3 className="text-sm font-bold uppercase tracking-wider text-heading flex items-center gap-2">
                                <Activity className="w-4 h-4 text-purple-400" /> Strategy Indicator Rules ({rules.length})
                            </h3>
                            <p className="text-[11px] text-gray-500">Each sub-rule evaluates live price candles & technical math conditions.</p>
                        </div>
                        <button
                            onClick={addRule}
                            className="text-xs py-1.5 px-3 rounded-xl bg-primary-500/10 text-primary-400 hover:bg-primary-500/20 font-bold flex items-center gap-1.5 transition-all border border-primary-500/20">
                            <Plus className="w-3.5 h-3.5" /> Add Sub-Rule Module
                        </button>
                    </div>

                    <div className="space-y-4">
                        {rules.map((rule, idx) => {
                            const availableTypes = STRATEGY_TYPES.filter(t => t.value !== 'COMPOSITE');
                            const typeObj = availableTypes.find(t => t.value === rule.type) || {};
                            const colorStyle = RULE_TYPE_COLORS[rule.type] || { badge: 'bg-primary-500/15 text-primary-400 border-primary-500/30', accent: 'border-l-4 border-l-primary-500' };

                            return (
                                <div
                                    key={idx}
                                    className={cn(
                                        'rounded-2xl border border-edge/10 bg-surface-950/60 p-5 space-y-4 relative shadow-md transition-all hover:border-edge/20',
                                        colorStyle.accent
                                    )}>
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-edge/5 pb-3">
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <span className="w-6 h-6 rounded-lg bg-surface-800 text-heading text-xs font-black flex items-center justify-center border border-edge/10 shadow-sm">
                                                #{idx + 1}
                                            </span>
                                            <select
                                                value={rule.type}
                                                onChange={e => updateRuleType(idx, e.target.value)}
                                                className="bg-surface-900 border border-edge/15 rounded-xl py-1.5 px-3 text-xs text-heading font-bold cursor-pointer outline-none focus:border-primary-500 transition-all">
                                                {availableTypes.map(t => (
                                                    <option key={t.value} value={t.value}>{t.label}</option>
                                                ))}
                                            </select>
                                            <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider hidden sm:inline-block', colorStyle.badge)}>
                                                {typeObj.label}
                                            </span>
                                            <span className="text-xs text-gray-400 truncate hidden lg:inline">{typeObj.desc}</span>
                                        </div>
                                        <button
                                            onClick={() => removeRule(idx)}
                                            className="self-end sm:self-center p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors border border-transparent hover:border-red-500/20">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {/* Parameters Grid */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                                        {(STRATEGY_PARAMS[rule.type] || []).map(field => (
                                            <div key={field.key} className="bg-surface-900/50 p-2.5 rounded-xl border border-edge/5">
                                                <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block mb-1">
                                                    {field.label}
                                                </label>
                                                <input
                                                    type="number"
                                                    step={field.step || 1}
                                                    value={rule.params[field.key] ?? field.default}
                                                    onChange={e => updateRuleParam(idx, field.key, parseNumericInput(e.target.value, field.default, field.min, field.max, field.step ? 4 : null))}
                                                    className="w-full bg-surface-950 border border-edge/15 rounded-lg px-2.5 py-1 text-xs text-heading font-mono font-semibold outline-none focus:border-primary-500 transition-all"
                                                />
                                                {field.hint && (
                                                    <span className="text-[9px] text-gray-500 mt-1 block truncate">{field.hint}</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Sizing & Capital Controls Grid */}
                <div className="space-y-3 relative z-10 border-t border-edge/10 pt-5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-300 flex items-center gap-2">
                        <Shield className="w-4 h-4 text-cyan-400" /> Execution Sizing & Risk Guardrails
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-surface-950/40 p-4 rounded-2xl border border-edge/10">
                            <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block mb-1.5">
                                Max Position Quantity
                            </label>
                            <input
                                type="number"
                                value={maxPosSize}
                                onChange={e => setMaxPosSize(parseNumericInput(e.target.value, 100, 1, 100000))}
                                className="w-full bg-surface-950 border border-edge/15 rounded-xl px-3.5 py-2 text-xs text-heading font-mono font-bold focus:border-primary-500 outline-none"
                            />
                            <p className="text-[10px] text-gray-500 mt-1">Maximum shares/lots per execution signal.</p>
                        </div>

                        <div className="bg-surface-950/40 p-4 rounded-2xl border border-edge/10">
                            <label className="text-xs font-bold text-red-400 uppercase tracking-wider block mb-1.5">
                                Stop Loss Level (%)
                            </label>
                            <input
                                type="number"
                                step="0.1"
                                value={stopLoss}
                                onChange={e => setStopLoss(parseNumericInput(e.target.value, 2, 0.1, 50, 2))}
                                className="w-full bg-surface-950 border border-edge/15 rounded-xl px-3.5 py-2 text-xs text-red-400 font-mono font-bold focus:border-red-500 outline-none"
                            />
                            <p className="text-[10px] text-gray-500 mt-1">Automatic stop-loss trigger percentage.</p>
                        </div>

                        <div className="bg-surface-950/40 p-4 rounded-2xl border border-edge/10">
                            <label className="text-xs font-bold text-emerald-400 uppercase tracking-wider block mb-1.5">
                                Take Profit Level (%)
                            </label>
                            <input
                                type="number"
                                step="0.1"
                                value={takeProfit}
                                onChange={e => setTakeProfit(parseNumericInput(e.target.value, 5, 0.1, 200, 2))}
                                className="w-full bg-surface-950 border border-edge/15 rounded-xl px-3.5 py-2 text-xs text-emerald-400 font-mono font-bold focus:border-emerald-500 outline-none"
                            />
                            <p className="text-[10px] text-gray-500 mt-1">Target profit exit percentage.</p>
                        </div>
                    </div>
                </div>

                {/* Strategy Notes */}
                <div className="relative z-10">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-300 block mb-1.5">
                        Strategy Summary Notes & Thesis
                    </label>
                    <textarea
                        rows="2"
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        className="w-full bg-surface-950 border border-edge/15 rounded-2xl p-3.5 text-xs text-heading placeholder-gray-500 resize-none outline-none focus:border-primary-500 transition-all"
                        placeholder="Explain rationale, timeframes, or trading thesis..."
                    />
                </div>
            </div>
        </div>
    );
}

// ── Backtesting Station Component ─────────────────────────────────────────────
function BacktestingTab({ userStrategies, defaultBacktestConfig }) {
    const [symbol, setSymbol] = useState(defaultBacktestConfig?.symbol || 'RELIANCE');
    const [strategyType, setStrategyType] = useState(defaultBacktestConfig?.strategy_type || 'EMA_CROSSOVER');
    const [period, setPeriod] = useState('6mo');
    const [capital, setCapital] = useState(100000);
    const [stopLoss, setStopLoss] = useState(defaultBacktestConfig?.stop_loss_percent || 2.0);
    const [takeProfit, setTakeProfit] = useState(defaultBacktestConfig?.take_profit_percent || 5.0);
    const [parameters, setParameters] = useState(defaultBacktestConfig?.parameters || getDefaultParams('EMA_CROSSOVER'));

    const [running, setRunning] = useState(false);
    const [results, setResults] = useState(null);

    const handleSelectStrategy = (sId) => {
        const strat = userStrategies.find(s => s.id === sId);
        if (strat) {
            setSymbol(strat.symbol);
            setStrategyType(strat.strategy_type);
            setStopLoss(strat.stop_loss_percent);
            setTakeProfit(strat.take_profit_percent);
            setParameters(strat.parameters || getDefaultParams(strat.strategy_type));
        }
    };

    const handleTypeChange = (type) => {
        setStrategyType(type);
        setParameters(getDefaultParams(type));
    };

    const runSim = async () => {
        setRunning(true);
        try {
            const res = await api.post('/algo/backtest', {
                symbol: symbol.toUpperCase(),
                strategy_type: strategyType,
                parameters: parameters,
                period: period,
                initial_capital: capital,
                stop_loss_percent: stopLoss,
                take_profit_percent: takeProfit,
            });
            setResults(res.data);
            toast.success('Backtest execution completed!');
        } catch (err) {
            toast.error(parseApiError(err, 'Backtest failed to run'));
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Control Panel */}
            <div className="rounded-2xl border border-edge/10 bg-surface-900/60 p-5 lg:p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-edge/5 pb-3">
                    <div>
                        <h2 className="text-base font-bold text-heading flex items-center gap-2">
                            <BarChart2 className="w-5 h-5 text-primary-500" />
                            Quantitative Strategy Backtester
                        </h2>
                        <p className="text-xs text-gray-500 mt-0.5">Test any trading algorithm against historical market price candles.</p>
                    </div>
                    {userStrategies.length > 0 && (
                        <select onChange={e => handleSelectStrategy(e.target.value)} className="input-field py-1.5 px-3 text-xs w-56 cursor-pointer">
                            <option value="">-- Load Existing Strategy --</option>
                            {userStrategies.map(s => <option key={s.id} value={s.id}>{s.name} ({s.symbol})</option>)}
                        </select>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                        <label className="label-text">Symbol (Suggestions)</label>
                        <SymbolAutoComplete value={symbol} onChange={setSymbol} placeholder="Select or type e.g. RELIANCE, NIFTY50" />
                    </div>
                    <div>
                        <label className="label-text">Strategy Engine</label>
                        <select value={strategyType} onChange={e => handleTypeChange(e.target.value)} className="input-field cursor-pointer">
                            {STRATEGY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="label-text">History Duration</label>
                        <select value={period} onChange={e => setPeriod(e.target.value)} className="input-field cursor-pointer">
                            <option value="1mo">1 Month</option>
                            <option value="3mo">3 Months</option>
                            <option value="6mo">6 Months</option>
                            <option value="1y">1 Year</option>
                        </select>
                    </div>
                    <div>
                        <label className="label-text">Initial Test Capital (₹)</label>
                        <input type="number" value={capital} onChange={e => setCapital(Number(e.target.value))} className="input-field" />
                    </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-3">
                        <div>
                            <span className="text-[11px] text-gray-500">Stop Loss %: </span>
                            <span className="text-xs font-bold text-red-400">{stopLoss}%</span>
                        </div>
                        <div>
                            <span className="text-[11px] text-gray-500">Take Profit %: </span>
                            <span className="text-xs font-bold text-emerald-400">{takeProfit}%</span>
                        </div>
                    </div>
                    <button onClick={runSim} disabled={running} className="btn-primary text-sm py-2 px-6 inline-flex items-center gap-2">
                        <Zap className="w-4 h-4" />
                        {running ? 'Simulating Trades...' : 'Run Historical Backtest'}
                    </button>
                </div>
            </div>

            {/* Backtest Results Dashboard */}
            {results && (
                <div className="space-y-5 animate-fade-in">
                    {/* Performance Cards Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                        <StatCard icon={TrendingUp} iconBg="bg-emerald-500/10 text-emerald-400" label="Final Equity" value={fmtCompact(results.final_equity)} sub={fmtPnl(results.net_pnl)} subColor={results.net_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'} />
                        <StatCard icon={Award} iconBg="bg-blue-500/10 text-blue-400" label="Total Return" value={`${results.total_return_pct}%`} sub="Across Period" />
                        <StatCard icon={Target} iconBg="bg-amber-500/10 text-amber-400" label="Win Rate" value={`${results.win_rate}%`} sub={`${results.winning_trades}W / ${results.losing_trades}L`} />
                        <StatCard icon={Activity} iconBg="bg-purple-500/10 text-purple-400" label="Total Trades" value={results.total_trades} sub="Executed" />
                        <StatCard icon={Shield} iconBg="bg-red-500/10 text-red-400" label="Max Drawdown" value={`${results.max_drawdown_pct}%`} sub="Peak-to-Trough" subColor="text-red-400" />
                        <StatCard icon={BarChart2} iconBg="bg-cyan-500/10 text-cyan-400" label="Profit Factor" value={results.profit_factor} sub="Reward:Risk" />
                        <StatCard icon={Sparkles} iconBg="bg-primary-500/10 text-primary-400" label="Sharpe Ratio" value={results.sharpe_ratio} sub="Annualized" />
                    </div>

                    {/* Equity Curve Chart */}
                    <div className="rounded-xl border border-edge/10 bg-surface-900/60 p-5">
                        <h3 className="text-sm font-semibold text-heading mb-3">Equity Growth Curve</h3>
                        <div className="h-48 w-full">
                            <PnLChart
                                labels={results.equity_curve.map(e => e.date)}
                                values={results.equity_curve.map(e => e.equity)}
                            />
                        </div>
                    </div>

                    {/* Trade Details Table */}
                    <div className="rounded-xl border border-edge/10 bg-surface-900/60 overflow-hidden">
                        <div className="px-5 py-3 border-b border-edge/5 flex items-center justify-between">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Trade Log ({results.trades.length} Trades)</h3>
                        </div>
                        <div className="max-h-72 overflow-y-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-edge/5 text-gray-500 uppercase text-[10px]">
                                        <th className="px-4 py-2 text-left">Trade #</th>
                                        <th className="px-4 py-2 text-left">Side</th>
                                        <th className="px-4 py-2 text-left">Entry Date</th>
                                        <th className="px-4 py-2 text-left">Exit Date</th>
                                        <th className="px-4 py-2 text-right">Entry Price</th>
                                        <th className="px-4 py-2 text-right">Exit Price</th>
                                        <th className="px-4 py-2 text-right">Net P&L</th>
                                        <th className="px-4 py-2 text-left">Exit Reason</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.trades.map((t, idx) => (
                                        <tr key={idx} className="border-b border-edge/[0.03] hover:bg-surface-800/40 font-price">
                                            <td className="px-4 py-2 font-mono text-gray-500">#{t.trade_num}</td>
                                            <td className="px-4 py-2 font-bold">
                                                <span className={cn('px-1.5 py-0.5 rounded text-[9px]', t.side === 'BUY' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400')}>
                                                    {t.side}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2 text-gray-400">{t.entry_date}</td>
                                            <td className="px-4 py-2 text-gray-400">{t.exit_date}</td>
                                            <td className="px-4 py-2 text-right">₹{t.entry_price.toFixed(2)}</td>
                                            <td className="px-4 py-2 text-right">₹{t.exit_price.toFixed(2)}</td>
                                            <td className={cn('px-4 py-2 text-right font-bold', pnlColorClass(t.pnl))}>
                                                {fmtPnl(t.pnl)} ({t.pnl_pct}%)
                                            </td>
                                            <td className="px-4 py-2">
                                                <span className="text-[10px] text-gray-400 bg-surface-700/50 px-1.5 py-0.5 rounded">{t.reason}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Strategy Marketplace Component ───────────────────────────────────────────
function MarketplaceTab({ onClone, onPreviewBacktest }) {
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/algo/marketplace')
            .then(res => setTemplates(res.data.templates || []))
            .catch(() => toast.error('Failed to load marketplace templates'))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3 border-b border-edge/5 pb-3">
                <div>
                    <h2 className="text-base font-bold text-heading flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-amber-400" /> Institutional Strategy Marketplace
                    </h2>
                    <p className="text-xs text-gray-500">Clone verified quantitative algorithms and deploy them into live paper trading.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map(tpl => (
                    <div key={tpl.id} className="rounded-xl border border-edge/10 bg-surface-900/60 hover:border-primary-500/30 transition-all p-5 flex flex-col justify-between space-y-4 group">
                        <div>
                            <div className="flex items-start justify-between gap-2 mb-2">
                                <div>
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-primary-400 bg-primary-500/10 px-2 py-0.5 rounded-full">
                                        {tpl.category}
                                    </span>
                                    <h3 className="text-base font-bold text-heading mt-1 group-hover:text-primary-400 transition-colors">{tpl.name}</h3>
                                </div>
                                <span className={cn('text-[9px] font-bold px-2 py-0.5 rounded', tpl.risk_level === 'Low' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400')}>
                                    {tpl.risk_level} Risk
                                </span>
                            </div>

                            <p className="text-xs text-gray-500 leading-relaxed mb-4">{tpl.description}</p>

                            <div className="grid grid-cols-3 gap-2 bg-surface-800/40 p-3 rounded-lg text-center border border-edge/5">
                                <div>
                                    <p className="text-[10px] text-gray-500">Win Rate</p>
                                    <p className="text-xs font-bold text-emerald-400">{tpl.win_rate}%</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-gray-500">CAGR</p>
                                    <p className="text-xs font-bold text-primary-400">+{tpl.cagr}%</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-gray-500">Max DD</p>
                                    <p className="text-xs font-bold text-red-400">{tpl.max_drawdown}%</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 pt-2">
                            <button
                                onClick={() => onPreviewBacktest(tpl)}
                                className="flex-1 btn-secondary text-xs py-2 inline-flex items-center justify-center gap-1.5">
                                <BarChart2 className="w-3.5 h-3.5" /> Backtest
                            </button>
                            <button
                                onClick={() => onClone(tpl)}
                                className="flex-1 btn-primary text-xs py-2 inline-flex items-center justify-center gap-1.5">
                                <Copy className="w-3.5 h-3.5" /> Clone & Deploy
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Performance & Global Risk Management Component ───────────────────────────
function PerformanceAndRiskTab() {
    const [riskSettings, setRiskSettings] = useState({
        max_daily_loss: 5000,
        max_active_algos: 5,
        auto_squareoff_time: '15:15',
        global_stop_loss_pct: 3.0,
        max_capital_per_algo: 50000,
        trailing_stop_loss_enabled: true,
        risk_reward_min_ratio: 1.5,
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        api.get('/algo/risk-settings')
            .then(res => setRiskSettings(res.data))
            .catch(() => {});
    }, []);

    const handleSaveRisk = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await api.post('/algo/risk-settings', riskSettings);
            toast.success('Global Risk Management parameters saved!');
        } catch {
            toast.error('Failed to save risk settings');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Global Risk Management Rules */}
                <div className="rounded-2xl border border-edge/10 bg-surface-900/60 p-5 lg:p-6 space-y-5">
                    <div className="flex items-center justify-between border-b border-edge/5 pb-3">
                        <div>
                            <h2 className="text-base font-bold text-heading flex items-center gap-2">
                                <Shield className="w-5 h-5 text-red-400" /> Algo Risk Engine Guardrails
                            </h2>
                            <p className="text-xs text-gray-500">Configure global safety boundaries for automated trade execution.</p>
                        </div>
                    </div>

                    <form onSubmit={handleSaveRisk} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="label-text">Max Daily Loss Limit (₹)</label>
                                <input
                                    type="number"
                                    value={riskSettings.max_daily_loss}
                                    onChange={e => setRiskSettings(s => ({ ...s, max_daily_loss: Number(e.target.value) }))}
                                    className="input-field text-xs" />
                            </div>
                            <div>
                                <label className="label-text">Max Simultaneous Active Algos</label>
                                <input
                                    type="number"
                                    value={riskSettings.max_active_algos}
                                    onChange={e => setRiskSettings(s => ({ ...s, max_active_algos: Number(e.target.value) }))}
                                    className="input-field text-xs" />
                            </div>
                            <div>
                                <label className="label-text">Auto Square-Off IST Time</label>
                                <input
                                    type="text"
                                    value={riskSettings.auto_squareoff_time}
                                    onChange={e => setRiskSettings(s => ({ ...s, auto_squareoff_time: e.target.value }))}
                                    className="input-field text-xs" placeholder="15:15" />
                            </div>
                            <div>
                                <label className="label-text">Global Hard Stop-Loss %</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={riskSettings.global_stop_loss_pct}
                                    onChange={e => setRiskSettings(s => ({ ...s, global_stop_loss_pct: Number(e.target.value) }))}
                                    className="input-field text-xs" />
                            </div>
                            <div>
                                <label className="label-text">Max Capital Allocation Per Algo (₹)</label>
                                <input
                                    type="number"
                                    value={riskSettings.max_capital_per_algo}
                                    onChange={e => setRiskSettings(s => ({ ...s, max_capital_per_algo: Number(e.target.value) }))}
                                    className="input-field text-xs" />
                            </div>
                            <div>
                                <label className="label-text">Min Risk-to-Reward Ratio</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={riskSettings.risk_reward_min_ratio}
                                    onChange={e => setRiskSettings(s => ({ ...s, risk_reward_min_ratio: Number(e.target.value) }))}
                                    className="input-field text-xs" />
                            </div>
                        </div>

                        <div className="flex items-center gap-3 pt-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={riskSettings.trailing_stop_loss_enabled}
                                    onChange={e => setRiskSettings(s => ({ ...s, trailing_stop_loss_enabled: e.target.checked }))}
                                    className="rounded border-edge/20 bg-surface-800 text-primary-500 focus:ring-primary-500" />
                                <span className="text-xs font-medium text-gray-300">Enable Dynamic Trailing Stop-Loss on Profit Accumulation</span>
                            </label>
                        </div>

                        <button type="submit" disabled={saving} className="btn-primary text-xs py-2 px-5 inline-flex items-center gap-2">
                            <Shield className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save Global Risk Guardrails'}
                        </button>
                    </form>
                </div>

                {/* Analytical Diagnostics Card */}
                <div className="rounded-2xl border border-edge/10 bg-surface-900/60 p-5 lg:p-6 space-y-4">
                    <h2 className="text-base font-bold text-heading flex items-center gap-2 border-b border-edge/5 pb-3">
                        <Activity className="w-5 h-5 text-primary-500" /> Operational Health & Diagnostics
                    </h2>

                    <div className="space-y-3 text-xs">
                        <div className="flex justify-between p-3 rounded-lg bg-surface-800/40 border border-edge/5">
                            <span className="text-gray-400">Trading Session State:</span>
                            <span className="font-semibold text-emerald-400 flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Active Simulation Engine
                            </span>
                        </div>
                        <div className="flex justify-between p-3 rounded-lg bg-surface-800/40 border border-edge/5">
                            <span className="text-gray-400">Signal Confirmation Engine:</span>
                            <span className="font-semibold text-heading">Multi-Indicator Confluence Matrix</span>
                        </div>
                        <div className="flex justify-between p-3 rounded-lg bg-surface-800/40 border border-edge/5">
                            <span className="text-gray-400">Order Routing:</span>
                            <span className="font-semibold text-primary-400">Instant Automated Matching</span>
                        </div>
                        <div className="flex justify-between p-3 rounded-lg bg-surface-800/40 border border-edge/5">
                            <span className="text-gray-400">Risk Engine Filtering:</span>
                            <span className="font-semibold text-emerald-400">Strict SL/TP Pre-Check (Passed)</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Modals ────────────────────────────────────────────────────────────────────
function EditModal({ strategy, onClose, onSave }) {
    const [form, setForm] = useState({
        name: strategy.name,
        description: strategy.description || '',
        max_position_size: strategy.max_position_size,
        stop_loss_percent: strategy.stop_loss_percent,
        take_profit_percent: strategy.take_profit_percent,
        parameters: { ...getDefaultParams(strategy.strategy_type), ...(strategy.parameters || {}) },
    });
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try { await onSave(strategy.id, form); }
        finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-lg bg-surface-800 border border-edge/10 rounded-2xl shadow-2xl animate-slide-up">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-edge/5">
                    <h3 className="text-sm font-semibold text-heading">Edit Strategy Configuration</h3>
                    <button onClick={onClose} className="p-1 rounded hover:bg-surface-700 text-gray-500 hover:text-heading transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                            <label className="label-text">Name</label>
                            <input type="text" value={form.name} required
                                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-field" />
                        </div>
                        <div>
                            <label className="label-text">Max Position Size</label>
                            <input type="number" value={form.max_position_size}
                                onChange={e => setForm(f => ({ ...f, max_position_size: parseNumericInput(e.target.value, 100, 1, 100000, null) }))} className="input-field" />
                        </div>
                        <div>
                            <label className="label-text">Stop Loss %</label>
                            <input type="number" step="0.1" value={form.stop_loss_percent}
                                onChange={e => setForm(f => ({ ...f, stop_loss_percent: parseNumericInput(e.target.value, 2, 0.1, 50, 2) }))} className="input-field" />
                        </div>
                        <div>
                            <label className="label-text">Take Profit %</label>
                            <input type="number" step="0.1" value={form.take_profit_percent}
                                onChange={e => setForm(f => ({ ...f, take_profit_percent: parseNumericInput(e.target.value, 5, 0.1, 200, 2) }))} className="input-field" />
                        </div>
                    </div>
                    {strategy.strategy_type !== 'COMPOSITE' && (
                        <div>
                            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                {STRATEGY_TYPES.find(t => t.value === strategy.strategy_type)?.label} Parameters
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                                <ParamFields type={strategy.strategy_type} params={form.parameters}
                                    onChange={p => setForm(f => ({ ...f, parameters: p }))} />
                            </div>
                        </div>
                    )}
                    <div>
                        <label className="label-text">Description</label>
                        <textarea value={form.description} rows="2"
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input-field resize-none text-xs" />
                    </div>
                    <div className="flex gap-3 pt-1">
                        <button type="submit" disabled={saving} className="btn-primary text-sm inline-flex items-center gap-2">
                            {saving ? 'Saving…' : 'Save Changes'}
                        </button>
                        <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function NewStrategyModal({ onClose, onCreate, initialData }) {
    const [form, setForm] = useState(initialData || getInitialForm());
    const [creating, setCreating] = useState(false);

    const handleTypeChange = (type) => {
        setForm(f => ({ ...f, strategy_type: type, parameters: getDefaultParams(type) }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const payload = buildCreatePayload(form);
        if (!payload.name) { toast.error('Strategy name is required'); return; }
        if (!payload.symbol) { toast.error('Symbol is required'); return; }
        setCreating(true);
        try { await onCreate(payload); }
        finally { setCreating(false); }
    };

    const typeMeta = STRATEGY_TYPES.find(t => t.value === form.strategy_type) || {};

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-2xl bg-surface-800 border border-edge/10 rounded-2xl shadow-2xl animate-slide-up">
                <div className="flex items-center justify-between px-6 py-4 border-b border-edge/5">
                    <div>
                        <h3 className="text-base font-semibold text-heading">New Algo Strategy</h3>
                        <p className="text-xs text-gray-500 mt-0.5">Deploy automated indicator trading strategy</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-700 text-gray-500 hover:text-heading transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
                    <div>
                        <label className="label-text mb-1.5 block">Market Segment</label>
                        <SegmentSelector value={form.segment || 'EQUITY'} onChange={seg => setForm(f => ({ ...f, segment: seg }))} />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="label-text">Strategy Name *</label>
                            <input type="text" value={form.name} required
                                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                placeholder="e.g. Nifty EMA Scalper"
                                className="input-field" />
                        </div>
                        <div>
                            <label className="label-text">Symbol (Suggestions) *</label>
                            <SymbolAutoComplete value={form.symbol}
                                segment={form.segment || 'EQUITY'}
                                onChange={sym => setForm(f => ({ ...f, symbol: sym }))}
                                placeholder="Type symbol e.g. RELIANCE, NIFTY50" />
                        </div>
                        <div>
                            <label className="label-text">Strategy Type</label>
                            <select value={form.strategy_type}
                                onChange={e => handleTypeChange(e.target.value)}
                                className="input-field cursor-pointer">
                                {STRATEGY_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="label-text">Max Position Size</label>
                            <input type="number" value={form.max_position_size}
                                onChange={e => setForm(f => ({ ...f, max_position_size: parseNumericInput(e.target.value, 100, 1, 100000, null) }))}
                                className="input-field" />
                        </div>
                        <div>
                            <label className="label-text">Stop Loss %</label>
                            <input type="number" step="0.1" value={form.stop_loss_percent}
                                onChange={e => setForm(f => ({ ...f, stop_loss_percent: parseNumericInput(e.target.value, 2, 0.1, 50, 2) }))}
                                className="input-field" />
                        </div>
                        <div>
                            <label className="label-text">Take Profit %</label>
                            <input type="number" step="0.1" value={form.take_profit_percent}
                                onChange={e => setForm(f => ({ ...f, take_profit_percent: parseNumericInput(e.target.value, 5, 0.1, 200, 2) }))}
                                className="input-field" />
                        </div>
                        <div>
                            <label className="label-text flex items-center gap-1.5">
                                <Clock className="w-3 h-3 text-amber-400" /> Candle Interval
                            </label>
                            <select value={form.candle_interval || '5m'}
                                onChange={e => setForm(f => ({ ...f, candle_interval: e.target.value }))}
                                className="input-field cursor-pointer">
                                {CANDLE_INTERVALS.map(ci => (
                                    <option key={ci.value} value={ci.value}>
                                        {ci.label} — {ci.hint}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {form.strategy_type !== 'COMPOSITE' && (
                        <div className="rounded-xl border border-edge/5 bg-surface-900/50 p-4">
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                                    {typeMeta.label} Parameters
                                </p>
                            </div>
                            {typeMeta.desc && (
                                <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">{typeMeta.desc}</p>
                            )}
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                <ParamFields type={form.strategy_type} params={form.parameters}
                                    onChange={p => setForm(f => ({ ...f, parameters: p }))} />
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="label-text">Description</label>
                        <textarea value={form.description} rows="2"
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            placeholder="Describe your strategy logic..."
                            className="input-field resize-none text-xs" />
                    </div>

                    <div className="flex gap-3 pt-1">
                        <button type="submit" disabled={creating}
                            className="btn-primary text-sm inline-flex items-center gap-2">
                            <Zap className="w-4 h-4" />
                            {creating ? 'Creating…' : 'Create & Deploy Strategy'}
                        </button>
                        <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function LogsModal({ strategyName, logs, onClose }) {
    const levelStyle = {
        ERROR: 'bg-red-500/10 text-red-400',
        TRADE: 'bg-primary-500/10 text-primary-500',
        WARNING: 'bg-amber-500/10 text-amber-400',
        INFO: 'bg-surface-700 text-gray-400',
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-xl bg-surface-800 border border-edge/10 rounded-2xl shadow-2xl">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-edge/5">
                    <div>
                        <h3 className="text-sm font-semibold text-heading">Strategy Log Stream</h3>
                        <p className="text-xs text-gray-500">{strategyName}</p>
                    </div>
                    <button onClick={onClose} className="p-1 rounded hover:bg-surface-700 text-gray-500 hover:text-heading transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="p-4 max-h-[60vh] overflow-y-auto space-y-1 font-mono text-xs">
                    {logs.length === 0 ? (
                        <div className="text-center py-10 text-gray-600 font-sans">
                            <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
                            <p className="text-sm">No activity logs available</p>
                        </div>
                    ) : logs.map(l => (
                        <div key={l.id} className="flex items-start gap-2.5 py-2 border-b border-edge/[0.03]">
                            <span className={cn('text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 font-bold', levelStyle[l.level] || levelStyle.INFO)}>
                                {l.level}
                            </span>
                            <span className="text-gray-300 flex-1 text-xs">{l.message}</span>
                            <span className="text-gray-500 text-[10px] ml-auto flex-shrink-0">
                                {l.created_at ? new Date(l.created_at).toLocaleTimeString() : ''}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ── Main Page Component ───────────────────────────────────────────────────────
export default function AlgoTradingPage() {
    const [tab, setTab] = useState('overview');
    const [strategies, setStrategies] = useState([]);
    const [stats, setStats] = useState(null);
    const [chartData, setChartData] = useState({ labels: [], values: [] });
    const [chartRange, setChartRange] = useState('1W');
    const [signals, setSignals] = useState([]);
    const [loading, setLoading] = useState(true);

    const [showNewStrategy, setShowNewStrategy] = useState(false);
    const [modalInitialData, setModalInitialData] = useState(null);
    const [editStrategy, setEditStrategy] = useState(null);
    const [logsData, setLogsData] = useState(null);
    const [openMenu, setOpenMenu] = useState(null);
    const [defaultBacktestConfig, setDefaultBacktestConfig] = useState(null);

    // ── Data loading ────────────────────────────────────────────────────────
    const loadData = useCallback(async (range = '1W') => {
        try {
            const [strategiesRes, statsRes, chartRes, signalsRes] = await Promise.allSettled([
                api.get('/algo/strategies'),
                api.get('/algo/overview-stats'),
                api.get(`/algo/performance-chart?range=${range}`),
                api.get('/algo/recent-signals'),
            ]);

            if (strategiesRes.status === 'fulfilled') setStrategies(strategiesRes.value.data.strategies || []);
            if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
            if (chartRes.status === 'fulfilled') setChartData(chartRes.value.data || { labels: [], values: [] });
            if (signalsRes.status === 'fulfilled') setSignals(signalsRes.value.data.signals || []);

            if (strategiesRes.status === 'rejected') {
                toast.error(parseApiError(strategiesRes.reason, 'Failed to load strategies'));
            }
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to load algo data'));
        } finally {
            setLoading(false);
        }
    }, []);

    const initPage = useCallback(async () => {
        try {
            await api.post('/algo/ensure-defaults');
        } catch {}
        await loadData(chartRange);
    }, [loadData, chartRange]);

    useEffect(() => { initPage(); }, [initPage]);

    const handleRangeChange = async (range) => {
        setChartRange(range);
        try {
            const res = await api.get(`/algo/performance-chart?range=${range}`);
            setChartData(res.data || { labels: [], values: [] });
        } catch {}
    };

    // ── Actions ─────────────────────────────────────────────────────────────
    const handleToggle = async (id) => {
        try {
            const res = await api.put(`/algo/strategies/${id}/toggle`);
            toast.success(res.data.message);
            await loadData(chartRange);
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to toggle strategy'));
        }
    };

    const handleRunNow = async (id, force = false) => {
        try {
            const url = `/algo/strategies/${id}/execute-now${force ? '?force=true' : ''}`;
            const res = await api.post(url);
            const outcome = res.data;
            if (outcome.order_executed) {
                toast.success(`Trade Executed: ${outcome.signal} ${outcome.symbol} @ ₹${outcome.current_price}`);
            } else {
                toast(`Evaluated: ${outcome.signal} signal (${outcome.reason})`, { icon: '⚡' });
            }
            await loadData(chartRange);
        } catch (err) {
            toast.error(parseApiError(err, 'Execution trigger failed'));
        }
    };

    const handleDelete = async (id) => {
        const strategy = strategies.find(s => s.id === id);
        if (!strategy) return;

        const confirmed = window.confirm(
            strategy.is_active
                ? `"${strategy.name}" is currently RUNNING.\nThis will first stop it, then permanently delete it.\n\nContinue?`
                : `Permanently delete "${strategy.name}"?\n\nThis cannot be undone.`
        );
        if (!confirmed) return;

        try {
            // Auto-stop if still active
            if (strategy.is_active) {
                toast.loading('Stopping strategy...', { id: 'del-' + id });
                await api.put(`/algo/strategies/${id}/toggle`);
            }
            toast.loading('Deleting strategy...', { id: 'del-' + id });
            await api.delete(`/algo/strategies/${id}`);
            toast.success('Strategy deleted', { id: 'del-' + id });
            setStrategies(prev => prev.filter(s => s.id !== id));
            await loadData(chartRange);
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to delete strategy'), { id: 'del-' + id });
        }
    };

    const handleUpdate = async (id, data) => {
        try {
            await api.put(`/algo/strategies/${id}`, data);
            toast.success('Strategy updated');
            setEditStrategy(null);
            await loadData(chartRange);
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to update strategy'));
        }
    };

    const handleCreate = async (payload) => {
        try {
            const res = await api.post('/algo/strategies', payload);
            toast.success('Strategy created and deployed!');
            setShowNewStrategy(false);
            setModalInitialData(null);
            const created = res?.data?.strategy;
            if (created?.id) setStrategies(prev => [created, ...prev]);
            await loadData(chartRange);
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to create strategy'));
            throw err;
        }
    };

    const handleViewLogs = async (id) => {
        const s = strategies.find(x => x.id === id);
        try {
            const res = await api.get(`/algo/strategies/${id}/logs`);
            setLogsData({ strategyName: s?.name || 'Strategy', logs: res.data.logs || [] });
        } catch {
            toast.error('Failed to load logs');
        }
    };

    const handleCloneMarketplaceTemplate = (tpl) => {
        setModalInitialData({
            name: `${tpl.name} (Copy)`,
            strategy_type: tpl.strategy_type,
            symbol: tpl.symbol,
            description: tpl.description,
            max_position_size: 100,
            stop_loss_percent: tpl.stop_loss_percent,
            take_profit_percent: tpl.take_profit_percent,
            parameters: tpl.parameters,
        });
        setShowNewStrategy(true);
    };

    const handlePreviewBacktest = (tpl) => {
        setDefaultBacktestConfig({
            symbol: tpl.symbol,
            strategy_type: tpl.strategy_type,
            stop_loss_percent: tpl.stop_loss_percent,
            take_profit_percent: tpl.take_profit_percent,
            parameters: tpl.parameters,
        });
        setTab('backtesting');
    };

    // ── Computed ─────────────────────────────────────────────────────────────
    const activeStrategies = strategies.filter(s => s.is_active);
    const topPerformers = [...strategies].sort((a, b) => Number(b.total_pnl) - Number(a.total_pnl)).slice(0, 5);

    const donutSegments = (() => {
        const counts = {};
        strategies.forEach(s => {
            const tf = TIMEFRAME_MAP[s.strategy_type] || 'Intraday';
            counts[tf] = (counts[tf] || 0) + 1;
        });
        const total = strategies.length || 1;
        return Object.entries(counts).map(([label, count]) => ({
            label,
            count,
            pct: Math.round((count / total) * 100),
            color: DONUT_COLORS[label] || '#6b7280',
        }));
    })();

    const totalPnl = stats?.total_pnl ?? 0;
    const isProfit = totalPnl >= 0;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    const handleAlgoKillSwitch = async () => {
        if (!confirm('Algo Kill Switch: Stop ALL running automated trading strategies immediately?')) return;
        try {
            const res = await api.post('/algo/kill-switch');
            toast.success(res.data?.message || 'All automated strategies stopped');
            await loadData(chartRange);
        } catch (err) {
            toast.error(parseApiError(err, 'Kill switch failed'));
        }
    };

    return (
        <div className="p-4 lg:p-6 space-y-5 animate-fade-in">
            {/* ── Header ── */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-display font-bold text-heading flex items-center gap-2">
                        <Zap className="w-6 h-6 text-primary-500" /> Quantitative Algo Trading Engine
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">Automate, backtest, and deploy high-probability algorithmic trading strategies.</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                        onClick={handleAlgoKillSwitch}
                        className="px-3.5 py-2 rounded-lg bg-red-500/15 text-red-500 hover:bg-red-500/25 border border-red-500/30 text-sm font-bold inline-flex items-center gap-1.5 transition-colors"
                        title="Stop all automated strategies immediately"
                    >
                        <AlertTriangle className="w-4 h-4" /> KILL SWITCH
                    </button>
                    <button
                        onClick={() => setTab('builder')}
                        className="btn-secondary text-sm inline-flex items-center gap-2 py-2 px-4">
                        <Layers className="w-4 h-4 text-primary-400" /> Multi-Strategy Builder
                    </button>
                    <button
                        onClick={() => { setModalInitialData(null); setShowNewStrategy(true); }}
                        className="btn-primary text-sm inline-flex items-center gap-2 py-2 px-4">
                        <Plus className="w-4 h-4" /> New Strategy
                    </button>
                </div>
            </div>

            {/* ── Stats Bar ── */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard icon={Activity} iconBg="bg-emerald-500/10 text-emerald-400" label="Active Algos" value={activeStrategies.length} sub="Automated Execution" subColor="text-emerald-500" />
                <StatCard icon={Zap} iconBg="bg-primary-500/10 text-primary-500" label="Total Strategies" value={strategies.length} sub="Deployed" subColor="text-gray-500" />
                <StatCard icon={isProfit ? TrendingUp : TrendingDown} iconBg={isProfit ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'} label="Total P&L" value={fmtCompact(totalPnl)} sub={totalPnl === 0 ? 'No trades yet' : `${totalPnl >= 0 ? '+' : ''}${((totalPnl / (Math.abs(totalPnl) + 1)) * 100).toFixed(2)}%`} subColor={isProfit ? 'text-emerald-500' : 'text-red-500'} />
                <StatCard icon={Target} iconBg="bg-amber-500/10 text-amber-400" label="Avg Win Rate" value={`${(stats?.avg_win_rate ?? 0).toFixed(2)}%`} sub="Across All Strategies" subColor="text-gray-500" />
                <StatCard icon={Shield} iconBg="bg-red-500/10 text-red-400" label="Max Drawdown" value={`${(stats?.avg_max_drawdown ?? 0).toFixed(2)}%`} sub="Risk Exposure" subColor="text-red-500" />
                <StatCard icon={BarChart2} iconBg="bg-blue-500/10 text-blue-400" label="Sharpe Ratio" value={(stats?.avg_sharpe_ratio ?? 0).toFixed(2)} sub={stats?.avg_sharpe_ratio > 1 ? 'Optimal' : 'Positive'} subColor={stats?.avg_sharpe_ratio > 1 ? 'text-emerald-500' : 'text-gray-500'} />
            </div>

            {/* ── Navigation Tabs ── */}
            <div className="flex border-b border-edge/10 gap-0 overflow-x-auto scrollbar-hide">
                {TABS.map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        className={cn(
                            'flex-shrink-0 px-4 py-2.5 text-sm font-medium relative transition-colors whitespace-nowrap',
                            tab === t.id
                                ? 'text-primary-500 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary-500 after:rounded-t font-semibold'
                                : 'text-gray-500 hover:text-gray-300'
                        )}>
                        {t.label}
                    </button>
                ))}
            </div>

            {/* ── Tab Content ── */}
            {tab === 'overview' && (
                <div className="space-y-5">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                        {/* Active Strategies */}
                        <div className="lg:col-span-2 rounded-xl border border-edge/5 bg-surface-900/60 overflow-hidden">
                            <div className="flex items-center justify-between px-5 py-3.5 border-b border-edge/5">
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                    <h2 className="text-sm font-semibold text-heading">Active Algorithmic Strategies</h2>
                                </div>
                                <button onClick={() => setTab('my-strategies')} className="text-xs text-primary-500 hover:text-primary-400 flex items-center gap-1 transition-colors">
                                    View All ({strategies.length}) <ChevronRight className="w-3 h-3" />
                                </button>
                            </div>

                            {activeStrategies.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 gap-3">
                                    <div className="w-12 h-12 rounded-xl bg-surface-800 border border-edge/5 flex items-center justify-center">
                                        <Zap className="w-6 h-6 text-gray-600" />
                                    </div>
                                    <p className="text-sm font-medium text-gray-400">No active strategies running</p>
                                    <p className="text-xs text-gray-600 text-center max-w-xs">
                                        Click Play on any strategy or run Instant Execution to generate live trades.
                                    </p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-edge/5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                                                {['Strategy Name', 'Status', 'Total PnL', "Today's P&L", 'Win Rate', 'Sharpe', 'Actions'].map(h => (
                                                    <th key={h} className="px-4 py-2.5">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {activeStrategies.slice(0, 5).map(s => (
                                                <StrategyRow
                                                    key={s.id} s={s}
                                                    onToggle={handleToggle}
                                                    onRunNow={handleRunNow}
                                                    onEdit={setEditStrategy}
                                                    onDelete={handleDelete}
                                                    onViewLogs={handleViewLogs}
                                                    menuOpen={openMenu === s.id}
                                                    onMenuOpen={setOpenMenu}
                                                />
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* P&L Chart */}
                        <div className="rounded-xl border border-edge/5 bg-surface-900/60 overflow-hidden">
                            <div className="flex items-center justify-between px-5 py-3.5 border-b border-edge/5">
                                <h2 className="text-sm font-semibold text-heading">P&L Performance Growth</h2>
                            </div>
                            <div className="px-4 pt-4 pb-2">
                                <PnLChart labels={chartData.labels} values={chartData.values} />
                            </div>
                            <div className="flex items-center justify-center gap-1 px-4 pb-4">
                                {CHART_RANGES.map(r => (
                                    <button key={r} onClick={() => handleRangeChange(r)}
                                        className={cn('px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors',
                                            chartRange === r ? 'bg-primary-500/15 text-primary-500 border border-primary-500/30' : 'text-gray-500 hover:text-gray-300 hover:bg-surface-700/50')}>
                                        {r}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Bottom Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Top Performers */}
                        <div className="rounded-xl border border-edge/5 bg-surface-900/60 p-4">
                            <h3 className="text-xs font-semibold text-heading mb-3">Top Performers</h3>
                            <div className="space-y-2">
                                {topPerformers.map((s, i) => (
                                    <div key={s.id} className="flex items-center gap-2.5">
                                        <span className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0',
                                            i === 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-surface-700/50 text-gray-500')}>{i + 1}</span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-medium text-heading truncate">{s.name}</p>
                                        </div>
                                        <p className={cn('text-xs font-price font-semibold tabular-nums', pnlColorClass(s.total_pnl))}>
                                            {fmtCompact(s.total_pnl)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Recent Signals */}
                        <div className="rounded-xl border border-edge/5 bg-surface-900/60 p-4">
                            <h3 className="text-xs font-semibold text-heading mb-3">Recent Trade Signals</h3>
                            {signals.length === 0 ? (
                                <p className="text-xs text-gray-600 text-center py-4">No recent trade signals</p>
                            ) : (
                                <div className="space-y-2.5">
                                    {signals.map((sig, i) => (
                                        <div key={i} className="flex items-start gap-2 text-xs">
                                            <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded uppercase',
                                                sig.side === 'BUY' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400')}>
                                                {sig.side}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-heading truncate">{sig.strategy_name}</p>
                                                <p className="text-[10px] text-gray-500">{cleanSymbol(sig.symbol)} @ ₹{Number(sig.price).toFixed(2)}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Strategies by Category */}
                        <div className="rounded-xl border border-edge/5 bg-surface-900/60 p-4">
                            <h3 className="text-xs font-semibold text-heading mb-3">Strategy Distribution</h3>
                            <div className="flex items-center gap-3">
                                <DonutChart segments={donutSegments} total={strategies.length} />
                                <div className="space-y-1.5 min-w-0">
                                    {donutSegments.map((seg, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: seg.color }} />
                                            <span className="text-[11px] text-gray-400 truncate">{seg.label}</span>
                                            <span className="text-[11px] font-semibold text-heading ml-auto">{seg.count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Quick Action Matrix */}
                        <div className="rounded-xl border border-edge/5 bg-surface-900/60 p-4 space-y-2">
                            <h3 className="text-xs font-semibold text-heading mb-2">Quick Actions</h3>
                            <button onClick={() => setTab('builder')} className="w-full btn-secondary text-xs py-2 inline-flex items-center gap-2">
                                <Layers className="w-3.5 h-3.5 text-primary-400" /> Multi-Strategy Builder
                            </button>
                            <button onClick={() => setTab('backtesting')} className="w-full btn-secondary text-xs py-2 inline-flex items-center gap-2">
                                <BarChart2 className="w-3.5 h-3.5 text-cyan-400" /> Backtest Engine
                            </button>
                            <button onClick={() => setTab('marketplace')} className="w-full btn-secondary text-xs py-2 inline-flex items-center gap-2">
                                <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Explore Marketplace
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {tab === 'my-strategies' && (
                <div className="rounded-xl border border-edge/5 bg-surface-900/60 overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-3.5 border-b border-edge/5">
                        <h2 className="text-sm font-semibold text-heading">Deployed Algo Strategies ({strategies.length})</h2>
                        <button onClick={() => { setModalInitialData(null); setShowNewStrategy(true); }} className="btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1">
                            <Plus className="w-3.5 h-3.5" /> New Strategy
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-edge/5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                                    {['Strategy Name', 'Status', 'Total PnL', "Today's P&L", 'Win Rate', 'Sharpe', 'Actions'].map(h => (
                                        <th key={h} className="px-4 py-2.5">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {strategies.map(s => (
                                    <StrategyRow
                                        key={s.id} s={s}
                                        onToggle={handleToggle}
                                        onRunNow={handleRunNow}
                                        onEdit={setEditStrategy}
                                        onDelete={handleDelete}
                                        onViewLogs={handleViewLogs}
                                        menuOpen={openMenu === s.id}
                                        onMenuOpen={setOpenMenu}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {tab === 'builder' && (
                <StrategyBuilderTab
                    onCreate={handleCreate}
                    onBacktest={(cfg) => {
                        setDefaultBacktestConfig(cfg);
                        setTab('backtesting');
                    }}
                />
            )}

            {tab === 'backtesting' && (
                <BacktestingTab
                    userStrategies={strategies}
                    defaultBacktestConfig={defaultBacktestConfig}
                />
            )}

            {tab === 'marketplace' && (
                <MarketplaceTab
                    onClone={handleCloneMarketplaceTemplate}
                    onPreviewBacktest={handlePreviewBacktest}
                />
            )}

            {tab === 'logs' && (
                <div className="space-y-3">
                    {strategies.map(s => (
                        <div key={s.id} className="rounded-xl border border-edge/5 bg-surface-900/60 p-4 flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-semibold text-heading flex items-center gap-2">
                                    <StatusBadge isActive={s.is_active} /> {s.name}
                                </h3>
                                <p className="text-xs text-gray-500 mt-0.5">{cleanSymbol(s.symbol)} · {s.total_trades} trades executed · {fmtPnl(s.total_pnl)} total P&L</p>
                            </div>
                            <button onClick={() => handleViewLogs(s.id)} className="btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5" /> View Activity Stream
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {tab === 'performance' && <PerformanceAndRiskTab />}

            {/* ── Modals ── */}
            {showNewStrategy && (
                <NewStrategyModal
                    initialData={modalInitialData}
                    onClose={() => { setShowNewStrategy(false); setModalInitialData(null); }}
                    onCreate={handleCreate}
                />
            )}
            {editStrategy && (
                <EditModal
                    strategy={editStrategy}
                    onClose={() => setEditStrategy(null)}
                    onSave={handleUpdate}
                />
            )}
            {logsData && (
                <LogsModal
                    strategyName={logsData.strategyName}
                    logs={logsData.logs}
                    onClose={() => setLogsData(null)}
                />
            )}
        </div>
    );
}
