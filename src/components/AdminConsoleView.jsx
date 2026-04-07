// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Admin Console View
 * ================================
 * Standalone administrative control panel for system and plant administration.
 * Separate from SettingsView so that admin functions can be accessed without
 * leaving the current plant context.
 *
 * SECTIONS:
 *   Database         — Plant DB import/export, snapshot restore, VACUUM operations
 *   Users & Access   — User accounts, role assignments, plant access control
 *   API Keys         — Generate and revoke API keys for third-party integrations
 *   Backup           — Backup operator privilege management, snapshot history
 *   Onboarding       — Plant onboarding wizard (new site registration)
 *   Approvals        — Pending approval queue for POs and high-cost WOs
 *   Enrollment       — New user enrollment requests awaiting admin approval
 *   API Docs         — Live API documentation and Swagger-style endpoint browser
 *   Email Settings   — SMTP configuration for notifications and scheduled reports
 *   LDAP / AD        — Directory integration for SSO and user provisioning
 *   SAP Integration  — SAP RFC/BAPI connection settings for WO/PM sync
 *
 * ACCESS: Requires admin or creator role. Individual sections may be further
 *   restricted to specific roles (e.g., backup section requires BackupOperator).
 */
import React, { useState, useEffect } from 'react';
import { Database as DatabaseIcon, Download, Globe, RefreshCw, Trash2, Zap, Wind, X, Lock, Users, Key, Copy, Save, Wifi, Check, ImageIcon, Settings, Bell, Plus } from 'lucide-react';
import ImportWizard from './ImportWizard';
import UserAccountsView from './UserAccountsView';
import SnapshotRollbackView from './SnapshotRollbackView';
import SAPIntegrationView from './SAPIntegrationView';
import BackupPrivilegesView from './BackupPrivilegesView';
import OnboardingWizard from './OnboardingWizard';
import ApprovalQueue from './ApprovalQueue';
import EnrollmentQueue from './EnrollmentQueue';
import APIDocsPanel from './APIDocsPanel';
import EmailSettingsPanel from './EmailSettingsPanel';
import LDAPConfigPanel from './LDAPConfigPanel';
import { useTranslation } from '../i18n/index.jsx';
import { useNavigate } from 'react-router-dom';

