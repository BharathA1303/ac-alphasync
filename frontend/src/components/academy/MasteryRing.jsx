import React from 'react';
import { Check, Lock } from 'lucide-react';

export default function MasteryRing({
    pct = null,
    state = 'active', // 'done' | 'active' | 'next' | 'locked'
    size = 46,
    strokeWidth = 3.5,
    color = '#00bcd4',
    showLabel = true,
}) {
    const isLocked = state === 'locked' || pct === null || pct === undefined;
    const isDone = state === 'done' || (pct !== null && pct >= 100);

    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const cleanPct = isLocked ? 0 : Math.max(0, Math.min(100, Math.round(pct)));
    const offset = circumference - (cleanPct / 100) * circumference;

    return (
        <div
            className="relative flex items-center justify-center flex-shrink-0 select-none"
            style={{ width: size, height: size }}
        >
            <svg width={size} height={size} className="transform -rotate-90">
                {/* Background Track */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    fill="none"
                    className="text-slate-200 dark:text-slate-800"
                />
                {/* Active Progress */}
                {!isLocked && (
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        stroke={isDone ? '#10b981' : color}
                        strokeWidth={strokeWidth}
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        strokeLinecap="round"
                        fill="none"
                        className="transition-all duration-700 ease-out"
                    />
                )}
            </svg>

            {/* Inner Content */}
            <div className="absolute inset-0 flex items-center justify-center">
                {isDone ? (
                    <span className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                        <Check size={12} strokeWidth={3} />
                    </span>
                ) : isLocked ? (
                    <div className="flex items-center gap-0.5 text-slate-400 dark:text-slate-500 text-[11px] font-mono font-bold">
                        <Lock size={10} className="opacity-75" />
                        <span>—</span>
                    </div>
                ) : showLabel ? (
                    <span className="text-[11px] font-mono font-extrabold text-slate-800 dark:text-slate-200 tabular-nums">
                        {cleanPct}%
                    </span>
                ) : null}
            </div>
        </div>
    );
}
