import { useState, useCallback, useRef, useEffect, useMemo, useSyncExternalStore } from 'react';
import WatchlistItem from './WatchlistItem';
import AddSymbolModal from './AddSymbolModal';
import WatchlistSidebar from './WatchlistSidebar';
import Modal from '../ui/Modal';
import Skeleton from '../ui/Skeleton';
import { cn } from '../../utils/cn';
import { isCommoditySymbol } from '../../utils/constants';
import {
    Search, Plus, Menu, ChevronLeft, ChevronRight, X, Layers,
} from 'lucide-react';
import { useWatchlistStore } from '../../stores/useWatchlistStore';
import { useMarketStore } from '../../store/useMarketStore';
import { mergeWatchlistPrices, symbolAliases } from '../../utils/liveQuote';
import {
    getSessionCloseCache,
    getSessionClosePrice,
    subscribeSessionClosePrices,
} from '../../market/SessionClosePriceAuthority';
import { shouldUseRealtimePrices } from '../../market/utils/marketSessionUtils';

const getPriceForSymbol = (primaryPrices, symbol) => {
    const raw = String(symbol || '').trim();
    if (!raw) return {};

    const aliases = symbolAliases(raw);

    if (!shouldUseRealtimePrices()) {
        for (const key of aliases) {
            const session = getSessionClosePrice(key);
            if (session?.price != null) return session;
        }
    }

    for (const key of aliases) {
        const quote = primaryPrices[key];
        if (quote?.price != null) return quote;
    }

    return {};
};

const normalizeSymbolKey = (symbol = '') =>
    String(symbol || '')
        .trim()
        .toUpperCase()
        .replace(/\.(NS|BO)$/i, '')
        .replace(/^BSE:|^NSE:/i, '')
        .replace(/^\^/, '');

