import React from 'react';
import { CalendarClock, CheckCircle2, ChevronRight, Clock, FileCheck, Target } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function DueList({ dueItems = [] }) {
    const navigate = useNavigate();

    const handleClick = (item) => {
        if (item.link) {
            navigate(item.link);
        }
    };

    return (
        <div className="p-6 rounded-3xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <CalendarClock size={18} className="text-primary-600 dark:text-primary-400" />
                    <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
                        Due This Week
                    </h3>
                </div>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-primary-500/10 text-primary-600 dark:text-primary-400">
                    {dueItems.length} {dueItems.length === 1 ? 'item' : 'items'}
                </span>
            </div>

            {dueItems.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                    <CheckCircle2 size={24} className="text-emerald-500 opacity-60" />
                    <span className="font-semibold text-slate-700 dark:text-slate-300">All caught up!</span>
                    <span>No pending assignments or quizzes due this week.</span>
                </div>
            ) : (
                <div className="space-y-2.5">
                    {dueItems.map((item) => (
                        <div
                            key={item.id}
                            onClick={() => handleClick(item)}
                            className="group flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 hover:border-primary-500/50 hover:bg-primary-500/[0.02] cursor-pointer transition-all"
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 bg-primary-500/10 text-primary-600 dark:text-primary-400">
                                    {item.type === 'exercise' ? (
                                        <Target size={15} />
                                    ) : item.type === 'quiz' ? (
                                        <FileCheck size={15} />
                                    ) : (
                                        <Clock size={15} />
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                                        {item.title}
                                    </h4>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                            {item.tag}
                                        </span>
                                        <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                                            <Clock size={10} /> {item.due_label}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <ChevronRight size={16} className="text-slate-400 group-hover:text-primary-600 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
