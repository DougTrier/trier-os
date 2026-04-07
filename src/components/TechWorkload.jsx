// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Technician Workload Capacity View
 * =============================================
 * Per-technician breakdown of active work orders to support workload
 * balancing. Managers see how many open WOs are assigned to each tech
 * and can redistribute to prevent burnout or bottlenecks.
 *
 * KEY FEATURES:
 *   - Technician list: all active techs with WO count, priority breakdown, and hours
 *   - Priority distribution: Critical / High / Medium / Low WO counts per tech
 *   - Capacity indicator: visual bar showing workload vs capacity threshold
 *   - Overloaded alert: tech highlighted in amber if WO count exceeds limit
 *   - Reassign: drag-to-reassign WOs from overloaded to available techs
 *   - Print: formatted workload summary for crew planning meetings
 *   - ActionBar: View / Edit / Save / Print (platform standard)
 *   - Portal rendering: renders as a panel via ReactDOM.createPortal
 *
 * DATA SOURCES:
 *   GET /api/work-orders/tech-workload   — Active WO counts per technician
 */
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Users, RefreshCw, Printer, AlertTriangle } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';
import EmptyState from './EmptyState';
import ActionBar from './ActionBar';
import { useTranslation } from '../i18n/index.jsx';

/**
 * TechWorkload — Technician Workload Capacity View
 * ==================================================
 * Shows per-technician breakdown of active work orders.
 * Strictly adheres to the View, Edit, Save, Print pattern.
 */
