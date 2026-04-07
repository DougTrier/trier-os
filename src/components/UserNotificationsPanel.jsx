// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — User Notification Preferences
 * ==========================================
 * Per-user notification settings panel. Each user independently toggles
 * which event types generate alerts for them and which delivery channels
 * those alerts are sent through.
 *
 * KEY FEATURES:
 *   - Event toggles: enable/disable notifications per event type
 *   - Delivery channels: In-App / Email / Slack per event type (independent)
 *   - Event types: Critical WO, WO Assigned, PM Due, Sensor Alarm,
 *     Part Transfer, Escalation, @Mention, Safety Incident, Compliance Due
 *   - Quick presets: "Alert me on critical only" / "Notify me on everything"
 *   - Quiet hours: schedule a time window where no notifications are sent
 *   - Save: persists preferences to user profile via API
 *
 * API CALLS:
 *   GET  /api/notifications/preferences        — Load current user's preferences
 *   POST /api/notifications/preferences        — Save updated preferences
 */
import React, { useState, useEffect } from 'react';
import { Bell, Mail, Save, CheckCircle, AlertTriangle, Clock, Wrench, ClipboardList, Activity, Package, Zap } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

const ALERT_OPTIONS = [
    { key: 'critical_wo',      label: 'Critical / Emergency Work Orders', desc: 'Get notified when a P1 critical or emergency work order is created or escalated.', icon: AlertTriangle, color: '#ef4444', defaultOn: true },
    { key: 'overdue_pm',       label: 'Overdue PM Schedules',             desc: 'Alert when a preventive maintenance task passes its due date.',                    icon: Clock,          color: '#f59e0b', defaultOn: true },
    { key: 'pending_approvals',label: 'Pending Approvals',                desc: 'Notified when a work request or purchase needs your approval.',                   icon: ClipboardList,  color: '#8b5cf6', defaultOn: true },
    { key: 'new_requests',     label: 'New Work Requests',                desc: 'Get notified when a new maintenance request is submitted.',                       icon: Wrench,         color: '#3b82f6', defaultOn: false },
    { key: 'wo_completed',     label: 'Work Order Completed',             desc: 'Notification when a work order you are assigned to is marked complete.',           icon: CheckCircle,    color: '#10b981', defaultOn: false },
    { key: 'sensor_alarms',    label: 'Sensor / IoT Alarms',              desc: 'Alerts from SCADA/PLC sensor thresholds (temperature, vibration, etc.).',          icon: Activity,       color: '#06b6d4', defaultOn: false },
    { key: 'inventory_low',    label: 'Low Inventory Alerts',             desc: 'Alert when a critical spare part drops below its reorder point.',                  icon: Package,        color: '#f97316', defaultOn: false },
    { key: 'risk_alerts',      label: 'Predictive Risk Alerts',           desc: 'AI-generated alerts for assets with rising failure probability.',                  icon: Zap,            color: '#a855f7', defaultOn: false },
];

const DIGEST_OPTIONS = [
    { value: 'immediate', label: '⚡ Immediate', desc: 'Real-time — as events happen' },
    { value: 'hourly',    label: '🕐 Hourly Digest', desc: 'Bundled summary every hour' },
    { value: 'daily',     label: '📅 Daily Digest', desc: 'One email per day at 7:00 AM' },
];

