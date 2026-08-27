import React from 'react';
import { cn } from '../../../utils/cn';

export default function MasteryHeatmap({ data, isLoading }) {
    if (isLoading || !data) {
        return (
            <div className="rounded-xl bg-surface-900/70 border border-edge/10 p-4 h-64 animate-pulse" />
        );
    }

    const { modules = [], matrix = [] } = data;

    // Helper to get color intensity based on score
    const getCellColor = (score) => {
        if (score >= 80) return "bg-primary-500/80 text-white font-bold";
        if (score >= 65) return "bg-primary-600/50 text-slate-100";
        if (score >= 50) return "bg-primary-800/40 text-slate-300";
        if (score >= 35) return "bg-surface-800/80 text-gray-400";
        return "bg-rose-950/40 text-rose-300";
    };

    return (
        <div className="rounded-xl bg-surface-900/70 border border-edge/10 p-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-edge/10">
                <h3 className="text-sm font-bold text-heading">
                    Cohort mastery by module
                </h3>
                <span className="text-[10px] font-mono text-gray-400">
                    {modules.length} NISM modules mapped
                </span>
            </div>

            {/* Heatmap Grid */}
            <div className="overflow-x-auto mt-3">
                <table className="w-full text-center border-collapse">
                    <thead>
                        <tr>
                            <th className="p-1 text-left text-[10px] font-bold uppercase text-gray-500 w-20">Quartile</th>
                            {modules.map((m) => (
                                <th
                                    key={m.code}
                                    className="p-1 text-[9px] font-mono font-bold text-gray-400 hover:text-primary-400 transition-colors"
                                    title={`${m.code}: ${m.name}`}
                                >
                                    {m.code}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-edge/5">
                        {matrix.map((row) => (
                            <tr key={row.quartile}>
                                <td className="p-1.5 text-left text-[10px] font-semibold text-gray-300 whitespace-nowrap">
                                    {row.quartile}
                                </td>
                                {row.scores.map((sc, idx) => (
                                    <td key={idx} className="p-0.5">
                                        <div
                                            className={cn(
                                                "h-6 w-full min-w-[28px] rounded flex items-center justify-center text-[10px] font-mono transition-transform hover:scale-105 cursor-default select-none",
                                                getCellColor(sc.score_percent)
                                            )}
                                            title={`${sc.module_code} (${sc.module_short}): ${sc.score_percent}% in ${row.quartile}`}
                                        >
                                            {sc.score_percent}
                                        </div>
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Legend */}
            <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-edge/10 text-[10px] text-gray-500">
                <span>Quartile distribution across active cohorts</span>
                <div className="flex items-center gap-1.5">
                    <span>Lower</span>
                    <div className="flex items-center gap-0.5">
                        <div className="w-3 h-3 rounded-sm bg-rose-950/40" />
                        <div className="w-3 h-3 rounded-sm bg-surface-800/80" />
                        <div className="w-3 h-3 rounded-sm bg-primary-800/40" />
                        <div className="w-3 h-3 rounded-sm bg-primary-600/50" />
                        <div className="w-3 h-3 rounded-sm bg-primary-500/80" />
                    </div>
                    <span>Higher</span>
                </div>
            </div>
        </div>
    );
}
