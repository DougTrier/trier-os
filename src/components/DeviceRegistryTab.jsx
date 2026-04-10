// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS — Device Registry Tab
 * ================================
 * Plant-scoped OT device onboarding and management panel. Embedded as a tab
 * inside PlantSetupView. Owned by maintenance and engineering — not IT.
 *
 * WIZARD STEPS (for new device):
 *   1. Scan / Enter   — Barcode/QR scan input + serial lookup to detect existing records
 *   2. MAC + ARP      — Enter or scan the MAC address; hit Discover to auto-fill IP via ARP
 *   3. Modbus Probe   — One-click live connectivity test before saving
 *   4. Device Details — Type, manufacturer, model, function, asset/part link
 *   5. Save           — Review summary; metric map auto-wired on commit
 *
 * DEVICE CARD LIST:
 *   Below the wizard a card list shows all registered devices for this plant with:
 *   - Status badge (Pending / Active / Offline / Decommissioned)
 *   - IP, MAC, function, and link counts
 *   - Start / Stop worker button (calls /api/devices/:id/start-worker|stop-worker)
 *
 * API: All requests go to /api/devices (server/routes/device-registry.js).
 *   All requests include X-Plant-ID and Authorization headers.
 *
 * BARCODE SCANNER SUPPORT:
 *   USB/Bluetooth barcode scanners present as keyboards. The scan input field
 *   auto-focuses, captures the scan payload, and advances to step 2 automatically.
 *
 * I18N: All user-visible strings go through t(key, fallback). Keys live under
 *   the "deviceRegistry.*" namespace in src/i18n/en.json (and all language files).
 *   Common shared keys (btn.back, btn.save, common.notes, etc.) are reused.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from '../i18n/index.jsx';
import {
    Cpu, Plus, X, ChevronRight, CheckCircle, AlertTriangle,
    Wifi, WifiOff, Search, Network, Play, Square,
    RefreshCw, Trash2, Activity, Link, Package,
} from 'lucide-react';

// ── API helper ────────────────────────────────────────────────────────────────

const API = (path, opts = {}) => fetch(`/api/devices${path}`, {
    ...opts,
    headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        'Content-Type': 'application/json',
        'x-plant-id': localStorage.getItem('selectedPlantId') || 'Plant_1',
        ...opts.headers,
    },
});

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * Color-coded status badge pill.
 * Status values: Active | Pending | Offline | Decommissioned
 */
function StatusBadge({ status }) {
    const colors = {
        Active:         { bg: 'rgba(16,185,129,0.15)',  border: 'rgba(16,185,129,0.35)',  text: '#10b981' },
        Pending:        { bg: 'rgba(245,158,11,0.15)',  border: 'rgba(245,158,11,0.35)',  text: '#f59e0b' },
        Offline:        { bg: 'rgba(239,68,68,0.15)',   border: 'rgba(239,68,68,0.35)',   text: '#ef4444' },
        Decommissioned: { bg: 'rgba(100,116,139,0.15)', border: 'rgba(100,116,139,0.35)', text: '#64748b' },
    };
    const c = colors[status] || colors.Pending;
    return (
        <span style={{
            fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px',
            borderRadius: 10, background: c.bg, border: `1px solid ${c.border}`, color: c.text,
        }}>{status}</span>
    );
}

/** Labelled form field wrapper used throughout the wizard. */
function Field({ label, children }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {label}
            </label>
            {children}
        </div>
    );
}

// Shared input style for all wizard form fields
const inp = {
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 6, padding: '6px 10px', color: '#e2e8f0', fontSize: '0.83rem', width: '100%',
};

// ── Wizard ────────────────────────────────────────────────────────────────────

/**
 * DeviceWizard — 5-step device onboarding flow.
 *   Step 1: Barcode / serial scan
 *   Step 2: MAC address entry + ARP IP discovery
 *   Step 3: Modbus TCP probe to confirm connectivity
 *   Step 4: Device metadata (type, function, asset link)
 *   Step 5: Review + save (auto-wires DeviceMetricMap on commit)
 *
 * @param {{ plantId: string, onSaved: function, onCancel: function }} props
 */
