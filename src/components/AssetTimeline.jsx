// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Asset Maintenance Timeline
 * =======================================
 * Visual chronological timeline of all maintenance activity for a single asset.
 * Renders work orders, PM completions, repairs, and inspections as color-coded
 * event cards — giving technicians and managers a full asset history at a glance.
 *
 * EVENT TYPES (color-coded):
 *   Preventive Maintenance  — Blue: scheduled PM completions with tech name
 *   Corrective Repair       — Red: breakdown repairs with failure code
 *   Inspection              — Yellow: inspection results with pass/fail
 *   Lubrication             — Green: lube service events
 *   Calibration             — Purple: calibration records with tolerance results
 *
 * KEY FEATURES:
 *   - Infinite scroll or paginated timeline (newest events first)
 *   - Event detail modal: full WO details, labor hours, parts consumed
 *   - Filter by event type, date range, and technician
 *   - MTBF indicator: days since last failure shown between repair events
 *   - Cost overlay: cumulative maintenance spend per time period
 *   - Export timeline as PDF for equipment history report
 *
 * API CALLS:
 *   GET /api/assets/:id/timeline   — Full maintenance event history for asset
 */
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Activity, Shield, AlertTriangle, Wrench, CheckCircle, Clock, X, TrendingUp, TrendingDown } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

/**
 * AssetTimeline — Digital Twin Health Timeline
 * =============================================
 * Visual timeline showing an asset's complete maintenance biography:
 * - Chronological WOs, PMs, and failures
 * - Health progression overlay
 * - Failure events with red markers
 * - PM completions with green markers
 */