// ── Main component ─────────────────────────────────────────────────────────────
export default function Watchlist({
    selectedSymbol,
    onSelectSymbol,
    onBuy,
    onSell,
    onClose,
}) {
    const {
        watchlists,
        activeId,
        prices: watchlistPrices,
        isLoading,
        setActiveWatchlist,
        createWatchlist,
        renameWatchlist,
        deleteWatchlist,
        addItem,
        removeItem,
        reorderItems,
        fetchPrices,
    } = useWatchlistStore();

    const liveQuotes = useMarketStore((s) => s.symbols);
    const sessionCloseKey = useSyncExternalStore(
        subscribeSessionClosePrices,
        () => Object.keys(getSessionCloseCache()).length,
        () => 0,
    );
    const mergedPrices = useMemo(
        () => mergeWatchlistPrices(watchlistPrices, liveQuotes),
        [watchlistPrices, liveQuotes, sessionCloseKey],
    );

    const activeWatchlist = watchlists.find(w => w.id === activeId);
    const rawItems = activeWatchlist?.items ?? [];

    // ── UI state ──────────────────────────────────────────────────────────────
    const [modalOpen, setModalOpen] = useState(false);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [newWlName, setNewWlName] = useState('');
    const [tabScroll, setTabScroll] = useState({ left: false, right: false });
    const tabsRef = useRef(null);

    // Drag-and-drop state
    const [dragIndex, setDragIndex] = useState(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);
    const scrollEl = useRef(null);

    // Filter items by local search query
    const items = useMemo(() => {
        if (!searchQuery.trim()) return rawItems;
        const q = searchQuery.toLowerCase().trim();
        return rawItems.filter(item => {
            const sym = String(item.symbol || '').toLowerCase();
            const name = String(item.company_name || '').toLowerCase();
            return sym.includes(q) || name.includes(q);
        });
    }, [rawItems, searchQuery]);

    // ── Prefetch closed-session prices for every watchlist row ──
    const itemSymbolsKey = useMemo(
        () => rawItems.map((i) => i.symbol).join('|'),
        [rawItems],
    );
    useEffect(() => {
        if (rawItems.length > 0) fetchPrices();
    }, [activeId, itemSymbolsKey, fetchPrices]);

    const updateTabScroll = useCallback(() => {
        const el = tabsRef.current;
        if (!el) return;
        const canScrollLeft = el.scrollLeft > 4;
        const canScrollRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
        setTabScroll((prev) => (
            prev.left === canScrollLeft && prev.right === canScrollRight
                ? prev
                : { left: canScrollLeft, right: canScrollRight }
        ));
    }, []);

    useEffect(() => {
        updateTabScroll();
        const el = tabsRef.current;
        if (!el) return;
        const onScroll = () => updateTabScroll();
        el.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', updateTabScroll);
        return () => {
            el.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', updateTabScroll);
        };
    }, [watchlists.length, updateTabScroll]);

    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleAddSymbol = useCallback((symbol, exchange) => {
        addItem(symbol, exchange);
        setModalOpen(false);
    }, [addItem]);

    const handleCreateSubmit = useCallback(async () => {
        const name = newWlName.trim() || `Watchlist ${watchlists.length + 1}`;
        await createWatchlist(name);
        setCreateModalOpen(false);
        setNewWlName('');
    }, [newWlName, createWatchlist, watchlists.length]);

    const handleCreateKeyDown = useCallback((e) => {
        if (e.key === 'Enter') handleCreateSubmit();
        if (e.key === 'Escape') { setCreateModalOpen(false); setNewWlName(''); }
    }, [handleCreateSubmit]);

    return (
        <div className="flex flex-col h-full border-r border-edge/10 bg-surface-900/90 backdrop-blur-md">

            {/* ── TOP HEADER BAR ───────────────────────────────────────── */}
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-edge/10 bg-surface-900/70 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-heading hover:bg-surface-800/80 transition-colors"
                        title="Manage Watchlists"
                    >
                        <Menu className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-heading tracking-tight">Watchlist</span>
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-surface-800 text-gray-400 border border-edge/10">
                            {rawItems.length}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setSearchOpen(!searchOpen)}
                        className={cn(
                            'h-8 w-8 rounded-lg flex items-center justify-center transition-colors',
                            searchOpen || searchQuery
                                ? 'bg-primary-500/15 text-primary-500'
                                : 'text-gray-400 hover:text-heading hover:bg-surface-800/80'
                        )}
                        title="Filter symbols"
                    >
                        <Search className="w-4 h-4" />
                    </button>

                    <button
                        onClick={() => setModalOpen(true)}
                        className="h-8 px-2.5 rounded-lg flex items-center gap-1 bg-primary-600/15 hover:bg-primary-600/25 text-primary-500 font-semibold text-xs transition-colors border border-primary-500/20"
                        title="Add symbol to list"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                    </button>
                </div>
            </div>

            {/* ── SEARCH FILTER INPUT (COLLAPSIBLE) ────────────────────── */}
            {searchOpen && (
                <div className="px-3 py-2 border-b border-edge/10 bg-surface-800/40 animate-in slide-in-from-top-1 duration-150 flex items-center gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input
                            autoFocus
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Filter current list..."
                            className="w-full h-8 pl-8 pr-7 rounded-md bg-surface-900 border border-edge/15 text-xs text-heading placeholder-gray-500 focus:outline-none focus:border-primary-500/50"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* ── MODERN TAB ROW WITH OVERFLOW ARROWS ─────────────────── */}
            <div className="flex items-center border-b border-edge/10 bg-surface-950/40 flex-shrink-0 h-10 px-1">
                {tabScroll.left && (
                    <button
                        onClick={() => tabsRef.current?.scrollBy({ left: -180, behavior: 'smooth' })}
                        className="flex-shrink-0 h-full w-7 flex items-center justify-center text-gray-400 hover:text-heading hover:bg-surface-800/50 transition-colors"
                        aria-label="Scroll left"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                )}

                <div
                    ref={tabsRef}
                    className="flex-1 h-full overflow-x-auto overflow-y-hidden no-scrollbar flex items-center gap-1 px-1"
                    style={{ scrollbarWidth: 'none' }}
                    onScroll={updateTabScroll}
                >
                    {watchlists.map((wl) => {
                        const isActive = wl.id === activeId;
                        const isSensex = wl.name?.toUpperCase().includes('SENSEX');
                        const isNifty = wl.name?.toUpperCase().includes('NIFTY');
                        return (
                            <button
                                key={wl.id}
                                onClick={() => setActiveWatchlist(wl.id)}
                                className={cn(
                                    'px-3 py-1 rounded-md flex items-center gap-1.5 flex-shrink-0 text-xs font-semibold font-sans transition-all duration-150 whitespace-nowrap select-none',
                                    isActive
                                        ? 'bg-primary-500/20 text-primary-400 shadow-sm border border-primary-500/30'
                                        : 'text-gray-400 hover:text-heading hover:bg-surface-800/50'
                                )}
                            >
                                <span>{wl.name}</span>
                                {isSensex && (
                                    <span className="text-[8px] font-bold px-1 py-0.2 rounded bg-amber-500/20 text-amber-400 leading-none">
                                        BSE
                                    </span>
                                )}
                                {isNifty && (
                                    <span className="text-[8px] font-bold px-1 py-0.2 rounded bg-blue-500/20 text-blue-400 leading-none">
                                        NSE
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {tabScroll.right && (
                    <button
                        onClick={() => tabsRef.current?.scrollBy({ left: 180, behavior: 'smooth' })}
                        className="flex-shrink-0 h-full w-7 flex items-center justify-center text-gray-400 hover:text-heading hover:bg-surface-800/50 transition-colors"
                        aria-label="Scroll right"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* ── CONTENT AREA ──────────────────────────────────────────── */}
            <div ref={scrollEl} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col">
                {isLoading ? (
                    <div>{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} variant="watchlist-row" />)}</div>
                ) : items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3 px-4 py-8">
                        <div className="w-12 h-12 rounded-full bg-surface-800/80 flex items-center justify-center text-gray-400 border border-edge/10">
                            <Layers className="w-5 h-5" />
                        </div>
                        <div className="text-center">
                            <p className="text-sm font-semibold text-heading mb-1">
                                {searchQuery ? 'No matching symbols' : 'Watchlist is empty'}
                            </p>
                            <p className="text-xs text-gray-400">
                                {searchQuery ? 'Try another keyword' : 'Add stocks to monitor real-time prices'}
                            </p>
                        </div>
                        {!searchQuery && (
                            <button
                                onClick={() => setModalOpen(true)}
                                className="px-4 py-2 bg-primary-600 text-white rounded-lg font-semibold text-xs transition-transform active:scale-95 flex items-center gap-1.5 shadow-md hover:bg-primary-500"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                Add Symbol
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col h-full">
                        <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-edge/5">
                            {items.map((item, index) => {
                                const price = getPriceForSymbol(mergedPrices, item.symbol);
                                const itemKey = normalizeSymbolKey(item.symbol);
                                const selectedKey = normalizeSymbolKey(selectedSymbol);
                                const isSelectedRow = itemKey && selectedKey && itemKey === selectedKey;
                                const rawSymbol = String(item.symbol || '');
                                const isBse = String(item.exchange || '').toUpperCase() === 'BSE' || rawSymbol.endsWith('.BO');
                                const exchange = item.exchange || (isBse ? 'BSE' : 'NSE');
                                const chartSymbol = rawSymbol.startsWith('^') || rawSymbol.endsWith('.NS') || rawSymbol.endsWith('.BO') || isCommoditySymbol(rawSymbol)
                                    ? rawSymbol
                                    : isBse ? `${rawSymbol}.BO` : `${rawSymbol}.NS`;
                                const isDragging = dragIndex === index;
                                const isDragOver = dragOverIndex === index && dragIndex !== index;

                                return (
                                    <div
                                        key={item.id || item.symbol}
                                        draggable
                                        onDragStart={(e) => {
                                            setDragIndex(index);
                                            e.dataTransfer.effectAllowed = 'move';
                                            e.dataTransfer.setData('text/plain', index.toString());
                                        }}
                                        onDragEnd={() => {
                                            setDragIndex(null);
                                            setDragOverIndex(null);
                                        }}
                                        onDragOver={(e) => {
                                            e.preventDefault();
                                            e.dataTransfer.dropEffect = 'move';
                                            if (dragOverIndex !== index) setDragOverIndex(index);
                                        }}
                                        onDragEnter={(e) => {
                                            e.preventDefault();
                                            setDragOverIndex(index);
                                        }}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            if (dragIndex !== null && dragIndex !== index) {
                                                reorderItems(dragIndex, index);
                                            }
                                            setDragIndex(null);
                                            setDragOverIndex(null);
                                        }}
                                        className={cn(
                                            isDragging && 'opacity-30',
                                            isDragOver && 'border-t-2 border-t-primary-500',
                                        )}
                                    >
                                        <WatchlistItem
                                            item={{ ...item, exchange }}
                                            price={price}
                                            isSelected={isSelectedRow}
                                            onSelect={() => onSelectSymbol?.(chartSymbol)}
                                            onRemove={removeItem}
                                            onBuy={onBuy ? () => onBuy(chartSymbol) : undefined}
                                            onSell={onSell ? () => onSell(chartSymbol) : undefined}
                                        />
                                    </div>
                                );
                            })}
                        </div>

                        <div className="px-3.5 py-2 border-t border-edge/10 text-[11px] text-gray-400 bg-surface-950/30 flex items-center justify-between flex-shrink-0 font-mono">
                            <span>{items.length} symbol{items.length !== 1 ? 's' : ''} shown</span>
                            <span className="text-[10px] text-gray-500 font-sans font-medium">
                                Live Feed Active
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* ── ADD SYMBOL MODAL ──────────────────────────────────────── */}
            <AddSymbolModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                onAddSymbol={handleAddSymbol}
                watchlistItems={rawItems}
            />

            {/* ── WATCHLIST SIDEBAR ─────────────────────────────────────── */}
            <WatchlistSidebar
                watchlists={watchlists}
                activeId={activeId}
                onSelectWatchlist={setActiveWatchlist}
                onCreateNew={() => setCreateModalOpen(true)}
                onRenameWatchlist={renameWatchlist}
                onDeleteWatchlist={deleteWatchlist}
                isOpen={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
            />

            {/* ── CREATE WATCHLIST MODAL ──────────────────────────────── */}
            <Modal
                isOpen={createModalOpen}
                onClose={() => {
                    setCreateModalOpen(false);
                    setNewWlName('');
                }}
                title="Create Watchlist"
                size="sm"
            >
                <div className="p-5">
                    <p className="text-sm text-gray-400 mb-4">Enter a name for the new watchlist.</p>
                    <input
                        autoFocus
                        value={newWlName}
                        onChange={(e) => setNewWlName(e.target.value)}
                        onKeyDown={handleCreateKeyDown}
                        placeholder={`Watchlist ${watchlists.length + 1}`}
                        maxLength={24}
                        className="w-full h-10 px-3 rounded-lg bg-surface-800/70 border border-edge/10 text-sm text-heading placeholder-gray-500 focus:outline-none focus:border-primary-500/50"
                    />
                    <div className="mt-4 flex items-center justify-end gap-2">
                        <button
                            onClick={() => {
                                setCreateModalOpen(false);
                                setNewWlName('');
                            }}
                            className="px-4 py-2 rounded-lg border border-edge/10 text-sm text-gray-400 hover:text-heading hover:bg-surface-800/50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleCreateSubmit}
                            className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-semibold hover:bg-primary-500 transition-colors"
                        >
                            Create
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
