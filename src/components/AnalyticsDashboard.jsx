// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Analytics Dashboard
 * ==================================
 * Executive-level analytics hub combining maintenance KPI cards,
 * cost trend analysis, predictive maintenance metrics, OEE, and
 * utility consumption intelligence in a single tabbed view.
 *
 * TABS:
 *   Overview      — KPI summary cards: open WOs, PM compliance %, MTBF, cost/asset
 *   Budget        — BudgetForecaster component: 12-month spend projection with bands
 *   MTBF          — MtbfDashboard: Mean Time Between Failures by asset and category
 *   OEE           — OeeDashboard: Overall Equipment Effectiveness (Availability × Performance × Quality)
 *   Utilities     — Electricity, gas, and water consumption with cost-per-unit trends
 *   Trends        — Cost trend charts: labor vs. parts vs. contractors over 12 months
 *
 * API CALLS:
 *   GET /api/analytics/narrative    Cross-plant workload narrative (KPI summary text)
 *   GET /api/budget-forecast        12-month projection data for BudgetForecaster
 *   GET /api/energy/readings        Utility meter data for the Utilities tab
 *
 * CONSUMERS: Rendered as the "Analytics" nav item in the main sidebar.
 *   Data refreshes on tab change and on manual refresh button press.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Activity, AlertTriangle, TrendingUp, BarChart2, ServerCrash, Clock, Box, DollarSign, PieChart, Package, Zap, Droplets, Flame } from 'lucide-react';
import BudgetForecaster from './BudgetForecaster';
import MtbfDashboard from './MtbfDashboard';
import OeeDashboard from './OeeDashboard';
import { useTranslation } from '../i18n/index.jsx';
import { TakeTourButton } from './ContextualTour';

