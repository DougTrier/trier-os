// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Enterprise Intelligence
 * ====================================
 * Executive-level fleet performance aggregation across all plants.
 * Surfaces cross-site cost comparisons, asset utilization rates, and
 * enterprise-wide KPIs sourced from the GlobalAssets master index.
 *
 * KEY METRICS:
 *   Asset Utilization %  — Active / Total assets across all plants
 *   Cost Per Asset       — Total maintenance spend ÷ asset count (plant-ranked)
 *   PM Compliance %      — PMs completed on schedule vs total scheduled (enterprise)
 *   MTBF Enterprise Avg  — Average MTBF across all plants; highlights outliers
 *
 * KEY FEATURES:
 *   - Cross-plant league table: plant rankings by cost, compliance, and uptime
 *   - Revenue leakage estimate: enterprise-total bleed from inefficiencies
 *   - Asset utilization rate trend: 12-month rolling view
 *   - Plant drill-down: click any plant row to pivot into that plant's dashboard
 *   - Executive summary export: PDF snapshot of all KPIs for board reporting
 *
 * DATA SOURCES:
 *   GET /api/analytics/enterprise-intelligence   — Enterprise KPI aggregation
 *   Powered by GlobalAssets index from MasterAssetIndex (Crawl Engine)
 */
import React, { useState, useEffect } from 'react';
import { TrendingDown, Clock, Calendar, BadgeDollarSign } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';
import LoadingSpinner from './LoadingSpinner';
import EmptyState from './EmptyState';