export default function UserNotificationsPanel() {
    const { t } = useTranslation();
    const username = localStorage.getItem('currentUser') || '';
    const [email, setEmail] = useState('');
    const [triggers, setTriggers] = useState({});
    const [enabled, setEnabled] = useState(true);
    const [digest, setDigest] = useState('immediate');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!username) return;
        fetchPreferences();
    }, [username]);

    const fetchPreferences = async () => {
        try {
            const res = await fetch(`/api/email/user-alerts/${encodeURIComponent(username)}`);
            const data = await res.json();
            setEmail(data.email || '');
            setEnabled(data.enabled !== false);
            // Set triggers with defaults for any missing keys
            const triggersData = data.triggers || {};
            const merged = {};
            ALERT_OPTIONS.forEach(opt => {
                merged[opt.key] = triggersData[opt.key] !== undefined ? triggersData[opt.key] : opt.defaultOn;
            });
            setTriggers(merged);
            setDigest(triggersData.digest_frequency || 'immediate');
        } catch (e) {
            // Use defaults
            const defaults = {};
            ALERT_OPTIONS.forEach(opt => { defaults[opt.key] = opt.defaultOn; });
            setTriggers(defaults);
        }
        setLoading(false);
    };

    const savePreferences = async () => {
        if (!email || !email.includes('@')) {
            window.trierToast?.warn('Please enter a valid email address.');
            return;
        }
        setSaving(true);
        try {
            const res = await fetch(`/api/email/user-alerts/${encodeURIComponent(username)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    triggers: { ...triggers, digest_frequency: digest },
                    enabled
                })
            });
            const data = await res.json();
            if (data.success) {
                setSaved(true);
                setTimeout(() => setSaved(false), 3000);
            } else {
                window.trierToast?.error('Failed to save preferences');
            }
        } catch (e) { window.trierToast?.error('Failed to save preferences'); }
        setSaving(false);
    };

    const toggleTrigger = (key) => {
        setTriggers(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const enabledCount = Object.values(triggers).filter(v => v === true).length;

    if (loading) {
        return (
            <div className="glass-card" style={{ padding: 'var(--card-padding)' }}>
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                    Loading notification preferences...
                </div>
            </div>
        );
    }

    return (
        <div className="glass-card" style={{ padding: 'var(--card-padding)', flexShrink: 0 }}>
            <div style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '15px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
                    <Bell size={24} color="#f59e0b" /> My Notifications
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {saved && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: '#10b981', animation: 'fadeIn 0.3s ease' }}>
                            <CheckCircle size={14} /> Saved!
                        </span>
                    )}
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={enabled}
                            onChange={e => setEnabled(e.target.checked)}
                            title={t('userNotificationsPanel.toggleAllEmailAlertsOnTip')}
                        />
                        {enabled ? '🟢 Alerts On' : '🔴 Alerts Off'}
                    </label>
                </div>
            </div>

            {/* Email Address */}
            <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px' }}>
                    <Mail size={16} color="#3b82f6" /> My Alert Email
                </label>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder={t('userNotificationsPanel.yournamecompanycomPlaceholder')}
                        style={{
                            flex: 1, padding: '10px 14px', background: 'rgba(0,0,0,0.3)',
                            border: '1px solid var(--glass-border)', borderRadius: '8px',
                            color: '#fff', fontSize: '0.9rem', maxWidth: '400px'
                        }}
                        title={t('userNotificationsPanel.emailAddressWhereAlertNotificationsTip')}
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        All alert emails will be sent here
                    </span>
                </div>
            </div>

            {/* Alert Type Selection */}
            <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        🔔 Alert Types
                    </h3>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {enabledCount} of {ALERT_OPTIONS.length} active
                    </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                    {ALERT_OPTIONS.map(opt => {
                        const Icon = opt.icon;
                        const isOn = triggers[opt.key] === true;
                        return (
                            <div
                                key={opt.key}
                                onClick={() => toggleTrigger(opt.key)}
                                style={{
                                    display: 'flex', alignItems: 'flex-start', gap: '12px',
                                    padding: '12px 14px', borderRadius: '10px', cursor: 'pointer',
                                    background: isOn ? `rgba(${opt.color === '#ef4444' ? '239,68,68' : opt.color === '#f59e0b' ? '245,158,11' : opt.color === '#8b5cf6' ? '139,92,246' : opt.color === '#3b82f6' ? '59,130,246' : opt.color === '#10b981' ? '16,185,129' : opt.color === '#06b6d4' ? '6,182,212' : opt.color === '#f97316' ? '249,115,22' : '168,85,247'},0.08)` : 'rgba(255,255,255,0.02)',
                                    border: `1px solid ${isOn ? opt.color + '40' : 'var(--glass-border)'}`,
                                    transition: 'all 0.2s ease',
                                    opacity: enabled ? 1 : 0.5
                                }}
                            >
                                <div style={{
                                    padding: '6px', borderRadius: '8px',
                                    background: isOn ? opt.color + '20' : 'rgba(255,255,255,0.05)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                }}>
                                    <Icon size={18} color={isOn ? opt.color : 'var(--text-muted)'} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: isOn ? '#fff' : 'var(--text-muted)' }}>
                                            {opt.label}
                                        </span>
                                        <div style={{
                                            width: '36px', height: '20px', borderRadius: '10px',
                                            background: isOn ? opt.color : 'rgba(255,255,255,0.1)',
                                            position: 'relative', transition: 'background 0.2s ease', flexShrink: 0
                                        }}>
                                            <div style={{
                                                width: '16px', height: '16px', borderRadius: '50%',
                                                background: '#fff', position: 'absolute', top: '2px',
                                                left: isOn ? '18px' : '2px', transition: 'left 0.2s ease',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                                            }} />
                                        </div>
                                    </div>
                                    <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                        {opt.desc}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Delivery Frequency */}
            <div style={{ marginBottom: '20px' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    📬 Delivery Frequency
                </h3>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {DIGEST_OPTIONS.map(opt => (
                        <button 
                            key={opt.value}
                            onClick={() => setDigest(opt.value)}
                            style={{
                                padding: '10px 18px', borderRadius: '10px', cursor: 'pointer',
                                background: digest === opt.value ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)',
                                border: `1px solid ${digest === opt.value ? 'rgba(99,102,241,0.4)' : 'var(--glass-border)'}`,
                                color: digest === opt.value ? '#818cf8' : 'var(--text-muted)',
                                fontSize: '0.85rem', fontWeight: digest === opt.value ? 600 : 400,
                                transition: 'all 0.2s ease',
                                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px'
                            }}
                            title={`Set delivery frequency to ${opt.value}`}
                        >
                            <span>{opt.label}</span>
                            <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>{opt.desc}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Save Button */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <button
                    onClick={savePreferences}
                    disabled={saving || !email}
                    className="btn-save"
                    style={{
                        padding: '10px 24px', fontSize: '0.9rem',
                        display: 'flex', alignItems: 'center', gap: '8px',
                    }}
                    title={t('userNotificationsPanel.saveYourNotificationPreferencesTip')}
                >
                    <Save size={16} /> {saving ? 'Saving...' : 'Save Alert Preferences'}
                </button>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {enabledCount} alert{enabledCount !== 1 ? 's' : ''} active • Delivery: {digest}
                </span>
            </div>
        </div>
    );
}
