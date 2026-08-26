import { useCallback, useEffect, useState } from 'react';
import {
    Target, Plus, Loader2, X, Trash2, CheckCircle2, XCircle, Clock,
    AlertCircle, ChevronRight, Search, SlidersHorizontal, UserCheck,
    TrendingUp, Shield, BarChart3, Edit3, MessageSquare, Award
} from 'lucide-react';
import toast from 'react-hot-toast';
import assignmentApi from '../services/assignmentApi';
import { useAuthStore } from '../stores/useAuthStore';

function parseApiError(error, fallback = 'Request failed') {
    return error?.response?.data?.detail || error?.message || fallback;
}

const ASSET_BADGES = {
    EQUITY: { label: 'Equity', color: '#00bcd4' },
    FUTURES: { label: 'Futures', color: '#8b5cf6' },
    OPTIONS: { label: 'Options', color: '#f59e0b' },
    ANY: { label: 'Multi-Asset', color: '#10b981' },
};

/* ────────────────────────────────────────────────────────────────
 * Modal: Create / Edit Trading Assignment
 * ──────────────────────────────────────────────────────────────── */
function AssignmentModal({ isOpen, onClose, onSaved, editData = null }) {
    const [title, setTitle] = useState(editData?.title || '');
    const [description, setDescription] = useState(editData?.description || '');
    const [targetAsset, setTargetAsset] = useState(editData?.target_asset_class || 'EQUITY');
    const [symbolsInput, setSymbolsInput] = useState(editData?.target_symbols?.join(', ') || '');
    const [minTrades, setMinTrades] = useState(editData?.min_trades || 3);
    const [passScore, setPassScore] = useState(editData?.pass_score || 70);
    const [requireSl, setRequireSl] = useState(editData?.require_stop_loss !== undefined ? editData.require_stop_loss : true);
    const [maxSl, setMaxSl] = useState(editData?.max_sl_percent || 2.0);
    const [requireTp, setRequireTp] = useState(editData?.require_take_profit || false);
    const [minRr, setMinRr] = useState(editData?.min_risk_reward_ratio || 1.5);
    const [allowedSides, setAllowedSides] = useState(editData?.allowed_sides || 'BOTH');
    const [productType, setProductType] = useState(editData?.allowed_product_types?.[0] || 'ALL');
    const [dueDate, setDueDate] = useState(editData?.due_date ? editData.due_date.slice(0, 16) : '');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (editData) {
            setTitle(editData.title || '');
            setDescription(editData.description || '');
            setTargetAsset(editData.target_asset_class || 'EQUITY');
            setSymbolsInput(editData.target_symbols?.join(', ') || '');
            setMinTrades(editData.min_trades || 3);
            setPassScore(editData.pass_score || 70);
            setRequireSl(editData.require_stop_loss !== undefined ? editData.require_stop_loss : true);
            setMaxSl(editData.max_sl_percent || 2.0);
            setRequireTp(editData.require_take_profit || false);
            setMinRr(editData.min_risk_reward_ratio || 1.5);
            setAllowedSides(editData.allowed_sides || 'BOTH');
            setProductType(editData.allowed_product_types?.[0] || 'ALL');
            setDueDate(editData.due_date ? editData.due_date.slice(0, 16) : '');
        }
    }, [editData]);

    if (!isOpen) return null;

    const handleSave = async () => {
        if (!title.trim()) {
            toast.error('Task title is required');
            return;
        }
        setSaving(true);
        try {
            const symbolsList = symbolsInput
                .split(',')
                .map((s) => s.trim().toUpperCase())
                .filter(Boolean);

            const payload = {
                title: title.trim(),
                description: description.trim() || null,
                target_asset_class: targetAsset,
                target_symbols: symbolsList,
                min_trades: Number(minTrades),
                pass_score: Number(passScore),
                require_stop_loss: requireSl,
                max_sl_percent: requireSl && maxSl ? Number(maxSl) : null,
                require_take_profit: requireTp,
                min_risk_reward_ratio: requireTp && minRr ? Number(minRr) : null,
                allowed_sides: allowedSides,
                allowed_product_types: [productType],
                due_date: dueDate ? new Date(dueDate).toISOString() : null,
            };

            if (editData?.id) {
                await assignmentApi.updateFacultyAssignment(editData.id, payload);
                toast.success('Trading assignment updated');
            } else {
                await assignmentApi.createFacultyAssignment(payload);
                toast.success('Trading assignment created successfully');
            }
            onSaved();
            onClose();
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to save assignment'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div
                className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl animate-slide-up overflow-hidden"
                style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
                }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-edge/10">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-primary-500/10 text-primary-500 flex items-center justify-center">
                            <Target size={18} />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-heading">
                                {editData ? 'Edit Trading Task' : 'Create Trade-Log Assignment'}
                            </h2>
                            <p className="text-xs text-muted">
                                Define live trade execution and discipline rules for your students
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-heading hover:bg-overlay/10 transition"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Body Form */}
                <div className="p-6 overflow-y-auto space-y-5 text-xs">
                    {/* Basic Info */}
                    <div className="space-y-3">
                        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                            1. Task Details
                        </label>
                        <div>
                            <label className="block mb-1 text-muted">Task Title *</label>
                            <input
                                className="input-field text-sm w-full"
                                placeholder="e.g. Stop-Loss Discipline & Risk Sizing Challenge"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block mb-1 text-muted">Instructions & Objective</label>
                            <textarea
                                className="input-field text-xs w-full"
                                style={{ height: 68, resize: 'vertical' }}
                                placeholder="Explain setup criteria, market context, or analysis required..."
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Target Assets & Scope */}
                    <div className="space-y-3 pt-2 border-t border-edge/10">
                        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                            2. Market & Symbol Scope
                        </label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="block mb-1 text-muted">Asset Class</label>
                                <select
                                    className="input-field text-xs w-full"
                                    value={targetAsset}
                                    onChange={(e) => setTargetAsset(e.target.value)}
                                >
                                    <option value="EQUITY">Equity (NSE / BSE)</option>
                                    <option value="FUTURES">Futures Contracts</option>
                                    <option value="ANY">Multi-Asset (Any)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block mb-1 text-muted">Allowed Order Side</label>
                                <select
                                    className="input-field text-xs w-full"
                                    value={allowedSides}
                                    onChange={(e) => setAllowedSides(e.target.value)}
                                >
                                    <option value="BOTH">Both (Long & Short)</option>
                                    <option value="BUY">Buy (Long Only)</option>
                                    <option value="SELL">Sell (Short Only)</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block mb-1 text-muted">
                                Target Symbols (Optional — comma separated, blank for any)
                            </label>
                            <input
                                className="input-field text-xs w-full"
                                placeholder="e.g. RELIANCE, INFY, TCS, NIFTY26AUGFUT"
                                value={symbolsInput}
                                onChange={(e) => setSymbolsInput(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Discipline Rules */}
                    <div className="space-y-3 pt-2 border-t border-edge/10">
                        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                            3. Trading Discipline Rules
                        </label>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                                <label className="block mb-1 text-muted">Min Required Trades</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={50}
                                    className="input-field text-xs w-full"
                                    value={minTrades}
                                    onChange={(e) => setMinTrades(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block mb-1 text-muted">Product Type</label>
                                <select
                                    className="input-field text-xs w-full"
                                    value={productType}
                                    onChange={(e) => setProductType(e.target.value)}
                                >
                                    <option value="ALL">All (Intraday + Delivery)</option>
                                    <option value="MIS">MIS (Intraday Only)</option>
                                    <option value="CNC">CNC (Delivery Only)</option>
                                    <option value="NRML">NRML (F&O Standard)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block mb-1 text-muted">Pass Threshold Score (%)</label>
                                <input
                                    type="number"
                                    min={10}
                                    max={100}
                                    className="input-field text-xs w-full"
                                    value={passScore}
                                    onChange={(e) => setPassScore(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Stop Loss Rule */}
                        <div className="p-3 rounded-xl bg-overlay/[0.03] border border-edge/10 space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Shield size={14} className="text-primary-500" />
                                    <span className="font-semibold text-heading">Enforce Stop-Loss Discipline</span>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={requireSl}
                                    onChange={(e) => setRequireSl(e.target.checked)}
                                    className="accent-primary-500 w-4 h-4 cursor-pointer"
                                />
                            </div>
                            {requireSl && (
                                <div className="flex items-center gap-3 pt-1">
                                    <span className="text-muted">Max SL distance from entry price:</span>
                                    <div className="flex items-center gap-1">
                                        <input
                                            type="number"
                                            step="0.1"
                                            min="0.1"
                                            max="50"
                                            className="input-field text-xs w-20 text-center"
                                            value={maxSl}
                                            onChange={(e) => setMaxSl(e.target.value)}
                                        />
                                        <span className="font-bold text-heading">%</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Take Profit & Risk Reward Rule */}
                        <div className="p-3 rounded-xl bg-overlay/[0.03] border border-edge/10 space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <TrendingUp size={14} className="text-emerald-500" />
                                    <span className="font-semibold text-heading">Enforce Take-Profit / Risk-to-Reward</span>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={requireTp}
                                    onChange={(e) => setRequireTp(e.target.checked)}
                                    className="accent-primary-500 w-4 h-4 cursor-pointer"
                                />
                            </div>
                            {requireTp && (
                                <div className="flex items-center gap-3 pt-1">
                                    <span className="text-muted">Min Risk-to-Reward Ratio:</span>
                                    <div className="flex items-center gap-1">
                                        <span className="text-muted">1 :</span>
                                        <input
                                            type="number"
                                            step="0.1"
                                            min="0.5"
                                            max="10"
                                            className="input-field text-xs w-20 text-center"
                                            value={minRr}
                                            onChange={(e) => setMinRr(e.target.value)}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Due Date */}
                        <div>
                            <label className="block mb-1 text-muted">Submission Due Date (Optional)</label>
                            <input
                                type="datetime-local"
                                className="input-field text-xs w-full md:w-64"
                                value={dueDate}
                                onChange={(e) => setDueDate(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-edge/10 bg-overlay/[0.02]">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="px-4 py-2 rounded-lg text-xs font-medium text-muted hover:text-heading hover:bg-overlay/10 transition"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="admin-action-btn admin-action-btn--primary text-xs px-5 py-2"
                    >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                        {editData ? 'Save Changes' : 'Publish Task'}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────
 * Drawer: Student Submissions Roster & Order Verification
 * ──────────────────────────────────────────────────────────────── */
function SubmissionsDrawer({ assignmentId, isOpen, onClose }) {
    const [loading, setLoading] = useState(true);
    const [assignment, setAssignment] = useState(null);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [feedback, setFeedback] = useState('');
    const [grading, setGrading] = useState(false);

    const loadDetail = useCallback(async () => {
        if (!assignmentId) return;
        setLoading(true);
        try {
            const { data } = await assignmentApi.getFacultyAssignment(assignmentId);
            setAssignment(data);
            if (data.submissions?.length > 0) {
                setSelectedStudent(data.submissions[0]);
                setFeedback(data.submissions[0].faculty_feedback || '');
            }
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to load assignment detail'));
        } finally {
            setLoading(false);
        }
    }, [assignmentId]);

    useEffect(() => {
        if (isOpen) {
            loadDetail();
        }
    }, [isOpen, loadDetail]);

    const handleSelectStudent = (st) => {
        setSelectedStudent(st);
        setFeedback(st.faculty_feedback || '');
    };

    const handleSaveFeedback = async (passOverride = null) => {
        if (!selectedStudent?.submission_id) {
            toast.error('Student has not yet started or submitted this task');
            return;
        }
        setGrading(true);
        try {
            const payload = {
                faculty_feedback: feedback,
                passed: passOverride !== null ? passOverride : selectedStudent.passed,
            };
            await assignmentApi.gradeSubmission(assignment.id, selectedStudent.submission_id, payload);
            toast.success('Evaluation and feedback saved');
            loadDetail();
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to save feedback'));
        } finally {
            setGrading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in">
            <div
                className="w-full max-w-4xl h-full flex flex-col shadow-2xl animate-slide-left overflow-hidden"
                style={{
                    background: 'var(--bg-surface)',
                    borderLeft: '1px solid var(--border)',
                }}
            >
                {/* Drawer Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-edge/10 bg-overlay/[0.02]">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-primary-500/10 text-primary-500 flex items-center justify-center">
                            <UserCheck size={20} />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-heading">
                                {assignment?.title || 'Trading Task Submissions'}
                            </h2>
                            <p className="text-xs text-muted">
                                Review student trade executions, discipline scorecards, and order logs
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-heading hover:bg-overlay/10 transition"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                {loading ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3">
                        <Loader2 size={32} className="animate-spin text-primary-500" />
                        <span className="text-xs text-muted">Analyzing student order records...</span>
                    </div>
                ) : (
                    <div className="flex-1 flex overflow-hidden">
                        {/* Student List Sidebar */}
                        <div className="w-72 border-r border-edge/10 flex flex-col bg-overlay/[0.01]">
                            <div className="p-3 border-b border-edge/10 text-xs font-semibold text-muted flex items-center justify-between">
                                <span>Students ({assignment?.submissions?.length || 0})</span>
                            </div>
                            <div className="flex-1 overflow-y-auto divide-y divide-edge/5">
                                {assignment?.submissions?.map((st) => {
                                    const isSelected = selectedStudent?.student_id === st.student_id;
                                    return (
                                        <button
                                            key={st.student_id}
                                            onClick={() => handleSelectStudent(st)}
                                            className={`w-full text-left p-3.5 transition flex flex-col gap-1 ${
                                                isSelected
                                                    ? 'bg-primary-500/[0.08] border-l-2 border-primary-500'
                                                    : 'hover:bg-overlay/[0.04]'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="font-semibold text-xs text-heading truncate">
                                                    {st.student_name}
                                                </span>
                                                {st.passed ? (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                                        <CheckCircle2 size={10} /> Passed
                                                    </span>
                                                ) : st.status === 'in_progress' ? (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
                                                        <Clock size={10} /> In Progress
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] text-muted">
                                                        {st.status === 'submitted' ? 'Submitted' : 'Not Started'}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center justify-between text-[11px] text-muted">
                                                <span>{st.matched_trades_count} qualifying trades</span>
                                                <span className="font-mono font-bold text-heading">{st.score}%</span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Selected Student Detail View */}
                        <div className="flex-1 flex flex-col overflow-y-auto p-6 space-y-6">
                            {selectedStudent ? (
                                <>
                                    {/* Student Header Summary */}
                                    <div className="p-4 rounded-xl bg-overlay/[0.03] border border-edge/10 flex items-center justify-between flex-wrap gap-4">
                                        <div>
                                            <h3 className="text-sm font-bold text-heading">
                                                {selectedStudent.student_name}
                                            </h3>
                                            <p className="text-xs text-muted">{selectedStudent.student_email}</p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="text-right">
                                                <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">
                                                    Discipline Score
                                                </div>
                                                <div className="text-xl font-bold font-mono text-heading">
                                                    {selectedStudent.score}%
                                                </div>
                                            </div>
                                            <div className="h-8 w-px bg-edge/10" />
                                            <div>
                                                {selectedStudent.passed ? (
                                                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 font-bold text-xs border border-emerald-500/20">
                                                        <CheckCircle2 size={14} /> Passed Requirements
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/10 text-amber-500 font-bold text-xs border border-amber-500/20">
                                                        <AlertCircle size={14} /> Criteria Pending
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Rule Checklist Verification */}
                                    <div className="space-y-3">
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-2">
                                            <BarChart3 size={14} className="text-primary-500" />
                                            Rule Verification Checklist
                                        </h4>
                                        <div className="space-y-2">
                                            {selectedStudent.evaluation_summary?.checklist ? (
                                                selectedStudent.evaluation_summary.checklist.map((c, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="flex items-center justify-between p-3 rounded-lg bg-overlay/[0.02] border border-edge/10 text-xs"
                                                    >
                                                        <div className="flex items-center gap-2.5">
                                                            {c.satisfied ? (
                                                                <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
                                                            ) : (
                                                                <XCircle size={16} className="text-red-500 flex-shrink-0" />
                                                            )}
                                                            <span className="text-heading font-medium">{c.title}</span>
                                                        </div>
                                                        <span className="text-[11px] font-mono text-muted">
                                                            Weight: {c.weight}%
                                                        </span>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="p-3 text-xs text-muted">
                                                    No automated order evaluation recorded yet. Student needs to execute trades.
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Matched Orders Log */}
                                    <div className="space-y-3">
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-2">
                                            <TrendingUp size={14} className="text-emerald-500" />
                                            Order Execution Log
                                        </h4>
                                        {selectedStudent.evaluation_summary?.orders_evaluated?.length > 0 ? (
                                            <div className="rounded-xl border border-edge/10 overflow-hidden">
                                                <table className="w-full text-left text-xs border-collapse">
                                                    <thead>
                                                        <tr className="bg-overlay/[0.04] text-[11px] text-muted border-b border-edge/10">
                                                            <th className="p-2.5">Symbol</th>
                                                            <th className="p-2.5">Side</th>
                                                            <th className="p-2.5">Exec Price</th>
                                                            <th className="p-2.5">SL Trigger</th>
                                                            <th className="p-2.5">SL %</th>
                                                            <th className="p-2.5">Compliance</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-edge/5 font-mono">
                                                        {selectedStudent.evaluation_summary.orders_evaluated.map((o) => (
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
                                                                    {o.trigger_price ? `₹${o.trigger_price}` : '—'}
                                                                </td>
                                                                <td className="p-2.5 text-muted">
                                                                    {o.sl_percent ? `${o.sl_percent}%` : '—'}
                                                                </td>
                                                                <td className="p-2.5">
                                                                    {o.is_qualifying ? (
                                                                        <span className="text-emerald-500 text-[11px] font-sans font-semibold">
                                                                            Compliant
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
                                            <div className="p-4 rounded-xl border border-edge/10 bg-overlay/[0.01] text-xs text-muted text-center">
                                                No qualifying order executions found in the student's trading history.
                                            </div>
                                        )}
                                    </div>

                                    {/* Student Notes if any */}
                                    {selectedStudent.student_notes && (
                                        <div className="p-3.5 rounded-xl bg-overlay/[0.02] border border-edge/10 space-y-1">
                                            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                                                Student Submission Reflection
                                            </div>
                                            <p className="text-xs text-heading italic">
                                                "{selectedStudent.student_notes}"
                                            </p>
                                        </div>
                                    )}

                                    {/* Faculty Feedback Form */}
                                    <div className="p-4 rounded-xl bg-overlay/[0.03] border border-edge/10 space-y-3">
                                        <label className="text-xs font-bold text-heading flex items-center gap-2">
                                            <MessageSquare size={14} className="text-primary-500" />
                                            Faculty Coaching Notes &amp; Manual Override
                                        </label>
                                        <textarea
                                            className="input-field text-xs w-full"
                                            style={{ height: 60, resize: 'vertical' }}
                                            placeholder="Leave feedback on student's risk management or trade execution..."
                                            value={feedback}
                                            onChange={(e) => setFeedback(e.target.value)}
                                        />
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handleSaveFeedback(true)}
                                                    disabled={grading}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition border border-emerald-500/30"
                                                >
                                                    Mark as Passed
                                                </button>
                                                <button
                                                    onClick={() => handleSaveFeedback(false)}
                                                    disabled={grading}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500/10 text-red-500 hover:bg-red-500/20 transition border border-red-500/30"
                                                >
                                                    Mark as Needs Revision
                                                </button>
                                            </div>
                                            <button
                                                onClick={() => handleSaveFeedback()}
                                                disabled={grading}
                                                className="admin-action-btn admin-action-btn--primary text-xs px-4 py-1.5"
                                            >
                                                {grading ? <Loader2 size={12} className="animate-spin" /> : null}
                                                Save Notes
                                            </button>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="flex-1 flex items-center justify-center text-xs text-muted">
                                    Select a student from the left panel to inspect order executions.
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────
 * Main Page: Faculty Trading Assignments
 * ──────────────────────────────────────────────────────────────── */
export default function FacultyAssignmentsPage() {
    const user = useAuthStore((s) => s.user);
    const [assignments, setAssignments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [assetFilter, setAssetFilter] = useState('ALL');
    const [modalOpen, setModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [inspectDrawerId, setInspectDrawerId] = useState(null);

    const loadAssignments = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await assignmentApi.listFacultyAssignments();
            setAssignments(data.assignments || []);
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to load trading assignments'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadAssignments();
    }, [loadAssignments]);

    const handleDelete = async (id, title) => {
        if (!window.confirm(`Delete assignment "${title}"? This cannot be undone.`)) return;
        try {
            await assignmentApi.deleteFacultyAssignment(id);
            toast.success('Assignment deleted');
            loadAssignments();
        } catch (err) {
            toast.error(parseApiError(err, 'Failed to delete'));
        }
    };

    // Filter assignments
    const filtered = assignments.filter((a) => {
        const matchSearch = a.title?.toLowerCase().includes(search.toLowerCase());
        const matchAsset = assetFilter === 'ALL' || a.target_asset_class === assetFilter;
        return matchSearch && matchAsset;
    });

    const totalSubmissions = assignments.reduce((acc, a) => acc + (a.stats?.total_submissions || 0), 0);
    const totalPassed = assignments.reduce((acc, a) => acc + (a.stats?.passed_count || 0), 0);
    const overallPassRate = totalSubmissions > 0 ? Math.round((totalPassed / totalSubmissions) * 100) : 0;

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-heading flex items-center gap-2">
                        <Target className="w-6 h-6 text-primary-500" />
                        Trading Tasks &amp; Order-Log Assignments
                    </h1>
                    <p className="text-xs text-muted mt-0.5">
                        Set practical trading assignments evaluated automatically against students' actual order logs
                    </p>
                </div>
                <button
                    onClick={() => {
                        setEditingItem(null);
                        setModalOpen(true);
                    }}
                    className="admin-action-btn admin-action-btn--primary text-xs px-4 py-2 flex items-center gap-2"
                >
                    <Plus size={15} />
                    New Trading Task
                </button>
            </div>

            {/* Metrics Overview Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-surface border border-edge/10 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary-500/10 text-primary-500 flex items-center justify-center flex-shrink-0">
                        <Target size={20} />
                    </div>
                    <div>
                        <div className="text-lg font-bold font-mono text-heading">{assignments.length}</div>
                        <div className="text-[11px] text-muted">Active Tasks</div>
                    </div>
                </div>

                <div className="p-4 rounded-xl bg-surface border border-edge/10 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center flex-shrink-0">
                        <UserCheck size={20} />
                    </div>
                    <div>
                        <div className="text-lg font-bold font-mono text-heading">{totalSubmissions}</div>
                        <div className="text-[11px] text-muted">Total Submissions</div>
                    </div>
                </div>

                <div className="p-4 rounded-xl bg-surface border border-edge/10 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center flex-shrink-0">
                        <Award size={20} />
                    </div>
                    <div>
                        <div className="text-lg font-bold font-mono text-heading">{overallPassRate}%</div>
                        <div className="text-[11px] text-muted">Discipline Pass Rate</div>
                    </div>
                </div>

                <div className="p-4 rounded-xl bg-surface border border-edge/10 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center flex-shrink-0">
                        <Clock size={20} />
                    </div>
                    <div>
                        <div className="text-lg font-bold font-mono text-heading">
                            {assignments.reduce((acc, a) => acc + (a.stats?.pending_review || 0), 0)}
                        </div>
                        <div className="text-[11px] text-muted">Pending Review</div>
                    </div>
                </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-xl bg-surface border border-edge/10">
                <div className="relative w-full sm:w-72">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                    <input
                        className="input-field text-xs pl-8 w-full"
                        placeholder="Search assignments..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <SlidersHorizontal size={14} className="text-muted" />
                    <select
                        className="input-field text-xs"
                        value={assetFilter}
                        onChange={(e) => setAssetFilter(e.target.value)}
                    >
                        <option value="ALL">All Asset Classes</option>
                        <option value="EQUITY">Equity Only</option>
                        <option value="FUTURES">Futures Only</option>
                        <option value="ANY">Multi-Asset</option>
                    </select>
                </div>
            </div>

            {/* Assignments Grid */}
            {loading ? (
                <div className="py-16 flex flex-col items-center justify-center gap-3">
                    <Loader2 size={32} className="animate-spin text-primary-500" />
                    <span className="text-xs text-muted">Loading assignments...</span>
                </div>
            ) : filtered.length === 0 ? (
                <div className="py-16 text-center border border-dashed border-edge/20 rounded-2xl bg-surface/50 p-8 space-y-3">
                    <Target size={36} className="mx-auto text-muted/60" />
                    <h3 className="text-sm font-bold text-heading">No Trading Tasks Found</h3>
                    <p className="text-xs text-muted max-w-sm mx-auto">
                        Create your first trade-log assignment to start coaching students on stop-loss rules and order execution.
                    </p>
                    <button
                        onClick={() => {
                            setEditingItem(null);
                            setModalOpen(true);
                        }}
                        className="admin-action-btn admin-action-btn--primary text-xs px-4 py-2 inline-flex items-center gap-2 mt-2"
                    >
                        <Plus size={14} /> Create Trading Task
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filtered.map((a) => {
                        const assetBadge = ASSET_BADGES[a.target_asset_class] || ASSET_BADGES.EQUITY;
                        return (
                            <div
                                key={a.id}
                                className="p-5 rounded-2xl bg-surface border border-edge/10 hover:border-edge/25 transition-all duration-200 flex flex-col justify-between shadow-sm space-y-4"
                            >
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between gap-2">
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
                                        <span className="text-[11px] font-mono text-muted">
                                            Pass: {a.pass_score}%
                                        </span>
                                    </div>

                                    <div>
                                        <h3 className="text-sm font-bold text-heading line-clamp-1">{a.title}</h3>
                                        {a.description && (
                                            <p className="text-xs text-muted line-clamp-2 mt-1">{a.description}</p>
                                        )}
                                    </div>

                                    {/* Rules summary chips */}
                                    <div className="flex flex-wrap gap-1.5 text-[10px]">
                                        <span className="px-2 py-0.5 rounded bg-overlay/[0.04] text-muted border border-edge/5 font-mono">
                                            {a.min_trades} Trade{a.min_trades > 1 ? 's' : ''} Min
                                        </span>
                                        {a.require_stop_loss && (
                                            <span className="px-2 py-0.5 rounded bg-primary-500/10 text-primary-500 border border-primary-500/20 font-semibold">
                                                SL {a.max_sl_percent ? `≤ ${a.max_sl_percent}%` : 'Required'}
                                            </span>
                                        )}
                                        {a.require_take_profit && (
                                            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-semibold">
                                                RR {a.min_risk_reward_ratio ? `≥ ${a.min_risk_reward_ratio}:1` : 'Required'}
                                            </span>
                                        )}
                                        {a.target_symbols?.length > 0 && (
                                            <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 font-mono">
                                                {a.target_symbols.slice(0, 2).join(', ')}
                                                {a.target_symbols.length > 2 ? ` +${a.target_symbols.length - 2}` : ''}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Bottom actions and submissions stat */}
                                <div className="pt-3 border-t border-edge/10 flex items-center justify-between">
                                    <div className="text-[11px] text-muted">
                                        <span className="font-bold text-heading">{a.stats?.passed_count || 0}</span> /{' '}
                                        {a.stats?.total_submissions || 0} Passed
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                        <button
                                            onClick={() => setInspectDrawerId(a.id)}
                                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary-500/10 text-primary-500 hover:bg-primary-500/20 transition flex items-center gap-1"
                                        >
                                            Inspect <ChevronRight size={12} />
                                        </button>
                                        <button
                                            onClick={() => {
                                                setEditingItem(a);
                                                setModalOpen(true);
                                            }}
                                            className="p-1.5 rounded-lg text-muted hover:text-heading hover:bg-overlay/10 transition"
                                            title="Edit Task"
                                        >
                                            <Edit3 size={14} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(a.id, a.title)}
                                            className="p-1.5 rounded-lg text-muted hover:text-red-500 hover:bg-red-500/10 transition"
                                            title="Delete Task"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modal for Create/Edit */}
            <AssignmentModal
                isOpen={modalOpen}
                onClose={() => {
                    setModalOpen(false);
                    setEditingItem(null);
                }}
                onSaved={loadAssignments}
                editData={editingItem}
            />

            {/* Submissions Review Drawer */}
            <SubmissionsDrawer
                assignmentId={inspectDrawerId}
                isOpen={Boolean(inspectDrawerId)}
                onClose={() => setInspectDrawerId(null)}
            />
        </div>
    );
}
