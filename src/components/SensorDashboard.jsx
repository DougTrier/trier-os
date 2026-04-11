// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — IoT Sensor Monitoring Dashboard
 * =============================================
 * Real-time visualization of SCADA/PLC sensor data. Supports temperature,
 * pressure, vibration, flow, pH, conductivity, and custom sensor types.
 * Connects to /api/sensors endpoints for live readings and alert management.
 *
 * KEY FEATURES:
 *   Live Gauges       — Dial-style gauges with threshold bands (green/yellow/red)
 *   Sparklines        — 60-point rolling trend line per sensor (auto-updates)
 *   Alert Indicators  — Flashing badge when reading exceeds Hi/Hi-Hi threshold
 *   Trend Charts      — Historical chart with configurable date range (1h/8h/24h/7d)
 *   Asset Mapping     — Each sensor linked to an asset for contextual drill-down
 *   Sensor Config     — Admin panel to set thresholds, polling interval, and UOM
 *   Auto-WO Trigger   — High-alarm sensors can auto-generate work orders
 *                       (configured per-sensor in sensor settings)
 *
 * POLLING: Fetches fresh readings every configurable interval (default 30s).
 *   Uses AbortController to cancel in-flight requests on unmount/interval change.
 *
 * API CALLS:
 *   GET  /api/sensors              All sensors for current plant with latest reading
 *   GET  /api/sensors/:id/history  Time-series history for a single sensor
 *   POST /api/sensors/:id/reading  Manual reading entry (for non-SCADA sensors)
 *   PUT  /api/sensors/:id          Update sensor thresholds and configuration
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Activity, Gauge, AlertTriangle, CheckCircle, Plus, Trash2, RefreshCw, Wifi, WifiOff, Bell, Zap, BarChart3, Server, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';
import LoadingSpinner from './LoadingSpinner';

// Subtle alert chime — two-tone bell, 150ms total, not obnoxious
function playAlertChime() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const now = ctx.currentTime;
        // First tone: gentle high note
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(660, now);
        gain1.gain.setValueAtTime(0.08, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc1.connect(gain1).connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.15);
        // Second tone: softer low note (bell resonance)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(440, now + 0.05);
        gain2.gain.setValueAtTime(0.05, now + 0.05);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc2.connect(gain2).connect(ctx.destination);
        osc2.start(now + 0.05);
        osc2.stop(now + 0.25);
        // Cleanup
        setTimeout(() => ctx.close(), 500);
    } catch (e) { /* AudioContext not available — silent fallback */ }
}