export default function AnalyticsDashboard({ plantId }) {
    const { t } = useTranslation();
    const userRole = localStorage.getItem('userRole') || 'employee';

    if (!['manager', 'corporate', 'it_admin', 'creator'].includes(userRole)) {
        return (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#ef4444', background: 'rgba(239, 68, 68, 0.05)', borderRadius: 16, border: '1px solid rgba(239, 68, 68, 0.2)', margin: '20px' }}>
                <BarChart2 size={48} style={{ marginBottom: 16, opacity: 0.8 }} />
                <h2 style={{ fontSize: '1.4rem', marginBottom: 8 }}>{t('analytics.accessDenied', 'Access Restricted')}</h2>
                <p style={{ color: 'var(--text-muted)' }}>{t('analytics.accessDeniedDesc', 'You do not have the required executive clearance to view Reports & Analytics.')}</p>
            </div>
        );
    }

    const [narrative, setNarrative] = useState(null);
    const [auditLog, setAuditLog] = useState([]);
    const [loading, setLoading] = useState(true);
    const [utilityRecords, setUtilityRecords] = useState([]);

    useEffect(() => {
        let active = true;
        const fetchAnalytics = async () => {
            setLoading(true);
            try {
                const effectivePlant = plantId || localStorage.getItem('selectedPlantId') || 'all_sites';
                const headers = {
                    'x-plant-id': effectivePlant
                };
                const [narrativeRes, auditRes, utilRes] = await Promise.all([
                    fetch('/api/analytics/narrative', { headers }).then(r => r.ok ? r.json() : { error: true }),
                    fetch('/api/analytics/audit', { headers }).then(r => r.ok ? r.json() : []),
                    fetch('/api/utilities', { headers }).then(r => r.ok ? r.json() : []).catch(() => [])
                ]);
                if (!active) return;
                setNarrative(narrativeRes.error ? null : narrativeRes);
                setAuditLog(Array.isArray(auditRes) ? auditRes : []);
                setUtilityRecords(Array.isArray(utilRes) ? utilRes : []);
            } catch (err) {
                console.error('Failed to load Analytics', err);
            } finally {
                if (active) setLoading(false);
            }
        };

        fetchAnalytics();
        return () => { active = false; };
    }, [plantId]);

    // ── Utility Stats ─────────────────────────────────────────────────────
    const utilityStats = useMemo(() => {
        const stats = {
            Electricity: { cost: 0, consumption: 0, count: 0 },
            Water: { cost: 0, consumption: 0, count: 0 },
            Gas: { cost: 0, consumption: 0, count: 0 },
            total: 0
        };
        utilityRecords.forEach(r => {
            const type = r.Type;
            if (stats[type]) {
                stats[type].cost += Number(r.BillAmount) || 0;
                stats[type].consumption += Number(r.MeterReading) || 0;
                stats[type].count++;
            }
            stats.total += Number(r.BillAmount) || 0;
        });
        return stats;
    }, [utilityRecords]);

    if (loading) {
        return (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                <Activity size={48} className="spin" color="var(--primary)" />
                <span style={{ marginLeft: '15px' }}>{t('analytics.compilingEnterpriseDiagnostics')}</span>
            </div>
        );
    }

    if (!narrative) {
        return (
            <div style={{ color: '#ef4444', textAlign: 'center', padding: '40px' }}>
                <ServerCrash size={48} style={{ marginBottom: '15px' }} />
                <h3>{t('analytics.failedToCompileEnterprise')}</h3>
            </div>
        );
    }

    return (
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '10px' }}>

            {/* Top Insight Row */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '25px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <TakeTourButton tourId="analytics" />
                    <h3 style={{ margin: 0, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <BarChart2 size={18} /> {t('analytics.deepInsights')}
                    </h3>
                    {narrative.scope && narrative.scope !== 'enterprise' && (
                        <span className="badge badge-primary" style={{ fontSize: '0.75rem' }}>
                            {narrative.scope.replace(/_/g, ' ')}
                        </span>
                    )}
                    {(!narrative.scope || narrative.scope === 'enterprise') && (
                        <span className="badge badge-blue" style={{ fontSize: '0.75rem' }}>{t('dashboard.allPlants', 'All Plants')}</span>
                    )}
                </div>

                {narrative.insights?.length === 0 ? (
                    <div className="glass-card" style={{ padding: '20px', textAlign: 'center', color: 'var(--primary)' }}>
                        {t('analytics.allTrackedFacilitiesOperating')}
                    </div>
                ) : (
                    narrative.insights?.map((insight, idx) => (
                        <div key={idx} className="glass-card" style={{
                            padding: '15px 20px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '15px',
                            borderLeft: `4px solid ${insight.type === 'critical' ? '#ef4444' : insight.type === 'delays' ? '#f59e0b' : 'var(--primary)'}`
                        }}>
                            {insight.type === 'critical' ? <AlertTriangle color="#ef4444" size={24} /> :
                                insight.type === 'delays' ? <Clock color="#f59e0b" size={24} /> :
                                    <TrendingUp color="var(--primary)" size={24} />}

                            <div style={{ flex: 1 }}>
                                <strong style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                    {insight.plant.toUpperCase()} {insight.type.toUpperCase()}
                                </strong>
                                <span style={{ fontSize: '1.1rem' }}>{insight.msg}</span>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Main Insight Matrix */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(350px, 1fr) minmax(350px, 1fr)', gap: '25px', height: '600px', marginBottom: '40px' }}>
                
                {/* Column 1: Assets & Logistics Capacity */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '25px', overflow: 'hidden' }}>
                    
                    {/* Regional Workload Spread */}
                    <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                        <h3 style={{ margin: '0 0 15px 0', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Activity size={18} /> {t('analytics.regionalWorkloadSpread')}
                        </h3>

                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '12px' }} className="custom-scrollbar">
                            {narrative.workloadDistribution?.map((w, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '10px 15px', borderRadius: '6px' }}>
                                    <span style={{ fontWeight: 500 }}>{w.plant.replace('_', ' ')}</span>
                                    <div style={{ display: 'flex', gap: '15px', fontSize: '0.9rem' }}>
                                        <span style={{ color: 'var(--text-muted)' }} title={t('analytics.historicalLifetimeWos')}>Total: {w.total}</span>
                                        <span style={{ color: '#10b981', fontWeight: 'bold' }} title={t('analytics.activeUnresolvedWos')}>Active: {w.active}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Logistics Ledger Audit Trail */}
                    <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                        <h3 style={{ margin: '0 0 15px 0', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}>
                            <Box size={18} /> {t('analytics.logisticsAuditLedger')}
                        </h3>

                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '10px' }} className="custom-scrollbar">
                            {(!Array.isArray(auditLog) || auditLog.length === 0) ? (
                                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>{t('analytics.noLogisticsTransfersLogged')}</div>
                            ) : (
                                auditLog.map((log, idx) => (
                                    <div key={idx} style={{
                                        fontSize: '0.85rem',
                                        padding: '10px',
                                        background: 'rgba(0,0,0,0.2)',
                                        borderRadius: '6px',
                                        borderLeft: '2px solid #3b82f6',
                                        color: 'var(--text-muted)',
                                        lineHeight: '1.4'
                                    }}>
                                        {log}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Column 2: Financial Matrix */}
                <div className="glass-card" style={{ padding: '25px', display: 'flex', flexDirection: 'column', border: '1px solid rgba(16, 185, 129, 0.2)', overflow: 'hidden' }}>
                    <h3 style={{ margin: '0 0 20px 0', display: 'flex', alignItems: 'center', gap: '10px', color: '#10b981' }}>
                        <DollarSign size={22} /> {narrative.scope === 'enterprise' || !narrative.scope ? t('analytics.enterpriseFinancialAnalysis') : 'Plant Financial Analysis'}
                    </h3>

                    {!narrative.enterpriseFinancials ? (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                            {t('analytics.noFinancialTelemetryAvailable')}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '25px', flex: 1, overflowY: 'auto', paddingRight: '10px' }} className="custom-scrollbar">
                            
                            {/* Grand Total Hero */}
                            <div style={{ background: 'rgba(16,185,129,0.05)', padding: '25px', borderRadius: '15px', border: '1px solid rgba(16, 185, 129, 0.1)', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>{t('analytics.aggregatedOperatingSpend')}</div>
                                <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#10b981' }}>
                                    ${narrative.enterpriseFinancials.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </div>
                            </div>

                            {/* Breakdown Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', marginBottom: '10px', fontSize: '0.85rem' }}>
                                        <Activity size={14} /> {t('analytics.laborSpend')}
                                    </div>
                                    <div style={{ fontSize: '1.4rem', fontWeight: 600 }}>${narrative.enterpriseFinancials.labor.toLocaleString()}</div>
                                </div>
                                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', marginBottom: '10px', fontSize: '0.85rem' }}>
                                        <Package size={14} /> {t('analytics.criticalSpares')}
                                    </div>
                                    <div style={{ fontSize: '1.4rem', fontWeight: 600 }}>${narrative.enterpriseFinancials.parts.toLocaleString()}</div>
                                </div>
                            </div>

                            {/* External/Misc */}
                            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', marginBottom: '15px', fontSize: '0.85rem' }}>
                                    <PieChart size={14} /> {t('analytics.spendDistributionExternalmisc')}
                                </div>
                                <div style={{ fontSize: '1.8rem', fontWeight: 400, color: 'var(--text-muted)' }}>
                                    ${narrative.enterpriseFinancials.misc.toLocaleString()} 
                                    <span style={{ fontSize: '0.9rem', marginLeft: '10px', opacity: 0.5 }}>
                                        ({((narrative.enterpriseFinancials.misc / (narrative.enterpriseFinancials.total || 1)) * 100).toFixed(1)}% of total)
                                    </span>
                                </div>
                                
                                <div style={{ marginTop: '20px', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', overflow: 'hidden', display: 'flex' }}>
                                    <div style={{ width: `${(narrative.enterpriseFinancials.labor / narrative.enterpriseFinancials.total) * 100}%`, background: '#3b82f6' }} />
                                    <div style={{ width: `${(narrative.enterpriseFinancials.parts / narrative.enterpriseFinancials.total) * 100}%`, background: '#8b5cf6' }} />
                                    <div style={{ width: `${(narrative.enterpriseFinancials.misc / narrative.enterpriseFinancials.total) * 100}%`, background: '#10b981' }} />
                                </div>
                                <div style={{ display: 'flex', gap: '15px', marginTop: '10px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '8px', height: '8px', background: '#3b82f6', borderRadius: '2px' }} /> {t('analytics.labor')}</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '8px', height: '8px', background: '#8b5cf6', borderRadius: '2px' }} /> {t('analytics.parts')}</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '8px', height: '8px', background: '#10b981', borderRadius: '2px' }} /> {t('analytics.misc')}</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

            </div>

            {/* ═══════════ UTILITY INTELLIGENCE ═══════════ */}
            {utilityRecords.length > 0 && (
                <div className="glass-card" style={{ padding: '25px', marginBottom: '30px', border: '1px solid rgba(245,158,11,0.15)' }}>
                    <h3 style={{ margin: '0 0 20px 0', display: 'flex', alignItems: 'center', gap: '10px', color: '#f59e0b' }}>
                        <Zap size={20} />{t('dashboard.utilityIntelligence', 'Utility Intelligence')}<span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: 'auto' }}>
                            {utilityRecords.length} records · Total: ${utilityStats.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </h3>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
                        {/* Electricity */}
                        <div style={{ background: 'rgba(245,158,11,0.06)', padding: '18px 20px', borderRadius: '14px', border: '1px solid rgba(245,158,11,0.15)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Zap size={16} color="#f59e0b" />
                                </div>
                                <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>{t('dashboard.electricity', 'Electricity')}</span>
                            </div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f1f5f9' }}>
                                ${utilityStats.Electricity.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 4 }}>
                                {utilityStats.Electricity.consumption.toLocaleString()} kWh · {utilityStats.Electricity.count} readings
                            </div>
                        </div>

                        {/* Water */}
                        <div style={{ background: 'rgba(59,130,246,0.06)', padding: '18px 20px', borderRadius: '14px', border: '1px solid rgba(59,130,246,0.15)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Droplets size={16} color="#3b82f6" />
                                </div>
                                <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>{t('dashboard.water', 'Water')}</span>
                            </div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f1f5f9' }}>
                                ${utilityStats.Water.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 4 }}>
                                {utilityStats.Water.consumption.toLocaleString()} GAL · {utilityStats.Water.count} readings
                            </div>
                        </div>

                        {/* Gas */}
                        <div style={{ background: 'rgba(239,68,68,0.06)', padding: '18px 20px', borderRadius: '14px', border: '1px solid rgba(239,68,68,0.15)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Flame size={16} color="#ef4444" />
                                </div>
                                <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>{t('dashboard.gas', 'Gas')}</span>
                            </div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f1f5f9' }}>
                                ${utilityStats.Gas.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 4 }}>
                                {utilityStats.Gas.consumption.toLocaleString()} THERM · {utilityStats.Gas.count} readings
                            </div>
                        </div>
                    </div>

                    {/* Utility Spend Distribution Bar */}
                    {utilityStats.total > 0 && (
                        <div>
                            <div style={{ height: 8, borderRadius: 6, overflow: 'hidden', display: 'flex', gap: 2, background: 'rgba(255,255,255,0.03)' }}>
                                <div style={{ width: `${(utilityStats.Electricity.cost / utilityStats.total) * 100}%`, background: '#f59e0b', borderRadius: 4 }} />
                                <div style={{ width: `${(utilityStats.Water.cost / utilityStats.total) * 100}%`, background: '#3b82f6', borderRadius: 4 }} />
                                <div style={{ width: `${(utilityStats.Gas.cost / utilityStats.total) * 100}%`, background: '#ef4444', borderRadius: 4 }} />
                            </div>
                            <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: '#f59e0b' }} /> Electricity {((utilityStats.Electricity.cost / utilityStats.total) * 100).toFixed(0)}%</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: '#3b82f6' }} /> Water {((utilityStats.Water.cost / utilityStats.total) * 100).toFixed(0)}%</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: '#ef4444' }} /> Gas {((utilityStats.Gas.cost / utilityStats.total) * 100).toFixed(0)}%</div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Budget Forecaster (Task 2.3b) */}
            <div style={{ marginBottom: '30px' }}>
                <BudgetForecaster plantId={plantId} />
            </div>

            {/* MTBF/MTTR Reliability Dashboard */}
            <div style={{ marginBottom: '30px' }}>
                <MtbfDashboard plantId={plantId} />
            </div>

            {/* OEE Dashboard */}
            <div style={{ marginBottom: '30px' }}>
                <OeeDashboard plantId={plantId} />
            </div>

        </div>
    );
}
