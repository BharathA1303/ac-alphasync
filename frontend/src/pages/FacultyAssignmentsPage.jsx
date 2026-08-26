import { useCallback, useEffect, useState } from 'react';
import {
    ListCheck, Plus, Loader2, X, Trash2, CheckCircle2, XCircle, Clock,
    AlertCircle, ChevronRight, Search, SlidersHorizontal, UserCheck,
    TrendingUp, Shield, BarChart3, Edit3, MessageSquare, Award,
    FileSpreadsheet, Calendar, Sparkles, Filter
} from 'lucide-react';
import toast from 'react-hot-toast';
import assignmentApi from '../services/assignmentApi';
import { useAuthStore } from '../stores/useAuthStore';

function parseApiError(error, fallback = 'Request failed') {
    return error?.response?.data?.detail || error?.message || fallback;
}

const ASSET_BADGES = {
    EQUITY: { label: 'Equity', color: '#00bcd4', bg: 'rgba(0, 188, 212, 0.12)', border: 'rgba(0, 188, 212, 0.3)' },
    FUTURES: { label: 'Futures', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)', border: 'rgba(139, 92, 246, 0.3)' },
    OPTIONS: { label: 'Options', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)' },
    ANY: { label: 'Multi-Asset', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.3)' },
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
                min_trades: Number(minTrades) || 1,
                pass_score: Number(passScore) || 70,
                require_stop_loss: Boolean(requireSl),
                max_sl_percent: requireSl && maxSl ? Number(maxSl) : null,
                require_take_profit: Boolean(requireTp),
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-950/70 backdrop-blur-md overflow-y-auto">
            <div
                className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl animate-slide-up overflow-hidden shadow-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800"
            >
                {/* Modal Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/50">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                            <ListCheck size={20} />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900 dark:text-white">
                                {editData ? 'Edit Trading Task' : 'Create Trade-Log Assignment'}
                            </h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Define live execution and stop-loss rules evaluated against student order logs
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Form Body */}
                <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-700 dark:text-slate-300">
                    {/* Section 1: Task Info */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                                1. Task Objective &amp; Details
                            </span>
                        </div>
                        <div>
                            <label className="block mb-1.5 font-semibold text-slate-800 dark:text-slate-200">
                                Task Title <span className="text-red-500">*</span>
                            </label>
                            <input
                                className="w-full px-3.5 py-2.5 rounded-xl border text-sm font-medium transition bg-slate-50 dark:bg-slate-900/90 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                                placeholder="e.g. Intraday Stop-Loss Discipline Challenge"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block mb-1.5 font-semibold text-slate-800 dark:text-slate-200">
                                Instructions &amp; Setup Strategy
                            </label>
                            <textarea
                                className="w-full px-3.5 py-2.5 rounded-xl border text-xs font-normal transition bg-slate-50 dark:bg-slate-900/90 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                                style={{ height: 72, resize: 'vertical' }}
                                placeholder="Explain setup criteria, risk management rules, or required market analysis..."
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Section 2: Market & Symbol Scope */}
                    <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                            2. Market &amp; Symbol Scope
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            <div>
                                <label className="block mb-1.5 font-semibold text-slate-800 dark:text-slate-200">
                                    Asset Class
                                </label>
                                <select
                                    className="w-full px-3.5 py-2.5 rounded-xl border text-xs font-medium bg-slate-50 dark:bg-slate-900/90 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                                    value={targetAsset}
                                    onChange={(e) => setTargetAsset(e.target.value)}
                                >
                                    <option value="EQUITY">Equity (NSE / BSE)</option>
                                    <option value="FUTURES">Futures Contracts</option>
                                    <option value="ANY">Multi-Asset (Any)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block mb-1.5 font-semibold text-slate-800 dark:text-slate-200">
                                    Allowed Order Side
                                </label>
                                <select
                                    className="w-full px-3.5 py-2.5 rounded-xl border text-xs font-medium bg-slate-50 dark:bg-slate-900/90 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                                    value={allowedSides}
                                    onChange={(e) => setAllowedSides(e.target.value)}
                                >
                                    <option value="BOTH">Both (Long &amp; Short)</option>
                                    <option value="BUY">Buy (Long Only)</option>
                                    <option value="SELL">Sell (Short Only)</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block mb-1.5 font-semibold text-slate-800 dark:text-slate-200">
                                Target Symbols (Optional — comma separated, blank for any)
                            </label>
                            <input
                                className="w-full px-3.5 py-2.5 rounded-xl border text-xs font-medium bg-slate-50 dark:bg-slate-900/90 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                                placeholder="e.g. RELIANCE, INFY, TCS, NIFTY26AUGFUT"
                                value={symbolsInput}
                                onChange={(e) => setSymbolsInput(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Section 3: Discipline Rules */}
                    <div className="space-y-3.5 pt-4 border-t border-slate-200 dark:border-slate-800">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                            3. Trading Discipline Rules
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                            <div>
                                <label className="block mb-1.5 font-semibold text-slate-800 dark:text-slate-200">
                                    Min Required Trades
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    max={50}
                                    className="w-full px-3.5 py-2.5 rounded-xl border text-xs font-medium bg-slate-50 dark:bg-slate-900/90 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                                    value={minTrades}
                                    onChange={(e) => setMinTrades(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block mb-1.5 font-semibold text-slate-800 dark:text-slate-200">
                                    Product Type
                                </label>
                                <select
                                    className="w-full px-3.5 py-2.5 rounded-xl border text-xs font-medium bg-slate-50 dark:bg-slate-900/90 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                                    value={productType}
                                    onChange={(e) => setProductType(e.target.value)}
                                >
                                    <option value="ALL">All (Intraday + Delivery)</option>
                                    <option value="MIS">MIS (Intraday Only)</option>
                                    <option value="CNC">CNC (Delivery Only)</option>
                                    <option value="NRML">NRML (F&amp;O Standard)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block mb-1.5 font-semibold text-slate-800 dark:text-slate-200">
                                    Pass Threshold (%)
                                </label>
                                <input
                                    type="number"
                                    min={10}
                                    max={100}
                                    className="w-full px-3.5 py-2.5 rounded-xl border text-xs font-medium bg-slate-50 dark:bg-slate-900/90 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                                    value={passScore}
                                    onChange={(e) => setPassScore(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Stop Loss Card */}
                        <div className="p-4 rounded-xl border bg-slate-50/80 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 space-y-2.5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Shield size={16} className="text-emerald-600 dark:text-emerald-400" />
                                    <span className="font-bold text-slate-900 dark:text-white text-xs">
                                        Enforce Stop-Loss Discipline
                                    </span>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={requireSl}
                                    onChange={(e) => setRequireSl(e.target.checked)}
                                    className="accent-emerald-600 w-4 h-4 rounded cursor-pointer"
                                />
                            </div>
                            {requireSl && (
                                <div className="flex items-center gap-3 pt-1 text-xs text-slate-600 dark:text-slate-300">
                                    <span>Max Stop-Loss distance from entry price:</span>
                                    <div className="flex items-center gap-1.5">
                                        <input
                                            type="number"
                                            step="0.1"
                                            min="0.1"
                                            max="50"
                                            className="w-20 px-2 py-1.5 text-center font-bold rounded-lg border bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                                            value={maxSl}
                                            onChange={(e) => setMaxSl(e.target.value)}
                                        />
                                        <span className="font-bold text-slate-900 dark:text-white">%</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Take Profit Card */}
                        <div className="p-4 rounded-xl border bg-slate-50/80 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 space-y-2.5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <TrendingUp size={16} className="text-indigo-600 dark:text-indigo-400" />
                                    <span className="font-bold text-slate-900 dark:text-white text-xs">
                                        Enforce Take-Profit / Risk-to-Reward
                                    </span>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={requireTp}
                                    onChange={(e) => setRequireTp(e.target.checked)}
                                    className="accent-emerald-600 w-4 h-4 rounded cursor-pointer"
                                />
                            </div>
                            {requireTp && (
                                <div className="flex items-center gap-3 pt-1 text-xs text-slate-600 dark:text-slate-300">
                                    <span>Minimum Risk-to-Reward Ratio:</span>
                                    <div className="flex items-center gap-1.5 font-bold">
                                        <span>1 :</span>
                                        <input
                                            type="number"
                                            step="0.1"
                                            min="0.5"
                                            max="10"
                                            className="w-20 px-2 py-1.5 text-center rounded-lg border bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                                            value={minRr}
                                            onChange={(e) => setMinRr(e.target.value)}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Due Date */}
                        <div>
                            <label className="block mb-1.5 font-semibold text-slate-800 dark:text-slate-200">
                                Submission Due Date (Optional)
                            </label>
                            <input
                                type="datetime-local"
                                className="w-full sm:w-72 px-3.5 py-2.5 rounded-xl border text-xs font-medium bg-slate-50 dark:bg-slate-900/90 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                                value={dueDate}
                                onChange={(e) => setDueDate(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/50">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-600/20 transition flex items-center gap-2"
                    >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={15} />}
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
        <div className="fixed inset-0 z-[100] flex justify-end bg-slate-950/70 backdrop-blur-md animate-fade-in">
            <div
                className="w-full max-w-4xl h-full flex flex-col shadow-2xl animate-slide-left bg-white dark:bg-[#111827] border-l border-slate-200 dark:border-slate-800"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/50">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                            <UserCheck size={20} />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900 dark:text-white">
                                {assignment?.title || 'Trading Task Submissions'}
                            </h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Review student trade executions, discipline scorecards, and order logs
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                {loading ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3">
                        <Loader2 size={32} className="animate-spin text-emerald-500" />
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            Analyzing student order records...
                        </span>
                    </div>
                ) : (
                    <div className="flex-1 flex overflow-hidden">
                        {/* Student List Sidebar */}
                        <div className="w-72 border-r border-slate-200 dark:border-slate-800 flex flex-col bg-slate-50/50 dark:bg-slate-900/30">
                            <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                                <span>Students ({assignment?.submissions?.length || 0})</span>
                            </div>
                            <div className="flex-1 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800/60">
                                {assignment?.submissions?.map((st) => {
                                    const isSelected = selectedStudent?.student_id === st.student_id;
                                    return (
                                        <button
                                            key={st.student_id}
                                            onClick={() => handleSelectStudent(st)}
                                            className={`w-full text-left p-4 transition flex flex-col gap-1.5 ${
                                                isSelected
                                                    ? 'bg-emerald-500/10 dark:bg-emerald-500/15 border-l-4 border-emerald-500'
                                                    : 'hover:bg-slate-100/70 dark:hover:bg-slate-800/50'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                                                    {st.student_name}
                                                </span>
                                                {st.passed ? (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                                        <CheckCircle2 size={10} /> Passed
                                                    </span>
                                                ) : st.status === 'in_progress' ? (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                                                        <Clock size={10} /> In Progress
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] text-slate-400">
                                                        {st.status === 'submitted' ? 'Submitted' : 'Not Started'}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                                                <span>{st.matched_trades_count} qualifying trades</span>
                                                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                                                    {st.score}%
                                                </span>
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
                                    <div className="p-4 rounded-xl border bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-4">
                                        <div>
                                            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                                                {selectedStudent.student_name}
                                            </h3>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                                {selectedStudent.student_email}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="text-right">
                                                <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                                                    Discipline Score
                                                </div>
                                                <div className="text-xl font-bold font-mono text-slate-900 dark:text-white">
                                                    {selectedStudent.score}%
                                                </div>
                                            </div>
                                            <div className="h-8 w-px bg-slate-200 dark:bg-slate-700" />
                                            <div>
                                                {selectedStudent.passed ? (
                                                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-xs border border-emerald-500/20">
                                                        <CheckCircle2 size={14} /> Passed Requirements
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold text-xs border border-amber-500/20">
                                                        <AlertCircle size={14} /> Criteria Pending
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Rule Checklist Verification */}
                                    <div className="space-y-3">
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                            <BarChart3 size={15} className="text-emerald-500" />
                                            Rule Verification Checklist
                                        </h4>
                                        <div className="space-y-2">
                                            {selectedStudent.evaluation_summary?.checklist?.map((c, idx) => (
                                                <div
                                                    key={idx}
                                                    className="flex items-center justify-between p-3.5 rounded-xl border bg-slate-50/70 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-xs"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        {c.satisfied ? (
                                                            <CheckCircle2 size={17} className="text-emerald-500 flex-shrink-0" />
                                                        ) : (
                                                            <XCircle size={17} className="text-red-500 flex-shrink-0" />
                                                        )}
                                                        <span className="font-semibold text-slate-900 dark:text-white">
                                                            {c.title}
                                                        </span>
                                                    </div>
                                                    <span className="text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400">
                                                        Weight: {c.weight}%
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Matched Orders Log */}
                                    <div className="space-y-3">
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                            <TrendingUp size={15} className="text-emerald-500" />
                                            Order Execution Log
                                        </h4>
                                        {selectedStudent.evaluation_summary?.orders_evaluated?.length > 0 ? (
                                            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                                                <table className="w-full text-left text-xs border-collapse">
                                                    <thead>
                                                        <tr className="bg-slate-100/80 dark:bg-slate-900 text-[11px] font-bold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                                            <th className="p-3">Symbol</th>
                                                            <th className="p-3">Side</th>
                                                            <th className="p-3">Exec Price</th>
                                                            <th className="p-3">SL Trigger</th>
                                                            <th className="p-3">SL %</th>
                                                            <th className="p-3">Compliance</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-mono">
                                                        {selectedStudent.evaluation_summary.orders_evaluated.map((o) => (
                                                            <tr key={o.order_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                                                                <td className="p-3 font-bold text-slate-900 dark:text-white">
                                                                    {o.symbol}
                                                                </td>
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
                                                                    {o.trigger_price ? `₹${o.trigger_price}` : '—'}
                                                                </td>
                                                                <td className="p-3 text-slate-600 dark:text-slate-400">
                                                                    {o.sl_percent ? `${o.sl_percent}%` : '—'}
                                                                </td>
                                                                <td className="p-3">
                                                                    {o.is_qualifying ? (
                                                                        <span className="text-emerald-600 dark:text-emerald-400 text-[11px] font-sans font-bold">
                                                                            Compliant
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
                                            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-xs text-slate-500 text-center">
                                                No qualifying order executions found in student's trading history.
                                            </div>
                                        )}
                                    </div>

                                    {/* Student Notes if any */}
                                    {selectedStudent.student_notes && (
                                        <div className="p-4 rounded-xl border bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 space-y-1.5">
                                            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                                Student Submission Reflection
                                            </div>
                                            <p className="text-xs text-slate-800 dark:text-slate-200 italic font-serif">
                                                "{selectedStudent.student_notes}"
                                            </p>
                                        </div>
                                    )}

                                    {/* Faculty Feedback Form */}
                                    <div className="p-5 rounded-xl border bg-slate-50/80 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 space-y-3">
                                        <label className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                            <MessageSquare size={15} className="text-emerald-500" />
                                            Faculty Coaching Notes &amp; Manual Override
                                        </label>
                                        <textarea
                                            className="w-full px-3.5 py-2.5 rounded-xl border text-xs transition bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                                            style={{ height: 64, resize: 'vertical' }}
                                            placeholder="Leave coaching feedback on student's risk management or trade setups..."
                                            value={feedback}
                                            onChange={(e) => setFeedback(e.target.value)}
                                        />
                                        <div className="flex items-center justify-between gap-3 flex-wrap">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handleSaveFeedback(true)}
                                                    disabled={grading}
                                                    className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition border border-emerald-500/30"
                                                >
                                                    Mark as Passed
                                                </button>
                                                <button
                                                    onClick={() => handleSaveFeedback(false)}
                                                    disabled={grading}
                                                    className="px-3.5 py-2 rounded-xl text-xs font-bold bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 transition border border-red-500/30"
                                                >
                                                    Needs Revision
                                                </button>
                                            </div>
                                            <button
                                                onClick={() => handleSaveFeedback()}
                                                disabled={grading}
                                                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-600/20 transition"
                                            >
                                                {grading ? <Loader2 size={13} className="animate-spin inline mr-1.5" /> : null}
                                                Save Notes
                                            </button>
                                        </div>
                                    </div>
                                </>
                            ) : null}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────
 * Main Page: Faculty Trading Tasks
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

    const filtered = assignments.filter((a) => {
        const matchSearch = a.title?.toLowerCase().includes(search.toLowerCase());
        const matchAsset = assetFilter === 'ALL' || a.target_asset_class === assetFilter;
        return matchSearch && matchAsset;
    });

    const totalSubmissions = assignments.reduce((acc, a) => acc + (a.stats?.total_submissions || 0), 0);
    const totalPassed = assignments.reduce((acc, a) => acc + (a.stats?.passed_count || 0), 0);
    const overallPassRate = totalSubmissions > 0 ? Math.round((totalPassed / totalSubmissions) * 100) : 0;

    return (
        <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
                <div className="space-y-1">
                    <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                            <ListCheck className="w-5 h-5" />
                        </div>
                        Trading Tasks &amp; Order-Log Assignments
                    </h1>
                    <p className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">
                        Define trade-based assignments, enforce stop-loss discipline, and automatically grade student order logs
                    </p>
                </div>
                <button
                    onClick={() => {
                        setEditingItem(null);
                        setModalOpen(true);
                    }}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-600/25 transition-all self-start sm:self-auto"
                >
                    <Plus size={16} />
                    New Trading Task
                </button>
            </div>

            {/* Metrics Overview Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
                        <ListCheck size={24} />
                    </div>
                    <div>
                        <div className="text-2xl font-extrabold font-mono text-slate-900 dark:text-white">
                            {assignments.length}
                        </div>
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Active Tasks</div>
                    </div>
                </div>

                <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center flex-shrink-0">
                        <UserCheck size={24} />
                    </div>
                    <div>
                        <div className="text-2xl font-extrabold font-mono text-slate-900 dark:text-white">
                            {totalSubmissions}
                        </div>
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Submissions</div>
                    </div>
                </div>

                <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
                        <Award size={24} />
                    </div>
                    <div>
                        <div className="text-2xl font-extrabold font-mono text-slate-900 dark:text-white">
                            {overallPassRate}%
                        </div>
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Discipline Pass Rate</div>
                    </div>
                </div>

                <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
                        <Clock size={24} />
                    </div>
                    <div>
                        <div className="text-2xl font-extrabold font-mono text-slate-900 dark:text-white">
                            {assignments.reduce((acc, a) => acc + (a.stats?.pending_review || 0), 0)}
                        </div>
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Pending Review</div>
                    </div>
                </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="relative w-full sm:w-80">
                    <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        className="w-full pl-9 pr-4 py-2 rounded-xl border text-xs font-medium bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                        placeholder="Search assignments by title..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-2.5 w-full sm:w-auto">
                    <Filter size={15} className="text-slate-400" />
                    <select
                        className="px-3.5 py-2 rounded-xl border text-xs font-medium bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
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
                <div className="py-24 flex flex-col items-center justify-center gap-3">
                    <Loader2 size={36} className="animate-spin text-emerald-500" />
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Loading assignments...</span>
                </div>
            ) : filtered.length === 0 ? (
                <div className="py-20 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-white/50 dark:bg-slate-900/30 p-8 space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
                        <ListCheck size={32} />
                    </div>
                    <div className="space-y-1">
                        <h3 className="text-base font-bold text-slate-900 dark:text-white">No Trading Tasks Found</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto font-medium">
                            Create your first trade-log assignment to start coaching students on stop-loss rules and order execution discipline.
                        </p>
                    </div>
                    <button
                        onClick={() => {
                            setEditingItem(null);
                            setModalOpen(true);
                        }}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-600/20 transition"
                    >
                        <Plus size={15} /> Create Trading Task
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {filtered.map((a) => {
                        const assetBadge = ASSET_BADGES[a.target_asset_class] || ASSET_BADGES.EQUITY;
                        return (
                            <div
                                key={a.id}
                                className="p-6 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200 flex flex-col justify-between shadow-sm space-y-4 group"
                            >
                                <div className="space-y-3.5">
                                    <div className="flex items-center justify-between gap-2">
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
                                        <span className="text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400">
                                            Pass: {a.pass_score}%
                                        </span>
                                    </div>

                                    <div>
                                        <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white line-clamp-1 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition">
                                            {a.title}
                                        </h3>
                                        {a.description && (
                                            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1 font-normal">
                                                {a.description}
                                            </p>
                                        )}
                                    </div>

                                    {/* Rules summary chips */}
                                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-semibold">
                                            {a.min_trades} Trade{a.min_trades > 1 ? 's' : ''} Min
                                        </span>
                                        {a.require_stop_loss && (
                                            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/20">
                                                SL {a.max_sl_percent ? `≤ ${a.max_sl_percent}%` : 'Required'}
                                            </span>
                                        )}
                                        {a.require_take_profit && (
                                            <span className="px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold border border-indigo-500/20">
                                                RR {a.min_risk_reward_ratio ? `≥ ${a.min_risk_reward_ratio}:1` : 'Required'}
                                            </span>
                                        )}
                                        {a.target_symbols?.length > 0 && (
                                            <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 font-mono font-bold border border-amber-500/20">
                                                {a.target_symbols.slice(0, 2).join(', ')}
                                                {a.target_symbols.length > 2 ? ` +${a.target_symbols.length - 2}` : ''}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Bottom actions and submissions stat */}
                                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                        <span className="font-extrabold text-slate-900 dark:text-white">
                                            {a.stats?.passed_count || 0}
                                        </span>{' '}
                                        / {a.stats?.total_submissions || 0} Passed
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setInspectDrawerId(a.id)}
                                            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition flex items-center gap-1 border border-emerald-500/20"
                                        >
                                            Inspect <ChevronRight size={13} />
                                        </button>
                                        <button
                                            onClick={() => {
                                                setEditingItem(a);
                                                setModalOpen(true);
                                            }}
                                            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                                            title="Edit Task"
                                        >
                                            <Edit3 size={15} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(a.id, a.title)}
                                            className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-500/10 transition"
                                            title="Delete Task"
                                        >
                                            <Trash2 size={15} />
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
