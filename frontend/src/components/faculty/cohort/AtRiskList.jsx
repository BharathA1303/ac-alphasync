import React from 'react';
import { AlertTriangle, ChevronRight, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../../utils/cn';

export default function AtRiskList({ data, isLoading }) {
    const navigate = useNavigate();

    if (isLoading || !data) {
        return (
            <div className="rounded-xl bg-surface-900/70 border border-edge/10 p-4 h-64 animate-pulse" />
        );
    }

    const { learners = [], flagged_count = 0 } = data;

    return (
        <div className="rounded-xl bg-surface-900/70 border border-edge/10 p-4 shadow-sm flex flex-col justify-between">
            <div>
                <div className="flex items-center justify-between pb-2.5 border-b border-edge/10">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-500" />
                        <h3 className="text-sm font-bold text-heading">
                            At-risk learners
                        </h3>
                    </div>
                    <span className="text-[10px] font-bold text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                        {flagged_count} FLAGGED
                    </span>
                </div>

                {/* Learner List */}
                <div className="divide-y divide-edge/5 mt-1">
                    {learners.map((st) => (
                        <div
                            key={st.id}
                            className="py-2.5 flex items-center justify-between gap-2 hover:bg-surface-800/30 transition-colors rounded-lg px-1.5"
                        >
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className={cn(
                                    "w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold uppercase text-white flex-shrink-0 shadow-sm",
                                    st.severity === 'HIGH' ? "bg-rose-600" : "bg-amber-600"
                                )}>
                                    {st.avatar_initials}
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-bold text-heading truncate">
                                            {st.name}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-gray-400 font-sans truncate max-w-[200px] mt-0.5">
                                        {st.diagnostic_tag}
                                    </p>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => navigate(st.decision_replay_url || '/terminal')}
                                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold bg-surface-800 hover:bg-surface-700 text-gray-300 hover:text-heading border border-edge/10 transition-colors flex-shrink-0"
                                title="Inspect student execution & decision replay"
                            >
                                <Eye className="w-3 h-3 text-primary-500" />
                                Review
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            <div className="pt-2 text-[10px] text-gray-500 border-t border-edge/10 mt-2">
                Automated diagnoses connect to Module 15 (Risk Management) decision logs.
            </div>
        </div>
    );
}
