import React from 'react';
import { Database, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { cn } from '../../../utils/cn';

export default function DataSourcesTable({ data, isLoading }) {
    if (isLoading || !data) {
        return <div className="h-64 rounded-xl bg-surface-900/70 border border-edge/10 animate-pulse" />;
    }

    const { sources = [], expiry_warning } = data;
    const expiringCount = sources.filter((s) => s.status === 'EXPIRING').length;

    return (
        <div className="rounded-xl bg-surface-900/70 border border-edge/10 p-4 flex flex-col justify-between shadow-sm">
            <div>
                {/* Header */}
                <div className="flex items-center justify-between pb-3 border-b border-edge/10">
                    <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-primary-500" />
                        <h3 className="text-sm font-bold text-heading">
                            Licensed data sources
                        </h3>
                    </div>
                    {expiringCount > 0 && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            {expiringCount} EXPIRING
                        </span>
                    )}
                </div>

                {/* Table */}
                <div className="overflow-x-auto mt-2">
                    <table className="w-full text-left text-xs font-mono">
                        <thead>
                            <tr className="border-b border-edge/10 text-[10px] uppercase font-bold text-gray-500">
                                <th className="py-2 px-2">Source</th>
                                <th className="py-2 px-2 font-sans">Scope</th>
                                <th className="py-2 px-2 text-center">Lag (Req)</th>
                                <th className="py-2 px-2 text-center">Audit</th>
                                <th className="py-2 px-2 text-right">Expires</th>
                                <th className="py-2 px-2 text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-edge/5">
                            {sources.map((s) => {
                                const isExpiring = s.status === 'EXPIRING';

                                return (
                                    <tr
                                        key={s.id}
                                        className={cn(
                                            "hover:bg-surface-800/40 transition-colors",
                                            isExpiring && "bg-amber-500/[0.04]"
                                        )}
                                    >
                                        <td className="py-2 px-2 font-medium text-heading">
                                            {s.source}
                                        </td>
                                        <td className="py-2 px-2 font-sans text-gray-300 text-[11px]">
                                            {s.scope}
                                        </td>
                                        <td className="py-2 px-2 text-center text-gray-400">
                                            {s.lag_req}
                                        </td>
                                        <td className="py-2 px-2 text-center text-gray-400">
                                            {s.audit}
                                        </td>
                                        <td className="py-2 px-2 text-right text-gray-300">
                                            {s.expires}
                                        </td>
                                        <td className="py-2 px-2 text-right font-bold">
                                            <span className={cn(
                                                "px-1.5 py-0.5 rounded text-[10px] uppercase",
                                                isExpiring
                                                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                                                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                            )}>
                                                {s.status}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Warning Callout */}
            {expiry_warning?.has_warning && expiry_warning.message && (
                <div className="mt-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-start gap-2 text-xs">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <p className="leading-relaxed font-sans font-medium text-[11px]">
                        {expiry_warning.message}
                    </p>
                </div>
            )}
        </div>
    );
}
