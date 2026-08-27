import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { ShieldAlert, Smartphone } from 'lucide-react';

// Specialized Phase 2 Terminal Components (Document 06 Screen 1)
import ComplianceBand from '../components/terminal/ComplianceBand';
import ExerciseClockCard from '../components/terminal/ExerciseClockCard';
import TerminalWatchlist from '../components/terminal/TerminalWatchlist';
import DepthLadder from '../components/terminal/DepthLadder';
import SessionEventTimeline from '../components/terminal/SessionEventTimeline';
import TerminalChart from '../components/terminal/TerminalChart';
import TerminalBlotter from '../components/terminal/TerminalBlotter';
import ContractNotePanel from '../components/terminal/ContractNotePanel';
import TerminalOrderTicket from '../components/terminal/TerminalOrderTicket';
import TerminalFundsAndRails from '../components/terminal/TerminalFundsAndRails';

const INITIAL_SYMBOLS = [
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
 * StudentTradingTerminal — Document 06 Screen 1
 * Reconstructed high-performance virtual trading terminal for Student accounts.
 */
export default function StudentTradingTerminal() {
    const [searchParams] = useSearchParams();
    const querySymbol = searchParams.get('symbol');

    // Selected Symbol State
    const [selectedSymbol, setSelectedSymbol] = useState(
        querySymbol ? querySymbol.replace(/\.(NS|BO)$/i, '').toUpperCase() : 'RELIANCE'
    );
    const [activeQuote, setActiveQuote] = useState(
        INITIAL_SYMBOLS.find((s) => s.symbol === selectedSymbol) || INITIAL_SYMBOLS[0]
    );

    // Live Trading and Blotter Data
    const [positions, setPositions] = useState([
        { symbol: 'RELIANCE', product: 'CNC', quantity: 50, avgPrice: 1310.00, ltp: 1313.10 },
        { symbol: 'INFY', product: 'MIS', quantity: 100, avgPrice: 1812.50, ltp: 1820.75 },
    ]);
    const [orders, setOrders] = useState([]);
    const [trades, setTrades] = useState([
        { time: '09:20:15', side: 'BUY', symbol: 'RELIANCE', quantity: 50, price: 1310.00, charges: 24.50 },
        { time: '09:35:40', side: 'BUY', symbol: 'INFY', quantity: 100, price: 1812.50, charges: 32.10 },
    ]);

    // Virtual Funds
    const [availableCash, setAvailableCash] = useState(1000000);
    const [utilisedMargin, setUtilisedMargin] = useState(246750);

    // Fetch real orders and positions from backend if available
    const fetchRealData = useCallback(async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;
            const headers = { Authorization: `Bearer ${token}` };

            const [ordersRes, summaryRes] = await Promise.allSettled([
                axios.get('/api/orders', { headers }),
                axios.get('/api/portfolio/summary', { headers }),
            ]);

            if (ordersRes.status === 'fulfilled' && Array.isArray(ordersRes.value.data?.orders)) {
                setOrders(ordersRes.value.data.orders);
            }
            if (summaryRes.status === 'fulfilled' && summaryRes.value.data) {
                const s = summaryRes.value.data;
                if (s.available_funds != null) setAvailableCash(Number(s.available_funds));
                if (s.utilised_margin != null) setUtilisedMargin(Number(s.utilised_margin));
            }
        } catch {
            // fallback gracefully to simulation data
        }
    }, []);

    useEffect(() => {
        fetchRealData();
    }, [fetchRealData]);

    const handleSelectSymbol = (item) => {
        setSelectedSymbol(item.symbol);
        setActiveQuote(item);
    };

    const handleOrderPlaced = (newOrder) => {
        setOrders((prev) => [newOrder, ...prev]);
        setPositions((prev) => {
            const existing = prev.find((p) => p.symbol === newOrder.symbol);
            if (existing) {
                return prev.map((p) =>
                    p.symbol === newOrder.symbol
                        ? { ...p, quantity: p.quantity + Number(newOrder.quantity) }
                        : p
                );
            }
            return [
                ...prev,
                {
                    symbol: newOrder.symbol,
                    product: newOrder.product || 'CNC',
                    quantity: Number(newOrder.quantity),
                    avgPrice: Number(newOrder.price || activeQuote.ltp),
                    ltp: activeQuote.ltp,
                },
            ];
        });
        setTrades((prev) => [
            {
                time: new Date().toTimeString().split(' ')[0],
                side: newOrder.side,
                symbol: newOrder.symbol,
                quantity: Number(newOrder.quantity),
                price: Number(newOrder.price || activeQuote.ltp),
                charges: 25.00,
            },
            ...prev,
        ]);
        fetchRealData();
    };

    const handleClosePosition = (pos) => {
        setPositions((prev) => prev.filter((p) => p.symbol !== pos.symbol));
        toast.success(`Square-off completed for ${pos.quantity} ${pos.symbol}`);
        fetchRealData();
    };

    const handleCancelOrder = (ord) => {
        setOrders((prev) => prev.filter((o) => o.id !== ord.id));
        toast.success(`Virtual order cancelled`);
    };

    return (
        <div className="flex flex-col min-h-screen bg-[var(--bg-base)] text-slate-900 dark:text-slate-100">
            {/* 1. Persistent Compliance Band (CMP-001) */}
            <ComplianceBand
                mode="REPLAY SESSION"
                sessionDate="12 Jan 2026"
                lagDays={52}
                disclaimer="Virtual money only · Not investment advice · SEBI Compliant Paper Environment"
            />

            {/* Mobile Safety Guard (§6.4) on viewports < 768px */}
            <div className="md:hidden m-4 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 flex items-center gap-3 text-xs">
                <Smartphone size={20} className="text-amber-600 flex-shrink-0" />
                <div>
                    <span className="font-bold block">Mobile Viewport: Read-Only Simulation</span>
                    <span className="text-[11px] opacity-80">
                        Order execution is restricted on small screens to prevent accidental leveraged fills during replay.
                    </span>
                </div>
            </div>

            {/* Main Terminal Grid — Document 06 Screen 1 (236px Left | 644px Center | 300px Right Rail) */}
            <div className="flex-1 w-full max-w-[1720px] mx-auto p-3 sm:p-4 lg:p-5">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                    {/* ── Left Column: Navigation Context, Watchlist, Depth, Events (3 cols on lg/xl) ── */}
                    <div className="lg:col-span-3 space-y-4">
                        <ExerciseClockCard
                            exerciseCode="PM-012"
                            exerciseTitle="Exercise 4: Event-Day Execution"
                            marketPhase="NORMAL TRADING"
                        />
                        <TerminalWatchlist
                            selectedSymbol={selectedSymbol}
                            onSelectSymbol={handleSelectSymbol}
                            watchlist={INITIAL_SYMBOLS}
                        />
                        <DepthLadder
                            symbol={selectedSymbol}
                            ltp={activeQuote.ltp}
                            source="LICENSED"
                            standardOrderVal={100000}
                        />
                        <SessionEventTimeline />
                    </div>

                    {/* ── Center Column: Candlestick Replay Chart, Blotter, Pedagogical Contract Note (6 cols on lg/xl) ── */}
                    <div className="lg:col-span-6 space-y-4">
                        <TerminalChart
                            symbol={selectedSymbol}
                            ltp={activeQuote.ltp}
                            change={activeQuote.change}
                            changePct={activeQuote.changePct}
                            executionPrice={positions.find((p) => p.symbol === selectedSymbol)?.avgPrice}
                            stopLossPrice={Number((activeQuote.ltp * 0.98).toFixed(2))}
                        />

                        <TerminalBlotter
                            positions={positions}
                            orders={orders}
                            trades={trades}
                            onClosePosition={handleClosePosition}
                            onCancelOrder={handleCancelOrder}
                        />

                        <ContractNotePanel
                            symbol={selectedSymbol}
                            side="BUY"
                            quantity={50}
                            price={activeQuote.ltp}
                            productType="CNC"
                        />
                    </div>

                    {/* ── Right Rail: Order Pad, Virtual Capital, Risk Rails (3 cols on lg/xl) ── */}
                    <div className="lg:col-span-3 space-y-4">
                        <TerminalOrderTicket
                            symbol={selectedSymbol}
                            ltp={activeQuote.ltp}
                            availableMargin={availableCash}
                            onOrderPlaced={handleOrderPlaced}
                        />

                        <TerminalFundsAndRails
                            availableCash={availableCash}
                            utilisedMargin={utilisedMargin}
                            realisedPnl={450.00}
                            unrealisedPnl={155.00}
                            maxPositionSize={200000}
                            maxDailyLoss={25000}
                            stopLossEnforced={true}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
