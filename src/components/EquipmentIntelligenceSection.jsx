// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS — Equipment Intelligence Section
 * ==========================================
 * Renders OT/SCADA metric rollup cards inside CorporateAnalyticsView.
 * Data comes from PlantMetricSummary in corporate_master.db — pre-aggregated
 * snapshots created by metric-rollup.js at 08:00 and 15:00 daily.
 *
 * DISPLAYS:
 *   - KPI grid: one card per metric bucket showing latest avg across all plants
 *   - Per-plant breakdown table: avg/min/max per bucket for the selected date range
 *   - Last-updated timestamp + manual sync button (POST /api/corp-analytics/sync)
 *
 * API CALLS:
 *   GET  /api/corp-analytics/equipment-intelligence?from=&to=
 *   POST /api/corp-analytics/sync  { date? }
 *
 * I18N: All user-visible strings use t(key, fallback) from useTranslation().
 *   Keys live under "equipmentIntel.*" in src/i18n/en.json (and all language files).
 *   Bucket labels are under "equipmentIntel.bucket.*".
 *
 * BUCKET DISPLAY CONFIG:
 *   temperature → °F avg   | speed → u/min avg  | level → % avg
 *   pressure → PSI avg      | power → kW avg     | oee → % avg
 *   downtime → min          | production → count | alarms → count
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../i18n/index.jsx';
import {
    Thermometer, Gauge, Droplets, Wind, Zap, BarChart3,
    Clock, Package, AlertTriangle, RefreshCw, CheckCircle,
} from 'lucide-react';

// ── API helper ────────────────────────────────────────────────────────────────

const API = (path, opts = {}) => fetch(`/api/corp-analytics${path}`, {
    ...opts,
    headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        'Content-Type': 'application/json',
        ...opts.headers,
    },
});

// ── Bucket configuration ──────────────────────────────────────────────────────

/**
 * Static display config per corporate metric bucket.
 * Labels are looked up via t() at render time using the i18nKey field.
 * Units and format functions are locale-independent so we keep them here.
 */
const BUCKET_CONFIG = {
    temperature: { i18nKey: 'equipmentIntel.bucket.temperature', icon: Thermometer, color: '#f59e0b', fmt: v => `${v}°F`  },
    speed:       { i18nKey: 'equipmentIntel.bucket.speed',       icon: Gauge,        color: '#0ea5e9', fmt: v => `${v} u/m` },
    level:       { i18nKey: 'equipmentIntel.bucket.level',       icon: Droplets,     color: '#6366f1', fmt: v => `${v}%`   },
    pressure:    { i18nKey: 'equipmentIntel.bucket.pressure',    icon: Wind,         color: '#10b981', fmt: v => `${v} PSI` },
    power:       { i18nKey: 'equipmentIntel.bucket.power',       icon: Zap,          color: '#a78bfa', fmt: v => `${v} kW`  },
    oee:         { i18nKey: 'equipmentIntel.bucket.oee',         icon: BarChart3,    color: '#10b981', fmt: v => `${v}%`   },
    downtime:    { i18nKey: 'equipmentIntel.bucket.downtime',    icon: Clock,        color: '#ef4444', fmt: v => `${v} min` },
    production:  { i18nKey: 'equipmentIntel.bucket.production',  icon: Package,      color: '#0ea5e9', fmt: v => `${v}`    },
    alarms:      { i18nKey: 'equipmentIntel.bucket.alarms',      icon: AlertTriangle,color: '#f97316', fmt: v => `${v}`    },
    general:     { i18nKey: 'equipmentIntel.bucket.general',     icon: BarChart3,    color: '#64748b', fmt: v => `${v}`    },
};

// ── KPI Card ──────────────────────────────────────────────────────────────────

/**
 * Single metric bucket KPI card.
 * Shows avg value across all plants for the most recent date in the dataset.
 *
 * @param {{ bucket: string, rows: object[], latestDate: string }} props
 */
