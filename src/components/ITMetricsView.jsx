// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — IT Metrics: Financial Intelligence Dashboard
 * =========================================================
 * Creator-only financial analytics for the IT Department.
 * Aggregates spend, depreciation, vendor costs, hardware lifecycle
 * stages, upcoming renewals, and warranty coverage status.
 *
 * KEY METRICS:
 *   Total IT Spend      — Cumulative YTD spend across hardware, software, and services
 *   Monthly Depreciation — Straight-line depreciation charge across all IT assets
 *   Upcoming Renewals   — License and warranty renewals due within 90 days
 *   Vendor Cost Rank    — Top 5 vendors by total spend (bar chart)
 *   Lifecycle Mix       — New / Active / EOL / Retired asset count and spend %
 *   Warranty Coverage % — % of hardware assets still under active warranty
 *
 * KEY FEATURES:
 *   - KPI tile row with delta indicators (ArrowUpRight / ArrowDownRight)
 *   - Vendor spend bar chart: top 10 vendors ranked by total cost
 *   - Lifecycle donut chart: asset count by stage with spend per stage
 *   - Renewal calendar: list of upcoming license/warranty expirations (30/60/90d)
 *   - Print report: formatted financial summary for budget review
 *
 * API CALLS:
 *   GET /api/it/metrics   — Full IT financial metrics dataset
 */
import React, { useState, useEffect, useMemo } from 'react';
import { DollarSign, TrendingDown, Package, Monitor, ShieldCheck, AlertTriangle, BarChart3, RefreshCw, Calendar, FileText, ArrowUpRight, ArrowDownRight, Printer, Key, Wifi, MapPin, HardHat } from 'lucide-react';
import { printRecord, infoGridHTML, tableHTML } from '../utils/printRecord';
import { useTranslation } from '../i18n/index.jsx';

const API = (path, opts = {}) => fetch('/api/it' + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers }
});

