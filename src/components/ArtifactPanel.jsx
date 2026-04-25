// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS — Artifact Panel
 * ==========================
 * Displays locally stored artifacts (twin images, CAD files, PDFs, schematics)
 * for a given equipment entity, with upload and web-fetch controls.
 *
 * Air-gap rule: local files are served via /api/catalog/serve/:artifactId.
 * External URLs are shown as clearly labelled references, never silently opened.
 *
 * API CALLS:
 *   GET  /api/catalog/artifacts/for/:entityId  — fetch artifact list
 *   POST /api/catalog/artifacts/upload         — multipart file upload
 *   POST /api/catalog/artifacts/fetch-url      — restricted direct-URL fetch
 *   GET  /api/catalog/serve/:artifactId        — stream local file
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Upload, Image, FileText, Box, Link2,
    CheckCircle, X, Download, RefreshCw,
} from 'lucide-react';

const TYPE_LABEL = { twin: 'Twin Image', cad: 'CAD File', manual: 'Manual', photo: 'Photo', schematic: 'Schematic', nameplate: 'Nameplate' };
const IMAGE_MIME  = new Set(['image/jpeg','image/png','image/webp','image/gif','image/svg+xml']);
const PDF_MIME    = 'application/pdf';

function isImage(mime)  { return IMAGE_MIME.has(mime); }
function isPDF(mime)    { return mime === PDF_MIME; }
function is3D(mime, fmt) {
    return ['model/stl','application/step','model/obj','model/gltf+json','model/gltf-binary','application/x-ifc','application/dxf']
        .includes(mime) || ['STL','STEP','STP','OBJ','GLTF','GLB','IFC','DXF'].includes((fmt||'').toUpperCase());
}

// ── Local file viewer ────────────────────────────────────────────────────────

function LocalViewer({ artifact, accentColor }) {
    const src = `/api/catalog/serve/${artifact.ArtifactID}`;
    const mime = artifact.mime_type || '';
    const fmt  = artifact.Format || '';

    if (isImage(mime)) {
        return (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <img
                    src={src}
                    alt={artifact.file_name || 'Digital Twin'}
                    style={{
                        maxWidth: '100%', maxHeight: 400, borderRadius: 10,
                        border: `1px solid ${accentColor}30`, objectFit: 'contain',
                    }}
                />
                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 6 }}>
                    {artifact.file_name}{artifact.file_size ? ` · ${Math.round(artifact.file_size / 1024)} KB` : ''}
                </div>
            </div>
        );
    }

    if (isPDF(mime)) {
        return (
            <div style={{ width: '100%', height: 480, borderRadius: 10, overflow: 'hidden', border: `1px solid ${accentColor}30` }}>
                <iframe src={src} style={{ width: '100%', height: '100%', border: 'none' }} title={artifact.file_name || 'PDF'} />
            </div>
        );
    }

    if (is3D(mime, fmt)) {
        return (
            <div style={{ padding: '16px', background: 'rgba(249,115,22,0.06)', borderRadius: 10, border: '1px solid rgba(249,115,22,0.2)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <Box size={24} color="#f97316" />
                <div>
                    <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '0.85rem' }}>{artifact.file_name}</div>
                    <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: 2 }}>
                        {fmt} file · {artifact.file_size ? Math.round(artifact.file_size / 1024) + ' KB' : ''} · 3D viewer coming in Phase 2
                    </div>
                </div>
                <a href={src} download={artifact.file_name}
                    style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 7, background: 'rgba(249,115,22,0.15)', color: '#f97316', border: '1px solid rgba(249,115,22,0.3)', fontSize: '0.78rem', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Download size={13} /> Download
                </a>
            </div>
        );
    }

    // Generic file
    return (
        <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileText size={20} color="#94a3b8" />
            <span style={{ color: '#e2e8f0', fontSize: '0.85rem' }}>{artifact.file_name || 'File'}</span>
            <a href={src} download={artifact.file_name} style={{ marginLeft: 'auto', color: '#60a5fa', fontSize: '0.78rem', textDecoration: 'none' }}>
                <Download size={13} style={{ display: 'inline', marginRight: 4 }} />Download
            </a>
        </div>
    );
}

