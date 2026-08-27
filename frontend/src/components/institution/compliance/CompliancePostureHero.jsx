import React from 'react';
import { ShieldCheck, FileDown, Clock, ShieldAlert, Database, AlertCircle } from 'lucide-react';
import { cn } from '../../../utils/cn';

export default function CompliancePostureHero({ data, onExportEvidence, isLoading }) {
    if (isLoading || !data) {
        return <div className="h-44 rounded-2xl bg-surface-900/80 border border-edge/10 animate-pulse" />;
    }

    const { lag_hero = {}, counters = {}, last_attestation = "00:00 IST today" } = data;
    const {
        lag_days = 52,
        configured_floor_days = 30,
        earliest_servable_session = "4 Jul 2026",
        circular_citation = "SEBI Circular HO/MIRSD/MIRSD-PoD-1/P/CIR/2024/104 dated 30 May 2024 — effective 1 July 2024 — uniform 30-day lag on sharing and usage of price data for education"
    } = lag_hero;

    // Floor gauge progress calculation
    // Scale: 0 to 100 days
    const floorPercent = Math.min(100, Math.max(0, (configured_floor_days / 100) * 100));
    const currentLagPercent = Math.min(100, Math.max(0, (lag_days / 100) * 100));

    return (
        <div className="relative overflow-hidden rounded-2xl bg-[#0f172a] border border-blue-950/60 p-5 text-slate-100 shadow-xl">
            {/* Background subtle gradient */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

            {/* Header: Title + Export CTA */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <h2 className="text-base font-bold tracking-tight text-white">
                            Compliance posture
                        </h2>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                        {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} — All checks green · Last attestation {last_attestation}
                    </p>
                </div>

                <button
                    type="button"
                    onClick={onExportEvidence}
                    className="inline-flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700 text-xs font-semibold text-slate-200 hover:text-white transition-all shadow-sm active:scale-95"
                >
                    <FileDown className="w-4 h-4 text-primary-400" />
                    Export evidence pack
                </button>
            </div>

            {/* Main Metrics Row */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mt-4 items-center">
                {/* 1. Price Data Lag Gauge (Col 6) */}
                <div className="md:col-span-6 rounded-xl bg-slate-900/90 border border-slate-800 p-4">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 font-mono">
                            PRICE DATA LAG
                        </span>
                        <span className="text-[10px] font-mono text-emerald-400 font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                            LEGAL FLOOR ENFORCED
                        </span>
                    </div>

                    <div className="flex items-baseline gap-2 mt-2">
                        <span className="text-4xl font-black font-mono text-white tracking-tight">
                            {lag_days}
                        </span>
                        <span className="text-sm font-semibold text-slate-400 font-sans">
                            days
                        </span>
                    </div>

                    <p className="text-[11px] text-slate-400 mt-1">
                        Earliest servable session · <span className="text-slate-200 font-medium">{earliest_servable_session}</span>
                        <br />
                        <span className="text-[10px] text-slate-500">Configured floor {configured_floor_days} days — cannot be lowered</span>
                    </p>

                    {/* Progress Bar / Gauge */}
                    <div className="mt-3 space-y-1">
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                            <span>0 d</span>
                            <span className="text-amber-400 font-semibold">{configured_floor_days} d SEBI floor</span>
                            <span>100 d</span>
                        </div>
                        <div className="relative h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                            {/* Forbidden region (0 to 30) */}
                            <div
                                className="absolute left-0 top-0 h-full bg-rose-500/30"
                                style={{ width: `${floorPercent}%` }}
                            />
                            {/* Current Lag (52 days) */}
                            <div
                                className="absolute left-0 top-0 h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
                                style={{ width: `${currentLagPercent}%` }}
                            />
                        </div>
                    </div>

                    {/* Circular Citation Pill */}
                    <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[10px] text-slate-400 leading-relaxed">
                        <span className="font-semibold text-slate-300">SEBI Circular HO/MIRSD/MIRSD-PoD-1/P/CIR/2024/104</span> dated 30 May 2024 — effective 1 July 2024 — uniform 30-day lag on sharing and usage of price data for education.
                    </div>
                </div>

                {/* 2. Three Key Stat Blocks (Col 6) */}
                <div className="md:col-span-6 grid grid-cols-3 gap-3">
                    {/* Attestations */}
                    <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-3.5 flex flex-col justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                            ATTESTATIONS
                        </span>
                        <div className="mt-2">
                            <span className="text-2xl font-black font-mono text-white">
                                {counters.consecutive_attestations}
                            </span>
                            <p className="text-[10px] text-emerald-400 font-medium mt-1">
                                consecutive days
                            </p>
                        </div>
                    </div>

                    {/* Violations */}
                    <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-3.5 flex flex-col justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                            VIOLATIONS
                        </span>
                        <div className="mt-2">
                            <span className="text-2xl font-black font-mono text-emerald-400">
                                {counters.violations_since_launch}
                            </span>
                            <p className="text-[10px] text-slate-400 font-medium mt-1">
                                since launch
                            </p>
                        </div>
                    </div>

                    {/* Audit Records */}
                    <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-3.5 flex flex-col justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                            AUDIT RECORDS
                        </span>
                        <div className="mt-2">
                            <span className="text-2xl font-black font-mono text-white">
                                {counters.audit_records_count}
                            </span>
                            <p className="text-[10px] text-slate-400 font-medium mt-1">
                                immutable events
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
