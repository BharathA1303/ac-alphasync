import { useCallback, useEffect, useState } from 'react';
import {
    GraduationCap, Plus, Loader2, X, ChevronDown, ChevronRight, Trash2,
    BookOpen, ClipboardCheck, Clock, CheckCircle2, XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import facultyApi from '../services/facultyApi';
import { useAuthStore } from '../stores/useAuthStore';

function parseApiError(error, fallback = 'Request failed') {
    return error?.response?.data?.detail || error?.message || fallback;
}

const STATUS_META = {
    pending: { label: 'Pending review', icon: Clock, color: '#f59e0b' },
    approved: { label: 'Approved', icon: CheckCircle2, color: '#10b981' },
    rejected: { label: 'Needs changes', icon: XCircle, color: '#ef4444' },
};

function StatusBadge({ status }) {
    const meta = STATUS_META[status] || STATUS_META.pending;
    const Icon = meta.icon;
    return (
        <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
            style={{ background: `${meta.color}1a`, color: meta.color, border: `1px solid ${meta.color}4d` }}
        >
            <Icon size={10} /> {meta.label}
        </span>
    );
}

function NewCourseModal({ onClose, onCreated }) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [saving, setSaving] = useState(false);

    const handleCreate = async () => {
        if (!title.trim()) {
            toast.error('Course title is required');
            return;
        }
        setSaving(true);
        try {
            await facultyApi.createCourse({ title: title.trim(), description: description.trim() || null });
            toast.success('Course submitted for approval');
            onCreated();
            onClose();
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to create course'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
            <div className="w-full max-w-md rounded-2xl animate-slide-up" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
                <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--border)' }}>
                    <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>New Subject / Course</h2>
                    <button className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ color: 'var(--text-muted)' }} onClick={onClose}>
                        <X size={16} />
                    </button>
                </div>
                <div className="p-4 flex flex-col gap-3">
                    <div>
                        <label className="label-text">Title</label>
                        <input
                            className="input-field text-sm w-full"
                            placeholder="e.g. Technical Analysis Basics"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="label-text">Description (optional)</label>
                        <textarea
                            className="input-field text-sm w-full"
                            style={{ height: 72, resize: 'vertical', paddingTop: 10 }}
                            placeholder="What will students learn?"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        This goes to your Institution Admin for approval before students can see it.
                    </p>
                    <button className="admin-action-btn admin-action-btn--primary text-sm justify-center" disabled={saving} onClick={handleCreate}>
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Submit for Approval
                    </button>
                </div>
            </div>
        </div>
    );
}

function AddLessonRow({ courseId, onAdded }) {
    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [saving, setSaving] = useState(false);

    const handleAdd = async () => {
        if (!title.trim()) return;
        setSaving(true);
        try {
            await facultyApi.addLesson(courseId, { title: title.trim(), content: content.trim() || null, order_index: 0 });
            setTitle('');
            setContent('');
            setOpen(false);
            onAdded();
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to add lesson'));
        } finally {
            setSaving(false);
        }
    };

    if (!open) {
        return (
            <button
                className="flex items-center gap-1.5 text-xs font-medium px-2 py-1.5 rounded-md w-full justify-center"
                style={{ color: 'var(--brand)', background: 'var(--bg-muted)', border: '1px dashed var(--border-strong)' }}
                onClick={() => setOpen(true)}
            >
                <Plus size={12} /> Add lesson
            </button>
        );
    }

    return (
        <div className="flex flex-col gap-2 p-2.5 rounded-md" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
            <input className="input-field text-xs" style={{ height: 32 }} placeholder="Lesson title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            <textarea className="input-field text-xs" style={{ height: 56, resize: 'vertical', paddingTop: 8 }} placeholder="Lesson content (text)" value={content} onChange={(e) => setContent(e.target.value)} />
            <div className="flex gap-1.5">
                <button className="admin-action-btn admin-action-btn--primary text-xs flex-1 justify-center" style={{ minHeight: 30 }} disabled={saving} onClick={handleAdd}>
                    {saving ? <Loader2 size={12} className="animate-spin" /> : 'Save'}
                </button>
                <button className="admin-action-btn admin-action-btn--secondary text-xs" style={{ minHeight: 30 }} onClick={() => setOpen(false)}>Cancel</button>
            </div>
        </div>
    );
}

