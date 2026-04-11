// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Technician Performance Metrics
 * ==========================================
 * Individual technician KPI dashboard. Used by managers during performance
 * reviews to show work order completion rates, response times, PM compliance,
 * and labor hour distributions per technician.
 *
 * KEY METRICS:
 *   WO Completion Rate  — Closed WOs / Assigned WOs × 100%
 *   Avg Response Time   — Mean hours from WO creation to first "In Progress" status
 *   PM Compliance %     — PMs completed on time vs total assigned PMs
 *   Labor Efficiency    — ActualHours / ExpectedDuration ratio per technician
 *   On-Time Rate        — % of WOs closed within the SLA window for that priority
 *
 * KEY FEATURES:
 *   - Technician selector: pick any plant technician for detailed review
 *   - KPI tile row: completion rate, response time, PM compliance, efficiency
 *   - WO history table: all WOs handled by this tech in the selected period
 *   - Labor trend chart: weekly hours worked vs expected (rolling 12 weeks)
 *   - Date range filter: customize review period (last 30 / 90 / 365 days)
 *   - Print: formatted performance summary for HR review folder
 *
 * DATA SOURCES:
 *   GET /api/work-orders/technician-metrics   — Individual technician KPIs
 */
import React, { useState, useEffect } from 'react';
import { Users, Clock, Wrench, TrendingUp, Award } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';
import { formatDate } from '../utils/formatDate';

/**
 * TechnicianMetrics — Enterprise Workforce Performance Dashboard
 * ==============================================================
 * Shows per-technician metrics across all plants:
 * - WOs completed
 * - Total hours logged
 * - Avg hours per job
 * - Overtime percentage
 * - Last activity date
 */
