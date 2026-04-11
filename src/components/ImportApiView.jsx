// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Import & API Integration Hub
 * =========================================
 * Dedicated workspace for all data import, API key management,
 * BI/Power BI integration, and database bridge tools.
 *
 * TABS:
 *   Import Wizard   — Guided Enterprise System data import (PMC, MP2, Express Maintenance, CSV)
 *   API Keys        — Generate, label, copy, and revoke personal API keys
 *   API Docs        — Interactive REST API reference via APIDocsPanel
 *   Power BI        — Connection strings and dataset schema for BI integration
 *   Data Bridge     — Direct database admin tools via DataBridge component
 *
 * KEY FEATURES:
 *   - Import Wizard: step-by-step field mapping with preview before commit
 *   - API key manager: named keys with optional expiry; one-click clipboard copy
 *   - Power BI integration: OData feed URL and pre-built dataset templates
 *   - Role-gated: Data Bridge and API key creation require IT Admin or above
 *
 * API CALLS:
 *   GET    /api/api-keys          — List active API keys for current user
 *   POST   /api/api-keys          — Create new API key
 *   DELETE /api/api-keys/:id      — Revoke an API key
 */
import React, { useState, useEffect } from 'react';
import { Download, Key, Database, Globe, FileText, Upload, Copy, Trash2, Plus, CheckCircle, Zap, AlertTriangle, Code, Server, Link } from 'lucide-react';
import ImportWizard from './ImportWizard';
import APIDocsPanel from './APIDocsPanel';
import { formatDate } from '../utils/formatDate';
import { TakeTourButton } from './ContextualTour';
import { useTranslation } from '../i18n/index.jsx';

const API = (path, opts = {}) => fetch(`/api${path}`, {
    ...opts,
    headers: {
        'Content-Type': 'application/json',
        'x-plant-id': localStorage.getItem('selectedPlantId') || 'all_sites',
        ...opts.headers
    }
});

