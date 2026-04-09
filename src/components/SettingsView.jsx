// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — System Settings & Configuration
 * =============================================
 * Comprehensive system configuration panel organized into role-scoped tabs.
 * IT Admins see all sections; Managers see a subset; Technicians see only
 * personal account settings.
 *
 * SECTIONS:
 *   Account          — Password change, profile, language preference
 *   Users            — UserAccountsView: user roster, role assignment, plant access
 *   Database         — Import wizard, snapshot rollback, VACUUM, plant registration
 *   Branding         — Logo upload, primary color, document header customization
 *   Notifications    — Email SMTP config, webhook URLs, alert threshold settings
 *   Integrations     — SAP RFC connection, SAPIntegrationView
 *   API Keys         — Generate / revoke API keys for Power BI, Tableau, ERP bridges
 *   Desktop App      — Download Electron installer for Windows, Mac, Linux
 *   Backup           — BackupPrivilegesView: grant/revoke backup operator access
 *
 * Each section is a self-contained sub-component. This parent manages
 * tab routing and passes shared auth context as props.
 */
import React, { useState, useEffect } from 'react';
import { Settings, Database as DatabaseIcon, Download, Shield, Globe, RefreshCw, ClipboardList, Monitor, Trash2, Zap, Wind, Bell, Send, ToggleLeft, ToggleRight, Plus, X, Lock, Users, Key, Copy, Save, Wifi, Check, ImageIcon, Server } from 'lucide-react';
import PasswordChangeView from './PasswordChangeView';
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
import UserNotificationsPanel from './UserNotificationsPanel';
import SensorDashboard from './SensorDashboard';
import ComplianceTracker from './ComplianceTracker';
import EnergyDashboard from './EnergyDashboard';
import ReportBuilder from './ReportBuilder';
import { ReplayTourButton } from './OnboardingTour';
import EscalationRulesPanel from './EscalationRulesPanel';
import LotoPanel from './LotoPanel';
import RoleAvatar, { getAvatarForRole } from './RoleAvatar';
import LDAPConfigPanel from './LDAPConfigPanel';
import { useTranslation } from '../i18n/index.jsx';
import { TakeTourButton } from './ContextualTour';
import { formatDate } from '../utils/formatDate';
import LoadingSpinner from './LoadingSpinner';

// ── Phase 2 Task 2.3: Plant Data Reset Panel ──
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
                setResetResult({ success: true, message: `${t('settings.plantResetSuccess', 'Plant')} "${targetPlantId}" ${t('settings.plantResetSuccessMsg', 'reset successfully. Snapshot saved:')} ${data.snapshotFile}` });
                setResetConfirmName('');
                setResetConfirmCode('');
            } else {
                setResetResult({ success: false, message: data.error || t('settings.resetFailed', 'Reset failed') });
            }
        } catch (err) {
            setResetResult({ success: false, message: t('settings.requestFailed', 'Request failed') + ': ' + err.message });
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
                            {t('settings.resetAllDataDesc', 'Reset all data for a plant node. This clears all work orders, assets, parts, and vendors.')}
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
                {t('settings.snapshotCreatedBeforeReset', 'A snapshot will be created automatically before the reset.')}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                        {t('settings.type')} <strong>"{currentPlant?.label}"</strong> {t('settings.toConfirm', 'to confirm')}
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
                        {t('settings.type')} <strong>"RESET-CONFIRMED"</strong> {t('settings.toProceed', 'to proceed')}
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

// ── Desktop Download Section (end-user friendly) ──
function DesktopDownloadSection({ platform }) {
    const { t } = useTranslation();
    const [status, setStatus] = React.useState(null);
    const [loading, setLoading] = React.useState(true);
    const [downloading, setDownloading] = React.useState(false);

    React.useEffect(() => {
        const token = localStorage.getItem('token');
        fetch('/api/desktop/status', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(r => r.json())
            .then(data => { setStatus(data); setLoading(false); })
            .catch(() => { setStatus({ available: false }); setLoading(false); });
    }, []);

    const handleDownload = async () => {
        setDownloading(true);
        try {
            const res = await fetch(`/api/desktop/download/${platform.os}`);
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Download failed' }));
                window.trierToast?.error(err.error || t('settings.downloadFailed', 'Download failed'));
                setDownloading(false);
                return;
            }
            // Get filename from Content-Disposition header or use default
            const disposition = res.headers.get('Content-Disposition') || '';
            const filenameMatch = disposition.match(/filename="?(.+?)"?$/);
            const filename = filenameMatch ? filenameMatch[1] : `TrierCMMS-${platform.os}-installer${platform.ext || ''}`;
            
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            window.trierToast?.error(t('settings.downloadFailed', 'Download failed') + ': ' + err.message);
        }
        setDownloading(false);
    };

    if (loading) {
        return (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <RefreshCw size={16} className="spinning" style={{ marginRight: '8px' }} />
                {t('settings.checkingForInstallers', 'Checking for available installers…')}
            </div>
        );
    }

    const installerInfo = status?.installers?.[platform.os];

    // Installer IS available — show download button
    if (status?.available && installerInfo) {
        return (
            <>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '16px', lineHeight: 1.6 }}>
                    {t('settings.desktopAppReadyDesc', 'The standalone desktop app for')} <strong>{platform.label}</strong> {t('settings.desktopAppReadyDesc2', 'is ready to download. It includes offline database support, zero-downtime operation, and automatic background sync.')}
                </p>

                <div style={{
                    display: 'flex', alignItems: 'center', gap: '16px',
                    background: 'rgba(0,0,0,0.2)', padding: '16px',
                    borderRadius: '12px', border: '1px solid var(--glass-border)'
                }}>
                    <div style={{
                        width: '52px', height: '52px', borderRadius: '12px',
                        background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1.6rem', flexShrink: 0,
                        boxShadow: '0 4px 16px rgba(99, 102, 241, 0.3)'
                    }}>
                        {platform.icon}
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#e2e8f0', marginBottom: '4px' }}>
                            {t('settings.trierOsFor', 'Trier OS for')} {platform.label}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {installerInfo.filename} • {installerInfo.sizeLabel}
                            {installerInfo.modified && (
                                <> • {t('settings.built', 'Built')} {formatDate(installerInfo.modified)}</>
                            )}
                        </div>
                    </div>
                    <button
                        className="btn-primary"
                        onClick={handleDownload}
                        disabled={downloading}
                        title={`${t('settings.download', 'Download')} ${installerInfo.filename}`}
                        style={{
                            padding: '10px 24px', fontSize: '0.85rem', fontWeight: 700,
                            background: downloading
                                ? 'rgba(99, 102, 241, 0.15)'
                                : 'linear-gradient(135deg, #6366f1, #4f46e5)',
                            color: downloading ? '#818cf8' : '#fff',
                            border: '1px solid rgba(99, 102, 241, 0.5)', borderRadius: '10px',
                            display: 'flex', alignItems: 'center', gap: '8px',
                            cursor: downloading ? 'wait' : 'pointer',
                            boxShadow: downloading ? 'none' : '0 4px 12px rgba(99, 102, 241, 0.3)',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        {downloading ? (
                            <><RefreshCw size={16} className="spinning" /> {t('settings.downloading', 'Downloading…')}</>
                        ) : (
                            <><Download size={16} /> {t('settings.download', 'Download')}</>
                        )}
                    </button>
                </div>

                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '10px', marginTop: '14px'
                }}>
                    {[
                        { icon: '💾', label: t('settings.fullSqliteDb', 'Full SQLite DB'), desc: t('settings.localDatabaseReplica', 'Local database replica') },
                        { icon: '📡', label: t('settings.autoSync', 'Auto Sync'), desc: t('settings.thirtySecondIntervals', '30-second intervals') },
                        { icon: '🔌', label: t('settings.zeroDowntime', 'Zero Downtime'), desc: t('settings.worksFullyOffline', 'Works fully offline') }
                    ].map(f => (
                        <div key={f.label} style={{
                            background: 'rgba(255,255,255,0.02)', padding: '12px',
                            borderRadius: '8px', textAlign: 'center',
                            border: '1px solid rgba(255,255,255,0.04)'
                        }}>
                            <div style={{ fontSize: '1.2rem', marginBottom: '4px' }}>{f.icon}</div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#e2e8f0' }}>{f.label}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>{f.desc}</div>
                        </div>
                    ))}
                </div>
            </>
        );
    }

    // Installer NOT available — show friendly message
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: '14px',
            background: 'rgba(0,0,0,0.15)', padding: '18px',
            borderRadius: '12px', border: '1px solid var(--glass-border)'
        }}>
            <div style={{
                width: '48px', height: '48px', borderRadius: '12px',
                background: 'rgba(100, 116, 139, 0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.4rem', flexShrink: 0
            }}>
                {platform.icon}
            </div>
            <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#94a3b8', marginBottom: '6px' }}>
                    {t('settings.desktopInstallerNotAvailable', 'Desktop Installer Not Yet Available')}
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', lineHeight: 1.6 }}>
                    {t('settings.desktopInstallerNotPublished', 'The')} <strong>{platform.label}</strong> {t('settings.desktopInstallerNotPublished2', 'desktop installer has not been published to this server yet. Contact your system administrator to make it available for download.')}
                </p>
            </div>
        </div>
    );
}

