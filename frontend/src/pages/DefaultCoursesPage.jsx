import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    GraduationCap, BookOpen, ArrowLeft, Loader2, CheckCircle2, Circle,
    Sparkles, Trophy, XCircle, ChevronRight, ChevronLeft, Lock, AlertTriangle,
    Clock, Wand2, Play, Award, BarChart3, Check, Search, Filter, ShieldCheck,
    ArrowRight, BookMarked, Layers, HelpCircle, Flame, Star, Lightbulb,
    ExternalLink, Share2
} from 'lucide-react';
import toast from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import defaultCourseApi from '../services/defaultCourseApi';
import { useAuthStore } from '../stores/useAuthStore';

function parseApiError(error, fallback = 'Request failed') {
    return error?.response?.data?.detail || error?.message || fallback;
}

const MAX_VIOLATIONS = 3;

/* ────────────────────────────────────────────────────────────────
 * Topic visual metadata & track mapping
 * ──────────────────────────────────────────────────────────────── */
const TOPIC_METADATA = {
    'Stock Market Basics': {
        track: 'Foundations',
        level: 'Beginner',
        estimatedTime: '15 mins',
        tag: 'Market Structure',
        accentColor: '#00bcd4',
        iconColor: 'text-cyan-500',
        bgGradient: 'from-cyan-500/10 via-cyan-500/5 to-transparent',
        borderAccent: 'hover:border-cyan-500/50',
    },
    'Reading a Candlestick Chart': {
        track: 'Technical Analysis',
        level: 'Beginner-Intermediate',
        estimatedTime: '20 mins',
        tag: 'Price Action',
        accentColor: '#10b981',
        iconColor: 'text-emerald-500',
        bgGradient: 'from-emerald-500/10 via-emerald-500/5 to-transparent',
        borderAccent: 'hover:border-emerald-500/50',
    },
    'Risk Management Essentials': {
        track: 'Portfolio Defense',
        level: 'Intermediate',
        estimatedTime: '15 mins',
        tag: 'Capital Protection',
        accentColor: '#f59e0b',
        iconColor: 'text-amber-500',
        bgGradient: 'from-amber-500/10 via-amber-500/5 to-transparent',
        borderAccent: 'hover:border-amber-500/50',
    },
    'Understanding Options Basics': {
        track: 'Derivatives',
        level: 'Intermediate',
        estimatedTime: '25 mins',
        tag: 'Calls & Puts',
        accentColor: '#8b5cf6',
        iconColor: 'text-purple-500',
        bgGradient: 'from-purple-500/10 via-purple-500/5 to-transparent',
        borderAccent: 'hover:border-purple-500/50',
    },
    'Futures Trading Fundamentals': {
        track: 'Derivatives',
        level: 'Advanced',
        estimatedTime: '25 mins',
        tag: 'Margin & Leverage',
        accentColor: '#ec4899',
        iconColor: 'text-pink-500',
        bgGradient: 'from-pink-500/10 via-pink-500/5 to-transparent',
        borderAccent: 'hover:border-pink-500/50',
    },
    'Building a Trading Plan': {
        track: 'Strategy & Psychology',
        level: 'Comprehensive',
        estimatedTime: '20 mins',
        tag: 'Discipline & Rules',
        accentColor: '#06b6d4',
        iconColor: 'text-teal-500',
        bgGradient: 'from-teal-500/10 via-teal-500/5 to-transparent',
        borderAccent: 'hover:border-teal-500/50',
    },
};

function getTopicMeta(title) {
    return TOPIC_METADATA[title] || {
        track: 'General Trading',
        level: 'All Levels',
        estimatedTime: '15 mins',
        tag: 'Trading Concepts',
        accentColor: '#00bcd4',
        iconColor: 'text-primary-500',
        bgGradient: 'from-primary-500/10 via-primary-500/5 to-transparent',
        borderAccent: 'hover:border-primary-500/50',
    };
}

/* ────────────────────────────────────────────────────────────────
 * Progress Bar Component
 * ──────────────────────────────────────────────────────────────── */
function ProgressBar({ pct, color = '#00bcd4', height = 'h-2' }) {
    const clamped = Math.max(0, Math.min(100, pct || 0));
    return (
        <div className={`w-full ${height} rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800/80`}>
            <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                    width: `${clamped}%`,
                    background: color,
                    boxShadow: clamped > 0 ? `0 0 10px ${color}40` : 'none',
                }}
            />
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────
 * Course Card (Catalog View)
 * ──────────────────────────────────────────────────────────────── */
