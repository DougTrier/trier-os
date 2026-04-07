// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — API Documentation Panel
 * =====================================
 * Interactive in-app REST API reference for developers and integrators.
 * Displays all available endpoints, authentication requirements, request
 * schemas, and live example responses — no external docs site needed.
 *
 * SECTIONS:
 *   Overview     — Base URL, auth methods (JWT Bearer + API Key), rate limits
 *   Endpoints    — Expandable list organized by domain (Assets, WOs, Parts, etc.)
 *   API Keys     — Generate, label, copy, and revoke personal API keys
 *   Examples     — cURL / JavaScript / Python code snippets per endpoint
 *
 * KEY FEATURES:
 *   - Endpoint accordion: method badge (GET/POST/PUT/DELETE), path, description
 *   - Request body schema rendered as JSON with type annotations
 *   - Live "Try it" button: sends authenticated request from current session
 *   - API key manager: create named keys, set expiry, one-click copy
 *   - Copy-to-clipboard on all code snippets with visual confirmation
 *   - Role-gated: Admin keys available only to Admin/Superuser roles
 *
 * API CALLS:
 *   GET    /api/api-keys          — List caller's active API keys
 *   POST   /api/api-keys          — Generate new API key
 *   DELETE /api/api-keys/:id      — Revoke an API key
 */
import React, { useState, useEffect } from 'react';
import { FileText, Key, Copy, Trash2, Plus, ChevronDown, ChevronUp, Info, X, Zap, Code, BookOpen } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';
import { formatDate } from '../utils/formatDate';

