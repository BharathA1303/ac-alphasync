import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft, GraduationCap, Building2, Plus, Link2, Copy, Loader2,
    X, Search,
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

function CreateInstitutionModal({ onClose, onCreated }) {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [emailDomain, setEmailDomain] = useState('');
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name.trim() || !code.trim()) {
            toast.error('Name and code are required');
            return;
        }
        setSaving(true);
        try {
            const { data } = await academicApi.createInstitution({
                name: name.trim(),
                code: code.trim(),
                email_domain: emailDomain.trim() || undefined,
            });
            toast.success('Institution created');
            onCreated(data?.institution);
            onClose();
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to create institution'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
            <div className="w-full max-w-md rounded-2xl animate-slide-up" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
                <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
                    <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Create Institution</h2>
                    <button className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: 'var(--text-muted)' }} onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
                    <div>
                        <label className="label-text">Institution Name</label>
                        <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. IIT Bombay" required />
                    </div>
                    <div>
                        <label className="label-text">Code</label>
                        <input className="input-field" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. IITB" required maxLength={50} />
                    </div>
                    <div>
                        <label className="label-text">Email Domain (optional)</label>
                        <input className="input-field" value={emailDomain} onChange={(e) => setEmailDomain(e.target.value)} placeholder="e.g. @iitb.ac.in" />
                    </div>
                    <button type="submit" className="admin-action-btn admin-action-btn--primary text-sm mt-2" disabled={saving}>
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create Institution
                    </button>
                </form>
            </div>
        </div>
    );
}

function InviteLinkRow({ link }) {
    const fullUrl = `${window.location.origin}/register?invite=${link.token}`;
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(fullUrl);
            toast.success('Invite link copied');
        } catch {
            toast.error('Could not copy link');
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
            <button className="admin-action-btn admin-action-btn--secondary text-xs flex-shrink-0" onClick={handleCopy}>
                <Copy size={12} /> Copy
            </button>
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
                                {links.map((link) => <InviteLinkRow key={link.id} link={link} />)}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function AdminAcademicPage() {
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [institutions, setInstitutions] = useState([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [linkModalInstitution, setLinkModalInstitution] = useState(null);
    const [instSearch, setInstSearch] = useState('');

    const loadInstitutions = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await academicApi.listInstitutions();
            setInstitutions(data?.institutions || []);
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to load institutions'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadInstitutions(); }, [loadInstitutions]);

    const filteredInstitutions = useMemo(() => {
        const q = instSearch.trim().toLowerCase();
        if (!q) return institutions;
        return institutions.filter((inst) =>
            inst.name.toLowerCase().includes(q) || inst.code.toLowerCase().includes(q)
        );
    }, [institutions, instSearch]);

    return (
        <div className="admin-shell p-3 sm:p-4 md:p-5 lg:p-6">
            <header className="flex flex-wrap items-start sm:items-center justify-between gap-3 mb-4 sm:mb-5">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <GraduationCap size={14} style={{ color: 'var(--brand)' }} />
                        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Admin Workspace</span>
                    </div>
                    <h1 className="text-xl sm:text-2xl font-bold">Institution Management</h1>
                    <p className="text-xs sm:text-sm" style={{ color: 'var(--text-muted)' }}>
                        Create institutions and manage academic invite links.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button className="admin-action-btn admin-action-btn--primary text-sm" onClick={() => setShowCreateModal(true)}>
                        <Plus size={14} /> Create Institution
                    </button>
                    <button className="admin-action-btn admin-action-btn--secondary text-sm" onClick={() => navigate('/admin/panel')}>
                        <ArrowLeft size={14} /> Back to Admin Panel
                    </button>
                </div>
            </header>

            <section className="admin-card p-4 sm:p-5 mb-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h2 className="text-lg font-bold admin-section-title flex items-center gap-2">
                        <Building2 size={16} /> Institutions ({institutions.length})
                    </h2>
                    <div className="relative">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                        <input
                            className="input-field text-sm pl-8"
                            placeholder="Search institutions..."
                            value={instSearch}
                            onChange={(e) => setInstSearch(e.target.value)}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                <th className="text-left py-2 px-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Institution</th>
                                <th className="text-left py-2 px-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Status</th>
                                <th className="text-right py-2 px-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Admins</th>
                                <th className="text-right py-2 px-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Faculty</th>
                                <th className="text-right py-2 px-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Students</th>
                                <th className="text-right py-2 px-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Invite</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={6} className="text-center py-8"><Loader2 size={20} className="animate-spin inline" style={{ color: 'var(--text-muted)' }} /></td></tr>
                            ) : filteredInstitutions.length === 0 ? (
                                <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>
                                    {institutions.length === 0 ? 'No institutions yet. Create one to get started.' : 'No institutions match your search.'}
                                </td></tr>
                            ) : (
                                filteredInstitutions.map((inst) => (
                                    <tr
                                        key={inst.id}
                                        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                                        onClick={() => navigate(`/admin/academic/institutions/${inst.id}`)}
                                        className="hover:brightness-110 transition-all"
                                    >
                                        <td className="py-2.5 px-2">
                                            <div className="flex items-center gap-2">
                                                <Building2 size={14} style={{ color: 'var(--brand)' }} className="flex-shrink-0" />
                                                <div className="min-w-0">
                                                    <div className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{inst.name}</div>
                                                    <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{inst.code}{inst.email_domain ? ` · ${inst.email_domain}` : ''}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-2.5 px-2"><StatusBadge status={inst.status} /></td>
                                        <td className="py-2.5 px-2 text-right font-mono">{inst.admin_count}</td>
                                        <td className="py-2.5 px-2 text-right font-mono">{inst.faculty_count}</td>
                                        <td className="py-2.5 px-2 text-right font-mono">{inst.student_count}</td>
                                        <td className="py-2.5 px-2 text-right">
                                            <button
                                                className="admin-action-btn admin-action-btn--secondary text-xs"
                                                onClick={(e) => { e.stopPropagation(); setLinkModalInstitution(inst); }}
                                            >
                                                <Link2 size={12} /> Links
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                {filteredInstitutions.length > 0 && (
                    <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
                        Click an institution to view its members.
                    </p>
                )}
            </section>

            {showCreateModal && (
                <CreateInstitutionModal
                    onClose={() => setShowCreateModal(false)}
                    onCreated={() => loadInstitutions()}
                />
            )}
            {linkModalInstitution && (
                <GenerateInviteModal
                    institution={linkModalInstitution}
                    onClose={() => setLinkModalInstitution(null)}
                />
            )}
        </div>
    );
}
