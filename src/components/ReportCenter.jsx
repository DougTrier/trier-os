// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Report Center
 * =========================
 * Centralized reporting hub with pre-built report templates and custom query
 * builder access. The go-to destination for operations reports, compliance
 * summaries, cost analysis, and performance reviews.
 *
 * KEY FEATURES:
 *   - Template library: 20+ pre-built report templates organized by domain
 *   - Report categories: PM Compliance, Cost Analysis, Asset Reliability,
 *     Technician Performance, Parts Usage, Downtime, Safety, Compliance
 *   - Run report: execute any template with configurable date range and plant filter
 *   - Preview: paginated results with column sort before export
 *   - Export: CSV download or print-ready PDF via print dialog
 *   - Scheduled delivery: configure email delivery on daily/weekly/monthly cadence
 *   - Custom builder: ReportBuilder integration for ad-hoc queries
 *   - Natural language search: type "PM compliance last month" to find the right template
 *
 * API CALLS:
 *   GET  /api/reports/templates         — List available report templates
 *   POST /api/reports/run               — Execute report with parameters
 *   GET  /api/reports/scheduled         — List scheduled report jobs
 *   POST /api/reports/scheduled         — Create a scheduled delivery
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FileText, Play, ChevronRight, ChevronLeft, Download, Printer, Search, ArrowLeft, Loader2, AlertTriangle, Sparkles, X, Compass } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

/* ═══════════════════════════════════════════════════════════
   DYNAMIC REPORTS - GUIDED TOUR STEPS
   ═══════════════════════════════════════════════════════════ */
const REPORT_TOUR_STEPS = [
    {
        target: null,
        title: '📊 Welcome to Dynamic Reports',
        body: 'This is your custom reporting engine. You can build and run reports from any data in the system — work orders, assets, parts, costs, and more. This quick tour will show you how!',
        position: 'center',
        icon: '📊'
    },
    {
        targetId: 'report-search-bar',
        title: '🔍 Search Reports',
        body: 'Start here! Type any keyword like "cost", "asset", or "labor" to instantly filter the report categories below. All reports are searchable by name.',
        position: 'bottom',
        icon: '🔍'
    },
    {
        targetId: 'report-categories-grid',
        title: '📁 Report Categories',
        body: 'Reports are organized into logical groups: Maintenance Operations, Asset Management, Inventory & Parts, and System & Audit. Click any report name to run it instantly.',
        position: 'top',
        icon: '📁'
    },
    {
        targetId: 'report-category-0',
        title: '▶️ Running a Report',
        body: 'Simply click on any report name (like "Work Order Summary") and it will execute immediately. The results will appear in a full data table you can scroll, sort, and explore.',
        position: 'right',
        icon: '▶️'
    },
    {
        target: null,
        title: '📋 Results View',
        body: 'Once a report runs, you\'ll see a full data grid with every column. You can edit any cell inline by clicking the "Edit" button on each row. Changes save directly to the database.',
        position: 'center',
        icon: '📋'
    },
    {
        target: null,
        title: '📤 Export & Print',
        body: 'After running a report, you get three export options:\n• CSV — Downloads a spreadsheet file\n• PDF — Opens a printer-friendly view\n• Print — Sends to your Trier OS print engine\n\nAll exports include the full dataset.',
        position: 'center',
        icon: '📤'
    },
    {
        target: null,
        title: '⚙️ Dynamic Parameters',
        body: 'Some reports (marked "Dynamic") show a Parameters sidebar where you can filter by date range, group results by column, and hide legacy data. Click "Update Results" to re-run with new settings.',
        position: 'center',
        icon: '⚙️'
    },
    {
        target: null,
        title: '🎉 You\'re Ready!',
        body: 'That\'s everything! Start by clicking any report to see your data. Remember:\n\n• Use Search to find reports fast\n• Click any row\'s Edit to make changes inline\n• Export to CSV for spreadsheets\n• You can replay this tour anytime with the compass button',
        position: 'center',
        icon: '🚀',
        isFinal: true
    }
];

const getReportTourKey = () => {
    const username = localStorage.getItem('username') || 'default';
    return `pf_report_tour_complete_${username}`;
};