function CourseCard({ course, index, onOpen }) {
    const meta = getTopicMeta(course.title);
    const locked = course.state === 'locked';
    const completed = course.state === 'completed';
    const available = course.state === 'unlocked';

    const lessonCount = course.lesson_count || 0;
    const completedCount = course.lessons_completed || 0;
    const pct = lessonCount > 0 ? (completedCount / lessonCount) * 100 : 0;

    return (
        <div
            onClick={() => !locked && onOpen(course.id)}
            className={`group relative flex flex-col justify-between rounded-3xl border transition-all duration-300 overflow-hidden ${
                locked
                    ? 'border-slate-200/80 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-900/30 opacity-75 cursor-not-allowed select-none'
                    : 'border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#111827] hover:border-primary-500/40 hover:shadow-xl hover:shadow-primary-500/5 hover:-translate-y-1 cursor-pointer'
            }`}
        >
            {/* Top decorative gradient glow */}
            {!locked && (
                <div
                    className="absolute top-0 left-0 right-0 h-28 opacity-20 dark:opacity-30 pointer-events-none transition-opacity duration-300 group-hover:opacity-40"
                    style={{
                        background: `radial-gradient(ellipse at top left, ${meta.accentColor} 0%, transparent 70%)`
                    }}
                />
            )}

            <div className="relative p-6 flex flex-col flex-1">
                {/* Header Row: Module Pill, Category, Status Badge */}
                <div className="flex items-center justify-between gap-2 mb-4">
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono font-bold tracking-wider uppercase px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200/60 dark:border-slate-700/60">
                            Module {String(index + 1).padStart(2, '0')}
                        </span>
                        <span className="hidden sm:inline-block text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                            {meta.track}
                        </span>
                    </div>

                    {/* State Badge */}
                    {completed && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-sm">
                            <CheckCircle2 size={13} className="text-emerald-500" /> Completed
                        </span>
                    )}
                    {available && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 shadow-sm">
                            <Sparkles size={13} className="text-cyan-500 animate-pulse" /> Available
                        </span>
                    )}
                    {locked && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-200/60 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-300/40 dark:border-slate-700/40">
                            <Lock size={12} /> Locked
                        </span>
                    )}
                </div>

                {/* Course Title & Icon Header */}
                <div className="flex items-start gap-3.5 mb-3">
                    <div
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 transition-transform duration-300 ${
                            !locked ? 'group-hover:scale-105 shadow-sm' : ''
                        }`}
                        style={{
                            background: locked ? 'rgba(148, 163, 184, 0.12)' : `${meta.accentColor}18`,
                            border: `1px solid ${locked ? 'rgba(148, 163, 184, 0.2)' : `${meta.accentColor}30`}`
                        }}
                    >
                        {locked ? (
                            <Lock size={18} className="text-slate-400 dark:text-slate-500" />
                        ) : (
                            <BookOpen size={20} style={{ color: meta.accentColor }} />
                        )}
                    </div>

                    <div className="min-w-0 flex-1">
                        <h3 className="text-base font-display font-bold text-slate-900 dark:text-white leading-snug group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                            {course.title}
                        </h3>
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                            <span>{meta.level}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1"><Clock size={11} /> {meta.estimatedTime}</span>
                        </div>
                    </div>
                </div>

                {/* Course Description */}
                {course.description && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-5 line-clamp-2">
                        {course.description}
                    </p>
                )}

                {/* Meta Highlights Pill Bar */}
                <div className="flex flex-wrap items-center gap-1.5 mb-5 mt-auto">
                    <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border border-slate-200/50 dark:border-slate-700/50">
                        {lessonCount > 0 ? `${lessonCount} Lessons` : 'Multi-lesson'}
                    </span>
                    <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border border-slate-200/50 dark:border-slate-700/50">
                        Proctored Quiz (70%)
                    </span>
                    <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border border-slate-200/50 dark:border-slate-700/50">
                        AI Certified
                    </span>
                </div>
            </div>

            {/* Bottom Progress & Action Footer */}
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40 flex flex-col gap-3">
                {locked ? (
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1.5">
                            <Lock size={13} className="text-slate-400" /> Prerequisite Required
                        </span>
                        <span className="text-[11px] font-medium text-slate-400">
                            Complete Module {index}
                        </span>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-slate-500 dark:text-slate-400">
                                {completed ? 'Course completed' : 'Progress'}
                            </span>
                            <span className="font-mono font-bold text-slate-900 dark:text-white">
                                {completedCount}/{lessonCount} lessons ({Math.round(pct)}%)
                            </span>
                        </div>
                        <ProgressBar pct={pct} color={completed ? '#10b981' : meta.accentColor} height="h-1.5" />

                        <div className="flex items-center justify-between pt-1">
                            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                {!course.content_generated ? (
                                    <><Wand2 size={12} className="text-primary-500" /> Auto-generates on open</>
                                ) : completed ? (
                                    <><CheckCircle2 size={12} className="text-emerald-500" /> Mastered</>
                                ) : (
                                    <><Flame size={12} className="text-amber-500" /> Ready to learn</>
                                )}
                            </span>

                            <button
                                type="button"
                                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                    completed
                                        ? 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                                        : 'bg-primary-600 hover:bg-primary-500 text-white shadow-md shadow-primary-500/20 group-hover:scale-105'
                                }`}
                            >
                                {completed ? 'Review' : 'Continue'} <ChevronRight size={14} />
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────
 * Lesson Markdown Formatter
 * ──────────────────────────────────────────────────────────────── */