export default function ImportApiView({ currentPlant, plantLabel, userRole }) {
    const { t } = useTranslation();
    const [tab, setTab] = useState('import');
    const [apiKeys, setApiKeys] = useState([]);
    const [apiDocs, setApiDocs] = useState(null);
    const [biConfig, setBiConfig] = useState(null);
    const [loading, setLoading] = useState(false);
    const [showNewKeyForm, setShowNewKeyForm] = useState(false);
    const [newKeyLabel, setNewKeyLabel] = useState('');
    const [newKeyResult, setNewKeyResult] = useState(null);
    const [showKey, setShowKey] = useState({});
    const [integrations, setIntegrations] = useState([]);
    const [copiedToast, setCopiedToast] = useState('');

    useEffect(() => {
        // Fetch API keys
        API('/docs/keys').then(r => r.ok ? r.json() : []).then(setApiKeys).catch(e => console.warn('[ImportApiView] fetch error:', e));
        // Fetch API docs
        API('/docs').then(r => r.ok ? r.json() : null).then(setApiDocs).catch(e => console.warn('[ImportApiView] fetch error:', e));
        // Fetch integrations/webhooks
        API('/integrations/webhooks').then(r => r.ok ? r.json() : []).then(setIntegrations).catch(e => console.warn('[ImportApiView] fetch error:', e));
    }, []);

    const copyToClipboard = (text, label = 'Copied') => {
        navigator.clipboard.writeText(text);
        setCopiedToast(label);
        setTimeout(() => setCopiedToast(''), 2000);
    };

    const generateKey = async () => {
        if (!newKeyLabel.trim()) return;
        setLoading(true);
        const res = await API('/docs/keys', {
            method: 'POST',
            body: JSON.stringify({ label: newKeyLabel, permissions: ['read', 'write'] })
        });
        if (res.ok) {
            const data = await res.json();
            setNewKeyResult(data);
            setNewKeyLabel('');
            // Refresh keys list
            API('/docs/keys').then(r => r.ok ? r.json() : []).then(setApiKeys).catch(e => console.warn('[ImportApiView]', e));
        }
        setLoading(false);
    };

    const revokeKey = async (id) => {
        if (!await confirm(t('importApi.revokeKeyConfirm', 'Revoke this API key? This cannot be undone.'))) return;
        await API(`/docs/keys/${id}`, { method: 'DELETE' });
        setApiKeys(prev => prev.filter(k => k.id !== id));
    };

    const tabs = [
        { id: 'import',       label: t('importApi.tabImportWizard', 'Import Wizard'),     icon: Upload,   desc: t('importApi.tabImportWizardDesc', 'Import data from CSV, Access, Excel') },
        { id: 'api-keys',     label: t('importApi.tabApiKeys', 'API Keys'),               icon: Key,      desc: t('importApi.tabApiKeysDesc', 'Manage REST API access keys') },
        { id: 'api-docs',     label: t('importApi.tabApiDocs', 'API Documentation'),      icon: FileText, desc: t('importApi.tabApiDocsDesc', 'Full endpoint reference') },
        { id: 'integrations', label: t('importApi.tabIntegrations', 'Integrations'),      icon: Link,     desc: t('importApi.tabIntegrationsDesc', 'Webhooks, Slack, Teams') },
        { id: 'bi-export',    label: t('importApi.tabBiPowerBi', 'BI / Power BI'),        icon: Globe,    desc: t('importApi.tabBiPowerBiDesc', 'Business intelligence feeds') },
    ];

    const serverUrl = window.location.origin;

    return (
        <div style={{ padding: '0 20px 20px', maxWidth: 1400, margin: '0 auto' }}>
            {/* Copied Toast */}
            {copiedToast && (
                <div style={{
                    position: 'fixed', top: 20, right: 20, zIndex: 10000,
                    background: 'rgba(16,185,129,0.95)', color: '#fff', padding: '10px 20px',
                    borderRadius: '10px', fontWeight: 700, fontSize: '0.85rem',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: '8px',
                    animation: 'fadeIn 0.2s ease'
                }}>
                    <CheckCircle size={16} /> {copiedToast}
                </div>
            )}

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                    <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ background: 'linear-gradient(135deg, #06b6d4, #0891b2)', padding: '10px', borderRadius: '14px', boxShadow: '0 4px 16px rgba(6,182,212,0.3)' }}>
                            <Download size={22} color="#fff" />
                        </div>
                        {t('importApi.importApiHub', 'Import & API Hub')}
                    </h1>
                    <p style={{ color: '#64748b', fontSize: '0.8rem', margin: 0 }}>{t('importApi.importApiHubDesc', 'Data import, REST API management, integration hooks, and BI export feeds')}</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <TakeTourButton tourId="import-api" nestedTab={tab} />
                    <div style={{
                        padding: '6px 14px', borderRadius: '10px', background: 'rgba(6,182,212,0.1)',
                        border: '1px solid rgba(6,182,212,0.2)', fontSize: '0.75rem', color: '#22d3ee'
                    }}>
                        <Server size={12} style={{ marginRight: 6, verticalAlign: -2 }} />
                        {serverUrl}
                    </div>
                </div>
            </div>

            {/* Tab Bar */}
            <div className="nav-pills" style={{ marginBottom: 16 }}>
                {tabs.map(tabItem => (
                    <button key={tabItem.id} className={`btn-nav${tab === tabItem.id ? ' active' : ''}`} onClick={() => setTab(tabItem.id)} title="Tab">
                        <tabItem.icon size={15} />
                        {tabItem.label}
                    </button>
                ))}
            </div>

            {/* ── TAB: Import Wizard ── */}
            {tab === 'import' && (
                <div>
                    <div style={{
                        background: 'rgba(6,182,212,0.06)', borderRadius: '14px', padding: '16px 20px',
                        border: '1px solid rgba(6,182,212,0.15)', marginBottom: '16px',
                        display: 'flex', alignItems: 'center', gap: '12px'
                    }}>
                        <Upload size={18} color="#22d3ee" />
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                            {t('importApi.importWizardBannerPre', 'Import data from')} <strong style={{ color: '#e2e8f0' }}>CSV</strong>, <strong style={{ color: '#e2e8f0' }}>Microsoft Access (.accdb/.mdb)</strong>, <strong style={{ color: '#e2e8f0' }}>Excel</strong>, {t('importApi.importWizardBannerOr', 'or')} <strong style={{ color: '#e2e8f0' }}>JSON</strong> {t('importApi.importWizardBannerPost', 'files. The wizard will map columns to the Trier OS schema automatically.')}
                        </span>
                    </div>
                    <ImportWizard currentPlant={currentPlant} onComplete={() => window.location.reload()} userRole={userRole} />
                </div>
            )}

            {/* ── TAB: API Keys ── */}
            {tab === 'api-keys' && (
                <div>
                    {/* Connection Guide */}
                    <div style={{
                        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px'
                    }}>
                        <div style={{
                            background: 'rgba(0,0,0,0.2)', borderRadius: '14px', padding: '18px',
                            border: '1px solid rgba(255,255,255,0.06)'
                        }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Code size={16} color="#818cf8" /> {t('importApi.restApiEndpoint', 'REST API Endpoint')}
                            </h3>
                            <div style={{
                                background: 'rgba(0,0,0,0.4)', borderRadius: '8px', padding: '12px', fontFamily: 'monospace',
                                fontSize: '0.8rem', color: '#22d3ee', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                            }}>
                                <span>{serverUrl}/api/</span>
                                <button onClick={() => copyToClipboard(`${serverUrl}/api/`, t('importApi.baseUrlCopied', 'Base URL copied!'))} style={{
                                    background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px',
                                    padding: '4px 8px', cursor: 'pointer', color: '#94a3b8'
                                }} title={t('importApi.copyToClipboardTip')}><Copy size={12} /></button>
                            </div>
                            <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: '#64748b' }}>
                                {t('importApi.includeApiKeyHeader', 'Include the API key as a header:')} <code style={{ color: '#818cf8' }}>X-API-Key: your_key_here</code>
                            </p>
                        </div>

                        <div style={{
                            background: 'rgba(0,0,0,0.2)', borderRadius: '14px', padding: '18px',
                            border: '1px solid rgba(255,255,255,0.06)'
                        }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Zap size={16} color="#fbbf24" /> {t('importApi.quickExample', 'Quick Example')}
                            </h3>
                            <pre style={{
                                background: 'rgba(0,0,0,0.4)', borderRadius: '8px', padding: '12px',
                                fontSize: '0.72rem', color: '#94a3b8', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.7
                            }}>{`curl -H "X-API-Key: YOUR_KEY" \\
  ${serverUrl}/api/work-orders?status=open

# Power BI / Excel
# OData URL: ${serverUrl}/api/bi/work-orders`}</pre>
                        </div>
                    </div>

                    {/* Generate New Key */}
                    <div style={{
                        background: 'rgba(0,0,0,0.15)', borderRadius: '14px', padding: '16px 20px',
                        border: '1px solid rgba(255,255,255,0.06)', marginBottom: '16px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                                <Key size={16} color="#22d3ee" /> {t('importApi.apiKeysHeading', 'API Keys')}
                            </h3>
                            <button onClick={() => setShowNewKeyForm(!showNewKeyForm)} style={{
                                padding: '6px 14px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600,
                                background: showNewKeyForm ? 'rgba(239,68,68,0.1)' : 'rgba(6,182,212,0.1)',
                                color: showNewKeyForm ? '#f87171' : '#22d3ee',
                                border: `1px solid ${showNewKeyForm ? 'rgba(239,68,68,0.2)' : 'rgba(6,182,212,0.2)'}`,
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                            }} title={t('importApi.showNewKeyFormTip')}>
                                {showNewKeyForm ? <><Trash2 size={14} /> {t('importApi.cancel', 'Cancel')}</> : <><Plus size={14} /> {t('importApi.generateNewKey', 'Generate New Key')}</>}
                            </button>
                        </div>

                        {showNewKeyForm && (
                            <div style={{
                                display: 'flex', gap: '10px', marginBottom: '12px', padding: '12px',
                                background: 'rgba(6,182,212,0.06)', borderRadius: '10px', border: '1px solid rgba(6,182,212,0.15)'
                            }}>
                                <input value={newKeyLabel} onChange={e => setNewKeyLabel(e.target.value)}
                                    placeholder={t('importApi.keyLabelEgPowerBiPlaceholder')}
                                    style={{
                                        flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '8px', padding: '8px 14px', color: '#e2e8f0', fontSize: '0.8rem'
                                    }}
                                />
                                <button onClick={generateKey} disabled={loading || !newKeyLabel.trim()} style={{
                                    padding: '8px 20px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700,
                                    background: newKeyLabel.trim() ? '#06b6d4' : '#334155', color: '#fff', border: 'none', cursor: 'pointer'
                                }} title={t('importApi.generate', 'Generate')}>{t('importApi.generate', 'Generate')}</button>
                            </div>
                        )}

                        {newKeyResult && (
                            <div style={{
                                padding: '14px', borderRadius: '10px', marginBottom: '12px',
                                background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                    <CheckCircle size={14} color="#10b981" />
                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#10b981' }}>{t('importApi.keyGeneratedCopyNow', "Key Generated — Copy now! It won't be shown again.")}</span>
                                </div>
                                <div style={{
                                    background: 'rgba(0,0,0,0.4)', borderRadius: '8px', padding: '10px 14px',
                                    fontFamily: 'monospace', fontSize: '0.82rem', color: '#fbbf24',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                }}>
                                    <span>{newKeyResult.key || newKeyResult.apiKey}</span>
                                    <button onClick={() => copyToClipboard(newKeyResult.key || newKeyResult.apiKey, t('importApi.apiKeyCopied', 'API Key copied!'))} style={{
                                        background: '#10b981', border: 'none', borderRadius: '6px',
                                        padding: '4px 12px', cursor: 'pointer', color: '#fff', fontWeight: 700, fontSize: '0.75rem'
                                    }} title={t('importApi.copy', 'Copy')}><Copy size={12} /> {t('importApi.copy', 'Copy')}</button>
                                </div>
                            </div>
                        )}

                        {/* Keys Table */}
                        <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                <thead>
                                    <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                                        <th style={{ padding: '8px 14px', textAlign: 'left', color: '#64748b', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase' }}>{t('importApi.colLabel', 'Label')}</th>
                                        <th style={{ padding: '8px 14px', textAlign: 'left', color: '#64748b', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase' }}>{t('importApi.colKeyPrefix', 'Key Prefix')}</th>
                                        <th style={{ padding: '8px 14px', textAlign: 'left', color: '#64748b', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase' }}>{t('importApi.colCreated', 'Created')}</th>
                                        <th style={{ padding: '8px 14px', textAlign: 'left', color: '#64748b', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase' }}>{t('importApi.colLastUsed', 'Last Used')}</th>
                                        <th style={{ padding: '8px 14px', textAlign: 'right', color: '#64748b', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase' }}>{t('importApi.colActions', 'Actions')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {apiKeys.map((key, i) => (
                                        <tr key={key.id || i} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                            <td style={{ padding: '8px 14px', color: '#e2e8f0', fontWeight: 600 }}>{key.label || t('importApi.unnamed', 'Unnamed')}</td>
                                            <td style={{ padding: '8px 14px', fontFamily: 'monospace', color: '#94a3b8' }}>{key.prefix || key.key_prefix || '****'}</td>
                                            <td style={{ padding: '8px 14px', color: '#94a3b8', fontSize: '0.72rem' }}>{formatDate(key.created_at) || '—'}</td>
                                            <td style={{ padding: '8px 14px', color: '#94a3b8', fontSize: '0.72rem' }}>{formatDate(key.last_used) || t('importApi.never', 'Never')}</td>
                                            <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                                                <button onClick={() => revokeKey(key.id)} style={{
                                                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                                                    borderRadius: '6px', padding: '4px 10px', cursor: 'pointer',
                                                    color: '#f87171', fontSize: '0.72rem', fontWeight: 600
                                                }} title={t('importApi.revoke', 'Revoke')}>{t('importApi.revoke', 'Revoke')}</button>
                                            </td>
                                        </tr>
                                    ))}
                                    {apiKeys.length === 0 && (
                                        <tr><td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                                            {t('importApi.noApiKeysYet', 'No API keys generated yet. Generate one above to enable REST API access.')}
                                        </td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ── TAB: API Documentation ── */}
            {tab === 'api-docs' && (
                <div>
                    <APIDocsPanel />
                </div>
            )}

            {/* ── TAB: Integrations (Webhooks) ── */}
            {tab === 'integrations' && (
                <div>
                    <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '16px'
                    }}>
                        {[
                            { label: t('importApi.activeWebhooks', 'Active Webhooks'), value: integrations.filter(w => w.enabled).length, color: '#10b981', icon: Link },
                            { label: t('importApi.slack', 'Slack'), value: integrations.filter(w => w.platform === 'slack').length, color: '#4A154B', icon: Globe },
                            { label: t('importApi.teams', 'Teams'), value: integrations.filter(w => w.platform === 'teams').length, color: '#4B53BC', icon: Globe },
                        ].map(s => (
                            <div key={s.label} style={{
                                background: `${s.color}08`, borderRadius: '14px', padding: '18px',
                                border: `1px solid ${s.color}20`, textAlign: 'center'
                            }}>
                                <s.icon size={24} color={s.color} style={{ marginBottom: 8 }} />
                                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: s.color }}>{s.value}</div>
                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>{s.label}</div>
                            </div>
                        ))}
                    </div>

                    <div style={{
                        background: 'rgba(0,0,0,0.15)', borderRadius: '14px', padding: '16px',
                        border: '1px solid rgba(255,255,255,0.06)'
                    }}>
                        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Link size={16} color="#818cf8" /> {t('importApi.activeWebhooks', 'Active Webhooks')}
                        </h3>
                        {integrations.length > 0 ? integrations.map((wh, i) => (
                            <div key={wh.id || i} style={{
                                display: 'flex', alignItems: 'center', gap: '14px', padding: '12px',
                                borderRadius: '10px', marginBottom: '8px',
                                background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.04)'
                            }}>
                                <div style={{
                                    width: 36, height: 36, borderRadius: '10px',
                                    background: wh.platform === 'slack' ? 'rgba(74,21,75,0.3)' : 'rgba(75,83,188,0.3)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.8rem', fontWeight: 800, color: '#fff'
                                }}>{wh.platform === 'slack' ? 'S' : 'T'}</div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '0.82rem' }}>{wh.label || t('importApi.platformWebhookLabel', `${wh.platform} webhook`)}</div>
                                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontFamily: 'monospace' }}>{wh.webhook_url?.slice(0, 60)}...</div>
                                </div>
                                <span style={{
                                    padding: '3px 10px', borderRadius: '8px', fontSize: '0.65rem', fontWeight: 700,
                                    background: wh.enabled ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                                    color: wh.enabled ? '#10b981' : '#ef4444',
                                    border: `1px solid ${wh.enabled ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`
                                }}>{wh.enabled ? t('importApi.active', 'Active') : t('importApi.disabled', 'Disabled')}</span>
                                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                    {wh.last_triggered ? `${t('importApi.lastTriggeredPrefix', 'Last:')} ${formatDate(wh.last_triggered)}` : t('importApi.neverTriggered', 'Never triggered')}
                                </div>
                            </div>
                        )) : (
                            <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                                <AlertTriangle size={24} style={{ marginBottom: 8, opacity: 0.5 }} />
                                <div>{t('importApi.noWebhooksConfigured', 'No webhooks configured. Go to Settings → Admin Console → Integrations to add Slack or Teams webhooks.')}</div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── TAB: BI / Power BI ── */}
            {tab === 'bi-export' && (
                <div>
                    <div style={{
                        background: 'rgba(245,158,11,0.06)', borderRadius: '14px', padding: '16px 20px',
                        border: '1px solid rgba(245,158,11,0.15)', marginBottom: '16px',
                        display: 'flex', alignItems: 'center', gap: '12px'
                    }}>
                        <Globe size={18} color="#fbbf24" />
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                            {t('importApi.biBannerPre', 'Connect')} <strong style={{ color: '#e2e8f0' }}>Power BI</strong>, <strong style={{ color: '#e2e8f0' }}>Excel</strong>, {t('importApi.biBannerMid', 'or any BI tool to Trier OS data feeds.')}
                            {' '}{t('importApi.biBannerPost', 'Use OData-compatible endpoints below.')}
                        </span>
                    </div>

                    <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', marginBottom: '16px'
                    }}>
                        {[
                            { name: t('importApi.feedWorkOrders', 'Work Orders'),   path: '/api/bi/work-orders',  desc: t('importApi.feedWorkOrdersDesc', 'All work orders with status, priority, dates, assignments') },
                            { name: t('importApi.feedAssets', 'Assets'),            path: '/api/bi/assets',        desc: t('importApi.feedAssetsDesc', 'Complete asset registry with health scores, locations') },
                            { name: t('importApi.feedParts', 'Parts'),              path: '/api/bi/parts',         desc: t('importApi.feedPartsDesc', 'Parts inventory, stock levels, unit costs, locations') },
                            { name: t('importApi.feedLabor', 'Labor'),              path: '/api/bi/labor',         desc: t('importApi.feedLaborDesc', 'Technician hours, pay rates, overtime tracking') },
                            { name: t('importApi.feedPmSchedules', 'PM Schedules'), path: '/api/bi/pm-schedules',  desc: t('importApi.feedPmSchedulesDesc', 'Preventative maintenance schedules and compliance') },
                            { name: t('importApi.feedTransfers', 'Transfers'),      path: '/api/bi/transfers',     desc: t('importApi.feedTransfersDesc', 'Cross-plant logistics and transfer requests') },
                        ].map(feed => (
                            <div key={feed.name} style={{
                                background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '16px',
                                border: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: '14px'
                            }}>
                                <div style={{
                                    width: 40, height: 40, borderRadius: '10px', flexShrink: 0,
                                    background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <Database size={18} color="#fbbf24" />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#e2e8f0', marginBottom: 4 }}>{feed.name}</div>
                                    <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: 8 }}>{feed.desc}</div>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        background: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '6px 10px'
                                    }}>
                                        <code style={{ fontSize: '0.7rem', color: '#22d3ee', flex: 1 }}>{serverUrl}{feed.path}</code>
                                        <button onClick={() => copyToClipboard(`${serverUrl}${feed.path}`, `${feed.name} URL copied!`)} style={{
                                            background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px',
                                            padding: '2px 6px', cursor: 'pointer', color: '#94a3b8'
                                        }} title={t('importApi.copyToClipboardTip')}><Copy size={11} /></button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Power BI Quick Start */}
                    <div style={{
                        background: 'rgba(0,0,0,0.2)', borderRadius: '14px', padding: '20px',
                        border: '1px solid rgba(255,255,255,0.06)'
                    }}>
                        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Zap size={16} color="#fbbf24" /> {t('importApi.powerBiQuickStart', 'Power BI Quick Start')}
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
                            {[
                                { step: '1', title: t('importApi.biStep1Title', 'Get Data → Web'), desc: t('importApi.biStep1Desc', 'In Power BI Desktop, click Get Data → Web. Paste any feed URL above.') },
                                { step: '2', title: t('importApi.biStep2Title', 'Add API Key Header'), desc: t('importApi.biStep2Desc', 'Under Advanced, add header: X-API-Key with your key from the API Keys tab.') },
                                { step: '3', title: t('importApi.biStep3Title', 'Transform & Visualize'), desc: t('importApi.biStep3Desc', 'Power Query will parse the JSON. Build dashboards from live Trier OS data.') },
                            ].map(s => (
                                <div key={s.step} style={{
                                    background: 'rgba(245,158,11,0.04)', borderRadius: '10px', padding: '14px',
                                    border: '1px solid rgba(245,158,11,0.1)'
                                }}>
                                    <div style={{
                                        width: 28, height: 28, borderRadius: '8px', marginBottom: 8,
                                        background: 'rgba(245,158,11,0.15)', color: '#fbbf24',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontWeight: 900, fontSize: '0.85rem'
                                    }}>{s.step}</div>
                                    <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#e2e8f0', marginBottom: 4 }}>{s.title}</div>
                                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', lineHeight: 1.5 }}>{s.desc}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
