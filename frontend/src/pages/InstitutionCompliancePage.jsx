import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, RefreshCw, Lock } from 'lucide-react';
import api from '../services/api';
import { cn } from '../utils/cn';

// Subcomponents
import CompliancePostureHero from '../components/institution/compliance/CompliancePostureHero';
import NonNegotiablesPanel from '../components/institution/compliance/NonNegotiablesPanel';
import DataSourcesTable from '../components/institution/compliance/DataSourcesTable';
import AuditTrailChart from '../components/institution/compliance/AuditTrailChart';
import AiGuardrailPanel from '../components/institution/compliance/AiGuardrailPanel';
import DisclosureEngagementPanel from '../components/institution/compliance/DisclosureEngagementPanel';
import EvidenceExportModal from '../components/institution/compliance/EvidenceExportModal';

export default function InstitutionCompliancePage() {
    const [loading, setLoading] = useState(true);
    const [evidenceModalOpen, setEvidenceModalOpen] = useState(false);

    // Telemetry states
    const [overviewData, setOverviewData] = useState(null);
    const [gatesData, setGatesData] = useState(null);
    const [dataSourcesData, setDataSourcesData] = useState(null);
    const [auditTrailData, setAuditTrailData] = useState(null);
    const [aiGuardrailData, setAiGuardrailData] = useState(null);
    const [engagementData, setEngagementData] = useState(null);

    const fetchAllData = useCallback(async () => {
        setLoading(true);
        try {
            const [
                overviewRes,
                gatesRes,
                dataSourcesRes,
                auditTrailRes,
                aiGuardrailRes,
                engagementRes
            ] = await Promise.all([
                api.get('/institution/compliance/overview').catch(() => ({ data: null })),
                api.get('/institution/compliance/gates').catch(() => ({ data: null })),
                api.get('/institution/compliance/data-sources').catch(() => ({ data: null })),
                api.get('/institution/compliance/audit-trail').catch(() => ({ data: null })),
                api.get('/institution/compliance/ai-guardrail').catch(() => ({ data: null })),
                api.get('/institution/compliance/engagement').catch(() => ({ data: null })),
            ]);

            setOverviewData(overviewRes.data);
            setGatesData(gatesRes.data);
            setDataSourcesData(dataSourcesRes.data);
            setAuditTrailData(auditTrailRes.data);
            setAiGuardrailData(aiGuardrailRes.data);
            setEngagementData(engagementRes.data);
        } catch (err) {
            console.error('Failed to load institution compliance telemetry:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAllData();
    }, [fetchAllData]);

    return (
        <div className="min-h-[calc(100vh-56px)] bg-surface-950 text-slate-100 p-4 md:p-6 space-y-4 font-sans">
            {/* ── Top Context Bar ─────────────────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-edge/10">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                        <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                            Compliance Console
                        </span>
                        <span className="text-gray-500">—</span>
                        <span className="text-sm font-bold text-heading">
                            SEBI Market Data Obligations
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={fetchAllData}
                        className="p-2 rounded-lg bg-surface-900 border border-edge/20 text-gray-400 hover:text-heading hover:bg-surface-800 transition-colors"
                        title="Refresh telemetry"
                    >
                        <RefreshCw className={cn("w-4 h-4", loading && "animate-spin text-primary-500")} />
                    </button>
                </div>
            </div>

            {/* ── 1. Hero: Compliance Posture & Price Data Lag Gauge ───────────── */}
            <CompliancePostureHero
                data={overviewData}
                onExportEvidence={() => setEvidenceModalOpen(true)}
                isLoading={loading}
            />

            {/* ── 2. Middle Grid: Architectural Gates vs Licensed Data Sources ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-5">
                    <NonNegotiablesPanel
                        data={gatesData}
                        isLoading={loading}
                    />
                </div>
                <div className="lg:col-span-7">
                    <DataSourcesTable
                        data={dataSourcesData}
                        isLoading={loading}
                    />
                </div>
            </div>

            {/* ── 3. Bottom Grid: Audit Trail + AI Guardrail + Disclosures ─────── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-4">
                    <AuditTrailChart
                        data={auditTrailData}
                        isLoading={loading}
                    />
                </div>
                <div className="lg:col-span-4">
                    <AiGuardrailPanel
                        data={aiGuardrailData}
                        isLoading={loading}
                    />
                </div>
                <div className="lg:col-span-4">
                    <DisclosureEngagementPanel
                        data={engagementData}
                        isLoading={loading}
                    />
                </div>
            </div>

            {/* ── Evidence Pack Export Modal ──────────────────────────────────── */}
            <EvidenceExportModal
                isOpen={evidenceModalOpen}
                onClose={() => setEvidenceModalOpen(false)}
            />
        </div>
    );
}
