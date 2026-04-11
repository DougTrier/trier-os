// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS — Corporate Analytics UI Widgets
 * ===========================================
 * Shared sub-components and utilities extracted from CorporateAnalyticsView.jsx
 * to reduce that file's size and isolate reusable display components.
 *
 * EXPORTS:
 *   API             — Authenticated fetch wrapper for /api/corp-analytics
 *   fmt             — Dollar formatter ($1.2M / $450K / $42)
 *   fmtN            — Locale number formatter
 *   SEV_COLORS      — Severity → hex color map
 *   KPICard         — Headline metric card with trend arrow
 *   MiniBarChart    — Compact bar chart for trend sparklines
 *   PlantScoreBadge — Colored score badge (Excellent / Good / Needs Attention)
 *   SeverityBadge   — Risk severity pill (critical / high / medium / low)
 *   PlantSpendTable — Sortable, filterable plant spend breakdown table
 *   AccessManager   — Creator-only whitelist management panel
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
    ArrowUpRight, ArrowDownRight,
    ChevronRight, ChevronDown,
    Crown, Lock, Plus, Search, Users,
} from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

// ── Shared API client & formatters ──────────────────────────────────────────

export const API = (path, opts = {}) => fetch('/api/corp-analytics' + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
});

export const fmt  = (v) => v >= 1000000 ? '$' + (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? '$' + (v / 1000).toFixed(1) + 'K' : '$' + (v || 0).toFixed(0);
export const fmtN = (v) => Number(v || 0).toLocaleString();

export const SEV_COLORS = { critical: '#ef4444', high: '#f59e0b', medium: '#eab308', low: '#3b82f6' };

// ═══════════════════════════════════════════════════════════════════════════
// KPI Card — headline metric tile with optional trend indicator
// ═══════════════════════════════════════════════════════════════════════════
export function KPICard({ icon: Icon, label, value, sub, color, trend, trendLabel, onClick }) {
    const [hovered, setHovered] = useState(false);
    return (
        <div onClick={onClick}
            onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
            style={{
                background: `linear-gradient(135deg, ${color}10 0%, ${color}05 100%)`,
                border: `1px solid ${hovered ? color + '40' : color + '18'}`,
                borderRadius: 16, padding: '18px 22px',
                cursor: onClick ? 'pointer' : 'default',
                transition: 'all 0.3s ease',
                transform: hovered && onClick ? 'translateY(-2px)' : 'none',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <Icon size={18} color={color} />
                </div>
                <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.02em' }}>{value}</div>
            {sub && <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 4 }}>{sub}</div>}
            {trend !== undefined && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', fontWeight: 600, color: trend >= 0 ? '#10b981' : '#ef4444', marginTop: 6 }}>
                    {trend >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                    {Math.abs(trend)}% {trendLabel || ''}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// Mini Bar Chart — compact spend/WO trend sparkline
// ═══════════════════════════════════════════════════════════════════════════
export function MiniBarChart({ data, valueKey, labelKey, color, height = 140 }) {
    const { t } = useTranslation();
    if (!data || data.length === 0) return <div style={{ color: '#475569', fontSize: '0.8rem', padding: 20, textAlign: 'center' }}>{t('corpAnalytics.text.noTrendData', 'No trend data')}</div>;
    const max = Math.max(...data.map(d => d[valueKey] || 0), 1);
    return (
        <div style={{ height, display: 'flex', alignItems: 'flex-end', gap: 3, padding: '0 2px' }}>
            {data.map((d, i) => {
                const val = d[valueKey] || 0;
                const barH = Math.max((val / max) * (height - 24), 2);
                return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                        <div title={`${d[labelKey]}: ${typeof val === 'number' && val > 100 ? fmt(val) : val}`} style={{
                            width: '100%', maxWidth: 32, height: barH, borderRadius: '3px 3px 0 0',
                            background: `linear-gradient(180deg, ${color}, ${color}88)`,
                            transition: 'height 0.4s ease', cursor: 'default',
                        }} />
                        <span style={{ fontSize: '0.5rem', color: '#475569', whiteSpace: 'nowrap' }}>
                            {(d[labelKey] || '').replace(/^\d{4}-/, '')}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// Plant Score Badge — Excellent / Good / Needs Attention
// ═══════════════════════════════════════════════════════════════════════════
export function PlantScoreBadge({ score }) {
    const { t } = useTranslation();
    const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';
    const label = score >= 80 ? t('common.excellent', 'Excellent') : score >= 60 ? t('common.good', 'Good') : t('common.needsAttention', 'Needs Attention');
    return (
        <span style={{
            padding: '2px 8px', borderRadius: 8, fontSize: '0.65rem', fontWeight: 700,
            background: color + '18', color, border: '1px solid ' + color + '30',
        }}>{score} · {label}</span>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// Severity Badge — critical / high / medium / low risk pill
// ═══════════════════════════════════════════════════════════════════════════
export function SeverityBadge({ severity }) {
    return (
        <span style={{
            padding: '2px 8px', borderRadius: 6, fontSize: '0.62rem', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.04em',
            background: (SEV_COLORS[severity] || '#64748b') + '18',
            color: SEV_COLORS[severity] || '#64748b',
        }}>{severity}</span>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// Plant Spend Table — sortable, filterable cross-plant spend breakdown
// ═══════════════════════════════════════════════════════════════════════════
export function PlantSpendTable({ plants }) {
    const { t } = useTranslation();
    const [sortKey, setSortKey] = useState('totalSpend');
    const [sortDir, setSortDir] = useState('desc');
    const [filter, setFilter] = useState('');

    const toggle = (key) => {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('desc'); }
    };

    const sorted = useMemo(() => {
        let list = filter ? plants.filter(p => p.plant.toLowerCase().includes(filter.toLowerCase())) : plants;
        return [...list].sort((a, b) => {
            const av = a[sortKey] ?? 0, bv = b[sortKey] ?? 0;
            if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
            return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av > bv ? -1 : 1);
        });
    }, [plants, sortKey, sortDir, filter]);

    const cols = [
        { key: 'plant',          label: t('corpAnalytics.plant', 'Plant'),                              align: 'left'  },
        { key: 'totalSpend',     label: t('corpAnalytics.text.totalSpend', 'Total Spend'),               align: 'right' },
        { key: 'laborCost',      label: t('corpAnalytics.labels.labor', 'Labor'),                        align: 'right' },
        { key: 'partsCost',      label: t('corpAnalytics.labels.parts', 'Parts'),                        align: 'right' },
        { key: 'miscCost',       label: t('corpAnalytics.text.misc', 'Misc'),                            align: 'right' },
        { key: 'inventoryValue', label: t('corpAnalytics.inventory', 'Inventory'),                       align: 'right' },
    ];

    const headStyle = (key) => ({
        cursor: 'pointer', padding: '8px 10px', textAlign: cols.find(c => c.key === key)?.align || 'left',
        fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
        color: sortKey === key ? '#f1f5f9' : '#64748b', borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: sortKey === key ? 'rgba(99,102,241,0.08)' : 'transparent',
        whiteSpace: 'nowrap', userSelect: 'none',
    });

    return (
        <>
            <div style={{ marginBottom: 10 }}>
                <input
                    type="text" placeholder={t('corpAnalytics.filterPlantsPlaceholder')} value={filter} onChange={e => setFilter(e.target.value)}
                    style={{
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 8, padding: '6px 12px', color: '#f1f5f9', fontSize: '0.78rem', width: 220,
                        outline: 'none',
                    }}
                />
                <span style={{ fontSize: '0.72rem', color: '#64748b', marginLeft: 10 }}>
                    {t('corpAnalytics.text.ofNPlants', '{{count}} of {{total}} plants').replace('{{count}}', sorted.length).replace('{{total}}', plants.length)}
                </span>
            </div>
            <div style={{ maxHeight: 400, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                        <tr>
                            <th style={{ ...headStyle('_rank'), cursor: 'default', color: '#475569', width: 34 }}>#</th>
                            {cols.map(c => (
                                <th key={c.key} onClick={() => toggle(c.key)} style={headStyle(c.key)}>
                                    {c.label} {sortKey === c.key ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map((p, i) => (
                            <tr key={p.plant} style={{
                                borderBottom: '1px solid rgba(255,255,255,0.03)',
                                background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                            }}>
                                <td style={{ padding: '7px 10px', color: '#475569', fontSize: '0.7rem' }}>{i + 1}</td>
                                <td style={{ padding: '7px 10px', fontWeight: 600 }}>{p.plant}</td>
                                <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{fmt(p.totalSpend)}</td>
                                <td style={{ padding: '7px 10px', textAlign: 'right', color: '#3b82f6' }}>{fmt(p.laborCost)}</td>
                                <td style={{ padding: '7px 10px', textAlign: 'right', color: '#8b5cf6' }}>{fmt(p.partsCost)}</td>
                                <td style={{ padding: '7px 10px', textAlign: 'right', color: '#94a3b8' }}>{fmt(p.miscCost)}</td>
                                <td style={{ padding: '7px 10px', textAlign: 'right', color: '#f59e0b' }}>{fmt(p.inventoryValue)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// Access Manager — Creator-only whitelist panel for corporate analytics
// ═══════════════════════════════════════════════════════════════════════════
export function AccessManager({ isCreator }) {
    const { t } = useTranslation();
    const [accessList, setAccessList] = useState([]);
    const [searchQ, setSearchQ] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [expanded, setExpanded] = useState(false);

    const fetchAccess = () => { API('/access/list').then(r => r.json()).then(d => setAccessList(Array.isArray(d) ? d : [])).catch(e => console.warn('[CorporateAnalyticsView] fetch error:', e)); };
    useEffect(() => { if (isCreator) fetchAccess(); }, [isCreator]);

    const handleSearch = async (q) => {
        setSearchQ(q);
        if (q.length < 2) { setSearchResults([]); return; }
        try {
            const r = await API('/access/search-users?q=' + encodeURIComponent(q));
            const d = await r.json();
            setSearchResults(Array.isArray(d) ? d : []);
        } catch { setSearchResults([]); }
    };

    const grantAccess = async (user) => {
        await API('/access/grant', {
            method: 'POST',
            body: JSON.stringify({ userId: user.UserID, username: user.Username, displayName: user.DisplayName }),
        });
        setSearchQ(''); setSearchResults([]);
        fetchAccess();
    };

    const revokeAccess = async (userId) => {
        await API('/access/revoke/' + userId, { method: 'DELETE' });
        fetchAccess();
    };

    if (!isCreator) return null;

    return (
        <div className="glass-card" style={{ padding: 20 }}>
            <div onClick={() => setExpanded(!expanded)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Lock size={18} color="#ef4444" />
                </div>
                <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9' }}>{t('corpAnalytics.text.accessManagement', 'Access Management')}<span style={{ fontWeight: 400, color: '#64748b', fontSize: '0.75rem' }}>({accessList.length} executive{accessList.length !== 1 ? 's' : ''})</span>
                    </h3>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{t('corpAnalytics.text.onlyYouCanManageWhoSeesCorpora', 'Only you can manage who sees Corporate Analytics')}</div>
                </div>
                {expanded ? <ChevronDown size={16} color="#64748b" /> : <ChevronRight size={16} color="#64748b" />}
            </div>

            {expanded && (
                <div style={{ marginTop: 16 }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                        <div style={{ flex: 1, position: 'relative' }}>
                            <Search size={14} style={{ position: 'absolute', left: 10, top: 9, color: '#475569' }} />
                            <input value={searchQ} onChange={e => handleSearch(e.target.value)}
                                placeholder={t('corpAnalytics.searchUsersToGrantAccessPlaceholder')}
                                style={{
                                    width: '100%', padding: '8px 10px 8px 30px', borderRadius: 8,
                                    border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.04)',
                                    color: 'white', fontSize: '0.82rem',
                                }} />
                            {searchResults.length > 0 && (
                                <div style={{
                                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                                    background: '#1e1b4b', border: '1px solid rgba(99,102,241,0.3)',
                                    borderRadius: 10, marginTop: 4, maxHeight: 200, overflow: 'auto',
                                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                                }}>
                                    {searchResults.map(u => (
                                        <div key={u.UserID} onClick={() => grantAccess(u)}
                                            style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                                            onMouseOver={e => e.currentTarget.style.background = 'rgba(99,102,241,0.15)'}
                                            onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{u.DisplayName || u.Username}</div>
                                                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{u.Title || u.DefaultRole} · {u.Email || ''}</div>
                                            </div>
                                            <Plus size={16} color="#10b981" />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(239,68,68,0.06)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)' }}>
                            <Crown size={16} color="#f59e0b" />
                            <span style={{ fontWeight: 700, fontSize: '0.82rem', flex: 1 }}>{t('corpAnalytics.text.systemCreator', 'System Creator')}</span>
                            <span style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 600 }}>{t('corpAnalytics.text.pERMANENT', 'PERMANENT')}</span>
                        </div>
                        {accessList.map(a => (
                            <div key={a.ID} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid var(--glass-border)' }}>
                                <Users size={14} color="#6366f1" />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{a.DisplayName || a.Username}</div>
                                    <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Granted {new Date(a.GrantedAt).toLocaleDateString()} by {a.GrantedBy}</div>
                                </div>
                                <button title="Button action" onClick={() => revokeAccess(a.UserID)} className="btn-danger" style={{ padding: '3px 10px', fontSize: '0.7rem' }}>{t('corpAnalytics.text.revoke', 'Revoke')}</button>
                            </div>
                        ))}
                        {accessList.length === 0 && <div style={{ fontSize: '0.78rem', color: '#475569', fontStyle: 'italic', padding: 8 }}>{t('corpAnalytics.text.noExecutivesAddedYetUseTheSear', 'No executives added yet. Use the search above to grant access.')}</div>}
                    </div>
                </div>
            )}
        </div>
    );
}