// ── Upload form ──────────────────────────────────────────────────────────────

function UploadForm({ entityId, artifactType, accentColor, onSuccess }) {
    const fileRef = useRef(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');

    const handleUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        setError('');
        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('entityId', entityId);
            fd.append('artifactType', artifactType);
            const res = await fetch('/api/catalog/artifacts/upload', { method: 'POST', body: fd });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Upload failed');
            onSuccess();
        } catch (err) {
            setError(err.message);
        }
        setUploading(false);
        if (fileRef.current) fileRef.current.value = '';
    };

    const accept = artifactType === 'twin' || artifactType === 'photo'
        ? '.jpg,.jpeg,.png,.webp,.gif,.svg'
        : artifactType === 'manual' ? '.pdf,.jpg,.png'
        : '.jpg,.jpeg,.png,.webp,.gif,.svg,.pdf,.stl,.step,.stp,.dxf,.obj,.gltf,.glb,.ifc';

    return (
        <div>
            <input type="file" ref={fileRef} accept={accept} style={{ display: 'none' }} onChange={handleUpload} />
            <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '7px 16px', borderRadius: 8, cursor: uploading ? 'not-allowed' : 'pointer',
                    background: uploading ? 'rgba(255,255,255,0.04)' : `${accentColor}18`,
                    border: `1px solid ${accentColor}44`, color: uploading ? '#475569' : accentColor,
                    fontSize: '0.8rem', fontWeight: 600,
                }}
            >
                <Upload size={14} />
                {uploading ? 'Uploading…' : 'Upload File'}
            </button>
            {error && <div style={{ marginTop: 6, color: '#f87171', fontSize: '0.75rem' }}>{error}</div>}
        </div>
    );
}

// ── Web fetch form ───────────────────────────────────────────────────────────

function FetchForm({ entityId, artifactType, accentColor, onSuccess }) {
    const [url, setUrl]       = useState('');
    const [busy, setBusy]     = useState(false);
    const [error, setError]   = useState('');

    const handleFetch = async () => {
        if (!url.trim()) return;
        setBusy(true);
        setError('');
        try {
            const res = await fetch('/api/catalog/artifacts/fetch-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url.trim(), entityId, artifactType }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Fetch failed');
            setUrl('');
            onSuccess();
        } catch (err) {
            setError(err.message);
        }
        setBusy(false);
    };

    return (
        <div>
            <div style={{ display: 'flex', gap: 8 }}>
                <input
                    type="url"
                    placeholder="Direct image or PDF URL (no login required)"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleFetch()}
                    style={{
                        flex: 1, padding: '7px 12px', borderRadius: 8, fontSize: '0.8rem',
                        background: 'rgba(30,41,59,0.8)', border: '1px solid rgba(255,255,255,0.1)',
                        color: '#f1f5f9', outline: 'none',
                    }}
                />
                <button
                    onClick={handleFetch}
                    disabled={busy || !url.trim()}
                    style={{
                        padding: '7px 14px', borderRadius: 8, cursor: busy ? 'not-allowed' : 'pointer',
                        background: busy ? 'rgba(255,255,255,0.04)' : 'rgba(96,165,250,0.15)',
                        border: '1px solid rgba(96,165,250,0.35)', color: '#60a5fa',
                        fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                    }}
                >
                    <Link2 size={13} /> {busy ? 'Fetching…' : 'Fetch'}
                </button>
            </div>
            <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: 4 }}>
                Images and PDFs only · GrabCAD and login-gated sites require manual download then upload
            </div>
            {error && <div style={{ marginTop: 6, color: '#f87171', fontSize: '0.75rem' }}>{error}</div>}
        </div>
    );
}

// ── Main panel ───────────────────────────────────────────────────────────────