export default function EnterpriseIntelligence({ setSelectedPlant, setActiveTab }) {
    const { t } = useTranslation();
    const [insights, setInsights] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/logistics/enterprise-insights', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
        })
        .then(res => res.json())
        .then(data => {
            setInsights(data);
            setLoading(false);
        })
        .catch(err => {
            console.error("Insights load failed", err);
            setLoading(false);
        });
    }, []);

    const handleNavigate = (plantId, type, id) => {
        const targetTab = type === 'asset' ? 'assets' : 'parts';
        localStorage.setItem('PF_NAV_SEARCH', id);
        localStorage.setItem('PF_NAV_VIEW', id);
        localStorage.setItem('selectedPlantId', plantId);
        setSelectedPlant(plantId);
        setActiveTab(targetTab);
    };

    if (loading) return <LoadingSpinner message={t('enterprise.intelligence.aggregatingFleetIntelligence')} />;

    if (!insights) return null;

    const Card = ({ title, icon: Icon, children, accent = 'var(--primary)', count }) => (
        <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px', borderLeft: `4px solid ${accent}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: `${accent}22`, padding: '8px', borderRadius: '10px' }}>
                    <Icon size={20} color={accent} />
                </div>
                <h3 style={{ margin: 0, fontSize: '1rem', letterSpacing: '0.5px' }}>{title}</h3>
                {count > 0 && <span style={{ fontSize: '0.7rem', color: accent, background: `${accent}15`, padding: '2px 8px', borderRadius: '10px', fontWeight: '600' }}>{count}</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto', paddingRight: '4px' }}>
                {children}
            </div>
        </div>
    );

    return (
        <div className="enterprise-intel-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px', marginTop: '20px' }}>
            <Card title={t('enterprise.intelligence.fleetVintageOldestAssets')} icon={Calendar} accent="#3b82f6" count={(insights.oldest || []).length}>
                {(insights.oldest || []).length === 0 && (
                    <EmptyState title={t('enterpriseIntel.noAssetInstallDatesRecordedTip')} style={{ padding: '20px' }} />
                )}
                {(insights.oldest || []).map(a => {
                    const installYear = new Date(a.InstallDate).getFullYear();
                    const age = new Date().getFullYear() - installYear;
                    const isDepreciated = age >= 10;
                    return (
                        <div 
                            key={`oldest-${a.LastSyncFromPlant}-${a.ID}`} 
                            onClick={() => handleNavigate(a.LastSyncFromPlant, 'asset', a.ID)}
                            className="intel-item"
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', padding: '10px 12px', background: isDepreciated ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.02)', borderRadius: '8px', cursor: 'pointer', border: isDepreciated ? '1px solid rgba(239,68,68,0.15)' : '1px solid transparent' }}
                        >
                            <div>
                                <div style={{ fontWeight: '600', color: '#e2e8f0' }}>{a.Description}</div>
                                <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{a.LastSyncFromPlant}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ color: isDepreciated ? '#ef4444' : '#3b82f6', fontWeight: 'bold', fontSize: '1rem' }}>{installYear}</div>
                                {isDepreciated && <div style={{ fontSize: '0.65rem', color: '#ef4444', fontWeight: '600' }}>{age}yr • DEPR</div>}
                            </div>
                        </div>
                    );
                })}
            </Card>

            <Card title={t('enterprise.intelligence.downtimeLeadersLostTime')} icon={TrendingDown} accent="#ef4444" count={(insights.downtime || []).length}>
                {(insights.downtime || []).length === 0 && (
                    <EmptyState title={t('enterpriseIntel.noDowntimeDataRecordedTip')} style={{ padding: '20px' }} />
                )}
                {(insights.downtime || []).map(a => (
                    <div 
                        key={`dt-${a.LastSyncFromPlant}-${a.ID}`} 
                        onClick={() => handleNavigate(a.LastSyncFromPlant, 'asset', a.ID)}
                        className="intel-item"
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', cursor: 'pointer' }}
                    >
                        <div>
                            <div style={{ fontWeight: '600', color: '#e2e8f0' }}>{a.Description}</div>
                            <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{a.LastSyncFromPlant} • {a.FailureCount} Failures</div>
                        </div>
                        <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '1rem' }}>{Math.round(a.CumulativeDowntime)} hrs</div>
                    </div>
                ))}
            </Card>

            <Card title={t('enterprise.intelligence.laborIntensityResources')} icon={Clock} accent="#f59e0b" count={(insights.labor || []).length}>
                {(insights.labor || []).length === 0 && (
                    <EmptyState title={t('enterpriseIntel.noLaborHourDataFoundTip')} message="Labor hours are synced from WorkLabor records during the crawl cycle." style={{ padding: '20px' }} />
                )}
                {(insights.labor || []).map(a => (
                    <div 
                        key={`labor-${a.LastSyncFromPlant}-${a.ID}`} 
                        onClick={() => handleNavigate(a.LastSyncFromPlant, 'asset', a.ID)}
                        className="intel-item"
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', cursor: 'pointer' }}
                    >
                        <div>
                            <div style={{ fontWeight: '600', color: '#e2e8f0' }}>{a.Description}</div>
                            <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{a.LastSyncFromPlant}</div>
                        </div>
                        <div style={{ color: '#f59e0b', fontWeight: 'bold', fontSize: '1rem' }}>{Math.round(a.TotalLaborHours)} hrs</div>
                    </div>
                ))}
            </Card>

            <Card title={t('enterprise.intelligence.networkPriceDiscoveries')} icon={BadgeDollarSign} accent="#10b981" count={(insights.savings || []).length}>
                {(insights.savings || []).length === 0 && (
                    <EmptyState title={t('enterpriseIntel.noCrossplantPriceDifferencesDetectedTip')} style={{ padding: '20px' }} />
                )}
                {(insights.savings || []).map(p => {
                    const savings = (parseFloat(p.AvgUnitCost) - parseFloat(p.CheapestPrice)).toFixed(2);
                    const pctSaved = parseFloat(p.AvgUnitCost) > 0 ? Math.round((savings / parseFloat(p.AvgUnitCost)) * 100) : 0;
                    return (
                        <div 
                            key={`savings-${p.CheapestPlant}-${p.ID}`} 
                            onClick={() => handleNavigate(p.CheapestPlant, 'part', p.ID)}
                            className="intel-item"
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', cursor: 'pointer' }}
                        >
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: '600', color: '#e2e8f0' }}>{p.Description}</div>
                                <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Best: {p.CheapestPlant}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ color: '#10b981', fontWeight: 'bold', fontSize: '1rem' }}>${parseFloat(p.CheapestPrice).toFixed(2)}</div>
                                <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>vs avg ${parseFloat(p.AvgUnitCost).toFixed(2)}</div>
                                <div style={{ fontSize: '0.65rem', color: '#10b981', fontWeight: '600' }}>Save {pctSaved}% (${savings})</div>
                            </div>
                        </div>
                    );
                })}
            </Card>

            <style>{`
                .intel-item:hover {
                    background: rgba(255,255,255,0.08) !important;
                    transform: translateX(4px);
                    transition: all 0.2s;
                }
            `}</style>
        </div>
    );
}
