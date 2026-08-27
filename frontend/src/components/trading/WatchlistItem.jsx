import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../utils/cn';
import { formatPrice, formatPercent } from '../../utils/formatters';
import { getConstituents } from '../../utils/indexConstituents';
import { TrendingUp, TrendingDown, BarChart2, Trash2 } from 'lucide-react';
import api from '../../services/api';

const formatSignedNumber = (value, decimals = 2) => {
    if (value == null || Number.isNaN(Number(value))) return '—';
    const num = Number(value);
    const sign = num > 0 ? '+' : '';
    return `${sign}${num.toFixed(decimals)}`;
};

/**
 * Modernized Watchlist Row
 * — Live price tick flash (emerald / rose)
 * — Visual exchange badges (BSE amber/gold, NSE cyan/blue)
 * — High-precision tabular typography & geometric trend icons
 * — Glassmorphic action overlays on hover
 * — Smooth expandable constituent stocks
 */
const WatchlistItem = memo(function WatchlistItem({
    item,
    price = {},
    isSelected,
    onSelect,
    onRemove,
    onBuy,
    onSell,
}) {
    const navigate = useNavigate();
    const [hovered, setHovered] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [constituentPrices, setConstituentPrices] = useState({});
    const [loadingConstituents, setLoadingConstituents] = useState(false);

    const constituents = getConstituents(item.symbol);
    const isIndex = constituents !== null;

    // ── Fetch constituent prices when expanded ────────────────────────────────
    const constituentSuffix = (item.exchange || '').toUpperCase() === 'BSE' ? '.BO' : '.NS';
    const fetchConstituentPrices = useCallback(async () => {
        if (!constituents || constituents.length === 0) return;
        setLoadingConstituents(true);
        try {
            const symbols = constituents.map(s => `${s}${constituentSuffix}`).join(',');
            const res = await api.get(`/market/batch?symbols=${encodeURIComponent(symbols)}`);
            const quotes = res.data?.quotes ?? {};
            const normalized = {};
            Object.entries(quotes).forEach(([k, v]) => {
                const upper = k.toUpperCase();
                normalized[upper] = v;
                normalized[upper.replace(/\.(NS|BO)$/i, '')] = v;
            });
            setConstituentPrices(normalized);
        } catch {
            // silently ignore — prices stay empty
        } finally {
            setLoadingConstituents(false);
        }
    }, [constituents, constituentSuffix]);

    const handleExpandToggle = useCallback((e) => {
        e.stopPropagation();
        setIsExpanded(prev => {
            const next = !prev;
            if (next) fetchConstituentPrices();
            return next;
        });
    }, [fetchConstituentPrices]);

    const changeVal = Number(price?.change ?? price?.change_percent ?? 0);
    const changePositive = changeVal >= 0;
    const rawSymbol = String(item.symbol || '');
    const symbol = rawSymbol.replace('.NS', '').replace('.BO', '').replace(/^\^/, '');
    const exchange = item.exchange || (rawSymbol.endsWith('.BO') ? 'BSE' : 'NSE');
    const isBse = String(exchange).toUpperCase() === 'BSE';
    const chartSymbol = rawSymbol.startsWith('^') || rawSymbol.endsWith('.NS') || rawSymbol.endsWith('.BO')
        ? rawSymbol
        : isBse ? `${rawSymbol}.BO` : `${rawSymbol}.NS`;

    return (
        <div className="border-b border-edge/5 transition-colors group">
            {/* ── Main row ─────────────────────────────────────────────────────── */}
            <div
                onClick={onSelect}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                className={cn(
                    'relative flex items-center justify-between px-3.5 py-2.5 cursor-pointer transition-colors duration-150 select-none',
                    isSelected
                        ? 'bg-primary-500/10 dark:bg-primary-900/20 border-l-[3px] border-l-primary-500'
                        : 'border-l-[3px] border-l-transparent hover:bg-surface-800/40 dark:hover:bg-surface-800/60',
                )}
            >
                {/* ── Left: symbol + exchange badge + company name ─────────────── */}
                <div className="flex-1 min-w-0 flex items-center gap-2">
                    {isIndex && (
                        <button
                            onClick={handleExpandToggle}
                            className="flex-shrink-0 p-1 rounded-md text-slate-400 hover:text-primary-500 hover:bg-surface-800/70 transition-colors"
                            title={isExpanded ? 'Collapse constituents' : 'Expand constituents'}
                        >
                            <svg
                                className={cn('w-3 h-3 transition-transform duration-200', isExpanded && 'rotate-90')}
                                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                                strokeLinecap="round" strokeLinejoin="round"
                            >
                                <path d="M9 18l6-6-6-6" />
                            </svg>
                        </button>
                    )}
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                            <span className="font-bold text-[13px] text-heading tracking-tight group-hover:text-primary-500 transition-colors truncate">
                                {symbol}
                            </span>
                            <span
                                className={cn(
                                    'inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase border leading-none',
                                    isBse
                                        ? 'bg-amber-500/10 text-amber-500 border-amber-500/20 dark:bg-amber-500/15 dark:text-amber-400'
                                        : 'bg-blue-500/10 text-blue-500 border-blue-500/20 dark:bg-blue-500/15 dark:text-blue-400'
                                )}
                            >
                                {exchange}
                            </span>
                        </div>
                        {item.company_name ? (
                            <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-[130px] mt-0.5 font-sans">
                                {item.company_name}
                            </div>
                        ) : (
                            <div className="text-[10px] text-gray-600 dark:text-gray-500 truncate max-w-[130px] mt-0.5 font-sans">
                                {isBse ? 'BSE Equities' : 'NSE Equities'}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Right: price & trend badge + hover actions ─────────────────── */}
                <div className="flex-shrink-0 flex items-center gap-2">
                    {/* Hover quick action buttons */}
                    {hovered && (
                        <div className="flex items-center gap-1 animate-in fade-in zoom-in-95 duration-150">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/terminal?symbol=${encodeURIComponent(chartSymbol)}`);
                                }}
                                className="p-1 rounded-md text-gray-400 hover:text-primary-500 hover:bg-primary-500/10 transition-colors"
                                title="Open Chart"
                            >
                                <BarChart2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); onBuy?.(chartSymbol); }}
                                className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-all shadow-sm active:scale-95 leading-none"
                                title="Buy"
                            >
                                B
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); onSell?.(chartSymbol); }}
                                className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-500 hover:bg-rose-400 text-white transition-all shadow-sm active:scale-95 leading-none"
                                title="Sell"
                            >
                                S
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); onRemove?.(item.id); }}
                                className="p-1 rounded-md text-gray-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                                title="Remove from Watchlist"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )}

                    {/* Price & Change Column */}
                    <div
                        className={cn(
                            'flex flex-col items-end transition-opacity duration-200',
                            price?.price != null ? 'opacity-100' : 'opacity-40'
                        )}
                    >
                        <span className="text-[13px] font-mono font-bold text-heading tabular-nums tracking-tight">
                            {price?.price != null ? formatPrice(price.price) : '—'}
                        </span>
                        <div
                            className={cn(
                                'flex items-center gap-0.5 text-[10px] font-mono font-medium tabular-nums mt-0.5',
                                changePositive
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-rose-600 dark:text-rose-400'
                            )}
                        >
                            <span>
                                {price?.change != null && price?.change_percent != null
                                    ? `${formatSignedNumber(price.change, 2)} (${formatPercent(price.change_percent, 2)})`
                                    : '—'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Constituent stocks sub-list ───────────────────────────────────── */}
            {isIndex && isExpanded && (
                <div className="bg-surface-900/80 border-l-[3px] border-l-primary-500/40 pl-2">
                    {loadingConstituents ? (
                        <div className="flex items-center justify-center py-3 text-[11px] text-gray-500 font-sans">
                            Loading constituents...
                        </div>
                    ) : (
                        <div className="max-h-64 overflow-y-auto divide-y divide-edge/5">
                            {constituents.map(base => {
                                const sym = `${base}${constituentSuffix}`;
                                const p = constituentPrices[sym] ?? constituentPrices[base] ?? {};
                                const chg = Number(p.change_percent ?? 0);
                                const chgPos = chg >= 0;
                                return (
                                    <div
                                        key={base}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            navigate(`/terminal?symbol=${encodeURIComponent(sym)}`);
                                        }}
                                        className="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-surface-800/40 transition-colors"
                                    >
                                        <span className="text-[11px] font-semibold text-gray-300 truncate max-w-[110px]">
                                            {base}
                                        </span>
                                        <div className="flex flex-col items-end ml-2">
                                            <span className="text-[11px] font-mono font-bold text-heading tabular-nums">
                                                {p.price != null ? formatPrice(p.price) : '—'}
                                            </span>
                                            <span className={cn(
                                                'text-[9px] font-mono tabular-nums',
                                                chgPos ? 'text-emerald-400' : 'text-rose-400'
                                            )}>
                                                {p.change_percent != null
                                                    ? `${chgPos ? '+' : ''}${Number(p.change_percent).toFixed(2)}%`
                                                    : '—'}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}, (prev, next) =>
    prev.price?.price === next.price?.price &&
    prev.price?.change_percent === next.price?.change_percent &&
    prev.isSelected === next.isSelected &&
    prev.item.id === next.item.id &&
    prev.onBuy === next.onBuy &&
    prev.onSell === next.onSell &&
    prev.onRemove === next.onRemove
);

export default WatchlistItem;
