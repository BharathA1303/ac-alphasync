import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft, GraduationCap, Building2, Plus, Link2, Copy, Loader2,
    X, Users, Search,
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

function GenerateInviteModal({ institution, onClose }) {
    const [expiry, setExpiry] = useState('7d');
    const [saving, setSaving] = useState(false);
    const [link, setLink] = useState(null);

    const handleGenerate = async () => {
        setSaving(true);
        try {
            const { data } = await academicApi.createInstitutionAdminInvite({
                institution_id: institution.id,
                expiry,
            });
            setLink(data?.invite_link);
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to generate invite link'));
        } finally {
            setSaving(false);
        }
    };

    const fullUrl = link ? `${window.location.origin}/register?invite=${link.token}` : '';

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(fullUrl);
            toast.success('Invite link copied');
        } catch {
            toast.error('Could not copy link');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
            <div className="w-full max-w-md rounded-2xl animate-slide-up" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
                <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
                    <div>
                        <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Generate Inst. Admin Link</h2>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{institution.name}</p>
                    </div>
                    <button className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: 'var(--text-muted)' }} onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>
                <div className="p-5 flex flex-col gap-4">
                    {!link ? (
                        <>
                            <div>
                                <label className="label-text">Expiry</label>
                                <div className="flex gap-2 mt-1">
                                    {EXPIRY_OPTIONS.map((opt) => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            className="admin-action-btn text-sm"
                                            style={{
                                                background: expiry === opt.value ? 'var(--brand)' : 'var(--bg-muted)',
                                                color: expiry === opt.value ? '#04121a' : 'var(--text-primary)',
                                                border: '1px solid var(--border)',
                                            }}
                                            onClick={() => setExpiry(opt.value)}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <button className="admin-action-btn admin-action-btn--primary text-sm" disabled={saving} onClick={handleGenerate}>
                                {saving ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} Generate Link
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="p-3 rounded-xl break-all text-sm font-mono" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                                {fullUrl}
                            </div>
                            <button className="admin-action-btn admin-action-btn--primary text-sm" onClick={handleCopy}>
                                <Copy size={14} /> Copy Link
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function InstitutionCard({ institution, onGenerateLink }) {
    return (
        <div className="admin-card p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <Building2 size={16} style={{ color: 'var(--brand)' }} />
                        <h3 className="font-bold truncate" style={{ color: 'var(--text-primary)' }}>{institution.name}</h3>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{institution.code}{institution.email_domain ? ` · ${institution.email_domain}` : ''}</p>
                </div>
                <StatusBadge status={institution.status} />
            </div>
            <div className="grid grid-cols-3 gap-2">
                <div className="admin-mini-stat">
                    <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Admins</div>
                    <div className="text-sm font-bold">{institution.admin_count}</div>
                </div>
                <div className="admin-mini-stat">
                    <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Faculty</div>
                    <div className="text-sm font-bold">{institution.faculty_count}</div>
                </div>
                <div className="admin-mini-stat">
                    <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Students</div>
                    <div className="text-sm font-bold">{institution.student_count}</div>
                </div>
            </div>
            <button className="admin-action-btn admin-action-btn--secondary text-sm" onClick={() => onGenerateLink(institution)}>
                <Link2 size={14} /> Generate Admin Invite
            </button>
        </div>
    );
}

export default function AdminAcademicPage() {
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [institutions, setInstitutions] = useState([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [linkModalInstitution, setLinkModalInstitution] = useState(null);

    const [members, setMembers] = useState([]);
    const [membersTotal, setMembersTotal] = useState(0);
    const [membersLoading, setMembersLoading] = useState(false);
    const [roleFilter, setRoleFilter] = useState('');
    const [institutionFilter, setInstitutionFilter] = useState('');

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

    const loadMembers = useCallback(async () => {
        setMembersLoading(true);
        try {
            const params = {};
            if (roleFilter) params.role = roleFilter;
            if (institutionFilter) params.institution_id = institutionFilter;
            const { data } = await academicApi.listAcademicUsers(params);
            setMembers(data?.users || []);
            setMembersTotal(data?.total || 0);
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to load academic members'));
        } finally {
            setMembersLoading(false);
        }
    }, [roleFilter, institutionFilter]);

    useEffect(() => { loadInstitutions(); }, [loadInstitutions]);
    useEffect(() => { loadMembers(); }, [loadMembers]);

    const institutionNameById = useMemo(() => {
        const map = {};
        institutions.forEach((inst) => { map[inst.id] = inst.name; });
        return map;
    }, [institutions]);

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

            <section className="mb-5">
                <h2 className="text-lg font-bold admin-section-title mb-3">Institutions</h2>
                {loading ? (
                    <div className="flex items-center justify-center p-8"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-muted)' }} /></div>
                ) : institutions.length === 0 ? (
                    <div className="admin-card p-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                        No institutions yet. Create one to get started.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {institutions.map((inst) => (
                            <InstitutionCard key={inst.id} institution={inst} onGenerateLink={setLinkModalInstitution} />
                        ))}
                    </div>
                )}
            </section>

            <section className="admin-card p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h2 className="text-lg font-bold admin-section-title flex items-center gap-2">
                        <Users size={16} /> Academic Members ({membersTotal})
                    </h2>
                    <div className="flex flex-wrap gap-2">
                        <select className="input-field text-sm" value={institutionFilter} onChange={(e) => setInstitutionFilter(e.target.value)}>
                            <option value="">All Institutions</option>
                            {institutions.map((inst) => <option key={inst.id} value={inst.id}>{inst.name}</option>)}
                        </select>
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
                                <th className="text-left py-2 px-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Institution</th>
                                <th className="text-left py-2 px-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Joined</th>
                            </tr>
                        </thead>
                        <tbody>
                            {membersLoading ? (
                                <tr><td colSpan={5} className="text-center py-6"><Loader2 size={18} className="animate-spin inline" style={{ color: 'var(--text-muted)' }} /></td></tr>
                            ) : members.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-6 text-sm" style={{ color: 'var(--text-muted)' }}>No members found</td></tr>
                            ) : (
                                members.map((m) => (
                                    <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td className="py-2 px-2 font-medium">{m.full_name}</td>
                                        <td className="py-2 px-2" style={{ color: 'var(--text-secondary)' }}>{m.email}</td>
                                        <td className="py-2 px-2">{ROLE_LABELS[m.role] || m.role}</td>
                                        <td className="py-2 px-2" style={{ color: 'var(--text-secondary)' }}>{institutionNameById[m.institution_id] || '—'}</td>
                                        <td className="py-2 px-2 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{m.created_at ? new Date(m.created_at).toLocaleDateString() : '—'}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
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
