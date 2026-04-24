// Copyright © 2026 Trier OS. All Rights Reserved.

import React, { useState, useEffect } from 'react';
import { Link2, Plus, Edit2, Trash2, ArrowUpCircle, ArrowDownCircle, CheckCircle, AlertCircle, Clock, X, RefreshCw, Activity } from 'lucide-react';

export default function DigitalTwinSyncView({ plantId, plantLabel }) {
    const [configs, setConfigs] = useState([]);
    const [history, setHistory] = useState([]);
    const [lastStatus, setLastStatus] = useState(null);
    const [activeTab, setActiveTab] = useState('connections');
    const [loading, setLoading] = useState(false);
    
    // Modals & Forms
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [editingConfig, setEditingConfig] = useState(null);
    const [secretChanged, setSecretChanged] = useState(false);
    
    const [configForm, setConfigForm] = useState({
        platform: 'BENTLEY_ITWIN',
        instanceURL: '',
        tenantId: '',
        clientId: '',
        clientSecret: '',
        iModelId: '',
        syncDirection: 'OUTBOUND'
    });
    
    // Testing & Syncing
    const [testResult, setTestResult] = useState(null);
    const [testing, setTesting] = useState(false);
    const [syncing, setSyncing] = useState(null); // 'push' | 'pull' | null
    const [saving, setSaving] = useState(false);

    const fetchConfigs = async () => {
        setLoading(true);
        const headers = { 'Content-Type': 'application/json', 'x-plant-id': plantId };
        try {
            const [cfgRes, statRes] = await Promise.all([
                fetch(`/api/dt-sync/config?plantId=${plantId}`, { headers }),
                fetch(`/api/dt-sync/${plantId}/status`, { headers })
            ]);
            const cfgData = cfgRes.ok ? await cfgRes.json() : [];
            setConfigs(Array.isArray(cfgData) ? cfgData : []);
            
            const statData = statRes.ok ? await statRes.json() : null;
            setLastStatus(statData);
        } catch (err) {
            console.error('Failed to fetch connections:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchHistory = async () => {
        setLoading(true);
        const headers = { 'Content-Type': 'application/json', 'x-plant-id': plantId };
        try {
            const res = await fetch(`/api/dt-sync/${plantId}/history?limit=50`, { headers });
            const data = res.ok ? await res.json() : [];
            setHistory(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Failed to fetch history:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!plantId) return;
        if (activeTab === 'connections') {
            fetchConfigs();
        } else {
            fetchHistory();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [plantId, activeTab]);

    const handleOpenNew = () => {
        setEditingConfig(null);
        setConfigForm({
            platform: 'BENTLEY_ITWIN',
            instanceURL: '',
            tenantId: '',
            clientId: '',
            clientSecret: '',
            iModelId: '',
            syncDirection: 'OUTBOUND'
        });
        setSecretChanged(true);
        setTestResult(null);
        setShowConfigModal(true);
    };

    const handleOpenEdit = (cfg) => {
        setEditingConfig(cfg);
        setConfigForm({
            platform: cfg.Platform,
            instanceURL: cfg.InstanceURL,
            tenantId: cfg.TenantId || '',
            clientId: cfg.ClientId || '',
            clientSecret: '', // intentionally blank
            iModelId: cfg.IModelId || '',
            syncDirection: cfg.SyncDirection
        });
        setSecretChanged(false);
        setTestResult(null);
        setShowConfigModal(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this connection?')) return;
        try {
            await fetch(`/api/dt-sync/config/${id}`, {
                method: 'DELETE',
                headers: { 'x-plant-id': plantId }
            });
            fetchConfigs();
        } catch (err) {
            alert('Delete failed');
        }
    };

    const handleSaveConfig = async (e) => {
        e.preventDefault();
        setSaving(true);
        setTestResult(null);
        
        const bodySecret = editingConfig && !secretChanged ? '***' : configForm.clientSecret;
        
        try {
            const res = await fetch('/api/dt-sync/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                body: JSON.stringify({ plantId, ...configForm, clientSecret: bodySecret })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Save failed');
            setShowConfigModal(false);
            fetchConfigs();
        } catch (err) {
            alert(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleTestConnection = async () => {
        setTesting(true);
        setTestResult(null);
        const bodySecret = editingConfig && !secretChanged ? '***' : configForm.clientSecret;
        try {
            const res = await fetch('/api/dt-sync/test-connection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                body: JSON.stringify({
                    instanceURL: configForm.instanceURL,
                    clientId: configForm.clientId,
                    clientSecret: bodySecret
                })
            });
            const data = await res.json();
            // Surface the message including S-6 Private/loopback blocked
            setTestResult(data); 
        } catch (err) {
            setTestResult({ ok: false, status: 'ERROR', message: err.message });
        } finally {
            setTesting(false);
        }
    };

    const handlePush = async (platform) => {
        setSyncing('push');
        try {
            const res = await fetch(`/api/dt-sync/${plantId}/push`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId }
            });
            const data = await res.json();
            setLastStatus({ ...data, Direction: 'OUTBOUND', Platform: platform });
            fetchConfigs();
        } catch (err) {
            alert('Push failed');
        } finally {
            setSyncing(null);
        }
    };

    const handlePull = async (platform) => {
        setSyncing('pull');
        try {
            const res = await fetch(`/api/dt-sync/${plantId}/pull`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId }
            });
            const data = await res.json();
            setLastStatus({ ...data, Direction: 'INBOUND', Platform: platform });
            fetchConfigs();
        } catch (err) {
            alert('Pull failed');
        } finally {
            setSyncing(null);
        }
    };

    const getPlatformName = (code) => {
        if (code === 'BENTLEY_ITWIN') return 'Bentley iTwin';
        if (code === 'SIEMENS_NX') return 'Siemens NX';
        if (code === 'PTC_THINGWORX') return 'PTC ThingWorx';
        return code;
    };

    const renderStatusBadge = (statusObj, currentPlatform) => {
        if (!statusObj || statusObj.Platform !== currentPlatform || statusObj.Status === 'NONE' || statusObj.Status === null) {
            return <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Never synced</span>;
        }
        if (statusObj.Status === 'RUNNING') {
            return <span style={{ color: '#f59e0b', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}><RefreshCw size={14} className="spin" /> Running</span>;
        }
        if (statusObj.Status === 'COMPLETE') {
            return <span style={{ color: '#10b981', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle size={14} /> Synced</span>;
        }
        return <span style={{ color: '#ef4444', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}><AlertCircle size={14} /> Failed</span>;
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '0 8px', maxWidth: '1200px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, #6366f1, #4338ca)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(99, 102, 241, 0.35)' }}>
                        <Link2 size={26} color="#fff" />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#f1f5f9' }}>Digital Twin Integration</h1>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>{plantLabel}</p>
                    </div>
                </div>
                <div>
                    {activeTab === 'connections' && (
                        <button className="btn-primary" onClick={handleOpenNew} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Plus size={16} /> Add Connection
                        </button>
                    )}
                </div>
            </div>

            {/* Tab Bar */}
            <div style={{ display: 'flex', borderBottom: '1px solid #334155' }}>
                <button
                    onClick={() => setActiveTab('connections')}
                    style={{
                        padding: '12px 20px', background: 'transparent', border: 'none', cursor: 'pointer',
                        color: activeTab === 'connections' ? '#6366f1' : '#94a3b8',
                        borderBottom: activeTab === 'connections' ? '2px solid #6366f1' : '2px solid transparent',
                        fontWeight: activeTab === 'connections' ? 600 : 500, fontSize: '0.9rem'
                    }}
                >
                    Connections
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    style={{
                        padding: '12px 20px', background: 'transparent', border: 'none', cursor: 'pointer',
                        color: activeTab === 'history' ? '#6366f1' : '#94a3b8',
                        borderBottom: activeTab === 'history' ? '2px solid #6366f1' : '2px solid transparent',
                        fontWeight: activeTab === 'history' ? 600 : 500, fontSize: '0.9rem'
                    }}
                >
                    Sync History
                </button>
            </div>

            {loading ? (
                <div style={{ color: '#94a3b8', textAlign: 'center', padding: '40px' }}>Loading integration data...</div>
            ) : (
                <>
                    {/* Connections Tab */}
                    {activeTab === 'connections' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {configs.length === 0 ? (
                                <div style={{ background: 'rgba(30,41,59,0.5)', padding: '40px', borderRadius: '12px', border: '1px dashed #334155', textAlign: 'center' }}>
                                    <Link2 size={32} color="#64748b" style={{ marginBottom: '12px' }} />
                                    <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '1.1rem', marginBottom: '8px' }}>No platform connections configured</div>
                                    <div style={{ color: '#94a3b8', fontSize: '0.9rem', maxWidth: '400px', margin: '0 auto' }}>
                                        Add a connection to begin syncing with Bentley iTwin, Siemens NX, or PTC ThingWorx.
                                    </div>
                                </div>
                            ) : (
                                configs.map(cfg => (
                                    <div key={cfg.ConfigID} className="glass-card" style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <span style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
                                                    {getPlatformName(cfg.Platform)}
                                                </span>
                                                {cfg.Enabled !== 1 && <span style={{ color: '#ef4444', fontSize: '0.75rem', fontWeight: 700 }}>DISABLED</span>}
                                            </div>
                                            <div style={{ color: '#f1f5f9', fontWeight: 500 }}>{cfg.InstanceURL}</div>
                                            <div style={{ display: 'flex', gap: '16px', marginTop: '4px' }}>
                                                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Direction: <span style={{ color: '#e2e8f0' }}>{cfg.SyncDirection}</span></div>
                                                {renderStatusBadge(lastStatus, cfg.Platform)}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <button
                                                className="btn-secondary"
                                                disabled={syncing !== null || cfg.SyncDirection === 'INBOUND'}
                                                onClick={() => handlePush(cfg.Platform)}
                                                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                                            >
                                                <ArrowUpCircle size={14} /> Push
                                            </button>
                                            <button
                                                className="btn-secondary"
                                                disabled={syncing !== null || cfg.SyncDirection === 'OUTBOUND'}
                                                onClick={() => handlePull(cfg.Platform)}
                                                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                                            >
                                                <ArrowDownCircle size={14} /> Pull
                                            </button>
                                            <div style={{ width: '1px', height: '24px', background: '#334155', margin: '0 4px' }} />
                                            <button onClick={() => handleOpenEdit(cfg)} style={{ background: 'transparent', border: '1px solid #334155', color: '#e2e8f0', padding: '8px', borderRadius: '6px', cursor: 'pointer' }}>
                                                <Edit2 size={16} />
                                            </button>
                                            <button onClick={() => handleDelete(cfg.ConfigID)} style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '8px', borderRadius: '6px', cursor: 'pointer' }}>
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* History Tab */}
                    {activeTab === 'history' && (
                        <div className="glass-card" style={{ padding: '20px' }}>
                            <table className="data-table" style={{ width: '100%', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr>
                                        <th>Direction</th>
                                        <th>Platform</th>
                                        <th>Status</th>
                                        <th>Asset Count</th>
                                        <th>Success Count</th>
                                        <th>Error Count</th>
                                        <th>Started</th>
                                        <th>Completed</th>
                                        <th>Triggered By</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {history.length === 0 ? (
                                        <tr><td colSpan="9" style={{ textAlign: 'center', padding: '20px', color: '#64748b', fontStyle: 'italic' }}>No sync history found</td></tr>
                                    ) : (
                                        history.map(h => (
                                            <tr key={h.LogID}>
                                                <td style={{ color: '#e2e8f0', fontWeight: 600 }}>{h.Direction}</td>
                                                <td style={{ color: '#94a3b8' }}>{getPlatformName(h.Platform)}</td>
                                                <td>
                                                    <span style={{
                                                        padding: '2px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700,
                                                        background: h.Status === 'COMPLETE' ? 'rgba(16,185,129,0.15)' : h.Status === 'RUNNING' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                                                        color: h.Status === 'COMPLETE' ? '#10b981' : h.Status === 'RUNNING' ? '#f59e0b' : '#ef4444'
                                                    }}>
                                                        {h.Status}
                                                    </span>
                                                </td>
                                                <td style={{ color: '#f1f5f9' }}>{h.AssetCount || 0}</td>
                                                <td style={{ color: '#10b981' }}>{h.SuccessCount || 0}</td>
                                                <td style={{ color: '#ef4444' }}>{h.ErrorCount || 0}</td>
                                                <td style={{ color: '#94a3b8' }}>{new Date(h.StartedAt).toLocaleString()}</td>
                                                <td style={{ color: '#94a3b8' }}>{h.CompletedAt ? new Date(h.CompletedAt).toLocaleString() : '—'}</td>
                                                <td style={{ color: '#94a3b8' }}>{h.TriggeredBy}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}

            {/* Config Modal */}
            {showConfigModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
                    <div style={{ background: '#1e293b', padding: '24px', borderRadius: '12px', width: '480px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 40px rgba(0,0,0,0.4)', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#f1f5f9' }}>{editingConfig ? 'Edit Connection' : 'Add Connection'}</h2>
                            <button onClick={() => setShowConfigModal(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={20} /></button>
                        </div>
                        
                        <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: '#cbd5e1' }}>Platform</label>
                                <select 
                                    value={configForm.platform} 
                                    onChange={e => setConfigForm({...configForm, platform: e.target.value})} 
                                    className="form-input" 
                                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9' }}
                                >
                                    <option value="BENTLEY_ITWIN">Bentley iTwin</option>
                                    <option value="SIEMENS_NX">Siemens NX</option>
                                    <option value="PTC_THINGWORX">PTC ThingWorx</option>
                                </select>
                            </div>
                            
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: '#cbd5e1' }}>Instance URL</label>
                                <input required type="url" placeholder="https://api.bentley.com" value={configForm.instanceURL} onChange={e => setConfigForm({...configForm, instanceURL: e.target.value})} className="form-input" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9' }} />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: '#cbd5e1' }}>Tenant ID</label>
                                <input required type="text" value={configForm.tenantId} onChange={e => setConfigForm({...configForm, tenantId: e.target.value})} className="form-input" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9' }} />
                            </div>
                            
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: '#cbd5e1' }}>Client ID</label>
                                <input required type="text" value={configForm.clientId} onChange={e => setConfigForm({...configForm, clientId: e.target.value})} className="form-input" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9' }} />
                            </div>
                            
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <label style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>Client Secret</label>
                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                        {editingConfig ? 'Leave blank to keep existing secret' : 'Required'}
                                    </span>
                                </div>
                                <input 
                                    type="password" 
                                    required={!editingConfig}
                                    value={configForm.clientSecret} 
                                    onChange={e => {
                                        setConfigForm({...configForm, clientSecret: e.target.value});
                                        setSecretChanged(true);
                                    }} 
                                    className="form-input" 
                                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9' }} 
                                />
                            </div>

                            {configForm.platform === 'BENTLEY_ITWIN' && (
                                <div>
                                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: '#cbd5e1' }}>iModel ID</label>
                                    <input required type="text" value={configForm.iModelId} onChange={e => setConfigForm({...configForm, iModelId: e.target.value})} className="form-input" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9' }} />
                                </div>
                            )}

                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: '#cbd5e1' }}>Sync Direction</label>
                                <select 
                                    value={configForm.syncDirection} 
                                    onChange={e => setConfigForm({...configForm, syncDirection: e.target.value})} 
                                    className="form-input" 
                                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9' }}
                                >
                                    <option value="OUTBOUND">Outbound Only</option>
                                    <option value="INBOUND">Inbound Only</option>
                                    <option value="BIDIRECTIONAL">Bidirectional</option>
                                </select>
                            </div>
                            
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '12px' }}>
                                <button type="button" onClick={handleTestConnection} disabled={testing} className="btn-secondary" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {testing ? <RefreshCw size={14} className="spin" /> : <Activity size={14} />} Test Connection
                                </button>
                                {testResult && (
                                    <div style={{ 
                                        display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600,
                                        color: testResult.status === 'REACHABLE' ? '#10b981' : testResult.status === 'TIMEOUT' ? '#f59e0b' : '#ef4444' 
                                    }}>
                                        {testResult.status === 'REACHABLE' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                                        {testResult.message}
                                    </div>
                                )}
                            </div>

                            <button type="submit" disabled={saving} className="btn-primary" style={{ width: '100%', padding: '10px', marginTop: '8px', borderRadius: '6px', background: '#6366f1', color: '#fff', border: 'none', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
                                {saving ? 'Saving...' : 'Save Connection'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
