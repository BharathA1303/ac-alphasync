import React, { useState, useEffect, useCallback } from 'react';
import { ChevronDown, Search, RefreshCw, Layers, Award, AlertTriangle, Users } from 'lucide-react';
import api from '../services/api';
import { cn } from '../utils/cn';

// Subcomponents
import CohortStatRow from '../components/faculty/cohort/CohortStatRow';
import StandingsTable from '../components/faculty/cohort/StandingsTable';
import MasteryHeatmap from '../components/faculty/cohort/MasteryHeatmap';
import WeakConceptList from '../components/faculty/cohort/WeakConceptList';
import AtRiskList from '../components/faculty/cohort/AtRiskList';
import BehaviourDistribution from '../components/faculty/cohort/BehaviourDistribution';
import RemediationModal from '../components/faculty/cohort/RemediationModal';

export default function FacultyCohortPage() {
    const [courses, setCourses] = useState([]);
    const [selectedCourseId, setSelectedCourseId] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [remediationModalOpen, setRemediationModalOpen] = useState(false);

    // Data states
    const [overviewData, setOverviewData] = useState(null);
    const [standingsData, setStandingsData] = useState(null);
    const [heatmapData, setHeatmapData] = useState(null);
    const [weakConceptsData, setWeakConceptsData] = useState(null);
    const [atRiskData, setAtRiskData] = useState(null);
    const [behaviourData, setBehaviourData] = useState(null);

    // ── 1. Fetch available faculty cohorts / courses ─────────────────────────
    useEffect(() => {
        const fetchCourses = async () => {
            try {
                const res = await api.get('/faculty/cohort/courses');
                const list = res.data?.courses || [];
                setCourses(list);
                if (list.length > 0) {
                    setSelectedCourseId(list[0].id);
                }
            } catch (err) {
                console.error('Failed to fetch faculty courses:', err);
            }
        };
        fetchCourses();
    }, []);

    // ── 2. Fetch all cohort analytics ────────────────────────────────────────
    const fetchAllData = useCallback(async () => {
        setLoading(true);
        try {
            const params = selectedCourseId ? `?course_id=${selectedCourseId}` : '';
            const [
                overviewRes,
                standingsRes,
                heatmapRes,
                weakRes,
                atRiskRes,
                behaviourRes
            ] = await Promise.all([
                api.get(`/faculty/cohort/overview${params}`).catch(() => ({ data: null })),
                api.get(`/faculty/cohort/standings${params}`).catch(() => ({ data: null })),
                api.get(`/faculty/cohort/mastery-heatmap${params}`).catch(() => ({ data: null })),
                api.get(`/faculty/cohort/weak-concepts${params}`).catch(() => ({ data: null })),
                api.get(`/faculty/cohort/at-risk${params}`).catch(() => ({ data: null })),
                api.get(`/faculty/cohort/behaviour-distribution${params}`).catch(() => ({ data: null })),
            ]);

            setOverviewData(overviewRes.data);
            setStandingsData(standingsRes.data);
            setHeatmapData(heatmapRes.data);
            setWeakConceptsData(weakRes.data);
            setAtRiskData(atRiskRes.data);
            setBehaviourData(behaviourRes.data);
        } catch (err) {
            console.error('Failed to load faculty cohort data:', err);
        } finally {
            setLoading(false);
        }
    }, [selectedCourseId]);

    useEffect(() => {
        fetchAllData();
    }, [fetchAllData]);

    return (
        <div className="min-h-[calc(100vh-56px)] bg-surface-950 text-slate-100 p-4 md:p-6 space-y-4 font-sans">
            {/* ── Top Context Bar: Cohort Switcher & Quick Search ─────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-edge/10">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-primary-500/10 text-primary-500 flex items-center justify-center">
                        <Users className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                                Cohort Console
                            </span>
                            <span className="text-gray-500">—</span>
                            <div className="relative inline-block">
                                <select
                                    value={selectedCourseId}
                                    onChange={(e) => setSelectedCourseId(e.target.value)}
                                    className="appearance-none bg-surface-900 border border-edge/20 text-heading font-bold text-sm rounded-lg px-3 py-1 pr-8 focus:outline-none focus:border-primary-500 cursor-pointer shadow-sm"
                                >
                                    {courses.length > 0 ? (
                                        courses.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.title}
                                            </option>
                                        ))
                                    ) : (
                                        <option value="">FIN-511 Section A</option>
                                    )}
                                </select>
                                <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                            Evaluate student execution process, monitor cohort performance, and manage academic diagnostics.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative flex-1 sm:w-64">
                        <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Search students, concepts..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface-900 border border-edge/20 text-xs text-heading placeholder-gray-500 focus:outline-none focus:border-primary-500 font-sans"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={fetchAllData}
                        className="p-2 rounded-lg bg-surface-900 border border-edge/20 text-gray-400 hover:text-heading hover:bg-surface-800 transition-colors"
                        title="Refresh cohort analytics"
                    >
                        <RefreshCw className={cn("w-4 h-4", loading && "animate-spin text-primary-500")} />
                    </button>
                </div>
            </div>

            {/* ── 1. Top Stat Row with Sparklines (5 KPIs) ────────────────────────── */}
            <CohortStatRow data={overviewData} isLoading={loading} />

            {/* ── 2. Upper Grid: Process Standings vs At-Risk & Behaviour ──────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Left (7 cols): Process-Weighted Standings Table & Insight Banner */}
                <div className="lg:col-span-7 flex flex-col">
                    <StandingsTable
                        data={standingsData}
                        isLoading={loading}
                    />
                </div>

                {/* Right (5 cols): At-Risk Learners + Behaviour Distribution */}
                <div className="lg:col-span-5 space-y-4">
                    <AtRiskList
                        data={atRiskData}
                        isLoading={loading}
                    />
                    <BehaviourDistribution
                        data={behaviourData}
                        isLoading={loading}
                    />
                </div>
            </div>

            {/* ── 3. Lower Grid: Mastery Heatmap + Weak Concepts ───────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Left (8 cols): Cohort Mastery Heatmap */}
                <div className="lg:col-span-8">
                    <MasteryHeatmap
                        data={heatmapData}
                        isLoading={loading}
                    />
                </div>

                {/* Right (4 cols): Weakest Concepts List with 1-Click Remediation */}
                <div className="lg:col-span-4">
                    <WeakConceptList
                        data={weakConceptsData}
                        isLoading={loading}
                        onOpenRemediationModal={() => setRemediationModalOpen(true)}
                    />
                </div>
            </div>

            {/* ── Remediation Assignment Modal ────────────────────────────────────── */}
            <RemediationModal
                isOpen={remediationModalOpen}
                onClose={() => setRemediationModalOpen(false)}
                weakConcepts={weakConceptsData?.weak_concepts || []}
                onSuccess={fetchAllData}
            />
        </div>
    );
}
