// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Email Notification Settings
 * ========================================
 * SMTP configuration panel for outbound email integration. Admins set up
 * email delivery credentials and test the connection before enabling
 * automated notifications platform-wide.
 *
 * KEY FEATURES:
 *   - SMTP host, port, username, password (masked) configuration fields
 *   - TLS/SSL toggle with certificate verification option
 *   - "From" address and display name customization
 *   - Send test email: validates SMTP settings with a real delivery attempt
 *   - Notification triggers configuration: which events generate emails
 *     (PM due reminders, WO assignments, critical alerts, escalations)
 *   - Email log: last 50 sent emails with delivery status and timestamp
 *   - Per-user opt-out: users can self-manage their notification preferences
 *
 * NOTIFICATION TRIGGERS:
 *   PM Due (24h/7d advance)  | WO Assigned  | WO Overdue  | Escalation Fired
 *   Critical Sensor Alert    | PO Approved  | PO Rejected | Safety Incident Filed
 *
 * API CALLS:
 *   GET  /api/settings/email        — Load current SMTP configuration
 *   POST /api/settings/email        — Save SMTP configuration
 *   POST /api/settings/email/test   — Send test email to current admin's address
 */
import React, { useState, useEffect } from 'react';
import { Mail, Send, Eye, EyeOff, CheckCircle, XCircle, Clock, Shield } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';
import { formatDate } from '../utils/formatDate';