function AddAssessmentRow({ courseId, onAdded }) {
    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState('');
    const [instructions, setInstructions] = useState('');
    const [passScore, setPassScore] = useState(70);
    const [saving, setSaving] = useState(false);

    const handleAdd = async () => {
        if (!title.trim()) return;
        setSaving(true);
        try {
            await facultyApi.addAssessment(courseId, { title: title.trim(), instructions: instructions.trim() || null, pass_score: Number(passScore) || 70 });
            setTitle('');
            setInstructions('');
            setOpen(false);
            onAdded();
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to add assessment'));
        } finally {
            setSaving(false);
        }
    };

    if (!open) {
        return (
            <button
                className="flex items-center gap-1.5 text-xs font-medium px-2 py-1.5 rounded-md w-full justify-center"
                style={{ color: 'var(--brand)', background: 'var(--bg-muted)', border: '1px dashed var(--border-strong)' }}
                onClick={() => setOpen(true)}
            >
                <Plus size={12} /> Add assessment
            </button>
        );
    }

    return (
        <div className="flex flex-col gap-2 p-2.5 rounded-md" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
            <input className="input-field text-xs" style={{ height: 32 }} placeholder="Assessment title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            <textarea className="input-field text-xs" style={{ height: 48, resize: 'vertical', paddingTop: 8 }} placeholder="Instructions" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
            <div className="flex items-center gap-2">
                <label className="text-[10px] uppercase tracking-wide flex-shrink-0" style={{ color: 'var(--text-muted)' }}>Pass %</label>
                <input className="input-field text-xs" style={{ height: 30, width: 64 }} type="number" min="0" max="100" value={passScore} onChange={(e) => setPassScore(e.target.value)} />
            </div>
            <div className="flex gap-1.5">
                <button className="admin-action-btn admin-action-btn--primary text-xs flex-1 justify-center" style={{ minHeight: 30 }} disabled={saving} onClick={handleAdd}>
                    {saving ? <Loader2 size={12} className="animate-spin" /> : 'Save'}
                </button>
                <button className="admin-action-btn admin-action-btn--secondary text-xs" style={{ minHeight: 30 }} onClick={() => setOpen(false)}>Cancel</button>
            </div>
        </div>
    );
}