const fmt = (v) => v >= 1000000 ? '$' + (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? '$' + (v / 1000).toFixed(1) + 'K' : '$' + v.toFixed(0);
const fmtFull = (v) => '$' + Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function MetricCard({ icon: Icon, label, value, sub, color, trend, trendLabel }) {
    return (
        <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 16, padding: '20px 24px',
            display: 'flex', flexDirection: 'column', gap: 8,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                    width: 38, height: 38, borderRadius: 10,
                    background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <Icon size={20} color={color} />
                </div>
                <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.02em' }}>{value}</div>
            {sub && <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{sub}</div>}
            {trend !== undefined && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', fontWeight: 600, color: trend >= 0 ? '#10b981' : '#ef4444' }}>
                    {trend >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {Math.abs(trend)}% {trendLabel || 'vs last year'}
                </div>
            )}
        </div>
    );
}

function BarChart({ data, label, valueKey, labelKey, color, height = 200 }) {
    const max = Math.max(...data.map(d => d[valueKey] || 0), 1);
    return (
        <div style={{ height, display: 'flex', alignItems: 'flex-end', gap: 4, padding: '0 4px' }}>
            {data.map((d, i) => {
                const val = d[valueKey] || 0;
                const barH = Math.max((val / max) * (height - 30), 2);
                return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <div title={fmtFull(val)} style={{
                            width: '100%', maxWidth: 40, height: barH, borderRadius: '4px 4px 0 0',
                            background: val > 0 ? `linear-gradient(180deg, ${color}, ${color}88)` : 'rgba(255,255,255,0.05)',
                            transition: 'height 0.5s ease',
                            cursor: 'default',
                        }} />
                        <span style={{ fontSize: '0.55rem', color: '#475569', whiteSpace: 'nowrap' }}>
                            {(d[labelKey] || '').replace(/^\d{4}-/, '')}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

function DonutSegment({ data, colors, size = 160 }) {
    const total = data.reduce((s, d) => s + d.value, 0) || 1;
    const radius = (size - 20) / 2;
    const cx = size / 2, cy = size / 2;
    let cumAngle = -90;
    const segments = data.map((d, i) => {
        const angle = (d.value / total) * 360;
        const startRad = (cumAngle * Math.PI) / 180;
        const endRad = ((cumAngle + angle) * Math.PI) / 180;
        cumAngle += angle;
        const largeArc = angle > 180 ? 1 : 0;
        const x1 = cx + radius * Math.cos(startRad);
        const y1 = cy + radius * Math.sin(startRad);
        const x2 = cx + radius * Math.cos(endRad);
        const y2 = cy + radius * Math.sin(endRad);
        const innerR = radius * 0.6;
        const x3 = cx + innerR * Math.cos(endRad);
        const y3 = cy + innerR * Math.sin(endRad);
        const x4 = cx + innerR * Math.cos(startRad);
        const y4 = cy + innerR * Math.sin(startRad);
        return (
            <path key={i} d={`M${x1},${y1} A${radius},${radius} 0 ${largeArc} 1 ${x2},${y2} L${x3},${y3} A${innerR},${innerR} 0 ${largeArc} 0 ${x4},${y4} Z`}
                fill={colors[i % colors.length]} opacity={0.85}>
                <title>{d.label}: {fmtFull(d.value)}</title>
            </path>
        );
    });
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>{segments}</svg>
    );
}

export default function ITMetricsView({ plantId, plantLabel }) {
    const { t } = useTranslation();
    const [data, setData] = useState(null);
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const isEnterprise = !plantId || plantId === 'all_sites';
    const scopeLabel = isEnterprise ? 'Enterprise (All Sites)' : (plantLabel || plantId || '').replace(/_/g, ' ');

    const fetchMetrics = () => {
        setLoading(true);
        const q = plantId ? '?plant=' + encodeURIComponent(plantId) : '';
        Promise.all([
            API('/metrics' + q).then(r => r.json()),
            API('/analytics' + q).then(r => r.json()).catch(e => { console.warn('[ITMetricsView] fetch error:', e); return null; }),
        ]).then(([d, a]) => { setData(d); setAnalytics(a); setLoading(false); }).catch(() => setLoading(false));
    };
    useEffect(() => { fetchMetrics(); }, [plantId]);

    if (loading) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, color: '#64748b' }}>
            <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} /> <span style={{ marginLeft: 10 }}>Loading IT financial intelligence...</span>
        </div>
    );
    if (!data) return <div style={{ color: '#ef4444', padding: 40 }}>Failed to load metrics data.</div>;

    const spend = data.spendByCategory || {};
    const dep = data.depreciation || {};
    const lc = data.lifecycle || {};
    const ren = data.renewals || {};
    const vend = data.vendors || {};
    const war = data.warranty || {};
    const donutData = [
        { label: 'Hardware', value: spend.hardware || 0 },
        { label: 'Infrastructure', value: spend.infrastructure || 0 },
        { label: 'Mobile', value: spend.mobile || 0 },
        { label: 'Software (Annual)', value: spend.softwareRenewals || 0 },
    ].filter(d => d.value > 0);
    const donutColors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

    const vendorDonutData = Object.entries(vend.byCategory || {}).map(([k, v]) => ({ label: k, value: v })).filter(d => d.value > 0);
    const vendorColors = ['#6366f1', '#ec4899', '#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#3b82f6'];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '0 8px', maxWidth: 1400, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                        width: 44, height: 44, borderRadius: 12,
                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <BarChart3 size={24} color="#fff" />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 10 }}>
                            IT Financial Intelligence
                            <span style={{
                                fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.04em',
                                padding: '3px 10px', borderRadius: 20,
                                background: isEnterprise ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)',
                                color: isEnterprise ? '#f59e0b' : '#10b981',
                                border: '1px solid ' + (isEnterprise ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.3)'),
                            }}>
                                {isEnterprise ? '🏢 CORPORATE' : '🏭 ' + scopeLabel}
                            </span>
                        </h1>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
                            {isEnterprise ? 'Enterprise-wide' : scopeLabel} capital spend, depreciation, vendor costs, and lifecycle analytics
                        </p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button title={t('itMetrics.navigateTip')} className="btn-nav" onClick={() => {
                        if (!data) return;
                        const s = data.spendByCategory || {};
                        const d = data.depreciation || {};
                        const l = data.lifecycle || {};
                        const r = data.renewals || {};
                        const v = data.vendors || {};
                        const w = data.warranty || {};

                        let html = '';

                        // KPI Summary
                        html += '<div class="section-header">Financial Summary</div>';
                        html += infoGridHTML([
                            ['Total CapEx', fmtFull(s.totalCapex || 0)],
                            ['Annual OpEx (Software)', fmtFull(s.totalOpex || 0)],
                            ['Current Book Value', fmtFull(d.totalBookValue || 0)],
                            ['Original Cost', fmtFull(d.totalOriginalCost || 0)],
                            ['Accumulated Depreciation', fmtFull(d.totalAccumDep || 0)],
                            ['Monthly Depreciation', fmtFull(d.totalMonthlyExp || 0)],
                            ['Vendor Contracts (Annual)', fmtFull(v.totalAnnualCost || 0)],
                            ['Active Contracts', String((v.costs || []).length)],
                            ['Assets Added (YTD)', String(l.addedThisYear || 0)],
                            ['Assets Retired (YTD)', String(l.retiredThisYear || 0)],
                            ['Growth Rate', (l.growthRate || 0) + '% vs last year'],
                            ['Renewals Due (12 mo)', String(r.count || 0) + ' — ' + fmtFull(r.totalCost || 0)],
                        ]);

                        // Spend by Category
                        html += '<div class="section-header">Spend by Category</div>';
                        html += tableHTML(
                            ['Category', 'Spend'],
                            [
                                ['Hardware', fmtFull(s.hardware || 0)],
                                ['Infrastructure', fmtFull(s.infrastructure || 0)],
                                ['Mobile', fmtFull(s.mobile || 0)],
                                ['Software (Annual Renewals)', fmtFull(s.softwareRenewals || 0)],
                            ]
                        );

                        // Monthly Purchase Trend
                        const trend = data.purchaseTrend || [];
                        if (trend.length > 0) {
                            html += '<div class="section-header">Monthly Purchase Trend (12 Months)</div>';
                            html += tableHTML(
                                ['Month', 'CapEx Spend'],
                                trend.map(row => [row.month, fmtFull(row.spend)])
                            );
                        }

                        // Depreciation by Category
                        html += '<div class="section-header">Depreciation by Category</div>';
                        html += tableHTML(
                            ['Category', 'Count', 'Original Cost', 'Book Value', 'Depreciation %'],
                            Object.entries(d.byCategory || {}).map(([cat, cd]) => {
                                const pct = cd.originalCost > 0 ? Math.round(((cd.originalCost - cd.bookValue) / cd.originalCost) * 100) : 0;
                                return [cat.charAt(0).toUpperCase() + cat.slice(1), String(cd.count), fmtFull(cd.originalCost), fmtFull(cd.bookValue), pct + '%'];
                            })
                        );

                        // Vendor Contract Costs
                        if ((v.costs || []).length > 0) {
                            html += '<div class="section-header">Vendor Contract Costs (' + fmtFull(v.totalAnnualCost) + ' /yr)</div>';
                            html += tableHTML(
                                ['Vendor', 'Category', 'Annual Cost', 'Status'],
                                (v.costs || []).map(vc => [vc.VendorName, vc.Category, fmtFull(vc.AnnualCost), vc.expiringSoon ? '⚠ Expiring' : 'Active'])
                            );
                        }

                        // License Renewal Forecast
                        if ((r.items || []).length > 0) {
                            html += '<div class="section-header">License Renewal Forecast (' + r.count + ' licenses — ' + fmtFull(r.totalCost) + ' total)</div>';
                            html += tableHTML(
                                ['Software', 'Vendor', 'Expiry', 'Seats', 'Renewal Cost'],
                                (r.items || []).map(ri => {
                                    const days = Math.floor((new Date(ri.ExpiryDate) - new Date()) / 86400000);
                                    return [ri.Name, ri.Vendor, ri.ExpiryDate + (days < 90 ? ' (' + days + 'd)' : ''), (ri.SeatsUsed || 0) + '/' + (ri.Seats || 0), fmtFull(ri.RenewalCost)];
                                })
                            );
                        }

                        // Warranty Status
                        html += '<div class="section-header">Warranty Status</div>';
                        html += infoGridHTML([
                            ['Expiring (90 days)', String(w.expiring || 0)],
                            ['Expired', String(w.expired || 0)],
                            ['Total Alerts', String((w.expiring || 0) + (w.expired || 0))],
                        ]);

                        printRecord('IT Financial Intelligence Report', html, {
                            plantLabel: scopeLabel,
                            subtitle: (isEnterprise ? 'Enterprise-wide' : scopeLabel) + ' capital spend, depreciation, vendor costs, and lifecycle analytics.',
                        });
                    }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Printer size={14} /> Print Report
                    </button>
                    <button title={t('itMetrics.navigateTip')} className="btn-nav" onClick={fetchMetrics} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <RefreshCw size={14} /> Refresh
                    </button>
                </div>
            </div>

            {/* ── KPI Cards Row ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
                <MetricCard icon={DollarSign} label="Total CapEx" value={fmt(spend.totalCapex || 0)} sub="Hardware + Infrastructure + Mobile" color="#3b82f6" />
                <MetricCard icon={DollarSign} label="Annual OpEx" value={fmt(spend.totalOpex || 0)} sub="Software license renewals" color="#8b5cf6" />
                <MetricCard icon={TrendingDown} label="Book Value" value={fmt(dep.totalBookValue || 0)} sub={'Original: ' + fmt(dep.totalOriginalCost || 0)} color="#10b981" />
                <MetricCard icon={DollarSign} label="Monthly Depreciation" value={fmt(dep.totalMonthlyExp || 0)} sub="Across all physical IT assets" color="#f59e0b" />
                <MetricCard icon={FileText} label="Vendor Contracts" value={fmt(vend.totalAnnualCost || 0)} sub={(vend.costs || []).length + ' active contracts'} color="#ec4899" />
                <MetricCard icon={Package} label="Assets Added (YTD)" value={String(lc.addedThisYear || 0)} sub={lc.retiredThisYear + ' retired this year'} color="#06b6d4" trend={lc.growthRate} trendLabel="vs last year" />
                <MetricCard icon={Calendar} label="Renewals Due" value={String(ren.count || 0)} sub={'Cost: ' + fmt(ren.totalCost || 0)} color="#f59e0b" />
                <MetricCard icon={ShieldCheck} label="Warranty Alerts" value={String((war.expiring || 0) + (war.expired || 0))} sub={war.expiring + ' expiring · ' + war.expired + ' expired'} color={war.expired > 0 ? '#ef4444' : '#10b981'} />
            </div>

            {/* ── Charts Row ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* Spend Breakdown Donut */}
                <div className="glass-card" style={{ padding: 24 }}>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9' }}>Spend by Category</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                        <DonutSegment data={donutData} colors={donutColors} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                            {donutData.map((d, i) => (
                                <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: 10, height: 10, borderRadius: 3, background: donutColors[i] }} />
                                    <span style={{ fontSize: '0.8rem', color: '#94a3b8', flex: 1 }}>{d.label}</span>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f1f5f9' }}>{fmtFull(d.value)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Purchase Trend Chart */}
                <div className="glass-card" style={{ padding: 24 }}>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9' }}>Monthly Purchase Trend (12 Months)</h3>
                    <BarChart data={data.purchaseTrend || []} valueKey="spend" labelKey="month" color="#3b82f6" height={180} />
                </div>
            </div>

            {/* ── Depreciation Breakdown + Vendor Cost ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* Depreciation by Category */}
                <div className="glass-card" style={{ padding: 24 }}>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9' }}>Depreciation by Category</h3>
                    <table className="data-table" style={{ fontSize: '0.8rem' }}>
                        <thead><tr><th>{t('itMetrics.category')}</th><th>{t('itMetrics.count')}</th><th>{t('itMetrics.originalCost')}</th><th>{t('itMetrics.bookValue')}</th><th>{t('itMetrics.depreciation')}</th></tr></thead>
                        <tbody>
                            {Object.entries(dep.byCategory || {}).map(([cat, d]) => {
                                const pct = d.originalCost > 0 ? Math.round(((d.originalCost - d.bookValue) / d.originalCost) * 100) : 0;
                                return (
                                    <tr key={cat}>
                                        <td style={{ fontWeight: 600, textTransform: 'capitalize' }}>{cat}</td>
                                        <td>{d.count}</td>
                                        <td>{fmtFull(d.originalCost)}</td>
                                        <td style={{ color: '#10b981', fontWeight: 600 }}>{fmtFull(d.bookValue)}</td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
                                                    <div style={{ width: pct + '%', height: '100%', borderRadius: 3, background: pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : '#10b981' }} />
                                                </div>
                                                <span style={{ fontSize: '0.72rem', color: '#94a3b8', minWidth: 36 }}>{pct}%</span>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Vendor Costs */}
                <div className="glass-card" style={{ padding: 24 }}>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9' }}>
                        Vendor Contract Costs <span style={{ fontWeight: 400, color: '#64748b', fontSize: '0.75rem' }}>({fmtFull(vend.totalAnnualCost)} /yr)</span>
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 16 }}>
                        {vendorDonutData.length > 0 && <DonutSegment data={vendorDonutData} colors={vendorColors} size={130} />}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                            {vendorDonutData.map((d, i) => (
                                <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: 8, height: 8, borderRadius: 2, background: vendorColors[i % vendorColors.length] }} />
                                    <span style={{ fontSize: '0.72rem', color: '#94a3b8', flex: 1 }}>{d.label}</span>
                                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#f1f5f9' }}>{fmtFull(d.value)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                        <table className="data-table" style={{ fontSize: '0.75rem' }}>
                            <thead><tr><th>{t('itMetrics.vendor')}</th><th>{t('itMetrics.category')}</th><th>{t('itMetrics.annualCost')}</th><th>{t('itMetrics.status')}</th></tr></thead>
                            <tbody>
                                {(vend.costs || []).map((v, i) => (
                                    <tr key={i}>
                                        <td style={{ fontWeight: 600 }}>{v.VendorName}</td>
                                        <td>{v.Category}</td>
                                        <td style={{ fontWeight: 600 }}>{fmtFull(v.AnnualCost)}</td>
                                        <td>{v.expiringSoon ? <span style={{ color: '#f59e0b', fontWeight: 700 }}>⚠ Expiring</span> : <span style={{ color: '#10b981' }}>Active</span>}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* ── License Renewal Forecast ── */}
            <div className="glass-card" style={{ padding: 24 }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9' }}>
                    License Renewal Forecast <span style={{ fontWeight: 400, color: '#64748b', fontSize: '0.75rem' }}>({ren.count} licenses · {fmtFull(ren.totalCost)} total)</span>
                </h3>
                {(ren.items || []).length === 0 ? (
                    <div style={{ color: '#64748b', fontSize: '0.85rem', padding: 20, textAlign: 'center' }}>No licenses expiring in the next 12 months.</div>
                ) : (
                    <div style={{ maxHeight: 250, overflowY: 'auto' }}>
                        <table className="data-table" style={{ fontSize: '0.8rem' }}>
                            <thead><tr><th>{t('itMetrics.software')}</th><th>{t('itMetrics.vendor')}</th><th>{t('itMetrics.expiry')}</th><th>{t('itMetrics.seats')}</th><th>{t('itMetrics.renewalCost')}</th></tr></thead>
                            <tbody>
                                {(ren.items || []).map((r, i) => {
                                    const days = Math.floor((new Date(r.ExpiryDate) - new Date()) / 86400000);
                                    return (
                                        <tr key={i}>
                                            <td style={{ fontWeight: 600 }}>{r.Name}</td>
                                            <td>{r.Vendor}</td>
                                            <td style={{ color: days < 30 ? '#ef4444' : days < 90 ? '#f59e0b' : '#94a3b8', fontWeight: 600 }}>
                                                {r.ExpiryDate} {days < 30 ? '(' + days + 'd!)' : days < 90 ? '(' + days + 'd)' : ''}
                                            </td>
                                            <td>{r.SeatsUsed || 0}/{r.Seats || 0}</td>
                                            <td style={{ fontWeight: 700 }}>{fmtFull(r.RenewalCost)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ═══════════════ ANALYTICS PANELS (merged from ITAnalytics) ═══════════════ */}
            {analytics && (
                <>
                {/* ── License Utilization + Infrastructure Health ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    {/* License Utilization */}
                    <div className="glass-card" style={{ padding: 24 }}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Key size={16} color="#8b5cf6" /> License Utilization
                            <span style={{ fontWeight: 400, color: '#64748b', fontSize: '0.75rem', marginLeft: 'auto' }}>
                                {analytics.licenses?.overallUtilization || 0}% overall
                            </span>
                        </h3>
                        <div style={{ maxHeight: 220, overflow: 'auto' }}>
                            {(analytics.licenses?.items || []).slice(0, 15).map(l => (
                                <div key={l.Name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{l.Name}</div>
                                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{l.Vendor || ''} — {l.LicenseType}</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: l.utilization > 90 ? '#ef4444' : l.utilization > 70 ? '#f59e0b' : '#10b981' }}>{l.utilization}%</span>
                                        <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{l.SeatsUsed}/{l.Seats}</div>
                                    </div>
                                </div>
                            ))}
                            {!analytics.licenses?.items?.length && <div style={{ color: '#64748b', fontSize: '0.82rem', fontStyle: 'italic', padding: 16, textAlign: 'center' }}>No active licenses</div>}
                        </div>
                    </div>

                    {/* Infrastructure Health */}
                    <div className="glass-card" style={{ padding: 24 }}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Wifi size={16} color="#10b981" /> Infrastructure Health
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                            <div style={{ textAlign: 'center', padding: 14, borderRadius: 12, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                                <div style={{ fontSize: '2rem', fontWeight: 800, color: '#10b981' }}>{analytics.infrastructure?.uptimeRate || 0}%</div>
                                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Uptime Rate</div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr 1fr', gap: 6 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderRadius: 8, background: 'rgba(16,185,129,0.06)' }}>
                                    <span style={{ fontSize: '0.78rem' }}>Online</span><span style={{ fontWeight: 700, color: '#10b981' }}>{analytics.infrastructure?.online || 0}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderRadius: 8, background: 'rgba(239,68,68,0.06)' }}>
                                    <span style={{ fontSize: '0.78rem' }}>Offline</span><span style={{ fontWeight: 700, color: '#ef4444' }}>{analytics.infrastructure?.offline || 0}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderRadius: 8, background: 'rgba(245,158,11,0.06)' }}>
                                    <span style={{ fontSize: '0.78rem' }}>Maintenance</span><span style={{ fontWeight: 700, color: '#f59e0b' }}>{analytics.infrastructure?.maintenance || 0}</span>
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {Object.entries(analytics.infrastructure?.byCriticality || {}).map(([k, v]) => {
                                const colors = { Critical: '#ef4444', High: '#f59e0b', Medium: '#eab308', Low: '#3b82f6' };
                                return v > 0 ? <span key={k} style={{ padding: '3px 10px', borderRadius: 8, fontSize: '0.72rem', fontWeight: 600, background: (colors[k] || '#64748b') + '15', color: colors[k] || '#64748b' }}>{k}: {v}</span> : null;
                            })}
                        </div>
                    </div>
                </div>

                {/* ── Hardware Age + Assets by Plant ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    {/* Hardware Age Distribution */}
                    <div className="glass-card" style={{ padding: 24 }}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Monitor size={16} color="#3b82f6" /> Hardware Lifecycle
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 12 }}>
                            {Object.entries(analytics.hardware?.ageDistribution || {}).map(([range, count]) => {
                                const colors = { '0-1yr': '#10b981', '1-3yr': '#3b82f6', '3-5yr': '#f59e0b', '5yr+': '#ef4444' };
                                return (
                                    <div key={range} style={{ textAlign: 'center', padding: 12, background: (colors[range] || '#64748b') + '10', borderRadius: 10, border: '1px solid ' + (colors[range] || '#64748b') + '30' }}>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: colors[range] }}>{count}</div>
                                        <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{range}</div>
                                    </div>
                                );
                            })}
                        </div>
                        {(analytics.hardware?.refreshCandidates || []).length > 0 && (
                            <div style={{ padding: 10, background: 'rgba(239,68,68,0.06)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)' }}>
                                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#ef4444', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <AlertTriangle size={13} /> {analytics.hardware.refreshCandidates.length} Refresh Candidates
                                </div>
                                <div style={{ maxHeight: 90, overflow: 'auto' }}>
                                    {analytics.hardware.refreshCandidates.slice(0, 6).map(r => (
                                        <div key={r.id} style={{ fontSize: '0.72rem', color: '#fca5a5', padding: '2px 0' }}>{r.name} — {r.age}yr, {r.condition}, {r.percentDepreciated}% dep.</div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Assets by Plant */}
                    <div className="glass-card" style={{ padding: 24 }}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <MapPin size={16} color="#ec4899" /> Assets by Plant
                        </h3>
                        <div style={{ maxHeight: 220, overflow: 'auto' }}>
                            {Object.entries(analytics.assetsByPlant || {}).sort((a, b) => b[1].total - a[1].total).map(([plant, d]) => (
                                <div key={plant} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                    <div style={{ flex: 1, fontSize: '0.82rem', fontWeight: 600 }}>{plant.replace(/_/g, ' ')}</div>
                                    <div style={{ display: 'flex', gap: 10, fontSize: '0.72rem' }}>
                                        <span style={{ color: '#3b82f6' }}>{d.hardware} HW</span>
                                        <span style={{ color: '#10b981' }}>{d.infrastructure} Infra</span>
                                        <span style={{ color: '#f59e0b' }}>{d.mobile} Mob</span>
                                    </div>
                                    <span style={{ fontWeight: 800, fontSize: '0.85rem', color: '#e2e8f0', minWidth: 30, textAlign: 'right' }}>{d.total}</span>
                                </div>
                            ))}
                            {!Object.keys(analytics.assetsByPlant || {}).length && <div style={{ color: '#64748b', fontSize: '0.82rem', fontStyle: 'italic', padding: 16, textAlign: 'center' }}>No asset location data</div>}
                        </div>
                    </div>
                </div>

                {/* ── Replacement Forecast ── */}
                {analytics.hardware?.replacementForecast && Object.keys(analytics.hardware.replacementForecast).length > 0 && (
                    <div className="glass-card" style={{ padding: 24 }}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <HardHat size={16} color="#6366f1" /> Hardware Replacement Forecast
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                            {Object.entries(analytics.hardware.replacementForecast).sort(([a], [b]) => Number(a) - Number(b)).map(([year, d]) => (
                                <div key={year} style={{ textAlign: 'center', padding: 14, background: year === String(new Date().getFullYear()) ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid var(--glass-border)' }}>
                                    <div style={{ fontSize: '1rem', fontWeight: 800, color: year === String(new Date().getFullYear()) ? '#ef4444' : '#e2e8f0' }}>{year}</div>
                                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#6366f1', margin: '4px 0' }}>{d.count}</div>
                                    <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>assets EOL</div>
                                    <div style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 600 }}>~${Math.round(d.estCost / 1000)}k est.</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                </>
            )}

            <div style={{ textAlign: 'center', color: '#1e293b', fontSize: '0.65rem', letterSpacing: '0.1em', padding: '10px 0 20px' }}>
                IT FINANCIAL INTELLIGENCE · {scopeLabel.toUpperCase()} · © {new Date().getFullYear()} TRIER OS
            </div>

            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
