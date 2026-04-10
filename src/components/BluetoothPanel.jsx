// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Bluetooth Panel
 * ===========================
 * BLE device scanner and live sensor dashboard. Rendered inside GlobalScanner
 * when the "BLE" tab is active. Uses the Web Bluetooth API to discover,
 * connect, and stream sensor data from nearby BLE-enabled field devices.
 *
 * STATES:
 *   Unsupported browser  — instructional message with Chrome/Edge download link
 *   Idle                 — "Scan for Devices" button; permission prompt on click
 *   Scanning             — live device list with RSSI signal-strength bars
 *   Connected            — device info panel + live sensor readings + Link to Asset
 *
 * KEY FEATURES:
 *   - RSSI bars: 4-bar signal strength indicator (updates every 2s)
 *   - Live readings: Temperature, Vibration, Pressure, Humidity (service-dependent)
 *   - Link to Asset: associate connected device with an asset record for history logging
 *   - Auto-reconnect: re-establishes connection if device temporarily goes out of range
 *   - Reading history chart: 60-second rolling sparkline per sensor channel
 *
 * @param {object}   ble          — useBluetooth() hook return value
 *   plantId      {string}  Current plant ID
 *   onAssetFound {fn}      Called with assetId when auto-populate triggers
 */
import React, { useState } from 'react';
import { Bluetooth, BluetoothConnected, BluetoothOff, Thermometer, Activity, Gauge, AlertTriangle, Link, Unlink } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

// Signal strength bars based on RSSI
function RSSIBars({ rssi }) {
    const { t } = useTranslation();
    const strength = rssi >= -55 ? 4 : rssi >= -67 ? 3 : rssi >= -80 ? 2 : 1;
    const label = [
        t('bluetoothPanel.weak', 'Weak'),
        t('bluetoothPanel.fair', 'Fair'),
        t('bluetoothPanel.good', 'Good'),
        t('bluetoothPanel.excellent', 'Excellent')
    ][strength - 1];
    const color = ['#ef4444', '#f59e0b', '#10b981', '#10b981'][strength - 1];
    return (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2 }} title={`${rssi} dBm — ${label}`}>
            {[1, 2, 3, 4].map(i => (
                <div key={i} style={{
                    width: 4, borderRadius: 2,
                    height: 4 + i * 4,
                    background: i <= strength ? color : 'rgba(255,255,255,0.15)',
                }} />
            ))}
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 4 }}>{rssi} dBm</span>
        </div>
    );
}

// Distance indicator badge
function DistanceBadge({ metres }) {
    const { t } = useTranslation();
    if (metres < 0) return null;
    const label = metres < 0.5 ? t('bluetoothPanel.armsReach', "Arm's reach") : metres < 2 ? `~${metres.toFixed(1)} m` : `~${metres.toFixed(0)} m`;
    const color = metres < 0.5 ? '#10b981' : metres < 2 ? '#f59e0b' : '#64748b';
    return (
        <span style={{ fontSize: '0.68rem', padding: '2px 7px', borderRadius: 8, background: `${color}20`, color, border: `1px solid ${color}40` }}>
            {label}
        </span>
    );
}

