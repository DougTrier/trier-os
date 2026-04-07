// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Photo Assembly: Floor Plan Builder
 * ===============================================
 * Builds composite facility floor plans from multiple smartphone photos.
 * Extracts EXIF GPS data to auto-position photos on the canvas by geographic
 * proximity, then allows manual drag-to-arrange for precise alignment.
 *
 * WORKFLOW STEPS:
 *   1. Upload     — Drop or capture multiple facility photos (JPEG/PNG)
 *   2. Arrange    — Photos auto-positioned by GPS; drag to fine-tune layout
 *   3. Export     — Flatten canvas to a single composite image for the floor plan
 *
 * KEY FEATURES:
 *   - EXIF extraction via exifr library: lat/lng and compass heading per photo
 *   - GPS-based auto-positioning: photos placed by geographic proximity
 *   - Manual positioning: drag, rotate, resize, and set opacity per photo
 *   - Layer panel: reorder photos (z-index) for proper overlap blending
 *   - Zoom controls: zoom in/out on the assembly canvas
 *   - Export: flatten all layers to a single PNG and save as floor plan image
 *
 * @param {string}   plantId  — Target plant for the resulting floor plan
 * @param {object}   headers  — Auth headers for upload API call
 * @param {Function} onSave   — Callback after successful floor plan export
 * @param {Function} onCancel — Dismiss the assembler without saving
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, Upload, MapPin, RotateCcw, Move, Trash2, Save, X, Image, Navigation, Info, ZoomIn, ZoomOut, Layers } from 'lucide-react';
import exifr from 'exifr';
import { useTranslation } from '../i18n/index.jsx';