export default function EmailSettingsPanel() {
    const { t } = useTranslation();
    const [settings, setSettings] = useState({});
    const [logs, setLogs] = useState([]);
    const [showPassword, setShowPassword] = useState(false);
    const [testEmail, setTestEmail] = useState('');
    const [testing, setTesting] = useState(false);
    const [showLogs, setShowLogs] = useState(false);
    const [relayVerified, setRelayVerified] = useState(null);

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/email/settings');
            const data = await res.json();
            setSettings(data);
        } catch (e) { console.warn('[EmailSettingsPanel] caught:', e); }
    };

    const fetchLogs = async () => {
        try {
            const res = await fetch('/api/email/log');
            setLogs(await res.json());
        } catch (e) { console.warn('[EmailSettingsPanel] caught:', e); }
    };

    useEffect(() => { fetchSettings(); }, []);

    const saveSettings = async () => {
        try {
            await fetch('/api/email/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            window.trierToast?.error('SMTP relay settings saved successfully');
        } catch (e) { window.trierToast?.error('Failed to save settings'); }
    };

    const sendTest = async () => {
        const to = testEmail;
        if (!to) { window.trierToast?.error('Enter a test recipient email address'); return; }
        setTesting(true);
        try {
            const res = await fetch('/api/email/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to })
            });
            const data = await res.json();
            if (data.success) {
                setRelayVerified(true);
                window.trierToast?.error('✅ SMTP relay verified! Test email sent successfully.');
            } else {
                setRelayVerified(false);
                window.trierToast?.info(``);
            }
        } catch (e) {
            setRelayVerified(false);
            window.trierToast?.error('Relay test failed');
        }
        setTesting(false);
    };

    const update = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));

    const inputStyle = {
        width: '100%', padding: '8px 10px', background: 'rgba(0,0,0,0.3)',
        border: '1px solid var(--glass-border)', borderRadius: '6px',
        color: '#fff', fontSize: '0.8rem'
    };

    return (
        <div className="panel-box" style={{ background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem' }}>
                    <Mail size={20} color="#3b82f6" /> Organization-Wide SMTP Relay
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {relayVerified === true && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '4px 10px', borderRadius: '12px', border: '1px solid rgba(16,185,129,0.2)' }}>
                            <CheckCircle size={12} /> Relay Verified
                        </span>
                    )}
                    {relayVerified === false && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '4px 10px', borderRadius: '12px', border: '1px solid rgba(239,68,68,0.2)' }}>
                            <XCircle size={12} /> Relay Failed
                        </span>
                    )}
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={settings.enabled === 'true'}
                            onChange={e => update('enabled', e.target.checked ? 'true' : 'false')}
                            title={t('emailSettingsPanel.enableOrDisableOutboundEmailTip')}
                        />
                        {settings.enabled === 'true' ? '🟢 Enabled' : '🔴 Disabled'}
                    </label>
                </div>
            </div>

            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 15px 0', lineHeight: 1.5 }}>
                Configure the outbound email relay for the entire organization. Individual users subscribe to their preferred alerts from their <strong>{t('emailSettingsPanel.settingsMyNotifications')}</strong> page.
            </p>

            {/* SMTP Relay Configuration */}
            <div style={{
                background: 'rgba(0,0,0,0.15)', padding: '15px', borderRadius: '10px',
                marginBottom: '12px', border: '1px solid var(--glass-border)'
            }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '10px', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Shield size={14} /> SMTP Relay Configuration
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                    <div>
                        <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>SMTP Host</label>
                        <input type="text" value={settings.smtp_host || ''} onChange={e => update('smtp_host', e.target.value)}
                            placeholder={t('emailSettingsPanel.smtpgmailcomPlaceholder')} style={inputStyle} title={t('emailSettingsPanel.smtpServerHostnameTip')} />
                    </div>
                    <div>
                        <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>Port</label>
                        <input type="number" value={settings.smtp_port || ''} onChange={e => update('smtp_port', e.target.value)}
                            placeholder="587" style={inputStyle} title={t('emailSettingsPanel.smtpServerPortEg587Tip')} />
                    </div>
                    <div>
                        <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>Username / Email</label>
                        <input type="text" value={settings.smtp_user || ''} onChange={e => update('smtp_user', e.target.value)}
                            placeholder="" style={inputStyle} title={t('emailSettingsPanel.smtpAuthenticationUsernameOrEmailTip')} />
                    </div>
                    <div>
                        <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>Password</label>
                        <div style={{ position: 'relative' }}>
                            <input type={showPassword ? 'text' : 'password'} value={settings.smtp_pass || ''} onChange={e => update('smtp_pass', e.target.value)}
                                style={{ ...inputStyle, paddingRight: '35px' }} title={t('emailSettingsPanel.smtpAuthenticationPasswordTip')} />
                            <button onClick={() => setShowPassword(!showPassword)} style={{
                                position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                                background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer'
                            }} title={showPassword ? 'Hide password' : 'Show password'}>
                                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                        </div>
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                        <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>From Name</label>
                        <input type="text" value={settings.from_name || ''} onChange={e => update('from_name', e.target.value)} style={inputStyle} title={t('emailSettingsPanel.displayNameForOutgoingEmailsTip')} />
                    </div>
                    <div>
                        <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>From Email Address</label>
                        <input type="email" value={settings.from_email || ''} onChange={e => update('from_email', e.target.value)}
                            placeholder={t('emailSettingsPanel.noreplycompanycomPlaceholder')} style={inputStyle} title={t('emailSettingsPanel.senderEmailAddressForOutgoingTip')} />
                    </div>
                </div>
                <div style={{ marginTop: '10px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={settings.smtp_secure === 'true'}
                            onChange={e => update('smtp_secure', e.target.checked ? 'true' : 'false')} title="Use SSL/TLS encryption for SMTP connection" />
                        Use SSL/TLS (port 465)
                    </label>
                </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
                <button onClick={saveSettings} className="btn-save" style={{ padding: '8px 18px', fontSize: '0.8rem',  }} title={t('emailSettingsPanel.saveTheSmtpRelayConfigurationTip')}>
                    Save Relay Settings
                </button>
                <input type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)}
                    placeholder={t('emailSettingsPanel.testRecipientEmailPlaceholder')} style={{ ...inputStyle, width: '200px' }} title={t('emailSettingsPanel.emailAddressToSendATip')} />
                <button onClick={sendTest} disabled={testing} style={{
                    padding: '8px 14px', borderRadius: '8px', cursor: 'pointer',
                    background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)',
                    color: '#3b82f6', fontSize: '0.8rem', fontWeight: 'bold',
                    display: 'flex', alignItems: 'center', gap: '4px'
                }} title={t('emailSettingsPanel.sendATestEmailToTip')}>
                    <Send size={12} /> {testing ? 'Testing...' : 'Test Relay'}
                </button>
                <button onClick={() => { setShowLogs(!showLogs); if (!showLogs) fetchLogs(); }} style={{
                    padding: '8px 14px', borderRadius: '8px', cursor: 'pointer',
                    background: 'none', border: '1px solid var(--glass-border)',
                    color: 'var(--text-muted)', fontSize: '0.8rem',
                    display: 'flex', alignItems: 'center', gap: '4px'
                }} title={t('emailSettingsPanel.toggleTheEmailDeliveryLogTip')}>
                    <Clock size={12} /> Log
                </button>
            </div>

            {/* Email Log */}
            {showLogs && (
                <div style={{ maxHeight: '200px', overflowY: 'auto', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                    {logs.length === 0 ? (
                        <div style={{ padding: '15px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            No emails have been sent yet. Use "Test Relay" to verify your SMTP configuration.
                        </div>
                    ) : (
                        logs.map(log => (
                            <div key={log.id} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '8px 12px', borderBottom: '1px solid var(--glass-border)',
                                fontSize: '0.75rem'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {log.status === 'sent' ? <CheckCircle size={12} color="#10b981" /> : <XCircle size={12} color="#ef4444" />}
                                    <span style={{ fontWeight: 'bold' }}>{log.subject}</span>
                                </div>
                                <div style={{ display: 'flex', gap: '10px', color: 'var(--text-muted)' }}>
                                    <span>{log.recipient}</span>
                                    <span>{formatDate(log.sent_at)}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
