import { create } from 'zustand';
import api, { isRateLimited } from '../services/api';
import toast from 'react-hot-toast';
import useUnifiedFuturesStore from './useUnifiedFuturesStore';

const STORAGE_KEY = 'alphasync_futures_watchlists';

export const PREDEFINED_FUTURES_WATCHLISTS = [
    {
        id: 'pref_indices',
        name: 'Index Futures',
        isPredefined: true,
        bases: ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'NIFTYNXT50', 'SENSEX'],
        items: [],
    },
    {
        id: 'pref_banking',
        name: 'Banking Futures',
        isPredefined: true,
        bases: ['HDFCBANK', 'ICICIBANK', 'SBIN', 'AXISBANK', 'KOTAKBANK', 'BAJFINANCE'],
        items: [],
    },
    {
        id: 'pref_it',
        name: 'IT & Tech Futures',
        isPredefined: true,
        bases: ['TCS', 'INFY', 'WIPRO', 'HCLTECH', 'TECHM', 'COFORGE', 'LTIM'],
        items: [],
    },
    {
        id: 'pref_auto',
        name: 'Auto Futures',
        isPredefined: true,
        bases: ['TATAMOTORS', 'MARUTI', 'M&M', 'HEROMOTOCO', 'EICHERMOT'],
        items: [],
    },
    {
        id: 'pref_energy',
        name: 'Energy & Metals',
        isPredefined: true,
        bases: ['RELIANCE', 'ONGC', 'NTPC', 'POWERGRID', 'TATASTEEL', 'JSWSTEEL', 'HINDALCO'],
        items: [],
    },
    {
        id: 'pref_pharma',
        name: 'Pharma & FMCG',
        isPredefined: true,
        bases: ['SUNPHARMA', 'DRREDDY', 'CIPLA', 'ITC', 'HINDUNILVR', 'BRITANNIA'],
        items: [],
    },
];

const resolvePredefinedItems = async (watchlist) => {
    if (!watchlist || !watchlist.isPredefined || !watchlist.bases) return [];

    const items = [];
    const unifiedStore = useUnifiedFuturesStore.getState();

    for (const base of watchlist.bases) {
        let contractSymbol = null;

        const cachedContracts = unifiedStore.contracts.byUnderlying[base];
        if (cachedContracts && cachedContracts.length > 0) {
            contractSymbol = cachedContracts[0];
        } else {
            try {
                const res = await api.get(`/futures/contracts/${encodeURIComponent(base)}`);
                const fetched = res.data?.contracts || [];
                if (fetched.length > 0) {
                    unifiedStore.setContracts(base, fetched);
                    contractSymbol = fetched[0].contract_symbol;
                }
            } catch (err) {
                console.warn(`[PredefinedWatchlist] Resolution failed for base ${base}:`, err);
            }
        }

        if (contractSymbol) {
            items.push({
                id: `pref_item_${watchlist.id}_${contractSymbol}`,
                contract_symbol: contractSymbol,
                underlying: base,
                isPredefined: true,
            });
        }
    }

    return items;
};

const persistToStorage = (userWatchlists, activeId) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ userWatchlists, activeId }));
    } catch (err) {
        console.error('[FuturesWatchlist] Failed to persist to localStorage:', err);
    }
};

const loadFromStorage = () => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : null;
    } catch (err) {
        console.error('[FuturesWatchlist] Failed to load local watchlist:', err);
        return null;
    }
};

const ensureState = (userWatchlists, activeId) => {
    const validUserWls = Array.isArray(userWatchlists) ? userWatchlists : [];
    const all = [...PREDEFINED_FUTURES_WATCHLISTS, ...validUserWls];

    const nextActiveId = all.some((wl) => wl.id === activeId)
        ? activeId
        : PREDEFINED_FUTURES_WATCHLISTS[0].id;

    return {
        userWatchlists: validUserWls,
        watchlists: all,
        activeId: nextActiveId,
    };
};

