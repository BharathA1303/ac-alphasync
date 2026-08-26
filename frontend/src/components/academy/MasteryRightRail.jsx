import React, { useState } from 'react';
import { Bot, ChevronRight, HelpCircle, Send, ShieldAlert, Sparkles, TrendingUp, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import MasteryRing from './MasteryRing';

export default function MasteryRightRail({
    overallMastery = 30,
    pointsDelta = '+8 pts this week',
    completedCount = 4,
    totalCount = 16,
    weakConcepts = [],
    behaviourSummary = null,
}) {
    const navigate = useNavigate();
    const [mentorPrompt, setMentorPrompt] = useState('');

    const handleSendMentor = (e) => {
        e?.preventDefault();
        if (!mentorPrompt.trim()) return;
        navigate('/mentor', { state: { initialPrompt: mentorPrompt } });
    };

    return (
        <div className="space-y-6">
            {/* 1. Overall Concept Mastery */}
            <div className="p-6 rounded-3xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Concept Mastery
                    </h3>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        {pointsDelta}
                    </span>
                </div>

                <div className="flex items-center gap-5">
                    <MasteryRing pct={overallMastery} size={64} strokeWidth={5} color="#00bcd4" />
                    <div>
                        <div className="text-sm font-bold text-slate-900 dark:text-white">
                            Overall Mastery
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {completedCount} of {totalCount} modules mastered
                        </p>
                        <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-primary-600 dark:text-primary-400">
                            <Sparkles size={13} />
                            <span>Aligned with SEBI NISM standards</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. Weakest Concepts (Diagnostic) */}
            <div className="p-6 rounded-3xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-sm space-y-3.5">
                <div className="flex items-center justify-between">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Weakest Concepts
                    </h3>
                    <span className="text-[10px] font-mono text-slate-400">Remedial Focus</span>
                </div>

                <div className="space-y-2.5">
                    {weakConcepts.map((item, idx) => (
                        <div key={idx} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-slate-800 dark:text-slate-200">
                                    {item.name}
                                </span>
                                <span className="font-mono text-[11px] font-bold text-amber-600 dark:text-amber-400">
                                    {item.mastery}%
                                </span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-amber-500 transition-all duration-500"
                                    style={{ width: `${item.mastery}%` }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* 3. Simulator Behaviour Panel (Document 06 §3.2 - Diagnostic & Neutral) */}
            <div className="p-6 rounded-3xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Simulator Behaviour
                    </h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                        Diagnostic
                    </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800">
                        <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                            Stop-loss usage
                        </span>
                        <span className="text-base font-extrabold font-mono text-slate-900 dark:text-white">
                            {behaviourSummary?.stop_loss_usage_pct || 72}%
                        </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800">
                        <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                            Avg pos duration
                        </span>
                        <span className="text-base font-extrabold font-mono text-slate-900 dark:text-white">
                            {behaviourSummary?.avg_position_duration || '18h'}
                        </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800">
                        <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                            Trades / session
                        </span>
                        <span className="text-base font-extrabold font-mono text-slate-900 dark:text-white">
                            {behaviourSummary?.trades_per_session || 3.4}
                        </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                        <span className="text-[10px] font-mono uppercase text-amber-700 dark:text-amber-300 block mb-1">
                            Hold losers longer
                        </span>
                        <span className="text-base font-extrabold font-mono text-amber-600 dark:text-amber-400">
                            {behaviourSummary?.loss_holding_multiplier || 2.3}×
                        </span>
                    </div>
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                    Diagnostic feedback connects Module 15 (Risk Management) to your simulated executions.
                </p>
            </div>

            {/* 4. AI Mentor Entry Point with Mandatory Standing Caption (Document 06 §3.2) */}
            <div className="p-6 rounded-3xl bg-white dark:bg-[#111827] border border-primary-500/30 shadow-sm space-y-3.5">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-primary-500/15 text-primary-600 dark:text-primary-400 flex items-center justify-center">
                        <Bot size={14} />
                    </div>
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
                        AI Market Mentor
                    </h3>
                </div>

                <form onSubmit={handleSendMentor} className="relative">
                    <input
                        type="text"
                        value={mentorPrompt}
                        onChange={(e) => setMentorPrompt(e.target.value)}
                        placeholder="Ask about Nifty divisor, circuit bands, impact cost..."
                        className="w-full pl-3 pr-10 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-primary-500 transition-colors"
                    />
                    <button
                        type="submit"
                        disabled={!mentorPrompt.trim()}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-40 text-white flex items-center justify-center transition-colors shadow-sm"
                    >
                        <Send size={12} />
                    </button>
                </form>

                {/* Mandatory Standing Caption (Document 06 §3.2) */}
                <div className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0" />
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 italic">
                        "The mentor explains history — it never forecasts a price"
                    </p>
                </div>
            </div>
        </div>
    );
}
