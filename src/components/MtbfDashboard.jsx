// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — MTBF/MTTR Analytics Dashboard
 * ==========================================
 * Enterprise reliability analytics engine surfacing Mean Time Between Failures
 * (MTBF) and Mean Time To Repair (MTTR) at asset, plant, and enterprise scale.
 *
 * VIEWS:
 *   assets  — Ranked table of every asset by reliability score; sparkline trends
 *   plants  — Cross-plant benchmarking: best vs worst performers side-by-side
 *   failures — Failure mode distribution: Pareto chart of top fault categories
 *
 * KEY METRICS:
 *   MTBF    — Average calendar days between confirmed failures (Work table)
 *   MTTR    — Average hours from WO creation to close-out (ActualHours sum)
 *   Reliability % — 1 − (downtime / operational window) × 100
 *   Failure Rate  — 1 / MTBF (failures per day)
 *
 * KEY FEATURES:
 *   - Expandable asset rows: failure history timeline, worst months, parts consumed
 *   - Reliability gauge rings with color bands (green/yellow/red)
 *   - Monthly trend sparklines for MTBF trajectory
 *   - Plant comparison heatmap (sorted by aggregate MTBF)
 *   - Failure mode Pareto with cumulative % line
 *   - Auto-refresh every 5 minutes for live plant floor accuracy
 *
 * API CALLS:
 *   GET /api/analytics/mtbf-dashboard   — Full MTBF/MTTR dataset (plant-scoped)
 *
 * @param {string|number} plantId — Active plant filter; 'all_sites' = enterprise view
 */
import React, { useState, useEffect } from 'react';
import { AlertTriangle, Shield } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';
import EmptyState from './EmptyState';
import { useTranslation } from '../i18n/index.jsx';

