import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ArrowLeft, Building2, Users, Search, Loader2, Link2, Copy, X, Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import academicApi from '../services/academicApi';

function parseApiError(error, fallback = 'Request failed') {
    return error?.response?.data?.detail || error?.message || fallback;
}

const EXPIRY_OPTIONS = [
    { value: '24h', label: '24 hours' },
    { value: '7d', label: '7 days' },
    { value: '30d', label: '30 days' },
];

const ROLE_LABELS = {
    institution_admin: 'Institution Admin',
    faculty: 'Faculty',
    student: 'Student',
};

function StatusBadge({ status }) {
    const active = status === 'active';
    return (
        <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
            style={{
                background: active ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                color: active ? '#10b981' : '#ef4444',
            }}
        >
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: active ? '#10b981' : '#ef4444' }} />
            {active ? 'Active' : 'Suspended'}
        </span>
    );
}

function timeLeftLabel(expiresAt) {
    if (!expiresAt) return '—';
    const diffMs = new Date(expiresAt).getTime() - Date.now();
    if (diffMs <= 0) return 'Expired';
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    if (hours < 1) return '<1h left';
    if (hours < 24) return `${hours}h left`;
    return `${Math.floor(hours / 24)}d left`;
}

function InviteLinkRow({ link, onDeleted, onDelete }) {
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
            await onDelete(link.id);
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

function GenerateInviteModal({ institution, onClose }) {
    const [expiry, setExpiry] = useState('7d');
    const [saving, setSaving] = useState(false);
    const [links, setLinks] = useState([]);
    const [loadingLinks, setLoadingLinks] = useState(true);

    const loadLinks = useCallback(async () => {
        setLoadingLinks(true);
        try {
            const { data } = await academicApi.listInstitutionAdminInvites(institution.id);
            setLinks(data?.invite_links || []);
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to load invite links'));
        } finally {
            setLoadingLinks(false);
        }
    }, [institution.id]);

    useEffect(() => { loadLinks(); }, [loadLinks]);

    const handleGenerate = async () => {
        setSaving(true);
        try {
            await academicApi.createInstitutionAdminInvite({ institution_id: institution.id, expiry });
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
                    <div>
                        <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Inst. Admin Invite Links</h2>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{institution.name}</p>
                    </div>
                    <button className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: 'var(--text-muted)' }} onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>
                <div className="p-5 flex flex-col gap-4">
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
                                {links.map((link) => (
                                    <InviteLinkRow
                                        key={link.id}
                                        link={link}
                                        onDelete={(linkId) => academicApi.deleteInstitutionAdminInvite(institution.id, linkId)}
                                        onDeleted={loadLinks}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function AdminInstitutionDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [institution, setInstitution] = useState(null);
    const [instLoading, setInstLoading] = useState(true);
    const [showLinkModal, setShowLinkModal] = useState(false);

    const [members, setMembers] = useState([]);
    const [membersTotal, setMembersTotal] = useState(0);
    const [membersLoading, setMembersLoading] = useState(false);
    const [roleFilter, setRoleFilter] = useState('');
    const [search, setSearch] = useState('');

    const loadInstitution = useCallback(async () => {
        setInstLoading(true);
        try {
            const { data } = await academicApi.getInstitution(id);
            setInstitution(data?.institution || null);
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to load institution'));
        } finally {
            setInstLoading(false);
        }
    }, [id]);

    const loadMembers = useCallback(async () => {
        setMembersLoading(true);
        try {
            const params = { institution_id: id };
            if (roleFilter) params.role = roleFilter;
            const { data } = await academicApi.listAcademicUsers(params);
            setMembers(data?.users || []);
            setMembersTotal(data?.total || 0);
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to load members'));
        } finally {
            setMembersLoading(false);
        }
    }, [id, roleFilter]);

    useEffect(() => { loadInstitution(); }, [loadInstitution]);
    useEffect(() => { loadMembers(); }, [loadMembers]);

    const filteredMembers = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return members;
        return members.filter((m) =>
            (m.full_name || '').toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q)
        );
    }, [members, search]);

    if (instLoading) {
        return (
            <div className="admin-shell p-3 sm:p-4 md:p-5 lg:p-6 flex items-center justify-center" style={{ minHeight: '50vh' }}>
                <Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
            </div>
        );
    }

    if (!institution) {
        return (
            <div className="admin-shell p-3 sm:p-4 md:p-5 lg:p-6">
                <div className="admin-card p-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                    Institution not found.
                    <div className="mt-3">
                        <button className="admin-action-btn admin-action-btn--secondary text-sm" onClick={() => navigate('/admin/academic')}>
                            <ArrowLeft size={14} /> Back to Institution Management
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-shell p-3 sm:p-4 md:p-5 lg:p-6">
            <header className="flex flex-wrap items-start sm:items-center justify-between gap-3 mb-4 sm:mb-5">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Building2 size={14} style={{ color: 'var(--brand)' }} />
                        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Admin Workspace</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-xl sm:text-2xl font-bold">{institution.name}</h1>
                        <StatusBadge status={institution.status} />
                    </div>
                    <p className="text-xs sm:text-sm" style={{ color: 'var(--text-muted)' }}>
                        {institution.code}{institution.email_domain ? ` · ${institution.email_domain}` : ''}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button className="admin-action-btn admin-action-btn--primary text-sm" onClick={() => setShowLinkModal(true)}>
                        <Link2 size={14} /> Invite Links
                    </button>
                    <button className="admin-action-btn admin-action-btn--secondary text-sm" onClick={() => navigate('/admin/academic')}>
                        <ArrowLeft size={14} /> Back to Institutions
                    </button>
                </div>
            </header>

            <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                <div className="admin-card p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Admins</div>
                    <div className="text-2xl font-extrabold font-mono mt-1">{institution.admin_count}</div>
                </div>
                <div className="admin-card p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Faculty</div>
                    <div className="text-2xl font-extrabold font-mono mt-1">{institution.faculty_count}</div>
                </div>
                <div className="admin-card p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Students</div>
                    <div className="text-2xl font-extrabold font-mono mt-1">{institution.student_count}</div>
                </div>
            </section>

            <section className="admin-card p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h2 className="text-lg font-bold admin-section-title flex items-center gap-2">
                        <Users size={16} /> Members ({membersTotal})
                    </h2>
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
                            <option value="institution_admin">Institution Admin</option>
                            <option value="faculty">Faculty</option>
                            <option value="student">Student</option>
                        </select>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                <th className="text-left py-2 px-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Name</th>
                                <th className="text-left py-2 px-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Email</th>
                                <th className="text-left py-2 px-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Role</th>
                                <th className="text-left py-2 px-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Joined</th>
                            </tr>
                        </thead>
                        <tbody>
                            {membersLoading ? (
                                <tr><td colSpan={4} className="text-center py-6"><Loader2 size={18} className="animate-spin inline" style={{ color: 'var(--text-muted)' }} /></td></tr>
                            ) : filteredMembers.length === 0 ? (
                                <tr><td colSpan={4} className="text-center py-6 text-sm" style={{ color: 'var(--text-muted)' }}>No members found</td></tr>
                            ) : (
                                filteredMembers.map((m) => (
                                    <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td className="py-2 px-2 font-medium">{m.full_name}</td>
                                        <td className="py-2 px-2" style={{ color: 'var(--text-secondary)' }}>{m.email}</td>
                                        <td className="py-2 px-2">{ROLE_LABELS[m.role] || m.role}</td>
                                        <td className="py-2 px-2 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{m.created_at ? new Date(m.created_at).toLocaleDateString() : '—'}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {showLinkModal && (
                <GenerateInviteModal institution={institution} onClose={() => setShowLinkModal(false)} />
            )}
        </div>
    );
}
