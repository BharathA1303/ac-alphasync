import { useCallback, useEffect, useRef, useState } from 'react';
import {
    GraduationCap, BookOpen, ClipboardCheck, ArrowLeft, Loader2, FileText,
    CheckCircle2, Circle, Sparkles, Trophy, XCircle, ChevronRight, ChevronDown, Lock,
    AlertTriangle, Clock, Eye, Download, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import academyApi from '../services/academyApi';
import { useAuthStore } from '../stores/useAuthStore';

function parseApiError(error, fallback = 'Request failed') {
    return error?.response?.data?.detail || error?.message || fallback;
}

const FILE_LABEL = { pdf: 'PDF', docx: 'DOCX', pptx: 'PPTX', md: 'Markdown' };
const MAX_VIOLATIONS = 3;

/* ────────────────────────────────────────────────────────────────
 * Course grid — student-facing card style, not the admin table look
 * ──────────────────────────────────────────────────────────────── */
function ProgressBar({ pct, color = 'var(--brand, #00bcd4)' }) {
    return (
        <div className="w-full h-1.5 rounded-full overflow-hidden bg-surface-800">
            <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }}
            />
        </div>
    );
}

function CourseCard({ course, onOpen }) {
    const lessonPct = course.lesson_count > 0 ? (course.lessons_completed / course.lesson_count) * 100 : 0;
    const hasScore = course.best_score_percent !== null && course.best_score_percent !== undefined;

    return (
        <button
            type="button"
            onClick={() => onOpen(course.id)}
            className="text-left rounded-xl border border-edge/5 bg-surface-900/60 p-5 section-card card-hover-glow transition-all hover:-translate-y-0.5"
        >
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(0,188,212,0.12)' }}>
                    <BookOpen size={16} className="text-primary-600" />
                </div>
                {hasScore && (
                    <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold flex-shrink-0"
                        style={{
                            background: course.best_score_percent >= 70 ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                            color: course.best_score_percent >= 70 ? '#10b981' : '#ef4444',
                        }}
                    >
                        {course.best_score_percent}%
                    </span>
                )}
            </div>

            <h3 className="text-base font-display font-semibold text-heading mb-1 line-clamp-2">{course.title}</h3>
            {course.description && (
                <p className="text-xs text-gray-500 mb-4 line-clamp-2">{course.description}</p>
            )}

            <div className="flex items-center gap-3 text-[11px] text-gray-500 mb-3">
                <span className="flex items-center gap-1"><FileText size={11} /> {course.lesson_count} lesson{course.lesson_count === 1 ? '' : 's'}</span>
                <span className="flex items-center gap-1"><ClipboardCheck size={11} /> {course.assessment_count} quiz{course.assessment_count === 1 ? '' : 'zes'}</span>
            </div>

            {course.lesson_count > 0 && (
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                        <span className="text-gray-500">Progress</span>
                        <span className="font-price tabular-nums text-primary-600">{course.lessons_completed}/{course.lesson_count}</span>
                    </div>
                    <ProgressBar pct={lessonPct} />
                </div>
            )}
        </button>
    );
}

/* ────────────────────────────────────────────────────────────────
 * Course overview — two clickable summary cards, not everything open
 * ──────────────────────────────────────────────────────────────── */
function SectionSummaryCard({ icon: Icon, title, subtitle, onOpen }) {
    return (
        <button
            type="button"
            onClick={onOpen}
            className="w-full flex items-center gap-4 rounded-xl border border-edge/5 bg-surface-900/60 p-5 section-card card-hover-glow transition-all text-left"
        >
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(0,188,212,0.12)' }}>
                <Icon size={20} className="text-primary-600" />
            </div>
            <div className="flex-1 min-w-0">
                <h3 className="text-base font-display font-semibold text-heading">{title}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
            </div>
            <ChevronRight size={18} className="text-gray-600 flex-shrink-0" />
        </button>
    );
}

