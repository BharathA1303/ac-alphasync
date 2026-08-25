import { useCallback, useEffect, useRef, useState } from 'react';
import {
    GraduationCap, Plus, Loader2, X, ArrowLeft, Trash2, Upload, FileText,
    File as FileIcon, Sparkles, CheckCircle2, XCircle, Clock, Save, Wand2,
    ChevronRight, ChevronDown, Settings2, ListChecks, Info,
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

const FILE_ICON_LABEL = { pdf: 'PDF', docx: 'DOCX', pptx: 'PPTX', md: 'MD' };

function StatusBadge({ status }) {
    const meta = STATUS_META[status] || STATUS_META.pending;
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

/* ────────────────────────────────────────────────────────────────
 * STAGE 1 — New course modal (title + description only)
 * ──────────────────────────────────────────────────────────────── */
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
            const { data } = await facultyApi.createCourse({ title: title.trim(), description: description.trim() || null });
            toast.success('Course created — add lessons and an assessment next');
            onCreated(data.id);
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
                        Next you'll add lessons and build an assessment — each in its own section. This goes to your Institution Admin for approval before students can see it.
                    </p>
                    <button className="admin-action-btn admin-action-btn--primary text-sm justify-center" disabled={saving} onClick={handleCreate}>
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create &amp; Continue
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────
 * "My Courses" — name-only rows with status filter, no accordion
 * ──────────────────────────────────────────────────────────────── */
function CourseListRow({ course, onOpen, onDelete }) {
    const [deleting, setDeleting] = useState(false);

    const handleDelete = async (e) => {
        e.stopPropagation();
        if (!window.confirm(`Delete "${course.title}"? This can't be undone.`)) return;
        setDeleting(true);
        try {
            await facultyApi.deleteCourse(course.id);
            toast.success('Course deleted');
            onDelete();
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to delete course'));
            setDeleting(false);
        }
    };

    return (
        <div
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:brightness-110 transition-all"
            style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}
            onClick={() => onOpen(course.id)}
        >
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
            <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} className="flex-shrink-0" />
            <button
                className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                style={{ color: '#ef4444' }}
                onClick={handleDelete}
                disabled={deleting}
                title="Delete course"
            >
                {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            </button>
        </div>
    );
}

const FILTERS = [
    { value: '', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Needs changes' },
];

function FilterTabs({ value, onChange }) {
    return (
        <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
            {FILTERS.map((f) => (
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

/* ────────────────────────────────────────────────────────────────
 * Lessons section — clickable rows, one open at a time
 * ──────────────────────────────────────────────────────────────── */

function LessonMaterialUpload({ courseId, lesson, locked, onChanged }) {
    const inputRef = useRef(null);
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);

    const materials = lesson.materials && lesson.materials.length > 0
        ? lesson.materials
        : (lesson.file_url ? [{ id: `primary-${lesson.id}`, file_url: lesson.file_url, file_name: lesson.file_name, file_type: lesson.file_type }] : []);

    const handleFile = async (file) => {
        if (!file) return;
        setUploading(true);
        try {
            await facultyApi.uploadLessonMaterial(courseId, lesson.id, file);
            toast.success('Study material attached');
            onChanged();
        } catch (err) {
            toast.error(parseApiError(err, 'Upload failed'));
        } finally {
            setUploading(false);
        }
    };

    const handleRemove = async (matId) => {
        try {
            await facultyApi.deleteLessonMaterial(courseId, lesson.id, matId);
            toast.success('Material removed');
            onChanged();
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to remove material'));
        }
    };

    return (
        <div className="flex flex-col gap-2">
            {materials.map((mat) => (
                <div key={mat.id} className="flex items-center gap-2 px-3 py-2 rounded-md" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                    <FileText size={14} style={{ color: 'var(--brand)' }} className="flex-shrink-0" />
                    <span className="text-xs font-medium truncate flex-1">{mat.file_name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono uppercase flex-shrink-0" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
                        {FILE_ICON_LABEL[mat.file_type] || mat.file_type}
                    </span>
                    {!locked && (
                        <button className="flex-shrink-0 p-1 hover:text-red-500 transition-colors" style={{ color: 'var(--text-muted)' }} onClick={() => handleRemove(mat.id)} title="Remove file">
                            <Trash2 size={12} />
                        </button>
                    )}
                </div>
            ))}

            {!locked && (
                <div
                    className="flex items-center justify-center gap-2 py-3 px-4 rounded-md cursor-pointer transition-all hover:bg-surface-800/60"
                    style={{
                        border: `1px dashed ${dragOver ? 'var(--brand)' : 'var(--border-strong)'}`,
                        background: dragOver ? 'var(--accent-soft, var(--bg-muted))' : 'var(--bg-surface)',
                    }}
                    onClick={() => inputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
                >
                    {uploading ? (
                        <Loader2 size={15} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
                    ) : (
                        <>
                            <Upload size={14} style={{ color: 'var(--brand)' }} />
                            <span className="text-xs font-semibold" style={{ color: 'var(--brand)' }}>
                                {materials.length > 0 ? '+ Upload another study material (PDF, DOCX, PPTX, MD)' : 'Upload Study Material (PDF, DOCX, PPTX, MD)'}
                            </span>
                        </>
                    )}
                    <input
                        ref={inputRef}
                        type="file"
                        accept=".pdf,.docx,.pptx,.md,.markdown,text/markdown,text/plain"
                        className="hidden"
                        onChange={(e) => handleFile(e.target.files?.[0])}
                    />
                </div>
            )}
        </div>
    );
}

function LessonRow({ courseId, lesson, locked, expanded, onToggle, onChanged, onDeleted }) {
    const [title, setTitle] = useState(lesson.title);
    const [content, setContent] = useState(lesson.content || '');
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const dirty = title !== lesson.title || content !== (lesson.content || '');

    const handleSave = async () => {
        setSaving(true);
        try {
            await facultyApi.updateLesson(courseId, lesson.id, { title: title.trim(), content: content.trim() || null, order_index: lesson.order_index });
            toast.success('Lesson saved');
            onChanged();
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to save lesson'));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (e) => {
        e.stopPropagation();
        if (!window.confirm(`Remove lesson "${lesson.title}"?`)) return;
        setDeleting(true);
        try {
            await facultyApi.deleteLesson(courseId, lesson.id);
            onDeleted();
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to remove lesson'));
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
                <span className="text-sm font-semibold flex-1 truncate">{lesson.title}</span>
                {lesson.file_url && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono uppercase flex-shrink-0" style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>
                        {FILE_ICON_LABEL[lesson.file_type] || lesson.file_type}
                    </span>
                )}
                {!locked && (
                    <button className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0" style={{ color: '#ef4444' }} onClick={handleDelete} disabled={deleting} title="Remove lesson">
                        {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </button>
                )}
            </div>

            {expanded && (
                <div className="p-3 flex flex-col gap-3" style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--border)' }}>
                    <div>
                        <label className="label-text">Lesson title</label>
                        <input
                            className="input-field text-sm w-full"
                            style={{ height: 34 }}
                            value={title}
                            disabled={locked}
                            onChange={(e) => setTitle(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="label-text">Written notes (optional)</label>
                        <textarea
                            className="input-field text-xs w-full"
                            style={{ height: 70, resize: 'vertical', paddingTop: 8 }}
                            value={content}
                            disabled={locked}
                            onChange={(e) => setContent(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="label-text">Material</label>
                        <LessonMaterialUpload courseId={courseId} lesson={lesson} locked={locked} onChanged={onChanged} />
                    </div>
                    {!locked && dirty && (
                        <button className="admin-action-btn admin-action-btn--secondary text-xs self-end" style={{ minHeight: 28 }} disabled={saving} onClick={handleSave}>
                            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save lesson
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

function AddLessonInline({ courseId, onAdded }) {
    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState('');
    const [saving, setSaving] = useState(false);

    const handleAdd = async () => {
        if (!title.trim()) {
            toast.error('Lesson title is required');
            return;
        }
        setSaving(true);
        try {
            await facultyApi.addLesson(courseId, { title: title.trim(), content: null, order_index: 0 });
            setTitle('');
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
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg w-full justify-center"
                style={{ color: 'var(--brand)', background: 'var(--bg-muted)', border: '1px dashed var(--border-strong)' }}
                onClick={() => setOpen(true)}
            >
                <Plus size={13} /> Add Lesson
            </button>
        );
    }

    return (
        <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
            <input
                className="input-field text-sm flex-1"
                style={{ height: 34 }}
                placeholder="New lesson title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                autoFocus
            />
            <button className="admin-action-btn admin-action-btn--primary text-xs flex-shrink-0" style={{ minHeight: 34 }} disabled={saving} onClick={handleAdd}>
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add
            </button>
            <button className="admin-action-btn admin-action-btn--secondary text-xs flex-shrink-0" style={{ minHeight: 34 }} onClick={() => setOpen(false)}>Cancel</button>
        </div>
    );
}

function LessonsSection({ courseId, lessons, locked, onChanged }) {
    const [expandedId, setExpandedId] = useState(null);

    return (
        <div className="flex flex-col gap-2">
            {lessons.length === 0 && (
                <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>No lessons yet — add one below.</p>
            )}
            {lessons.map((lesson) => (
                <LessonRow
                    key={lesson.id}
                    courseId={courseId}
                    lesson={lesson}
                    locked={locked}
                    expanded={expandedId === lesson.id}
                    onToggle={() => setExpandedId(expandedId === lesson.id ? null : lesson.id)}
                    onChanged={onChanged}
                    onDeleted={onChanged}
                />
            ))}
            {!locked && <AddLessonInline courseId={courseId} onAdded={onChanged} />}
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────
 * Assessment section — config as its own step, then questions
 * ──────────────────────────────────────────────────────────────── */

const DIFFICULTIES = ['easy', 'medium', 'hard'];

function AssessmentConfigForm({ courseId, assessment, locked, onSaved }) {
    const isNew = !assessment;
    const [title, setTitle] = useState(assessment?.title || '');
    const [instructions, setInstructions] = useState(assessment?.instructions || '');
    const [passScore, setPassScore] = useState(assessment?.pass_score ?? 70);
    const [questionCount, setQuestionCount] = useState(assessment?.question_count ?? 5);
    const [difficulty, setDifficulty] = useState(assessment?.difficulty || 'medium');
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(isNew);

    const handleSave = async () => {
        if (!title.trim()) {
            toast.error('Assessment title is required');
            return;
        }
        setSaving(true);
        const payload = {
            title: title.trim(),
            instructions: instructions.trim() || null,
            pass_score: Number(passScore) || 70,
            question_count: Math.min(25, Math.max(1, Number(questionCount) || 5)),
            difficulty,
        };
        try {
            if (isNew) {
                await facultyApi.addAssessment(courseId, payload);
                toast.success('Assessment created');
            } else {
                await facultyApi.updateAssessment(courseId, assessment.id, payload);
                toast.success('Assessment updated');
            }
            setEditing(false);
            onSaved();
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to save assessment'));
        } finally {
            setSaving(false);
        }
    };

    if (!isNew && !editing) {
        return (
            <div className="rounded-lg p-4" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                        <div className="text-sm font-semibold">{assessment.title}</div>
                        {assessment.instructions && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{assessment.instructions}</p>}
                    </div>
                    {!locked && (
                        <button className="admin-action-btn admin-action-btn--secondary text-xs flex-shrink-0" style={{ minHeight: 28 }} onClick={() => setEditing(true)}>
                            <Settings2 size={12} /> Edit
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-4 text-[11px] mt-2" style={{ color: 'var(--text-secondary)' }}>
                    <span>{assessment.question_count} question{assessment.question_count === 1 ? '' : 's'}</span>
                    <span>Pass at {assessment.pass_score}%</span>
                    <span className="capitalize">{assessment.difficulty} difficulty</span>
                    <span>{assessment.question_count} min time limit</span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3 p-4 rounded-lg" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
            <div>
                <label className="label-text">Assessment title</label>
                <input className="input-field text-sm w-full" style={{ height: 34 }} value={title} disabled={locked} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Module 1 Check" />
            </div>
            <div>
                <label className="label-text">Instructions (optional)</label>
                <textarea className="input-field text-xs w-full" style={{ height: 50, resize: 'vertical', paddingTop: 8 }} value={instructions} disabled={locked} onChange={(e) => setInstructions(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-2">
                <div>
                    <label className="label-text">Questions</label>
                    <input className="input-field text-sm w-full" style={{ height: 34 }} type="number" min="1" max="25" value={questionCount} disabled={locked} onChange={(e) => setQuestionCount(e.target.value)} />
                </div>
                <div>
                    <label className="label-text">Pass %</label>
                    <input className="input-field text-sm w-full" style={{ height: 34 }} type="number" min="0" max="100" value={passScore} disabled={locked} onChange={(e) => setPassScore(e.target.value)} />
                </div>
                <div>
                    <label className="label-text">Difficulty</label>
                    <select className="input-field text-sm w-full" style={{ height: 34 }} value={difficulty} disabled={locked} onChange={(e) => setDifficulty(e.target.value)}>
                        {DIFFICULTIES.map((d) => <option key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</option>)}
                    </select>
                </div>
            </div>
            <p className="text-[11px] flex items-start gap-1.5" style={{ color: 'var(--text-muted)' }}>
                <Info size={12} className="flex-shrink-0 mt-0.5" />
                Students get 1 minute per question as a timer, and only one attempt. Set this configuration first — question count and difficulty control what the AI generates in the Questions section.
            </p>
            <div className="flex gap-2 self-end">
                {!isNew && (
                    <button className="admin-action-btn admin-action-btn--secondary text-xs" style={{ minHeight: 30 }} onClick={() => setEditing(false)}>Cancel</button>
                )}
                {!locked && (
                    <button className="admin-action-btn admin-action-btn--primary text-xs" style={{ minHeight: 30 }} disabled={saving} onClick={handleSave}>
                        {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} {isNew ? 'Create Assessment' : 'Save Config'}
                    </button>
                )}
            </div>
        </div>
    );
}

function QuestionCard({ courseId, assessmentId, question, locked, onDeleted }) {
    const [deleting, setDeleting] = useState(false);
    const handleDelete = async () => {
        setDeleting(true);
        try {
            await facultyApi.deleteQuestion(courseId, assessmentId, question.id);
            onDeleted();
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to remove question'));
            setDeleting(false);
        }
    };

    return (
        <div className="p-3 rounded-lg" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    {question.source === 'ai' && <Sparkles size={11} style={{ color: 'var(--brand)' }} className="flex-shrink-0 mt-0.5" />}
                    <span className="text-sm font-medium">{question.text}</span>
                </div>
                {!locked && (
                    <button className="flex-shrink-0" style={{ color: 'var(--text-muted)' }} onClick={handleDelete} disabled={deleting} title="Remove question">
                        {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    </button>
                )}
            </div>
            <div className="flex flex-col gap-1 mt-2.5">
                {question.choices.map((c) => (
                    <div key={c.id} className="flex items-center gap-1.5 text-xs" style={{ color: c.is_correct ? '#10b981' : 'var(--text-muted)' }}>
                        {c.is_correct ? <CheckCircle2 size={12} className="flex-shrink-0" /> : <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ border: '1px solid var(--border-strong)' }} />}
                        {c.text}
                    </div>
                ))}
            </div>
        </div>
    );
}

function ManualQuestionForm({ courseId, assessmentId, onAdded, onCancel }) {
    const [text, setText] = useState('');
    const [choices, setChoices] = useState([{ text: '', is_correct: true }, { text: '', is_correct: false }, { text: '', is_correct: false }, { text: '', is_correct: false }]);
    const [saving, setSaving] = useState(false);

    const setChoiceText = (idx, value) => {
        setChoices((prev) => prev.map((c, i) => (i === idx ? { ...c, text: value } : c)));
    };
    const setCorrect = (idx) => {
        setChoices((prev) => prev.map((c, i) => ({ ...c, is_correct: i === idx })));
    };

    const handleAdd = async () => {
        if (!text.trim()) { toast.error('Question text is required'); return; }
        const filled = choices.filter((c) => c.text.trim());
        if (filled.length < 2) { toast.error('Add at least 2 answer choices'); return; }
        setSaving(true);
        try {
            await facultyApi.addManualQuestion(courseId, assessmentId, {
                text: text.trim(),
                choices: filled.map((c) => ({ text: c.text.trim(), is_correct: c.is_correct })),
            });
            toast.success('Question added');
            onAdded();
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to add question'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex flex-col gap-2 p-4 rounded-lg" style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border-strong)' }}>
            <label className="label-text">New question</label>
            <input className="input-field text-sm w-full" style={{ height: 34 }} placeholder="Question text" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
            <label className="label-text mt-1">Answer choices — click the circle to mark correct</label>
            {choices.map((c, idx) => (
                <div key={idx} className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setCorrect(idx)}
                        title="Mark as correct answer"
                        className="flex-shrink-0"
                        style={{ color: c.is_correct ? '#10b981' : 'var(--text-muted)' }}
                    >
                        <CheckCircle2 size={16} />
                    </button>
                    <input
                        className="input-field text-sm flex-1"
                        style={{ height: 32 }}
                        placeholder={`Choice ${idx + 1}`}
                        value={c.text}
                        onChange={(e) => setChoiceText(idx, e.target.value)}
                    />
                </div>
            ))}
            <div className="flex gap-1.5 mt-1">
                <button className="admin-action-btn admin-action-btn--primary text-xs flex-1 justify-center" style={{ minHeight: 30 }} disabled={saving} onClick={handleAdd}>
                    {saving ? <Loader2 size={12} className="animate-spin" /> : 'Add Question'}
                </button>
                <button className="admin-action-btn admin-action-btn--secondary text-xs" style={{ minHeight: 30 }} onClick={onCancel}>Cancel</button>
            </div>
        </div>
    );
}

function QuestionsSection({ courseId, assessment, locked, aiAvailable, onQuestionsChanged }) {
    const [questions, setQuestions] = useState([]);
    const [loadingQuestions, setLoadingQuestions] = useState(true);
    const [showManualForm, setShowManualForm] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [accepting, setAccepting] = useState(false);

    const loadQuestions = useCallback(async () => {
        setLoadingQuestions(true);
        try {
            const { data } = await facultyApi.listQuestions(courseId, assessment.id);
            setQuestions(data?.questions || []);
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to load questions'));
        } finally {
            setLoadingQuestions(false);
        }
    }, [courseId, assessment.id]);

    useEffect(() => { loadQuestions(); }, [loadQuestions]);

    const handleRegenerate = async () => {
        setGenerating(true);
        try {
            const { data } = await facultyApi.regenerateQuestions(courseId, assessment.id);
            toast.success(`Regenerated ${data.questions?.length || 0} questions by AI`);
            loadQuestions();
            onQuestionsChanged?.();
        } catch (err) {
            toast.error(parseApiError(err, 'AI question regeneration failed'));
        } finally {
            setGenerating(false);
        }
    };

    const handleAccept = async () => {
        setAccepting(true);
        try {
            await facultyApi.acceptQuestions(courseId, assessment.id);
            toast.success('Questions accepted and saved successfully!');
            onQuestionsChanged?.();
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to submit questions'));
        } finally {
            setAccepting(false);
        }
    };

    return (
        <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-edge/10">
            {!locked && (
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        className="admin-action-btn text-xs flex-1 justify-center"
                        style={{ background: 'var(--brand)', color: '#04121a', minHeight: 34 }}
                        disabled={generating || !aiAvailable}
                        onClick={handleRegenerate}
                        title={aiAvailable ? `Regenerate ${assessment.question_count} ${assessment.difficulty} questions from lesson material` : 'AI question generation is not configured'}
                    >
                        {generating ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                        Regenerate Questions by AI ({assessment.question_count} Qs)
                    </button>

                    <button
                        className="admin-action-btn text-xs justify-center"
                        style={{ background: '#10b981', color: '#ffffff', minHeight: 34 }}
                        disabled={accepting || questions.length === 0}
                        onClick={handleAccept}
                    >
                        {accepting ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                        Submit &amp; Accept Questions
                    </button>

                    <button className="admin-action-btn admin-action-btn--secondary text-xs" style={{ minHeight: 34 }} onClick={() => setShowManualForm((v) => !v)}>
                        <Plus size={13} /> Add Manual Question
                    </button>
                </div>
            )}
            {!aiAvailable && !locked && (
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>AI question generation isn't configured on this server yet — add questions manually.</p>
            )}

            {showManualForm && (
                <ManualQuestionForm
                    courseId={courseId}
                    assessmentId={assessment.id}
                    onAdded={() => { setShowManualForm(false); loadQuestions(); onQuestionsChanged?.(); }}
                    onCancel={() => setShowManualForm(false)}
                />
            )}

            <div className="flex flex-col gap-2">
                {loadingQuestions ? (
                    <div className="flex items-center justify-center py-6"><Loader2 size={16} className="animate-spin" style={{ color: 'var(--text-muted)' }} /></div>
                ) : questions.length === 0 ? (
                    <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>No questions yet — click "Regenerate Questions by AI" or "Add Manual Question".</p>
                ) : (
                    questions.map((q) => (
                        <QuestionCard key={q.id} courseId={courseId} assessmentId={assessment.id} question={q} locked={locked} onDeleted={() => { loadQuestions(); onQuestionsChanged?.(); }} />
                    ))
                )}
            </div>
        </div>
    );
}

function AssessmentCard({ courseId, assessment, locked, aiAvailable, expanded, onToggle, onChanged }) {
    const [deleting, setDeleting] = useState(false);

    const handleDelete = async (e) => {
        e.stopPropagation();
        if (!window.confirm(`Delete assessment "${assessment.title}"?`)) return;
        setDeleting(true);
        try {
            await facultyApi.deleteAssessment(courseId, assessment.id);
            toast.success('Assessment deleted');
            onChanged();
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to delete assessment'));
            setDeleting(false);
        }
    };

    return (
        <div className="rounded-xl overflow-hidden transition-all" style={{ border: '1px solid var(--border)', background: 'var(--bg-muted)' }}>
            <div
                className="flex items-center justify-between gap-3 p-4 cursor-pointer hover:brightness-105 transition-all"
                onClick={onToggle}
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(0,188,212,0.12)', color: 'var(--brand)' }}>
                        <ListChecks size={18} />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold truncate">{assessment.title}</h4>
                            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-surface)', color: 'var(--brand)' }}>
                                {assessment.difficulty}
                            </span>
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {assessment.question_count} questions · Pass at {assessment.pass_score}% · {assessment.question_count} min timer limit
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-semibold" style={{ color: 'var(--brand)' }}>
                        {expanded ? 'Hide Questions' : 'View Questions & AI Config'}
                    </span>
                    {expanded ? <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />}
                    {!locked && (
                        <button
                            className="w-7 h-7 rounded-md flex items-center justify-center"
                            style={{ color: '#ef4444' }}
                            onClick={handleDelete}
                            disabled={deleting}
                            title="Delete assessment"
                        >
                            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        </button>
                    )}
                </div>
            </div>

            {expanded && (
                <div className="p-4 border-t border-edge/10 bg-surface-900/40">
                    <AssessmentConfigForm courseId={courseId} assessment={assessment} locked={locked} onSaved={onChanged} />
                    <QuestionsSection
                        courseId={courseId}
                        assessment={assessment}
                        locked={locked}
                        aiAvailable={aiAvailable}
                        onQuestionsChanged={onChanged}
                    />
                </div>
            )}
        </div>
    );
}

function AssessmentsSection({ courseId, assessments, locked, aiAvailable, onChanged }) {
    const [expandedId, setExpandedId] = useState(assessments?.[0]?.id || null);
    const [showNewForm, setShowNewForm] = useState(false);

    return (
        <div className="flex flex-col gap-4">
            {assessments.length === 0 && !showNewForm && (
                <div className="text-center py-8">
                    <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>No assessments configured for this course yet.</p>
                    {!locked && (
                        <button className="admin-action-btn admin-action-btn--primary text-xs" onClick={() => setShowNewForm(true)}>
                            <Plus size={13} /> Create First Assessment
                        </button>
                    )}
                </div>
            )}

            {assessments.map((a) => (
                <AssessmentCard
                    key={a.id}
                    courseId={courseId}
                    assessment={a}
                    locked={locked}
                    aiAvailable={aiAvailable}
                    expanded={expandedId === a.id}
                    onToggle={() => setExpandedId(expandedId === a.id ? null : a.id)}
                    onChanged={onChanged}
                />
            ))}

            {!locked && (showNewForm || assessments.length > 0) && (
                <div className="mt-2">
                    {showNewForm ? (
                        <AssessmentConfigForm
                            courseId={courseId}
                            locked={locked}
                            onSaved={() => { setShowNewForm(false); onChanged(); }}
                        />
                    ) : (
                        <button
                            className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2.5 rounded-xl w-full justify-center"
                            style={{ color: 'var(--brand)', background: 'var(--bg-muted)', border: '1px dashed var(--border-strong)' }}
                            onClick={() => setShowNewForm(true)}
                        >
                            <Plus size={14} /> Add Another Assessment Card
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────
 * Course builder panel — tabbed: Lessons / Assessment (Questions embedded in cards)
 * ──────────────────────────────────────────────────────────────── */
const BUILDER_TABS = [
    { key: 'lessons', label: 'Lessons Uploading & Study Materials', icon: FileIcon },
    { key: 'assessment', label: 'Assessments & Questions', icon: Settings2 },
];

function BuilderTabs({ active, onChange, lessonCount, assessmentCount }) {
    return (
        <div className="flex items-center gap-1 p-1 rounded-xl mb-4" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
            {BUILDER_TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = active === tab.key;
                const count = tab.key === 'lessons' ? lessonCount : assessmentCount;
                return (
                    <button
                        key={tab.key}
                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2.5 rounded-lg transition-colors flex-1 justify-center"
                        style={{
                            background: isActive ? 'var(--bg-surface)' : 'transparent',
                            color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                            boxShadow: isActive ? 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.06))' : 'none',
                        }}
                        onClick={() => onChange(tab.key)}
                    >
                        <Icon size={14} /> {tab.label}
                        {count !== null && <span className="opacity-60 font-mono">({count})</span>}
                    </button>
                );
            })}
        </div>
    );
}

function CourseBuilderPanel({ courseId, onBack, aiAvailable }) {
    const [course, setCourse] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('lessons');

    const loadCourse = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await facultyApi.getCourse(courseId);
            setCourse(data);
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to load course'));
        } finally {
            setLoading(false);
        }
    }, [courseId]);

    useEffect(() => { loadCourse(); }, [loadCourse]);

    const locked = course?.status === 'approved';

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
                <button className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ color: 'var(--text-muted)', background: 'var(--bg-muted)' }} onClick={onBack}>
                    <ArrowLeft size={15} />
                </button>
                {course && (
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <h2 className="text-base font-bold truncate">{course.title}</h2>
                            <StatusBadge status={course.status} />
                        </div>
                        {course.status === 'rejected' && course.review_note && (
                            <p className="text-[11px] mt-0.5" style={{ color: '#ef4444' }}>Institution Admin note: "{course.review_note}"</p>
                        )}
                    </div>
                )}
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-muted)' }} /></div>
            ) : !course ? (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Course not found.</p>
            ) : (
                <>
                    {locked && (
                        <p className="text-[11px] px-2.5 py-2 rounded-md" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
                            This course is approved and live for students — content is locked. Contact your Institution Admin to make changes.
                        </p>
                    )}

                    <div className="admin-card p-3 sm:p-4">
                        <BuilderTabs
                            active={activeTab}
                            onChange={setActiveTab}
                            lessonCount={course.lessons.length}
                            assessmentCount={course.assessments.length}
                        />

                        {activeTab === 'lessons' && (
                            <LessonsSection courseId={course.id} lessons={course.lessons} locked={locked} onChanged={loadCourse} />
                        )}

                        {activeTab === 'assessment' && (
                            <AssessmentsSection
                                courseId={course.id}
                                assessments={course.assessments || []}
                                locked={locked}
                                aiAvailable={aiAvailable}
                                onChanged={loadCourse}
                            />
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────
 * Root page — switches between "My Courses" list and builder panel
 * ──────────────────────────────────────────────────────────────── */
export default function FacultyPortalPage() {
    const user = useAuthStore((s) => s.user);

    const [courses, setCourses] = useState([]);
    const [coursesLoading, setCoursesLoading] = useState(true);
    const [filter, setFilter] = useState('');
    const [showNewModal, setShowNewModal] = useState(false);
    const [activeCourseId, setActiveCourseId] = useState(null);
    const [aiAvailable, setAiAvailable] = useState(true);

    const loadCourses = useCallback(async () => {
        setCoursesLoading(true);
        try {
            const { data } = await facultyApi.listCourses(filter ? { status: filter } : {});
            setCourses(data?.courses || []);
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to load courses'));
        } finally {
            setCoursesLoading(false);
        }
    }, [filter]);

    useEffect(() => { loadCourses(); }, [loadCourses]);
    useEffect(() => {
        facultyApi.getAssessmentAiStatus()
            .then(({ data }) => setAiAvailable(!!data?.available))
            .catch(() => setAiAvailable(false));
    }, []);

    const handleBack = () => {
        setActiveCourseId(null);
        loadCourses();
    };

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
                {!activeCourseId && (
                    <button className="admin-action-btn admin-action-btn--primary text-sm" onClick={() => setShowNewModal(true)}>
                        <Plus size={14} /> New Course
                    </button>
                )}
            </header>

            {activeCourseId ? (
                <CourseBuilderPanel courseId={activeCourseId} onBack={handleBack} aiAvailable={aiAvailable} />
            ) : (
                <section className="admin-card p-3 sm:p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <h2 className="text-sm font-bold admin-section-title">My Courses</h2>
                        <FilterTabs value={filter} onChange={setFilter} />
                    </div>

                    {coursesLoading ? (
                        <div className="flex items-center justify-center py-8"><Loader2 size={18} className="animate-spin" style={{ color: 'var(--text-muted)' }} /></div>
                    ) : courses.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>
                                {filter ? 'No courses match this filter.' : 'No courses yet.'}
                            </p>
                            {!filter && (
                                <button className="admin-action-btn admin-action-btn--secondary text-xs" onClick={() => setShowNewModal(true)}>
                                    <Plus size={12} /> Create your first course
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {courses.map((c) => (
                                <CourseListRow key={c.id} course={c} onOpen={setActiveCourseId} onDelete={loadCourses} />
                            ))}
                        </div>
                    )}
                </section>
            )}

            {showNewModal && (
                <NewCourseModal
                    onClose={() => setShowNewModal(false)}
                    onCreated={(newCourseId) => { setFilter(''); loadCourses(); setActiveCourseId(newCourseId); }}
                />
            )}
        </div>
    );
}
