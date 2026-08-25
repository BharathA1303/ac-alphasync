import { useCallback, useEffect, useState } from 'react';
import {
    GraduationCap, Link2, Copy, Loader2, X, Search, LogOut, Trash2,
    ArrowLeft, Circle, ShieldAlert, Trophy, XCircle, RotateCcw, Wifi, WifiOff, User,
} from 'lucide-react';
import toast from 'react-hot-toast';
import academicApi from '../services/academicApi';
import { useAuthStore } from '../stores/useAuthStore';

function parseApiError(error, fallback = 'Request failed') {
    return error?.response?.data?.detail || error?.message || fallback;
}

const EXPIRY_OPTIONS = [
    { value: '24h', label: '24 hours' },
    { value: '7d', label: '7 days' },
    { value: '30d', label: '30 days' },
];

const ROLE_LABELS = { student: 'Student', faculty: 'Faculty' };

function timeLeftLabel(expiresAt) {
    if (!expiresAt) return '—';
    const diffMs = new Date(expiresAt).getTime() - Date.now();
    if (diffMs <= 0) return 'Expired';
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    if (hours < 1) return '<1h left';
    if (hours < 24) return `${hours}h left`;
    return `${Math.floor(hours / 24)}d left`;
}

function timeAgoLabel(iso) {
    if (!iso) return 'never';
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

function InviteLinkRow({ link, onDeleted }) {
    const [deleting, setDeleting] = useState(false);
    const fullUrl = `${window.location.origin}/register?invite=${link.token}`;
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(fullUrl);
            toast.success('Invite link copied');
        } catch {
            toast.error('Could not copy link');
        }
    };
    const handleDelete = async () => {
        setDeleting(true);
        try {
            await academicApi.deleteMemberInvite(link.id);
            toast.success('Invite link deleted');
            onDeleted();
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to delete invite link'));
        } finally {
            setDeleting(false);
        }
    };
    return (
        <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
            <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {ROLE_LABELS[link.target_role] || link.target_role}
                    <span className="ml-2 font-normal" style={{ color: 'var(--text-muted)' }}>
                        {timeLeftLabel(link.expires_at)} · {link.use_count}{link.max_uses ? `/${link.max_uses}` : ''} used
                    </span>
                </div>
                <div className="text-[11px] font-mono truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{fullUrl}</div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
                <button className="admin-action-btn admin-action-btn--secondary text-xs" onClick={handleCopy}>
                    <Copy size={12} /> Copy
                </button>
                <button
                    className="admin-action-btn text-xs"
                    style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
                    disabled={deleting}
                    onClick={handleDelete}
                    title="Delete invite link"
                >
                    {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                </button>
            </div>
        </div>
    );
}

