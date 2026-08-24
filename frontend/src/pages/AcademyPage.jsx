import { useCallback, useEffect, useState } from 'react';
import {
    GraduationCap, BookOpen, ClipboardCheck, ArrowLeft, Loader2, FileText,
    CheckCircle2, Circle, Sparkles, Trophy, XCircle, ChevronRight, RotateCcw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import academyApi from '../services/academyApi';
import { useAuthStore } from '../stores/useAuthStore';

function parseApiError(error, fallback = 'Request failed') {
    return error?.response?.data?.detail || error?.message || fallback;
}

const FILE_LABEL = { pdf: 'PDF', docx: 'DOCX', pptx: 'PPTX', md: 'Markdown' };

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
 * Lesson reader
 * ──────────────────────────────────────────────────────────────── */
function LessonReader({ courseId, lesson, onMarkedComplete }) {
    const [marking, setMarking] = useState(false);

    const handleComplete = async () => {
        setMarking(true);
        try {
            await academyApi.markLessonComplete(courseId, lesson.id);
            onMarkedComplete();
            toast.success('Lesson marked complete');
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to update progress'));
        } finally {
            setMarking(false);
        }
    };

    return (
        <div className="rounded-xl border border-edge/5 bg-surface-900/60 p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
                <h3 className="text-sm font-display font-semibold text-heading">{lesson.title}</h3>
                {lesson.completed ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-500 flex-shrink-0">
                        <CheckCircle2 size={13} /> Completed
                    </span>
                ) : (
                    <button
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-600 hover:text-primary-500 transition-colors flex-shrink-0"
                        onClick={handleComplete}
                        disabled={marking}
                    >
                        {marking ? <Loader2 size={13} className="animate-spin" /> : <Circle size={13} />} Mark as read
                    </button>
                )}
            </div>

            {lesson.content && (
                <p className="text-sm text-gray-400 leading-relaxed whitespace-pre-wrap mb-3">{lesson.content}</p>
            )}

            {lesson.file_url ? (
                <a
                    href={lesson.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-primary-600 transition-colors"
                    style={{ background: 'rgba(0,188,212,0.08)', border: '1px solid rgba(0,188,212,0.2)' }}
                >
                    <FileText size={13} /> Open material — {lesson.file_name} ({FILE_LABEL[lesson.file_type] || lesson.file_type})
                </a>
            ) : !lesson.content ? (
                <p className="text-xs text-gray-600 italic">No material for this lesson yet.</p>
            ) : null}
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────
 * Quiz flow — numbered question stepper, then a graded result screen
 * ──────────────────────────────────────────────────────────────── */
function QuizResult({ result, onRetake, onClose }) {
    const passed = result.passed;
    return (
        <div className="flex flex-col items-center text-center py-6">
            <div
                className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                style={{ background: passed ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)' }}
            >
                {passed ? <Trophy size={28} className="text-emerald-500" /> : <XCircle size={28} className="text-red-500" />}
            </div>
            <h3 className="text-xl font-display font-bold text-heading mb-1">
                {passed ? 'Passed!' : 'Not quite'}
            </h3>
            <p className="text-sm text-gray-500 mb-5">
                You scored <span className="font-price font-bold text-heading">{result.score_percent}%</span> ({result.correct_count}/{result.total_questions} correct) — pass mark is {result.pass_score}%.
            </p>
            <div className="w-full max-w-xs mb-6">
                <ProgressBar pct={result.score_percent} color={passed ? '#10b981' : '#ef4444'} />
            </div>
            <div className="flex items-center gap-2">
                <button className="admin-action-btn admin-action-btn--secondary text-sm" onClick={onRetake}>
                    <RotateCcw size={14} /> Retake
                </button>
                <button className="admin-action-btn admin-action-btn--primary text-sm" onClick={onClose}>
                    Done
                </button>
            </div>
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

    const loadQuestions = useCallback(async () => {
        setLoading(true);
        setResult(null);
        setCurrent(0);
        setAnswers({});
        try {
            const { data } = await academyApi.startAssessment(courseId, assessment.id);
            setQuestions(data?.questions || []);
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to load quiz'));
            onClose();
        } finally {
            setLoading(false);
        }
    }, [courseId, assessment.id, onClose]);

    useEffect(() => { loadQuestions(); }, [loadQuestions]);

    const question = questions[current];
    const answeredCount = Object.keys(answers).length;

    const selectChoice = (choiceId) => {
        setAnswers((prev) => ({ ...prev, [question.id]: choiceId }));
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        try {
            const payload = { answers: questions.map((q) => ({ question_id: q.id, choice_id: answers[q.id] || null })) };
            const { data } = await academyApi.submitAssessment(courseId, assessment.id, payload);
            setResult(data);
            onSubmitted();
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to submit quiz'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }}>
            <div className="w-full max-w-lg rounded-2xl animate-slide-up" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
                <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
                    <h2 className="text-base font-display font-bold text-heading">{assessment.title}</h2>
                    <button className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500" onClick={onClose}>✕</button>
                </div>

                <div className="p-5">
                    {loading ? (
                        <div className="flex items-center justify-center py-10"><Loader2 size={20} className="animate-spin text-gray-500" /></div>
                    ) : result ? (
                        <QuizResult result={result} onRetake={loadQuestions} onClose={onClose} />
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
                                    <button className="admin-action-btn admin-action-btn--primary text-sm" disabled={submitting} onClick={handleSubmit}>
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
 * Course detail — lessons + assessments
 * ──────────────────────────────────────────────────────────────── */
function CourseDetail({ courseId, onBack }) {
    const [course, setCourse] = useState(null);
    const [loading, setLoading] = useState(true);
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
                <>
                    {totalLessons > 0 && (
                        <div className="rounded-xl border border-edge/5 bg-surface-900/60 p-4">
                            <div className="flex items-center justify-between text-xs mb-2">
                                <span className="text-gray-500">Course progress</span>
                                <span className="font-price tabular-nums text-primary-600">{completedCount}/{totalLessons} lessons</span>
                            </div>
                            <ProgressBar pct={(completedCount / totalLessons) * 100} />
                        </div>
                    )}

                    <div>
                        <h2 className="section-title text-sm text-heading mb-3 flex items-center gap-1.5">
                            <BookOpen size={14} className="text-primary-600" /> Lessons
                        </h2>
                        {course.lessons.length === 0 ? (
                            <p className="text-sm text-gray-500">No lessons in this course yet.</p>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {course.lessons.map((lesson) => (
                                    <LessonReader key={lesson.id} courseId={course.id} lesson={lesson} onMarkedComplete={loadCourse} />
                                ))}
                            </div>
                        )}
                    </div>

                    <div>
                        <h2 className="section-title text-sm text-heading mb-3 flex items-center gap-1.5">
                            <ClipboardCheck size={14} className="text-primary-600" /> Assessments
                        </h2>
                        {course.assessments.length === 0 ? (
                            <p className="text-sm text-gray-500">No assessment for this course yet.</p>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {course.assessments.map((a) => (
                                    <div key={a.id} className="rounded-xl border border-edge/5 bg-surface-900/60 p-4 flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <h3 className="text-sm font-semibold text-heading">{a.title}</h3>
                                            <p className="text-[11px] text-gray-500 mt-0.5">
                                                {a.question_count} question{a.question_count === 1 ? '' : 's'} · pass at {a.pass_score}%
                                                {a.last_attempt && (
                                                    <span className={a.last_attempt.passed ? 'text-emerald-500' : 'text-red-500'}>
                                                        {' '}· last attempt {a.last_attempt.score_percent}% {a.last_attempt.passed ? '(passed)' : '(not passed)'}
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                        <button
                                            className="admin-action-btn admin-action-btn--primary text-xs flex-shrink-0"
                                            disabled={a.question_count === 0}
                                            onClick={() => setActiveQuiz(a)}
                                            title={a.question_count === 0 ? 'No questions yet' : undefined}
                                        >
                                            {a.last_attempt ? 'Retake' : 'Start Quiz'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}

            {activeQuiz && (
                <QuizModal
                    courseId={courseId}
                    assessment={activeQuiz}
                    onClose={() => { setActiveQuiz(null); loadCourse(); }}
                    onSubmitted={loadCourse}
                />
            )}
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────
 * Root page
 * ──────────────────────────────────────────────────────────────── */
export default function AcademyPage() {
    const user = useAuthStore((s) => s.user);
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeCourseId, setActiveCourseId] = useState(null);

    const loadCourses = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await academyApi.listCourses();
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
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Academy</span>
                    </div>
                    <h1 className="text-2xl font-display font-bold text-heading mb-1">
                        {user?.full_name ? `Keep learning, ${user.full_name.split(' ')[0]}` : 'Your Courses'}
                    </h1>
                    <p className="text-sm text-gray-500 mb-6">
                        Courses approved by your institution — complete lessons and pass the quiz to build your track record.
                    </p>

                    {loading ? (
                        <div className="flex items-center justify-center py-20"><Loader2 size={22} className="animate-spin text-gray-500" /></div>
                    ) : courses.length === 0 ? (
                        <div className="text-center py-20">
                            <BookOpen className="w-10 h-10 mx-auto mb-3 text-gray-600 opacity-30" />
                            <p className="text-sm text-gray-500">No courses available yet.</p>
                            <p className="text-xs text-gray-600 mt-1">Check back once your institution approves a course.</p>
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
