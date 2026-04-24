// Copyright © 2026 Trier OS. All Rights Reserved.
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck, AlertTriangle, CheckCircle, TrendingDown, ArrowUpDown, RefreshCw, Package } from 'lucide-react';

const otdColor = (rate) => {
    if (rate === null || rate === undefined) return '#64748b';
    if (rate >= 90) return '#10b981';
    if (rate >= 75) return '#f59e0b';
    return '#ef4444';
};

const fmtSpend = (val) =>
    val != null ? `$${Number(val).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—';

const leadTimeDelta = (promised, actual) => {
    if (promised == null || actual == null) return { label: 'N/A', late: false, isNA: true };
    const delta = Math.round(actual - promised);
    if (delta === 0) return { label: 'On time', late: false, isNA: false };
    return {
      label: delta > 0 ? `+${delta}d late` : `${Math.abs(delta)}d early`,
      late: delta > 0,
      isNA: false,
    };
};

const fmtPlants = (plants) =>
    (plants || []).map(p => p.replace(/_/g, ' ')).join(', ') || '—';

export default function VendorScorecardView({ plantId }) {
    const navigate = useNavigate();
    const [scorecards, setScorecards] = useState([]);
    const [worstPerformers, setWorstPerformers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sortField, setSortField] = useState('onTimeDeliveryRate');
    const [sortDir, setSortDir] = useState('asc');
    const [expandedRow, setExpandedRow] = useState(null);

    const fetchScorecard = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (plantId && plantId !== 'all_sites') params.set('plantId', plantId);
            
            // GUARD 4: Multi-SQLite scan latency.
            // This endpoint opens every plant DB sequentially when no plantId is provided.
            // At 5-10 plants this is fast (<200ms). At 20+ plants it can reach 1-2s.
            // Future mitigation: add Cache-Control: max-age=300 or use a materialized view.
            const res = await fetch(`/api/vendors/scorecard?${params.toString()}`, {
                headers: { 'x-plant-id': plantId || 'all_sites' }
            });
            if (res.ok) {
                const data = await res.json();
                setScorecards(data.scorecards || []);
                setWorstPerformers(data.worstPerformers || []);
            }
        } catch (err) {
            console.error('[VendorScorecard] fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchScorecard(); }, [plantId]);

    const sorted = useMemo(() => {
        return [...scorecards].sort((a, b) => {
            const aVal = a[sortField];
            const bVal = b[sortField];

            // Null OTD always sinks to bottom
            if (sortField === 'onTimeDeliveryRate') {
                if (aVal == null && bVal == null) return 0;
                if (aVal == null) return 1;
                if (bVal == null) return -1;
            }

            if (typeof aVal === 'string') {
                return sortDir === 'asc'
                    ? (aVal ?? '').localeCompare(bVal ?? '')
                    : (bVal ?? '').localeCompare(aVal ?? '');
            }

            return sortDir === 'asc'
                ? (aVal ?? 0) - (bVal ?? 0)
                : (bVal ?? 0) - (aVal ?? 0);
        });
    }, [scorecards, sortField, sortDir]);

    const toggleSort = (field) => {
        if (sortField === field) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDir(field === 'spend' ? 'desc' : 'asc');
        }
    };

    const withData = scorecards.filter(v => v.onTimeDeliveryRate !== null);
    const avgOTD = withData.length > 0
        ? Math.round(withData.reduce((s, v) => s + v.onTimeDeliveryRate, 0) / withData.length)
        : null;
    const totalNCR = scorecards.reduce((s, v) => s + (v.qualityDefectCount || 0), 0);
    const totalSpend = scorecards.reduce((s, v) => s + (v.spend || 0), 0);

    return (
        <div className="module-container" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', boxSizing: 'border-box', overflowY: 'auto' }}>
            {/* Section 1 — Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Truck className="text-indigo-400" size={28} />
                        Vendor Performance Scorecard
                    </h1>
                    <p style={{ color: '#94a3b8', margin: '4px 0 0 0', fontSize: '0.9rem' }}>
                        {plantId === 'all_sites' ? 'Corporate-wide supplier performance' : `Plant: ${(plantId || '').replace(/_/g, ' ')}`}
                    </p>
                </div>
                <button onClick={fetchScorecard} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <RefreshCw size={16} className={loading ? 'spinning' : ''} /> Refresh
                </button>
            </div>

            {/* Section 2 — Summary KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                <div className="stat-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '16px' }}>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Total Vendors</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e2e8f0' }}>{scorecards.length}</div>
                </div>
                <div className="stat-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '16px' }}>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Scoreable</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#6366f1' }}>{withData.length}</div>
                </div>
                <div className="stat-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '16px' }}>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Avg OTD</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: otdColor(avgOTD) }}>{avgOTD != null ? `${avgOTD}%` : '—'}</div>
                </div>
                <div className="stat-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '16px' }}>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Total NCRs</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: totalNCR > 0 ? '#ef4444' : '#10b981' }}>{totalNCR}</div>
                </div>
            </div>

            {/* Section 3 — High-Spend Underperformers hero */}
            {worstPerformers.length > 0 && (
                <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '16px' }}>
                    <div style={{ fontSize: '0.8rem', color: '#ef4444', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <AlertTriangle size={14} /> High-Spend Underperformers
                        <span style={{ fontWeight: 400, color: '#94a3b8', textTransform: 'none', letterSpacing: 'normal' }}>
                            — Vendors with significant spend and below-target on-time delivery
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', overflowX: 'auto' }}>
                        {worstPerformers.slice(0, 5).map(v => (
                            <div key={v.vendorId} style={{ minWidth: '180px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '12px', border: '1px solid rgba(239,68,68,0.15)', flexShrink: 0 }}>
                                <div style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '0.9rem', marginBottom: '8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.vendorName}</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: otdColor(v.onTimeDeliveryRate) }}>
                                    {v.onTimeDeliveryRate != null ? `${v.onTimeDeliveryRate}%` : 'N/A'}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>on-time delivery</div>
                                <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '6px' }}>{fmtSpend(v.spend)} spend</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Section 4 — Full ranked table */}
            <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                <th style={{ padding: '12px 16px', color: '#94a3b8', fontWeight: 600, width: '60px' }}>#</th>
                                <th onClick={() => toggleSort('vendorName')} style={{ padding: '12px 16px', color: sortField === 'vendorName' ? '#e2e8f0' : '#94a3b8', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        Vendor <ArrowUpDown size={14} style={{ opacity: sortField === 'vendorName' ? 1 : 0.4 }} />
                                    </div>
                                </th>
                                <th style={{ padding: '12px 16px', color: '#94a3b8', fontWeight: 600 }}>Plants</th>
                                <th onClick={() => toggleSort('spend')} style={{ padding: '12px 16px', color: sortField === 'spend' ? '#e2e8f0' : '#94a3b8', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        Spend <ArrowUpDown size={14} style={{ opacity: sortField === 'spend' ? 1 : 0.4 }} />
                                    </div>
                                </th>
                                <th onClick={() => toggleSort('onTimeDeliveryRate')} style={{ padding: '12px 16px', color: sortField === 'onTimeDeliveryRate' ? '#e2e8f0' : '#94a3b8', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        OTD Rate <ArrowUpDown size={14} style={{ opacity: sortField === 'onTimeDeliveryRate' ? 1 : 0.4 }} />
                                    </div>
                                </th>
                                <th onClick={() => toggleSort('avgActualLeadTime')} style={{ padding: '12px 16px', color: sortField === 'avgActualLeadTime' ? '#e2e8f0' : '#94a3b8', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        Lead Time <ArrowUpDown size={14} style={{ opacity: sortField === 'avgActualLeadTime' ? 1 : 0.4 }} />
                                    </div>
                                </th>
                                <th onClick={() => toggleSort('qualityDefectCount')} style={{ padding: '12px 16px', color: sortField === 'qualityDefectCount' ? '#e2e8f0' : '#94a3b8', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        NCRs <ArrowUpDown size={14} style={{ opacity: sortField === 'qualityDefectCount' ? 1 : 0.4 }} />
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && scorecards.length === 0 ? (
                                <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}><RefreshCw size={24} className="spinning" /></td></tr>
                            ) : sorted.map((v, idx) => (
                                <React.Fragment key={v.vendorId}>
                                    <tr
                                        onClick={() => setExpandedRow(expandedRow === v.vendorId ? null : v.vendorId)}
                                        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', background: expandedRow === v.vendorId ? 'rgba(255,255,255,0.04)' : 'transparent', opacity: v.onTimeDeliveryRate === null ? 0.6 : 1 }}
                                        className="hover:bg-white/5"
                                    >
                                        <td style={{ padding: '12px 16px', color: '#94a3b8' }}>#{idx + 1}</td>
                                        <td style={{ padding: '12px 16px', color: '#f8fafc', fontWeight: 500 }}>{v.vendorName}</td>
                                        <td style={{ padding: '12px 16px', color: '#64748b', fontSize: '0.8rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={fmtPlants(v.plants)}>{fmtPlants(v.plants)}</td>
                                        <td style={{ padding: '12px 16px', color: '#cbd5e1' }}>{fmtSpend(v.spend)}</td>
                                        <td style={{ padding: '12px 16px' }}>
                                            {v.onTimeDeliveryRate !== null ? (
                                                <span style={{ fontWeight: 700, color: otdColor(v.onTimeDeliveryRate) }}>
                                                    {v.onTimeDeliveryRate}%
                                                </span>
                                            ) : (
                                                <span style={{ color: '#475569', fontSize: '0.8rem' }}>No PO data</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            {(() => {
                                                const lt = leadTimeDelta(v.avgPromisedLeadTime, v.avgActualLeadTime);
                                                return <span style={{ color: lt.isNA ? '#9ca3af' : lt.late ? '#ef4444' : '#22c55e', fontFamily: 'monospace', fontSize: '0.85rem' }}>{lt.label}</span>;
                                            })()}
                                        </td>
                                        <td style={{ padding: '12px 16px', color: v.qualityDefectCount > 0 ? '#ef4444' : '#94a3b8', fontWeight: v.qualityDefectCount > 0 ? 600 : 400 }}>
                                            {v.qualityDefectCount}
                                        </td>
                                    </tr>
                                    {expandedRow === v.vendorId && (
                                        <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <td colSpan={7} style={{ padding: '16px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                                                    <div>
                                                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '6px' }}>Active in Plants</div>
                                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                            {v.plants?.map(p => (
                                                                <span key={p} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#cbd5e1', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem' }}>
                                                                    {p.replace(/_/g, ' ')}
                                                                </span>
                                                            )) || <span style={{ color: '#64748b' }}>None</span>}
                                                        </div>
                                                    </div>
                                                    <div style={{ marginLeft: 'auto' }}>
                                                        <button 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                navigate(`/purchase-orders?vendorId=${v.vendorId}`);
                                                            }}
                                                            className="btn-primary" 
                                                            style={{ padding: '6px 16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                                                        >
                                                            <Package size={14} /> View POs
                                                        </button>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {scorecards.length - withData.length > 0 && (
                <div style={{ color: '#64748b', fontSize: '0.85rem', textAlign: 'center' }}>
                    {scorecards.length - withData.length} vendor(s) have no completed PO receipt history and are unscored.
                </div>
            )}

            <div style={{ color: '#64748b', fontSize: '0.8rem', lineHeight: 1.5, marginTop: '8px', paddingBottom: '20px' }}>
                OTD calculated from PO receipt dates vs. due dates across all recorded PO lines.<br/>
                Spend represents cumulative received value. NCRs sourced from QualityNCR records linked to vendor-supplied parts.
            </div>
        </div>
    );
}
