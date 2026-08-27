import React from 'react';
import { Bot, ShieldCheck } from 'lucide-react';
import { cn } from '../../../utils/cn';

export default function AiGuardrailPanel({ data, isLoading }) {
    if (isLoading || !data) {
        return <div className="h-64 rounded-xl bg-surface-900/70 border border-edge/10 animate-pulse" />;
    }

    const {
        advisory_responses_reaching_learner = 0,
        period_days = 30,
        metrics = {},
    } = data;

    return (
        <div className="rounded-xl bg-surface-900 border border-edge/15 p-4 flex flex-col justify-between shadow-sm">
            <div>
                {/* Header */}
                <div className="flex items-center justify-between pb-3 border-b border-edge/10">
                    <div className="flex items-center gap-2">
                        <Bot className="w-4 h-4 text-purple-500" />
                        <h3 className="text-sm font-bold text-heading">
                            AI mentor guardrail
                        </h3>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                        NO ADVICE
                    </span>
                </div>

                {/* Circular Gauge + Hero Count */}
                <div className="flex items-center gap-4 mt-3">
                    <div className="relative w-16 h-16 rounded-full border-4 border-emerald-500/80 flex items-center justify-center bg-emerald-500/5 flex-shrink-0 shadow-inner">
                        <span className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                            {advisory_responses_reaching_learner}
                        </span>
                    </div>
                    <div>
                        <span className="text-xs font-bold text-heading leading-tight block">
                            Advisory responses reaching a learner
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5 block">
                            in the last {period_days} days
                        </span>
                    </div>
                </div>

                {/* Metrics Breakdown */}
                <div className="divide-y divide-edge/5 mt-4 text-xs font-sans">
                    <div className="py-1.5 flex items-center justify-between">
                        <span className="text-slate-500 dark:text-slate-400 text-[11px]">Responses generated</span>
                        <span className="font-mono font-bold text-heading text-[11px]">{metrics.responses_generated?.toLocaleString() || "0"}</span>
                    </div>
                    <div className="py-1.5 flex items-center justify-between">
                        <span className="text-slate-500 dark:text-slate-400 text-[11px]">Blocked by classifier</span>
                        <span className="font-mono font-bold text-amber-500 text-[11px]">{metrics.blocked_by_classifier || 0}</span>
                    </div>
                    <div className="py-1.5 flex items-center justify-between">
                        <span className="text-slate-500 dark:text-slate-400 text-[11px]">Refused as prompt injection</span>
                        <span className="font-mono font-bold text-rose-500 text-[11px]">{metrics.refused_as_prompt_injection || 0}</span>
                    </div>
                    <div className="py-1.5 flex items-center justify-between">
                        <span className="text-slate-500 dark:text-slate-400 text-[11px]">Mandatory audit sample</span>
                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-[11px]">{metrics.mandatory_audit_sample || "100%"}</span>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="pt-2.5 border-t border-edge/10 mt-2 flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400">
                <span>Adversarial audits</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">{metrics.adversarial_audits || "0 findings"}</span>
            </div>
        </div>
    );
}
