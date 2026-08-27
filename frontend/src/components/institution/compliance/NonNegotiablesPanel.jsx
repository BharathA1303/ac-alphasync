import React from 'react';
import { CheckCircle2, Shield } from 'lucide-react';
import { cn } from '../../../utils/cn';

export default function NonNegotiablesPanel({ data, isLoading }) {
    if (isLoading || !data) {
        return <div className="h-64 rounded-xl bg-surface-900/70 border border-edge/10 animate-pulse" />;
    }

    const { gates = [] } = data;

    return (
        <div className="rounded-xl bg-surface-900 border border-edge/15 p-4 flex flex-col justify-between shadow-sm">
            <div>
                {/* Header */}
                <div className="flex items-center justify-between pb-3 border-b border-edge/10">
                    <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-emerald-500" />
                        <h3 className="text-sm font-bold text-heading">
                            Architectural non-negotiables
                        </h3>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        ENFORCED
                    </span>
                </div>

                {/* Gates List */}
                <div className="divide-y divide-edge/5 mt-1">
                    {gates.map((g) => (
                        <div
                            key={g.id}
                            className="py-2.5 flex items-center justify-between gap-2 text-xs"
                        >
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-[11px] w-6 flex-shrink-0">
                                    {g.id}
                                </span>
                                <span className="text-slate-700 dark:text-slate-300 font-medium truncate">
                                    {g.title}
                                </span>
                            </div>

                            <div className="flex items-center gap-3 flex-shrink-0">
                                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                                    {g.mechanism}
                                </span>
                                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                                    <CheckCircle2 className="w-3 h-3" />
                                    {g.status}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-edge/10 mt-2 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    All 11 gates passing on main
                </div>
            </div>
        </div>
    );
}
