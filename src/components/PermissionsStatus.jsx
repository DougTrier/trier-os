// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS — Browser Sensor Permissions Dashboard
 * =================================================
 * Live status panel for all browser device permissions required by Trier OS.
 * Shows granted/denied/prompt status for each sensor with a one-tap "Request"
 * button to trigger the browser permission prompt. Embedded in SettingsView.
 *
 * PERMISSIONS MONITORED:
 *   Camera         — Photo capture, OCR label reading, gauge reading, CV inspection
 *   Geolocation    — GPS location for asset mapping, fleet tracking, work order GPS
 *   Bluetooth      — BLE sensor pairing via BluetoothPanel (WebBluetooth API)
 *   NFC            — NFC asset tag scanning (if device supports it)
 *   Notifications  — Push notifications for PM reminders, escalations, @mentions
 *
 * KEY FEATURES:
 *   - Status badge: Granted (green) / Denied (red) / Not asked (yellow) / N/A (gray)
 *   - "Request" button: triggers browser permission dialog for denied/unasked permissions
 *   - Support detection: hides request button on browsers that don't support the API
 *   - Camera test: brief getUserMedia call to confirm camera actually works
 *   - Refresh status: re-queries all permissions on demand
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from '../i18n/index.jsx';

const PERMISSIONS = [
    {
        key: 'camera',
        label: 'Camera',
        icon: '📷',
        desc: 'Required for photo capture, OCR, gauge reading, and CV inspection.',
        api: () => navigator.permissions?.query({ name: 'camera' }),
        request: () => navigator.mediaDevices?.getUserMedia({ video: true }).then(s => { s.getTracks().forEach(t => t.stop()); }),
        supported: () => 'mediaDevices' in navigator,
    },
    {
        key: 'geolocation',
        label: 'Geolocation',
        icon: '📍',
        desc: 'Required for GPS asset tagging, incident location, and fleet tracking.',
        api: () => navigator.permissions?.query({ name: 'geolocation' }),
        request: () => new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })),
        supported: () => 'geolocation' in navigator,
    },
    {
        key: 'bluetooth',
        label: 'Bluetooth',
        icon: '🔵',
        desc: 'Required for BLE beacon proximity detection and sensor readings. Chrome/Edge only.',
        api: () => null, // No Permissions API entry for BLE
        request: () => navigator.bluetooth?.requestDevice({ acceptAllDevices: true }),
        supported: () => 'bluetooth' in navigator,
    },
    {
        key: 'nfc',
        label: 'NFC',
        icon: '📡',
        desc: 'Required for NFC tag encoding and scanning. Android Chrome only.',
        api: () => null,
        request: () => new NDEFReader().scan(),
        supported: () => 'NDEFReader' in window,
    },
    {
        key: 'notifications',
        label: 'Notifications',
        icon: '🔔',
        desc: 'Required for browser push alerts — geofence breaches, critical WOs, sensor alarms.',
        api: () => navigator.permissions?.query({ name: 'notifications' }),
        request: () => Notification.requestPermission(),
        supported: () => 'Notification' in window,
    },
];

function statusMeta(status, t) {
    if (status === 'granted')    return { label: t('permissions.granted',     'Granted'),     color: '#10b981', bg: 'rgba(16,185,129,0.12)' };
    if (status === 'denied')     return { label: t('permissions.denied',      'Denied'),      color: '#ef4444', bg: 'rgba(239,68,68,0.1)' };
    if (status === 'prompt')     return { label: t('permissions.notAsked',    'Not Asked'),   color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' };
    if (status === 'requesting') return { label: t('permissions.requesting',  'Requesting…'), color: '#6366f1', bg: 'rgba(99,102,241,0.1)' };
    if (status === 'unsupported')return { label: t('permissions.unsupported', 'Unsupported'), color: '#475569', bg: 'rgba(100,116,139,0.1)' };
    return                               { label: t('permissions.unknown',    'Unknown'),     color: '#64748b', bg: 'rgba(100,116,139,0.08)' };
}

export default function PermissionsStatus() {
    const { t } = useTranslation();
    const [statuses, setStatuses] = useState({});

    useEffect(() => {
        PERMISSIONS.forEach(async (p) => {
            if (!p.supported()) { setStatuses(s => ({ ...s, [p.key]: 'unsupported' })); return; }
            // Special cases without Permissions API
            if (p.key === 'notifications') {
                setStatuses(s => ({ ...s, [p.key]: Notification.permission || 'prompt' })); return;
            }
            if (p.key === 'bluetooth' || p.key === 'nfc') {
                setStatuses(s => ({ ...s, [p.key]: 'prompt' })); return;
            }
            try {
                const result = await p.api?.();
                if (result) {
                    setStatuses(s => ({ ...s, [p.key]: result.state }));
                    result.onchange = () => setStatuses(s => ({ ...s, [p.key]: result.state }));
                }
            } catch {
                setStatuses(s => ({ ...s, [p.key]: 'prompt' }));
            }
        });
    }, []);

    const handleRequest = async (p) => {
        setStatuses(s => ({ ...s, [p.key]: 'requesting' }));
        try {
            await p.request();
            // Re-query status after request
            if (p.key === 'notifications') {
                setStatuses(s => ({ ...s, [p.key]: Notification.permission }));
            } else if (p.api) {
                const result = await p.api();
                setStatuses(s => ({ ...s, [p.key]: result?.state || 'granted' }));
            } else {
                setStatuses(s => ({ ...s, [p.key]: 'granted' }));
            }
        } catch {
            setStatuses(s => ({ ...s, [p.key]: 'denied' }));
        }
    };

    return (
        <div className="glass-card" style={{ padding: 'var(--card-padding)', marginTop: 16 }}>
            <div style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: 12, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '1.1rem' }}>🛡️</span>
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{t('permissions.heading', 'Browser Permissions')}</h2>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 4 }}>{t('permissions.subheading', 'Required for hardware sensor features')}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {PERMISSIONS.map(p => {
                    const status = statuses[p.key] || 'prompt';
                    const meta = statusMeta(status, t);
                    const canRequest = status === 'prompt' || (status === 'unsupported' ? false : status !== 'granted' && status !== 'denied' && status !== 'requesting');
                    return (
                        <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: meta.bg, border: `1px solid ${meta.color}30` }}>
                            <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>{p.icon}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{t(`permissions.${p.key}`, p.label)}</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>{t(`permissions.${p.key}Desc`, p.desc)}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: '0.7rem', fontWeight: 700, color: meta.color, background: `${meta.color}20`, whiteSpace: 'nowrap' }}>
                                    {meta.label}
                                </span>
                                {canRequest && status !== 'unsupported' && (
                                    <button
                                        onClick={() => handleRequest(p)}
                                        style={{ padding: '4px 12px', borderRadius: 7, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#818cf8', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap' }}
                                    >
                                        {t('permissions.request', 'Request')}
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
