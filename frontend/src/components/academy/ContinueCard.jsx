import React from 'react';
import { BookOpen, ChevronRight, Play, ExternalLink, Activity, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function ContinueCard({
    item,
    isFacultyMode,
    onStartOrResume,
}) {
    const navigate = useNavigate();

    if (!item) return null;

    const isFacultyCourse = !!item.created_at || isFacultyMode;
    const title = item.title;
    const tag = item.tag || (isFacultyCourse ? 'FACULTY' : 'CAPITAL MARKETS');
    const code = item.code || (isFacultyCourse ? `STEP ${item.step || 1}` : 'MODULE');
    const progressPct = item.progress_pct !== undefined ? item.progress_pct : (
        item.lesson_count > 0 ? Math.round((item.lessons_completed / item.lesson_count) * 100) : 0
    );

    const description = item.description || (
        isFacultyCourse
            ? `${item.lesson_count || 1} lesson(s) · ${item.assessment_count || 1} assessment(s)`
            : 'Structured syllabus covering fundamental theory, market microstructure & compliance.'
    );

    const evidenceBeat = item.evidence_beat || (
        !isFacultyCourse
            ? 'Verify the Nifty 50 divisor and index weight adjustment on event-day execution.'
            : null
    );

    const handleJumpToTerminal = () => {
        navigate('/terminal');
    };

    return (
        <div className="rounded-3xl bg-white dark:bg-[#111827] border-2 border-primary-500/40 shadow-xl overflow-hidden transition-all space-y-0">
            {/* Top Main Hero */}
            <div className="p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 bg-primary-500/15 text-primary-600 dark:text-primary-400 border border-primary-500/30 shadow-md">
                        <BookOpen size={26} />
                    </div>

                    <div className="flex-1 min-w-0">
                        {/* Tag Bar */}
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <span className="text-[10px] font-mono font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-md bg-primary-500/15 text-primary-600 dark:text-primary-400 border border-primary-500/20">
                                CONTINUE — {code} · {tag}
                            </span>
                            {progressPct >= 100 && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                    ✓ Completed
                                </span>
                            )}
                        </div>

                        {/* Title & Description */}
                        <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white truncate">
                            {title}
                        </h3>
                        <p className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                            {description}
                        </p>

                        {/* Progress Bar & Subtext */}
                        <div className="flex items-center gap-4 mt-4 flex-wrap">
                            <div className="w-48 sm:w-64 h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                <div
                                    className="h-full bg-primary-500 rounded-full transition-all duration-500"
                                    style={{ width: `${Math.max(0, Math.min(100, progressPct))}%` }}
                                />
                            </div>
                            <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200">
                                {progressPct}% progress
                            </span>
                        </div>
                    </div>
                </div>

                {/* Primary CTA */}
                <button
                    type="button"
                    onClick={() => onStartOrResume(item)}
                    className="w-full lg:w-auto px-8 py-3.5 rounded-2xl font-extrabold text-sm text-white bg-primary-600 hover:bg-primary-500 active:scale-95 transition-all shadow-lg hover:shadow-primary-500/25 flex items-center justify-center gap-2 flex-shrink-0"
                >
                    {progressPct >= 100 ? 'Review Module' : progressPct > 0 ? 'Resume' : 'Start Module'}
                    <ChevronRight size={18} />
                </button>
            </div>

            {/* Evidence Beat Callout Banner (Document 06 §3.2) */}
            {evidenceBeat && (
                <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-900/70 border-t border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse flex-shrink-0" />
                        <span className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400 flex-shrink-0">
                            Evidence beat:
                        </span>
                        <span className="text-xs text-slate-700 dark:text-slate-300 font-medium truncate">
                            {evidenceBeat}
                        </span>
                    </div>

                    <button
                        type="button"
                        onClick={handleJumpToTerminal}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-cyan-700 dark:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 transition-colors flex-shrink-0 self-start sm:self-auto"
                    >
                        <span>Inspect in Replay Terminal</span>
                        <ExternalLink size={12} />
                    </button>
                </div>
            )}
        </div>
    );
}
