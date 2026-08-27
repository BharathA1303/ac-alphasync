import React from 'react';
import { Target, ArrowRight, AlertCircle, PlusCircle } from 'lucide-react';
import { cn } from '../../../utils/cn';

export default function WeakConceptList({ data, onOpenRemediationModal, isLoading }) {
    if (isLoading || !data) {
        return (
            <div className="rounded-xl bg-surface-900/70 border border-edge/10 p-4 h-48 animate-pulse" />
        );
    }

    const { weak_concepts = [] } = data;

    return (
        <div className="rounded-xl bg-surface-900/70 border border-edge/10 p-4 shadow-sm flex flex-col justify-between">
            <div>
                <div className="flex items-center justify-between pb-2.5 border-b border-edge/10">
                    <div className="flex items-center gap-2">
                        <Target className="w-4 h-4 text-amber-500" />
                        <h3 className="text-sm font-bold text-heading">
                            Weakest areas across cohort
                        </h3>
                    </div>
                    <span className="text-[10px] font-semibold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        REMEDIAL FOCUS
                    </span>
                </div>

                {/* Concept List */}
                <div className="space-y-2.5 mt-3">
                    {weak_concepts.length > 0 ? (
                        weak_concepts.map((item) => (
                            <div key={item.id} className="space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="font-semibold text-heading truncate max-w-[180px]">
                                        {item.concept}
                                    </span>
                                    <span className="font-mono font-bold text-amber-500 dark:text-amber-400">
                                        {item.mastery_percent}%
                                    </span>
                                </div>
                                <div className="h-1.5 w-full bg-surface-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-amber-500 rounded-full transition-all duration-300"
                                        style={{ width: `${item.mastery_percent}%` }}
                                    />
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="py-6 text-center text-xs text-gray-400">
                            No concept deficiencies identified yet.
                        </div>
                    )}
                </div>
            </div>

            {/* Action CTA */}
            <div className="mt-4 pt-3 border-t border-edge/10">
                <button
                    type="button"
                    onClick={onOpenRemediationModal}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold bg-primary-500 hover:bg-primary-400 text-slate-950 transition-all shadow-sm active:scale-[0.98]"
                >
                    <PlusCircle className="w-3.5 h-3.5" />
                    Assign remediation
                </button>
            </div>
        </div>
    );
}
