import React from 'react';
import { BookOpen, CheckCircle2, ChevronRight, Layers, School, Sparkles, SlidersHorizontal } from 'lucide-react';
import MasteryRing from './MasteryRing';

export default function CurriculumMap({
    isFacultyMode,
    onToggleMode,
    modules = [],
    facultyCourses = [],
    selectedItem,
    onSelectItem,
    onOpenItem,
}) {
    return (
        <div className="p-6 rounded-3xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
            {/* Header & Mode Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-100 dark:border-slate-800/80">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono font-extrabold uppercase tracking-widest text-primary-600 dark:text-primary-400">
                            {isFacultyMode ? 'FACULTY ASSIGNED PATHWAY' : 'INDIAN CAPITAL MARKETS — CURRICULUM MAP'}
                        </span>
                    </div>
                    <h2 className="text-base sm:text-lg font-display font-extrabold text-slate-900 dark:text-white mt-0.5">
                        {isFacultyMode
                            ? 'Institution Curriculum Sequence'
                            : '16-Module Capital Markets Progression'}
                    </h2>
                </div>

                {/* Faculty vs Default Toggle Switch */}
                <div className="flex items-center gap-3 self-start sm:self-auto">
                    <div className="flex items-center p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/60 shadow-inner">
                        <button
                            type="button"
                            onClick={() => onToggleMode(false)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                !isFacultyMode
                                    ? 'bg-white dark:bg-[#1E293B] text-primary-600 dark:text-primary-400 shadow-sm'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                        >
                            <Layers size={13} />
                            <span>Core Pathway</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => onToggleMode(true)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                isFacultyMode
                                    ? 'bg-white dark:bg-[#1E293B] text-primary-600 dark:text-primary-400 shadow-sm'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                        >
                            <School size={13} />
                            <span>Faculty Courses</span>
                            {facultyCourses.length > 0 && (
                                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-primary-500/20 text-primary-600 dark:text-primary-400">
                                    {facultyCourses.length}
                                </span>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Instruction subtext */}
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>
                    {isFacultyMode
                        ? 'Showing custom courses created by your institution professors'
                        : 'Structured progression covering Indian equities, indices, microstructure & risk'}
                </span>
                <span className="hidden md:inline-block font-mono text-[11px] text-slate-400 dark:text-slate-500">
                    Click to inspect · Double click to open
                </span>
            </div>

            {/* Content Grid */}
            {isFacultyMode ? (
                /* Faculty Courses Mode */
                facultyCourses.length === 0 ? (
                    <div className="text-center py-16 bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-6">
                        <School className="w-10 h-10 mx-auto mb-2 text-slate-400 opacity-50" />
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-200">No faculty courses assigned yet.</p>
                        <p className="text-xs text-slate-500 mt-1">Switch to Core Pathway to continue your standard curriculum.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                        {facultyCourses.map((c, idx) => {
                            const isSelected = selectedItem?.id === c.id;
                            const lessonPct = c.lesson_count > 0 ? (c.lessons_completed / c.lesson_count) * 100 : 0;
                            const isDone = lessonPct >= 100 && c.lesson_count > 0;
                            const state = isDone ? 'done' : lessonPct > 0 ? 'active' : 'next';

                            return (
                                <div
                                    key={c.id}
                                    onClick={() => onSelectItem(c)}
                                    onDoubleClick={() => onOpenItem(c)}
                                    className={`group relative flex flex-col justify-between p-3.5 rounded-2xl border cursor-pointer transition-all duration-200 ${
                                        isSelected
                                            ? 'border-primary-500 bg-primary-500/10 shadow-md ring-2 ring-primary-500/30 -translate-y-0.5'
                                            : isDone
                                            ? 'border-emerald-500/25 bg-emerald-500/[0.03] dark:bg-emerald-950/10 hover:border-emerald-500/50 hover:-translate-y-0.5'
                                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151E2E] hover:border-slate-300 dark:hover:border-slate-700 hover:-translate-y-0.5'
                                    }`}
                                    style={{ minHeight: 155 }}
                                >
                                    {/* Top: Index & Badge */}
                                    <div className="flex items-center justify-between gap-1 mb-1">
                                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                            Step {idx + 1}
                                        </span>
                                        {isDone ? (
                                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                                Done
                                            </span>
                                        ) : (
                                            <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                                                {c.lesson_count} lessons
                                            </span>
                                        )}
                                    </div>

                                    {/* Center: Gauge */}
                                    <div className="my-1 flex justify-center">
                                        <MasteryRing pct={lessonPct} state={state} size={42} />
                                    </div>

                                    {/* Bottom: Title */}
                                    <div className="text-center mt-1">
                                        <h4
                                            className="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors"
                                            title={c.title}
                                        >
                                            {c.title}
                                        </h4>
                                        <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                                            {c.assessment_count} quiz{c.assessment_count === 1 ? '' : 'zes'}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )
            ) : (
                /* Core 16-Module Pathway Mode */
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                    {modules.map((mod, idx) => {
                        const isSelected = selectedItem?.id === mod.id;
                        const isLocked = mod.state === 'locked';

                        return (
                            <div
                                key={mod.id || idx}
                                onClick={() => !isLocked && onSelectItem(mod)}
                                onDoubleClick={() => !isLocked && onOpenItem(mod)}
                                className={`group relative flex flex-col justify-between p-3 rounded-2xl border transition-all duration-200 ${
                                    isLocked
                                        ? 'border-slate-200/60 dark:border-slate-800/60 bg-slate-50/70 dark:bg-slate-900/30 opacity-60 cursor-not-allowed'
                                        : isSelected
                                        ? 'border-primary-500 bg-primary-500/10 shadow-md ring-2 ring-primary-500/40 -translate-y-0.5 cursor-pointer'
                                        : mod.state === 'done'
                                        ? 'border-emerald-500/30 bg-emerald-500/[0.04] dark:bg-emerald-950/15 hover:border-emerald-500/60 hover:-translate-y-0.5 cursor-pointer'
                                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151E2E] hover:border-primary-400 dark:hover:border-primary-600 hover:-translate-y-0.5 cursor-pointer'
                                }`}
                                style={{ minHeight: 145 }}
                            >
                                {/* Top Tag & Code */}
                                <div className="flex items-center justify-between gap-1 mb-1">
                                    <span className="text-[9px] font-mono font-extrabold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                        {mod.code || `M${idx + 1}`}
                                    </span>
                                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-primary-500/15 text-primary-600 dark:text-primary-400">
                                        {mod.tag || 'MKT'}
                                    </span>
                                </div>

                                {/* Ring */}
                                <div className="my-1 flex justify-center">
                                    <MasteryRing pct={mod.progress_pct} state={mod.state} size={38} />
                                </div>

                                {/* Title */}
                                <div className="text-center mt-1">
                                    <h4
                                        className="text-[11px] font-bold text-slate-900 dark:text-white truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors"
                                        title={mod.title}
                                    >
                                        {mod.title}
                                    </h4>
                                    <p className="text-[9px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                                        {isLocked ? 'Locked' : `${mod.lesson_count || 4} lessons`}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