function PlantResetPanel({ currentPlant, exportPlant, userRole }) {
    const { t } = useTranslation();
    const [showReset, setShowReset] = useState(false);
    const [resetConfirmName, setResetConfirmName] = useState('');
    const [resetConfirmCode, setResetConfirmCode] = useState('');
    const [isResetting, setIsResetting] = useState(false);
    const [resetResult, setResetResult] = useState(null);

    const targetPlantId = exportPlant && exportPlant !== 'all_sites' ? exportPlant : currentPlant?.id;

    const executeReset = async () => {
        setIsResetting(true);
        setResetResult(null);
        try {
            const res = await fetch('/api/database/reset-plant', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                    'x-plant-id': targetPlantId || localStorage.getItem('selectedPlantId') || 'Demo_Plant_1',
                    'x-user-role': userRole,
                    'x-is-creator': localStorage.getItem('PF_USER_IS_CREATOR')
                },
                body: JSON.stringify({
                    confirmPlantName: resetConfirmName
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setResetResult({ success: true, message: `Plant "${targetPlantId}" reset successfully. Snapshot saved: ${data.snapshotFile}` });
                setResetConfirmName('');
                setResetConfirmCode('');
            } else {
                setResetResult({ success: false, message: data.error || 'Reset failed' });
            }
        } catch (err) {
            setResetResult({ success: false, message: 'Request failed: ' + err.message });
        }
        setIsResetting(false);
    };

    // Normalize smart quotes and curly apostrophes for comparison
    const normalize = (s) => (s || '').replace(/[\u2018\u2019\u201C\u201D]/g, "'").trim();
    const canReset = (normalize(resetConfirmName) === normalize(currentPlant?.label) || resetConfirmName === currentPlant?.id) && resetConfirmCode === t('settings.resetconfirmed');

    if (!showReset) {
        return (
            <div className="panel-box" style={{ background: 'rgba(239,68,68,0.03)', padding: '20px', borderRadius: '12px', border: '1px dashed rgba(239,68,68,0.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h3 style={{ fontSize: '1.1rem', margin: '0 0 5px 0', display: 'flex', alignItems: 'center', gap: '10px', color: '#ef4444' }}>
                            <Trash2 size={18} /> {t('settings.dangerZone')}
                        </h3>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                            Reset all data for a plant node. This clears all work orders, assets, parts, and vendors.
                        </p>
                    </div>
                    <button 
                        onClick={() => setShowReset(true)}
                        className="btn-primary"
                        style={{ padding: '8px 16px', fontSize: '0.8rem', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
                        title={t('settings.showTheDestructivePlantDataTip')}
                    >
                        {t('settings.showResetOptions')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="panel-box" style={{ background: 'rgba(239,68,68,0.05)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(239,68,68,0.4)' }}>
            <h3 style={{ fontSize: '1.1rem', margin: '0 0 15px 0', display: 'flex', alignItems: 'center', gap: '10px', color: '#ef4444' }}>
                <Trash2 size={18} /> {t('settings.plantDataResetDanger')}
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '15px', lineHeight: 1.5 }}>
                {t('settings.thisWill')} <strong>{t('settings.permanentlyDeleteAllData')}</strong> {t('settings.for')} <strong>{currentPlant?.label}</strong> and replace it with a fresh schema.
                A snapshot will be created automatically before the reset.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                        {t('settings.type')} <strong>"{currentPlant?.label}"</strong> to confirm
                    </label>
                    <input
                        type="text"
                        value={resetConfirmName}
                        onChange={e => setResetConfirmName(e.target.value)}
                        placeholder={currentPlant?.label}
                        style={{ width: '100%', padding: '8px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', color: '#fff' }}
                        title={t('settings.typeTheExactPlantNameTip')}
                    />
                </div>
                <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                        {t('settings.type')} <strong>"RESET-CONFIRMED"</strong> to proceed
                    </label>
                    <input
                        type="text"
                        value={resetConfirmCode}
                        onChange={e => setResetConfirmCode(e.target.value)}
                        placeholder={t('settings.resetconfirmed')}
                        style={{ width: '100%', padding: '8px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', color: '#fff' }}
                        title={t('settings.typeResetconfirmedToEnableTheTip')}
                    />
                </div>
            </div>

            {resetResult && (
                <div style={{ marginTop: '12px', padding: '10px', borderRadius: '6px', background: resetResult.success ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', fontSize: '0.85rem', color: resetResult.success ? '#10b981' : '#f87171' }}>
                    {resetResult.message}
                </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                <button onClick={() => { setShowReset(false); setResetConfirmName(''); setResetConfirmCode(''); }} className="btn-secondary" style={{ padding: '8px 16px', fontSize: '0.8rem' }} title={t('settings.cancelAndHideResetOptionsTip')}>
                    {t('settings.cancel')}
                </button>
                <button
                    onClick={executeReset}
                    disabled={!canReset || isResetting}
                    className="btn-primary"
                    style={{ padding: '8px 20px', fontSize: '0.85rem', background: canReset ? '#ef4444' : 'var(--glass-border)', display: 'flex', alignItems: 'center', gap: '6px' }}
                    title={t('settings.permanentlyDeleteAllDataForTip')}
                >
                    {isResetting ? <><RefreshCw size={14} className="spinning" /> {t('settings.resetting')}</> : <><Trash2 size={14} /> {t('settings.executeReset')}</>}
                </button>
            </div>
        </div>
    );
}

function NetworkConfigPanel() {
    const { t } = useTranslation();
    const [netInfo, setNetInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [overrideAddr, setOverrideAddr] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState(null);

    const fetchNetInfo = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/network-info');
            const data = await res.json();
            setNetInfo(data);
            if (data.source === 'admin_override') {
                setOverrideAddr(data.lanIp);
            }
        } catch (e) {
            setNetInfo(null);
        }
        setLoading(false);
    };

    useEffect(() => { fetchNetInfo(); }, []);

    const handleSaveOverride = async () => {
        if (!overrideAddr.trim()) return;
        setSaving(true);
        setSaveMsg(null);
        try {
            const res = await fetch('/api/network-info/override', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify({ address: overrideAddr.trim() })
            });
            const data = await res.json();
            if (data.success) {
                setSaveMsg({ ok: true, text: `Saved! Server URL: ${data.url}` });
                fetchNetInfo();
            } else {
                setSaveMsg({ ok: false, text: data.error || 'Failed to save' });
            }
        } catch (e) {
            setSaveMsg({ ok: false, text: 'Request failed' });
        }
        setSaving(false);
    };

    const handleClearOverride = async () => {
        setSaving(true);
        setSaveMsg(null);
        try {
            const res = await fetch('/api/network-info/override', {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
            });
            const data = await res.json();
            if (data.success) {
                setOverrideAddr('');
                setSaveMsg({ ok: true, text: 'Override cleared. Using auto-detection.' });
                fetchNetInfo();
            }
        } catch (e) {
            setSaveMsg({ ok: false, text: 'Failed to clear override' });
        }
        setSaving(false);
    };

    return (
        <div className="panel-box" style={{ background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3 style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Wifi size={20} color="#3b82f6" /> Network Configuration
                </h3>
                <button onClick={fetchNetInfo} disabled={loading} className="btn-primary"
                    style={{ padding: '6px 14px', fontSize: '0.75rem', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)', display: 'flex', alignItems: 'center', gap: '6px' }}
                    title={t('settings.refreshNetworkInformationTip')}>
                    <RefreshCw size={12} className={loading ? 'spinning' : ''} /> Refresh
                </button>
            </div>

            {loading ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    <RefreshCw size={16} className="spinning" style={{ marginRight: '8px' }} /> Detecting network...
                </div>
            ) : netInfo ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* Status Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        {/* Current Server Address */}
                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '14px', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Server Address</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e2e8f0', fontFamily: 'monospace' }}>{netInfo.lanIp}</div>
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '4px' }}>
                                {netInfo.source === 'admin_override' && <span style={{ color: '#f59e0b' }}>✏️ Manual override</span>}
                                {netInfo.source === 'auto_detected' && <span style={{ color: '#10b981' }}>🔍 Auto-detected</span>}
                                {netInfo.source === 'fallback' && <span style={{ color: '#ef4444' }}>⚠️ Fallback (no network?)</span>}
                            </div>
                        </div>

                        {/* Internet Connectivity */}
                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '14px', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Internet Status</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                    width: '14px', height: '14px', borderRadius: '50%',
                                    background: netInfo.internetConnected ? '#10b981' : '#ef4444',
                                    boxShadow: netInfo.internetConnected ? '0 0 10px rgba(16,185,129,0.5)' : '0 0 10px rgba(239,68,68,0.5)'
                                }} />
                                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: netInfo.internetConnected ? '#10b981' : '#ef4444' }}>
                                    {netInfo.internetConnected ? 'Connected' : 'No Internet'}
                                </span>
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '4px' }}>
                                DNS resolve: google.com
                            </div>
                        </div>
                    </div>

                    {/* Full URL */}
                    <div style={{ background: 'rgba(59,130,246,0.06)', padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Other devices should connect to:</div>
                            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#60a5fa', fontFamily: 'monospace' }}>{netInfo.url}</div>
                        </div>
                        <button onClick={() => { navigator.clipboard.writeText(netInfo.url); }}
                            className="btn-primary" title={t('settings.copyUrlToClipboardTip')}
                            style={{ padding: '6px 12px', fontSize: '0.75rem', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Copy size={12} /> Copy
                        </button>
                    </div>

                    {/* Network Interfaces */}
                    {netInfo.allInterfaces && netInfo.allInterfaces.length > 0 && (
                        <div style={{ background: 'rgba(0,0,0,0.15)', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>All Network Interfaces</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {netInfo.allInterfaces.map((iface, i) => (
                                    <div key={i} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '6px 10px', borderRadius: '6px',
                                        background: iface.address === netInfo.lanIp ? 'rgba(59,130,246,0.1)' : 'transparent',
                                        border: iface.address === netInfo.lanIp ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent'
                                    }}>
                                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{iface.name}</span>
                                        <span style={{
                                            fontSize: '0.85rem', fontFamily: 'monospace', fontWeight: 600,
                                            color: iface.address === netInfo.lanIp ? '#60a5fa' : (iface.address.startsWith('169.254.') ? '#ef4444' : '#e2e8f0')
                                        }}>
                                            {iface.address}
                                            {iface.address === netInfo.lanIp && <Check size={12} style={{ marginLeft: '6px', color: '#10b981' }} />}
                                            {iface.address.startsWith('169.254.') && <span style={{ fontSize: '0.65rem', marginLeft: '6px', color: '#ef4444' }}>(APIPA)</span>}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Manual Override */}
                    <div style={{ background: 'rgba(245,158,11,0.04)', padding: '14px', borderRadius: '10px', border: '1px solid rgba(245,158,11,0.2)' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f59e0b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Settings size={14} /> Manual Address Override
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 10px 0', lineHeight: 1.5 }}>
                            If auto-detection picks the wrong IP, set your server's correct IP or hostname here. 
                            This overrides auto-detection for onboarding documents and QR codes.
                        </p>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="text"
                                value={overrideAddr}
                                onChange={e => setOverrideAddr(e.target.value)}
                                placeholder={t('settings.eg1921681100OrMyserverlocalPlaceholder')}
                                style={{
                                    flex: 1, padding: '8px 12px', fontSize: '0.85rem',
                                    background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(245,158,11,0.3)',
                                    borderRadius: '6px', color: '#fff', fontFamily: 'monospace'
                                }}
                                title={t('settings.enterTheIpAddressOrTip')}
                            />
                            <button onClick={handleSaveOverride} disabled={saving || !overrideAddr.trim()}
                                className="btn-primary" title={t('settings.saveTheManualAddressOverrideTip')}
                                style={{ padding: '8px 16px', fontSize: '0.8rem', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, opacity: (!overrideAddr.trim() || saving) ? 0.5 : 1 }}>
                                <Save size={14} /> Save
                            </button>
                            {netInfo.source === 'admin_override' && (
                                <button onClick={handleClearOverride} disabled={saving}
                                    className="btn-primary" title={t('settings.clearOverrideAndUseAutodetectionTip')}
                                    style={{ padding: '8px 16px', fontSize: '0.8rem', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <X size={14} /> Clear
                                </button>
                            )}
                        </div>
                        {saveMsg && (
                            <div style={{ marginTop: '8px', padding: '8px 12px', borderRadius: '6px', fontSize: '0.8rem', background: saveMsg.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: saveMsg.ok ? '#10b981' : '#ef4444' }}>
                                {saveMsg.ok ? <Check size={14} style={{ marginRight: '6px' }} /> : null}{saveMsg.text}
                            </div>
                        )}
                    </div>

                    {/* Hostname */}
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '20px' }}>
                        <span>{t('settings.hostname')} <strong style={{ color: '#e2e8f0' }}>{netInfo.hostname}</strong></span>
                        <span>{t('settings.port')} <strong style={{ color: '#e2e8f0' }}>{netInfo.port}</strong></span>
                    </div>
                </div>
            ) : (
                <div style={{ padding: '15px', textAlign: 'center', color: '#ef4444', fontSize: '0.85rem' }}>
                    Failed to fetch network information
                </div>
            )}
        </div>
    );
}

function WebhookIntegrationPanel() {
    const { t } = useTranslation();
    const [webhooks, setWebhooks] = useState([]);
    const [showAdd, setShowAdd] = useState(false);
    const [newHook, setNewHook] = useState({ platform: 'slack', webhook_url: '', label: '' });
    const [testResults, setTestResults] = useState({});
    const [loading, setLoading] = useState(true);

    const fetchWebhooks = async () => {
        try {
            const res = await fetch('/api/integrations/webhooks', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
            });
            const data = await res.json();
            setWebhooks(Array.isArray(data) ? data : []);
        } catch (e) { console.warn('[SettingsView] caught:', e); }
        setLoading(false);
    };

    useEffect(() => { fetchWebhooks(); }, []);

    const createWebhook = async () => {
        if (!newHook.webhook_url) return;
        try {
            await fetch('/api/integrations/webhooks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('authToken')}` },
                body: JSON.stringify(newHook)
            });
            setNewHook({ platform: 'slack', webhook_url: '', label: '' });
            setShowAdd(false);
            fetchWebhooks();
        } catch (e) { console.warn('[SettingsView] caught:', e); }
    };

    const toggleEnabled = async (id, currentEnabled) => {
        try {
            await fetch(`/api/integrations/webhooks/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('authToken')}` },
                body: JSON.stringify({ enabled: !currentEnabled })
            });
            fetchWebhooks();
        } catch (e) { console.warn('[SettingsView] caught:', e); }
    };

    const toggleNotify = async (id, field, currentVal) => {
        try {
            await fetch(`/api/integrations/webhooks/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('authToken')}` },
                body: JSON.stringify({ [field]: !currentVal })
            });
            fetchWebhooks();
        } catch (e) { console.warn('[SettingsView] caught:', e); }
    };

    const deleteWebhook = async (id) => {
        try {
            await fetch(`/api/integrations/webhooks/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
            });
            fetchWebhooks();
        } catch (e) { console.warn('[SettingsView] caught:', e); }
    };

    const testWebhook = async (id) => {
        setTestResults(prev => ({ ...prev, [id]: 'sending' }));
        try {
            const res = await fetch(`/api/integrations/webhooks/${id}/test`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
            });
            const data = await res.json();
            setTestResults(prev => ({ ...prev, [id]: data.success ? 'success' : 'failed' }));
            setTimeout(() => setTestResults(prev => ({ ...prev, [id]: null })), 3000);
        } catch (e) {
            setTestResults(prev => ({ ...prev, [id]: 'failed' }));
        }
    };

    const platformColors = { slack: '#4A154B', teams: '#6264A7', discord: '#5865F2', custom: '#6366f1' };
    const platformLabels = { slack: '🟣 Slack', teams: '🟦 Teams', discord: '🟪 Discord', custom: '🔗 Custom' };

    const notifyFields = [
        { key: 'notify_critical_wo', label: '🚨 Critical WOs', color: '#ef4444' },
        { key: 'notify_pm_due', label: '🔧 PM Due', color: '#f59e0b' },
        { key: 'notify_completion', label: '✅ Completions', color: '#10b981' },
        { key: 'notify_sensor', label: '🌡️ Sensors', color: '#6366f1' }
    ];

    return (
        <div className="panel-box" style={{ background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3 style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Bell size={20} color="#fbbf24" /> {t('settings.webhookIntegrations')}
                </h3>
                <button 
                    onClick={() => setShowAdd(!showAdd)}
                    className="btn-primary"
                    title={showAdd ? 'Cancel adding a new webhook' : 'Add a new webhook integration'}
                    style={{ padding: '6px 14px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                    {showAdd ? <><X size={14} /> {t('settings.cancel')}</> : <><Plus size={14} /> {t('settings.addWebhook')}</>}
                </button>
            </div>

            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '15px' }}>
                Receive real-time alerts in Slack, Teams, or Discord when critical events occur.
            </p>

            {/* Add New Webhook Form */}
            {showAdd && (
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '10px', marginBottom: '15px', border: '1px solid var(--glass-border)' }}>
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                        <select
                            value={newHook.platform}
                            onChange={e => setNewHook({ ...newHook, platform: e.target.value })}
                            style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: '#fff', padding: '8px 12px', borderRadius: '6px', fontSize: '0.85rem' }}
                            title={t('settings.selectTheMessagingPlatformForTip')}
                        >
                            <option value="slack">{t('settings.slack')}</option>
                            <option value="teams">{t('settings.microsoftTeams')}</option>
                            <option value="discord">{t('settings.discord')}</option>
                            <option value="custom">{t('settings.customJson')}</option>
                        </select>
                        <input
                            type="text"
                            placeholder={t('settings.labelEgManagersChannel')}
                            value={newHook.label}
                            onChange={e => setNewHook({ ...newHook, label: e.target.value })}
                            style={{ flex: 1, padding: '8px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }}
                            title={t('settings.aDescriptiveLabelForThisTip')}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <input
                            type="url"
                            placeholder={t('settings.httpshooksslackcomservicesOrTeamsWebhook')}
                            value={newHook.webhook_url}
                            onChange={e => setNewHook({ ...newHook, webhook_url: e.target.value })}
                            style={{ flex: 1, padding: '8px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }}
                            title={t('settings.theFullWebhookUrlFromTip')}
                        />
                        <button
                            onClick={createWebhook}
                            className="btn-primary"
                            disabled={!newHook.webhook_url}
                            style={{ padding: '8px 20px', background: newHook.webhook_url ? '#10b981' : 'var(--glass-border)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
                            title={t('settings.saveThisWebhookConfigurationTip')}
                        >
                            <Send size={14} /> {t('settings.save')}
                        </button>
                    </div>
                </div>
            )}

            {/* Webhook List */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                    <RefreshCw size={18} className="spinning" /> {t('settings.loading')}
                </div>
            ) : webhooks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    No webhooks configured. Click "Add Webhook" to connect Slack, Teams, or Discord.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {webhooks.map(wh => (
                        <div key={wh.id} style={{
                            background: 'rgba(0,0,0,0.15)', padding: '12px 15px', borderRadius: '10px',
                            border: `1px solid ${wh.enabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.05)'}`,
                            opacity: wh.enabled ? 1 : 0.6
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{
                                        background: platformColors[wh.platform] || '#6366f1',
                                        padding: '3px 10px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 'bold', color: '#fff'
                                    }}>
                                        {platformLabels[wh.platform] || wh.platform}
                                    </span>
                                    <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{wh.label || 'Unnamed'}</span>
                                </div>
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                    <button 
                                        onClick={() => testWebhook(wh.id)}
                                        className="btn-primary"
                                        disabled={testResults[wh.id] === 'sending'}
                                        title={t('settings.sendATestMessageToTip')}
                                        style={{
                                            padding: '4px 10px', fontSize: '0.7rem',
                                            background: testResults[wh.id] === 'success' ? 'rgba(16, 185, 129, 0.2)'
                                                : testResults[wh.id] === 'failed' ? 'rgba(239, 68, 68, 0.2)'
                                                : 'rgba(255,255,255,0.05)',
                                            color: testResults[wh.id] === 'success' ? '#10b981'
                                                : testResults[wh.id] === 'failed' ? '#ef4444' : '#fff',
                                            display: 'flex', alignItems: 'center', gap: '4px'
                                        }}
                                    >
                                        <Send size={11} />
                                        {testResults[wh.id] === 'sending' ? 'Testing...' : testResults[wh.id] === 'success' ? '✓ Sent!' : testResults[wh.id] === 'failed' ? '✗ Failed' : 'Test'}
                                    </button>
                                    <button 
                                        onClick={() => toggleEnabled(wh.id, wh.enabled)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: wh.enabled ? '#10b981' : 'var(--text-muted)', padding: '4px' }}
                                        title={wh.enabled ? 'Click to disable' : 'Click to enable'}
                                    >
                                        {wh.enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                                    </button>
                                    <button 
                                        onClick={() => deleteWebhook(wh.id)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}
                                        title={t('settings.deleteWebhook')}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '6px', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {wh.webhook_url}
                            </div>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                {notifyFields.map(nf => (
                                    <button 
                                        key={nf.key}
                                        onClick={() => toggleNotify(wh.id, nf.key, wh[nf.key])}
                                        title={wh[nf.key] ? `Disable ${nf.label} notifications for this webhook` : `Enable ${nf.label} notifications for this webhook`}
                                        style={{
                                            padding: '2px 8px', borderRadius: '10px', fontSize: '0.65rem', cursor: 'pointer',
                                            background: wh[nf.key] ? `${nf.color}15` : 'rgba(255,255,255,0.03)',
                                            color: wh[nf.key] ? nf.color : 'var(--text-muted)',
                                            border: `1px solid ${wh[nf.key] ? nf.color + '40' : 'var(--glass-border)'}`,
                                            fontWeight: wh[nf.key] ? 'bold' : 'normal'
                                        }}
                                    >
                                        {nf.label}
                                    </button>
                                ))}
                            </div>
                            {wh.last_triggered && (
                                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '5px' }}>
                                    Last fired: {new Date(wh.last_triggered).toLocaleString()} — {wh.last_status === 'ok' ? '✅' : '⚠️'} {wh.last_status}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}


function AIConfigPanel() {
    const { t } = useTranslation();
    const [config, setConfig] = useState({ provider: 'openai', api_key: '', model: 'gpt-4o-mini' });
    const [newKey, setNewKey] = useState('');
    const [saving, setSaving] = useState(false);
    const [testResult, setTestResult] = useState(null);
    const [loading, setLoading] = useState(true);

    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('authToken')}` };

    useEffect(() => {
        fetch('/api/procedures/ai-config', { headers })
            .then(r => r.json()).then(d => { setConfig(d); setLoading(false); })
            .catch(() => setLoading(false));
    }, []);

    const models = {
        openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
        anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
        ollama: ['llama3.1', 'llama3.1:70b', 'codellama', 'mixtral']
    };

    const handleSave = async () => {
        if (!newKey && !config.api_key) return;
        setSaving(true);
        try {
            await fetch('/api/procedures/ai-config', {
                method: 'PUT', headers,
                body: JSON.stringify({ provider: config.provider, apiKey: newKey || config.api_key, model: config.model })
            });
            setNewKey('');
            // Refresh config
            const res = await fetch('/api/procedures/ai-config', { headers });
            setConfig(await res.json());
        } catch (e) { console.warn('[SettingsView] caught:', e); }
        setSaving(false);
    };

    const handleTest = async () => {
        setTestResult('testing');
        try {
            const res = await fetch('/api/procedures/ai-test', { method: 'POST', headers });
            const data = await res.json();
            setTestResult(data.success ? 'ok' : 'fail');
            setTimeout(() => setTestResult(null), 4000);
        } catch { setTestResult('fail'); }
    };

    const providerColors = { openai: '#10b981', anthropic: '#f59e0b', ollama: '#6366f1' };

    return (
        <div className="panel-box" style={{ background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
            <h3 style={{ fontSize: '1.2rem', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.2rem' }}>🤖</span> {t('settings.aiServiceConfiguration')}
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '15px' }}>
                Configure your AI provider for SOP generation. API keys are stored locally, never transmitted externally except to the provider.
            </p>

            {loading ? <div style={{ color: 'var(--text-muted)', padding: '20px', textAlign: 'center' }}>{t('settings.loading')}</div> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>{t('settings.provider')}</label>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            {['openai', 'anthropic', 'ollama'].map(p => (
                                <button key={p} onClick={() => setConfig({ ...config, provider: p, model: models[p][0] })}
                                    title={`Switch to ${p === 'openai' ? 'OpenAI' : p === 'anthropic' ? 'Anthropic Claude' : 'Ollama (local)'} as the AI provider`}
                                    style={{
                                        flex: 1, padding: '8px 12px', borderRadius: '8px', cursor: 'pointer',
                                        background: config.provider === p ? `${providerColors[p]}15` : 'rgba(0,0,0,0.2)',
                                        border: `1px solid ${config.provider === p ? providerColors[p] + '55' : 'var(--glass-border)'}`,
                                        color: config.provider === p ? providerColors[p] : 'var(--text-muted)',
                                        fontWeight: config.provider === p ? 700 : 400, fontSize: '0.8rem'
                                    }}
                                >
                                    {p === 'openai' ? '🟢 OpenAI' : p === 'anthropic' ? '🟡 Claude' : '🟣 Ollama'}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                            {config.provider === 'ollama' ? 'Model (local)' : 'API Key'}
                        </label>
                        {config.provider !== 'ollama' ? (
                            <input type="password" placeholder={config.api_key || 'Enter API key...'} value={newKey}
                                onChange={e => setNewKey(e.target.value)}
                                style={{ width: '100%', padding: '8px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '6px', color: '#fff' }}
                                title={t('settings.enterYourAiProviderApiTip')}
                            />
                        ) : (
                            <div style={{ fontSize: '0.8rem', color: '#6366f1', padding: '8px', background: 'rgba(99,102,241,0.05)', borderRadius: '6px' }}>
                                Ollama uses a local model — no API key required. Ensure Ollama is running on port 11434.
                            </div>
                        )}
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>{t('settings.model')}</label>
                        <select value={config.model} onChange={e => setConfig({ ...config, model: e.target.value })} title={t('settings.selectTheAiModelToTip')}
                            style={{ width: '100%', padding: '8px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '6px', color: '#fff' }}>
                            {(models[config.provider] || []).map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={handleSave} disabled={saving} className="btn-primary"
                            style={{ flex: 1, padding: '8px', fontSize: '0.8rem', background: saving ? 'var(--glass-border)' : '#10b981' }}
                            title={t('settings.saveTheAiProviderAndTip')}>
                            {saving ? 'Saving...' : 'Save Configuration'}
                        </button>
                        <button onClick={handleTest} className="btn-primary"
                            title={t('settings.testTheAiProviderConnectionTip')}
                            style={{
                                padding: '8px 14px', fontSize: '0.8rem',
                                background: testResult === 'ok' ? 'rgba(16,185,129,0.2)' : testResult === 'fail' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)',
                                color: testResult === 'ok' ? '#10b981' : testResult === 'fail' ? '#ef4444' : '#fff',
                                border: `1px solid ${testResult === 'ok' ? '#10b981' : testResult === 'fail' ? '#ef4444' : 'var(--glass-border)'}`
                            }}>
                            {testResult === 'testing' ? '⏳' : testResult === 'ok' ? '✅ Connected' : testResult === 'fail' ? '❌ Failed' : '🔌 Test'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function DataExportPanel() {
    const { t } = useTranslation();
    const [downloading, setDownloading] = useState(null);

    const exportTypes = [
        { id: 'work-orders', label: 'Work Orders', icon: '📋', color: '#6366f1' },
        { id: 'assets', label: 'Assets', icon: '⚙️', color: '#f59e0b' },
        { id: 'pm-compliance', label: 'PM Compliance', icon: '🔧', color: '#10b981' },
        { id: 'parts-inventory', label: 'Parts Inventory', icon: '📦', color: '#8b5cf6' },
        { id: 'technician-performance', label: 'Technician Metrics', icon: '👷', color: '#ef4444' },
        { id: 'reminder-insights', label: 'Reminder Insights', icon: '💡', color: '#fbbf24' }
    ];

    const downloadCsv = async (type) => {
        setDownloading(type);
        try {
            const res = await fetch(`/api/bi/${type}?format=csv`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
            });
            if (!res.ok) throw new Error('Download failed');
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `prairie_${type.replace(/-/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (e) {
            window.trierToast?.error('Download failed: ' + e.message);
        }
        setDownloading(null);
    };

    const downloadJson = async (type) => {
        setDownloading(type + '-json');
        try {
            const res = await fetch(`/api/bi/${type}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
            });
            const data = await res.json();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `prairie_${type.replace(/-/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (e) {
            window.trierToast?.error('Download failed: ' + e.message);
        }
        setDownloading(null);
    };

    return (
        <div className="panel-box" style={{ background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
            <h3 style={{ fontSize: '1.2rem', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Download size={20} color="#6366f1" /> {t('settings.dataExportPowerBi')}
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '15px' }}>
                {t('settings.exportPlantDataAs')}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '15px' }}>
                {exportTypes.map(et => (
                    <div key={et.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        background: 'rgba(0,0,0,0.15)', padding: '8px 12px', borderRadius: '8px',
                        border: '1px solid var(--glass-border)'
                    }}>
                        <span style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {et.icon} {et.label}
                        </span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            <button 
                                onClick={() => downloadCsv(et.id)}
                                disabled={downloading === et.id}
                                title={`Download ${et.label} data as CSV`}
                                style={{
                                    background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)',
                                    color: '#10b981', padding: '2px 8px', borderRadius: '4px', fontSize: '0.65rem',
                                    cursor: 'pointer', fontWeight: 'bold'
                                }}
                            >
                                {downloading === et.id ? '...' : 'CSV'}
                            </button>
                            <button 
                                onClick={() => downloadJson(et.id)}
                                disabled={downloading === et.id + '-json'}
                                title={`Download ${et.label} data as JSON`}
                                style={{
                                    background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.3)',
                                    color: '#6366f1', padding: '2px 8px', borderRadius: '4px', fontSize: '0.65rem',
                                    cursor: 'pointer', fontWeight: 'bold'
                                }}
                            >
                                {downloading === et.id + '-json' ? '...' : 'JSON'}
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ background: 'rgba(99,102,241,0.05)', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(99,102,241,0.15)' }}>
                <div style={{ fontSize: '0.75rem', color: '#818cf8', fontWeight: 'bold', marginBottom: '4px' }}>
                    💡 Power BI Connection
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    {t('settings.use')} <strong>{t('settings.webDataSource')}</strong> {t('settings.inPowerBiDesktopEnter')} <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 4px', borderRadius: '3px' }}>
                    {window.location.origin}/api/bi/work-orders</code>
                    <br />{t('settings.setRefreshScheduleFor')}
                </div>
            </div>
        </div>
    );
}

function HAConfigPanel() {
    const { t } = useTranslation();
    const [haRole, setHaRole] = useState('primary');
    const [pairingKey, setPairingKey] = useState('');
    const [importKey, setImportKey] = useState('');
    const [partnerAddress, setPartnerAddress] = useState('');
    const [secondaryHealth, setSecondaryHealth] = useState(null);
    const [syncStatus, setSyncStatus] = useState(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isChecking, setIsChecking] = useState(false);
    const [keyCopied, setKeyCopied] = useState(false);
    const [keyImported, setKeyImported] = useState(false);
    const [loading, setLoading] = useState(true);
    const [showFailover, setShowFailover] = useState(false);
    const [failoverPassword, setFailoverPassword] = useState('');
    const [isPromoting, setIsPromoting] = useState(false);
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('authToken')}` };

    // Load current HA config on mount
    useEffect(() => {
        fetch('/api/ha/config', { headers })
            .then(r => r.json())
            .then(data => {
                if (data.role) setHaRole(data.role);
                if (data.partnerAddress) setPartnerAddress(data.partnerAddress);
                if (data.hasPairingKey) setPairingKey('••••••••••••••••');
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    // Fetch sync status periodically when configured
    useEffect(() => {
        const fetchStatus = () => {
            fetch('/api/ha/status', { headers })
                .then(r => { if (r.ok) return r.json(); throw new Error('Failed'); })
                .then(data => setSyncStatus(data))
                .catch(e => console.warn('[SettingsView] fetch error:', e));
        };
        fetchStatus();
        const interval = setInterval(fetchStatus, 30000);
        return () => clearInterval(interval);
    }, []);

    const generateKey = async () => {
        setIsGenerating(true);
        try {
            const res = await fetch('/api/ha/config/generate-key', { method: 'POST', headers });
            const data = await res.json();
            if (data.key) {
                setPairingKey(data.key);
                setKeyCopied(false);
            }
        } catch (e) { console.error('Key generation failed:', e); }
        setIsGenerating(false);
    };

    const copyKey = () => {
        if (pairingKey && pairingKey !== '••••••••••••••••') {
            navigator.clipboard.writeText(pairingKey);
            setKeyCopied(true);
            setTimeout(() => setKeyCopied(false), 3000);
        }
    };

    const importPairingKey = async () => {
        if (!importKey.trim()) return;
        setIsSaving(true);
        try {
            const res = await fetch('/api/ha/config/import-key', {
                method: 'POST', headers,
                body: JSON.stringify({ key: importKey.trim() })
            });
            const data = await res.json();
            if (data.success) {
                setKeyImported(true);
                setPairingKey('••••••••••••••••');
                setImportKey('');
                setTimeout(() => setKeyImported(false), 3000);
            }
        } catch (e) { console.error('Key import failed:', e); }
        setIsSaving(false);
    };

    const saveConfig = async () => {
        setIsSaving(true);
        try {
            await fetch('/api/ha/config', {
                method: 'PUT', headers,
                body: JSON.stringify({ role: haRole, partnerAddress })
            });
        } catch (e) { console.error('Config save failed:', e); }
        setIsSaving(false);
    };

    const checkPartnerHealth = async () => {
        setIsChecking(true);
        try {
            const res = await fetch('/api/ha/secondary-health', { headers });
            const data = await res.json();
            setSecondaryHealth(data);
        } catch (e) { setSecondaryHealth({ online: false, error: 'Request failed' }); }
        setIsChecking(false);
    };

    const forceSyncNow = async () => {
        setIsSyncing(true);
        try {
            const res = await fetch('/api/ha/sync-now', { method: 'POST', headers });
            const data = await res.json();
            window.trierToast?.info(`Sync complete: ${data.pushed || 0} changes pushed, ${data.errors || 0} errors`);
        } catch (e) { window.trierToast?.error('Sync failed — check server logs'); }
        setIsSyncing(false);
    };

    const isPrimary = haRole === 'primary';
    const roleColor = isPrimary ? '#10b981' : '#f59e0b';
    const roleIcon = isPrimary ? '🟢' : '🟡';
    const roleLabel = isPrimary ? 'Primary (Master)' : 'Secondary (Replica)';

    // Calculate aggregate sync stats
    const totalPending = syncStatus?.totalPending || syncStatus?.plants?.reduce((sum, p) => sum + (p.pending || 0), 0) || 0;
    const totalEntries = syncStatus?.plants?.reduce((sum, p) => sum + (p.totalLedgerEntries || 0), 0) || 0;
    const syncedPlants = syncStatus?.plants?.filter(p => p.status === 'synced').length || 0;
    const totalPlants = syncStatus?.plants?.length || 0;
    const replicationLag = syncStatus?.replicationLagSeconds || 0;
    const lastSyncTime = syncStatus?.lastSyncTime;
    const totalDbSizeBytes = syncStatus?.totalDbSizeBytes || 0;

    // Format helpers
    const lastSyncDisplay = lastSyncTime
        ? new Date(lastSyncTime + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : 'Never';
    const totalDbSize = totalDbSizeBytes > 1073741824
        ? `${(totalDbSizeBytes / 1073741824).toFixed(1)} GB`
        : totalDbSizeBytes > 1048576
            ? `${(totalDbSizeBytes / 1048576).toFixed(0)} MB`
            : `${(totalDbSizeBytes / 1024).toFixed(0)} KB`;

    if (loading) return (
        <div className="panel-box" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.04), rgba(16,185,129,0.04))', padding: '20px', borderRadius: '12px', border: '1px solid rgba(59,130,246,0.2)', textAlign: 'center' }}>
            <RefreshCw size={20} className="spinning" style={{ color: '#60a5fa' }} /> Loading HA config...
        </div>
    );

    return (
        <div className="panel-box" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.04), rgba(16,185,129,0.04))', padding: '20px', borderRadius: '12px', border: '1px solid rgba(59,130,246,0.2)' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Zap size={20} color="#3b82f6" /> High Availability Configuration
            </h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '18px', fontSize: '0.82rem', lineHeight: 1.6 }}>
                Configure server-to-server replication. The Primary (Master) accepts all writes and pushes changes to the Secondary (Replica) for failover protection.
            </p>

            {/* ── Role Selector ── */}
            <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>SERVER ROLE</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {[
                        { value: 'primary', label: '🟢 Primary (Master)', desc: 'Accepts writes, pushes to replica', color: '#10b981' },
                        { value: 'secondary', label: '🟡 Secondary (Replica)', desc: 'Read-only, receives from master', color: '#f59e0b' }
                    ].map(opt => (
                        <button key={opt.value} onClick={() => setHaRole(opt.value)} title={`Set this server as ${opt.label}`} style={{
                            flex: 1, padding: '14px 16px', borderRadius: '12px', cursor: 'pointer',
                            background: haRole === opt.value ? `${opt.color}12` : 'rgba(0,0,0,0.2)',
                            border: `2px solid ${haRole === opt.value ? opt.color : 'rgba(255,255,255,0.06)'}`,
                            textAlign: 'left', transition: 'all 0.3s ease'
                        }}>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: haRole === opt.value ? opt.color : '#94a3b8', marginBottom: '4px' }}>{opt.label}</div>
                            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{opt.desc}</div>
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Server Status Card ── */}
            <div style={{ background: `${roleColor}08`, padding: '16px', borderRadius: '12px', border: `1px solid ${roleColor}30`, marginBottom: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: roleColor, boxShadow: `0 0 10px ${roleColor}80`, animation: 'pulse 2s infinite' }} />
                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: roleColor }}>{roleLabel}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.7rem', padding: '3px 10px', borderRadius: '12px', background: `${roleColor}15`, color: roleColor, fontWeight: 600 }}>
                        {isPrimary ? 'Active — Accepting Writes' : 'Standby — Read Only'}
                    </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    <div style={{ textAlign: 'center', padding: '10px', background: 'rgba(0,0,0,0.15)', borderRadius: '8px' }}>
                        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#e2e8f0' }}>{syncedPlants}/{totalPlants}</div>
                        <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>Plants Synced</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '10px', background: 'rgba(0,0,0,0.15)', borderRadius: '8px' }}>
                        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: totalPending > 0 ? '#f59e0b' : '#10b981' }}>{totalPending}</div>
                        <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>Pending Changes</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '10px', background: 'rgba(0,0,0,0.15)', borderRadius: '8px' }}>
                        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: replicationLag > 120 ? '#ef4444' : replicationLag > 60 ? '#f59e0b' : '#10b981' }}>
                            {replicationLag > 0 ? `${replicationLag}s` : '0s'}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>Replication Lag</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '10px', background: 'rgba(0,0,0,0.15)', borderRadius: '8px' }}>
                        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#e2e8f0' }}>{totalEntries}</div>
                        <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>Total Ledger</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '10px', background: 'rgba(0,0,0,0.15)', borderRadius: '8px' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e2e8f0', fontFamily: 'monospace' }}>
                            {lastSyncDisplay}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>Last Sync</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '10px', background: 'rgba(0,0,0,0.15)', borderRadius: '8px' }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#e2e8f0' }}>{totalDbSize}</div>
                        <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>Total DB Size</div>
                    </div>
                </div>
            </div>

            {/* ── Partner Server Address ── */}
            <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
                    {isPrimary ? 'SECONDARY SERVER ADDRESS' : 'PRIMARY SERVER ADDRESS'}
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                        type="text"
                        value={partnerAddress}
                        onChange={e => setPartnerAddress(e.target.value)}
                        placeholder={isPrimary ? 'http://replica-server.local:3000' : 'http://primary-server.local:3000'}
                        style={{ flex: 1, padding: '10px 14px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff', fontSize: '0.85rem', fontFamily: 'monospace' }}
                        title={t('settings.enterTheIpAddressOrTip')}
                    />
                    <button onClick={checkPartnerHealth} disabled={isChecking || !partnerAddress} title={t('settings.checkIfThePartnerHaTip')} style={{
                        padding: '10px 16px', borderRadius: '8px', cursor: partnerAddress ? 'pointer' : 'not-allowed',
                        background: secondaryHealth?.online ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${secondaryHealth?.online ? '#10b981' : 'var(--glass-border)'}`,
                        color: secondaryHealth?.online ? '#10b981' : '#94a3b8',
                        fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px'
                    }}>
                        {isChecking ? <RefreshCw size={14} className="spinning" /> : secondaryHealth?.online ? <Check size={14} /> : <Wifi size={14} />}
                        {isChecking ? 'Checking...' : secondaryHealth?.online ? `Online (${secondaryHealth.latencyMs}ms)` : 'Test'}
                    </button>
                </div>
                {secondaryHealth && !secondaryHealth.online && (
                    <div style={{ marginTop: '6px', fontSize: '0.72rem', color: '#ef4444' }}>
                        ❌ Partner unreachable: {secondaryHealth.error}
                    </div>
                )}
            </div>

            {/* ── Pairing Key Management ── */}
            <div style={{ marginBottom: '18px', padding: '16px', background: 'rgba(0,0,0,0.15)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '10px', fontWeight: 600 }}>
                    🔐 PAIRING KEY — {isPrimary ? 'Generate & share with the replica server' : 'Paste the key from the master server'}
                </label>
                {isPrimary ? (
                    <>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                            <button onClick={generateKey} disabled={isGenerating} title={t('settings.generateANewCryptographicPairingTip')} style={{
                                padding: '10px 18px', borderRadius: '8px', cursor: 'pointer',
                                background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                                border: 'none', color: '#fff', fontSize: '0.85rem', fontWeight: 600,
                                display: 'flex', alignItems: 'center', gap: '8px',
                                opacity: isGenerating ? 0.6 : 1
                            }}>
                                {isGenerating ? <RefreshCw size={14} className="spinning" /> : <Key size={14} />}
                                {isGenerating ? 'Generating...' : '🔑 Generate Pairing Key'}
                            </button>
                        </div>
                        {pairingKey && (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <input
                                    type="text" readOnly value={pairingKey}
                                    title={t('settings.generatedPairingKeyCopyThisTip')}
                                    style={{
                                        flex: 1, padding: '10px 14px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px',
                                        border: '1px solid rgba(59,130,246,0.3)', color: '#e2e8f0',
                                        fontFamily: 'monospace', fontSize: '0.8rem', letterSpacing: '0.5px'
                                    }}
                                />
                                <button onClick={copyKey} title={t('settings.copyThePairingKeyToTip')} style={{
                                    padding: '10px 14px', borderRadius: '8px', cursor: 'pointer',
                                    background: keyCopied ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)',
                                    border: `1px solid ${keyCopied ? '#10b981' : 'var(--glass-border)'}`,
                                    color: keyCopied ? '#10b981' : '#94a3b8',
                                    fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px'
                                }}>
                                    {keyCopied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy</>}
                                </button>
                            </div>
                        )}
                        <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '8px' }}>
                            Copy this key and paste it into the Secondary server's HA configuration to establish trust.
                        </div>
                    </>
                ) : (
                    <>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="text" value={importKey}
                                onChange={e => setImportKey(e.target.value)}
                                placeholder={t('settings.pastePairingKeyFromMasterPlaceholder')}
                                title={t('settings.pasteThePairingKeyGeneratedTip')}
                                style={{
                                    flex: 1, padding: '10px 14px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px',
                                    border: '1px solid var(--glass-border)', color: '#e2e8f0',
                                    fontFamily: 'monospace', fontSize: '0.8rem'
                                }}
                            />
                            <button onClick={importPairingKey} disabled={!importKey.trim() || isSaving} title={t('settings.importAndSaveThisPairingTip')} style={{
                                padding: '10px 18px', borderRadius: '8px', cursor: importKey.trim() ? 'pointer' : 'not-allowed',
                                background: keyImported ? 'rgba(16,185,129,0.15)' : importKey.trim() ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'rgba(255,255,255,0.05)',
                                border: keyImported ? '1px solid #10b981' : 'none',
                                color: keyImported ? '#10b981' : '#fff',
                                fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px'
                            }}>
                                {keyImported ? <><Check size={14} /> Imported!</> : isSaving ? <RefreshCw size={14} className="spinning" /> : <Key size={14} />}
                                {keyImported ? '' : isSaving ? 'Saving...' : 'Import Key'}
                            </button>
                        </div>
                        {pairingKey === '••••••••••••••••' && (
                            <div style={{ fontSize: '0.7rem', color: '#10b981', marginTop: '6px' }}>
                                ✅ Pairing key is already configured. Import a new one to replace it.
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ── Action Buttons ── */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
                <button onClick={saveConfig} disabled={isSaving} title={t('settings.saveTheHaRoleAndTip')} style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    background: isSaving ? 'var(--glass-border)' : 'linear-gradient(135deg, #3b82f6, #2563eb)',
                    color: '#fff', border: 'none', borderRadius: '10px', padding: '12px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer'
                }}>
                    {isSaving ? <RefreshCw size={16} className="spinning" /> : <Save size={16} />}
                    {isSaving ? 'Saving...' : 'Save Configuration'}
                </button>
                {isPrimary && (
                    <button onClick={forceSyncNow} disabled={isSyncing} title={t('settings.immediatelyPushAllPendingChangesTip')} style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        background: isSyncing ? 'var(--glass-border)' : 'rgba(59,130,246,0.12)',
                        color: '#60a5fa', border: '1px solid rgba(59,130,246,0.25)', borderRadius: '10px',
                        padding: '12px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer'
                    }}>
                        {isSyncing ? <RefreshCw size={16} className="spinning" /> : <RefreshCw size={16} />}
                        {isSyncing ? 'Syncing...' : '🔄 Force Sync Now'}
                    </button>
                )}
            </div>

            {/* ── Failover / Promote Button (Task 4.3) ── */}
            <div style={{ marginBottom: '14px' }}>
                {!showFailover ? (
                    <button onClick={() => setShowFailover(true)} title={isPrimary ? 'Demote this server to Secondary (read-only replica)' : 'Promote this server to Primary (accepts writes)'} style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        background: 'rgba(239,68,68,0.08)', color: '#f87171',
                        border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px',
                        padding: '10px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer'
                    }}>
                        <Zap size={16} /> {isPrimary ? '⚠️ Demote to Secondary' : '⚠️ Promote to Primary'}
                    </button>
                ) : (
                    <div style={{ background: 'rgba(239,68,68,0.06)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(239,68,68,0.25)' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f87171', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Zap size={16} /> Manual Failover — Confirm
                        </div>
                        <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '12px', lineHeight: 1.5 }}>
                            {isPrimary
                                ? 'This will demote this server to Secondary. It will stop accepting writes and become a read-only replica. The other server must be promoted to Primary.'
                                : 'This will promote this server to Primary. It will begin accepting writes and pushing to the other server. The other server should be demoted.'}
                            <br /><strong style={{ color: '#f87171' }}>A server restart is required after the role change.</strong>
                        </p>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                            <input
                                type="password" value={failoverPassword}
                                onChange={e => setFailoverPassword(e.target.value)}
                                placeholder={t('settings.enterYourAdminPasswordToPlaceholder')}
                                title={t('settings.enterYourAdminPasswordToTip')}
                                style={{ flex: 1, padding: '10px 14px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#fff', fontSize: '0.85rem' }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={async () => {
                                if (!failoverPassword) return;
                                setIsPromoting(true);
                                try {
                                    const res = await fetch('/api/ha/promote', {
                                        method: 'POST', headers,
                                        body: JSON.stringify({ password: failoverPassword })
                                    });
                                    const data = await res.json();
                                    if (data.success) {
                                        window.trierToast?.success(data.message);
                                        setShowFailover(false);
                                        setFailoverPassword('');
                                    } else {
                                        window.trierToast?.error(data.error);
                                    }
                                } catch (e) { window.trierToast?.error('Failover request failed'); }
                                setIsPromoting(false);
                            }} disabled={!failoverPassword || isPromoting} title={t('settings.executeTheFailoverThisWillTip')} style={{
                                flex: 1, padding: '10px', borderRadius: '8px', cursor: failoverPassword ? 'pointer' : 'not-allowed',
                                background: isPromoting ? 'var(--glass-border)' : 'linear-gradient(135deg, #ef4444, #dc2626)',
                                border: 'none', color: '#fff', fontSize: '0.85rem', fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                            }}>
                                {isPromoting ? <RefreshCw size={14} className="spinning" /> : <Zap size={14} />}
                                {isPromoting ? 'Processing...' : '⚠️ Confirm Failover'}
                            </button>
                            <button onClick={() => { setShowFailover(false); setFailoverPassword(''); }} title={t('settings.cancelTheFailoverOperationTip')} style={{
                                padding: '10px 20px', borderRadius: '8px', cursor: 'pointer',
                                background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)',
                                color: '#94a3b8', fontSize: '0.85rem'
                            }}>{t('common.cancel', 'Cancel')}</button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Info Footer ── */}
            <div style={{ padding: '10px 14px', background: 'rgba(59,130,246,0.06)', borderRadius: '8px', border: '1px solid rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1rem' }}>ℹ️</span>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.5 }}>
                    {isPrimary
                        ? 'As Primary, this server pushes all data changes to the Secondary every 60 seconds. Generate a pairing key above and share it with your replica server.'
                        : 'As Secondary, this server receives changes from the Primary. Import the pairing key generated on the master, then enter the master\'s address above.'}
                </span>
            </div>
        </div>
    );
}

export default function AdminConsoleView({ plantId, plantLabel, plants }) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const currentPlant = plants?.find(p => p.id === plantId) || { id: plantId, label: plantLabel || plantId };
    const userRole = localStorage.getItem('userRole');
    const isAdminOrCreator = ['it_admin', 'creator'].includes(userRole) || localStorage.getItem('PF_USER_IS_CREATOR') === 'true';
    const canSAP = localStorage.getItem('canSAP') === 'true';

    const [adminCategory, setAdminCategory] = useState(null);
    const [exportPlant, setExportPlant] = useState(plantId);
    const [isExporting, setIsExporting] = useState(false);
    const [isBackingUp, setIsBackingUp] = useState(false);
    const [isReindexing, setIsReindexing] = useState(false);
    const [isVacuuming, setIsVacuuming] = useState(false);
    const [showSAP, setShowSAP] = useState(false);
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [branding, setBranding] = useState({ dashboardLogo: null, documentLogo: null });
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);

    useEffect(() => { fetchBranding(); }, []);

    const fetchBranding = async () => {
        try { const res = await fetch('/api/branding'); setBranding(await res.json()); } catch {}
    };

    const handleLogoUpload = async (e, logoType = 'dashboard') => {
        const file = e.target.files[0]; if (!file) return;
        setIsUploadingLogo(true);
        const formData = new FormData(); formData.append('logo', file);
        try {
            const res = await fetch('/api/branding/logo/' + logoType, { method: 'POST', body: formData });
            const data = await res.json();
            if (data.success) { setBranding(data.settings); window.dispatchEvent(new CustomEvent('trier-branding-update', { detail: data.settings })); }
            else window.trierToast?.error(data.error || 'Failed to upload logo');
        } catch { window.trierToast?.error('Error uploading logo'); }
        finally { setIsUploadingLogo(false); }
    };

    const resetLogo = async (logoType = 'dashboard') => {
        if (!await confirm('Revert to default logo for this slot?')) return;
        try {
            const res = await fetch('/api/branding/logo/' + logoType, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) { setBranding(data.settings); window.dispatchEvent(new CustomEvent('trier-branding-update', { detail: data.settings })); }
        } catch { window.trierToast?.error('Failed to reset logo'); }
    };

    const handleExport = async () => {
        setIsExporting(true);
        const isCreator = localStorage.getItem('PF_USER_IS_CREATOR') === 'true';
        const username = localStorage.getItem('currentUser') || '';
        const token = localStorage.getItem('authToken') || '';
        const url = `/api/database/export?role=${userRole}&is_creator=${isCreator}&plantId=${exportPlant}&username=${encodeURIComponent(username)}&token=${token}`;
        try {
            const response = await fetch(url);
            if (!response.ok) { window.trierToast?.error('Export failed'); setIsExporting(false); return; }
            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = downloadUrl; a.download = `${exportPlant}_Maintenance.db`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(downloadUrl);
        } catch { window.trierToast?.error('Export request failed.'); }
        finally { setIsExporting(false); }
    };

    const triggerBackup = () => {
        setIsBackingUp(true);
        fetch('/api/database/backup', { method: 'POST', headers: { 'x-plant-id': exportPlant, 'x-user-role': userRole, 'x-is-creator': localStorage.getItem('PF_USER_IS_CREATOR'), 'Authorization': 'Bearer ' + localStorage.getItem('authToken') } })
        .then(res => res.json())
        .then(data => { if (data.success) window.trierToast?.success('Node [' + exportPlant + '] backed up: ' + data.file); else window.trierToast?.error('Backup error: ' + data.error); })
        .catch(() => window.trierToast?.error('Failed to execute backup.'))
        .finally(() => setIsBackingUp(false));
    };

    const handleReindex = async () => {
        setIsReindexing(true);
        try { const res = await fetch('/api/maintenance/reindex', { method: 'POST' }); const data = await res.json(); if (data.success) window.trierToast?.success('Master Registry updated.'); }
        catch { window.trierToast?.error('Re-indexing failed.'); }
        finally { setIsReindexing(false); }
    };

    const handleVacuum = async () => {
        if (!await confirm('Deep Clean the Master Registry to reclaim disk space?')) return;
        setIsVacuuming(true);
        try { const res = await fetch('/api/maintenance/vacuum', { method: 'POST' }); const data = await res.json(); if (data.success) window.trierToast?.success('Database compaction complete.'); }
        catch { window.trierToast?.error('Compaction failed.'); }
        finally { setIsVacuuming(false); }
    };

    if (!isAdminOrCreator) {
        return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}><Lock size={40} /><h2 style={{ marginLeft: '15px' }}>Access Denied — Admin or Creator role required</h2></div>;
    }

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* Header */}
            <div className="glass-card" style={{ padding: '15px 25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: 0, color: '#fff' }}>
                    <div style={{ background: 'rgba(239, 68, 68, 0.2)', padding: '8px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)' }}><Lock size={22} color="#ef4444" /></div>
                    {t('settings.adminConsole')}
                    <span style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 'normal', marginLeft: '5px' }}>{t('settings.creatorItAdminOnly')}</span>
                </h2>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    {adminCategory && <button onClick={() => setAdminCategory(null)} className="btn-nav" title="Return to hub">← Back to Hub</button>}
                    <button onClick={() => navigate('/')} className="btn-nav" title="Back to Mission Control">← Mission Control</button>
                </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                {!adminCategory && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px' }}>
                        <div className="admin-hub-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'clamp(10px, 2vw, 24px)', maxWidth: '900px', width: '100%' }}>
                            {[
                                { key: 'database', icon: <DatabaseIcon size={24} color="#fff" />, title: 'Database & Backups', count: '7 panels', color: '#f59e0b', desc: 'Database export, snapshot rollback, backup privileges, danger zone, system health, data import & export tools.', tags: ['Export', 'Snapshots', 'Privileges', 'Health', 'Import'] },
                                { key: 'users', icon: <Users size={24} color="#fff" />, title: 'Users & Security', count: '3 panels', color: '#3b82f6', desc: 'User accounts & roles, approval queue management, and enterprise onboarding console.', tags: ['Accounts', 'Approvals', 'Onboarding'] },
                                { key: 'integrations', icon: <Globe size={24} color="#fff" />, title: 'Integrations & API', count: '6 panels', color: '#a855f7', desc: 'Webhooks, REST API documentation, email/SMTP settings, SAP integration, AI configuration, and AD/LDAP directory.', tags: ['Webhooks', 'API', 'Email', 'SAP', 'AI Config', 'AD/LDAP'] },
                                { key: 'branding', icon: <ImageIcon size={24} color="#fff" />, title: 'Branding & Config', count: '4 panels', color: '#10b981', desc: 'Dashboard logo, document/print logo, network configuration, and high availability server configuration.', tags: ['Logos', 'Print', 'Network', 'HA Config'] }
                            ].map(cat => (
                                <button key={cat.key} onClick={() => setAdminCategory(cat.key)} title={`Open ${cat.title} administration`} style={{
                                    background: `linear-gradient(135deg, ${cat.color}14 0%, ${cat.color}08 100%)`,
                                    border: `1px solid ${cat.color}40`, borderRadius: '16px', padding: 'clamp(14px, 2vw, 30px)',
                                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.3s ease', display: 'flex', flexDirection: 'column', gap: '10px'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = `0 12px 40px ${cat.color}26`; }}
                                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ width: '44px', height: '44px', minWidth: '44px', borderRadius: '12px', background: `linear-gradient(135deg, ${cat.color}, ${cat.color}cc)`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 12px ${cat.color}40` }}>{cat.icon}</div>
                                        <div>
                                            <div style={{ fontSize: 'clamp(0.85rem, 2vw, 1.15rem)', fontWeight: 700, color: '#e2e8f0' }}>{cat.title}</div>
                                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>{cat.count}</div>
                                        </div>
                                    </div>
                                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.5 }}>{cat.desc}</p>
                                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                                        {cat.tags.map(tg => <span key={tg} style={{ padding: '2px 8px', borderRadius: '12px', background: `${cat.color}1a`, color: cat.color, fontSize: '0.6rem', fontWeight: 600 }}>{tg}</span>)}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* CAT 1: Database & Backups */}
                {adminCategory === 'database' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div className="panel-box" style={{ background: 'rgba(255,255,255,0.03)', padding: '14px', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                                <h3 style={{ fontSize: '0.95rem', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}><DatabaseIcon size={16} color="#f59e0b" /> {t('settings.databaseManagement')}</h3>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>{t('settings.targetNode')}:</label>
                                    <select value={exportPlant} onChange={e => setExportPlant(e.target.value)} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '6px', padding: '5px 8px', color: '#fff', fontSize: '0.8rem' }}>
                                        {(plants || []).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                                    </select>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={triggerBackup} disabled={isBackingUp} className="btn-primary btn-sm" style={{ flex: 1, justifyContent: 'center' }}>
                                        {isBackingUp ? <RefreshCw size={14} className="spinning" /> : <DatabaseIcon size={14} />} {isBackingUp ? 'Running...' : 'Backup'}
                                    </button>
                                    <button onClick={handleExport} disabled={isExporting} className="btn-primary btn-sm" style={{ flex: 1, justifyContent: 'center' }}>
                                        {isExporting ? <RefreshCw size={14} className="spinning" /> : <Download size={14} />} {isExporting ? 'Preparing...' : 'Export .DB'}
                                    </button>
                                </div>
                            </div>
                            <SnapshotRollbackView selectedPlant={plantId} currentPlant={currentPlant} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <BackupPrivilegesView />
                            <PlantResetPanel currentPlant={currentPlant} exportPlant={exportPlant} userRole={userRole} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div className="panel-box" style={{ background: 'rgba(255,255,255,0.03)', padding: '14px', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                                <h3 style={{ fontSize: '0.95rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}><Zap size={16} color="#fbbf24" /> {t('settings.systemHealthEnterpriseRegistry')}</h3>
                                <p style={{ color: 'var(--text-muted)', marginBottom: '10px', fontSize: '0.75rem' }}>{t('settings.manuallyForceARefresh')}</p>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={handleReindex} disabled={isReindexing} className="btn-primary btn-sm" style={{ flex: 1, justifyContent: 'center' }}>
                                        <RefreshCw size={14} className={isReindexing ? 'spinning' : ''} /> {isReindexing ? 'Indexing...' : 'Registry Sync'}
                                    </button>
                                    <button onClick={handleVacuum} disabled={isVacuuming} className="btn-purple btn-sm" style={{ flex: 1, justifyContent: 'center' }}>
                                        {isVacuuming ? <RefreshCw size={14} className="spinning" /> : <Wind size={14} />} {isVacuuming ? 'Cleaning...' : 'Deep Clean'}
                                    </button>
                                </div>
                            </div>
                            <DataExportPanel />
                        </div>
                        <ImportWizard currentPlant={currentPlant} onComplete={() => window.location.reload()} userRole={userRole} />
                    </div>
                )}

                {/* CAT 2: Users & Security */}
                {adminCategory === 'users' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <UserAccountsView />
                        <ApprovalQueue />
                        <EnrollmentQueue />
                        <div className="glass-card" style={{ padding: 'var(--card-padding)', background: 'linear-gradient(135deg, rgba(99,102,241,0.05), rgba(16,185,129,0.05))' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <div style={{ background: 'var(--primary)', padding: '10px', borderRadius: '10px' }}><Globe color="#fff" size={24} /></div>
                                    <div><h3 style={{ margin: 0 }}>{t('settings.enterpriseOnboardingConsole')}</h3><p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('settings.provisionThisSiteUsing')}</p></div>
                                </div>
                                <button className="btn-primary" onClick={() => setShowOnboarding(true)}>{t('settings.openOnboardingConsole')}</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* CAT 3: Integrations & API */}
                {adminCategory === 'integrations' && (
                    <div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                            <WebhookIntegrationPanel />
                            <AIConfigPanel />
                            <APIDocsPanel />
                            <EmailSettingsPanel />
                        </div>
                        {(isAdminOrCreator || canSAP) && (
                            <div style={{ marginTop: '12px', padding: '14px 18px', background: 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(79,70,229,0.03))', borderRadius: '10px', border: '1px solid rgba(99,102,241,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ background: 'linear-gradient(135deg, #6366f1, #4338ca)', padding: '8px', borderRadius: '8px' }}><Globe color="#fff" size={18} /></div>
                                    <div><div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#e2e8f0' }}>{t('settings.sapSetup')}</div><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('settings.configureSapPmIntegration')}</div></div>
                                </div>
                                <button className="btn-primary btn-sm" onClick={() => setShowSAP(true)} title="Open the SAP PM integration settings"><Globe size={14} /> Open SAP</button>
                            </div>
                        )}
                        <div style={{ marginTop: '12px' }}><LDAPConfigPanel /></div>
                    </div>
                )}

                {/* CAT 4: Branding & Config */}
                {adminCategory === 'branding' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div className="panel-box" style={{ background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                            <h3 style={{ fontSize: '1.2rem', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}><ImageIcon size={20} color="#10b981" /> Dashboard Logo</h3>
                            <p style={{ color: 'var(--text-muted)', marginBottom: '15px', fontSize: '0.8rem' }}>Logo displayed in the app header. Use a dark-background version.</p>
                            <div style={{ display: 'flex', gap: '20px', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                                <div style={{ width: '80px', height: '80px', borderRadius: '8px', background: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--glass-border)', overflow: 'hidden' }}>
                                    <img src={branding.dashboardLogo || '/assets/TrierLogo.png'} alt="Dashboard Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                </div>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <label className="btn-primary btn-sm" style={{ cursor: 'pointer', flex: 1, justifyContent: 'center' }}>
                                            <Download size={16} style={{ transform: 'rotate(180deg)' }} /> {isUploadingLogo ? 'Uploading...' : branding.dashboardLogo ? 'Change' : 'Upload'}
                                            <input type="file" accept="image/*" onChange={(e) => handleLogoUpload(e, 'dashboard')} style={{ display: 'none' }} disabled={isUploadingLogo} />
                                        </label>
                                        {branding.dashboardLogo && <button onClick={() => resetLogo('dashboard')} className="btn-danger" style={{ width: '40px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={16} /></button>}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{branding.dashboardLogo ? 'Custom dashboard logo active.' : 'Using default Trier OS logo (dark).'}</div>
                                </div>
                            </div>
                        </div>
                        <div className="panel-box" style={{ background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                            <h3 style={{ fontSize: '1.2rem', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}><ImageIcon size={20} color="#f59e0b" /> Document / Print Logo</h3>
                            <p style={{ color: 'var(--text-muted)', marginBottom: '15px', fontSize: '0.8rem' }}>Logo for printed documents. Use a white-background version.</p>
                            <div style={{ display: 'flex', gap: '20px', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                                <div style={{ width: '80px', height: '80px', borderRadius: '8px', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--glass-border)', overflow: 'hidden' }}>
                                    <img src={branding.documentLogo || '/assets/TrierLogoPrint.png'} alt="Document Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                </div>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <label className="btn-edit btn-sm" style={{ cursor: 'pointer', flex: 1, justifyContent: 'center' }}>
                                            <Download size={16} style={{ transform: 'rotate(180deg)' }} /> {isUploadingLogo ? 'Uploading...' : branding.documentLogo ? 'Change' : 'Upload'}
                                            <input type="file" accept="image/*" onChange={(e) => handleLogoUpload(e, 'document')} style={{ display: 'none' }} disabled={isUploadingLogo} />
                                        </label>
                                        {branding.documentLogo && <button onClick={() => resetLogo('document')} className="btn-danger" style={{ width: '40px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={16} /></button>}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{branding.documentLogo ? 'Custom document logo active.' : 'Using default Trier OS logo (white background).'}</div>
                                </div>
                            </div>
                        </div>
                        <NetworkConfigPanel />
                        <HAConfigPanel />
                    </div>
                )}
            </div>

            {showSAP && <SAPIntegrationView onClose={() => setShowSAP(false)} />}
            {showOnboarding && <OnboardingWizard onClose={() => setShowOnboarding(false)} plantId={currentPlant.id} plantLabel={currentPlant.label} mode="audit" />}
        </div>
    );
}
