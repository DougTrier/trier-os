// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Generic Attachments Panel
 * ======================================
 * Reusable photo, video, and file attachment panel for any entity type.
 * Handles upload, preview, delete, and camera capture for Parts, SOPs,
 * Assets, Work Orders, and any other record that supports file attachments.
 *
 * KEY FEATURES:
 *   - Drag-and-drop upload zone: drop files directly onto the panel
 *   - Camera capture: take a photo inline using the device camera (mobile-ready)
 *   - File type support: images (JPG/PNG/WEBP), video (MP4/MOV), PDFs, documents
 *   - Thumbnail grid: images and videos shown as previews; files as named icons
 *   - Lightbox preview: click any image/video thumbnail to open full-screen viewer
 *   - Delete: remove any attachment with confirmation (hard delete from storage)
 *   - Storage: files saved to /uploads/:entityType/:entityId/ on the server
 *
 * SUPPORTED ENTITY TYPES:
 *   'parts' | 'procedures' | 'assets' | 'work-orders' | 'inspections'
 *
 * API CALLS:
 *   GET    /api/:entityType/:entityId/attachments        — List attachments
 *   POST   /api/:entityType/:entityId/attachments        — Upload file (multipart)
 *   DELETE /api/:entityType/:entityId/attachments/:id    — Delete attachment
 *
 * @param {string}        entityType — Record type ('parts', 'assets', etc.)
 * @param {string|number} entityId   — The unique ID of the parent record
 */
