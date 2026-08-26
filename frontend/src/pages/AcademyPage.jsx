import { useCallback, useEffect, useRef, useState } from 'react';
import {
    GraduationCap, BookOpen, ClipboardCheck, ArrowLeft, Loader2, FileText,
    CheckCircle2, Circle, Sparkles, Trophy, XCircle, ChevronRight, ChevronDown, Lock,
    AlertTriangle, Clock, Eye, Download, X, Layers, School, ExternalLink, Play
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import academyApi from '../services/academyApi';
import { useAuthStore } from '../stores/useAuthStore';

// Academy custom components
import MasteryRing from '../components/academy/MasteryRing';
import CurriculumMap from '../components/academy/CurriculumMap';
import ContinueCard from '../components/academy/ContinueCard';
import DueList from '../components/academy/DueList';
import GlossaryPanel from '../components/academy/GlossaryPanel';
import MasteryRightRail from '../components/academy/MasteryRightRail';

function parseApiError(error, fallback = 'Request failed') {
    return error?.response?.data?.detail || error?.message || fallback;
}

const FILE_LABEL = { pdf: 'PDF', docx: 'DOCX', pptx: 'PPTX', md: 'Markdown' };
const MAX_VIOLATIONS = 3;

/* ────────────────────────────────────────────────────────────────
 * Progress Bar Component
 * ──────────────────────────────────────────────────────────────── */
function ProgressBar({ pct, color = '#00bcd4' }) {
    return (
        <div className="w-full h-1.5 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
            <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }}
            />
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────
 * Lesson Reader & Material Viewer
 * ──────────────────────────────────────────────────────────────── */
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
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden transition-all">
            <div
                className="flex items-center justify-between gap-3 p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-all"
                onClick={onToggle}
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-primary-600 bg-primary-500/10">
                        <BookOpen size={16} />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">{lesson.title}</h3>
                            {materials.length > 0 && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
                                    {materials.length} Material{materials.length > 1 ? 's' : ''}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                    {lesson.completed ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-500/10 px-2.5 py-1 rounded-full">
                            <CheckCircle2 size={12} /> Completed
                        </span>
                    ) : (
                        <button
                            type="button"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-600 bg-primary-500/10 hover:bg-primary-500/20 px-2.5 py-1 rounded-full transition-colors"
                            onClick={handleComplete}
                            disabled={marking}
                        >
                            {marking ? <Loader2 size={12} className="animate-spin" /> : <Circle size={12} />} Mark as read
                        </button>
                    )}
                    <button type="button" className="text-slate-400 hover:text-slate-900 dark:hover:text-white">
                        {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </button>
                </div>
            </div>

            {isOpen && (
                <div className="p-4 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/40 flex flex-col gap-3">
                    {lesson.content && (
                        <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{lesson.content}</p>
                    )}

                    {materials.length > 0 ? (
                        <div className="flex flex-col gap-2 mt-1">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                Study Materials ({materials.length}):
                            </span>
                            <div className="flex flex-col gap-2">
                                {materials.map((mat) => (
                                    <div key={mat.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/60">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <FileText size={15} className="text-primary-600 flex-shrink-0" />
                                            <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">{mat.file_name}</span>
                                            <span className="text-[10px] uppercase font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded flex-shrink-0">
                                                {FILE_LABEL[mat.file_type] || mat.file_type}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); onPreview(mat); }}
                                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-primary-500/10 text-primary-600 hover:bg-primary-500/20 transition-colors"
                                            >
                                                <Eye size={12} /> Preview
                                            </button>
                                            <a
                                                href={mat.file_url}
                                                download={mat.file_name}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors"
                                            >
                                                <Download size={12} /> Download
                                            </a>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : !lesson.content ? (
                        <p className="text-xs text-slate-400 italic">No material for this lesson yet.</p>
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
            <div className="w-full max-w-4xl h-[85vh] rounded-3xl flex flex-col overflow-hidden bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-2xl animate-scale-up">
                <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <FileText size={18} className="text-primary-600 flex-shrink-0" />
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">{material.file_name}</h3>
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-primary-500/10 text-primary-600">
                            {material.file_type}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <a
                            href={material.file_url}
                            download={material.file_name}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors"
                        >
                            <Download size={13} /> Download
                        </a>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-200/60 dark:bg-slate-800 transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
                <div className="flex-1 w-full bg-slate-900/10 dark:bg-black/50 overflow-auto p-2">
                    <iframe
                        src={material.file_url}
                        title={material.file_name}
                        className="w-full h-full rounded-2xl border-0"
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
                <button className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-slate-500 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors" onClick={onBack}>
                    <ArrowLeft size={16} />
                </button>
                <h2 className="text-lg font-display font-bold text-slate-900 dark:text-white">Course Lessons</h2>
            </div>

            {lessons.length > 0 && (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
                    <div className="flex items-center justify-between text-xs mb-2">
                        <span className="text-slate-500">Progress</span>
                        <span className="font-mono tabular-nums text-primary-600 font-bold">{completedCount}/{lessons.length} lessons</span>
                    </div>
                    <ProgressBar pct={(completedCount / lessons.length) * 100} />
                </div>
            )}

            {lessons.length === 0 ? (
                <p className="text-sm text-slate-500">No lessons in this course yet.</p>
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
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{assessment.title}</h3>
                    {attempt?.flagged && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-500">
                            <AlertTriangle size={10} /> Flagged
                        </span>
                    )}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
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
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 px-3 py-2 rounded-xl transition-colors flex-shrink-0"
                    onClick={() => onViewResult(assessment)}
                >
                    <CheckCircle2 size={13} className="text-emerald-500" /> View Result
                </button>
            ) : (
                <button
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-primary-600 hover:bg-primary-500 disabled:opacity-40 flex-shrink-0 transition-colors"
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
                <button className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-slate-500 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors" onClick={onBack}>
                    <ArrowLeft size={16} />
                </button>
                <h2 className="text-lg font-display font-bold text-slate-900 dark:text-white">Assessments</h2>
            </div>

            {assessments.length === 0 ? (
                <p className="text-sm text-slate-500">No assessment for this course yet.</p>
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
 * Quiz Result & Modal Flow
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
            <h3 className="text-xl font-display font-bold text-slate-900 dark:text-white mb-1">
                {flagged ? 'Attempt Flagged' : passed ? 'Passed!' : 'Not quite'}
            </h3>
            <p className="text-sm text-slate-500 mb-5">
                {flagged
                    ? 'This attempt was auto-submitted for suspicious activity and cannot count as a pass. Ask your Institution Admin for a retake.'
                    : <>You scored <span className="font-mono font-bold text-slate-900 dark:text-white">{result.score_percent}%</span> ({result.correct_count}/{result.total_questions} correct) — pass mark is {result.pass_score}%.</>}
            </p>
            {!flagged && (
                <div className="w-full max-w-xs mb-6">
                    <ProgressBar pct={result.score_percent} color={passed ? '#10b981' : '#ef4444'} />
                </div>
            )}
            <p className="text-xs text-slate-500 mb-4">This assessment only allows one attempt and is now recorded.</p>
            <button className="px-6 py-2.5 rounded-xl font-bold text-sm text-white bg-primary-600 hover:bg-primary-500 transition-colors" onClick={onClose}>
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
                (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(key)) ||
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}>
            <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-2xl animate-scale-up overflow-hidden">
                <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
                    <h2 className="text-base font-display font-bold text-slate-900 dark:text-white">{assessment.title}</h2>
                    {!result && !loading && (
                        <span
                            className="inline-flex items-center gap-1.5 text-xs font-mono font-bold px-2.5 py-1 rounded-xl"
                            style={{ color: timeCritical ? '#ef4444' : '#00bcd4', background: timeCritical ? 'rgba(239,68,68,0.1)' : 'rgba(0,188,212,0.1)' }}
                        >
                            <Clock size={13} /> {formatClock(secondsLeft)}
                        </span>
                    )}
                    {result && (
                        <button className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white" onClick={onClose}>✕</button>
                    )}
                </div>

                {warning && !result && (
                    <div className="mx-5 mt-4 px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2 bg-amber-500/10 text-amber-500 border border-amber-500/30">
                        <AlertTriangle size={13} className="flex-shrink-0" /> {warning}
                    </div>
                )}

                <div className="p-5">
                    {loading ? (
                        <div className="flex items-center justify-center py-10"><Loader2 size={24} className="animate-spin text-primary-500" /></div>
                    ) : result ? (
                        <QuizResult result={result} onClose={onClose} />
                    ) : question ? (
                        <div className="flex flex-col gap-5">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-400">Question {current + 1} of {questions.length}</span>
                                <span className="text-xs font-mono font-bold text-primary-600">{answeredCount}/{questions.length} answered</span>
                            </div>
                            <ProgressBar pct={((current + 1) / questions.length) * 100} />

                            <div className="flex items-start gap-3">
                                <div className="w-6 h-6 rounded-full bg-primary-600 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                                    {current + 1}
                                </div>
                                <p className="text-sm font-medium text-slate-900 dark:text-white leading-relaxed">{question.text}</p>
                            </div>

                            <div className="flex flex-col gap-2 pl-9">
                                {question.choices.map((c) => {
                                    const selected = answers[question.id] === c.id;
                                    return (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => selectChoice(c.id)}
                                            className={`text-left px-3.5 py-2.5 rounded-xl text-xs sm:text-sm transition-all flex items-center gap-2.5 ${
                                                selected
                                                    ? 'bg-primary-500/10 border-2 border-primary-500 text-slate-900 dark:text-white font-semibold'
                                                    : 'bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                                            }`}
                                        >
                                            {selected ? <CheckCircle2 size={15} className="text-primary-600 flex-shrink-0" /> : <Circle size={15} className="text-slate-400 flex-shrink-0" />}
                                            {c.text}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="flex items-center justify-between pt-2">
                                <button
                                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 transition-colors"
                                    disabled={current === 0}
                                    onClick={() => setCurrent((v) => v - 1)}
                                >
                                    Back
                                </button>
                                {current < questions.length - 1 ? (
                                    <button className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-primary-600 hover:bg-primary-500 transition-colors flex items-center gap-1" onClick={() => setCurrent((v) => v + 1)}>
                                        Next <ChevronRight size={14} />
                                    </button>
                                ) : (
                                    <button className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors flex items-center gap-1.5" disabled={submitting} onClick={handleManualSubmit}>
                                        {submitting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Submit Quiz
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm text-slate-500 text-center py-6">No questions available.</p>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────
 * Course Detail View (When opening a faculty course or module)
 * ──────────────────────────────────────────────────────────────── */
function CourseDetail({ courseId, onBack }) {
    const [course, setCourse] = useState(null);
    const [loading, setLoading] = useState(true);
    const [subView, setSubView] = useState(null);
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

    const completedCount = course?.lessons?.filter((l) => l.completed).length || 0;
    const totalLessons = course?.lessons?.length || 0;
    const totalAssessments = course?.assessments?.length || 0;

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
        <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3">
                <button
                    className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 text-slate-600 dark:text-slate-300 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 hover:border-primary-500 transition-colors shadow-sm"
                    onClick={onBack}
                    title="Back to Pathway"
                >
                    <ArrowLeft size={18} />
                </button>
                {course && (
                    <div>
                        <h1 className="text-xl sm:text-2xl font-display font-extrabold text-slate-900 dark:text-white">{course.title}</h1>
                        {course.description && <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">{course.description}</p>}
                    </div>
                )}
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-primary-500" /></div>
            ) : !course ? (
                <p className="text-sm text-slate-500">Course not found.</p>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                        type="button"
                        onClick={() => setSubView('lessons')}
                        className="w-full flex items-center gap-4 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 text-left hover:border-primary-500/50 hover:shadow-lg transition-all"
                    >
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 bg-primary-500/10 text-primary-600">
                            <BookOpen size={22} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-base font-bold text-slate-900 dark:text-white">Lessons</h3>
                            <p className="text-xs text-slate-500 mt-0.5">
                                {totalLessons === 0 ? 'No lessons yet' : `${completedCount}/${totalLessons} completed`}
                            </p>
                        </div>
                        <ChevronRight size={18} className="text-slate-400 flex-shrink-0" />
                    </button>

                    <button
                        type="button"
                        onClick={() => setSubView('assessments')}
                        className="w-full flex items-center gap-4 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 text-left hover:border-primary-500/50 hover:shadow-lg transition-all"
                    >
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 bg-emerald-500/10 text-emerald-600">
                            <ClipboardCheck size={22} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-base font-bold text-slate-900 dark:text-white">Assessments</h3>
                            <p className="text-xs text-slate-500 mt-0.5">
                                {totalAssessments === 0 ? 'No assessment yet' : `${totalAssessments} assessment${totalAssessments === 1 ? '' : 's'}`}
                            </p>
                        </div>
                        <ChevronRight size={18} className="text-slate-400 flex-shrink-0" />
                    </button>
                </div>
            )}
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────
 * Root Student Learning Home — Document 06 Screen 2 Implementation
 * ──────────────────────────────────────────────────────────────── */
export default function AcademyPage() {
    const navigate = useNavigate();
    const user = useAuthStore((s) => s.user);

    // Mode: false = Core Pathway (16 Modules), true = Faculty Courses
    const [isFacultyMode, setIsFacultyMode] = useState(false);

    // Data states
    const [loading, setLoading] = useState(true);
    const [overviewData, setOverviewData] = useState(null);
    const [defaultModules, setDefaultModules] = useState([]);
    const [facultyCourses, setFacultyCourses] = useState([]);
    const [selectedItem, setSelectedItem] = useState(null);
    const [activeCourseId, setActiveCourseId] = useState(null);

    // Initial data loader
    const loadAllAcademyData = useCallback(async () => {
        setLoading(true);
        try {
            const [overviewRes, defaultRes, facultyRes] = await Promise.allSettled([
                academyApi.getOverview(),
                academyApi.getDefaultCurriculum(),
                academyApi.listCourses(),
            ]);

            if (overviewRes.status === 'fulfilled') {
                setOverviewData(overviewRes.value.data);
            }

            let loadedDefaultMods = [];
            if (defaultRes.status === 'fulfilled') {
                loadedDefaultMods = defaultRes.value.data?.modules || [];
                setDefaultModules(loadedDefaultMods);
            }

            let loadedFacultyCourses = [];
            if (facultyRes.status === 'fulfilled') {
                loadedFacultyCourses = facultyRes.value.data?.courses || [];
                setFacultyCourses(loadedFacultyCourses);
            }

            // Set initial selected item
            if (!isFacultyMode && loadedDefaultMods.length > 0) {
                const activeMod = loadedDefaultMods.find((m) => m.state === 'active') || loadedDefaultMods[0];
                setSelectedItem(activeMod);
            } else if (isFacultyMode && loadedFacultyCourses.length > 0) {
                setSelectedItem(loadedFacultyCourses[0]);
            }
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to load academy data'));
        } finally {
            setLoading(false);
        }
    }, [isFacultyMode]);

    useEffect(() => {
        loadAllAcademyData();
    }, [loadAllAcademyData]);

    // Handle toggle switch between Core and Faculty
    const handleToggleMode = (facultyMode) => {
        setIsFacultyMode(facultyMode);
        if (facultyMode) {
            if (facultyCourses.length > 0) setSelectedItem(facultyCourses[0]);
        } else {
            if (defaultModules.length > 0) {
                const activeMod = defaultModules.find((m) => m.state === 'active') || defaultModules[0];
                setSelectedItem(activeMod);
            }
        }
    };

    // Open item for detail view
    const handleOpenItem = (item) => {
        if (isFacultyMode && item?.id) {
            setActiveCourseId(item.id);
        } else {
            // Core module selection
            setSelectedItem(item);
            toast.success(`Active topic: ${item.title}`);
        }
    };

    const studentFirstName = user?.full_name?.split(' ')[0] || overviewData?.student_name?.split(' ')[0] || 'Learner';

    return (
        <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
            {activeCourseId ? (
                <CourseDetail
                    courseId={activeCourseId}
                    onBack={() => {
                        setActiveCourseId(null);
                        loadAllAcademyData();
                    }}
                />
            ) : (
                <>
                    {/* Top Header Region — Document 06 Screen 2 */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-[11px] font-mono font-extrabold uppercase tracking-widest text-primary-600 dark:text-primary-400">
                                    LEARN · FIN-511 INDIAN CAPITAL MARKETS
                                </span>
                            </div>
                            <h1 className="text-2xl sm:text-3xl font-display font-extrabold text-slate-900 dark:text-white">
                                Good day, {studentFirstName}
                            </h1>
                            <p className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">
                                {isFacultyMode
                                    ? `Institution Faculty Syllabus · ${facultyCourses.length} assigned courses`
                                    : 'Module 5 of 16 · 2 hrs due this week · NISM Capital Markets Track'}
                            </p>
                        </div>

                        {/* Quick CTA to Open Terminal */}
                        <div className="flex items-center gap-3 self-start md:self-auto">
                            <button
                                type="button"
                                onClick={() => navigate('/terminal')}
                                className="px-5 py-2.5 rounded-2xl font-extrabold text-xs sm:text-sm text-white bg-slate-900 dark:bg-white dark:text-slate-900 hover:bg-slate-800 hover:shadow-md transition-all flex items-center gap-2"
                            >
                                <span>Open Terminal</span>
                                <ExternalLink size={14} />
                            </button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-32">
                            <Loader2 size={32} className="animate-spin text-primary-500" />
                        </div>
                    ) : (
                        /* Main 2-Column Responsive Layout (Document 06 §6.4: xl 3-col/right rail, lg stacks rail below, md 3-col grid, sm 2-col) */
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                            {/* Left / Center Main Area (8 cols on lg/xl) */}
                            <div className="lg:col-span-8 space-y-6">
                                {/* 1. Curriculum Pathway Map */}
                                <CurriculumMap
                                    isFacultyMode={isFacultyMode}
                                    onToggleMode={handleToggleMode}
                                    modules={defaultModules}
                                    facultyCourses={facultyCourses}
                                    selectedItem={selectedItem}
                                    onSelectItem={(item) => setSelectedItem(item)}
                                    onOpenItem={handleOpenItem}
                                />

                                {/* 2. Continue Learning Hero Card with Evidence Beat */}
                                <ContinueCard
                                    item={selectedItem || (isFacultyMode ? facultyCourses[0] : defaultModules[0])}
                                    isFacultyMode={isFacultyMode}
                                    onStartOrResume={handleOpenItem}
                                />

                                {/* 3. Lower Grid: Due this week + Glossary */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <DueList dueItems={overviewData?.due_items || []} />
                                    <GlossaryPanel glossaryTerms={overviewData?.recent_glossary || []} />
                                </div>
                            </div>

                            {/* Right Rail Analytics (4 cols on lg/xl) */}
                            <div className="lg:col-span-4 space-y-6">
                                <MasteryRightRail
                                    overallMastery={overviewData?.overall_mastery_pct || 30}
                                    pointsDelta={overviewData?.points_delta_this_week || '+8 pts this week'}
                                    completedCount={overviewData?.completed_modules_count || 4}
                                    totalCount={overviewData?.total_modules_count || 16}
                                    weakConcepts={overviewData?.weak_concepts || []}
                                    behaviourSummary={overviewData?.behaviour_summary}
                                />
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
