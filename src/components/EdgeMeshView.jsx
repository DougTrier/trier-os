import React, { useState, useEffect, useMemo } from 'react';
import { Network, Upload, RefreshCw, CheckCircle2, Clock, AlertTriangle, X, FileDigit } from 'lucide-react';

export default function EdgeMeshView({ plantId }) {
    const [activeTab, setActiveTab] = useState('registry'); // 'registry' | 'sync'
    const [artifacts, setArtifacts] = useState([]);
    const [syncStatus, setSyncStatus] = useState([]);
    const [loading, setLoading] = useState(false);
    
    // Modal state
    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [registerForm, setRegisterForm] = useState({ name: '', type: 'DIGITAL_TWIN', plantId: 'all_sites', filePath: '' });
    const [registering, setRegistering] = useState(false);
    const [registerError, setRegisterError] = useState(null);

    const makeAPI = useMemo(() => {
        return (path, opts = {}) => {
            const headers = { 'x-plant-id': 'all_sites', ...opts.headers };
            if (!(opts.body instanceof FormData)) {
                headers['Content-Type'] = 'application/json';
            }
            return fetch(`/api${path}`, { ...opts, headers }).then(r => {
                if (!r.ok) throw new Error('API Error');
                return r.json();
            });
        };
    }, []);

    const fetchArtifacts = () => {
        setLoading(true);
        makeAPI('/edge-mesh/artifacts')
            .then(data => setArtifacts(data.artifacts || []))
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    };

    const fetchSyncStatus = () => {
        setLoading(true);
        makeAPI('/edge-mesh/sync-status')
            .then(data => setSyncStatus(Array.isArray(data) ? data : []))
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        if (activeTab === 'registry') fetchArtifacts();
        else fetchSyncStatus();
    }, [activeTab, makeAPI]);

    const handleRegister = async (e) => {
        e.preventDefault();
        setRegistering(true);
        setRegisterError(null);
        try {
            await makeAPI('/edge-mesh/artifacts', {
                method: 'POST',
                body: JSON.stringify({
                    name: registerForm.name,
                    type: registerForm.type,
                    plantId: registerForm.plantId === 'all_sites' ? '' : registerForm.plantId,
                    filePath: registerForm.filePath
                })
            });
            setShowRegisterModal(false);
            setRegisterForm({ name: '', type: 'DIGITAL_TWIN', plantId: 'all_sites', filePath: '' });
            fetchArtifacts();
        } catch (err) {
            setRegisterError('Failed to register artifact');
        } finally {
            setRegistering(false);
        }
    };

    const formatBytes = (bytes) => {
        if (!bytes) return '0 B';
        const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const groupedSync = useMemo(() => {
        const groups = {};
        for (const row of syncStatus) {
            const p = row.plantId || 'Unknown Plant';
            if (!groups[p]) groups[p] = [];
            groups[p].push(row);
        }
        return groups;
    }, [syncStatus]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '0 8px', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, #6366f1, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(99, 102, 241, 0.35)' }}>
                        <Network size={26} color="#fff" />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#f1f5f9' }}>Edge Mesh Administration</h1>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>Manage artifact distribution and fleet sync status</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn-nav" onClick={() => activeTab === 'registry' ? fetchArtifacts() : fetchSyncStatus()} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
                    </button>
                    {activeTab === 'registry' && (
                        <button className="btn-primary" onClick={() => setShowRegisterModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Upload size={14} /> Register Artifact
                        </button>
                    )}
                </div>
            </div>

            <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '6px' }}>
                <button
                    onClick={() => setActiveTab('registry')}
                    style={{ padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: activeTab === 'registry' ? 700 : 500, fontSize: '0.85rem', background: activeTab === 'registry' ? 'rgba(99,102,241,0.15)' : 'transparent', color: activeTab === 'registry' ? '#818cf8' : '#94a3b8', border: 'none', transition: 'all 0.2s' }}
                >
                    Artifact Registry
                </button>
                <button
                    onClick={() => setActiveTab('sync')}
                    style={{ padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: activeTab === 'sync' ? 700 : 500, fontSize: '0.85rem', background: activeTab === 'sync' ? 'rgba(99,102,241,0.15)' : 'transparent', color: activeTab === 'sync' ? '#818cf8' : '#94a3b8', border: 'none', transition: 'all 0.2s' }}
                >
                    Fleet Sync Status
                </button>
            </div>

            {activeTab === 'registry' && (
                <div className="glass-card" style={{ padding: '20px' }}>
                    {artifacts.length === 0 && !loading ? (
                        <div style={{ color: '#64748b', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0' }}>No artifacts registered.</div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table className="data-table" style={{ width: '100%', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr>
                                        <th>Artifact Name</th>
                                        <th>Type</th>
                                        <th>Version</th>
                                        <th>Plant</th>
                                        <th>Size</th>
                                        <th>Uploaded By</th>
                                        <th>Uploaded At</th>
                                        <th>Hash</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {artifacts.map((a, i) => (
                                        <tr key={i}>
                                            <td style={{ fontWeight: 600, color: '#f1f5f9' }}>{a.ArtifactName}</td>
                                            <td style={{ color: '#cbd5e1' }}>{a.Type.replace(/_/g, ' ')}</td>
                                            <td style={{ fontWeight: 700, color: '#818cf8' }}>v{a.Version}</td>
                                            <td style={{ color: '#94a3b8' }}>{a.PlantID === 'all_sites' ? 'Enterprise' : a.PlantID.replace(/_/g, ' ')}</td>
                                            <td style={{ color: '#94a3b8' }}>{formatBytes(a.FileSize)}</td>
                                            <td style={{ color: '#94a3b8' }}>{a.UploadedBy}</td>
                                            <td style={{ color: '#94a3b8' }}>{new Date(a.UploadedAt).toLocaleString()}</td>
                                            <td style={{ fontFamily: 'monospace', color: '#64748b' }}>{(a.ContentHash || '').substring(0, 8)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'sync' && (
                <div className="glass-card" style={{ padding: '20px' }}>
                    {Object.keys(groupedSync).length === 0 && !loading ? (
                        <div style={{ color: '#64748b', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0' }}>No sync data available.</div>
                    ) : (
                        Object.entries(groupedSync).map(([plant, rows]) => (
                            <div key={plant} style={{ marginBottom: '24px' }}>
                                <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem', fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <FileDigit size={16} color="#818cf8" /> {plant.replace(/_/g, ' ')}
                                </h3>
                                <div style={{ overflowX: 'auto' }}>
                                    <table className="data-table" style={{ width: '100%', fontSize: '0.85rem' }}>
                                        <thead>
                                            <tr>
                                                <th>Artifact</th>
                                                <th>Version</th>
                                                <th>Status</th>
                                                <th>Last Checked</th>
                                                <th>Synced At</th>
                                                <th>Error Note</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rows.map((r, i) => (
                                                <tr key={i}>
                                                    <td style={{ fontWeight: 600, color: '#f1f5f9' }}>{r.artifactName}</td>
                                                    <td style={{ fontWeight: 700, color: '#818cf8' }}>v{r.version}</td>
                                                    <td>
                                                        <span style={{
                                                            padding: '2px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700,
                                                            background: r.status === 'SYNCED' ? 'rgba(16,185,129,0.15)' : r.status === 'ERROR' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                                                            color: r.status === 'SYNCED' ? '#10b981' : r.status === 'ERROR' ? '#ef4444' : '#f59e0b'
                                                        }}>
                                                            {r.status}
                                                        </span>
                                                    </td>
                                                    <td style={{ color: '#94a3b8' }}>{r.lastCheckedAt ? new Date(r.lastCheckedAt).toLocaleString() : '—'}</td>
                                                    <td style={{ color: '#94a3b8' }}>{r.syncedAt ? new Date(r.syncedAt).toLocaleString() : '—'}</td>
                                                    <td style={{ color: '#ef4444' }}>{r.errorNote || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Register Modal */}
            {showRegisterModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
                    <div style={{ background: '#1e293b', padding: '24px', borderRadius: '12px', width: '400px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#f1f5f9' }}>Register Artifact</h2>
                            <button onClick={() => setShowRegisterModal(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: '#cbd5e1' }}>Artifact Name</label>
                                <input required type="text" value={registerForm.name} onChange={e => setRegisterForm(f => ({...f, name: e.target.value}))} className="form-input" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: '#cbd5e1' }}>Type</label>
                                <select value={registerForm.type} onChange={e => setRegisterForm(f => ({...f, type: e.target.value}))} className="form-input" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9' }}>
                                    <option value="DIGITAL_TWIN">Digital Twin</option>
                                    <option value="SOP_PDF">SOP PDF</option>
                                    <option value="TRAINING_VIDEO">Training Video</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: '#cbd5e1' }}>Plant Scope</label>
                                <input type="text" value={registerForm.plantId} onChange={e => setRegisterForm(f => ({...f, plantId: e.target.value}))} placeholder="all_sites or specific Plant_1" className="form-input" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: '#cbd5e1' }}>Absolute File Path</label>
                                <input required type="text" value={registerForm.filePath} onChange={e => setRegisterForm(f => ({...f, filePath: e.target.value}))} placeholder="/path/to/server/data/file.pdf" className="form-input" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9' }} />
                            </div>
                            {registerError && <div style={{ color: '#ef4444', fontSize: '0.85rem' }}>{registerError}</div>}
                            <button type="submit" disabled={registering} className="btn-primary" style={{ width: '100%', padding: '10px', marginTop: '8px', borderRadius: '6px', background: '#4f46e5', color: '#fff', border: 'none', fontWeight: 600, cursor: registering ? 'not-allowed' : 'pointer' }}>
                                {registering ? 'Registering...' : 'Register Artifact'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
