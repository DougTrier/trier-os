// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Parts Used View
 * ===========================
 * Aggregated parts consumption analytics sourced from the WorkParts table.
 * Shows total spend, quantity consumed, and a detailed usage log per asset —
 * enabling cost tracking and high-consumption part identification.
 *
 * KEY FEATURES:
 *   - Asset summary table: total parts spend, quantity used, WO count
 *   - Expandable asset rows: chronological list of each parts usage event
 *   - Event details: part name, part number, quantity, unit cost, WO link
 *   - Edit mode: correct part usage quantities on historical records
 *   - Search: filter by asset name or part number
 *   - Print: formatted parts consumption report by asset
 *   - Date range filter: narrow to a shift, week, month, or custom range
 *
 * DATA SOURCES:
 *   GET /api/work-orders/parts-used   — Aggregated parts consumption from WorkParts table
 */
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Wrench, Eye, Edit2, Save, X, Printer, RefreshCw, DollarSign, Package, Search, ChevronDown, ChevronRight } from 'lucide-react';
import SearchBar from './SearchBar';
import { useTranslation } from '../i18n/index.jsx';
import { formatDate } from '../utils/formatDate';

export default function PartsUsedView({ plantId }) {
    const { t } = useTranslation();
    const [data, setData] = useState({ summary: [], details: [], totals: {} });
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState('summary'); // 'summary' | 'detail'
    // Unified Modal State:
    const [selectedAssetForModal, setSelectedAssetForModal] = useState(null);
    const [isModalEdit, setIsModalEdit] = useState(false);
    const [editedQtys, setEditedQtys] = useState({});
    const [search, setSearch] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/assets/parts-used');
            const json = await res.json();
            setData(json);
        } catch (err) {
            console.error('Failed to fetch parts used data:', err);
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
        (r.partId || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.partName || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.woNumber || '').toLowerCase().includes(search.toLowerCase())
    ) || [];

    const totals = data.totals || {};

    // Color coding based on spend
    const getSpendColor = (cost) => {
        if (cost >= 5000) return '#ef4444';
        if (cost >= 1000) return '#f59e0b';
        return '#10b981';
    };

    const formatCurrency = (val) => {
        return '$' + (val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    return (
        <div className="glass-card" style={{ padding: 'var(--card-padding)', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ fontSize: '1.2rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
                        <Wrench size={22} /> {t('assets.partsUsed')}
                    </h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '5px 0 0 0' }}>
                        Historical parts consumption and cost correlation per asset
                    </p>
                </div>
                <button onClick={fetchData} className="btn-primary btn-sm" title={t('partsUsedView.refreshPartsUsageDataTip')}>
                    <RefreshCw size={18} className={loading ? 'spinning' : ''} />
                </button>
            </div>

            {/* KPI Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', flexShrink: 0 }}>
                <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '12px', padding: '18px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <DollarSign size={12} /> Total Parts Spend
                    </div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#ef4444' }}>
                        {formatCurrency(totals.totalCost)}
                    </div>
                </div>
                <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: '12px', padding: '18px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Package size={12} /> Total Qty Consumed
                    </div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f59e0b' }}>
                        {(totals.totalQty || 0).toLocaleString()}
                    </div>
                </div>
                <div style={{ background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.2)', borderRadius: '12px', padding: '18px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Assets Affected</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--primary)' }}>
                        {(totals.assetsAffected || 0).toLocaleString()}
                    </div>
                </div>
                <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '12px', padding: '18px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Unique Parts Used</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#10b981' }}>
                        {(totals.uniqueParts || 0).toLocaleString()}
                    </div>
                </div>
            </div>

            {/* Search + View Toggle */}
            <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexShrink: 0 }}>
                <SearchBar value={search} onChange={setSearch} placeholder={t('partsUsedView.filterByAssetPartOrPlaceholder')} style={{ flex: 1, maxWidth: 400 }} />
                <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '2px', border: '1px solid var(--glass-border)' }}>
                    <button 
                        onClick={() => setViewMode('summary')}
                        style={{
                            padding: '6px 15px', fontSize: '0.8rem', border: 'none', borderRadius: '6px',
                            background: viewMode === 'summary' ? 'var(--primary)' : 'transparent',
                            color: viewMode === 'summary' ? '#fff' : 'var(--text-muted)',
                            cursor: 'pointer', transition: 'all 0.2s'
                        }}
                     title={t('partsUsedView.perAssetTip')}>
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
                     title={t('partsUsedView.allPartsTip')}>
                        All Parts
                    </button>
                </div>
            </div>

            {/* Data Table */}
            <div style={{ border: '1px solid var(--glass-border)', borderRadius: '12px', overflow: 'auto', flex: 1, background: 'rgba(0,0,0,0.2)' }}>
                {loading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--text-muted)', gap: '15px' }}>
                        <RefreshCw className="spinning" size={32} />
                        <p>{t('partsUsedView.loadingPartsUsageData')}</p>
                    </div>
                ) : viewMode === 'summary' ? (
                    <table className="data-table">
                        <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                                
                                <th>{t('partsUsedView.assetId')}</th>
                                <th>{t('partsUsedView.description')}</th>
                                {data.summary?.[0]?.plantLabel && <th>{t('partsUsedView.plant')}</th>}
                                <th style={{ textAlign: 'right' }}>Unique Parts</th>
                                <th style={{ textAlign: 'right' }}>Total Qty</th>
                                <th style={{ textAlign: 'right' }}>Total Spend</th>
                                <th style={{ textAlign: 'right' }}>WO Count</th>
                                <th>{t('partsUsedView.lastUsed')}</th>
                                <th style={{ textAlign: 'center' }}>ACTION</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredSummary.length === 0 ? (
                                <tr>
                                    <td colSpan={9} style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                                        <Wrench size={40} style={{ marginBottom: '15px', opacity: 0.4 }} />
                                        <p>{t('partsUsedView.noPartsUsageRecordsFound')}</p>
                                        <p style={{ fontSize: '0.8rem', opacity: 0.6 }}>
                                            Parts usage is recorded when work orders have associated WorkParts entries
                                        </p>
                                    </td>
                                </tr>
                            ) : filteredSummary.map((row, i) => (
                                <React.Fragment key={i}>
                                    <tr style={{ background: 'rgba(255,255,255,0.01)' }}>
                                        <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{row.assetId}</td>
                                        <td>{row.assetName || '—'}</td>
                                        {row.plantLabel && <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{row.plantLabel}</td>}
                                        <td style={{ textAlign: 'right' }}>{row.uniqueParts}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{(row.totalQty || 0).toLocaleString()}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 800, color: getSpendColor(row.totalCost) }}>
                                            {formatCurrency(row.totalCost)}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>{row.woCount}</td>
                                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            {formatDate(row.lastUsedDate) || '—'}
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); setSelectedAssetForModal(row); setIsModalEdit(false); setEditedQtys({}); }}
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
                    /* Detail View — All Parts Flat */
                    <table className="data-table">
                        <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                                <th>{t('partsUsedView.partId')}</th>
                                <th>{t('partsUsedView.partName')}</th>
                                <th>{t('partsUsedView.assetId')}</th>
                                <th>{t('partsUsedView.wo')}</th>
                                <th style={{ textAlign: 'right' }}>Qty</th>
                                <th style={{ textAlign: 'right' }}>Unit Cost</th>
                                <th style={{ textAlign: 'right' }}>Line Total</th>
                                <th>{t('partsUsedView.date')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredDetails.length === 0 ? (
                                <tr>
                                    <td colSpan={8} style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                                        <Wrench size={40} style={{ marginBottom: '15px', opacity: 0.4 }} />
                                        <p>{t('partsUsedView.noPartsUsageRecordsFound')}</p>
                                    </td>
                                </tr>
                            ) : filteredDetails.map((d, i) => (
                                <tr key={i}>
                                    <td style={{ fontWeight: 600 }}>{d.partId}</td>
                                    <td>{d.partName || '—'}</td>
                                    <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{d.assetId}</td>
                                    <td style={{ color: 'var(--primary)' }}>{d.woNumber || '—'}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{d.qty}</td>
                                    <td style={{ textAlign: 'right' }}>{formatCurrency(d.unitCost)}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 700, color: getSpendColor(d.lineCost) }}>{formatCurrency(d.lineCost)}</td>
                                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatDate(d.useDate) || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            
            {/* Unified Asset Modal */}
            {selectedAssetForModal && createPortal((
                <div 
                    className="no-print"
                    style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}
                    onClick={() => { setSelectedAssetForModal(null); setIsModalEdit(false); setEditedQtys({}); }}
                >
                    <div 
                        className="glass-card" 
                        onClick={e => e.stopPropagation()} 
                        style={{ width: '900px', maxWidth: '95vw', maxHeight: '90vh', background: 'var(--panel-bg)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
                    >
                        {/* Modal Header */}
                        <div style={{ padding: '20px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
                            <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Wrench size={20} /> Asset: {selectedAssetForModal.assetId} — Parts History
                            </h2>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button onClick={() => window.triggerTrierPrint('parts-used', data.details.filter(d => d.assetId === selectedAssetForModal.assetId))} className="btn-secondary btn-sm" title={t('partsUsedView.printPartsLogTip', 'Print Parts Log')}>
                                    <Printer size={16} /> print
                                </button>
                                {isModalEdit ? (
                                    <>
                                        <button onClick={() => { setIsModalEdit(false); setEditedQtys({}); }} className="btn-secondary btn-sm">
                                            <X size={16} /> Cancel
                                        </button>
                                    </>
                                ) : (
                                    <button onClick={() => setIsModalEdit(true)} className="btn-secondary btn-sm">
                                        <Edit2 size={16} /> Edit
                                    </button>
                                )}
                                <button onClick={() => { setSelectedAssetForModal(null); setIsModalEdit(false); setEditedQtys({}); }} style={{ background: 'transparent', border: '1px solid var(--glass-border)', borderRadius: '6px', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px' }} title="Close">
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Modal Body */}
                        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px', letterSpacing: '0.05em' }}>
                                Parts Consumption Detail
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                <thead style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--glass-border)' }}>
                                    <tr>
                                        <th style={{ padding: '10px', textAlign: 'left', fontWeight: 600 }}>Part ID</th>
                                        <th style={{ padding: '10px', textAlign: 'left', fontWeight: 600 }}>Part Name</th>
                                        <th style={{ padding: '10px', textAlign: 'left', fontWeight: 600 }}>WO #</th>
                                        <th style={{ padding: '10px', textAlign: 'right', fontWeight: 600 }}>Qty</th>
                                        <th style={{ padding: '10px', textAlign: 'right', fontWeight: 600 }}>Unit Cost</th>
                                        <th style={{ padding: '10px', textAlign: 'right', fontWeight: 600 }}>Line Total</th>
                                        <th style={{ padding: '10px', textAlign: 'left', fontWeight: 600 }}>Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(data.details || []).filter(d => d.assetId === selectedAssetForModal.assetId).map((d, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            <td style={{ padding: '8px 10px', fontWeight: 600 }}>{d.partId}</td>
                                            <td style={{ padding: '8px 10px' }}>{d.partName || '—'}</td>
                                            <td style={{ padding: '8px 10px', color: 'var(--primary)' }}>{d.woNumber || '—'}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>
                                                {isModalEdit ? (
                                                    <input 
                                                        type="number"
                                                        min="0"
                                                        step="1"
                                                        value={editedQtys[d.wpId] !== undefined ? editedQtys[d.wpId] : d.qty}
                                                        onChange={e => setEditedQtys({ ...editedQtys, [d.wpId]: e.target.value })}
                                                        style={{ width: '80px', padding: '4px 8px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--primary)', color: '#fff', textAlign: 'right', borderRadius: '4px' }}
                                                    />
                                                ) : (
                                                    d.qty
                                                )}
                                            </td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right' }}>{formatCurrency(d.unitCost)}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: getSpendColor((editedQtys[d.wpId] !== undefined ? editedQtys[d.wpId] : d.qty) * d.unitCost) }}>
                                                {formatCurrency((editedQtys[d.wpId] !== undefined ? editedQtys[d.wpId] : d.qty) * d.unitCost)}
                                            </td>
                                            <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{formatDate(d.useDate) || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Modal Footer */}
                        <div style={{ padding: '15px 20px', borderTop: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'flex-end', gap: '10px', background: 'rgba(255,255,255,0.02)' }}>
                            <button onClick={() => { setSelectedAssetForModal(null); setIsModalEdit(false); setEditedQtys({}); }} className="btn-secondary btn-sm">Close</button>
                            {isModalEdit ? (
                                <button onClick={async () => {
                                    try {
                                        const updates = Object.entries(editedQtys).map(([wpId, qty]) =>
                                            fetch(`/api/assets/parts-used/${wpId}`, {
                                                method: 'PUT',
                                                headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                                                body: JSON.stringify({ qty })
                                            })
                                        );
                                        await Promise.all(updates);
                                        setIsModalEdit(false);
                                        setEditedQtys({});
                                        fetchData();
                                    } catch (err) {
                                        console.error('Failed to save modal parts:', err);
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
        </div>
    );
}