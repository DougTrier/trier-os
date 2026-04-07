// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Energy & Sustainability Dashboard
 * ===============================================
 * Real-time energy consumption monitoring, ESG reporting, and time-of-use
 * cost arbitrage for electricity, gas, steam, compressed air, and solar.
 * Connects to /api/energy endpoints and the SCADA sensor feed.
 *
 * KEY FEATURES:
 *   Pricing Clock       — Live grid pricing tier display (Off-Peak / Mid / On-Peak)
 *                         Color-coded: green = off-peak, yellow = mid, red = on-peak
 *   Arbitrage Advisor   — 24-hour load-shift recommendations based on TOU rate schedule
 *                         Modal shows when to defer high-draw equipment start
 *   Readings Table      — View/edit pattern for manual meter entry and SCADA readings
 *   ESG Report          — Print Sustainability Report via PrintEngine (Scope 1, 2, 3 emissions)
 *   TOU Configuration   — Admin panel for setting peak/off-peak rate schedules per plant
 *   Meter Summary       — Cards for each meter type with MTD vs. target variance
 *
 * API CALLS:
 *   GET /api/energy/readings    Current period meter readings by type
 *   GET /api/energy/esg-report  ESG metrics: emissions, intensity, renewable %
 *   GET /api/energy/tou-rates   Time-of-use rate schedule for current plant
 *   GET /api/energy/meters      Active meter list with units and targets
 *
 * PRINT: Triggers window.triggerTrierPrint('sustainability', data) for the
 *   PrintEngine sustainability report layout.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Zap, Flame, Droplets, TrendingDown, TrendingUp, Plus, X, Leaf, Target, BarChart3, Clock, Lightbulb, Settings, Eye, Pencil, Save, Printer } from 'lucide-react';
import { TakeTourButton } from './ContextualTour';
import { useTranslation } from '../i18n/index.jsx';

const METER_TYPES = [
    { id: 'electricity_kwh', label: 'Electricity', unit: 'kWh', icon: Zap, color: '#f59e0b', factor: 0.417 },
    { id: 'gas_therms', label: 'Natural Gas', unit: 'therms', icon: Flame, color: '#ef4444', factor: 5.3 },
    { id: 'water_gallons', label: 'Water', unit: 'gal', icon: Droplets, color: '#3b82f6', factor: 0 },
    { id: 'propane_gallons', label: 'Propane', unit: 'gal', icon: Flame, color: '#8b5cf6', factor: 5.72 },
];

// ── Pricing Clock Component ──────────────────────────────────────────────────
function PricingClock({ tou }) {
    const { t } = useTranslation();
    if (!tou) return null;
    const { current, forecast = [] } = tou;
    const tierColor = { peak: '#ef4444', mid: '#f59e0b', off: '#10b981' };
    const color = tierColor[current?.tier] || '#10b981';

    return (
        <div style={{ background: `${color}0d`, border: `1px solid ${color}33`, borderRadius: 14, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <Clock size={18} color={color} />
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>{t('energy.gridPricingClock', 'Grid Pricing Clock')}</span>
                <span style={{ marginLeft: 'auto', padding: '3px 12px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 800, background: `${color}22`, color, border: `1px solid ${color}44` }}>
                    {current?.label || 'Off-Peak'}
                </span>
            </div>

            {/* 24h bar */}
            <div style={{ display: 'flex', gap: 2, height: 24, borderRadius: 6, overflow: 'hidden' }}>
                {forecast.map((slot, i) => {
                    const c = tierColor[slot.tier] || '#10b981';
                    return (
                        <div key={i} title={`${slot.label} — ${slot.label2 || slot.tier}`}
                            style={{ flex: 1, background: slot.isCurrent ? c : `${c}55`, transition: 'background 0.3s', position: 'relative' }}>
                            {slot.isCurrent && (
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: c, animation: 'none', outline: `2px solid ${c}` }} />
                            )}
                        </div>
                    );
                })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)' }}>
                <span>{t('energy.now', 'Now')}</span>
                <span>{t('energy.12h', '+12h')}</span>
                <span>{t('energy.24h', '+24h')}</span>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
                {[['off', '#10b981', 'Off-Peak'], ['mid', '#f59e0b', 'Mid-Peak'], ['peak', '#ef4444', 'On-Peak']].map(([tier, c, lbl]) => (
                    <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: c }} />
                        {lbl}
                    </div>
                ))}
            </div>

            {current?.tier === 'peak' && (
                <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, fontSize: '0.78rem', color: '#fca5a5' }}>{t('energy.onPeakPricingActiveConsiderDel', 'On-Peak pricing active — consider delaying high-load tasks to save on utility costs.')}</div>
            )}
        </div>
    );
}

