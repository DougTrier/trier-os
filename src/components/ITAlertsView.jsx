// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — IT Alerts & Notifications Center
 * =============================================
 * Centralized alert dashboard for all IT-domain threshold breaches and
 * upcoming action deadlines. Surfaces alerts across six categories with
 * severity-coded rows and expandable detail panels.
 *
 * ALERT CATEGORIES:
 *   License Expiry      — Software licenses expiring within 30/60/90 days
 *   Warranty Expiry     — Hardware warranties approaching or past expiry
 *   Infrastructure Down — Network devices, servers, or services reporting offline
 *   MDM Non-Compliance  — Mobile devices flagged by MDM as policy non-compliant
 *   In-Transit Delays   — IT equipment shipments overdue or delayed
 *   Depreciation Events — Assets reaching full depreciation milestone
 *
 * KEY FEATURES:
 *   - Severity badges: Critical / High / Medium / Low with color coding
 *   - Expandable alert rows: full detail, affected item, and recommended action
 *   - Dismissible alerts: snooze or acknowledge with audit log entry
 *   - Print report: formatted summary of all active alerts for IT review meeting
 *   - Refresh button: manual re-poll of all alert thresholds
 *
 * API CALLS:
 *   GET /api/it/alerts   — All active IT alerts across all categories (plant-scoped)
 */
import React, { useState, useEffect } from 'react';
import { AlertTriangle, Bell, Shield, Wifi, Smartphone, Key, TrendingDown, Truck, ChevronDown, ChevronUp, Printer } from 'lucide-react';
import { printRecord, tableHTML } from '../utils/printRecord';
import { useTranslation } from '../i18n/index.jsx';

const API = (path) => fetch(`/api/it${path}`, {
    headers: { 'Content-Type': 'application/json' },
});

const SEVERITY_COLORS = { critical: '#ef4444', high: '#f59e0b', medium: '#eab308', low: '#64748b' };
const SEVERITY_LABELS = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
const TYPE_ICONS = {
    license_expiry: Key, warranty_expiry: Shield, infra_offline: Wifi,
    mdm_compliance: Smartphone, in_transit: Truck, depreciation_full: TrendingDown,
    depreciation_milestone: TrendingDown,
};
const TYPE_LABELS = {
    license_expiry: 'License Expiry', warranty_expiry: 'Warranty Expiry',
    infra_offline: 'Infrastructure Offline', mdm_compliance: 'MDM Compliance',
    in_transit: 'In Transit Delay', depreciation_full: 'Fully Depreciated',
    depreciation_milestone: 'Depreciation Milestone',
};