function LessonMarkdownContent({ content }) {
    if (!content) return null;

    return (
        <div className="lesson-markdown-prose text-slate-800 dark:text-slate-200 text-[15px] leading-relaxed">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    p: ({ node, ...props }) => (
                        <p className="mb-4 text-slate-700 dark:text-slate-300 leading-relaxed last:mb-0" {...props} />
                    ),
                    h1: ({ node, ...props }) => (
                        <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white mt-6 mb-3 first:mt-0" {...props} />
                    ),
                    h2: ({ node, ...props }) => (
                        <h3 className="text-lg font-display font-bold text-slate-900 dark:text-white mt-5 mb-2.5 first:mt-0" {...props} />
                    ),
                    h3: ({ node, ...props }) => (
                        <h4 className="text-base font-display font-semibold text-slate-900 dark:text-white mt-4 mb-2 first:mt-0" {...props} />
                    ),
                    strong: ({ node, ...props }) => (
                        <strong className="font-bold text-slate-900 dark:text-white bg-primary-500/10 px-1 py-0.5 rounded" {...props} />
                    ),
                    em: ({ node, ...props }) => (
                        <em className="italic text-slate-800 dark:text-slate-200" {...props} />
                    ),
                    ul: ({ node, ...props }) => (
                        <ul className="mb-4 ml-5 list-disc space-y-2 text-slate-700 dark:text-slate-300 last:mb-0" {...props} />
                    ),
                    ol: ({ node, ...props }) => (
                        <ol className="mb-4 ml-5 list-decimal space-y-2 text-slate-700 dark:text-slate-300 last:mb-0" {...props} />
                    ),
                    li: ({ node, ...props }) => (
                        <li className="leading-relaxed" {...props} />
                    ),
                    blockquote: ({ node, ...props }) => (
                        <blockquote className="my-4 border-l-4 border-primary-500 bg-primary-50/50 dark:bg-primary-950/20 p-4 rounded-r-2xl text-sm italic text-slate-700 dark:text-slate-300" {...props} />
                    ),
                    code: ({ node, inline, ...props }) =>
                        inline ? (
                            <code className="px-1.5 py-0.5 font-mono text-xs font-semibold rounded bg-slate-100 dark:bg-slate-800 text-primary-600 dark:text-primary-400" {...props} />
                        ) : (
                            <code className="block p-3 font-mono text-xs rounded-xl bg-slate-900 text-emerald-400 overflow-x-auto my-3" {...props} />
                        ),
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────
 * Proctored Quiz Formatters & Modal
 * ──────────────────────────────────────────────────────────────── */
function formatClock(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
}

function QuizResult({ result, onClose }) {
    const { passed, flagged, score_percent, correct_count, total_questions, pass_score } = result;

    return (
        <div className="flex flex-col items-center text-center py-6 px-4">
            <div
                className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5 shadow-lg"
                style={{
                    background: flagged ? 'rgba(239,68,68,0.15)' : passed ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                    border: `1px solid ${flagged ? 'rgba(239,68,68,0.3)' : passed ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`
                }}
            >
                {flagged ? (
                    <AlertTriangle size={36} className="text-red-500 animate-bounce" />
                ) : passed ? (
                    <Trophy size={40} className="text-emerald-500 animate-pulse" />
                ) : (
                    <XCircle size={36} className="text-red-500" />
                )}
            </div>

            <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full mb-2 ${
                passed ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
            }`}>
                {flagged ? 'Security Violation' : passed ? 'Assessment Passed' : 'Assessment Incomplete'}
            </span>

            <h3 className="text-2xl font-display font-bold text-slate-900 dark:text-white mb-2">
                {flagged ? 'Attempt Flagged & Voided' : passed ? 'Congratulations! You Passed' : 'Keep Practicing!'}
            </h3>

            <p className="text-sm text-slate-600 dark:text-slate-400 max-w-sm mb-6 leading-relaxed">
                {flagged
                    ? 'This attempt was automatically submitted for anti-proctoring violations (window blur / dev tools).'
                    : `You scored ${score_percent}% (${correct_count} of ${total_questions} correct). The passing threshold for this module is ${pass_score}%.`}
            </p>

            {!flagged && (
                <div className="w-full max-w-xs mb-8 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between text-xs mb-2 font-semibold text-slate-600 dark:text-slate-400">
                        <span>Score Result</span>
                        <span className="font-mono font-bold text-slate-900 dark:text-white">{score_percent}%</span>
                    </div>
                    <ProgressBar pct={score_percent} color={passed ? '#10b981' : '#ef4444'} height="h-2.5" />
                </div>
            )}

            <button
                type="button"
                className="w-full max-w-xs py-3 rounded-2xl font-bold text-sm text-white bg-primary-600 hover:bg-primary-500 transition-all shadow-lg shadow-primary-500/25 flex items-center justify-center gap-2"
                onClick={onClose}
            >
                Continue Learning Journey <ArrowRight size={16} />
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
                answers: questionsRef.current.map((q) => ({
                    question_id: q.id,
                    choice_id: answersRef.current[q.id] || null,
                })),
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
            registerViolation('right-click is disabled during proctored quiz');
        };
        const handleKeyDown = (e) => {
            const key = (e.key || '').toLowerCase();
            const isScreenshotCombo =
                key === 'printscreen' ||
                (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(key)) ||
                ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 's') ||
                (e.key === 'f12') ||
                ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'i');
            if (isScreenshotCombo) {
                e.preventDefault();
                registerViolation('shortcut or dev-tools is disabled during the quiz');
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
            <div className="w-full max-w-2xl rounded-3xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Modal Header */}
                <div className="flex items-center justify-between p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-primary-500/10 flex items-center justify-center text-primary-500">
                            <ShieldCheck size={20} />
                        </div>
                        <div>
                            <h2 className="text-base font-display font-bold text-slate-900 dark:text-white leading-tight">
                                {assessment.title}
                            </h2>
                            <p className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                                <span>Proctored Assessment</span>
                                <span>•</span>
                                <span>Pass mark: {assessment.pass_score}%</span>
                            </p>
                        </div>
                    </div>

                    {!result && !loading && (
                        <div className="flex items-center gap-2">
                            <span
                                className={`inline-flex items-center gap-1.5 text-xs font-mono font-bold px-3 py-1.5 rounded-xl transition-colors ${
                                    timeCritical
                                        ? 'bg-red-500/15 text-red-500 border border-red-500/30 animate-pulse'
                                        : 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20'
                                }`}
                            >
                                <Clock size={14} /> {formatClock(secondsLeft)}
                            </span>
                        </div>
                    )}
                    {result && (
                        <button
                            type="button"
                            className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800"
                            onClick={onClose}
                        >
                            ✕
                        </button>
                    )}
                </div>

                {/* Warning Alert */}
                {warning && !result && (
                    <div className="mx-6 mt-4 p-3.5 rounded-2xl text-xs font-semibold flex items-center gap-2.5 bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                        <AlertTriangle size={16} className="flex-shrink-0 text-amber-500" />
                        <span>{warning}</span>
                    </div>
                )}

                {/* Modal Body */}
                <div className="p-6 overflow-y-auto flex-1">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <Loader2 size={32} className="animate-spin text-primary-500" />
                            <p className="text-sm font-medium text-slate-500">Loading assessment questions...</p>
                        </div>
                    ) : result ? (
                        <QuizResult result={result} onClose={onClose} />
                    ) : question ? (
                        <div className="flex flex-col gap-6">
                            {/* Question Step Selector Pills */}
                            <div className="flex items-center justify-between gap-4 pb-2">
                                <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                                    {questions.map((q, idx) => {
                                        const isDone = answers[q.id] !== undefined;
                                        const isCurrent = idx === current;
                                        return (
                                            <button
                                                key={q.id}
                                                type="button"
                                                onClick={() => setCurrent(idx)}
                                                className={`w-8 h-8 rounded-xl text-xs font-bold transition-all flex items-center justify-center ${
                                                    isCurrent
                                                        ? 'bg-primary-600 text-white shadow-md shadow-primary-500/30'
                                                        : isDone
                                                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                                }`}
                                            >
                                                {idx + 1}
                                            </button>
                                        );
                                    })}
                                </div>
                                <span className="text-xs font-mono font-bold text-slate-500 flex-shrink-0">
                                    {answeredCount}/{questions.length} answered
                                </span>
                            </div>

                            <ProgressBar pct={((current + 1) / questions.length) * 100} height="h-1.5" />

                            {/* Question statement */}
                            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800/80">
                                <span className="text-xs font-bold uppercase tracking-wider text-primary-600 dark:text-primary-400 mb-2 block">
                                    Question {current + 1} of {questions.length}
                                </span>
                                <h3 className="text-base sm:text-lg font-display font-semibold text-slate-900 dark:text-white leading-relaxed">
                                    {question.text}
                                </h3>
                            </div>

                            {/* Choices */}
                            <div className="flex flex-col gap-3">
                                {question.choices.map((c) => {
                                    const selected = answers[question.id] === c.id;
                                    return (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => selectChoice(c.id)}
                                            className={`text-left p-4 rounded-2xl text-sm transition-all flex items-start gap-3.5 ${
                                                selected
                                                    ? 'bg-primary-500/10 border-2 border-primary-500 text-slate-900 dark:text-white font-semibold shadow-sm'
                                                    : 'bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50/50'
                                            }`}
                                        >
                                            <div className="pt-0.5 flex-shrink-0">
                                                {selected ? (
                                                    <CheckCircle2 size={18} className="text-primary-600 dark:text-primary-400" />
                                                ) : (
                                                    <Circle size={18} className="text-slate-300 dark:text-slate-600" />
                                                )}
                                            </div>
                                            <span className="leading-relaxed">{c.text}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Navigation Bar */}
                            <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800/80">
                                <button
                                    type="button"
                                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                                    disabled={current === 0}
                                    onClick={() => setCurrent((v) => v - 1)}
                                >
                                    <ChevronLeft size={16} /> Previous
                                </button>

                                {current < questions.length - 1 ? (
                                    <button
                                        type="button"
                                        className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-primary-600 hover:bg-primary-500 transition-all shadow-md shadow-primary-500/20 flex items-center gap-1.5"
                                        onClick={() => setCurrent((v) => v + 1)}
                                    >
                                        Next Question <ChevronRight size={16} />
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-500/25 flex items-center gap-2 disabled:opacity-50"
                                        disabled={submitting}
                                        onClick={() => submitAttempt(false, null)}
                                    >
                                        {submitting ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                                        Submit Assessment
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm text-slate-500 text-center py-10">No questions available.</p>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────
 * Course Detail & Lesson Reader (Section 2 - Split Layout)
 * ──────────────────────────────────────────────────────────────── */
function CourseDetail({ courseId, onBack }) {
    const [course, setCourse] = useState(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [activeQuiz, setActiveQuiz] = useState(false);
    const [activeLessonIndex, setActiveLessonIndex] = useState(0);
    const [marking, setMarking] = useState(false);

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

    const totalLessons = course?.lessons?.length || 0;
    const completedCount = course?.lessons?.filter((l) => l.completed).length || 0;
    const activeLesson = course?.lessons?.[activeLessonIndex] || course?.lessons?.[0];
    const isAllLessonsCompleted = totalLessons > 0 && completedCount === totalLessons;
    const meta = course ? getTopicMeta(course.title) : getTopicMeta('');

    // Mark active lesson complete handler
    const handleMarkComplete = async () => {
        if (!activeLesson || marking) return;
        setMarking(true);
        try {
            await defaultCourseApi.markLessonComplete(courseId, activeLesson.id);
            toast.success(`Completed "${activeLesson.title}"`);
            await loadCourse();
            // Automatically advance to next lesson if available
            if (activeLessonIndex < totalLessons - 1) {
                setActiveLessonIndex((prev) => prev + 1);
            }
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to update progress'));
        } finally {
            setMarking(false);
        }
    };

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
        <div className="w-full max-w-7xl mx-auto space-y-6 pb-12">
            {/* Top Navigation & Breadcrumb */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={onBack}
                        className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 text-slate-700 dark:text-slate-300 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 hover:border-primary-500 hover:text-primary-600 transition-all shadow-sm group"
                    >
                        <ArrowLeft size={18} className="group-hover:-translate-x-0.5 transition-transform" />
                    </button>
                    <div>
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                            <span className="cursor-pointer hover:underline" onClick={onBack}>Courses</span>
                            <span>/</span>
                            <span className="text-primary-600 dark:text-primary-400">{meta.track}</span>
                        </div>
                        <h1 className="text-xl sm:text-2xl font-display font-bold text-slate-900 dark:text-white">
                            {course?.title || 'Loading Course...'}
                        </h1>
                    </div>
                </div>

                {course && (
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/80">
                            <Clock size={13} className="text-primary-500" /> {meta.estimatedTime}
                        </span>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20">
                            <Sparkles size={13} /> AI-Powered
                        </span>
                    </div>
                )}
            </div>

            {loading ? (
                <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-16 flex flex-col items-center justify-center text-center gap-4">
                    <div className="w-16 h-16 rounded-3xl bg-primary-500/10 flex items-center justify-center text-primary-600 dark:text-primary-400">
                        <Loader2 size={32} className="animate-spin" />
                    </div>
                    <div>
                        <h3 className="text-base font-display font-bold text-slate-900 dark:text-white mb-1">
                            {generating ? 'Generating Course Content with AI...' : 'Loading Course...'}
                        </h3>
                        <p className="text-xs text-slate-500 max-w-md">
                            Crafting comprehensive lesson modules, interactive explanations, and proctored assessment questions for this topic.
                        </p>
                    </div>
                </div>
            ) : !course ? (
                <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-12 text-center">
                    <p className="text-sm text-slate-500">Course not found or could not be loaded.</p>
                    <button onClick={onBack} className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-xl text-xs font-bold">
                        Back to Catalog
                    </button>
                </div>
            ) : (
                <>
                    {/* Course Overview Banner */}
                    <div className="relative rounded-3xl border border-slate-200 dark:border-slate-800 bg-gradient-to-r from-white via-slate-50/50 to-white dark:from-[#111827] dark:via-slate-900/50 dark:to-[#111827] p-6 sm:p-7 shadow-sm overflow-hidden">
                        <div
                            className="absolute -right-20 -top-20 w-72 h-72 rounded-full opacity-10 dark:opacity-20 pointer-events-none blur-3xl"
                            style={{ background: meta.accentColor }}
                        />

                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                            <div className="max-w-2xl">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20">
                                        Module Overview
                                    </span>
                                    <span className="text-xs text-slate-500 font-medium">{meta.level}</span>
                                </div>
                                <h2 className="text-lg sm:text-xl font-display font-bold text-slate-900 dark:text-white mb-2">
                                    {course.title}
                                </h2>
                                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                    {course.description}
                                </p>
                            </div>

                            {/* Progress Ring / Metric Card */}
                            <div className="flex items-center gap-5 bg-white/80 dark:bg-slate-950/60 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex-shrink-0">
                                <div className="flex flex-col">
                                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Lessons Read</span>
                                    <span className="text-xl font-mono font-bold text-slate-900 dark:text-white">
                                        {completedCount} <span className="text-xs text-slate-400 font-normal">/ {totalLessons}</span>
                                    </span>
                                </div>
                                <div className="h-10 w-[1px] bg-slate-200 dark:bg-slate-800" />
                                <div className="flex flex-col">
                                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Quiz Status</span>
                                    <span className="text-xs font-bold mt-1">
                                        {course.assessment?.last_attempt ? (
                                            course.assessment.last_attempt.passed ? (
                                                <span className="text-emerald-500 flex items-center gap-1"><CheckCircle2 size={12} /> Passed ({course.assessment.last_attempt.score_percent}%)</span>
                                            ) : (
                                                <span className="text-red-500 flex items-center gap-1"><XCircle size={12} /> Not Passed ({course.assessment.last_attempt.score_percent}%)</span>
                                            )
                                        ) : isAllLessonsCompleted ? (
                                            <span className="text-cyan-500 flex items-center gap-1"><Sparkles size={12} /> Ready for Quiz</span>
                                        ) : (
                                            <span className="text-slate-400">Locked</span>
                                        )}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Progress Bar under overview */}
                        <div className="mt-5 pt-5 border-t border-slate-200/60 dark:border-slate-800/60">
                            <div className="flex items-center justify-between text-xs mb-2">
                                <span className="font-semibold text-slate-600 dark:text-slate-400">Course Progress</span>
                                <span className="font-mono font-bold text-primary-600 dark:text-primary-400">
                                    {totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0}% Completed
                                </span>
                            </div>
                            <ProgressBar
                                pct={totalLessons > 0 ? (completedCount / totalLessons) * 100 : 0}
                                color={isAllLessonsCompleted ? '#10b981' : meta.accentColor}
                                height="h-2"
                            />
                        </div>
                    </div>

                    {/* Master-Detail Responsive Two-Column Layout */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
                        {/* ──────────────── Left Main Stage: Lesson Reader & Quiz Launchpad (8 cols) ──────────── */}
                        <div className="lg:col-span-8 space-y-6">
                            {/* Focused Lesson Reader Card */}
                            {activeLesson ? (
                                <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] shadow-sm overflow-hidden">
                                    {/* Reader Header */}
                                    <div className="p-6 sm:p-7 border-b border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div>
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-md bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20">
                                                    Lesson {activeLessonIndex + 1} of {totalLessons}
                                                </span>
                                                <span className="text-xs text-slate-500 flex items-center gap-1 font-medium">
                                                    <Clock size={12} /> ~4 min read
                                                </span>
                                            </div>
                                            <h2 className="text-lg sm:text-xl font-display font-bold text-slate-900 dark:text-white">
                                                {activeLesson.title}
                                            </h2>
                                        </div>

                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            {activeLesson.completed ? (
                                                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/20">
                                                    <CheckCircle2 size={14} /> Completed
                                                </span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    disabled={marking}
                                                    onClick={handleMarkComplete}
                                                    className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-primary-600 hover:bg-primary-500 px-4 py-2 rounded-xl transition-all shadow-md shadow-primary-500/20"
                                                >
                                                    {marking ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                                    Mark as Read
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Reader Content */}
                                    <div className="p-6 sm:p-8">
                                        <LessonMarkdownContent content={activeLesson.content} />
                                    </div>

                                    {/* Reader Footer Controls: Prev / Mark Read / Next */}
                                    <div className="p-5 sm:p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 flex items-center justify-between gap-3">
                                        <button
                                            type="button"
                                            disabled={activeLessonIndex === 0}
                                            onClick={() => setActiveLessonIndex((prev) => Math.max(0, prev - 1))}
                                            className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                                        >
                                            <ChevronLeft size={16} /> Previous
                                        </button>

                                        {!activeLesson.completed && (
                                            <button
                                                type="button"
                                                disabled={marking}
                                                onClick={handleMarkComplete}
                                                className="hidden sm:inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-primary-600 dark:text-primary-400 bg-primary-500/10 hover:bg-primary-500/20 border border-primary-500/30 transition-colors"
                                            >
                                                {marking ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                                Mark Read & Continue
                                            </button>
                                        )}

                                        {activeLessonIndex < totalLessons - 1 ? (
                                            <button
                                                type="button"
                                                onClick={() => setActiveLessonIndex((prev) => Math.min(totalLessons - 1, prev + 1))}
                                                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-primary-600 hover:bg-primary-500 transition-all shadow-md shadow-primary-500/20 flex items-center gap-1.5"
                                            >
                                                Next Lesson <ChevronRight size={16} />
                                            </button>
                                        ) : course.assessment ? (
                                            <button
                                                type="button"
                                                onClick={() => setActiveQuiz(true)}
                                                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-all shadow-md shadow-emerald-500/20 flex items-center gap-1.5"
                                            >
                                                Take Quiz <Sparkles size={14} />
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                            ) : null}

                            {/* Proctored Assessment Launchpad Card */}
                            {course.assessment && (
                                <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] shadow-sm overflow-hidden">
                                    <div className="p-6 sm:p-7 bg-gradient-to-r from-primary-500/5 via-cyan-500/5 to-transparent flex flex-col md:flex-row md:items-center justify-between gap-6">
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                                                    <ShieldCheck size={12} /> Final Assessment
                                                </span>
                                                <span className="text-xs text-slate-500 font-medium">Proctored Exam</span>
                                            </div>
                                            <h3 className="text-lg font-display font-bold text-slate-900 dark:text-white">
                                                {course.assessment.title}
                                            </h3>
                                            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-lg">
                                                Complete this {course.assessment.question_count}-question multiple choice test to demonstrate mastery. Minimum passing grade is {course.assessment.pass_score}%.
                                            </p>
                                        </div>

                                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-shrink-0">
                                            {course.assessment.locked ? (
                                                <div className="text-center sm:text-right">
                                                    <span className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                                        <Lock size={14} /> Attempt Recorded ({course.assessment.last_attempt?.score_percent || 0}%)
                                                    </span>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => setActiveQuiz(true)}
                                                    className="px-6 py-3 rounded-2xl font-bold text-sm text-white bg-primary-600 hover:bg-primary-500 transition-all shadow-lg shadow-primary-500/25 flex items-center justify-center gap-2"
                                                >
                                                    <Play size={15} className="fill-current" /> Start Quiz Now
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Assessment Rules & Requirements Strip */}
                                    <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                                        <div className="p-3 rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                                            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-0.5">Questions</span>
                                            <span className="text-sm font-mono font-bold text-slate-900 dark:text-white">
                                                {course.assessment.question_count} MCQs
                                            </span>
                                        </div>
                                        <div className="p-3 rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                                            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-0.5">Time per Q</span>
                                            <span className="text-sm font-mono font-bold text-slate-900 dark:text-white">
                                                60 Seconds
                                            </span>
                                        </div>
                                        <div className="p-3 rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                                            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-0.5">Passing Score</span>
                                            <span className="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                                {course.assessment.pass_score}%
                                            </span>
                                        </div>
                                        <div className="p-3 rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                                            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-0.5">Security</span>
                                            <span className="text-sm font-bold text-cyan-600 dark:text-cyan-400">
                                                Proctored
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ──────────────── Right Sidebar: Syllabus & Course Navigation Rail (4 cols) ──────────── */}
                        <div className="lg:col-span-4 space-y-6">
                            {/* Course Syllabus / Lesson List Card */}
                            <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] shadow-sm p-5 sm:p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-sm font-display font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                        <BookMarked size={16} className="text-primary-600 dark:text-primary-400" />
                                        Curriculum Lessons
                                    </h3>
                                    <span className="text-xs font-mono font-bold text-slate-500">
                                        {completedCount}/{totalLessons} Done
                                    </span>
                                </div>

                                <div className="space-y-2.5">
                                    {course.lessons.map((lesson, idx) => {
                                        const isCurrent = idx === activeLessonIndex;
                                        return (
                                            <button
                                                key={lesson.id}
                                                type="button"
                                                onClick={() => setActiveLessonIndex(idx)}
                                                className={`w-full text-left p-3.5 rounded-2xl transition-all flex items-center justify-between gap-3 border ${
                                                    isCurrent
                                                        ? 'bg-primary-500/10 border-primary-500/50 shadow-sm'
                                                        : 'bg-slate-50/80 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:border-slate-300'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-mono font-bold ${
                                                        isCurrent
                                                            ? 'bg-primary-600 text-white'
                                                            : lesson.completed
                                                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                                            : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                                                    }`}>
                                                        {idx + 1}
                                                    </div>
                                                    <span className={`text-xs font-semibold truncate ${
                                                        isCurrent
                                                            ? 'text-primary-600 dark:text-primary-400 font-bold'
                                                            : 'text-slate-800 dark:text-slate-200'
                                                    }`}>
                                                        {lesson.title}
                                                    </span>
                                                </div>

                                                <div className="flex-shrink-0">
                                                    {lesson.completed ? (
                                                        <CheckCircle2 size={16} className="text-emerald-500" />
                                                    ) : (
                                                        <Circle size={16} className="text-slate-300 dark:text-slate-600" />
                                                    )}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Quiz Status Mini Card */}
                            {course.assessment && (
                                <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] shadow-sm p-5 sm:p-6">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 flex items-center justify-center text-cyan-500 flex-shrink-0">
                                            <Trophy size={20} />
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                                Assessment Status
                                            </h4>
                                            <p className="text-sm font-bold text-slate-900 dark:text-white">
                                                {course.assessment.last_attempt ? (
                                                    course.assessment.last_attempt.passed ? 'Completed (Passed)' : 'Completed (Not Passed)'
                                                ) : isAllLessonsCompleted ? (
                                                    'Unlocked & Ready'
                                                ) : (
                                                    'Read All Lessons to Prepare'
                                                )}
                                            </p>
                                        </div>
                                    </div>

                                    <p className="text-xs text-slate-500 leading-relaxed mb-4">
                                        {course.assessment.last_attempt
                                            ? `Score: ${course.assessment.last_attempt.score_percent}% · One attempt recorded.`
                                            : 'To achieve optimal performance, we suggest reading each lesson before starting the proctored quiz.'}
                                    </p>

                                    {!course.assessment.locked && (
                                        <button
                                            type="button"
                                            onClick={() => setActiveQuiz(true)}
                                            className="w-full py-2.5 rounded-xl font-bold text-xs text-white bg-primary-600 hover:bg-primary-500 transition-all shadow-md shadow-primary-500/20 flex items-center justify-center gap-1.5"
                                        >
                                            <Sparkles size={14} /> Launch Assessment
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* AI Learning Advisor Key Concepts */}
                            <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-gradient-to-b from-primary-500/5 to-transparent bg-white dark:bg-[#111827] shadow-sm p-5 sm:p-6">
                                <div className="flex items-center gap-2 mb-3">
                                    <Lightbulb size={16} className="text-amber-500" />
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                                        Learning Takeaways
                                    </h4>
                                </div>
                                <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                                    <li className="flex items-start gap-2">
                                        <span className="text-primary-500 font-bold">•</span>
                                        <span>Focus on understanding market mechanics before taking trades.</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-primary-500 font-bold">•</span>
                                        <span>Indian market context (NSE/BSE) is integrated into all examples.</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-primary-500 font-bold">•</span>
                                        <span>Passing this module unlocks the subsequent sequential course.</span>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────
 * Root Courses Page (Section 1: Catalog & Summary Dashboard)
 * ──────────────────────────────────────────────────────────────── */
export default function DefaultCoursesPage() {
    const user = useAuthStore((s) => s.user);
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeCourseId, setActiveCourseId] = useState(null);
    const [filterTab, setFilterTab] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');

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

    // Derived metrics
    const totalCourses = courses.length;
    const completedCourses = courses.filter((c) => c.state === 'completed').length;
    const availableCourses = courses.filter((c) => c.state === 'unlocked').length;
    const totalLessons = courses.reduce((acc, c) => acc + (c.lesson_count || 0), 0);
    const completedLessons = courses.reduce((acc, c) => acc + (c.lessons_completed || 0), 0);
    const overallProgress = totalCourses > 0 ? (completedCourses / totalCourses) * 100 : 0;

    // Find next actionable course to continue
    const nextActionCourse = courses.find((c) => c.state === 'unlocked') || courses[0];

    // Filter courses based on tab and search
    const filteredCourses = useMemo(() => {
        return courses.filter((c) => {
            if (filterTab === 'available' && c.state !== 'unlocked') return false;
            if (filterTab === 'completed' && c.state !== 'completed') return false;
            if (filterTab === 'locked' && c.state !== 'locked') return false;

            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchTitle = (c.title || '').toLowerCase().includes(q);
                const matchDesc = (c.description || '').toLowerCase().includes(q);
                const meta = getTopicMeta(c.title);
                const matchTrack = (meta.track || '').toLowerCase().includes(q);
                return matchTitle || matchDesc || matchTrack;
            }
            return true;
        });
    }, [courses, filterTab, searchQuery]);

    if (activeCourseId) {
        return (
            <div className="p-4 sm:p-6 lg:p-8 w-full max-w-7xl mx-auto">
                <CourseDetail
                    courseId={activeCourseId}
                    onBack={() => {
                        setActiveCourseId(null);
                        loadCourses();
                    }}
                />
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-6 lg:p-8 w-full max-w-7xl mx-auto space-y-8">
            {/* ─── Hero & Learning Track Banner ─── */}
            <div className="relative rounded-3xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-white via-slate-50/50 to-primary-500/5 dark:from-[#111827] dark:via-slate-900/60 dark:to-primary-950/20 p-6 sm:p-8 shadow-sm overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

                <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                    <div className="max-w-2xl space-y-3">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20 shadow-sm">
                            <GraduationCap size={15} />
                            <span>AI-POWERED TRADING ACADEMY</span>
                        </div>

                        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-display font-extrabold text-slate-900 dark:text-white tracking-tight">
                            {user?.full_name ? `Trading Mastery, ${user.full_name.split(' ')[0]}` : 'Trading Mastery Path'}
                        </h1>

                        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                            Master Indian equity and derivative trading through our sequential AI-curated curriculum.
                            Complete each module, review concepts, and pass the proctored quiz to unlock the next level.
                        </p>
                    </div>

                    {/* Progress Summary Metric Card */}
                    <div className="w-full lg:w-80 p-5 rounded-2xl bg-white/90 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-700/80 shadow-md backdrop-blur-sm flex flex-col gap-4 flex-shrink-0">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Track Progress</span>
                            <span className="text-sm font-mono font-extrabold text-primary-600 dark:text-primary-400">
                                {Math.round(overallProgress)}% Done
                            </span>
                        </div>

                        <ProgressBar pct={overallProgress} color="#00bcd4" height="h-2.5" />

                        <div className="grid grid-cols-2 gap-3 pt-1 text-center">
                            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/40">
                                <span className="text-[10px] font-semibold text-slate-500 uppercase block">Modules</span>
                                <span className="text-sm font-mono font-bold text-slate-900 dark:text-white">
                                    {completedCourses} / {totalCourses}
                                </span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/40">
                                <span className="text-[10px] font-semibold text-slate-500 uppercase block">Lessons</span>
                                <span className="text-sm font-mono font-bold text-slate-900 dark:text-white">
                                    {completedLessons} / {totalLessons}
                                </span>
                            </div>
                        </div>

                        {nextActionCourse && (
                            <button
                                type="button"
                                onClick={() => setActiveCourseId(nextActionCourse.id)}
                                className="w-full py-2.5 rounded-xl text-xs font-bold text-white bg-primary-600 hover:bg-primary-500 transition-all shadow-md shadow-primary-500/20 flex items-center justify-center gap-1.5"
                            >
                                <Play size={13} className="fill-current" /> Continue Learning
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* ─── Search & Filter Controls ─── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                {/* Tabs */}
                <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 overflow-x-auto">
                    {[
                        { id: 'all', label: `All Modules (${totalCourses})` },
                        { id: 'available', label: `Available (${availableCourses})` },
                        { id: 'completed', label: `Completed (${completedCourses})` },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setFilterTab(tab.id)}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                                filterTab === tab.id
                                    ? 'bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-sm border border-slate-200/60 dark:border-slate-700/60'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Search Bar */}
                <div className="relative w-full sm:w-72">
                    <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search courses or topics..."
                        className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-primary-500 text-slate-900 dark:text-white placeholder:text-slate-400"
                    />
                </div>
            </div>

            {/* ─── Course Cards Grid ─── */}
            {loading ? (
                <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-20 flex flex-col items-center justify-center text-center gap-3">
                    <Loader2 size={32} className="animate-spin text-primary-500" />
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">Loading learning curriculum...</p>
                </div>
            ) : filteredCourses.length === 0 ? (
                <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-16 text-center">
                    <BookOpen className="w-12 h-12 mx-auto mb-3 text-slate-400 opacity-40" />
                    <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">No courses found</h3>
                    <p className="text-xs text-slate-500">
                        {searchQuery ? `No courses matching "${searchQuery}".` : 'No courses in this filter tab.'}
                    </p>
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            className="mt-4 px-4 py-1.5 text-xs font-bold text-primary-600 bg-primary-500/10 rounded-xl"
                        >
                            Clear search
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filteredCourses.map((c, index) => (
                        <CourseCard
                            key={c.id}
                            course={c}
                            index={c.order_index ?? index}
                            onOpen={setActiveCourseId}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