export const useFuturesWatchlistStore = create((set, get) => ({
    watchlists: PREDEFINED_FUTURES_WATCHLISTS,
    userWatchlists: [],
    activeId: PREDEFINED_FUTURES_WATCHLISTS[0].id,
    prices: {},
    isLoading: false,
    syncDisabled: true,

    loadWatchlist: async () => {
        set({ isLoading: true, syncDisabled: true });
        const cached = loadFromStorage();
        const next = ensureState(cached?.userWatchlists || [], cached?.activeId);
        set({ ...next });

        // Resolve items for current active watchlist
        const activeWl = next.watchlists.find((w) => w.id === next.activeId);
        if (activeWl?.isPredefined) {
            const resolved = await resolvePredefinedItems(activeWl);
            set((state) => ({
                watchlists: state.watchlists.map((w) =>
                    w.id === activeWl.id ? { ...w, items: resolved } : w
                ),
            }));
        }

        set({ isLoading: false });
        persistToStorage(next.userWatchlists, next.activeId);
        get().fetchPrices();
    },

    setActiveWatchlist: async (id) => {
        const { watchlists, userWatchlists } = get();
        const activeWl = watchlists.find((wl) => wl.id === id) || watchlists[0];
        if (!activeWl) return;

        set({ activeId: activeWl.id, isLoading: activeWl.isPredefined });
        persistToStorage(userWatchlists, activeWl.id);

        if (activeWl.isPredefined) {
            const resolved = await resolvePredefinedItems(activeWl);
            set((state) => ({
                watchlists: state.watchlists.map((w) =>
                    w.id === activeWl.id ? { ...w, items: resolved } : w
                ),
                isLoading: false,
            }));
        } else {
            set({ isLoading: false });
        }

        get().fetchPrices();
    },

    createWatchlist: async (name = 'New Futures Watchlist') => {
        const trimmed = name.trim();
        if (!trimmed) return null;
        const newWl = { id: `user_wl_${Date.now()}`, name: trimmed, items: [], isPredefined: false };
        set((state) => {
            const nextUserWls = [...state.userWatchlists, newWl];
            return {
                userWatchlists: nextUserWls,
                watchlists: [...PREDEFINED_FUTURES_WATCHLISTS, ...nextUserWls],
                activeId: newWl.id,
            };
        });
        const { userWatchlists, activeId } = get();
        persistToStorage(userWatchlists, activeId);
        toast.success(`"${trimmed}" created`);
        return newWl;
    },

    renameWatchlist: async (id, newName) => {
        const trimmed = newName?.trim();
        if (!id || !trimmed) return;
        const target = get().watchlists.find((w) => w.id === id);
        if (target?.isPredefined) {
            toast.error('Predefined watchlists cannot be renamed');
            return;
        }

        set((state) => {
            const nextUserWls = state.userWatchlists.map((w) =>
                w.id === id ? { ...w, name: trimmed } : w
            );
            return {
                userWatchlists: nextUserWls,
                watchlists: [...PREDEFINED_FUTURES_WATCHLISTS, ...nextUserWls],
            };
        });
        const { userWatchlists, activeId } = get();
        persistToStorage(userWatchlists, activeId);
    },

    deleteWatchlist: async (id) => {
        const target = get().watchlists.find((w) => w.id === id);
        if (target?.isPredefined) {
            toast.error('Predefined watchlists cannot be deleted');
            return;
        }

        const { userWatchlists, activeId } = get();
        const remainingUserWls = userWatchlists.filter((w) => w.id !== id);
        const nextAll = [...PREDEFINED_FUTURES_WATCHLISTS, ...remainingUserWls];
        const nextActiveId = activeId === id ? nextAll[0]?.id ?? null : activeId;

        set({
            userWatchlists: remainingUserWls,
            watchlists: nextAll,
            activeId: nextActiveId,
        });
        persistToStorage(remainingUserWls, nextActiveId);
        toast.success('Watchlist deleted');
    },

    addItem: async (contractSymbol, options = {}) => {
        const { activeId, watchlists } = get();
        const activeWl = watchlists.find((w) => w.id === activeId);
        if (activeWl?.isPredefined) {
            if (!options?.silent) {
                toast.error('Cannot add items to predefined system watchlist. Select a custom watchlist first or create one.');
            }
            return;
        }

        const normalizedSymbol = String(contractSymbol || '').trim().toUpperCase();
        if (!normalizedSymbol) {
            toast.error('Contract symbol is required');
            return;
        }

        if (!activeWl) {
            toast.error('Watchlist not found');
            return;
        }
        if (activeWl.items.some((item) => item.contract_symbol === normalizedSymbol)) {
            toast(`${normalizedSymbol} is already in watchlist`);
            return;
        }

        const item = {
            id: `user_item_${Date.now()}`,
            contract_symbol: normalizedSymbol,
            added_at: new Date().toISOString(),
        };

        set((state) => {
            const nextUserWls = state.userWatchlists.map((w) =>
                w.id === activeId ? { ...w, items: [...w.items, item] } : w
            );
            return {
                userWatchlists: nextUserWls,
                watchlists: [...PREDEFINED_FUTURES_WATCHLISTS, ...nextUserWls],
            };
        });

        const next = get();
        persistToStorage(next.userWatchlists, next.activeId);
        get().fetchPrices();
    },

    removeItem: async (itemId) => {
        const { activeId, watchlists } = get();
        const activeWl = watchlists.find((w) => w.id === activeId);
        if (activeWl?.isPredefined) {
            toast.error('Predefined watchlists cannot be modified');
            return;
        }

        set((state) => {
            const nextUserWls = state.userWatchlists.map((w) =>
                w.id === activeId
                    ? { ...w, items: w.items.filter((item) => item.id !== itemId) }
                    : w
            );
            return {
                userWatchlists: nextUserWls,
                watchlists: [...PREDEFINED_FUTURES_WATCHLISTS, ...nextUserWls],
            };
        });
        const { userWatchlists, activeId: nextActiveId } = get();
        persistToStorage(userWatchlists, nextActiveId);
    },

    reorderItems: (newItems) => {
        const { activeId, watchlists } = get();
        const activeWl = watchlists.find((w) => w.id === activeId);
        if (activeWl?.isPredefined) return;

        set((state) => {
            const nextUserWls = state.userWatchlists.map((w) =>
                w.id === activeId ? { ...w, items: newItems } : w
            );
            return {
                userWatchlists: nextUserWls,
                watchlists: [...PREDEFINED_FUTURES_WATCHLISTS, ...nextUserWls],
            };
        });
        const { userWatchlists, activeId: nextActiveId } = get();
        persistToStorage(userWatchlists, nextActiveId);
    },

    fetchPrices: async () => {
        const { activeId, watchlists } = get();
        const active = watchlists.find((w) => w.id === activeId);
        if (!active || active.items.length === 0 || isRateLimited()) return;

        const symbols = active.items.map((item) => item.contract_symbol).filter(Boolean);
        try {
            const res = await api.post('/futures/quotes/batch', { contracts: symbols.slice(0, 50) });
            const quotes = res.data?.quotes ?? {};
            if (Object.keys(quotes).length > 0) {
                set((state) => ({ prices: { ...state.prices, ...quotes } }));
                useUnifiedFuturesStore.getState().updateQuotes(quotes);
            }
        } catch {
            const quoteResults = await Promise.allSettled(
                symbols.map((sym) => api.get(`/futures/quote/${encodeURIComponent(sym)}`)),
            );
            const nextPrices = {};
            quoteResults.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    nextPrices[symbols[index]] = result.value.data;
                }
            });
            if (Object.keys(nextPrices).length > 0) {
                set((state) => ({ prices: { ...state.prices, ...nextPrices } }));
            }
        }
    },

    updatePrices: (priceUpdate) => {
        if (!priceUpdate || Object.keys(priceUpdate).length === 0) return;
        set((state) => ({ prices: { ...state.prices, ...priceUpdate } }));
    },

    clear: () => {
        set({
            watchlists: PREDEFINED_FUTURES_WATCHLISTS,
            userWatchlists: [],
            activeId: PREDEFINED_FUTURES_WATCHLISTS[0].id,
            prices: {},
            isLoading: false,
            syncDisabled: true,
        });
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (err) {
            console.error('[FuturesWatchlist] Failed to clear localStorage:', err);
        }
    },
}));