export default function ArtifactPanel({ entityId, defaultArtifactType = 'twin', accentColor = '#06b6d4', autoOpenAttach = false }) {
    const [artifacts, setArtifacts] = useState(null); // null = loading
    const [error, setError]         = useState('');
    const [addType, setAddType]     = useState(defaultArtifactType);
    const [showAdd, setShowAdd]     = useState(autoOpenAttach);

    useEffect(() => { if (autoOpenAttach) setShowAdd(true); }, [autoOpenAttach]);

    const load = useCallback(() => {
        if (!entityId) return;
        setError('');
        fetch(`/api/catalog/artifacts/for/${encodeURIComponent(entityId)}`)
            .then(r => r.json())
            .then(rows => setArtifacts(Array.isArray(rows) ? rows : []))
            .catch(e => setError(e.message));
    }, [entityId]);

    useEffect(() => { load(); }, [load]);

    const localArtifacts = (artifacts || []).filter(a => a.is_local);

    return (
        <div style={{ padding: '16px 0' }}>

            {/* Loading / error */}
            {artifacts === null && !error && (
                <div style={{ color: '#64748b', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Loading artifacts…
                </div>
            )}
            {error && (
                <div style={{ color: '#f87171', fontSize: '0.82rem' }}>{error}</div>
            )}

            {/* ── Local artifacts — viewers ──────────────────────────────── */}
            {localArtifacts.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CheckCircle size={11} color="#10b981" />
                        <span style={{ color: '#10b981' }}>On this server</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {localArtifacts.map(a => (
                            <div key={a.ArtifactID}>
                                <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    {TYPE_LABEL[a.ArtifactType] || a.ArtifactType}
                                    {a.Format && <span style={{ marginLeft: 6, color: accentColor }}>{a.Format}</span>}
                                </div>
                                <LocalViewer artifact={a} accentColor={accentColor} />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Empty state ────────────────────────────────────────────── */}
            {artifacts !== null && localArtifacts.length === 0 && (
                <div style={{ marginBottom: 16, padding: '14px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Image size={18} color="#334155" />
                    <span style={{ color: '#475569', fontSize: '0.82rem' }}>No local files attached yet.</span>
                </div>
            )}

            {/* ── Add files ──────────────────────────────────────────────── */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: showAdd ? 14 : 0 }}>
                    <button
                        onClick={() => setShowAdd(s => !s)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '6px 14px', borderRadius: 7, cursor: 'pointer',
                            background: showAdd ? `${accentColor}20` : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${showAdd ? accentColor + '44' : 'rgba(255,255,255,0.1)'}`,
                            color: showAdd ? accentColor : '#94a3b8', fontSize: '0.78rem', fontWeight: 600,
                        }}
                    >
                        {showAdd ? <X size={13} /> : <Upload size={13} />}
                        {showAdd ? 'Cancel' : 'Attach File'}
                    </button>

                    {showAdd && (
                        <select
                            value={addType}
                            onChange={e => setAddType(e.target.value)}
                            style={{
                                padding: '6px 10px', borderRadius: 7, fontSize: '0.78rem',
                                background: 'rgba(30,41,59,0.8)', border: '1px solid rgba(255,255,255,0.12)',
                                color: '#f1f5f9', cursor: 'pointer',
                            }}
                        >
                            <option value="twin">Twin Image</option>
                            <option value="photo">Photo</option>
                            <option value="cad">CAD File</option>
                            <option value="manual">Manual / PDF</option>
                            <option value="schematic">Schematic</option>
                        </select>
                    )}
                </div>

                {showAdd && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <UploadForm
                            entityId={entityId}
                            artifactType={addType}
                            accentColor={accentColor}
                            onSuccess={() => { setShowAdd(false); load(); }}
                        />
                        {(addType === 'twin' || addType === 'photo' || addType === 'manual') && (
                            <div>
                                <div style={{ fontSize: '0.7rem', color: '#475569', marginBottom: 6 }}>or fetch from a direct URL</div>
                                <FetchForm
                                    entityId={entityId}
                                    artifactType={addType}
                                    accentColor={accentColor}
                                    onSuccess={() => { setShowAdd(false); load(); }}
                                />
                            </div>
                        )}
                    </div>
                )}
            </div>

        </div>
    );
}
