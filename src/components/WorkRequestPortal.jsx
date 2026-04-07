// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Public Work Request Portal
 * =======================================
 * Login-free maintenance request form accessible to anyone on the plant network.
 * Operations staff, production workers, and visitors can submit requests without
 * a Trier OS account. Optimized for Zebra TC77 mobile browser.
 *
 * KEY FEATURES:
 *   - No login required: open access for production floor request submission
 *   - Plant selector: requestor chooses their facility
 *   - Request form: description, location, priority, contact info
 *   - Photo/PDF attachments: capture photos or upload files as evidence
 *   - Camera capture: inline camera for mobile devices (Zebra TC77 optimized)
 *   - Reference number: unique ticket number displayed on submission for tracking
 *   - Status tracking: requestor can check status by reference number
 *   - Auto-creates WO: submission creates a work order in pending review status
 *
 * DATA SOURCES:
 *   GET  /api/work-requests/plants    — Plant list for selector (no auth)
 *   POST /api/work-requests           — Submit new request (no auth)
 *   GET  /api/work-requests/:ref      — Status check by reference number (no auth)
 */
import React, { useState, useEffect, useRef } from 'react';
import { Send, CheckCircle, AlertTriangle, Search, Building2, User, Mail, Phone, MapPin, FileText, Paperclip, Camera, X } from 'lucide-react';
import { formatDate } from '../utils/formatDate';
import { useTranslation } from '../i18n/index.jsx';

/**
 * Public Work Order Request Portal
 * ================================
 * Accessible without login. Allows anyone to submit a maintenance request
 * with optional photo/PDF attachments. Provides a reference number for
 * status tracking. Optimized for Zebra TC77 mobile browser.
 */
