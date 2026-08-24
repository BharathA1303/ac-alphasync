import { useCallback, useEffect, useState } from 'react';
import {
    Sparkles, Loader2, X, CheckCircle2, XCircle, Clock, FileText, ClipboardCheck, Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import academicApi from '../services/academicApi';

function parseApiError(error, fallback = 'Request failed') {
    return error?.response?.data?.detail || error?.message || fallback;
}

const COURSE_STATUS_META = {
    pending: { label: 'Pending review', icon: Clock, color: '#f59e0b' },
    approved: { label: 'Approved', icon: CheckCircle2, color: '#10b981' },
    rejected: { label: 'Needs changes', icon: XCircle, color: '#ef4444' },
};

function CourseStatusBadge({ status }) {
    const meta = COURSE_STATUS_META[status] || COURSE_STATUS_META.pending;
    const Icon = meta.icon;
    return (
        <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide flex-shrink-0"
            style={{ background: `${meta.color}1a`, color: meta.color, border: `1px solid ${meta.color}4d` }}
        >
            <Icon size={10} /> {meta.label}
        </span>
    );
}

const COURSE_FILTERS = [
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Needs changes' },
    { value: '', label: 'All' },
];

function CourseFilterTabs({ value, onChange }) {
    return (
        <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
            {COURSE_FILTERS.map((f) => (
                <button
                    key={f.value}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors"
                    style={{
                        background: value === f.value ? 'var(--brand)' : 'transparent',
                        color: value === f.value ? '#04121a' : 'var(--text-muted)',
                    }}
                    onClick={() => onChange(f.value)}
                >
                    {f.label}
                </button>
            ))}
        </div>
    );
}

function RejectCourseModal({ course, onClose, onRejected }) {
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);

    const handleReject = async () => {
        if (!note.trim()) {
            toast.error('Add a note so the faculty member knows what to fix');
            return;
        }
        setSaving(true);
        try {
            await academicApi.rejectCourse(course.id, { review_note: note.trim() });
            toast.success('Course sent back for changes');
            onRejected();
            onClose();
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to reject course'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
            <div className="w-full max-w-md rounded-2xl animate-slide-up" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
                <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--border)' }}>
                    <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Send Back: {course.title}</h2>
                    <button className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ color: 'var(--text-muted)' }} onClick={onClose}>
                        <X size={16} />
                    </button>
                </div>
                <div className="p-4 flex flex-col gap-3">
                    <div>
                        <label className="label-text">What needs to change?</label>
                        <textarea
                            className="input-field text-sm w-full"
                            style={{ height: 90, resize: 'vertical', paddingTop: 10 }}
                            placeholder="e.g. Add at least one lesson before resubmitting"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <button className="admin-action-btn text-sm justify-center" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }} disabled={saving} onClick={handleReject}>
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />} Send Back
                    </button>
                </div>
            </div>
        </div>
    );
}

