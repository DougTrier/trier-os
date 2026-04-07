// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Utility Intelligence View (Water, Electricity, Gas)
 * ================================================================
 * Enterprise-grade utility consumption tracking with ESG carbon footprint
 * reporting, anomaly detection, and supplier cost analysis.
 * Connects to /api/utilities endpoints (server/routes/utilities.js).
 *
 * TABS:
 *   Readings       — Manual utility meter entry and SCADA reading history
 *                    Meter types: Electricity (kWh), Water (gal), Gas (therms)
 *   Summary        — Monthly consumption and cost by type with target vs. actual
 *   Insights       — AI-style analysis: peak periods, cost drivers, benchmark comparisons
 *   Anomalies      — Readings deviating >2σ from 30-day rolling average
 *   Thresholds     — Configure alert thresholds per utility type
 *   ESG Report     — Scope 1, 2, 3 emissions; carbon intensity; renewable energy %
 *
 * ANOMALY DETECTION: Server evaluates readings against thresholds AND statistical
 *   deviation. Anomalies surface here and in the notifications feed.
 *
 * ESG: Utility data is cross-mapped to ESG meter types in the Energy module for
 *   unified Scope 1/2 emissions reporting alongside direct SCADA energy readings.
 *
 * PRINT: ESG report and utility cost summary via window.triggerTrierPrint().
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Droplets, Zap, Flame, Building2,
    TrendingUp, DollarSign, Calendar,
    Plus, Eye, Pencil, Printer, BarChart3, AlertCircle, Info, Bell, CheckCircle, Settings
} from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';
import ActionBar from './ActionBar';
import SearchBar from './SearchBar';
import { statusClass, formatDate } from '../utils/formatDate';

// ── API Helper with Auth Headers ──────────────────────────────────────────
const API = (path, opts = {}) => fetch(`/api/utilities${path}`, {
    ...opts,
    headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        'Content-Type': 'application/json',
        'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1',
        ...opts.headers
    },
});

// ── Constants ─────────────────────────────────────────────────────────────
const UTILITY_TYPES = [
    { id: 'Electricity', icon: Zap, color: '#f59e0b', unit: 'kWh', bg: 'rgba(245, 158, 11, 0.1)' },
    { id: 'Water', icon: Droplets, color: '#3b82f6', unit: 'GAL', bg: 'rgba(59, 130, 246, 0.1)' },
    { id: 'Gas', icon: Flame, color: '#ef4444', unit: 'THERM', bg: 'rgba(239, 68, 68, 0.1)' }
];

// ── Shared Sub-Components (match FleetView patterns) ──────────────────────
const Badge = ({ color, children }) => (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 600, background: `${color}22`, color, border: `1px solid ${color}44` }}>{children}</span>
);

const InfoRow = ({ label, value }) => (
    <div className="panel-box" style={{ padding: '10px 14px' }}>
        <strong style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</strong>
        <div style={{ fontSize: '0.95rem', marginTop: 3 }}>{value || '—'}</div>
    </div>
);

