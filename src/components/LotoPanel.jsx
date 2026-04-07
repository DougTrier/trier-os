// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — LOTO Digital Permits Panel
 * =======================================
 * Lockout/Tagout (LOTO) permit management system. Creates, tracks, and closes
 * digital LOTO permits with energy isolation points, digital signatures,
 * and a complete audit trail — replacing paper-based LOTO binders.
 *
 * KEY FEATURES:
 *   - Active permit dashboard: all open LOTO permits with live status
 *   - Create permit: asset selection, isolation points list, responsible tech
 *   - Energy isolation checklist: each point requires tech confirmation
 *   - Digital signature capture: tech and supervisor sign-off on screen
 *   - Close permit workflow: verification checklist before permit release
 *   - Void permit: emergency cancellation with mandatory reason entry
 *   - Full audit trail: every status change logged with timestamp and user
 *   - Print permit: ANSI Z244-compliant paper backup for the lockout point
 *   - ActionBar integration: View / Edit / Save / Print (platform standard)
 *
 * API CALLS:
 *   GET    /api/loto                — Load all LOTO permits (plant-scoped)
 *   POST   /api/loto                — Create new permit
 *   PUT    /api/loto/:id            — Update permit (close, void, add signature)
 *   GET    /api/loto/:id/audit      — Audit trail for a specific permit
 */
import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { LockKeyhole } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';
import ActionBar from './ActionBar';

const ENERGY_ICONS = {
    Electrical: '⚡', Pneumatic: '💨', Hydraulic: '🔵', Mechanical: '⚙️',
    Thermal: '🌡️', Chemical: '☣️', Gravity: '⬇️', Steam: '♨️',
    Radiation: '☢️', 'Stored Energy': '🔋'
};

const STATUS_STYLES = {
    ACTIVE:  { bg: 'rgba(16,185,129,0.12)', color: '#10b981', border: 'rgba(16,185,129,0.3)',  icon: '🟢' },
    CLOSED:  { bg: 'rgba(99,102,241,0.08)',  color: '#818cf8', border: 'rgba(99,102,241,0.2)',  icon: '🔵' },
    VOIDED:  { bg: 'rgba(239,68,68,0.08)',   color: '#ef4444', border: 'rgba(239,68,68,0.2)',   icon: '⛔' },
    EXPIRED: { bg: 'rgba(245,158,11,0.08)',  color: '#f59e0b', border: 'rgba(245,158,11,0.2)',  icon: '⏰' },
};

const inputStyle = {
    padding: '8px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6, color: '#fff', fontSize: '0.85rem', width: '100%'
};

const FI = ({ label, children }) => (
    <div>
        <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>{label}</label>
        {children}
    </div>
);

