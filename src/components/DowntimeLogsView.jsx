// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Downtime Logs
 * =========================
 * Aggregated equipment downtime analytics sourced from completed work orders
 * where Actual Downtime Hours (ActDown > 0) was recorded at close-out.
 *
 * KEY FEATURES:
 *   - KPI cards: Total downtime hours, Most downed asset, Avg downtime per event
 *   - Asset summary table: total hours down, event count, last downtime date
 *   - Expandable asset rows: chronological list of individual downtime events
 *   - Edit mode: correct downtime hours on historical WOs (audit-logged)
 *   - Print report: formatted downtime summary for management review
 *   - Date range filter: narrow to shift, week, month, or custom range
 *   - Search: find assets by name or tag across the downtime log
 *   - Plant-scoped: shows data for selected plant; 'all_sites' = enterprise total
 *
 * DATA SOURCES:
 *   GET /api/work-orders/downtime   — Aggregated downtime from closed WOs (ActDown > 0)
 */
import React, { useState, useEffect } from 'react';
import { Activity, RefreshCw, ChevronDown, ChevronRight, Search, Printer, Edit2, Save, X, Eye } from 'lucide-react';
import { createPortal } from 'react-dom';
import SearchBar from './SearchBar';
import { useTranslation } from '../i18n/index.jsx';
import { formatDate } from '../utils/formatDate';