function GenerateInviteModal({ onClose }) {
    const [role, setRole] = useState('student');
    const [expiresIn, setExpiresIn] = useState('7d');
    const [generating, setGenerating] = useState(false);
    const [inviteLink, setInviteLink] = useState('');
    const [invites, setInvites] = useState([]);
    const [loadingInvites, setLoadingInvites] = useState(true);

    const loadInvites = useCallback(async () => {
        setLoadingInvites(true);
        try {
            const { data } = await academicApi.listInviteLinks();
            setInvites(data?.invites || []);
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to load invites'));
        } finally {
            setLoadingInvites(false);
        }
    }, []);

    useEffect(() => { loadInvites(); }, [loadInvites]);

    const handleCreate = async () => {
        setGenerating(true);
        try {
            const { data } = await academicApi.createInviteLink({ role, expires_in: expiresIn });
            const origin = window.location.origin;
            const fullUrl = `${origin}/join?code=${data.code}`;
            setInviteLink(fullUrl);
            toast.success('Invite link generated');
            loadInvites();
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to generate invite'));
        } finally {
            setGenerating(false);
        }
    };

    const handleCopy = (url) => {
        navigator.clipboard.writeText(url);
        toast.success('Copied to clipboard');
    };

    const handleRevoke = async (code) => {
        try {
            await academicApi.revokeInviteLink(code);
            toast.success('Invite link revoked');
            loadInvites();
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to revoke invite'));
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }}>
            <div className="w-full max-w-md rounded-2xl p-5 animate-slide-up" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-bold flex items-center gap-2">
                        <Link2 size={16} style={{ color: 'var(--brand)' }} /> Invite Link Generator
                    </h3>
                    <button className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white" onClick={onClose}>
                        <X size={16} />
                    </button>
                </div>

                <div className="flex flex-col gap-3 mb-4">
                    <div>
                        <label className="text-[11px] font-semibold block mb-1" style={{ color: 'var(--text-muted)' }}>Role</label>
                        <div className="flex gap-2">
                            {['student', 'faculty'].map((r) => (
                                <button
                                    key={r}
                                    type="button"
                                    className="flex-1 py-1.5 text-xs font-semibold rounded-lg capitalize border transition-all"
                                    style={{
                                        background: role === r ? 'var(--brand)' : 'var(--bg-muted)',
                                        color: role === r ? '#04121a' : 'var(--text-muted)',
                                        borderColor: role === r ? 'var(--brand)' : 'var(--border)',
                                    }}
                                    onClick={() => setRole(r)}
                                >
                                    {r}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="text-[11px] font-semibold block mb-1" style={{ color: 'var(--text-muted)' }}>Expiration</label>
                        <select className="input-field text-xs w-full" value={expiresIn} onChange={(e) => setExpiresIn(e.target.value)}>
                            {EXPIRY_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </div>

                    <button
                        className="admin-action-btn admin-action-btn--primary text-xs w-full justify-center mt-1"
                        disabled={generating}
                        onClick={handleCreate}
                    >
                        {generating ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} Generate Link
                    </button>

                    {inviteLink && (
                        <div className="p-3 rounded-lg flex items-center justify-between gap-2 mt-1" style={{ background: 'var(--bg-muted)', border: '1px solid var(--brand)' }}>
                            <span className="text-xs font-mono truncate" style={{ color: 'var(--brand)' }}>{inviteLink}</span>
                            <button className="admin-action-btn admin-action-btn--secondary text-xs flex-shrink-0" onClick={() => handleCopy(inviteLink)}>
                                <Copy size={12} /> Copy
                            </button>
                        </div>
                    )}
                </div>

                <div className="border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                    <h4 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Active Invites</h4>
                    {loadingInvites ? (
                        <div className="text-center py-4"><Loader2 size={16} className="animate-spin inline" style={{ color: 'var(--text-muted)' }} /></div>
                    ) : invites.length === 0 ? (
                        <p className="text-xs text-center py-3" style={{ color: 'var(--text-muted)' }}>No active invite links.</p>
                    ) : (
                        <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
                            {invites.map((inv) => (
                                <div key={inv.code} className="flex items-center justify-between text-xs p-2 rounded-lg" style={{ background: 'var(--bg-muted)' }}>
                                    <div className="min-w-0">
                                        <span className="font-bold capitalize" style={{ color: inv.role === 'faculty' ? 'var(--brand)' : '#10b981' }}>{inv.role}</span>
                                        <span className="text-[11px] ml-2" style={{ color: 'var(--text-muted)' }}>{timeLeftLabel(inv.expires_at)}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button className="p-1 hover:text-white" onClick={() => handleCopy(`${window.location.origin}/join?code=${inv.code}`)} title="Copy link">
                                            <Copy size={12} />
                                        </button>
                                        <button className="p-1 text-red-400 hover:text-red-300" onClick={() => handleRevoke(inv.code)} title="Revoke">
                                            <X size={12} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function GrantRetakeRow({ memberId, attempt, onGranted }) {
    const [granting, setGranting] = useState(false);

    const handleGrant = async () => {
        setGranting(true);
        try {
            await academicApi.grantRetake(memberId, attempt.assessment_id);
            toast.success(`Retake permission granted for "${attempt.assessment_title || 'Assessment'}"`);
            onGranted();
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to grant retake'));
        } finally {
            setGranting(false);
        }
    };

    return (
        <button
            type="button"
            className="admin-action-btn admin-action-btn--secondary text-xs py-1 px-2.5"
            style={{ minHeight: 28 }}
            disabled={granting}
            onClick={handleGrant}
        >
            {granting ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
            Grant Retake
        </button>
    );
}

function MemberDetailView({ member, onBack }) {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [removing, setRemoving] = useState(false);
    const [activeTab, setActiveTab] = useState('activity');

    const loadStats = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await academicApi.getStudentStats(member.id);
            setStats(data);
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to load member stats'));
        } finally {
            setLoading(false);
        }
    }, [member.id]);

    useEffect(() => { loadStats(); }, [loadStats]);

    const handleRemove = async () => {
        if (!window.confirm(`Remove ${member.full_name} from your institution?`)) return;
        setRemoving(true);
        try {
            await academicApi.removeInstitutionMember(member.id);
            toast.success(`${member.full_name} removed from institution`);
            onBack(true);
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to remove member'));
            setRemoving(false);
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-3">
                    <button className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: 'var(--text-muted)', background: 'var(--bg-muted)' }} onClick={() => onBack(false)}>
                        <ArrowLeft size={16} />
                    </button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-bold">{member.full_name}</h2>
                            {stats?.is_online ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>
                                    <Wifi size={10} /> Online Now
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500">
                                    <WifiOff size={10} /> {stats?.last_seen ? timeAgoLabel(stats.last_seen) : 'Offline'}
                                </span>
                            )}
                        </div>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{member.email} · <span className="capitalize">{member.role}</span></p>
                    </div>
                </div>
                <button className="admin-action-btn text-xs flex-shrink-0" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }} disabled={removing} onClick={handleRemove}>
                    {removing ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Remove Member
                </button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-muted)' }} /></div>
            ) : !stats ? (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Failed to load member data.</p>
            ) : (
                <>
                    {/* Top Stats Overview Row */}
                    {member.role === 'faculty' ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            <div className="admin-mini-stat">
                                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Courses Created</div>
                                <div className="text-base font-bold font-mono" style={{ color: 'var(--brand)' }}>{stats.faculty_stats?.courses_created || 0}</div>
                            </div>
                            <div className="admin-mini-stat">
                                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Lessons Published</div>
                                <div className="text-base font-bold font-mono" style={{ color: '#10b981' }}>{stats.faculty_stats?.lessons_published || 0}</div>
                            </div>
                            <div className="admin-mini-stat">
                                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Assessments Created</div>
                                <div className="text-base font-bold font-mono" style={{ color: '#00bcd4' }}>{stats.faculty_stats?.assessments_created || 0}</div>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div className="admin-mini-stat">
                                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Portfolio Value</div>
                                <div className="text-base font-bold font-mono">₹{stats.portfolio.current_value.toLocaleString('en-IN')}</div>
                            </div>
                            <div className="admin-mini-stat">
                                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Total P&amp;L</div>
                                <div className="text-base font-bold font-mono" style={{ color: stats.portfolio.total_pnl >= 0 ? '#10b981' : '#ef4444' }}>
                                    ₹{stats.portfolio.total_pnl.toLocaleString('en-IN')}
                                </div>
                            </div>
                            <div className="admin-mini-stat">
                                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Filled Trades</div>
                                <div className="text-base font-bold font-mono">{stats.trade_count}</div>
                            </div>
                            <div className="admin-mini-stat">
                                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Lessons Completed</div>
                                <div className="text-base font-bold font-mono">{stats.academy.lessons_completed}</div>
                            </div>
                        </div>
                    )}

                    {/* Navigation Options Tabs with SVG Icons */}
                    <div className="flex items-center gap-1.5 p-1 rounded-xl" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                        <button
                            type="button"
                            className="flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5"
                            style={{
                                background: activeTab === 'activity' ? 'var(--brand)' : 'transparent',
                                color: activeTab === 'activity' ? '#04121a' : 'var(--text-muted)',
                            }}
                            onClick={() => setActiveTab('activity')}
                        >
                            <Activity size={14} /> Activity Logs &amp; Timeline
                        </button>
                        <button
                            type="button"
                            className="flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5"
                            style={{
                                background: activeTab === 'assessments' ? 'var(--brand)' : 'transparent',
                                color: activeTab === 'assessments' ? '#04121a' : 'var(--text-muted)',
                            }}
                            onClick={() => setActiveTab('assessments')}
                        >
                            <FileCheck size={14} /> Assessment Attempts ({stats.academy.assessment_attempts.length})
                        </button>
                        <button
                            type="button"
                            className="flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5"
                            style={{
                                background: activeTab === 'trading' ? 'var(--brand)' : 'transparent',
                                color: activeTab === 'trading' ? '#04121a' : 'var(--text-muted)',
                            }}
                            onClick={() => setActiveTab('trading')}
                        >
                            <TrendingUp size={14} /> Portfolio &amp; Trades
                        </button>
                    </div>

                    {/* Tab Content Cards */}
                    {activeTab === 'activity' && (
                        <section className="admin-card p-4">
                            <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Member Activity &amp; Work Feed</h3>
                            {!stats.activity_logs || stats.activity_logs.length === 0 ? (
                                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No recent activity logged for this member.</p>
                            ) : (
                                <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
                                    {stats.activity_logs.map((log, idx) => (
                                        <div key={idx} className="flex items-start justify-between gap-3 p-2.5 rounded-lg" style={{ background: 'var(--bg-muted)' }}>
                                            <div className="flex items-start gap-2.5 min-w-0">
                                                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5" style={{ background: 'rgba(0,188,212,0.15)', color: '#00bcd4' }}>
                                                    {log.type === 'session' ? <Wifi size={13} /> : log.type === 'trade' ? <TrendingUp size={13} /> : log.type === 'course' ? <GraduationCap size={13} /> : <FileCheck size={13} />}
                                                </div>
                                                <div className="min-w-0">
                                                    <h4 className="text-xs font-semibold truncate">{log.title}</h4>
                                                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{log.details}</p>
                                                </div>
                                            </div>
                                            <span className="text-[10px] font-mono flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                                                {timeAgoLabel(log.timestamp)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    )}

                    {activeTab === 'assessments' && (
                        <section className="admin-card p-4">
                            <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Assessment Attempt Records</h3>
                            {stats.academy.assessment_attempts.length === 0 ? (
                                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No assessments attempted yet.</p>
                            ) : (
                                <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
                                    {stats.academy.assessment_attempts.map((a) => (
                                        <div key={a.id} className="flex items-center justify-between gap-3 p-2.5 rounded-lg" style={{ background: 'var(--bg-muted)' }}>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-xs font-semibold truncate">{a.assessment_title || 'Assessment'}</span>
                                                    {a.flagged && (
                                                        <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                                                            <ShieldAlert size={10} /> Flagged
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                                    {a.flagged ? 'Flagged for suspicious activity' : `Scored ${a.score_percent}%`} · {timeAgoLabel(a.started_at)}
                                                </p>
                                            </div>
                                            <GrantRetakeRow memberId={member.id} attempt={a} onGranted={loadStats} />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    )}

                    {activeTab === 'trading' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <section className="admin-card p-4">
                                <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Recent Orders</h3>
                                {stats.recent_orders.length === 0 ? (
                                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No orders placed yet.</p>
                                ) : (
                                    <div className="flex flex-col gap-1.5 max-h-80 overflow-y-auto pr-1">
                                        {stats.recent_orders.map((o, idx) => (
                                            <div key={idx} className="flex items-center justify-between text-xs py-2 px-2.5 rounded-lg" style={{ background: 'var(--bg-muted)' }}>
                                                <span className="font-semibold" style={{ color: o.side === 'BUY' ? '#10b981' : '#ef4444' }}>{o.side} {o.symbol}</span>
                                                <span style={{ color: 'var(--text-secondary)' }}>{o.quantity} {o.price ? `@ ₹${o.price}` : ''}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>

                            <section className="admin-card p-4">
                                <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Filled Transactions</h3>
                                {stats.recent_transactions.length === 0 ? (
                                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No trading activity yet.</p>
                                ) : (
                                    <div className="flex flex-col gap-1.5 max-h-80 overflow-y-auto pr-1">
                                        {stats.recent_transactions.map((tx, idx) => (
                                            <div key={idx} className="flex items-center justify-between text-xs py-2 px-2.5 rounded-lg" style={{ background: 'var(--bg-muted)' }}>
                                                <span className="font-semibold">{tx.type} {tx.symbol}</span>
                                                <span style={{ color: 'var(--text-secondary)' }}>{tx.quantity} @ ₹{tx.price}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function MemberRow({ member, onOpen }) {
    const initials = (member.full_name || 'User')
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

    const isFaculty = member.role === 'faculty';

    return (
        <tr
            style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
            className="hover:bg-surface-800/40 transition-all"
            onClick={() => onOpen(member)}
        >
            <td className="py-3 px-3">
                <div className="flex items-center gap-3">
                    <div
                        className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0"
                        style={{
                            background: isFaculty ? 'rgba(0,188,212,0.15)' : 'rgba(16,185,129,0.15)',
                            color: isFaculty ? 'var(--brand)' : '#10b981',
                            border: `1px solid ${isFaculty ? 'rgba(0,188,212,0.3)' : 'rgba(16,185,129,0.3)'}`,
                        }}
                    >
                        {initials}
                    </div>
                    <div className="min-w-0">
                        <div className="text-xs font-bold text-heading truncate">{member.full_name}</div>
                        <div className="text-[11px] text-gray-500 truncate">{member.email}</div>
                    </div>
                </div>
            </td>
            <td className="py-3 px-3">
                <span
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold capitalize"
                    style={{
                        background: isFaculty ? 'rgba(0,188,212,0.12)' : 'rgba(16,185,129,0.12)',
                        color: isFaculty ? 'var(--brand)' : '#10b981',
                        border: `1px solid ${isFaculty ? 'rgba(0,188,212,0.2)' : 'rgba(16,185,129,0.2)'}`,
                    }}
                >
                    {member.role}
                </span>
            </td>
            <td className="py-3 px-3 text-right">
                <button
                    type="button"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-heading transition-colors"
                    style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}
                    onClick={(e) => {
                        e.stopPropagation();
                        onOpen(member);
                    }}
                >
                    <User size={13} style={{ color: 'var(--brand)' }} /> View Activity &amp; Works
                </button>
            </td>
        </tr>
    );
}

export default function InstitutionPortalPage() {
    const { user, logout } = useAuthStore();
    const [selectedMember, setSelectedMember] = useState(null);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [members, setMembers] = useState([]);
    const [membersTotal, setMembersTotal] = useState(0);
    const [membersLoading, setMembersLoading] = useState(true);
    const [roleFilter, setRoleFilter] = useState('');
    const [search, setSearch] = useState('');

    const loadMembers = useCallback(async () => {
        setMembersLoading(true);
        try {
            const params = {};
            if (roleFilter) params.role = roleFilter;
            if (search.trim()) params.search = search.trim();
            const { data } = await academicApi.listInstitutionMembers(params);
            setMembers(data?.members || []);
            setMembersTotal(data?.total || 0);
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to load members'));
        } finally {
            setMembersLoading(false);
        }
    }, [roleFilter, search]);

    useEffect(() => {
        const t = setTimeout(() => loadMembers(), 250);
        return () => clearTimeout(t);
    }, [loadMembers]);

    if (selectedMember) {
        return (
            <div className="admin-shell p-3 sm:p-4 md:p-5 lg:p-6">
                <MemberDetailView
                    member={selectedMember}
                    onBack={(removed) => {
                        setSelectedMember(null);
                        if (removed) loadMembers();
                    }}
                />
            </div>
        );
    }

    const facultyCount = members.filter((m) => m.role === 'faculty').length;
    const studentCount = members.filter((m) => m.role === 'student').length;

    return (
        <div className="admin-shell p-3 sm:p-4 md:p-5 lg:p-6 flex flex-col gap-5">
            <header className="flex flex-wrap items-start sm:items-center justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <GraduationCap size={16} style={{ color: 'var(--brand)' }} />
                        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Institution Workspace</span>
                    </div>
                    <h1 className="text-xl sm:text-2xl font-bold">{user?.full_name ? `Welcome, ${user.full_name}` : 'Institution Portal'}</h1>
                    <p className="text-xs sm:text-sm text-gray-400">
                        Manage member roster, monitor activity logs, and issue retake permissions.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button className="admin-action-btn admin-action-btn--primary text-sm" onClick={() => setShowInviteModal(true)}>
                        <Link2 size={14} /> Generate Invite
                    </button>
                    <button className="admin-action-btn admin-action-btn--secondary text-sm" onClick={() => logout()}>
                        <LogOut size={14} /> Logout
                    </button>
                </div>
            </header>

            {/* Stat Counters KPI Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="admin-mini-stat">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Total Roster</div>
                    <div className="text-lg font-bold font-mono text-heading">{membersTotal}</div>
                </div>
                <div className="admin-mini-stat">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Faculty Members</div>
                    <div className="text-lg font-bold font-mono" style={{ color: 'var(--brand)' }}>{facultyCount}</div>
                </div>
                <div className="admin-mini-stat">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Enrolled Students</div>
                    <div className="text-lg font-bold font-mono text-emerald-500">{studentCount}</div>
                </div>
            </div>

            {/* Main Member Roster Card */}
            <section className="admin-card p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-heading">Institution Members Roster ({membersTotal})</h2>
                    <div className="flex flex-wrap gap-2 items-center">
                        <div className="relative">
                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                className="input-field text-xs pl-8"
                                style={{ height: 32, minWidth: 200 }}
                                placeholder="Search name or email..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                            {[
                                { key: '', label: 'All Roles' },
                                { key: 'student', label: 'Students' },
                                { key: 'faculty', label: 'Faculty' },
                            ].map((tab) => (
                                <button
                                    key={tab.key}
                                    type="button"
                                    className="px-2.5 py-1 text-xs font-semibold rounded-md transition-all"
                                    style={{
                                        background: roleFilter === tab.key ? 'var(--bg-surface)' : 'transparent',
                                        color: roleFilter === tab.key ? 'var(--text-primary)' : 'var(--text-muted)',
                                    }}
                                    onClick={() => setRoleFilter(tab.key)}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                <th className="text-left py-2.5 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Member</th>
                                <th className="text-left py-2.5 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Role</th>
                                <th className="text-right py-2.5 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {membersLoading ? (
                                <tr><td colSpan={3} className="text-center py-8"><Loader2 size={20} className="animate-spin inline text-primary-500" /></td></tr>
                            ) : members.length === 0 ? (
                                <tr><td colSpan={3} className="text-center py-8 text-xs text-gray-500">No institution members found matching your search.</td></tr>
                            ) : (
                                members.map((m) => <MemberRow key={m.id} member={m} onOpen={setSelectedMember} />)
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {showInviteModal && <GenerateInviteModal onClose={() => setShowInviteModal(false)} />}
        </div>
    );
}