export default function TechWorkload() {
    const { t } = useTranslation();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedTech, setSelectedTech] = useState(null);
    const [editing, setEditing] = useState(false);

    const fetchWorkload = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/technician-workload', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                    'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1'
                }
            });
            const json = await res.json();
            setData(json);
        } catch (err) {
            console.error('Failed to load workload data:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchWorkload(); }, []);

    if (loading) return <LoadingSpinner message="Loading technician workload..." />;

    if (!data || !data.technicians || data.technicians.length === 0) {
        return <EmptyState icon={<Users size={48} />} title={t('techWorkload.noActiveTechnicianAssignmentsFoundTip')} message="Assign technicians to work orders to see workload data." />;
    }

    const MAX_CAPACITY = data.capacityThreshold || 8; // WOs per tech before overload

    const getCapacityColor = (count) => {
        const pct = (count / MAX_CAPACITY) * 100;
        if (pct >= 100) return '#ef4444';
        if (pct >= 75) return '#f59e0b';
        if (pct >= 50) return '#3b82f6';
        return '#10b981';
    };

    const getCapacityLabel = (count) => {
        const pct = (count / MAX_CAPACITY) * 100;
        if (pct >= 100) return 'Overloaded';
        if (pct >= 75) return 'Heavy';
        if (pct >= 50) return 'Moderate';
        return 'Light';
    };

    return (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 20px', borderBottom: '1px solid var(--glass-border)',
                background: 'rgba(99,102,241,0.03)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Users size={20} color="#818cf8" />
                    <h3 style={{ margin: 0, fontSize: '1rem', color: '#f1f5f9' }}>Technician Workload</h3>
                    <span style={{
                        background: 'rgba(99,102,241,0.15)', color: '#818cf8',
                        padding: '2px 10px', borderRadius: 10, fontSize: '0.7rem', fontWeight: 700,
                    }}>
                        {data.technicians.length} techs
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        Capacity: {MAX_CAPACITY} WOs/tech
                    </span>
                    <button onClick={fetchWorkload} style={{
                        background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)',
                        borderRadius: 6, color: '#94a3b8', cursor: 'pointer', padding: '4px 8px',
                        display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.7rem',
                    }} title={t('techWorkload.refreshWorkloadDataTip')}>
                    </button>
                    <button onClick={() => window.triggerTrierPrint('tech-workload', { data })} style={{
                        background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)',
                        borderRadius: 6, color: '#94a3b8', cursor: 'pointer', padding: '4px 8px',
                        display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.7rem',
                    }} title={t('techWorkload.printWorkloadReportTip', 'Print technician load distribution')}>
                        <Printer size={12} /> Print
                    </button>
                </div>
            </div>

            {/* Summary Stats Bar */}
            <div style={{
                display: 'flex', gap: 20, padding: '10px 20px',
                borderBottom: '1px solid var(--glass-border)',
                background: 'rgba(0,0,0,0.15)', fontSize: '0.75rem',
            }}>
                <span style={{ color: '#10b981', fontWeight: 700 }}>
                    ✅ {data.summary.totalCompleted || 0} Completed (30d)
                </span>
                <span style={{ color: '#3b82f6', fontWeight: 700 }}>
                    📋 {data.summary.totalActive || 0} Active
                </span>
                <span style={{ color: '#f59e0b', fontWeight: 700 }}>
                    ⚠️ {data.summary.overloaded || 0} Overloaded
                </span>
                <span style={{ color: '#94a3b8', marginLeft: 'auto' }}>
                    Avg: {data.summary.avgPerTech?.toFixed(1) || '0'} WOs/tech
                </span>
            </div>

            {/* Technician List */}
            <div style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', padding: '10px 16px' }}>
                {data.technicians.map((tech) => {
                    const capacityColor = getCapacityColor(tech.activeCount);
                    const capacityPct = Math.min((tech.activeCount / MAX_CAPACITY) * 100, 100);

                    return (
                        <div key={tech.name} style={{ marginBottom: 8 }}>
                            <div
                                onClick={() => setSelectedTech(tech)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 12,
                                    padding: '12px 14px', borderRadius: 10,
                                    background: 'rgba(255,255,255,0.03)',
                                    border: `1px solid ${tech.activeCount >= MAX_CAPACITY ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.06)'}`,
                                    cursor: 'pointer', transition: 'all 0.2s',
                                }}
                                className="nav-item-hover"
                            >
                                {/* Avatar */}
                                <div style={{
                                    width: 38, height: 38, borderRadius: 10,
                                    background: `${capacityColor}20`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontWeight: 800, fontSize: '0.85rem', color: capacityColor,
                                    flexShrink: 0,
                                }}>
                                    {tech.name.charAt(0).toUpperCase()}
                                </div>

                                {/* Name & Details */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        fontSize: '0.88rem', fontWeight: 600, color: '#f1f5f9',
                                    }}>
                                        {tech.name}
                                        <span style={{
                                            fontSize: '0.65rem', padding: '1px 8px', borderRadius: 8,
                                            background: capacityColor + '20', color: capacityColor,
                                            fontWeight: 700, textTransform: 'uppercase',
                                        }}>
                                            {getCapacityLabel(tech.activeCount)}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2, display: 'flex', gap: 12 }}>
                                        <span>{tech.activeCount} active</span>
                                        {tech.pmCount > 0 && <span style={{ color: '#10b981' }}>🔧 {tech.pmCount} PMs</span>}
                                        {tech.emergencyCount > 0 && <span style={{ color: '#ef4444' }}>🚨 {tech.emergencyCount} emerg</span>}
                                        {tech.completedCount > 0 && <span style={{ color: '#64748b' }}>✓ {tech.completedCount} done (30d)</span>}
                                    </div>
                                </div>

                                {/* Capacity Gauge */}
                                <div style={{ width: 120, flexShrink: 0 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#94a3b8', marginBottom: 3 }}>
                                        <span>{tech.activeCount}/{MAX_CAPACITY}</span>
                                        <span>{Math.round(capacityPct)}%</span>
                                    </div>
                                    <div style={{
                                        height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden',
                                    }}>
                                        <div style={{
                                            width: `${capacityPct}%`, height: '100%',
                                            background: capacityColor, borderRadius: 3,
                                            transition: 'width 0.5s ease-out',
                                        }} />
                                    </div>
                                </div>

                                {/* Count Badge */}
                                <div style={{
                                    width: 32, height: 32, borderRadius: 8,
                                    background: capacityColor + '15',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontWeight: 800, fontSize: '1rem', color: capacityColor,
                                    flexShrink: 0,
                                }}>
                                    {tech.activeCount}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* View/Edit/Save/Print Standard Detail Modal via Portal */}
            {selectedTech && createPortal(
                <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => { setSelectedTech(null); setEditing(false); }}>
                    <div className="glass-card modal-content-standard" style={{ width: '90%', maxWidth: 700, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                        <ActionBar
                            title={`${t('techWorkload.technicianDetail', 'Technician Profile:')} ${selectedTech.name}`}
                            icon={<Users size={20} />}
                            isEditing={editing}
                            isCreating={false}
                            onEdit={() => setEditing(true)}
                            onSave={() => { setEditing(false); window.trierToast?.success('Workload settings saved'); }}
                            onPrint={() => window.triggerTrierPrint('tech-workload-detail', { tech: selectedTech, MAX_CAPACITY })}
                            onClose={() => { setSelectedTech(null); setEditing(false); }}
                            onCancel={() => setEditing(false)}
                        />

                        <div className="scroll-area" style={{ padding: 25, flex: 1, overflowY: 'auto' }}>
                            {/* Profile Header */}
                            <div style={{ display: 'flex', gap: 20, marginBottom: 30, alignItems: 'center' }}>
                                <div style={{
                                    width: 80, height: 80, borderRadius: 20, background: getCapacityColor(selectedTech.activeCount) + '20',
                                    color: getCapacityColor(selectedTech.activeCount), display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '2.5rem', fontWeight: 800, flexShrink: 0
                                }}>
                                    {selectedTech.name.charAt(0).toUpperCase()}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <h2 style={{ margin: '0 0 5px 0', fontSize: '1.5rem', color: '#f8fafc' }}>{selectedTech.name}</h2>
                                    <span style={{
                                        padding: '4px 10px', borderRadius: 12, background: getCapacityColor(selectedTech.activeCount) + '20',
                                        color: getCapacityColor(selectedTech.activeCount), fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase',
                                    }}>
                                        Current Load: {getCapacityLabel(selectedTech.activeCount)} ({selectedTech.activeCount}/{MAX_CAPACITY})
                                    </span>
                                </div>
                            </div>

                            {editing ? (
                                <div className="panel-box" style={{ padding: 20, marginBottom: 20, border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.05)' }}>
                                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', color: '#f59e0b' }}>
                                        <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: 2 }} />
                                        <div>
                                            <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem' }}>{t('techWorkload.readonlyAggregations', 'Live Aggregation Read-Only Mode')}</h4>
                                            <p style={{ margin: 0, fontSize: '0.8rem', lineHeight: 1.5, color: '#cbd5e1' }}>
                                                Tech workloads are mathematically generated live from the core Work Orders database and cannot be manually overridden. To update a technician's capacity or remove items from their queue, please return to the main Work Orders View and reassign the specific tickets.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {/* Stats Grid */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 30 }}>
                                        <div className="panel-box" style={{ padding: 15, textAlign: 'center' }}>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 5 }}>Active</div>
                                            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#3b82f6' }}>{selectedTech.activeCount}</div>
                                        </div>
                                        <div className="panel-box" style={{ padding: 15, textAlign: 'center' }}>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 5 }}>PMs</div>
                                            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#10b981' }}>{selectedTech.pmCount}</div>
                                        </div>
                                        <div className="panel-box" style={{ padding: 15, textAlign: 'center' }}>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 5 }}>Emergency</div>
                                            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#ef4444' }}>{selectedTech.emergencyCount}</div>
                                        </div>
                                        <div className="panel-box" style={{ padding: 15, textAlign: 'center' }}>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 5 }}>30d Close</div>
                                            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#64748b' }}>{selectedTech.completedCount}</div>
                                        </div>
                                    </div>

                                    {/* Work Orders List */}
                                    <h3 style={{ fontSize: '1rem', color: '#f8fafc', marginBottom: 15, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 10 }}>Assigned Work Queue</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {selectedTech.workOrders?.length > 0 ? selectedTech.workOrders.map((wo, idx) => (
                                            <div key={idx} style={{
                                                padding: '12px 16px', borderRadius: 8,
                                                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                                                borderLeft: `3px solid ${wo.type === 'emergency' ? '#ef4444' : wo.type === 'pm' ? '#10b981' : '#6366f1'}`,
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                                            }}>
                                                <div>
                                                    <div style={{ fontWeight: 700, color: '#e2e8f0', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        {wo.type === 'emergency' && <AlertTriangle size={12} color="#ef4444" />}
                                                        {wo.woNumber || `#${wo.id}`}
                                                    </div>
                                                    <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{wo.description}</div>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span style={{
                                                        fontSize: '0.65rem', padding: '3px 8px', borderRadius: 6,
                                                        background: wo.status === 'In Progress' ? 'rgba(99,102,241,0.15)' : 'rgba(245,158,11,0.15)',
                                                        color: wo.status === 'In Progress' ? '#818cf8' : '#f59e0b',
                                                        fontWeight: 600, textTransform: 'uppercase'
                                                    }}>
                                                        {wo.status}
                                                    </span>
                                                </div>
                                            </div>
                                        )) : (
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic', padding: 20, textAlign: 'center' }}>
                                                Queue is currently empty.
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
