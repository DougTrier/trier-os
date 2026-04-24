// Copyright © 2026 Trier OS. All Rights Reserved.

import React, { useState, useEffect, useCallback } from 'react';
import { ClipboardList, Send, CheckCircle2, RefreshCw, LogIn, LogOut, Clock, AlertTriangle, FileText, Wrench, Lock } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

const makeAPI = (plantId) => (path, method = 'GET', body = null) => {
    const headers = {
        'x-plant-id': plantId || localStorage.getItem('selectedPlantId') || 'Demo_Plant_1',
        'Content-Type': 'application/json'
    };
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);
    return fetch(path, options).then(async r => {
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            throw new Error(err.error || 'API Error');
        }
        return r.json();
    });
};

export default function ShiftHandoverView({ plantId }) {
    const { t } = useTranslation();
    const API = makeAPI(plantId);
    const [tab, setTab] = useState('incoming'); // incoming | outgoing | history
    const [notes, setNotes] = useState('');
    const [handovers, setHandovers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState(null);

    const [previewItems, setPreviewItems] = useState([]);
    const [previewLoading, setPreviewLoading] = useState(false);

    const currentUser = localStorage.getItem('currentUser') || 'Unknown User';

    const loadHistory = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await API('/api/shift-handover/history?limit=50');
            setHandovers(res.data || []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    // incoming and history tabs both display the same handover list — filter is applied client-side below
    useEffect(() => {
        if (tab === 'incoming' || tab === 'history') {
            loadHistory();
        }
    }, [tab, loadHistory]);

    useEffect(() => {
        if (tab !== 'outgoing') return;
        setPreviewLoading(true);
        API('/api/shift-handover/preview')
            .then(data => setPreviewItems(data.items || []))
            .catch(() => setPreviewItems([]))
            .finally(() => setPreviewLoading(false));
    }, [tab, API]);

    const submitHandover = async () => {
        setLoading(true);
        setError(null);
        setSuccessMsg(null);
        try {
            await API('/api/shift-handover', 'POST', { notes });
            setSuccessMsg('Shift handover submitted successfully.');
            setNotes('');
            setTab('incoming');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const acknowledgeHandover = async (id) => {
        setLoading(true);
        setError(null);
        setSuccessMsg(null);
        try {
            await API(`/api/shift-handover/${id}/acknowledge`, 'POST');
            setSuccessMsg('Shift handover acknowledged.');
            loadHistory();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // PENDING_ACK = submitted but incoming shift has not yet signed; ACKNOWLEDGED = chain of custody is closed
    const pendingHandovers = handovers.filter(h => h.Status === 'PENDING_ACK');
    const pastHandovers = handovers.filter(h => h.Status === 'ACKNOWLEDGED');

    const renderItems = (items) => {
        if (!items || items.length === 0) return <div style={{ color: '#64748b', fontSize: '0.85rem' }}>No linked items.</div>;
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                {items.map((item, index) => {
                    // preview endpoint returns camelCase; persisted handover items return PascalCase — normalize both
                    const type = item.ItemType || item.itemType;
                    const refId = item.RefID || item.refId;
                    const notes = item.Notes || item.notes;
                    return (
                        <div key={item.ID || index} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.03)', padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)' }}>
                            {type === 'open_wo' && <Wrench size={14} color="#3b82f6" />}
                            {type === 'active_hold' && <Clock size={14} color="#f59e0b" />}
                            {type === 'safety_flag' && <AlertTriangle size={14} color="#ef4444" />}
                            {type === 'loto_flag' && <Lock size={14} color="#a855f7" />}
                            {type === 'active_segment' && <Wrench size={14} color="#10b981" />}
                            <span style={{ fontSize: '0.85rem', color: '#e2e8f0', fontWeight: 600 }}>{refId}</span>
                            <span style={{ fontSize: '0.8rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{notes}</span>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-base)', overflow: 'hidden' }}>
            <div className="glass-card no-print" style={{ padding: '15px 25px', display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0 }}>
                <h2 style={{ fontSize: '1.4rem', margin: 0, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <ClipboardList size={24} /> Shift Handover
                </h2>
                <div style={{ width: 2, height: 30, background: 'var(--glass-border)' }} />
                <div className="nav-pills" style={{ padding: 0, margin: 0, background: 'transparent' }}>
                    <button onClick={() => setTab('incoming')} className={`btn-nav ${tab === 'incoming' ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <LogIn size={14} /> Incoming Shift
                        {pendingHandovers.length > 0 && <span style={{ background: '#ef4444', color: '#fff', padding: '2px 6px', borderRadius: 10, fontSize: '0.7rem' }}>{pendingHandovers.length}</span>}
                    </button>
                    <button onClick={() => setTab('outgoing')} className={`btn-nav ${tab === 'outgoing' ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <LogOut size={14} /> Outgoing Shift
                    </button>
                    <button onClick={() => setTab('history')} className={`btn-nav ${tab === 'history' ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <FileText size={14} /> History
                    </button>
                </div>
                <div style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                    Current Tech: <strong style={{ color: '#f1f5f9' }}>{currentUser}</strong>
                </div>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: '0 4px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {error && <div style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '10px 16px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)' }}>{error}</div>}
                {successMsg && <div style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', padding: '10px 16px', borderRadius: 8, border: '1px solid rgba(16,185,129,0.2)' }}>{successMsg}</div>}

                {tab === 'outgoing' && (
                    <div className="glass-card" style={{ padding: 24, maxWidth: 800, margin: '0 auto', width: '100%' }}>
                        <h3 style={{ margin: '0 0 20px', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <LogOut size={20} color="#3b82f6" /> Submit Shift Handover
                        </h3>
                        <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: 20 }}>
                            Submitting this form will automatically snapshot your open work orders, active holds, and current safety flags.
                            These will be appended to the handover log for the incoming shift.
                        </p>
                        
                        {previewLoading ? (
                            <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: 16 }}>Loading your current shift state…</div>
                        ) : previewItems.length > 0 ? (
                            <div style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, fontWeight: 600 }}>
                                    Will be captured on submit ({previewItems.length} items)      
                                </div>
                                {renderItems(previewItems)}
                            </div>
                        ) : (
                            <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: 16 }}>
                                No active segments, holds, or permits found for your account.     
                            </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: 8, color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600 }}>Shift Notes / Passdown</label>
                                <textarea 
                                    value={notes} 
                                    onChange={e => setNotes(e.target.value)}
                                    placeholder="Enter critical information for the incoming shift..."
                                    style={{ width: '100%', minHeight: 120, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: 12, color: '#f1f5f9', resize: 'vertical' }}
                                />
                            </div>
                            <button 
                                onClick={submitHandover} 
                                disabled={loading}
                                style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 8, fontSize: '1rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start' }}
                            >
                                {loading ? <RefreshCw size={18} className="spinning" /> : <Send size={18} />}
                                Submit Handover
                            </button>
                        </div>
                    </div>
                )}

                {tab === 'incoming' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1000, margin: '0 auto', width: '100%' }}>
                        {loading && pendingHandovers.length === 0 && <div style={{ color: '#94a3b8' }}>Loading...</div>}
                        {!loading && pendingHandovers.length === 0 && (
                            <div className="glass-card" style={{ padding: 40, textAlign: 'center', color: '#10b981' }}>
                                <CheckCircle2 size={48} style={{ marginBottom: 16, opacity: 0.8 }} />
                                <h3>You're all caught up!</h3>
                                <p style={{ color: '#94a3b8', marginTop: 8 }}>There are no pending shift handovers requiring your acknowledgment.</p>
                            </div>
                        )}
                        {pendingHandovers.map(h => (
                            <div key={h.ID} className="glass-card" style={{ padding: 20, borderLeft: '4px solid #f59e0b' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                                    <div>
                                        <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Pending Acknowledgment</div>
                                        <h3 style={{ margin: 0, color: '#f1f5f9', fontSize: '1.2rem' }}>From: {h.OutgoingTech}</h3>
                                        <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 4 }}>{new Date(h.CreatedAt).toLocaleString()}</div>
                                    </div>
                                    <button 
                                        onClick={() => acknowledgeHandover(h.ID)}
                                        disabled={loading}
                                        style={{ background: '#10b981', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                                    >
                                        <CheckCircle2 size={16} /> Acknowledge
                                    </button>
                                </div>
                                {h.Notes && (
                                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: 16, borderRadius: 8, color: '#e2e8f0', fontSize: '0.95rem', whiteSpace: 'pre-wrap', marginBottom: 16 }}>
                                        {h.Notes}
                                    </div>
                                )}
                                <div>
                                    <strong style={{ fontSize: '0.85rem', color: '#94a3b8', textTransform: 'uppercase' }}>Auto-Captured Context</strong>
                                    {renderItems(h.items)}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {tab === 'history' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1000, margin: '0 auto', width: '100%' }}>
                        {pastHandovers.length === 0 ? (
                            <div style={{ color: '#64748b', textAlign: 'center', padding: 40 }}>No past handovers found.</div>
                        ) : (
                            pastHandovers.map(h => (
                                <div key={h.ID} className="glass-card" style={{ padding: 20, borderLeft: '4px solid #10b981', opacity: 0.85 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                                        <div>
                                            <h3 style={{ margin: 0, color: '#f1f5f9', fontSize: '1.1rem' }}>{h.OutgoingTech} → {h.IncomingTech}</h3>
                                            <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 4 }}>Submitted: {new Date(h.CreatedAt).toLocaleString()}</div>
                                        </div>
                                        <div style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', padding: '4px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <CheckCircle2 size={14} /> ACKNOWLEDGED
                                        </div>
                                    </div>
                                    {h.Notes && (
                                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: 16, borderRadius: 8, color: '#e2e8f0', fontSize: '0.9rem', whiteSpace: 'pre-wrap', marginBottom: 16 }}>
                                            {h.Notes}
                                        </div>
                                    )}
                                    <details>
                                        <summary style={{ cursor: 'pointer', color: '#818cf8', fontSize: '0.85rem', fontWeight: 600 }}>View Captured Context ({h.items?.length || 0} items)</summary>
                                        <div style={{ marginTop: 10 }}>
                                            {renderItems(h.items)}
                                        </div>
                                    </details>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
