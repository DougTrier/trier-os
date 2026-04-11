// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — MRO Storeroom Intelligence Dashboard
 * ==================================================
 * Surfaces the backend storeroom analytics (server/routes/storeroom.js) in a
 * tabbed dashboard view. Answers the key storeroom management question:
 * "Where is our money sitting on a shelf we haven't touched?"
 *
 * TABS:
 *   ABC Analysis    — A/B/C classification by annual usage value
 *                     A items (top 80% of value) flagged for tight control
 *   Dead Stock      — Parts with zero movement in configurable N-day window
 *   Slow-Moving     — Parts below velocity threshold (usage < reorder point)
 *   Carrying Cost   — Total capital tied up; cost-of-carry at 25% annual rate
 *   Obsolescence    — Parts linked to retired or EOL assets (no future demand)
 *   Summary         — Single-card rollup of all above KPIs for management view
 *
 * API: All data from GET /api/storeroom/* endpoints.
 *   Supports ?plant_id=all_sites for cross-plant aggregation or a specific
 *   plant ID for single-plant drill-down.
 *
 * CONSUMERS: Navigation item under the Parts/Inventory section.
 *   Print button triggers PrintEngine for storeroom analysis reports.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Package, AlertTriangle, TrendingDown, DollarSign, BarChart2, RefreshCw, Info, ChevronDown, ChevronUp, Printer, Eye, Pencil, Save } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

const API = (path, plant) =>
    fetch(path, {
        headers: {
            'x-plant-id': plant || localStorage.getItem('selectedPlantId') || 'Demo_Plant_1',
            'Content-Type': 'application/json',
        }
    }).then(r => r.json());

// ── Stat Card ────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color = '#6366f1', warn = false }) {
    return (
        <div style={{
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${warn ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: 12, padding: '18px 20px',
            display: 'flex', flexDirection: 'column', gap: 6,
            transition: 'border-color 0.2s',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: warn ? '#ef4444' : color }}>
                {icon}
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.8 }}>{label}</span>
            </div>
            <div style={{ fontSize: '1.9rem', fontWeight: 800, color: warn ? '#ef4444' : '#f1f5f9', lineHeight: 1 }}>{value}</div>
            {sub && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{sub}</div>}
        </div>
    );
}

// ── Health Score Ring ────────────────────────────────────────────────────
function HealthRing({ score, label }) {
    const r = 42, c = 2 * Math.PI * r;
    const fill = c - (score / 100) * c;
    const color = score >= 85 ? '#10b981' : score >= 65 ? '#f59e0b' : '#ef4444';
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <svg width={110} height={110} viewBox="0 0 110 110">
                <circle cx={55} cy={55} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={10} />
                <circle cx={55} cy={55} r={r} fill="none" stroke={color} strokeWidth={10}
                    strokeDasharray={c} strokeDashoffset={fill}
                    strokeLinecap="round"
                    style={{ transform: 'rotate(-90deg)', transformOrigin: '55px 55px', transition: 'stroke-dashoffset 0.8s ease' }} />
                <text x={55} y={51} textAnchor="middle" fill="#f1f5f9" fontSize={20} fontWeight={800}>{score}</text>
                <text x={55} y={66} textAnchor="middle" fill="#64748b" fontSize={9} fontWeight={600}>/ 100</text>
            </svg>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color, textAlign: 'center' }}>{label}</span>
        </div>
    );
}

// ── ABC Badge ─────────────────────────────────────────────────────────────
function ABCBadge({ cls }) {
    const colors = { A: '#10b981', B: '#f59e0b', C: '#94a3b8' };
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 26, height: 26, borderRadius: 6,
            background: `${colors[cls]}22`, border: `1px solid ${colors[cls]}55`,
            color: colors[cls], fontSize: '0.8rem', fontWeight: 800,
        }}>{cls}</span>
    );
}

// ── Action Button Component ───────────────────────────────────────────────
const ActionBtn = ({ icon: Icon, tip, color = 'var(--text-muted)', onClick }) => (
    <button title={tip} onClick={e => { e.stopPropagation(); onClick && onClick(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color, padding: '4px 6px', borderRadius: 6, transition: 'all 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
        onMouseLeave={e => e.currentTarget.style.background = 'none'}>
        <Icon size={17} />
    </button>
);

// ── Parts Table ───────────────────────────────────────────────────────────
function PartsTable({ parts, showABC = false, emptyMsg }) {
    const { t } = useTranslation();
    const [expanded, setExpanded] = useState(false);
    const shown = expanded ? parts : parts.slice(0, 15);

    const navigateToPart = (id) => {
        localStorage.setItem('PF_NAV_VIEW', id);
        window.dispatchEvent(new CustomEvent('pf-nav', { detail: 'parts' }));
    };

    if (!parts || parts.length === 0) {
        return <p style={{ color: '#64748b', fontSize: '0.85rem', padding: '16px 0' }}>{emptyMsg ?? t('storeroomView.noPartsFound', 'No parts found')}</p>;
    }

    return (
        <div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                            {showABC && <th style={th}>{t('storeroomView.colClass', 'Class')}</th>}
                            <th style={{ ...th, textAlign: 'left' }}>{t('storeroomView.colPartId', 'Part ID')}</th>
                            <th style={{ ...th, textAlign: 'left' }}>{t('storeroomView.colDescription', 'Description')}</th>
                            <th style={th}>{t('storeroomView.colStock', 'Stock')}</th>
                            <th style={th}>{t('storeroomView.colUnitCost', 'Unit Cost')}</th>
                            <th style={{ ...th, color: '#ef4444' }}>{t('storeroomView.colInvValue', 'Inv. Value')}</th>
                            <th style={th}>{t('storeroomView.colLastUsed', 'Last Used')}</th>
                            {showABC && <th style={th}>{t('storeroomView.colUsageValue', 'Usage Value')}</th>}
                            <th style={{ ...th, textAlign: 'center' }}>{t('storeroomView.colActions', 'ACTIONS')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map((p, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s', cursor: 'pointer' }}
                                onClick={() => navigateToPart(p.ID)}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                {showABC && <td style={td}><ABCBadge cls={p.abcClass} /></td>}
                                <td style={{ ...td, fontFamily: 'monospace', color: '#818cf8' }}>{p.ID}</td>
                                <td style={{ ...td, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.Description}>{p.Description}</td>
                                <td style={td}>{p.stock}</td>
                                <td style={td}>${Number(p.unitCost || 0).toFixed(2)}</td>
                                <td style={{ ...td, color: '#ef4444', fontWeight: 700 }}>${Number(p.inventoryValue || 0).toLocaleString()}</td>
                                <td style={{ ...td, color: '#64748b' }}>{p.lastUsedDate ? new Date(p.lastUsedDate).toLocaleDateString() : p.daysSinceUse ? `${p.daysSinceUse}${t('storeroomView.daysAgoSuffix', 'd ago')}` : '—'}</td>
                                {showABC && <td style={{ ...td, color: '#10b981' }}>${Number(p.usageValue || 0).toLocaleString()}</td>}
                                <td style={{ padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: 2, justifyContent: 'center', alignItems: 'center' }}>
                                    <ActionBtn icon={Eye} tip={t('storeroomView.viewPart', 'View Part')} color="#3b82f6" onClick={() => navigateToPart(p.ID)} />
                                    <ActionBtn icon={Pencil} tip={t('storeroomView.editPart', 'Edit Part')} color="#f59e0b" onClick={() => navigateToPart(p.ID)} />
                                    <ActionBtn icon={Save} tip={t('storeroomView.savePartData', 'Save Part Data')} color="#10b981" onClick={() => navigateToPart(p.ID)} />
                                    <ActionBtn icon={Printer} tip={t('storeroomView.printPartLabel', 'Print Part Label')} color="#8b5cf6" onClick={() => navigateToPart(p.ID)} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {parts.length > 15 && (
                <button onClick={() => setExpanded(!expanded)} style={{
                    marginTop: 10, background: 'none', border: '1px solid rgba(255,255,255,0.1)',
                    color: '#94a3b8', borderRadius: 8, padding: '6px 16px', cursor: 'pointer',
                    fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6,
                }}>
                    {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {expanded ? t('storeroomView.showLess', 'Show less') : t('storeroomView.showAllParts', 'Show all {n} parts').replace('{n}', parts.length)}
                </button>
            )}
        </div>
    );
}

const th = { padding: '8px 12px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.68rem', letterSpacing: '0.06em', textAlign: 'center', whiteSpace: 'nowrap' };
const td = { padding: '9px 12px', color: '#e2e8f0', textAlign: 'center' };

// ══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════
export default function StoreroomView({ plantId, plantLabel }) {
    const { t } = useTranslation();
    const [tab, setTab] = useState('summary');
    const [days, setDays] = useState(365);
    const [loading, setLoading] = useState(false);
    const [summary, setSummary] = useState(null);
    const [abcData, setAbcData] = useState(null);
    const [deadData, setDeadData] = useState(null);
    const [slowData, setSlowData] = useState(null);
    const [costData, setCostData] = useState(null);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const qs = `?days=${days}`;
            const [sum, abc, dead, slow, cost] = await Promise.all([
                API(`/api/storeroom/summary${qs}`, plantId),
                API(`/api/storeroom/abc-analysis${qs}`, plantId),
                API(`/api/storeroom/dead-stock${qs}`, plantId),
                API(`/api/storeroom/slow-moving${qs}`, plantId),
                API(`/api/storeroom/carrying-cost${qs}`, plantId),
            ]);
            setSummary(sum);
            setAbcData(abc);
            setDeadData(dead);
            setSlowData(slow);
            setCostData(cost);
        } catch (e) {
            setError(t('storeroomView.failedToLoad', 'Failed to load storeroom data'));
        } finally {
            setLoading(false);
        }
    }, [plantId, days]);

    useEffect(() => { load(); }, [load]);

    const tabs = [
        { id: 'summary', label: t('storeroomView.tabOverview', 'Overview'), icon: <BarChart2 size={14} /> },
        { id: 'abc', label: t('storeroomView.tabAbcAnalysis', 'ABC Analysis'), icon: <Package size={14} /> },
        { id: 'dead', label: t('storeroomView.tabDeadStock', 'Dead Stock'), icon: <AlertTriangle size={14} /> },
        { id: 'slow', label: t('storeroomView.tabSlowMoving', 'Slow-Moving'), icon: <TrendingDown size={14} /> },
        { id: 'cost', label: t('storeroomView.tabCarryingCost', 'Carrying Cost'), icon: <DollarSign size={14} /> },
    ];

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-base)', overflow: 'hidden' }}>
            {/* ── Header ── */}
            <div className="glass-card no-print" style={{ padding: '15px 25px', display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '1.4rem', margin: 0, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Package size={24} /> {t('storeroomView.heading', 'Storeroom Intelligence')}
                </h2>
                <div style={{ width: 2, height: 30, background: 'var(--glass-border)' }} />
                <div className="nav-pills" style={{ padding: 0, margin: 0, background: 'transparent' }}>
                    {tabs.map(t => (
                        <button key={t.id} onClick={() => setTab(t.id)}
                            className={`btn-nav ${tab === t.id ? 'active' : ''}`}
                            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {t.icon} {t.label}
                        </button>
                    ))}
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <label style={{ fontSize: '0.8rem', color: '#64748b' }}>{t('storeroomView.lookback', 'Lookback:')}</label>
                    <select value={days} onChange={e => setDays(Number(e.target.value))} style={{
                        background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                        color: '#f1f5f9', borderRadius: 8, padding: '5px 10px', fontSize: '0.82rem', cursor: 'pointer',
                    }}>
                        <option value={90}>{t('storeroomView.option90days', '90 days')}</option>
                        <option value={180}>{t('storeroomView.option180days', '180 days')}</option>
                        <option value={365}>{t('storeroomView.option1year', '1 year')}</option>
                        <option value={730}>{t('storeroomView.option2years', '2 years')}</option>
                    </select>
                    <button onClick={load} disabled={loading} title={t('storeroomView.refresh', 'Refresh')} style={{
                        background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
                        color: '#818cf8', borderRadius: 8, padding: '7px 14px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem',
                    }}>
                        <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                        {loading ? t('storeroomView.loading', 'Loading…') : t('storeroomView.refresh', 'Refresh')}
                    </button>
                    <button onClick={() => window.triggerTrierPrint('storeroom-report', { summary, lookbackDays: days })} title={t('storeroomView.printReportTip', 'Print Intelligence Report')} style={{
                        background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
                        color: '#10b981', borderRadius: 8, padding: '7px 14px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem',
                    }}>
                        <Printer size={14} />
                        {t('storeroomView.print', 'Print')}
                    </button>
                </div>
            </div>

            {/* ── Content ── */}
            <div style={{ flex: 1, overflow: 'auto', padding: '0 4px' }}>
                {error && <div style={{ color: '#ef4444', padding: 20 }}>{error}</div>}
                {!error && !loading && summary && (
                    <>
                        {/* SUMMARY TAB */}
                        {tab === 'summary' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                                {/* KPI Row */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'auto repeat(4, 1fr)', gap: 14, alignItems: 'start' }}>
                                    <div className="glass-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, justifyContent:'center' }}>
                                        <HealthRing score={summary.healthScore || 0} label={summary.healthLabel || ''} />
                                        <span style={{ fontSize: '0.7rem', color: '#64748b', textAlign: 'center' }}>{t('storeroomView.storeroomHealth', 'Storeroom Health')}</span>
                                    </div>
                                    <StatCard icon={<Package size={16} />} label={t('storeroomView.totalParts', 'Total Parts')} value={summary.totalParts?.toLocaleString() || 0} sub={`$${(summary.totalInventoryValue || 0).toLocaleString()} ${t('storeroomView.onShelfSuffix', 'on shelf')}`} color="#818cf8" />
                                    <StatCard icon={<DollarSign size={16} />} label={t('storeroomView.annualCarryingCost', 'Annual Carrying Cost')} value={`$${(summary.annualCarryingCost || 0).toLocaleString()}`} sub={t('storeroomView.estCarryingCostNote', 'Est. at 25% of inventory value')} color="#f59e0b" />
                                    <StatCard icon={<AlertTriangle size={16} />} label={t('storeroomView.deadStock', 'Dead Stock')} value={summary.deadStock?.count || 0} sub={`$${(summary.deadStock?.value || 0).toLocaleString()} (${summary.deadStock?.pctOfInventory || 0}${t('storeroomView.pctOfInventorySuffix', '% of inventory')})`} color="#ef4444" warn={(summary.deadStock?.count || 0) > 0} />
                                    <StatCard icon={<TrendingDown size={16} />} label={t('storeroomView.slowMoving', 'Slow-Moving')} value={summary.slowMoving?.count || 0} sub={`$${(summary.slowMoving?.value || 0).toLocaleString()} (${summary.slowMoving?.pctOfInventory || 0}${t('storeroomView.pctOfInventorySuffix', '% of inventory')})`} color="#f59e0b" />
                                </div>

                                {/* ABC Summary + Top Dead Stock side by side */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                    <div className="glass-card" style={{ padding: 20 }}>
                                        <h3 style={{ margin: '0 0 16px', fontSize: '1rem', color: '#f1f5f9', display:'flex', alignItems:'center', gap:8 }}>
                                            <BarChart2 size={16} color="#818cf8" /> {t('storeroomView.abcClassification', 'ABC Classification')}
                                        </h3>
                                        {[
                                            { cls: 'A', count: summary.classA?.count, desc: t('storeroomView.classADesc', 'High-value, high-usage — stock tight, track closely'), color: '#10b981' },
                                            { cls: 'B', count: summary.classB?.count, desc: t('storeroomView.classBDesc', 'Medium usage — standard reorder discipline'), color: '#f59e0b' },
                                            { cls: 'C', count: summary.classC?.count, desc: t('storeroomView.classCDesc', 'Low usage — review stock levels periodically'), color: '#94a3b8' },
                                        ].map(row => (
                                            <div key={row.cls} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                                                <ABCBadge cls={row.cls} />
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                                        <span style={{ fontSize: '0.82rem', color: '#e2e8f0' }}>{row.desc}</span>
                                                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: row.color }}>{row.count || 0} {t('storeroomView.parts', 'parts')}</span>
                                                    </div>
                                                    <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                                                        <div style={{ height: '100%', background: row.color, borderRadius: 2, width: `${summary.totalParts > 0 ? ((row.count || 0) / summary.totalParts * 100) : 0}%`, transition: 'width 0.8s ease' }} />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="glass-card" style={{ padding: 20 }}>
                                        <h3 style={{ margin: '0 0 16px', fontSize: '1rem', color: '#f1f5f9', display:'flex', alignItems:'center', gap:8 }}>
                                            <AlertTriangle size={16} color="#ef4444" /> {t('storeroomView.topDeadStockByValue', 'Top Dead Stock by Value')}
                                        </h3>
                                        {(summary.topDeadStock || []).length === 0
                                            ? <p style={{ color: '#10b981', fontSize:'0.85rem' }}>{t('storeroomView.noSignificantDeadStock', '✅ No significant dead stock identified')}</p>
                                            : (summary.topDeadStock || []).slice(0, 8).map((p, i) => (
                                                <div key={i} 
                                                     onClick={() => { localStorage.setItem('PF_NAV_VIEW', p.ID); window.dispatchEvent(new CustomEvent('pf-nav', { detail: 'parts' })); }}
                                                     onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                                                     onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                     style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: '6px 4px', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', borderRadius: '4px', transition: 'background 0.2s' }}>
                                                    <div>
                                                        <div style={{ fontSize: '0.82rem', color: '#e2e8f0', fontWeight: 600 }}>{p.ID}</div>
                                                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>{(p.Description || '').slice(0, 45)}</div>
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#ef4444' }}>${(p.inventoryValue || 0).toLocaleString()}</div>
                                                        <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{p.stock} {t('storeroomView.units', 'units')}</div>
                                                    </div>
                                                </div>
                                            ))
                                        }
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ABC TAB */}
                        {tab === 'abc' && abcData && (
                            <div className="glass-card" style={{ padding: 20 }}>
                                <div style={{ display: 'flex', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
                                    {['A','B','C'].map(cls => {
                                        const s = abcData.summary?.[`class${cls}`];
                                        return (
                                            <div key={cls} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '14px 20px', minWidth: 160 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}><ABCBadge cls={cls} /><span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>{t('storeroomView.abcClassLabel', 'Class {cls}').replace('{cls}', cls)}</span></div>
                                                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f1f5f9' }}>{s?.count || 0} <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{t('storeroomView.parts', 'parts')}</span></div>
                                                <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{t('storeroomView.abcCatalogUsageText', '{pctOfParts}% of catalog • {pctOfValue}% of usage value').replace('{pctOfParts}', s?.pctOfParts || 0).replace('{pctOfValue}', s?.pctOfValue || 0)}</div>
                                            </div>
                                        );
                                    })}
                                    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '14px 20px', minWidth: 160 }}>
                                        <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 6 }}>{t('storeroomView.totalInventoryValue', 'TOTAL INVENTORY VALUE')}</div>
                                        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f1f5f9' }}>${(abcData.totalInventoryValue || 0).toLocaleString()}</div>
                                        <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{abcData.totalParts || 0} {t('storeroomView.parts', 'parts')}</div>
                                    </div>
                                </div>
                                <h3 style={{ margin: '0 0 12px', fontSize: '0.95rem', color: '#94a3b8' }}>{t('storeroomView.allPartsRanked', 'All Parts — Ranked by Usage Value (Pareto)')}</h3>
                                <PartsTable parts={abcData.parts || []} showABC />
                            </div>
                        )}

                        {/* DEAD STOCK TAB */}
                        {tab === 'dead' && deadData && (
                            <div className="glass-card" style={{ padding: 20 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                                    <div style={{ display: 'flex', gap: 14 }}>
                                        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '14px 20px' }}>
                                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>{t('storeroomView.deadStockParts', 'DEAD STOCK PARTS')}</div>
                                            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#ef4444' }}>{deadData.deadStockCount || 0}</div>
                                        </div>
                                        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '14px 20px' }}>
                                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>{t('storeroomView.capitalLockedOnShelf', 'CAPITAL LOCKED ON SHELF')}</div>
                                            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#ef4444' }}>${(deadData.totalDeadValue || 0).toLocaleString()}</div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: '#64748b', fontSize: '0.8rem', maxWidth: 280, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 14px' }}>
                                        <Info size={14} style={{ flexShrink: 0 }} />
                                        {t('storeroomView.zeroUsageInfo', 'Zero usage in the last {n} days with stock on hand. Review for return, disposal, or reclassification.').replace('{n}', days)}
                                    </div>
                                </div>
                                <PartsTable parts={deadData.parts || []} emptyMsg={t('storeroomView.noDeadStockFound', '✅ No dead stock identified in the last {n} days').replace('{n}', days)} />
                            </div>
                        )}

                        {/* SLOW-MOVING TAB */}
                        {tab === 'slow' && slowData && (
                            <div className="glass-card" style={{ padding: 20 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                                    <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '14px 20px' }}>
                                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>{t('storeroomView.slowMovingParts', 'SLOW-MOVING PARTS')}</div>
                                        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f59e0b' }}>{slowData.slowMovingCount || 0}</div>
                                    </div>
                                    <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '14px 20px' }}>
                                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>{t('storeroomView.totalValue', 'TOTAL VALUE')}</div>
                                        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f59e0b' }}>${(slowData.totalSlowValue || 0).toLocaleString()}</div>
                                    </div>
                                    <div style={{ color: '#64748b', fontSize: '0.8rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 14px', maxWidth: 280 }}>
                                        <Info size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                                        {t('storeroomView.slowMovingInfo', 'Used fewer than 3 times in {n} days. Consider adjusting min/max or consolidating with other plants.').replace('{n}', days)}
                                    </div>
                                </div>
                                <PartsTable parts={slowData.parts || []} emptyMsg={t('storeroomView.noSlowMoving', '✅ No slow-moving parts identified')} />
                            </div>
                        )}

                        {/* CARRYING COST TAB */}
                        {tab === 'cost' && costData && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                                    <StatCard icon={<DollarSign size={16} />} label={t('storeroomView.totalInventoryValue', 'TOTAL INVENTORY VALUE')} value={`$${(costData.totalInventoryValue || 0).toLocaleString()}`} sub={`${costData.totalParts || 0} ${t('storeroomView.parts', 'parts')}`} color="#818cf8" />
                                    <StatCard icon={<DollarSign size={16} />} label={`${t('storeroomView.annualCarryingCost', 'Annual Carrying Cost')} (${costData.carryingRatePct || 25}%)`} value={`$${(costData.annualCarryingCost || 0).toLocaleString()}`} sub={t('storeroomView.holdingRateNote', 'Industry standard 25% holding rate')} color="#f59e0b" warn />
                                    <StatCard icon={<AlertTriangle size={16} />} label={t('storeroomView.deadStock', 'Dead Stock') + ' + ' + t('storeroomView.slowMoving', 'Slow-Moving')} value={`$${((costData.breakdown?.deadStock?.inventoryValue || 0) + (costData.breakdown?.slowMoving?.inventoryValue || 0)).toLocaleString()}`} sub={t('storeroomView.disposalNote', 'Consider return, disposal, or consolidation')} color="#ef4444" warn />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                    <div className="glass-card" style={{ padding: 20 }}>
                                        <h3 style={{ margin: '0 0 16px', fontSize: '1rem', color: '#f1f5f9' }}>{t('storeroomView.stockHealthBreakdown', 'Stock Health Breakdown')}</h3>
                                        {[
                                            { label: t('storeroomView.activeStock', 'Active Stock'), data: costData.breakdown?.active, color: '#10b981' },
                                            { label: t('storeroomView.slowMoving', 'Slow-Moving'), data: costData.breakdown?.slowMoving, color: '#f59e0b' },
                                            { label: t('storeroomView.deadStock', 'Dead Stock'), data: costData.breakdown?.deadStock, color: '#ef4444' },
                                        ].map(row => (
                                            <div key={row.label} style={{ marginBottom: 14 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                                    <span style={{ fontSize: '0.82rem', color: row.color, fontWeight: 600 }}>{row.label}</span>
                                                    <span style={{ fontSize: '0.82rem', color: '#e2e8f0' }}>${(row.data?.inventoryValue || 0).toLocaleString()} ({row.data?.count || 0} parts)</span>
                                                </div>
                                                <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
                                                    <div style={{ height: '100%', background: row.color, borderRadius: 3, width: `${costData.totalInventoryValue > 0 ? ((row.data?.inventoryValue || 0) / costData.totalInventoryValue * 100) : 0}%`, transition: 'width 0.8s ease' }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="glass-card" style={{ padding: 20 }}>
                                        <h3 style={{ margin: '0 0 16px', fontSize: '1rem', color: '#f1f5f9' }}>{t('storeroomView.topCategoriesByValue', 'Top Categories by Value')}</h3>
                                        {(costData.byCategory || []).slice(0, 8).map((cat, i) => (
                                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                <span style={{ fontSize: '0.82rem', color: '#e2e8f0' }}>{cat.category}</span>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#818cf8' }}>${(cat.inventoryValue || 0).toLocaleString()}</div>
                                                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{t('storeroomView.catCountCarryCost', '{count} parts • ${cost}/yr').replace('{count}', cat.count).replace('{cost}', (cat.annualCarryingCost || 0).toLocaleString())}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
                {loading && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: '#64748b', gap: 12 }}>
                        <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
                        {t('storeroomView.analyzingData', 'Analyzing storeroom data…')}
                    </div>
                )}
            </div>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
