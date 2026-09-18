import { useCallback, useEffect, useState } from 'react';
import { Calendar, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import facultyApi from '../../services/facultyApi';

export default function PracticeWindowCard() {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [minDate, setMinDate] = useState('');
    const [maxDate, setMaxDate] = useState('');
    const [availableDates, setAvailableDates] = useState([]);
    const [windowInfo, setWindowInfo] = useState(null);
    const [downloadInfo, setDownloadInfo] = useState(null);
    const [savingWindow, setSavingWindow] = useState(false);
    const [assignedCount, setAssignedCount] = useState(0);

    const loadPracticeWindow = useCallback(async () => {
        try {
            const [winRes, datesRes] = await Promise.all([
                facultyApi.getPracticeWindow(),
                facultyApi.listPracticeDates(),
            ]);
            const window = winRes.data?.window;
            setWindowInfo(window);
            setDownloadInfo(winRes.data?.download);
            setAssignedCount(winRes.data?.assigned_student_count || 0);
            if (window?.start_date) setStartDate(window.start_date);
            if (window?.end_date) setEndDate(window.end_date);
            setMinDate(datesRes.data?.min_date || '');
            setMaxDate(datesRes.data?.max_date || '');
            setAvailableDates(datesRes.data?.dates || []);
        } catch (err) {
            console.error('Failed to load practice window:', err);
        }
    }, []);

    useEffect(() => {
        loadPracticeWindow();
    }, [loadPracticeWindow]);

    const handleSaveWindow = async () => {
        if (!startDate || !endDate) {
            toast.error('Select a start and end date');
            return;
        }
        setSavingWindow(true);
        try {
            const { data } = await facultyApi.setPracticeWindow(startDate, endDate);
            setWindowInfo(data?.window);
            setDownloadInfo(data?.download || data?.window?.download);
            toast.success(data?.message || 'Practice window assigned to your students');
            loadPracticeWindow();
        } catch (err) {
            toast.error(err?.response?.data?.detail || err?.message || 'Could not save practice dates');
        } finally {
            setSavingWindow(false);
        }
    };

    const availableCount = availableDates.filter((d) => d.available).length;
    const selectedUnavailable = availableDates.filter(
        (d) => startDate && endDate && d.date >= startDate && d.date <= endDate && !d.available
    ).length;

    return (
        <div className="rounded-xl border border-edge/15 bg-surface-900/70 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-primary-500" />
                    <div>
                        <h3 className="text-sm font-bold text-heading">Practice date range</h3>
                        <p className="text-[11px] text-gray-500">
                            Assign a historical window (last 1 year) to your {assignedCount} assigned student{assignedCount === 1 ? '' : 's'}.
                            Missing days download from Zebu; empty days stay unavailable.
                        </p>
                    </div>
                </div>
                {windowInfo?.status === 'active' && (
                    <span className="text-[11px] font-semibold text-emerald-400">
                        Active {windowInfo.start_date} → {windowInfo.end_date}
                        {windowInfo.current_date ? ` · replaying ${windowInfo.current_date}` : ''}
                    </span>
                )}
            </div>
            <div className="flex flex-wrap items-end gap-3">
                <label className="text-xs text-gray-400">
                    From
                    <input
                        type="date"
                        min={minDate}
                        max={maxDate || endDate}
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="mt-1 block px-3 py-1.5 rounded-lg bg-surface-950 border border-edge/20 text-heading text-sm"
                    />
                </label>
                <label className="text-xs text-gray-400">
                    To
                    <input
                        type="date"
                        min={startDate || minDate}
                        max={maxDate}
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="mt-1 block px-3 py-1.5 rounded-lg bg-surface-950 border border-edge/20 text-heading text-sm"
                    />
                </label>
                <button
                    type="button"
                    onClick={handleSaveWindow}
                    disabled={savingWindow}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary-500/15 text-primary-400 text-xs font-semibold border border-primary-500/30 hover:bg-primary-500/25 disabled:opacity-50"
                >
                    {savingWindow ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    Assign to students
                </button>
                <span className="text-[11px] text-gray-500">
                    {availableCount} stored day{availableCount === 1 ? '' : 's'} in the last year
                    {selectedUnavailable > 0 ? ` · ${selectedUnavailable} selected day(s) need download` : ''}
                    {downloadInfo?.status && downloadInfo.status !== 'idle' ? ` · download: ${downloadInfo.status}` : ''}
                </span>
            </div>
        </div>
    );
}
