import React from 'react';
import { AlertTriangle, Clock, ShieldCheck, Info } from 'lucide-react';

/**
 * ComplianceBand (CMP-001) — Document 06 Screen 1
 * Persistent, non-dismissible statutory disclaimer band directly below top bar.
 */
export default function ComplianceBand({
    mode = 'REPLAY SESSION',
    sessionDate = '12 Jan 2026',
    lagDays = 52,
    disclaimer = 'Virtual money only · Not investment advice · SEBI Compliant Paper Environment',
}) {
    return (
        <div className="w-full bg-amber-500/10 dark:bg-amber-950/40 border-b border-amber-500/25 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
            <div className="flex items-center gap-2.5 flex-wrap">
                <span className="flex items-center gap-1.5 font-mono font-extrabold uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-800 dark:text-amber-300 tracking-wider text-[10px]">
                    <AlertTriangle size={12} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
                    {mode}
                </span>

                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                    <span className="flex items-center gap-1 font-mono">
                        <Clock size={12} className="text-slate-400" />
                        <span className="font-semibold">{sessionDate}</span>
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="font-mono font-bold text-amber-700 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded text-[11px]">
                        Lag: {lagDays} days
                    </span>
                </div>
            </div>

            <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400 text-[11px]">
                <span className="hidden md:inline-flex items-center gap-1.5 font-medium">
                    <ShieldCheck size={13} className="text-emerald-600 dark:text-emerald-400" />
                    <span>{disclaimer}</span>
                </span>
                <span className="md:hidden font-medium">Virtual simulation</span>
            </div>
        </div>
    );
}
