// Copyright © 2026 Trier OS. All Rights Reserved.

import React, { useState, useEffect } from 'react';
import { AlertCircle, AlertTriangle, Activity, BarChart3 } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

export default function AssetLifecycleCard({ assetId, plantId }) {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [rec, setRec] = useState(null);

    useEffect(() => {
        if (!assetId || !plantId) return;
        setLoading(true);
        // no per-asset endpoint exists — load the full list and filter client-side;
        // acceptable because the lifecycle view page already caches the same dataset on the same route
        fetch('/api/asset-lifecycle/recommendations', {
            headers: { 'x-plant-id': plantId }
        })
        .then(r => r.json())
        .then(data => {
            if (data && data.recommendations) {
                const found = data.recommendations.find(r => r.assetId === assetId);
                // absence of a recommendation record means the asset is below all threshold triggers — healthy by definition
                setRec(found || null);
            }
        })
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
    }, [assetId, plantId]);

    if (loading) {
        return (
            <div style={{ marginTop: '20px', padding: 20, background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Analyzing Lifecycle Intelligence...</div>
            </div>
        );
    }

    if (!rec) {
        return (
            <div style={{ marginTop: '20px', padding: 20, background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#10b981', fontWeight: 600, marginBottom: 8 }}>
                    <Activity size={18} /> Asset Lifecycle is Healthy
                </div>
                <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Repair costs are well below replacement thresholds. No capital action required.</div>
            </div>
        );
    }

    const formatCurrency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

    // maps the three recommendation tiers to visual treatment — status codes come from the route's threshold logic
    const getStatusStyles = () => {
        if (rec.status === 'REPLACE_IMMEDIATELY') return { bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)', text: '#fca5a5', icon: <AlertCircle size={24} color="#ef4444" /> };
        if (rec.status === 'PLAN_REPLACEMENT') return { bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.3)', text: '#fcd34d', icon: <AlertTriangle size={24} color="#f59e0b" /> };
        return { bg: 'rgba(56, 189, 248, 0.1)', border: 'rgba(56, 189, 248, 0.3)', text: '#7dd3fc', icon: <BarChart3 size={24} color="#38bdf8" /> };
    };

    const s = getStatusStyles();

    return (
        <div style={{ marginTop: '20px', padding: 24, background: s.bg, borderRadius: 12, border: `1px solid ${s.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                {s.icon}
                <div>
                    <h3 style={{ margin: 0, color: s.text, fontSize: '1.2rem', fontWeight: 700 }}>
                        {rec.status === 'REPLACE_IMMEDIATELY' && 'Critical: Replace Immediately'}
                        {rec.status === 'PLAN_REPLACEMENT' && 'Warning: Plan Replacement'}
                        {rec.status === 'MONITOR' && 'Monitor: High Repair Costs'}
                    </h3>
                    <div style={{ color: '#cbd5e1', fontSize: '0.85rem', marginTop: 4 }}>
                        Payback Period: <strong style={{ color: '#fff' }}>{rec.paybackYears} years</strong>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, background: 'rgba(0,0,0,0.2)', padding: 16, borderRadius: 8 }}>
                <div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Repair / Replace Ratio</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: s.text }}>{rec.repairToReplaceRatio}%</div>
                </div>
                <div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Total Repair Cost</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f87171' }}>{formatCurrency(rec.cumulativeRepairCost)}</div>
                </div>
                <div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Replacement Cost</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>{formatCurrency(rec.replacementCost)}</div>
                </div>
            </div>

            {rec.ageInYears >= rec.expectedUsefulLife && (
                <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, color: '#f59e0b', fontSize: '0.85rem', fontWeight: 600 }}>
                    <AlertTriangle size={14} /> Asset age ({rec.ageInYears}y) has exceeded Expected Useful Life ({rec.expectedUsefulLife}y).
                </div>
            )}
        </div>
    );
}
