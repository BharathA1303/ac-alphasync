import { useCallback, useEffect, useState } from 'react';
import {
    GraduationCap, Users, TrendingUp, Link2, Copy, Loader2, X, Search, LogOut, Trash2,
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
    const [targetRole, setTargetRole] = useState('student');
    const [expiry, setExpiry] = useState('7d');
    const [saving, setSaving] = useState(false);
    const [links, setLinks] = useState([]);
    const [loadingLinks, setLoadingLinks] = useState(true);

    const loadLinks = useCallback(async () => {
        setLoadingLinks(true);
        try {
            const { data } = await academicApi.listMemberInvites();
            setLinks(data?.invite_links || []);
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to load invite links'));
        } finally {
            setLoadingLinks(false);
        }
    }, []);

    useEffect(() => { loadLinks(); }, [loadLinks]);

    const handleGenerate = async () => {
        setSaving(true);
        try {
            await academicApi.createMemberInvite({ target_role: targetRole, expiry });
            toast.success('Invite link generated');
            await loadLinks();
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to generate invite link'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
            <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl animate-slide-up" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
                <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
                    <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Invite Links</h2>
                    <button className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: 'var(--text-muted)' }} onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>
                <div className="p-5 flex flex-col gap-4">
                    <div>
                        <label className="label-text">Role</label>
                        <div className="flex gap-2 mt-1">
                            {['student', 'faculty'].map((role) => (
                                <button
                                    key={role}
                                    type="button"
                                    className="admin-action-btn text-sm"
                                    style={{
                                        background: targetRole === role ? 'var(--brand)' : 'var(--bg-muted)',
                                        color: targetRole === role ? '#04121a' : 'var(--text-primary)',
                                        border: '1px solid var(--border)',
                                    }}
                                    onClick={() => setTargetRole(role)}
                                >
                                    {ROLE_LABELS[role]}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex items-end gap-2">
                        <div className="flex-1">
                            <label className="label-text">Expiry</label>
                            <select className="input-field text-sm" value={expiry} onChange={(e) => setExpiry(e.target.value)}>
                                {EXPIRY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                        </div>
                        <button className="admin-action-btn admin-action-btn--primary text-sm" disabled={saving} onClick={handleGenerate}>
                            {saving ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} Generate
                        </button>
                    </div>

                    <div>
                        <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Active Links</div>
                        {loadingLinks ? (
                            <div className="flex items-center justify-center py-6"><Loader2 size={18} className="animate-spin" style={{ color: 'var(--text-muted)' }} /></div>
                        ) : links.length === 0 ? (
                            <div className="text-sm py-4 text-center" style={{ color: 'var(--text-muted)' }}>No active links. Generate one above.</div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {links.map((link) => <InviteLinkRow key={link.id} link={link} onDeleted={loadLinks} />)}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function StudentDetailModal({ studentId, onClose }) {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        academicApi.getStudentStats(studentId)
            .then(({ data }) => { if (!cancelled) setStats(data); })
            .catch((err) => toast.error(parseApiError(err, 'Failed to load student stats')))
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [studentId]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
            <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl animate-slide-up" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
                <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
                    <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{stats?.student?.full_name || 'Student'}</h2>
                    <button className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: 'var(--text-muted)' }} onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>
                {loading ? (
                    <div className="flex items-center justify-center p-10"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-muted)' }} /></div>
                ) : !stats ? (
                    <div className="p-5 text-sm" style={{ color: 'var(--text-muted)' }}>Failed to load student data.</div>
                ) : (
                    <div className="p-5 flex flex-col gap-4">
                        <div className="grid grid-cols-2 gap-2">
                            <div className="admin-mini-stat">
                                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Portfolio Value</div>
                                <div className="text-lg font-bold font-mono">₹{stats.portfolio.current_value.toLocaleString('en-IN')}</div>
                            </div>
                            <div className="admin-mini-stat">
                                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Total P&amp;L</div>
                                <div className="text-lg font-bold font-mono" style={{ color: stats.portfolio.total_pnl >= 0 ? '#10b981' : '#ef4444' }}>
                                    ₹{stats.portfolio.total_pnl.toLocaleString('en-IN')} ({stats.portfolio.total_pnl_percent}%)
                                </div>
                            </div>
                            <div className="admin-mini-stat">
                                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Available Capital</div>
                                <div className="text-sm font-bold font-mono">₹{stats.portfolio.available_capital.toLocaleString('en-IN')}</div>
                            </div>
                            <div className="admin-mini-stat">
                                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Filled Trades</div>
                                <div className="text-sm font-bold font-mono">{stats.trade_count}</div>
                            </div>
                        </div>

                        <div>
                            <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Recent Activity</div>
                            <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                                {stats.recent_transactions.length === 0 ? (
                                    <div className="text-sm" style={{ color: 'var(--text-muted)' }}>No trading activity yet.</div>
                                ) : (
                                    stats.recent_transactions.map((tx, idx) => (
                                        <div key={idx} className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg" style={{ background: 'var(--bg-muted)' }}>
                                            <span className="font-semibold">{tx.type} {tx.symbol}</span>
                                            <span style={{ color: 'var(--text-secondary)' }}>{tx.quantity} @ ₹{tx.price}</span>
                                            <span className="font-mono" style={{ color: 'var(--text-muted)' }}>{tx.created_at ? new Date(tx.created_at).toLocaleDateString() : '—'}</span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function InstitutionPortalPage() {
    const user = useAuthStore((s) => s.user);
    const logout = useAuthStore((s) => s.logout);

    const [dashboard, setDashboard] = useState(null);
    const [dashboardLoading, setDashboardLoading] = useState(true);

    const [members, setMembers] = useState([]);
    const [membersTotal, setMembersTotal] = useState(0);
    const [membersLoading, setMembersLoading] = useState(false);
    const [roleFilter, setRoleFilter] = useState('');
    const [search, setSearch] = useState('');

    const [showInviteModal, setShowInviteModal] = useState(false);
    const [selectedStudentId, setSelectedStudentId] = useState(null);

    const loadDashboard = useCallback(async () => {
        setDashboardLoading(true);
        try {
            const { data } = await academicApi.getInstitutionDashboard();
            setDashboard(data);
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to load dashboard'));
        } finally {
            setDashboardLoading(false);
        }
    }, []);

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

    useEffect(() => { loadDashboard(); }, [loadDashboard]);
    useEffect(() => {
        const t = setTimeout(() => loadMembers(), 250);
        return () => clearTimeout(t);
    }, [loadMembers]);

    return (
        <div className="admin-shell p-3 sm:p-4 md:p-5 lg:p-6">
            <header className="flex flex-wrap items-start sm:items-center justify-between gap-3 mb-4 sm:mb-5">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <GraduationCap size={14} style={{ color: 'var(--brand)' }} />
                        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Institution Workspace</span>
                    </div>
                    <h1 className="text-xl sm:text-2xl font-bold">{user?.full_name ? `Welcome, ${user.full_name}` : 'Institution Portal'}</h1>
                    <p className="text-xs sm:text-sm" style={{ color: 'var(--text-muted)' }}>
                        Manage faculty, students, and invite links for your institution.
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

            <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                <div className="admin-card p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <Users size={16} style={{ color: 'var(--brand)' }} />
                        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Total Students</span>
                    </div>
                    <div className="text-2xl font-extrabold font-mono">{dashboardLoading ? '—' : dashboard?.total_students ?? 0}</div>
                </div>
                <div className="admin-card p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <Users size={16} style={{ color: 'var(--brand)' }} />
                        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Total Faculty</span>
                    </div>
                    <div className="text-2xl font-extrabold font-mono">{dashboardLoading ? '—' : dashboard?.total_faculty ?? 0}</div>
                </div>
                <div className="admin-card p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <TrendingUp size={16} style={{ color: 'var(--brand)' }} />
                        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Combined P&amp;L</span>
                    </div>
                    <div className="text-2xl font-extrabold font-mono" style={{ color: (dashboard?.total_pnl ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>
                        {dashboardLoading ? '—' : `₹${(dashboard?.total_pnl ?? 0).toLocaleString('en-IN')}`}
                    </div>
                </div>
            </section>

            <section className="admin-card p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h2 className="text-lg font-bold admin-section-title">Members ({membersTotal})</h2>
                    <div className="flex flex-wrap gap-2 items-center">
                        <div className="relative">
                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                            <input
                                className="input-field text-sm pl-8"
                                placeholder="Search name/email..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <select className="input-field text-sm" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                            <option value="">All Roles</option>
                            <option value="student">Student</option>
                            <option value="faculty">Faculty</option>
                        </select>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                <th className="text-left py-2 px-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Name</th>
                                <th className="text-left py-2 px-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Role</th>
                                <th className="text-right py-2 px-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>P&amp;L</th>
                            </tr>
                        </thead>
                        <tbody>
                            {membersLoading ? (
                                <tr><td colSpan={3} className="text-center py-6"><Loader2 size={18} className="animate-spin inline" style={{ color: 'var(--text-muted)' }} /></td></tr>
                            ) : members.length === 0 ? (
                                <tr><td colSpan={3} className="text-center py-6 text-sm" style={{ color: 'var(--text-muted)' }}>No members found</td></tr>
                            ) : (
                                members.map((m) => (
                                    <tr
                                        key={m.id}
                                        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                                        className="hover:brightness-110 transition-all"
                                        onClick={() => setSelectedStudentId(m.id)}
                                    >
                                        <td className="py-2 px-2 font-medium">{m.full_name}</td>
                                        <td className="py-2 px-2 capitalize" style={{ color: 'var(--text-secondary)' }}>{m.role}</td>
                                        <td className="py-2 px-2 text-right font-mono" style={{ color: m.pnl >= 0 ? '#10b981' : '#ef4444' }}>
                                            ₹{m.pnl.toLocaleString('en-IN')}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                {members.length > 0 && (
                    <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
                        Click a member to view their detailed stats.
                    </p>
                )}
            </section>

            {showInviteModal && <GenerateInviteModal onClose={() => setShowInviteModal(false)} />}
            {selectedStudentId && <StudentDetailModal studentId={selectedStudentId} onClose={() => setSelectedStudentId(null)} />}
        </div>
    );
}
