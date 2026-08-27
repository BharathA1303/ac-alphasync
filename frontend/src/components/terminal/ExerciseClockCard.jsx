import React, { useState, useEffect } from 'react';
import { Clock, Play, Pause, FastForward, Activity, Target } from 'lucide-react';

/**
 * ExerciseClockCard — Document 06 Screen 1 Left Navigation Block
 * Context card for the student's active assignment with session clock and replay speed controls.
 */
export default function ExerciseClockCard({
    exerciseCode = 'PM-012',
    exerciseTitle = 'Exercise 4: Event-Day Execution',
    marketPhase = 'NORMAL TRADING',
    initialTime = '09:47:32',
}) {
    const [currentTime, setCurrentTime] = useState(initialTime);
    const [isPlaying, setIsPlaying] = useState(true);
    const [speed, setSpeed] = useState(1);

    useEffect(() => {
        if (!isPlaying) return undefined;
        const timer = setInterval(() => {
            const now = new Date();
            setCurrentTime(now.toTimeString().split(' ')[0]);
        }, 1000);
        return () => clearInterval(timer);
    }, [isPlaying]);

    return (
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold text-primary-600 dark:text-primary-400">
                    <Target size={13} />
                    <span>{exerciseCode}</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {marketPhase}
                </span>
            </div>

            <div className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1" title={exerciseTitle}>
                {exerciseTitle}
            </div>

            {/* Live Session Clock */}
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Clock size={14} className="text-slate-400" />
                    <span className="font-mono text-sm font-extrabold text-slate-900 dark:text-white tracking-wider">
                        {currentTime} <span className="text-[10px] text-slate-400 font-normal">IST</span>
                    </span>
                </div>

                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={() => setIsPlaying(!isPlaying)}
                        className="w-6 h-6 rounded-lg bg-slate-200/60 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center justify-center transition-colors"
                        title={isPlaying ? 'Pause Replay' : 'Play Replay'}
                    >
                        {isPlaying ? <Pause size={11} /> : <Play size={11} />}
                    </button>
                    <button
                        type="button"
                        onClick={() => setSpeed((prev) => (prev === 1 ? 2 : prev === 2 ? 5 : 1))}
                        className="px-1.5 py-0.5 rounded-lg bg-primary-500/10 hover:bg-primary-500/20 text-primary-600 dark:text-primary-400 font-mono text-[10px] font-extrabold transition-colors"
                        title="Change Speed"
                    >
                        {speed}×
                    </button>
                </div>
            </div>
        </div>
    );
}
