import React from 'react';
import { Users, CheckCircle2, Award, Activity, AlertTriangle } from 'lucide-react';
import { cn } from '../../../utils/cn';

function Sparkline({ data = [], color = 'emerald' }) {
    if (!data || data.length < 2) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const width = 100;
    const height = 28;

    const points = data
        .map((d, i) => {
            const x = (i / (data.length - 1)) * width;
            const y = height - ((d - min) / range) * (height - 6) - 3;
            return `${x},${y}`;
        })
        .join(' ');

    const strokeColor = {
        emerald: '#10b981',
        blue: '#3b82f6',
        primary: '#10b981',
        amber: '#f59e0b',
        rose: '#f43f5e',
    }[color] || '#10b981';

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-16 h-6 overflow-visible">
            <polyline
                fill="none"
                stroke={strokeColor}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={points}
            />
        </svg>
    );
}

export default function CohortStatRow({ data, isLoading }) {
    if (isLoading || !data) {
        return (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-24 rounded-xl bg-surface-900/60 border border-edge/10 animate-pulse" />
                ))}
            </div>
        );
    }

    const cards = [
        {
            key: 'active_learners',
            item: data.active_learners,
            icon: Users,
            color: 'blue',
        },
        {
            key: 'exercises_completed',
            item: data.exercises_completed,
            icon: CheckCircle2,
            color: 'emerald',
        },
        {
            key: 'average_mastery',
            item: data.average_mastery,
            icon: Award,
            color: 'primary',
        },
        {
            key: 'active_traders',
            item: data.active_traders,
            icon: Activity,
            color: 'blue',
        },
        {
            key: 'at_risk_learners',
            item: data.at_risk_learners,
            icon: AlertTriangle,
            color: 'rose',
        },
    ];

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {cards.map(({ key, item, icon: Icon, color }) => {
                if (!item) return null;

                return (
                    <div
                        key={key}
                        className="relative overflow-hidden rounded-xl bg-surface-900/70 border border-edge/10 p-3.5 flex flex-col justify-between hover:border-edge/20 transition-all duration-200 shadow-sm"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                                {item.label}
                            </span>
                            <div className={cn(
                                "p-1.5 rounded-lg",
                                color === 'rose' ? "bg-rose-500/10 text-rose-500" :
                                color === 'blue' ? "bg-blue-500/10 text-blue-500" :
                                "bg-emerald-500/10 text-emerald-500"
                            )}>
                                <Icon className="w-3.5 h-3.5" />
                            </div>
                        </div>

                        <div className="flex items-baseline justify-between mt-2">
                            <span className="text-2xl font-black text-heading font-mono tracking-tight">
                                {item.value}
                            </span>
                            <Sparkline data={item.sparkline} color={color} />
                        </div>

                        <div className="mt-2 pt-2 border-t border-edge/5 text-[11px] text-gray-400">
                            {item.subtext}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