// ── Phase 3 Steps 3.1-3.4: Desktop Client Download & Platform Detection ──
function DesktopClientPanel() {
    const { t } = useTranslation();
    const [platform, setPlatform] = React.useState(null);


    React.useEffect(() => {
        const ua = navigator.userAgent.toLowerCase();
        const plat = (navigator.platform || '').toLowerCase();

        if (/android/i.test(ua)) {
            setPlatform({ os: 'android', type: 'mobile', supported: false, icon: '📱', label: 'Android' });
        } else if (/iphone/i.test(ua)) {
            setPlatform({ os: 'ios', type: 'mobile', supported: false, icon: '📱', label: 'iPhone' });
        } else if (/ipad/i.test(ua)) {
            setPlatform({ os: 'ios', type: 'tablet', supported: false, icon: '📱', label: 'iPad' });
        } else if (/win/i.test(plat) || /win/i.test(ua)) {
            setPlatform({ os: 'windows', type: 'desktop', supported: true, icon: '🪟', label: 'Windows', ext: '.exe' });
        } else if (/mac/i.test(plat) || /macintosh/i.test(ua)) {
            setPlatform({ os: 'mac', type: 'desktop', supported: true, icon: '🍎', label: 'macOS', ext: '.dmg' });
        } else if (/linux/i.test(plat) || /linux/i.test(ua)) {
            setPlatform({ os: 'linux', type: 'desktop', supported: true, icon: '🐧', label: 'Linux', ext: '.AppImage' });
        } else {
            setPlatform({ os: 'unknown', type: 'unknown', supported: false, icon: '❓', label: 'Unknown' });
        }
    }, []);

    if (!platform) return null;

    return (
        <div className="panel-box" style={{
            background: platform.supported
                ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(16, 185, 129, 0.03) 100%)'
                : 'rgba(255,255,255,0.02)',
            padding: '20px',
            borderRadius: '12px',
            border: `1px solid ${platform.supported ? 'rgba(99, 102, 241, 0.3)' : 'var(--glass-border)'}`
        }}>
            <h3 style={{
                fontSize: '1.2rem',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
            }}>
                <Monitor size={20} color={platform.supported ? '#6366f1' : '#64748b'} />
                {t('settings.desktopClient', 'Desktop Client')}
            </h3>

            {/* Branch 1: Running inside Electron */}
            {platform.supported && window.TrierOS?.isElectron && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '14px',
                    background: 'rgba(16, 185, 129, 0.08)', padding: '16px',
                    borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.3)'
                }}>
                    <div style={{
                        width: '48px', height: '48px', borderRadius: '12px',
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1.4rem', flexShrink: 0,
                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                    }}>{'✅'}</div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#10b981', marginBottom: '4px' }}>
                            {t('settings.runningInDesktopMode', 'Running in Desktop Mode')}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {t('settings.fullOfflineSqliteActive', 'Full offline SQLite database active on')} {platform.label} • {t('settings.autoSyncEnabled', 'Auto-sync enabled')}
                        </div>
                    </div>
                </div>
            )}

            {/* Branch 2: Desktop browser — check server for available installer */}
            {platform.supported && !window.TrierOS?.isElectron && (
                <DesktopDownloadSection platform={platform} />
            )}

            {/* Branch 3: Mobile/Tablet — not supported */}
            {!platform.supported && (
                <>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '16px',
                        background: 'rgba(0,0,0,0.15)', padding: '18px',
                        borderRadius: '12px', border: '1px solid var(--glass-border)'
                    }}>
                        <div style={{
                            width: '48px', height: '48px', borderRadius: '12px',
                            background: 'rgba(100, 116, 139, 0.15)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '1.5rem', flexShrink: 0
                        }}>
                            {platform.icon}
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#94a3b8', marginBottom: '6px' }}>
                                {t('settings.desktopClientNotAvailableFor', 'Desktop Client — Not Available for')} {platform.label}
                            </div>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', lineHeight: 1.6 }}>
                                {t('settings.desktopClientIsFor', 'The Desktop Client is for')} <strong>{t('settings.windows')}</strong>, <strong>{t('settings.mac')}</strong>{t('settings.and')} <strong>{t('settings.linux')}</strong> {t('settings.only', 'only')}.
                                {t('settings.yourDevice', 'Your')} {platform.type === 'tablet' ? t('settings.tablet', 'tablet') : t('settings.device', 'device')} {t('settings.alreadyHasOfflineMode', 'already has offline mode through the web app —')}
                                {t('settings.useTheBannerToAddHome', 'use the')} <strong>{t('settings.quotinstallTrierOsquot')}</strong> {t('settings.bannerToAddHomeScreen', 'banner to add it to your home screen for the best experience.')}
                            </p>
                        </div>
                    </div>

                    <div style={{
                        marginTop: '12px', display: 'flex', gap: '8px', justifyContent: 'center'
                    }}>
                        {[
                            t('settings.windowsPill', '🪟 Windows'),
                            t('settings.macosPill', '🍎 macOS'),
                            t('settings.linuxPill', '🐧 Linux')
                        ].map(p => (
                            <span key={p} style={{
                                padding: '4px 12px', borderRadius: '16px',
                                background: 'rgba(255,255,255,0.04)',
                                fontSize: '0.7rem', color: '#64748b', fontWeight: 600
                            }}>{p}</span>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

// ── Network Configuration Panel ──────────────────────────────────────────
// Shows server's detected IP, internet connectivity, all interfaces, and admin override
function NetworkConfigPanel() {
    const { t } = useTranslation();
    const [netInfo, setNetInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [overrideAddr, setOverrideAddr] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState(null);
    // Adapter config state
    const [showNetInfo, setShowNetInfo] = useState(false);
    const [staticMode, setStaticMode] = useState('dhcp');
    const [staticIface, setStaticIface] = useState('');
    const [staticIp, setStaticIp] = useState('');
    const [staticSubnet, setStaticSubnet] = useState('255.255.255.0');
    const [staticGateway, setStaticGateway] = useState('');
    const [staticDns1, setStaticDns1] = useState('');
    const [staticDns2, setStaticDns2] = useState('');
    const [applyingStatic, setApplyingStatic] = useState(false);
    const [staticMsg, setStaticMsg] = useState(null);

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
                setSaveMsg({ ok: true, text: `${t('settings.savedServerUrl', 'Saved! Server URL:')} ${data.url}` });
                fetchNetInfo();
            } else {
                setSaveMsg({ ok: false, text: data.error || t('settings.failedToSave', 'Failed to save') });
            }
        } catch (e) {
            setSaveMsg({ ok: false, text: t('settings.requestFailed', 'Request failed') });
        }
        setSaving(false);
    };

    const handleApplyStaticIp = async () => {
        if (!staticIface) return;
        if (staticMode === 'static' && (!staticIp.trim() || !staticSubnet.trim())) return;
        setApplyingStatic(true);
        setStaticMsg(null);
        try {
            const res = await fetch('/api/network-config/static-ip', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('authToken')}` },
                body: JSON.stringify({ interface: staticIface, mode: staticMode, ip: staticIp.trim(), subnet: staticSubnet.trim(), gateway: staticGateway.trim(), dns1: staticDns1.trim(), dns2: staticDns2.trim() })
            });
            const data = await res.json();
            if (data.success) {
                setStaticMsg({ ok: true, text: data.message || t('settings.staticIpApplied', 'Applied. Reconnect at the new address if connection drops.') });
                fetchNetInfo();
            } else {
                setStaticMsg({ ok: false, text: data.error || t('settings.failedToApplyStaticIp', 'Failed to apply — administrator privileges may be required.') });
            }
        } catch {
            setStaticMsg({ ok: false, text: t('settings.requestFailed', 'Request failed') });
        }
        setApplyingStatic(false);
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
                setSaveMsg({ ok: true, text: t('settings.overrideCleared', 'Override cleared. Using auto-detection.') });
                fetchNetInfo();
            }
        } catch (e) {
            setSaveMsg({ ok: false, text: t('settings.failedToClearOverride', 'Failed to clear override') });
        }
        setSaving(false);
    };

    const inputStyle = (accent = '#10b981') => ({
        width: '100%', padding: '10px 12px', fontSize: '0.85rem',
        background: 'rgba(0,0,0,0.3)', border: `1px solid ${accent}44`,
        borderRadius: '8px', color: '#fff', fontFamily: 'monospace', boxSizing: 'border-box'
    });

    const fieldLabel = (text) => (
        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{text}</div>
    );

    return (
        <div className="panel-box" style={{ background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Wifi size={20} color="#3b82f6" /> {t('settings.networkConfiguration', 'Network Configuration')}
                </h3>
                <button onClick={fetchNetInfo} disabled={loading} className="btn-primary"
                    style={{ padding: '6px 14px', fontSize: '0.75rem', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <RefreshCw size={12} className={loading ? 'spinning' : ''} /> {t('settings.refresh', 'Refresh')}
                </button>
            </div>

            {loading ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    <RefreshCw size={16} className="spinning" style={{ marginRight: '8px' }} /> {t('settings.detectingNetwork', 'Detecting network...')}
                </div>
            ) : !netInfo ? (
                <div style={{ padding: '15px', textAlign: 'center', color: '#ef4444', fontSize: '0.85rem' }}>
                    {t('settings.failedToFetchNetworkInfo', 'Failed to fetch network information')}
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* Status Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '14px', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('settings.serverAddress')}</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e2e8f0', fontFamily: 'monospace' }}>{netInfo.lanIp}</div>
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '4px' }}>
                                {netInfo.source === 'admin_override' && <span style={{ color: '#f59e0b' }}>{t('settings.manualOverride', '✏️ Manual override')}</span>}
                                {netInfo.source === 'auto_detected' && <span style={{ color: '#10b981' }}>{t('settings.autodetected', '🔍 Auto-detected')}</span>}
                                {netInfo.source === 'fallback' && <span style={{ color: '#ef4444' }}>{t('settings.fallbackNoNetwork', '⚠️ Fallback (no network?)')}</span>}
                            </div>
                        </div>
                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '14px', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('settings.internetStatus')}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ width: 14, height: 14, borderRadius: '50%', background: netInfo.internetConnected ? '#10b981' : '#ef4444', boxShadow: netInfo.internetConnected ? '0 0 10px rgba(16,185,129,0.5)' : '0 0 10px rgba(239,68,68,0.5)' }} />
                                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: netInfo.internetConnected ? '#10b981' : '#ef4444' }}>
                                    {netInfo.internetConnected ? t('settings.connected', 'Connected') : t('settings.noInternet', 'No Internet')}
                                </span>
                            </div>
                        </div>
                    </div>
                    {/* Full URL */}
                    <div style={{ background: 'rgba(59,130,246,0.06)', padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>{t('settings.otherDevicesShouldConnectTo')}</div>
                            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#60a5fa', fontFamily: 'monospace' }}>{netInfo.url}</div>
                        </div>
                        <button onClick={() => navigator.clipboard.writeText(netInfo.url)} className="btn-primary"
                            style={{ padding: '6px 12px', fontSize: '0.75rem', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Copy size={12} /> {t('settings.copy')}
                        </button>
                    </div>
                    {/* All Interfaces */}
                    {netInfo.allInterfaces?.length > 0 && (
                        <div style={{ background: 'rgba(0,0,0,0.15)', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('settings.allNetworkInterfaces')}</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {netInfo.allInterfaces.map((iface, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderRadius: '6px', background: iface.address === netInfo.lanIp ? 'rgba(59,130,246,0.1)' : 'transparent', border: iface.address === netInfo.lanIp ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent' }}>
                                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{iface.name}</span>
                                        <span style={{ fontSize: '0.85rem', fontFamily: 'monospace', fontWeight: 600, color: iface.address === netInfo.lanIp ? '#60a5fa' : (iface.address.startsWith('169.254.') ? '#ef4444' : '#e2e8f0') }}>
                                            {iface.address}
                                            {iface.address === netInfo.lanIp && <Check size={12} style={{ marginLeft: 6, color: '#10b981' }} />}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    <div style={{ background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {/* Section header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#10b981', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Server size={15} /> {t('settings.staticIpConfig', 'Adapter Configuration')}
                            </div>
                            <button onClick={() => setShowNetInfo(v => !v)}
                                style={{ padding: '3px 10px', fontSize: '0.72rem', fontWeight: 700, borderRadius: '6px', border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.08)', color: '#10b981', cursor: 'pointer' }}>
                                {showNetInfo ? '▲' : '▼'} {t('settings.staticIpInfoTip', 'How does this work?')}
                            </button>
                        </div>
                        {showNetInfo && (
                            <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: '8px', padding: '12px', fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.8 }}>
                                <div style={{ fontWeight: 700, color: '#10b981', marginBottom: '6px' }}>ℹ️ {t('settings.staticIpInfoTitle', 'How Static IP Works')}</div>
                                <ol style={{ margin: 0, paddingLeft: '1.2em' }}>
                                    <li>{t('settings.staticIpStep1', 'Select the network interface this server is connected to (usually Ethernet).')}</li>
                                    <li>{t('settings.staticIpStep2', 'Choose Static, then enter the IP address you want this machine to always use.')}</li>
                                    <li>{t('settings.staticIpStep3', 'Set the subnet mask (usually 255.255.255.0), default gateway (your router IP), and DNS servers.')}</li>
                                    <li>{t('settings.staticIpStep4', 'Click Apply. The adapter reconfigures immediately — your browser connection may drop.')}</li>
                                    <li>{t('settings.staticIpStep5', 'Reconnect by navigating to the new IP address shown in the confirmation message.')}</li>
                                </ol>
                                <div style={{ marginTop: '8px', color: '#f59e0b', fontWeight: 600 }}>⚠ {t('settings.staticIpAdminNote', 'Requires Trier OS server to be running as Administrator (Windows) or root (Linux).')}</div>
                            </div>
                        )}

                        {/* Interface + Mode row */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                            <div>
                                {fieldLabel(t('settings.networkInterface', 'Network Interface'))}
                                <select value={staticIface} onChange={e => setStaticIface(e.target.value)} style={{ ...inputStyle(), appearance: 'none' }}>
                                    <option value="">{t('settings.selectInterface', '— select interface —')}</option>
                                    {(netInfo.allInterfaces || []).map(iface => (
                                        <option key={iface.name} value={iface.name}>{iface.name} — {iface.address}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                {fieldLabel(t('settings.addressMode', 'Address Mode'))}
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {['dhcp', 'static'].map(mode => (
                                        <button key={mode} onClick={() => setStaticMode(mode)} style={{
                                            flex: 1, padding: '10px', fontSize: '0.8rem', fontWeight: 700, borderRadius: '8px', border: '2px solid', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em', transition: 'all 0.2s',
                                            borderColor: staticMode === mode ? (mode === 'static' ? '#10b981' : '#3b82f6') : 'rgba(255,255,255,0.08)',
                                            background: staticMode === mode ? (mode === 'static' ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.15)') : 'rgba(255,255,255,0.03)',
                                            color: staticMode === mode ? (mode === 'static' ? '#10b981' : '#3b82f6') : '#475569'
                                        }}>{mode}</button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* IP + Subnet — static mode only */}
                        {staticMode === 'static' && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                <div>
                                    {fieldLabel(t('settings.ipAddress', 'IP Address'))}
                                    <input type="text" value={staticIp} onChange={e => setStaticIp(e.target.value)} placeholder="192.168.1.100" style={inputStyle()} />
                                </div>
                                <div>
                                    {fieldLabel(t('settings.subnetMask', 'Subnet Mask'))}
                                    <input type="text" value={staticSubnet} onChange={e => setStaticSubnet(e.target.value)} placeholder="255.255.255.0" style={inputStyle()} />
                                </div>
                            </div>
                        )}

                        {/* Gateway & DNS — always visible */}
                        <div style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '10px', padding: '14px' }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#818cf8', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                {t('settings.gatewayDnsHeading', 'Gateway & DNS')}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
                                <div>
                                    {fieldLabel(t('settings.defaultGateway', 'Default Gateway'))}
                                    <input type="text" value={staticGateway} onChange={e => setStaticGateway(e.target.value)} placeholder="192.168.1.1" style={inputStyle('#818cf8')} />
                                </div>
                                <div>
                                    {fieldLabel(t('settings.primaryDns', 'Primary DNS'))}
                                    <input type="text" value={staticDns1} onChange={e => setStaticDns1(e.target.value)} placeholder="8.8.8.8" style={inputStyle('#818cf8')} />
                                </div>
                                <div>
                                    {fieldLabel(t('settings.secondaryDns', 'Secondary DNS'))}
                                    <input type="text" value={staticDns2} onChange={e => setStaticDns2(e.target.value)} placeholder="8.8.4.4" style={inputStyle('#818cf8')} />
                                </div>
                            </div>
                        </div>

                        {/* Apply */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <button onClick={handleApplyStaticIp}
                                disabled={applyingStatic || !staticIface || (staticMode === 'static' && (!staticIp.trim() || !staticSubnet.trim()))}
                                style={{ padding: '10px 28px', fontSize: '0.9rem', fontWeight: 700, borderRadius: '8px', border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px', opacity: (applyingStatic || !staticIface || (staticMode === 'static' && (!staticIp.trim() || !staticSubnet.trim()))) ? 0.45 : 1, transition: 'opacity 0.2s' }}>
                                {applyingStatic ? <RefreshCw size={15} className="spinning" /> : <Save size={15} />}
                                {t('settings.applyNetworkConfig', 'Apply')}
                            </button>
                            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>⚠ {t('settings.staticIpWarning', 'Connection may drop — reconnect at the new IP.')}</span>
                        </div>
                        {staticMsg && (
                            <div style={{ padding: '10px 14px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 600, background: staticMsg.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: staticMsg.ok ? '#10b981' : '#ef4444', border: `1px solid ${staticMsg.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
                                {staticMsg.text}
                            </div>
                        )}
                    </div>

                    {/* Manual Override */}
                    <div style={{ background: 'rgba(245,158,11,0.04)', padding: '14px', borderRadius: '10px', border: '1px solid rgba(245,158,11,0.2)' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f59e0b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Settings size={14} /> {t('settings.manualAddressOverride', 'Manual Address Override')}
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 10px 0', lineHeight: 1.5 }}>
                            {t('settings.manualAddressOverrideDesc', 'If auto-detection picks the wrong IP, set your server\'s correct IP or hostname here.')}
                        </p>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input type="text" value={overrideAddr} onChange={e => setOverrideAddr(e.target.value)}
                                placeholder={t('settings.eg1921681100OrMyserverlocalPlaceholder')}
                                style={{ flex: 1, padding: '8px 12px', fontSize: '0.85rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '6px', color: '#fff', fontFamily: 'monospace' }} />
                            <button onClick={handleSaveOverride} disabled={saving || !overrideAddr.trim()} className="btn-primary"
                                style={{ padding: '8px 16px', fontSize: '0.8rem', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, opacity: (!overrideAddr.trim() || saving) ? 0.5 : 1 }}>
                                <Save size={14} /> {t('settings.save')}
                            </button>
                            {netInfo.source === 'admin_override' && (
                                <button onClick={handleClearOverride} disabled={saving} className="btn-primary"
                                    style={{ padding: '8px 16px', fontSize: '0.8rem', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <X size={14} /> {t('settings.clear', 'Clear')}
                                </button>
                            )}
                        </div>
                        {saveMsg && <div style={{ marginTop: '8px', padding: '8px 12px', borderRadius: '6px', fontSize: '0.8rem', background: saveMsg.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: saveMsg.ok ? '#10b981' : '#ef4444' }}>{saveMsg.text}</div>}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '20px' }}>
                        <span>{t('settings.hostname')} <strong style={{ color: '#e2e8f0' }}>{netInfo.hostname}</strong></span>
                        <span>{t('settings.port')} <strong style={{ color: '#e2e8f0' }}>{netInfo.port}</strong></span>
                    </div>
                </div>
            )}
        </div>
    );
}

function SettingsView({
    selectedPlant,
    plants,
    handleBackup,
    setIsTaskListOpen
}) {
    const currentPlant = plants.find(p => p.id === selectedPlant) || { id: selectedPlant, label: selectedPlant };
    const userRole = localStorage.getItem('userRole');
    const canImport = localStorage.getItem('canImport') === 'true';
    const canSAP = localStorage.getItem('canSAP') === 'true';
    const canSensorConfig = localStorage.getItem('canSensorConfig') === 'true';
    const canSensorThresholds = localStorage.getItem('canSensorThresholds') === 'true';
    const canSensorView = localStorage.getItem('canSensorView') === 'true';
    const isAdminOrCreator = userRole === 'it_admin' || userRole === 'creator';
    // Sensor Config/Thresholds restricted to management roles — technicians and supervisors can only VIEW
    const isManagementRole = ['maintenance_manager', 'plant_manager', 'general_manager', 'it_admin', 'creator'].includes(userRole) || localStorage.getItem('PF_USER_IS_CREATOR') === 'true';
    const hasSensorAccess = canSensorConfig || canSensorThresholds || canSensorView || isAdminOrCreator;
    const { t, lang, setLang, LANGUAGES } = useTranslation();
    
    const [showSAP, setShowSAP] = useState(false);

    const [showOnboarding, setShowOnboarding] = useState(false);
    const [exportPlant, setExportPlant] = useState(selectedPlant);
    const [isExporting, setIsExporting] = useState(false);
    const [isBackingUp, setIsBackingUp] = useState(false);
    const [shopFloorMode, setShopFloorMode] = useState(localStorage.getItem('PM_SHOP_FLOOR_MODE') === 'true');
    const [branding, setBranding] = useState({ dashboardLogo: null, documentLogo: null });
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);
    const [settingsCategory, setSettingsCategory] = useState(null); // 'account' | 'desktop' | 'monitoring' | 'reports' | null

    // ── Auto-open section from Mission Control tile navigation ──
    React.useEffect(() => {
        const openSection = (section) => {
            if (section === 'governance') {
                setSettingsCategory('reports');
            }
        };
        // Check URL hash on mount
        const hash = window.location.hash.replace('#', '');
        if (hash) openSection(hash);
        // Listen for settings-section event from Mission Control
        const handler = (e) => openSection(e.detail);
        window.addEventListener('settings-section', handler);
        return () => {
            window.removeEventListener('settings-section', handler);
            if (window.location.hash) window.location.hash = '';
        };
    }, []);

    React.useEffect(() => {
        fetchBranding();
    }, []);

    const fetchBranding = async () => {
        try {
            const res = await fetch('/api/branding');
            const data = await res.json();
            setBranding(data);
        } catch (err) { console.error('Failed to fetch branding'); }
    };

    const handleLogoUpload = async (e, logoType = 'dashboard') => {
        const file = e.target.files[0];
        if (!file) return;

        setIsUploadingLogo(true);
        const formData = new FormData();
        formData.append('logo', file);

        try {
            const res = await fetch('/api/branding/logo/' + logoType, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                setBranding(data.settings);
                window.dispatchEvent(new CustomEvent('trier-branding-update', { detail: data.settings }));
            } else {
                window.trierToast?.error(data.error || t('settings.failedToUploadLogo', 'Failed to upload logo'));
            }
        } catch (err) {
            window.trierToast?.error(t('settings.errorUploadingLogo', 'Error uploading logo'));
        } finally {
            setIsUploadingLogo(false);
        }
    };

    const resetLogo = async (logoType = 'dashboard') => {
        if (!await confirm(t('settings.revertToDefaultLogoConfirm', 'Revert to default logo for this slot?'))) return;
        try {
            const res = await fetch('/api/branding/logo/' + logoType, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                setBranding(data.settings);
                window.dispatchEvent(new CustomEvent('trier-branding-update', { detail: data.settings }));
            }
        } catch (err) { window.trierToast?.error(t('settings.failedToResetLogo', 'Failed to reset logo')); }
    };

    const toggleShopFloorMode = () => {
        const newVal = !shopFloorMode;
        setShopFloorMode(newVal);
        localStorage.setItem('PM_SHOP_FLOOR_MODE', newVal);
        if (newVal) document.body.classList.add('shop-floor-mode');
        else document.body.classList.remove('shop-floor-mode');
    };

    const [isReindexing, setIsReindexing] = useState(false);
    const [isVacuuming, setIsVacuuming] = useState(false);

    const handleReindex = async () => {
        setIsReindexing(true);
        try {
            const res = await fetch('/api/maintenance/reindex', { method: 'POST' });
            const data = await res.json();
            if (data.success) window.trierToast?.success(t('settings.masterRegistryUpdated', 'Master Registry successfully updated.'));
        } catch (err) { window.trierToast?.error(t('settings.reindexingFailed', 'Re-indexing failed.')); }
        finally { setIsReindexing(false); }
    };

    const handleVacuum = async () => {
        if (!await confirm(t('settings.deepCleanConfirm', 'This will perform a "Deep Clean" of the Master Registry to reclaim disk space. Continue?'))) return;
        setIsVacuuming(true);
        try {
            const res = await fetch('/api/maintenance/vacuum', { method: 'POST' });
            const data = await res.json();
            if (data.success) window.trierToast?.success(t('settings.databaseCompactionComplete', 'Database compaction complete. File size optimized.'));
        } catch (err) { window.trierToast?.error(t('settings.compactionFailed', 'Compaction failed.')); }
        finally { setIsVacuuming(false); }
    };

    // Apply initially
    useEffect(() => {
        if (shopFloorMode) document.body.classList.add('shop-floor-mode');
        else document.body.classList.remove('shop-floor-mode');
    }, []);

    const handleExport = async () => {
        setIsExporting(true);
        const isCreator = localStorage.getItem('PF_USER_IS_CREATOR') === 'true';
        const username = localStorage.getItem('currentUser') || ''; 
        const token = localStorage.getItem('authToken') || '';
        const url = `/api/database/export?role=${userRole}&is_creator=${isCreator}&plantId=${exportPlant}&username=${encodeURIComponent(username)}&token=${token}`;
        
        try {
            const response = await fetch(url);
            if (!response.ok) {
                const text = await response.text();
                window.trierToast?.error(`${t('settings.exportFailed', 'Export failed')}: ${text}`);
                setIsExporting(false);
                return;
            }
            
            // Trigger download via blob to keep it inline
            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = `${exportPlant}_Maintenance.db`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(downloadUrl);
        } catch (err) {
            console.error('Export error:', err);
            window.trierToast?.error(t('settings.exportRequestFailed', 'Export request failed. Check network connectivity.'));
        } finally {
            setIsExporting(false);
        }
    };

    const triggerBackup = () => {
        setIsBackingUp(true);
        // Pass the specific plant to handleBackup if we want to backup a specific node
        // For now App handleBackup uses current app context, but we can pass headers here
        fetch('/api/database/backup', {
            method: 'POST',
            headers: {
                'x-plant-id': exportPlant,
                'x-user-role': userRole,
                'x-is-creator': localStorage.getItem('PF_USER_IS_CREATOR'),
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) window.trierToast?.success(`${t('settings.nodeBackedUpTo', 'Node')} [${exportPlant}] ${t('settings.backedUpTo', 'backed up to:')} ${data.file}`).catch(e => console.warn('[SettingsView]', e));
            else window.trierToast?.error(`${t('settings.backupError', 'Backup error')}: ${data.error}`);
        })
        .catch(() => window.trierToast?.error(t('settings.failedToExecuteBackup', 'Failed to execute backup request.')))
        .finally(() => setIsBackingUp(false));
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', overflowY: 'auto', paddingRight: '10px', paddingBottom: '100px' }}>
            {/* ═══ SETTINGS HUB HEADER ═══ */}
            <div className="glass-card" style={{ padding: 'var(--card-padding)', flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
                        <Settings size={28} color="var(--primary)" /> {t('settings.systemSettings')}
                    </h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <TakeTourButton tourId="settings" />
                    <div className="badge badge-purple" style={{ fontSize: '0.8rem' }}>{t('misc.node')}: {currentPlant.label}</div>
                    </div>
                </div>
            </div>

            {/* ═══ SETTINGS 4-CATEGORY HUB GRID ═══ */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'clamp(10px, 2vw, 20px)' }}>
                {[
                    { key: 'account', icon: <Shield size={24} color="#fff" />, title: t('settings.catAccountTitle', 'My Account & Preferences'), count: t('settings.catAccount3Panels', '3 panels'), color: '#6366f1', desc: t('settings.catAccountDesc', 'Change your password, set language preference, replay the onboarding tour, and configure display options.'), tags: [t('settings.tagPassword', 'Password'), t('settings.tagLanguage', 'Language'), t('settings.tagTour', 'Tour'), t('settings.tagShopFloor', 'Shop Floor')] },
                    { key: 'desktop', icon: <Bell size={24} color="#fff" />, title: t('settings.catNotificationsTitle', 'Notifications & Escalation'), count: t('settings.catNotifications2Panels', '2 panels'), color: '#3b82f6', desc: t('settings.catNotificationsDesc', 'Configure notification preferences and auto-escalation rules. P1 WOs not started? Auto-escalate to management.'), tags: [t('settings.tagEmailAlerts', 'Email Alerts'), t('settings.tagAutoEscalation', 'Auto-Escalation'), t('settings.tagNotifications', 'Notifications')] },
                    { key: 'monitoring', icon: <Zap size={24} color="#fff" />, title: t('settings.catMonitoringTitle', 'Monitoring, Compliance & Safety'), count: hasSensorAccess ? t('settings.catMonitoring4Panels', '4 panels') : t('settings.catMonitoring3Panels', '3 panels'), color: '#10b981', desc: t('settings.catMonitoringDesc', 'SCADA/PLC sensor gateway, regulatory compliance, energy/sustainability dashboards, and LOTO digital permits.'), tags: [t('settings.tagScada', 'SCADA'), t('settings.tagCompliance', 'Compliance'), t('settings.tagEnergy', 'Energy'), t('settings.tagLoto', 'LOTO'), t('settings.tagSensors', 'Sensors')] },
                    { key: 'reports', icon: <ClipboardList size={24} color="#fff" />, title: t('settings.catReportsTitle', 'Reports & Analytics'), count: t('settings.catReports1Panel', '1 panel'), color: '#f59e0b', desc: t('settings.catReportsDesc', 'Build custom reports with drag-and-drop fields, filters, and multiple output formats including PDF and CSV.'), tags: [t('settings.tagReportBuilder', 'Report Builder'), t('settings.tagPdf', 'PDF'), t('settings.tagCsv', 'CSV'), t('settings.tagAnalytics', 'Analytics')] }
                ].map(cat => (
                    <button key={cat.key} onClick={() => setSettingsCategory(cat.key)} title={`${t('settings.openCategory', 'Open')} ${cat.title}`} style={{
                        background: `linear-gradient(135deg, ${cat.color}14 0%, ${cat.color}08 100%)`,
                        border: `1px solid ${cat.color}40`, borderRadius: '16px', padding: 'clamp(14px, 2vw, 30px)',
                        cursor: 'pointer', textAlign: 'left', transition: 'all 0.3s ease',
                        display: 'flex', flexDirection: 'column', gap: '10px'
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
                            {cat.tags.map(tg => (
                                <span key={tg} style={{ padding: '2px 8px', borderRadius: '12px', background: `${cat.color}1a`, color: cat.color, fontSize: '0.6rem', fontWeight: 600 }}>{tg}</span>
                            ))}
                        </div>
                    </button>
                ))}
            </div>

            {/* ═══ SETTINGS CATEGORY PANELS ═══ */}

            {/* CAT 1: My Account & Preferences */}
            {settingsCategory === 'account' && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.95)', zIndex: 9998, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '15px 30px', background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(79,70,229,0.04))', borderBottom: '2px solid rgba(99,102,241,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                        <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: 0, color: '#fff' }}><div style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', padding: '8px', borderRadius: '10px' }}><Shield size={20} color="#fff" /></div> {t('settings.myAccountPreferences')}</h2>
                        <button onClick={() => setSettingsCategory(null)} className="btn-nav" title={t('settings.returnToSettingsHubTip')}>{t('settings.backToHub')}</button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 30px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {/* ── Profile Card with Role Avatar ── */}
                        <div className="glass-card" style={{ padding: 'var(--card-padding)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '24px', padding: '10px 0' }}>
                                <RoleAvatar role={userRole || 'employee'} size={90} glow />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#e2e8f0', letterSpacing: '-0.02em' }}>
                                        {localStorage.getItem('currentUser') || 'User'}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                                        <span style={{
                                            padding: '3px 12px', borderRadius: '12px',
                                            background: `${(getAvatarForRole(userRole) || {}).accent || '#6366f1'}20`,
                                            color: (getAvatarForRole(userRole) || {}).accent || '#6366f1',
                                            fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em'
                                        }}>
                                            {(getAvatarForRole(userRole) || {}).label || 'Staff'}
                                        </span>
                                        <span style={{ color: '#475569' }}>·</span>
                                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                                            {currentPlant.label || selectedPlant}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '8px' }}>
                                        {t('settings.avatarAssignedByRole', 'Your avatar is assigned based on your role. Contact your IT admin to change your role assignment.')}
                                    </div>
                                </div>
                            </div>
                        </div>
                        {/* Password Change */}
                        <div className="glass-card" style={{ padding: 'var(--card-padding)' }}>
                            <PasswordChangeView />
                        </div>
                        {/* Language Selector */}
                        <div className="glass-card" style={{ padding: 'var(--card-padding)' }}>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '0 0 15px 0', fontSize: '1.1rem' }}>🌐 {t('settings.languageLabel')}</h3>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                {LANGUAGES.map(l => (
                                    <button key={l.code}
                                        onClick={() => { setLang(l.code); window.location.reload(); }}
                                        style={{
                                            padding: '8px 18px', borderRadius: '16px', border: 'none', cursor: 'pointer',
                                            fontWeight: 700, fontSize: '0.8rem',
                                            background: lang === l.code ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
                                            color: lang === l.code ? '#818cf8' : 'var(--text-muted)',
                                            borderBottom: lang === l.code ? '2px solid #6366f1' : '2px solid transparent',
                                            transition: 'all 0.2s'
                                        }}
                                        title={l.label}
                                    >{l.flag} {l.code.toUpperCase()}</button>
                                ))}
                            </div>
                        </div>
                        {/* Replay Onboarding Tour */}
                        <div className="glass-card" style={{ padding: 'var(--card-padding)' }}>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '0 0 15px 0', fontSize: '1.1rem' }}>🎓 {t('settings.onboardingTourHeading', 'Onboarding Tour')}</h3>
                            <ReplayTourButton />
                        </div>
                    </div>
                </div>
            )}

            {/* CAT 2: Desktop & Notifications */}
            {settingsCategory === 'desktop' && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.95)', zIndex: 9998, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '15px 30px', background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(37,99,235,0.04))', borderBottom: '2px solid rgba(59,130,246,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                        <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: 0, color: '#fff' }}><div style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)', padding: '8px', borderRadius: '10px' }}><Bell size={20} color="#fff" /></div> {t('settings.notifications')}</h2>
                        <button onClick={() => setSettingsCategory(null)} className="btn-nav" title={t('settings.returnToSettingsHubTip')}>{t('settings.backToHub')}</button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 30px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <UserNotificationsPanel />
                        {isManagementRole && (
                            <div className="glass-card" style={{ padding: 'var(--card-padding)' }}>
                                <EscalationRulesPanel />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* CAT 3: Monitoring & Compliance */}
            {settingsCategory === 'monitoring' && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.95)', zIndex: 9998, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '15px 30px', background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(5,150,105,0.04))', borderBottom: '2px solid rgba(16,185,129,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                        <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: 0, color: '#fff' }}><div style={{ background: 'linear-gradient(135deg, #10b981, #059669)', padding: '8px', borderRadius: '10px' }}><Zap size={20} color="#fff" /></div> {t('settings.monitoringCompliance')}</h2>
                        <button onClick={() => setSettingsCategory(null)} className="btn-nav" title={t('settings.returnToSettingsHubTip')}>{t('settings.backToHub')}</button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 30px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {hasSensorAccess && (
                            <div className="glass-card" style={{ padding: 'var(--card-padding)' }}>
                                <SensorDashboard 
                                    canConfig={(canSensorConfig || isAdminOrCreator) && isManagementRole}
                                    canThresholds={(canSensorThresholds || isAdminOrCreator) && isManagementRole}
                                    canView={canSensorView || isAdminOrCreator}
                                    plantId={selectedPlant}
                                    plantLabel={currentPlant.label}
                                />
                            </div>
                        )}
                        {isAdminOrCreator && (
                            <div className="glass-card" style={{ padding: 'var(--card-padding)' }}>
                                <ComplianceTracker plantId={selectedPlant} plantLabel={currentPlant.label} />
                            </div>
                        )}
                        {(isAdminOrCreator || userRole === 'manager') && (
                            <div className="glass-card" style={{ padding: 'var(--card-padding)' }}>
                                <EnergyDashboard plantId={selectedPlant} plantLabel={currentPlant.label} />
                            </div>
                        )}
                        <div className="glass-card" style={{ padding: 'var(--card-padding)' }}>
                            <LotoPanel />
                        </div>
                    </div>
                </div>
            )}

            {/* CAT 4: Reports & Analytics */}
            {settingsCategory === 'reports' && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.95)', zIndex: 9998, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '15px 30px', background: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(217,119,6,0.04))', borderBottom: '2px solid rgba(245,158,11,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                        <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: 0, color: '#fff' }}><div style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', padding: '8px', borderRadius: '10px' }}><ClipboardList size={20} color="#fff" /></div> {t('settings.reportsAnalytics')}</h2>
                        <button onClick={() => setSettingsCategory(null)} className="btn-nav" title={t('settings.returnToSettingsHubTip')}>{t('settings.backToHub')}</button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 30px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div className="glass-card" style={{ padding: 'var(--card-padding)' }}>
                            <ReportBuilder plantId={selectedPlant} />
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════ */}
            {showSAP && <SAPIntegrationView onClose={() => setShowSAP(false)} />}
            {showOnboarding && <OnboardingWizard onClose={() => setShowOnboarding(false)} plantId={currentPlant.id} plantLabel={currentPlant.label} mode="audit" />}
        </div>
    );
}