function KpiCard({ bucket, rows, latestDate }) {
    const { t } = useTranslation();
    const cfg  = BUCKET_CONFIG[bucket] || BUCKET_CONFIG.general;
    const Icon = cfg.icon;
    const label = t(cfg.i18nKey, bucket);

    // Cross-plant average using only the most recent date's rows
    const latestRows = rows.filter(r => r.PeriodDate === latestDate);
    const avgAll = latestRows.length
        ? Math.round(latestRows.reduce((s, r) => s + (r.AvgValue || 0), 0) / latestRows.length * 10) / 10
        : null;

    return (
        <div style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 8,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 30, height: 30, borderRadius: 7, background: `${cfg.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={15} color={cfg.color} />
                </div>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>{label}</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: cfg.color, lineHeight: 1 }}>
                {avgAll !== null ? cfg.fmt(avgAll) : '—'}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#475569' }}>
                avg · {latestRows.length} {t('equipmentIntel.plantColumn', 'Plant').toLowerCase()}{latestRows.length !== 1 ? 's' : ''}
                {latestDate ? ` · ${latestDate}` : ''}
            </div>
        </div>
    );
}

// ── Per-Plant Table ───────────────────────────────────────────────────────────

/**
 * Table showing each plant's avg value per metric bucket for a selected date.
 *
 * @param {{ rows: object[], date: string, plants: string[], buckets: string[] }} props
 */
function PlantTable({ rows, date, plants, buckets }) {
    const { t } = useTranslation();
    const dateRows = rows.filter(r => r.PeriodDate === date);

    if (dateRows.length === 0) {
        return (
            <div style={{ color: '#64748b', fontSize: '0.82rem', padding: '12px 0' }}>
                {t('equipmentIntel.noDataForDate', 'No data for')} {date}
            </div>
        );
    }

    // Build index: plant → bucket → row for O(1) cell lookup
    const idx = {};
    for (const row of dateRows) {
        if (!idx[row.PlantID]) idx[row.PlantID] = {};
        idx[row.PlantID][row.MetricBucket] = row;
    }

    const displayBuckets = buckets.filter(b => b !== 'general').slice(0, 8);

    return (
        <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <th style={{ textAlign: 'left', padding: '6px 10px', color: '#64748b', fontWeight: 600 }}>
                            {t('equipmentIntel.plantColumn', 'Plant')}
                        </th>
                        {displayBuckets.map(b => {
                            const cfg = BUCKET_CONFIG[b] || BUCKET_CONFIG.general;
                            return (
                                <th key={b} style={{ textAlign: 'right', padding: '6px 10px', color: '#64748b', fontWeight: 600 }}>
                                    {t(cfg.i18nKey, b)}
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody>
                    {plants.map(plant => (
                        <tr key={plant} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <td style={{ padding: '6px 10px', color: '#e2e8f0', fontWeight: 600 }}>{plant}</td>
                            {displayBuckets.map(b => {
                                const row = idx[plant]?.[b];
                                const cfg = BUCKET_CONFIG[b] || BUCKET_CONFIG.general;
                                return (
                                    <td key={b} style={{ padding: '6px 10px', textAlign: 'right', color: row ? '#cbd5e1' : '#334155' }}>
                                        {row ? cfg.fmt(Math.round(row.AvgValue * 10) / 10) : '—'}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────

/**
 * EquipmentIntelligenceSection
 * Embedded section inside CorporateAnalyticsView.
 * Fetches PlantMetricSummary data and renders KPI cards + per-plant table.
 */
export default function EquipmentIntelligenceSection() {
    const { t } = useTranslation();
    const [data, setData]         = useState(null);
    const [loading, setLoading]   = useState(true);
    const [syncing, setSyncing]   = useState(false);
    const [syncMsg, setSyncMsg]   = useState('');
    const [selectedDate, setSelectedDate] = useState('');

    // Default date range: last 7 days
    const today   = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const [from, setFrom] = useState(weekAgo);
    const [to, setTo]     = useState(today);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await API(`/equipment-intelligence?from=${from}&to=${to}`);
            const d = await r.json();
            setData(d);
            // Default the selected date to the most recent date present in results
            if (d.rows?.length && !selectedDate) {
                const dates = [...new Set(d.rows.map(r => r.PeriodDate))].sort().reverse();
                setSelectedDate(dates[0] || today);
            }
        } catch (_) {
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [from, to]);

    useEffect(() => { load(); }, [load]);

    const runSync = async () => {
        setSyncing(true);
        setSyncMsg('');
        try {
            const r = await API('/sync', { method: 'POST' });
            const d = await r.json();
            if (d.ok) {
                setSyncMsg(`${d.plantCount} plants, ${d.rowCount} metrics updated`);
                load();
            } else {
                setSyncMsg(d.error || 'Sync failed');
            }
        } catch (err) {
            setSyncMsg(err.message);
        } finally {
            setSyncing(false);
        }
    };

    const buckets    = data?.buckets || [];
    const plants     = data?.plants  || [];
    const rows       = data?.rows    || [];
    const latestDate = [...new Set(rows.map(r => r.PeriodDate))].sort().reverse()[0] || '';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Section header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Zap size={16} color="#f59e0b" />
                        {t('equipmentIntel.title', 'Equipment Intelligence')}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {t('equipmentIntel.subtitle', 'OT/SCADA sensor rollups — updated 8:00 AM & 3:00 PM daily')}
                    </div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '4px 8px', color: '#e2e8f0', fontSize: '0.78rem', cursor: 'pointer' }} />
                    <span style={{ color: '#475569', fontSize: '0.78rem' }}>→</span>
                    <input type="date" value={to} onChange={e => setTo(e.target.value)}
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '4px 8px', color: '#e2e8f0', fontSize: '0.78rem', cursor: 'pointer' }} />
                    <button onClick={load}
                        style={{ padding: '5px 10px', background: 'none', border: '1px solid rgba(255,255,255,0.12)', color: '#64748b', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem' }}>
                        <RefreshCw size={12} />
                    </button>
                    <button onClick={runSync} disabled={syncing}
                        style={{ padding: '5px 12px', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)', color: '#10b981', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', fontWeight: 600 }}>
                        <CheckCircle size={12} />
                        {syncing
                            ? t('equipmentIntel.syncing', 'Syncing…')
                            : t('equipmentIntel.syncNow', 'Sync Now')}
                    </button>
                </div>
            </div>

            {/* Sync feedback */}
            {syncMsg && (
                <div style={{ fontSize: '0.78rem', color: '#10b981', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 6, padding: '6px 10px' }}>
                    {syncMsg}
                </div>
            )}

            {/* Loading state */}
            {loading ? (
                <div style={{ color: '#64748b', fontSize: '0.85rem', textAlign: 'center', padding: 30 }}>
                    {t('equipmentIntel.loading', 'Loading metrics…')}
                </div>

            /* Empty state */
            ) : rows.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 20px', color: '#64748b' }}>
                    <Zap size={32} color="#1e293b" style={{ marginBottom: 8 }} />
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        {t('equipmentIntel.noDataTitle', 'No equipment data yet')}
                    </div>
                    <div style={{ fontSize: '0.8rem', marginBottom: 12 }}>
                        {t('equipmentIntel.noDataHint', 'Register devices in Plant Setup and start a worker. Data appears after the next rollup (8am or 3pm) or after Sync Now.')}
                    </div>
                </div>

            /* Data view */
            ) : (
                <>
                    {/* KPI grid — one card per bucket */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                        {buckets.filter(b => b !== 'general').map(b => (
                            <KpiCard key={b} bucket={b} rows={rows} latestDate={latestDate} />
                        ))}
                    </div>

                    {/* Per-plant breakdown table */}
                    {plants.length > 0 && (
                        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: 14 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#94a3b8' }}>
                                    {t('equipmentIntel.perPlantBreakdown', 'Per-Plant Breakdown')}
                                </span>
                                <select value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                                    style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '3px 8px', color: '#e2e8f0', fontSize: '0.75rem', cursor: 'pointer' }}>
                                    {[...new Set(rows.map(r => r.PeriodDate))].sort().reverse().map(d => (
                                        <option key={d} value={d}>{d}</option>
                                    ))}
                                </select>
                            </div>
                            <PlantTable
                                rows={rows}
                                date={selectedDate || latestDate}
                                plants={plants}
                                buckets={buckets}
                            />
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