function APIDocsPanel() {
    const { t } = useTranslation();
    const [docs, setDocs] = useState(null);
    const [keys, setKeys] = useState([]);
    const [expanded, setExpanded] = useState({});
    const [newKeyLabel, setNewKeyLabel] = useState('');
    const [newKeyPerm, setNewKeyPerm] = useState('read');
    const [newKey, setNewKey] = useState(null);
    const [showKeyForm, setShowKeyForm] = useState(false);

    const [showApiGuideModal, setShowApiGuideModal] = useState(false);

    useEffect(() => {
        fetch('/api/docs').then(r => r.json()).then(setDocs).catch(e => console.warn('[APIDocsPanel] fetch error:', e));
        fetch('/api/docs/keys').then(r => r.json()).then(d => setKeys(Array.isArray(d) ? d : [])).catch(e => console.warn('[APIDocsPanel] fetch error:', e));
    }, []);

    const generateKey = async () => {
        if (!newKeyLabel.trim()) { window.trierToast?.error('Key label is required'); return; }
        try {
            const res = await fetch('/api/docs/keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label: newKeyLabel, permissions: newKeyPerm })
            });
            const data = await res.json();
            if (data.key) {
                setNewKey(data.key);
                setNewKeyLabel('');
                // Refresh keys list
                fetch('/api/docs/keys').then(r => r.json()).then(d => setKeys(Array.isArray(d) ? d : [])).catch(e => console.warn('[APIDocsPanel]', e));
            }
        } catch (e) { window.trierToast?.error('Failed to generate key'); }
    };

    const revokeKey = async (id) => {
        if (!await confirm('Revoke this API key? Any integrations using it will stop working.')) return;
        try {
            await fetch(`/api/docs/keys/${id}`, { method: 'DELETE' });
            setKeys(keys.filter(k => k.id !== id));
        } catch (e) { window.trierToast?.error('Revoke failed'); }
    };

    const copyToClip = (text) => {
        navigator.clipboard.writeText(text);
        window.trierToast?.error('Copied to clipboard');
    };

    const methodColors = {
        GET: '#10b981',
        POST: '#6366f1',
        PUT: '#f59e0b',
        DELETE: '#ef4444',
        PATCH: '#8b5cf6'
    };

    if (!docs) return null;

    return (
        <div className="panel-box" style={{ background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                <h3 style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileText size={20} color="#6366f1" /> {t('a.p.i.docs.apiDocumentation')}
                <span style={{ fontSize: '0.7rem', background: 'rgba(99,102,241,0.15)', color: '#818cf8', padding: '2px 8px', borderRadius: '8px' }}>
                    v{docs.version} • {docs.totalEndpoints} endpoints
                </span>
            </h3>
                <button onClick={() => setShowApiGuideModal(true)} style={{
                    background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
                    color: '#818cf8', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', fontWeight: 'bold'
                }} title="View API Integration Guide & Examples">
                    <Info size={14} /> Guide & Scenarios
                </button>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', margin: '0 0 15px 0' }}>
                {docs.description}
            </p>

            {/* Auth Info */}
            <div style={{
                background: 'rgba(99,102,241,0.05)', padding: '10px 12px', borderRadius: '8px',
                border: '1px solid rgba(99,102,241,0.15)', marginBottom: '12px', fontSize: '0.75rem'
            }}>
                <div style={{ fontWeight: 'bold', color: '#818cf8', marginBottom: '3px' }}>🔒 Authentication</div>
                <div style={{ color: 'var(--text-muted)' }}>
                    <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 4px', borderRadius: '3px' }}>
                        {docs.authentication.header}
                    </code>
                    <br />
                    {t('a.p.i.docs.plantHeader')} <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 4px', borderRadius: '3px' }}>
                        x-plant-id: Demo_Plant_1
                    </code>
                </div>
            </div>

            {/* Endpoint Categories */}
            <div style={{ marginBottom: '15px' }}>
                {Object.entries(docs.categories).map(([category, endpoints]) => (
                    <div key={category} style={{ marginBottom: '6px' }}>
                        <button 
                            onClick={() => setExpanded(prev => ({ ...prev, [category]: !prev[category] }))}
                            style={{
                                width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: '8px',
                                background: expanded[category] ? 'rgba(99,102,241,0.08)' : 'rgba(0,0,0,0.1)',
                                border: '1px solid var(--glass-border)', color: '#fff', cursor: 'pointer',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                fontSize: '0.85rem', fontWeight: '600'
                            }}
                            title={`${expanded[category] ? 'Collapse' : 'Expand'} ${category} endpoints`}
                        >
                            <span>{category} <span style={{ color: 'var(--text-muted)', fontWeight: 'normal', fontSize: '0.7rem' }}>({endpoints.length})</span></span>
                            {expanded[category] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        {expanded[category] && (
                            <div style={{ padding: '4px 0 4px 8px' }}>
                                {endpoints.map((ep, i) => {
                                    const epKey = `${category}-${i}`;
                                    const isOpen = expanded[epKey];
                                    return (
                                        <div key={i} style={{ marginBottom: '4px' }}>
                                            <button 
                                                onClick={() => setExpanded(prev => ({ ...prev, [epKey]: !prev[epKey] }))}
                                                style={{
                                                    width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                                                    padding: '8px 10px', fontSize: '0.75rem',
                                                    background: isOpen ? 'rgba(99,102,241,0.06)' : 'transparent',
                                                    border: isOpen ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
                                                    borderRadius: '6px', cursor: 'pointer', textAlign: 'left',
                                                    transition: 'all 0.2s', color: '#fff'
                                                }}
                                                onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                                                onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = 'transparent'; }}
                                                title={`Click to ${isOpen ? 'collapse' : 'expand'} details for ${ep.method} ${ep.path}`}
                                            >
                                                <span style={{
                                                    background: (methodColors[ep.method] || '#6366f1') + '20',
                                                    color: methodColors[ep.method] || '#6366f1',
                                                    padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold',
                                                    fontSize: '0.65rem', fontFamily: 'monospace', minWidth: '48px', textAlign: 'center'
                                                }}>
                                                    {ep.method}
                                                </span>
                                                <code style={{ color: '#d1d5db', fontSize: '0.72rem', flex: '0 0 auto' }}>{ep.path}</code>
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem', flex: 1 }}>{ep.desc}</span>
                                                {ep.role && (
                                                    <span style={{ fontSize: '0.55rem', background: 'rgba(239,68,68,0.1)', color: '#f87171', padding: '1px 6px', borderRadius: '3px' }}>
                                                        {ep.role}
                                                    </span>
                                                )}
                                                {isOpen ? <ChevronUp size={12} color="#818cf8" /> : <ChevronDown size={12} color="#64748b" />}
                                            </button>

                                            {/* ── Expanded Detail Panel ── */}
                                            {isOpen && (
                                                <div style={{
                                                    margin: '4px 0 8px 0', padding: '14px', borderRadius: '8px',
                                                    background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(99,102,241,0.15)',
                                                    fontSize: '0.75rem', lineHeight: 1.7
                                                }}>
                                                    {/* What this endpoint does */}
                                                    <div style={{ marginBottom: '12px' }}>
                                                        <div style={{ fontWeight: 700, color: '#818cf8', marginBottom: '4px', fontSize: '0.72rem' }}>📖 What It Does</div>
                                                        <div style={{ color: '#cbd5e1' }}>{ep.desc || 'No description available.'}</div>
                                                    </div>

                                                    {/* Required Headers */}
                                                    <div style={{ marginBottom: '12px' }}>
                                                        <div style={{ fontWeight: 700, color: '#818cf8', marginBottom: '4px', fontSize: '0.72rem' }}>🔑 Required Headers</div>
                                                        <pre style={{
                                                            background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: '6px',
                                                            margin: 0, fontSize: '0.68rem', color: '#a5b4fc', overflowX: 'auto', whiteSpace: 'pre-wrap'
                                                        }}>{`Authorization: Bearer <your-token>
Content-Type: application/json
x-plant-id: Demo_Plant_1${ep.role ? `\nx-user-role: ${ep.role}` : ''}`}</pre>
                                                    </div>

                                                    {/* Request Body (for POST/PUT/PATCH) */}
                                                    {['POST', 'PUT', 'PATCH'].includes(ep.method) && (
                                                        <div style={{ marginBottom: '12px' }}>
                                                            <div style={{ fontWeight: 700, color: '#818cf8', marginBottom: '4px', fontSize: '0.72rem' }}>📤 Example Request Body</div>
                                                            <pre style={{
                                                                background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: '6px',
                                                                margin: 0, fontSize: '0.68rem', color: '#86efac', overflowX: 'auto', whiteSpace: 'pre-wrap'
                                                            }}>{ep.exampleBody || JSON.stringify(
                                                                ep.path.includes('work-order') ? { title: "Fix conveyor belt", priority: "High", assignedTo: "John Smith", dueDate: "2026-04-01" } :
                                                                ep.path.includes('asset') ? { AssetName: "Conveyor Belt A1", Location: "Building 2", Status: "Active" } :
                                                                ep.path.includes('part') ? { PartName: "Bearing XR-500", CurrentStock: 25, MinStock: 5 } :
                                                                ep.path.includes('vendor') ? { VendorName: "Acme Supply", Phone: "555-0123", Email: "orders@acme.com" } :
                                                                ep.path.includes('user') ? { username: "jsmith", displayName: "John Smith", role: "technician" } :
                                                                { data: "your payload here" }
                                                            , null, 2)}</pre>
                                                        </div>
                                                    )}

                                                    {/* Example Response */}
                                                    <div style={{ marginBottom: '12px' }}>
                                                        <div style={{ fontWeight: 700, color: '#818cf8', marginBottom: '4px', fontSize: '0.72rem' }}>📥 Example Response</div>
                                                        <pre style={{
                                                            background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: '6px',
                                                            margin: 0, fontSize: '0.68rem', color: '#fde68a', overflowX: 'auto', whiteSpace: 'pre-wrap'
                                                        }}>{ep.exampleResponse || JSON.stringify(
                                                            ep.method === 'GET' ? { success: true, data: [{ id: 1, "...": "..." }], count: 1 } :
                                                            ep.method === 'DELETE' ? { success: true, message: "Item deleted successfully" } :
                                                            { success: true, message: "Operation completed", id: 1 }
                                                        , null, 2)}</pre>
                                                    </div>

                                                    {/* How to use it — step by step */}
                                                    <div style={{ marginBottom: '8px' }}>
                                                        <div style={{ fontWeight: 700, color: '#818cf8', marginBottom: '4px', fontSize: '0.72rem' }}>🚀 How To Use (Step by Step)</div>
                                                        <ol style={{ margin: 0, paddingLeft: '18px', color: '#cbd5e1', fontSize: '0.72rem' }}>
                                                            <li>Log in to get your auth token from <code style={{ color: '#a5b4fc' }}>POST /api/auth/login</code></li>
                                                            <li>Set header <code style={{ color: '#a5b4fc' }}>Authorization: Bearer YOUR_TOKEN</code></li>
                                                            <li>{t('aPIDocsPanel.setHeader')}<code style={{ color: '#a5b4fc' }}>x-plant-id</code> {t('aPIDocsPanel.toYourTargetPlantId')}</li>
                                                            <li>{t('aPIDocsPanel.sendA')} <strong style={{ color: methodColors[ep.method] || '#6366f1' }}>{ep.method}</strong> {t('aPIDocsPanel.requestTo')} <code style={{ color: '#a5b4fc' }}>{ep.path}</code></li>
                                                            {['POST', 'PUT', 'PATCH'].includes(ep.method) && <li>{t('aPIDocsPanel.includeTheJsonBodyAs')}</li>}
                                                            <li>Check the response for <code style={{ color: '#86efac' }}>success: true</code></li>
                                                        </ol>
                                                    </div>

                                                    {/* Copy cURL button */}
                                                    <button onClick={() => copyToClip(`curl -X ${ep.method} http://localhost:3000${ep.path} \\\n  -H "Authorization: Bearer YOUR_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -H "x-plant-id: Demo_Plant_1"${['POST','PUT','PATCH'].includes(ep.method) ? ' \\\n  -d \'{"key":"value"}\'' : ''}`)}
                                                        style={{
                                                            marginTop: '6px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
                                                            padding: '5px 12px', borderRadius: '6px', color: '#818cf8', cursor: 'pointer',
                                                            fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: '6px'
                                                        }}
                                                        title={t('aPIDocsPanel.copyAReadytouseCurlCommandTip')}
                                                    >
                                                        <Copy size={12} /> Copy cURL Command
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* API Keys Section */}
            <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h4 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Key size={16} color="#f59e0b" /> {t('a.p.i.docs.apiKeys')}
                    </h4>
                    <button onClick={() => setShowKeyForm(!showKeyForm)} style={{
                        background: 'none', border: '1px solid var(--glass-border)', color: 'var(--text-muted)',
                        padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem',
                        display: 'flex', alignItems: 'center', gap: '4px'
                    }} title={t('aPIDocsPanel.createANewApiKeyTip')}>
                        <Plus size={12} /> {t('a.p.i.docs.newKey')}
                    </button>
                </div>

                {/* New key created alert */}
                {newKey && (
                    <div style={{
                        background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
                        padding: '10px 12px', borderRadius: '8px', marginBottom: '10px'
                    }}>
                        <div style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 'bold', marginBottom: '4px' }}>
                            ⚠️ Copy this key now — it won't be shown again!
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <code style={{
                                flex: 1, background: 'rgba(0,0,0,0.4)', padding: '6px 10px',
                                borderRadius: '4px', fontSize: '0.7rem', color: '#10b981', wordBreak: 'break-all'
                            }}>
                                {newKey}
                            </code>
                            <button onClick={() => copyToClip(newKey)} style={{
                                background: '#10b981', border: 'none', color: '#fff', padding: '6px 10px',
                                borderRadius: '6px', cursor: 'pointer', fontSize: '0.7rem'
                            }} title={t('aPIDocsPanel.copyThisApiKeyToTip')}>
                                <Copy size={12} /> {t('a.p.i.docs.copy')}
                            </button>
                        </div>
                        <button onClick={() => setNewKey(null)} style={{
                            background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
                            fontSize: '0.65rem', marginTop: '6px', textDecoration: 'underline'
                        }} title={t('aPIDocsPanel.dismissThisKeyNotificationTip')}>
                            {t('a.p.i.docs.iveSavedThisKey')}
                        </button>
                    </div>
                )}

                {/* Key creation form */}
                {showKeyForm && (
                    <div style={{
                        background: 'rgba(0,0,0,0.15)', padding: '12px', borderRadius: '8px',
                        marginBottom: '10px', border: '1px solid var(--glass-border)',
                        display: 'flex', gap: '8px', alignItems: 'end'
                    }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>{t('a.p.i.docs.label')}</label>
                            <input
                                value={newKeyLabel}
                                onChange={e => setNewKeyLabel(e.target.value)}
                                placeholder={t('a.p.i.docs.egPowerBiConnector')}
                                style={{
                                    width: '100%', padding: '6px 10px', background: 'rgba(0,0,0,0.3)',
                                    border: '1px solid var(--glass-border)', borderRadius: '6px',
                                    color: '#fff', fontSize: '0.8rem'
                                }}
                                title={t('aPIDocsPanel.aDescriptiveLabelForThisTip')}
                            />
                        </div>
                        <select
                            value={newKeyPerm}
                            onChange={e => setNewKeyPerm(e.target.value)}
                            style={{
                                padding: '6px 10px', background: 'rgba(0,0,0,0.3)',
                                border: '1px solid var(--glass-border)', borderRadius: '6px',
                                color: '#fff', fontSize: '0.8rem'
                            }}
                            title={t('aPIDocsPanel.setThePermissionLevelForTip')}
                        >
                            <option value="read">{t('a.p.i.docs.readOnly')}</option>
                            <option value="read_write">{t('a.p.i.docs.readwrite')}</option>
                        </select>
                        <button onClick={generateKey} style={{
                            padding: '6px 14px', background: '#6366f1', border: 'none',
                            borderRadius: '6px', color: '#fff', cursor: 'pointer', fontSize: '0.8rem',
                            fontWeight: 'bold', whiteSpace: 'nowrap'
                        }} title={t('aPIDocsPanel.generateANewApiKeyTip')}>
                            {t('a.p.i.docs.generate')}
                        </button>
                    </div>
                )}

                {/* Existing keys */}
                {keys.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '15px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {t('a.p.i.docs.noApiKeysCreated')}
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {keys.map(k => (
                            <div key={k.id} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                background: 'rgba(0,0,0,0.1)', padding: '8px 12px', borderRadius: '8px',
                                border: '1px solid var(--glass-border)'
                            }}>
                                <div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>{k.label}</div>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                        <code>{k.key_prefix}</code> •
                                        {k.permissions === 'read' ? ' 👁️ Read' : ' ✏️ Read/Write'} •
                                        Created {formatDate(k.created_at)} •
                                        {k.request_count || 0} requests
                                    </div>
                                </div>
                                <button onClick={() => revokeKey(k.id)} style={{
                                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                                    color: '#ef4444', padding: '4px 10px', borderRadius: '6px',
                                    cursor: 'pointer', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px'
                                }} title={`Revoke API key "${k.label}"`}>
                                    <Trash2 size={12} /> {t('a.p.i.docs.revoke')}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            
            {/* API Integration Guide Modal */}
            {showApiGuideModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                    <div style={{ background: 'linear-gradient(145deg, #1e293b, #0f172a)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '16px', width: '100%', maxWidth: '900px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ background: 'rgba(99,102,241,0.15)', padding: '10px', borderRadius: '12px' }}><BookOpen size={20} color="#818cf8" /></div>
                                <div><h2 style={{ margin: 0, fontSize: '1.2rem', color: '#e2e8f0' }}>API Integration Guide</h2><div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>How to connect external systems to Trier OS</div></div>
                            </div>
                            <button onClick={() => setShowApiGuideModal(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}><X size={20} /></button>
                        </div>
                        <div style={{ padding: '24px', overflowY: 'auto' }}>
                            <div style={{ marginBottom: '24px' }}>
                                <h3 style={{ fontSize: '1rem', color: '#818cf8', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}><Key size={16} /> 1. Authentication</h3>
                                <p style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.6', margin: '0 0 12px 0' }}>Every request to the Trier OS API requires two headers:</p>
                                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <code style={{ display: 'block', color: '#fbbf24', fontSize: '0.8rem', marginBottom: '4px' }}>Authorization: Bearer YOUR_API_KEY</code>
                                    <code style={{ display: 'block', color: '#38bdf8', fontSize: '0.8rem' }}>x-plant-id: Demo_Plant_1</code>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '8px', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '8px' }}>* You can generate YOUR_API_KEY from the "API Keys" section. The x-plant-id routes your request to the correct site-specific database.</div>
                                </div>
                            </div>
                            <div style={{ marginBottom: '24px' }}>
                                <h3 style={{ fontSize: '1rem', color: '#10b981', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}><Zap size={16} /> 2. Working Scenarios</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
                                    <div style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)', padding: '16px', borderRadius: '10px' }}>
                                        <div style={{ fontWeight: 'bold', color: '#10b981', margin: '0 0 6px 0', fontSize: '0.9rem' }}>Scenario A: PLC Pushing Machine Downtime (Python)</div>
                                        <pre style={{ background: '#0f172a', padding: '12px', borderRadius: '6px', fontSize: '0.75rem', color: '#e2e8f0', margin: 0, overflowX: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
{`import requests

url = "http://localhost:3000/api/work-orders"
headers = { "Authorization": "Bearer TR-XX", "x-plant-id": "Hammond_LA" }
payload = { "Title": "Conveyor Fault", "Priority": 100 }
requests.post(url, json=payload, headers=headers)`}
                                        </pre>
                                    </div>
                                    <div style={{ background: 'rgba(56,189,248,0.05)', border: '1px solid rgba(56,189,248,0.2)', padding: '16px', borderRadius: '10px' }}>
                                        <div style={{ fontWeight: 'bold', color: '#38bdf8', margin: '0 0 6px 0', fontSize: '0.9rem' }}>Scenario B: ERP Syncing Parts Inventory (C# / .NET)</div>
                                        <pre style={{ background: '#0f172a', padding: '12px', borderRadius: '6px', fontSize: '0.75rem', color: '#e2e8f0', margin: 0, overflowX: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
{`using System.Net.Http;

var client = new HttpClient();
client.DefaultRequestHeaders.Add("Authorization", "Bearer TR-XX");
client.DefaultRequestHeaders.Add("x-plant-id", "Demo_Plant_1");
var content = new StringContent("{ \\"PartNumber\\": \\"BRG-205\\", \\"QtyOnHand\\": 45 }", null, "application/json");
await client.PutAsync("http://localhost/api/parts/inventory-sync", content);`}
                                        </pre>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.2)' }}>
                            <button onClick={() => setShowApiGuideModal(false)} className="btn-primary" style={{ background: '#6366f1', border: 'none', color: '#fff', padding: '8px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Close Guide</button>
                        </div>
                    </div>
                </div>
            )}

</div>
        </div>
    );
}

export default APIDocsPanel;
