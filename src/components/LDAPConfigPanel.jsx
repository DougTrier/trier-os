// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — LDAP / Active Directory Configuration Panel
 * ========================================================
 * Admin UI for configuring enterprise directory integration with LDAP or
 * Active Directory. Toggle-switch design: OFF = zero external dependencies
 * (native Trier OS auth); ON = LDAP-first authentication flow.
 *
 * KEY FEATURES:
 *   - Enable/Disable toggle: instantly switches between native and LDAP auth
 *   - Configuration fields: server URL, port, base DN, bind DN, bind password
 *   - TLS/STARTTLS option with certificate verification toggle
 *   - Test Connection button: live validation of LDAP credentials before save
 *   - User attribute mapping: configure which LDAP fields map to Trier OS fields
 *     (displayName, email, department, plant, role group)
 *   - Group-to-role mapping: map LDAP security groups to Trier OS roles
 *   - Sync on login: user profile updated from LDAP on every successful login
 *
 * AUTHENTICATION FLOW (when enabled):
 *   1. User submits credentials at LoginView
 *   2. Server attempts LDAP bind with user DN + password
 *   3. On success: JWT issued with role derived from group mapping
 *   4. On failure: falls back to native Trier OS password check (configurable)
 *
 * API CALLS:
 *   GET  /api/settings/ldap         — Load current LDAP configuration
 *   POST /api/settings/ldap         — Save LDAP configuration
 *   POST /api/settings/ldap/test    — Test LDAP connection with saved settings
 */
import React, { useState, useEffect } from 'react';
import { Globe, Shield, RefreshCw, Check, X, AlertTriangle, Zap, Users } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';
import { useTranslation } from '../i18n/index.jsx';

