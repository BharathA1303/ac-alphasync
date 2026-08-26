import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ListCheck, CheckCircle2, XCircle, Clock, AlertCircle, RefreshCw,
    TrendingUp, Shield, BarChart3, ChevronRight, MessageSquare,
    ExternalLink, ArrowRight, Award, Loader2, Send, X, Target
} from 'lucide-react';
import toast from 'react-hot-toast';
import assignmentApi from '../services/assignmentApi';

function parseApiError(error, fallback = 'Request failed') {
    return error?.response?.data?.detail || error?.message || fallback;
}

const ASSET_BADGES = {
    EQUITY: { label: 'Equity', color: '#00bcd4', bg: 'rgba(0, 188, 212, 0.12)', border: 'rgba(0, 188, 212, 0.3)' },
    FUTURES: { label: 'Futures', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)', border: 'rgba(139, 92, 246, 0.3)' },
    OPTIONS: { label: 'Options', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)' },
    ANY: { label: 'Multi-Asset', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.3)' },
};

export default function StudentAssignmentsPage() {
    const navigate = useNavigate();
    const [assignments, setAssignments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedAssignmentId, setSelectedAssignmentId] = useState(null);
    const [detail, setDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [evaluating, setEvaluating] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [studentNotes, setStudentNotes] = useState('');
    const [submitModalOpen, setSubmitModalOpen] = useState(false);

    const loadAssignments = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await assignmentApi.listStudentAssignments();
            setAssignments(data.assignments || []);
            if (data.assignments?.length > 0 && !selectedAssignmentId) {
                setSelectedAssignmentId(data.assignments[0].id);
            }
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to load trading tasks'));
        } finally {
            setLoading(false);
        }
    }, [selectedAssignmentId]);

    const loadDetail = useCallback(async (id) => {
        if (!id) return;
        setDetailLoading(true);
        try {
            const { data } = await assignmentApi.getStudentAssignment(id);
            setDetail(data);
            setStudentNotes(data.submission?.student_notes || '');
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to load assignment detail'));
        } finally {
            setDetailLoading(false);
        }
    }, []);

    useEffect(() => {
        loadAssignments();
    }, [loadAssignments]);

    useEffect(() => {
        if (selectedAssignmentId) {
            loadDetail(selectedAssignmentId);
        }
    }, [selectedAssignmentId, loadDetail]);

    const handleRunEvaluation = async () => {
        if (!selectedAssignmentId) return;
        setEvaluating(true);
        try {
            await assignmentApi.evaluateStudentAssignment(selectedAssignmentId);
            toast.success('Orders re-evaluated against task rules!');
            loadDetail(selectedAssignmentId);
            loadAssignments();
        } catch (err) {
            toast.error(parseApiError(err, 'Evaluation failed'));
        } finally {
            setEvaluating(false);
        }
    };

    const handleSubmit = async () => {
        if (!selectedAssignmentId) return;
        setSubmitting(true);
        try {
            await assignmentApi.submitStudentAssignment(selectedAssignmentId, {
                student_notes: studentNotes.trim() || null,
            });
            toast.success('Assignment submitted to faculty!');
            setSubmitModalOpen(false);
            loadDetail(selectedAssignmentId);
            loadAssignments();
        } catch (err) {
            toast.error(parseApiError(err, 'Submission failed'));
        } finally {
            setSubmitting(false);
        }
    };

    const passedCount = assignments.filter((a) => a.submission?.passed).length;
    const inProgressCount = assignments.filter(
        (a) => a.submission && !a.submission.passed && a.submission.status !== 'not_started'
    ).length;

    return (
        <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
                <div className="space-y-1">
                    <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                            <ListCheck className="w-5 h-5" />
                        </div>
                        Trading Tasks &amp; Order Assignments
                    </h1>
                    <p className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">
                        Execute live orders in your terminal adhering to risk and stop-loss criteria set by your faculty
                    </p>
                </div>
                <button
                    onClick={() => navigate('/terminal')}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-600/25 transition-all self-start sm:self-auto"
                >
                    <ExternalLink size={15} /> Open Trading Terminal
                </button>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
                        <ListCheck size={24} />
                    </div>
                    <div>
                        <div className="text-2xl font-extrabold font-mono text-slate-900 dark:text-white">
                            {assignments.length}
                        </div>
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Assigned Tasks</div>
                    </div>
                </div>

                <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
                        <Award size={24} />
                    </div>
                    <div>
                        <div className="text-2xl font-extrabold font-mono text-slate-900 dark:text-white">
                            {passedCount}
                        </div>
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Passed Tasks</div>
                    </div>
                </div>

                <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
                        <Clock size={24} />
                    </div>
                    <div>
                        <div className="text-2xl font-extrabold font-mono text-slate-900 dark:text-white">
                            {inProgressCount}
                        </div>
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">In Progress</div>
                    </div>
                </div>
            </div>

            {/* Split View */}
            {loading ? (
                <div className="py-24 flex flex-col items-center justify-center gap-3">
                    <Loader2 size={36} className="animate-spin text-emerald-500" />
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Loading assigned trading tasks...</span>
                </div>
            ) : assignments.length === 0 ? (
                <div className="py-20 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-white/50 dark:bg-slate-900/30 p-8 space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
                        <ListCheck size={32} />
                    </div>
                    <div className="space-y-1">
                        <h3 className="text-base font-bold text-slate-900 dark:text-white">No Active Trading Tasks</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto font-medium">
                            Your faculty has not published any active trading assignments yet. Check back soon!
                        </p>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* Left Column: Task Cards */}
                    <div className="lg:col-span-5 space-y-3">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1">
                            Your Assignments ({assignments.length})
                        </div>
                        <div className="space-y-3">
                            {assignments.map((a) => {
                                const isSelected = a.id === selectedAssignmentId;
                                const isPassed = a.submission?.passed;
                                const assetBadge = ASSET_BADGES[a.target_asset_class] || ASSET_BADGES.EQUITY;
                                return (
                                    <div
                                        key={a.id}
                                        onClick={() => setSelectedAssignmentId(a.id)}
                                        className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col gap-3 ${
                                            isSelected
                                                ? 'bg-white dark:bg-[#111827] border-emerald-500 ring-2 ring-emerald-500/20 shadow-md'
                                                : 'bg-white/80 dark:bg-[#111827]/70 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-white dark:hover:bg-[#111827]'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span
                                                className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider"
                                                style={{
                                                    background: assetBadge.bg,
                                                    color: assetBadge.color,
                                                    border: `1px solid ${assetBadge.border}`,
                                                }}
                                            >
                                                {assetBadge.label}
                                            </span>

                                            {isPassed ? (
                                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                                                    <CheckCircle2 size={12} /> Passed ({a.submission?.score}%)
                                                </span>
                                            ) : a.submission ? (
                                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">
                                                    <Clock size={12} /> Score: {a.submission.score}%
                                                </span>
                                            ) : (
                                                <span className="text-[11px] font-medium text-slate-400">Not Started</span>
                                            )}
                                        </div>

                                        <div>
                                            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white line-clamp-1">
                                                {a.title}
                                            </h3>
                                            {a.description && (
                                                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1 font-normal">
                                                    {a.description}
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                            <span className="font-semibold">
                                                Min {a.min_trades} Trade{a.min_trades > 1 ? 's' : ''} Required
                                            </span>
                                            {a.due_date && (
                                                <span>Due: {new Date(a.due_date).toLocaleDateString()}</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right Column: Active Task Inspector & Rule Checklist */}
                    <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 space-y-6 shadow-sm">
                        {detailLoading ? (
                            <div className="py-24 flex flex-col items-center justify-center gap-3">
                                <Loader2 size={36} className="animate-spin text-emerald-500" />
                                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                    Loading task checklist &amp; order data...
                                </span>
                            </div>
                        ) : detail ? (
                            <>
                                {/* Task Header */}
                                <div className="space-y-2 border-b border-slate-200 dark:border-slate-800 pb-5">
                                    <div className="flex items-center justify-between flex-wrap gap-2">
                                        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                                            {detail.title}
                                        </h2>
                                        <button
                                            onClick={handleRunEvaluation}
                                            disabled={evaluating}
                                            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition flex items-center gap-2 border border-slate-300 dark:border-slate-700"
                                        >
                                            <RefreshCw size={13} className={evaluating ? 'animate-spin text-emerald-500' : ''} />
                                            Verify My Orders
                                        </button>
                                    </div>
                                    {detail.description && (
                                        <p className="text-xs text-slate-600 dark:text-slate-400 font-normal leading-relaxed">
                                            {detail.description}
                                        </p>
                                    )}
                                </div>

                                {/* Score & Status Card */}
                                <div className="p-4 sm:p-5 rounded-2xl border bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-4">
                                    <div>
                                        <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">
                                            Current Discipline Score
                                        </div>
                                        <div className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900 dark:text-white mt-0.5">
                                            {detail.live_evaluation?.score || 0}%
                                            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 ml-2">
                                                (Pass threshold: {detail.pass_score}%)
                                            </span>
                                        </div>
                                    </div>

                                    {detail.live_evaluation?.passed ? (
                                        <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-xs border border-emerald-500/20">
                                            <CheckCircle2 size={16} /> All Rules Satisfied
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold text-xs border border-amber-500/20">
                                            <AlertCircle size={16} /> Criteria Incomplete
                                        </div>
                                    )}
                                </div>

                                {/* Checklist of Rules */}
                                <div className="space-y-3">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                        <BarChart3 size={15} className="text-emerald-500" />
                                        Task Requirements &amp; Verification Checklist
                                    </h4>
                                    <div className="space-y-2">
                                        {detail.live_evaluation?.checklist?.map((c, idx) => (
                                            <div
                                                key={idx}
                                                className={`p-4 rounded-xl border flex items-center justify-between text-xs transition ${
                                                    c.satisfied
                                                        ? 'bg-emerald-500/5 border-emerald-500/25'
                                                        : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    {c.satisfied ? (
                                                        <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0" />
                                                    ) : (
                                                        <XCircle size={18} className="text-red-500 flex-shrink-0" />
                                                    )}
                                                    <div>
                                                        <div className="font-bold text-slate-900 dark:text-white">{c.title}</div>
                                                        {c.actual !== undefined && (
                                                            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                                                                Progress: {c.actual} / {c.required} qualifying orders executed
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <span className="text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300">
                                                    {c.satisfied ? `+${c.weight} pts` : `0 / ${c.weight} pts`}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Matched Orders Table */}
                                <div className="space-y-3">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                        <TrendingUp size={15} className="text-emerald-500" />
                                        Qualifying Orders from Your Terminal
                                    </h4>
                                    {detail.live_evaluation?.orders_evaluated?.length > 0 ? (
                                        <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden font-mono text-xs">
                                            <table className="w-full text-left border-collapse">
                                                <thead>
                                                    <tr className="bg-slate-100/80 dark:bg-slate-900 text-[11px] font-bold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                                        <th className="p-3">Symbol</th>
                                                        <th className="p-3">Side</th>
                                                        <th className="p-3">Price</th>
                                                        <th className="p-3">Stop-Loss</th>
                                                        <th className="p-3">Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                                                    {detail.live_evaluation.orders_evaluated.map((o) => (
                                                        <tr key={o.order_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                                                            <td className="p-3 font-bold text-slate-900 dark:text-white">{o.symbol}</td>
                                                            <td className="p-3">
                                                                <span
                                                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                                        o.side === 'BUY'
                                                                            ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                                                                            : 'text-red-600 dark:text-red-400 bg-red-500/10'
                                                                    }`}
                                                                >
                                                                    {o.side}
                                                                </span>
                                                            </td>
                                                            <td className="p-3 font-semibold text-slate-900 dark:text-white">
                                                                ₹{o.price?.toLocaleString()}
                                                            </td>
                                                            <td className="p-3 text-slate-600 dark:text-slate-400">
                                                                {o.trigger_price ? `₹${o.trigger_price}` : 'None'}
                                                            </td>
                                                            <td className="p-3">
                                                                {o.is_qualifying ? (
                                                                    <span className="text-emerald-600 dark:text-emerald-400 text-[11px] font-sans font-bold">
                                                                        Qualifies
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-red-500 text-[11px] font-sans font-medium">
                                                                        {o.notes}
                                                                    </span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="p-5 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 text-center text-xs text-slate-500 space-y-3">
                                            <p className="font-medium">No executed orders found yet matching this assignment's rules.</p>
                                            <button
                                                onClick={() => navigate('/terminal')}
                                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-600/20 transition"
                                            >
                                                Trade in Terminal <ArrowRight size={13} />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Faculty Feedback Section if Graded */}
                                {detail.submission?.faculty_feedback && (
                                    <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-1.5">
                                        <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                                            <MessageSquare size={14} /> Faculty Coaching Feedback
                                        </div>
                                        <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-serif italic">
                                            "{detail.submission.faculty_feedback}"
                                        </p>
                                    </div>
                                )}

                                {/* Action Buttons Footer */}
                                <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800 flex-wrap gap-3">
                                    <button
                                        onClick={() => navigate('/terminal')}
                                        className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition flex items-center gap-2"
                                    >
                                        <ExternalLink size={14} /> Trade in Terminal
                                    </button>

                                    <button
                                        onClick={() => setSubmitModalOpen(true)}
                                        className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-600/25 transition flex items-center gap-2"
                                    >
                                        <Send size={14} /> Submit Assignment
                                    </button>
                                </div>
                            </>
                        ) : null}
                    </div>
                </div>
            )}

            {/* Submit Confirmation Modal */}
            {submitModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md overflow-y-auto">
                    <div
                        className="w-full max-w-md p-6 rounded-2xl animate-slide-up space-y-4 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-2xl"
                    >
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-bold text-slate-900 dark:text-white">Submit Trading Task</h3>
                            <button
                                onClick={() => setSubmitModalOpen(false)}
                                className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                            Your order execution history and discipline score will be officially submitted to your faculty for grading and feedback.
                        </p>

                        <div>
                            <label className="block mb-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                                Reflection Notes (Optional)
                            </label>
                            <textarea
                                className="w-full px-3.5 py-2.5 rounded-xl border text-xs font-normal transition bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                                style={{ height: 72, resize: 'vertical' }}
                                placeholder="Explain your risk-management strategy or what you learned from these trades..."
                                value={studentNotes}
                                onChange={(e) => setStudentNotes(e.target.value)}
                            />
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button
                                onClick={() => setSubmitModalOpen(false)}
                                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={submitting}
                                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-600/20 transition flex items-center gap-2"
                            >
                                {submitting ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                                Confirm &amp; Submit
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