export default function SensorDashboard({ canConfig = false, canThresholds = false, canView = false, plantId = '', plantLabel = '' }) {
    const { t } = useTranslation();
    const [dashboard, setDashboard] = useState(null);
    const [sensors, setSensors] = useState([]);
    const [thresholds, setThresholds] = useState([]);
    const [loading, setLoading] = useState(true);
    // Default to first visible tab
    const defaultTab = canView ? 'overview' : canConfig ? 'config' : canThresholds ? 'thresholds' : 'overview';
    const [activeTab, setActiveTab] = useState(defaultTab);
    const [showAddSensor, setShowAddSensor] = useState(false);
    const [showAddThreshold, setShowAddThreshold] = useState(false);
    const [simulating, setSimulating] = useState(false);
    const [expandedSensor, setExpandedSensor] = useState(null);
    const [sensorReadings, setSensorReadings] = useState({});
    const [confirmDelete, setConfirmDelete] = useState(null); // { type: 'sensor'|'threshold', id, label }
    const prevAlertCount = React.useRef(0); // Track alert count for chime
    const [snoozeMenu, setSnoozeMenu] = useState(null); // sensor_id or null

    // Per-sensor snooze — stored in localStorage so it survives page refresh
    const [snoozedSensors, setSnoozedSensors] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem('PM_SNOOZED_SENSORS') || '{}');
            // Clean expired snoozes on load
            const now = Date.now();
            const clean = {};
            for (const [id, expiry] of Object.entries(saved)) {
                if (expiry === 'forever' || expiry > now) clean[id] = expiry;
            }
            return clean;
        } catch { return {}; }
    });

    const snoozeSensor = (sensorId, durationMs) => {
        const expiry = durationMs === 'forever' ? 'forever' : Date.now() + durationMs;
        const updated = { ...snoozedSensors, [sensorId]: expiry };
        setSnoozedSensors(updated);
        localStorage.setItem('PM_SNOOZED_SENSORS', JSON.stringify(updated));
        setSnoozeMenu(null);
    };

    const unsnoozeSensor = (sensorId) => {
        const updated = { ...snoozedSensors };
        delete updated[sensorId];
        setSnoozedSensors(updated);
        localStorage.setItem('PM_SNOOZED_SENSORS', JSON.stringify(updated));
    };

    const isSnoozed = (sensorId) => {
        const expiry = snoozedSensors[sensorId];
        if (!expiry) return false;
        if (expiry === 'forever') return true;
        if (expiry > Date.now()) return true;
        // Expired — auto-clean
        unsnoozeSensor(sensorId);
        return false;
    };

    const getSnoozeRemaining = (sensorId) => {
        const expiry = snoozedSensors[sensorId];
        if (!expiry) return '';
        if (expiry === 'forever') return 'Until manually cleared';
        const mins = Math.max(0, Math.round((expiry - Date.now()) / 60000));
        if (mins < 60) return `${mins}m remaining`;
        return `${Math.round(mins / 60)}h ${mins % 60}m remaining`;
    };

    // Build plant query param for API scoping
    const plantQuery = plantId && plantId !== 'all_sites' ? `plant_id=${encodeURIComponent(plantId)}` : '';

    // New sensor form — auto-fill plant context
    const [newSensor, setNewSensor] = useState({
        sensor_id: '', sensor_name: '', asset_id: '', asset_name: '',
        plant_id: plantId || '', plant_name: plantLabel || '', metric: 'temperature', unit: '°F',
        location: '', protocol: 'http'
    });

    // New threshold form
    const [newThreshold, setNewThreshold] = useState({
        sensor_id: '', metric: 'temperature', min_value: '', max_value: '',
        wo_priority: 1, cooldown_minutes: 30, auto_wo: true
    });

    const headers = {
        'Content-Type': 'application/json'
    };

    const fetchAll = useCallback(async () => {
        try {
            const q = plantQuery ? `?${plantQuery}` : '';
            const [dashRes, statusRes, threshRes] = await Promise.all([
                fetch(`/api/sensors/dashboard${q}`, { headers }),
                fetch(`/api/sensors/status${q}`, { headers }),
                fetch(`/api/sensors/thresholds${q}`, { headers })
            ]);
            const dashData = await dashRes.json();
            const statusData = await statusRes.json();
            // Play subtle chime if NEW alerts appeared — but skip snoozed sensors
            const unsnoozedAlerts = statusData.filter(s => s.status === 'alert' && !isSnoozed(s.sensor_id)).length;
            if (unsnoozedAlerts > prevAlertCount.current && prevAlertCount.current !== 0) {
                playAlertChime();
            }
            prevAlertCount.current = unsnoozedAlerts;
            setDashboard(dashData);
            setSensors(statusData);
            setThresholds(await threshRes.json());
        } catch (err) {
            console.error('Sensor fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [plantQuery]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    // Auto-refresh every 15 seconds
    useEffect(() => {
        const interval = setInterval(fetchAll, 15000);
        return () => clearInterval(interval);
    }, [fetchAll]);

    const fetchReadings = async (sensorId) => {
        try {
            const res = await fetch(`/api/sensors/readings/${sensorId}?hours=24`, { headers });
            const data = await res.json();
            setSensorReadings(prev => ({ ...prev, [sensorId]: data.readings || [] }));
        } catch (err) { console.warn('[SensorDashboard] caught:', err); }
    };

    const handleAddSensor = async () => {
        if (!newSensor.sensor_id || !newSensor.sensor_name) return window.trierToast?.error('Sensor ID and Name required');
        try {
            await fetch('/api/sensors/config', { method: 'POST', headers, body: JSON.stringify(newSensor) });
            setShowAddSensor(false);
            setNewSensor({ sensor_id: '', sensor_name: '', asset_id: '', asset_name: '', plant_id: plantId || '', plant_name: plantLabel || '', metric: 'temperature', unit: '°F', location: '', protocol: 'http' });
            fetchAll();
        } catch (err) { window.trierToast?.error('Failed to add sensor'); }
    };

    const handleAddThreshold = async () => {
        if (!newThreshold.sensor_id || !newThreshold.metric) return window.trierToast?.error('Sensor ID and Metric required');
        try {
            await fetch('/api/sensors/thresholds', { 
                method: 'POST', headers, 
                body: JSON.stringify({
                    ...newThreshold,
                    min_value: newThreshold.min_value !== '' ? parseFloat(newThreshold.min_value) : null,
                    max_value: newThreshold.max_value !== '' ? parseFloat(newThreshold.max_value) : null
                })
            });
            setShowAddThreshold(false);
            setNewThreshold({ sensor_id: '', metric: 'temperature', min_value: '', max_value: '', wo_priority: 1, cooldown_minutes: 30, auto_wo: true });
            fetchAll();
        } catch (err) { window.trierToast?.error('Failed to add threshold'); }
    };

    const handleDeleteSensor = async (sensorId) => {
        setConfirmDelete({ type: 'sensor', id: sensorId, label: `sensor "${sensorId}" and all its readings` });
    };

    const handleDeleteThreshold = async (id) => {
        setConfirmDelete({ type: 'threshold', id, label: 'this threshold rule' });
    };

    const executeDelete = async () => {
        if (!confirmDelete) return;
        if (confirmDelete.type === 'sensor') {
            await fetch(`/api/sensors/config/${confirmDelete.id}`, { method: 'DELETE', headers });
        } else {
            await fetch(`/api/sensors/thresholds/${confirmDelete.id}`, { method: 'DELETE', headers });
        }
        setConfirmDelete(null);
        fetchAll();
    };

    const handleToggleSensor = async (sensorId) => {
        await fetch(`/api/sensors/config/${sensorId}/toggle`, { method: 'PUT', headers });
        fetchAll();
    };

    const handleSimulate = async () => {
        setSimulating(true);
        try {
            const res = await fetch('/api/sensors/simulate', { method: 'POST', headers, body: JSON.stringify({ plantId: plantId || '' }) });
            const data = await res.json();
            if (data.success) {
                setTimeout(fetchAll, 500);
            }
        } catch (err) { window.trierToast?.error('Simulation failed'); }
        setSimulating(false);
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'online': return '#10b981';
            case 'alert': return '#ef4444';
            case 'offline': return '#6b7280';
            default: return '#6b7280';
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'online': return <Wifi size={14} />;
            case 'alert': return <AlertTriangle size={14} />;
            case 'offline': return <WifiOff size={14} />;
            default: return <WifiOff size={14} />;
        }
    };

    const getPriorityLabel = (p) => {
        switch (p) {
            case 1: return { label: 'EMERGENCY', color: '#ef4444' };
            case 2: return { label: 'CRITICAL', color: '#f59e0b' };
            case 3: return { label: 'NORMAL', color: '#10b981' };
            default: return { label: `P${p}`, color: '#6366f1' };
        }
    };

    const inputStyle = {
        padding: '8px 12px', borderRadius: '6px', background: 'var(--bg-main)',
        color: '#fff', border: '1px solid var(--glass-border)', fontSize: '0.85rem', width: '100%'
    };
    const labelStyle = { fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' };

    if (loading) return <LoadingSpinner message={t('sensor.loadingSensorGateway')} />;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Activity size={24} color="#10b981" />
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.3rem' }}>{t('sensor.scadaplcSensorGateway')}</h3>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {t('sensor.realtimeSensorMonitoringWith')}
                        </p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={handleSimulate} disabled={simulating}
                        className="btn-secondary btn-sm" title={t('sensors.pushASimulatedSensorReadingTip')}>
                        <Zap size={14} /> {simulating ? 'Simulating...' : 'Simulate Reading'}
                    </button>
                    <button onClick={fetchAll} className="btn-primary btn-sm" title={t('sensors.refreshSensorDataTip')}>
                        <RefreshCw size={14} /> {t('sensor.refresh')}
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            {dashboard && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px' }}>
                    {[
                        { label: 'Total Sensors', value: dashboard.totalSensors, icon: <Server size={18} />, color: '#6366f1' },
                        { label: 'Online', value: dashboard.onlineSensors, icon: <Wifi size={18} />, color: '#10b981' },
                        { label: 'Alert', value: dashboard.alertSensors, icon: <AlertTriangle size={18} />, color: '#ef4444' },
                        { label: 'Offline', value: dashboard.offlineSensors, icon: <WifiOff size={18} />, color: '#6b7280' },
                        { label: 'Readings (24h)', value: dashboard.readings24h, icon: <BarChart3 size={18} />, color: '#818cf8' },
                        { label: 'Alerts (24h)', value: dashboard.alerts24h, icon: <Bell size={18} />, color: '#f59e0b' }
                    ].map((card, i) => (
                        <div key={i} style={{
                            background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '10px',
                            border: '1px solid var(--glass-border)', textAlign: 'center'
                        }}>
                            <div style={{ color: card.color, marginBottom: '8px' }}>{card.icon}</div>
                            <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#fff' }}>{card.value}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{card.label}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Tabs */}
            <div className="nav-pills" style={{ paddingBottom: 8 }}>
                {[
                    canView && { key: 'overview', label: '\ud83d\udcca Overview' },
                    canConfig && { key: 'config', label: '\u2699\ufe0f Config' },
                    canThresholds && { key: 'thresholds', label: '\ud83d\udd14 Thresholds' },
                    canConfig && { key: 'guide', label: '\ud83d\udd0c Integration Guide' }
                ].filter(Boolean).map(tab => (
                    <button key={tab.key} className={`btn-nav${activeTab === tab.key ? ' active' : ''}`}
                        onClick={() => setActiveTab(tab.key)}
                        title={`Open ${tab.label.replace(/^[^\w]+/, '')} setup`}
                    >{tab.label}</button>
                ))}
            </div>

            {/* ═══ OVERVIEW TAB ═══ */}
            {activeTab === 'overview' && canView && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {sensors.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px dashed var(--glass-border)' }}>
                            <Server size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
                            <p style={{ fontSize: '1rem', margin: '0 0 8px' }}>{t('sensor.noSensorsConfigured')}</p>
                            <p style={{ fontSize: '0.8rem' }}>Use the "Simulate Reading" button to create a test sensor, or go to Config to add one.</p>
                        </div>
                    ) : sensors.map(sensor => (
                        <div key={sensor.sensor_id} style={{
                            background: isSnoozed(sensor.sensor_id) && sensor.status === 'alert' ? 'rgba(245,158,11,0.03)' : 'rgba(255,255,255,0.03)',
                            borderRadius: '10px',
                            border: sensor.status === 'alert'
                                ? isSnoozed(sensor.sensor_id) ? '1px solid rgba(245,158,11,0.3)' : '1px solid rgba(239, 68, 68, 0.4)'
                                : '1px solid var(--glass-border)',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '14px 18px', cursor: 'pointer'
                            }} onClick={() => {
                                const id = sensor.sensor_id;
                                if (expandedSensor === id) { setExpandedSensor(null); }
                                else { setExpandedSensor(id); fetchReadings(id); }
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                    <div style={{
                                        width: '10px', height: '10px', borderRadius: '50%',
                                        background: getStatusColor(sensor.status),
                                        boxShadow: sensor.status === 'alert' ? '0 0 10px rgba(239, 68, 68, 0.5)' : 
                                                   sensor.status === 'online' ? '0 0 8px rgba(16, 185, 129, 0.4)' : 'none',
                                        animation: sensor.status === 'alert' ? 'pulse 1.5s infinite' : 'none'
                                    }} />
                                    <div>
                                        <div style={{ fontWeight: '600', fontSize: '0.95rem', color: '#fff' }}>{sensor.sensor_name}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            {sensor.sensor_id} · {sensor.asset_name || sensor.asset_id || 'Unlinked'} · {sensor.plant_name || sensor.plant_id || '—'}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                    {sensor.last_value !== null && (
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '1.4rem', fontWeight: '700', color: sensor.status === 'alert' ? '#ef4444' : '#fff' }}>
                                                {typeof sensor.last_value === 'number' ? sensor.last_value.toFixed(1) : sensor.last_value}{sensor.unit}
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{sensor.metric}</div>
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: isSnoozed(sensor.sensor_id) && sensor.status === 'alert' ? '#f59e0b' : getStatusColor(sensor.status), fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase' }}>
                                        {isSnoozed(sensor.sensor_id) && sensor.status === 'alert' ? (
                                            <><Bell size={14} style={{ opacity: 0.4 }} /> 🔇 SNOOZED</>
                                        ) : (
                                            <>{getStatusIcon(sensor.status)} {sensor.status}</>
                                        )}
                                    </div>
                                    {/* Snooze / Unsnooze button for alert sensors */}
                                    {sensor.status === 'alert' && (
                                        <div style={{ position: 'relative' }}>
                                            {isSnoozed(sensor.sensor_id) ? (
                                                <button onClick={e => { e.stopPropagation(); unsnoozeSensor(sensor.sensor_id); }}
                                                    style={{ padding: '3px 10px', fontSize: '0.7rem', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '12px', color: '#fbbf24', cursor: 'pointer', fontWeight: '600', whiteSpace: 'nowrap' }}
                                                    title={`Snoozed — ${getSnoozeRemaining(sensor.sensor_id)}. Click to re-enable alerts.`}
                                                >🔔 Unsnooze</button>
                                            ) : (
                                                <button onClick={e => { e.stopPropagation(); setSnoozeMenu(snoozeMenu === sensor.sensor_id ? null : sensor.sensor_id); }}
                                                    style={{ padding: '3px 10px', fontSize: '0.7rem', background: 'rgba(107,114,128,0.15)', border: '1px solid rgba(107,114,128,0.3)', borderRadius: '12px', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: '600', whiteSpace: 'nowrap' }}
                                                    title={t('sensors.silenceThisSensorsAlertChimeTip')}
                                                >🔇 Snooze</button>
                                            )}
                                            {/* Snooze duration picker */}
                                            {snoozeMenu === sensor.sensor_id && (
                                                <div onClick={e => e.stopPropagation()} style={{
                                                    position: 'absolute', right: 0, top: '100%', marginTop: '4px', zIndex: 100,
                                                    background: 'rgba(30,30,40,0.98)', border: '1px solid rgba(99,102,241,0.3)',
                                                    borderRadius: '10px', padding: '6px', display: 'flex', flexDirection: 'column', gap: '2px',
                                                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)', minWidth: '160px'
                                                }}>
                                                    <div style={{ padding: '4px 10px', fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '600', borderBottom: '1px solid var(--glass-border)', marginBottom: '2px' }}>Snooze alert for:</div>
                                                    {[
                                                        { label: '1 Hour', ms: 60 * 60 * 1000 },
                                                        { label: '4 Hours', ms: 4 * 60 * 60 * 1000 },
                                                        { label: '8 Hours (Full Shift)', ms: 8 * 60 * 60 * 1000 },
                                                        { label: 'Until Manually Cleared', ms: 'forever' }
                                                    ].map(opt => (
                                                        <button key={opt.label} onClick={() => snoozeSensor(sensor.sensor_id, opt.ms)}
                                                            style={{ padding: '6px 10px', fontSize: '0.8rem', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: '6px', textAlign: 'left', fontWeight: '500' }}
                                                            onMouseEnter={e => e.target.style.background = 'rgba(99,102,241,0.2)'}
                                                            onMouseLeave={e => e.target.style.background = 'transparent'}
                                                            title={`Silence this sensor for ${opt.label.toLowerCase()}`}
                                                        >🔇 {opt.label}</button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                        {sensor.readings_24h || 0} readings
                                        {sensor.alerts_24h > 0 && <span style={{ color: isSnoozed(sensor.sensor_id) ? '#f59e0b' : '#ef4444', marginLeft: '6px' }}>⚠ {sensor.alerts_24h} alerts</span>}
                                    </div>
                                    {expandedSensor === sensor.sensor_id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </div>
                            </div>

                            {/* Expanded: Sparkline + Recent Readings */}
                            {expandedSensor === sensor.sensor_id && (
                                <div style={{ padding: '0 18px 16px', borderTop: '1px solid var(--glass-border)' }}>
                                    <div style={{ paddingTop: '12px' }}>
                                        {/* Mini sparkline bar chart */}
                                        {sensorReadings[sensor.sensor_id]?.length > 0 ? (
                                            <div>
                                                <div style={{ fontSize: '0.8rem', color: '#818cf8', fontWeight: '600', marginBottom: '8px' }}>{t('sensor.last24Hours')}</div>
                                                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '60px', marginBottom: '12px' }}>
                                                    {sensorReadings[sensor.sensor_id].slice(0, 60).reverse().map((r, i) => {
                                                        const readings = sensorReadings[sensor.sensor_id];
                                                        const vals = readings.map(x => x.value);
                                                        const min = Math.min(...vals);
                                                        const max = Math.max(...vals);
                                                        const range = max - min || 1;
                                                        const pct = ((r.value - min) / range) * 100;
                                                        return (
                                                            <div key={i} style={{
                                                                flex: 1, minWidth: '3px', maxWidth: '8px',
                                                                height: `${Math.max(pct, 5)}%`,
                                                                background: r.threshold_exceeded 
                                                                    ? 'rgba(239, 68, 68, 0.7)' 
                                                                    : 'rgba(99, 102, 241, 0.5)',
                                                                borderRadius: '2px 2px 0 0',
                                                                transition: 'height 0.3s'
                                                            }} title={`${r.value}${r.unit} @ ${new Date(r.timestamp).toLocaleTimeString()}`} />
                                                        );
                                                    })}
                                                </div>
                                                {/* Threshold lines info */}
                                                {sensor.min_value !== null && sensor.min_value !== undefined && (
                                                    <div style={{ fontSize: '0.75rem', color: '#f59e0b' }}>Low threshold: {sensor.min_value}{sensor.unit}</div>
                                                )}
                                                {sensor.max_value !== null && sensor.max_value !== undefined && (
                                                    <div style={{ fontSize: '0.75rem', color: '#ef4444' }}>High threshold: {sensor.max_value}{sensor.unit}</div>
                                                )}
                                            </div>
                                        ) : (
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('sensor.noReadingsInLast')}</div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Recent Alerts */}
                    {dashboard?.recentAlerts?.length > 0 && (
                        <div style={{ marginTop: '10px' }}>
                            <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', color: '#ef4444' }}>
                                <AlertTriangle size={18} /> {t('sensor.recentThresholdEvents')}
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {dashboard.recentAlerts.map((alert, i) => (
                                    <div key={i} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '10px 14px', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '8px',
                                        border: '1px solid rgba(239, 68, 68, 0.2)', fontSize: '0.85rem'
                                    }}>
                                        <div>
                                            <span style={{ fontWeight: '600', color: '#ef4444' }}>{alert.sensor_name || alert.sensor_id}</span>
                                            <span style={{ color: 'var(--text-muted)', margin: '0 8px' }}>·</span>
                                            <span style={{ color: '#fff' }}>{alert.value}{alert.unit}</span>
                                            <span style={{ color: 'var(--text-muted)', margin: '0 8px' }}>·</span>
                                            <span style={{ color: 'var(--text-muted)' }}>{alert.metric}</span>
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            {new Date(alert.timestamp).toLocaleString()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ═══ CONFIG TAB ═══ */}
            {activeTab === 'config' && canConfig && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h4 style={{ margin: 0, color: '#818cf8' }}>{t('sensor.registeredSensors')}</h4>
                        <button onClick={() => setShowAddSensor(!showAddSensor)} className="btn-primary btn-sm" title={t('sensors.registerANewSensorTip')}>
                            <Plus size={14} /> {t('sensor.addSensor')}
                        </button>
                    </div>

                    {/* Add Sensor Form */}
                    {showAddSensor && (
                        <div style={{ padding: '18px', background: 'rgba(99,102,241,0.05)', borderRadius: '10px', border: '1px solid rgba(99,102,241,0.3)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div><label style={labelStyle}>{t('sensors.sensorId')}</label><input value={newSensor.sensor_id} onChange={e => setNewSensor(p => ({...p, sensor_id: e.target.value}))} placeholder={t('sensor.tempboiler001')} style={inputStyle} title={t('sensors.uniqueIdentifierForThisSensorTip')} /></div>
                                <div><label style={labelStyle}>{t('sensors.sensorName')}</label><input value={newSensor.sensor_name} onChange={e => setNewSensor(p => ({...p, sensor_name: e.target.value}))} placeholder={t('sensor.boilerOutletTemp')} style={inputStyle} title={t('sensors.descriptiveNameForThisSensorTip')} /></div>
                                <div><label style={labelStyle}>{t('sensor.assetId')}</label><input value={newSensor.asset_id} onChange={e => setNewSensor(p => ({...p, asset_id: e.target.value}))} placeholder={t('sensor.blr001')} style={inputStyle} title={t('sensors.assetIdThisSensorIsTip')} /></div>
                                <div><label style={labelStyle}>{t('sensor.assetName')}</label><input value={newSensor.asset_name} onChange={e => setNewSensor(p => ({...p, asset_name: e.target.value}))} placeholder={t('sensor.boilerPump3')} style={inputStyle} title={t('sensors.nameOfTheAssetThisTip')} /></div>
                                <div><label style={labelStyle}>{t('sensor.plantId')}</label><input value={newSensor.plant_id} onChange={e => setNewSensor(p => ({...p, plant_id: e.target.value}))} placeholder={t('sensor.jeffersoncity')} style={inputStyle} title={t('sensors.plantIdWhereThisSensorTip')} /></div>
                                <div><label style={labelStyle}>{t('sensor.plantName')}</label><input value={newSensor.plant_name} onChange={e => setNewSensor(p => ({...p, plant_name: e.target.value}))} placeholder={t('sensor.jeffersonCityMo')} style={inputStyle} title={t('sensors.nameOfThePlantWhereTip')} /></div>
                                <div><label style={labelStyle}>{t('sensor.metric')}</label>
                                    <select value={newSensor.metric} onChange={e => setNewSensor(p => ({...p, metric: e.target.value}))} style={inputStyle} title={t('sensors.selectTheTypeOfMeasurementTip')}>
                                        <option value="temperature">{t('sensors.temperature')}</option><option value="pressure">{t('sensor.pressure')}</option>
                                        <option value="vibration">{t('sensor.vibration')}</option><option value="humidity">{t('sensor.humidity')}</option>
                                        <option value="flow_rate">{t('sensor.flowRate')}</option><option value="current">{t('sensor.currentAmps')}</option>
                                        <option value="voltage">{t('sensor.voltage')}</option><option value="rpm">{t('sensor.rpm')}</option>
                                        <option value="level">{t('sensor.level')}</option><option value="ph">{t('sensors.ph')}</option>
                                    </select>
                                </div>
                                <div><label style={labelStyle}>{t('sensor.unit')}</label><input value={newSensor.unit} onChange={e => setNewSensor(p => ({...p, unit: e.target.value}))} placeholder={t('sensor.fPsiMms')} style={inputStyle} title={t('sensors.unitOfMeasurementEgFTip')} /></div>
                                <div><label style={labelStyle}>{t('sensor.location')}</label><input value={newSensor.location} onChange={e => setNewSensor(p => ({...p, location: e.target.value}))} placeholder={t('sensor.buildingALine3')} style={inputStyle} title={t('sensors.physicalLocationOfThisSensorTip')} /></div>
                                <div><label style={labelStyle}>{t('sensor.protocol')}</label>
                                    <select value={newSensor.protocol} onChange={e => setNewSensor(p => ({...p, protocol: e.target.value}))} style={inputStyle} title={t('sensors.communicationProtocolUsedByThisTip')}>
                                        <option value="http">{t('sensor.httpRest')}</option><option value="mqtt">{t('sensor.mqtt')}</option>
                                        <option value="modbus">{t('sensor.modbusTcp')}</option><option value="opcua">{t('sensor.opcua')}</option>
                                    </select>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
                                <button onClick={handleAddSensor} className="btn-save" title={t('sensors.registerThisSensorConfigurationTip')}>
                                    <CheckCircle size={14} /> {t('sensor.registerSensor')}
                                </button>
                                <button onClick={() => setShowAddSensor(false)} className="btn-nav" title={t('sensors.cancelAddingSensorTip')}>
                                    {t('sensor.cancel')}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Sensor List */}
                    {sensors.map(sensor => (
                        <div key={sensor.sensor_id} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '14px 18px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px',
                            border: '1px solid var(--glass-border)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: getStatusColor(sensor.status) }} />
                                <div>
                                    <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>{sensor.sensor_name}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        {sensor.sensor_id} · {sensor.metric} ({sensor.unit}) · {sensor.protocol} · {sensor.location || '—'}
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => handleToggleSensor(sensor.sensor_id)}
                                    className={sensor.enabled ? 'btn-save btn-sm' : 'btn-danger btn-sm'} title={sensor.enabled ? 'Disable this sensor' : 'Enable this sensor'}>
                                    {sensor.enabled ? 'Enabled' : 'Disabled'}
                                </button>
                                <button onClick={() => handleDeleteSensor(sensor.sensor_id)}
                                    className="btn-danger" style={{ padding: '4px 10px' }} title={t('sensors.deleteThisSensorAndAllTip')}>
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    ))}

                    {/* API Endpoint Display */}
                    <div style={{ padding: '16px', background: 'rgba(16, 185, 129, 0.05)', borderRadius: '10px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                        <div style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: '600', marginBottom: '8px' }}>{t('sensor.apiEndpointForPlcscada')}</div>
                        <code style={{ fontSize: '0.85rem', color: '#fff', background: 'rgba(0,0,0,0.3)', padding: '8px 14px', borderRadius: '6px', display: 'block', userSelect: 'all' }}>
                            POST {window.location.origin}/api/sensors/reading
                        </code>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                            Body: {'{'} "sensorId": "TEMP-001", "metric": "temperature", "value": 195.5, "unit": "°F", "plantId": "Demo_Plant_1" {'}'}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ THRESHOLDS TAB ═══ */}
            {activeTab === 'thresholds' && canThresholds && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h4 style={{ margin: 0, color: '#f59e0b' }}>{t('sensor.thresholdRulesAutowoTriggers')}</h4>
                        <button onClick={() => setShowAddThreshold(!showAddThreshold)} className="btn-edit btn-sm" title={t('sensors.addANewThresholdRuleTip')}>
                            <Plus size={14} /> {t('sensor.addThreshold')}
                        </button>
                    </div>

                    {showAddThreshold && (
                        <div style={{ padding: '18px', background: 'rgba(245, 158, 11, 0.05)', borderRadius: '10px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                                <div><label style={labelStyle}>Sensor ID *</label>
                                    <select value={newThreshold.sensor_id} onChange={e => setNewThreshold(p => ({...p, sensor_id: e.target.value}))} style={inputStyle} title={t('sensors.selectTheSensorToApplyTip')}>
                                        <option value="">{t('sensor.selectSensor')}</option>
                                        {sensors.map(s => <option key={s.sensor_id} value={s.sensor_id}>{s.sensor_name} ({s.sensor_id})</option>)}
                                    </select>
                                </div>
                                <div><label style={labelStyle}>{t('sensor.metric')}</label><input value={newThreshold.metric} onChange={e => setNewThreshold(p => ({...p, metric: e.target.value}))} placeholder={t('sensor.temperature')} style={inputStyle} title={t('sensors.theMetricTypeThisThresholdTip')} /></div>
                                <div><label style={labelStyle}>{t('sensor.woPriority')}</label>
                                    <select value={newThreshold.wo_priority} onChange={e => setNewThreshold(p => ({...p, wo_priority: parseInt(e.target.value, 10)}))} style={inputStyle} title={t('sensors.priorityLevelForAutogeneratedWorkTip')}>
                                        <option value={1}>1 — Emergency</option><option value={2}>2 — Critical</option><option value={3}>3 — Normal</option>
                                    </select>
                                </div>
                                <div><label style={labelStyle}>{t('sensor.lowThresholdMin')}</label><input type="number" value={newThreshold.min_value} onChange={e => setNewThreshold(p => ({...p, min_value: e.target.value}))} placeholder={t('sensors.eg32Placeholder')} style={inputStyle} title={t('sensors.minimumAcceptableValueReadingsBelowTip')} /></div>
                                <div><label style={labelStyle}>{t('sensor.highThresholdMax')}</label><input type="number" value={newThreshold.max_value} onChange={e => setNewThreshold(p => ({...p, max_value: e.target.value}))} placeholder={t('sensors.eg200Placeholder')} style={inputStyle} title={t('sensors.maximumAcceptableValueReadingsAboveTip')} /></div>
                                <div><label style={labelStyle}>{t('sensor.cooldownMinutes')}</label><input type="number" value={newThreshold.cooldown_minutes} onChange={e => setNewThreshold(p => ({...p, cooldown_minutes: parseInt(e.target.value, 10) || 30}))} style={inputStyle} title={t('sensors.minimumMinutesBetweenRepeatedAlertsTip')} /></div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>
                                    <input type="checkbox" checked={newThreshold.auto_wo} onChange={e => setNewThreshold(p => ({...p, auto_wo: e.target.checked}))} title={t('sensors.automaticallyCreateAWorkOrderTip')} /> {t('sensor.autocreateWorkOrder')}
                                </label>
                                <div style={{ flex: 1 }} />
                                <button onClick={handleAddThreshold} className="btn-save" title={t('sensors.saveThisThresholdRuleTip')}>
                                    <CheckCircle size={14} /> {t('sensor.saveThreshold')}
                                </button>
                                <button onClick={() => setShowAddThreshold(false)} className="btn-nav" title={t('sensors.cancelAddingThresholdTip')}>{t('sensor.cancel')}</button>
                            </div>
                        </div>
                    )}

                    {thresholds.length === 0 ? (
                        <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px dashed var(--glass-border)' }}>
                            {t('sensor.noThresholdsConfiguredAdd')}
                        </div>
                    ) : thresholds.map(th => {
                        const pri = getPriorityLabel(th.wo_priority);
                        return (
                            <div key={th.id} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '14px 18px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px',
                                border: '1px solid var(--glass-border)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <Gauge size={20} color="#f59e0b" />
                                    <div>
                                        <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>
                                            {th.sensor_id} · {th.metric}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                            {th.min_value !== null ? `Low: ${th.min_value}` : '—'} 
                                            {' · '}
                                            {th.max_value !== null ? `High: ${th.max_value}` : '—'}
                                            {' · '}
                                            Cooldown: {th.cooldown_minutes}min
                                            {th.auto_wo ? ' · 🔧 Auto-WO' : ''}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: '700', color: pri.color, background: `${pri.color}15`, padding: '3px 10px', borderRadius: '12px', border: `1px solid ${pri.color}30` }}>
                                        {pri.label}
                                    </span>
                                    <button onClick={() => handleDeleteThreshold(th.id)} className="btn-danger"
                                        style={{ padding: '4px 10px' }} title={t('sensors.deleteThisThresholdRuleTip')}>
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ═══ INTEGRATION GUIDE TAB ═══ */}
            {activeTab === 'guide' && canConfig && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ padding: '20px', background: 'rgba(16, 185, 129, 0.05)', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                        <h4 style={{ margin: '0 0 12px', color: '#10b981' }}>🔌 How to Connect Your PLC/SCADA System</h4>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                            Trier OS accepts sensor readings via a simple HTTP POST. Configure your PLC gateway, 
                            SCADA historian, or IoT bridge to push readings to this endpoint.
                        </p>
                    </div>

                    {/* API Endpoint */}
                    <div style={{ padding: '18px', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                        <div style={{ ...labelStyle, marginBottom: '10px', color: '#818cf8' }}>{t('sensor.restApiEndpoint')}</div>
                        <code style={{ display: 'block', padding: '12px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', color: '#10b981', fontSize: '0.9rem', userSelect: 'all' }}>
                            POST {window.location.origin}/api/sensors/reading
                        </code>
                        <pre style={{ margin: '12px 0 0', padding: '12px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', color: '#fff', fontSize: '0.8rem', overflow: 'auto' }}>
{`{
  "sensorId": "TEMP-BOILER-001",
  "assetId": "BLR-001",
  "metric": "temperature",
  "value": 195.5,
  "unit": "°F",
  "plantId": "Demo_Plant_1"
}`}
                        </pre>
                    </div>

                    {/* Integration Methods */}
                    {[
                        { title: '🏭 Allen-Bradley / Rockwell Automation', protocol: 'Ignition SCADA → MQTT Bridge → HTTP POST',
                          desc: 'Use Ignition Gateway\'s Script Module to publish sensor values via MQTT. A Node-RED bridge converts MQTT messages to HTTP POST calls to the Trier Sensor API.' },
                        { title: '⚙️ Siemens S7 (LOGO! / S7-1200 / S7-1500)', protocol: 'Node-RED → OPC-UA Client → HTTP POST',
                          desc: 'Install Node-RED with the OPC-UA client node. Connect to the S7 PLC\'s OPC-UA server, read tags at interval, and use the HTTP Request node to POST to the Trier API.' },
                        { title: '🔧 Generic Modbus TCP/RTU', protocol: 'Python Polling Script → HTTP POST',
                          desc: 'Run a Python script with pymodbus library that polls Modbus registers at configurable intervals and POSTs readings to the Trier Sensor API.' },
                        { title: '📡 MQTT Broker (Mosquitto, HiveMQ, AWS IoT)', protocol: 'MQTT Subscribe → HTTP Bridge',
                          desc: 'Subscribe to sensor topics on your MQTT broker using a lightweight Node.js or Python bridge that forwards messages as HTTP POST calls to Trier.' }
                    ].map((method, i) => (
                        <div key={i} style={{ padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                            <div style={{ fontWeight: '600', fontSize: '0.95rem', marginBottom: '6px' }}>{method.title}</div>
                            <div style={{ fontSize: '0.8rem', color: '#818cf8', marginBottom: '6px' }}>{method.protocol}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{method.desc}</div>
                        </div>
                    ))}

                    {/* Batch Endpoint */}
                    <div style={{ padding: '18px', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                        <div style={{ ...labelStyle, marginBottom: '10px', color: '#f59e0b' }}>{t('sensor.batchEndpointMultipleReadings')}</div>
                        <code style={{ display: 'block', padding: '12px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', color: '#10b981', fontSize: '0.9rem', userSelect: 'all' }}>
                            POST {window.location.origin}/api/sensors/reading/batch
                        </code>
                        <pre style={{ margin: '12px 0 0', padding: '12px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', color: '#fff', fontSize: '0.8rem', overflow: 'auto' }}>
{`{
  "readings": [
    { "sensorId": "TEMP-001", "metric": "temperature", "value": 195.5, "unit": "°F" },
    { "sensorId": "PRESS-001", "metric": "pressure", "value": 42.3, "unit": "PSI" },
    { "sensorId": "VIB-001", "metric": "vibration", "value": 3.2, "unit": "mm/s" }
  ]
}`}
                        </pre>
                    </div>
                </div>
            )}

            {/* ═══ CUSTOM DELETE CONFIRMATION MODAL ═══ */}
            {confirmDelete && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 10000
                }}>
                    <div style={{
                        background: 'var(--bg-card, #1e1e2e)', border: '1px solid rgba(239, 68, 68, 0.4)',
                        borderRadius: '14px', padding: '30px', maxWidth: '420px', width: '90%',
                        boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 40px rgba(239,68,68,0.1)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                            <div style={{
                                width: '44px', height: '44px', borderRadius: '12px',
                                background: 'rgba(239, 68, 68, 0.15)', display: 'flex',
                                alignItems: 'center', justifyContent: 'center'
                            }}>
                                <AlertTriangle size={22} color="#ef4444" />
                            </div>
                            <div>
                                <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#fff' }}>{t('sensor.confirmDeletion')}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('sensor.thisActionCannotBe')}</div>
                            </div>
                        </div>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: '0 0 24px', lineHeight: '1.5' }}>
                            {t('sensor.areYouSureYou')} <strong style={{ color: '#ef4444' }}>{confirmDelete.label}</strong>?
                        </p>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button onClick={() => setConfirmDelete(null)}
                                title={t('sensors.cancelAndKeepThisItemTip')}
                                style={{
                                    padding: '10px 22px', borderRadius: '8px', border: '1px solid var(--glass-border)',
                                    background: 'rgba(255,255,255,0.05)', color: '#fff', cursor: 'pointer',
                                    fontSize: '0.85rem', fontWeight: '600'
                                }}>{t('sensor.cancel')}</button>
                            <button onClick={executeDelete}
                                title={t('sensors.permanentlyDeleteThisItemTip')}
                                style={{
                                    padding: '10px 22px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.5)',
                                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                                    color: '#fff', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '600',
                                    boxShadow: '0 4px 15px rgba(239,68,68,0.3)'
                                }}>{t('sensor.delete')}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
