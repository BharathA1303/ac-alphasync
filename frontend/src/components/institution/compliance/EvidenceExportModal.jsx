import React, { useState } from 'react';
import { X, FileDown, ShieldCheck, CheckCircle2, Loader2 } from 'lucide-react';
import api from '../../../services/api';
import toast from 'react-hot-toast';

export default function EvidenceExportModal({ isOpen, onClose }) {
    const [exporting, setExporting] = useState(false);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    if (!isOpen) return null;

    const handleExport = async () => {
        setExporting(true);
        try {
            const res = await api.post('/institution/compliance/evidence-pack', {
                date_from: dateFrom || undefined,
                date_to: dateTo || undefined,
            });

            const data = res.data;
            if (data?.data) {
                // Trigger client download of compliance evidence JSON
                const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = data.filename || 'SEBI_Compliance_Evidence_Pack.json';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                toast.success(`Evidence Pack ${data.certificate_id} generated and downloaded.`);
                onClose();
            }
        } catch (err) {
            console.error('Failed to export evidence pack:', err);
            toast.error('Failed to generate compliance evidence pack.');
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
            <div className="w-full max-w-md rounded-2xl bg-surface-900 border border-edge/20 p-5 shadow-2xl space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between pb-3 border-b border-edge/10">
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-emerald-500" />
                        <h3 className="text-sm font-bold text-heading">
                            Export SEBI Evidence Pack
                        </h3>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1 rounded-lg text-gray-400 hover:text-heading hover:bg-surface-800 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <p className="text-xs text-gray-400 leading-relaxed">
                    Assembles verified lag attestations, immutable audit trail extracts, data source license proofs, and disclosure records for inspection audit (CMP-008).
                </p>

                {/* Date range */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                            From Date
                        </label>
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="w-full px-3 py-1.5 rounded-lg bg-surface-800 border border-edge/20 text-xs text-heading focus:outline-none focus:border-primary-500"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                            To Date
                        </label>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="w-full px-3 py-1.5 rounded-lg bg-surface-800 border border-edge/20 text-xs text-heading focus:outline-none focus:border-primary-500"
                        />
                    </div>
                </div>

                {/* Evidence Inclusions Checklist */}
                <div className="rounded-xl bg-surface-950/60 border border-edge/10 p-3 space-y-2 text-xs font-mono">
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5" /> 30-Day SEBI Minimum Lag Proof (HO/MIRSD/MIRSD-PoD-1/P/CIR/2024/104)
                    </div>
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5" /> WORM SHA-256 Audit Trail Verification
                    </div>
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5" /> AI Mentor Anti-Advisory Logs & Refusals
                    </div>
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Non-Negotiables CI Pass Verification (N7–N11)
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={exporting}
                        className="px-3 py-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-xs font-semibold text-gray-300 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleExport}
                        disabled={exporting}
                        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-xs font-bold text-white transition-colors disabled:opacity-50"
                    >
                        {exporting ? (
                            <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Generating Pack...
                            </>
                        ) : (
                            <>
                                <FileDown className="w-3.5 h-3.5" />
                                Generate & Download
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
