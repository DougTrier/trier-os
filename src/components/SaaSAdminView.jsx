// Copyright © 2026 Trier OS. All Rights Reserved.
// API Dependencies: GET /api/saas/usage, GET /api/saas/usage/history, POST /api/saas/snapshot-now, GET /api/saas/api-keys, PUT /api/saas/api-keys/:id/scope, GET /api/saas/instance-config, PUT /api/saas/instance-config, GET /api/saas/billing-export

import React, { useState, useEffect, useMemo } from 'react';
import { Globe, RefreshCw, Key, Settings, BarChart2, Download, AlertTriangle, CheckCircle } from 'lucide-react';

const API_HEADERS = { 'Content-Type': 'application/json', 'x-plant-id': 'all_sites' };

export default function SaaSAdminView({ plantLabel }) {
    const [activeTab, setActiveTab] = useState('metering'); // 'metering' | 'api-keys' | 'config'

    // Tab 1: Metering
    const [usageHistory, setUsageHistory] = useState([]);
    const [liveMetrics, setLiveMetrics] = useState({ metrics: { api_calls: 0, active_users: 0, storage_mb: 0, seat_count: 0 } });
    const [period, setPeriod] = useState('30');
    const [loading, setLoading] = useState(false);
    const [exportFrom, setExportFrom] = useState('');
    const [exportTo, setExportTo] = useState('');

    // Tab 2: API Keys
    const [apiKeys, setApiKeys] = useState([]);
    const [editingKeyId, setEditingKeyId] = useState(null);
    const [scopeInput, setScopeInput] = useState('');
    const [scopeError, setScopeError] = useState('');
    const [keysLoading, setKeysLoading] = useState(false);
    const [savingScope, setSavingScope] = useState(false);

    // Tab 3: Instance Config
    const [configForm, setConfigForm] = useState({
        instanceName: '',
        primaryColor: '#4f46e5',
        secondaryColor: '#ec4899',
        supportEmail: '',
        supportURL: '',
        poweredByVisible: true
    });
    const [configLoading, setConfigLoading] = useState(false);
    const [savingConfig, setSavingConfig] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    const makeAPI = useMemo(() => {
        return (path, opts = {}) => {
            const headers = { ...API_HEADERS, ...opts.headers };
            return fetch(`/api${path}`, { ...opts, headers }).then(r => {
                if (!r.ok) throw new Error('API Error');
                return r.json();
            });
        };
    }, []);

    // Loaders
    const loadMetering = async () => {
        setLoading(true);
        try {
            const daysAgo = new Date();
            daysAgo.setDate(daysAgo.getDate() - parseInt(period, 10));
            const startDate = daysAgo.toISOString().slice(0, 10);
            const endDate = new Date().toISOString().slice(0, 10);

            const [live, hist] = await Promise.all([
                makeAPI(`/saas/usage?startDate=${startDate}&endDate=${endDate}`),
                makeAPI(`/saas/usage/history?days=${period}`)
            ]);
            // Normalize: API returns { value, unit } per metric; flatten to plain numbers
            const m = live?.metrics || {};
            setLiveMetrics({
                metrics: {
                    api_calls:    m.api_calls?.value    ?? m.api_calls    ?? 0,
                    active_users: m.active_users?.value ?? m.active_users ?? 0,
                    storage_mb:   m.storage_mb?.value   ?? m.storage_mb   ?? 0,
                    seat_count:   m.seat_count?.value   ?? m.seat_count   ?? 0,
                }
            });
            setUsageHistory(hist.history || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const loadApiKeys = async () => {
        setKeysLoading(true);
        try {
            const data = await makeAPI('/saas/api-keys');
            setApiKeys(Array.isArray(data) ? data : (data.keys || []));
        } catch (err) {
            console.error(err);
        } finally {
            setKeysLoading(false);
        }
    };

    const loadConfig = async () => {
        setConfigLoading(true);
        try {
            const data = await makeAPI('/saas/instance-config');
            if (data && data.instanceName !== undefined) {
                setConfigForm({
                    instanceName: data.instanceName || '',
                    primaryColor: data.primaryColor || '#4f46e5',
                    secondaryColor: data.secondaryColor || '#ec4899',
                    supportEmail: data.supportEmail || '',
                    supportURL: data.supportURL || '',
                    poweredByVisible: data.poweredByVisible !== false
                });
            }
        } catch (err) {
            console.error(err);
        } finally {
            setConfigLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'metering') {
            loadMetering();
        } else if (activeTab === 'api-keys') {
            loadApiKeys();
        } else if (activeTab === 'config') {
            loadConfig();
        }
    }, [activeTab, period]);

    // Metering Handlers
    const handleSnapshotNow = async () => {
        try {
            await makeAPI('/saas/snapshot-now', { method: 'POST' });
            loadMetering();
        } catch (err) {
            console.error('Failed snapshot', err);
        }
    };

    const handleBillingExport = async () => {
        if (!exportFrom || !exportTo) return alert('Select date range');
        const res = await fetch(`/api/saas/billing-export?startDate=${exportFrom}&endDate=${exportTo}&format=csv`, { headers: API_HEADERS });
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `billing-${exportFrom}-${exportTo}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const pivotedHistory = useMemo(() => {
        const groups = {};
        for (const row of usageHistory) {
            const date = row.PeriodStart.substring(0, 10);
            if (!groups[date]) groups[date] = { date, api_calls: 0, active_users: 0, storage_mb: 0, seat_count: 0 };
            groups[date][row.Metric] = row.Value;
        }
        return Object.values(groups).sort((a, b) => a.date.localeCompare(b.date));
    }, [usageHistory]);

    // API Keys Handlers
    const handleSaveScope = async (id) => {
        const val = scopeInput.trim();
        let scope = null;
        if (val) {
            scope = val.split(',').map(s => s.trim()).filter(Boolean);
            const plantIdRegex = /^[a-zA-Z0-9_-]{1,64}$/;
            for (const p of scope) {
                if (!plantIdRegex.test(p)) {
                    setScopeError(`Invalid plant ID: ${p}`);
                    return;
                }
            }
        }
        setSavingScope(true);
        setScopeError('');
        try {
            await makeAPI(`/saas/api-keys/${id}/scope`, {
                method: 'PUT',
                body: JSON.stringify({ scope_plants: scope })
            });
            setEditingKeyId(null);
            loadApiKeys();
        } catch (err) {
            setScopeError('Failed to save scope');
        } finally {
            setSavingScope(false);
        }
    };

    // Config Handlers
    const handleSaveConfig = async (e) => {
        e.preventDefault();
        setSavingConfig(true);
        try {
            await makeAPI('/saas/instance-config', {
                method: 'PUT',
                body: JSON.stringify({
                    instanceName: configForm.instanceName,
                    primaryColor: configForm.primaryColor,
                    secondaryColor: configForm.secondaryColor,
                    supportEmail: configForm.supportEmail,
                    supportURL: configForm.supportURL,
                    poweredByVisible: configForm.poweredByVisible ? 1 : 0
                })
            });
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 2000);
        } catch (err) {
            console.error(err);
        } finally {
            setSavingConfig(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '0 8px', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, #4f46e5, #ec4899)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(79, 70, 229, 0.35)' }}>
                        <Globe size={26} color="#fff" />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#f1f5f9' }}>SaaS & Ecosystem Administration</h1>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>Usage metering, API key scoping, and white-label configuration</p>
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '6px' }}>
                <button
                    onClick={() => setActiveTab('metering')}
                    style={{ padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: activeTab === 'metering' ? 700 : 500, fontSize: '0.85rem', background: activeTab === 'metering' ? 'rgba(99,102,241,0.15)' : 'transparent', color: activeTab === 'metering' ? '#818cf8' : '#94a3b8', border: 'none', transition: 'all 0.2s' }}
                >
                    Metering
                </button>
                <button
                    onClick={() => setActiveTab('api-keys')}
                    style={{ padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: activeTab === 'api-keys' ? 700 : 500, fontSize: '0.85rem', background: activeTab === 'api-keys' ? 'rgba(99,102,241,0.15)' : 'transparent', color: activeTab === 'api-keys' ? '#818cf8' : '#94a3b8', border: 'none', transition: 'all 0.2s' }}
                >
                    API Keys
                </button>
                <button
                    onClick={() => setActiveTab('config')}
                    style={{ padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: activeTab === 'config' ? 700 : 500, fontSize: '0.85rem', background: activeTab === 'config' ? 'rgba(99,102,241,0.15)' : 'transparent', color: activeTab === 'config' ? '#818cf8' : '#94a3b8', border: 'none', transition: 'all 0.2s' }}
                >
                    Instance Config
                </button>
            </div>

            {/* TAB 1: METERING */}
            {activeTab === 'metering' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <select value={period} onChange={e => setPeriod(e.target.value)} className="form-input" style={{ padding: '6px 12px', borderRadius: '6px', background: '#1e293b', color: '#f1f5f9', border: '1px solid #334155' }}>
                            <option value="7">Last 7 Days</option>
                            <option value="30">Last 30 Days</option>
                            <option value="90">Last 90 Days</option>
                        </select>
                        <button className="btn-secondary" onClick={loadMetering}><RefreshCw size={14} className={loading ? 'spin' : ''} /></button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                        <div className="glass-card" style={{ padding: '20px', borderLeft: '4px solid #3b82f6' }}>
                            <div style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600, marginBottom: '8px' }}>API CALLS</div>
                            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f1f5f9' }}>{liveMetrics.metrics?.api_calls || 0}</div>
                        </div>
                        <div className="glass-card" style={{ padding: '20px', borderLeft: '4px solid #10b981' }}>
                            <div style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600, marginBottom: '8px' }}>ACTIVE USERS</div>
                            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f1f5f9' }}>{liveMetrics.metrics?.active_users || 0}</div>
                        </div>
                        <div className="glass-card" style={{ padding: '20px', borderLeft: '4px solid #f59e0b' }}>
                            <div style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600, marginBottom: '8px' }}>STORAGE (MB)</div>
                            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f1f5f9' }}>{liveMetrics.metrics?.storage_mb || 0}</div>
                        </div>
                        <div className="glass-card" style={{ padding: '20px', borderLeft: '4px solid #8b5cf6' }}>
                            <div style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600, marginBottom: '8px' }}>SEATS</div>
                            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f1f5f9' }}>{liveMetrics.metrics?.seat_count || 0}</div>
                        </div>
                    </div>

                    <div className="glass-card" style={{ padding: '20px' }}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', color: '#f1f5f9' }}>Usage History</h3>
                        {pivotedHistory.length === 0 ? (
                            <div style={{ padding: '30px', textAlign: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                                <AlertTriangle size={24} color="#f59e0b" style={{ marginBottom: '12px' }} />
                                <div style={{ color: '#94a3b8', marginBottom: '16px' }}>No historical data yet. Data will appear after the first daily snapshot.</div>
                                <button className="btn-primary" onClick={handleSnapshotNow}>Record Snapshot Now</button>
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table className="data-table" style={{ width: '100%' }}>
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>API Calls</th>
                                            <th>Active Users</th>
                                            <th>Storage MB</th>
                                            <th>Seat Count</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pivotedHistory.map((r, i) => (
                                            <tr key={i}>
                                                <td style={{ color: '#cbd5e1' }}>{r.date}</td>
                                                <td style={{ color: '#94a3b8' }}>{r.api_calls || 0}</td>
                                                <td style={{ color: '#94a3b8' }}>{r.active_users || 0}</td>
                                                <td style={{ color: '#94a3b8' }}>{r.storage_mb || 0}</td>
                                                <td style={{ color: '#94a3b8' }}>{r.seat_count || 0}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    <div className="glass-card" style={{ padding: '20px' }}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', color: '#f1f5f9' }}>Billing Export</h3>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <input type="date" value={exportFrom} onChange={e => setExportFrom(e.target.value)} className="form-input" style={{ background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9', padding: '8px', borderRadius: '6px' }} />
                            <span style={{ color: '#64748b' }}>to</span>
                            <input type="date" value={exportTo} onChange={e => setExportTo(e.target.value)} className="form-input" style={{ background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9', padding: '8px', borderRadius: '6px' }} />
                            <button className="btn-primary" onClick={handleBillingExport} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <Download size={16} /> Download CSV
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 2: API KEYS */}
            {activeTab === 'api-keys' && (
                <div className="glass-card" style={{ padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
                        <button className="btn-secondary" onClick={loadApiKeys}><RefreshCw size={14} className={keysLoading ? 'spin' : ''} /></button>
                    </div>
                    {apiKeys.length === 0 && !keysLoading ? (
                        <div style={{ textAlign: 'center', color: '#64748b', padding: '20px' }}>No API keys found.</div>
                    ) : (
                        <table className="data-table" style={{ width: '100%', fontSize: '0.85rem' }}>
                            <thead>
                                <tr>
                                    <th>Label</th>
                                    <th>Key Prefix</th>
                                    <th>Created By</th>
                                    <th>Last Used</th>
                                    <th>Requests</th>
                                    <th>Scope</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {apiKeys.map(key => (
                                    <React.Fragment key={key.id}>
                                        <tr>
                                            <td style={{ fontWeight: 600, color: '#f1f5f9' }}>{key.label || 'Unnamed Key'}</td>
                                            <td style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{key.key_prefix}...</td>
                                            <td style={{ color: '#94a3b8' }}>{key.created_by}</td>
                                            <td style={{ color: '#94a3b8' }}>{key.last_used_at ? new Date(key.last_used_at).toLocaleString() : 'Never'}</td>
                                            <td style={{ color: '#94a3b8' }}>{key.request_count || 0}</td>
                                            <td>
                                                {!key.scope_plants ? (
                                                    <span style={{ padding: '2px 8px', borderRadius: '6px', background: 'rgba(16,185,129,0.15)', color: '#10b981', fontWeight: 600 }}>Global</span>
                                                ) : (
                                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                        {key.scope_plants.map(p => (
                                                            <span key={p} style={{ padding: '2px 8px', borderRadius: '6px', background: 'rgba(99,102,241,0.15)', color: '#818cf8', fontWeight: 600, fontSize: '0.75rem' }}>{p}</span>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>
                                            <td>
                                                <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => {
                                                    setEditingKeyId(key.id);
                                                    setScopeInput(key.scope_plants ? key.scope_plants.join(', ') : '');
                                                    setScopeError('');
                                                }}>Edit Scope</button>
                                            </td>
                                        </tr>
                                        {editingKeyId === key.id && (
                                            <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                                                <td colSpan="7" style={{ padding: '16px' }}>
                                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                                        <div style={{ flex: 1 }}>
                                                            <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>Plant IDs (comma separated, or blank for Global)</label>
                                                            <input type="text" value={scopeInput} onChange={e => setScopeInput(e.target.value)} placeholder="e.g. Plant_1, Plant_2" style={{ width: '100%', padding: '8px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9' }} />
                                                            {scopeError && <div style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '4px' }}>{scopeError}</div>}
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '8px', marginTop: '22px' }}>
                                                            <button className="btn-primary" disabled={savingScope} onClick={() => handleSaveScope(key.id)}>{savingScope ? 'Saving...' : 'Save'}</button>
                                                            <button className="btn-secondary" onClick={() => setEditingKeyId(null)}>Cancel</button>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* TAB 3: CONFIG */}
            {activeTab === 'config' && (
                <div className="glass-card" style={{ padding: '24px', maxWidth: '600px' }}>
                    <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div>
                            <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '6px', fontSize: '0.85rem' }}>Instance Name</label>
                            <input type="text" maxLength="80" value={configForm.instanceName} onChange={e => setConfigForm({...configForm, instanceName: e.target.value})} className="form-input" style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f1f5f9' }} placeholder="Trier OS" />
                        </div>
                        <div style={{ display: 'flex', gap: '20px' }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '6px', fontSize: '0.85rem' }}>Primary Color</label>
                                <input type="color" value={configForm.primaryColor} onChange={e => setConfigForm({...configForm, primaryColor: e.target.value})} style={{ width: '100%', height: '40px', padding: '0', border: 'none', borderRadius: '6px', cursor: 'pointer', background: 'transparent' }} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '6px', fontSize: '0.85rem' }}>Secondary Color</label>
                                <input type="color" value={configForm.secondaryColor} onChange={e => setConfigForm({...configForm, secondaryColor: e.target.value})} style={{ width: '100%', height: '40px', padding: '0', border: 'none', borderRadius: '6px', cursor: 'pointer', background: 'transparent' }} />
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '16px', background: '#0f172a', padding: '12px', borderRadius: '6px', border: '1px solid #334155' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: 24, height: 24, borderRadius: 4, background: configForm.primaryColor }}></div>
                                <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontFamily: 'monospace' }}>{configForm.primaryColor}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: 24, height: 24, borderRadius: 4, background: configForm.secondaryColor }}></div>
                                <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontFamily: 'monospace' }}>{configForm.secondaryColor}</span>
                            </div>
                        </div>
                        <div>
                            <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '6px', fontSize: '0.85rem' }}>Support Email</label>
                            <input type="email" value={configForm.supportEmail} onChange={e => setConfigForm({...configForm, supportEmail: e.target.value})} className="form-input" style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f1f5f9' }} placeholder="support@example.com" />
                        </div>
                        <div>
                            <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '6px', fontSize: '0.85rem' }}>Support URL</label>
                            <input type="url" value={configForm.supportURL} onChange={e => setConfigForm({...configForm, supportURL: e.target.value})} className="form-input" style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f1f5f9' }} placeholder="https://support.example.com" />
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#cbd5e1', fontSize: '0.85rem', cursor: 'pointer' }}>
                            <input type="checkbox" checked={configForm.poweredByVisible} onChange={e => setConfigForm({...configForm, poweredByVisible: e.target.checked})} style={{ width: 18, height: 18, cursor: 'pointer' }} />
                            Show 'Powered by Trier OS' branding
                        </label>
                        
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginTop: '10px' }}>
                            <button type="submit" className="btn-primary" disabled={savingConfig}>{savingConfig ? 'Saving...' : 'Save Configuration'}</button>
                            {saveSuccess && <div style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600 }}><CheckCircle size={16} /> Configuration saved</div>}
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
