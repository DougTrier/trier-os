// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Predictive Maintenance Foresight
 * =============================================
 * AI-powered predictive analytics for asset reliability. Surfaces health
 * scores, MTBF trends, predicted failure dates, and risk triage — all
 * derived from the MasterAssetIndex built by the Crawl Engine.
 *
 * PREDICTION MODEL:
 *   Health Score     = weighted composite of MTBF trend, failure recency,
 *                      open WO backlog, and sensor anomaly count (0–100)
 *   Days to Failure  = projected from current MTBF trajectory using
 *                      exponential smoothing over last 12 months of failures
 *   Risk Level       = Critical (<30d) / High (30–90d) / Medium (90–180d) / Low
 *
 * KEY FEATURES:
 *   - Risk-ranked asset list: Critical assets surface first with red callouts
 *   - Predicted failure date with confidence interval band
 *   - MTBF trend sparkline: improving (green arrow) vs declining (red arrow)
 *   - Health score gauge ring with trajectory arrow
 *   - "Show Logic" panel: transparency mode — exposes the exact formula weights
 *     and data inputs used to calculate each asset's score
 *   - Deep-link to Work Orders view to create a pre-emptive PM on any asset
 *   - Plant filter: view predictions per plant or enterprise-wide
 *
 * DATA SOURCES:
 *   GET /api/analytics/predictive-foresight — MasterAssetIndex with scoring
 *
 * @param {string|number} selectedPlant — Active plant filter
 * @param {Function} setActiveTab       — Navigate to another top-level tab
 * @param {Function} setSelectedPlant   — Update plant context from drill-down
 */
import React, { useState, useEffect } from 'react';
import { ShieldAlert, Activity, TrendingDown, TrendingUp, Clock, ChevronRight, AlertTriangle, Info, X, ArrowRight } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';
import LoadingSpinner from './LoadingSpinner';

