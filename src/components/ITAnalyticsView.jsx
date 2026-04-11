// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — IT Analytics Dashboard
 * ===================================
 * Comprehensive IT performance analytics covering spending, license utilization,
 * hardware lifecycle stage, infrastructure health, asset location heat map,
 * and monthly depreciation trend.
 *
 * KEY METRICS:
 *   Total IT Spend       — Cumulative spend on hardware, software, and services
 *   License Utilization  — Active licenses / purchased licenses × 100%
 *   Hardware Lifecycle   — Distribution of assets by stage (New/Active/EOL/Retired)
 *   Infrastructure Score — % of network/server infrastructure showing healthy status
 *   Monthly Depreciation — Sum of depreciation charges across all IT assets
 *
 * KEY FEATURES:
 *   - KPI tile row: Total Spend, License Util %, EOL Asset Count, Infra Health %
 *   - License utilization bar chart: by software category (OS, productivity, security)
 *   - Hardware lifecycle donut: New / Active / End-of-Life / Retired breakdown
 *   - Monthly depreciation trend line: rolling 12-month view
 *   - Asset location heat map: geographic concentration by plant
 *   - Print report: one-click formatted summary for budget reviews
 *
 * API CALLS:
 *   GET /api/it/analytics   — Full IT analytics dataset (plant-scoped)
 */
import React, { useState, useEffect } from 'react';
import { BarChart3, DollarSign, Key, Monitor, Wifi, TrendingDown, AlertTriangle, RefreshCw, MapPin, Printer } from 'lucide-react';
import { printRecord, infoGridHTML, tableHTML } from '../utils/printRecord';
import { useTranslation } from '../i18n/index.jsx';

const API = (path) => fetch(`/api/it${path}`, {
    headers: { 'Content-Type': 'application/json', 'x-plant-id': localStorage.getItem('selectedPlantId') || 'all_sites' },
});

const KPI = ({ icon: Icon, label, value, sub, color }) => (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', borderRadius: 14, padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon size={22} color={color} />
        </div>
        <div>
            <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color }}>{value}</div>
            {sub && <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: 2 }}>{sub}</div>}
        </div>
    </div>
);

const ProgressBar = ({ label, value, max, color, suffix = '' }) => {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0;
    return (
        <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: 3 }}>
                <span>{label}</span>
                <span style={{ color, fontWeight: 700 }}>{pct}%{suffix}</span>
            </div>
            <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: pct + '%', background: `linear-gradient(90deg, ${color}, ${color}88)`, borderRadius: 4, transition: 'width 0.6s ease' }} />
            </div>
        </div>
    );
};

