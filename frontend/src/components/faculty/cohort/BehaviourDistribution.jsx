import React from 'react';
import { Activity, ShieldCheck, TrendingDown, Scale } from 'lucide-react';
import { cn } from '../../../utils/cn';

export default function BehaviourDistribution({ data, isLoading }) {
    if (isLoading || !data) {
        return (
            <div className="rounded-xl bg-surface-900/70 border border-edge/10 p-4 h-48 animate-pulse" />
        );
    }

    const { benchmarks = [], total_cohort = 62 } = data;

    return (
        <div className="rounded-xl bg-surface-900/70 border border-edge/10 p-4 shadow-sm flex flex-col justify-between">
            <div>
                <div className="flex items-center justify-between pb-2.5 border-b border-edge/10">
                    <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-primary-500" />
                        <h3 className="text-sm font-bold text-heading">
                            Behaviour distribution
                        </h3>
                    </div>
                    <span className="text-[10px] font-mono text-gray-400">
                        {total_cohort} learners assessed
                    </span>
                </div>

                {/* Benchmark Bars */}
                <div className="space-y-3 mt-3">
                    {benchmarks.map((b) => {
                        const isWarning = b.color === 'rose' || b.color === 'amber';

                        return (
                            <div key={b.id} className="space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-300 font-medium truncate max-w-[220px]">
                                        {b.title}
                                    </span>
                                    <span className="font-mono font-bold text-heading text-[11px]">
                                        {b.count} of {b.total}
                                    </span>
                                </div>
                                <div className="h-1.5 w-full bg-surface-800 rounded-full overflow-hidden">
                                    <div
                                        className={cn(
                                            "h-full rounded-full transition-all duration-300",
                                            b.color === 'emerald' ? "bg-emerald-500" :
                                            b.color === 'blue' ? "bg-blue-500" :
                                            b.color === 'amber' ? "bg-amber-500" : "bg-rose-500"
                                        )}
                                        style={{ width: `${b.percentage}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="pt-2 text-[10px] text-gray-500 border-t border-edge/10 mt-3 flex items-center justify-between">
                <span>SEBI NISM aligned simulation heuristics</span>
                <span className="text-emerald-500 font-semibold">Active Monitoring</span>
            </div>
        </div>
    );
}
