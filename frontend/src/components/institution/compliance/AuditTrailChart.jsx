import React from 'react';
import { BarChart3, CheckCircle2 } from 'lucide-react';
import { cn } from '../../../utils/cn';

export default function AuditTrailChart({ data, isLoading }) {
    if (isLoading || !data) {
        return <div className="h-64 rounded-xl bg-surface-900/70 border border-edge/10 animate-pulse" />;
    }

    const {
        period = "14 days",
        daily_volume = [],
        records_written_today = "0",
        chain_head_published = "0x00",
        integrity_check = "PASS",
        retention = "8 years · WORM",
    } = data;

    const maxVol = Math.max(...daily_volume.map((d) => d.volume), 10);

    return (
        <div className="rounded-xl bg-surface-900 border border-edge/15 p-4 flex flex-col justify-between shadow-sm">
            <div>
                {/* Header */}
                <div className="flex items-center justify-between pb-3 border-b border-edge/10">
                    <div className="flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-blue-500" />
                        <h3 className="text-sm font-bold text-heading">
                            Audit trail <span className="text-xs font-normal text-slate-500 dark:text-slate-400">— {period}</span>
                        </h3>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                        WORM LOGGING
                    </span>
                </div>

                {/* 14-day Bar Chart */}
                <div className="h-28 flex items-end gap-1.5 pt-4 pb-2 px-1">
                    {daily_volume.map((item, idx) => {
                        const heightPct = Math.max(8, (item.volume / maxVol) * 100);
                        const isLatest = idx === daily_volume.length - 1;

                        return (
                            <div
                                key={item.date || idx}
                                className="flex-1 flex flex-col items-center gap-1 group relative h-full justify-end"
                            >
                                {/* Tooltip */}
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 px-1.5 py-0.5 rounded bg-surface-800 text-[9px] font-mono text-heading pointer-events-none whitespace-nowrap shadow-md z-10 border border-edge/10">
                                    {item.day}: {item.volume} events
                                </div>

                                <div
                                    className={cn(
                                        "w-full rounded-t transition-all duration-300",
                                        isLatest
                                            ? "bg-primary-500"
                                            : "bg-blue-500/60 hover:bg-blue-500/80"
                                    )}
                                    style={{ height: `${heightPct}%` }}
                                />
                            </div>
                        );
                    })}
                </div>

                {/* Days axis labels */}
                <div className="flex items-center justify-between text-[9px] font-mono text-slate-500 dark:text-slate-400 px-1 border-t border-edge/5 pt-1">
                    <span>{daily_volume[0]?.day || "14d ago"}</span>
                    <span>Today</span>
                </div>
            </div>

            {/* Audit Status Row */}
            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-edge/10 mt-3 text-xs">
                <div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono block">Records written today</span>
                    <span className="font-mono font-bold text-heading text-[12px]">{records_written_today}</span>
                </div>
                <div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono block">Chain head</span>
                    <span className="font-mono font-medium text-slate-700 dark:text-slate-300 text-[11px] truncate block">{chain_head_published}</span>
                </div>
                <div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono block">Integrity check</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-[11px] flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> {integrity_check}
                    </span>
                </div>
                <div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono block">Retention</span>
                    <span className="font-mono font-medium text-slate-700 dark:text-slate-300 text-[11px]">{retention}</span>
                </div>
            </div>
        </div>
    );
}
