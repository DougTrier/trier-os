// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Custom Report Builder
 * ==================================
 * Ad-hoc report builder where users define data sources, columns, filters,
 * groupings, and sort orders to generate custom reports on demand.
 *
 * KEY FEATURES:
 *   - Data source picker: Work Orders, Assets, Parts, PMs, Labor, Parts Usage
 *   - Column selector: drag-to-order available fields from the selected source
 *   - Filter builder: add multiple AND/OR filter conditions per field
 *   - Group by: aggregate rows by asset, technician, plant, or date period
 *   - Sort order: ascending/descending on any column
 *   - Preview: run query inline and see first 50 rows before exporting
 *   - Save report: store named report definitions for later re-use
 *   - Export: CSV download or print-ready PDF output
 *   - Saved reports list: access previously built reports with one click
 *
 * API CALLS:
 *   POST /api/report-builder/run       — Execute custom report query
 *   GET  /api/report-builder/saved     — List saved report definitions
 *   POST /api/report-builder/saved     — Save a report definition
 *   DELETE /api/report-builder/saved/:id — Delete a saved report
 *
 * @param {string} plantId — Plant context for data scoping
 */
import React, { useState, useEffect } from 'react';
import { BarChart3, Play, Save, Download, Trash2, Filter, Layers, X, FolderOpen } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