function LessonReader({ courseId, lesson, isOpen, onToggle, onMarkedComplete, onPreview }) {
    const [marking, setMarking] = useState(false);
    const handleComplete = async (e) => {
        e.stopPropagation();
        setMarking(true);
        try {
            await academyApi.markLessonComplete(courseId, lesson.id);
            toast.success(`Completed "${lesson.title}"`);
            onMarkedComplete();
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to mark completed'));
        } finally {
            setMarking(false);
        }
    };

    const materials = Array.isArray(lesson.materials) && lesson.materials.length > 0
        ? lesson.materials
        : (lesson.file_url ? [{ id: `primary-${lesson.id}`, file_url: lesson.file_url, file_name: lesson.file_name || 'Lesson Notes', file_type: lesson.file_type || 'pdf' }] : []);

    return (
        <div className="rounded-xl border border-edge/10 bg-surface-900/60 overflow-hidden transition-all">
            <div
                className="flex items-center justify-between gap-3 p-4 cursor-pointer hover:bg-surface-800/40 transition-all"
                onClick={onToggle}
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-primary-500 bg-primary-500/10">
                        <BookOpen size={16} />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-heading truncate">{lesson.title}</h3>
                            {materials.length > 0 && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface-700 text-gray-400">
                                    {materials.length} Material{materials.length > 1 ? 's' : ''}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                    {lesson.completed ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-full">
                            <CheckCircle2 size={12} /> Completed
                        </span>
                    ) : (
                        <button
                            type="button"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-500 bg-primary-500/10 hover:bg-primary-500/20 px-2.5 py-1 rounded-full transition-colors"
                            onClick={handleComplete}
                            disabled={marking}
                        >
                            {marking ? <Loader2 size={12} className="animate-spin" /> : <Circle size={12} />} Mark as read
                        </button>
                    )}
                    <button type="button" className="text-gray-400 hover:text-white">
                        {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </button>
                </div>
            </div>

            {isOpen && (
                <div className="p-4 border-t border-edge/10 bg-surface-950/40 flex flex-col gap-3">
                    {lesson.content && (
                        <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">{lesson.content}</p>
                    )}

                    {materials.length > 0 ? (
                        <div className="flex flex-col gap-2 mt-1">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                                Study Materials ({materials.length}):
                            </span>
                            <div className="flex flex-col gap-2">
                                {materials.map((mat) => (
                                    <div key={mat.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-edge/10 bg-surface-800/40">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <FileText size={15} className="text-primary-500 flex-shrink-0" />
                                            <span className="text-xs font-semibold text-heading truncate">{mat.file_name}</span>
                                            <span className="text-[10px] uppercase font-bold text-gray-400 bg-surface-700 px-1.5 py-0.5 rounded flex-shrink-0">
                                                {FILE_LABEL[mat.file_type] || mat.file_type}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); onPreview(mat); }}
                                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-primary-500/10 text-primary-500 hover:bg-primary-500/20 transition-colors"
                                            >
                                                <Eye size={12} /> Preview
                                            </button>
                                            <a
                                                href={mat.file_url}
                                                download={mat.file_name}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors"
                                            >
                                                <Download size={12} /> Download
                                            </a>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : !lesson.content ? (
                        <p className="text-xs text-gray-500 italic">No material for this lesson yet.</p>
                    ) : null}
                </div>
            )}
        </div>
    );
}

function MaterialPreviewModal({ material, onClose }) {
    if (!material) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)' }}>
            <div className="w-full max-w-4xl h-[85vh] rounded-2xl flex flex-col overflow-hidden bg-surface-900 border border-edge/10 shadow-2xl animate-scale-up">
                <div className="flex items-center justify-between p-4 border-b border-edge/10 bg-surface-800/60">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <FileText size={18} className="text-primary-500 flex-shrink-0" />
                        <h3 className="text-sm font-semibold text-heading truncate">{material.file_name}</h3>
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-primary-500/10 text-primary-500">
                            {material.file_type}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <a
                            href={material.file_url}
                            download={material.file_name}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors"
                        >
                            <Download size={13} /> Download
                        </a>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white bg-surface-700/50 hover:bg-surface-700 transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
                <div className="flex-1 w-full bg-black/50 overflow-auto p-2">
                    <iframe
                        src={material.file_url}
                        title={material.file_name}
                        className="w-full h-full rounded border-0"
                    />
                </div>
            </div>
        </div>
    );
}

function LessonsView({ courseId, lessons, onBack, onMarkedComplete }) {
    const [previewMat, setPreviewMat] = useState(null);
    const [openLessonId, setOpenLessonId] = useState(lessons?.[0]?.id || null);
    const completedCount = lessons.filter((l) => l.completed).length;

    return (
        <div className="flex flex-col gap-4">
            {previewMat && <MaterialPreviewModal material={previewMat} onClose={() => setPreviewMat(null)} />}
            <div className="flex items-center gap-3">
                <button className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-gray-500 hover:text-heading transition-colors" style={{ background: 'var(--bg-muted)' }} onClick={onBack}>
                    <ArrowLeft size={16} />
                </button>
                <h2 className="text-lg font-display font-bold text-heading">Lessons</h2>
            </div>

            {lessons.length > 0 && (
                <div className="rounded-xl border border-edge/5 bg-surface-900/60 p-4">
                    <div className="flex items-center justify-between text-xs mb-2">
                        <span className="text-gray-500">Progress</span>
                        <span className="font-price tabular-nums text-primary-600">{completedCount}/{lessons.length} lessons</span>
                    </div>
                    <ProgressBar pct={(completedCount / lessons.length) * 100} />
                </div>
            )}

            {lessons.length === 0 ? (
                <p className="text-sm text-gray-500">No lessons in this course yet.</p>
            ) : (
                <div className="flex flex-col gap-3">
                    {lessons.map((lesson) => (
                        <LessonReader
                            key={lesson.id}
                            courseId={courseId}
                            lesson={lesson}
                            isOpen={openLessonId === lesson.id}
                            onToggle={() => setOpenLessonId(openLessonId === lesson.id ? null : lesson.id)}
                            onMarkedComplete={onMarkedComplete}
                            onPreview={setPreviewMat}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────
 * Assessments sub-view
 * ──────────────────────────────────────────────────────────────── */
function AssessmentRow({ assessment, onStart, onViewResult }) {
    const locked = assessment.locked;
    const attempt = assessment.last_attempt;

    return (
        <div className="rounded-xl border border-edge/5 bg-surface-900/60 p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-heading">{assessment.title}</h3>
                    {attempt?.flagged && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
                            <AlertTriangle size={10} /> Flagged
                        </span>
                    )}
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5">
                    {assessment.question_count} question{assessment.question_count === 1 ? '' : 's'} · pass at {assessment.pass_score}% · {Math.round((assessment.time_limit_seconds || 300) / 60)} min limit
                    {attempt && (
                        <span className={attempt.passed ? 'text-emerald-500 font-semibold' : 'text-red-500 font-semibold'}>
                            {' '}· Scored {attempt.score_percent}% ({attempt.passed ? 'Passed' : 'Not Passed'})
                        </span>
                    )}
                </p>
            </div>
            {locked ? (
                <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 bg-surface-800 hover:bg-surface-700 px-3 py-2 rounded-lg transition-colors flex-shrink-0"
                    onClick={() => onViewResult(assessment)}
                >
                    <CheckCircle2 size={13} className="text-emerald-500" /> View Result
                </button>
            ) : (
                <button
                    className="admin-action-btn admin-action-btn--primary text-xs flex-shrink-0"
                    disabled={assessment.question_count === 0}
                    onClick={() => onStart(assessment)}
                    title={assessment.question_count === 0 ? 'No questions yet' : undefined}
                >
                    {attempt ? 'Retake (granted)' : 'Start Quiz'}
                </button>
            )}
        </div>
    );
}

function AssessmentsView({ assessments, onBack, onStart, onViewResult }) {
    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
                <button className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-gray-500 hover:text-heading transition-colors" style={{ background: 'var(--bg-muted)' }} onClick={onBack}>
                    <ArrowLeft size={16} />
                </button>
                <h2 className="text-lg font-display font-bold text-heading">Assessments</h2>
            </div>

            {assessments.length === 0 ? (
                <p className="text-sm text-gray-500">No assessment for this course yet.</p>
            ) : (
                <div className="flex flex-col gap-3">
                    {assessments.map((a) => (
                        <AssessmentRow key={a.id} assessment={a} onStart={onStart} />
                    ))}
                </div>
            )}
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────
 * Quiz flow — timed, proctored, one attempt
 * ──────────────────────────────────────────────────────────────── */
function QuizResult({ result, onClose }) {
    const passed = result.passed;
    const flagged = result.flagged;
    return (
        <div className="flex flex-col items-center text-center py-6">
            <div
                className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                style={{ background: flagged ? 'rgba(239,68,68,0.12)' : passed ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)' }}
            >
                {flagged ? <AlertTriangle size={28} className="text-red-500" /> : passed ? <Trophy size={28} className="text-emerald-500" /> : <XCircle size={28} className="text-red-500" />}
            </div>
            <h3 className="text-xl font-display font-bold text-heading mb-1">
                {flagged ? 'Attempt flagged' : passed ? 'Passed!' : 'Not quite'}
            </h3>
            <p className="text-sm text-gray-500 mb-5">
                {flagged
                    ? 'This attempt was auto-submitted for suspicious activity and cannot count as a pass. Ask your Institution Admin for a retake.'
                    : <>You scored <span className="font-price font-bold text-heading">{result.score_percent}%</span> ({result.correct_count}/{result.total_questions} correct) — pass mark is {result.pass_score}%.</>}
            </p>
            {!flagged && (
                <div className="w-full max-w-xs mb-6">
                    <ProgressBar pct={result.score_percent} color={passed ? '#10b981' : '#ef4444'} />
                </div>
            )}
            <p className="text-xs text-gray-600 mb-4">This assessment only allows one attempt and is now locked.</p>
            <button className="admin-action-btn admin-action-btn--primary text-sm" onClick={onClose}>
                Done
            </button>
        </div>
    );
}

function formatClock(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
}

function QuizModal({ courseId, assessment, onClose, onSubmitted }) {
    const [loading, setLoading] = useState(true);
    const [attemptId, setAttemptId] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [current, setCurrent] = useState(0);
    const [answers, setAnswers] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState(null);
    const [secondsLeft, setSecondsLeft] = useState(0);
    const [violationCount, setViolationCount] = useState(0);
    const [warning, setWarning] = useState(null);

    const expiresAtRef = useRef(null);
    const answersRef = useRef(answers);
    const questionsRef = useRef(questions);
    const violationRef = useRef(0);
    const submittingRef = useRef(false);
    const attemptIdRef = useRef(null);

    answersRef.current = answers;
    questionsRef.current = questions;

    const submitAttempt = useCallback(async (flagged, flagReason) => {
        if (submittingRef.current || !attemptIdRef.current) return;
        submittingRef.current = true;
        setSubmitting(true);
        try {
            const payload = {
                attempt_id: attemptIdRef.current,
                flagged,
                flag_reason: flagReason || null,
                answers: questionsRef.current.map((q) => ({ question_id: q.id, choice_id: answersRef.current[q.id] || null })),
            };
            const { data } = await academyApi.submitAssessment(courseId, assessment.id, payload);
            setResult(data);
            onSubmitted();
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to submit quiz'));
        } finally {
            setSubmitting(false);
            submittingRef.current = false;
        }
    }, [courseId, assessment.id, onSubmitted]);

    const registerViolation = useCallback((reason) => {
        if (submittingRef.current || result) return;
        violationRef.current += 1;
        const count = violationRef.current;
        setViolationCount(count);

        if (count >= MAX_VIOLATIONS) {
            setWarning(null);
            toast.error('Suspicious activity detected 3 times — assessment flagged and submitted.');
            submitAttempt(true, reason);
        } else {
            const remaining = MAX_VIOLATIONS - count;
            setWarning(`Warning ${count} of 3: ${reason}. ${remaining} warning${remaining > 1 ? 's' : ''} remaining before auto-submission.`);
        }
    }, [result, submitAttempt]);

    const loadQuestions = useCallback(async () => {
        setLoading(true);
        setResult(null);
        setCurrent(0);
        setAnswers({});
        violationRef.current = 0;
        setViolationCount(0);
        setWarning(null);
        try {
            const { data } = await academyApi.startAssessment(courseId, assessment.id);
            setQuestions(data?.questions || []);
            setAttemptId(data.attempt_id);
            attemptIdRef.current = data.attempt_id;
            expiresAtRef.current = new Date(data.expires_at).getTime();
            setSecondsLeft(Math.max(0, Math.round((expiresAtRef.current - Date.now()) / 1000)));
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to start quiz'));
            onClose();
        } finally {
            setLoading(false);
        }
    }, [courseId, assessment.id, onClose]);

    useEffect(() => { loadQuestions(); }, [loadQuestions]);

    // Countdown timer — auto-submit when time runs out.
    useEffect(() => {
        if (!attemptId || result) return undefined;
        const interval = setInterval(() => {
            const remaining = Math.max(0, Math.round((expiresAtRef.current - Date.now()) / 1000));
            setSecondsLeft(remaining);
            if (remaining <= 0) {
                clearInterval(interval);
                submitAttempt(false, null);
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [attemptId, result, submitAttempt]);

    // Proctoring: tab switch / window blur, right-click, and common
    // screenshot/dev-tools key combos.
    useEffect(() => {
        if (!attemptId || result) return undefined;

        const handleVisibility = () => {
            if (document.hidden) registerViolation('you switched away from this tab');
        };
        const handleBlur = () => registerViolation('you switched to another window');
        const handleContextMenu = (e) => {
            e.preventDefault();
            registerViolation('right-click is disabled during the assessment');
        };
        const handleKeyDown = (e) => {
            const key = (e.key || '').toLowerCase();
            const isScreenshotCombo =
                key === 'printscreen' ||
                (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(key)) || // macOS screenshot
                ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 's') ||
                (e.key === 'F12') ||
                ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'i');
            if (isScreenshotCombo) {
                e.preventDefault();
                registerViolation('screenshot or dev-tools shortcut is disabled during the assessment');
            }
        };

        document.addEventListener('visibilitychange', handleVisibility);
        window.addEventListener('blur', handleBlur);
        document.addEventListener('contextmenu', handleContextMenu);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
            window.removeEventListener('blur', handleBlur);
            document.removeEventListener('contextmenu', handleContextMenu);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [attemptId, result, registerViolation]);

    const question = questions[current];
    const answeredCount = Object.keys(answers).length;
    const timeCritical = secondsLeft <= 30;

    const selectChoice = (choiceId) => {
        setAnswers((prev) => ({ ...prev, [question.id]: choiceId }));
    };

    const handleManualSubmit = () => submitAttempt(false, null);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }}>
            <div className="w-full max-w-lg rounded-2xl animate-slide-up" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
                <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
                    <h2 className="text-base font-display font-bold text-heading">{assessment.title}</h2>
                    {!result && !loading && (
                        <span
                            className="inline-flex items-center gap-1.5 text-sm font-bold font-price tabular-nums px-2.5 py-1 rounded-lg"
                            style={{ color: timeCritical ? '#ef4444' : 'var(--text-primary)', background: timeCritical ? 'rgba(239,68,68,0.1)' : 'var(--bg-muted)' }}
                        >
                            <Clock size={13} /> {formatClock(secondsLeft)}
                        </span>
                    )}
                    {result && (
                        <button className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500" onClick={onClose}>✕</button>
                    )}
                </div>

                {warning && !result && (
                    <div className="mx-5 mt-4 px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
                        <AlertTriangle size={13} className="flex-shrink-0" /> {warning}
                    </div>
                )}

                <div className="p-5">
                    {loading ? (
                        <div className="flex items-center justify-center py-10"><Loader2 size={20} className="animate-spin text-gray-500" /></div>
                    ) : result ? (
                        <QuizResult result={result} onClose={onClose} />
                    ) : question ? (
                        <div className="flex flex-col gap-5">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-500">Question {current + 1} of {questions.length}</span>
                                <span className="text-xs font-price text-primary-600">{answeredCount}/{questions.length} answered</span>
                            </div>
                            <ProgressBar pct={((current + 1) / questions.length) * 100} />

                            <div className="flex items-start gap-3">
                                <div className="w-6 h-6 rounded-full bg-primary-600 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                                    {current + 1}
                                </div>
                                <p className="text-sm font-medium text-heading leading-relaxed">{question.text}</p>
                            </div>

                            <div className="flex flex-col gap-2 pl-9">
                                {question.choices.map((c) => {
                                    const selected = answers[question.id] === c.id;
                                    return (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => selectChoice(c.id)}
                                            className="text-left px-3 py-2.5 rounded-lg text-sm transition-all flex items-center gap-2.5"
                                            style={{
                                                background: selected ? 'rgba(0,188,212,0.1)' : 'var(--bg-muted)',
                                                border: `1px solid ${selected ? 'var(--brand, #00bcd4)' : 'var(--border)'}`,
                                                color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
                                            }}
                                        >
                                            {selected ? <CheckCircle2 size={15} className="text-primary-600 flex-shrink-0" /> : <Circle size={15} className="text-gray-600 flex-shrink-0" />}
                                            {c.text}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="flex items-center justify-between pt-1">
                                <button
                                    className="admin-action-btn admin-action-btn--secondary text-sm"
                                    disabled={current === 0}
                                    onClick={() => setCurrent((v) => v - 1)}
                                >
                                    Back
                                </button>
                                {current < questions.length - 1 ? (
                                    <button className="admin-action-btn admin-action-btn--primary text-sm" onClick={() => setCurrent((v) => v + 1)}>
                                        Next <ChevronRight size={14} />
                                    </button>
                                ) : (
                                    <button className="admin-action-btn admin-action-btn--primary text-sm" disabled={submitting} onClick={handleManualSubmit}>
                                        {submitting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Submit Quiz
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm text-gray-500 text-center py-6">No questions available.</p>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────
 * Pathway Circular Progress Gauge Component — High Contrast
 * ──────────────────────────────────────────────────────────────── */
function CircularGauge({ pct = 0, size = 56, strokeWidth = 5, color = 'var(--brand, #00bcd4)' }) {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (Math.max(0, Math.min(100, pct)) / 100) * circumference;

    return (
        <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="transform -rotate-90">
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="var(--border, rgba(0,0,0,0.1))"
                    strokeWidth={strokeWidth}
                    fill="none"
                />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={pct >= 100 ? '#10b981' : color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    fill="none"
                    className="transition-all duration-700 ease-out"
                />
            </svg>
            <span
                className="absolute text-xs font-extrabold font-mono tabular-nums"
                style={{ color: pct >= 100 ? '#10b981' : 'var(--text-primary)' }}
            >
                {pct >= 100 ? '100%' : `${Math.round(pct)}%`}
            </span>
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────
 * Pathway Course Card (Step 1, 2, 3, 4, 5... High Contrast)
 * ──────────────────────────────────────────────────────────────── */
function PathwayCourseCard({ stepNumber, course, isActive, onSelect, onOpenDetail }) {
    const lessonPct = course.lesson_count > 0 ? (course.lessons_completed / course.lesson_count) * 100 : 0;
    const isCompleted = lessonPct >= 100;

    return (
        <div
            onClick={() => onSelect(course)}
            onDoubleClick={() => onOpenDetail(course.id)}
            className={`group relative flex flex-col justify-between p-4 rounded-xl border cursor-pointer transition-all duration-300 ${
                isActive
                    ? 'border-primary-500 bg-primary-500/10 shadow-lg ring-2 ring-primary-500/30 -translate-y-1'
                    : 'border-edge/20 bg-surface-900/80 hover:bg-surface-800 hover:border-edge/40 hover:-translate-y-0.5'
            }`}
            style={{ minHeight: 160, background: isActive ? 'var(--bg-surface)' : 'var(--bg-muted)', borderColor: isActive ? 'var(--brand)' : 'var(--border)' }}
        >
            {/* Top row: Step Number Badge & Completed Indicator */}
            <div className="w-full flex items-center justify-between mb-2">
                <span
                    className="inline-flex items-center justify-center w-6 h-6 rounded-md text-xs font-mono font-extrabold"
                    style={{
                        background: isActive ? 'var(--brand)' : 'var(--bg-surface)',
                        color: isActive ? '#04121a' : 'var(--text-primary)',
                        border: '1px solid var(--border)',
                    }}
                >
                    {stepNumber}
                </span>
                {isCompleted ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full text-emerald-600 bg-emerald-500/15" title="Completed">
                        ✓ Completed
                    </span>
                ) : (
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wide text-muted">
                        Module {stepNumber}
                    </span>
                )}
            </div>

            {/* Middle: Gauge */}
            <div className="my-1 flex justify-center">
                <CircularGauge pct={lessonPct} size={50} strokeWidth={4.5} />
            </div>

            {/* Title & info */}
            <div className="w-full text-center mt-2">
                <h4 className="text-sm font-bold truncate transition-colors" style={{ color: 'var(--text-primary)' }}>
                    {course.title}
                </h4>
                <p className="text-xs font-medium truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {course.lesson_count} lesson{course.lesson_count === 1 ? '' : 's'} · {course.assessment_count} quiz{course.assessment_count === 1 ? '' : 'zes'}
                </p>
            </div>
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────
 * Course detail — Overview with two clickable summary cards
 * ──────────────────────────────────────────────────────────────── */
function CourseDetail({ courseId, onBack }) {
    const [course, setCourse] = useState(null);
    const [loading, setLoading] = useState(true);
    const [subView, setSubView] = useState(null); // null | 'lessons' | 'assessments'
    const [activeQuiz, setActiveQuiz] = useState(null);

    const loadCourse = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await academyApi.getCourse(courseId);
            setCourse(data);
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to load course'));
        } finally {
            setLoading(false);
        }
    }, [courseId]);

    useEffect(() => { loadCourse(); }, [loadCourse]);

    const completedCount = course?.lessons.filter((l) => l.completed).length || 0;
    const totalLessons = course?.lessons.length || 0;
    const totalAssessments = course?.assessments.length || 0;

    if (activeQuiz) {
        return (
            <QuizModal
                courseId={courseId}
                assessment={activeQuiz}
                onClose={() => { setActiveQuiz(null); loadCourse(); }}
                onSubmitted={loadCourse}
            />
        );
    }

    if (subView === 'lessons' && course) {
        return <LessonsView courseId={course.id} lessons={course.lessons} onBack={() => setSubView(null)} onMarkedComplete={loadCourse} />;
    }

    if (subView === 'assessments' && course) {
        return <AssessmentsView assessments={course.assessments} onBack={() => setSubView(null)} onStart={setActiveQuiz} />;
    }

    return (
        <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
                <button className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-gray-500 hover:text-heading transition-colors" style={{ background: 'var(--bg-muted)' }} onClick={onBack}>
                    <ArrowLeft size={16} />
                </button>
                {course && (
                    <div>
                        <h1 className="text-xl font-display font-bold text-heading">{course.title}</h1>
                        {course.description && <p className="text-sm text-gray-500 mt-0.5">{course.description}</p>}
                    </div>
                )}
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-16"><Loader2 size={22} className="animate-spin text-gray-500" /></div>
            ) : !course ? (
                <p className="text-sm text-gray-500">Course not found.</p>
            ) : (
                <div className="flex flex-col gap-3">
                    <SectionSummaryCard
                        icon={BookOpen}
                        title="Lessons"
                        subtitle={totalLessons === 0 ? 'No lessons yet' : `${completedCount}/${totalLessons} completed`}
                        onOpen={() => setSubView('lessons')}
                    />
                    <SectionSummaryCard
                        icon={ClipboardCheck}
                        title="Assessments"
                        subtitle={totalAssessments === 0 ? 'No assessment yet' : `${totalAssessments} assessment${totalAssessments === 1 ? '' : 's'}`}
                        onOpen={() => setSubView('assessments')}
                    />
                </div>
            )}
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────
 * Root page — Upgraded High-Contrast Pathway Layout
 * ──────────────────────────────────────────────────────────────── */
export default function AcademyPage() {
    const user = useAuthStore((s) => s.user);
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeCourseId, setActiveCourseId] = useState(null);
    const [selectedCourse, setSelectedCourse] = useState(null);

    const loadCourses = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await academyApi.listCourses();
            const fetched = data?.courses || [];
            
            // Sort courses naturally (e.g. Tech 1 / Tech Analysis 1 -> Tech 2 -> Tech 3 -> Tech 4 -> Tech 5)
            const sorted = [...fetched].sort((a, b) =>
                a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
            );
            setCourses(sorted);
            if (sorted.length > 0 && !selectedCourse) {
                setSelectedCourse(sorted[0]);
            }
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to load courses'));
        } finally {
            setLoading(false);
        }
    }, [selectedCourse]);

    useEffect(() => { loadCourses(); }, [loadCourses]);

    const totalCourses = courses.length;
    const completedCoursesCount = courses.filter((c) => c.lesson_count > 0 && c.lessons_completed >= c.lesson_count).length;

    const currentActiveCourse = selectedCourse || courses[0];
    const activeLessonPct = currentActiveCourse?.lesson_count > 0
        ? Math.round((currentActiveCourse.lessons_completed / currentActiveCourse.lesson_count) * 100)
        : 0;

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1240px] mx-auto flex flex-col gap-6">
            {activeCourseId ? (
                <CourseDetail courseId={activeCourseId} onBack={() => { setActiveCourseId(null); loadCourses(); }} />
            ) : (
                <>
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <GraduationCap size={18} style={{ color: 'var(--brand)' }} />
                                <span className="text-xs font-extrabold uppercase tracking-widest" style={{ color: 'var(--brand)' }}>Academy Pathway</span>
                            </div>
                            <h1 className="text-2xl font-display font-extrabold" style={{ color: 'var(--text-primary)' }}>
                                {user?.full_name ? `Good day, ${user.full_name.split(' ')[0]}` : 'Your Academy Pathway'}
                            </h1>
                            <p className="text-xs sm:text-sm font-medium mt-1" style={{ color: 'var(--text-secondary)' }}>
                                Complete pathway modules in order from 1 to {totalCourses} to build your track record.
                            </p>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg self-start sm:self-auto" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                            <Sparkles size={14} style={{ color: 'var(--brand)' }} />
                            <span className="text-xs font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                                {completedCoursesCount} / {totalCourses} Completed
                            </span>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-gray-500" /></div>
                    ) : courses.length === 0 ? (
                        <div className="text-center py-20">
                            <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" style={{ color: 'var(--text-muted)' }} />
                            <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>No courses available yet.</p>
                            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Check back once your institution approves a course.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-6">
                            
                            {/* 1. Pathway Steps Map (Top Grid: 1, 2, 3, 4, 5...) */}
                            <div className="p-5 rounded-2xl flex flex-col gap-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                                <div className="flex items-center justify-between">
                                    <h2 className="text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                                        Curriculum Pathway Map
                                    </h2>
                                    <span className="text-xs font-mono font-semibold" style={{ color: 'var(--text-muted)' }}>
                                        Click any step to preview · Double click to open
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                    {courses.map((c, idx) => (
                                        <PathwayCourseCard
                                            key={c.id}
                                            stepNumber={idx + 1}
                                            course={c}
                                            isActive={currentActiveCourse?.id === c.id}
                                            onSelect={(selected) => setSelectedCourse(selected)}
                                            onOpenDetail={(id) => setActiveCourseId(id)}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* 2. Active Selected Course Banner */}
                            {currentActiveCourse && (
                                <div
                                    className="p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 transition-all shadow-sm"
                                    style={{
                                        background: 'var(--bg-surface)',
                                        border: '1px solid var(--brand)',
                                        boxShadow: '0 4px 20px rgba(0, 188, 212, 0.08)',
                                    }}
                                >
                                    <div className="flex items-start gap-4 min-w-0 flex-1">
                                        <div
                                            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                                            style={{ background: 'var(--brand)', color: '#04121a' }}
                                        >
                                            <BookOpen size={22} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <span className="text-[10px] font-mono uppercase tracking-widest font-extrabold block mb-0.5" style={{ color: 'var(--brand)' }}>
                                                CURRENT MODULE
                                            </span>
                                            <h3 className="text-lg font-extrabold truncate" style={{ color: 'var(--text-primary)' }}>
                                                {currentActiveCourse.title}
                                            </h3>
                                            <p className="text-xs font-medium mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                                                {currentActiveCourse.description || `${currentActiveCourse.lesson_count} lesson(s) · ${currentActiveCourse.assessment_count} quiz(zes)`}
                                            </p>
                                            
                                            <div className="flex items-center gap-3 mt-3">
                                                <div className="flex-1 max-w-xs">
                                                    <ProgressBar pct={activeLessonPct} />
                                                </div>
                                                <span className="text-xs font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
                                                    {activeLessonPct}%
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => setActiveCourseId(currentActiveCourse.id)}
                                        className="admin-action-btn admin-action-btn--primary text-xs font-extrabold px-6 py-3 rounded-xl flex-shrink-0 self-stretch sm:self-auto justify-center"
                                        style={{ background: 'var(--brand)', color: '#04121a', minHeight: 42 }}
                                    >
                                        Resume Course <ChevronRight size={16} />
                                    </button>
                                </div>
                            )}

                            {/* 3. Quizzes & Assessments Section */}
                            <div className="p-5 rounded-2xl flex flex-col gap-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                                <div className="flex items-center gap-2">
                                    <ClipboardCheck size={16} style={{ color: 'var(--brand)' }} />
                                    <h3 className="text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
                                        Quizzes &amp; Assessments
                                    </h3>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                    {courses.map((c, idx) => {
                                        const hasScore = c.best_score_percent !== null && c.best_score_percent !== undefined;
                                        return (
                                            <div
                                                key={c.id}
                                                onClick={() => setActiveCourseId(c.id)}
                                                className="flex items-center justify-between p-3.5 rounded-xl transition-all cursor-pointer hover:brightness-110"
                                                style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}
                                            >
                                                <div className="min-w-0 pr-2">
                                                    <span className="text-[10px] font-mono font-bold block" style={{ color: 'var(--brand)' }}>
                                                        Step {idx + 1}
                                                    </span>
                                                    <p className="text-xs font-bold truncate mt-0.5" style={{ color: 'var(--text-primary)' }}>
                                                        {c.title} Quiz
                                                    </p>
                                                </div>
                                                {hasScore ? (
                                                    <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-md text-emerald-600 bg-emerald-500/15 border border-emerald-500/30 flex-shrink-0">
                                                        Score: {c.best_score_percent}%
                                                    </span>
                                                ) : (
                                                    <span className="text-xs font-bold flex items-center gap-1 flex-shrink-0" style={{ color: 'var(--brand)' }}>
                                                        Start <ChevronRight size={13} />
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                        </div>
                    )}
                </>
            )}
        </div>
    );
}