export default function DowntimeLogsView({ plantId }) {
    const { t } = useTranslation();
    const [data, setData] = useState({ summary: [], details: [], totals: {} });
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState('summary'); // 'summary' | 'detail'
    const [expandedAsset, setExpandedAsset] = useState(null);
    const [search, setSearch] = useState('');
    
    // Unified Modal State:
    const [selectedAssetForModal, setSelectedAssetForModal] = useState(null); // Asset object { assetId, assetName, ... }
    const [isModalEdit, setIsModalEdit] = useState(false);
    const [editedDowntimes, setEditedDowntimes] = useState({});
    
    const [editingEventId, setEditingEventId] = useState(null);
    const [editDowntimeHrs, setEditDowntimeHrs] = useState('');
    const [isGlobalEdit, setIsGlobalEdit] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/assets/downtime-logs');
            const json = await res.json();
            setData(json);
        } catch (err) {
            console.error('Failed to fetch downtime logs:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [plantId]);

    const filteredSummary = data.summary?.filter(r =>
        !search || 
        (r.assetId || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.assetName || '').toLowerCase().includes(search.toLowerCase())
    ) || [];

    const filteredDetails = data.details?.filter(r =>
        !search ||
        (r.assetId || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.assetName || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.woNumber || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.woDescription || '').toLowerCase().includes(search.toLowerCase())
    ) || [];

    const totals = data.totals || {};

    const getSeverityColor = (hours) => {
        if (hours >= 100) return '#ef4444';
        if (hours >= 40) return '#f59e0b';
        return '#10b981';
    };

    const getSeverityLabel = (hours) => {
        if (hours >= 100) return 'Critical';
        if (hours >= 40) return 'At Risk';
        return 'Stable';
    };

    const handleSaveDowntime = async (woId) => {
        try {
            await fetch(`/api/assets/downtime-logs/${woId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                body: JSON.stringify({ downtimeHrs: editDowntimeHrs })
            });
            setEditingEventId(null);
            fetchData();
        } catch (err) {
            console.error('Failed to update downtime:', err);
        }
    };

    return (
        <div className="glass-card" style={{ padding: 'var(--card-padding)', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ fontSize: '1.2rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
                        <Activity size={22} /> {t('assets.downtimeLogs')}
                    </h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '5px 0 0 0' }}>
                        Historical equipment downtime aggregated from work order records
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => window.triggerTrierPrint('downtime-logs', data.summary)} className="btn-secondary btn-sm" title={t('downtimeLogsView.printDowntimeLogsTip', 'Print Downtime Logs')}>
                        <Printer size={16} /> {t('common.print', 'Print')}
                    </button>
                    <button onClick={fetchData} className="btn-primary btn-sm" title={t('downtimeLogsView.refreshDowntimeDataTip')}>
                        <RefreshCw size={18} className={loading ? 'spinning' : ''} />
                    </button>
                </div>
            </div>

            {/* KPI Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', flexShrink: 0 }}>
                <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '12px', padding: '18px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Total Downtime</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#ef4444' }}>
                        {(totals.totalDowntimeHrs || 0).toLocaleString()}h
                    </div>
                </div>
                <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: '12px', padding: '18px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Downtime Events</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f59e0b' }}>
                        {(totals.totalEvents || 0).toLocaleString()}
                    </div>
                </div>
                <div style={{ background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.2)', borderRadius: '12px', padding: '18px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Assets Affected</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--primary)' }}>
                        {(totals.assetsAffected || 0).toLocaleString()}
                    </div>
                </div>
                <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '12px', padding: '18px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Avg Per Event</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#10b981' }}>
                        {totals.totalEvents > 0 ? (totals.totalDowntimeHrs / totals.totalEvents).toFixed(1) : '0'}h
                    </div>
                </div>
            </div>

            {/* Search + View Toggle */}
            <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexShrink: 0 }}>
                <SearchBar value={search} onChange={setSearch} placeholder={t('downtimeLogsView.filterByAssetWoNumberPlaceholder')} style={{ flex: 1, maxWidth: 400 }} />
                <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '2px', border: '1px solid var(--glass-border)' }}>
                    <button 
                        onClick={() => setViewMode('summary')}
                        style={{
                            padding: '6px 15px', fontSize: '0.8rem', border: 'none', borderRadius: '6px',
                            background: viewMode === 'summary' ? 'var(--primary)' : 'transparent',
                            color: viewMode === 'summary' ? '#fff' : 'var(--text-muted)',
                            cursor: 'pointer', transition: 'all 0.2s'
                        }}
                     title={t('downtimeLogsView.perAssetTip')}>
                        Per Asset
                    </button>
                    <button 
                        onClick={() => setViewMode('detail')}
                        style={{
                            padding: '6px 15px', fontSize: '0.8rem', border: 'none', borderRadius: '6px',
                            background: viewMode === 'detail' ? 'var(--primary)' : 'transparent',
                            color: viewMode === 'detail' ? '#fff' : 'var(--text-muted)',
                            cursor: 'pointer', transition: 'all 0.2s'
                        }}
                     title={t('downtimeLogsView.allEventsTip')}>
                        All Events
                    </button>
                </div>
            </div>

            {/* Data Table */}
            <div style={{ border: '1px solid var(--glass-border)', borderRadius: '12px', overflow: 'auto', flex: 1, background: 'rgba(0,0,0,0.2)' }}>
                {loading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--text-muted)', gap: '15px' }}>
                        <RefreshCw className="spinning" size={32} />
                        <p>{t('downtimeLogsView.loadingDowntimeRecords')}</p>
                    </div>
                ) : viewMode === 'summary' ? (
                    <table className="data-table">
                        <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                                <th>{t('downtimeLogsView.assetId')}</th>
                                <th>{t('downtimeLogsView.description')}</th>
                                {data.summary?.[0]?.plantLabel && <th>{t('downtimeLogsView.plant')}</th>}
                                <th style={{ textAlign: 'right' }}>WO Count</th>
                                <th style={{ textAlign: 'right' }}>Total Hours</th>
                                <th style={{ textAlign: 'right' }}>Avg Hours</th>
                                <th style={{ textAlign: 'right' }}>Max Hours</th>
                                <th>{t('downtimeLogsView.severity')}</th>
                                <th>{t('downtimeLogsView.lastEvent')}</th>
                                <th style={{ textAlign: 'center' }}>ACTION</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredSummary.length === 0 ? (
                                <tr>
                                    <td colSpan={10} style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                                        <Activity size={40} style={{ marginBottom: '15px', opacity: 0.4 }} />
                                        <p>{t('downtimeLogsView.noDowntimeRecordsFoundFor')}</p>
                                        <p style={{ fontSize: '0.8rem', opacity: 0.6 }}>
                                            Downtime is recorded when work orders have Actual Downtime Hours &gt; 0
                                        </p>
                                    </td>
                                </tr>
                            ) : filteredSummary.map((row, i) => (
                                <React.Fragment key={i}>
                                    <tr style={{ background: 'rgba(255,255,255,0.01)' }}>
                                        <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{row.assetId}</td>
                                        <td>{row.assetName || '—'}</td>
                                        {row.plantLabel && <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{row.plantLabel}</td>}
                                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{row.woCount}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 800, color: getSeverityColor(row.totalDowntimeHrs) }}>
                                            {row.totalDowntimeHrs}h
                                        </td>
                                        <td style={{ textAlign: 'right' }}>{row.avgDowntimeHrs}h</td>
                                        <td style={{ textAlign: 'right' }}>{row.maxDowntimeHrs}h</td>
                                        <td>
                                            <span style={{
                                                padding: '3px 10px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 800,
                                                background: `${getSeverityColor(row.totalDowntimeHrs)}15`,
                                                color: getSeverityColor(row.totalDowntimeHrs),
                                                border: `1px solid ${getSeverityColor(row.totalDowntimeHrs)}30`
                                            }}>
                                                {getSeverityLabel(row.totalDowntimeHrs)}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            {formatDate(row.lastDowntimeDate) || '—'}
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); setSelectedAssetForModal(row); setIsModalEdit(false); setEditedDowntimes({}); }}
                                                className="btn-primary"
                                                style={{ padding: '6px 12px', fontSize: '0.8rem', borderRadius: '15px' }}
                                            >
                                                <Eye size={14} style={{ marginRight: '5px' }} /> {t('common.view', 'View')}
                                            </button>
                                        </td>
                                    </tr>
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    /* Detail View — All Events Flat */
                    <table className="data-table">
                        <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                                <th>{t('downtimeLogsView.wo')}</th>
                                <th>{t('downtimeLogsView.assetId')}</th>
                                <th>{t('downtimeLogsView.asset')}</th>
                                <th>{t('downtimeLogsView.description')}</th>
                                <th style={{ textAlign: 'right' }}>Downtime</th>
                                <th>{t('downtimeLogsView.opened')}</th>
                                <th>{t('downtimeLogsView.completed')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredDetails.length === 0 ? (
                                <tr>
                                    <td colSpan={7} style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                                        <Activity size={40} style={{ marginBottom: '15px', opacity: 0.4 }} />
                                        <p>{t('downtimeLogsView.noDowntimeEventsRecorded')}</p>
                                    </td>
                                </tr>
                            ) : filteredDetails.map((d, i) => (
                                <tr key={i}>
                                    <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{d.woNumber || d.woId}</td>
                                    <td style={{ fontWeight: 700 }}>{d.assetId}</td>
                                    <td style={{ fontSize: '0.85rem' }}>{d.assetName || '—'}</td>
                                    <td style={{ fontSize: '0.85rem' }}>{d.woDescription || '—'}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 800, color: getSeverityColor(editedDowntimes[d.woId] ?? d.downtimeHrs) }}>
                                        {isGlobalEdit ? (
                                            <input 
                                                type="number"
                                                min="0"
                                                step="0.5"
                                                value={editedDowntimes[d.woId] !== undefined ? editedDowntimes[d.woId] : d.downtimeHrs}
                                                onChange={e => setEditedDowntimes({ ...editedDowntimes, [d.woId]: e.target.value })}
                                                style={{ width: '80px', padding: '4px 8px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--primary)', color: '#fff', textAlign: 'right', borderRadius: '4px' }}
                                            />
                                        ) : (
                                            `${d.downtimeHrs}h`
                                        )}
                                    </td>
                                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatDate(d.dateOpened) || '—'}</td>
                                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatDate(d.dateCompleted) || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Unified Asset Modal */}
            {selectedAssetForModal && createPortal((
                <div 
                    className="no-print"
                    style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}
                    onClick={() => { setSelectedAssetForModal(null); setIsModalEdit(false); setEditedDowntimes({}); }}
                >
                    <div 
                        className="glass-card" 
                        onClick={e => e.stopPropagation()} 
                        style={{ width: '900px', maxWidth: '95vw', maxHeight: '90vh', background: 'var(--panel-bg)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
                    >
                        {/* Modal Header */}
                        <div style={{ padding: '20px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
                            <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Activity size={20} /> Asset: {selectedAssetForModal.assetId} — Downtime Analysis
                            </h2>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button onClick={() => window.triggerTrierPrint('downtime-logs', data.details.filter(d => d.assetId === selectedAssetForModal.assetId))} className="btn-secondary btn-sm" title={t('downtimeLogsView.printDowntimeLogsTip', 'Print Downtime Logs')}>
                                    <Printer size={16} /> {t('common.print', 'Print')}
                                </button>
                                {isModalEdit ? (
                                    <>
                                        <button onClick={() => { setIsModalEdit(false); setEditedDowntimes({}); }} className="btn-secondary btn-sm">
                                            <X size={16} /> Cancel
                                        </button>
                                    </>
                                ) : (
                                    <button onClick={() => setIsModalEdit(true)} className="btn-secondary btn-sm">
                                        <Edit2 size={16} /> Edit
                                    </button>
                                )}
                                <button onClick={() => { setSelectedAssetForModal(null); setIsModalEdit(false); setEditedDowntimes({}); }} style={{ background: 'transparent', border: '1px solid var(--glass-border)', borderRadius: '6px', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px' }} title="Close">
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Modal Body */}
                        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px', letterSpacing: '0.05em' }}>
                                Work Orders Contributing to Downtime
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                <thead style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--glass-border)' }}>
                                    <tr>
                                        <th style={{ padding: '10px', textAlign: 'left', fontWeight: 600 }}>WO #</th>
                                        <th style={{ padding: '10px', textAlign: 'left', fontWeight: 600 }}>Description</th>
                                        <th style={{ padding: '10px', textAlign: 'right', fontWeight: 600 }}>Hours</th>
                                        <th style={{ padding: '10px', textAlign: 'left', fontWeight: 600 }}>Opened</th>
                                        <th style={{ padding: '10px', textAlign: 'left', fontWeight: 600 }}>Completed</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(data.details || []).filter(d => d.assetId === selectedAssetForModal.assetId).map((d, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            <td style={{ padding: '8px 10px', color: 'var(--primary)', fontWeight: 600 }}>{d.woNumber || d.woId}</td>
                                            <td style={{ padding: '8px 10px' }}>{d.woDescription || '—'}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: getSeverityColor(editedDowntimes[d.woId] ?? d.downtimeHrs) }}>
                                                {isModalEdit ? (
                                                    <input 
                                                        type="number"
                                                        min="0"
                                                        step="0.5"
                                                        value={editedDowntimes[d.woId] !== undefined ? editedDowntimes[d.woId] : d.downtimeHrs}
                                                        onChange={e => setEditedDowntimes({ ...editedDowntimes, [d.woId]: e.target.value })}
                                                        style={{ width: '80px', padding: '4px 8px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--primary)', color: '#fff', textAlign: 'right', borderRadius: '4px' }}
                                                    />
                                                ) : (
                                                    `${d.downtimeHrs}h`
                                                )}
                                            </td>
                                            <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{formatDate(d.dateOpened) || '—'}</td>
                                            <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{formatDate(d.dateCompleted) || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Modal Footer */}
                        <div style={{ padding: '15px 20px', borderTop: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'flex-end', gap: '10px', background: 'rgba(255,255,255,0.02)' }}>
                            <button onClick={() => { setSelectedAssetForModal(null); setIsModalEdit(false); setEditedDowntimes({}); }} className="btn-secondary btn-sm">Close</button>
                            {isModalEdit ? (
                                <button onClick={async () => {
                                    try {
                                        const updates = Object.entries(editedDowntimes).map(([woId, hrs]) =>
                                            fetch(`/api/assets/downtime-logs/${woId}`, {
                                                method: 'PUT',
                                                headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                                                body: JSON.stringify({ downtimeHrs: hrs })
                                            })
                                        );
                                        await Promise.all(updates);
                                        setIsModalEdit(false);
                                        setEditedDowntimes({});
                                        fetchData();
                                    } catch (err) {
                                        console.error('Failed to save modal downtimes:', err);
                                    }
                                }} className="btn-primary btn-sm" style={{ background: '#10b981', borderColor: '#10b981' }}>
                                    <Save size={16} /> Save Changes
                                </button>
                            ) : (
                                <button onClick={() => setIsModalEdit(true)} className="btn-primary btn-sm">
                                    <Edit2 size={16} /> Edit
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            ), document.body)}
        </div>
    );
}
