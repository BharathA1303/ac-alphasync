import React from 'react';
import { Calendar, Bell, CheckCircle2, Clock } from 'lucide-react';

/**
 * SessionEventTimeline — Document 06 Screen 1
 * Timeline of milestone events scheduled or triggered during the trading session replay.
 */
export default function SessionEventTimeline({
    events = [
        { time: '09:15', title: 'Market Open & Price Discovery', status: 'completed' },
        { time: '10:30', title: 'Nifty 50 Divisor Rebalancing Announcement', status: 'active' },
        { time: '11:45', title: 'RBI Monetary Policy Committee Brief', status: 'upcoming' },
        { time: '14:30', title: 'F&O Expiry Settlement Window', status: 'upcoming' },
        { time: '15:30', title: 'Market Close & EOD Reconciliation', status: 'upcoming' },
    ],
}) {
    return (
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                    <Bell size={14} className="text-primary-600 dark:text-primary-400" />
                    <span>Session Event Timeline</span>
                </div>
                <span className="text-[10px] font-mono text-slate-400">Replay Events</span>
            </div>

            <div className="space-y-2 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100 dark:before:bg-slate-800">
                {events.map((ev, i) => {
                    const isCompleted = ev.status === 'completed';
                    const isActive = ev.status === 'active';

                    return (
                        <div key={i} className="flex items-start gap-2.5 relative">
                            {/* Dot / Icon */}
                            <div
                                className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${
                                    isCompleted
                                        ? 'bg-emerald-500/10 text-emerald-600'
                                        : isActive
                                        ? 'bg-primary-500 text-white shadow-sm ring-2 ring-primary-500/20'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                                }`}
                            >
                                {isCompleted ? (
                                    <CheckCircle2 size={12} />
                                ) : isActive ? (
                                    <Clock size={11} className="animate-spin" />
                                ) : (
                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                )}
                            </div>

                            <div className="flex-1 min-w-0 pt-0.5">
                                <div className="flex items-center justify-between gap-1">
                                    <span className="font-mono text-[10px] font-bold text-slate-500">
                                        {ev.time}
                                    </span>
                                    {isActive && (
                                        <span className="text-[9px] font-mono font-extrabold uppercase px-1.5 py-0.2 rounded bg-primary-500/10 text-primary-600 dark:text-primary-400">
                                            LIVE NOW
                                        </span>
                                    )}
                                </div>
                                <p className={`text-[11px] leading-tight mt-0.5 truncate ${
                                    isActive
                                        ? 'font-bold text-slate-900 dark:text-white'
                                        : isCompleted
                                        ? 'text-slate-600 dark:text-slate-400 line-through opacity-70'
                                        : 'text-slate-500 dark:text-slate-400'
                                }`}>
                                    {ev.title}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
