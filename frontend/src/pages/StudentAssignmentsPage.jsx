import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Target, CheckCircle2, XCircle, Clock, AlertCircle, RefreshCw,
    TrendingUp, Shield, BarChart3, ChevronRight, MessageSquare,
    ExternalLink, ArrowRight, Award, Loader2, Send
} from 'lucide-react';
import toast from 'react-hot-toast';
import assignmentApi from '../services/assignmentApi';

function parseApiError(error, fallback = 'Request failed') {
    return error?.response?.data?.detail || error?.message || fallback;
}

const ASSET_BADGES = {
    EQUITY: { label: 'Equity', color: '#00bcd4' },
    FUTURES: { label: 'Futures', color: '#8b5cf6' },
    OPTIONS: { label: 'Options', color: '#f59e0b' },
    ANY: { label: 'Multi-Asset', color: '#10b981' },
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

    // Live verification trigger
    const handleRunEvaluation = async () => {
        if (!selectedAssignmentId) return;
        setEvaluating(true);
        try {
            const { data } = await assignmentApi.evaluateStudentAssignment(selectedAssignmentId);
            toast.success('Order evaluation updated!');
            loadDetail(selectedAssignmentId);
            loadAssignments();
        } catch (err) {
            toast.error(parseApiError(err, 'Evaluation failed'));
        } finally {
            setEvaluating(false);
        }
    };

    // Official Submit
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
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-heading flex items-center gap-2">
                        <Target className="w-6 h-6 text-primary-500" />
                        Trading Tasks &amp; Order Assignments
                    </h1>
                    <p className="text-xs text-muted mt-0.5">
                        Execute live orders in your terminal adhering to risk and stop-loss criteria set by your faculty
                    </p>
                </div>
                <button
                    onClick={() => navigate('/terminal')}
                    className="admin-action-btn admin-action-btn--primary text-xs px-4 py-2 flex items-center gap-2 self-start md:self-auto"
                >
                    <ExternalLink size={14} /> Open Trading Terminal
                </button>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-surface border border-edge/10 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary-500/10 text-primary-500 flex items-center justify-center flex-shrink-0">
                        <Target size={20} />
                    </div>
                    <div>
                        <div className="text-lg font-bold font-mono text-heading">{assignments.length}</div>
                        <div className="text-[11px] text-muted">Assigned Tasks</div>
                    </div>
                </div>

                <div className="p-4 rounded-xl bg-surface border border-edge/10 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center flex-shrink-0">
                        <Award size={20} />
                    </div>
                    <div>
                        <div className="text-lg font-bold font-mono text-heading">{passedCount}</div>
                        <div className="text-[11px] text-muted">Passed Tasks</div>
                    </div>
                </div>

                <div className="p-4 rounded-xl bg-surface border border-edge/10 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center flex-shrink-0">
                        <Clock size={20} />
                    </div>
                    <div>
                        <div className="text-lg font-bold font-mono text-heading">{inProgressCount}</div>
                        <div className="text-[11px] text-muted">In Progress</div>
                    </div>
                </div>
            </div>

            {/* Main Content: Split Task List & Verification Inspector */}
            {loading ? (
                <div className="py-20 flex flex-col items-center justify-center gap-3">
                    <Loader2 size={32} className="animate-spin text-primary-500" />
                    <span className="text-xs text-muted">Loading assigned trading tasks...</span>
                </div>
            ) : assignments.length === 0 ? (
                <div className="py-16 text-center border border-dashed border-edge/20 rounded-2xl bg-surface/50 p-8 space-y-3">
                    <Target size={36} className="mx-auto text-muted/60" />
                    <h3 className="text-sm font-bold text-heading">No Active Trading Tasks</h3>
                    <p className="text-xs text-muted max-w-sm mx-auto">
                        Your faculty has not published any active trading assignments yet. Check back soon!
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* Left Column: Task Cards (5 cols) */}
                    <div className="lg:col-span-5 space-y-3">
                        <div className="text-xs font-bold uppercase tracking-wider text-muted px-1">
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
                                        className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col gap-3 ${
                                            isSelected
                                                ? 'bg-surface border-primary-500 ring-1 ring-primary-500/20 shadow-md'
                                                : 'bg-surface/70 border-edge/10 hover:border-edge/25 hover:bg-surface'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span
                                                className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                                                style={{
                                                    background: `${assetBadge.color}15`,
                                                    color: assetBadge.color,
                                                    border: `1px solid ${assetBadge.color}35`,
                                                }}
                                            >
                                                {assetBadge.label}
                                            </span>

                                            {isPassed ? (
                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                                    <CheckCircle2 size={11} /> Passed ({a.submission?.score}%)
                                                </span>
                                            ) : a.submission ? (
                                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                                    <Clock size={11} /> Score: {a.submission.score}%
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-muted">Not Started</span>
                                            )}
                                        </div>

                                        <div>
                                            <h3 className="text-sm font-bold text-heading line-clamp-1">{a.title}</h3>
                                            {a.description && (
                                                <p className="text-xs text-muted line-clamp-2 mt-1">
                                                    {a.description}
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex items-center justify-between pt-2 border-t border-edge/10 text-[11px] text-muted">
                                            <span>
                                                Min {a.min_trades} Trade{a.min_trades > 1 ? 's' : ''}
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

                    {/* Right Column: Active Task Inspector & Rule Checklist (7 cols) */}
                    <div className="lg:col-span-7 rounded-2xl bg-surface border border-edge/10 p-6 space-y-6 shadow-sm">
                        {detailLoading ? (
                            <div className="py-20 flex flex-col items-center justify-center gap-3">
                                <Loader2 size={32} className="animate-spin text-primary-500" />
                                <span className="text-xs text-muted">Loading task checklist &amp; order data...</span>
                            </div>
                        ) : detail ? (
                            <>
                                {/* Task Header */}
                                <div className="space-y-2 border-b border-edge/10 pb-5">
                                    <div className="flex items-center justify-between flex-wrap gap-2">
                                        <h2 className="text-lg font-bold text-heading">{detail.title}</h2>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={handleRunEvaluation}
                                                disabled={evaluating}
                                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-overlay/[0.04] text-heading hover:bg-overlay/[0.08] transition flex items-center gap-1.5 border border-edge/10"
                                            >
                                                <RefreshCw size={13} className={evaluating ? 'animate-spin' : ''} />
                                                Verify My Orders
                                            </button>
                                        </div>
                                    </div>
                                    {detail.description && (
                                        <p className="text-xs text-muted">{detail.description}</p>
                                    )}
                                </div>

                                {/* Score & Status Card */}
                                <div className="p-4 rounded-xl bg-overlay/[0.03] border border-edge/10 flex items-center justify-between flex-wrap gap-4">
                                    <div>
                                        <div className="text-[11px] uppercase tracking-wider text-muted font-semibold">
                                            Current Discipline Score
                                        </div>
                                        <div className="text-2xl font-bold font-mono text-heading mt-0.5">
                                            {detail.live_evaluation?.score || 0}%
                                            <span className="text-xs font-normal text-muted ml-2">
                                                (Pass threshold: {detail.pass_score}%)
                                            </span>
                                        </div>
                                    </div>

                                    {detail.live_evaluation?.passed ? (
                                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 font-bold text-xs border border-emerald-500/20">
                                            <CheckCircle2 size={15} /> All Rules Satisfied
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-500 font-bold text-xs border border-amber-500/20">
                                            <AlertCircle size={15} /> Criteria Incomplete
                                        </div>
                                    )}
                                </div>

                                {/* Checklist of Rules */}
                                <div className="space-y-3">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-2">
                                        <BarChart3 size={14} className="text-primary-500" />
                                        Task Requirements &amp; Verification
                                    </h4>
                                    <div className="space-y-2">
                                        {detail.live_evaluation?.checklist?.map((c, idx) => (
                                            <div
                                                key={idx}
                                                className={`p-3.5 rounded-xl border flex items-center justify-between text-xs transition ${
                                                    c.satisfied
                                                        ? 'bg-emerald-500/[0.03] border-emerald-500/20'
                                                        : 'bg-overlay/[0.02] border-edge/10'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    {c.satisfied ? (
                                                        <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0" />
                                                    ) : (
                                                        <XCircle size={18} className="text-red-500/80 flex-shrink-0" />
                                                    )}
                                                    <div>
                                                        <div className="font-semibold text-heading">{c.title}</div>
                                                        {c.actual !== undefined && (
                                                            <div className="text-[11px] text-muted">
                                                                Progress: {c.actual} / {c.required} qualifying orders
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <span className="text-[11px] font-mono font-bold text-muted">
                                                    {c.satisfied ? `+${c.weight} pts` : `0 / ${c.weight} pts`}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Matched Orders from Student History */}
                                <div className="space-y-3">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-2">
                                        <TrendingUp size={14} className="text-emerald-500" />
                                        Qualifying Orders from Your Terminal
                                    </h4>
                                    {detail.live_evaluation?.orders_evaluated?.length > 0 ? (
                                        <div className="rounded-xl border border-edge/10 overflow-hidden font-mono text-xs">
                                            <table className="w-full text-left border-collapse">
                                                <thead>
                                                    <tr className="bg-overlay/[0.04] text-[11px] text-muted border-b border-edge/10">
                                                        <th className="p-2.5">Symbol</th>
                                                        <th className="p-2.5">Side</th>
                                                        <th className="p-2.5">Price</th>
                                                        <th className="p-2.5">Stop-Loss</th>
                                                        <th className="p-2.5">Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-edge/5">
                                                    {detail.live_evaluation.orders_evaluated.map((o) => (
                                                        <tr key={o.order_id} className="hover:bg-overlay/[0.02]">
                                                            <td className="p-2.5 font-bold text-heading">{o.symbol}</td>
                                                            <td className="p-2.5">
                                                                <span
                                                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                                        o.side === 'BUY'
                                                                            ? 'text-emerald-500 bg-emerald-500/10'
                                                                            : 'text-red-500 bg-red-500/10'
                                                                    }`}
                                                                >
                                                                    {o.side}
                                                                </span>
                                                            </td>
                                                            <td className="p-2.5 text-heading">₹{o.price?.toLocaleString()}</td>
                                                            <td className="p-2.5 text-muted">
                                                                {o.trigger_price ? `₹${o.trigger_price}` : 'None'}
                                                            </td>
                                                            <td className="p-2.5">
                                                                {o.is_qualifying ? (
                                                                    <span className="text-emerald-500 text-[11px] font-sans font-semibold">
                                                                        Qualifies
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-red-500 text-[11px] font-sans">
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
                                        <div className="p-4 rounded-xl border border-dashed border-edge/20 text-center text-xs text-muted space-y-2">
                                            <p>No executed orders found yet matching this assignment's criteria.</p>
                                            <button
                                                onClick={() => navigate('/terminal')}
                                                className="admin-action-btn admin-action-btn--primary text-xs px-3 py-1.5 inline-flex items-center gap-1.5"
                                            >
                                                Trade in Terminal <ArrowRight size={13} />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Faculty Feedback Section if Graded */}
                                {detail.submission?.faculty_feedback && (
                                    <div className="p-4 rounded-xl bg-primary-500/[0.04] border border-primary-500/20 space-y-1.5">
                                        <div className="text-xs font-bold text-primary-500 flex items-center gap-2">
                                            <MessageSquare size={14} /> Faculty Coaching Feedback
                                        </div>
                                        <p className="text-xs text-heading leading-relaxed">
                                            "{detail.submission.faculty_feedback}"
                                        </p>
                                    </div>
                                )}

                                {/* Action Buttons Footer */}
                                <div className="flex items-center justify-between pt-4 border-t border-edge/10">
                                    <button
                                        onClick={() => navigate('/terminal')}
                                        className="px-4 py-2 rounded-lg text-xs font-semibold text-muted hover:text-heading hover:bg-overlay/10 transition flex items-center gap-1.5"
                                    >
                                        <ExternalLink size={13} /> Trade More in Terminal
                                    </button>

                                    <button
                                        onClick={() => setSubmitModalOpen(true)}
                                        className="admin-action-btn admin-action-btn--primary text-xs px-5 py-2 flex items-center gap-2"
                                    >
                                        <Send size={13} /> Submit Assignment
                                    </button>
                                </div>
                            </>
                        ) : null}
                    </div>
                </div>
            )}

            {/* Submit Confirmation Modal with Notes */}
            {submitModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div
                        className="w-full max-w-md p-6 rounded-2xl animate-slide-up space-y-4"
                        style={{
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border)',
                            boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
                        }}
                    >
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-heading">Submit Trading Task</h3>
                            <button
                                onClick={() => setSubmitModalOpen(false)}
                                className="text-muted hover:text-heading"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <p className="text-xs text-muted">
                            Your order execution history and discipline checklist will be officially submitted to your faculty for review.
                        </p>

                        <div>
                            <label className="block mb-1 text-xs text-muted">
                                Reflection Notes (Optional)
                            </label>
                            <textarea
                                className="input-field text-xs w-full"
                                style={{ height: 72, resize: 'vertical' }}
                                placeholder="Explain your risk-management strategy or what you learned from these trades..."
                                value={studentNotes}
                                onChange={(e) => setStudentNotes(e.target.value)}
                            />
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                onClick={() => setSubmitModalOpen(false)}
                                className="px-3 py-1.5 rounded-lg text-xs text-muted hover:text-heading"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={submitting}
                                className="admin-action-btn admin-action-btn--primary text-xs px-4 py-2 flex items-center gap-1.5"
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