const PredictiveForesight = ({ selectedPlant, setActiveTab, setSelectedPlant }) => {
    const { t } = useTranslation();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showLogic, setShowLogic] = useState(false);

    useEffect(() => {
        let active = true;
        const fetchData = async () => {
            setLoading(true);
            try {
                const res = await fetch('/api/analytics/predictive', {
                    headers: {  }
                });
                if (!res.ok) {
                    console.warn('Predictive API returned', res.status);
                    setData(null);
                    return;
                }
                const json = await res.json();
                setData(json);
            } catch (err) {
                console.error('Failed to fetch predictive alerts:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
        return () => { active = false; };
    }, [selectedPlant]);

    if (loading) return (
        <div className="glass-card" style={{ padding: '20px', textAlign: 'center' }}>
            <Activity className="animate-pulse" size={40} color="var(--primary)" />
            <p>{t('predictive.foresight.scanningMaintenancePatterns')}</p>
        </div>
    );

    const filteredAssets = (data?.assets || []).filter(a => selectedPlant === 'all_sites' || a.plantId === selectedPlant);

    if (!data) return null;

    // Helper: Calculate days until predicted failure
    const getDaysUntilFailure = (predictedDate) => {
        if (!predictedDate) return null;
        const predicted = new Date(predictedDate);
        const now = new Date();
        return Math.round((predicted - now) / (1000 * 60 * 60 * 24));
    };

    // Helper: Get trend icon and color
    const getTrendDisplay = (trend) => {
        if (trend === 'worsening') return { icon: <TrendingDown size={14} />, color: '#ef4444', label: 'Worsening' };
        if (trend === 'improving') return { icon: <TrendingUp size={14} />, color: '#10b981', label: 'Improving' };
        return { icon: <ArrowRight size={14} />, color: 'var(--text-muted)', label: 'Stable' };
    };

    return (
        <div className="glass-card" style={{ padding: '0', overflow: 'hidden', borderLeft: '4px solid #ef4444' }}>
            <div style={{ background: 'rgba(239, 68, 68, 0.05)', padding: '15px 20px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <ShieldAlert color="#ef4444" size={24} />
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {t('predictive.foresight.predictiveRiskAlerts')}
                            <button 
                                onClick={(e) => { e.stopPropagation(); setShowLogic(true); }}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                                title={t('predictive.foresight.howIsThisCalculated')}
                            >
                                <Info size={14} />
                            </button>
                        </h3>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('predictive.foresight.mtbfdrivenReliabilityForecaster')}</p>
                    </div>
                </div>
                {selectedPlant === 'all_sites' && data.stats && (
                    <div style={{ display: 'flex', gap: '15px' }}>
                         <div className="stat-pill" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '4px 10px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 'bold', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                            {data.stats.criticalCount} CRITICAL
                        </div>
                        <div className="stat-pill" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', padding: '4px 10px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 'bold', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                            {data.stats.warningCount} AT RISK
                        </div>
                    </div>
                )}
            </div>

            <div style={{ display: filteredAssets.length > 0 ? 'grid' : 'block', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1px', background: 'var(--glass-border)' }}>
                {filteredAssets.length > 0 ? (
                    filteredAssets.slice(0, 4).map((asset, i) => {
                        const daysUntil = getDaysUntilFailure(asset.predictedFailureDate);
                        const trend = getTrendDisplay(asset.mtbfTrend);
                        
                        return (
                        <div 
                            key={i} 
                            style={{ background: '#1a1a25', padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px', cursor: 'pointer' }}
                            onClick={() => {
                                localStorage.setItem('PF_NAV_VIEW', asset.assetId);
                                if (asset.plantId !== selectedPlant) {
                                    setSelectedPlant(asset.plantId);
                                    localStorage.setItem('selectedPlantId', asset.plantId);
                                }
                                setActiveTab('assets');
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px' }}>
                                        {asset.plantLabel} • {asset.assetId}
                                    </div>
                                    <div style={{ fontWeight: 'bold', fontSize: '0.95rem', color: '#fff', marginBottom: '8px' }}>{asset.assetName}</div>
                                </div>
                                <div style={{ 
                                    width: '45px', 
                                    height: '45px', 
                                    borderRadius: '50%', 
                                    border: `3px solid ${asset.healthScore < 40 ? '#ef4444' : '#f59e0b'}`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.85rem',
                                    fontWeight: 'bold',
                                    color: asset.healthScore < 40 ? '#ef4444' : '#f59e0b',
                                    background: 'rgba(0,0,0,0.2)'
                                }} title={t('predictive.foresight.assetHealthScore0100')}>
                                    {asset.healthScore}
                                </div>
                            </div>

                            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: asset.riskLevel === 'High' ? '#ef4444' : '#f59e0b', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '4px' }}>
                                    <AlertTriangle size={14} /> {asset.riskLevel === 'High' ? 'HIGH RISK' : 'MEDIUM RISK'}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: '#ddd', lineHeight: '1.4' }}>
                                    {asset.predictiveAlert}
                                </div>
                            </div>

                            {/* Failure Prediction Bar */}
                            {daysUntil !== null && (
                                <div style={{ 
                                    background: daysUntil <= 7 ? 'rgba(239, 68, 68, 0.1)' : daysUntil <= 30 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(99, 102, 241, 0.1)', 
                                    padding: '8px 12px', 
                                    borderRadius: '8px', 
                                    border: `1px solid ${daysUntil <= 7 ? 'rgba(239, 68, 68, 0.3)' : daysUntil <= 30 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(99, 102, 241, 0.2)'}`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    fontSize: '0.75rem', fontWeight: 'bold'
                                }}>
                                    <span style={{ color: daysUntil <= 7 ? '#ef4444' : daysUntil <= 30 ? '#f59e0b' : '#818cf8' }}>
                                        ⏱ {daysUntil <= 0 ? 'OVERDUE' : `Failure in ${daysUntil} days`}
                                    </span>
                                    {asset.repairCount > 0 && (
                                        <span style={{ color: 'var(--text-muted)' }}>{asset.repairCount} repairs</span>
                                    )}
                                </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 'auto', paddingTop: '10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Clock size={14} /> MTBF: {asset.mtbfDays} Days
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', color: trend.color, marginLeft: '6px' }} title={`${t('predictive.foresight.trend')}: ${trend.label}`}>
                                        {trend.icon}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--primary)' }}>
                                    {t('predictive.foresight.resolve')} <ChevronRight size={14} />
                                </div>
                            </div>
                        </div>
                    );})
                ) : (
                    <div style={{ background: '#1a1a25', padding: '40px', textAlign: 'center', borderTop: '1px solid rgba(16, 185, 129, 0.2)' }}>
                        <div style={{ color: '#10b981', fontSize: '1.2rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '5px' }}>
                            <Activity size={24} /> {t('predictive.foresight.systemStabilityVerified')}
                        </div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
                            MTBF patterns across {selectedPlant === 'all_sites' ? 'all facilities' : 'this plant'} are within normal operating parameters. No predictive failures detected.
                        </p>
                    </div>
                )}
            </div>
            
            {filteredAssets.length > 4 && (
                <div style={{ textAlign: 'center', padding: '10px', background: 'rgba(255,255,255,0.02)', fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid var(--glass-border)' }}>
                    + {filteredAssets.length - 4} additional assets identified as high-risk in maintenance patterns.
                </div>
            )}

            {/* Logic Explanation Modal */}
            {showLogic && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setShowLogic(false)}>
                    <div className="glass-card" style={{ maxWidth: '500px', width: '100%', padding: '30px', position: 'relative', borderTop: '5px solid var(--primary)' }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => setShowLogic(false)} style={{ position: 'absolute', top: '15px', right: '15px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} title={t('predictiveForesight.closeExplanationTip')}>
                            <X size={20} />
                        </button>
                        
                        <h2 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Activity color="var(--primary)" /> {t('predictive.foresight.riskDeterminationLogic')}
                        </h2>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontSize: '0.95rem' }}>
                            <section>
                                <h3 style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '8px' }}>1. Mean Time Between Failures (MTBF)</h3>
                                <p style={{ color: '#ccc', margin: 0 }}>
                                    {t('predictive.foresight.calculatedByMeasuringThe')} <strong>{t('predictive.foresight.corrective')}</strong> {t('predictiveForesight.and')} <strong>{t('predictive.foresight.emergency')}</strong> work orders. 
                                    A decreasing MTBF is the earliest indicator of systemic equipment fatigue.
                                </p>
                            </section>

                            <section>
                                <h3 style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '8px' }}>2. Health Score Calculation</h3>
                                <p style={{ color: '#ccc', margin: 0 }}>
                                    Starts at 100. For every unplanned repair in the last 6 months, the score decays by <strong>15 points</strong>. 
                                    Scores below 60 trigger a "Medium Risk" warning.
                                </p>
                            </section>

                            <section>
                                <h3 style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '8px' }}>3. Criticality Levels</h3>
                                <ul style={{ color: '#ccc', paddingLeft: '20px', margin: '10px 0 0 0' }}>
                                    <li style={{ marginBottom: '8px' }}><strong style={{ color: '#ef4444' }}>{t('predictive.foresight.critical')}</strong> MTBF &lt; 14 days. This asset is failing on a bi-weekly cycle, indicating a chronic issue.</li>
                                    <li><strong style={{ color: '#f59e0b' }}>{t('predictive.foresight.atRisk')}</strong> {t('predictiveForesight.healthScoreLt60Or')}</li>
                                </ul>
                            </section>
                        </div>

                        <button                             className="btn-primary" 
                            style={{ width: '100%', marginTop: '30px', padding: '12px' }}
                            onClick={() => setShowLogic(false)}
                            title={t('predictiveForesight.closeTheRiskLogicExplanationTip')}
                        >
                            {t('predictive.foresight.understood')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PredictiveForesight;