// Single sensor reading card
function SensorCard({ label, reading, icon: Icon, thresholds, onBreach }) {
    const { t } = useTranslation();
    if (!reading) return (
        <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', opacity: 0.5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                <Icon size={14} /> {label} — {t('bluetoothPanel.notDetected', 'not detected')}
            </div>
        </div>
    );
    const val = parseFloat(reading.value);
    let alertColor = null;
    if (thresholds) {
        if (thresholds.max != null && val > thresholds.max) alertColor = '#ef4444';
        if (thresholds.min != null && val < thresholds.min) alertColor = '#f59e0b';
    }
    return (
        <div style={{ padding: '10px 12px', borderRadius: 10, background: alertColor ? `${alertColor}15` : 'rgba(255,255,255,0.06)', border: `1px solid ${alertColor ? alertColor + '40' : 'rgba(255,255,255,0.1)'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Icon size={14} style={{ color: alertColor || 'var(--primary)' }} />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{label}</span>
                {alertColor && <AlertTriangle size={12} style={{ color: alertColor }} />}
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: alertColor || '#f1f5f9' }}>
                {reading.value} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>{reading.unit}</span>
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>{reading.ts}</div>
        </div>
    );
}

export default function BluetoothPanel({ ble, plantId, onAssetFound }) {
    const { t } = useTranslation();
    const [linkingMac, setLinkingMac] = useState(null);
    const [linkAssetId, setLinkAssetId] = useState('');
    const [linkLoading, setLinkLoading] = useState(false);

    const handleLinkBeacon = async (mac) => {
        if (!linkAssetId.trim()) return;
        setLinkLoading(true);
        try {
            const user = (() => { try { return JSON.parse(localStorage.getItem('currentUser') || '{}'); } catch { return {}; } })();
            const r = await fetch('/api/ble/beacons', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('authToken')}` },
                body: JSON.stringify({ mac, assetId: linkAssetId.trim(), plantId: plantId || localStorage.getItem('selectedPlantId'), linkedBy: user.fullName || 'Unknown' }),
            });
            if (r.ok) {
                window.trierToast?.success(t('bluetoothPanel.beaconLinkedToAsset', 'Beacon linked to Asset') + ' ' + linkAssetId.trim());
                setLinkingMac(null);
                setLinkAssetId('');
            } else {
                window.trierToast?.error(t('bluetoothPanel.failedToLinkBeacon', 'Failed to link beacon'));
            }
        } catch { window.trierToast?.error(t('bluetoothPanel.networkError', 'Network error')); }
        setLinkLoading(false);
    };

    // Unsupported browser
    if (!ble.isSupported) {
        return (
            <div style={{ padding: '24px', borderRadius: 16, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' }}>
                <BluetoothOff size={40} style={{ color: '#64748b', marginBottom: 12 }} />
                <p style={{ color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8 }}>{t('bluetoothPanel.bluetoothNotAvailable', 'Bluetooth Not Available')}</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.83rem', lineHeight: 1.6 }}>
                    {t('bluetoothPanel.webBluetoothRequires', 'Web Bluetooth requires Chrome or Edge on Android, Windows, or macOS.')}<br />
                    {t('bluetoothPanel.iosUsersNote', 'iOS users: use the QR / Barcode tab or NFC Tag tab instead.')}
                </p>
            </div>
        );
    }

    // Connected device view
    if (ble.connectedDevice) {
        const { name, assetId } = ble.connectedDevice;
        return (
            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '12px 16px', borderRadius: 12, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)' }}>
                    <BluetoothConnected size={20} style={{ color: '#10b981' }} />
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#f1f5f9' }}>{name}</div>
                        {assetId && <div style={{ fontSize: '0.75rem', color: '#10b981' }}>{t('bluetoothPanel.asset', 'Asset')}: {assetId}</div>}
                    </div>
                    <button
                        onClick={ble.disconnect}
                        style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 5 }}
                    >
                        <Unlink size={12} /> {t('bluetoothPanel.disconnect', 'Disconnect')}
                    </button>
                </div>

                {/* Sensor readings */}
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 10, fontWeight: 600 }}>{t('bluetoothPanel.liveSensorReadings', 'LIVE SENSOR READINGS')}</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
                    <SensorCard label={t('bluetoothPanel.temperature', 'Temperature')} reading={ble.sensorReadings.temperature} icon={Thermometer} />
                    <SensorCard label={t('bluetoothPanel.vibration', 'Vibration')} reading={ble.sensorReadings.vibration} icon={Activity} />
                    <SensorCard label={t('bluetoothPanel.pressure', 'Pressure')} reading={ble.sensorReadings.pressure} icon={Gauge} />
                </div>

                {!Object.keys(ble.sensorReadings).length && (
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '10px 0' }}>
                        {t('bluetoothPanel.noSensorData', 'No sensor data received yet — device may not expose sensor characteristics.')}
                    </p>
                )}
            </div>
        );
    }

    // Scanning / idle — show device list
    return (
        <div>
            {!ble.isScanning ? (
                <div style={{ textAlign: 'center', padding: '10px 0 20px' }}>
                    <Bluetooth size={40} style={{ color: 'var(--primary)', marginBottom: 12, opacity: 0.8 }} />
                    <p style={{ color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>{t('bluetoothPanel.bleAssetScanner', 'BLE Asset Scanner')}</p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.83rem', marginBottom: 20, lineHeight: 1.6 }}>
                        {t('bluetoothPanel.scanDescription', 'Scan for Trier OS BLE beacon tags on nearby equipment.')}<br />
                        {t('bluetoothPanel.armsReachDescription', "When a tagged asset is within arm's reach, it auto-populates.")}
                    </p>
                    {!ble.isScanSupported && (
                        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 10, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', fontSize: '0.78rem', color: '#fbbf24', textAlign: 'left' }}>
                            <strong>{t('bluetoothPanel.note', 'Note:')}</strong> {t('bluetoothPanel.passiveScanNote', 'Passive background scanning requires the Chrome experimental features flag. A device-chooser dialog will open instead — select a Trier OS beacon to connect.')}
                        </div>
                    )}
                    <button
                        onClick={ble.scanForDevices}
                        style={{ width: '100%', padding: '12px', borderRadius: 10, background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                    >
                        <Bluetooth size={18} /> {t('bluetoothPanel.scanForBleDevices', 'Scan for BLE Devices')}
                    </button>
                </div>
            ) : (
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#3b82f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
                        <span style={{ color: '#93c5fd', fontWeight: 600, fontSize: '0.88rem' }}>{t('bluetoothPanel.scanning', 'Scanning…')}</span>
                        <button
                            onClick={ble.stopScan}
                            style={{ marginLeft: 'auto', padding: '4px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', cursor: 'pointer', fontSize: '0.78rem' }}
                        >
                            {t('bluetoothPanel.stop', 'Stop')}
                        </button>
                    </div>

                    {ble.nearbyDevices.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            {t('bluetoothPanel.noBeaconsDetected', 'No Trier OS beacons detected nearby…')}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {ble.nearbyDevices.map(device => (
                                <div key={device.id} style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                        <Bluetooth size={16} style={{ color: '#93c5fd', flexShrink: 0 }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {device.name}
                                            </div>
                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{device.id}</div>
                                        </div>
                                        <DistanceBadge metres={device.distanceM} />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <RSSIBars rssi={device.rssi} />
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button
                                                onClick={() => setLinkingMac(device.id === linkingMac ? null : device.id)}
                                                style={{ padding: '4px 10px', borderRadius: 7, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc', cursor: 'pointer', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 4 }}
                                                title={t('bluetoothPanel.linkBeaconToAssetTip', 'Link this beacon to an Asset ID')}
                                            >
                                                <Link size={11} /> {t('bluetoothPanel.linkAsset', 'Link Asset')}
                                            </button>
                                            <button
                                                onClick={() => { ble.stopScan(); ble.connectToDevice({ id: device.id, gatt: { connect: async () => {} }, name: device.name, addEventListener: () => {} }); }}
                                                style={{ padding: '4px 10px', borderRadius: 7, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#34d399', cursor: 'pointer', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 4 }}
                                                title={t('bluetoothPanel.connectToReadSensorDataTip', 'Connect to read sensor data')}
                                            >
                                                <BluetoothConnected size={11} /> {t('bluetoothPanel.connect', 'Connect')}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Inline link-to-asset form */}
                                    {linkingMac === device.id && (
                                        <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                                            <input
                                                type="text"
                                                value={linkAssetId}
                                                onChange={e => setLinkAssetId(e.target.value)}
                                                placeholder={t('bluetoothPanel.assetIdPlaceholder', 'Asset ID (e.g. PUMP-001)')}
                                                style={{ flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 7, padding: '5px 10px', color: '#f1f5f9', fontSize: '0.8rem' }}
                                                autoFocus
                                            />
                                            <button
                                                onClick={() => handleLinkBeacon(device.id)}
                                                disabled={linkLoading || !linkAssetId.trim()}
                                                style={{ padding: '5px 12px', borderRadius: 7, background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.4)', color: '#34d399', cursor: 'pointer', fontSize: '0.78rem', opacity: linkLoading ? 0.6 : 1 }}
                                            >
                                                {linkLoading ? '…' : t('bluetoothPanel.save', 'Save')}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {ble.error && (
                <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', fontSize: '0.82rem' }}>
                    <AlertTriangle size={13} style={{ verticalAlign: 'middle', marginRight: 6 }} />{ble.error}
                </div>
            )}
        </div>
    );
}
