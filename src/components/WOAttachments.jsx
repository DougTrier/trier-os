// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Work Order Attachments Panel
 * =========================================
 * Photo, video, and file attachment manager embedded in Work Order detail panels.
 * Technicians capture or upload evidence photos, videos, and documents directly
 * to the work order record for before/after documentation.
 *
 * KEY FEATURES:
 *   - Drag-and-drop upload zone: drop files directly onto the panel
 *   - Camera capture: take photos inline using the device camera (mobile-first)
 *   - File type support: images (JPG/PNG/WEBP), video (MP4/MOV), PDF, Office docs
 *   - Thumbnail grid: images/videos shown as previews; other files as named icons
 *   - Lightbox: click any image/video thumbnail to open full-screen viewer
 *   - Delete: remove any attachment with confirmation (hard delete from storage)
 *   - Attachment count badge shown in WO header tab
 *
 * API CALLS:
 *   GET    /api/work-orders/:woId/attachments        — List WO attachments
 *   POST   /api/work-orders/:woId/attachments        — Upload file (multipart)
 *   DELETE /api/work-orders/:woId/attachments/:id    — Delete attachment
 *
 * @param {string|number} woId — Work order ID this panel belongs to
 */
import React, { useState, useEffect, useRef } from 'react';
import { Paperclip, Upload, Trash2, Image, Film, FileText, X, Camera } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

/**
 * WOAttachments — Photo/Video/File Attachment Panel for Work Orders
 * =================================================================
 * Supports images, videos, PDFs, and Office documents.
 * Drop zone + camera capture for mobile devices.
 */
export default function WOAttachments({ woId }) {
    const { t } = useTranslation();
    const [attachments, setAttachments] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [preview, setPreview] = useState(null);
    const fileInputRef = useRef(null);
    const cameraInputRef = useRef(null);

    const plantId = localStorage.getItem('activePlant') || 'Demo_Plant_1';
    const headers = { 'x-plant-id': plantId };

    useEffect(() => {
        if (!woId) return;
        fetch(`/api/work-orders/${woId}/attachments`, { headers })
            .then(r => r.json())
            .then(data => setAttachments(Array.isArray(data) ? data : []))
            .catch(() => setAttachments([]));
    }, [woId]);

    const handleUpload = async (files) => {
        if (!files || files.length === 0) return;
        setUploading(true);

        for (const file of files) {
            const formData = new FormData();
            formData.append('file', file);

            try {
                const res = await fetch(`/api/work-orders/${woId}/attachments`, {
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
            await fetch(`/api/work-orders/${woId}/attachments/${filename}`, {
                method: 'DELETE',
                headers
            });
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

    const panelStyle = {
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        padding: 16,
        marginTop: 12,
    };

    return (
        <div style={panelStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.85rem', color: '#f1f5f9' }}>
                    <Paperclip size={16} color="#6366f1" />
                    {t('wOAttachments.heading', 'Attachments')}
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
                    <button 
                        onClick={() => cameraInputRef.current?.click()}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '5px 10px', background: 'rgba(16,185,129,0.1)',
                            border: '1px solid rgba(16,185,129,0.25)', borderRadius: 6,
                            color: '#10b981', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer',
                        }}
                        title={t('wOAttachments.takePhotoTip')}
                    >
                        <Camera size={13} />{t('wOAttachments.text.photo', 'Photo')}</button>
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '5px 10px', background: 'rgba(99,102,241,0.1)',
                            border: '1px solid rgba(99,102,241,0.25)', borderRadius: 6,
                            color: '#818cf8', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer',
                        }}
                     title={t('wOAttachments.uploadTip')}>
                        <Upload size={13} />{t('wOAttachments.text.upload', 'Upload')}</button>
                </div>
            </div>

            {/* Hidden file inputs */}
            <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                   style={{ display: 'none' }} onChange={e => handleUpload(e.target.files)} />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment"
                   style={{ display: 'none' }} onChange={e => handleUpload(e.target.files)} />

            {/* Drop Zone */}
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
                    marginBottom: attachments.length > 0 ? 12 : 0,
                    cursor: 'pointer',
                }}
                onClick={() => fileInputRef.current?.click()}
            >
                {uploading ? t('wOAttachments.uploading', '⏳ Uploading...') : (dragOver ? t('wOAttachments.dropFilesHere', '📎 Drop files here') : t('wOAttachments.dragDropBrowse', 'Drag & drop files, or click to browse'))}
            </div>

            {/* Attachment Grid */}
            {attachments.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                    {attachments.map(att => (
                        <div key={att.filename} style={{
                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 8, overflow: 'hidden', position: 'relative',
                        }}>
                            {/* Preview area */}
                            {att.type === 'image' ? (
                                <div
                                    style={{
                                        height: 90, backgroundImage: `url(${att.url})`,
                                        backgroundSize: 'cover', backgroundPosition: 'center',
                                        cursor: 'pointer',
                                    }}
                                    onClick={() => setPreview(att)}
                                />
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

                            {/* Info bar */}
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

                            {/* Delete button */}
                            <button 
                                onClick={() => handleDelete(att.filename)}
                                style={{
                                    position: 'absolute', top: 4, right: 4,
                                    width: 22, height: 22, borderRadius: 6,
                                    background: 'rgba(0,0,0,0.6)', border: 'none',
                                    color: '#ef4444', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                                title={t('common.delete', 'Delete')}
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Preview Modal */}
            {preview && (
                <div
                    style={{
                        position: 'fixed', inset: 0, zIndex: 10000,
                        background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', padding: 20,
                    }}
                    onClick={() => setPreview(null)}
                >
                    <button 
                        onClick={() => setPreview(null)}
                        style={{
                            position: 'absolute', top: 20, right: 20,
                            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: 8, color: '#fff', cursor: 'pointer', padding: '6px 10px',
                        }}
                     title={t('wOAttachments.previewTip')}>
                        <X size={18} />
                    </button>
                    {preview.type === 'image' ? (
                        <img src={preview.url}
                            alt="Attachment preview"
                            style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 12, boxShadow: '0 0 40px rgba(0,0,0,0.5)' }}
                            onClick={e => e.stopPropagation()}
                        />
                    ) : preview.type === 'video' ? (
                        <video
                            src={preview.url}
                            controls
                            style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 12 }}
                            onClick={e => e.stopPropagation()}
                        />
                    ) : null}
                </div>
            )}
        </div>
    );
}