export default function AssetTimeline({ assetId, onClose }) {
    const { t } = useTranslation();
    const [events, setEvents] = useState([]);
    const [healthData, setHealthData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (assetId) fetchTimeline();
    }, [assetId]);

    const fetchTimeline = async () => {
        setLoading(true);
        try {
            const plantId = localStorage.getItem('selectedPlantId') || 'Demo_Plant_1';
            const res = await fetch(`/api/assets/${encodeURIComponent(assetId)}/timeline`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                    'x-plant-id': plantId
                }
            });
            const data = await res.json();
            setEvents(data.events || []);
            setHealthData(data.health || null);
        } catch (err) {
            console.error('Failed to load asset timeline:', err);
        } finally {
            setLoading(false);
        }
    };

    const getEventIcon = (type) => {
        switch(type) {
            case 'emergency': return <AlertTriangle size={16} />;
            case 'corrective': return <Wrench size={16} />;
            case 'pm': return <Shield size={16} />;
            case 'completed': return <CheckCircle size={16} />;
            default: return <Clock size={16} />;
        }
    };

    const getEventColor = (type) => {
        switch(type) {
            case 'emergency': return '#ef4444';
            case 'corrective': return '#f59e0b';
            case 'pm': return '#10b981';
            case 'completed': return '#10b981';
            default: return '#6366f1';
        }
    };

    if (!assetId) return null;

    return createPortal((
        <div className="modal-overlay print-exclude" onClick={onClose}>
            <div 
                className="glass-card modal-content-standard" 
                onClick={e => e.stopPropagation()}
                style={{ maxWidth: '800px', width: '90%' }}
            >
                {/* Header */}
                <div style={{ 
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                    padding: '20px 25px', borderBottom: '1px solid var(--glass-border)',
                    background: 'rgba(99, 102, 241, 0.03)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Activity size={24} color="var(--primary)" />
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>{t('asset.timeline.assetHealthTimeline')}</h2>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{assetId}</div>
                        </div>
                    </div>
                    <button onClick={onClose} title={t('assetTimeline.closeTheAssetHealthTimelineTip')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <X size={24} />
                    </button>
                </div>

                {/* Health Summary Bar */}
                {healthData && (
                    <div style={{ 
                        display: 'flex', gap: '20px', padding: '15px 25px', 
                        borderBottom: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.15)',
                        fontSize: '0.8rem'
                    }}>
                        <div>
                            <span style={{ color: 'var(--text-muted)' }}>{t('asset.timeline.healthScore')} </span>
                            <strong style={{ color: healthData.healthScore >= 70 ? '#10b981' : healthData.healthScore >= 40 ? '#f59e0b' : '#ef4444' }}>
                                {healthData.healthScore}%
                            </strong>
                        </div>
                        <div>
                            <span style={{ color: 'var(--text-muted)' }}>{t('asset.timeline.mtbf')} </span>
                            <strong>{healthData.mtbfDays || '?'} days</strong>
                        </div>
                        <div>
                            <span style={{ color: 'var(--text-muted)' }}>{t('asset.timeline.trend')} </span>
                            <strong style={{ 
                                color: healthData.mtbfTrend === 'improving' ? '#10b981' : healthData.mtbfTrend === 'worsening' ? '#ef4444' : '#f59e0b',
                                display: 'inline-flex', alignItems: 'center', gap: '4px'
                            }}>
                                {healthData.mtbfTrend === 'improving' ? <TrendingUp size={14} /> : healthData.mtbfTrend === 'worsening' ? <TrendingDown size={14} /> : null}
                                {healthData.mtbfTrend || 'unknown'}
                            </strong>
                        </div>
                        <div>
                            <span style={{ color: 'var(--text-muted)' }}>{t('asset.timeline.totalEvents')} </span>
                            <strong>{events.length}</strong>
                        </div>
                    </div>
                )}

                {/* Timeline */}
                <div className="scroll-area" style={{ flex: 1, overflowY: 'auto', padding: '25px', minHeight: 0 }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '40px' }}>
                            <div className="spinning" style={{ border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--primary)', borderRadius: '50%', width: '30px', height: '30px', margin: '0 auto 10px' }}></div>
                            <span style={{ color: 'var(--text-muted)' }}>{t('asset.timeline.loadingMaintenanceBiography')}</span>
                        </div>
                    ) : events.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                            <Activity size={40} style={{ opacity: 0.3, marginBottom: '10px' }} />
                            <p>{t('asset.timeline.noMaintenanceHistoryFound')}</p>
                        </div>
                    ) : (
                        <div style={{ position: 'relative', paddingLeft: '30px' }}>
                            {/* Vertical line */}
                            <div style={{ 
                                position: 'absolute', left: '11px', top: 0, bottom: 0, 
                                width: '2px', background: 'var(--glass-border)'
                            }}></div>

                            {events.map((evt, i) => {
                                const color = getEventColor(evt.type);
                                return (
                                    <div key={i} style={{ position: 'relative', marginBottom: '20px' }}>
                                        {/* Dot on timeline */}
                                        <div style={{ 
                                            position: 'absolute', left: '-25px', top: '4px',
                                            width: '14px', height: '14px', borderRadius: '50%',
                                            background: color, border: '2px solid rgba(0,0,0,0.3)',
                                            boxShadow: `0 0 8px ${color}40`
                                        }}></div>

                                        {/* Event card */}
                                        <div style={{ 
                                            padding: '12px 16px', borderRadius: '10px',
                                            background: 'rgba(0,0,0,0.2)',
                                            borderLeft: `3px solid ${color}`,
                                            transition: 'all 0.2s'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ color, display: 'flex' }}>{getEventIcon(evt.type)}</span>
                                                    <span style={{ 
                                                        fontSize: '0.65rem', padding: '1px 8px', borderRadius: '8px',
                                                        background: `${color}20`, color, fontWeight: 'bold', textTransform: 'uppercase'
                                                    }}>
                                                        {evt.typeLabel || evt.type}
                                                    </span>
                                                    {evt.woNumber && (
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--primary)' }}>WO# {evt.woNumber}</span>
                                                    )}
                                                </div>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{evt.date}</span>
                                            </div>
                                            <div style={{ fontSize: '0.9rem', fontWeight: 500, color: '#fff', lineHeight: '1.4' }}>
                                                {evt.description}
                                            </div>
                                            {evt.labor && (
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                    Technician: {evt.labor} {evt.hours ? `• ${evt.hours} hrs` : ''}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="modal-footer">
                    <button className="btn-nav" onClick={onClose} title={t('assetTimeline.closeTheAssetHealthTimelineTip')}>{t('asset.timeline.close')}</button>
                </div>
            </div>
        </div>
    ), document.body);
}
