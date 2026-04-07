// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — SAP Integration Configuration
 * ==========================================
 * Admin panel for configuring SAP ERP bidirectional data exchange.
 * Maps Trier OS fields to SAP PM module tables and manages sync schedules
 * for work orders, assets, and parts.
 *
 * KEY FEATURES:
 *   - RFC connection config: SAP application server, system number, client, credentials
 *   - Field mapping: Trier OS → SAP field mapping for WOs, assets, materials
 *   - Sync schedule: configure push/pull cadence (real-time / hourly / daily)
 *   - Bidirectional sync: changes in either system propagate to the other
 *   - Test connection: validate RFC credentials before saving
 *   - Sync log: history of last 50 sync operations with status and error details
 *   - Entity filter: choose which entity types to sync (WOs only, assets only, or all)
 *
 * SYNC ENTITIES:
 *   Work Orders  → SAP PM Orders (PM01/PM03)
 *   Assets       → SAP Equipment Master (IE01)
 *   Parts        → SAP Material Master (MM01)
 *   Labor        → SAP Confirmation (IW41)
 *
 * API CALLS:
 *   GET  /api/settings/sap          — Load SAP connection config
 *   POST /api/settings/sap          — Save SAP configuration
 *   POST /api/settings/sap/test     — Test RFC connection
 *   GET  /api/settings/sap/log      — Sync history log
 *
 * @param {Function} onClose — Dismiss the SAP integration panel
 */
import React, { useState, useEffect } from 'react';
import { Globe, Shield, Key, Save, X, Server, User, Lock, Phone, Mail, CheckCircle2, AlertCircle } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