export default function ReportCenter({ plantId }) {
    const { t } = useTranslation();
    const [categories, setCategories] = useState([]);
    const [selectedReport, setSelectedReport] = useState(null);
    const [reportData, setReportData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [running, setRunning] = useState(false);
    const [search, setSearch] = useState('');
    const [editingRowIndex, setEditingRowIndex] = useState(null);
    const [editValues, setEditValues] = useState({});
    const [saving, setSaving] = useState(false);
    
    // Dynamic Engine State
    const [manifest, setManifest] = useState({});
    const [dynamicParams, setDynamicParams] = useState({
        filters: {},
        dateRange: { start: '', end: '' },
        dateField: '',
        group: '',
        sort: { field: 'ID', direction: 'ASC' },
        pagination: { page: 1, limit: 100 },
        hideLegacy: false
    });

    // ═══════ GUIDED TOUR STATE ═══════
    const [tourActive, setTourActive] = useState(false);
    const [tourStep, setTourStep] = useState(0);
    const [tourTargetRect, setTourTargetRect] = useState(null);
    const [tourTooltipPos, setTourTooltipPos] = useState({ top: 0, left: 0 });
    const tourTooltipRef = useRef(null);
    const tourAnimRef = useRef(null);

    // Auto-show tour for first-time visitors
    useEffect(() => {
        const completed = localStorage.getItem(getReportTourKey());
        if (!completed && categories.length > 0 && !reportData) {
            const timer = setTimeout(() => setTourActive(true), 800);
            return () => clearTimeout(timer);
        }
    }, [categories, reportData]);

    const currentTourStep = REPORT_TOUR_STEPS[tourStep];

    // Find and track target element
    const findTourTarget = useCallback(() => {
        if (!currentTourStep || currentTourStep.position === 'center' || !currentTourStep.targetId) {
            setTourTargetRect(null);
            return;
        }
        const el = document.getElementById(currentTourStep.targetId);
        if (el) {
            const rect = el.getBoundingClientRect();
            setTourTargetRect({
                top: rect.top - 8, left: rect.left - 8,
                width: rect.width + 16, height: rect.height + 16
            });
        } else {
            setTourTargetRect(null);
        }
    }, [currentTourStep]);

    useEffect(() => {
        if (!tourActive) return;
        const tick = () => {
            findTourTarget();
            tourAnimRef.current = requestAnimationFrame(tick);
        };
        const timer = setTimeout(tick, 100);
        return () => { clearTimeout(timer); if (tourAnimRef.current) cancelAnimationFrame(tourAnimRef.current); };
    }, [tourActive, tourStep, findTourTarget]);

    // Position tooltip
    useEffect(() => {
        if (!tourActive || !tourTooltipRef.current) return;
        const tooltip = tourTooltipRef.current;
        const tW = 380, tH = tooltip.offsetHeight || 200, pad = 16;
        const vw = window.innerWidth, vh = window.innerHeight;

        if (!tourTargetRect || currentTourStep?.position === 'center') {
            setTourTooltipPos({ top: Math.max(pad, (vh - tH) / 2), left: Math.max(pad, (vw - tW) / 2) });
            return;
        }
        let top, left;
        const cx = tourTargetRect.left + tourTargetRect.width / 2;
        if (currentTourStep?.position === 'top') {
            top = tourTargetRect.top - tH - 16;
            left = cx - tW / 2;
        } else if (currentTourStep?.position === 'right') {
            top = tourTargetRect.top;
            left = tourTargetRect.left + tourTargetRect.width + 16;
        } else {
            top = tourTargetRect.top + tourTargetRect.height + 16;
            left = cx - tW / 2;
        }
        if (top + tH > vh - pad) top = tourTargetRect.top - tH - 16;
        left = Math.max(pad, Math.min(left, vw - tW - pad));
        top = Math.max(pad, Math.min(top, vh - tH - pad));
        setTourTooltipPos({ top, left });
    }, [tourTargetRect, tourActive, tourStep, currentTourStep]);

    const tourNext = () => {
        if (tourStep + 1 >= REPORT_TOUR_STEPS.length) tourComplete();
        else setTourStep(tourStep + 1);
    };
    const tourPrev = () => { if (tourStep > 0) setTourStep(tourStep - 1); };
    const tourComplete = () => {
        localStorage.setItem(getReportTourKey(), 'true');
        setTourActive(false); setTourStep(0);
    };
    const tourDismiss = () => {
        localStorage.setItem(getReportTourKey(), 'true');
        setTourActive(false); setTourStep(0);
    };
    const tourReplay = () => { setTourStep(0); setTourActive(true); };

    const tourProgressPct = ((tourStep + 1) / REPORT_TOUR_STEPS.length) * 100;

    useEffect(() => {
        fetchReports();
        fetchManifest();
    }, []);

    const fetchManifest = async () => {
        try {
            const res = await fetch('/api/v2/reports/manifest', {
                headers: { 'x-plant-id': plantId }
            });
            const data = await res.json();
            setManifest(data);
        } catch (err) {
            console.error('Failed to fetch manifest:', err);
        }
    };

    const fetchReports = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/v2/reports', {
                headers: { 'x-plant-id': plantId }
            });
            const data = await res.json();
            setCategories(data);
        } catch (err) {
            console.error('Failed to fetch reports:', err);
        } finally {
            setLoading(false);
        }
    };

    const runReport = async (report) => {
        setSelectedReport(report);
        setRunning(true);
        setReportData(null); // Clear previous

        // Initialize Dynamic Params if it's a dynamic report or replacement
        let currentParams = dynamicParams;
        if (report.Type === 'DYNAMIC' || report.isReplacement) {
            const reportId = report.isReplacement ? report.mappedTo : report.ID;
            const meta = manifest[reportId];
            if (meta) {
                const dateField = meta.dateField || null;
                currentParams = {
                    ...dynamicParams,
                    dateField: dateField,
                    dateRange: (dateField && !dynamicParams.dateRange.start) ? {
                        start: '2008-01-01',
                        end: new Date().toISOString().split('T')[0]
                    } : dynamicParams.dateRange
                };
                setDynamicParams(currentParams);
            }
        }

        try {
            let res;
            const headers = { 
                'x-plant-id': plantId,
                'Content-Type': 'application/json' 
            };
            
            if (report.Type === 'DYNAMIC') {
                res = await fetch(`/api/v2/reports/dynamic/${report.ID}`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(currentParams)
                });
            } else {
                res = await fetch(`/api/v2/reports/${report.ID}${report.isReplacement ? '?isReplacement=true' : ''}`, {
                    headers
                });
            }
            const data = await res.json();
            
            // Dynamic Column Reordering
            if (data.data && data.data.length > 0) {
                const cols = data.columns.length > 0 ? data.columns : Object.keys(data.data[0]);
                
                // Tier 1: Core ID and Description
                const tier1Set = ['ID', 'DESCRIPTION'];
                // Tier 2: Specific Address Book / Contact priorities
                const tier2Set = ['TITLE', 'SADDR1', 'SCITY', 'SSTATE', 'SZIP', 'SCONTACT', 'SPHONE', 'SMOBILE'];
                
                const foundTier1 = cols.filter(c => tier1Set.includes(c.toUpperCase()));
                const foundTier2 = cols.filter(c => tier2Set.includes(c.toUpperCase()) && !tier1Set.includes(c.toUpperCase()));
                const remainingRaw = cols.filter(c => !tier1Set.includes(c.toUpperCase()) && !tier2Set.includes(c.toUpperCase()));

                // Within remaining, push "Zero/Empty" columns to the end
                const hasValueCols = remainingRaw.filter(col => {
                    return data.data.some(row => {
                        const val = row[col];
                        return val !== 0 && val !== '0' && val !== '' && val !== null && val !== undefined && val !== '--';
                    });
                });
                const emptyCols = remainingRaw.filter(col => !hasValueCols.includes(col));
                
                data.orderedColumns = [...foundTier1, ...foundTier2, ...hasValueCols, ...emptyCols];
            } else {
                data.orderedColumns = data.columns;
            }

            setReportData(data);
        } catch (err) {
            console.error('Failed to run report:', err);
        } finally {
            setRunning(false);
        }
    };

    const exportToExcel = () => {
        if (!reportData) return;
        const cols = reportData.orderedColumns;
        const csvContent = [
            cols.map(c => reportData.labels?.[c] || c).join(','),
            ...reportData.data.map(row => cols.map(c => `"${String(row[c] || '').replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        const reportName = reportData.meta?.Description || reportData.meta?.name || 'Report';
        link.setAttribute("download", `${reportName.replace(/\s+/g, '_')}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleEditJump = (row) => {
        const source = (reportData.sourceTable || '').toLowerCase();
        let targetTab = '';
        let searchVal = '';

        if (source.includes('work') || source.includes('wo')) {
            targetTab = 'jobs';
            searchVal = row.WorkOrderNumber || row.WONumber || row.ID;
        } else if (source.includes('asset') || source.includes('ast')) {
            targetTab = 'assets';
            searchVal = row.ID || row.AstID || row.Description;
        } else if (source.includes('part')) {
            targetTab = 'parts';
            searchVal = row.ID || row.PartID || row.Description;
        } else if (source.includes('addr') || source.includes('book')) {
            targetTab = 'directory';
            searchVal = row.DESCRIPTION || row.SCONTACT || row.ID;
        }

        if (targetTab) {
            // Set search and navigate using global keys
            localStorage.setItem('PF_NAV_TAB', targetTab);
            localStorage.setItem('PF_NAV_SEARCH', searchVal);
            window.location.href = `/${targetTab}?search=${searchVal}`;
        } else {
            window.trierToast?.error('Navigation for this specific data type is not yet optimized in Discovery Phase.');
        }
    };

    const handlePrint = () => {
        if (reportData) {
            window.triggerTrierPrint('report', reportData);
        }
    };

    const startEditing = (row, index) => {
        setEditingRowIndex(index);
        setEditValues({ ...row });
    };

    const cancelEditing = () => {
        setEditingRowIndex(null);
        setEditValues({});
    };

    const saveRow = async (rowIndex) => {
        setSaving(true);
        try {
            const row = reportData.data[rowIndex];
            const updates = [];
            
            // Identify which columns were changed
            for (const col of reportData.orderedColumns) {
                if (editValues[col] !== row[col]) {
                    updates.push({
                        table: reportData.sourceTable,
                        id: row.ID,
                        column: col,
                        value: editValues[col]
                    });
                }
            }

            if (updates.length === 0) {
                cancelEditing();
                return;
            }

            // Perform sequential updates (or we could Batch if we had a batch route)
            for (const up of updates) {
                const res = await fetch('/api/v2/reports/update', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(up)
                });
                if (!res.ok) throw new Error('Update failed');
            }

            // Refresh report data
            const res = await fetch(`/api/v2/reports/${selectedReport.ID}`);
            const newData = await res.json();
            
            // Re-apply column ordering
            const cols = newData.columns.length > 0 ? newData.columns : Object.keys(newData.data[0]);
            newData.orderedColumns = reportData.orderedColumns; // Keep same order
            setReportData(newData);
            
            cancelEditing();
        } catch (err) {
            console.error('Failed to save row:', err);
            window.trierToast?.error('Failed to save changes: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="glass-card" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Loader2 className="animate-spin" size={48} color="var(--primary)" />
            </div>
        );
    }

    if (reportData) {
        if (reportData.error) {
            return (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div className="glass-card" style={{ padding: '40px', textAlign: 'center' }}>
                        <AlertTriangle size={48} color="#ef4444" style={{ marginBottom: '15px' }} />
                        <h3 style={{ color: '#ef4444' }}>{t('report.center.reportFailure')}</h3>
                        <p>{reportData.error}</p>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{reportData.details}</p>
                        <button onClick={() => setReportData(null)} className="btn-primary" style={{ marginTop: '20px' }} title={t('reports.returnToTheReportListTip')}>
                            <ArrowLeft size={16} /> {t('report.center.returnToReportList')}
                        </button>
                    </div>
                </div>
            );
        }

        const aggregates = reportData.aggregates || {};

        return (
            <div style={{ flex: 1, display: 'flex', gap: '20px', overflow: 'hidden' }}>
                {/* Dynamic Sidebar */}
                {selectedReport?.Type === 'DYNAMIC' && (
                    <div className="glass-card no-print" style={{ width: '280px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px', overflowY: 'auto' }}>
                        <h3 style={{ fontSize: '1rem', color: 'var(--primary)', marginBottom: '10px' }}>{t('report.center.reportParameters')}</h3>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {dynamicParams.dateField && (
                                <>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('report.center.dateRange')}</label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                        <input 
                                            type="date" 
                                            className="search-input" 
                                            value={dynamicParams.dateRange.start}
                                            onChange={e => setDynamicParams({...dynamicParams, dateRange: {...dynamicParams.dateRange, start: e.target.value}})}
                                            title={t('reports.startDateForTheReportTip')}
                                        />
                                        <input 
                                            type="date" 
                                            className="search-input" 
                                            value={dynamicParams.dateRange.end}
                                            onChange={e => setDynamicParams({...dynamicParams, dateRange: {...dynamicParams.dateRange, end: e.target.value}})}
                                            title={t('reports.endDateForTheReportTip')}
                                        />
                                    </div>
                                </>
                            )}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('report.center.groupBy')}</label>
                            <select 
                                className="search-input"
                                value={dynamicParams.group}
                                onChange={e => setDynamicParams({...dynamicParams, group: e.target.value})}
                                title={t('reports.groupReportResultsByThisTip')}
                            >
                                <option value="">{t('report.center.noGrouping')}</option>
                                {reportData.columns.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>

                        {(selectedReport?.ID === 'COST' || selectedReport?.ID === 'ASSET_BURN') && (
                            <div style={{ padding: '10px', background: 'rgba(59,130,246,0.05)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <input 
                                    type="checkbox" 
                                    id="hideLegacy"
                                    checked={dynamicParams.hideLegacy}
                                    onChange={e => setDynamicParams({...dynamicParams, hideLegacy: e.target.checked})}
                                    title={t('reports.filterOutRecordsWithZeroTip')}
                                />
                                <label htmlFor="hideLegacy" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary)', cursor: 'pointer' }}>
                                    {t('report.center.hideLegacyZerocostData')}
                                </label>
                            </div>
                        )}

                        <button className="btn-primary" onClick={() => runReport(selectedReport)} disabled={running} title={t('reports.rerunTheReportWithUpdatedTip')}>
                            {running ? <Loader2 size={16} className="animate-spin" /> : 'Update Results'}
                        </button>
                    </div>
                )}

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', overflow: 'hidden' }}>
                    <div className="glass-card no-print" style={{ padding: '15px 25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <button onClick={() => setReportData(null)} className="btn-nav" title={t('reports.returnToTheReportListTip')}>
                                <ArrowLeft size={16} /> {t('report.center.back')}
                            </button>
                            <div>
                                <h2 style={{ fontSize: '1.2rem', margin: 0, color: 'var(--primary)' }}>
                                    {reportData.meta?.Description || reportData.meta?.name || 'Historical Report'}
                                </h2>
                                {selectedReport?.isReplacement && <span style={{ fontSize: '0.7rem', color: 'var(--accent)' }}>{t('report.center.modernizedReplacement')}</span>}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button className="btn-save" onClick={exportToExcel} style={{ display: 'flex', alignItems: 'center', gap: '8px' }} title={t('reports.downloadReportDataAsCsvTip')}>
                                <Download size={16} /> {t('report.center.csv')}
                            </button>
                            <button className="btn-primary" onClick={() => {
                                if (!reportData) return;
                                const cols = reportData.orderedColumns;
                                const reportName = reportData.meta?.Description || 'Report';
                                const w = window.open('', '_blank');
                                w.document.write(`<html><head><title>${reportName}</title>
                                <style>
                                    body { font-family: Arial, sans-serif; margin: 20px; background: #fff; color: #000; }
                                    h1 { font-size: 18px; border-bottom: 2px solid #333; padding-bottom: 8px; }
                                    .meta { font-size: 11px; color: #666; margin-bottom: 15px; }
                                    table { border-collapse: collapse; width: 100%; font-size: 11px; }
                                    th { background: #1e293b; color: #fff; padding: 6px 8px; text-align: left; }
                                    td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
                                    tr:nth-child(even) { background: #f8fafc; }
                                    .footer { margin-top: 15px; font-size: 10px; color: #999; text-align: right; }
                                    @media print { body { margin: 0; } }
                                </style>
                                </head><body>
                                <h1>📋 ${reportName}</h1>
                                <div class="meta">Plant: ${localStorage.getItem('selectedPlantId') || 'All'} | Generated: ${new Date().toLocaleString()} | Records: ${reportData.data?.length || 0}</div>
                                <table><thead><tr>${cols.map(c => `<th>${reportData.labels?.[c] || c}</th>`).join('')}</tr></thead>
                                <tbody>${(reportData.data || []).map(row => 
                                    `<tr>${cols.map(c => `<td>${row[c] === null ? '--' : row[c]}</td>`).join('')}</tr>`
                                ).join('')}</tbody></table>
                                <div class="footer">Trier OS — ${reportName}</div>
                                </body></html>`);
                                w.document.close();
                                setTimeout(() => { w.print(); }, 500);
                            }} style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', display: 'flex', alignItems: 'center', gap: '8px' }} title={t('reports.openAPrinterfriendlyPdfViewTip')}>
                                <FileText size={16} /> {t('report.center.pdf')}
                            </button>
                            <button className="btn-primary" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: '8px' }} title={t('reports.printThisReportTip')}>
                                <Printer size={16} /> {t('report.center.print')}
                            </button>
                        </div>
                    </div>

                <div className="glass-card" style={{ flex: 1, overflow: 'auto', padding: '0', background: 'rgba(0,0,0,0.2)' }}>
                    <table className="data-table" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 100 }}>
                            <tr>
                                <th style={{ 
                                    position: 'sticky', 
                                    top: 0, 
                                    left: 0, 
                                    zIndex: 110, 
                                    background: '#1e293b', 
                                    borderBottom: '2px solid var(--primary)',
                                    width: '80px',
                                    textAlign: 'center'
                                }}>Edit</th>
                                {reportData.orderedColumns.map(col => (
                                    <th key={col} style={{ 
                                        position: 'sticky', 
                                        top: 0, 
                                        background: '#1e293b', 
                                        borderBottom: '2px solid var(--primary)',
                                        whiteSpace: 'nowrap',
                                        minWidth: '150px',
                                        padding: '12px 15px',
                                        textAlign: 'left'
                                    }}>
                                        {(reportData.labels?.[col]) || col}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {reportData.data?.map((row, idx) => {
                                const isEditing = editingRowIndex === idx;
                                return (
                                    <tr key={idx} className={isEditing ? "" : "asset-row-hover"}>
                                        <td style={{ 
                                            position: 'sticky', 
                                            left: 0, 
                                            zIndex: 50, 
                                            background: isEditing ? 'rgba(99, 102, 241, 0.2)' : 'rgba(30, 41, 59, 0.95)', 
                                            borderRight: '2px solid var(--primary)',
                                            textAlign: 'center',
                                            padding: '8px'
                                        }}>
                                            {isEditing ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                                    <button                                                         className="btn-primary" 
                                                        onClick={() => saveRow(idx)}
                                                        disabled={saving}
                                                        style={{ padding: '4px 8px', fontSize: '0.65rem', background: '#10b981' }}
                                                        title={t('reports.saveChangesToThisRowTip')}
                                                    >
                                                        {saving ? '...' : 'SAVE'}
                                                    </button>
                                                    <button 
                                                        onClick={cancelEditing}
                                                        disabled={saving}
                                                        style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '0.65rem', cursor: 'pointer' }}
                                                        title={t('reports.discardChangesTip')}
                                                    >
                                                        {t('report.center.cancel')}
                                                    </button>
                                                </div>
                                            ) : (
                                                <button                                                     className="btn-primary" 
                                                    onClick={() => startEditing(row, idx)}
                                                    style={{ 
                                                        padding: '4px 10px', 
                                                        fontSize: '0.7rem', 
                                                        borderRadius: '6px',
                                                        background: 'rgba(99, 102, 241, 0.2)',
                                                        border: '1px solid var(--primary)',
                                                        color: '#fff'
                                                    }}
                                                    title={t('reports.editThisRowInlineTip')}
                                                >
                                                    {t('report.center.edit')}
                                                </button>
                                            )}
                                        </td>
                                        {reportData.orderedColumns.map(col => (
                                            <td key={col} style={{ 
                                                fontSize: '0.85rem', 
                                                borderRight: '1px solid rgba(255,255,255,0.05)',
                                                whiteSpace: 'nowrap',
                                                padding: isEditing ? '5px' : '10px 15px'
                                            }}>
                                                {isEditing && col.toUpperCase() !== 'ID' ? (
                                                    <input 
                                                        type="text"
                                                        value={editValues[col] || ''}
                                                        onChange={e => setEditValues({ ...editValues, [col]: e.target.value })}
                                                        style={{ 
                                                            width: '100%', 
                                                            background: 'rgba(0,0,0,0.5)', 
                                                            border: '1px solid var(--primary)',
                                                            padding: '4px 8px',
                                                            fontSize: '0.85rem'
                                                        }}
                                                        title={`Edit value for ${reportData.labels?.[col] || col}`}
                                                    />
                                                ) : (
                                                    row[col] === null ? '--' : 
                                                    (typeof row[col] === 'number' || (String(col).toLowerCase().includes('cost') || String(col).toLowerCase().includes('spend'))) ? (() => {
                                                        const colLower = String(col).toLowerCase();
                                                        const isCostCol = colLower.includes('cost') || colLower.includes('spend');
                                                        // Only mask labor PAY RATE columns (pay, rate) — not inventory costs or general cost totals
                                                        const isPayRateCol = colLower.includes('pay') || colLower === 'rate' || colLower.includes('payrate');
                                                        const shouldMask = isPayRateCol && 
                                                            localStorage.getItem('userRole') !== 'it_admin' && 
                                                            localStorage.getItem('nativePlantId') && 
                                                            localStorage.getItem('selectedPlantId') !== localStorage.getItem('nativePlantId');
                                                        
                                                        if (shouldMask) return '****';
                                                        return Number(row[col] || 0).toLocaleString(undefined, { 
                                                            style: isCostCol ? 'currency' : 'decimal',
                                                            currency: 'USD',
                                                            minimumFractionDigits: 2, 
                                                            maximumFractionDigits: 2 
                                                        });
                                                    })() :
                                                    String(row[col])
                                                )}
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {(!reportData.data || reportData.data.length === 0) && (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            {t('report.center.noDataFoundFor')}
                        </div>
                    )}
                </div>
                <div className="no-print" style={{ padding: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.3)', borderRadius: '0 0 12px 12px' }}>
                    <div style={{ display: 'flex', gap: '20px' }}>
                        {Object.entries(aggregates).map(([col, val]) => (
                            <div key={col} style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total {col}</span>
                                <span style={{ fontSize: '0.9rem', color: 'var(--primary)', fontWeight: 'bold' }}>
                                    {typeof val === 'number' ? val.toLocaleString(undefined, { minimumFractionDigits: 2 }) : val}
                                </span>
                            </div>
                        ))}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Source: {reportData.sourceTable || selectedReport?.ID} | Records: {reportData.data?.length || 0}
                    </div>
                </div>
            </div>
        </div>
        );
    }

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', overflow: 'hidden' }}>
            <div className="glass-card" style={{ padding: '15px 25px', display: 'flex', gap: '20px', alignItems: 'center' }}>
                <div id="report-search-bar" style={{ position: 'relative', flex: 1 }}>
                    <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
                    <input 
                        type="text" 
                        placeholder={t('report.center.searchConsolidatedReportsEg')} 
                        className="search-input"
                        style={{ width: '100%', paddingLeft: '40px' }}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        title={t('reports.searchForReportsByNameTip')}
                    />
                </div>
                <button 
                    onClick={tourReplay} 
                    className="btn-nav" 
                    title={t('reports.takeAGuidedTourOfTip')}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '36px', whiteSpace: 'nowrap', background: 'linear-gradient(135deg, rgba(129,140,248,0.15), rgba(99,102,241,0.15))', border: '1px solid rgba(129,140,248,0.3)', color: '#818cf8' }}
                >
                    <Compass size={16} /> Take a Tour
                </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '5px' }}>
                <div id="report-categories-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
                    {categories.map(cat => {
                        const filteredReports = cat.reports.filter(r => 
                            r.Description.toLowerCase().includes(search.toLowerCase())
                        );
                        if (filteredReports.length === 0) return null;

                        return (
                            <div key={cat.ID} id={`report-category-${categories.indexOf(cat)}`} className="glass-card" style={{ padding: '20px', border: '1px solid var(--glass-border)' }}>
                                <h3 style={{ fontSize: '1rem', color: 'var(--primary)', marginBottom: '15px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <FileText size={18} /> {cat.Description}
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {filteredReports.map(rpt => (
                                        <div 
                                            key={rpt.ID} 
                                            className="asset-row-hover"
                                            onClick={() => runReport(rpt)}
                                            style={{ 
                                                display: 'flex', 
                                                justifyContent: 'space-between', 
                                                alignItems: 'center', 
                                                padding: '10px 12px', 
                                                background: 'rgba(255,255,255,0.05)', 
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontSize: '0.9rem', color: '#fff' }}>{rpt.Description}</span>
                                                {rpt.isReplacement && <span style={{ fontSize: '0.65rem', color: 'var(--primary)', fontWeight: 'bold' }}>{t('report.center.modernizedReplacement')}</span>}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                {running && selectedReport?.ID === rpt.ID ? (
                                                    <Loader2 className="animate-spin" size={14} color="var(--primary)" />
                                                ) : (
                                                    <Play size={14} color="var(--primary)" />
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            {/* ═══════ GUIDED TOUR OVERLAY ═══════ */}
            {tourActive && currentTourStep && (<>
                {/* Dark overlay with cutout */}
                <div style={{ position: 'fixed', inset: 0, zIndex: 99990, pointerEvents: 'none' }}>
                    <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
                        <defs>
                            <mask id="report-tour-mask">
                                <rect width="100%" height="100%" fill="white" />
                                {tourTargetRect && <rect x={tourTargetRect.left} y={tourTargetRect.top} width={tourTargetRect.width} height={tourTargetRect.height} rx="12" fill="black" />}
                            </mask>
                        </defs>
                        <rect width="100%" height="100%" fill="rgba(0,0,0,0.75)" mask="url(#report-tour-mask)" />
                    </svg>
                    {tourTargetRect && (
                        <div style={{
                            position: 'absolute', top: tourTargetRect.top, left: tourTargetRect.left,
                            width: tourTargetRect.width, height: tourTargetRect.height,
                            borderRadius: '12px', border: '2px solid #818cf8',
                            boxShadow: '0 0 20px rgba(129,140,248,0.5), 0 0 40px rgba(129,140,248,0.2)',
                            animation: 'tourPulse 2s ease-in-out infinite', pointerEvents: 'none'
                        }} />
                    )}
                </div>
                {/* Click backdrop to dismiss */}
                <div onClick={tourDismiss} style={{ position: 'fixed', inset: 0, zIndex: 99991, cursor: 'pointer' }} />
                {/* Tooltip */}
                <div ref={tourTooltipRef} onClick={e => e.stopPropagation()} style={{
                    position: 'fixed', top: tourTooltipPos.top, left: tourTooltipPos.left, zIndex: 99992,
                    width: '380px', background: 'linear-gradient(145deg, #1e293b, #0f172a)',
                    border: '2px solid rgba(129,140,248,0.4)', borderRadius: '16px', padding: '24px',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 30px rgba(129,140,248,0.15)',
                    transition: 'top 0.3s ease, left 0.3s ease', cursor: 'default'
                }}>
                    <button onClick={tourDismiss} style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }} title={t('reports.skipThisTourTip')}>
                        <X size={16} />
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                        <div style={{ fontSize: '2rem', width: 50, height: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(129,140,248,0.1)', borderRadius: 14, border: '1px solid rgba(129,140,248,0.2)', flexShrink: 0 }}>
                            {currentTourStep.icon}
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#f1f5f9', fontWeight: 700 }}>{currentTourStep.title}</h3>
                            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 2 }}>Step {tourStep + 1} of {REPORT_TOUR_STEPS.length}</div>
                        </div>
                    </div>
                    <p style={{ margin: '0 0 20px 0', fontSize: '0.9rem', lineHeight: 1.5, color: '#cbd5e1', whiteSpace: 'pre-line' }}>{currentTourStep.body}</p>
                    <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', marginBottom: 16, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${tourProgressPct}%`, background: 'linear-gradient(90deg, #818cf8, #6366f1)', borderRadius: 2, transition: 'width 0.4s ease' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <button onClick={tourDismiss} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.8rem', padding: '6px 0' }} title="Skip this tour">Skip Tour</button>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {tourStep > 0 && (
                                <button onClick={tourPrev} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 16px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }} title={t('reports.previousStepTip')}>
                                    <ChevronLeft size={16} /> Back
                                </button>
                            )}
                            <button onClick={currentTourStep.isFinal ? tourComplete : tourNext} style={{
                                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', borderRadius: 8,
                                background: currentTourStep.isFinal ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
                                border: 'none', color: '#fff', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                                boxShadow: currentTourStep.isFinal ? '0 4px 15px rgba(16,185,129,0.3)' : '0 4px 15px rgba(99,102,241,0.3)'
                            }} title={currentTourStep.isFinal ? 'Finish the tour' : 'Next step'}>
                                {currentTourStep.isFinal ? 'Got It!' : 'Next'}
                                {!currentTourStep.isFinal && <ChevronRight size={16} />}
                                {currentTourStep.isFinal && <Sparkles size={16} />}
                            </button>
                        </div>
                    </div>
                </div>
                <style>{`
                    @keyframes tourPulse {
                        0%, 100% { box-shadow: 0 0 20px rgba(129,140,248,0.5), 0 0 40px rgba(129,140,248,0.2); }
                        50% { box-shadow: 0 0 30px rgba(129,140,248,0.7), 0 0 60px rgba(129,140,248,0.3); }
                    }
                `}</style>
            </>)}
        </div>
    );
}