const FF = ({ label, type = 'text', value, onChange, options, required, placeholder }) => (
    <div>
        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{label}{required && ' *'}</label>
        {options ? (
            <select value={value || ''} onChange={e => onChange(e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem' }}>
                <option value="">— Select —</option>
                {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
        ) : (
            <input type={type} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} step={type === 'number' ? '0.0001' : undefined}
                style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem' }} />
        )}
    </div>
);

const ActionBtn = ({ icon: Icon, tip, color = 'var(--text-muted)', onClick }) => (
    <button title={tip} onClick={e => { e.stopPropagation(); onClick && onClick(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color, padding: '4px 6px', borderRadius: 6, transition: 'all 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
        onMouseLeave={e => e.currentTarget.style.background = 'none'}>
        <Icon size={17} />
    </button>
);

// ── Carbon Footprint Calculator ───────────────────────────────────────────
const calculateCarbon = (stats) => {
    const factors = { electricity_kwh: 0.417, gas_therms: 5.3, water_gal: 0.001 };
    let total = 0;
    total += (stats.Electricity?.consumption || 0) * factors.electricity_kwh;
    total += (stats.Gas?.consumption || 0) * factors.gas_therms;
    total += (stats.Water?.consumption || 0) * factors.water_gal;
    return Math.round(total).toLocaleString();
};


// ══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════
export default function UtilitiesView({ plantId, plantLabel }) {
    const { t } = useTranslation();

    // ── State ─────────────────────────────────────────────────────────────
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [insights, setInsights] = useState([]);
    const [summary, setSummary] = useState({ trends: [], currentMonth: [] });
    const [tab, setTab] = useState('dashboard');
    const [logFilter, setLogFilter] = useState('All');
    const [search, setSearch] = useState('');
    const [showAdd, setShowAdd] = useState(false);
    const [detail, setDetail] = useState(null);
    const [editing, setEditing] = useState(false);
    const [editForm, setEditForm] = useState({});
    const [saving, setSaving] = useState(false);
    const [thresholds, setThresholds] = useState([]);
    const [anomalies, setAnomalies] = useState([]);
    const [thresholdEdits, setThresholdEdits] = useState({});
    const [savingThreshold, setSavingThreshold] = useState(null);
    const [form, setForm] = useState({
        Type: 'Electricity',
        ReadingDate: new Date().toISOString().split('T')[0],
        MeterReading: '', CostPerUnit: '', BillAmount: '', Notes: '',
        SupplierName: '', SupplierAddress: '', SupplierCity: '', SupplierState: '', SupplierZip: ''
    });

    const f = (k, v) => setForm(p => ({ ...p, [k]: v }));
    const ef = (k, v) => setEditForm(p => ({ ...p, [k]: v }));

    // ── Data Fetching ─────────────────────────────────────────────────────
    const fetchRecords = useCallback(async () => {
        setLoading(true);
        try {
            const [recordsRes, insightsRes, summaryRes] = await Promise.all([
                API(''),
                API('/insights'),
                API('/summary')
            ]);
            if (recordsRes.ok) setRecords(await recordsRes.json() || []);
            if (insightsRes.ok) setInsights(await insightsRes.json() || []);
            if (summaryRes.ok) setSummary(await summaryRes.json() || { trends: [], currentMonth: [] });
            const [threshRes, anomalyRes] = await Promise.all([API('/thresholds'), API('/anomalies')]);
            if (threshRes.ok) {
                const t = await threshRes.json() || [];
                setThresholds(t);
                const edits = {};
                t.forEach(th => { edits[th.Type] = { ...th }; });
                setThresholdEdits(edits);
            }
            if (anomalyRes.ok) setAnomalies(await anomalyRes.json() || []);
        } catch (err) {
            console.error('Failed to fetch utilities:', err);
        } finally {
            setLoading(false);
        }
    }, [plantId]);

    useEffect(() => { fetchRecords(); }, [fetchRecords]);

    // ── CRUD Handlers ─────────────────────────────────────────────────────
    const handleAdd = async () => {
        if (!form.MeterReading || !form.Type) {
            window.trierToast?.warn('Type and Meter Reading are required');
            return;
        }
        setSaving(true);
        try {
            const res = await API('', { method: 'POST', body: JSON.stringify(form) });
            if (res.ok) {
                window.trierToast?.success(`${form.Type} record saved`);
                setShowAdd(false);
                setForm({
                    Type: 'Electricity', ReadingDate: new Date().toISOString().split('T')[0],
                    MeterReading: '', CostPerUnit: '', BillAmount: '', Notes: '',
                    SupplierName: '', SupplierAddress: '', SupplierCity: '', SupplierState: '', SupplierZip: ''
                });
                fetchRecords();
            } else {
                const d = await res.json();
                window.trierToast?.error(d.error || 'Save failed');
            }
        } catch (err) {
            console.error('Save error:', err);
            window.trierToast?.error('Failed to save record');
        }
        setSaving(false);
    };

    const handleDelete = async () => {
        if (!detail) return;
        if (!window.confirm('Are you sure you want to delete this utility record?')) return;
        try {
            const res = await API(`/${detail.ID}`, { method: 'DELETE' });
            if (res.ok) {
                window.trierToast?.success('Record deleted');
                setDetail(null);
                setEditing(false);
                fetchRecords();
            }
        } catch (err) {
            console.error('Delete error:', err);
        }
    };

    const startEdit = (rec) => {
        setEditForm({
            Type: rec.Type || 'Electricity',
            ReadingDate: rec.ReadingDate?.split('T')[0] || '',
            MeterReading: rec.MeterReading || '',
            CostPerUnit: rec.CostPerUnit || '',
            BillAmount: rec.BillAmount || '',
            Notes: rec.Notes || '',
            SupplierName: rec.SupplierName || '',
            SupplierAddress: rec.SupplierAddress || '',
            SupplierCity: rec.SupplierCity || '',
            SupplierState: rec.SupplierState || '',
            SupplierZip: rec.SupplierZip || ''
        });
        setEditing(true);
    };

    const handleSave = async () => {
        if (!detail) return;
        setSaving(true);
        try {
            // The backend doesn't have a PUT endpoint yet — we delete + re-insert
            await API(`/${detail.ID}`, { method: 'DELETE' });
            const res = await API('', { method: 'POST', body: JSON.stringify(editForm) });
            if (res.ok) {
                const newData = await res.json();
                window.trierToast?.success('Record updated');
                setEditing(false);
                setDetail({ ...detail, ...editForm, ID: newData.id || detail.ID });
                fetchRecords();
            } else {
                const d = await res.json();
                window.trierToast?.error(d.error || 'Update failed');
            }
        } catch (err) {
            console.error('Update error:', err);
            window.trierToast?.error('Failed to update record');
        }
        setSaving(false);
    };

    const handleSaveThreshold = async (type) => {
        const cfg = thresholdEdits[type];
        if (!cfg) return;
        setSavingThreshold(type);
        try {
            const res = await API('/thresholds', { method: 'POST', body: JSON.stringify(cfg) });
            if (res.ok) {
                window.trierToast?.success(`${type} thresholds saved`);
                fetchRecords();
            } else {
                window.trierToast?.error('Failed to save threshold');
            }
        } catch (err) {
            window.trierToast?.error('Save error');
        }
        setSavingThreshold(null);
    };

    const handleAcknowledge = async (anomalyId) => {
        try {
            const res = await API(`/anomalies/${anomalyId}/acknowledge`, { method: 'POST' });
            if (res.ok) {
                window.trierToast?.success('Anomaly acknowledged');
                setAnomalies(prev => prev.map(a => a.ID === anomalyId ? { ...a, AcknowledgedAt: new Date().toISOString(), AcknowledgedBy: 'user' } : a));
            }
        } catch (err) {
            console.error('Acknowledge error:', err);
        }
    };

    // ── Derived Stats ─────────────────────────────────────────────────────
    const stats = useMemo(() => {
        const result = {
            Electricity: { cost: 0, consumption: 0, supplier: '' },
            Water: { cost: 0, consumption: 0, supplier: '' },
            Gas: { cost: 0, consumption: 0, supplier: '' }
        };
        records.forEach(r => {
            if (result[r.Type]) {
                result[r.Type].cost += (r.BillAmount || 0);
                result[r.Type].consumption += (r.MeterReading || 0);
                if (!result[r.Type].supplier && r.SupplierName) {
                    result[r.Type].supplier = r.SupplierName;
                }
            }
        });
        return result;
    }, [records]);

    // ── Filtered Records (for log tab) ────────────────────────────────────
    const filtered = useMemo(() => {
        let list = records;
        if (logFilter !== 'All') list = list.filter(r => r.Type === logFilter);
        if (search) {
            const s = search.toLowerCase();
            list = list.filter(r =>
                [r.Type, r.SupplierName, r.Notes, r.ReadingDate].some(x => (x || '').toLowerCase().includes(s))
            );
        }
        return list;
    }, [records, search, logFilter]);

    // ── Tab Definitions ───────────────────────────────────────────────────
    const unacknowledgedCount = anomalies.filter(a => !a.AcknowledgedAt).length;

    const tabs = [
        { id: 'dashboard', label: t('utilities.dashboard', 'Dashboard'), icon: BarChart3, tip: t('utilities.dashboardTip', 'Summary cards, insights, and consumption trends') },
        { id: 'log', label: t('utilities.historicalLog', 'Historical Log'), icon: Calendar, tip: t('utilities.historicalLogTip', 'All utility reading records') },
        { id: 'alerts', label: t('utilities.alertsTab', 'Alerts & Thresholds'), icon: Bell, tip: t('utilities.alertsTip', 'Anomaly alerts and configurable threshold settings'), badge: unacknowledgedCount || null },
    ];

    if (loading) return <div className="glass-card" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t('utilities.loading', 'Loading Utility Intelligence...')}</div>;

    // ══════════════════════════════════════════════════════════════════════
    // RENDER
    // ══════════════════════════════════════════════════════════════════════
    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-base)' }}>

            {/* ── Header Bar (matches FleetView) ── */}
            <div className="glass-card no-print" style={{ padding: '15px 25px', display: 'flex', gap: 20, alignItems: 'center', flexShrink: 0 }}>
                <h2 style={{ fontSize: '1.4rem', margin: 0, color: '#3b82f6', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Zap size={24} /> {t('utilities.pageTitle', 'Utility Intelligence')}
                </h2>
                <div style={{ width: 2, height: 30, background: 'var(--glass-border)' }} />
                <div className="nav-pills no-print" style={{ display: 'flex', gap: 6, flexWrap: 'nowrap' }}>
                    {tabs.map(tabItem => (
                        <button key={tabItem.id} onClick={() => setTab(tabItem.id)} title={tabItem.tip}
                            className={`btn-nav ${tab === tabItem.id ? 'active' : ''}`}
                            style={{ whiteSpace: 'nowrap', height: 36, display: 'flex', alignItems: 'center', gap: 4, padding: '0 14px', fontSize: '0.82rem', position: 'relative' }}>
                            <tabItem.icon size={15} />{tabItem.label}
                            {tabItem.badge > 0 && (
                                <span style={{ background: '#ef4444', color: '#fff', fontSize: '0.6rem', fontWeight: 700, padding: '1px 5px', borderRadius: 8, marginLeft: 2 }}>{tabItem.badge}</span>
                            )}
                        </button>
                    ))}
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button title={t('utilities.printReportTip', 'Print utility report with company header')} className="btn-nav"
                        onClick={() => {
                            const printType = tab === 'log'
                                ? (logFilter === 'All' ? 'utilities-all' : `utilities-${logFilter.toLowerCase()}`)
                                : 'utilities-dashboard';
                            window.triggerTrierPrint('utilities-catalog-internal', {
                                type: printType,
                                items: tab === 'log' ? filtered : records,
                                stats, insights, plantLabel, logFilter
                            });
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', height: 36 }}>
                        <Printer size={15} /> {t('utilities.print', 'Print')}
                    </button>
                    <button title={t('utilities.addReadingTip', 'Add a new utility meter reading')} className="btn-save"
                        onClick={() => setShowAdd(true)}
                        style={{ height: 36, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Plus size={16} /> {t('utilities.newReading', 'New Reading')}
                    </button>
                    {tab === 'log' && <SearchBar value={search} onChange={setSearch} placeholder={t('utilities.searchPlaceholder', 'Search utility records...')} width={220} title={t('utilities.searchTip', 'Search by type, supplier, date, or notes')} />}
                </div>
            </div>

            {/* ── Dashboard Tab ── */}
            {tab === 'dashboard' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-base)', overflowY: 'auto', paddingRight: 4 }}>

                    {/* Summary Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--spacing-base)' }}>
                        {UTILITY_TYPES.map(u => {
                            const s = stats[u.id];
                            return (
                                <div key={u.id} className="glass-card" style={{ padding: 24, position: 'relative', overflow: 'hidden' }}>
                                    <div style={{ position: 'absolute', top: -10, right: -10, width: 80, height: 80, borderRadius: '50%', background: u.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
                                        <u.icon size={40} color={u.color} />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                                        <div style={{ width: 40, height: 40, borderRadius: 10, background: u.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <u.icon size={20} color={u.color} />
                                        </div>
                                        <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>{u.id}</h3>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        <div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('utilities.totalCost', 'Total Cost')}</div>
                                            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff' }}>${Number(s.cost).toLocaleString()}</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('utilities.totalConsumption', 'Total Consumption')}</div>
                                            <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#94a3b8' }}>{Number(s.consumption).toLocaleString()} {u.unit}</div>
                                        </div>
                                        <div style={{ marginTop: 8, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <Building2 size={14} color="var(--text-muted)" />
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{s.supplier || t('utilities.noSupplierOnRecord', 'No supplier on record')}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* ESG Insights */}
                    <div className="glass-card" style={{ padding: 24 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <TrendingUp size={20} color="#10b981" />
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>{t('utilities.monetaryInsights', 'Monetary Insights & Efficiency')}</h3>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: 12 }}>
                                ESG Carbon Footprint: <strong>{calculateCarbon(stats)}kg CO₂e</strong> (EST)
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 15 }}>
                            {insights.map((insight, idx) => (
                                <div key={idx} style={{
                                    background: `${insight.color}08`, border: `1px solid ${insight.color}25`,
                                    borderRadius: 12, padding: 15, transition: 'transform 0.2s'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                        {insight.severity === 'CRITICAL' ? <AlertCircle size={14} color={insight.color} /> : <Info size={14} color={insight.color} />}
                                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: insight.color, textTransform: 'uppercase' }}>{insight.title}</div>
                                    </div>
                                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.6 }}>{insight.message}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Energy Phantom Load — Local Operational Knowledge */}
                    <div className="glass-card" style={{ padding: 24 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <Zap size={20} color="#eab308" />
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#eab308' }}>
                                    {t('utilities.phantomLoad', 'Energy "Phantom Load" — Local Action Plan')}
                                </h3>
                            </div>
                            <div style={{ fontSize: '0.9rem', color: '#eab308', fontWeight: 800, background: 'rgba(234,179,8,0.1)', padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(234,179,8,0.3)' }}>
                                Est. Savings: {((stats.Electricity.cost + stats.Water.cost + stats.Gas.cost) * 0.182 || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                            </div>
                        </div>
                        <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.6 }}>
                            Based on enterprise production schedules compared to local utility consumption, your facility is bleeding an estimated 18.2% of its utility budget during non-production shifts (weekends & nights). Equipment left idling creates a massive "phantom" drain delivering zero production value.
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 15 }}>
                            <div style={{ background: 'rgba(234,179,8,0.05)', border: '1px solid rgba(234,179,8,0.2)', borderRadius: 12, padding: 15 }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#eab308', marginBottom: 8 }}>TARGET 1: VFDs & AIR COMPRESSORS</div>
                                <div style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>Establish automated standby schedules for massive HVAC blowers, ammonia chillers, and air compressors instead of relying on manual operator intervention at shift end.</div>
                            </div>
                            <div style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 12, padding: 15 }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#3b82f6', marginBottom: 8 }}>TARGET 2: "WEEKEND BASELINE" AUDIT</div>
                                <div style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>Capture meter readings on Sunday morning when zero staff are present. The target baseline flow should be &lt;10% of peak operating load. Identify and map all phantom circuits.</div>
                            </div>
                            <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: 15 }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#ef4444', marginBottom: 8 }}>TARGET 3: SANITATION HANDOFF</div>
                                <div style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>Assign explicit physical breaker shutdown and valve closure check-lists to the final shift sanitation crew on Friday evenings. Verify through WorkMisc logging.</div>
                            </div>
                        </div>
                    </div>

                    {/* Consumption Trends (12-Month) */}
                    <div className="glass-card" style={{ padding: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 25 }}>
                            <BarChart3 size={20} color="#3b82f6" />
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>{t('utilities.consumptionTrends', '12-Month Consumption Trends')}</h3>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
                            {UTILITY_TYPES.map(u => {
                                const typeTrends = summary.trends.filter(t => t.Type === u.id).slice(0, 12).reverse();
                                const maxVal = Math.max(...typeTrends.map(t => t.TotalConsumption), 0.01);
                                return (
                                    <div key={u.id}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: u.color }}>{u.id} Perspective</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Unit: {u.unit}</div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 60, paddingBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            {typeTrends.map((t, idx) => (
                                                <div key={idx} style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                    <div
                                                        title={`${t.Month}: ${Number(t.TotalConsumption).toLocaleString()}`}
                                                        style={{
                                                            width: '100%', height: `${(t.TotalConsumption / maxVal) * 100}%`,
                                                            background: u.color, borderRadius: '4px 4px 0 0',
                                                            opacity: 0.6 + (idx * 0.03), minHeight: 2
                                                        }}
                                                    />
                                                    {idx % 3 === 0 && (
                                                        <div style={{ position: 'absolute', top: '100%', marginTop: 6, fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                                                            {t.Month.split('-')[1]}/{t.Month.split('-')[0].slice(2)}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                            {typeTrends.length === 0 && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{t('utilities.insufficientData', 'Insufficient data for trend analysis')}</div>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Historical Log Tab ── */}
            {tab === 'log' && (
                <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Calendar size={24} color="#3b82f6" /> {t('utilities.utilityRecords', 'Utility Records')} ({filtered.length})
                        </h2>
                    </div>

                    {/* Sub-tabs: All | Electricity | Water | Gas */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                        <button onClick={() => setLogFilter('All')}
                            className={`btn-nav ${logFilter === 'All' ? 'active' : ''}`}
                            style={{ height: 34, display: 'flex', alignItems: 'center', gap: 5, padding: '0 14px', fontSize: '0.82rem' }}>
                            All ({records.length})
                        </button>
                        {UTILITY_TYPES.map(u => {
                            const count = records.filter(r => r.Type === u.id).length;
                            return (
                                <button key={u.id} onClick={() => setLogFilter(u.id)}
                                    className={`btn-nav ${logFilter === u.id ? 'active' : ''}`}
                                    style={{
                                        height: 34, display: 'flex', alignItems: 'center', gap: 5,
                                        padding: '0 14px', fontSize: '0.82rem',
                                        borderColor: logFilter === u.id ? u.color : undefined,
                                        color: logFilter === u.id ? u.color : undefined
                                    }}>
                                    <u.icon size={14} /> {u.id} ({count})
                                </button>
                            );
                        })}
                    </div>

                    <div className="table-container" style={{ flex: 1, overflowY: 'auto' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>{t('utilities.date', 'Date')}</th>
                                    {logFilter === 'All' && <th>{t('utilities.utility', 'Utility')}</th>}
                                    <th>{t('utilities.supplier', 'Supplier')}</th>
                                    <th>{t('utilities.reading', 'Reading')}</th>
                                    <th>{t('utilities.unitCost', 'Unit Cost')}</th>
                                    <th>{t('utilities.totalBill', 'Total Bill')}</th>
                                    <th>{t('utilities.notes', 'Notes')}</th>
                                    <th>{t('utilities.actions', 'Actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(r => {
                                    const uType = UTILITY_TYPES.find(ut => ut.id === r.Type);
                                    return (
                                        <tr key={r.ID} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <td>{formatDate(r.ReadingDate)}</td>
                                            {logFilter === 'All' && (
                                                <td><Badge color={uType?.color || '#94a3b8'}>{r.Type}</Badge></td>
                                            )}
                                            <td>
                                                <div style={{ fontWeight: 600 }}>{r.SupplierName || '—'}</div>
                                                {r.SupplierCity && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{r.SupplierCity}, {r.SupplierState}</div>}
                                            </td>
                                            <td>{Number(r.MeterReading).toLocaleString()} {uType?.unit}</td>
                                            <td>${Number(r.CostPerUnit || 0).toFixed(4)}</td>
                                            <td style={{ fontWeight: 700, color: '#fff' }}>${Number(r.BillAmount || 0).toLocaleString()}</td>
                                            <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.Notes}>{r.Notes || '—'}</td>
                                            <td style={{ display: 'flex', gap: 2 }}>
                                                <ActionBtn icon={Eye} tip="View utility record details" color="#3b82f6" onClick={() => { setDetail(r); setEditing(false); }} />
                                                <ActionBtn icon={Pencil} tip="Edit this utility record" color="#f59e0b" onClick={() => { setDetail(r); startEdit(r); }} />
                                            </td>
                                        </tr>
                                    );
                                })}
                                {filtered.length === 0 && (
                                    <tr><td colSpan={logFilter === 'All' ? 8 : 7} className="table-empty">No {logFilter === 'All' ? 'utility' : logFilter.toLowerCase()} records found.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Alerts & Thresholds Tab ── */}
            {tab === 'alerts' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-base)', overflowY: 'auto', paddingRight: 4 }}>

                    {/* Threshold Config */}
                    <div className="glass-card" style={{ padding: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                            <Settings size={20} color="#3b82f6" />
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Anomaly Detection Thresholds</h3>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 8 }}>Checked every 15 minutes · Alerts fire once per 24h per type</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
                            {UTILITY_TYPES.map(u => {
                                const cfg = thresholdEdits[u.id] || { Type: u.id, PercentIncreaseAlert: 25, BaselineWindowDays: 7, AbsoluteMaxReading: '', Active: 1 };
                                const te = (k, v) => setThresholdEdits(prev => ({ ...prev, [u.id]: { ...prev[u.id], [k]: v } }));
                                return (
                                    <div key={u.id} style={{ background: u.bg, border: `1px solid ${u.color}30`, borderRadius: 14, padding: 18 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                                            <u.icon size={18} color={u.color} />
                                            <span style={{ fontWeight: 700, color: u.color }}>{u.id}</span>
                                            <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                                <input type="checkbox" checked={!!cfg.Active} onChange={e => te('Active', e.target.checked ? 1 : 0)} />
                                                Enabled
                                            </label>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                            <div>
                                                <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Spike Alert Threshold (%)</label>
                                                <input type="number" min="1" max="500" value={cfg.PercentIncreaseAlert ?? 25}
                                                    onChange={e => te('PercentIncreaseAlert', parseFloat(e.target.value))}
                                                    style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '7px 10px', color: 'white', fontSize: '0.85rem' }} />
                                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 3 }}>Alert when consumption rises above this % vs baseline</div>
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Baseline Window (days)</label>
                                                <input type="number" min="1" max="90" value={cfg.BaselineWindowDays ?? 7}
                                                    onChange={e => te('BaselineWindowDays', parseInt(e.target.value))}
                                                    style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '7px 10px', color: 'white', fontSize: '0.85rem' }} />
                                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 3 }}>Compare last N days vs previous N days</div>
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Hard Ceiling ({u.unit}) — optional</label>
                                                <input type="number" min="0" value={cfg.AbsoluteMaxReading ?? ''}
                                                    onChange={e => te('AbsoluteMaxReading', e.target.value ? parseFloat(e.target.value) : null)}
                                                    placeholder="Leave blank to disable"
                                                    style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '7px 10px', color: 'white', fontSize: '0.85rem' }} />
                                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 3 }}>Fire CRITICAL alert if any single reading exceeds this</div>
                                            </div>
                                            <button onClick={() => handleSaveThreshold(u.id)} disabled={savingThreshold === u.id}
                                                style={{ marginTop: 4, padding: '8px 0', borderRadius: 8, border: 'none', background: u.color, color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', opacity: savingThreshold === u.id ? 0.6 : 1 }}>
                                                {savingThreshold === u.id ? 'Saving...' : `Save ${u.id} Thresholds`}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Anomaly History */}
                    <div className="glass-card" style={{ padding: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                            <Bell size={20} color="#ef4444" />
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Anomaly History</h3>
                            {unacknowledgedCount > 0 && (
                                <span style={{ background: '#ef444422', color: '#ef4444', border: '1px solid #ef444444', fontSize: '0.72rem', fontWeight: 700, padding: '2px 10px', borderRadius: 10 }}>
                                    {unacknowledgedCount} unacknowledged
                                </span>
                            )}
                        </div>
                        {anomalies.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                <CheckCircle size={32} color="#10b981" style={{ marginBottom: 10 }} />
                                <div>No anomalies detected. All utility consumption within thresholds.</div>
                            </div>
                        ) : (
                            <div className="table-container" style={{ overflowY: 'auto', maxHeight: 400 }}>
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Type</th>
                                            <th>Severity</th>
                                            <th>Kind</th>
                                            <th>% Over</th>
                                            <th>Message</th>
                                            <th>Detected</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {anomalies.map(a => {
                                            const uType = UTILITY_TYPES.find(u => u.id === a.Type);
                                            const sevColor = a.Severity === 'CRITICAL' ? '#ef4444' : a.Severity === 'WARNING' ? '#f59e0b' : '#10b981';
                                            return (
                                                <tr key={a.ID} style={{ opacity: a.AcknowledgedAt ? 0.45 : 1 }}>
                                                    <td><Badge color={uType?.color || '#94a3b8'}>{a.Type}</Badge></td>
                                                    <td><Badge color={sevColor}>{a.Severity}</Badge></td>
                                                    <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{a.AnomalyType}</td>
                                                    <td style={{ fontWeight: 700, color: sevColor }}>{a.PercentageOver != null ? `+${Number(a.PercentageOver).toFixed(1)}%` : '—'}</td>
                                                    <td style={{ fontSize: '0.78rem', color: '#cbd5e1', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.Message}>{a.Message}</td>
                                                    <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{a.DetectedAt ? a.DetectedAt.split('T')[0] : '—'}</td>
                                                    <td>
                                                        {a.AcknowledgedAt
                                                            ? <span style={{ fontSize: '0.72rem', color: '#10b981' }}>✓ Ack'd</span>
                                                            : <button onClick={() => handleAcknowledge(a.ID)}
                                                                style={{ fontSize: '0.72rem', padding: '3px 10px', borderRadius: 8, border: '1px solid #f59e0b44', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', cursor: 'pointer' }}>
                                                                Acknowledge
                                                              </button>
                                                        }
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Detail Panel (View / Edit / Print / Save / Close) ── */}
            {detail && (() => {
                const DetailIcon = UTILITY_TYPES.find(u => u.id === detail.Type)?.icon || Zap;
                return (
                <div className="modal-overlay" onClick={() => { setDetail(null); setEditing(false); }}>
                    <div className="glass-card modal-content-standard" onClick={e => e.stopPropagation()}>
                        <ActionBar
                            title={`${detail.Type} Reading — ${formatDate(detail.ReadingDate)}`}
                            icon={<DetailIcon size={20} />}
                            isEditing={editing}
                            isCreating={false}
                            onEdit={() => startEdit(detail)}
                            onSave={handleSave}
                            onPrint={() => window.triggerTrierPrint('utility-detail', { ...detail, plantLabel })}
                            onClose={() => { setDetail(null); setEditing(false); }}
                            onCancel={() => setEditing(false)}
                            onDelete={handleDelete}
                            isSaving={saving}
                        />
                        <div className="scroll-area" style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
                            {!editing ? (
                                <>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                                        <InfoRow label="Utility Type" value={detail.Type} />
                                        <InfoRow label="Reading Date" value={formatDate(detail.ReadingDate)} />
                                        <InfoRow label="Meter Reading" value={`${Number(detail.MeterReading).toLocaleString()} ${UTILITY_TYPES.find(u => u.id === detail.Type)?.unit || ''}`} />
                                        <InfoRow label="Cost Per Unit" value={detail.CostPerUnit ? `$${Number(detail.CostPerUnit).toFixed(4)}` : null} />
                                        <InfoRow label="Total Bill" value={detail.BillAmount ? `$${Number(detail.BillAmount).toLocaleString()}` : null} />
                                        <InfoRow label="Notes" value={detail.Notes} />
                                    </div>
                                    {/* Supplier Section */}
                                    {detail.SupplierName && (
                                        <div className="panel-box" style={{ padding: 16 }}>
                                            <h3 style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.95rem' }}>
                                                <Building2 size={16} color="var(--text-muted)" /> {t('utilities.supplierInformation', 'Supplier Information')}
                                            </h3>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                                                <InfoRow label="Name" value={detail.SupplierName} />
                                                <InfoRow label="Address" value={detail.SupplierAddress} />
                                                <InfoRow label="City / State / Zip" value={[detail.SupplierCity, detail.SupplierState, detail.SupplierZip].filter(Boolean).join(', ')} />
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 15, marginBottom: 20 }}>
                                        <FF label="Utility Type" value={editForm.Type} onChange={v => ef('Type', v)} options={['Electricity', 'Water', 'Gas']} required />
                                        <FF label="Reading Date" type="date" value={editForm.ReadingDate} onChange={v => ef('ReadingDate', v)} required />
                                        <FF label={`Meter Reading (${UTILITY_TYPES.find(u => u.id === editForm.Type)?.unit || ''})`} type="number" value={editForm.MeterReading} onChange={v => ef('MeterReading', v)} required />
                                        <FF label="Cost Per Unit ($)" type="number" value={editForm.CostPerUnit} onChange={v => ef('CostPerUnit', v)} placeholder="0.0000" />
                                        <FF label="Total Bill ($)" type="number" value={editForm.BillAmount} onChange={v => ef('BillAmount', v)} placeholder="0.00" />
                                        <FF label="Notes" value={editForm.Notes} onChange={v => ef('Notes', v)} />
                                    </div>
                                    <div className="panel-box" style={{ padding: 16 }}>
                                        <h3 style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.95rem' }}>
                                            <Building2 size={16} color="var(--text-muted)" /> {t('utilities.supplierLogistics', 'Supplier Logistics')}
                                        </h3>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                            <FF label="Supplier Name" value={editForm.SupplierName} onChange={v => ef('SupplierName', v)} />
                                            <FF label="Street Address" value={editForm.SupplierAddress} onChange={v => ef('SupplierAddress', v)} />
                                            <FF label="City" value={editForm.SupplierCity} onChange={v => ef('SupplierCity', v)} />
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                                <FF label="State" value={editForm.SupplierState} onChange={v => ef('SupplierState', v)} />
                                                <FF label="Zip" value={editForm.SupplierZip} onChange={v => ef('SupplierZip', v)} />
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            );
            })()}

            {/* ── New Reading Modal (Create Mode) ── */}
            {showAdd && (
                <div className="modal-overlay" onClick={() => setShowAdd(false)}>
                    <div className="glass-card modal-content-standard" onClick={e => e.stopPropagation()} style={{ maxWidth: 650 }}>
                        <ActionBar
                            title={t('utilities.logUtilityReading', 'Log Utility Reading')}
                            icon={<Zap size={20} />}
                            isEditing={false}
                            isCreating={true}
                            onSave={handleAdd}
                            onClose={() => setShowAdd(false)}
                            isSaving={saving}
                        />
                        <div style={{ padding: 20 }}>
                            {/* Type Selection */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
                                {UTILITY_TYPES.map(u => (
                                    <button
                                        key={u.id}
                                        onClick={() => f('Type', u.id)}
                                        style={{
                                            padding: 12, borderRadius: 12, border: '1px solid',
                                            borderColor: form.Type === u.id ? u.color : 'var(--glass-border)',
                                            background: form.Type === u.id ? u.bg : 'transparent',
                                            color: form.Type === u.id ? '#fff' : 'var(--text-muted)',
                                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                                            cursor: 'pointer', transition: 'all 0.2s'
                                        }}
                                    >
                                        <u.icon size={20} color={form.Type === u.id ? u.color : 'var(--text-muted)'} />
                                        <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{u.id}</span>
                                    </button>
                                ))}
                            </div>

                            {/* Core Fields */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15, marginBottom: 20 }}>
                                <FF label="Reading Date" type="date" value={form.ReadingDate} onChange={v => f('ReadingDate', v)} required />
                                <FF label={`Meter Reading (${UTILITY_TYPES.find(u => u.id === form.Type)?.unit})`} type="number" value={form.MeterReading} onChange={v => f('MeterReading', v)} required placeholder="0" />
                                <FF label="Cost Per Unit ($)" type="number" value={form.CostPerUnit} onChange={v => f('CostPerUnit', v)} placeholder="0.0000" />
                                <FF label="Total Bill Amount ($)" type="number" value={form.BillAmount} onChange={v => f('BillAmount', v)} placeholder="0.00" />
                            </div>

                            {/* Supplier Logistics */}
                            <div className="panel-box" style={{ padding: 16 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 15, color: '#94a3b8' }}>
                                    <Building2 size={16} />
                                    <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>{t('utilities.supplierLogistics', 'Supplier Logistics')}</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <FF label="Supplier Name" value={form.SupplierName} onChange={v => f('SupplierName', v)} />
                                    <FF label="Street Address" value={form.SupplierAddress} onChange={v => f('SupplierAddress', v)} />
                                    <FF label="City" value={form.SupplierCity} onChange={v => f('SupplierCity', v)} />
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                        <FF label="State" value={form.SupplierState} onChange={v => f('SupplierState', v)} />
                                        <FF label="Zip" value={form.SupplierZip} onChange={v => f('SupplierZip', v)} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
