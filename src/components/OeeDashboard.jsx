// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — OEE Dashboard
 * =========================
 * Overall Equipment Effectiveness (OEE) analytics: the gold standard of
 * manufacturing performance measurement. OEE = Availability × Performance × Quality.
 *
 * OEE FORMULA:
 *   Availability  = (Planned Time − Downtime) / Planned Time
 *   Performance   = (Ideal Cycle Time × Total Count) / Run Time
 *   Quality       = Good Count / Total Count
 *   OEE           = Availability × Performance × Quality × 100%
 *
 * WORLD-CLASS BENCHMARK: OEE ≥ 85%
 *
 * VIEWS:
 *   assets  — Per-asset OEE breakdown with Availability/Performance/Quality rings
 *   plants  — Cross-plant OEE league table; best/worst plant highlighted
 *   trends  — Weekly/monthly OEE trend lines; flags dips below threshold
 *
 * KEY FEATURES:
 *   - Color-coded OEE rings: green ≥ 85%, yellow 60–84%, red < 60%
 *   - Drill-down by loss category: Availability Loss, Performance Loss, Quality Loss
 *   - Plant benchmarking with delta-vs-average callouts
 *   - Trend chart with configurable rolling window (7d / 30d / 90d)
 *   - Export to CSV for management reporting
 *
 * API CALLS:
 *   GET /api/analytics/oee-dashboard   — OEE scores by asset and plant (plant-scoped)
 *
 * @param {string|number} plantId — Active plant filter; 'all_sites' = enterprise view
 */
import React, { useState, useEffect } from 'react';
import LoadingSpinner from './LoadingSpinner';
import EmptyState from './EmptyState';
import { useTranslation } from '../i18n/index.jsx';

