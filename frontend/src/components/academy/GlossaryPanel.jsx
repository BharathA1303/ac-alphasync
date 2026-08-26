import React, { useState } from 'react';
import { BookMarked, Search, ChevronRight, X, Sparkles } from 'lucide-react';

export default function GlossaryPanel({ glossaryTerms = [] }) {
    const [search, setSearch] = useState('');
    const [selectedTerm, setSelectedTerm] = useState(null);

    const filtered = glossaryTerms.filter((t) =>
        t.term.toLowerCase().includes(search.toLowerCase()) ||
        t.fullName?.toLowerCase().includes(search.toLowerCase()) ||
        t.definition?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="p-6 rounded-3xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <BookMarked size={18} className="text-primary-600 dark:text-primary-400" />
                    <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
                        Glossary — Capital Markets
                    </h3>
                </div>
                <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                    SEBI / NISM Verified
                </span>
            </div>

            {/* Search */}
            <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Look up financial terms (e.g., ASBA, Free Float)..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-primary-500 transition-colors"
                />
            </div>

            {/* List */}
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                {filtered.length === 0 ? (
                    <div className="text-center py-4 text-xs text-slate-400">No matching financial term found.</div>
                ) : (
                    filtered.map((item) => (
                        <div
                            key={item.id}
                            onClick={() => setSelectedTerm(item)}
                            className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 hover:border-primary-500/50 cursor-pointer transition-all space-y-1"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-slate-900 dark:text-white">
                                    {item.term}
                                </span>
                                <span className="text-[9px] font-mono uppercase font-bold px-1.5 py-0.2 rounded bg-primary-500/10 text-primary-600 dark:text-primary-400">
                                    {item.category}
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                                {item.definition}
                            </p>
                        </div>
                    ))
                )}
            </div>

            {/* Modal Detail if clicked */}
            {selectedTerm && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
                    onClick={() => setSelectedTerm(null)}
                >
                    <div
                        className="w-full max-w-md p-6 rounded-3xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 animate-scale-up"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                            <div>
                                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-primary-600 dark:text-primary-400">
                                    {selectedTerm.category}
                                </span>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                                    {selectedTerm.term}
                                </h3>
                                {selectedTerm.fullName && (
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                        {selectedTerm.fullName}
                                    </p>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedTerm(null)}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                            {selectedTerm.definition}
                        </p>

                        <div className="pt-2 flex justify-end">
                            <button
                                type="button"
                                onClick={() => setSelectedTerm(null)}
                                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-primary-600 hover:bg-primary-500 transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