function DeviceWizard({ plantId, onSaved, onCancel }) {
    const { t } = useTranslation();
    const [step, setStep]           = useState(1);
    const [serial, setSerial]       = useState('');
    const [existing, setExisting]   = useState(null);   // matches from lookup-serial
    const [mac, setMac]             = useState('');
    const [ip, setIp]               = useState('');
    const [port, setPort]           = useState('502');
    const [arpBusy, setArpBusy]     = useState(false);
    const [arpMsg, setArpMsg]       = useState('');
    const [probeResult, setProbeResult] = useState(null);
    const [probeBusy, setProbeBusy] = useState(false);
    const [form, setForm]           = useState({
        deviceType: 'PLC', manufacturer: '', model: '', firmwareVersion: '',
        function: '', assetId: '', partId: '', notes: '',
    });
    const [saving, setSaving]       = useState(false);
    const [error, setError]         = useState('');
    const scanRef = useRef(null);

    // Auto-focus the scan input whenever step 1 is active
    useEffect(() => { if (step === 1 && scanRef.current) scanRef.current.focus(); }, [step]);

    // ── Step 1: barcode scan / serial lookup ──────────────────────────────────
    const lookupSerial = useCallback(async (value) => {
        if (!value.trim()) return;
        const r = await API('/lookup-serial', { method: 'POST', body: JSON.stringify({ serial: value }) });
        const d = await r.json();
        setExisting(d.found ? d.matches : null);
        setStep(2);
    }, []);

    const handleScanKey = (e) => {
        if (e.key === 'Enter' && serial.trim()) lookupSerial(serial);
    };

    // ── Step 2: MAC + ARP discovery ───────────────────────────────────────────
    const discoverIp = async () => {
        if (!mac.trim()) { setArpMsg(t('deviceRegistry.wizard.enterMacFirst', 'Enter a MAC address first.')); return; }
        setArpBusy(true);
        setArpMsg('');
        try {
            const r = await API('/arp-probe', { method: 'POST', body: JSON.stringify({ mac, sweep: false }) });
            const d = await r.json();
            if (d.found && d.ip) {
                setIp(d.ip);
                setArpMsg(`Found: ${d.ip}`);
            } else {
                setArpMsg(t('deviceRegistry.wizard.notFoundArp', 'Not found in ARP cache. Try Sweep or enter IP manually.'));
            }
        } catch (err) {
            setArpMsg(`ARP error: ${err.message}`);
        } finally {
            setArpBusy(false);
        }
    };

    const discoverIpSweep = async () => {
        if (!mac.trim()) { setArpMsg(t('deviceRegistry.wizard.enterMacFirst', 'Enter a MAC address first.')); return; }
        setArpBusy(true);
        setArpMsg(t('deviceRegistry.wizard.sweeping', 'Running subnet sweep (~10 seconds)…'));
        try {
            const hint = ip ? ip.split('.').slice(0, 3).join('.') : null;
            const r = await API('/arp-probe', {
                method: 'POST',
                body: JSON.stringify({ mac, sweep: true, subnetHint: hint }),
            });
            const d = await r.json();
            if (d.found && d.ip) {
                setIp(d.ip);
                setArpMsg(`Found after sweep: ${d.ip}`);
            } else {
                setArpMsg(t('deviceRegistry.wizard.notFoundSweep', 'Device not found on subnet. Enter IP manually.'));
            }
        } catch (err) {
            setArpMsg(`Sweep error: ${err.message}`);
        } finally {
            setArpBusy(false);
        }
    };

    // ── Step 3: Modbus probe ──────────────────────────────────────────────────
    const runProbe = async () => {
        if (!ip.trim()) { setError(t('deviceRegistry.wizard.enterIpFirst', 'Enter an IP address before probing.')); return; }
        setError('');
        setProbeBusy(true);
        try {
            const r = await API('/modbus-probe', { method: 'POST', body: JSON.stringify({ ip, port }) });
            const d = await r.json();
            setProbeResult(d);
        } catch (err) {
            setProbeResult({ reachable: false, error: err.message });
        } finally {
            setProbeBusy(false);
        }
    };

    // ── Step 5: save device ───────────────────────────────────────────────────
    const saveDevice = async () => {
        setSaving(true);
        setError('');
        try {
            const r = await API('/', {
                method: 'POST',
                body: JSON.stringify({
                    serialNumber: serial || null,
                    barcodeRaw:   serial || null,
                    macAddress:   mac || null,
                    ipAddress:    ip || null,
                    port:         parseInt(port, 10) || 502,
                    ...form,
                }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Save failed');
            onSaved(d.device);
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const ff = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

    // Step indicator labels — translated
    const stepLabels = [
        t('deviceRegistry.wizard.stepScan',    'Scan'),
        t('deviceRegistry.wizard.stepMac',     'MAC + IP'),
        t('deviceRegistry.wizard.stepProbe',   'Probe'),
        t('deviceRegistry.wizard.stepDetails', 'Details'),
        t('deviceRegistry.wizard.stepSave',    'Save'),
    ];

    return (
        <div style={{ background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.2)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
            {/* ── Step indicator ─────────────────────────────────────────── */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 20, alignItems: 'center' }}>
                {stepLabels.map((label, i) => {
                    const n = i + 1;
                    const done   = step > n;
                    const active = step === n;
                    return (
                        <React.Fragment key={n}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: done ? 'pointer' : 'default' }}
                                onClick={() => done && setStep(n)}>
                                <div style={{
                                    width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.75rem', fontWeight: 700,
                                    background: done ? '#10b981' : active ? '#0ea5e9' : 'rgba(255,255,255,0.08)',
                                    color: (done || active) ? '#fff' : '#64748b',
                                    border: active ? '2px solid #0ea5e9' : done ? '2px solid #10b981' : '2px solid transparent',
                                }}>{done ? <CheckCircle size={14} /> : n}</div>
                                <span style={{ fontSize: '0.65rem', color: active ? '#0ea5e9' : '#64748b' }}>{label}</span>
                            </div>
                            {i < stepLabels.length - 1 && (
                                <div style={{ flex: 1, height: 2, background: step > n ? '#10b981' : 'rgba(255,255,255,0.08)', margin: '0 4px', marginBottom: 18 }} />
                            )}
                        </React.Fragment>
                    );
                })}
                <button onClick={onCancel} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}>
                    <X size={16} />
                </button>
            </div>

            {/* ── Step 1: Scan ──────────────────────────────────────────────── */}
            {step === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem' }}>
                        {t('deviceRegistry.wizard.scanHint', 'Scan the barcode or QR code on the device, or type the serial number manually.')}
                    </p>
                    <Field label={t('deviceRegistry.wizard.serialLabel', 'Serial / Barcode')}>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input
                                ref={scanRef}
                                value={serial}
                                onChange={e => setSerial(e.target.value)}
                                onKeyDown={handleScanKey}
                                placeholder={t('deviceRegistry.wizard.serialPlaceholder', 'Scan or type serial number…')}
                                style={{ ...inp, flex: 1 }}
                            />
                            <button onClick={() => lookupSerial(serial)} disabled={!serial.trim()}
                                style={{ padding: '6px 14px', background: 'rgba(14,165,233,0.2)', border: '1px solid rgba(14,165,233,0.4)', color: '#0ea5e9', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem' }}>
                                <Search size={13} /> {t('deviceRegistry.wizard.lookUp', 'Look Up')}
                            </button>
                        </div>
                    </Field>
                    {existing && (
                        <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 6, padding: 10 }}>
                            <p style={{ margin: '0 0 6px', fontSize: '0.8rem', color: '#f59e0b', fontWeight: 600 }}>
                                <AlertTriangle size={13} style={{ marginRight: 4 }} />
                                {t('deviceRegistry.wizard.alreadyRegistered', 'This serial is already registered')} ({existing.length})
                            </p>
                            {existing.map(d => (
                                <div key={d.ID} style={{ fontSize: '0.78rem', color: '#94a3b8', marginLeft: 4 }}>
                                    #{d.ID} — {d.Function || d.Status} | {d.IPAddress || 'no IP'} | {d.MACAddress || 'no MAC'}
                                </div>
                            ))}
                            <button onClick={() => setStep(2)} style={{ marginTop: 8, padding: '5px 12px', background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.3)', color: '#0ea5e9', borderRadius: 6, cursor: 'pointer', fontSize: '0.78rem' }}>
                                {t('deviceRegistry.wizard.addAnyway', 'Add Another Anyway')}
                            </button>
                        </div>
                    )}
                    <button onClick={() => setStep(2)} style={{ alignSelf: 'flex-end', padding: '7px 16px', background: 'rgba(14,165,233,0.2)', border: '1px solid rgba(14,165,233,0.4)', color: '#0ea5e9', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.82rem' }}>
                        {t('deviceRegistry.wizard.skipNoBarcode', 'Skip (no barcode)')} <ChevronRight size={13} />
                    </button>
                </div>
            )}

            {/* ── Step 2: MAC + ARP ─────────────────────────────────────────── */}
            {step === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem' }}>
                        {t('deviceRegistry.wizard.macHint', 'Enter the MAC address printed on the device label. Click Discover to auto-fill the IP.')}
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <Field label={t('deviceRegistry.wizard.macLabel', 'MAC Address')}>
                            <input value={mac} onChange={e => setMac(e.target.value)}
                                placeholder="00:1A:2B:3C:4D:5E" style={inp} />
                        </Field>
                        <Field label={t('deviceRegistry.wizard.portLabel', 'Modbus TCP Port')}>
                            <input value={port} onChange={e => setPort(e.target.value)}
                                placeholder="502" style={inp} type="number" />
                        </Field>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <button onClick={discoverIp} disabled={arpBusy}
                            style={{ padding: '6px 14px', background: 'rgba(14,165,233,0.2)', border: '1px solid rgba(14,165,233,0.4)', color: '#0ea5e9', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem' }}>
                            <Network size={13} /> {arpBusy ? t('deviceRegistry.wizard.searching', 'Searching…') : t('deviceRegistry.wizard.discoverIp', 'Discover IP')}
                        </button>
                        <button onClick={discoverIpSweep} disabled={arpBusy}
                            style={{ padding: '6px 14px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', color: '#818cf8', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem' }}>
                            <Activity size={13} /> {arpBusy ? '…' : t('deviceRegistry.wizard.sweepSubnet', 'Sweep Subnet (~10s)')}
                        </button>
                        {arpMsg && <span style={{ fontSize: '0.78rem', color: arpMsg.startsWith('Found') ? '#10b981' : '#f59e0b' }}>{arpMsg}</span>}
                    </div>
                    <Field label={t('deviceRegistry.wizard.ipLabel', 'IP Address (auto-filled or manual)')}>
                        <input value={ip} onChange={e => setIp(e.target.value)}
                            placeholder="192.168.1.x" style={inp} />
                    </Field>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => setStep(1)} style={{ padding: '6px 14px', background: 'none', border: '1px solid rgba(255,255,255,0.12)', color: '#94a3b8', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem' }}>
                            {t('btn.back', 'Back')}
                        </button>
                        <button onClick={() => setStep(3)} style={{ padding: '7px 16px', background: 'rgba(14,165,233,0.2)', border: '1px solid rgba(14,165,233,0.4)', color: '#0ea5e9', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.82rem' }}>
                            {t('btn.next', 'Next')} <ChevronRight size={13} />
                        </button>
                    </div>
                </div>
            )}

            {/* ── Step 3: Modbus Probe ──────────────────────────────────────── */}
            {step === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem' }}>
                        {t('deviceRegistry.wizard.probeHint', 'Verify the device is reachable before saving.')}
                        {' '}<strong>{ip || '—'}</strong> : <strong>{port}</strong>
                    </p>
                    <button onClick={runProbe} disabled={probeBusy || !ip}
                        style={{ alignSelf: 'flex-start', padding: '8px 18px', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)', color: '#10b981', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 600 }}>
                        <Wifi size={14} /> {probeBusy ? t('deviceRegistry.wizard.probing', 'Probing…') : t('deviceRegistry.wizard.runProbe', 'Run Modbus Probe')}
                    </button>
                    {probeResult && (
                        <div style={{
                            background: probeResult.reachable ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                            border: `1px solid ${probeResult.reachable ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                            borderRadius: 8, padding: 12, fontSize: '0.82rem', color: '#e2e8f0',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontWeight: 700, color: probeResult.reachable ? '#10b981' : '#ef4444' }}>
                                {probeResult.reachable ? <CheckCircle size={15} /> : <WifiOff size={15} />}
                                {probeResult.reachable
                                    ? `${t('deviceRegistry.wizard.reachable', 'Reachable')} (${probeResult.latencyMs}ms)`
                                    : t('deviceRegistry.wizard.unreachable', 'Unreachable')}
                            </div>
                            {probeResult.reachable && probeResult.registers && (
                                <div style={{ color: '#94a3b8', fontSize: '0.78rem' }}>
                                    Registers[0-3]: {probeResult.registers.join(', ')}
                                </div>
                            )}
                            {probeResult.error && <div style={{ color: '#ef4444', fontSize: '0.78rem' }}>{probeResult.error}</div>}
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => setStep(2)} style={{ padding: '6px 14px', background: 'none', border: '1px solid rgba(255,255,255,0.12)', color: '#94a3b8', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem' }}>
                            {t('btn.back', 'Back')}
                        </button>
                        <button onClick={() => setStep(4)} style={{ padding: '7px 16px', background: 'rgba(14,165,233,0.2)', border: '1px solid rgba(14,165,233,0.4)', color: '#0ea5e9', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.82rem' }}>
                            {probeResult?.reachable
                                ? t('deviceRegistry.wizard.continue', 'Continue')
                                : t('deviceRegistry.wizard.skipProbe',  'Skip Probe')}
                            <ChevronRight size={13} />
                        </button>
                    </div>
                </div>
            )}

            {/* ── Step 4: Device Details ────────────────────────────────────── */}
            {step === 4 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <Field label={t('deviceRegistry.wizard.deviceTypeLabel', 'Device Type')}>
                            <select value={form.deviceType} onChange={ff('deviceType')} style={{ ...inp, cursor: 'pointer' }}>
                                {['PLC', 'SCADA', 'Sensor', 'HMI', 'VFD', 'Other'].map(v => (
                                    <option key={v} value={v}>{v}</option>
                                ))}
                            </select>
                        </Field>
                        <Field label={t('deviceRegistry.wizard.functionLabel', 'Function / Label')}>
                            <input value={form.function} onChange={ff('function')}
                                placeholder={t('deviceRegistry.wizard.functionPlaceholder', 'e.g. Line 1 PLC')} style={inp} />
                        </Field>
                        <Field label={t('catalog.col.manufacturer', 'Manufacturer')}>
                            <input value={form.manufacturer} onChange={ff('manufacturer')}
                                placeholder={t('deviceRegistry.wizard.manufacturerPlaceholder', 'Allen-Bradley, Siemens…')} style={inp} />
                        </Field>
                        <Field label={t('asset.model', 'Model')}>
                            <input value={form.model} onChange={ff('model')}
                                placeholder={t('deviceRegistry.wizard.modelPlaceholder', 'ControlLogix 5580…')} style={inp} />
                        </Field>
                        <Field label={t('deviceRegistry.wizard.firmwareLabel', 'Firmware Version')}>
                            <input value={form.firmwareVersion} onChange={ff('firmwareVersion')}
                                placeholder={t('deviceRegistry.wizard.firmwarePlaceholder', 'v34.01')} style={inp} />
                        </Field>
                        <Field label={t('deviceRegistry.wizard.assetIdLabel', 'Asset ID (optional)')}>
                            <input value={form.assetId} onChange={ff('assetId')}
                                placeholder={t('deviceRegistry.wizard.assetIdPlaceholder', 'Link to CMMS asset')} style={inp} />
                        </Field>
                        <Field label={t('deviceRegistry.wizard.partIdLabel', 'Part ID (optional)')}>
                            <input value={form.partId} onChange={ff('partId')}
                                placeholder={t('deviceRegistry.wizard.partIdPlaceholder', 'Link to parts catalog')} style={inp} />
                        </Field>
                    </div>
                    <Field label={t('common.notes', 'Notes')}>
                        <input value={form.notes} onChange={ff('notes')}
                            placeholder={t('deviceRegistry.wizard.notesPlaceholder', 'Panel location, cabinet number…')} style={inp} />
                    </Field>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => setStep(3)} style={{ padding: '6px 14px', background: 'none', border: '1px solid rgba(255,255,255,0.12)', color: '#94a3b8', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem' }}>
                            {t('btn.back', 'Back')}
                        </button>
                        <button onClick={() => setStep(5)} style={{ padding: '7px 16px', background: 'rgba(14,165,233,0.2)', border: '1px solid rgba(14,165,233,0.4)', color: '#0ea5e9', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.82rem' }}>
                            {t('deviceRegistry.wizard.review', 'Review')} <ChevronRight size={13} />
                        </button>
                    </div>
                </div>
            )}

            {/* ── Step 5: Review + Save ─────────────────────────────────────── */}
            {step === 5 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 14 }}>
                        {[
                            [t('deviceRegistry.wizard.serialLabel', 'Serial'),       serial || '—'],
                            ['MAC',                                                    mac    || '—'],
                            ['IP',                                                     ip     || '—'],
                            [t('deviceRegistry.wizard.portLabel', 'Port'),            port],
                            [t('deviceRegistry.wizard.deviceTypeLabel', 'Type'),      form.deviceType],
                            [t('deviceRegistry.wizard.functionLabel', 'Function'),    form.function    || '—'],
                            [t('catalog.col.manufacturer', 'Manufacturer'),           form.manufacturer || '—'],
                            [t('asset.model', 'Model'),                               form.model       || '—'],
                            [t('deviceRegistry.wizard.assetIdLabel', 'Asset ID'),     form.assetId     || '—'],
                            [t('deviceRegistry.wizard.partIdLabel',  'Part ID'),      form.partId      || '—'],
                        ].map(([label, value]) => (
                            <div key={label} style={{ display: 'flex', gap: 12, paddingBottom: 4, borderBottom: '1px solid rgba(255,255,255,0.04)', marginBottom: 4 }}>
                                <span style={{ width: 110, fontSize: '0.75rem', color: '#64748b', flexShrink: 0 }}>{label}</span>
                                <span style={{ fontSize: '0.82rem', color: '#e2e8f0' }}>{value}</span>
                            </div>
                        ))}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 6, padding: 10 }}>
                        <strong style={{ color: '#10b981' }}>{t('deviceRegistry.wizard.autoWiringLabel', 'Auto-wiring:')}</strong>{' '}
                        {t('deviceRegistry.wizard.autoWiringNote', 'Saving this device will auto-create metric map entries for corporate rollups.')}
                    </div>
                    {error && <div style={{ color: '#ef4444', fontSize: '0.82rem' }}>{error}</div>}
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => setStep(4)} style={{ padding: '6px 14px', background: 'none', border: '1px solid rgba(255,255,255,0.12)', color: '#94a3b8', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem' }}>
                            {t('btn.back', 'Back')}
                        </button>
                        <button onClick={saveDevice} disabled={saving}
                            style={{ padding: '8px 20px', background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.4)', color: '#10b981', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 600 }}>
                            <CheckCircle size={14} />
                            {saving
                                ? t('deviceRegistry.wizard.saving', 'Saving…')
                                : t('deviceRegistry.wizard.saveDevice', 'Save Device')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Device Card ───────────────────────────────────────────────────────────────

/**
 * Card representing a single registered device.
 * Shows status, connectivity info, and worker start/stop controls.
 *
 * @param {{ device: object, onDeleted: function, onRefresh: function }} props
 */
function DeviceCard({ device, onDeleted, onRefresh }) {
    const { t } = useTranslation();
    const [workerBusy, setWorkerBusy] = useState(false);
    const [workerMsg, setWorkerMsg]   = useState('');
    const isActive = device.Status === 'Active';

    const toggleWorker = async () => {
        setWorkerBusy(true);
        setWorkerMsg('');
        const path = isActive ? `/${device.ID}/stop-worker` : `/${device.ID}/start-worker`;
        try {
            const r = await API(path, { method: 'POST' });
            const d = await r.json();
            if (d.ok) {
                setWorkerMsg(isActive
                    ? t('deviceRegistry.card.workerStopped', 'Worker stopped')
                    : t('deviceRegistry.card.workerStarted', 'Worker started'));
                onRefresh();
            } else {
                setWorkerMsg(d.error || d.message || 'Error');
            }
        } catch (err) {
            setWorkerMsg(err.message);
        } finally {
            setWorkerBusy(false);
        }
    };

    const deleteDevice = async () => {
        if (!confirm(`${t('deviceRegistry.card.removeDevice', 'Remove device')} "${device.Function || device.SerialNumber || `#${device.ID}`}"?`)) return;
        await API(`/${device.ID}`, { method: 'DELETE' });
        onDeleted(device.ID);
    };

    return (
        <div style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8, padding: 14, display: 'flex', gap: 14, alignItems: 'flex-start',
        }}>
            {/* Icon */}
            <div style={{ width: 38, height: 38, borderRadius: 8, background: 'rgba(14,165,233,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Cpu size={18} color="#0ea5e9" />
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#e2e8f0' }}>
                        {device.Function || device.Model || `Device #${device.ID}`}
                    </span>
                    <StatusBadge status={device.Status} />
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{device.DeviceType}</span>
                </div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '0.78rem', color: '#64748b' }}>
                    {device.IPAddress  && <span><Wifi size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} />{device.IPAddress}:{device.Port}</span>}
                    {device.MACAddress && <span><Network size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} />{device.MACAddress}</span>}
                    {device.Manufacturer && <span>{device.Manufacturer} {device.Model}</span>}
                    {device.AssetID && <span><Link size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} />Asset {device.AssetID}</span>}
                    {device.PartID  && <span><Package size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} />Part {device.PartID}</span>}
                </div>
                {workerMsg && <div style={{ marginTop: 4, fontSize: '0.75rem', color: '#10b981' }}>{workerMsg}</div>}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={toggleWorker} disabled={workerBusy}
                    title={isActive ? t('deviceRegistry.card.stop', 'Stop') : t('deviceRegistry.card.start', 'Start')}
                    style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${isActive ? 'rgba(239,68,68,0.4)' : 'rgba(16,185,129,0.4)'}`, background: isActive ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', color: isActive ? '#ef4444' : '#10b981', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem' }}>
                    {isActive ? <Square size={12} /> : <Play size={12} />}
                    {workerBusy ? '…' : isActive ? t('deviceRegistry.card.stop', 'Stop') : t('deviceRegistry.card.start', 'Start')}
                </button>
                <button onClick={deleteDevice}
                    title={t('deviceRegistry.card.removeDevice', 'Remove device')}
                    style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.07)', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Trash2 size={13} />
                </button>
            </div>
        </div>
    );
}

// ── Main Tab Component ────────────────────────────────────────────────────────

/**
 * DeviceRegistryTab
 * Embedded tab in PlantSetupView. Shows the onboarding wizard (when open)
 * and the list of registered devices for this plant.
 *
 * @param {{ plantId: string, plantLabel: string }} props
 */
export default function DeviceRegistryTab({ plantId, plantLabel }) {
    const { t } = useTranslation();
    const [devices, setDevices]       = useState([]);
    const [loading, setLoading]       = useState(true);
    const [showWizard, setShowWizard] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await API('/');
            const d = await r.json();
            setDevices(Array.isArray(d) ? d : []);
        } catch (_) {
            setDevices([]);
        } finally {
            setLoading(false);
        }
    }, [plantId]);

    useEffect(() => { load(); }, [load]);

    const handleSaved = () => {
        setShowWizard(false);
        load();
    };

    const handleDeleted = (id) => {
        setDevices(prev => prev.filter(d => d.ID !== id));
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', overflow: 'auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <Cpu size={18} color="#0ea5e9" />
                <div>
                    <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '0.95rem' }}>
                        {t('deviceRegistry.title', 'Device Registry')}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {t('deviceRegistry.subtitle', 'PLCs, SCADA controllers, sensors, and HMIs')} — {plantLabel || plantId}
                    </div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <button onClick={load} style={{ padding: '5px 10px', background: 'none', border: '1px solid rgba(255,255,255,0.12)', color: '#64748b', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem' }}>
                        <RefreshCw size={12} /> {t('btn.refresh', 'Refresh')}
                    </button>
                    {!showWizard && (
                        <button onClick={() => setShowWizard(true)}
                            style={{ padding: '6px 14px', background: 'rgba(14,165,233,0.2)', border: '1px solid rgba(14,165,233,0.4)', color: '#0ea5e9', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 600 }}>
                            <Plus size={13} /> {t('deviceRegistry.registerDevice', 'Register Device')}
                        </button>
                    )}
                </div>
            </div>

            {/* Wizard */}
            {showWizard && (
                <DeviceWizard
                    plantId={plantId}
                    onSaved={handleSaved}
                    onCancel={() => setShowWizard(false)}
                />
            )}

            {/* Device list */}
            {loading ? (
                <div style={{ color: '#64748b', fontSize: '0.85rem', textAlign: 'center', padding: 40 }}>
                    {t('deviceRegistry.loadingDevices', 'Loading devices…')}
                </div>
            ) : devices.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                    <Cpu size={36} color="#1e293b" style={{ marginBottom: 10 }} />
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 6 }}>
                        {t('deviceRegistry.noDevicesTitle', 'No devices registered yet')}
                    </div>
                    <div style={{ fontSize: '0.8rem' }}>
                        {t('deviceRegistry.noDevicesHint', 'Click Register Device above to scan a barcode and onboard your first PLC or SCADA controller.')}
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                        {devices.length} {t('deviceRegistry.devicesRegistered', 'devices registered')}
                    </div>
                    {devices.map(d => (
                        <DeviceCard key={d.ID} device={d} onDeleted={handleDeleted} onRefresh={load} />
                    ))}
                </div>
            )}
        </div>
    );
}
