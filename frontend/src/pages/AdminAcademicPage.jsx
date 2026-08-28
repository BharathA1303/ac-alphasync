import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft, GraduationCap, Building2, Plus, Loader2,
    X, Search, Edit3, Shield, Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import academicApi from '../services/academicApi';

function parseApiError(error, fallback = 'Request failed') {
    return error?.response?.data?.detail || error?.message || fallback;
}

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
    const [maxAdmins, setMaxAdmins] = useState(5);
    const [maxFaculty, setMaxFaculty] = useState(20);
    const [maxStudents, setMaxStudents] = useState(200);
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name.trim() || !code.trim()) {
            toast.error('Name and code are required');
            return;
        }
        if (Number(maxAdmins) < 1) {
            toast.error('Admin limit must be at least 1');
            return;
        }
        setSaving(true);
        try {
            const { data } = await academicApi.createInstitution({
                name: name.trim(),
                code: code.trim(),
                email_domain: emailDomain.trim() || undefined,
                max_institution_admins: Number(maxAdmins),
                max_faculty: Number(maxFaculty),
                max_students: Number(maxStudents),
            });
            toast.success('Institution created successfully');
            onCreated(data?.institution);
            onClose();
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to create institution'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }}>
            <div className="w-full max-w-lg rounded-2xl animate-slide-up overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
                <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
                    <div>
                        <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Create Institution</h2>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Configure details and set capacity quotas</p>
                    </div>
                    <button className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: 'var(--text-muted)' }} onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3.5 max-h-[80vh] overflow-y-auto">
                    <div>
                        <label className="label-text">Institution Name</label>
                        <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. IIT Bombay" required />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label-text">Code</label>
                            <input className="input-field uppercase" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. IITB" required maxLength={50} />
                        </div>
                        <div>
                            <label className="label-text">Email Domain (optional)</label>
                            <input className="input-field" value={emailDomain} onChange={(e) => setEmailDomain(e.target.value)} placeholder="e.g. @iitb.ac.in" />
                        </div>
                    </div>

                    <div className="p-3.5 rounded-xl mt-1" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                        <div className="text-xs font-bold uppercase tracking-wider mb-2.5 flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                            <Shield size={13} style={{ color: 'var(--brand)' }} /> User Quotas & Role Limits
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className="label-text text-[11px]">Max Admins</label>
                                <input
                                    type="number"
                                    min="1"
                                    className="input-field text-sm"
                                    value={maxAdmins}
                                    onChange={(e) => setMaxAdmins(e.target.value)}
                                    required
                                />
                            </div>
                            <div>
                                <label className="label-text text-[11px]">Max Faculty</label>
                                <input
                                    type="number"
                                    min="0"
                                    className="input-field text-sm"
                                    value={maxFaculty}
                                    onChange={(e) => setMaxFaculty(e.target.value)}
                                    required
                                />
                            </div>
                            <div>
                                <label className="label-text text-[11px]">Max Students</label>
                                <input
                                    type="number"
                                    min="0"
                                    className="input-field text-sm"
                                    value={maxStudents}
                                    onChange={(e) => setMaxStudents(e.target.value)}
                                    required
                                />
                            </div>
                        </div>
                        <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>
                            Super Admin will invite Institution Admins. Institution Admins will invite Faculty & Students within these limits.
                        </p>
                    </div>

                    <button type="submit" className="admin-action-btn admin-action-btn--primary text-sm mt-2 py-2.5" disabled={saving}>
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create Institution
                    </button>
                </form>
            </div>
        </div>
    );
}