import React, { useState, useEffect, useRef } from 'react';
import { Paperclip, Upload, Trash2, Image, Film, FileText, X, Camera } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';
export default function GenericAttachments({ entityType, entityId }) {
    const { t } = useTranslation();
    const [attachments, setAttachments] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [preview, setPreview] = useState(null);
    const fileInputRef = useRef(null);
    const cameraInputRef = useRef(null);

    const plantId = localStorage.getItem('activePlant') || 'Demo_Plant_1';
    const headers = { 'x-plant-id': plantId };

    const baseUrl = `/api/${entityType}/${encodeURIComponent(entityId)}/attachments`;

    useEffect(() => {
        if (!entityId) return;
        fetch(baseUrl, { headers })
            .then(r => r.json())
            .then(data => setAttachments(Array.isArray(data) ? data : []))
            .catch(() => setAttachments([]));
    }, [entityId, entityType]);

    const handleUpload = async (files) => {
        if (!files || files.length === 0) return;
        setUploading(true);
        for (const file of files) {
            const formData = new FormData();
            formData.append('file', file);
            try {
                const res = await fetch(baseUrl, {
                    method: 'POST',
                    headers: { 'x-plant-id': plantId },
                    body: formData
                });
                const data = await res.json();
                if (data.success && data.attachment) {
                    setAttachments(prev => [data.attachment, ...prev]);
                }
            } catch (err) {
                console.error('Upload failed:', err);
            }
        }
        setUploading(false);
    };

    const handleDelete = async (filename) => {
        if (!await confirm('Delete this attachment?')) return;
        try {
            await fetch(`${baseUrl}/${filename}`, { method: 'DELETE', headers });
            setAttachments(prev => prev.filter(a => a.filename !== filename));
        } catch (err) {
            console.error('Delete failed:', err);
        }
    };

    const getTypeIcon = (type) => {
        switch (type) {
            case 'image': return <Image size={16} color="#3b82f6" />;
            case 'video': return <Film size={16} color="#8b5cf6" />;
            default: return <FileText size={16} color="#f59e0b" />;
        }
    };

    const formatSize = (bytes) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
        return `${(bytes / 1048576).toFixed(1)} MB`;
    };

    return (
        <div style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12, padding: 16, marginTop: 12,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.85rem', color: '#f1f5f9' }}>
                    <Paperclip size={16} color="#6366f1" />
                    Photos & Files
                    {attachments.length > 0 && (
                        <span style={{
                            background: 'rgba(99,102,241,0.15)', color: '#818cf8',
                            padding: '1px 8px', borderRadius: 10, fontSize: '0.7rem', fontWeight: 700
                        }}>
                            {attachments.length}
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => cameraInputRef.current?.click()}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '5px 10px', background: 'rgba(16,185,129,0.1)',
                            border: '1px solid rgba(16,185,129,0.25)', borderRadius: 6,
                            color: '#10b981', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer',
                        }}
                        title={t('genericAttachments.takePhotoTip')}
                    >
                        <Camera size={13} /> Photo
                    </button>
                    <button onClick={() => fileInputRef.current?.click()}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '5px 10px', background: 'rgba(99,102,241,0.1)',
                            border: '1px solid rgba(99,102,241,0.25)', borderRadius: 6,
                            color: '#818cf8', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer',
                        }}
                     title={t('genericAttachments.uploadTip')}>
                        <Upload size={13} /> Upload
                    </button>
                </div>
            </div>

            <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                   style={{ display: 'none' }} onChange={e => handleUpload(e.target.files)} />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment"
                   style={{ display: 'none' }} onChange={e => handleUpload(e.target.files)} />

            <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files); }}
                style={{
                    border: `2px dashed ${dragOver ? '#6366f1' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: 10, padding: uploading ? '15px' : '10px',
                    textAlign: 'center', color: dragOver ? '#818cf8' : '#475569',
                    fontSize: '0.75rem', transition: 'all 0.2s',
                    background: dragOver ? 'rgba(99,102,241,0.05)' : 'transparent',
                    marginBottom: attachments.length > 0 ? 12 : 0, cursor: 'pointer',
                }}
                onClick={() => fileInputRef.current?.click()}
            >
                {uploading ? '⏳ Uploading...' : (dragOver ? '📎 Drop files here' : 'Drag & drop files, or click to browse')}
            </div>

            {attachments.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                    {attachments.map(att => (
                        <div key={att.filename} style={{
                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 8, overflow: 'hidden', position: 'relative',
                        }}>
                            {att.type === 'image' ? (
                                <div style={{
                                    height: 90, backgroundImage: `url(${att.url})`,
                                    backgroundSize: 'cover', backgroundPosition: 'center', cursor: 'pointer',
                                }} onClick={() => setPreview(att)} />
                            ) : att.type === 'video' ? (
                                <div style={{
                                    height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: 'rgba(139,92,246,0.08)', cursor: 'pointer',
                                }} onClick={() => setPreview(att)}>
                                    <Film size={28} color="#8b5cf6" />
                                </div>
                            ) : (
                                <a href={att.url} target="_blank" rel="noreferrer" style={{
                                    height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: 'rgba(245,158,11,0.08)', textDecoration: 'none',
                                }}>
                                    <FileText size={28} color="#f59e0b" />
                                </a>
                            )}

                            <div style={{ padding: '6px 8px' }}>
                                <div style={{
                                    fontSize: '0.65rem', color: '#94a3b8', fontWeight: 500,
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    display: 'flex', alignItems: 'center', gap: 4,
                                }}>
                                    {getTypeIcon(att.type)}
                                    {att.ext?.toUpperCase().replace('.', '')} · {formatSize(att.size)}
                                </div>
                            </div>

                            <button onClick={() => handleDelete(att.filename)}
                                style={{
                                    position: 'absolute', top: 4, right: 4,
                                    width: 22, height: 22, borderRadius: 6,
                                    background: 'rgba(0,0,0,0.6)', border: 'none',
                                    color: '#ef4444', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                                title="Delete"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {preview && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 10000,
                    background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', padding: 20,
                }} onClick={() => setPreview(null)}>
                    <button onClick={() => setPreview(null)}
                        style={{
                            position: 'absolute', top: 20, right: 20,
                            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: 8, color: '#fff', cursor: 'pointer', padding: '6px 10px',
                        }}
                     title={t('genericAttachments.previewTip')}>
                        <X size={18} />
                    </button>
                    {preview.type === 'image' ? (
                        <img src={preview.url} alt="Preview"
                            style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 12, boxShadow: '0 0 40px rgba(0,0,0,0.5)' }}
                            onClick={e => e.stopPropagation()} />
                    ) : preview.type === 'video' ? (
                        <video src={preview.url} controls
                            style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 12 }}
                            onClick={e => e.stopPropagation()} />
                    ) : null}
                </div>
            )}
        </div>
    );
}