export default function PhotoAssembly({ plantId, headers, onSave, onCancel }) {
    const { t } = useTranslation();
    const [photos, setPhotos] = useState([]); // { id, file, url, gps: { lat, lng }, heading, name, x, y, width, height, rotation, opacity }
    const [step, setStep] = useState('upload'); // 'upload', 'arrange', 'export'
    const [selectedPhoto, setSelectedPhoto] = useState(null);
    const [canvasZoom, setCanvasZoom] = useState(1);
    const [canvasPan, setCanvasPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [isMovingPhoto, setIsMovingPhoto] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [exporting, setExporting] = useState(false);
    const [guideStep, setGuideStep] = useState(0);
    const [showGuide, setShowGuide] = useState(true);
    const canvasRef = useRef(null);
    const fileInputRef = useRef(null);
    const nextId = useRef(1);

    // ── Guide Walk-Through Steps ──
    const GUIDE_STEPS = [
        { title: '📱 Step 1: Take Photos', desc: 'Walk through your facility and take photos of each area. Hold your phone level and try to capture from the same height. Take photos every 10-15 feet for best coverage.' },
        { title: '📤 Step 2: Upload', desc: 'Upload all your photos here. The system will automatically read GPS coordinates and compass heading from each photo\'s EXIF data.' },
        { title: '🗺️ Step 3: Auto-Arrange', desc: 'Photos with GPS data will be automatically arranged based on their real-world positions. Photos without GPS will be placed in a grid.' },
        { title: '✋ Step 4: Manual Adjust', desc: 'Drag, resize, rotate, and adjust opacity of each photo to fine-tune the layout. Overlap photos to create a seamless floor plan.' },
        { title: '💾 Step 5: Export', desc: 'When satisfied with the arrangement, export the composite image as your floor plan. All photos are merged into a single image.' },
    ];

    // ── EXIF GPS Extraction ──
    const extractExif = async (file) => {
        try {
            const exif = await exifr.parse(file, {
                gps: true,
                pick: ['GPSLatitude', 'GPSLongitude', 'GPSImgDirection', 'GPSImgDirectionRef',
                       'Make', 'Model', 'DateTimeOriginal', 'ImageWidth', 'ImageHeight']
            });
            if (exif) {
                return {
                    lat: exif.latitude || null,
                    lng: exif.longitude || null,
                    heading: exif.GPSImgDirection || null,
                    camera: exif.Make ? `${exif.Make} ${exif.Model || ''}`.trim() : null,
                    date: exif.DateTimeOriginal || null,
                };
            }
        } catch (e) {
            console.warn('EXIF parse failed for', file.name, e);
        }
        return { lat: null, lng: null, heading: null, camera: null, date: null };
    };

    // ── Handle Multi-Photo Upload ──
    const handlePhotosUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        const newPhotos = [];
        for (const file of files) {
            const url = URL.createObjectURL(file);
            const exif = await extractExif(file);

            // Load image to get natural dimensions
            const dims = await new Promise((resolve) => {
                const img = new window.Image();
                img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
                img.onerror = () => resolve({ w: 400, h: 300 });
                img.src = url;
            });

            newPhotos.push({
                id: nextId.current++,
                file,
                url,
                name: file.name,
                gps: { lat: exif.lat, lng: exif.lng },
                heading: exif.heading,
                camera: exif.camera,
                date: exif.date,
                naturalW: dims.w,
                naturalH: dims.h,
                // Canvas placement — will be set during arrange
                x: 0, y: 0,
                width: 250, // default display width
                height: Math.round(250 * (dims.h / dims.w)),
                rotation: 0,
                opacity: 0.85,
            });
        }

        setPhotos(prev => [...prev, ...newPhotos]);
        if (files.length > 0) setStep('arrange');
    };

    // ── Auto-Arrange Photos by GPS ──
    const autoArrange = useCallback(() => {
        if (photos.length === 0) return;

        const gpsPhotos = photos.filter(p => p.gps.lat && p.gps.lng);
        const noGpsPhotos = photos.filter(p => !p.gps.lat || !p.gps.lng);

        let arranged = [...photos];

        if (gpsPhotos.length >= 2) {
            // Calculate GPS bounds
            const lats = gpsPhotos.map(p => p.gps.lat);
            const lngs = gpsPhotos.map(p => p.gps.lng);
            const minLat = Math.min(...lats), maxLat = Math.max(...lats);
            const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
            const latRange = maxLat - minLat || 0.0001;
            const lngRange = maxLng - minLng || 0.0001;

            // Map GPS to canvas coordinates (1000x1000 working area)
            const canvasW = 1200, canvasH = 900;
            const margin = 100;

            gpsPhotos.forEach(p => {
                const idx = arranged.findIndex(a => a.id === p.id);
                if (idx >= 0) {
                    const normX = (p.gps.lng - minLng) / lngRange;
                    const normY = 1 - (p.gps.lat - minLat) / latRange; // flip Y (north = up)
                    arranged[idx] = {
                        ...arranged[idx],
                        x: margin + normX * (canvasW - margin * 2 - arranged[idx].width),
                        y: margin + normY * (canvasH - margin * 2 - arranged[idx].height),
                        rotation: p.heading ? -p.heading : 0, // align by compass heading
                    };
                }
            });
        }

        // Place non-GPS photos in a grid below
        if (noGpsPhotos.length > 0) {
            const startY = gpsPhotos.length > 0 ? 700 : 50;
            const cols = Math.ceil(Math.sqrt(noGpsPhotos.length));
            noGpsPhotos.forEach((p, i) => {
                const row = Math.floor(i / cols);
                const col = i % cols;
                const idx = arranged.findIndex(a => a.id === p.id);
                if (idx >= 0) {
                    arranged[idx] = {
                        ...arranged[idx],
                        x: 50 + col * 280,
                        y: startY + row * 220,
                    };
                }
            });
        }

        setPhotos(arranged);
    }, [photos]);

    // Auto-arrange when entering arrange step with new photos
    useEffect(() => {
        if (step === 'arrange' && photos.length > 0 && photos.every(p => p.x === 0 && p.y === 0)) {
            autoArrange();
        }
    }, [step, photos.length]);

    // ── Photo Move (drag) ──
    const handleCanvasMouseDown = (e) => {
        if (isMovingPhoto) return;
        e.preventDefault();
        setIsDragging(true);
        setDragStart({ x: e.clientX - canvasPan.x, y: e.clientY - canvasPan.y });
    };

    const handleCanvasMouseMove = useCallback((e) => {
        if (isDragging) {
            setCanvasPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
        }
    }, [isDragging, dragStart]);

    const handleCanvasMouseUp = () => {
        setIsDragging(false);
    };

    // ── Individual Photo Drag ──
    const handlePhotoDragStart = (e, photoId) => {
        e.stopPropagation();
        setSelectedPhoto(photoId);
        setIsMovingPhoto(true);
        const photo = photos.find(p => p.id === photoId);
        setDragStart({ x: e.clientX - photo.x * canvasZoom, y: e.clientY - photo.y * canvasZoom });
    };

    const handlePhotoDragMove = useCallback((e) => {
        if (isMovingPhoto && selectedPhoto) {
            const newX = (e.clientX - dragStart.x) / canvasZoom;
            const newY = (e.clientY - dragStart.y) / canvasZoom;
            setPhotos(prev => prev.map(p =>
                p.id === selectedPhoto ? { ...p, x: newX, y: newY } : p
            ));
        }
    }, [isMovingPhoto, selectedPhoto, dragStart, canvasZoom]);

    const handlePhotoDragEnd = () => {
        setIsMovingPhoto(false);
    };

    // Document-level listeners for photo drag
    useEffect(() => {
        if (!isMovingPhoto) return;
        const onMove = (e) => handlePhotoDragMove(e);
        const onUp = () => handlePhotoDragEnd();
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
    }, [isMovingPhoto, handlePhotoDragMove]);

    // ── Photo Property Controls ──
    const updatePhoto = (id, updates) => {
        setPhotos(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
    };

    const removePhoto = (id) => {
        const photo = photos.find(p => p.id === id);
        if (photo) URL.revokeObjectURL(photo.url);
        setPhotos(prev => prev.filter(p => p.id !== id));
        if (selectedPhoto === id) setSelectedPhoto(null);
    };

    // ── Export Composite Image ──
    const exportComposite = async () => {
        if (photos.length === 0) return;
        setExporting(true);

        try {
            // Calculate bounds of all photos
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            photos.forEach(p => {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x + p.width);
                maxY = Math.max(maxY, p.y + p.height);
            });

            const padding = 20;
            const w = Math.ceil(maxX - minX + padding * 2);
            const h = Math.ceil(maxY - minY + padding * 2);

            const canvas = document.createElement('canvas');
            canvas.width = Math.min(w, 4096); // cap at 4K
            canvas.height = Math.min(h, 4096);
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Scale factor if we capped
            const scaleX = canvas.width / w;
            const scaleY = canvas.height / h;
            const scale = Math.min(scaleX, scaleY);

            // Draw each photo
            for (const photo of photos) {
                const img = new window.Image();
                img.crossOrigin = 'anonymous';
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = photo.url;
                });

                ctx.save();
                ctx.globalAlpha = photo.opacity;
                const px = (photo.x - minX + padding) * scale;
                const py = (photo.y - minY + padding) * scale;
                const pw = photo.width * scale;
                const ph = photo.height * scale;

                if (photo.rotation) {
                    ctx.translate(px + pw / 2, py + ph / 2);
                    ctx.rotate((photo.rotation * Math.PI) / 180);
                    ctx.drawImage(img, -pw / 2, -ph / 2, pw, ph);
                } else {
                    ctx.drawImage(img, px, py, pw, ph);
                }
                ctx.restore();
            }

            // Convert to blob and upload as floor plan
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            const formData = new FormData();
            formData.append('plantId', plantId);
            formData.append('name', `Photo Assembly — ${new Date().toLocaleDateString()}`);
            formData.append('floorplan', blob, 'photo-assembly.png');

            const res = await fetch('/api/floorplans', {
                method: 'POST',
                headers: { 'Authorization': headers.Authorization, 'x-plant-id': headers['x-plant-id'] },
                body: formData
            });

            if (res.ok) {
                if (onSave) onSave();
            } else {
                window.trierToast?.error('Failed to save the floor plan. Please try again.');
            }
        } catch (e) {
            console.error('Export error:', e);
            window.trierToast?.error('Failed to generate the composite image: ' + e.message);
        }
        setExporting(false);
    };

    // ── Canvas wheel zoom ──
    const handleWheel = useCallback((e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setCanvasZoom(z => Math.min(Math.max(z + delta, 0.2), 3));
    }, []);

    useEffect(() => {
        const el = canvasRef.current;
        if (!el) return;
        el.addEventListener('wheel', handleWheel, { passive: false });
        return () => el.removeEventListener('wheel', handleWheel);
    }, [handleWheel, step]);

    const gpsCount = photos.filter(p => p.gps.lat && p.gps.lng).length;
    const selectedPhotoData = photos.find(p => p.id === selectedPhoto);

    // ═══════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
            zIndex: 10000, display: 'flex', flexDirection: 'column',
        }}>
            {/* Header Bar */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px',
                background: 'rgba(15,23,42,0.95)', borderBottom: '1px solid rgba(99,102,241,0.3)',
                flexWrap: 'wrap',
            }}>
                <Camera size={20} color="#818cf8" />
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fff' }}>📸 Photo Assembly</span>
                <div style={{ display: 'flex', gap: '4px', marginLeft: '8px' }}>
                    {['upload', 'arrange', 'export'].map((s, i) => (
                        <button key={s} onClick={() => setStep(s)} disabled={s !== 'upload' && photos.length === 0}
                            style={{
                                padding: '4px 14px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700,
                                textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer',
                                background: step === s ? 'rgba(99,102,241,0.25)' : 'transparent',
                                border: step === s ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.1)',
                                color: step === s ? '#818cf8' : '#64748b',
                                opacity: (s !== 'upload' && photos.length === 0) ? 0.4 : 1,
                            }} title="Step">
                            {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                    ))}
                </div>
                <span style={{ marginLeft: '10px', fontSize: '0.75rem', color: '#64748b' }}>
                    {photos.length} photo{photos.length !== 1 ? 's' : ''} • {gpsCount} with GPS
                </span>
                <button onClick={onCancel} style={{
                    marginLeft: 'auto', background: 'none', border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: '8px', padding: '6px 14px', color: '#ef4444', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem',
                }} title="Cancel">
                    <X size={14} /> Cancel
                </button>
            </div>

            {/* Guided Walk-Through */}
            {showGuide && (
                <div style={{
                    padding: '10px 20px', background: 'rgba(6,182,212,0.08)',
                    borderBottom: '1px solid rgba(6,182,212,0.2)',
                    display: 'flex', alignItems: 'center', gap: '10px',
                }}>
                    <Navigation size={14} color="#06b6d4" />
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#06b6d4' }}>
                        {GUIDE_STEPS[guideStep].title}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8', flex: 1 }}>
                        {GUIDE_STEPS[guideStep].desc}
                    </span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                        {GUIDE_STEPS.map((_, i) => (
                            <div key={i} onClick={() => setGuideStep(i)} style={{
                                width: '8px', height: '8px', borderRadius: '50%', cursor: 'pointer',
                                background: i === guideStep ? '#06b6d4' : 'rgba(255,255,255,0.15)',
                                transition: 'all 0.2s',
                            }} />
                        ))}
                    </div>
                    <button onClick={() => setGuideStep(g => Math.min(g + 1, GUIDE_STEPS.length - 1))}
                        style={{ background: 'none', border: 'none', color: '#06b6d4', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700 }} title={t('photoAssembly.guideStepTip')}>
                        {guideStep < GUIDE_STEPS.length - 1 ? 'Next →' : ''}
                    </button>
                    <button onClick={() => setShowGuide(false)} style={{
                        background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: '2px',
                    }} title={t('photoAssembly.dismissGuideTip')}><X size={12} /></button>
                </div>
            )}

            {/* Main Content */}
            <div style={{ flex: 1, display: 'flex', overflow: 'auto', flexDirection: window.innerWidth < 768 ? 'column' : 'row' }}>

                {/* ═══ STEP 1: Upload ═══ */}
                {step === 'upload' && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: '20px', padding: '20px', overflow: 'auto' }}>
                        <div style={{
                            width: '100%', maxWidth: '400px', padding: '30px 20px', borderRadius: '20px', textAlign: 'center',
                            background: 'rgba(99,102,241,0.08)', border: '2px dashed rgba(99,102,241,0.3)',
                            cursor: 'pointer', transition: 'all 0.3s',
                        }}
                            onClick={() => fileInputRef.current?.click()}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.6)'; e.currentTarget.style.background = 'rgba(99,102,241,0.12)'; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)'; e.currentTarget.style.background = 'rgba(99,102,241,0.08)'; }}
                        >
                            <Camera size={48} color="#818cf8" style={{ marginBottom: '15px' }} />
                            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
                                Upload Facility Photos
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8', lineHeight: '1.5' }}>
                                Select multiple photos of your facility.<br />
                                GPS coordinates & compass heading will be<br />
                                automatically extracted from each photo.
                            </div>
                            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handlePhotosUpload}
                                style={{ display: 'none' }} title={t('photoAssembly.selectPhotosOfYourFacilityTip')} />
                        </div>

                        {photos.length > 0 && (
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button onClick={() => setStep('arrange')} style={{
                                    padding: '10px 24px', borderRadius: '10px', fontSize: '0.9rem', fontWeight: 700,
                                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none',
                                    color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                                }} title="Step">
                                    <Layers size={16} /> Arrange {photos.length} Photo{photos.length !== 1 ? 's' : ''} →
                                </button>
                            </div>
                        )}

                        {/* Photo Thumbnails */}
                        {photos.length > 0 && (
                            <div style={{
                                display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center',
                                maxWidth: '800px', maxHeight: '200px', overflow: 'auto', padding: '10px',
                            }}>
                                {photos.map(p => (
                                    <div key={p.id} style={{
                                        width: '100px', borderRadius: '8px', overflow: 'hidden',
                                        border: '1px solid rgba(255,255,255,0.1)', position: 'relative',
                                    }}>
                                        <img src={p.url} style={{ width: '100%', height: '70px', objectFit: 'cover' }} alt={p.name} />
                                        <div style={{ padding: '4px', fontSize: '0.55rem', color: '#94a3b8', lineHeight: '1.3' }}>
                                            {p.gps.lat ? (
                                                <span style={{ color: '#22c55e' }}>📍 GPS ✓</span>
                                            ) : (
                                                <span style={{ color: '#f59e0b' }}>⚠ No GPS</span>
                                            )}
                                            {p.heading && <span style={{ marginLeft: '4px', color: '#06b6d4' }}>🧭 {Math.round(p.heading)}°</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Tips */}
                        <div style={{
                            padding: '16px 20px', borderRadius: '12px', maxWidth: '500px',
                            background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)',
                        }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f59e0b', marginBottom: '6px' }}>💡 Tips for Best Results</div>
                            <ul style={{ fontSize: '0.72rem', color: '#94a3b8', margin: 0, paddingLeft: '15px', lineHeight: '1.8' }}>
                                <li>{t('photoAssembly.enable')} <strong>{t('photoAssembly.locationServices')}</strong> {t('photoAssembly.onYourPhoneCameraFor')}</li>
                                <li>Walk the facility at a steady pace, taking photos every <strong>10-15 feet</strong></li>
                                <li>{t('photoAssembly.holdYourPhone')} <strong>{t('photoAssembly.level')}</strong> {t('photoAssembly.andAt')} <strong>{t('photoAssembly.chestHeight')}</strong></li>
                                <li>{t('photoAssembly.ensureSome')} <strong>{t('photoAssembly.overlap')}</strong> {t('photoAssembly.betweenAdjacentPhotos2030')}</li>
                                <li>{t('photoAssembly.photosWithCompassHeadingData')} <strong>auto-rotated</strong></li>
                            </ul>
                        </div>
                    </div>
                )}

                {/* ═══ STEP 2: Arrange ═══ */}
                {step === 'arrange' && (
                    <>
                        {/* Canvas Area */}
                        <div ref={canvasRef} style={{
                            flex: 1, overflow: 'hidden', position: 'relative',
                            background: 'rgba(0,0,0,0.3)',
                            cursor: isMovingPhoto ? 'grabbing' : isDragging ? 'grabbing' : 'grab',
                        }}
                            onMouseDown={handleCanvasMouseDown}
                            onMouseMove={handleCanvasMouseMove}
                            onMouseUp={handleCanvasMouseUp}
                            onMouseLeave={handleCanvasMouseUp}
                        >
                            {/* Zoomable/Pannable container */}
                            <div style={{
                                transform: `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${canvasZoom})`,
                                transformOrigin: 'top left',
                                position: 'relative',
                                width: '2000px', height: '1500px',
                                transition: isDragging || isMovingPhoto ? 'none' : 'transform 0.15s ease',
                            }}>
                                {/* Grid background */}
                                <svg width="2000" height="1500" style={{ position: 'absolute', top: 0, left: 0 }}>
                                    <defs>
                                        <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                                            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                                        </pattern>
                                    </defs>
                                    <rect width="100%" height="100%" fill="url(#grid)" />
                                </svg>

                                {/* Photos on canvas */}
                                {photos.map(photo => (
                                    <div key={photo.id}
                                        onMouseDown={(e) => handlePhotoDragStart(e, photo.id)}
                                        onClick={(e) => { e.stopPropagation(); setSelectedPhoto(photo.id); }}
                                        style={{
                                            position: 'absolute',
                                            left: photo.x,
                                            top: photo.y,
                                            width: photo.width,
                                            height: photo.height,
                                            transform: photo.rotation ? `rotate(${photo.rotation}deg)` : 'none',
                                            opacity: photo.opacity,
                                            border: selectedPhoto === photo.id
                                                ? '2px solid #6366f1'
                                                : '1px solid rgba(255,255,255,0.15)',
                                            borderRadius: '4px',
                                            overflow: 'hidden',
                                            cursor: 'move',
                                            boxShadow: selectedPhoto === photo.id
                                                ? '0 0 20px rgba(99,102,241,0.4)'
                                                : '0 2px 8px rgba(0,0,0,0.5)',
                                            transition: isMovingPhoto ? 'none' : 'border 0.15s, box-shadow 0.15s',
                                        }}
                                    >
                                        <img src={photo.url} alt={photo.name}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', userSelect: 'none', pointerEvents: 'none' }}
                                            draggable={false}
                                        />
                                        {/* Photo label overlay */}
                                        <div style={{
                                            position: 'absolute', bottom: 0, left: 0, right: 0,
                                            padding: '3px 6px', background: 'rgba(0,0,0,0.7)',
                                            fontSize: '0.5rem', color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '4px',
                                        }}>
                                            {photo.gps.lat && <MapPin size={8} color="#22c55e" />}
                                            {photo.heading && <Navigation size={8} color="#06b6d4" style={{ transform: `rotate(${photo.heading}deg)` }} />}
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{photo.name}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Canvas zoom controls */}
                            <div style={{
                                position: 'absolute', bottom: '15px', right: '15px',
                                display: 'flex', gap: '4px', alignItems: 'center',
                            }}>
                                <button onClick={() => setCanvasZoom(z => Math.min(z + 0.2, 3))}
                                    style={{ background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', padding: '6px', color: '#fff', cursor: 'pointer' }} title={t('photoAssembly.canvasZoomTip')}>
                                    <ZoomIn size={14} />
                                </button>
                                <span style={{ fontSize: '0.65rem', color: '#94a3b8', minWidth: '36px', textAlign: 'center', fontFamily: 'monospace' }}>
                                    {Math.round(canvasZoom * 100)}%
                                </span>
                                <button onClick={() => setCanvasZoom(z => Math.max(z - 0.2, 0.2))}
                                    style={{ background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', padding: '6px', color: '#fff', cursor: 'pointer' }} title={t('photoAssembly.canvasZoomTip')}>
                                    <ZoomOut size={14} />
                                </button>
                                <button onClick={() => { setCanvasZoom(1); setCanvasPan({ x: 0, y: 0 }); }}
                                    style={{ background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', padding: '6px', color: '#fff', cursor: 'pointer' }} title={t('photoAssembly.canvasZoomTip')}>
                                    <RotateCcw size={14} />
                                </button>
                            </div>
                        </div>

                        {/* Properties Panel (right side) */}
                        <div style={{
                            width: '260px', minWidth: '260px', overflow: 'auto',
                            background: 'rgba(15,23,42,0.95)', borderLeft: '1px solid rgba(255,255,255,0.08)',
                            padding: '12px',
                        }}>
                            {/* Action buttons */}
                            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
                                <button onClick={() => fileInputRef.current?.click()} style={{
                                    padding: '6px 10px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 600,
                                    background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
                                    color: '#818cf8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', flex: 1,
                                }} title={t('photoAssembly.addMoreTip')}>
                                    <Upload size={12} /> Add More
                                </button>
                                <button onClick={autoArrange} style={{
                                    padding: '6px 10px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 600,
                                    background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.3)',
                                    color: '#06b6d4', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', flex: 1,
                                }} title={t('photoAssembly.autoArrangeTip')}>
                                    <RotateCcw size={12} /> Re-arrange
                                </button>
                                <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handlePhotosUpload}
                                    style={{ display: 'none' }} title={t('photoAssembly.addMorePhotosTip')} />
                            </div>

                            <button onClick={() => setStep('export')} style={{
                                width: '100%', padding: '8px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700,
                                background: 'linear-gradient(135deg, #22c55e, #16a34a)', border: 'none',
                                color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                marginBottom: '15px',
                            }} title={t('photoAssembly.exportAsFloorPlanTip')}>
                                <Save size={14} /> Export as Floor Plan
                            </button>

                            {/* Photo List */}
                            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>
                                Photos ({photos.length})
                            </div>
                            {photos.map(p => (
                                <div key={p.id} onClick={() => setSelectedPhoto(p.id)} style={{
                                    display: 'flex', gap: '8px', padding: '6px', borderRadius: '6px', marginBottom: '4px',
                                    background: selectedPhoto === p.id ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.02)',
                                    border: selectedPhoto === p.id ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
                                    cursor: 'pointer', transition: 'all 0.15s',
                                }}>
                                    <img src={p.url} style={{ width: '40px', height: '30px', objectFit: 'cover', borderRadius: '4px' }} alt="" />
                                    <div style={{ flex: 1, overflow: 'hidden' }}>
                                        <div style={{ fontSize: '0.65rem', color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {p.name}
                                        </div>
                                        <div style={{ fontSize: '0.55rem', color: '#64748b', display: 'flex', gap: '6px' }}>
                                            {p.gps.lat ? <span style={{ color: '#22c55e' }}>📍 GPS</span> : <span style={{ color: '#f59e0b' }}>No GPS</span>}
                                            {p.heading && <span style={{ color: '#06b6d4' }}>🧭 {Math.round(p.heading)}°</span>}
                                        </div>
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); removePhoto(p.id); }}
                                        style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: '2px' }} title={t('photoAssembly.removeThisPhotoTip')}>
                                        <Trash2 size={11} />
                                    </button>
                                </div>
                            ))}

                            {/* Selected Photo Properties */}
                            {selectedPhotoData && (
                                <div style={{ marginTop: '15px', padding: '10px', borderRadius: '8px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
                                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#818cf8', marginBottom: '10px' }}>
                                        ✏️ Edit: {selectedPhotoData.name}
                                    </div>

                                    {/* Size */}
                                    <div style={{ marginBottom: '8px' }}>
                                        <label style={{ fontSize: '0.6rem', color: '#64748b', display: 'block', marginBottom: '3px' }}>Width</label>
                                        <input type="range" min={80} max={800} value={selectedPhotoData.width}
                                            onChange={(e) => {
                                                const w = parseInt(e.target.value, 10);
                                                const aspect = selectedPhotoData.naturalH / selectedPhotoData.naturalW;
                                                updatePhoto(selectedPhotoData.id, { width: w, height: Math.round(w * aspect) });
                                            }}
                                            style={{ width: '100%' }} title={`Width: ${selectedPhotoData.width}px`}
                                        />
                                    </div>

                                    {/* Rotation */}
                                    <div style={{ marginBottom: '8px' }}>
                                        <label style={{ fontSize: '0.6rem', color: '#64748b', display: 'block', marginBottom: '3px' }}>Rotation: {Math.round(selectedPhotoData.rotation)}°</label>
                                        <input type="range" min={-180} max={180} value={selectedPhotoData.rotation}
                                            onChange={(e) => updatePhoto(selectedPhotoData.id, { rotation: parseInt(e.target.value, 10) })}
                                            style={{ width: '100%' }} title={`Rotation: ${selectedPhotoData.rotation}°`}
                                        />
                                    </div>

                                    {/* Opacity */}
                                    <div style={{ marginBottom: '8px' }}>
                                        <label style={{ fontSize: '0.6rem', color: '#64748b', display: 'block', marginBottom: '3px' }}>Opacity: {Math.round(selectedPhotoData.opacity * 100)}%</label>
                                        <input type="range" min={10} max={100} value={Math.round(selectedPhotoData.opacity * 100)}
                                            onChange={(e) => updatePhoto(selectedPhotoData.id, { opacity: parseInt(e.target.value, 10) / 100 })}
                                            style={{ width: '100%' }} title={`Opacity: ${Math.round(selectedPhotoData.opacity * 100)}%`}
                                        />
                                    </div>

                                    {/* EXIF Info */}
                                    {(selectedPhotoData.gps.lat || selectedPhotoData.camera || selectedPhotoData.date) && (
                                        <div style={{ marginTop: '8px', padding: '6px', borderRadius: '6px', background: 'rgba(0,0,0,0.2)', fontSize: '0.55rem', color: '#64748b', lineHeight: '1.6' }}>
                                            {selectedPhotoData.gps.lat && (
                                                <div>📍 {selectedPhotoData.gps.lat.toFixed(6)}, {selectedPhotoData.gps.lng.toFixed(6)}</div>
                                            )}
                                            {selectedPhotoData.heading && <div>🧭 Heading: {selectedPhotoData.heading.toFixed(1)}°</div>}
                                            {selectedPhotoData.camera && <div>📷 {selectedPhotoData.camera}</div>}
                                            {selectedPhotoData.date && <div>📅 {new Date(selectedPhotoData.date).toLocaleString()}</div>}
                                        </div>
                                    )}

                                    <button onClick={() => removePhoto(selectedPhotoData.id)} style={{
                                        marginTop: '8px', width: '100%', padding: '5px', borderRadius: '6px',
                                        fontSize: '0.65rem', background: 'rgba(239,68,68,0.1)',
                                        border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                                    }} title={t('photoAssembly.removePhotoTip')}>
                                        <Trash2 size={11} /> Remove Photo
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* ═══ STEP 3: Export ═══ */}
                {step === 'export' && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: '20px', padding: '20px', overflow: 'auto' }}>
                        <div style={{
                            padding: '25px 20px', borderRadius: '16px', textAlign: 'center', maxWidth: '400px', width: '100%',
                            background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)',
                        }}>
                            <Save size={48} color="#22c55e" style={{ marginBottom: '15px' }} />
                            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff', marginBottom: '12px' }}>
                                Export Floor Plan
                            </div>
                            <div style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: '1.6', marginBottom: '20px' }}>
                                This will merge all {photos.length} photos into a single composite image
                                and save it as a new floor plan for this plant.
                            </div>
                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                <button onClick={() => setStep('arrange')} style={{
                                    padding: '10px 20px', borderRadius: '10px', fontSize: '0.85rem',
                                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)',
                                    color: '#94a3b8', cursor: 'pointer',
                                }} title="Step">
                                    ← Back to Arrange
                                </button>
                                <button onClick={exportComposite} disabled={exporting} style={{
                                    padding: '10px 24px', borderRadius: '10px', fontSize: '0.9rem', fontWeight: 700,
                                    background: exporting ? 'rgba(34,197,94,0.3)' : 'linear-gradient(135deg, #22c55e, #16a34a)',
                                    border: 'none', color: '#fff', cursor: exporting ? 'wait' : 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                }} title={t('photoAssembly.exportCompositeTip')}>
                                    {exporting ? '⏳ Generating...' : <><Save size={16} /> Save as Floor Plan</>}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