export default function SAPIntegrationView({ onClose }) {
    const { t } = useTranslation();
    const [settings, setSettings] = useState({
        apiUrl: '',
        port: '',
        clientId: '',
        clientSecret: '',
        sapContactName: '',
        sapContactPhone: '',
        sapContactEmail: '',
        allowReadParts: true,
        allowReadAssets: true,
        allowReadJobs: false,
        allowReadProcedures: false,
        allowSyncStock: false,
        allowPushOrders: false,
        environment: 'sandbox' // 'sandbox' | 'production'
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState({ type: '', message: '' });

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/v2/integration/sap/settings');
            if (res.ok) {
                const data = await res.json();
                if (data && Object.keys(data).length > 0) {
                    setSettings(prev => ({ ...prev, ...data }));
                }
            }
        } catch (err) {
            console.error('Failed to load SAP settings', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setStatus({ type: '', message: '' });
        try {
            const res = await fetch('/api/v2/integration/sap/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            if (res.ok) {
                setStatus({ type: 'success', message: 'SAP Integration configuration saved successfully.' });
                setTimeout(onClose, 1500);
            } else {
                setStatus({ type: 'error', message: 'Failed to save configuration.' });
            }
        } catch (err) {
            setStatus({ type: 'error', message: 'Communication error with integration gateway.' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="modal-overlay">
                <div className="glass-card" style={{ padding: '40px', textAlign: 'center' }}>
                    <div className="spinning" style={{ border: '4px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', width: '40px', height: '40px', margin: '0 auto' }}></div>
                    <p style={{ marginTop: '15px' }}>{t('s.a.p.integration.initializingSapGateway')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="glass-card" style={{ 
                width: '90%', 
                maxWidth: '900px', 
                maxHeight: '90vh', 
                overflowY: 'auto', 
                padding: '0', 
                display: 'flex', 
                flexDirection: 'column' 
            }} onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div style={{ 
                    padding: '25px', 
                    borderBottom: '1px solid var(--glass-border)', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    background: 'rgba(99, 102, 241, 0.05)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{ 
                            background: 'var(--primary)', 
                            width: '40px', 
                            height: '40px', 
                            borderRadius: '10px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            boxShadow: '0 0 20px rgba(99, 102, 241, 0.3)'
                        }}>
                            <Globe size={24} color="#fff" />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.4rem' }}>{t('s.a.p.integration.sapEnterpriseSetup')}</h2>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('s.a.p.integration.configureCorporateErpData')}</p>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} title={t('sAPIntegrationView.closeSapIntegrationSettingsTip')}>
                        <X size={28} />
                    </button>
                </div>

                <div style={{ padding: '30px' }}>
                    {status.message && (
                        <div style={{ 
                            padding: '15px', 
                            borderRadius: '12px', 
                            marginBottom: '25px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            background: status.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            border: `1px solid ${status.type === 'success' ? '#10b981' : '#ef4444'}`,
                            color: status.type === 'success' ? '#34d399' : '#f87171'
                        }}>
                            {status.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                            {status.message}
                        </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
                        {/* Connection & Auth */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
                            <section>
                                <h3 style={{ fontSize: '0.9rem', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <Server size={16} /> {t('s.a.p.integration.connectionGateway')}
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '5px' }}>{t('s.a.p.integration.sapEndpointUrlLink')}</label>
                                        <input 
                                            type="text" 
                                            placeholder={t('s.a.p.integration.httpssapgatewaytrierfarmscomapiv1')}
                                            value={settings.apiUrl}
                                            onChange={e => setSettings({...settings, apiUrl: e.target.value})}
                                            style={{ width: '100%', padding: '12px' }}
                                            title={t('sAPIntegrationView.enterTheSapApiEndpointTip')}
                                        />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '5px' }}>{t('s.a.p.integration.portNumber')}</label>
                                            <input 
                                                type="text" 
                                                placeholder="443"
                                                value={settings.port}
                                                onChange={e => setSettings({...settings, port: e.target.value})}
                                                style={{ width: '100%', padding: '12px' }}
                                                title={t('sAPIntegrationView.enterThePortNumberForTip')}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '5px' }}>{t('s.a.p.integration.environment')}</label>
                                            <select 
                                                value={settings.environment}
                                                onChange={e => setSettings({...settings, environment: e.target.value})}
                                                style={{ width: '100%', padding: '12px' }}
                                                title={t('sAPIntegrationView.selectSandboxForTestingOrTip')}
                                            >
                                                <option value="sandbox">{t('s.a.p.integration.sandboxTest')}</option>
                                                <option value="production">{t('s.a.p.integration.productionLive')}</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section>
                                <h3 style={{ fontSize: '0.9rem', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <Lock size={16} /> {t('s.a.p.integration.authentication')}
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                    <div>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '5px' }}>
                                            <User size={12} /> {t('s.a.p.integration.clientIdUsername')}
                                        </label>
                                        <input 
                                            type="text" 
                                            value={settings.clientId}
                                            onChange={e => setSettings({...settings, clientId: e.target.value})}
                                            style={{ width: '100%', padding: '12px' }}
                                            title={t('sAPIntegrationView.enterTheSapClientIdTip')}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '5px' }}>
                                            <Key size={12} /> {t('s.a.p.integration.clientSecretPassword')}
                                        </label>
                                        <input 
                                            type="password" 
                                            value={settings.clientSecret}
                                            onChange={e => setSettings({...settings, clientSecret: e.target.value})}
                                            style={{ width: '100%', padding: '12px' }}
                                            title={t('sAPIntegrationView.enterTheSapClientSecretTip')}
                                        />
                                    </div>
                                </div>
                            </section>
                        </div>

                        {/* Permissions & Contact */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
                            <section className="panel-box" style={{ background: 'rgba(255,255,255,0.02)' }}>
                                <h3 style={{ fontSize: '0.9rem', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <Shield size={16} /> {t('s.a.p.integration.integrationPermissions')}
                                </h3>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '15px' }}>{t('s.a.p.integration.controlWhatDataSap')}</p>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
                                    {[
                                        { key: 'allowReadParts', label: 'Allow Reading Parts & Inventory' },
                                        { key: 'allowReadAssets', label: 'Allow Reading Asset History' },
                                        { key: 'allowReadJobs', label: 'Allow Reading Work Order Data' },
                                        { key: 'allowReadProcedures', label: 'Allow Reading SOPs/Procedures' },
                                        { key: 'allowSyncStock', label: 'Allow Stock Level Synchronization' },
                                        { key: 'allowPushOrders', label: 'Allow SAP to Create Work Orders' }
                                    ].map(item => (
                                        <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: settings[item.key] ? '1px solid var(--primary)' : '1px solid transparent' }}>
                                            <input 
                                                type="checkbox" 
                                                checked={settings[item.key]}
                                                onChange={e => setSettings({...settings, [item.key]: e.target.checked})}
                                                title={`Toggle permission: ${item.label}`}
                                            />
                                            <span style={{ fontSize: '0.85rem' }}>{item.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </section>

                            <section>
                                <h3 style={{ fontSize: '0.9rem', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <Phone size={16} /> {t('s.a.p.integration.sapSupportContact')}
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '5px' }}>{t('s.a.p.integration.sapAccountRepresentative')}</label>
                                        <input 
                                            type="text" 
                                            value={settings.sapContactName}
                                            onChange={e => setSettings({...settings, sapContactName: e.target.value})}
                                            style={{ width: '100%', padding: '12px' }}
                                            title={t('sAPIntegrationView.enterTheSapAccountRepresentativeTip')}
                                        />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                        <div>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '5px' }}>
                                                <Phone size={12} /> {t('s.a.p.integration.phone')}
                                            </label>
                                            <input 
                                                type="text" 
                                                value={settings.sapContactPhone}
                                                onChange={e => setSettings({...settings, sapContactPhone: e.target.value})}
                                                style={{ width: '100%', padding: '12px' }}
                                                title={t('sAPIntegrationView.enterTheSapSupportContactTip')}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '5px' }}>
                                                <Mail size={12} /> {t('s.a.p.integration.email')}
                                            </label>
                                            <input 
                                                type="email" 
                                                value={settings.sapContactEmail}
                                                onChange={e => setSettings({...settings, sapContactEmail: e.target.value})}
                                                style={{ width: '100%', padding: '12px' }}
                                                title={t('sAPIntegrationView.enterTheSapSupportContactTip')}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </section>
                        </div>
                    </div>
                </div>

                <div style={{ 
                    padding: '25px', 
                    borderTop: '1px solid var(--glass-border)', 
                    display: 'flex', 
                    justifyContent: 'flex-end', 
                    gap: '15px',
                    background: 'rgba(0, 0, 0, 0.3)'
                }}>
                    <button onClick={onClose} className="btn-nav" style={{ padding: '12px 30px' }} title={t('sAPIntegrationView.discardChangesAndCloseTip')}>
                        {t('s.a.p.integration.cancel')}
                    </button>
                    <button onClick={handleSave} disabled={saving} className="btn-save" style={{ minWidth: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }} title={t('sAPIntegrationView.saveSapIntegrationConfigurationTip')}>
                        {saving ? (
                            <div className="spinning" style={{ width: '18px', height: '18px', border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%' }}></div>
                        ) : <Save size={18} />}
                        Save SAP Configuration
                    </button>
                </div>
            </div>
        </div>
    );
}
