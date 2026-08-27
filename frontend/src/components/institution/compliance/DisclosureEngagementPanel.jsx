import React from 'react';
import { FileCheck2 } from 'lucide-react';
import { cn } from '../../../utils/cn';

export default function DisclosureEngagementPanel({ data, isLoading }) {
    if (isLoading || !data) {
        return <div className="h-64 rounded-xl bg-surface-900/70 border border-edge/10 animate-pulse" />;
    }

    const { disclosures = [], regulatory_register = [] } = data;

    return (
        <div className="rounded-xl bg-surface-900 border border-edge/15 p-4 flex flex-col justify-between shadow-sm">
            <div>
                {/* Header */}
                <div className="flex items-center justify-between pb-3 border-b border-edge/10">
                    <div className="flex items-center gap-2">
                        <FileCheck2 className="w-4 h-4 text-emerald-500" />
                        <h3 className="text-sm font-bold text-heading">
                            Disclosure & engagement
                        </h3>
                    </div>
                </div>

                {/* Disclosures Progress Bars */}
                <div className="space-y-3 mt-3">
                    {disclosures.map((d, idx) => (
                        <div key={d.title || idx} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-700 dark:text-slate-300 font-medium truncate max-w-[200px]">
                                    {d.title}
                                </span>
                                <span className="font-mono font-bold text-heading text-[11px]">
                                    {d.count} of {d.total}
                                </span>
                            </div>
                            <div className="h-1.5 w-full bg-surface-800 rounded-full overflow-hidden">
                                <div
                                    className={cn(
                                        "h-full rounded-full transition-all duration-300",
                                        d.color === 'blue' ? "bg-blue-500" : "bg-emerald-500"
                                    )}
                                    style={{ width: `${d.percentage}%` }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Regulatory Register Sub-panel */}
            <div className="pt-3 border-t border-edge/10 mt-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-mono block mb-2">
                    REGULATORY REGISTER
                </span>
                <div className="space-y-1.5 text-xs font-mono">
                    {regulatory_register.map((r) => (
                        <div key={r.code} className="flex items-center justify-between py-0.5">
                            <div className="flex items-center gap-2">
                                <span className={cn(
                                    "w-1.5 h-1.5 rounded-full",
                                    r.badge === 'amber' ? "bg-amber-500" : "bg-emerald-500"
                                )} />
                                <span className="text-slate-700 dark:text-slate-300 text-[11px]">{r.code} · {r.title}</span>
                            </div>
                            <span className={cn(
                                "text-[10px]",
                                r.badge === 'amber' ? "text-amber-500 font-semibold" : "text-slate-500 dark:text-slate-400"
                            )}>
                                {r.status}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