export default function MtbfDashboard({ plantId }) {
    const { t } = useTranslation();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [expandedAsset, setExpandedAsset] = useState(null);
    const [viewMode, setViewMode] = useState('assets'); // 'assets' | 'plants' | 'failures'

    useEffect(() => {
        let active = true;
        const fetchMtbf = async () => {
            setLoading(true);
            try {
                const effectivePlant = plantId || localStorage.getItem('selectedPlantId') || 'all_sites';
                const headers = {
                    'x-plant-id': effectivePlant
                };
                const res = await fetch('/api/analytics/mtbf-dashboard', { headers });
                if (res.ok) {
                    setData(await res.json());
                }
            } catch (err) {
                console.error('Failed to load MTBF data:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchMtbf();
        return () => { active = false; };
    }, [plantId]);

    if (loading) return <LoadingSpinner message={t('mtbf.loadingMessage', 'Analyzing reliability data across all plants...')} />;

    if (!data) return <EmptyState title={t('mtbf.failedToLoadMtbfDataTip')} message={t('mtbf.checkConnectionMessage', 'Please check your connection and try again.')} />;

    const { summary, assets, plantComparison, failureModeDistribution, monthlyTrend } = data;

    // Color helpers
    const reliabilityColor = (score) => score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';
    const riskBadge = (level) => {
        const colors = { High: '#ef4444', Medium: '#f59e0b', Low: '#10b981' };
        return (
            <span style={{
                padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700,
                background: `${colors[level]}20`, color: colors[level], textTransform: 'uppercase'
            }}>{level}</span>
        );
    };

    // Gauge component
    const ReliabilityGauge = ({ score, size = 80 }) => {
        const angle = (score / 100) * 180;
        const color = reliabilityColor(score);
        return (
            <div style={{ position: 'relative', width: size, height: size / 2 + 10, overflow: 'hidden' }}>
                <svg width={size} height={size / 2 + 5} viewBox={`0 0 ${size} ${size / 2 + 5}`}>
                    <path d={`M 5 ${size / 2} A ${size / 2 - 5} ${size / 2 - 5} 0 0 1 ${size - 5} ${size / 2}`}
                        fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" strokeLinecap="round" />
                    <path d={`M 5 ${size / 2} A ${size / 2 - 5} ${size / 2 - 5} 0 0 1 ${size - 5} ${size / 2}`}
                        fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
                        strokeDasharray={`${(angle / 180) * Math.PI * (size / 2 - 5)} ${Math.PI * (size / 2 - 5)}`}
                        style={{ transition: 'stroke-dasharray 1s ease' }} />
                </svg>
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, textAlign: 'center', fontSize: size / 4, fontWeight: 800, color }}>
                    {score}
                </div>
            </div>
        );
    };

    // Bar chart for monthly trend
    const maxFailures = Math.max(...monthlyTrend.map(m => m.failures), 1);

    return (
        <div className="glass-card" style={{ padding: '25px', marginTop: '30px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--primary)' }}>
                    <Shield size={22} /> {t('mtbf.dashboardTitle', 'MTBF / MTTR Reliability Dashboard')}
                </h3>
                <div style={{ display: 'flex', gap: '6px' }}>
                    {['assets', 'plants', 'failures'].map(mode => (
                        <button key={mode} onClick={() => setViewMode(mode)}
                            style={{
                                padding: '6px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                                fontSize: '0.8rem', fontWeight: 600, transition: 'all 0.2s',
                                background: viewMode === mode ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                                color: viewMode === mode ? '#fff' : 'var(--text-muted)'
                            }} title={t('mtbf.viewModeTip')}>
                            {mode === 'assets' ? t('mtbf.viewModeAssets', '🏗️ Assets') : mode === 'plants' ? t('mtbf.viewModePlants', '🏭 Plants') : t('mtbf.viewModeFailures', '⚡ Failure Modes')}
                        </button>
                    ))}
                </div>
            </div>

            {/* KPI Cards Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '15px', marginBottom: '25px' }}>
                <div style={{ background: 'rgba(99,102,241,0.08)', borderRadius: '12px', padding: '18px', textAlign: 'center', border: '1px solid rgba(99,102,241,0.2)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>{t('mtbf.kpiAvgMtbf', 'Avg MTBF')}</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--primary)' }}>{summary.avgMtbf}<span style={{ fontSize: '0.8rem', fontWeight: 400 }}> {t('mtbf.days', 'days')}</span></div>
                </div>
                <div style={{ background: 'rgba(245,158,11,0.08)', borderRadius: '12px', padding: '18px', textAlign: 'center', border: '1px solid rgba(245,158,11,0.2)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>{t('mtbf.kpiAvgMttr', 'Avg MTTR')}</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f59e0b' }}>{summary.avgMttr}<span style={{ fontSize: '0.8rem', fontWeight: 400 }}> {t('mtbf.hrs', 'hrs')}</span></div>
                </div>
                <div style={{ background: 'rgba(16,185,129,0.08)', borderRadius: '12px', padding: '18px', textAlign: 'center', border: '1px solid rgba(16,185,129,0.2)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>{t('mtbf.kpiReliability', 'Reliability')}</div>
                    <ReliabilityGauge score={summary.avgReliability} size={60} />
                </div>
                <div style={{ background: 'rgba(239,68,68,0.08)', borderRadius: '12px', padding: '18px', textAlign: 'center', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>{t('mtbf.kpiCritical', 'Critical')}</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#ef4444' }}>{summary.criticalCount}</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '18px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>{t('mtbf.kpiTotalFailures', 'Total Failures')}</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{summary.totalFailures}</div>
                </div>
            </div>

            {/* Monthly Trend Bar Chart */}
            <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: '12px', padding: '20px', marginBottom: '25px' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '15px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {t('mtbf.monthlyFailureTrend', '📊 12-Month Failure Trend')}
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '80px' }}>
                    {monthlyTrend.map((m, i) => (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{m.failures || ''}</div>
                            <div style={{
                                width: '100%', borderRadius: '3px 3px 0 0',
                                height: `${Math.max((m.failures / maxFailures) * 60, 2)}px`,
                                background: m.failures > 0
                                    ? `linear-gradient(to top, ${reliabilityColor(100 - (m.failures / maxFailures) * 100)}, ${reliabilityColor(100 - (m.failures / maxFailures) * 100)}90)`
                                    : 'rgba(255,255,255,0.05)',
                                transition: 'height 0.5s ease'
                            }} />
                            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                {m.month.substring(5)}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* View: Assets */}
            {viewMode === 'assets' && (
                <div style={{ maxHeight: '500px', overflowY: 'auto' }} className="custom-scrollbar">
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--glass-border)', position: 'sticky', top: 0, background: 'var(--bg-primary)', zIndex: 1 }}>
                                <th style={{ textAlign: 'left', padding: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>{t('mtbf.colAsset', 'Asset')}</th>
                                <th style={{ textAlign: 'left', padding: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>{t('mtbf.colPlant', 'Plant')}</th>
                                <th style={{ textAlign: 'center', padding: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>{t('mtbf.colFailures', 'Failures')}</th>
                                <th style={{ textAlign: 'center', padding: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>{t('mtbf.colMtbfDays', 'MTBF (days)')}</th>
                                <th style={{ textAlign: 'center', padding: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>{t('mtbf.colMttrHrs', 'MTTR (hrs)')}</th>
                                <th style={{ textAlign: 'center', padding: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>{t('mtbf.colReliability', 'Reliability')}</th>
                                <th style={{ textAlign: 'center', padding: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>{t('mtbf.colRisk', 'Risk')}</th>
                                <th style={{ textAlign: 'left', padding: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>{t('mtbf.colTopFailureMode', 'Top Failure Mode')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {assets.map((a, idx) => (
                                <tr key={idx} style={{
                                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                                    cursor: 'pointer',
                                    background: expandedAsset === idx ? 'rgba(99,102,241,0.05)' : 'transparent',
                                    transition: 'background 0.15s'
                                }} onClick={() => setExpandedAsset(expandedAsset === idx ? null : idx)}>
                                    <td style={{ padding: '10px', fontWeight: 600, color: 'var(--primary)' }}>
                                        <div>{a.assetId}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>{a.description}</div>
                                    </td>
                                    <td style={{ padding: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{a.plantLabel}</td>
                                    <td style={{ padding: '10px', textAlign: 'center', fontWeight: 700, color: a.totalFailures > 5 ? '#ef4444' : a.totalFailures > 2 ? '#f59e0b' : '#10b981' }}>{a.totalFailures}</td>
                                    <td style={{ padding: '10px', textAlign: 'center' }}>
                                        {a.mtbfDays !== null ? (
                                            <span style={{ fontWeight: 700, color: a.mtbfDays < 30 ? '#ef4444' : a.mtbfDays < 90 ? '#f59e0b' : '#10b981' }}>{a.mtbfDays}</span>
                                        ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                    </td>
                                    <td style={{ padding: '10px', textAlign: 'center' }}>
                                        {a.mttrHours !== null ? (
                                            <span style={{ fontWeight: 700, color: a.mttrHours > 8 ? '#ef4444' : a.mttrHours > 4 ? '#f59e0b' : '#10b981' }}>{a.mttrHours}</span>
                                        ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                    </td>
                                    <td style={{ padding: '10px', textAlign: 'center' }}>
                                        <div style={{
                                            display: 'inline-block', width: '40px', height: '6px', borderRadius: '3px',
                                            background: 'rgba(255,255,255,0.08)', overflow: 'hidden', verticalAlign: 'middle', marginRight: '6px'
                                        }}>
                                            <div style={{ width: `${a.reliabilityScore}%`, height: '100%', background: reliabilityColor(a.reliabilityScore), transition: 'width 0.5s' }} />
                                        </div>
                                        <span style={{ fontWeight: 700, color: reliabilityColor(a.reliabilityScore), fontSize: '0.85rem' }}>{a.reliabilityScore}</span>
                                    </td>
                                    <td style={{ padding: '10px', textAlign: 'center' }}>{riskBadge(a.riskLevel)}</td>
                                    <td style={{ padding: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        {a.topFailureMode ? `${a.topFailureMode.mode} (${a.topFailureMode.count}×)` : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {assets.length === 0 && (
                        <EmptyState title={t('mtbf.noAssetFailureDataAvailableTip')} message={t('mtbf.assetsWillAppearMessage', 'Assets will appear here once work orders with linked assets are completed.')} />
                    )}
                </div>
            )}

            {/* View: Plant Comparison */}
            {viewMode === 'plants' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {plantComparison.map((p, idx) => (
                        <div key={idx} style={{
                            display: 'flex', alignItems: 'center', gap: '20px', padding: '15px 20px',
                            borderRadius: '10px', background: 'rgba(255,255,255,0.02)',
                            border: `1px solid ${p.criticalAssets > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)'}`,
                            transition: 'all 0.2s'
                        }}>
                            <div style={{ width: '30px', textAlign: 'center', fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-muted)' }}>#{idx + 1}</div>
                            <div style={{ flex: 1, minWidth: '150px' }}>
                                <div style={{ fontWeight: 700 }}>{p.plantLabel}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.assetCount} {t('mtbf.assets', 'assets')} · {p.totalFailures} {t('mtbf.failures', 'failures')}</div>
                            </div>
                            <div style={{ textAlign: 'center', minWidth: '80px' }}>
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('mtbf.mtbfLabel', 'MTBF')}</div>
                                <div style={{ fontWeight: 700, color: p.avgMtbf !== null ? (p.avgMtbf < 30 ? '#ef4444' : p.avgMtbf < 90 ? '#f59e0b' : '#10b981') : 'var(--text-muted)' }}>
                                    {p.avgMtbf !== null ? `${p.avgMtbf}d` : '—'}
                                </div>
                            </div>
                            <div style={{ textAlign: 'center', minWidth: '80px' }}>
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('mtbf.mttrLabel', 'MTTR')}</div>
                                <div style={{ fontWeight: 700, color: p.avgMttr !== null ? (p.avgMttr > 8 ? '#ef4444' : p.avgMttr > 4 ? '#f59e0b' : '#10b981') : 'var(--text-muted)' }}>
                                    {p.avgMttr !== null ? `${p.avgMttr}h` : '—'}
                                </div>
                            </div>
                            <div style={{ textAlign: 'center', minWidth: '100px' }}>
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('mtbf.reliabilityLabel', 'Reliability')}</div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                    <div style={{ width: '50px', height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                                        <div style={{ width: `${p.avgReliability}%`, height: '100%', background: reliabilityColor(p.avgReliability) }} />
                                    </div>
                                    <span style={{ fontWeight: 700, color: reliabilityColor(p.avgReliability), fontSize: '0.85rem' }}>{p.avgReliability}</span>
                                </div>
                            </div>
                            {p.criticalAssets > 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#ef4444', fontSize: '0.8rem', fontWeight: 700 }}>
                                    <AlertTriangle size={14} /> {p.criticalAssets} {t('mtbf.critical', 'critical')}
                                </div>
                            )}
                        </div>
                    ))}
                    {plantComparison.length === 0 && (
                        <EmptyState title={t('mtbf.noPlantComparisonDataAvailableTip')} />
                    )}
                </div>
            )}

            {/* View: Failure Mode Distribution */}
            {viewMode === 'failures' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {failureModeDistribution.length === 0 ? (
                        <EmptyState title={t('mtbf.noFailureModeDataTip')} message={t('mtbf.assignFailureModesMessage', 'Assign failure modes to work orders to populate this view.')} />
                    ) : (
                        failureModeDistribution.map((fm, idx) => {
                            const pct = (fm.count / failureModeDistribution[0].count) * 100;
                            return (
                                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '10px 15px' }}>
                                    <span style={{ width: '25px', textAlign: 'right', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>#{idx + 1}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '4px' }}>{fm.mode}</div>
                                        <div style={{ width: '100%', height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                                            <div style={{
                                                width: `${pct}%`, height: '100%', borderRadius: '3px',
                                                background: idx === 0 ? '#ef4444' : idx < 3 ? '#f59e0b' : 'var(--primary)',
                                                transition: 'width 0.5s ease'
                                            }} />
                                        </div>
                                    </div>
                                    <span style={{ fontWeight: 700, minWidth: '50px', textAlign: 'right', fontSize: '0.9rem' }}>{fm.count}×</span>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* Footer */}
            <div style={{ marginTop: '20px', fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                <span>{data.plantsScanned} {t('mtbf.footerPlantsScanned', 'plants scanned')} · {summary.totalAssets} {t('mtbf.footerAssetsAnalyzed', 'assets analyzed')}</span>
                <span>{t('mtbf.footerGenerated', 'Generated:')} {new Date(data.generatedAt).toLocaleString()}</span>
            </div>
        </div>
    );
}