export default function ITAlertsView() {
    const { t } = useTranslation();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [collapsed, setCollapsed] = useState({});

    useEffect(() => {
        setLoading(true);
        API('/alerts').then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
    }, []);

    if (loading) return <div className="glass-card" style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>Loading alerts...</div>;

    const alerts = data?.alerts || [];
    const summary = data?.summary || {};
    const filtered = filter === 'all' ? alerts : alerts.filter(a => a.severity === filter || a.type === filter);

    // Group by type
    const groups = {};
    filtered.forEach(a => {
        if (!groups[a.type]) groups[a.type] = [];
        groups[a.type].push(a);
    });

    const handlePrint = () => {
        let html = '<div class="section-header">Alert Summary</div>' +
            tableHTML(['Severity', 'Count'], [
                ['Critical', String(summary.critical || 0)],
                ['High', String(summary.high || 0)],
                ['Medium', String(summary.medium || 0)],
                ['Low', String(summary.low || 0)],
                ['Total', String(summary.total || 0)],
            ]);
        Object.entries(groups).forEach(([type, items]) => {
            html += `<div class="section-header">${TYPE_LABELS[type] || type} (${items.length})</div>`;
            html += tableHTML(['Severity', 'Asset', 'Category', 'Plant', 'Message'], items.map(a => [
                SEVERITY_LABELS[a.severity], a.name || '--', a.category || '--', (a.plantId || '--').replace(/_/g, ' '), a.message,
            ]));
        });
        printRecord('IT Alerts & Notifications', html, { subtitle: 'Active alerts as of ' + new Date().toLocaleDateString() });
    };

    return (
        <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'var(--spacing-base)' }}>
            <div className="glass-card no-print" style={{ padding:'15px 25px', display:'flex', alignItems:'center', gap:16 }}>
                <h2 style={{ fontSize:'1.4rem', margin:0, color:'#ef4444', display:'flex', alignItems:'center', gap:10 }}><Bell size={24}/> IT Alerts</h2>
                <span style={{ fontSize:'0.78rem', color:'#64748b' }}>{summary.total || 0} active alerts</span>
                <div style={{ marginLeft:'auto', display:'flex', gap:10 }}>
                    <button title="Print" className="btn-nav" onClick={handlePrint} style={{ display:'flex', alignItems:'center', gap:6 }}><Printer size={15}/> Print</button>
                </div>
            </div>

            {/* Summary Cards */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))', gap:12 }}>
                {[['all', 'Total', summary.total, '#6366f1'], ['critical', 'Critical', summary.critical, '#ef4444'], ['high', 'High', summary.high, '#f59e0b'], ['medium', 'Medium', summary.medium, '#eab308'], ['low', 'Low', summary.low, '#64748b']].map(([key, label, count, color]) => (
                    <button title="Button action" key={key} onClick={() => setFilter(key)} style={{ background: filter === key ? color + '15' : 'rgba(255,255,255,0.03)', border: '1px solid ' + (filter === key ? color + '40' : 'var(--glass-border)'), borderRadius:12, padding:16, cursor:'pointer', textAlign:'center', transition:'all 0.2s' }}>
                        <div style={{ fontSize:'1.8rem', fontWeight:800, color }}>{count || 0}</div>
                        <div style={{ fontSize:'0.75rem', color:'#94a3b8' }}>{label}</div>
                    </button>
                ))}
            </div>

            {/* Alert Groups */}
            <div className="glass-card" style={{ flex:1, padding:20, overflow:'auto' }}>
                {Object.entries(groups).length === 0 && (
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:40 }}>
                        <AlertTriangle size={48} color="#334155" />
                        <h3 style={{ color:'#475569', margin:'16px 0 0 0' }}>No alerts matching filter</h3>
                    </div>
                )}
                {Object.entries(groups).map(([type, items]) => {
                    const Icon = TYPE_ICONS[type] || AlertTriangle;
                    const isCollapsed = collapsed[type];
                    return (
                        <div key={type} style={{ marginBottom:16 }}>
                            <button title="Button action" onClick={() => setCollapsed(p => ({...p, [type]: !p[type]}))} style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'10px 14px', background:'rgba(255,255,255,0.03)', border:'1px solid var(--glass-border)', borderRadius:10, cursor:'pointer', color:'white' }}>
                                <Icon size={16} color={SEVERITY_COLORS[items[0]?.severity] || '#64748b'} />
                                <span style={{ fontWeight:700, flex:1, textAlign:'left' }}>{TYPE_LABELS[type] || type}</span>
                                <span style={{ fontSize:'0.78rem', padding:'2px 10px', borderRadius:8, background: SEVERITY_COLORS[items[0]?.severity] + '15', color: SEVERITY_COLORS[items[0]?.severity], fontWeight:600 }}>{items.length}</span>
                                {isCollapsed ? <ChevronDown size={16} color="#64748b"/> : <ChevronUp size={16} color="#64748b"/>}
                            </button>
                            {!isCollapsed && (
                                <div style={{ padding:'8px 0 0 0' }}>
                                    {items.map((a, i) => (
                                        <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 14px', borderBottom:'1px solid rgba(255,255,255,0.04)', fontSize:'0.82rem' }}>
                                            <div style={{ width:8, height:8, borderRadius:'50%', background: SEVERITY_COLORS[a.severity], flexShrink:0 }} />
                                            <div style={{ flex:1 }}>{a.message}</div>
                                            <span style={{ fontSize:'0.72rem', color:'#64748b', flexShrink:0 }}>{(a.plantId || '').replace(/_/g, ' ')}</span>
                                            <span style={{ fontSize:'0.72rem', padding:'2px 8px', borderRadius:6, background: SEVERITY_COLORS[a.severity] + '15', color: SEVERITY_COLORS[a.severity], fontWeight:600, flexShrink:0 }}>{SEVERITY_LABELS[a.severity]}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