export default function ITAnalyticsView({ plantId, plantLabel }) {
    const { t } = useTranslation();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        const plant = plantId || localStorage.getItem('selectedPlantId') || 'all_sites';
        API(`/analytics?plant=${plant}`).then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
    }, [plantId]);

    if (loading) return <div className="glass-card" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>{t('itAnalytics.loadingItAnalytics', 'Loading IT Analytics...')}</div>;
    if (!data) return <div className="glass-card" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t('itAnalytics.noAnalyticsDataAvailable', 'No analytics data available')}</div>;

    const { spending, licenses, hardware, infrastructure, assetsByPlant, depreciationTrend } = data;
    const scope = (plantId && plantId !== 'all_sites') ? plantLabel || plantId.replace(/_/g, ' ') : t('itAnalytics.enterpriseWide', 'Enterprise-Wide');
    const totalSpend = Object.values(spending?.byCategory || {}).reduce((s, v) => s + v, 0);
    const maxTrendVal = Math.max(...(depreciationTrend || []).map(d => d.expense), 1);

    const handlePrint = () => {
        let html = infoGridHTML([
            [t('itAnalytics.printScope', 'Scope'), scope],
            [t('itAnalytics.printTotalItSpend', 'Total IT Spend'), '$' + totalSpend.toLocaleString()],
            [t('itAnalytics.printActiveLicenses', 'Active Licenses'), String(licenses?.items?.length || 0)],
            [t('itAnalytics.printLicenseUtilization', 'License Utilization'), (licenses?.overallUtilization || 0) + '%'],
            [t('itAnalytics.printActiveHardware', 'Active Hardware'), String(hardware?.totalActive || 0)],
            [t('itAnalytics.printInfraUptime', 'Infra Uptime'), (infrastructure?.uptimeRate || 0) + '%'],
        ]);

        if (spending?.byCategory) {
            html += '<div class="section-header">' + t('itAnalytics.printSpendingByCategory', 'Spending by Category') + '</div>' + tableHTML([t('itAnalytics.printColCategory', 'Category'), t('itAnalytics.printColTotalSpend', 'Total Spend')], Object.entries(spending.byCategory).map(([k, v]) => [k.charAt(0).toUpperCase() + k.slice(1), '$' + v.toLocaleString()]));
        }
        if (licenses?.items?.length) {
            html += '<div class="section-header">' + t('itAnalytics.printLicenseUtilizationHeader', 'License Utilization') + '</div>' + tableHTML([t('itAnalytics.printColSoftware', 'Software'), t('itAnalytics.printColVendor', 'Vendor'), t('itAnalytics.printColSeats', 'Seats'), t('itAnalytics.printColUsed', 'Used'), t('itAnalytics.printColUtilization', 'Utilization')], licenses.items.slice(0, 20).map(l => [l.Name, l.Vendor || '--', String(l.Seats), String(l.SeatsUsed), l.utilization + '%']));
        }
        if (hardware?.refreshCandidates?.length) {
            html += '<div class="section-header">' + t('itAnalytics.printHardwareRefreshCandidates', 'Hardware Refresh Candidates') + '</div>' + tableHTML([t('itAnalytics.printColName', 'Name'), t('itAnalytics.printColType', 'Type'), t('itAnalytics.printColAgeYrs', 'Age (yrs)'), t('itAnalytics.printColCondition', 'Condition'), t('itAnalytics.printColPercentDepreciated', '% Depreciated'), t('itAnalytics.printColBookValue', 'Book Value')], hardware.refreshCandidates.map(r => [r.name, r.type, String(r.age), r.condition, r.percentDepreciated + '%', '$' + r.bookValue.toLocaleString()]));
        }
        if (assetsByPlant && Object.keys(assetsByPlant).length) {
            html += '<div class="section-header">' + t('itAnalytics.printAssetsByPlant', 'Assets by Plant') + '</div>' + tableHTML([t('itAnalytics.printColPlant', 'Plant'), t('itAnalytics.printColHardware', 'Hardware'), t('itAnalytics.printColInfrastructure', 'Infrastructure'), t('itAnalytics.printColMobile', 'Mobile'), t('itAnalytics.printColTotal', 'Total')], Object.entries(assetsByPlant).map(([p, d]) => [p.replace(/_/g, ' '), String(d.hardware), String(d.infrastructure), String(d.mobile), String(d.total)]));
        }
        printRecord(t('itAnalytics.printTitle', 'IT Analytics Dashboard'), html, { subtitle: scope + ' — ' + t('itAnalytics.printSubtitle', 'IT Spending, Utilization & Health') });
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-base)' }}>
            <div className="glass-card no-print" style={{ padding: '15px 25px', display: 'flex', alignItems: 'center', gap: 16 }}>
                <h2 style={{ fontSize: '1.4rem', margin: 0, color: '#6366f1', display: 'flex', alignItems: 'center', gap: 10 }}><BarChart3 size={24} /> {t('itAnalytics.pageTitle', 'IT Analytics')}</h2>
                <span style={{ fontSize: '0.78rem', color: '#64748b', background: 'rgba(99,102,241,0.1)', padding: '4px 12px', borderRadius: 8 }}>{scope}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
                    <button title={t('itAnalytics.printButtonTitle', 'Print')} className="btn-nav" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Printer size={15} /> {t('itAnalytics.printButton', 'Print')}</button>
                </div>
            </div>

            {/* KPI Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <KPI icon={DollarSign} label={t('itAnalytics.kpiTotalItSpend', 'Total IT Spend')} value={'$' + totalSpend.toLocaleString()} color="#3b82f6" />
                <KPI icon={Key} label={t('itAnalytics.kpiLicenseUtilization', 'License Utilization')} value={(licenses?.overallUtilization || 0) + '%'} sub={`${licenses?.totalUsed || 0} ${t('itAnalytics.kpiLicenseOf', 'of')} ${licenses?.totalSeats || 0} ${t('itAnalytics.kpiLicenseSeatsUsed', 'seats used')}`} color="#8b5cf6" />
                <KPI icon={Monitor} label={t('itAnalytics.kpiActiveHardware', 'Active Hardware')} value={hardware?.totalActive || 0} sub={`${hardware?.refreshCandidates?.length || 0} ${t('itAnalytics.kpiRefreshCandidates', 'refresh candidates')}`} color="#3b82f6" />
                <KPI icon={Wifi} label={t('itAnalytics.kpiInfraUptime', 'Infra Uptime')} value={(infrastructure?.uptimeRate || 0) + '%'} sub={`${infrastructure?.online || 0} ${t('itAnalytics.kpiOnline', 'online')} / ${infrastructure?.offline || 0} ${t('itAnalytics.kpiOffline', 'offline')}`} color="#10b981" />
                <KPI icon={TrendingDown} label={t('itAnalytics.kpiMonthlyDepExpense', 'Monthly Dep. Expense')} value={'$' + (depreciationTrend?.[depreciationTrend.length - 1]?.expense || 0).toLocaleString()} color="#f59e0b" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-base)' }}>

                {/* Spending by Category */}
                <div className="glass-card" style={{ padding: 20 }}>
                    <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}><DollarSign size={18} color="#3b82f6" /> {t('itAnalytics.sectionSpendingByCategory', 'Spending by Category')}</h3>
                    {Object.entries(spending?.byCategory || {}).map(([cat, val]) => {
                        const colors = { software: '#8b5cf6', hardware: '#3b82f6', infrastructure: '#10b981', mobile: '#f59e0b' };
                        return <ProgressBar key={cat} label={cat.charAt(0).toUpperCase() + cat.slice(1)} value={val} max={totalSpend} color={colors[cat] || '#64748b'} suffix={` ($${val.toLocaleString()})`} />;
                    })}
                </div>

                {/* License Utilization */}
                <div className="glass-card" style={{ padding: 20 }}>
                    <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}><Key size={18} color="#8b5cf6" /> {t('itAnalytics.sectionLicenseUtilization', 'License Utilization')}</h3>
                    <div style={{ maxHeight: 220, overflow: 'auto' }}>
                        {(licenses?.items || []).slice(0, 15).map(l => (
                            <div key={l.Name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{l.Name}</div>
                                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{l.Vendor || ''} — {l.LicenseType}</div>
                                </div>
                                <div style={{ width: 80, textAlign: 'right' }}>
                                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: l.utilization > 90 ? '#ef4444' : l.utilization > 70 ? '#f59e0b' : '#10b981' }}>{l.utilization}%</span>
                                    <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{l.SeatsUsed}/{l.Seats}</div>
                                </div>
                            </div>
                        ))}
                        {!licenses?.items?.length && <div style={{ color: '#64748b', fontSize: '0.82rem', fontStyle: 'italic' }}>{t('itAnalytics.noActiveLicenses', 'No active licenses')}</div>}
                    </div>
                </div>

                {/* Hardware Age Distribution */}
                <div className="glass-card" style={{ padding: 20 }}>
                    <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}><Monitor size={18} color="#3b82f6" /> {t('itAnalytics.sectionHardwareAgeDistribution', 'Hardware Age Distribution')}</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                        {Object.entries(hardware?.ageDistribution || {}).map(([range, count]) => {
                            const colors = { '0-1yr': '#10b981', '1-3yr': '#3b82f6', '3-5yr': '#f59e0b', '5yr+': '#ef4444' };
                            return (
                                <div key={range} style={{ textAlign: 'center', padding: 12, background: (colors[range] || '#64748b') + '10', borderRadius: 10, border: '1px solid ' + (colors[range] || '#64748b') + '30' }}>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: colors[range] }}>{count}</div>
                                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{range}</div>
                                </div>
                            );
                        })}
                    </div>
                    {hardware?.refreshCandidates?.length > 0 && (
                        <div style={{ marginTop: 16, padding: 12, background: 'rgba(239,68,68,0.06)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)' }}>
                            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#ef4444', marginBottom: 6 }}><AlertTriangle size={14} /> {hardware.refreshCandidates.length} {t('itAnalytics.refreshCandidatesLabel', 'Refresh Candidates')}</div>
                            <div style={{ maxHeight: 100, overflow: 'auto' }}>
                                {hardware.refreshCandidates.slice(0, 8).map(r => (
                                    <div key={r.id} style={{ fontSize: '0.75rem', color: '#fca5a5', padding: '2px 0' }}>
                                        {r.name} — {r.age}yr, {r.condition}, {r.percentDepreciated}% dep.
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Infrastructure Health */}
                <div className="glass-card" style={{ padding: 20 }}>
                    <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}><Wifi size={18} color="#10b981" /> {t('itAnalytics.sectionInfrastructureHealth', 'Infrastructure Health')}</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                        <div style={{ textAlign: 'center', padding: 14, borderRadius: 12, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#10b981' }}>{infrastructure?.uptimeRate || 0}%</div>
                            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{t('itAnalytics.uptimeRate', 'Uptime Rate')}</div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, background: 'rgba(16,185,129,0.06)' }}>
                                <span style={{ fontSize: '0.78rem' }}>{t('itAnalytics.online', 'Online')}</span>
                                <span style={{ fontWeight: 700, color: '#10b981' }}>{infrastructure?.online || 0}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.06)' }}>
                                <span style={{ fontSize: '0.78rem' }}>{t('itAnalytics.offline', 'Offline')}</span>
                                <span style={{ fontWeight: 700, color: '#ef4444' }}>{infrastructure?.offline || 0}</span>
                            </div>
                        </div>
                    </div>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '0.78rem', color: '#94a3b8' }}>{t('itAnalytics.byCriticality', 'By Criticality')}</h4>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {Object.entries(infrastructure?.byCriticality || {}).map(([k, v]) => {
                            const colors = { Critical: '#ef4444', High: '#f59e0b', Medium: '#eab308', Low: '#3b82f6' };
                            return v > 0 ? <span key={k} style={{ padding: '3px 10px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600, background: (colors[k] || '#64748b') + '15', color: colors[k] || '#64748b', border: '1px solid ' + (colors[k] || '#64748b') + '30' }}>{k}: {v}</span> : null;
                        })}
                    </div>
                </div>

                {/* Monthly Depreciation Trend */}
                <div className="glass-card" style={{ padding: 20 }}>
                    <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}><TrendingDown size={18} color="#f59e0b" /> {t('itAnalytics.sectionMonthlyDepreciationExpense', 'Monthly Depreciation Expense')}</h3>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}>
                        {(depreciationTrend || []).map((d, i) => (
                            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                                <div style={{ fontSize: '0.6rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>${d.expense > 999 ? Math.round(d.expense / 1000) + 'k' : d.expense}</div>
                                <div style={{ width: '100%', height: Math.max(4, (d.expense / maxTrendVal) * 100) + '%', background: 'linear-gradient(180deg, #f59e0b, #f59e0b66)', borderRadius: '4px 4px 0 0', minHeight: 4 }} title={d.month + ': $' + d.expense.toLocaleString()} />
                                <div style={{ fontSize: '0.55rem', color: '#475569', whiteSpace: 'nowrap' }}>{d.month}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Asset Location Map */}
                <div className="glass-card" style={{ padding: 20 }}>
                    <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}><MapPin size={18} color="#ec4899" /> {t('itAnalytics.sectionAssetsByPlant', 'Assets by Plant')}</h3>
                    <div style={{ maxHeight: 220, overflow: 'auto' }}>
                        {Object.entries(assetsByPlant || {}).sort((a, b) => b[1].total - a[1].total).map(([plant, d]) => (
                            <div key={plant} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{plant.replace(/_/g, ' ')}</div>
                                </div>
                                <div style={{ display: 'flex', gap: 10, fontSize: '0.72rem' }}>
                                    <span style={{ color: '#3b82f6' }}>{d.hardware} {t('itAnalytics.assetHw', 'HW')}</span>
                                    <span style={{ color: '#10b981' }}>{d.infrastructure} {t('itAnalytics.assetInfra', 'Infra')}</span>
                                    <span style={{ color: '#f59e0b' }}>{d.mobile} {t('itAnalytics.assetMob', 'Mob')}</span>
                                </div>
                                <span style={{ fontWeight: 800, fontSize: '0.85rem', color: '#e2e8f0', minWidth: 30, textAlign: 'right' }}>{d.total}</span>
                            </div>
                        ))}
                        {!Object.keys(assetsByPlant || {}).length && <div style={{ color: '#64748b', fontSize: '0.82rem', fontStyle: 'italic' }}>{t('itAnalytics.noAssetLocationData', 'No asset location data')}</div>}
                    </div>
                </div>

            </div>

            {/* Replacement Forecast */}
            {hardware?.replacementForecast && Object.keys(hardware.replacementForecast).length > 0 && (
                <div className="glass-card" style={{ padding: 20 }}>
                    <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}><RefreshCw size={18} color="#6366f1" /> {t('itAnalytics.sectionHardwareReplacementForecast', 'Hardware Replacement Forecast')}</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                        {Object.entries(hardware.replacementForecast).sort(([a], [b]) => Number(a) - Number(b)).map(([year, d]) => (
                            <div key={year} style={{ textAlign: 'center', padding: 16, background: year === String(new Date().getFullYear()) ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid var(--glass-border)' }}>
                                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: year === String(new Date().getFullYear()) ? '#ef4444' : '#e2e8f0' }}>{year}</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#6366f1', margin: '4px 0' }}>{d.count}</div>
                                <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{t('itAnalytics.assetsEol', 'assets EOL')}</div>
                                <div style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: 600 }}>~${Math.round(d.estCost / 1000)}k {t('itAnalytics.estCostSuffix', 'est.')}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
