// Copyright © 2026 Trier OS. All Rights Reserved.

import React, { useState, useEffect } from 'react';
import { Activity, AlertTriangle, ArrowUpRight, BarChart3, ChevronLeft, ChevronRight, DollarSign, Download, Filter, RefreshCw, AlertCircle, Building2 } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

export default function AssetLifecycleView({ plantId, plantLabel }) {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [recs, setRecs] = useState([]);
    const [summary, setSummary] = useState(null);
    const [forecast, setForecast] = useState(null);
    const [rollup, setRollup] = useState(null);
    const [activeTab, setActiveTab] = useState('recommendations'); // recommendations, forecast, corporate

    const loadData = () => {
        setLoading(true);
        const headers = { 'x-plant-id': plantId };
        
        // all three datasets load in parallel; corporate rollup resolves null for plant-scoped views (not applicable per-plant)
        Promise.all([
            fetch('/api/asset-lifecycle/recommendations', { headers }).then(r => r.json()),
            fetch('/api/asset-lifecycle/forecast', { headers }).then(r => r.json()),
            plantId === 'all_sites' ? fetch('/api/asset-lifecycle/corporate-rollup', { headers }).then(r => r.json()) : Promise.resolve(null)
        ])
        .then(([recsData, forecastData, rollupData]) => {
            if (recsData && !recsData.error) {
                setRecs(recsData.recommendations || []);
                setSummary(recsData.summary || null);
            }
            if (forecastData && !forecastData.error) {
                setForecast(forecastData.forecast || null);
            }
            if (rollupData && !rollupData.error) {
                setRollup(rollupData);
            }
        })
        .catch(e => console.error(e))
        .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadData();
    }, [plantId]);

    const formatCurrency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

    return (
        <div style={{ padding: 20, maxWidth: 1400, margin: '0 auto', color: '#f1f5f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                <div>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <BarChart3 size={28} color="#ec4899" />
                        Capital Replacement Planning
                    </h1>
                    <p style={{ color: '#94a3b8', margin: '4px 0 0 0' }}>{plantLabel === 'Corporate (All Sites)' ? 'Enterprise Lifecycle & Liability' : `Lifecycle intelligence for ${plantLabel}`}</p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={loadData} style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <RefreshCw size={16} /> Refresh
                    </button>
                    <button style={{ background: '#ec4899', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                        <Download size={16} /> Export CSV
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 8 }}>
                <TabButton active={activeTab === 'recommendations'} onClick={() => setActiveTab('recommendations')} label="Replacement Recommendations" />
                <TabButton active={activeTab === 'forecast'} onClick={() => setActiveTab('forecast')} label="Capital Forecast" />
                {plantId === 'all_sites' && (
                    <TabButton active={activeTab === 'corporate'} onClick={() => setActiveTab('corporate')} label="Corporate Rollup" />
                )}
            </div>

            {loading ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading lifecycle data...</div>
            ) : (
                <>
                    {activeTab === 'recommendations' && (
                        <div>
                            {summary && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, marginBottom: 24 }}>
                                    <MetricCard title="Evaluated Assets" value={summary.totalEvaluated} />
                                    <MetricCard title="Recommendations" value={summary.totalRecommendations} color="#f59e0b" />
                                    <MetricCard title="Critical Replacements" value={summary.criticalReplacements} color="#ef4444" />
                                    <MetricCard title="Total Exposed Liability" value={formatCurrency(summary.totalLiability)} color="#ec4899" />
                                </div>
                            )}

                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                                    <thead>
                                        <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>
                                            <th style={{ padding: '12px 16px' }}>Asset</th>
                                            <th style={{ padding: '12px 16px' }}>Type</th>
                                            <th style={{ padding: '12px 16px' }}>Age / EUL</th>
                                            <th style={{ padding: '12px 16px' }}>Replacement Cost</th>
                                            <th style={{ padding: '12px 16px' }}>Total Repair Cost</th>
                                            <th style={{ padding: '12px 16px' }}>Repair/Replace Ratio</th>
                                            <th style={{ padding: '12px 16px' }}>Payback</th>
                                            <th style={{ padding: '12px 16px' }}>Recommendation</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recs.map(r => (
                                            <tr key={r.assetId} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                <td style={{ padding: '12px 16px' }}>
                                                    <div style={{ fontWeight: 600 }}>{r.assetId}</div>
                                                    <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{r.description}</div>
                                                </td>
                                                <td style={{ padding: '12px 16px', color: '#cbd5e1' }}>{r.assetType || 'Unknown'}</td>
                                                <td style={{ padding: '12px 16px' }}>
                                                    {r.ageInYears}y <span style={{ color: '#64748b' }}>/ {r.expectedUsefulLife}y</span>
                                                    {r.ageInYears >= r.expectedUsefulLife && <AlertTriangle size={14} color="#f59e0b" style={{ verticalAlign: 'middle', marginLeft: 6 }} title="Past Expected Useful Life" />}
                                                </td>
                                                <td style={{ padding: '12px 16px' }}>{formatCurrency(r.replacementCost)}</td>
                                                <td style={{ padding: '12px 16px', color: '#f87171' }}>{formatCurrency(r.cumulativeRepairCost)}</td>
                                                {/* business thresholds: ≥75% = critical replace (red), ≥50% = plan (amber), <50% = healthy (green) */}
                                                <td style={{ padding: '12px 16px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                        <span style={{ fontWeight: 600, color: r.repairToReplaceRatio >= 75 ? '#ef4444' : r.repairToReplaceRatio >= 50 ? '#f59e0b' : '#10b981' }}>
                                                            {r.repairToReplaceRatio}%
                                                        </span>
                                                        <div style={{ width: 60, height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
                                                            <div style={{ height: '100%', width: `${Math.min(r.repairToReplaceRatio, 100)}%`, background: r.repairToReplaceRatio >= 75 ? '#ef4444' : r.repairToReplaceRatio >= 50 ? '#f59e0b' : '#10b981' }} />
                                                        </div>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '12px 16px' }}>{r.paybackYears} yrs</td>
                                                <td style={{ padding: '12px 16px' }}>
                                                    {r.status === 'REPLACE_IMMEDIATELY' && <span style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', padding: '4px 10px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertCircle size={14} /> REPLACE NOW</span>}
                                                    {r.status === 'PLAN_REPLACEMENT' && <span style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#fcd34d', padding: '4px 10px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700 }}>PLAN REPLACEMENT</span>}
                                                    {r.status === 'MONITOR' && <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#6ee7b7', padding: '4px 10px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700 }}>MONITOR</span>}
                                                </td>
                                            </tr>
                                        ))}
                                        {recs.length === 0 && (
                                            <tr>
                                                <td colSpan="8" style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>No replacement recommendations found. Asset tracking looks healthy.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'forecast' && forecast && (
                        <div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, marginBottom: 32 }}>
                                <ForecastCard title="Due Year 1" data={forecast.year1} color="#ef4444" />
                                <ForecastCard title="Due Year 3" data={forecast.year3} color="#f59e0b" />
                                <ForecastCard title="Due Year 5" data={forecast.year5} color="#3b82f6" />
                                <ForecastCard title="Beyond 5 Years" data={forecast.beyond} color="#10b981" />
                            </div>
                        </div>
                    )}

                    {activeTab === 'corporate' && rollup && (
                        <div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 20 }}>
                                    <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Building2 size={20} color="#06b6d4" /> Liability by Plant (5-Year Window)
                                    </h3>
                                    {rollup.byPlant.map((p, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <span>{p.plant}</span>
                                            <span style={{ fontWeight: 600 }}>{formatCurrency(p.liability)}</span>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 20 }}>
                                    <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Cog size={20} color="#8b5cf6" /> Liability by Asset Class
                                    </h3>
                                    {rollup.byClass.map((c, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <span>{c.assetClass}</span>
                                            <span style={{ fontWeight: 600 }}>{formatCurrency(c.liability)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function TabButton({ active, onClick, label }) {
    return (
        <button 
            onClick={onClick}
            style={{
                background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: active ? '#fff' : '#94a3b8',
                border: 'none',
                padding: '10px 20px',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 600,
                transition: 'all 0.2s'
            }}
        >
            {label}
        </button>
    );
}

function MetricCard({ title, value, color = '#38bdf8' }) {
    return (
        <div style={{ background: 'rgba(255,255,255,0.03)', padding: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', borderTop: `4px solid ${color}` }}>
            <div style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: 8, color: '#fff' }}>{value}</div>
        </div>
    );
}

function ForecastCard({ title, data, color }) {
    return (
        <div style={{ background: 'rgba(255,255,255,0.03)', padding: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: color, fontWeight: 700, fontSize: '1.1rem', marginBottom: 16 }}>
                <Activity size={20} /> {title}
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#fff', marginBottom: 4 }}>
                ${(data.cost / 1000).toFixed(1)}k
            </div>
            <div style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: 20 }}>{data.count} assets due</div>
            
            {data.assets && data.assets.length > 0 && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16 }}>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase' }}>Key Replacements</div>
                    {data.assets.slice(0, 4).map((a, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 8, color: '#cbd5e1' }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{a.assetId} ({a.type})</span>
                            <span>${(a.cost / 1000).toFixed(1)}k</span>
                        </div>
                    ))}
                    {data.assets.length > 4 && <div style={{ fontSize: '0.8rem', color: '#64748b' }}>+ {data.assets.length - 4} more</div>}
                </div>
            )}
        </div>
    );
}