function CourseDetailModal({ course, onClose, onChanged }) {
    const [approving, setApproving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [showReject, setShowReject] = useState(false);

    const handleApprove = async () => {
        setApproving(true);
        try {
            await academicApi.approveCourse(course.id, {});
            toast.success('Course approved — now live for your students');
            onChanged();
            onClose();
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to approve course'));
        } finally {
            setApproving(false);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm(`Delete "${course.title}"? This removes it for students too. This can't be undone.`)) return;
        setDeleting(true);
        try {
            await academicApi.deleteInstitutionCourse(course.id);
            toast.success('Course deleted');
            onChanged();
            onClose();
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to delete course'));
            setDeleting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
            <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl animate-slide-up" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
                <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{course.title}</h2>
                        <CourseStatusBadge status={course.status} />
                    </div>
                    <button className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: 'var(--text-muted)' }} onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>
                <div className="p-5 flex flex-col gap-4">
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        By <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{course.author_name || 'Unknown faculty'}</span>
                    </div>
                    {course.description && (
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{course.description}</p>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                        <div className="admin-mini-stat">
                            <div className="flex items-center gap-1.5 mb-0.5">
                                <FileText size={11} style={{ color: 'var(--brand)' }} />
                                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Lessons</span>
                            </div>
                            <div className="text-lg font-bold font-mono">{course.lesson_count}</div>
                        </div>
                        <div className="admin-mini-stat">
                            <div className="flex items-center gap-1.5 mb-0.5">
                                <ClipboardCheck size={11} style={{ color: 'var(--brand)' }} />
                                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Assessments</span>
                            </div>
                            <div className="text-lg font-bold font-mono">{course.assessment_count}</div>
                        </div>
                    </div>

                    {course.status === 'rejected' && course.review_note && (
                        <p className="text-xs px-2.5 py-2 rounded-md" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                            Your note: "{course.review_note}"
                        </p>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                        {course.status !== 'approved' && (
                            <button className="admin-action-btn admin-action-btn--primary text-sm flex-1 justify-center" disabled={approving} onClick={handleApprove}>
                                {approving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Approve
                            </button>
                        )}
                        {course.status === 'pending' && (
                            <button className="admin-action-btn text-sm" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }} onClick={() => setShowReject(true)}>
                                <XCircle size={14} /> Send Back
                            </button>
                        )}
                        <button className="admin-action-btn text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }} disabled={deleting} onClick={handleDelete} title="Delete course">
                            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        </button>
                    </div>
                </div>
            </div>
            {showReject && (
                <RejectCourseModal
                    course={course}
                    onClose={() => setShowReject(false)}
                    onRejected={() => { onChanged(); onClose(); }}
                />
            )}
        </div>
    );
}

function CourseRow({ course, onOpen }) {
    return (
        <div
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:brightness-110 transition-all"
            style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}
            onClick={() => onOpen(course)}
        >
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate">{course.title}</span>
                    <CourseStatusBadge status={course.status} />
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    By {course.author_name || 'Unknown'} · {course.lesson_count} lesson{course.lesson_count === 1 ? '' : 's'} · {course.assessment_count} assessment{course.assessment_count === 1 ? '' : 's'}
                </div>
            </div>
        </div>
    );
}

export default function InstitutionCoursesPage() {
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('pending');
    const [selectedCourse, setSelectedCourse] = useState(null);

    const loadCourses = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await academicApi.listInstitutionCourses(filter ? { status: filter } : {});
            setCourses(data?.courses || []);
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to load courses'));
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => { loadCourses(); }, [loadCourses]);

    return (
        <div className="admin-shell p-3 sm:p-4 md:p-5 lg:p-6">
            <header className="flex flex-wrap items-start sm:items-center justify-between gap-3 mb-4 sm:mb-5">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Sparkles size={14} style={{ color: 'var(--brand)' }} />
                        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Course Approvals</span>
                    </div>
                    <h1 className="text-xl sm:text-2xl font-bold">Courses</h1>
                    <p className="text-xs sm:text-sm" style={{ color: 'var(--text-muted)' }}>
                        Review subjects submitted by your institution's faculty before students can see them.
                    </p>
                </div>
            </header>

            <section className="admin-card p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h2 className="text-lg font-bold admin-section-title">All Courses</h2>
                    <CourseFilterTabs value={filter} onChange={setFilter} />
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-8"><Loader2 size={18} className="animate-spin" style={{ color: 'var(--text-muted)' }} /></div>
                ) : courses.length === 0 ? (
                    <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>
                        {filter === 'pending' ? 'Nothing waiting for review.' : 'No courses match this filter.'}
                    </p>
                ) : (
                    <div className="flex flex-col gap-2">
                        {courses.map((c) => (
                            <CourseRow key={c.id} course={c} onOpen={setSelectedCourse} />
                        ))}
                    </div>
                )}

                {selectedCourse && (
                    <CourseDetailModal
                        course={selectedCourse}
                        onClose={() => setSelectedCourse(null)}
                        onChanged={loadCourses}
                    />
                )}
            </section>
        </div>
    );
}