export default function WorkRequestPortal() {
    const { t } = useTranslation();
    const fileInputRef = useRef(null);

    const [plants, setPlants] = useState([]);
    const [form, setForm] = useState({
        plantId: '',
        description: '',
        location: '',
        requesterName: '',
        requesterEmail: '',
        requesterPhone: '',
        priority: '3',
        assetId: ''
    });
    const [files, setFiles] = useState([]);
    const [filePreviews, setFilePreviews] = useState([]);
    const [submitted, setSubmitted] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [statusCheck, setStatusCheck] = useState({ ref: '', result: null, loading: false });

    useEffect(() => {
        fetch('/api/public/plants')
            .then(r => r.json())
            .then(p => {
                setPlants(p || []);
                if (p && p.length > 0 && !form.plantId) setForm(f => ({ ...f, plantId: p[0].id }));
            })
            .catch(e => console.warn('[WorkRequestPortal] fetch error:', e));
    }, []);

    // Build object-URL previews whenever files change
    useEffect(() => {
        const urls = files.map(f => f.type.startsWith('image/') ? URL.createObjectURL(f) : null);
        setFilePreviews(urls);
        return () => urls.forEach(u => u && URL.revokeObjectURL(u));
    }, [files]);

    const addFiles = (incoming) => {
        setFiles(prev => {
            const combined = [...prev, ...Array.from(incoming)];
            return combined.slice(0, 3); // enforce max 3
        });
    };

    const removeFile = (idx) => setFiles(prev => prev.filter((_, i) => i !== idx));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.description || !form.requesterName) {
            setError('Please fill in the required fields.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const fd = new FormData();
            Object.entries(form).forEach(([k, v]) => fd.append(k, v));
            files.forEach(file => fd.append('files', file));

            const res = await fetch('/api/public/work-request', { method: 'POST', body: fd });
            const data = await res.json();
            if (data.success) {
                setSubmitted(data);
                setFiles([]);
            } else {
                setError(data.error || 'Submission failed');
            }
        } catch (err) {
            setError('Network error. Please try again.');
        }
        setLoading(false);
    };

    const checkStatus = async () => {
        if (!statusCheck.ref.trim()) return;
        setStatusCheck(s => ({ ...s, loading: true, result: null }));
        try {
            const res = await fetch(`/api/public/request-status/${statusCheck.ref.trim()}`);
            const data = await res.json();
            setStatusCheck(s => ({ ...s, result: data, loading: false }));
        } catch {
            setStatusCheck(s => ({ ...s, result: { found: false, message: 'Network error' }, loading: false }));
        }
    };

    const resetForm = () => {
        setSubmitted(null);
        setFiles([]);
        setForm({ plantId: plants[0]?.id || '', description: '', location: '', requesterName: '', requesterEmail: '', requesterPhone: '', priority: '3', assetId: '' });
    };

    const priorityLabels = { '1': '🔴 Emergency', '2': '🟠 High', '3': '🟡 Normal', '4': '🟢 Low' };

    const inputStyle = {
        width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10,
        color: '#f1f5f9', fontSize: '0.9rem', outline: 'none',
        transition: 'border-color 0.2s', boxSizing: 'border-box',
    };

    const labelStyle = {
        display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem',
        fontWeight: 600, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase',
        letterSpacing: '0.04em',
    };

    // ── Success Screen ──────────────────────────────────────────────────────
    if (submitted) {
        return (
            <div style={{
                minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg, #0f0a2e 0%, #1a1145 50%, #0d1b3e 100%)',
                fontFamily: 'system-ui, sans-serif', padding: 20,
            }}>
                <div style={{
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(16,185,129,0.3)',
                    borderRadius: 20, padding: 40, maxWidth: 500, width: '100%', textAlign: 'center',
                }}>
                    <CheckCircle size={64} color="#10b981" style={{ marginBottom: 16 }} />
                    <h1 style={{ color: '#f1f5f9', fontSize: '1.6rem', marginBottom: 8 }}>Request Submitted!</h1>
                    <p style={{ color: '#94a3b8', marginBottom: 24 }}>
                        Your maintenance request has been received and logged.
                    </p>
                    <div style={{
                        background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)',
                        borderRadius: 12, padding: '20px 24px', marginBottom: 24,
                    }}>
                        <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
                            Reference Number
                        </div>
                        <div style={{ color: '#10b981', fontSize: '1.8rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                            {submitted.referenceNumber}
                        </div>
                        <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: 4 }}>
                            Save this number to check your request status
                        </div>
                        {submitted.attachments?.length > 0 && (
                            <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: 8 }}>
                                📎 {submitted.attachments.length} file{submitted.attachments.length > 1 ? 's' : ''} attached
                            </div>
                        )}
                    </div>
                    <button
                        onClick={resetForm}
                        style={{
                            padding: '12px 24px', background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10,
                            color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                        }}
                        title={t('workRequestPortal.submitAnotherRequestTip')}>
                        Submit Another Request
                    </button>
                </div>
            </div>
        );
    }

    // ── Main Form ───────────────────────────────────────────────────────────
    return (
        <div style={{
            minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #0f0a2e 0%, #1a1145 50%, #0d1b3e 100%)',
            fontFamily: 'system-ui, sans-serif', padding: 20,
        }}>
            <div style={{ maxWidth: 560, width: '100%' }}>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                    <img src="/assets/TrierLogoPrint.png" alt="Trier OS" style={{ width: 100, marginBottom: 12 }} />
                    <h1 style={{ color: '#f1f5f9', fontSize: '1.4rem', fontWeight: 800, marginBottom: 4 }}>
                        Maintenance Request Portal
                    </h1>
                    <p style={{ color: '#64748b', fontSize: '0.8rem' }}>
                        Submit a maintenance or repair request. No login required.
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} style={{
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 16, padding: 28,
                }}>
                    {error && (
                        <div style={{
                            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                            borderRadius: 8, padding: '10px 14px', marginBottom: 16,
                            color: '#fca5a5', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                            <AlertTriangle size={14} /> {error}
                        </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                        <div>
                            <label style={labelStyle}><User size={13} /> Your Name *</label>
                            <input style={inputStyle} value={form.requesterName} onChange={e => setForm(f => ({ ...f, requesterName: e.target.value }))} placeholder={t('workRequestPortal.johnSmithPlaceholder')} required />
                        </div>
                        <div>
                            <label style={labelStyle}><Mail size={13} /> Email</label>
                            <input style={inputStyle} type="email" value={form.requesterEmail} onChange={e => setForm(f => ({ ...f, requesterEmail: e.target.value }))} placeholder={t('workRequestPortal.johncompanycomPlaceholder')} />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                        <div>
                            <label style={labelStyle}><Phone size={13} /> Phone</label>
                            <input style={inputStyle} value={form.requesterPhone} onChange={e => setForm(f => ({ ...f, requesterPhone: e.target.value }))} placeholder="(555) 123-4567" />
                        </div>
                        <div>
                            <label style={labelStyle}><Building2 size={13} /> Plant / Facility</label>
                            <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.plantId} onChange={e => setForm(f => ({ ...f, plantId: e.target.value }))}>
                                {plants.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                            </select>
                        </div>
                    </div>

                    <div style={{ marginBottom: 16 }}>
                        <label style={labelStyle}><MapPin size={13} /> Location / Area</label>
                        <input style={inputStyle} value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder={t('workRequestPortal.buildingA2ndFloorNearPlaceholder')} />
                    </div>

                    <div style={{ marginBottom: 16 }}>
                        <label style={labelStyle}><FileText size={13} /> Description of Problem *</label>
                        <textarea
                            style={{ ...inputStyle, height: 100, resize: 'vertical' }}
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            placeholder={t('workRequestPortal.describeTheIssueWhatsBrokenPlaceholder')}
                            required
                        />
                    </div>

                    {/* ── Photo / File Attachments ── */}
                    <div style={{ marginBottom: 16 }}>
                        <label style={labelStyle}><Paperclip size={13} /> Photos / Attachments <span style={{ color: '#475569', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional · max 3 · 10 MB each)</span></label>

                        {/* Drop zone / preview area */}
                        <div
                            onClick={() => files.length < 3 && fileInputRef.current?.click()}
                            style={{
                                border: `2px dashed ${files.length > 0 ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.1)'}`,
                                borderRadius: 10, padding: files.length > 0 ? 12 : 20,
                                textAlign: 'center', cursor: files.length < 3 ? 'pointer' : 'default',
                                background: files.length > 0 ? 'rgba(99,102,241,0.04)' : 'transparent',
                                transition: 'border-color 0.2s',
                                minHeight: 72, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            {files.length === 0 ? (
                                <div>
                                    <Camera size={28} color="#475569" style={{ marginBottom: 6 }} />
                                    <div style={{ color: '#64748b', fontSize: '0.82rem', fontWeight: 600 }}>
                                        Tap to add photos or PDFs
                                    </div>
                                    <div style={{ color: '#334155', fontSize: '0.7rem', marginTop: 3 }}>
                                        .jpg · .png · .webp · .heic · .pdf
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', width: '100%' }}>
                                    {files.map((file, i) => (
                                        <div key={i} style={{ position: 'relative', flexShrink: 0 }}>
                                            {filePreviews[i] ? (
                                                <img
                                                    src={filePreviews[i]}
                                                    alt={file.name}
                                                    style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, display: 'block' }}
                                                />
                                            ) : (
                                                <div style={{
                                                    width: 80, height: 80, background: 'rgba(255,255,255,0.06)',
                                                    borderRadius: 8, display: 'flex', flexDirection: 'column',
                                                    alignItems: 'center', justifyContent: 'center', gap: 4, padding: 6
                                                }}>
                                                    <FileText size={24} color="#94a3b8" />
                                                    <span style={{ fontSize: '0.58rem', color: '#64748b', maxWidth: 68, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
                                                        {file.name}
                                                    </span>
                                                </div>
                                            )}
                                            {/* Remove button — large enough for fat fingers */}
                                            <button
                                                type="button"
                                                onClick={e => { e.stopPropagation(); removeFile(i); }}
                                                style={{
                                                    position: 'absolute', top: -8, right: -8,
                                                    width: 24, height: 24, borderRadius: '50%',
                                                    background: '#ef4444', border: '2px solid #0f0a2e',
                                                    color: '#fff', cursor: 'pointer',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    padding: 0, lineHeight: 1,
                                                }}
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ))}
                                    {/* Add-more slot */}
                                    {files.length < 3 && (
                                        <div style={{
                                            width: 80, height: 80,
                                            border: '2px dashed rgba(255,255,255,0.1)', borderRadius: 8,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: '#475569', fontSize: '1.4rem', cursor: 'pointer',
                                        }}>+</div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Hidden file input — accept images + PDF, multiple, no capture attr so Android shows full picker (camera + gallery) */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*,.pdf"
                            multiple
                            style={{ display: 'none' }}
                            onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                        <div>
                            <label style={labelStyle}><AlertTriangle size={13} /> Priority</label>
                            <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                                {Object.entries(priorityLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Equipment ID (if known)</label>
                            <input style={inputStyle} value={form.assetId} onChange={e => setForm(f => ({ ...f, assetId: e.target.value }))} placeholder={t('workRequestPortal.egPump101Placeholder')} />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        title={t('workRequestPortal.submitYourMaintenanceRequestTip')}
                        style={{
                            width: '100%', padding: '16px', borderRadius: 12,
                            background: loading ? '#475569' : 'linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)',
                            border: 'none', color: '#fff', fontSize: '1rem', fontWeight: 700,
                            cursor: loading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', gap: 8, boxShadow: '0 4px 14px rgba(99,102,241,0.3)',
                            transition: 'transform 0.15s ease', minHeight: 52,
                        }}
                    >
                        <Send size={18} />
                        {loading ? 'Submitting...' : `Submit Request${files.length > 0 ? ` (+${files.length} file${files.length > 1 ? 's' : ''})` : ''}`}
                    </button>
                </form>

                {/* ── Status Checker ── */}
                <div style={{
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 12, padding: 20, marginTop: 20,
                }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <Search size={13} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                        Check Request Status
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input
                            style={{ ...inputStyle, flex: 1 }}
                            value={statusCheck.ref}
                            onChange={e => setStatusCheck(s => ({ ...s, ref: e.target.value }))}
                            placeholder={t('workRequestPortal.enterReferenceNumberEgReq42Placeholder')}
                            onKeyDown={e => e.key === 'Enter' && checkStatus()}
                        />
                        <button
                            onClick={checkStatus}
                            disabled={statusCheck.loading}
                            style={{
                                padding: '10px 18px', background: 'rgba(255,255,255,0.06)',
                                border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10,
                                color: '#94a3b8', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                                minHeight: 48,
                            }}
                            title={t('workRequestPortal.checkStatusTip')}>
                            {statusCheck.loading ? '...' : 'Check'}
                        </button>
                    </div>
                    {statusCheck.result && (
                        <div style={{
                            marginTop: 12, padding: '12px 16px', borderRadius: 8,
                            background: statusCheck.result.found ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                            border: `1px solid ${statusCheck.result.found ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                            fontSize: '0.8rem',
                        }}>
                            {statusCheck.result.found ? (
                                <div>
                                    <div style={{ color: '#10b981', fontWeight: 700, marginBottom: 4 }}>
                                        {statusCheck.result.referenceNumber}
                                    </div>
                                    <div style={{ color: '#94a3b8' }}>
                                        Status: <strong style={{ color: '#f1f5f9' }}>{statusCheck.result.status}</strong>
                                        {' · '}Priority: {priorityLabels[statusCheck.result.priority] || statusCheck.result.priority}
                                        {statusCheck.result.completedAt && (
                                            <span> · Completed: {formatDate(statusCheck.result.completedAt)}</span>
                                        )}
                                    </div>
                                    <div style={{ color: '#64748b', marginTop: 4 }}>
                                        Plant: {statusCheck.result.plant}
                                    </div>
                                </div>
                            ) : (
                                <div style={{ color: '#fca5a5' }}>{statusCheck.result.message || 'Not found'}</div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