// ── Arbitrage Advisor Modal ───────────────────────────────────────────────────
function ArbitrageAdvisor({ plantId, onClose }) {
    const { t } = useTranslation();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const hdrs = { Authorization: `Bearer ${localStorage.getItem('authToken')}`, 'x-plant-id': plantId };

    useEffect(() => {
        fetch(`/api/energy/arbitrage?plantId=${plantId}`, { headers: hdrs })
            .then(r => r.json())
            .then(d => { setData(d); setLoading(false); })
            .catch(() => setLoading(false));
    }, [plantId]);

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 25000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ background: 'linear-gradient(145deg, #1e293b, #0f172a)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 18, padding: 28, maxWidth: 640, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                    <Lightbulb size={22} color="#f59e0b" />
                    <h3 style={{ margin: 0, color: '#fff', fontSize: '1.1rem' }}>{t('energy.arbitrageAdvisor', 'Arbitrage Advisor')}</h3>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: 4 }}>{t('energy.24HourLoadShiftRecommendations', '24-hour load-shift recommendations')}</span>
                    <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}><X size={18} /></button>
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>{t('energy.loadingArbitrageData', 'Loading arbitrage data...')}</div>
                ) : !data ? (
                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>{t('energy.noDataAvailableConfigureTOURat', 'No data available. Configure TOU rates and tag high-load assets first.')}</div>
                ) : (
                    <>
                        {/* Current status banner */}
                        <div style={{
                            padding: '12px 16px', borderRadius: 10, marginBottom: 20,
                            background: data.isPeakNow ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                            border: `1px solid ${data.isPeakNow ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
                            display: 'flex', alignItems: 'center', gap: 12
                        }}>
                            <div style={{ fontSize: 28 }}>{data.isPeakNow ? '⚠️' : '✅'}</div>
                            <div>
                                <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.9rem' }}>
                                    Current Tier: {data.currentTier?.label || 'Unknown'}
                                </div>
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                    {data.isPeakNow
                                        ? 'You are currently in On-Peak pricing. Starting high-load tasks now will cost more.'
                                        : 'You are in a favourable pricing window. Good time to run high-load equipment.'}
                                </div>
                            </div>
                        </div>

                        {/* Off-peak windows */}
                        {data.offPeakWindows?.length > 0 && (
                            <div style={{ marginBottom: 20 }}>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>{t('energy.bestOffPeakWindowsNext24h', 'Best Off-Peak Windows (Next 24h)')}</div>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {data.offPeakWindows.slice(0, 4).map((w, i) => (
                                        <div key={i} style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', fontSize: '0.82rem', color: '#10b981', fontWeight: 700 }}>
                                            {String(w.startHour).padStart(2,'0')}:00 – {String((w.endHour + 1) % 24).padStart(2,'0')}:00
                                            <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>({w.lengthHours}h)</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Per-asset suggestions */}
                        {data.suggestions?.length > 0 ? (
                            <div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>{t('energy.highLoadAssetRecommendations', 'High-Load Asset Recommendations')}</div>
                                {data.suggestions.map((s, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <div style={{
                                            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                                            background: s.action === 'DELAY_RECOMMENDED' ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            <Zap size={18} color={s.action === 'DELAY_RECOMMENDED' ? '#ef4444' : '#10b981'} />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>{s.assetLabel}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                                {s.loadKw} kW load · Best window: {s.recommendedWindow}
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: s.action === 'DELAY_RECOMMENDED' ? '#ef4444' : '#10b981' }}>
                                                {s.action === 'DELAY_RECOMMENDED' ? 'Delay Recommended' : 'Optimal Now'}
                                            </div>
                                            {s.estimatedSavings > 0 && (
                                                <div style={{ fontSize: '0.72rem', color: '#10b981' }}>~${s.estimatedSavings.toFixed(2)} est. savings</div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('energy.noHighLoadAssetsTaggedForThisP', 'No high-load assets tagged for this plant yet.')}<br />{t('energy.tagAssetsInSettingsEnergyAsset', 'Tag assets in Settings → Energy → Asset Load Profiles.')}</div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

// ── Edit Reading Modal ────────────────────────────────────────────────────────
function EditReadingModal({ reading, onSave, onClose }) {
    const { t } = useTranslation();
    const [form, setForm] = useState({
        meterType: reading.meterType || 'electricity_kwh',
        reading: reading.reading || '',
        cost: reading.cost || '',
        periodStart: reading.periodStart || '',
        periodEnd: reading.periodEnd || ''
    });
    const [saving, setSaving] = useState(false);
    const hdrs = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('authToken')}`
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await fetch(`/api/energy/readings/${reading.ID}`, {
                method: 'PUT', headers: hdrs,
                body: JSON.stringify({ ...form, reading: parseFloat(form.reading), cost: form.cost ? parseFloat(form.cost) : null })
            });
            onSave();
        } catch { window.trierToast?.error('Failed to save reading'); }
        setSaving(false);
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 25000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'linear-gradient(145deg, #1e293b, #0f172a)', border: '1px solid var(--primary)', borderRadius: 16, padding: 28, maxWidth: 420, width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h3 style={{ color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><Pencil size={18} color="#f59e0b" />{t('energy.editReading', 'Edit Reading')}</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('energy.utilityType', 'Utility Type')}</label>
                    <select value={form.meterType} onChange={e => setForm({ ...form, meterType: e.target.value })} style={{ width: '100%' }}>
                        {METER_TYPES.map(mt => <option key={mt.id} value={mt.id}>{mt.label} ({mt.unit})</option>)}
                    </select>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('energy.reading', 'Reading')}</label>
                    <input type="number" value={form.reading} onChange={e => setForm({ ...form, reading: e.target.value })} />
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('energy.cost', 'Cost ($)')}</label>
                    <input type="number" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('energy.periodStart', 'Period Start')}</label>
                            <input type="date" value={form.periodStart} onChange={e => setForm({ ...form, periodStart: e.target.value })} style={{ width: '100%' }} />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('energy.periodEnd', 'Period End')}</label>
                            <input type="date" value={form.periodEnd} onChange={e => setForm({ ...form, periodEnd: e.target.value })} style={{ width: '100%' }} />
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button className="btn-save" style={{ flex: 1, padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={handleSave} disabled={saving}>
                            <Save size={14} /> {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                        <button className="btn-nav" style={{ padding: '10px 16px' }} onClick={onClose}>{t('energy.cancel', 'Cancel')}</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── View Reading Modal ────────────────────────────────────────────────────────
function ViewReadingModal({ reading, onClose }) {
    const { t } = useTranslation();
    const mt = METER_TYPES.find(t => t.id === reading.meterType) || { label: reading.meterType, color: '#fff', unit: '' };
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 25000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'linear-gradient(145deg, #1e293b, #0f172a)', border: `1px solid ${mt.color}44`, borderRadius: 16, padding: 28, maxWidth: 400, width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h3 style={{ color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><Eye size={18} color={mt.color} />{t('energy.readingDetail', 'Reading Detail')}</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
                </div>
                {[
                    ['Utility Type', mt.label],
                    ['Reading', `${(reading.reading || 0).toLocaleString()} ${mt.unit}`],
                    ['Cost', reading.cost ? `$${reading.cost.toLocaleString()}` : '--'],
                    ['Period Start', reading.periodStart || '--'],
                    ['Period End', reading.periodEnd || '--'],
                    ['Source', reading.source || 'manual'],
                    ['Recorded By', reading.recordedBy || '--'],
                    ['Date', reading.createdAt ? new Date(reading.createdAt).toLocaleString() : '--'],
                ].map(([label, value]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.85rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                        <span style={{ color: '#fff', fontWeight: 600 }}>{value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function EnergyDashboard({ plantId, plantLabel }) {
    const { t } = useTranslation();
    const [summary, setSummary] = useState(null);
    const [readings, setReadings] = useState([]);
    const [report, setReport] = useState(null);
    const [tou, setTou] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showLogForm, setShowLogForm] = useState(false);
    const [showTargetForm, setShowTargetForm] = useState(false);
    const [showArbitrage, setShowArbitrage] = useState(false);
    const [viewReading, setViewReading] = useState(null);
    const [editReading, setEditReading] = useState(null);
    const [form, setForm] = useState({ meterType: 'electricity_kwh', reading: '', cost: '', periodStart: '', periodEnd: '' });
    const [targetForm, setTargetForm] = useState({ meterType: 'electricity_kwh', monthlyTarget: '', annualTarget: '' });
    const [submitting, setSubmitting] = useState(false);

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        'x-plant-id': plantId
    };

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [sumRes, readRes, repRes, touRes] = await Promise.all([
                fetch(`/api/energy/summary?plantId=${plantId}`, { headers }),
                fetch(`/api/energy/readings?plantId=${plantId}&months=12`, { headers }),
                fetch(`/api/energy/report?year=${new Date().getFullYear()}`, { headers }),
                fetch(`/api/energy/tou?plantId=${plantId}`, { headers })
            ]);
            setSummary(await sumRes.json());
            setReadings(await readRes.json());
            setReport(await repRes.json());
            const touData = await touRes.json();
            setTou(touData.current ? touData : null);
        } catch (err) {
            console.error('Energy dashboard fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [plantId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleLogReading = async () => {
        if (!form.reading) return;
        setSubmitting(true);
        try {
            await fetch('/api/energy/reading', {
                method: 'POST', headers,
                body: JSON.stringify({ plantId, ...form, reading: parseFloat(form.reading), cost: form.cost ? parseFloat(form.cost) : null })
            });
            setShowLogForm(false);
            setForm({ meterType: 'electricity_kwh', reading: '', cost: '', periodStart: '', periodEnd: '' });
            fetchData();
        } catch (err) { window.trierToast?.error('Failed to log reading'); }
        setSubmitting(false);
    };

    const handleSetTarget = async () => {
        setSubmitting(true);
        try {
            await fetch('/api/energy/targets', {
                method: 'PUT', headers,
                body: JSON.stringify({ plantId, ...targetForm, monthlyTarget: targetForm.monthlyTarget ? parseFloat(targetForm.monthlyTarget) : null, annualTarget: targetForm.annualTarget ? parseFloat(targetForm.annualTarget) : null })
            });
            setShowTargetForm(false);
            fetchData();
        } catch (err) { window.trierToast?.error('Failed to save target'); }
        setSubmitting(false);
    };

    const handlePrintReport = () => {
        window.triggerTrierPrint('sustainability-report', {
            plantId, plantLabel,
            readings,
            targets: summary?.targets || [],
            totalCarbonKg: summary?.totalCarbonKg || 0,
            year: new Date().getFullYear()
        });
    };

    // Aggregate readings by month for chart
    const monthlyData = React.useMemo(() => {
        if (!report?.data) return [];
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const byMonth = {};
        months.forEach((m, i) => { byMonth[String(i + 1).padStart(2, '0')] = { label: m, electricity: 0, gas: 0, water: 0, propane: 0, totalCost: 0 }; });
        report.data.forEach(r => {
            const key = r.month;
            if (!byMonth[key]) return;
            if (r.meterType === 'electricity_kwh') byMonth[key].electricity = r.totalReading;
            else if (r.meterType === 'gas_therms') byMonth[key].gas = r.totalReading;
            else if (r.meterType === 'water_gallons') byMonth[key].water = r.totalReading;
            else if (r.meterType === 'propane_gallons') byMonth[key].propane = r.totalReading;
            byMonth[key].totalCost += r.totalCost || 0;
        });
        return Object.values(byMonth);
    }, [report]);

    const maxReading = Math.max(...monthlyData.map(m => m.electricity + m.gas + m.water + m.propane), 1);
    const totalKwh = readings.filter(r => r.meterType === 'electricity_kwh').reduce((s, r) => s + (r.reading || 0), 0);
    const totalCost = readings.reduce((s, r) => s + (r.cost || 0), 0);
    const totalCarbon = summary?.totalCarbonKg || 0;
    const elecTarget = summary?.targets?.find(t => t.meterType === 'electricity_kwh');
    const pctTarget = elecTarget?.monthlyTarget ? Math.round((totalKwh / (elecTarget.monthlyTarget * 12)) * 100) : null;
    const isPeak = tou?.current?.tier === 'peak';

    // ActionBtn helper
    const ActionBtn = ({ icon: Icon, tip, color, onClick }) => (
        <button title={tip} onClick={e => { e.stopPropagation(); onClick && onClick(); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color, padding: '4px 6px', borderRadius: 6, transition: 'all 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
            <Icon size={16} />
        </button>
    );

    return (
        <div style={{ padding: '0' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#10b981', fontSize: '1.3rem', margin: 0 }}>
                    <Leaf size={24} /> {t('energy.energySustainability')}
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>{plantLabel || plantId}</span>
                    {isPeak && (
                        <span style={{ padding: '2px 10px', borderRadius: 8, fontSize: '0.68rem', fontWeight: 800, background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', animation: 'pulse 2s infinite' }}>{t('energy.PEAKPRICING', '⚡ PEAK PRICING')}</span>
                    )}
                </h2>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <TakeTourButton tourId="utilities-energy" />
                    <button className="btn-nav" onClick={handlePrintReport} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, fontSize: '0.8rem' }} title={t('energy.printSustainabilityReport', 'Print Sustainability Report')}>
                        <Printer size={14} />{t('energy.report', 'Report')}</button>
                    <button className="btn-nav" onClick={() => setShowArbitrage(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, fontSize: '0.8rem', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }} title={t('energy.openArbitrageAdvisor24hLoadShi', 'Open Arbitrage Advisor — 24h load-shift recommendations')}>
                        <Lightbulb size={14} />{t('energy.arbitrageAdvisor', 'Arbitrage Advisor')}</button>
                    <button className="btn-save" style={{ padding: '8px 16px', fontSize: '0.85rem' }} onClick={() => setShowTargetForm(true)} title={t('energy.setEnergyConsumptionTargetsTip')}>
                        <Target size={14} style={{ marginRight: '6px' }} />{t('energy.setTarget')}
                    </button>
                    <button className="btn-primary btn-sm" onClick={() => setShowLogForm(true)} title={t('energy.logANewUtilityBillTip')}>
                        <Plus size={14} style={{ marginRight: '6px' }} />{t('energy.logUtilityBill')}
                    </button>
                </div>
            </div>

            {/* Pricing Clock + Summary Cards row */}
            <div style={{ display: 'grid', gridTemplateColumns: tou ? '1fr 3fr' : '1fr', gap: 16, marginBottom: 20 }}>
                {tou && <PricingClock tou={tou} />}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px' }}>
                    <div style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(245,158,11,0.03))', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '14px', padding: '20px', textAlign: 'center' }}>
                        <Zap size={28} color="#f59e0b" style={{ marginBottom: '8px' }} />
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('energy.totalElectricity')}</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#f59e0b' }}>{totalKwh.toLocaleString()}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('energy.kWh12Month', 'kWh (12-month)')}</div>
                    </div>
                    <div style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(99,102,241,0.03))', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '14px', padding: '20px', textAlign: 'center' }}>
                        <BarChart3 size={28} color="#6366f1" style={{ marginBottom: '8px' }} />
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('energy.totalUtilityCost')}</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#6366f1' }}>${totalCost.toLocaleString()}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('energy.allUtilities')}</div>
                    </div>
                    <div style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(16,185,129,0.03))', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '14px', padding: '20px', textAlign: 'center' }}>
                        <Target size={28} color="#10b981" style={{ marginBottom: '8px' }} />
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('energy.VsTarget', '% vs Target')}</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: pctTarget !== null ? (pctTarget <= 100 ? '#10b981' : '#ef4444') : 'var(--text-muted)' }}>
                            {pctTarget !== null ? `${pctTarget}%` : '--'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                            {pctTarget !== null ? (pctTarget <= 100 ? <><TrendingDown size={12} color="#10b981" /> {t('energy.underTarget')}</> : <><TrendingUp size={12} color="#ef4444" /> {t('energy.overTarget')}</>) : 'No target set'}
                        </div>
                    </div>
                    <div style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.1), rgba(34,197,94,0.03))', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '14px', padding: '20px', textAlign: 'center' }}>
                        <Leaf size={28} color="#22c55e" style={{ marginBottom: '8px' }} />
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('energy.carbonFootprint')}</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#22c55e' }}>{totalCarbon.toLocaleString()}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('energy.kgCOEst', 'kg CO₂ (est.)')}</div>
                    </div>
                </div>
            </div>

            {/* Monthly Bar Chart */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: '14px', padding: '20px', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '1rem', color: '#fff', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <BarChart3 size={18} color="var(--primary)" /> Monthly Energy Usage ({new Date().getFullYear()})
                </h3>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '180px', padding: '0 5px' }}>
                    {monthlyData.map((m, i) => {
                        const total = m.electricity + m.gas + m.water + m.propane;
                        const pct = (total / maxReading) * 100;
                        const elecPct = total > 0 ? (m.electricity / total) * 100 : 0;
                        const gasPct = total > 0 ? (m.gas / total) * 100 : 0;
                        const waterPct = total > 0 ? (m.water / total) * 100 : 0;
                        const targetPct = elecTarget?.monthlyTarget ? (elecTarget.monthlyTarget / maxReading) * 100 : null;
                        return (
                            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                <div style={{ width: '100%', height: '150px', position: 'relative', display: 'flex', alignItems: 'flex-end' }}>
                                    {targetPct && (
                                        <div style={{ position: 'absolute', bottom: `${Math.min(targetPct, 100)}%`, left: '-2px', right: '-2px', height: '2px', background: '#ef4444', opacity: 0.6, zIndex: 2 }} />
                                    )}
                                    <div style={{ width: '100%', height: `${Math.max(pct, total > 0 ? 3 : 0)}%`, borderRadius: '4px 4px 0 0', overflow: 'hidden', display: 'flex', flexDirection: 'column-reverse', transition: 'height 0.5s ease' }}>
                                        {m.electricity > 0 && <div style={{ height: `${elecPct}%`, background: '#f59e0b', minHeight: '2px' }} title={`Electricity: ${m.electricity.toLocaleString()} kWh`} />}
                                        {m.gas > 0 && <div style={{ height: `${gasPct}%`, background: '#ef4444', minHeight: '2px' }} title={`Gas: ${m.gas.toLocaleString()} therms`} />}
                                        {m.water > 0 && <div style={{ height: `${waterPct}%`, background: '#3b82f6', minHeight: '2px' }} title={`Water: ${m.water.toLocaleString()} gal`} />}
                                        {m.propane > 0 && <div style={{ height: `${100 - elecPct - gasPct - waterPct}%`, background: '#8b5cf6', minHeight: '2px' }} title={t('energy.propane', 'Propane')} />}
                                    </div>
                                </div>
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{m.label}</span>
                            </div>
                        );
                    })}
                </div>
                <div style={{ display: 'flex', gap: '20px', marginTop: '12px', justifyContent: 'center' }}>
                    {METER_TYPES.map(mt => (
                        <div key={mt.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: mt.color }} />
                            {mt.label}
                        </div>
                    ))}
                    {elecTarget?.monthlyTarget && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', color: '#ef4444' }}>
                            <div style={{ width: '14px', height: '2px', background: '#ef4444' }} />
                            {t('energy.target')}
                        </div>
                    )}
                </div>
            </div>

            {/* Utility Breakdown */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: '14px', padding: '20px', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '1rem', color: '#fff', marginBottom: '15px' }}>{t('energy.utilityBreakdownCurrentMonth')}</h3>
                {summary?.currentMonth?.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {summary.currentMonth.map((item, i) => {
                            const mt = METER_TYPES.find(t => t.id === item.meterType) || { label: item.meterType, color: '#6366f1', unit: '' };
                            const Icon = mt.icon || Zap;
                            const target = summary.targets?.find(t => t.meterType === item.meterType);
                            const pct = target?.monthlyTarget ? Math.min((item.totalReading / target.monthlyTarget) * 100, 100) : null;
                            return (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <Icon size={18} color={mt.color} />
                                    <span style={{ minWidth: '100px', fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>{mt.label}</span>
                                    <div style={{ flex: 1, height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                                        <div style={{ height: '100%', width: pct !== null ? `${pct}%` : '50%', background: `linear-gradient(90deg, ${mt.color}, ${mt.color}88)`, borderRadius: '4px', transition: 'width 0.5s ease' }} />
                                    </div>
                                    <span style={{ minWidth: '100px', textAlign: 'right', fontSize: '0.85rem', fontWeight: 'bold', color: mt.color }}>
                                        {item.totalReading?.toLocaleString()} {mt.unit}
                                    </span>
                                    <span style={{ minWidth: '80px', textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        ${(item.totalCost || 0).toLocaleString()}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>{t('energy.noReadingsLoggedThisMonthClick', 'No readings logged this month. Click "Log Utility Bill" to get started.')}</p>
                )}
            </div>

            {/* Recent Readings — with View/Edit columns */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: '14px', padding: '20px' }}>
                <h3 style={{ fontSize: '1rem', color: '#fff', marginBottom: '15px' }}>{t('energy.recentReadings')}</h3>
                {readings.length > 0 ? (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                                <th style={{ padding: '8px', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('energy.date')}</th>
                                <th style={{ padding: '8px', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('energy.type')}</th>
                                <th style={{ padding: '8px', textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('energy.reading')}</th>
                                <th style={{ padding: '8px', textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('energy.cost')}</th>
                                <th style={{ padding: '8px', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('energy.period')}</th>
                                <th style={{ padding: '8px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('energy.actions', 'Actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {readings.slice(0, 20).map((r, i) => {
                                const mt = METER_TYPES.find(t => t.id === r.meterType) || { label: r.meterType, color: '#fff', unit: '' };
                                return (
                                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <td style={{ padding: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{r.createdAt?.split('T')[0] || '--'}</td>
                                        <td style={{ padding: '8px', fontSize: '0.8rem', color: mt.color, fontWeight: 600 }}>{mt.label}</td>
                                        <td style={{ padding: '8px', fontSize: '0.85rem', color: '#fff', fontWeight: 600, textAlign: 'right' }}>{(r.reading || 0).toLocaleString()} {mt.unit}</td>
                                        <td style={{ padding: '8px', fontSize: '0.8rem', color: '#10b981', textAlign: 'right' }}>{r.cost ? `$${r.cost.toLocaleString()}` : '--'}</td>
                                        <td style={{ padding: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.periodStart && r.periodEnd ? `${r.periodStart} → ${r.periodEnd}` : '--'}</td>
                                        <td style={{ padding: '8px', textAlign: 'center', display: 'flex', gap: 2, justifyContent: 'center' }}>
                                            <ActionBtn icon={Eye} tip="View reading detail" color="#3b82f6" onClick={() => setViewReading(r)} />
                                            <ActionBtn icon={Pencil} tip="Edit this reading" color="#f59e0b" onClick={() => setEditReading(r)} />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                ) : (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>{t('energy.noEnergyReadingsRecorded')}</p>
                )}
            </div>

            {/* Log Utility Bill Modal */}
            {showLogForm && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: 'linear-gradient(145deg, #1e293b, #0f172a)', border: '1px solid var(--primary)', borderRadius: '16px', padding: '30px', maxWidth: '450px', width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><Zap size={20} color="#f59e0b" /> {t('energy.logUtilityBill')}</h3>
                            <button onClick={() => setShowLogForm(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('energy.utilityType')}</label>
                            <select value={form.meterType} onChange={e => setForm({ ...form, meterType: e.target.value })} style={{ width: '100%' }}>
                                {METER_TYPES.map(mt => <option key={mt.id} value={mt.id}>{mt.label} ({mt.unit})</option>)}
                            </select>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('energy.reading')}</label>
                            <input type="number" placeholder={t('energy.eg45000Placeholder')} value={form.reading} onChange={e => setForm({ ...form, reading: e.target.value })} />
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('energy.cost', 'Cost ($)')}</label>
                            <input type="number" placeholder={t('energy.eg5400Placeholder')} value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} />
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('energy.periodStart')}</label>
                                    <input type="date" value={form.periodStart} onChange={e => setForm({ ...form, periodStart: e.target.value })} style={{ width: '100%' }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('energy.periodEnd')}</label>
                                    <input type="date" value={form.periodEnd} onChange={e => setForm({ ...form, periodEnd: e.target.value })} style={{ width: '100%' }} />
                                </div>
                            </div>
                            <button className="btn-save" style={{ marginTop: '10px', padding: '10px' }} onClick={handleLogReading} disabled={submitting || !form.reading}>
                                {submitting ? 'Saving...' : 'Log Reading'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Set Target Modal */}
            {showTargetForm && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: 'linear-gradient(145deg, #1e293b, #0f172a)', border: '1px solid #10b981', borderRadius: '16px', padding: '30px', maxWidth: '400px', width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><Target size={20} color="#10b981" /> {t('energy.setEnergyTarget')}</h3>
                            <button onClick={() => setShowTargetForm(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('energy.utilityType')}</label>
                            <select value={targetForm.meterType} onChange={e => setTargetForm({ ...targetForm, meterType: e.target.value })} style={{ width: '100%' }}>
                                {METER_TYPES.map(mt => <option key={mt.id} value={mt.id}>{mt.label}</option>)}
                            </select>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('energy.monthlyTarget')}</label>
                            <input type="number" placeholder={t('energy.eg50000Placeholder')} value={targetForm.monthlyTarget} onChange={e => setTargetForm({ ...targetForm, monthlyTarget: e.target.value })} />
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('energy.annualTarget')}</label>
                            <input type="number" placeholder={t('energy.eg600000Placeholder')} value={targetForm.annualTarget} onChange={e => setTargetForm({ ...targetForm, annualTarget: e.target.value })} />
                            <button className="btn-save" style={{ marginTop: '10px', padding: '10px' }} onClick={handleSetTarget} disabled={submitting}>
                                {submitting ? 'Saving...' : 'Save Target'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Arbitrage Advisor Modal */}
            {showArbitrage && (
                <ArbitrageAdvisor plantId={plantId} onClose={() => setShowArbitrage(false)} />
            )}

            {/* View Reading Modal */}
            {viewReading && (
                <ViewReadingModal reading={viewReading} onClose={() => setViewReading(null)} />
            )}

            {/* Edit Reading Modal */}
            {editReading && (
                <EditReadingModal
                    reading={editReading}
                    onClose={() => setEditReading(null)}
                    onSave={() => { setEditReading(null); fetchData(); }}
                />
            )}
        </div>
    );
}