// ── Webhook Integration Panel (Task 2.8) ──────────────────────────────────
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
        { key: 'notify_critical_wo', label: t('settings.notifyCriticalWos', '🚨 Critical WOs'), color: '#ef4444' },
        { key: 'notify_pm_due', label: t('settings.notifyPmDue', '🔧 PM Due'), color: '#f59e0b' },
        { key: 'notify_completion', label: t('settings.notifyCompletions', '✅ Completions'), color: '#10b981' },
        { key: 'notify_sensor', label: t('settings.notifySensors', '🌡️ Sensors'), color: '#6366f1' }
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
                    title={showAdd ? t('settings.cancelAddWebhook', 'Cancel adding a new webhook') : t('settings.addAWebhookIntegration', 'Add a new webhook integration')}
                    style={{ padding: '6px 14px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                    {showAdd ? <><X size={14} /> {t('settings.cancel')}</> : <><Plus size={14} /> {t('settings.addWebhook')}</>}
                </button>
            </div>

            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '15px' }}>
                {t('settings.webhookDesc', 'Receive real-time alerts in Slack, Teams, or Discord when critical events occur.')}
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
                    {t('settings.noWebhooksConfigured', 'No webhooks configured. Click "Add Webhook" to connect Slack, Teams, or Discord.')}
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
                                    <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{wh.label || t('settings.unnamed', 'Unnamed')}</span>
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
                                        {testResults[wh.id] === 'sending' ? t('settings.testing', 'Testing...') : testResults[wh.id] === 'success' ? t('settings.sent', '✓ Sent!') : testResults[wh.id] === 'failed' ? t('settings.failed', '✗ Failed') : t('settings.test', 'Test')}
                                    </button>
                                    <button 
                                        onClick={() => toggleEnabled(wh.id, wh.enabled)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: wh.enabled ? '#10b981' : 'var(--text-muted)', padding: '4px' }}
                                        title={wh.enabled ? t('settings.clickToDisable', 'Click to disable') : t('settings.clickToEnable', 'Click to enable')}
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
                                        title={wh[nf.key] ? `${t('settings.disable', 'Disable')} ${nf.label} ${t('settings.notificationsForThisWebhook', 'notifications for this webhook')}` : `${t('settings.enable', 'Enable')} ${nf.label} ${t('settings.notificationsForThisWebhook', 'notifications for this webhook')}`}
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
                                    {t('settings.lastFired', 'Last fired:')} {new Date(wh.last_triggered).toLocaleString()} — {wh.last_status === 'ok' ? '✅' : '⚠️'} {wh.last_status}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── AI Configuration Panel (Feature 5) ───────────────────────────────────────
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
                {t('settings.aiProviderDesc', 'Configure your AI provider for SOP generation. API keys are stored locally, never transmitted externally except to the provider.')}
            </p>

            {loading ? <div style={{ color: 'var(--text-muted)', padding: '20px', textAlign: 'center' }}>{t('settings.loading')}</div> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>{t('settings.provider')}</label>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            {['openai', 'anthropic', 'ollama'].map(p => (
                                <button key={p} onClick={() => setConfig({ ...config, provider: p, model: models[p][0] })}
                                    title={`${t('settings.switchTo', 'Switch to')} ${p === 'openai' ? 'OpenAI' : p === 'anthropic' ? 'Anthropic Claude' : 'Ollama (local)'} ${t('settings.asTheAiProvider', 'as the AI provider')}`}
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
                            {config.provider === 'ollama' ? t('settings.modelLocal', 'Model (local)') : t('settings.apiKey', 'API Key')}
                        </label>
                        {config.provider !== 'ollama' ? (
                            <input type="password" placeholder={config.api_key || t('settings.enterApiKey', 'Enter API key...')} value={newKey}
                                onChange={e => setNewKey(e.target.value)}
                                style={{ width: '100%', padding: '8px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '6px', color: '#fff' }}
                                title={t('settings.enterYourAiProviderApiTip')}
                            />
                        ) : (
                            <div style={{ fontSize: '0.8rem', color: '#6366f1', padding: '8px', background: 'rgba(99,102,241,0.05)', borderRadius: '6px' }}>
                                {t('settings.ollamaNoKeyRequired', 'Ollama uses a local model — no API key required. Ensure Ollama is running on port 11434.')}
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
                            {saving ? t('settings.savingEllipsis', 'Saving...') : t('settings.saveConfiguration', 'Save Configuration')}
                        </button>
                        <button onClick={handleTest} className="btn-primary"
                            title={t('settings.testTheAiProviderConnectionTip')}
                            style={{
                                padding: '8px 14px', fontSize: '0.8rem',
                                background: testResult === 'ok' ? 'rgba(16,185,129,0.2)' : testResult === 'fail' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)',
                                color: testResult === 'ok' ? '#10b981' : testResult === 'fail' ? '#ef4444' : '#fff',
                                border: `1px solid ${testResult === 'ok' ? '#10b981' : testResult === 'fail' ? '#ef4444' : 'var(--glass-border)'}`
                            }}>
                            {testResult === 'testing' ? '⏳' : testResult === 'ok' ? `✅ ${t('settings.connected', 'Connected')}` : testResult === 'fail' ? `❌ ${t('settings.failed', '✗ Failed')}` : `🔌 ${t('settings.test', 'Test')}`}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Data Export / Power BI Panel (Task 2.9) ─────────────────────────────────
function DataExportPanel() {
    const { t } = useTranslation();
    const [downloading, setDownloading] = useState(null);

    const exportTypes = [
        { id: 'work-orders', label: t('settings.exportWorkOrders', 'Work Orders'), icon: '📋', color: '#6366f1' },
        { id: 'assets', label: t('settings.exportAssets', 'Assets'), icon: '⚙️', color: '#f59e0b' },
        { id: 'pm-compliance', label: t('settings.exportPmCompliance', 'PM Compliance'), icon: '🔧', color: '#10b981' },
        { id: 'parts-inventory', label: t('settings.exportPartsInventory', 'Parts Inventory'), icon: '📦', color: '#8b5cf6' },
        { id: 'technician-performance', label: t('settings.exportTechnicianMetrics', 'Technician Metrics'), icon: '👷', color: '#ef4444' },
        { id: 'reminder-insights', label: t('settings.exportReminderInsights', 'Reminder Insights'), icon: '💡', color: '#fbbf24' }
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
            window.trierToast?.error(t('settings.downloadFailed', 'Download failed') + ': ' + e.message);
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
            window.trierToast?.error(t('settings.downloadFailed', 'Download failed') + ': ' + e.message);
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
                                title={`${t('settings.download', 'Download')} ${et.label} ${t('settings.dataAsCsv', 'data as CSV')}`}
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
                                title={`${t('settings.download', 'Download')} ${et.label} ${t('settings.dataAsJson', 'data as JSON')}`}
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
                    💡 {t('settings.powerBiConnection', 'Power BI Connection')}
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

// ── High Availability Configuration Panel (Phase 4) ────────────────────────
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
        } catch (e) { setSecondaryHealth({ online: false, error: t('settings.requestFailed', 'Request failed') }); }
        setIsChecking(false);
    };

    const forceSyncNow = async () => {
        setIsSyncing(true);
        try {
            const res = await fetch('/api/ha/sync-now', { method: 'POST', headers });
            const data = await res.json();
            window.trierToast?.info(`${t('settings.syncComplete', 'Sync complete:')} ${data.pushed || 0} ${t('settings.changesPushed', 'changes pushed,')} ${data.errors || 0} ${t('settings.errors', 'errors')}`);
        } catch (e) { window.trierToast?.error(t('settings.syncFailed', 'Sync failed — check server logs')); }
        setIsSyncing(false);
    };

    const isPrimary = haRole === 'primary';
    const roleColor = isPrimary ? '#10b981' : '#f59e0b';
    const roleIcon = isPrimary ? '🟢' : '🟡';
    const roleLabel = isPrimary ? t('settings.primaryMaster', 'Primary (Master)') : t('settings.secondaryReplica', 'Secondary (Replica)');

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
        : t('settings.never', 'Never');
    const totalDbSize = totalDbSizeBytes > 1073741824
        ? `${(totalDbSizeBytes / 1073741824).toFixed(1)} GB`
        : totalDbSizeBytes > 1048576
            ? `${(totalDbSizeBytes / 1048576).toFixed(0)} MB`
            : `${(totalDbSizeBytes / 1024).toFixed(0)} KB`;

    if (loading) return (
        <div className="panel-box" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.04), rgba(16,185,129,0.04))', padding: '20px', borderRadius: '12px', border: '1px solid rgba(59,130,246,0.2)', textAlign: 'center' }}>
            <RefreshCw size={20} className="spinning" style={{ color: '#60a5fa' }} /> {t('settings.loadingHaConfig', 'Loading HA config...')}
        </div>
    );

    return (
        <div className="panel-box" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.04), rgba(16,185,129,0.04))', padding: '20px', borderRadius: '12px', border: '1px solid rgba(59,130,246,0.2)' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Zap size={20} color="#3b82f6" /> {t('settings.highAvailabilityConfiguration', 'High Availability Configuration')}
            </h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '18px', fontSize: '0.82rem', lineHeight: 1.6 }}>
                {t('settings.haConfigDesc', 'Configure server-to-server replication. The Primary (Master) accepts all writes and pushes changes to the Secondary (Replica) for failover protection.')}
            </p>

            {/* ── Role Selector ── */}
            <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>{t('settings.serverRole')}</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {[
                        { value: 'primary', label: `🟢 ${t('settings.primaryMaster', 'Primary (Master)')}`, desc: t('settings.primaryDesc', 'Accepts writes, pushes to replica'), color: '#10b981' },
                        { value: 'secondary', label: `🟡 ${t('settings.secondaryReplica', 'Secondary (Replica)')}`, desc: t('settings.secondaryDesc', 'Read-only, receives from master'), color: '#f59e0b' }
                    ].map(opt => (
                        <button key={opt.value} onClick={() => setHaRole(opt.value)} title={`${t('settings.setThisServerAs', 'Set this server as')} ${opt.label}`} style={{
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
                        {isPrimary ? t('settings.activeAcceptingWrites', 'Active — Accepting Writes') : t('settings.standbyReadOnly', 'Standby — Read Only')}
                    </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    <div style={{ textAlign: 'center', padding: '10px', background: 'rgba(0,0,0,0.15)', borderRadius: '8px' }}>
                        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#e2e8f0' }}>{syncedPlants}/{totalPlants}</div>
                        <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>{t('settings.plantsSynced')}</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '10px', background: 'rgba(0,0,0,0.15)', borderRadius: '8px' }}>
                        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: totalPending > 0 ? '#f59e0b' : '#10b981' }}>{totalPending}</div>
                        <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>{t('settings.pendingChanges')}</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '10px', background: 'rgba(0,0,0,0.15)', borderRadius: '8px' }}>
                        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: replicationLag > 120 ? '#ef4444' : replicationLag > 60 ? '#f59e0b' : '#10b981' }}>
                            {replicationLag > 0 ? `${replicationLag}s` : '0s'}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>{t('settings.replicationLag')}</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '10px', background: 'rgba(0,0,0,0.15)', borderRadius: '8px' }}>
                        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#e2e8f0' }}>{totalEntries}</div>
                        <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>{t('settings.totalLedger')}</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '10px', background: 'rgba(0,0,0,0.15)', borderRadius: '8px' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e2e8f0', fontFamily: 'monospace' }}>
                            {lastSyncDisplay}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>{t('settings.lastSync')}</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '10px', background: 'rgba(0,0,0,0.15)', borderRadius: '8px' }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#e2e8f0' }}>{totalDbSize}</div>
                        <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>{t('settings.totalDbSize')}</div>
                    </div>
                </div>
            </div>

            {/* ── Partner Server Address ── */}
            <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
                    {isPrimary ? t('settings.secondaryServerAddress', 'SECONDARY SERVER ADDRESS') : t('settings.primaryServerAddress', 'PRIMARY SERVER ADDRESS')}
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                        type="text"
                        value={partnerAddress}
                        onChange={e => setPartnerAddress(e.target.value)}
                        placeholder={isPrimary ? t('settings.replicaServerPlaceholder', 'http://replica-server.local:3000') : t('settings.primaryServerPlaceholder', 'http://primary-server.local:3000')}
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
                        {isChecking ? t('settings.checking', 'Checking...') : secondaryHealth?.online ? `${t('settings.online', 'Online')} (${secondaryHealth.latencyMs}ms)` : t('settings.test', 'Test')}
                    </button>
                </div>
                {secondaryHealth && !secondaryHealth.online && (
                    <div style={{ marginTop: '6px', fontSize: '0.72rem', color: '#ef4444' }}>
                        ❌ {t('settings.partnerUnreachable', 'Partner unreachable:')} {secondaryHealth.error}
                    </div>
                )}
            </div>

            {/* ── Pairing Key Management ── */}
            <div style={{ marginBottom: '18px', padding: '16px', background: 'rgba(0,0,0,0.15)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '10px', fontWeight: 600 }}>
                    🔐 {t('settings.pairingKey', 'PAIRING KEY')} — {isPrimary ? t('settings.pairingKeyGenerateShare', 'Generate & share with the replica server') : t('settings.pairingKeyPasteFromMaster', 'Paste the key from the master server')}
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
                                {isGenerating ? t('settings.generating', 'Generating...') : `🔑 ${t('settings.generatePairingKey', 'Generate Pairing Key')}`}
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
                                    {keyCopied ? <><Check size={14} /> {t('settings.copied')}</> : <><Copy size={14} /> {t('settings.copy')}</>}
                                </button>
                            </div>
                        )}
                        <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '8px' }}>
                            {t('settings.copyKeyToSecondaryDesc', 'Copy this key and paste it into the Secondary server\'s HA configuration to establish trust.')}
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
                                {keyImported ? <><Check size={14} /> {t('settings.imported')}</> : isSaving ? <RefreshCw size={14} className="spinning" /> : <Key size={14} />}
                                {keyImported ? '' : isSaving ? t('settings.savingEllipsis', 'Saving...') : t('settings.importKey', 'Import Key')}
                            </button>
                        </div>
                        {pairingKey === '••••••••••••••••' && (
                            <div style={{ fontSize: '0.7rem', color: '#10b981', marginTop: '6px' }}>
                                ✅ {t('settings.pairingKeyAlreadyConfigured', 'Pairing key is already configured. Import a new one to replace it.')}
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
                    {isSaving ? t('settings.savingEllipsis', 'Saving...') : t('settings.saveConfiguration', 'Save Configuration')}
                </button>
                {isPrimary && (
                    <button onClick={forceSyncNow} disabled={isSyncing} title={t('settings.immediatelyPushAllPendingChangesTip')} style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        background: isSyncing ? 'var(--glass-border)' : 'rgba(59,130,246,0.12)',
                        color: '#60a5fa', border: '1px solid rgba(59,130,246,0.25)', borderRadius: '10px',
                        padding: '12px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer'
                    }}>
                        {isSyncing ? <RefreshCw size={16} className="spinning" /> : <RefreshCw size={16} />}
                        {isSyncing ? t('settings.syncing', 'Syncing...') : `🔄 ${t('settings.forceSyncNow', 'Force Sync Now')}`}
                    </button>
                )}
            </div>

            {/* ── Failover / Promote Button (Task 4.3) ── */}
            <div style={{ marginBottom: '14px' }}>
                {!showFailover ? (
                    <button onClick={() => setShowFailover(true)} title={isPrimary ? t('settings.demoteToSecondaryTip', 'Demote this server to Secondary (read-only replica)') : t('settings.promoteToprimaryTip', 'Promote this server to Primary (accepts writes)')} style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        background: 'rgba(239,68,68,0.08)', color: '#f87171',
                        border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px',
                        padding: '10px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer'
                    }}>
                        <Zap size={16} /> {isPrimary ? `⚠️ ${t('settings.demoteToSecondary', 'Demote to Secondary')}` : `⚠️ ${t('settings.promoteToPrimary', 'Promote to Primary')}`}
                    </button>
                ) : (
                    <div style={{ background: 'rgba(239,68,68,0.06)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(239,68,68,0.25)' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f87171', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Zap size={16} /> {t('settings.manualFailoverConfirm', 'Manual Failover — Confirm')}
                        </div>
                        <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '12px', lineHeight: 1.5 }}>
                            {isPrimary
                                ? t('settings.demoteDesc', 'This will demote this server to Secondary. It will stop accepting writes and become a read-only replica. The other server must be promoted to Primary.')
                                : t('settings.promoteDesc', 'This will promote this server to Primary. It will begin accepting writes and pushing to the other server. The other server should be demoted.')}
                            <br /><strong style={{ color: '#f87171' }}>{t('settings.aServerRestartIsRequired')}</strong>
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
                                } catch (e) { window.trierToast?.error(t('settings.failoverRequestFailed', 'Failover request failed')); }
                                setIsPromoting(false);
                            }} disabled={!failoverPassword || isPromoting} title={t('settings.executeTheFailoverThisWillTip')} style={{
                                flex: 1, padding: '10px', borderRadius: '8px', cursor: failoverPassword ? 'pointer' : 'not-allowed',
                                background: isPromoting ? 'var(--glass-border)' : 'linear-gradient(135deg, #ef4444, #dc2626)',
                                border: 'none', color: '#fff', fontSize: '0.85rem', fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                            }}>
                                {isPromoting ? <RefreshCw size={14} className="spinning" /> : <Zap size={14} />}
                                {isPromoting ? t('settings.processing', 'Processing...') : `⚠️ ${t('settings.confirmFailover', 'Confirm Failover')}`}
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
                        ? t('settings.haInfoPrimary', 'As Primary, this server pushes all data changes to the Secondary every 60 seconds. Generate a pairing key above and share it with your replica server.')
                        : t('settings.haInfoSecondary', 'As Secondary, this server receives changes from the Primary. Import the pairing key generated on the master, then enter the master\'s address above.')}
                </span>
            </div>
        </div>
    );
}

export default SettingsView;