function CourseRow({ course, expanded, onToggle, onChanged }) {
    const [detail, setDetail] = useState(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const locked = course.status === 'approved';

    const loadDetail = useCallback(async () => {
        setLoadingDetail(true);
        try {
            const { data } = await facultyApi.getCourse(course.id);
            setDetail(data);
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to load course'));
        } finally {
            setLoadingDetail(false);
        }
    }, [course.id]);

    useEffect(() => {
        if (expanded) loadDetail();
    }, [expanded, loadDetail]);

    const refreshDetail = () => {
        loadDetail();
        onChanged();
    };

    const handleDeleteLesson = async (lessonId) => {
        try {
            await facultyApi.deleteLesson(course.id, lessonId);
            refreshDetail();
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to remove lesson'));
        }
    };

    const handleDeleteAssessment = async (assessmentId) => {
        try {
            await facultyApi.deleteAssessment(course.id, assessmentId);
            refreshDetail();
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to remove assessment'));
        }
    };

    const handleDeleteCourse = async (e) => {
        e.stopPropagation();
        if (!window.confirm(`Delete "${course.title}"? This can't be undone.`)) return;
        setDeleting(true);
        try {
            await facultyApi.deleteCourse(course.id);
            toast.success('Course deleted');
            onChanged();
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to delete course'));
            setDeleting(false);
        }
    };

    return (
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            <div
                className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:brightness-110 transition-all"
                style={{ background: 'var(--bg-muted)' }}
                onClick={onToggle}
            >
                {expanded ? <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate">{course.title}</span>
                        <StatusBadge status={course.status} />
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {course.lesson_count} lesson{course.lesson_count === 1 ? '' : 's'} · {course.assessment_count} assessment{course.assessment_count === 1 ? '' : 's'}
                        {course.status === 'rejected' && course.review_note ? ` · "${course.review_note}"` : ''}
                    </div>
                </div>
                <button
                    className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                    style={{ color: '#ef4444' }}
                    onClick={handleDeleteCourse}
                    disabled={deleting}
                    title="Delete course"
                >
                    {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
            </div>

            {expanded && (
                <div className="p-3 flex flex-col gap-4" style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--border)' }}>
                    {loadingDetail ? (
                        <div className="flex items-center justify-center py-6"><Loader2 size={16} className="animate-spin" style={{ color: 'var(--text-muted)' }} /></div>
                    ) : (
                        <>
                            {course.description && (
                                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{course.description}</p>
                            )}
                            {locked && (
                                <p className="text-[11px] px-2 py-1.5 rounded-md" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
                                    This course is approved and live for students — content is locked. Contact your Institution Admin to make changes.
                                </p>
                            )}

                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                                    <BookOpen size={12} /> Lessons
                                </div>
                                {(detail?.lessons || []).map((l) => (
                                    <div key={l.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-xs" style={{ background: 'var(--bg-muted)' }}>
                                        <span className="truncate font-medium">{l.title}</span>
                                        {!locked && (
                                            <button className="flex-shrink-0" style={{ color: 'var(--text-muted)' }} onClick={() => handleDeleteLesson(l.id)} title="Remove lesson">
                                                <Trash2 size={12} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                                {!locked && <AddLessonRow courseId={course.id} onAdded={refreshDetail} />}
                            </div>

                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                                    <ClipboardCheck size={12} /> Assessments
                                </div>
                                {(detail?.assessments || []).map((a) => (
                                    <div key={a.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-xs" style={{ background: 'var(--bg-muted)' }}>
                                        <span className="truncate font-medium">{a.title} <span style={{ color: 'var(--text-muted)' }}>· pass {a.pass_score}%</span></span>
                                        {!locked && (
                                            <button className="flex-shrink-0" style={{ color: 'var(--text-muted)' }} onClick={() => handleDeleteAssessment(a.id)} title="Remove assessment">
                                                <Trash2 size={12} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                                {!locked && <AddAssessmentRow courseId={course.id} onAdded={refreshDetail} />}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

export default function FacultyPortalPage() {
    const user = useAuthStore((s) => s.user);

    const [stats, setStats] = useState(null);
    const [statsLoading, setStatsLoading] = useState(true);
    const [courses, setCourses] = useState([]);
    const [coursesLoading, setCoursesLoading] = useState(true);
    const [expandedId, setExpandedId] = useState(null);
    const [showNewModal, setShowNewModal] = useState(false);

    const loadStats = useCallback(async () => {
        setStatsLoading(true);
        try {
            const { data } = await facultyApi.getDashboard();
            setStats(data);
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to load dashboard'));
        } finally {
            setStatsLoading(false);
        }
    }, []);

    const loadCourses = useCallback(async () => {
        setCoursesLoading(true);
        try {
            const { data } = await facultyApi.listCourses();
            setCourses(data?.courses || []);
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to load courses'));
        } finally {
            setCoursesLoading(false);
        }
    }, []);

    const refreshAll = () => { loadStats(); loadCourses(); };

    useEffect(() => { loadStats(); loadCourses(); }, [loadStats, loadCourses]);

    return (
        <div className="admin-shell p-3 sm:p-4 md:p-5 lg:p-6">
            <header className="flex flex-wrap items-start sm:items-center justify-between gap-3 mb-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <GraduationCap size={14} style={{ color: 'var(--brand)' }} />
                        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Faculty Workspace</span>
                    </div>
                    <h1 className="text-xl sm:text-2xl font-bold">{user?.full_name ? `Welcome, ${user.full_name}` : 'Course Builder'}</h1>
                    <p className="text-xs sm:text-sm" style={{ color: 'var(--text-muted)' }}>
                        Build subjects and assessments for your institution's students.
                    </p>
                </div>
                <button className="admin-action-btn admin-action-btn--primary text-sm" onClick={() => setShowNewModal(true)}>
                    <Plus size={14} /> New Course
                </button>
            </header>

            <section className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
                <div className="admin-mini-stat">
                    <div className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-muted)' }}>Pending</div>
                    <div className="text-lg font-extrabold font-mono" style={{ color: '#f59e0b' }}>{statsLoading ? '—' : stats?.pending ?? 0}</div>
                </div>
                <div className="admin-mini-stat">
                    <div className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-muted)' }}>Approved</div>
                    <div className="text-lg font-extrabold font-mono" style={{ color: '#10b981' }}>{statsLoading ? '—' : stats?.approved ?? 0}</div>
                </div>
                <div className="admin-mini-stat">
                    <div className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-muted)' }}>Total</div>
                    <div className="text-lg font-extrabold font-mono">{statsLoading ? '—' : stats?.total_courses ?? 0}</div>
                </div>
            </section>

            <section className="admin-card p-3 sm:p-4">
                <h2 className="text-sm font-bold admin-section-title mb-3">My Courses</h2>

                {coursesLoading ? (
                    <div className="flex items-center justify-center py-8"><Loader2 size={18} className="animate-spin" style={{ color: 'var(--text-muted)' }} /></div>
                ) : courses.length === 0 ? (
                    <div className="text-center py-8">
                        <p className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>No courses yet.</p>
                        <button className="admin-action-btn admin-action-btn--secondary text-xs" onClick={() => setShowNewModal(true)}>
                            <Plus size={12} /> Create your first course
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {courses.map((c) => (
                            <CourseRow
                                key={c.id}
                                course={c}
                                expanded={expandedId === c.id}
                                onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
                                onChanged={refreshAll}
                            />
                        ))}
                    </div>
                )}
            </section>

            {showNewModal && <NewCourseModal onClose={() => setShowNewModal(false)} onCreated={refreshAll} />}
        </div>
    );
}
