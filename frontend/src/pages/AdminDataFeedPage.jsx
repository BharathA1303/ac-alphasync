import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Wifi, RefreshCw, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import adminApi from '../services/adminApi';

function parseApiError(error, fallback = 'Request failed') {
    return error?.response?.data?.detail || error?.message || fallback;
}

export default function AdminDataFeedPage() {
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [feedStatus, setFeedStatus] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [disconnecting, setDisconnecting] = useState(false);

    const loadStatus = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await adminApi.getMasterFeedStatus();
            setFeedStatus(data || null);
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to load data feed status'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadStatus();
    }, [loadStatus]);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            const { data } = await adminApi.refreshMasterFeed();
            setFeedStatus(data || null);
            toast.success('Master feed refreshed');
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to refresh master feed'));
        } finally {
            setRefreshing(false);
        }
    }, []);

    const handleDisconnectLegacy = useCallback(async () => {
        setDisconnecting(true);
        try {
            const { data } = await adminApi.disconnectLegacyBrokerSessions();
            setFeedStatus(data || null);
            const count = data?.disconnected ?? 0;
            toast.success(count > 0 ? `Disconnected ${count} legacy broker session${count === 1 ? '' : 's'}` : 'No legacy sessions to disconnect');
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to disconnect legacy sessions'));
        } finally {
            setDisconnecting(false);
        }
    }, []);

    const activeSessions = feedStatus?.broker_sessions?.active_sessions ?? 0;

    return (
        <div className="admin-shell p-3 sm:p-4 md:p-5 lg:p-6">
            <header className="flex flex-wrap items-start sm:items-center justify-between gap-3 mb-4 sm:mb-5">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Wifi size={14} style={{ color: 'var(--brand)' }} />
                        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Admin Workspace</span>
                    </div>
                    <h1 className="text-xl sm:text-2xl font-bold">Data Feed</h1>
                    <p className="text-xs sm:text-sm" style={{ color: 'var(--text-muted)' }}>
                        Single master Zebu account supplying live market data for all users.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button className="admin-action-btn admin-action-btn--secondary text-sm" onClick={() => loadStatus()} disabled={loading}>
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh Status
                    </button>
                    <button className="admin-action-btn admin-action-btn--secondary text-sm" onClick={() => navigate('/admin/panel')}>
                        <ArrowLeft size={14} /> Back to Admin Panel
                    </button>
                </div>
            </header>

            <section className="admin-card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                    <h2 className="text-lg font-bold admin-section-title">Master Feed Status</h2>
                    <div className="flex flex-wrap gap-2">
                        {activeSessions > 1 && (
                            <button
                                className="admin-action-btn admin-action-btn--secondary"
                                disabled={disconnecting}
                                onClick={handleDisconnectLegacy}
                                title="Close leftover personal broker connections from before the master feed — the master feed itself is unaffected"
                            >
                                {disconnecting ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                                Disconnect Legacy Sessions
                            </button>
                        )}
                        <button
                            className="admin-action-btn admin-action-btn--primary"
                            disabled={refreshing}
                            onClick={handleRefresh}
                        >
                            {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                            Refresh Master Token
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="admin-mini-stat">
                        <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Status</div>
                        <div className="mt-1 text-sm font-semibold" style={{ color: feedStatus?.active ? '#10b981' : '#ef4444' }}>
                            {feedStatus?.active ? '🟢 Live (Zebu)' : '🔴 Not Connected'}
                        </div>
                    </div>
                    <div className="admin-mini-stat">
                        <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Configured</div>
                        <div className="mt-1 text-sm font-semibold">{feedStatus?.configured ? 'Yes' : 'No'}</div>
                    </div>
                    <div className="admin-mini-stat">
                        <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Last Login</div>
                        <div className="mt-1 text-sm font-semibold">
                            {feedStatus?.last_login_at ? new Date(feedStatus.last_login_at).toLocaleString() : '—'}
                        </div>
                    </div>
                    <div className="admin-mini-stat">
                        <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Broker Connections</div>
                        <div className="mt-1 text-sm font-semibold">
                            {feedStatus?.broker_sessions?.active_sessions ?? '—'}
                            <span className="text-xs font-normal ml-1" style={{ color: 'var(--text-muted)' }}>
                                (1 = master only)
                            </span>
                        </div>
                    </div>
                </div>

                {feedStatus?.last_error && (
                    <div className="mt-4 text-xs" style={{ color: '#ef4444' }}>{feedStatus.last_error}</div>
                )}
            </section>
        </div>
    );
}