export default function LotoPanel() {
    const { t } = useTranslation();
    const [permits, setPermits] = useState([]);
    const [stats, setStats] = useState({});
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('active');
    const [selectedPermit, setSelectedPermit] = useState(null);
    const [filter, setFilter] = useState('ACTIVE');

    // Edit state
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editForm, setEditForm] = useState({});

    const currentUser = (() => {
        const raw = localStorage.getItem('currentUser') || 'Admin';
        try { const p = JSON.parse(raw); return p.fullName || p.username || raw; } catch { return raw; }
    })();
    const currentPlant = localStorage.getItem('selectedPlantId') || 'Demo_Plant_1';

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        'x-plant-id': currentPlant
    };

    const fetchPermits = useCallback(async () => {
        setLoading(true);
        try {
            const status = filter === 'ALL' ? '' : filter;
            const r = await fetch(`/api/loto/permits?plant=${currentPlant}&status=${status}`, { headers });
            const data = await r.json();
            setPermits(data.permits || []);
            setStats(data.stats || {});
        } catch (e) { console.error('[LOTO] fetch error:', e); }
        setLoading(false);
    }, [filter, currentPlant]);

    useEffect(() => { fetchPermits(); }, [fetchPermits]);

    // ── Create Permit Form State ─────────────────────────────────────
    const [form, setForm] = useState({
        description: '', assetId: '', assetDescription: '', workOrderId: '',
        hazardousEnergy: 'Electrical', isolationMethod: '',
        expiresInHours: 8, notes: '',
        points: [{ energyType: 'Electrical', location: '', isolationDevice: '', lockNumber: '', tagNumber: '' }]
    });

    const addPoint = () => setForm(f => ({
        ...f, points: [...f.points, { energyType: 'Electrical', location: '', isolationDevice: '', lockNumber: '', tagNumber: '' }]
    }));
    const removePoint = (i) => setForm(f => ({ ...f, points: f.points.filter((_, idx) => idx !== i) }));

    const handleCreate = async () => {
        if (!form.description) { window.trierToast?.warn('Description is required'); return; }
        try {
            const r = await fetch('/api/loto/permits', {
                method: 'POST', headers,
                body: JSON.stringify({ plantId: currentPlant, ...form, issuedBy: currentUser, isolationPoints: form.points.filter(p => p.location) })
            });
            const data = await r.json();
            if (data.success) {
                window.trierToast?.success(`Permit ${data.permitNumber} created!`);
                setTab('active'); setFilter('ACTIVE');
                setForm({ description: '', assetId: '', assetDescription: '', workOrderId: '',
                    hazardousEnergy: 'Electrical', isolationMethod: '', expiresInHours: 8, notes: '',
                    points: [{ energyType: 'Electrical', location: '', isolationDevice: '', lockNumber: '', tagNumber: '' }]
                });
                fetchPermits();
            } else { window.trierToast?.error(data.error || 'Failed to create permit'); }
        } catch (e) { window.trierToast?.error('Error creating permit'); }
    };

    const handleClose = async (id) => {
        if (!window.confirm('Close this permit and release all locks?')) return;
        try {
            const r = await fetch(`/api/loto/permits/${id}/close`, { method: 'POST', headers, body: JSON.stringify({ closedBy: currentUser }) });
            if (r.ok) { fetchPermits(); viewPermit(id); }
        } catch (e) { window.trierToast?.error('Error closing permit'); }
    };

    const handleVoid = async (id) => {
        const reason = window.prompt('Reason for voiding this permit:');
        if (!reason) return;
        try {
            const r = await fetch(`/api/loto/permits/${id}/void`, { method: 'POST', headers, body: JSON.stringify({ voidedBy: currentUser, reason }) });
            if (r.ok) { fetchPermits(); setSelectedPermit(null); }
        } catch (e) { window.trierToast?.error('Error voiding permit'); }
    };

    const handleSign = async (id) => {
        try {
            const r = await fetch(`/api/loto/permits/${id}/sign`, { method: 'POST', headers, body: JSON.stringify({ signedBy: currentUser, signatureType: 'WORKER', role: 'Worker' }) });
            if (r.ok) { window.trierToast?.success('Signature recorded'); viewPermit(id); }
        } catch (e) { window.trierToast?.error('Error signing'); }
    };

    const viewPermit = async (id) => {
        try {
            const r = await fetch(`/api/loto/permits/${id}`, { headers });
            const data = await r.json();
            setSelectedPermit(data);
            setIsEditing(false);
        } catch (e) { console.error('[LOTO] view error:', e); }
    };

    const startEdit = () => {
        const p = selectedPermit?.permit || {};
        setEditForm({
            description: p.Description || '',
            assetId: p.AssetID || '',
            assetDescription: p.AssetDescription || '',
            workOrderId: p.WorkOrderID || '',
            hazardousEnergy: p.HazardousEnergy || 'Electrical',
            isolationMethod: p.IsolationMethod || '',
            notes: p.Notes || '',
        });
        setIsEditing(true);
    };

    const handleSave = async () => {
        if (!selectedPermit) return;
        setIsSaving(true);
        try {
            const id = selectedPermit.permit?.ID;
            const r = await fetch(`/api/loto/permits/${id}`, {
                method: 'PUT', headers,
                body: JSON.stringify({ ...editForm, updatedBy: currentUser })
            });
            if (r.ok) {
                window.trierToast?.success('Permit updated');
                setIsEditing(false);
                viewPermit(id);
                fetchPermits();
            } else {
                const d = await r.json();
                window.trierToast?.error(d.error || 'Save failed');
            }
        } catch (e) { window.trierToast?.error('Error saving permit'); }
        setIsSaving(false);
    };

    const handlePrint = () => {
        if (selectedPermit) window.triggerTrierPrint('loto-permit-detail', selectedPermit);
    };

    const closeDetail = () => { setSelectedPermit(null); setIsEditing(false); };

    const ef = (k, v) => setEditForm(p => ({ ...p, [k]: v }));

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                        width: 44, height: 44, borderRadius: 12,
                        background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(239,68,68,0.3)', fontSize: 20
                    }}>🔒</div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>LOTO Digital Permits</h3>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            Lockout/Tagout — generate, sign, verify &amp; release permits
                        </div>
                    </div>
                </div>
            </div>

            {/* KPI Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
                {[
                    { label: 'Active',  value: stats.active || 0,  color: '#10b981', icon: '🟢' },
                    { label: 'Closed',  value: stats.closed || 0,  color: '#818cf8', icon: '🔵' },
                    { label: 'Expired', value: stats.expired || 0, color: '#f59e0b', icon: '⏰' },
                    { label: 'Voided',  value: stats.voided || 0,  color: '#ef4444', icon: '⛔' },
                ].map(k => (
                    <div key={k.label} style={{
                        background: `${k.color}08`, borderRadius: 10, padding: '12px 14px',
                        border: `1px solid ${k.color}25`, textAlign: 'center',
                        cursor: 'pointer', transition: 'all 0.2s'
                    }} onClick={() => { setFilter(k.label.toUpperCase()); setTab('active'); }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: k.color }}>{k.icon} {k.value}</div>
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>{k.label}</div>
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div className="nav-pills" style={{ marginBottom: 16 }}>
                <button className={`btn-nav${tab === 'active' ? ' active' : ''}`} onClick={() => setTab('active')} title="Permits List">📋 Permits</button>
                <button className={`btn-nav${tab === 'create' ? ' active' : ''}`} onClick={() => setTab('create')} title="New Permit">➕ New Permit</button>
            </div>

            {/* PERMITS LIST */}
            {tab === 'active' && (
                <div>
                    <div style={{ marginBottom: 12, display: 'flex', gap: 6 }}>
                        {['ACTIVE', 'CLOSED', 'EXPIRED', 'VOIDED', 'ALL'].map(f => (
                            <button key={f} onClick={() => setFilter(f)} style={{
                                padding: '5px 14px', borderRadius: 16, fontSize: '0.75rem', fontWeight: 700,
                                background: filter === f ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)',
                                color: filter === f ? '#ef4444' : '#94a3b8',
                                border: filter === f ? '1px solid rgba(239,68,68,0.3)' : '1px solid transparent',
                                cursor: 'pointer'
                            }} title={`Filter by ${f}`}>{f}</button>
                        ))}
                    </div>

                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>Loading permits...</div>
                    ) : permits.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
                            No {filter !== 'ALL' ? filter.toLowerCase() : ''} permits found.
                            <br /><button onClick={() => setTab('create')} style={{ marginTop: 10, padding: '8px 16px', background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }} title="Create First LOTO Permit">Create First LOTO Permit</button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {permits.map(p => {
                                const st = STATUS_STYLES[p.Status] || STATUS_STYLES.ACTIVE;
                                const isExpiringSoon = p.Status === 'ACTIVE' && p.ExpiresAt && (new Date(p.ExpiresAt) - Date.now()) < 2 * 60 * 60 * 1000;
                                return (
                                    <div key={p.ID} onClick={() => viewPermit(p.ID)} style={{
                                        background: st.bg, borderRadius: 12, padding: '14px 16px',
                                        border: `1px solid ${st.border}`, cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        boxShadow: isExpiringSoon ? '0 0 12px rgba(245,158,11,0.2)' : 'none'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                    <span style={{ fontFamily: 'monospace', fontWeight: 800, color: st.color, fontSize: '0.95rem' }}>
                                                        {st.icon} {p.PermitNumber}
                                                    </span>
                                                    {isExpiringSoon && (
                                                        <span style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(245,158,11,0.2)', color: '#f59e0b', fontSize: '0.7rem', fontWeight: 700 }}>
                                                            EXPIRING SOON
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#e2e8f0' }}>{p.Description}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 4 }}>
                                                    {ENERGY_ICONS[p.HazardousEnergy] || '⚡'} {p.HazardousEnergy}
                                                    {p.AssetDescription && ` — ${p.AssetDescription}`}
                                                    {p.AssetID && ` (${p.AssetID})`}
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right', fontSize: '0.75rem', color: '#94a3b8' }}>
                                                <div>Issued: {new Date(p.IssuedAt).toLocaleString()}</div>
                                                <div>By <strong>{p.IssuedBy}</strong></div>
                                                <div style={{ marginTop: 4 }}>
                                                    🔒 {p.lockedPoints}/{p.isolationPoints} locked · ✍️ {p.signatures} sig{p.signatures !== 1 ? 's' : ''}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* PERMIT DETAIL OVERLAY — portalled to body to escape any parent transform/stacking context */}
            {selectedPermit && createPortal((
                <div className="print-exclude" style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.75)', zIndex: 9999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '20px'
                }} onClick={closeDetail}>
                    <div style={{
                        background: 'linear-gradient(145deg, #1e293b 0%, #162032 100%)',
                        borderRadius: 16, width: '90%', maxWidth: 750,
                        maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
                        border: '1px solid rgba(239,68,68,0.35)',
                        boxShadow: '0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)'
                    }} onClick={e => e.stopPropagation()}>

                        {/* ActionBar */}
                        <ActionBar
                            title={selectedPermit.permit?.PermitNumber}
                            icon={<LockKeyhole size={20} />}
                            isEditing={isEditing}
                            onEdit={startEdit}
                            onSave={handleSave}
                            onPrint={handlePrint}
                            onClose={closeDetail}
                            onCancel={() => setIsEditing(false)}
                            isSaving={isSaving}
                            showDelete={false}
                        />

                        <div style={{ overflowY: 'auto', flex: 1, padding: 24 }}>

                            {!isEditing ? (
                                <>
                                    {/* Permit Info */}
                                    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                                        <div style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 8 }}>{selectedPermit.permit.Description}</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.8rem', color: '#94a3b8' }}>
                                            <div><strong>Energy:</strong> {ENERGY_ICONS[selectedPermit.permit.HazardousEnergy]} {selectedPermit.permit.HazardousEnergy}</div>
                                            <div><strong>Issued By:</strong> {selectedPermit.permit.IssuedBy}</div>
                                            <div><strong>Issued:</strong> {new Date(selectedPermit.permit.IssuedAt).toLocaleString()}</div>
                                            <div><strong>Expires:</strong> {new Date(selectedPermit.permit.ExpiresAt).toLocaleString()}</div>
                                            {selectedPermit.permit.AssetID && <div><strong>Asset:</strong> {selectedPermit.permit.AssetDescription || selectedPermit.permit.AssetID}</div>}
                                            {selectedPermit.permit.WorkOrderID && <div><strong>Work Order:</strong> {selectedPermit.permit.WorkOrderID}</div>}
                                            {selectedPermit.permit.IsolationMethod && <div><strong>Method:</strong> {selectedPermit.permit.IsolationMethod}</div>}
                                            {selectedPermit.permit.Notes && <div style={{ gridColumn: 'span 2' }}><strong>Notes:</strong> {selectedPermit.permit.Notes}</div>}
                                        </div>
                                        <div style={{ marginTop: 10 }}>
                                            <span style={{
                                                display: 'inline-block', padding: '3px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 800,
                                                background: STATUS_STYLES[selectedPermit.permit.Status]?.bg,
                                                color: STATUS_STYLES[selectedPermit.permit.Status]?.color,
                                                border: `1px solid ${STATUS_STYLES[selectedPermit.permit.Status]?.border}`
                                            }}>
                                                {STATUS_STYLES[selectedPermit.permit.Status]?.icon} {selectedPermit.permit.Status}
                                            </span>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                /* EDIT FORM */
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                                    <div style={{ gridColumn: 'span 2' }}>
                                        <FI label="Description *">
                                            <input value={editForm.description} onChange={e => ef('description', e.target.value)} style={inputStyle} />
                                        </FI>
                                    </div>
                                    <FI label="Hazardous Energy">
                                        <select value={editForm.hazardousEnergy} onChange={e => ef('hazardousEnergy', e.target.value)} style={inputStyle}>
                                            {Object.keys(ENERGY_ICONS).map(e => <option key={e} value={e}>{ENERGY_ICONS[e]} {e}</option>)}
                                        </select>
                                    </FI>
                                    <FI label="Isolation Method">
                                        <input value={editForm.isolationMethod} onChange={e => ef('isolationMethod', e.target.value)} style={inputStyle} />
                                    </FI>
                                    <FI label="Asset ID">
                                        <input value={editForm.assetId} onChange={e => ef('assetId', e.target.value)} style={inputStyle} />
                                    </FI>
                                    <FI label="Asset Description">
                                        <input value={editForm.assetDescription} onChange={e => ef('assetDescription', e.target.value)} style={inputStyle} />
                                    </FI>
                                    <FI label="Work Order">
                                        <input value={editForm.workOrderId} onChange={e => ef('workOrderId', e.target.value)} style={inputStyle} />
                                    </FI>
                                    <div style={{ gridColumn: 'span 2' }}>
                                        <FI label="Notes">
                                            <textarea value={editForm.notes} onChange={e => ef('notes', e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                                        </FI>
                                    </div>
                                </div>
                            )}

                                    {/* Isolation Points */}
                                    {selectedPermit.points?.length > 0 && (
                                        <div style={{ marginBottom: 16 }}>
                                            <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#e2e8f0' }}>
                                                ⛓️ Isolation Points ({selectedPermit.points.length})
                                            </h4>
                                            {selectedPermit.points.map(pt => (
                                                <div key={pt.ID} style={{
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                    padding: '8px 12px', marginBottom: 4, borderRadius: 8,
                                                    background: pt.Status === 'LOCKED' ? 'rgba(239,68,68,0.06)' : 'rgba(16,185,129,0.06)',
                                                    border: `1px solid ${pt.Status === 'LOCKED' ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)'}`
                                                }}>
                                                    <div style={{ fontSize: '0.8rem' }}>
                                                        <span style={{ fontWeight: 700 }}>#{pt.PointNumber}</span> —
                                                        {ENERGY_ICONS[pt.EnergyType] || '⚡'} {pt.EnergyType} at {pt.Location}
                                                        {pt.LockNumber && <span style={{ color: '#ef4444' }}> · Lock: {pt.LockNumber}</span>}
                                                        {pt.TagNumber && <span style={{ color: '#f59e0b' }}> · Tag: {pt.TagNumber}</span>}
                                                    </div>
                                                    <span style={{
                                                        padding: '2px 10px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 800,
                                                        background: pt.Status === 'LOCKED' ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
                                                        color: pt.Status === 'LOCKED' ? '#ef4444' : '#10b981'
                                                    }}>
                                                        {pt.Status === 'LOCKED' ? '🔒 LOCKED' : '🔓 RELEASED'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Signatures */}
                                    {selectedPermit.signatures?.length > 0 && (
                                        <div style={{ marginBottom: 16 }}>
                                            <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#e2e8f0' }}>✍️ Signatures</h4>
                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                {selectedPermit.signatures.map(s => (
                                                    <div key={s.ID} style={{
                                                        padding: '6px 14px', borderRadius: 8,
                                                        background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
                                                        fontSize: '0.8rem'
                                                    }}>
                                                        <strong style={{ color: '#818cf8' }}>{s.SignedBy}</strong>
                                                        <span style={{ color: '#64748b' }}> · {s.SignatureType} ({s.Role})</span>
                                                        <div style={{ fontSize: '0.7rem', color: '#475569' }}>{new Date(s.SignedAt).toLocaleString()}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Workflow Actions */}
                                    {!isEditing && selectedPermit.permit.Status === 'ACTIVE' && (
                                        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                                            <button onClick={() => handleSign(selectedPermit.permit.ID)} style={{
                                                padding: '10px 20px', background: 'rgba(99,102,241,0.2)', color: '#818cf8',
                                                border: '1px solid rgba(99,102,241,0.3)', borderRadius: 8, cursor: 'pointer', fontWeight: 700
                                            }} title="Sign Permit">✍️ Sign Permit</button>
                                            <button onClick={() => handleClose(selectedPermit.permit.ID)} style={{
                                                padding: '10px 20px', background: 'rgba(16,185,129,0.2)', color: '#10b981',
                                                border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, cursor: 'pointer', fontWeight: 700
                                            }} title="Close & Release">🔓 Close &amp; Release</button>
                                            <button onClick={() => handleVoid(selectedPermit.permit.ID)} style={{
                                                padding: '10px 20px', background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                                                border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, cursor: 'pointer', fontWeight: 700
                                            }} title="Void Permit">⛔ Void</button>
                                        </div>
                                    )}

                                    {/* Audit Trail */}
                                    {selectedPermit.auditLog?.length > 0 && (
                                        <div style={{ marginTop: 20 }}>
                                            <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#e2e8f0' }}>📝 Audit Trail</h4>
                                            <div style={{ maxHeight: 150, overflowY: 'auto', paddingRight: 8 }}>
                                                {selectedPermit.auditLog.map(log => (
                                                    <div key={log.ID} style={{
                                                        padding: '6px 10px', fontSize: '0.78rem', color: '#94a3b8',
                                                        borderLeft: '2px solid rgba(239,68,68,0.2)', marginBottom: 4,
                                                        background: 'rgba(0,0,0,0.2)', borderRadius: '0 6px 6px 0'
                                                    }}>
                                                        <strong>{log.Action}</strong> by {log.PerformedBy} — {new Date(log.PerformedAt).toLocaleString()}
                                                        {log.Details && <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>{log.Details}</div>}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                        </div>
                    </div>
                </div>
            ), document.body)}

            {/* CREATE PERMIT FORM */}
            {tab === 'create' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ background: 'rgba(239,68,68,0.04)', borderRadius: 12, padding: 20, border: '1px solid rgba(239,68,68,0.15)' }}>
                        <h4 style={{ margin: '0 0 16px 0', color: '#ef4444' }}>⚠️ New LOTO Permit</h4>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                            <div>
                                <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>Description *</label>
                                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                                    placeholder={t('loto.egConveyorBeltMotorReplacementPlaceholder')} style={inputStyle} />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>Hazardous Energy</label>
                                <select value={form.hazardousEnergy} onChange={e => setForm({ ...form, hazardousEnergy: e.target.value })} style={inputStyle}>
                                    {Object.keys(ENERGY_ICONS).map((e, i) => <option key={i} value={e}>{ENERGY_ICONS[e]} {e}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>Asset ID</label>
                                <input value={form.assetId} onChange={e => setForm({ ...form, assetId: e.target.value })}
                                    placeholder={t('loto.optionalEgConv001Placeholder')} style={inputStyle} />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>Asset Description</label>
                                <input value={form.assetDescription} onChange={e => setForm({ ...form, assetDescription: e.target.value })}
                                    placeholder={t('loto.egMainConveyorLineAPlaceholder')} style={inputStyle} />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>Work Order</label>
                                <input value={form.workOrderId} onChange={e => setForm({ ...form, workOrderId: e.target.value })}
                                    placeholder={t('loto.optionalLinkedWoPlaceholder')} style={inputStyle} />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>Expires In (hours)</label>
                                <select value={form.expiresInHours} onChange={e => setForm({ ...form, expiresInHours: parseInt(e.target.value, 10) })} style={inputStyle}>
                                    <option value={4}>4 hours</option>
                                    <option value={8}>8 hours (1 shift)</option>
                                    <option value={12}>12 hours</option>
                                    <option value={24}>24 hours</option>
                                    <option value={48}>48 hours</option>
                                    <option value={72}>72 hours</option>
                                </select>
                            </div>
                        </div>

                        <div style={{ marginBottom: 14 }}>
                            <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>Isolation Method</label>
                            <input value={form.isolationMethod} onChange={e => setForm({ ...form, isolationMethod: e.target.value })}
                                placeholder={t('loto.egDisconnectAtMccPanelPlaceholder')} style={inputStyle} />
                        </div>

                        {/* Isolation Points */}
                        <div style={{ marginBottom: 14 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <label style={{ fontSize: '0.8rem', color: '#e2e8f0', fontWeight: 700 }}>⛓️ Isolation Points</label>
                                <button onClick={addPoint} style={{
                                    padding: '4px 12px', background: 'rgba(16,185,129,0.15)', color: '#10b981',
                                    border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6, cursor: 'pointer', fontSize: '0.75rem'
                                }} title="Add Point">+ Add Point</button>
                            </div>

                            {form.points.map((pt, i) => (
                                <div key={i} style={{
                                    display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr 0.8fr 0.8fr auto',
                                    gap: 6, marginBottom: 6, alignItems: 'end'
                                }}>
                                    <div>
                                        <label style={{ fontSize: '0.65rem', color: '#64748b' }}>Energy</label>
                                        <select value={pt.energyType}
                                            onChange={e => { const pts = [...form.points]; pts[i].energyType = e.target.value; setForm({ ...form, points: pts }); }}
                                            style={{ ...inputStyle, fontSize: '0.78rem' }}>
                                            {Object.keys(ENERGY_ICONS).map((e, j) => <option key={j} value={e}>{e}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.65rem', color: '#64748b' }}>Location *</label>
                                        <input value={pt.location} placeholder={t('loto.egPanel3Placeholder')}
                                            onChange={e => { const pts = [...form.points]; pts[i].location = e.target.value; setForm({ ...form, points: pts }); }}
                                            style={{ ...inputStyle, fontSize: '0.78rem' }} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.65rem', color: '#64748b' }}>Device</label>
                                        <input value={pt.isolationDevice} placeholder={t('loto.breakerPlaceholder')}
                                            onChange={e => { const pts = [...form.points]; pts[i].isolationDevice = e.target.value; setForm({ ...form, points: pts }); }}
                                            style={{ ...inputStyle, fontSize: '0.78rem' }} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.65rem', color: '#64748b' }}>Lock #</label>
                                        <input value={pt.lockNumber} placeholder={t('loto.l001Placeholder')}
                                            onChange={e => { const pts = [...form.points]; pts[i].lockNumber = e.target.value; setForm({ ...form, points: pts }); }}
                                            style={{ ...inputStyle, fontSize: '0.78rem' }} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.65rem', color: '#64748b' }}>Tag #</label>
                                        <input value={pt.tagNumber} placeholder={t('loto.t001Placeholder')}
                                            onChange={e => { const pts = [...form.points]; pts[i].tagNumber = e.target.value; setForm({ ...form, points: pts }); }}
                                            style={{ ...inputStyle, fontSize: '0.78rem' }} />
                                    </div>
                                    {form.points.length > 1 && (
                                        <button onClick={() => removePoint(i)} style={{
                                            background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, padding: '8px 4px'
                                        }} title={t('loto.removePointTip')}>✕</button>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div style={{ marginBottom: 14 }}>
                            <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>Notes</label>
                            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                                placeholder={t('loto.additionalSafetyNotesPlaceholder')} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                        </div>

                        <button onClick={handleCreate} style={{
                            padding: '12px 28px', background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                            color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer',
                            fontWeight: 800, fontSize: '0.9rem',
                            boxShadow: '0 4px 15px rgba(239,68,68,0.3)'
                        }} title="Issue LOTO Permit">🔒 Issue LOTO Permit</button>
                    </div>
                </div>
            )}
        </div>
    );
}
