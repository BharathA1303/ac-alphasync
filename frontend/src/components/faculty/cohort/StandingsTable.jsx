import React from 'react';
import { Award, AlertCircle, ShieldAlert, TrendingUp, TrendingDown, Info } from 'lucide-react';
import { cn } from '../../../utils/cn';

export default function StandingsTable({ data, isLoading }) {
    if (isLoading || !data) {
        return (
            <div className="rounded-xl bg-surface-900/70 border border-edge/10 p-4 h-80 animate-pulse" />
        );
    }

    const { standings = [], reward_badge, insight_banner } = data;

    return (
        <div className="rounded-xl bg-surface-900/70 border border-edge/10 p-4 flex flex-col justify-between shadow-sm">
            {/* Header & Reward Badge */}
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-edge/10">
                <div>
                    <h3 className="text-sm font-bold text-heading">
                        Standings <span className="text-xs font-normal text-gray-400">— ranked on process-weighted score</span>
                    </h3>
                </div>
                {reward_badge && (
                    <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black tracking-wider uppercase bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20"
                        title={reward_badge.compliance_note}
                    >
                        <Award className="w-3.5 h-3.5" />
                        {reward_badge.label}
                    </span>
                )}
            </div>

            {/* Standings Table */}
            <div className="overflow-x-auto mt-2">
                <table className="w-full text-left text-xs font-mono">
                    <thead>
                        <tr className="border-b border-edge/10 text-[10px] uppercase font-bold text-gray-500">
                            <th className="py-2 px-2 text-center w-8">#</th>
                            <th className="py-2 px-2 font-sans">Learner</th>
                            <th className="py-2 px-2 text-right">Return</th>
                            <th className="py-2 px-2 text-right">Sharpe</th>
                            <th className="py-2 px-2 text-right">Max DD</th>
                            <th className="py-2 px-2 text-right">Trades</th>
                            <th className="py-2 px-2 text-right">SL Use</th>
                            <th className="py-2 px-2 text-right">Mastery</th>
                            <th className="py-2 px-2 text-right font-black text-primary-500">Process</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-edge/5">
                        {standings.slice(0, 5).map((s) => {
                            const isPositive = s.return_pct >= 0;
                            const isHighRisk = s.process_score < 50;

                            return (
                                <tr
                                    key={s.student_id || s.rank}
                                    className={cn(
                                        "hover:bg-surface-800/40 transition-colors",
                                        isHighRisk && "bg-rose-500/[0.04]"
                                    )}
                                >
                                    <td className="py-2 px-2 text-center font-bold text-gray-400">
                                        {s.rank}
                                    </td>
                                    <td className="py-2 px-2 font-sans font-medium text-heading">
                                        <div className="truncate max-w-[130px]" title={s.email}>
                                            {s.name}
                                        </div>
                                    </td>
                                    <td className={cn(
                                        "py-2 px-2 text-right font-bold tabular-nums",
                                        isPositive ? "text-emerald-500 dark:text-emerald-400" : "text-rose-500 dark:text-rose-400"
                                    )}>
                                        {isPositive ? `+${s.return_pct.toFixed(2)}%` : `${s.return_pct.toFixed(2)}%`}
                                    </td>
                                    <td className="py-2 px-2 text-right text-gray-300 tabular-nums">
                                        {s.sharpe_ratio.toFixed(2)}
                                    </td>
                                    <td className="py-2 px-2 text-right text-rose-400 tabular-nums">
                                        {s.max_drawdown_pct.toFixed(1)}%
                                    </td>
                                    <td className="py-2 px-2 text-right text-gray-300 tabular-nums">
                                        {s.trades_count}
                                    </td>
                                    <td className={cn(
                                        "py-2 px-2 text-right font-semibold tabular-nums",
                                        s.stop_loss_usage_pct >= 80 ? "text-emerald-400" :
                                        s.stop_loss_usage_pct >= 50 ? "text-amber-400" : "text-rose-400"
                                    )}>
                                        {s.stop_loss_usage_pct.toFixed(0)}%
                                    </td>
                                    <td className="py-2 px-2 text-right text-gray-300 tabular-nums">
                                        {s.mastery_score.toFixed(0)}
                                    </td>
                                    <td className="py-2 px-2 text-right font-black text-heading tabular-nums">
                                        <span className={cn(
                                            "px-1.5 py-0.5 rounded text-[11px]",
                                            s.process_score >= 80 ? "bg-emerald-500/10 text-emerald-400" :
                                            s.process_score >= 60 ? "bg-blue-500/10 text-blue-400" :
                                            "bg-rose-500/10 text-rose-400 font-bold"
                                        )}>
                                            {s.process_score.toFixed(1)}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Pedagogical Process-Score Insight Banner (ASM-002) */}
            {insight_banner && (
                <div className="mt-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-start gap-2 text-xs">
                    <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <p className="leading-relaxed font-sans font-medium text-[11px]">
                        {insight_banner.description}
                    </p>
                </div>
            )}
        </div>
    );
}