function EditInstitutionModal({ institution, onClose, onUpdated }) {
    const [name, setName] = useState(institution.name || '');
    const [emailDomain, setEmailDomain] = useState(institution.email_domain || '');
    const [status, setStatus] = useState(institution.status || 'active');
    const [maxAdmins, setMaxAdmins] = useState(institution.max_institution_admins || 5);
    const [maxFaculty, setMaxFaculty] = useState(institution.max_faculty || 20);
    const [maxStudents, setMaxStudents] = useState(institution.max_students || 200);
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name.trim()) {
            toast.error('Institution name is required');
            return;
        }
        if (Number(maxAdmins) < 1) {
            toast.error('Admin limit must be at least 1');
            return;
        }
        setSaving(true);
        try {
            const { data } = await academicApi.updateInstitution(institution.id, {
                name: name.trim(),
                email_domain: emailDomain.trim() || null,
                status,
                max_institution_admins: Number(maxAdmins),
                max_faculty: Number(maxFaculty),
                max_students: Number(maxStudents),
            });
            toast.success('Institution updated successfully');
            onUpdated(data?.institution);
            onClose();
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to update institution'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }}>
            <div className="w-full max-w-lg rounded-2xl animate-slide-up overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
                <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
                    <div>
                        <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Edit Institution & Limits</h2>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{institution.code} · Update details and quotas</p>
                    </div>
                    <button className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: 'var(--text-muted)' }} onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3.5 max-h-[80vh] overflow-y-auto">
                    <div>
                        <label className="label-text">Institution Name</label>
                        <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} required />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label-text">Status</label>
                            <select className="input-field" value={status} onChange={(e) => setStatus(e.target.value)}>
                                <option value="active">Active</option>
                                <option value="suspended">Suspended</option>
                            </select>
                        </div>
                        <div>
                            <label className="label-text">Email Domain (optional)</label>
                            <input className="input-field" value={emailDomain} onChange={(e) => setEmailDomain(e.target.value)} placeholder="e.g. @iitb.ac.in" />
                        </div>
                    </div>

                    <div className="p-3.5 rounded-xl mt-1" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                        <div className="text-xs font-bold uppercase tracking-wider mb-2.5 flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                            <Shield size={13} style={{ color: 'var(--brand)' }} /> User Quotas & Role Limits
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className="label-text text-[11px]">Max Admins</label>
                                <input
                                    type="number"
                                    min="1"
                                    className="input-field text-sm"
                                    value={maxAdmins}
                                    onChange={(e) => setMaxAdmins(e.target.value)}
                                    required
                                />
                            </div>
                            <div>
                                <label className="label-text text-[11px]">Max Faculty</label>
                                <input
                                    type="number"
                                    min="0"
                                    className="input-field text-sm"
                                    value={maxFaculty}
                                    onChange={(e) => setMaxFaculty(e.target.value)}
                                    required
                                />
                            </div>
                            <div>
                                <label className="label-text text-[11px]">Max Students</label>
                                <input
                                    type="number"
                                    min="0"
                                    className="input-field text-sm"
                                    value={maxStudents}
                                    onChange={(e) => setMaxStudents(e.target.value)}
                                    required
                                />
                            </div>
                        </div>
                        <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>
                            Limits control maximum allowable active members for each role in this institution.
                        </p>
                    </div>

                    <button type="submit" className="admin-action-btn admin-action-btn--primary text-sm mt-2 py-2.5" disabled={saving}>
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Edit3 size={14} />} Save Changes
                    </button>
                </form>
            </div>
        </div>
    );
}

export default function AdminAcademicPage() {
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [institutions, setInstitutions] = useState([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingInst, setEditingInst] = useState(null);
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
                        Create institutions, configure user limits, and invite institution admins.
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
                                <th className="text-center py-2 px-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Admins (Limit)</th>
                                <th className="text-center py-2 px-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Faculty (Limit)</th>
                                <th className="text-center py-2 px-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Students (Limit)</th>
                                <th className="text-right py-2 px-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Actions</th>
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
                                        <td className="py-2.5 px-2 text-center font-mono">
                                            <span style={{ color: (inst.admin_count >= (inst.max_institution_admins || 5)) ? '#f59e0b' : 'inherit' }}>
                                                {inst.admin_count}
                                            </span>
                                            <span style={{ color: 'var(--text-muted)' }}> / {inst.max_institution_admins ?? 5}</span>
                                        </td>
                                        <td className="py-2.5 px-2 text-center font-mono">
                                            <span style={{ color: (inst.faculty_count >= (inst.max_faculty || 20)) ? '#f59e0b' : 'inherit' }}>
                                                {inst.faculty_count}
                                            </span>
                                            <span style={{ color: 'var(--text-muted)' }}> / {inst.max_faculty ?? 20}</span>
                                        </td>
                                        <td className="py-2.5 px-2 text-center font-mono">
                                            <span style={{ color: (inst.student_count >= (inst.max_students || 200)) ? '#f59e0b' : 'inherit' }}>
                                                {inst.student_count}
                                            </span>
                                            <span style={{ color: 'var(--text-muted)' }}> / {inst.max_students ?? 200}</span>
                                        </td>
                                        <td className="py-2.5 px-2 text-right">
                                            <button
                                                className="admin-action-btn admin-action-btn--secondary text-xs"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditingInst(inst);
                                                }}
                                                title="Edit Institution & Limits"
                                            >
                                                <Edit3 size={12} /> Edit
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
                        Click any institution row to view members and generate institution admin invite links.
                    </p>
                )}
            </section>

            {showCreateModal && (
                <CreateInstitutionModal
                    onClose={() => setShowCreateModal(false)}
                    onCreated={() => loadInstitutions()}
                />
            )}

            {editingInst && (
                <EditInstitutionModal
                    institution={editingInst}
                    onClose={() => setEditingInst(null)}
                    onUpdated={() => loadInstitutions()}
                />
            )}
        </div>
    );
}
