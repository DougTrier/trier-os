// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Corporate Analytics Executive Intelligence Dashboard
 * =================================================================
 * Restricted-access command center for C-suite and executive team.
 * Aggregates live KPIs across ALL plant databases and enterprise modules
 * into a unified intelligence feed. Access controlled by a creator-managed
 * whitelist (CEO, COO, CFO, and explicitly granted users).
 *
 * QUADRANTS / SECTIONS:
 *   Executive Summary   — KPI headline cards: total plants, assets, WOs, PM compliance
 *   Plant Rankings      — Ranked plant performance table (cost, compliance, reliability)
 *   Financial           — Cross-plant maintenance spend, labor cost, parts consumption
 *   Risk Matrix         — 2×2 risk heat map: probability vs. impact per plant
 *   Forecast            — 12-month aggregate spend projection with confidence bands
 *   Workforce           — Technician headcount, utilization, and labor efficiency
 *   Asset Intelligence  — Fleet-level asset health, age distribution, replacement queue
 *
 * API CALLS: All via /api/corp-analytics/* (corporate-analytics.js).
 *   Each section fetches independently with skeleton loading and error boundaries.
 *
 * ACCESS: requireCorpAccess middleware enforces the whitelist server-side.
 *   Frontend additionally calls GET /api/corp-analytics/access/check on mount
 *   and shows a locked-screen fallback if access is not granted.
 *
 * PRINT: Exports full corporate intelligence report via window.triggerTrierPrint().
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BarChart3, Factory, Wrench, Cog, Package, Truck, ShieldCheck, Server, Users, AlertTriangle, DollarSign, Calendar, Target, RefreshCw, X, Printer, Key, Zap, Droplets, Flame, Lightbulb, TrendingDown, TrendingUp, CheckCircle2, Activity, Archive, Layers, Clock, Box, Scale, Map, Crown } from 'lucide-react';
import { printRecord, infoGridHTML, tableHTML } from '../utils/printRecord';
import { useTranslation } from '../i18n/index.jsx';
import EquipmentIntelligenceSection from './EquipmentIntelligenceSection';
import { API, fmt, fmtN, SEV_COLORS, KPICard, MiniBarChart, PlantScoreBadge, SeverityBadge, PlantSpendTable, AccessManager } from './CorporateAnalyticsWidgets';

const otdColor = (rate) => {
    if (rate === null || rate === undefined) return '#64748b';
    if (rate >= 90) return '#10b981';
    if (rate >= 75) return '#f59e0b';
    return '#ef4444';
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function CorporateAnalyticsView({ plantId, plantLabel }) {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState(null);
    const [rankings, setRankings] = useState([]);
    const [financial, setFinancial] = useState(null);
    const [risks, setRisks] = useState(null);
    const [forecast, setForecast] = useState(null);
    const [workforce, setWorkforce] = useState(null);
    const [isCreator, setIsCreator] = useState(false);
    const [activeSection, setActiveSection] = useState('overview');
    const [rankExpanded, setRankExpanded] = useState(false);
    const [opexData, setOpexData] = useState(null);
    const [opexLoading, setOpexLoading] = useState(false);
    const [opexModal, setOpexModal] = useState(null);
    const [vendorInflation, setVendorInflation] = useState(null);
    const [vendorInflationModal, setVendorInflationModal] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [selectedRisk, setSelectedRisk] = useState(null);
    const [payScales, setPayScales] = useState([]);
    const [mapPins, setMapPins] = useState([]);
    const [trackingData, setTrackingData] = useState(null);
    const [maintenanceKpis, setMaintenanceKpis] = useState(null);
    const [commitMsg, setCommitMsg] = useState('');
    const [commitPlantId, setCommitPlantId] = useState(plantId || '');
    const [fleetSort, setFleetSort] = useState({ key: 'mileage', dir: -1 });
    const [worstPerformers, setWorstPerformers] = useState([]);
    const [sparePartsRollup, setSparePartsRollup] = useState([]);

    const fetchAll = useCallback(() => {
        setLoading(true);
        // Safe JSON parser — if server returns HTML (e.g. 401/404 page), don't crash
        const safeJson = (r) => r.text().then(t => { try { return JSON.parse(t); } catch { return null; } }).catch(() => null);

        API('/access/check').then(safeJson).then(d => { if (d) setIsCreator(d.isCreator); }).catch(() => {});

        Promise.all([
            API('/executive-summary').then(safeJson),
            API('/plant-rankings').then(safeJson),
            API('/financial').then(safeJson),
            API('/risk-matrix').then(safeJson),
            API('/forecast').then(safeJson),
            API('/workforce').then(safeJson),
            fetch('/api/analytics/pay-scales', { headers: { 'x-plant-id': 'all_sites' } }).then(safeJson),
            fetch('/api/map-pins', { headers: { 'x-plant-id': 'all_sites' } }).then(safeJson),
        ]).then(([s, r, f, ri, fo, w, p, m]) => {
            if (s) setSummary(s);
            if (r) setRankings(r);
            if (f) setFinancial(f);
            if (ri) setRisks(ri);
            if (fo) setForecast(fo);
            if (w) setWorkforce(w);
            if (p) setPayScales(p || []);
            if (m) setMapPins(Array.isArray(m) ? m : []);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    useEffect(() => {
        if (activeSection === 'opex' && !opexData && !opexLoading) {
            setOpexLoading(true);
            API('/opex-intelligence').then(r => r.json())
                .then(d => { if (!d.error) setOpexData(d); setOpexLoading(false); })
                .catch(() => setOpexLoading(false));
        }
        if (activeSection === 'opex' && !vendorInflation) {
            API('/vendor-inflation?days=730&limit=100').then(r => r.json())
                .then(d => { if (!d.error) setVendorInflation(d); })
                .catch(() => {});
        }
        if (activeSection === 'tracking' && !trackingData) {
            fetch('/api/opex-tracking/dashboard', { headers: {  } })
                .then(r => r.json()).then(d => setTrackingData(d)).catch(() => {});
        }
        if (activeSection === 'maintenance' && !maintenanceKpis) {
            const pid = plantId || 'Plant_1';
            fetch(`/api/maintenance-kpis/summary`, { headers: { 'x-plant-id': pid } })
                .then(r => r.json()).then(d => { if (!d.error) setMaintenanceKpis(d); }).catch(() => {});
        }
        if (activeSection === 'financial' && worstPerformers.length === 0) {
            fetch('/api/vendors/scorecard', { headers: { 'x-plant-id': 'all_sites' } })
                .then(r => r.ok ? r.json() : null)
                .then(d => { if (d) setWorstPerformers(d.worstPerformers || []); })
                .catch(() => {});
        }
        if (activeSection === 'financial' && sparePartsRollup.length === 0) {
            fetch('/api/parts/optimization/corporate', { headers: { 'x-plant-id': 'all_sites' } })
                .then(r => r.ok ? r.json() : null)
                .then(d => { if (d) setSparePartsRollup(d.rollup || []); })
                .catch(() => {});
        }
    }, [activeSection, opexData, opexLoading, trackingData, maintenanceKpis, vendorInflation, plantId, worstPerformers.length, sparePartsRollup.length]);


    const sections = [
        { id: 'overview', label: 'Overview', icon: BarChart3 },
        { id: 'plants', label: 'Plant Rankings', icon: Factory },
        { id: 'financial', label: 'Financial', icon: DollarSign },
        { id: 'opex', label: 'OpEx Intel', icon: TrendingDown },
        { id: 'tracking',     label: 'OpEx Tracking',    icon: Target },
        { id: 'equipment', label: 'Equipment Intel', icon: Zap },
        { id: 'risk', label: 'Risk Matrix', icon: AlertTriangle },
        { id: 'forecast', label: 'Forecast', icon: Calendar },
        { id: 'workforce', label: 'Workforce', icon: Users },
        { id: 'realestate', label: 'Property & Real Estate', icon: Map },
        { id: 'maintenance',  label: 'Maintenance KPIs', icon: Wrench },
    ];

    if (loading) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, color: '#64748b' }}>
            <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} /> <span style={{ marginLeft: 10 }}>{t('corpAnalytics.text.loadingCorporateIntelligence', 'Loading corporate intelligence...')}</span>
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '0 8px', maxWidth: 1500, margin: '0 auto' }}>
            {/* ── Header ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                        width: 48, height: 48, borderRadius: 14,
                        background: 'linear-gradient(135deg, #f59e0b, #ea580c)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 20px rgba(245,158,11,0.35)',
                    }}>
                        <Crown size={26} color="#fff" />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 10 }}>{t('corpAnalytics.text.corporateAnalytics', 'Corporate Analytics')}<span style={{
                                fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.06em',
                                padding: '3px 10px', borderRadius: 20,
                                background: 'rgba(245,158,11,0.12)', color: '#f59e0b',
                                border: '1px solid rgba(245,158,11,0.25)',
                            }}>{t('corpAnalytics.text.eXECUTIVEINTELLIGENCE', 'EXECUTIVE INTELLIGENCE')}</span>
                        </h1>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>{t('corpAnalytics.text.enterpriseWideKPIsRankingsFina', 'Enterprise-wide KPIs, rankings, financial rollup, risk matrix, and operational forecasting')}</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button title={t('corpAnalytics.navigateTip')} className="btn-nav" onClick={() => {
                        window.triggerTrierPrint('corp-analytics', {
                            activeSection, plantLabel: plantLabel || 'Enterprise (All Sites)',
                            summary, rankings, financial, opexData, risks, forecast, workforce
                        });
                    }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Printer size={14} />{t('corpAnalytics.text.print', 'Print')}</button>
                    <button title={t('corpAnalytics.navigateTip')} className="btn-nav" onClick={fetchAll} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <RefreshCw size={14} />{t('corpAnalytics.text.refresh', 'Refresh')}</button>
                </div>
            </div>

            {/* ── Section Tabs ── */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 6 }}>
                {sections.map(s => {
                    const Icon = s.icon;
                    const active = activeSection === s.id;
                    return (
                        <button title="Button action" key={s.id} onClick={() => setActiveSection(s.id)} style={{
                            padding: '7px 16px', borderRadius: 8, border: s.id === 'opex' ? '1px solid rgba(239,68,68,0.3)' : '1px solid transparent',
                            background: s.id === 'opex' ? (active ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)') : (active ? 'rgba(245,158,11,0.12)' : 'transparent'),
                            color: s.id === 'opex' ? '#f87171' : (active ? '#f59e0b' : '#94a3b8'),
                            fontWeight: active ? 700 : 500, fontSize: '0.78rem',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                            transition: 'all 0.2s',
                        }}>
                            <Icon size={14} /> {t(`corpAnalytics.tab.${s.id}`, s.label)}
                        </button>
                    );
                })}
            </div>

            {/* ═══════════ OVERVIEW SECTION ═══════════ */}
            {activeSection === 'overview' && summary && (
                <>
                    {/* Hero Financial KPIs */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 4 }}>
                        <KPICard icon={DollarSign} label={t('corpAnalytics.labels.operatingSpend', 'Operating Spend')} value={fmt(summary.spend?.operating || 0)}
                            sub={`Labor ${fmt(summary.spend?.labor || 0)} · Parts ${fmt(summary.spend?.parts || 0)}`}
                            color="#10b981" onClick={() => setActiveSection('financial')} />
                        <KPICard icon={DollarSign} label={t('corpAnalytics.labels.totalCostOfOperations', 'Total Cost of Operations')}
                            value={fmt((summary.spend?.grandTotal || 0) + (summary.quality?.totalCopq || 0))}
                            sub={`Ops+IT ${fmt(summary.spend?.grandTotal || 0)} · COPQ ${fmt(summary.quality?.totalCopq || 0)}`}
                            color="#ef4444" onClick={() => setActiveSection('financial')} />
                        <KPICard icon={Package} label={t('corpAnalytics.labels.inventoryOnHand', 'Inventory On-Hand')} value={fmt(summary.inventory?.totalValue || 0)}
                            sub={`${fmtN(summary.inventory?.totalParts)} parts · ${fmtN(summary.inventory?.lowStock)} low stock`}
                            color="#8b5cf6" />
                    </div>

                    {/* Operational KPIs */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                        <KPICard icon={Factory} label={t('corpAnalytics.labels.plants', 'Plants')} value={fmtN(summary.plants?.count)} sub={t('corpAnalytics.sub.activeFacilities', 'Active facilities')} color="#10b981" />
                        <KPICard icon={Wrench} label={t('corpAnalytics.labels.workOrders', 'Work Orders')} value={fmtN(summary.workOrders?.total)}
                            sub={`${fmtN(summary.workOrders?.open)} open · ${fmtN(summary.workOrders?.overdue)} overdue`}
                            color="#f59e0b" />
                        <KPICard icon={Target} label={t('corpAnalytics.labels.completionRate', 'Completion Rate')} value={(summary.workOrders?.completionRate || 0) + '%'}
                            sub={`${fmtN(summary.workOrders?.completed)} completed`}
                            color={summary.workOrders?.completionRate >= 80 ? '#10b981' : '#f59e0b'} />
                        <KPICard icon={Cog} label={t('corpAnalytics.labels.totalAssets', 'Total Assets')} value={fmtN(summary.assets?.total)} sub={t('corpAnalytics.sub.trackedEquipment', 'Tracked equipment')} color="#3b82f6" />
                        <KPICard icon={Truck} label={t('corpAnalytics.labels.fleet', 'Fleet')} value={fmtN(summary.fleet?.total)}
                            sub={`${fmtN(summary.fleet?.active)} active · ${fmtN(summary.fleet?.inShop)} in shop`}
                            color="#ea580c" />
                        <KPICard icon={ShieldCheck} label={t('corpAnalytics.labels.safety', 'Safety')} value={fmtN(summary.safety?.activePermits) + ' permits'}
                            sub={`${fmtN(summary.safety?.expired)} expired · ${fmtN(summary.safety?.recentIncidents)} incidents (30d)`}
                            color={summary.safety?.expired > 0 ? '#ef4444' : '#10b981'} />
                        <KPICard icon={Server} label={t('corpAnalytics.labels.iTAssets', 'IT Assets')} value={fmtN((summary.it?.hardware || 0) + (summary.it?.software || 0) + (summary.it?.infrastructure || 0) + (summary.it?.mobile || 0))}
                            sub={`Book Value: ${fmt(summary.it?.bookValue || 0)}`}
                            color="#6366f1" />
                        <KPICard icon={Users} label={t('corpAnalytics.labels.vendorsContractors', 'Vendors & Contractors')}
                            value={fmtN((summary.vendors?.active || 0) + (summary.contractors?.approved || 0))}
                            sub={`${fmtN(summary.vendors?.openRfqs)} open RFQs · ${fmtN(summary.contractors?.pending)} pending`}
                            color="#ec4899" />
                        <KPICard icon={Droplets} label={t('corpAnalytics.labels.productQualityCOPQ', 'Product Quality (COPQ)')}
                            value={fmt(summary.quality?.totalCopq || 0)}
                            sub={`${fmtN(summary.quality?.cryoFailures)} cryo fails · ${fmtN(summary.quality?.bacteriaFailures)} bact fails (12mo)`}
                            color="#f59e0b"
                            onClick={() => setActiveSection('opex')} />
                        <KPICard icon={DollarSign} label="Total Wages"
                            value={fmt(payScales.reduce((sum, i) => sum + (i.HourlyRate * (i.IsSalary ? 1 : i.Headcount) * 40 * 52), 0))}
                            sub={`Annual Enterprise Payroll Run-Rate`}
                            color="#10b981" />
                    </div>

                    {/* Quick Risk Summary */}
                    {risks && (
                        <div className="glass-card" style={{ padding: 20 }}>
                            <h3 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <AlertTriangle size={16} color="#ef4444" />{t('corpAnalytics.text.enterpriseRiskSummary', 'Enterprise Risk Summary')}<span style={{ fontWeight: 400, color: '#64748b', fontSize: '0.75rem', marginLeft: 'auto' }}>{risks.totalRisks} total items</span>
                            </h3>
                            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                                {[
                                    { sev: 'critical', count: risks.summary?.critical || 0, color: '#ef4444' },
                                    { sev: 'high', count: risks.summary?.high || 0, color: '#f59e0b' },
                                    { sev: 'medium', count: risks.summary?.medium || 0, color: '#eab308' },
                                    { sev: 'low', count: risks.summary?.low || 0, color: '#3b82f6' },
                                ].map(s => (
                                    <div key={s.sev} style={{
                                        textAlign: 'center', padding: '10px 20px', borderRadius: 12,
                                        background: s.color + '08', border: '1px solid ' + s.color + '25',
                                        minWidth: 80, cursor: 'pointer',
                                    }} onClick={() => setActiveSection('risk')}>
                                        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: s.count > 0 ? s.color : '#334155' }}>{s.count}</div>
                                        <div style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>{s.sev}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Top 5 Plants */}
                    {rankings.length > 0 && (
                        <div className="glass-card" style={{ padding: 20 }}>
                            <h3 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9' }}>
                                {t('corpAnalytics.text.topPerformingPlants', '🏆 Top Performing Plants')}
                            </h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10 }}>
                                {rankings.slice(0, 5).map((p, i) => (
                                    <div key={p.plantId} style={{
                                        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                                        background: i === 0 ? 'rgba(245,158,11,0.06)' : 'rgba(255,255,255,0.02)',
                                        borderRadius: 12, border: '1px solid ' + (i === 0 ? 'rgba(245,158,11,0.2)' : 'var(--glass-border)'),
                                    }}>
                                        <div style={{
                                            width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontWeight: 900, fontSize: '0.85rem',
                                            background: i === 0 ? '#f59e0b' : i === 1 ? '#94a3b8' : i === 2 ? '#cd7f32' : 'rgba(255,255,255,0.06)',
                                            color: i < 3 ? '#fff' : '#94a3b8',
                                        }}>{i + 1}</div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</div>
                                            <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{p.completionRate}% completion · {p.overdueWOs} overdue</div>
                                        </div>
                                        <PlantScoreBadge score={p.score} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* ═══════════ PLANT RANKINGS SECTION ═══════════ */}
            {activeSection === 'plants' && (
                <div className="glass-card" style={{ padding: 20 }}>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9' }}>{t('corpAnalytics.text.plantPerformanceRankings', 'Plant Performance Rankings')}<span style={{ fontWeight: 400, color: '#64748b', fontSize: '0.75rem' }}>({rankings.length} plants)</span>
                    </h3>
                    <div style={{ overflowX: 'auto' }}>
                        <table className="data-table" style={{ fontSize: '0.78rem', width: '100%' }}>
                            <thead>
                                <tr>
                                    <th style={{ width: 40 }}>#</th>
                                    <th>{t('corpAnalytics.plant')}</th>
                                    <th>{t('corpAnalytics.score')}</th>
                                    <th>{t('corpAnalytics.totalWos')}</th>
                                    <th>{t('corpAnalytics.completed')}</th>
                                    <th>{t('corpAnalytics.overdue')}</th>
                                    <th>{t('corpAnalytics.rate')}</th>
                                    <th>{t('corpAnalytics.avgDays')}</th>
                                    <th>{t('corpAnalytics.30dVelocity', '30d Velocity')}</th>
                                    <th>{t('corpAnalytics.assets')}</th>
                                    <th>{t('corpAnalytics.inventory')}</th>
                                    <th>{t('corpAnalytics.lowStock')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(rankExpanded ? rankings : rankings.slice(0, 15)).map((p, i) => (
                                    <tr key={p.plantId}>
                                        <td style={{ fontWeight: 800, color: i < 3 ? '#f59e0b' : '#94a3b8' }}>{i + 1}</td>
                                        <td style={{ fontWeight: 600 }}>{p.label}</td>
                                        <td><PlantScoreBadge score={p.score} /></td>
                                        <td>{fmtN(p.totalWOs)}</td>
                                        <td style={{ color: '#10b981' }}>{fmtN(p.completedWOs)}</td>
                                        <td style={{ color: p.overdueWOs > 0 ? '#ef4444' : '#10b981', fontWeight: p.overdueWOs > 0 ? 700 : 400 }}>{p.overdueWOs}</td>
                                        <td style={{ color: p.completionRate >= 80 ? '#10b981' : '#f59e0b', fontWeight: 700 }}>{p.completionRate}%</td>
                                        <td>{p.avgResolutionDays}d</td>
                                        <td>{p.recentCompleted}</td>
                                        <td>{fmtN(p.assets)}</td>
                                        <td>{fmt(p.inventoryValue)}</td>
                                        <td style={{ color: p.lowStock > 0 ? '#f59e0b' : '#10b981' }}>{p.lowStock}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {rankings.length > 15 && !rankExpanded && (
                        <button title={t('corpAnalytics.navigateTip')} className="btn-nav" onClick={() => setRankExpanded(true)} style={{ marginTop: 12, fontSize: '0.78rem' }}>
                            {t('corpAnalytics.text.showAllPlants', 'Show all {{n}} plants').replace('{{n}}', rankings.length)}
                        </button>
                    )}
                </div>
            )}

            {/* ═══════════ FINANCIAL SECTION ═══════════ */}
            {activeSection === 'financial' && financial && (() => {
                const allPlants = financial.allPlants || [];
                const trend = financial.monthlyTrend || [];
                const topPlant = allPlants[0];
                const bottomPlant = allPlants[allPlants.length - 1];
                const laborPct = financial.operatingSpend > 0 ? Math.round((financial.labor / financial.operatingSpend) * 100) : 0;
                const partsPct = financial.operatingSpend > 0 ? Math.round((financial.parts / financial.operatingSpend) * 100) : 0;
                const miscPct = 100 - laborPct - partsPct;
                
                const totalDeadStockValue = sparePartsRollup.reduce((s, p) => s + (p.deadStockValue || 0), 0);
                const totalStockoutRisk   = sparePartsRollup.reduce((s, p) => s + (p.stockoutRiskCount || 0), 0);

                return (
                    <>
                        {/* Grand Total & Operating Spend */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                            <KPICard icon={DollarSign} label={t('corpAnalytics.labels.operatingSpendAllPlants', 'Operating Spend (All Plants)')} value={fmt(financial.operatingSpend)}
                                sub={financial.plantCount + ' plants · Labor + Parts + Misc'} color="#10b981" />
                            <KPICard icon={DollarSign} label={t('corpAnalytics.labels.grandTotalAllCategories', 'Grand Total (All Categories)')} value={fmt(financial.grandTotal)}
                                sub={t('corpAnalytics.sub.operationsITContractors', 'Operations + IT + Contractors')} color="#f59e0b" />
                        </div>

                        {/* Cost Distribution */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                            <KPICard icon={Users} label={t('corpAnalytics.labels.labor', 'Labor')} value={fmt(financial.labor)} sub={laborPct + '% of operations'} color="#3b82f6" />
                            <KPICard icon={Package} label={t('corpAnalytics.labels.parts', 'Parts')} value={fmt(financial.parts)} sub={partsPct + '% of operations'} color="#8b5cf6" />
                            <KPICard icon={Wrench} label={t('corpAnalytics.labels.miscExternal', 'Misc/External')} value={fmt(financial.misc)} sub={miscPct + '% of operations'} color="#94a3b8" />
                            <KPICard icon={Server} label={t('corpAnalytics.labels.iTCapEx', 'IT CapEx')} value={fmt(financial.itCapex)} sub={t('corpAnalytics.sub.hardwareInfrastructure', 'Hardware + Infrastructure')} color="#6366f1" />
                            <KPICard icon={Key} label={t('corpAnalytics.labels.iTOpEx', 'IT OpEx')} value={fmt(financial.itOpex)} sub={t('corpAnalytics.sub.softwareSubscriptions', 'Software subscriptions')} color="#818cf8" />
                            <KPICard icon={Users} label={t('corpAnalytics.labels.contractors', 'Contractors')} value={fmt(financial.contractorSpend)} color="#ec4899" />
                        </div>

                        {/* Spend Distribution Bar */}
                        <div className="glass-card" style={{ padding: 20 }}>
                            <h3 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9' }}>{t('corpAnalytics.text.spendDistribution', 'Spend Distribution')}</h3>
                            <div style={{ display: 'flex', height: 24, borderRadius: 8, overflow: 'hidden', gap: 2 }}>
                                {laborPct > 0 && <div title={'Labor: ' + fmt(financial.labor)} style={{ width: laborPct + '%', background: '#3b82f6', transition: 'width 0.5s' }} />}
                                {partsPct > 0 && <div title={'Parts: ' + fmt(financial.parts)} style={{ width: partsPct + '%', background: '#8b5cf6', transition: 'width 0.5s' }} />}
                                {miscPct > 0 && <div title={'Misc: ' + fmt(financial.misc)} style={{ width: miscPct + '%', background: '#10b981', transition: 'width 0.5s' }} />}
                            </div>
                            <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: '0.72rem', color: '#94a3b8' }}>
                                <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#3b82f6', marginRight: 4 }} />Labor {laborPct}%</span>
                                <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#8b5cf6', marginRight: 4 }} />Parts {partsPct}%</span>
                                <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#10b981', marginRight: 4 }} />Misc {miscPct}%</span>
                            </div>
                        </div>

                        {/* Monthly WO Volume */}
                        {trend.length > 0 && (
                            <div className="glass-card" style={{ padding: 24 }}>
                                <h3 style={{ margin: '0 0 16px 0', fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9' }}>{t('corpAnalytics.text.monthlyWorkOrderVolume', 'Monthly Work Order Volume')}<span style={{ fontWeight: 400, color: '#64748b', fontSize: '0.75rem', marginLeft: 8 }}>
                                        (Completed WOs · {trend.length} months)
                                    </span>
                                </h3>
                                <MiniBarChart data={trend} valueKey="woCount" labelKey="month" color="#3b82f6" height={160} />
                                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 8 }}>
                                    Avg: {fmtN(Math.round(trend.reduce((s, m) => s + m.woCount, 0) / trend.length))} WOs/month · Monthly operating: ~{fmt(financial.monthlyAvgSpend)}
                                </div>
                            </div>
                        )}

                        {/* Sortable Plant Spend Table */}
                        <div className="glass-card" style={{ padding: 20 }}>
                            <h3 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>{t('corpAnalytics.text.spendByPlant', 'Spend by Plant')}<span style={{ fontWeight: 400, color: '#64748b', fontSize: '0.75rem' }}>({allPlants.length} plants · Click headers to sort)</span>
                            </h3>
                            <PlantSpendTable plants={allPlants} />
                        </div>

                        {/* Planning Insights */}
                        {(topPlant || bottomPlant) && (
                            <div className="glass-card" style={{ padding: 20 }}>
                                <h3 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9' }}>{t('corpAnalytics.text.planningInsights', 'Planning Insights')}</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                                    {topPlant && (
                                        <div style={{ padding: 14, borderRadius: 10, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
                                            <div style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{t('corpAnalytics.text.highestSpend', 'Highest Spend')}</div>
                                            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{topPlant.plant}</div>
                                            <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{fmt(topPlant.totalSpend)} total · Labor {fmt(topPlant.laborCost)} · Parts {fmt(topPlant.partsCost)}</div>
                                        </div>
                                    )}
                                    {bottomPlant && bottomPlant !== topPlant && (
                                        <div style={{ padding: 14, borderRadius: 10, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
                                            <div style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{t('corpAnalytics.text.lowestSpend', 'Lowest Spend')}</div>
                                            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{bottomPlant.plant}</div>
                                            <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{fmt(bottomPlant.totalSpend)} total · Labor {fmt(bottomPlant.laborCost)} · Parts {fmt(bottomPlant.partsCost)}</div>
                                        </div>
                                    )}
                                </div>
                                {allPlants.length > 0 && (() => {
                                    const avg = financial.operatingSpend / allPlants.length;
                                    const overAvg = allPlants.filter(p => p.totalSpend > avg * 1.5).length;
                                    const underAvg = allPlants.filter(p => p.totalSpend < avg * 0.5).length;
                                    return (overAvg > 0 || underAvg > 0) ? (
                                        <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', fontSize: '0.78rem', color: '#94a3b8' }}>
                                            <strong style={{ color: '#f1f5f9' }}>{t('corpAnalytics.text.spendAnalysis', 'Spend Analysis:')}</strong>{' '}
                                            {overAvg > 0 && <>{overAvg} plant{overAvg > 1 ? 's' : ''} {overAvg === 1 ? 'is' : 'are'} 50%+ above average spend ({fmt(avg)} avg). </>}
                                            {underAvg > 0 && <>{underAvg} plant{underAvg > 1 ? 's' : ''} {underAvg === 1 ? 'is' : 'are'} 50%+ below average. </>}
                                            Review high-spend plants for cost optimization opportunities.
                                        </div>
                                    ) : null;
                                })()}
                            </div>
                        )}

                        {/* Vendor Intelligence Summary & Spare Parts Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '16px', marginTop: '16px' }}>
                            {/* Vendor Intelligence Summary */}
                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '16px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                    <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Truck size={16} /> Vendor Performance
                                    </span>
                                    <a href="/vendor-scorecard" style={{ fontSize: '0.85rem', color: '#818cf8', textDecoration: 'none' }}>
                                        View Full Scorecard →
                                    </a>
                                </div>
                                {worstPerformers.slice(0, 3).map(v => (
                                    <div key={v.vendorId} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.85rem' }}>
                                        <span style={{ color: '#e2e8f0' }}>{v.vendorName}</span>      
                                        <span style={{ color: otdColor(v.onTimeDeliveryRate), fontWeight: 600 }}>
                                            {v.onTimeDeliveryRate != null ? `${v.onTimeDeliveryRate}% OTD` : 'No data'}
                                        </span>
                                    </div>
                                ))}
                                {worstPerformers.length === 0 && (
                                    <div style={{ fontSize: '0.85rem', color: '#64748b', padding: '6px 0' }}>No vendor data available.</div>
                                )}
                            </div>

                            {/* Spare Parts Health Summary */}
                            {sparePartsRollup.length > 0 && (
                                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '16px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                        <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Package size={16} /> Spare Parts Health
                                        </span>
                                        <a href="/storeroom" style={{ fontSize: '0.85rem', color: '#818cf8', textDecoration: 'none' }}>
                                            View Storeroom →
                                        </a>
                                    </div>

                                    {/* Headline KPIs */}
                                    <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                                        <div style={{ flex: 1, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', padding: '10px 14px' }}>
                                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Dead Stock Value</div>
                                            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#ef4444' }}>
                                                ${totalDeadStockValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                            </div>
                                        </div>
                                        <div style={{ flex: 1, background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '6px', padding: '10px 14px' }}>
                                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Stockout Risks</div>
                                            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: totalStockoutRisk > 0 ? '#f59e0b' : '#10b981' }}>
                                                {totalStockoutRisk} critical {totalStockoutRisk === 1 ? 'part' : 'parts'}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Per-plant breakdown — top 5 by dead stock value */}
                                    {[...sparePartsRollup]
                                        .sort((a, b) => (b.deadStockValue || 0) - (a.deadStockValue || 0))
                                        .slice(0, 5)
                                        .map(p => (
                                            <div key={p.plantId} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.85rem' }}>
                                                <span style={{ color: '#e2e8f0' }}>{p.plantId.replace(/_/g, ' ')}</span>
                                                <span style={{ display: 'flex', gap: '16px' }}>
                                                    <span style={{ color: p.deadStockValue > 0 ? '#ef4444' : '#64748b', fontWeight: p.deadStockValue > 0 ? 600 : 400 }}>
                                                        ${(p.deadStockValue || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} dead
                                                    </span>
                                                    <span style={{ color: p.stockoutRiskCount > 0 ? '#f59e0b' : '#64748b', fontWeight: p.stockoutRiskCount > 0 ? 600 : 400 }}>
                                                        {p.stockoutRiskCount} at risk
                                                    </span>
                                                </span>
                                            </div>
                                        ))
                                    }

                                    {sparePartsRollup.length === 0 && (
                                        <div style={{ fontSize: '0.85rem', color: '#64748b', padding: '6px 0' }}>No plant data available.</div>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                );
            })()}

            {/* ═══════════ EQUIPMENT INTELLIGENCE ═══════════ */}
            {activeSection === 'equipment' && (
                <div className="glass-card" style={{ padding: 20 }}>
                    <EquipmentIntelligenceSection />
                </div>
            )}

            {/* ═══════════ RISK MATRIX SECTION ═══════════ */}
            {activeSection === 'risk' && risks && (
                <>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
                        {['critical', 'high', 'medium', 'low'].map(sev => (
                            <div key={sev} style={{
                                textAlign: 'center', padding: '8px 20px', borderRadius: 12,
                                background: (SEV_COLORS[sev]) + '08', border: '1px solid ' + SEV_COLORS[sev] + '25',
                            }}>
                                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: SEV_COLORS[sev] }}>{risks.summary?.[sev] || 0}</div>
                                <div style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>{sev}</div>
                            </div>
                        ))}
                    </div>

                    <div className="glass-card" style={{ padding: 20 }}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9' }}>{t('corpAnalytics.text.riskItems', 'Risk Items')}<span style={{ fontWeight: 400, color: '#64748b', fontSize: '0.75rem' }}>({risks.totalRisks} total)</span>
                        </h3>
                        <div style={{ maxHeight: 500, overflow: 'auto' }}>
                            {(risks.risks || []).map((r, i) => (
                                <div key={i} onClick={() => setSelectedRisk(r)} style={{
                                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                                    borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer',
                                    transition: 'background 0.2s'
                                }} onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                                    <SeverityBadge severity={r.severity} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{r.title}</div>
                                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{r.detail}</div>
                                    </div>
                                    <span style={{ fontSize: '0.68rem', color: '#475569', whiteSpace: 'nowrap' }}>{r.plant}</span>
                                    <span style={{
                                        padding: '2px 8px', borderRadius: 6, fontSize: '0.6rem', fontWeight: 600,
                                        background: 'rgba(255,255,255,0.04)', color: '#94a3b8',
                                    }}>{r.category.replace(/_/g, ' ')}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}

            {/* ═══════════ FORECAST SECTION ═══════════ */}
            {activeSection === 'forecast' && forecast && (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                        {/* PM Forecast */}
                        <div className="glass-card" style={{ padding: 24 }}>
                            <h3 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Calendar size={16} color="#3b82f6" />{t('corpAnalytics.text.pMForecast90Days', 'PM Forecast (90 Days)')}<span style={{ fontWeight: 400, color: '#64748b', fontSize: '0.75rem', marginLeft: 'auto' }}>{forecast.preventiveMaintenance?.upcoming || 0} upcoming</span>
                            </h3>
                            <MiniBarChart data={forecast.preventiveMaintenance?.byMonth || []} valueKey="count" labelKey="month" color="#3b82f6" height={120} />
                        </div>

                        {/* Fleet Replacement */}
                        <div className="glass-card" style={{ padding: 24 }}>
                            <h3 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Truck size={16} color="#ea580c" />{t('corpAnalytics.text.fleetReplacementCandidates', 'Fleet Replacement Candidates')}</h3>
                            <div style={{ maxHeight: 300, overflow: 'auto', marginTop: 12 }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                    <thead style={{ position: 'sticky', top: 0, background: '#1e1b4b', zIndex: 10 }}>
                                        <tr>
                                            <th style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>Asset</th>
                                            <th style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer' }} onClick={() => setFleetSort({key:'type', dir: fleetSort.key==='type'?-fleetSort.dir:1})}>Type {fleetSort.key==='type'?(fleetSort.dir===1?'▲':'▼'):''}</th>
                                            <th style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer' }} onClick={() => setFleetSort({key:'year', dir: fleetSort.key==='year'?-fleetSort.dir:1})}>Year {fleetSort.key==='year'?(fleetSort.dir===1?'▲':'▼'):''}</th>
                                            <th style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer' }} onClick={() => setFleetSort({key:'mileage', dir: fleetSort.key==='mileage'?-fleetSort.dir:-1})}>Mileage {fleetSort.key==='mileage'?(fleetSort.dir===1?'▲':'▼'):''}</th>
                                            <th style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer' }} onClick={() => setFleetSort({key:'plant', dir: fleetSort.key==='plant'?-fleetSort.dir:1})}>Location {fleetSort.key==='plant'?(fleetSort.dir===1?'▲':'▼'):''}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {([...(forecast.fleetReplacement || [])].sort((a,b) => {
                                            let valA = a[fleetSort.key] || ''; let valB = b[fleetSort.key] || '';
                                            if (typeof valA === 'string') return valA.localeCompare(valB) * fleetSort.dir;
                                            return (valA > valB ? 1 : -1) * fleetSort.dir;
                                        })).map((v, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.78rem' }}>
                                                <td style={{ padding: '8px 10px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <SeverityBadge severity={v.urgency} />
                                                        <span style={{ fontWeight: 600 }}>{v.unit}</span>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '8px 10px' }}>{v.type}</td>
                                                <td style={{ padding: '8px 10px' }}>{v.year}</td>
                                                <td style={{ padding: '8px 10px', fontWeight: 700, color: '#f59e0b' }}>{fmtN(v.mileage)}</td>
                                                <td style={{ padding: '8px 10px', color: '#64748b' }}>{v.plant}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {!forecast.fleetReplacement?.length && <div style={{ color: '#475569', fontSize: '0.8rem', fontStyle: 'italic', padding: 16, textAlign: 'center' }}>{t('corpAnalytics.text.noReplacementCandidates', 'No replacement candidates')}</div>}
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* ═══════════ WORKFORCE SECTION ═══════════ */}
            {activeSection === 'workforce' && workforce && (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                        <KPICard icon={Users} label={t('corpAnalytics.labels.totalUsers', 'Total Users')} value={fmtN(workforce.totalUsers)} color="#6366f1" />
                        <KPICard icon={Users} label={t('corpAnalytics.labels.activeWorkers', 'Active Workers')} value={fmtN(workforce.labor?.totalAssigned)} sub={t('corpAnalytics.sub.assignedToWorkOrders', 'Assigned to work orders')} color="#3b82f6" />
                        <KPICard icon={Users} label={t('corpAnalytics.labels.contractors', 'Contractors')} value={fmtN(workforce.contractors?.total)}
                            sub={`${fmtN(workforce.contractors?.active)} approved`} color="#06b6d4" />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        {/* Role Distribution */}
                        <div className="glass-card" style={{ padding: 24 }}>
                            <h3 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9' }}>{t('corpAnalytics.text.roleDistribution', 'Role Distribution')}</h3>
                            {Object.entries(workforce.roleDistribution || {}).sort((a, b) => b[1] - a[1]).map(([role, count]) => {
                                const roleColors = { creator: '#f59e0b', it_admin: '#6366f1', corporate: '#10b981', manager: '#3b82f6', engineer: '#06b6d4', technician: '#8b5cf6', mechanic: '#ea580c', lab_tech: '#ec4899', employee: '#94a3b8' };
                                return (
                                    <div key={role} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                                        <div style={{ width: 10, height: 10, borderRadius: 3, background: roleColors[role] || '#64748b' }} />
                                        <span style={{ fontSize: '0.82rem', flex: 1, textTransform: 'capitalize' }}>{role.replace(/_/g, ' ')}</span>
                                        <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>{count}</span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Labor by Plant */}
                        <div className="glass-card" style={{ padding: 24 }}>
                            <h3 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9' }}>{t('corpAnalytics.text.activeWorkersByPlant', 'Active Workers by Plant')}</h3>
                            <div style={{ maxHeight: 250, overflow: 'auto' }}>
                                {(workforce.labor?.byPlant || []).filter(p => p.activeWorkers > 0).map(p => (
                                    <div key={p.plant} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                        <span style={{ fontSize: '0.82rem', flex: 1 }}>{p.plant}</span>
                                        <div style={{ width: 80, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
                                            <div style={{ width: Math.min((p.activeWorkers / ((workforce.labor?.byPlant || [])[0]?.activeWorkers || 1)) * 100, 100) + '%', height: '100%', borderRadius: 3, background: '#3b82f6' }} />
                                        </div>
                                        <span style={{ fontWeight: 700, fontSize: '0.82rem', minWidth: 24, textAlign: 'right' }}>{p.activeWorkers}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* ═══════════ OPEX INTELLIGENCE ═══════════ */}
            {activeSection === 'opex' && (
                <>
                    {opexLoading && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, color: '#64748b' }}>
                            <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
                            <span style={{ marginLeft: 10 }}>{t('corpAnalytics.text.analyzingEnterpriseSpendAcross', 'Analyzing enterprise spend across all plants…')}</span>
                        </div>
                    )}
                    {!opexLoading && opexData && (() => {
                        const d = opexData;
                        const savingsTotal = d.summary?.totalSavingsPotential || 0;
                        const cardStyle = (color) => ({
                            background: `linear-gradient(135deg, ${color}10, ${color}05)`,
                            border: `1px solid ${color}22`, borderRadius: 14, padding: '16px 20px',
                        });
                        const rowStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 20 };
                        const sectionCard = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 20, marginBottom: 16 };
                        const tableHead = { fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '6px 10px', textAlign: 'left' };
                        const tableCell = { fontSize: '0.8rem', padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)', verticalAlign: 'middle' };

                        return (
                            <>
                                {/* ── Summary KPIs ── */}
                                <div className="glass-card" style={{ padding: 20, marginBottom: 6 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                                        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <TrendingDown size={20} color="#ef4444" />
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 800, fontSize: '1rem', color: '#f1f5f9' }}>OpEx Intelligence — {d.fyLabel}</div>
                                            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{t('corpAnalytics.text.identifiedSavingsPotentialAcro', 'Identified savings potential across all 40 plants')}</div>
                                        </div>
                                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '30px', textAlign: 'right' }}>
                                            <div style={{ paddingRight: '30px', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                                                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#10b981' }}>{fmt(savingsTotal)}</div>
                                                <div style={{ fontSize: '0.68rem', color: '#10b981', fontWeight: 600 }}>{t('corpAnalytics.text.tOTALSAVINGSPOTENTIAL', 'TOTAL SAVINGS POTENTIAL')}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#3b82f6' }}>{fmt(savingsTotal * 0.22)}</div>
                                                <div style={{ fontSize: '0.68rem', color: '#3b82f6', fontWeight: 600, textTransform: 'uppercase' }}>Real-World Realization (22%)</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={rowStyle}>
                                        {[
                                            { key: 'capex',  label: t('corpAnalytics.opex.capexAvoidance', 'CapEx Avoidance'),               val: d.summary?.capexSavings,       color: '#f59e0b', icon: Activity },
                                            { key: 'ghost',  label: t('corpAnalytics.opex.ghostInventoryRelease', 'Ghost Inventory Release'), val: d.summary?.ghostSavings,       color: '#8b5cf6', icon: Archive },
                                            { key: 'overstock', label: t('corpAnalytics.opex.overstockCapitalLockup', 'Overstock Capital Lockup'), val: d.summary?.overstockSavings, color: '#ec4899', icon: Package },
                                            { key: 'freight', label: t('corpAnalytics.opex.preventableLogisticsSpend', 'Preventable Logistics Spend'), val: d.summary?.freightSavings, color: '#f97316', icon: Truck },
                                            { key: 'sku', label: 'OEM SKU Standardization', val: d.summary?.skuSavings, color: '#8b5cf6', icon: Layers },
                                            { key: 'vendor', label: t('corpAnalytics.opex.vendorConsolidation', 'Vendor Consolidation'),     val: d.summary?.vendorSavings,      color: '#3b82f6', icon: TrendingUp },
                                            { key: 'shrink', label: t('corpAnalytics.opex.productShrinkRecovery', 'Product Shrink Recovery'), val: d.summary?.shrinkSavings || 0, color: '#ef4444', icon: Droplets },
                                            { key: 'accidents', label: t('corpAnalytics.opex.safetyCostAvoidance', 'Safety Cost Avoidance'), val: d.summary?.accidentSavings || 0, color: '#ef4444', icon: AlertTriangle },
                                            { key: 'labor', label: t('corpAnalytics.opex.laborOptimization', 'Labor Optimization'), val: d.summary?.laborSavings || 0, color: '#10b981', icon: Users },
                                            { key: 'phantom', label: t('corpAnalytics.opex.phantomLoad', 'Off-Shift Phantom Load'), val: d.summary?.phantomSavings || 0, color: '#eab308', icon: Zap },
                                            { key: 'scrap', label: t('corpAnalytics.opex.scrapMonetization', 'Scrap Metal Monetization'), val: d.summary?.scrapSavings || 0, color: '#94a3b8', icon: Cog },
                                            { key: 'timeTheft', label: t('corpAnalytics.opex.timeTheft', 'Contractor Time Theft'), val: d.summary?.timeTheftSavings || 0, color: '#f43f5e', icon: Clock },
                                            { key: 'consumable', label: 'Consumable Vending Shrink', val: d.summary?.consumableSavings || 0, color: '#a855f7', icon: Box },
                                            { key: 'rental', label: 'Equipment Rental Arbitrage', val: d.summary?.rentalSavings || 0, color: '#0ea5e9', icon: Scale }
                                        ].sort((a,b) => (b.val || 0) - (a.val || 0)).map(({ key, label, val, color, icon: Icon }) => (
                                            <div key={key} onClick={() => setOpexModal(key)}
                                                style={{ ...cardStyle(color), cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s' }}
                                                onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = `0 10px 28px ${color}25`; }}
                                                onMouseOut={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                                    <Icon size={14} color={color} />
                                                    <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>{label}</span>
                                                    <span style={{ marginLeft: 'auto', fontSize: '0.6rem', color, fontWeight: 700, opacity: 0.8 }}>{t('corpAnalytics.text.vIEWPLAN', 'VIEW PLAN ›')}</span>
                                                </div>
                                                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: val > 0 ? color : '#475569' }}>{val > 0 ? fmt(val) : '—'}</div>
                                                <div style={{ fontSize: '0.62rem', color: '#475569', marginTop: 4 }}>{t('corpAnalytics.text.clickForExecutiveActionPlan', 'Click for executive action plan')}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* ── Vendor Price Drift (Enterprise Rollup) ── */}
                                {vendorInflation && (
                                    <div style={{ ...sectionCard, borderColor: 'rgba(239,68,68,0.2)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                                            <TrendingUp size={16} color="#ef4444" />
                                            <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9' }}>Vendor Price Drift</h3>
                                            <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#ef4444', fontWeight: 600 }}>
                                                {vendorInflation.summary?.inflating || 0} items inflating enterprise-wide
                                            </span>
                                            <button
                                                onClick={() => setVendorInflationModal(true)}
                                                style={{ padding: '5px 12px', borderRadius: 7, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}
                                            >View Detail</button>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
                                            {[
                                                { label: 'Items Tracked', val: vendorInflation.summary?.totalTracked || 0, color: '#64748b' },
                                                { label: 'Inflating (>5%)', val: vendorInflation.summary?.inflating || 0, color: '#ef4444' },
                                                { label: 'Deflating (<-5%)', val: vendorInflation.summary?.deflating || 0, color: '#10b981' },
                                                { label: 'Avg Enterprise Drift', val: (vendorInflation.summary?.avgDrift > 0 ? '+' : '') + (vendorInflation.summary?.avgDrift || 0) + '%', color: vendorInflation.summary?.avgDrift > 0 ? '#f97316' : '#10b981', raw: true },
                                            ].map(({ label, val, color, raw }) => (
                                                <div key={label} style={{ background: `${color}10`, border: `1px solid ${color}22`, borderRadius: 10, padding: '12px 16px' }}>
                                                    <div style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                                                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color }}>{raw ? val : val.toLocaleString()}</div>
                                                </div>
                                            ))}
                                        </div>
                                        {/* Top inflators preview */}
                                        {vendorInflation.topInflators?.length > 0 && (
                                            <div style={{ overflowX: 'auto' }}>
                                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                    <thead><tr>
                                                        {['Plant', 'Vendor', 'Description', 'Part #', 'First Price', 'Latest Price', 'Drift'].map(h => (
                                                            <th key={h} style={tableHead}>{h}</th>
                                                        ))}
                                                    </tr></thead>
                                                    <tbody>
                                                        {vendorInflation.topInflators.slice(0, 10).map((item, i) => (
                                                            <tr key={i}>
                                                                <td style={tableCell}>{(item.plant || '').replace(/_/g, ' ')}</td>
                                                                <td style={tableCell}>{item.vendor}</td>
                                                                <td style={{ ...tableCell, fontWeight: 600 }}>{item.label}</td>
                                                                <td style={{ ...tableCell, color: '#64748b', fontSize: '0.72rem' }}>{item.vendorPartNo || '—'}</td>
                                                                <td style={tableCell}>${Number(item.firstCost).toFixed(2)}</td>
                                                                <td style={tableCell}>${Number(item.lastCost).toFixed(2)}</td>
                                                                <td style={{ ...tableCell, fontWeight: 700, color: '#ef4444' }}>+{item.pctChange}%</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* ── Section 1: CapEx Replacement Alerts ── */}
                                <div style={sectionCard}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                                        <Activity size={16} color="#f59e0b" />
                                        <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9' }}>{t('corpAnalytics.text.capExVsOpExReplacementAlerts', 'CapEx vs. OpEx Replacement Alerts')}</h3>
                                        <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#f59e0b', fontWeight: 600 }}>{d.capex.alertCount} {t('corpAnalytics.text.assetsFlagged', 'assets flagged')}</span>
                                    </div>
                                    <p style={{ margin: '0 0 12px', fontSize: '0.78rem', color: '#64748b' }}>{t('corpAnalytics.text.assetsWhereTrailing3YearMainte', 'Assets where trailing 3-year maintenance spend exceeds 50% of replacement value — prime candidates for CapEx replacement.')}</p>
                                    {d.capex.alerts.length > 0 ? (
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                <thead><tr>
                                                    {[
                                                        [t('corpAnalytics.plant', 'Plant'), 'plant'],
                                                        [t('corpAnalytics.asset', 'Asset'), 'asset'],
                                                        [t('corpAnalytics.3yrMaintCost', '3-Yr Maint. Cost'), '3yrMaintCost'],
                                                        [t('corpAnalytics.replacementValue', 'Replacement Value'), 'replacementValue'],
                                                        [t('corpAnalytics.pctOfReplacement', '% of Replacement'), 'pctOfReplacement'],
                                                        [t('corpAnalytics.paybackEst', 'Payback Est.'), 'paybackEst'],
                                                        [t('corpAnalytics.woCount', 'WO Count'), 'woCount'],
                                                    ].map(([h, k]) => (
                                                        <th key={k} style={tableHead}>{h}</th>
                                                    ))}
                                                </tr></thead>
                                                <tbody>
                                                    {d.capex.alerts.map((a, i) => (
                                                        <tr key={i}>
                                                            <td style={tableCell}>{a.plant}</td>
                                                            <td style={{ ...tableCell, fontWeight: 600 }}>{a.asset}</td>
                                                            <td style={{ ...tableCell, color: '#ef4444', fontWeight: 700 }}>{fmt(a.trailingOpEx)}</td>
                                                            <td style={tableCell}>{fmt(a.replacementValue)}</td>
                                                            <td style={tableCell}>
                                                                <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700, background: a.pct > 80 ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.12)', color: a.pct > 80 ? '#ef4444' : '#f59e0b' }}>
                                                                    {a.pct}%
                                                                </span>
                                                            </td>
                                                            <td style={{ ...tableCell, color: '#10b981', fontWeight: 700 }}>{a.paybackYears ? a.paybackYears + ' ' + t('corpAnalytics.yrs', 'yrs') : '—'}</td>
                                                            <td style={tableCell}>{a.woCount}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div style={{ color: '#475569', fontSize: '0.8rem', fontStyle: 'italic', padding: '8px 0' }}>✓ No assets currently exceeding the replacement threshold. Ensure assets have Purchase Cost recorded for this analysis.</div>
                                    )}
                                </div>

                                {/* ── Section 2: Ghost Inventory ── */}
                                <div style={sectionCard}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                                        <Archive size={16} color="#8b5cf6" />
                                        <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9' }}>{t('corpAnalytics.text.ghostInventoryIdleCapital', 'Ghost Inventory — Idle Capital')}</h3>
                                        <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#8b5cf6', fontWeight: 600 }}>{fmt(d.ghostInventory.totalValue)} in idle stock</span>
                                    </div>
                                    <p style={{ margin: '0 0 12px', fontSize: '0.78rem', color: '#64748b' }}>{t('corpAnalytics.text.partsWithStockOnHandThatHaveNo', 'Parts with stock on-hand that have not moved in over 12 months. Consider inter-plant transfer or liquidation.')}</p>
                                    {d.ghostInventory.parts.length > 0 ? (
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                <thead><tr>
                                                    {[
                                                        [t('corpAnalytics.plant', 'Plant'), 'plant'],
                                                        [t('corpAnalytics.partName', 'Part Name'), 'partName'],
                                                        [t('corpAnalytics.qtyOnHand', 'Qty On-Hand'), 'qtyOnHand'],
                                                        [t('corpAnalytics.estValue', 'Est. Value'), 'estValue'],
                                                        [t('corpAnalytics.lastMovement', 'Last Movement'), 'lastMovement'],
                                                    ].map(([h, k]) => (
                                                        <th key={k} style={tableHead}>{h}</th>
                                                    ))}
                                                </tr></thead>
                                                <tbody>
                                                    {d.ghostInventory.parts.slice(0, 15).map((p, i) => (
                                                        <tr key={i}>
                                                            <td style={tableCell}>{p.plant}</td>
                                                            <td style={{ ...tableCell, fontWeight: 600 }}>{p.part}</td>
                                                            <td style={tableCell}>{p.stock}</td>
                                                            <td style={{ ...tableCell, color: '#8b5cf6', fontWeight: 700 }}>{fmt(p.value)}</td>
                                                            <td style={{ ...tableCell, color: '#64748b', fontSize: '0.75rem' }}>{p.lastMoved === 'Unknown' ? t('corpAnalytics.text.neverRecorded', '⚠ Never recorded') : p.lastMoved}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div style={{ color: '#475569', fontSize: '0.8rem', fontStyle: 'italic' }}>{t('corpAnalytics.text.noGhostInventory', '✓ No ghost inventory detected...')} Ensure parts have LastInDate populated for accurate analysis.</div>
                                    )}
                                </div>

                                {/* ── Section 3: Plant Efficiency Leaderboard ── */}
                                <div style={sectionCard}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                                        <TrendingUp size={16} color="#10b981" />
                                        <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9' }}>{t('corpAnalytics.text.plantEfficiencyLeaderboard', 'Plant Efficiency Leaderboard')}</h3>
                                        <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#64748b' }}>Enterprise avg: {fmt(d.efficiency.enterpriseAvgCostPerWO)}/WO · {d.efficiency.enterpriseAvgResolutionDays}d resolution</span>
                                    </div>
                                    <p style={{ margin: '0 0 12px', fontSize: '0.78rem', color: '#64748b' }}>{t('corpAnalytics.text.rankedByCostPerCompletedWorkOr', 'Ranked by cost-per-completed-work-order. Lower is more efficient. Plants in red are above the enterprise average — priority targets for SOP adoption from top performers.')}</p>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead><tr>
                                                {[
                                                    [t('corpAnalytics.rank', 'Rank'), 'rank'],
                                                    [t('corpAnalytics.plant', 'Plant'), 'plant'],
                                                    [t('corpAnalytics.fySpend', 'FY Spend'), 'fySpend'],
                                                    [t('corpAnalytics.wosCompleted', 'WOs Completed'), 'wosCompleted'],
                                                    [t('corpAnalytics.costPerWo', 'Cost / WO'), 'costPerWo'],
                                                    [t('corpAnalytics.avgResolution', 'Avg Resolution'), 'avgResolution'],
                                                    [t('corpAnalytics.overdueWOs', 'Overdue WOs'), 'overdueWOs'],
                                                ].map(([h, k]) => (
                                                    <th key={k} style={tableHead}>{h}</th>
                                                ))}
                                            </tr></thead>
                                            <tbody>
                                                {d.efficiency.rankings.filter(p => p.costPerWO > 0).map((p, i) => {
                                                    const aboveAvg = p.costPerWO > d.efficiency.enterpriseAvgCostPerWO;
                                                    return (
                                                        <tr key={i} style={{ background: i === 0 ? 'rgba(16,185,129,0.05)' : 'transparent' }}>
                                                            <td style={{ ...tableCell, fontWeight: 700, color: i === 0 ? '#10b981' : '#475569' }}>{i + 1}</td>
                                                            <td style={{ ...tableCell, fontWeight: 600 }}>{p.plant}</td>
                                                            <td style={tableCell}>{fmt(p.totalSpend)}</td>
                                                            <td style={tableCell}>{p.woCompleted.toLocaleString()}</td>
                                                            <td style={tableCell}>
                                                                <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700, background: aboveAvg ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.1)', color: aboveAvg ? '#ef4444' : '#10b981' }}>
                                                                    {fmt(p.costPerWO)}
                                                                </span>
                                                            </td>
                                                            <td style={{ ...tableCell, color: p.avgResolutionDays > d.efficiency.enterpriseAvgResolutionDays ? '#f59e0b' : '#94a3b8' }}>{p.avgResolutionDays > 0 ? p.avgResolutionDays + 'd' : '—'}</td>
                                                            <td style={{ ...tableCell, color: p.overdueWOs > 0 ? '#ef4444' : '#475569', fontWeight: p.overdueWOs > 0 ? 700 : 400 }}>{p.overdueWOs}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* ── Section 4: Vendor Consolidation ── */}
                                <div style={sectionCard}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                                        <TrendingDown size={16} color="#3b82f6" />
                                        <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9' }}>{t('corpAnalytics.text.mROVendorConsolidationOpportun', 'MRO Vendor Consolidation Opportunity')}</h3>
                                        <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#3b82f6', fontWeight: 600 }}>{fmt(d.vendors.consolidationOpportunity)} {t('corpAnalytics.text.estimatedSavings', 'estimated savings')}</span>
                                    </div>
                                    <p style={{ margin: '0 0 12px', fontSize: '0.78rem', color: '#64748b' }}>{t('corpAnalytics.text.topVendorsByEnterpriseWideSpen', 'Top vendors by enterprise-wide spend across all plants. Consolidating spend to 1–2 national suppliers per category yields 15–20% volume discounts.')}</p>
                                    {d.vendors.topVendors.length > 0 ? (
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                <thead><tr>
                                                    {[
                                                        [t('corpAnalytics.vendor', 'Vendor'), 'vendor'],
                                                        [t('corpAnalytics.totalSpend', 'Total Spend'), 'totalSpend'],
                                                        [t('corpAnalytics.plantsActive', 'Plants Active'), 'plantsActive'],
                                                        [t('corpAnalytics.volumeDiscountOpp', '17.5% Volume Discount Opportunity'), 'volumeDiscountOpp'],
                                                    ].map(([h, k]) => (
                                                        <th key={k} style={tableHead}>{h}</th>
                                                    ))}
                                                </tr></thead>
                                                <tbody>
                                                    {d.vendors.topVendors.map((v, i) => (
                                                        <tr key={i}>
                                                            <td style={{ ...tableCell, fontWeight: 600 }}>{v.name}</td>
                                                            <td style={{ ...tableCell, color: '#3b82f6', fontWeight: 700 }}>{fmt(v.total)}</td>
                                                            <td style={tableCell}>{v.plants} plant{v.plants !== 1 ? 's' : ''}</td>
                                                            <td style={{ ...tableCell, color: '#10b981' }}>{fmt(v.total * 0.175)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div style={{ color: '#475569', fontSize: '0.8rem', fontStyle: 'italic' }}>{t('corpAnalytics.text.noVendorDataFoundPopulateTheVe', 'No vendor data found. Populate the Vendor field in Work Misc entries to enable MRO analysis.')}</div>
                                    )}
                                </div>

                                {/* ── Section 5: WO Resolution / Wrench Time ── */}
                                <div style={sectionCard}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                                        <Wrench size={16} color="#f59e0b" />
                                        <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9' }}>{t('corpAnalytics.text.workOrderResolutionAnalysis', 'Work Order Resolution Analysis')}</h3>
                                    </div>
                                    <p style={{ margin: '0 0 12px', fontSize: '0.78rem', color: '#64748b' }}>{d.wrenchTime.note}</p>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                        <div style={{ ...cardStyle('#ef4444') }}>
                                            <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: 6, fontWeight: 600 }}>{t('corpAnalytics.text.highResolutionPriority', '⚠ HIGH RESOLUTION TIME — TOP PRIORITY')}</div>
                                            {d.wrenchTime.highResolutionPlants.length > 0 ? d.wrenchTime.highResolutionPlants.map((p, i) => (
                                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.8rem' }}>
                                                    <span>{p.plant}</span>
                                                    <span style={{ color: '#ef4444', fontWeight: 700 }}>{p.avgDays}{t('corpAnalytics.text.daysAvg', 'd avg')}</span>
                                                </div>
                                            )) : <div style={{ color: '#475569', fontSize: '0.78rem', fontStyle: 'italic' }}>{t('corpAnalytics.text.allPlantsWithinAcceptableRange', 'All plants within acceptable range.')}</div>}
                                        </div>
                                        <div style={{ ...cardStyle('#10b981') }}>
                                            <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: 6, fontWeight: 600 }}>{t('corpAnalytics.text.bestPerformersSops', '✓ BEST PERFORMERS — ADOPT THEIR SOPs')}</div>
                                            {d.wrenchTime.efficientPlants.length > 0 ? d.wrenchTime.efficientPlants.map((p, i) => (
                                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.8rem' }}>
                                                    <span>{p.plant}</span>
                                                    <span style={{ color: '#10b981', fontWeight: 700 }}>{p.avgDays}{t('corpAnalytics.text.daysAvg', 'd avg')}</span>
                                                </div>
                                            )) : <div style={{ color: '#475569', fontSize: '0.78rem', fontStyle: 'italic' }}>{t('corpAnalytics.text.collectingBaselineData', 'Collecting baseline data…')}</div>}
                                        </div>
                                    </div>
                                </div>

                                {/* ── Coming Soon Placeholders ── */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                    {[
                                        { icon: AlertTriangle, color: '#ef4444', title: 'Quality Shrink / COPQ Tracker', desc: 'Track product lost due to maintenance failures. Enable by selecting "Product Loss" reason on work order close-out.' },
                                        { icon: Activity, color: '#06b6d4', title: 'Sensor-Based CBM (Condition Monitoring)', desc: 'Prevent over-maintenance using live vibration and temperature sensor data. Enable by connecting IoT sensors via /api/sensors/ingest.' },
                                    ].map(({ icon: Icon, color, title, desc }) => (
                                        <div key={title} style={{ ...cardStyle(color), opacity: 0.7 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                                <Icon size={16} color={color} />
                                                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f1f5f9' }}>{title}</span>
                                                <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color, fontWeight: 700, border: `1px solid ${color}40`, borderRadius: 6, padding: '2px 6px' }}>{t('corpAnalytics.text.dATAREQUIRED', 'DATA REQUIRED')}</span>
                                            </div>
                                            <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>{desc}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* ── Game Plan Modal ── */}
                                {opexModal && (() => {
                                    const plans = {
                                        capex: {
                                            title: 'CapEx Avoidance — Game Plan',
                                            color: '#f59e0b',
                                            Icon: Activity,
                                            savings: d.summary?.capexSavings,
                                            headline: `${d.capex.alertCount} assets flagged enterprise-wide are being maintained past their economic life. Total trailing 3-year OpEx on flagged assets: ${fmt(d.capex.totalRiskValue)}. Replacing — not repairing — these machines eliminates the recurring drain and delivers ${fmt(d.summary?.capexSavings)} in estimated net savings.`,
                                            why: 'Every dollar spent repairing an aging machine past its economic life is a dollar that could fund a new asset with warranty coverage, reduced downtime, and modern energy efficiency. Once trailing 3-year maintenance cost approaches or exceeds replacement value, replacement delivers superior ROI. The assets flagged here have been repaired 2+ times in 3 years — a pattern that only accelerates.',
                                            actions: [
                                                ...d.capex.alerts.slice(0, 8).map((a, i) => ({
                                                    step: i + 1,
                                                    action: `Replace ${a.asset} at ${a.plant}`,
                                                    detail: `${fmt(a.trailingOpEx)} in 3-yr trailing spend · Est. replacement value ${fmt(a.replacementValue)} · ${a.woCount} work orders in 3 years · Payback: ${a.paybackYears ? a.paybackYears + ' yrs' : 'Immediate ROI'}`,
                                                    priority: a.trailingOpEx > 15000 ? 'HIGH' : 'MEDIUM',
                                                })),
                                                { step: d.capex.alerts.slice(0, 8).length + 1, action: 'Submit CapEx budget requests for top 5 flagged assets', detail: 'Present trailing 3-yr maintenance cost vs. OEM replacement quote to CFO/VP Ops in next budget cycle. Include labor burden and downtime cost.', priority: 'HIGH' },
                                                { step: d.capex.alerts.slice(0, 8).length + 2, action: 'Implement a repair-or-replace decision gate in Trier OS', detail: 'Require plant manager sign-off before approving any single repair exceeding 20% of the asset\'s estimated replacement value.', priority: 'MEDIUM' },
                                            ],
                                            timeline: [
                                                { phase: 'Month 1–2', task: 'Request OEM replacement quotes for top 8 flagged assets' },
                                                { phase: 'Month 3', task: 'Submit CapEx proposals with full ROI analysis to leadership' },
                                                { phase: 'Month 4–6', task: 'Schedule replacements during planned shutdown windows' },
                                                { phase: 'Month 7–12', task: 'Track WO count reduction on replaced assets — validate savings' },
                                            ],
                                            kpis: ['WOs per asset per year (target: <2)', 'Maintenance cost as % of replacement value (target: <30%)', 'Mean Time Between Failures (MTBF) — improvement %'],
                                        },
                                        ghost: {
                                            title: 'Ghost Inventory Release — Game Plan',
                                            color: '#8b5cf6',
                                            Icon: Archive,
                                            savings: d.summary?.ghostSavings,
                                            headline: `${fmt(d.ghostInventory.totalValue)} in parts capital is sitting idle enterprise-wide across ${d.ghostInventory.partCount} part lines — parts with stock on-hand that have not been used in a work order in over 12 months. Releasing this tied-up capital delivers ${fmt(d.summary?.ghostSavings)} in freed working capital.`,
                                            why: 'Idle inventory is cash sitting on a shelf. In fluid production plants, parts churn is driven by PM schedules and reactive failures. Parts unmoved for 12+ months are statistical orphans — either the equipment they served has been retired, the part was over-ordered, or a superior alternative has made them obsolete. Each idle dollar represents a missed opportunity to reinvest in production.',
                                            actions: [
                                                ...d.ghostInventory.parts.slice(0, 8).map((p, i) => ({
                                                    step: i + 1,
                                                    action: `Action: "${p.part}" at ${p.plant}`,
                                                    detail: `${fmt(p.value)} in idle stock (Qty: ${p.stock}) · Last WO use: ${p.lastMoved} · Options: Transfer to another plant via Global Logistics, return to vendor, or liquidate.`,
                                                    priority: p.value > 500 ? 'HIGH' : 'MEDIUM',
                                                })),
                                                { step: d.ghostInventory.parts.slice(0, 8).length + 1, action: 'Launch inter-plant transfer review in Global Logistics', detail: 'Use the Global Logistics search in Trier OS to match idle parts at one plant against open WO part needs at another. Transfer before purchasing new.', priority: 'HIGH' },
                                                { step: d.ghostInventory.parts.slice(0, 8).length + 2, action: 'Negotiate vendor return credits on eligible stock', detail: 'Contact primary MRO suppliers for return credit on unused, unopened stock purchased within the last 24 months. Many distributors accept returns at 80–90% credit.', priority: 'MEDIUM' },
                                                { step: d.ghostInventory.parts.slice(0, 8).length + 3, action: 'Enforce a 12-month stale inventory review policy', detail: 'Any part with zero WO usage for 12 months automatically flags in Trier OS. Plant manager must approve continued stocking or initiate disposal within 30 days.', priority: 'MEDIUM' },
                                            ],
                                            timeline: [
                                                { phase: 'Week 1–2', task: 'Share ghost inventory report with all plant managers' },
                                                { phase: 'Month 1', task: 'Cross-plant transfer matching via Global Logistics search' },
                                                { phase: 'Month 2', task: 'Contact vendors for return credit on eligible stock' },
                                                { phase: 'Month 3', task: 'Liquidate remaining non-returnable ghost parts' },
                                                { phase: 'Ongoing', task: 'Enforce 12-month stale inventory auto-flag in Trier OS' },
                                            ],
                                            kpis: ['Inventory turns per year (target: >4×)', 'Ghost inventory $ enterprise-wide (target: <$50K)', 'Parts capital as % of annual maintenance spend'],
                                        },
                                        overstock: {
                                            title: 'Overstock Capital Lockup / Hoarding — Game Plan',
                                            color: '#ec4899',
                                            Icon: Package,
                                            savings: d.summary?.overstockSavings,
                                            headline: `Algorithms detected ${fmt(d.overstock?.totalValue)} in excess, overstocked capital frozen across ${d.overstock?.partCount || 0} part items. These are items where local inventory depth wildly exceeds documented 365-day consumption rates.`,
                                            why: 'While Ghost Inventory isolates parts that never move, Overstock targets "hoarding." If a plant has a $5,000 drive and uses 1 per year but holds 10 in stock, 9 of them are declared frozen capital. Lean Enterprise System algorithms enforce smart safety-stock limits, ensuring working capital isn\'t mathematically trapped on shelves just to feel safe.',
                                            actions: [
                                                ...(d.overstock?.alerts || []).slice(0, 8).map((p, i) => ({
                                                    step: i + 1,
                                                    action: `Action: "${p.part}" at ${p.plant}`,
                                                    detail: `${fmt(p.frozenValue)} capital lockup (Qty: ${p.stock}) · 365-Day Trailing Usage: ${p.annualUsage} · Options: Halt purchasing immediately, or distribute excess to needing plants.`,
                                                    priority: p.frozenValue > 1000 ? 'HIGH' : 'MEDIUM',
                                                })),
                                                { step: (d.overstock?.alerts?.slice(0, 8).length || 0) + 1, action: 'Institute algorithmic Max/Min thresholds', detail: 'Transition purchasing from "gut feel" to algorithmic rules. Set max inventory on high-value parts to Annual Usage × 1.5.', priority: 'HIGH' },
                                                { step: (d.overstock?.alerts?.slice(0, 8).length || 0) + 2, action: 'Enforce Enterprise-wide inter-plant transfer', detail: 'If Plant A is hoarding parts that Plant B is buying new, immediately force an inventory transfer to absorb the cost.', priority: 'HIGH' },
                                            ],
                                            timeline: [
                                                { phase: 'Week 1', task: 'Distribute overstock KPI warning lists to localized plant maintenance planners.' },
                                                { phase: 'Month 1', task: 'Halt all external POs for parts currently listed on the holding penalty report.' },
                                            ],
                                            kpis: ['Zero-growth frozen capital', 'Algorithmic Min/Max adherence %', 'Capital deployment vs Part usage indexing'],
                                        },
                                        freight: {
                                            title: 'Preventable Logistics Spend — Game Plan',
                                            color: '#f97316',
                                            Icon: Truck,
                                            savings: d.summary?.freightSavings,
                                            headline: `Algorithms detected ${fmt(d.freight?.totalPenalty)} in preventable air-freight and emergency shipping costs across the enterprise.`,
                                            why: 'By isolating standard shipping costs from emergency, expedited premiums (Next-Day Air, Hotshots), we uncover failures in local minimum-stock compliance. Maintenance teams resorting to overnight shipping are exposing a breakdown in basic planning.',
                                            actions: [
                                                ...(d.freight?.alerts || []).slice(0, 8).map((p, i) => ({
                                                    step: i + 1,
                                                    action: `Review Freight: "${p.part}" at ${p.plant}`,
                                                    detail: `${fmt(p.penaltyCost)} premium paid. Determine why this part was not correctly stocked locally.`,
                                                    priority: 'HIGH',
                                                })),
                                                { step: (d.freight?.alerts?.slice(0, 8).length || 0) + 1, action: 'Institute mandatory VP approval for any freight over $150', detail: 'Transition purchasing from "run to fail" to "predict and prevent".', priority: 'HIGH' }
                                            ],
                                            timeline: [
                                                { phase: 'Month 1', task: 'Distribute list of top offenders to Plant Managers.' },
                                                { phase: 'Month 2', task: 'Integrate mandatory VP override on all Hotshot POs.' },
                                            ],
                                            kpis: ['Total Expedited Freight Costs (target $0)', 'Next-Day Air PO % (target 0%)'],
                                        },
                                        sku: {
                                            title: 'Enterprise OEM SKU Standardization — Game Plan',
                                            color: '#8b5cf6',
                                            Icon: Layers,
                                            savings: d.summary?.skuSavings,
                                            headline: `Algorithms detected ${d.skuStandardization?.totalDuplicatedSkus || 0} duplicated OEM hardware components across the enterprise representing ${fmt(Math.round(d.skuStandardization?.totalFragmentationValue || 0))} in fragmented spending.`,
                                            why: 'Plants are unknowingly ordering identical components (like a specific Alfa Laval pump seal) under completely different local names and IDs (e.g., "Pump Seal 100" vs "Alfa-Seal"). Corporate loses its bulk-purchasing volume discount power, and plants can’t share emergency spares because they do not know sister-plants stock the identical asset.',
                                            actions: [
                                                ...(d.skuStandardization?.alerts || []).slice(0, 8).map((p, i) => ({
                                                    step: i + 1,
                                                    action: `Standardize OEM Part: "${p.canonicalMfr} - ${p.manufNum}"`,
                                                    detail: `Currently logged independently across ${p.nodes?.length || 0} locations. Combined stock value: ${fmt(p.totalStockValue)}. Re-map all local databases to use a single Unified Enterprise ID.`,
                                                    priority: 'HIGH',
                                                })),
                                                { step: (d.skuStandardization?.alerts?.slice(0, 8).length || 0) + 1, action: 'Institute "Sister Plant Matching" at Procurement Phase', detail: 'When a user adds a new part and inputs an OEM part number, throw a warning block preventing creation if the OEM number already exists system-wide.', priority: 'HIGH' }
                                            ],
                                            timeline: [
                                                { phase: 'Month 1', task: 'Run backend hash script to forcefully homogenize all Part Names sharing identical Manufacturer Part Numbers.' },
                                                { phase: 'Month 2', task: 'Establish corporate pricing tier with OEMs based on the newly revealed enterprise-wide volume.' },
                                            ],
                                            kpis: ['Total Enterprise SKU Count (target reduction of 25%)', 'Inter-plant Part Sharing (target 10+/month)'],
                                        },
                                        vendor: {
                                            title: 'MRO Vendor Consolidation — Game Plan',
                                            color: '#3b82f6',
                                            Icon: TrendingUp,
                                            savings: d.summary?.vendorSavings,
                                            headline: `Enterprise MRO spend is fragmented across ${d.vendors.totalVendorCount} cost categories totaling ${fmt(d.vendors.totalVendorSpend)}. Consolidating to preferred national suppliers at negotiated volume rates yields an estimated 17.5% discount — ${fmt(d.vendors.consolidationOpportunity)} in annual savings with no reduction in service level.`,
                                            why: 'When each of the 40 plants buys independently, the enterprise loses its combined pricing leverage. A supplier charging $45/item at one plant may charge $52 at another simply because orders are placed separately. Aggregating spend into 2–3 national preferred vendor agreements delivers volume discounts, consistent lead times, reduced AP processing costs, and emergency supply chain reliability.',
                                            actions: [
                                                ...d.vendors.topVendors.slice(0, 6).map((v, i) => ({
                                                    step: i + 1,
                                                    action: `Consolidate: "${v.name}" — ${fmt(v.total)} enterprise spend`,
                                                    detail: `Currently spread across ${v.plants} plant${v.plants !== 1 ? 's' : ''}. Volume discount opportunity: ${fmt(v.total * 0.175)} at 17.5% negotiated rate.`,
                                                    priority: v.total > 20000 ? 'HIGH' : 'MEDIUM',
                                                })),
                                                { step: d.vendors.topVendors.slice(0, 6).length + 1, action: 'Issue RFQ to top 3 national MRO distributors', detail: 'Request volume pricing for aggregated enterprise spend across all 40 plants. Use Maintenance, Grainger, Hagemeyer, or Motion Industries as benchmarks.', priority: 'HIGH' },
                                                { step: d.vendors.topVendors.slice(0, 6).length + 2, action: 'Establish preferred vendor routing in Trier OS', detail: 'Flag preferred vendors in the system. All POs above $500 must route through the preferred vendor list before alternate sourcing is approved.', priority: 'HIGH' },
                                                { step: d.vendors.topVendors.slice(0, 6).length + 3, action: 'Standardize common parts enterprise-wide', detail: 'Where multiple plants use similar parts from different vendors, standardize on a single SKU and preferred vendor to enable volume rebates and simplified stocking.', priority: 'MEDIUM' },
                                            ],
                                            timeline: [
                                                { phase: 'Month 1', task: 'Present consolidated vendor spend report to VP Procurement' },
                                                { phase: 'Month 2', task: 'Issue RFQ to national MRO distributors with full spend data' },
                                                { phase: 'Month 3', task: 'Negotiate and execute preferred vendor agreements' },
                                                { phase: 'Month 4', task: 'Roll out preferred vendor routing across all plants in Trier OS' },
                                                { phase: 'Month 6+', task: 'Measure compliance — % of spend through preferred vendors (target: >80%)' },
                                            ],
                                            kpis: ['% MRO spend through preferred vendors (target: >80%)', 'Avg cost per part vs. prior year (target: -15%)', 'Active vendor count (target: reduce by 40%)'],
                                        },
                                        shrink: {
                                            title: 'Product Shrink / COPQ — Game Plan',
                                            color: '#ef4444',
                                            Icon: AlertTriangle,
                                            savings: d.summary?.shrinkSavings || 0,
                                            headline: d.shrink?.totalEstimate > 0
                                                ? `${fmt(d.shrink.totalEstimate)} in labeled product loss has been identified across ${new Set(d.shrink.byPlant.map(x => x.plant.split(' (')[0])).size} plants. In fluid production, maintenance-driven product dumping, scrap, and spoilage is typically 3–8× the reported figure when downtime and rework losses are included.`
                                                : 'Product shrink tracking is not yet active. In a typical fluid production plant, maintenance-driven product losses (unplanned dumps, line stoppages, seal failures) account for 1–3% of production revenue — often $500K–$2M/year that is invisible without dedicated tracking.',
                                            why: 'The Cost of Poor Quality (COPQ) framework captures all costs caused by equipment failures: product dumped during unplanned stops, rework after a seal failure, line speed reductions due to worn equipment, and regulatory risk from maintenance failures. Most plants only see the direct repair cost — not the 3–8× production loss multiplier that maintenance failures create upstream.',
                                            actions: [
                                                ...(d.shrink?.byPlant?.length > 0 ? d.shrink.byPlant.slice(0, 5).map((p, i) => ({
                                                    step: i + 1,
                                                    action: `Investigate shrink at ${p.plant}`,
                                                    detail: `${fmt(p.amount)} in labeled product loss costs recorded. Request breakdown of dump/scrap WOs from plant manager. Determine if linked to specific failing equipment.`,
                                                    priority: 'HIGH',
                                                })) : []),
                                                { step: (d.shrink?.byPlant?.length || 0) + 1, action: 'Add Product Loss logging to WO close-out in Trier OS', detail: 'When closing a work order, technicians record estimated product value lost during the maintenance event. Even rough estimates create a measurable, improvable baseline.', priority: 'HIGH' },
                                                { step: (d.shrink?.byPlant?.length || 0) + 2, action: 'Require a Dump Log at each plant', detail: 'Any product sent to drain or waste during a maintenance event must be logged in Trier OS WorkMisc with description containing "dump" or "product loss" and the estimated $ value.', priority: 'HIGH' },
                                                { step: (d.shrink?.byPlant?.length || 0) + 3, action: 'Correlate maintenance WO frequency with OEE losses', detail: 'Compare OEE (Overall Equipment Effectiveness) at each plant vs. WO frequency on key production assets. A strong correlation validates the COPQ estimate and targets the right equipment.', priority: 'MEDIUM' },
                                                { step: (d.shrink?.byPlant?.length || 0) + 4, action: 'Implement PdM on top 10 highest-failure production assets', detail: 'The highest ROI shrink reduction comes from preventing failures before they cause a product loss event. Use CBM (condition-based monitoring) on the 10 assets with the most WOs.', priority: 'MEDIUM' },
                                            ],
                                            timeline: [
                                                { phase: 'Week 1', task: 'Communicate dump/loss logging requirement to all plant managers' },
                                                { phase: 'Month 1', task: 'Add Product Loss field to WO close-out workflow in Trier OS' },
                                                { phase: 'Month 2–3', task: 'Collect baseline COPQ data — establish $ per plant' },
                                                { phase: 'Month 4–6', task: 'Improve PM schedules on top 10 production failure assets' },
                                                { phase: 'Month 6–12', task: 'Measure COPQ vs. baseline — target 30% reduction year 1' },
                                            ],
                                            kpis: ['Product dump $/month per plant (track, then reduce 30%)', 'Unplanned downtime min/week (target: <60 min)', 'OEE % at top 5 plants (target: >85%)'],
                                        },
                                        accidents: {
                                            title: 'Safety Cost Avoidance — Game Plan',
                                            color: '#ef4444',
                                            Icon: AlertTriangle,
                                            savings: d.summary?.accidentSavings || 0,
                                            headline: d.accidents?.totalCost > 0
                                                ? `Identified ${fmt(d.accidents.totalCost)} in direct and indirect injury-related costs across ${d.accidents.list?.length || 0} incidents. Every $1 in direct medical/damage costs usually masks $4-$10 in indirect costs from lost productivity, downtime, and insurance premiums.`
                                                : 'Zero recorded financial impact from safety incidents. Ensure plants are consistently logging doctor bills, medical expenses, and downtime values in the Safety module.',
                                            why: 'Workplace injuries carry massive hidden costs. The direct doctor bills represent just the tip of the iceberg — the bulk of the financial damage comes from line shutdown, retraining replacements, equipment damage, and legal exposure. Tracking the true cost of an injury fundamentally changes how safety ROI is calculated.',
                                            actions: [
                                                ...(d.accidents?.list?.length > 0 ? d.accidents.list.slice(0, 5).map((a, i) => ({
                                                    step: i + 1,
                                                    action: `Audit Incident: ${a.incident} at ${a.plant}`,
                                                    detail: `Calculated at ${fmt(a.cost)} total cost. Verify severity, root cause investigation, and ensure corrective actions are mechanically completed.`,
                                                    priority: 'HIGH'
                                                })) : []),
                                                { step: (d.accidents?.list?.slice(0, 5).length || 0) + 1, action: 'Enforce Medical Expense Logging', detail: 'Mandate that all OSHA Recordable and Lost Time incidents include attached photo documentation and precise direct cost entry (doctor bills, facility repair).', priority: 'HIGH' },
                                                { step: (d.accidents?.list?.slice(0, 5).length || 0) + 2, action: 'Implement JSA (Job Safety Analysis) on Top Hazard Areas', detail: 'Perform targeted JSAs on equipment clusters historically linked to injuries and high-cost incidents.', priority: 'MEDIUM' }
                                            ],
                                            timeline: [
                                                { phase: 'Week 1', task: 'Audit top 5 costliest incidents' },
                                                { phase: 'Month 1', task: 'Mandate direct cost / attachment entry on all significant incidents' },
                                                { phase: 'Month 3', task: 'Identify top equipment hazards and implement guarding / JSA' }
                                            ],
                                            kpis: ['Direct Medical Expense ($)', 'Recordable Rate', 'Cost Per Incident ($)'],
                                        },
                                        labor: {
                                            title: 'Labor & Overtime Optimization',
                                            color: '#10b981',
                                            Icon: Users,
                                            savings: d.summary?.laborSavings || 0,
                                            headline: `Identified ${fmt(d.laborOptimization?.savingsOpportunity)} in actionable labor bloat across downtime incidents and excessive overtime. Current mix: Regular ${fmt(d.laborOptimization?.reg)}, Overtime ${fmt(d.laborOptimization?.over)}, Double-time ${fmt(d.laborOptimization?.double)}. Salary load: ${fmt(d.laborOptimization?.salary)}.`,
                                            why: 'When plants run reactively, overtime naturally balloons due to emergency call-ins and weekend wrench time. Furthermore, tracking exact labor spend during equipment downtime exposes massive hidden staffing inefficiencies that can be reduced simply through standardized PMs and better line resilience.',
                                            actions: [
                                                ...(d.laborOptimization?.downtimeByPlant?.length > 0 ? d.laborOptimization.downtimeByPlant.slice(0, 3).map((p, i) => ({
                                                    step: i + 1,
                                                    action: `Audit Downtime Wages: ${p.plant}`,
                                                    detail: `Investigate ${fmt(p.amount)} paid specifically during logged equipment downtime. Why are technicians logging wrench hours on down equipment without a rapid return-to-service?`,
                                                    priority: 'HIGH'
                                                })) : []),
                                                { step: 4, action: 'Standardize Overtime Thresholds', detail: 'Flag any Plant location where trailing 30-day Overtime + Double Time exceeds 15% of Regular wage base.', priority: 'HIGH' },
                                                { step: 5, action: 'Factor Injury Burden into Labor Plan', detail: `We logged ${fmt(d.laborOptimization?.injuryBurden)} in direct/indirect accident costs. This often directly triggers forced-overtime to cover absent workers. Prioritize safety on overlapping lines.`, priority: 'MEDIUM' }
                                            ],
                                            timeline: [
                                                { phase: 'Week 1', task: 'Review top 3 plants violating the 15% OT/Reg ratio barrier' },
                                                { phase: 'Month 1', task: 'Implement strict approval gates for double-time authorization' },
                                                { phase: 'Month 3', task: 'Align Preventative Maintenance schedules to eliminate weekend break-fix OT run-rates' }
                                            ],
                                            kpis: ['Overtime to Regular Ratio (Target: < 10%)', 'Wages Lost During Downtime ($)', 'Double Time Spend']
                                        },
                                        phantom: {
                                            title: 'Energy "Phantom Load" — Game Plan',
                                            color: '#eab308',
                                            Icon: Zap,
                                            savings: d.summary?.phantomSavings || 0,
                                            headline: `Algorithms estimate ${fmt(d.phantomLoad?.totalEstimate)} is hemorrhaged annually by equipment left active during non-production shifts across the enterprise.`,
                                            why: 'By analyzing Utility meter readings against Production Shift schedules, we surface the massive "phantom load" — the volume of energy, gas, and water consumed when lines are theoretically shut down. Off-shift utility bleed typically amounts to 16–22% of total facility energy footprint, delivering zero production value.',
                                            actions: [
                                                ...(d.phantomLoad?.byPlant?.length > 0 ? d.phantomLoad.byPlant.slice(0, 4).map((p, i) => ({
                                                    step: i + 1,
                                                    action: `Audit Off-Shift Breakers: ${p.plant}`,
                                                    detail: `Calculated at ${fmt(p.phantomValue)} in non-production bleed (vs ${fmt(p.totalUtility)} total utility budget). Instruct maintenance to physically map and shut down high-draw circuits on weekends.`,
                                                    priority: 'HIGH'
                                                })) : []),
                                                { step: (d.phantomLoad?.byPlant?.slice(0, 4).length || 0) + 1, action: 'Institute "Weekend Baseline" reporting', detail: 'Plant managers must capture Sunday morning meter readings when zero staff are present. The target baseline flow should be <10% of peak operating flow.', priority: 'HIGH' },
                                                { step: (d.phantomLoad?.byPlant?.slice(0, 4).length || 0) + 2, action: 'Map VFDs and Compressors to automated standby', detail: 'Ensure air compressors, massive HVAC blower VFDs, and ammonia chillers automatically scale down during shift-end instead of relying on manual operator intervention.', priority: 'MEDIUM' }
                                            ],
                                            timeline: [
                                                { phase: 'Week 1', task: 'Establish Sunday morning utility baseline reading' },
                                                { phase: 'Month 1', task: 'Assign "Shut-Down Checklist" duties to final shift sanitation crew' },
                                                { phase: 'Month 3', task: 'Automate air compressor and boiler blowdown schedules' }
                                            ],
                                            kpis: ['Non-Production Power Consumption (kWh)', 'Off-Shift Air Leak Rate (CFM)', 'Water Footprint per Gallon Produced']
                                        },
                                        scrap: {
                                            title: 'Scrap Metal Monetization — Game Plan',
                                            color: '#94a3b8',
                                            Icon: Cog,
                                            savings: d.summary?.scrapSavings || 0,
                                            headline: `Algorithms estimate ${fmt(d.scrapMetal?.totalEstimate)} in heavy rotational assets (valves, motors, stators) are discarded annually without reaching a certified scrap recycler.`,
                                            why: 'When plants run reactively, broken stainless steel valves and heavy copper-wound motors are often thrown into standard zero-value dumpsters. The waste management company then extracts the scrap value for their own profit. By capturing this byproduct, the maintenance department can create a new localized revenue stream.',
                                            actions: [
                                                ...(d.scrapMetal?.byPlant?.length > 0 ? d.scrapMetal.byPlant.slice(0, 4).map((p, i) => ({
                                                    step: i + 1,
                                                    action: `Audit Metal Disposal: ${p.plant}`,
                                                    detail: `Calculated at ${fmt(p.scrapValue)} in discarded heavy assets annually. Require the Plant Manager to designate a locked "High-Value Scrap" container specifically for stainless steel and copper.`,
                                                    priority: 'HIGH'
                                                })) : []),
                                                { step: (d.scrapMetal?.byPlant?.slice(0, 4).length || 0) + 1, action: 'Establish Local Recycler Agreements', detail: 'Negotiate bulk pickup rates with local metal recyclers for each major plant region. Ensure payment is credited directly back to the maintenance OpEx budget as offset revenue.', priority: 'HIGH' },
                                                { step: (d.scrapMetal?.byPlant?.slice(0, 4).length || 0) + 2, action: 'Re-Core Program for High-Value Valves', detail: 'Before scrapping, verify if $800+ mix-proof valves can be sent to a re-coring facility instead of repurchased net-new.', priority: 'MEDIUM' }
                                            ],
                                            timeline: [
                                                { phase: 'Month 1', task: 'Deploy locked scrap containers to all maintenance shops' },
                                                { phase: 'Month 2', task: 'Sign localized recycler pickup agreements' },
                                                { phase: 'Month 3', task: 'Audit initial rebate checks vs algorithm estimates' }
                                            ],
                                            kpis: ['Monthly Scrap Rebate Check ($)', 'Tons of Stainless Diverted from Landfill', 'Re-Core vs Replacement Ratio']
                                        },
                                        timeTheft: {
                                            title: 'Contractor Time Theft (SLA vs Logs)',
                                            color: '#f43f5e',
                                            Icon: Clock,
                                            savings: d.summary?.timeTheftSavings || 0,
                                            headline: `Audits indicate ${fmt(d.contractorTheft?.totalEstimate)} is hemorrhaged annually by third-party vendors overbilling hours vs physical floor time.`,
                                            why: 'By cross-referencing Work Order third-party invoices against Security Access gate logs and System logins, algorithms flag mathematical impossibilities (e.g., billing 10 hours for 6.5 hours of physical presence).',
                                            actions: [
                                                ...(d.contractorTheft?.byPlant?.length > 0 ? d.contractorTheft.byPlant.slice(0, 4).map((p, i) => ({
                                                    step: i + 1,
                                                    action: `Audit Vendor SLAs: ${p.plant}`,
                                                    detail: `System detected ${fmt(p.theftValue)} in projected invoice padding vs ${fmt(p.totalBilled)} total contractor spend. Enforce mandatory Gate Log reconciliation for all Purchase Orders over $2,000.`,
                                                    priority: 'HIGH'
                                                })) : []),
                                                { step: (d.contractorTheft?.byPlant?.slice(0, 4).length || 0) + 1, action: 'Institute "Check-In" Validation', detail: 'Force all third-party Service Technicians to scan into the Maintenance portal or swipe their temporary badge to legally bind invoice constraints.', priority: 'HIGH' },
                                                { step: (d.contractorTheft?.byPlant?.slice(0, 4).length || 0) + 2, action: 'Auto-Block Routing on Discrepancy', detail: 'The system will immediately reject Invoice Approvals where billed hours exceed timestamped dwell duration.', priority: 'MEDIUM' }
                                            ],
                                            timeline: [
                                                { phase: 'Month 1', task: 'Implement Mandatory Visitor Badge swiping for Service Techs' },
                                                { phase: 'Month 2', task: 'Configure PO auto-rejection boundaries (e.g., > 10% variance)' },
                                                { phase: 'Month 3', task: 'Execute chargebacks on historically padded invoices' }
                                            ],
                                            kpis: ['Invoice vs Gate Log Variance (%)', 'Total Contractor Chargebacks ($)', 'Contractor Dwell Time (Hrs)']
                                        },
                                        consumable: {
                                            title: 'Consumable Vending Shrink',
                                            color: '#a855f7',
                                            Icon: Box,
                                            savings: d.summary?.consumableSavings || 0,
                                            headline: `Audits indicate ${fmt(d.consumables?.totalEstimate)} in annual leakage from open tool-crib consumables and untracked borrowing.`,
                                            why: 'When high-volume consumables (gloves, bits, grease, blades) are stored in uncontrolled shelves rather than point-of-use vending machines, facilities over-order by an average of 26% to compensate for hoarding and unauthorized removal.',
                                            actions: [
                                                ...(d.consumables?.byPlant?.length > 0 ? d.consumables.byPlant.slice(0, 4).map((p, i) => ({
                                                    step: i + 1,
                                                    action: `Lock down open crib: ${p.plant}`,
                                                    detail: `System detected ${fmt(p.shrinkValue)} in expected consumable shrinkage against ${fmt(p.totalSpend)} total spend. Execute vending machine installation request immediately.`,
                                                    priority: 'HIGH'
                                                })) : []),
                                                { step: (d.consumables?.byPlant?.slice(0, 4).length || 0) + 1, action: 'Institute Badge-Swipe Dispensing', detail: 'Deploy industrial coil-vending or locker systems requiring employee badge scans prior to material dispensing, mapping API usage back into Trier OS.', priority: 'HIGH' },
                                                { step: (d.consumables?.byPlant?.slice(0, 4).length || 0) + 2, action: 'Monitor Burn Rate per Labor Hour', detail: 'Track consumable consumption mathematically against active wrench time on the Dashboard. Generate alerts if Burn-Rate spikes out of standard deviation bounds.', priority: 'MEDIUM' }
                                            ],
                                            timeline: [
                                                { phase: 'Month 1', task: 'Identify top 20 most expensive and highly consumed SKUs per plant' },
                                                { phase: 'Month 2', task: 'Deploy industrial vending units (e.g. Apex, Fastenal) on major factory floors' },
                                                { phase: 'Month 3', task: 'Integrate Vending API back into Trier OS Parts ledger' }
                                            ],
                                            kpis: ['Consumable Burn Rate per Labor Hour ($)', 'Vending Machine Usage Velocity', 'Percentage of Total Spend (Consumables)']
                                        },
                                        rental: {
                                            title: 'Equipment Rental Arbitrage',
                                            color: '#0ea5e9',
                                            Icon: Scale,
                                            savings: d.summary?.rentalSavings || 0,
                                            headline: `System has identified ${fmt(d.rentalArbitrage?.totalEstimate)} in projected financial leakage due to specialty equipment being rented past its capital purchase break-even point.`,
                                            why: 'When localized facilities rent scissor lifts, temporary chillers, and mobile boilers on open-ended monthly contracts to bypass CapEx approvals, they often keep the equipment for durations that exceed the total cost of purchasing the asset outright.',
                                            actions: [
                                                ...(d.rentalArbitrage?.byPlant?.length > 0 ? d.rentalArbitrage.byPlant.slice(0, 4).map((p, i) => ({
                                                    step: i + 1,
                                                    action: `Audit rentals: ${p.plant}`,
                                                    detail: `System detected ${fmt(p.arbitrageValue)} in expected rental arbitrage against ${fmt(p.totalSpend)} total spend. Require site to log rental equipment start dates in Trier OS to enforce duration caps.`,
                                                    priority: 'HIGH'
                                                })) : []),
                                                { step: (d.rentalArbitrage?.byPlant?.slice(0, 4).length || 0) + 1, action: 'Mandatory CapEx Transfer', detail: 'If a rental extends past 70% of purchase value, automatically freeze the PO and trigger a CapEx conversion request.', priority: 'HIGH' },
                                                { step: (d.rentalArbitrage?.byPlant?.slice(0, 4).length || 0) + 2, action: 'Rental Pool Enterprise Sharing', detail: 'Before renting a $15,000 asset for 4 months, check the Trier OS network to see if another plant has an idle unit available for transport.', priority: 'MEDIUM' }
                                            ],
                                            timeline: [
                                                { phase: 'Month 1', task: 'Log all active vendor equipment rentals into the Trier OS Work Misc ledger' },
                                                { phase: 'Month 2', task: 'Return or convert rentals crossing the 8-month threshold' },
                                                { phase: 'Month 3', task: 'Implement hard stops on open-ended POs for major equipment' }
                                            ],
                                            kpis: ['Rental Spend Exceeding Break-Even ($)', 'Average Duration of Specialty Rentals', 'CapEx Approvals from Rental Conversion']
                                        }
                                    };
                                    const plan = plans[opexModal];
                                    if (!plan) return null;
                                    const PlanIcon = plan.Icon;
                                    const pb = (p) => ({ padding: '2px 8px', borderRadius: 6, fontSize: '0.65rem', fontWeight: 700, background: p === 'HIGH' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.12)', color: p === 'HIGH' ? '#ef4444' : '#f59e0b' });
                                    const printPlan = () => {
                                        window.triggerTrierPrint('corp-opex-plan', { plan, fyLabel: d.fyLabel });
                                    };
                                    return (
                                        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}
                                            onClick={e => { if (e.target === e.currentTarget) setOpexModal(null); }}>
                                            <div style={{ background: 'linear-gradient(160deg,#0f172a,#1e1b4b)', border: `1px solid ${plan.color}30`, borderRadius: 20, width: '100%', maxWidth: 860, boxShadow: `0 32px 80px rgba(0,0,0,0.6)`, overflow: 'hidden' }}>
                                                {/* Header */}
                                                <div style={{ padding: 'clamp(14px,4vw,24px) clamp(14px,4vw,32px) clamp(12px,3vw,20px)', background: `linear-gradient(135deg,${plan.color}18,transparent)`, borderBottom: `1px solid ${plan.color}20` }}>
                                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
                                                        <div style={{ width: 48, height: 48, borderRadius: 14, background: `${plan.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                            <PlanIcon size={24} color={plan.color} />
                                                        </div>
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ fontSize: '0.68rem', color: plan.color, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 4 }}>EXECUTIVE ACTION PLAN · {d.fyLabel}</div>
                                                            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: '#f1f5f9' }}>{plan.title}</h2>
                                                        </div>
                                                        {plan.savings > 0 && (
                                                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                                <div style={{ fontSize: '1.9rem', fontWeight: 900, color: plan.color }}>{fmt(plan.savings)}</div>
                                                                <div style={{ fontSize: '0.66rem', color: plan.color, fontWeight: 600 }}>{t('corpAnalytics.text.sAVINGSPOTENTIAL', 'SAVINGS POTENTIAL')}</div>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                        <button onClick={printPlan} className="btn-nav" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}><Printer size={14} />{t('corpAnalytics.text.printGamePlan', 'Print Game Plan')}</button>
                                                        <button onClick={() => {
                                                            if (!commitPlantId) { setCommitMsg('❌ Please select a plant before committing.'); return; }
                                                            const tDate = new Date(); tDate.setDate(tDate.getDate() + 30);
                                                            fetch('/api/opex-tracking/commit', {
                                                                method: 'POST',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({
                                                                // BUG-03: use commitPlantId — never send all_sites to the API
                                                                plantId: commitPlantId,
                                                                category: opexModal,
                                                                itemDescription: plan.title,
                                                                predictedSavings: plan.savings || 0,
                                                                targetDate: tDate.toISOString().split('T')[0],
                                                                priority: 'HIGH'
                                                            })
                                                            }).then(r => r.json())
                                                            .then(d => {
                                                                if (d.error) { setCommitMsg('❌ ' + d.error); return; }
                                                                const warn = d.warning ? ` (${d.warning})` : '';
                                                                setCommitMsg('✅ Committed! Outcome checkpoints set at 30/60/90 days.' + warn);
                                                                setTimeout(() => setCommitMsg(''), 6000);
                                                            })
                                                            .catch(() => setCommitMsg('❌ Commit failed — check connection.'));
                                                        }} disabled={!commitPlantId} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', background: commitPlantId ? '#10b981' : '#374151', cursor: commitPlantId ? 'pointer' : 'not-allowed', opacity: commitPlantId ? 1 : 0.6 }}>
                                                            <CheckCircle2 size={14} /> Commit to This Action
                                                        </button>
                                                        {/* BUG-03: plant selector — required for all-sites corporate view, pre-filled for single-plant context */}
                                                        {!plantId && (
                                                            <select
                                                                value={commitPlantId}
                                                                onChange={e => { setCommitPlantId(e.target.value); setCommitMsg(''); }}
                                                                style={{ fontSize: '0.78rem', padding: '4px 10px', borderRadius: 8, border: '1px solid #374151', background: '#1e293b', color: '#cbd5e1', minWidth: 140 }}
                                                            >
                                                                <option value="">— Select Plant —</option>
                                                                {rankings.filter(r => r.plant && r.plantId !== 'Corporate_Office').map(r => (
                                                                    <option key={r.plantId || r.plant} value={r.plantId || r.plant}>{r.plant}</option>
                                                                ))}
                                                            </select>
                                                        )}
                                                        {/* QUAL-03: reset commitMsg when modal closes */}
                                                        <button onClick={() => { setOpexModal(null); setCommitMsg(''); }} className="btn-danger" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}><X size={14} />{t('corpAnalytics.text.close', 'Close')}</button>
                                                    </div>
                                                    {commitMsg && <div style={{ marginTop: 8, padding: '6px 14px', borderRadius: 8, background: commitMsg.startsWith('✅') ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', color: commitMsg.startsWith('✅') ? '#10b981' : '#ef4444', fontSize: '0.8rem', fontWeight: 600 }}>{commitMsg}</div>}
                                                </div>
                                                {/* Body */}
                                                <div style={{ padding: 'clamp(14px,4vw,28px) clamp(14px,4vw,32px)', display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '72vh', overflowY: 'auto' }}>
                                                    {/* Summary */}
                                                    <div style={{ background: `${plan.color}08`, border: `1px solid ${plan.color}20`, borderRadius: 12, padding: '16px 20px' }}>
                                                        <div style={{ fontSize: '0.67rem', fontWeight: 700, color: plan.color, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('corpAnalytics.text.executiveSummary', 'Executive Summary')}</div>
                                                        <p style={{ margin: 0, fontSize: '0.87rem', lineHeight: 1.7, color: '#cbd5e1' }}>{plan.headline}</p>
                                                    </div>
                                                    {/* Why */}
                                                    <div>
                                                        <div style={{ fontSize: '0.67rem', fontWeight: 700, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('corpAnalytics.text.whyThisDeliversSavings', 'Why This Delivers Savings')}</div>
                                                        <p style={{ margin: 0, fontSize: '0.82rem', lineHeight: 1.7, color: '#94a3b8' }}>{plan.why}</p>
                                                    </div>
                                                    {/* Actions */}
                                                    <div>
                                                        <div style={{ fontSize: '0.67rem', fontWeight: 700, color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('corpAnalytics.text.actionPlanRankedByPriority', 'Action Plan — Ranked by Priority')}</div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                                                            {plan.actions.map(a => (
                                                                <div key={a.step} style={{ display: 'flex', gap: 14, padding: '11px 16px', background: 'rgba(255,255,255,0.025)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)', alignItems: 'flex-start' }}>
                                                                    <div style={{ width: 26, height: 26, borderRadius: 7, background: `${plan.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800, color: plan.color, flexShrink: 0 }}>{a.step}</div>
                                                                    <div style={{ flex: 1 }}>
                                                                        <div style={{ fontWeight: 700, fontSize: '0.84rem', color: '#f1f5f9', marginBottom: 2 }}>{a.action}</div>
                                                                        <div style={{ fontSize: '0.77rem', color: '#64748b', lineHeight: 1.5 }}>{a.detail}</div>
                                                                    </div>
                                                                    <span style={pb(a.priority)}>{a.priority}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    {/* Timeline */}
                                                    <div>
                                                        <div style={{ fontSize: '0.67rem', fontWeight: 700, color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('corpAnalytics.text.implementationTimeline', 'Implementation Timeline')}</div>
                                                        {plan.timeline.map((t, i) => (
                                                            <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '8px 0', borderBottom: i < plan.timeline.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                                                                <div style={{ minWidth: 96, fontSize: '0.74rem', fontWeight: 700, color: plan.color, flexShrink: 0 }}>{t.phase}</div>
                                                                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{t.task}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    {/* KPIs */}
                                                    <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: '16px 20px', border: '1px solid rgba(255,255,255,0.06)' }}>
                                                        <div style={{ fontSize: '0.67rem', fontWeight: 700, color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('corpAnalytics.text.kPIsToTrackSuccess', 'KPIs to Track Success')}</div>
                                                        {plan.kpis.map((k, i) => (
                                                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: i < plan.kpis.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                                                                <CheckCircle2 size={14} color={plan.color} style={{ flexShrink: 0 }} />
                                                                <span style={{ fontSize: '0.82rem', color: '#cbd5e1' }}>{k}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </>
                        );
                    })()}
                </>
            )}

            {/* ═══════════ VENDOR INFLATION DETAIL MODAL ═══════════ */}
            {vendorInflationModal && vendorInflation && (() => {
                const vi = vendorInflation;
                const driftingItems = [
                    ...(vi.topInflators || []),
                    ...(vi.topDeflators || []),
                ].filter(x => x.pctChange !== 0).sort((a, b) => b.pctChange - a.pctChange);

                const byVendor = {};
                driftingItems.forEach(item => {
                    const key = item.vendor || 'Unknown';
                    if (!byVendor[key]) byVendor[key] = { phone: item.vendorPhone, email: item.vendorEmail, contact: item.vendorContact, items: [] };
                    byVendor[key].items.push(item);
                });

                const handlePrint = () => {
                    window.triggerTrierPrint('vendor-inflation', {
                        summary: vi.summary,
                        byVendor,
                        plantLabel: 'Enterprise (All Sites)',
                    });
                };

                return (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 10500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
                        onClick={() => setVendorInflationModal(false)}>
                        <div className="glass-card"
                            style={{ width: '100%', maxWidth: 980, maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}
                            onClick={e => e.stopPropagation()}>
                            {/* Header */}
                            <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <TrendingUp size={20} color="#ef4444" />
                                    <div>
                                        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f1f5f9' }}>Enterprise Vendor Price Drift</div>
                                        <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: 1 }}>24-month window · All plants · Items with price movement only</div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', color: '#818cf8', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                                        Print Report
                                    </button>
                                    <button onClick={() => setVendorInflationModal(false)} style={{ padding: '7px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', cursor: 'pointer', fontSize: '0.78rem' }}>
                                        <X size={14} />
                                    </button>
                                </div>
                            </div>
                            {/* Summary bar */}
                            {vi.summary && (
                                <div style={{ padding: '10px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 24, fontSize: '0.78rem', background: 'rgba(0,0,0,0.2)' }}>
                                    <span style={{ color: '#64748b' }}>{vi.summary.totalTracked} items tracked enterprise-wide</span>
                                    <span><span style={{ color: '#ef4444', fontWeight: 700 }}>{vi.summary.inflating}</span> <span style={{ color: '#64748b' }}>inflating</span></span>
                                    <span><span style={{ color: '#10b981', fontWeight: 700 }}>{vi.summary.deflating}</span> <span style={{ color: '#64748b' }}>deflating</span></span>
                                    <span style={{ marginLeft: 'auto', color: '#64748b' }}>avg drift <span style={{ color: vi.summary.avgDrift > 0 ? '#f97316' : '#10b981', fontWeight: 700 }}>{vi.summary.avgDrift > 0 ? '+' : ''}{vi.summary.avgDrift}%</span></span>
                                </div>
                            )}
                            {/* Body */}
                            <div style={{ overflowY: 'auto', flex: 1, padding: '16px 24px' }}>
                                {driftingItems.length === 0 ? (
                                    <div style={{ padding: '48px', textAlign: 'center', color: '#475569' }}>No price movement detected across any plant in the past 24 months.</div>
                                ) : Object.entries(byVendor).map(([vendorName, vData]) => (
                                    <div key={vendorName} style={{ marginBottom: 24 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                                            <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem' }}>🏭</div>
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#f1f5f9' }}>{vendorName}</div>
                                                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                                    {vData.contact && <span style={{ marginRight: 12 }}>{vData.contact}</span>}
                                                    {vData.phone && <span style={{ marginRight: 12 }}>📞 {vData.phone}</span>}
                                                    {vData.email && <span>✉ {vData.email}</span>}
                                                </div>
                                            </div>
                                        </div>
                                        {vData.items.map((item, i) => (
                                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 8, background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent', marginBottom: 2 }}>
                                                <div style={{ fontSize: '0.7rem', color: '#475569', minWidth: 80 }}>{(item.plant || '').replace(/_/g, ' ')}</div>
                                                <div style={{ fontSize: '0.72rem', color: '#64748b', minWidth: 80 }}>{item.vendorPartNo || '—'}</div>
                                                <div style={{ flex: 1, fontSize: '0.82rem', color: '#e2e8f0', fontWeight: 500 }}>{item.label}</div>
                                                <div style={{ fontSize: '0.78rem', color: '#64748b' }}>${Number(item.firstCost).toFixed(2)}</div>
                                                <div style={{ fontSize: '0.7rem', color: '#475569' }}>→</div>
                                                <div style={{ fontSize: '0.78rem', color: '#e2e8f0', fontWeight: 600 }}>${Number(item.lastCost).toFixed(2)}</div>
                                                <div style={{ padding: '3px 10px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700, background: item.pctChange > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.12)', color: item.pctChange > 0 ? '#ef4444' : '#10b981', minWidth: 64, textAlign: 'right' }}>
                                                    {item.pctChange > 0 ? '+' : ''}{item.pctChange}%
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ═══════════ OPEX TRACKING (SELF-HEALING LOOP) ═══════════ */}
            {activeSection === 'tracking' && (() => {
                if (!trackingData) return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}><RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} /><span style={{ marginLeft: 10 }}>Loading tracking data...</span></div>;
                const td = trackingData;
                const statusColor = s => s === 'OPEN' ? '#3b82f6' : s === 'IN_PROGRESS' ? '#f59e0b' : s === 'COMPLETED' ? '#10b981' : s === 'MISSED' ? '#ef4444' : '#64748b';
                const statusIcon  = s => s === 'OPEN' ? '🔵' : s === 'IN_PROGRESS' ? '🟡' : s === 'COMPLETED' ? '✅' : s === 'MISSED' ? '🔴' : '⚪';
                return (
                    <>
                        {/* KPI Bar */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 16 }}>
                            <KPICard icon={Target}      label="Open Actions"    value={td.counts?.open || 0}           color="#3b82f6" />
                            <KPICard icon={TrendingDown} label="In Progress"     value={td.counts?.inProgress || 0}    color="#f59e0b" />
                            <KPICard icon={CheckCircle2} label="Completed"        value={td.counts?.completed || 0}     color="#10b981" />
                            <KPICard icon={AlertTriangle} label="Missed"          value={td.counts?.missed || 0}        color="#ef4444" />
                            <KPICard icon={AlertTriangle} label="Overdue"         value={td.counts?.overdue || 0}       color="#dc2626" />
                            <KPICard icon={DollarSign}  label="Total Predicted"   value={fmt(td.financials?.totalPredicted || 0)} color="#8b5cf6" />
                            <KPICard icon={DollarSign}  label="Total Realized"    value={fmt(td.financials?.totalRealized  || 0)} color="#10b981" />
                            <KPICard icon={Zap}         label="Realization Rate"  value={(td.financials?.realizationPct || 0) + '%'} color="#06b6d4" />
                        </div>

                        {/* Plant Heatmap */}
                        {td.plantRates?.length > 0 && (
                            <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
                                <h3 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Plant Realization Heatmap</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 10 }}>
                                    {td.plantRates.map(p => {
                                        const pct = p.avgRealization || 0;
                                        const col = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : pct >= 20 ? '#ef4444' : '#64748b';
                                        return (
                                            <div key={p.PlantId} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '12px 14px', border: `1px solid ${col}30` }}>
                                                <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#f1f5f9', marginBottom: 6 }}>{p.PlantId}</div>
                                                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 4, height: 6, marginBottom: 6 }}>
                                                    <div style={{ width: `${Math.min(100,pct)}%`, height: '100%', background: col, borderRadius: 4, transition: 'width 0.6s' }} />
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem' }}>
                                                    <span style={{ color: col, fontWeight: 700 }}>{pct > 0 ? pct.toFixed(1) + '%' : 'No data'}</span>
                                                    <span style={{ color: '#64748b' }}>{p.commitments} actions</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Category Performance */}
                        {td.categoryPerf?.length > 0 && (
                            <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
                                <h3 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Category Performance</h3>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                    <thead>
                                        <tr style={{ color: '#64748b' }}>
                                            <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>Category</th>
                                            <th style={{ textAlign: 'right', padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>Commitments</th>
                                            <th style={{ textAlign: 'right', padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>Predicted</th>
                                            <th style={{ textAlign: 'right', padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>Avg Realization</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {td.categoryPerf.map((c, i) => {
                                            const pct = c.avgRealization || 0;
                                            const col = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
                                            return (
                                                <tr key={c.Category} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                                                    <td style={{ padding: '8px 10px', fontWeight: 600, color: '#f1f5f9', textTransform: 'capitalize' }}>{c.Category}</td>
                                                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#94a3b8' }}>{c.commitments}</td>
                                                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#f59e0b', fontWeight: 600 }}>{fmt(c.totalPredicted)}</td>
                                                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: pct > 0 ? col : '#64748b' }}>{pct > 0 ? pct.toFixed(1) + '%' : '—'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Open Alerts */}
                        {td.openAlerts > 0 && (
                            <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                                <AlertTriangle size={16} color="#ef4444" />
                                <span style={{ fontSize: '0.85rem', color: '#fca5a5', fontWeight: 600 }}>{td.openAlerts} unresolved escalation alert{td.openAlerts > 1 ? 's' : ''} — review in the Alerts panel</span>
                            </div>
                        )}

                        {/* Empty State */}
                        {!td.counts?.open && !td.counts?.inProgress && !td.counts?.completed && (
                            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#475569' }}>
                                <Target size={40} style={{ marginBottom: 16, opacity: 0.4 }} />
                                <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 8 }}>No Commitments Yet</div>
                                <div style={{ fontSize: '0.85rem', maxWidth: 400, margin: '0 auto', lineHeight: 1.6 }}>
                                    Open the OpEx Intel tab, click any savings card, and use <strong style={{ color: '#10b981' }}>"Commit to This Action"</strong> to start tracking outcomes.
                                </div>
                            </div>
                        )}
                    </>
                );
            })()}

            {/* ═══════════ REAL ESTATE & PROPERTY SECTION ═══════════ */}
            {activeSection === 'realestate' && (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
                        <KPICard icon={Map} label="Total Enterprise Acreage" value={fmtN(mapPins.reduce((s, p) => s + (parseFloat(p.acreage) || 0), 0)) + ' AC'} color="#10b981" />
                        <KPICard icon={DollarSign} label="Est. Property Value" value={fmt(mapPins.reduce((s, p) => s + (parseFloat(p.propertyValue) || 0), 0))} color="#f59e0b" />
                        <KPICard icon={DollarSign} label="Enterprise Property Taxes" value={fmt(mapPins.reduce((s, p) => s + (parseFloat(p.taxAmount) || 0), 0))} color="#ef4444" />
                        <KPICard icon={Target} label="Tracked GIS Locations" value={fmtN(mapPins.filter(p => parseFloat(p.acreage) > 0 || parseFloat(p.taxAmount) > 0 || p.pinType === 'Corporate' || p.pinType === 'Plant').length)} color="#3b82f6" />
                    </div>

                    <div className="glass-card" style={{ padding: 20 }}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9' }}>Real Estate Portfolio</h3>
                        <div style={{ maxHeight: 500, overflow: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                                <thead style={{ position: 'sticky', top: 0, background: '#1e1b4b', zIndex: 10 }}>
                                    <tr>
                                        <th style={{ padding: '8px 10px', color: '#64748b', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>Location / Facility</th>
                                        <th style={{ padding: '8px 10px', color: '#64748b', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>Address Mapping</th>
                                        <th style={{ padding: '8px 10px', color: '#64748b', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>Class</th>
                                        <th style={{ padding: '8px 10px', color: '#64748b', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.06)', textAlign: 'right' }}>Acreage</th>
                                        <th style={{ padding: '8px 10px', color: '#64748b', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.06)', textAlign: 'right' }}>Est. Value</th>
                                        <th style={{ padding: '8px 10px', color: '#64748b', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.06)', textAlign: 'right' }}>Annual Tax</th>
                                        <th style={{ padding: '8px 10px', color: '#64748b', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>Parcel ID</th>
                                        <th style={{ padding: '8px 10px', color: '#64748b', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>Public Records</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {mapPins.filter(p => parseFloat(p.acreage) > 0 || parseFloat(p.taxAmount) > 0 || p.pinType === 'Corporate' || p.pinType === 'Plant').map((p, i) => (
                                        <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                                            <td style={{ padding: '8px 10px', fontWeight: 600, color: '#f8fafc' }}>{p.label}</td>
                                            <td style={{ padding: '8px 10px', color: '#94a3b8' }}>{[p.address, p.city, p.state].filter(Boolean).join(', ')}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                <span style={{ padding: '2px 6px', borderRadius: 4, background: '#3b82f620', color: '#60a5fa', fontSize: '0.65rem', fontWeight: 600 }}>{p.propertyClass || 'Commercial'}</span>
                                            </td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#10b981' }}>{p.acreage ? `${parseFloat(p.acreage).toFixed(2)} AC` : '-'}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#f59e0b' }}>{p.propertyValue ? fmt(parseFloat(p.propertyValue)) : '-'}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#ef4444' }}>{p.taxAmount ? fmt(parseFloat(p.taxAmount)) : '-'}</td>
                                            <td style={{ padding: '8px 10px', color: '#64748b', fontFamily: 'monospace' }}>{p.parcelId || '-'}</td>
                                            <td style={{ padding: '8px 10px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                {p.gisUrl && <a href={p.gisUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#3b82f615', color: '#60a5fa', padding: '3px 8px', borderRadius: 4, fontSize: '0.65rem', textDecoration: 'none', fontWeight: 600 }}><Map size={12} /> GIS</a>}
                                                {p.recorderOfDeedsUrl && <a href={p.recorderOfDeedsUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#a855f715', color: '#c084fc', padding: '3px 8px', borderRadius: 4, fontSize: '0.65rem', textDecoration: 'none', fontWeight: 600 }}><Archive size={12} /> Deeds</a>}
                                                {p.taxRecordsUrl && <a href={p.taxRecordsUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f59e0b15', color: '#fbbf24', padding: '3px 8px', borderRadius: 4, fontSize: '0.65rem', textDecoration: 'none', fontWeight: 600 }}><DollarSign size={12} /> Tax</a>}
                                                {!p.gisUrl && !p.recorderOfDeedsUrl && !p.taxRecordsUrl && <span style={{ color: '#64748b', fontSize: '0.7rem' }}>N/A</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {/* ═══════════ MAINTENANCE KPIs SECTION ═══════════ */}
            {activeSection === 'maintenance' && (() => {
                const kpi = maintenanceKpis;
                if (!kpi) return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#64748b', padding: 40, justifyContent: 'center' }}>
                        <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Loading maintenance KPIs...
                    </div>
                );
                const pr   = kpi.plannedRatio   || {};
                const pm   = kpi.pmCompliance   || {};
                const bl   = kpi.backlog        || {};
                const dt   = kpi.downtimeCost   || {};
                const overTarget = pr.plannedPct >= 80;

                return (
                    <>
                        {/* KPI headline row */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
                            <KPICard
                                icon={Activity}
                                label="Planned vs. Unplanned"
                                value={`${pr.plannedPct ?? '--'}% Planned`}
                                sub={`Target ≥ 80% · ${pr.total ?? 0} WOs (12 mo)`}
                                color={overTarget ? '#10b981' : '#f59e0b'}
                            />
                            <KPICard
                                icon={CheckCircle2}
                                label="PM Compliance Rate"
                                value={pm.complianceRate != null ? `${pm.complianceRate}%` : 'N/A'}
                                sub={`${pm.scheduledPMs ?? 0} scheduled · ${pm.overdue ?? 0} overdue`}
                                color={pm.complianceRate >= 90 ? '#10b981' : pm.complianceRate >= 70 ? '#f59e0b' : '#ef4444'}
                            />
                            <KPICard
                                icon={Clock}
                                label="WO Backlog (Open)"
                                value={fmtN(bl.totalOpen ?? 0)}
                                sub={`${bl.criticalAged ?? 0} aged >30 days`}
                                color={bl.criticalAged > 10 ? '#ef4444' : '#3b82f6'}
                            />
                            <KPICard
                                icon={DollarSign}
                                label="Downtime Cost (12 mo)"
                                value={fmt(dt.totalCost ?? 0)}
                                sub={`${dt.woCount ?? 0} WOs with downtime cost`}
                                color="#f59e0b"
                            />
                        </div>

                        {/* Planned vs. Unplanned bar */}
                        <div className="glass-card" style={{ padding: 20, marginBottom: 12 }}>
                            <h3 style={{ margin: '0 0 14px 0', fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9' }}>
                                Planned vs. Unplanned Ratio
                                <span style={{ marginLeft: 10, fontSize: '0.7rem', fontWeight: 400, color: '#64748b' }}>
                                    World-class target: ≥ 80% planned
                                </span>
                            </h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ flex: 1, height: 24, background: 'rgba(255,255,255,0.06)', borderRadius: 6, overflow: 'hidden', display: 'flex' }}>
                                    <div style={{ width: `${pr.plannedPct ?? 0}%`, background: overTarget ? '#10b981' : '#f59e0b', transition: 'width 0.4s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {(pr.plannedPct ?? 0) > 10 && <span style={{ color: '#fff', fontSize: '0.7rem', fontWeight: 700 }}>{pr.plannedPct}%</span>}
                                    </div>
                                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>{pr.unplannedPct ?? 0}% unplanned</span>
                                    </div>
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                                    {fmtN(pr.planned ?? 0)} planned / {fmtN(pr.unplanned ?? 0)} reactive
                                </div>
                            </div>
                        </div>

                        {/* PM Compliance + Backlog detail */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div className="glass-card" style={{ padding: 20 }}>
                                <h3 style={{ margin: '0 0 14px 0', fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9' }}>PM Compliance Detail</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {[
                                        { label: 'Scheduled PMs (12 mo)',  value: fmtN(pm.scheduledPMs ?? 0),     color: '#94a3b8' },
                                        { label: 'Completed On-Time',       value: fmtN(pm.completedOnTime ?? 0),  color: '#10b981' },
                                        { label: 'Overdue / Missed',        value: fmtN(pm.overdue ?? 0),          color: '#ef4444' },
                                        { label: 'Compliance Rate',         value: pm.complianceRate != null ? `${pm.complianceRate}%` : 'N/A', color: pm.complianceRate >= 90 ? '#10b981' : '#f59e0b' },
                                    ].map(row => (
                                        <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{row.label}</span>
                                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: row.color }}>{row.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="glass-card" style={{ padding: 20 }}>
                                <h3 style={{ margin: '0 0 14px 0', fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9' }}>Backlog Aging</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {[
                                        { label: '0–7 days',   value: fmtN(kpi.backlogDetail?.buckets?.d0_7   ?? 0), color: '#10b981' },
                                        { label: '8–30 days',  value: fmtN(kpi.backlogDetail?.buckets?.d8_30  ?? 0), color: '#f59e0b' },
                                        { label: '31–90 days', value: fmtN(kpi.backlogDetail?.buckets?.d31_90 ?? 0), color: '#f97316' },
                                        { label: '90+ days',   value: fmtN(kpi.backlogDetail?.buckets?.d90plus ?? 0), color: '#ef4444' },
                                    ].map(row => (
                                        <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{row.label}</span>
                                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: row.color }}>{row.value}</span>
                                        </div>
                                    ))}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#f1f5f9' }}>Total Open</span>
                                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#3b82f6' }}>{fmtN(bl.totalOpen ?? 0)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                );
            })()}

            {/* ═══════════ ACCESS MANAGEMENT ═══════════ */}
            <AccessManager isCreator={isCreator} />

            <div style={{ textAlign: 'center', color: '#1e293b', fontSize: '0.65rem', letterSpacing: '0.1em', padding: '10px 0 20px' }}>
                CORPORATE ANALYTICS · EXECUTIVE INTELLIGENCE · © {new Date().getFullYear()} TRIER OS
            </div>

            {/* ── Risk Detail Modal ── */}
            {selectedRisk && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }} onClick={e => { if (e.target === e.currentTarget) setSelectedRisk(null); }}>
                    <div className="glass-card" style={{ width: '100%', maxWidth: 540, padding: 24, paddingBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <SeverityBadge severity={selectedRisk.severity} />
                                <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#f1f5f9' }}>Risk Detail</h2>
                            </div>
                            <button className="btn-nav" onClick={() => setSelectedRisk(null)} style={{ padding: 4, borderRadius: '50%' }}><X size={20} /></button>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
                            <div style={{ fontWeight: 700, fontSize: '1.2rem', color: '#f8fafc', marginBottom: 8 }}>{selectedRisk.title}</div>
                            <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: 16, lineHeight: 1.5 }}>{selectedRisk.detail}</div>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600, marginBottom: 4 }}>Plant / Location</div>
                                    <div style={{ fontSize: '0.82rem', color: '#e2e8f0', fontWeight: 500 }}>{selectedRisk.plant}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600, marginBottom: 4 }}>Category</div>
                                    <div style={{ fontSize: '0.82rem', color: '#e2e8f0', fontWeight: 500, display: 'flex' }}>
                                        <span style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(59,130,246,0.1)', color: '#60a5fa' }}>{selectedRisk.category.replace(/_/g, ' ')}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                            <button className="btn-primary" onClick={() => setSelectedRisk(null)} style={{ fontSize: '0.85rem' }}>{t('corpAnalytics.text.close', 'Close')}</button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
