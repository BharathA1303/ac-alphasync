import { useCallback, useEffect, useRef, useState } from 'react';
import {
    GraduationCap, BookOpen, ArrowLeft, Loader2, CheckCircle2, Circle,
    Sparkles, Trophy, XCircle, ChevronRight, Lock, AlertTriangle, Clock, Wand2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import defaultCourseApi from '../services/defaultCourseApi';
import { useAuthStore } from '../stores/useAuthStore';

function parseApiError(error, fallback = 'Request failed') {
    return error?.response?.data?.detail || error?.message || fallback;
}

const MAX_VIOLATIONS = 3;

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
 * Course grid — sequential unlock states
 * ──────────────────────────────────────────────────────────────── */
const STATE_META = {
    completed: { label: 'Completed', color: '#10b981', icon: CheckCircle2 },
    unlocked: { label: 'Available', color: '#00bcd4', icon: Sparkles },
    locked: { label: 'Locked', color: '#94a3b8', icon: Lock },
};

function CourseCard({ course, onOpen }) {
    const meta = STATE_META[course.state] || STATE_META.locked;
    const Icon = meta.icon;
    const locked = course.state === 'locked';
    const pct = course.lesson_count > 0 ? (course.lessons_completed / course.lesson_count) * 100 : 0;

    return (
        <button
            type="button"
            disabled={locked}
            onClick={() => onOpen(course.id)}
            className={`text-left rounded-2xl border p-5 transition-all ${
                locked
                    ? 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 opacity-60 cursor-not-allowed'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] hover:border-primary-500 hover:-translate-y-0.5 shadow-sm'
            }`}
        >
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${meta.color}1a` }}>
                    {locked ? <Lock size={16} style={{ color: meta.color }} /> : <BookOpen size={16} style={{ color: meta.color }} />}
                </div>
                <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{ background: `${meta.color}1a`, color: meta.color }}
                >
                    <Icon size={10} /> {meta.label}
                </span>
            </div>

            <h3 className="text-sm font-display font-bold text-slate-900 dark:text-white mb-1">{course.title}</h3>
            {course.description && (
                <p className="text-xs text-slate-500 mb-4 line-clamp-2">{course.description}</p>
            )}

            {!locked && course.content_generated && course.lesson_count > 0 && (
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-500">Progress</span>
                        <span className="font-mono font-bold text-primary-600">{course.lessons_completed}/{course.lesson_count}</span>
                    </div>
                    <ProgressBar pct={pct} />
                </div>
            )}
            {!locked && !course.content_generated && (
                <p className="text-[11px] text-slate-500 flex items-center gap-1.5"><Wand2 size={12} /> Content generates on open</p>
            )}
        </button>
    );
}

/* ────────────────────────────────────────────────────────────────
 * Lesson reader
 * ──────────────────────────────────────────────────────────────── */
function LessonCard({ courseId, lesson, onMarkedComplete }) {
    const [marking, setMarking] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const handleComplete = async (e) => {
        e.stopPropagation();
        setMarking(true);
        try {
            await defaultCourseApi.markLessonComplete(courseId, lesson.id);
            toast.success(`Completed "${lesson.title}"`);
            onMarkedComplete();
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to update progress'));
        } finally {
            setMarking(false);
        }
    };

    return (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
            <div
                className="flex items-center justify-between gap-3 p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                onClick={() => setExpanded((v) => !v)}
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-primary-600 bg-primary-500/10">
                        <BookOpen size={16} />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">{lesson.title}</h3>
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
                    <ChevronRight size={16} className={`text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                </div>
            </div>
            {expanded && (
                <div className="p-4 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/40">
                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{lesson.content}</p>
                </div>
            )}
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────
 * Quiz — timer + proctoring, mirrors the student Academy's flow
 * ──────────────────────────────────────────────────────────────── */
function formatClock(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
}

function QuizResult({ result, onClose }) {
    const { passed, flagged } = result;
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
                    ? 'This attempt was auto-submitted for suspicious activity and cannot count as a pass.'
                    : <>You scored <span className="font-mono font-bold text-slate-900 dark:text-white">{result.score_percent}%</span> ({result.correct_count}/{result.total_questions} correct) — pass mark is {result.pass_score}%.</>}
            </p>
            {!flagged && (
                <div className="w-full max-w-xs mb-6">
                    <ProgressBar pct={result.score_percent} color={passed ? '#10b981' : '#ef4444'} />
                </div>
            )}
            <p className="text-xs text-slate-500 mb-4">This quiz allows one attempt and is now recorded.</p>
            <button className="px-6 py-2.5 rounded-xl font-bold text-sm text-white bg-primary-600 hover:bg-primary-500 transition-colors" onClick={onClose}>
                Done
            </button>
        </div>
    );
}

function QuizModal({ courseId, assessment, onClose, onSubmitted }) {
    const [loading, setLoading] = useState(true);
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
            const { data } = await defaultCourseApi.submitAssessment(courseId, assessment.id, payload);
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
            toast.error('Suspicious activity detected 3 times — quiz flagged and submitted.');
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
            const { data } = await defaultCourseApi.startAssessment(courseId, assessment.id);
            setQuestions(data?.questions || []);
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
        if (!attemptIdRef.current || result) return undefined;
        const interval = setInterval(() => {
            const remaining = Math.max(0, Math.round((expiresAtRef.current - Date.now()) / 1000));
            setSecondsLeft(remaining);
            if (remaining <= 0) {
                clearInterval(interval);
                submitAttempt(false, null);
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [loading, result, submitAttempt]);

    useEffect(() => {
        if (loading || result) return undefined;

        const handleVisibility = () => {
            if (document.hidden) registerViolation('you switched away from this tab');
        };
        const handleBlur = () => registerViolation('you switched to another window');
        const handleContextMenu = (e) => {
            e.preventDefault();
            registerViolation('right-click is disabled during the quiz');
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
                registerViolation('screenshot or dev-tools shortcut is disabled during the quiz');
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
    }, [loading, result, registerViolation]);

    const question = questions[current];
    const answeredCount = Object.keys(answers).length;
    const timeCritical = secondsLeft <= 30;

    const selectChoice = (choiceId) => {
        setAnswers((prev) => ({ ...prev, [question.id]: choiceId }));
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}>
            <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
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
                                    <button className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors flex items-center gap-1.5" disabled={submitting} onClick={() => submitAttempt(false, null)}>
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
 * Course detail
 * ──────────────────────────────────────────────────────────────── */
function CourseDetail({ courseId, onBack }) {
    const [course, setCourse] = useState(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [activeQuiz, setActiveQuiz] = useState(false);

    const loadCourse = useCallback(async () => {
        try {
            const { data } = await defaultCourseApi.getCourse(courseId);
            setCourse(data);
            return data;
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to load course'));
            return null;
        }
    }, [courseId]);

    useEffect(() => {
        setLoading(true);
        setGenerating(true);
        loadCourse().finally(() => {
            setLoading(false);
            setGenerating(false);
        });
    }, [loadCourse]);

    const completedCount = course?.lessons?.filter((l) => l.completed).length || 0;
    const totalLessons = course?.lessons?.length || 0;

    if (activeQuiz && course?.assessment) {
        return (
            <QuizModal
                courseId={courseId}
                assessment={course.assessment}
                onClose={() => { setActiveQuiz(false); loadCourse(); }}
                onSubmitted={loadCourse}
            />
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3">
                <button
                    className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 text-slate-600 dark:text-slate-300 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 hover:border-primary-500 transition-colors shadow-sm"
                    onClick={onBack}
                >
                    <ArrowLeft size={18} />
                </button>
                {course && (
                    <div>
                        <h1 className="text-xl font-display font-bold text-slate-900 dark:text-white">{course.title}</h1>
                        {course.description && <p className="text-sm text-slate-500 mt-0.5">{course.description}</p>}
                    </div>
                )}
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <Loader2 size={24} className="animate-spin text-primary-500" />
                    {generating && <p className="text-sm text-slate-500">Generating this course with AI — one-time, only happens the first time it's opened...</p>}
                </div>
            ) : !course ? (
                <p className="text-sm text-slate-500">Course not found.</p>
            ) : (
                <>
                    {totalLessons > 0 && (
                        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
                            <div className="flex items-center justify-between text-xs mb-2">
                                <span className="text-slate-500">Course progress</span>
                                <span className="font-mono font-bold text-primary-600">{completedCount}/{totalLessons} lessons</span>
                            </div>
                            <ProgressBar pct={(completedCount / totalLessons) * 100} />
                        </div>
                    )}

                    <div>
                        <h2 className="text-sm font-display font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-1.5">
                            <BookOpen size={14} className="text-primary-600" /> Lessons
                        </h2>
                        <div className="flex flex-col gap-3">
                            {course.lessons.map((lesson) => (
                                <LessonCard key={lesson.id} courseId={course.id} lesson={lesson} onMarkedComplete={loadCourse} />
                            ))}
                        </div>
                    </div>

                    {course.assessment && (
                        <div>
                            <h2 className="text-sm font-display font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-1.5">
                                <Sparkles size={14} className="text-primary-600" /> Quiz
                            </h2>
                            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{course.assessment.title}</h3>
                                    <p className="text-[11px] text-slate-500 mt-0.5">
                                        {course.assessment.question_count} question{course.assessment.question_count === 1 ? '' : 's'} · pass at {course.assessment.pass_score}%
                                        {course.assessment.last_attempt && (
                                            <span className={course.assessment.last_attempt.passed ? 'text-emerald-500' : 'text-red-500'}>
                                                {' '}· scored {course.assessment.last_attempt.score_percent}% {course.assessment.last_attempt.passed ? '(passed)' : '(not passed)'}
                                            </span>
                                        )}
                                    </p>
                                </div>
                                {course.assessment.locked ? (
                                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 flex-shrink-0"><Lock size={13} /> Completed</span>
                                ) : (
                                    <button
                                        className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-primary-600 hover:bg-primary-500 transition-colors flex-shrink-0"
                                        disabled={course.assessment.question_count === 0}
                                        onClick={() => setActiveQuiz(true)}
                                    >
                                        Start Quiz
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────
 * Root page
 * ──────────────────────────────────────────────────────────────── */
export default function DefaultCoursesPage() {
    const user = useAuthStore((s) => s.user);
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeCourseId, setActiveCourseId] = useState(null);

    const loadCourses = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await defaultCourseApi.listCourses();
            setCourses(data?.courses || []);
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to load courses'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadCourses(); }, [loadCourses]);

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
            {activeCourseId ? (
                <CourseDetail courseId={activeCourseId} onBack={() => { setActiveCourseId(null); loadCourses(); }} />
            ) : (
                <>
                    <div className="flex items-center gap-2 mb-1">
                        <GraduationCap size={16} className="text-primary-600" />
                        <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Learning</span>
                    </div>
                    <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-white mb-1">
                        {user?.full_name ? `Courses, ${user.full_name.split(' ')[0]}` : 'Courses'}
                    </h1>
                    <p className="text-sm text-slate-500 mb-6">
                        Complete each course in order to unlock the next — content and quizzes are generated by AI the first time you open a course.
                    </p>

                    {loading ? (
                        <div className="flex items-center justify-center py-20"><Loader2 size={22} className="animate-spin text-slate-500" /></div>
                    ) : courses.length === 0 ? (
                        <div className="text-center py-20">
                            <BookOpen className="w-10 h-10 mx-auto mb-3 text-slate-400 opacity-40" />
                            <p className="text-sm text-slate-500">No courses available yet.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {courses.map((c) => (
                                <CourseCard key={c.id} course={c} onOpen={setActiveCourseId} />
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