export default function LDAPConfigPanel() {
    const { t } = useTranslation();
    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [testResult, setTestResult] = useState(null);
    const [syncResult, setSyncResult] = useState(null);
    const [saveMsg, setSaveMsg] = useState(null);
    const [showPassword, setShowPassword] = useState(false);

    // Role mapping entries
    const [roleMappings, setRoleMappings] = useState([]);

    const TRIER_ROLES = [
        'technician', 'supervisor', 'maintenance_manager', 'plant_manager',
        'general_manager', 'engineer', 'lab_staff', 'it_admin'
    ];

    useEffect(() => { fetchConfig(); }, []);

    const fetchConfig = async () => {
        try {
            const res = await fetch('/api/ldap/config', {
                headers: {  }
            });
            const data = await res.json();
            setConfig(data);
            // Parse role mappings
            try {
                const map = JSON.parse(data.RoleMapping || '{}');
                setRoleMappings(Object.entries(map).map(([group, role]) => ({ group, role })));
            } catch (e) { setRoleMappings([]); }
        } catch (err) {
            console.error('Failed to fetch LDAP config');
        }
        setLoading(false);
    };

    const handleSave = async () => {
        setSaving(true);
        setSaveMsg(null);
        try {
            // Build role mapping object
            const roleMap = {};
            roleMappings.forEach(m => {
                if (m.group.trim()) roleMap[m.group.trim()] = m.role;
            });

            const res = await fetch('/api/ldap/config', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ...config,
                    RoleMapping: JSON.stringify(roleMap)
                })
            });
            const data = await res.json();
            setSaveMsg({ ok: data.success, text: data.message || data.error || 'Saved' });
            if (data.success) fetchConfig();
        } catch (err) {
            setSaveMsg({ ok: false, text: 'Save failed' });
        }
        setSaving(false);
        setTimeout(() => setSaveMsg(null), 5000);
    };

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            const res = await fetch('/api/ldap/test', {
                method: 'POST',
                headers: {  }
            });
            const data = await res.json();
            setTestResult(data);
        } catch (err) {
            setTestResult({ success: false, error: 'Test request failed' });
        }
        setTesting(false);
    };

    const handleSync = async () => {
        setSyncing(true);
        setSyncResult(null);
        try {
            const res = await fetch('/api/ldap/sync', {
                method: 'POST',
                headers: {  }
            });
            const data = await res.json();
            setSyncResult(data);
            if (data.success) fetchConfig(); // refresh last sync time
        } catch (err) {
            setSyncResult({ success: false, error: 'Sync request failed' });
        }
        setSyncing(false);
    };

    const updateConfig = (key, val) => {
        setConfig(prev => ({ ...prev, [key]: val }));
    };

    const addRoleMapping = () => {
        setRoleMappings(prev => [...prev, { group: '', role: 'technician' }]);
    };

    const removeRoleMapping = (i) => {
        setRoleMappings(prev => prev.filter((_, idx) => idx !== i));
    };

    const updateRoleMapping = (i, key, val) => {
        setRoleMappings(prev => prev.map((m, idx) => idx === i ? { ...m, [key]: val } : m));
    };

    if (loading) return <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>Loading LDAP config...</div>;
    if (!config) return <div style={{ padding: '20px', textAlign: 'center', color: '#ef4444' }}>Failed to load LDAP config</div>;

    const inputStyle = {
        width: '100%', padding: '10px 14px', borderRadius: '8px',
        background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
        color: '#e2e8f0', fontSize: '0.85rem', fontFamily: 'monospace'
    };

    const labelStyle = {
        fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: '6px',
        textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block'
    };

    return (
        <div className="panel-box" style={{
            background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '12px',
            border: '1px solid var(--glass-border)', gridColumn: '1 / -1'
        }}>
            {/* Header with Toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: '40px', height: '40px', borderRadius: '10px',
                        background: config.Enabled ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #475569, #334155)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.3s'
                    }}>
                        <Globe size={20} color="#fff" />
                    </div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#e2e8f0' }}>Active Directory / LDAP</h3>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            {config.Enabled ? '● Connected to enterprise directory' : '○ Using local authentication only'}
                        </div>
                    </div>
                </div>
                <button 
                    onClick={() => updateConfig('Enabled', config.Enabled ? 0 : 1)}
                    style={{
                        padding: '10px 24px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                        fontWeight: 700, fontSize: '0.85rem', transition: 'all 0.3s',
                        background: config.Enabled
                            ? 'linear-gradient(135deg, #10b981, #059669)'
                            : 'rgba(255,255,255,0.08)',
                        color: config.Enabled ? '#fff' : '#94a3b8',
                        boxShadow: config.Enabled ? '0 4px 15px rgba(16,185,129,0.3)' : 'none'
                    }}
                    title={config.Enabled ? 'Click to disable LDAP authentication' : 'Click to enable LDAP authentication'}
                >
                    {config.Enabled ? '✓ ENABLED' : 'DISABLED'}
                </button>
            </div>

            {/* Warning Banner */}
            {config.Enabled && (
                <div style={{
                    padding: '12px 16px', borderRadius: '8px', marginBottom: '20px',
                    background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
                    display: 'flex', alignItems: 'flex-start', gap: '10px'
                }}>
                    <AlertTriangle size={18} color="#f59e0b" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ fontSize: '0.8rem', color: '#fbbf24', lineHeight: 1.5 }}>
                        <strong>{t('lDAPConfigPanel.ldapfirstAuthActive')}</strong> When enabled, user login will first attempt LDAP bind against your AD server. If LDAP fails, local auth is used as fallback. Protected accounts (Creator, IT Admin) always use local auth.
                    </div>
                </div>
            )}

            {/* Connection Settings */}
            <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px',
                padding: '20px', background: 'rgba(0,0,0,0.15)', borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.06)'
            }}>
                <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Shield size={16} color="#6366f1" /> Connection Settings
                    </div>
                </div>
                <div>
                    <label style={labelStyle}>LDAP Server Host</label>
                    <input
                        style={inputStyle}
                        value={config.Host || ''}
                        onChange={e => updateConfig('Host', e.target.value)}
                        placeholder={t('lDAPConfigPanel.egDc01companylocalPlaceholder')}
                        title={t('lDAPConfigPanel.activeDirectoryDomainControllerHostnameTip')}
                    />
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                        <label style={labelStyle}>Port</label>
                        <input
                            style={inputStyle}
                            type="number"
                            value={config.Port || 389}
                            onChange={e => updateConfig('Port', parseInt(e.target.value, 10) || 389)}
                            title={t('lDAPConfigPanel.ldapPort389Standard636Tip')}
                        />
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <label style={labelStyle}>Use TLS/SSL</label>
                        <button 
                            onClick={() => updateConfig('UseTLS', config.UseTLS ? 0 : 1)}
                            style={{
                                flex: 1, borderRadius: '8px', border: 'none', cursor: 'pointer',
                                background: config.UseTLS ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)',
                                color: config.UseTLS ? '#10b981' : '#64748b',
                                fontWeight: 700, fontSize: '0.85rem'
                            }}
                            title={t('lDAPConfigPanel.enableLdapsTlssslEncryptionTip')}
                        >
                            {config.UseTLS ? '🔒 TLS On' : '🔓 TLS Off'}
                        </button>
                    </div>
                </div>
                <div>
                    <label style={labelStyle}>Base DN</label>
                    <input
                        style={inputStyle}
                        value={config.BaseDN || ''}
                        onChange={e => updateConfig('BaseDN', e.target.value)}
                        placeholder={t('lDAPConfigPanel.egDccompanydclocalPlaceholder')}
                        title={t('lDAPConfigPanel.baseDistinguishedNameForUserTip')}
                    />
                </div>
                <div>
                    <label style={labelStyle}>Search Filter</label>
                    <input
                        style={inputStyle}
                        value={config.SearchFilter || ''}
                        onChange={e => updateConfig('SearchFilter', e.target.value)}
                        placeholder={t('lDAPConfigPanel.objectclassusersamaccountnameusernamePlaceholder')}
                        title={t('lDAPConfigPanel.ldapSearchFilterUseUsernameTip')}
                    />
                </div>
                <div>
                    <label style={labelStyle}>Bind DN (Service Account)</label>
                    <input
                        style={inputStyle}
                        value={config.BindDN || ''}
                        onChange={e => updateConfig('BindDN', e.target.value)}
                        placeholder={t('lDAPConfigPanel.egCnsvctrierosouserviceAccountsdccompanydclocalPlaceholder')}
                        title={t('lDAPConfigPanel.distinguishedNameOfTheServiceTip')}
                    />
                </div>
                <div>
                    <label style={labelStyle}>Bind Password</label>
                    <div style={{ position: 'relative' }}>
                        <input
                            style={{ ...inputStyle, paddingRight: '50px' }}
                            type={showPassword ? 'text' : 'password'}
                            value={config.BindPassword || ''}
                            onChange={e => updateConfig('BindPassword', e.target.value)}
                            placeholder={t('lDAPConfigPanel.serviceAccountPasswordPlaceholder')}
                            title={t('lDAPConfigPanel.passwordForTheServiceAccountTip')}
                        />
                        <button 
                            onClick={() => setShowPassword(!showPassword)}
                            style={{
                                position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                                background: 'none', border: 'none', color: '#64748b', cursor: 'pointer',
                                fontSize: '0.75rem'
                            }}
                            title={showPassword ? 'Hide password' : 'Show password'}
                        >
                            {showPassword ? 'Hide' : 'Show'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Role Mapping */}
            <div style={{
                padding: '20px', background: 'rgba(0,0,0,0.15)', borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.06)', marginBottom: '20px'
            }}>
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: '15px'
                }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Users size={16} color="#f59e0b" /> AD Group → Trier Role Mapping
                    </div>
                    <button
                        onClick={addRoleMapping}
                        style={{
                            padding: '5px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                            background: 'rgba(99,102,241,0.15)', color: '#818cf8', fontWeight: 600,
                            fontSize: '0.8rem'
                        }}
                        title={t('lDAPConfigPanel.addANewAdGroupTip')}
                    >
                        + Add Mapping
                    </button>
                </div>
                {roleMappings.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#64748b', fontSize: '0.8rem' }}>
                        No role mappings configured. All LDAP users will default to "Technician" role.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {roleMappings.map((m, i) => (
                            <div key={i} style={{
                                display: 'flex', gap: '10px', alignItems: 'center',
                                padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px'
                            }}>
                                <input
                                    style={{ ...inputStyle, flex: 2 }}
                                    value={m.group}
                                    onChange={e => updateRoleMapping(i, 'group', e.target.value)}
                                    placeholder={t('lDAPConfigPanel.adGroupEgCnmaintmanagersPlaceholder')}
                                    title={t('lDAPConfigPanel.activeDirectoryGroupNamePartialTip')}
                                />
                                <span style={{ color: '#475569', fontSize: '1.2rem' }}>→</span>
                                <select
                                    value={m.role}
                                    onChange={e => updateRoleMapping(i, 'role', e.target.value)}
                                    style={{
                                        ...inputStyle, flex: 1, cursor: 'pointer',
                                        appearance: 'auto'
                                    }}
                                    title={t('lDAPConfigPanel.assignedTrierOsRoleTip')}
                                >
                                    {TRIER_ROLES.map(r => (
                                        <option key={r} value={r} style={{ background: '#1e293b' }}>
                                            {r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                        </option>
                                    ))}
                                </select>
                                <button 
                                    onClick={() => removeRoleMapping(i)}
                                    style={{
                                        background: 'rgba(239,68,68,0.1)', border: 'none',
                                        color: '#ef4444', cursor: 'pointer', padding: '6px',
                                        borderRadius: '6px'
                                    }}
                                    title={t('lDAPConfigPanel.removeThisMappingTip')}
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Sync Settings */}
            <div style={{
                padding: '15px 20px', background: 'rgba(0,0,0,0.15)', borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.06)', marginBottom: '20px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px'
            }}>
                <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <RefreshCw size={16} color="#3b82f6" /> Auto-Sync Interval
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '4px' }}>
                        Last sync: {config.LastSyncAt ? new Date(config.LastSyncAt + 'Z').toLocaleString() : 'Never'}
                    </div>
                </div>
                <select
                    value={config.SyncInterval || 15}
                    onChange={e => updateConfig('SyncInterval', parseInt(e.target.value, 10))}
                    style={{
                        padding: '8px 16px', borderRadius: '8px',
                        background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                        color: '#e2e8f0', fontSize: '0.85rem', cursor: 'pointer'
                    }}
                    title={t('lDAPConfigPanel.howOftenToSyncUsersTip')}
                >
                    <option value={5} style={{ background: '#1e293b' }}>Every 5 minutes</option>
                    <option value={15} style={{ background: '#1e293b' }}>Every 15 minutes</option>
                    <option value={30} style={{ background: '#1e293b' }}>Every 30 minutes</option>
                    <option value={60} style={{ background: '#1e293b' }}>Every 60 minutes</option>
                </select>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '15px' }}>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="btn-primary"
                    style={{
                        flex: 1, padding: '12px', fontSize: '0.9rem', fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                        opacity: saving ? 0.6 : 1
                    }}
                    title={t('lDAPConfigPanel.saveLdapConfigurationChangesTip')}
                >
                    {saving ? <RefreshCw size={16} className="spinning" /> : <Check size={16} />}
                    {saving ? 'Saving...' : 'Save Configuration'}
                </button>
                <button
                    onClick={handleTest}
                    disabled={testing || !config.Host}
                    className="btn-primary"
                    style={{
                        padding: '12px 24px', fontSize: '0.85rem', fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: '8px',
                        background: 'rgba(16,185,129,0.15)', color: '#10b981',
                        border: '1px solid rgba(16,185,129,0.3)',
                        opacity: (testing || !config.Host) ? 0.5 : 1
                    }}
                    title={t('lDAPConfigPanel.testConnectionToTheLdapTip')}
                >
                    {testing ? <RefreshCw size={14} className="spinning" /> : <Zap size={14} />}
                    {testing ? 'Testing...' : 'Test Connection'}
                </button>
                <button
                    onClick={handleSync}
                    disabled={syncing || !config.Enabled}
                    className="btn-primary"
                    style={{
                        padding: '12px 24px', fontSize: '0.85rem', fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: '8px',
                        background: 'rgba(59,130,246,0.15)', color: '#3b82f6',
                        border: '1px solid rgba(59,130,246,0.3)',
                        opacity: (syncing || !config.Enabled) ? 0.5 : 1
                    }}
                    title={t('lDAPConfigPanel.manuallySyncUsersFromActiveTip')}
                >
                    {syncing ? <RefreshCw size={14} className="spinning" /> : <Users size={14} />}
                    {syncing ? 'Syncing...' : 'Sync Now'}
                </button>
            </div>

            {/* Result Messages */}
            {saveMsg && (
                <div style={{
                    padding: '10px 14px', borderRadius: '8px', marginBottom: '10px', fontSize: '0.85rem',
                    background: saveMsg.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                    color: saveMsg.ok ? '#10b981' : '#ef4444',
                    border: `1px solid ${saveMsg.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`
                }}>
                    {saveMsg.ok ? <Check size={14} style={{ marginRight: '6px' }} /> : <X size={14} style={{ marginRight: '6px' }} />}
                    {saveMsg.text}
                </div>
            )}

            {testResult && (
                <div style={{
                    padding: '14px', borderRadius: '8px', marginBottom: '10px', fontSize: '0.8rem',
                    background: testResult.success ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                    border: `1px solid ${testResult.success ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                    color: '#e2e8f0'
                }}>
                    <div style={{ fontWeight: 700, marginBottom: '6px', color: testResult.success ? '#10b981' : '#ef4444' }}>
                        {testResult.success ? '✅ Connection Successful' : '❌ Connection Failed'}
                    </div>
                    {testResult.message && <div>{testResult.message}</div>}
                    {testResult.error && <div style={{ color: '#f87171' }}>{testResult.error}</div>}
                    {testResult.details && (
                        <div style={{ marginTop: '8px', padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            Host: {testResult.details.host}:{testResult.details.port} | TLS: {testResult.details.tls}<br/>
                            Base DN: {testResult.details.baseDN}<br/>
                            {testResult.details.message}
                        </div>
                    )}
                </div>
            )}

            {syncResult && (
                <div style={{
                    padding: '14px', borderRadius: '8px', fontSize: '0.8rem',
                    background: syncResult.success ? 'rgba(59,130,246,0.08)' : 'rgba(239,68,68,0.08)',
                    border: `1px solid ${syncResult.success ? 'rgba(59,130,246,0.3)' : 'rgba(239,68,68,0.3)'}`,
                    color: '#e2e8f0'
                }}>
                    <div style={{ fontWeight: 700, marginBottom: '6px', color: syncResult.success ? '#3b82f6' : '#ef4444' }}>
                        {syncResult.success ? '✅ Sync Complete' : '❌ Sync Failed'}
                    </div>
                    {syncResult.message && <div>{syncResult.message}</div>}
                    {syncResult.error && <div style={{ color: '#f87171' }}>{syncResult.error}</div>}
                    {syncResult.stats && (
                        <div style={{ display: 'flex', gap: '20px', marginTop: '8px' }}>
                            <span>{t('lDAPConfigPanel.total')} <strong>{syncResult.stats.total}</strong></span>
                            <span style={{ color: '#10b981' }}>Created: <strong>{syncResult.stats.created}</strong></span>
                            <span style={{ color: '#3b82f6' }}>Updated: <strong>{syncResult.stats.updated}</strong></span>
                            <span style={{ color: '#94a3b8' }}>Skipped: <strong>{syncResult.stats.skipped}</strong></span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