export default function ReportBuilder({ plantId }) {
    const { t } = useTranslation();
    const [fields, setFields] = useState({});
    const [source, setSource] = useState('work_orders');
    const [selectedFields, setSelectedFields] = useState([]);
    const [filters, setFilters] = useState([]);
    const [groupBy, setGroupBy] = useState('');
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);
    const [savedReports, setSavedReports] = useState([]);
    const [reportName, setReportName] = useState('');
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [showSaved, setShowSaved] = useState(false);
    const [error, setError] = useState('');

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        'x-plant-id': plantId
    };

    useEffect(() => { fetchFields(); fetchSaved(); }, []);

    const fetchFields = async () => {
        try {
            const res = await fetch('/api/report-builder/fields', { headers });
            const data = await res.json();
            setFields(data.sources || data || {});
        } catch (e) { setError('Failed to load field catalog'); }
    };

    const fetchSaved = async () => {
        try {
            const res = await fetch('/api/report-builder/saved', { headers });
            const data = await res.json();
            setSavedReports(data.reports || data || []);
        } catch (e) { console.warn('[ReportBuilder] caught:', e); }
    };

    const rawFields = fields[source];
    const sourceFields = Array.isArray(rawFields) ? rawFields : (rawFields && typeof rawFields === 'object' ? Object.keys(rawFields).map(k => ({ name: k, label: k })) : []);
    const SOURCES = [
        { id: 'work_orders', label: '📋 Work Orders', color: '#6366f1' },
        { id: 'assets', label: '⚙️ Assets', color: '#f59e0b' },
        { id: 'parts', label: '📦 Parts', color: '#10b981' },
        { id: 'pm_schedules', label: '🔧 PM Schedules', color: '#8b5cf6' }
    ];

    const OPERATORS = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'NOT LIKE'];

    const toggleField = (field) => {
        setSelectedFields(prev =>
            prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]
        );
    };

    const addFilter = () => {
        if (sourceFields.length === 0) return;
        setFilters([...filters, { field: sourceFields[0]?.name || '', operator: '=', value: '' }]);
    };

    const updateFilter = (idx, key, val) => {
        const nf = [...filters];
        nf[idx] = { ...nf[idx], [key]: val };
        setFilters(nf);
    };

    const removeFilter = (idx) => setFilters(filters.filter((_, i) => i !== idx));

    const handleGenerate = async () => {
        if (selectedFields.length === 0) { setError('Select at least one field'); return; }
        setLoading(true); setError(''); setResults(null);
        try {
            const res = await fetch('/api/report-builder/execute', {
                method: 'POST', headers,
                body: JSON.stringify({
                    source, fields: selectedFields,
                    filters: filters.filter(f => f.value),
                    groupBy: groupBy || undefined
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Query failed');
            setResults(data);
        } catch (e) { setError(e.message); }
        setLoading(false);
    };

    const handleSave = async () => {
        if (!reportName.trim()) return;
        try {
            await fetch('/api/report-builder/save', {
                method: 'POST', headers,
                body: JSON.stringify({
                    name: reportName, source, fields: selectedFields,
                    filters, groupBy
                })
            });
            setShowSaveDialog(false); setReportName('');
            fetchSaved();
            window.trierToast?.error('Report saved successfully!');
        } catch (e) { window.trierToast?.error('Save failed'); }
    };

    const handleLoad = (report) => {
        const config = typeof report.config === 'string' ? (() => { try { return JSON.parse(report.config); } catch { return null; } })() : report.config;
        setSource(config.source || 'work_orders');
        setSelectedFields(config.fields || []);
        setFilters(config.filters || []);
        setGroupBy(config.groupBy || '');
        setShowSaved(false);
    };

    const handleDeleteSaved = async (id) => {
        if (!await confirm('Delete this saved report?')) return;
        try {
            await fetch(`/api/report-builder/saved/${id}`, { method: 'DELETE', headers });
            fetchSaved();
        } catch (e) { console.warn('[ReportBuilder] caught:', e); }
    };

    const exportCSV = () => {
        if (!results?.data?.length) return;
        const cols = selectedFields.length > 0 ? selectedFields : Object.keys(results.data[0]);
        let csv = cols.join(',') + '\n';
        results.data.forEach(row => {
            csv += cols.map(c => {
                let val = String(row[c] ?? '');
                if (val.includes(',') || val.includes('"')) val = `"${val.replace(/"/g, '""')}"`;
                return val;
            }).join(',') + '\n';
        });
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `report_${source}_${new Date().toISOString().split('T')[0]}.csv`;
        a.click(); URL.revokeObjectURL(url);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0, fontSize: '1.2rem', color: '#fff' }}>
                    <BarChart3 size={22} color="#6366f1" /> {t('report.builder.customReportBuilder')}
                </h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => setShowSaved(!showSaved)} className="btn-secondary" style={{
                        padding: '6px 14px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '5px'
                    }} title={t('reportBuilder.toggleSavedReportTemplatesTip')}>
                        <FolderOpen size={14} /> Saved ({savedReports.length})
                    </button>
                </div>
            </div>

            {/* Saved Reports dropdown */}
            {showSaved && savedReports.length > 0 && (
                <div style={{
                    background: 'rgba(0,0,0,0.3)', borderRadius: '10px', border: '1px solid var(--glass-border)',
                    padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px'
                }}>
                    {savedReports.map(r => (
                        <div key={r.id} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '8px 12px', borderRadius: '6px', background: 'rgba(255,255,255,0.03)',
                            border: '1px solid var(--glass-border)'
                        }}>
                            <span style={{ fontSize: '0.85rem', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
                                onClick={() => handleLoad(r)}>{r.name}</span>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <button onClick={() => handleLoad(r)} className="btn-primary" style={{ padding: '3px 10px', fontSize: '0.65rem' }} title={`Load saved report "${r.name}"`}>{t('report.builder.load')}</button>
                                <button onClick={() => handleDeleteSaved(r.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '3px' }} title={`Delete saved report "${r.name}"`}>
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {error && (
                <div style={{
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: '8px', padding: '10px', fontSize: '0.8rem', color: '#ef4444'
                }}>{error}</div>
            )}

            {/* Source Selector */}
            <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>{t('report.builder.dataSource')}</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                    {SOURCES.map(s => (
                        <button key={s.id} onClick={() => { setSource(s.id); setSelectedFields([]); setFilters([]); setGroupBy(''); setResults(null); }}
                            style={{
                                flex: 1, padding: '8px 12px', borderRadius: '8px', cursor: 'pointer',
                                background: source === s.id ? `${s.color}15` : 'rgba(0,0,0,0.2)',
                                border: `1px solid ${source === s.id ? s.color + '55' : 'var(--glass-border)'}`,
                                color: source === s.id ? s.color : 'var(--text-muted)',
                                fontWeight: source === s.id ? 700 : 400, fontSize: '0.8rem'
                            }} title={`Use ${s.label} as the data source`}>
                            {s.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Field Selector + Filters */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                {/* Fields */}
                <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: '10px', border: '1px solid var(--glass-border)', padding: '12px' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fff', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Layers size={14} /> Select Fields ({selectedFields.length})
                    </div>
                    <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {sourceFields.map(f => (
                            <label key={f.name || f} style={{
                                display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px',
                                borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem',
                                background: selectedFields.includes(f.name || f) ? 'rgba(99,102,241,0.1)' : 'transparent',
                                color: selectedFields.includes(f.name || f) ? '#818cf8' : 'var(--text-muted)'
                            }}>
                                <input type="checkbox" checked={selectedFields.includes(f.name || f)}
                                    onChange={() => toggleField(f.name || f)} title={`Include ${f.label || f.name || f} in the report`} />
                                {f.label || f.name || f}
                            </label>
                        ))}
                        {sourceFields.length === 0 && (
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', padding: '10px' }}>
                                {t('report.builder.noFieldsAvailableFor')}
                            </div>
                        )}
                    </div>
                </div>

                {/* Filters */}
                <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: '10px', border: '1px solid var(--glass-border)', padding: '12px' }}>
                    <div style={{
                        fontSize: '0.8rem', fontWeight: 700, color: '#fff', marginBottom: '8px',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                    }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Filter size={14} /> Filters ({filters.length})
                        </span>
                        <button onClick={addFilter} style={{
                            padding: '2px 8px', borderRadius: '4px', background: 'rgba(99,102,241,0.1)',
                            border: '1px solid rgba(99,102,241,0.2)', color: '#818cf8', cursor: 'pointer', fontSize: '0.7rem'
                        }} title="Add a new filter condition">+ Add</button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
                        {filters.map((f, i) => (
                            <div key={i} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                <select value={f.field} onChange={e => updateFilter(i, 'field', e.target.value)}
                                    style={{ flex: 2, padding: '4px', fontSize: '0.7rem', borderRadius: '4px' }} title={t('reportBuilder.selectTheFieldToFilterTip')}>
                                    {sourceFields.map(sf => <option key={sf.name || sf} value={sf.name || sf}>{sf.label || sf.name || sf}</option>)}
                                </select>
                                <select value={f.operator} onChange={e => updateFilter(i, 'operator', e.target.value)}
                                    style={{ width: '60px', padding: '4px', fontSize: '0.7rem', borderRadius: '4px' }} title={t('reportBuilder.selectTheComparisonOperatorTip')}>
                                    {OPERATORS.map(op => <option key={op} value={op}>{op}</option>)}
                                </select>
                                <input type="text" value={f.value} onChange={e => updateFilter(i, 'value', e.target.value)}
                                    placeholder={t('report.builder.value')} style={{ flex: 2, padding: '4px', fontSize: '0.7rem', borderRadius: '4px' }} title={t('reportBuilder.enterTheFilterValueTip')} />
                                <button onClick={() => removeFilter(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }} title={t('reportBuilder.removeThisFilterTip')}>
                                    <X size={12} />
                                </button>
                            </div>
                        ))}
                        {filters.length === 0 && (
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', padding: '10px' }}>
                                No filters applied. Click "+ Add" to filter results.
                            </div>
                        )}
                    </div>

                    {/* Group By */}
                    <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--glass-border)' }}>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>{t('report.builder.groupByOptional')}</label>
                        <select value={groupBy} onChange={e => setGroupBy(e.target.value)}
                            style={{ width: '100%', padding: '4px', fontSize: '0.75rem', borderRadius: '4px' }} title={t('reportBuilder.groupReportResultsByATip')}>
                            <option value="">{t('report.builder.noGrouping')}</option>
                            {sourceFields.map(sf => <option key={sf.name || sf} value={sf.name || sf}>{sf.label || sf.name || sf}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                <button onClick={handleGenerate} disabled={loading || selectedFields.length === 0} className="btn-primary"
                    style={{
                        padding: '10px 28px', fontSize: '0.9rem', fontWeight: 700,
                        background: selectedFields.length > 0 ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : 'var(--glass-border)',
                        boxShadow: selectedFields.length > 0 ? '0 0 20px rgba(99,102,241,0.3)' : 'none',
                        display: 'flex', alignItems: 'center', gap: '8px'
                    }} title={t('reportBuilder.executeTheQueryAndGenerateTip')}>
                    <Play size={16} /> {loading ? 'Running...' : 'Generate Report'}
                </button>
                {results?.data?.length > 0 && (
                    <>
                        <button onClick={exportCSV} className="btn-secondary" style={{
                            padding: '10px 20px', fontSize: '0.8rem',
                            display: 'flex', alignItems: 'center', gap: '6px'
                        }} title={t('reportBuilder.exportResultsToACsvTip')}>
                            <Download size={14} /> {t('report.builder.csv')}
                        </button>
                        <button onClick={() => setShowSaveDialog(true)} className="btn-edit" style={{
                            padding: '10px 20px', fontSize: '0.8rem',
                            display: 'flex', alignItems: 'center', gap: '6px'
                        }} title={t('reportBuilder.saveThisReportConfigurationAsTip')}>
                            <Save size={14} /> {t('report.builder.saveAs')}
                        </button>
                    </>
                )}
            </div>

            {/* Results Table */}
            {results?.data?.length > 0 && (
                <div style={{ borderRadius: '10px', border: '1px solid var(--glass-border)', overflow: 'hidden' }}>
                    <div style={{ padding: '10px 15px', background: 'rgba(0,0,0,0.2)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {results.data.length} row{results.data.length !== 1 ? 's' : ''} returned
                    </div>
                    <div style={{ maxHeight: '400px', overflowY: 'auto', overflowX: 'auto' }}>
                        <table className="data-table" style={{ width: '100%' }}>
                            <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-dark)', zIndex: 5 }}>
                                <tr>
                                    {(selectedFields.length > 0 ? selectedFields : Object.keys(results.data[0])).map(col => (
                                        <th key={col} style={{ fontSize: '0.75rem', padding: '8px 12px' }}>{col}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {results.data.map((row, i) => (
                                    <tr key={i} className="hover-row">
                                        {(selectedFields.length > 0 ? selectedFields : Object.keys(row)).map(col => (
                                            <td key={col} style={{ fontSize: '0.8rem', padding: '6px 12px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {row[col] ?? ''}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {results && results.data?.length === 0 && (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    {t('report.builder.noResultsMatchYour')}
                </div>
            )}

            {/* Save Dialog */}
            {showSaveDialog && (
                <div className="modal-overlay" onClick={() => setShowSaveDialog(false)}>
                    <div className="glass-card" style={{ padding: '25px', width: '400px', border: '1px solid var(--primary)' }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 15px 0', fontSize: '1rem', color: '#fff' }}>💾 Save Report Template</h3>
                        <input type="text" placeholder={t('report.builder.reportName')} value={reportName}
                            onChange={e => setReportName(e.target.value)}
                            style={{ width: '100%', padding: '10px', marginBottom: '15px' }}
                            title={t('reportBuilder.enterANameForThisTip')}
                            autoFocus />
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button className="btn-nav" onClick={() => setShowSaveDialog(false)} title={t('reportBuilder.cancelSavingTip')}>{t('report.builder.cancel')}</button>
                            <button className="btn-save" onClick={handleSave} disabled={!reportName.trim()}
                                title={t('reportBuilder.saveTheReportTemplateTip')}>{t('report.builder.save')}</button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`.hover-row:hover { background: rgba(255,255,255,0.05) !important; }`}</style>
        </div>
    );
}
