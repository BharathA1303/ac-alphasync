import React, { useState } from 'react';
import { X, Target, CheckCircle2, AlertCircle, Calendar, Send } from 'lucide-react';
import api from '../../../services/api';
import toast from 'react-hot-toast';

export default function RemediationModal({ isOpen, onClose, weakConcepts = [], onSuccess }) {
    const [selectedConcepts, setSelectedConcepts] = useState(
        weakConcepts.map(c => c.concept)
    );
    const [dueDays, setDueDays] = useState(3);
    const [targetScore, setTargetScore] = useState(80);
    const [submitting, setSubmitting] = useState(false);

    if (!isOpen) return null;

    const toggleConcept = (concept) => {
        if (selectedConcepts.includes(concept)) {
            setSelectedConcepts(selectedConcepts.filter(c => c !== concept));
        } else {
            setSelectedConcepts([...selectedConcepts, concept]);
        }
    };

    const handleDispatch = async (e) => {
        e.preventDefault();
        if (selectedConcepts.length === 0) {
            toast.error('Please select at least one concept to reinforce.');
            return;
        }

        try {
            setSubmitting(true);
            const res = await api.post('/faculty/cohort/assign-remediation', {
                concept_names: selectedConcepts,
                due_in_days: dueDays,
                target_score: targetScore,
            });

            toast.success(res.data?.message || 'Remedial task dispatched to cohort!');
            onSuccess?.();
            onClose();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to dispatch remediation task.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="relative w-full max-w-lg rounded-2xl bg-surface-900 border border-edge/20 shadow-2xl p-6 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between pb-4 border-b border-edge/10">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
                            <Target className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-heading">
                                Assign Cohort Remediation
                            </h3>
                            <p className="text-xs text-gray-400">
                                Target diagnosed concept gaps with a reinforced trading exercise.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1 rounded-lg text-gray-400 hover:text-heading hover:bg-surface-800 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleDispatch} className="space-y-4 mt-4">
                    {/* Concept Selection */}
                    <div>
                        <label className="block text-xs font-bold uppercase text-gray-400 mb-2">
                            Select Concepts to Reinforce
                        </label>
                        <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                            {weakConcepts.map((c) => {
                                const checked = selectedConcepts.includes(c.concept);
                                return (
                                    <div
                                        key={c.id || c.concept}
                                        onClick={() => toggleConcept(c.concept)}
                                        className={`flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                                            checked
                                                ? 'bg-amber-500/10 border-amber-500/30 text-heading font-semibold'
                                                : 'bg-surface-800/40 border-edge/10 text-gray-400 hover:bg-surface-800'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => {}}
                                                className="rounded border-edge text-primary-500 focus:ring-0"
                                            />
                                            <span>{c.concept}</span>
                                        </div>
                                        <span className="font-mono text-amber-500 text-[11px]">
                                            {c.mastery_percent}% Mastery
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Due Date & Pass Score Controls */}
                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <div>
                            <label className="block text-xs font-semibold text-gray-400 mb-1">
                                Due In (Days)
                            </label>
                            <input
                                type="number"
                                min={1}
                                max={14}
                                value={dueDays}
                                onChange={(e) => setDueDays(parseInt(e.target.value) || 3)}
                                className="w-full px-3 py-2 rounded-lg bg-surface-800 border border-edge/10 text-heading text-xs font-mono focus:border-primary-500 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-400 mb-1">
                                Target Pass Score (%)
                            </label>
                            <input
                                type="number"
                                min={50}
                                max={100}
                                value={targetScore}
                                onChange={(e) => setTargetScore(parseInt(e.target.value) || 80)}
                                className="w-full px-3 py-2 rounded-lg bg-surface-800 border border-edge/10 text-heading text-xs font-mono focus:border-primary-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-edge/10">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-heading hover:bg-surface-800 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-primary-500 hover:bg-primary-400 text-slate-950 transition-all shadow-md active:scale-95 disabled:opacity-50"
                        >
                            <Send className="w-3.5 h-3.5" />
                            {submitting ? 'Dispatching...' : 'Dispatch Remediation'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