export default function TechnicianMetrics() {
    const { t } = useTranslation();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/analytics/technician-performance', {
                headers: {  }
            });
            const json = await res.json();
            setData(json);
        } catch (err) {
            console.error('Failed to load technician metrics:', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="glass-card" style={{ padding: '40px', textAlign: 'center' }}>
                <Users className="animate-pulse" size={40} color="var(--primary)" />
                <p style={{ color: 'var(--text-muted)', marginTop: '10px' }}>{t('technician.metrics.calculatingWorkforceMetrics')}</p>
            </div>
        );
    }

    if (!data || !data.technicians || data.technicians.length === 0) {
        return (
            <div className="glass-card" style={{ padding: '40px', textAlign: 'center' }}>
                <Users size={40} color="var(--text-muted)" style={{ opacity: 0.3 }} />
                <p style={{ color: 'var(--text-muted)', marginTop: '10px' }}>No technician data available yet. Labor records will appear as work orders are completed.</p>
            </div>
        );
    }

    const techs = data.technicians;
    const totalHrs = Math.round(techs.reduce((s, t) => s + t.totalHrs, 0) * 100) / 100;
    const totalWOs = techs.reduce((s, t) => s + t.woCount, 0);
    const avgOT = techs.length > 0 ? Math.round(techs.reduce((s, t) => s + t.overtimePct, 0) / techs.length) : 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px' }}>
                <div className="glass-card" style={{ padding: '20px', textAlign: 'center' }}>
                    <Users size={24} color="#6366f1" />
                    <div style={{ fontSize: '1.8rem', fontWeight: 'bold', marginTop: '8px' }}>{techs.length}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('technician.metrics.activeTechnicians')}</div>
                </div>
                <div className="glass-card" style={{ padding: '20px', textAlign: 'center' }}>
                    <Clock size={24} color="#10b981" />
                    <div style={{ fontSize: '1.8rem', fontWeight: 'bold', marginTop: '8px' }}>{totalHrs.toLocaleString()}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('technician.metrics.totalHoursLogged')}</div>
                </div>
                <div className="glass-card" style={{ padding: '20px', textAlign: 'center' }}>
                    <Wrench size={24} color="#f59e0b" />
                    <div style={{ fontSize: '1.8rem', fontWeight: 'bold', marginTop: '8px' }}>{totalWOs.toLocaleString()}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('technician.metrics.wosCompleted')}</div>
                </div>
                <div className="glass-card" style={{ padding: '20px', textAlign: 'center' }}>
                    <TrendingUp size={24} color={avgOT > 20 ? '#ef4444' : '#10b981'} />
                    <div style={{ fontSize: '1.8rem', fontWeight: 'bold', marginTop: '8px' }}>{avgOT}%</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('technician.metrics.avgOvertimeRate')}</div>
                </div>
            </div>

            {/* Performance Leaderboard */}
            <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
                <div style={{ 
                    padding: '15px 20px', borderBottom: '1px solid var(--glass-border)',
                    background: 'rgba(99, 102, 241, 0.03)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Award size={20} color="var(--primary)" />
                        <h3 style={{ margin: 0, fontSize: '1rem' }}>{t('technician.metrics.workforcePerformanceLeaderboard')}</h3>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {data.plantsScanned} plants scanned
                    </span>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table className="data-table" style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                                <th>{t('technician.metrics.technician')}</th>
                                <th>{t('technician.metrics.plants')}</th>
                                <th style={{ textAlign: 'center' }}>{t('technician.metrics.wosDone')}</th>
                                <th style={{ textAlign: 'center' }}>{t('technician.metrics.totalHrs')}</th>
                                <th style={{ textAlign: 'center' }}>{t('technician.metrics.avgHrsjob')}</th>
                                <th style={{ textAlign: 'center' }}>OT %</th>
                                <th>{t('technician.metrics.lastActive')}</th>
                                <th style={{ textAlign: 'center' }}>{t('technician.metrics.efficiency')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {techs.map((tech, i) => {
                                // Efficiency score: higher WOs per hour + low OT = better
                                const efficiency = tech.totalHrs > 0 
                                    ? Math.min(100, Math.round((tech.woCount / Math.max(tech.totalHrs, 1)) * 50 + (100 - tech.overtimePct) * 0.5))
                                    : tech.woCount > 0 ? 75 : 0;
                                
                                const effColor = efficiency >= 80 ? '#10b981' : efficiency >= 50 ? '#f59e0b' : '#ef4444';
                                const rankBg = i === 0 ? 'rgba(255, 215, 0, 0.08)' : i === 1 ? 'rgba(192, 192, 192, 0.05)' : i === 2 ? 'rgba(205, 127, 50, 0.05)' : 'transparent';
                                const rankIcon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;

                                return (
                                    <tr key={tech.laborId} style={{ background: rankBg }}>
                                        <td style={{ textAlign: 'center', fontSize: i < 3 ? '1.1rem' : '0.85rem' }}>{rankIcon}</td>
                                        <td style={{ fontWeight: 600, color: i < 3 ? '#fff' : 'var(--text-muted)' }}>
                                            {tech.laborId}
                                        </td>
                                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            {tech.plants.join(', ')}
                                        </td>
                                        <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{tech.woCount}</td>
                                        <td style={{ textAlign: 'center' }}>
                                            <span style={{ fontWeight: 'bold' }}>{tech.totalRegHrs}</span>
                                            {tech.totalOTHrs > 0 && (
                                                <span style={{ fontSize: '0.7rem', color: '#f59e0b', marginLeft: '4px' }}>+{tech.totalOTHrs}OT</span>
                                            )}
                                        </td>
                                        <td style={{ textAlign: 'center' }}>{tech.avgHrsPerEntry}</td>
                                        <td style={{ textAlign: 'center' }}>
                                            <div style={{ 
                                                display: 'inline-block', padding: '2px 8px', borderRadius: '10px',
                                                fontSize: '0.7rem', fontWeight: 'bold',
                                                background: tech.overtimePct > 20 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                                                color: tech.overtimePct > 20 ? '#ef4444' : '#10b981'
                                            }}>
                                                {tech.overtimePct}%
                                            </div>
                                        </td>
                                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            {tech.lastActivity 
                                                ? formatDate(tech.lastActivity)
                                                : '--'
                                            }
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                                                <div style={{ 
                                                    width: '50px', height: '6px', borderRadius: '3px', 
                                                    background: 'rgba(255,255,255,0.1)', overflow: 'hidden' 
                                                }}>
                                                    <div style={{ 
                                                        width: `${efficiency}%`, height: '100%', 
                                                        borderRadius: '3px', background: effColor,
                                                        transition: 'width 0.5s ease'
                                                    }}></div>
                                                </div>
                                                <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: effColor }}>{efficiency}</span>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
