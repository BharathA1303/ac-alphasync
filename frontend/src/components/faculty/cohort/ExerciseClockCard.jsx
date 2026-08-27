import React, { useState } from 'react';
import { Play, Pause, RotateCcw, FastForward, CheckCircle2, ShieldCheck, Clock, Layers } from 'lucide-react';
import { cn } from '../../../utils/cn';
import api from '../../../services/api';

export default function ExerciseClockCard({ data, onRefresh }) {
    const [isPlaying, setIsPlaying] = useState(!data?.clock?.is_paused);
    const [speed, setSpeed] = useState(data?.clock?.speed || '1.0x');
    const [controlling, setControlling] = useState(false);

    if (!data) return null;

    const { title, provenance, clock, participation } = data;

    const handleClockAction = async (action, newSpeed = null) => {
        try {
            setControlling(true);
            if (action === 'pause') setIsPlaying(false);
            if (action === 'resume') setIsPlaying(true);
            if (newSpeed) setSpeed(newSpeed);

            await api.post('/faculty/cohort/clock/control', {
                action,
                speed: newSpeed ? parseFloat(newSpeed) : 1.0,
            });
            onRefresh?.();
        } catch (err) {
            console.error('Failed to control clock:', err);
        } finally {
            setControlling(false);
        }
    };

    return (
        <div className="rounded-xl bg-surface-900/70 border border-edge/10 p-4 flex flex-col justify-between shadow-sm">
            {/* Header: Title + Provenance Tag */}
            <div>
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20">
                                ACTIVE EXERCISE
                            </span>
                            <span className="text-[11px] font-mono text-gray-400">
                                {provenance.session_date}
                            </span>
                        </div>
                        <h3 className="text-base font-bold text-heading mt-1">
                            {title}
                        </h3>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border",
                            provenance.depth_source === 'LICENSED'
                                ? "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-emerald-500/20"
                                : "bg-amber-500/10 text-amber-500 dark:text-amber-400 border-amber-500/20"
                        )}>
                            <ShieldCheck className="w-3 h-3" />
                            {provenance.depth_source}
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-surface-800/80 text-gray-300 border border-edge/10">
                            Lag: {provenance.lag_days}d
                        </span>
                    </div>
                </div>

                {/* Metadata Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-3 border-t border-edge/10 text-xs">
                    <div>
                        <span className="text-[10px] text-gray-500 uppercase font-semibold">Opening Capital</span>
                        <p className="font-mono font-bold text-heading mt-0.5">{provenance.opening_capital_formatted}</p>
                    </div>
                    <div>
                        <span className="text-[10px] text-gray-500 uppercase font-semibold">Universe</span>
                        <p className="font-semibold text-heading truncate mt-0.5">{provenance.universe}</p>
                    </div>
                    <div>
                        <span className="text-[10px] text-gray-500 uppercase font-semibold">Regulatory Lag</span>
                        <p className="font-mono font-bold text-heading mt-0.5">{provenance.lag_days} Days</p>
                    </div>
                    <div>
                        <span className="text-[10px] text-gray-500 uppercase font-semibold">Matching Model</span>
                        <p className="font-semibold text-emerald-500 dark:text-emerald-400 mt-0.5">L1 + Depth Fills</p>
                    </div>
                </div>
            </div>

            {/* Session Clock Playback Box */}
            <div className="mt-4 pt-3 border-t border-edge/10">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-primary-500" />
                        <span className="text-sm font-mono font-black text-heading tracking-tight">
                            {clock.current_time} <span className="text-gray-500 font-normal">/ {clock.session_end}</span>
                        </span>
                        <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-500 border border-blue-500/20">
                            {clock.status}
                        </span>
                    </div>

                    {/* Clock Controls */}
                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => handleClockAction(isPlaying ? 'pause' : 'resume')}
                            disabled={controlling}
                            className="p-1.5 rounded-lg bg-surface-800/80 hover:bg-surface-700 text-heading border border-edge/10 transition-colors"
                            title={isPlaying ? "Pause simulation" : "Resume simulation"}
                        >
                            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 text-primary-500" />}
                        </button>
                        <button
                            type="button"
                            onClick={() => handleClockAction('speed', speed === '1.0x' ? '2.0x' : speed === '2.0x' ? '5.0x' : '1.0x')}
                            disabled={controlling}
                            className="px-2 py-1 rounded-lg bg-surface-800/80 hover:bg-surface-700 text-[10px] font-mono font-bold text-heading border border-edge/10 transition-colors"
                            title="Adjust replay speed"
                        >
                            {speed}
                        </button>
                        <button
                            type="button"
                            onClick={() => handleClockAction('seek')}
                            disabled={controlling}
                            className="p-1.5 rounded-lg bg-surface-800/80 hover:bg-surface-700 text-gray-400 hover:text-heading border border-edge/10 transition-colors"
                            title="Reset to market open"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Progress Bar & Participation */}
                <div className="mt-3">
                    <div className="h-1.5 w-full bg-surface-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-primary-500 rounded-full transition-all duration-300"
                            style={{ width: `${clock.progress_percent || 55}%` }}
                        />
                    </div>
                    <div className="flex items-center justify-between mt-1.5 text-[11px] text-gray-400 font-mono">
                        <span>{participation.label}</span>
                        <span className="text-primary-500 font-semibold">{participation.percent}% Active</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