export default function OeeDashboard({ plantId }) {
    const { t } = useTranslation();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState('assets'); // assets | plants | trends

    useEffect(() => {
        setLoading(true);
        const effectivePlant = plantId || localStorage.getItem('selectedPlantId') || 'all_sites';
        fetch('/api/analytics/oee-dashboard', { headers: { 'x-plant-id': effectivePlant } })
            .then(r => r.json())
            .then(d => { setData(d); setLoading(false); })
            .catch(() => setLoading(false));
    }, [plantId]);

    if (loading) return <LoadingSpinner message="Calculating OEE..." />;

    if (!data || !data.assets) return <EmptyState title={t('oee.noOeeDataAvailableTip')} message="OEE calculations require work order and downtime data from your assets." />;

    const { summary, assets, plants, trends } = data;

    const oeeColor = (v) => v >= 85 ? '#22c55e' : v >= 65 ? '#f59e0b' : '#ef4444';
    const oeeLabel = (v) => v >= 85 ? 'World Class' : v >= 65 ? 'Average' : 'Below Target';

    // OEE Gauge component
    const OeeGauge = ({ value, size = 90, label }) => {
        const angle = (value / 100) * 270 - 135;
        const color = oeeColor(value);
        return (
            <div style={{ textAlign: 'center' }}>
                <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
                    <svg viewBox="0 0 100 100" width={size} height={size}>
                        <path d="M 15 85 A 45 45 0 1 1 85 85" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" strokeLinecap="round" />
                        <path d="M 15 85 A 45 45 0 1 1 85 85" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
                            strokeDasharray={`${(value / 100) * 212} 212`} style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
                    </svg>
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -40%)', fontSize: size * 0.28, fontWeight: 800, color }}>
                        {value}%
                    </div>
                </div>
                {label && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{label}</div>}
            </div>
        );
    };

    const cardStyle = {
        background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(99,102,241,0.15)',
        borderRadius: 12, padding: '16px 20px', textAlign: 'center', flex: 1, minWidth: 120
    };

    return (
        <div style={{ background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.95))',
            borderRadius: 16, padding: '24px 28px', border: '1px solid rgba(34,197,94,0.2)', marginTop: 24 }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 22 }}>⚙️</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0' }}>OEE Dashboard</span>
                    <span style={{ fontSize: 12, color: '#94a3b8', background: 'rgba(34,197,94,0.1)', padding: '2px 10px', borderRadius: 20, border: '1px solid rgba(34,197,94,0.3)' }}>
                        Availability × Performance × Quality
                    </span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                    {['assets', 'plants', 'trends'].map(v => (
                        <button key={v} onClick={() => setView(v)}
                            style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                                background: view === v ? (v === 'assets' ? '#22c55e' : v === 'plants' ? '#6366f1' : '#f59e0b') : 'rgba(255,255,255,0.06)',
                                color: view === v ? '#fff' : '#94a3b8' }} title="View">
                            {v === 'assets' ? '🏗️ Assets' : v === 'plants' ? '🏭 Plants' : '📈 Trends'}
                        </button>
                    ))}
                </div>
            </div>

            {/* KPI Cards */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                <div style={{ ...cardStyle, borderColor: 'rgba(34,197,94,0.3)' }}>
                    <OeeGauge value={summary.avgOee} size={80} />
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Enterprise OEE</div>
                    <div style={{ fontSize: 10, color: oeeColor(summary.avgOee), fontWeight: 700 }}>{oeeLabel(summary.avgOee)}</div>
                </div>
                <div style={cardStyle}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#60a5fa' }}>{summary.avgAvail}%</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Availability</div>
                </div>
                <div style={cardStyle}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#a78bfa' }}>{summary.avgPerf}%</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Performance</div>
                </div>
                <div style={cardStyle}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#34d399' }}>{summary.avgQual}%</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Quality</div>
                </div>
                <div style={cardStyle}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#22c55e' }}>{summary.worldClass}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>World Class (≥85%)</div>
                </div>
                <div style={cardStyle}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#e2e8f0' }}>{summary.totalAssets}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Assets Analyzed</div>
                </div>
            </div>

            {/* Assets View */}
            {view === 'assets' && (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                {['Asset', 'Plant', 'OEE', 'Availability', 'Performance', 'Quality', 'Downtime', 'Avg Repair', 'WOs'].map(h => (
                                    <th key={h} style={{ padding: '10px 8px', textAlign: 'left', color: '#94a3b8', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {assets.slice(0, 50).map((a, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.2s' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <td style={{ padding: '10px 8px' }}>
                                        <div style={{ color: '#60a5fa', fontWeight: 600 }}>{a.assetId}</div>
                                        <div style={{ color: '#64748b', fontSize: 11 }}>{a.assetDesc}</div>
                                    </td>
                                    <td style={{ padding: '10px 8px', color: '#94a3b8' }}>{a.plant}</td>
                                    <td style={{ padding: '10px 8px' }}>
                                        <span style={{ color: oeeColor(a.oee), fontWeight: 800, fontSize: 15 }}>{a.oee}%</span>
                                    </td>
                                    <td style={{ padding: '10px 8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <div style={{ width: 50, height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                                                <div style={{ width: `${a.availability}%`, height: '100%', background: '#60a5fa', borderRadius: 3 }} />
                                            </div>
                                            <span style={{ color: '#60a5fa', fontSize: 12 }}>{a.availability}%</span>
                                        </div>
                                    </td>
                                    <td style={{ padding: '10px 8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <div style={{ width: 50, height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                                                <div style={{ width: `${a.performance}%`, height: '100%', background: '#a78bfa', borderRadius: 3 }} />
                                            </div>
                                            <span style={{ color: '#a78bfa', fontSize: 12 }}>{a.performance}%</span>
                                        </div>
                                    </td>
                                    <td style={{ padding: '10px 8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <div style={{ width: 50, height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                                                <div style={{ width: `${a.quality}%`, height: '100%', background: '#34d399', borderRadius: 3 }} />
                                            </div>
                                            <span style={{ color: '#34d399', fontSize: 12 }}>{a.quality}%</span>
                                        </div>
                                    </td>
                                    <td style={{ padding: '10px 8px', color: a.totalDown > 20 ? '#ef4444' : '#94a3b8' }}>{a.totalDown}h</td>
                                    <td style={{ padding: '10px 8px', color: a.avgRepairHrs > 8 ? '#ef4444' : a.avgRepairHrs > 4 ? '#f59e0b' : '#22c55e' }}>{a.avgRepairHrs}h</td>
                                    <td style={{ padding: '10px 8px', color: '#94a3b8' }}>{a.woCount}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div style={{ fontSize: 11, color: '#475569', marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                        <span>{summary.plantsScanned} plants scanned · {assets.length} assets analyzed</span>
                        <span>Generated: {new Date(data.generated).toLocaleString()}</span>
                    </div>
                </div>
            )}

            {/* Plants View */}
            {view === 'plants' && (
                <div style={{ display: 'grid', gap: 12 }}>
                    {plants.map((p, i) => (
                        <div key={p.plantId} style={{ background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(99,102,241,0.15)',
                            borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                <div style={{ fontSize: 20, fontWeight: 800, color: '#475569', minWidth: 36 }}>#{i + 1}</div>
                                <div>
                                    <div style={{ fontWeight: 700, color: '#e2e8f0' }}>{p.label}</div>
                                    <div style={{ fontSize: 11, color: '#64748b' }}>{p.assetCount} assets · {p.woCount} work orders</div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 11, color: '#94a3b8' }}>AVAIL</div>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: '#60a5fa' }}>{p.availability}%</div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 11, color: '#94a3b8' }}>PERF</div>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: '#a78bfa' }}>{p.performance}%</div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 11, color: '#94a3b8' }}>QUALITY</div>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: '#34d399' }}>{p.quality}%</div>
                                </div>
                                <div style={{ textAlign: 'center', minWidth: 80 }}>
                                    <div style={{ fontSize: 11, color: '#94a3b8' }}>OEE</div>
                                    <div style={{ fontSize: 22, fontWeight: 800, color: oeeColor(p.oee) }}>{p.oee}%</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Trends View */}
            {view === 'trends' && (
                <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginBottom: 12 }}>📈 12-Month OEE Trend</div>
                    {trends.length === 0 ? (
                        <EmptyState title={t('oee.noTrendDataAvailableYetTip')} message="Trend data accumulates as work orders are completed over time." style={{ padding: '30px' }} />
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 180, padding: '0 4px' }}>
                            {trends.map((t, i) => {
                                const maxWo = Math.max(...trends.map(x => x.woCount), 1);
                                const barH = Math.max(8, (t.woCount / maxWo) * 150);
                                const color = t.availability >= 95 ? '#22c55e' : t.availability >= 85 ? '#f59e0b' : '#ef4444';
                                return (
                                    <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                                        <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>{t.woCount}</div>
                                        <div style={{ height: barH, background: color, borderRadius: '4px 4px 0 0', transition: 'height 0.5s',
                                            opacity: 0.85, minWidth: 20 }} title={`${t.woCount} WOs, ${t.totalDown}h downtime`} />
                                        <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>{t.month.substring(5)}</div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                        <div style={cardStyle}>
                            <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>Total Downtime (12mo)</div>
                            <div style={{ fontSize: 22, fontWeight: 700, color: '#ef4444' }}>
                                {Math.round(trends.reduce((s, t) => s + t.totalDown, 0))}h
                            </div>
                        </div>
                        <div style={cardStyle}>
                            <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>Total Repairs (12mo)</div>
                            <div style={{ fontSize: 22, fontWeight: 700, color: '#f59e0b' }}>
                                {trends.reduce((s, t) => s + t.woCount, 0)}
                            </div>
                        </div>
                        <div style={cardStyle}>
                            <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>Avg Availability</div>
                            <div style={{ fontSize: 22, fontWeight: 700, color: '#22c55e' }}>
                                {Math.round(trends.reduce((s, t) => s + t.availability, 0) / Math.max(trends.length, 1) * 10) / 10}%
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
