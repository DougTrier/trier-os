// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Digital Twin Interactive Schematic Viewer
 * =======================================================
 * Interactive asset schematic canvas with draggable health-status pins,
 * live sensor data overlays, and work order integration. Connects to
 * /api/digital-twin endpoints (server/routes/digitalTwin.js).
 *
 * KEY FEATURES:
 *   Schematic Upload  — Upload PNG/SVG equipment schematics as the canvas background
 *   Status Pins       — Place colored pins at any point on the schematic
 *                       Colors: green (healthy), amber (warning), red (critical)
 *   Live Sensor Data  — Pins linked to sensor IDs show real-time readings in tooltips
 *   WO Integration    — Pins linked to open WOs show WO number and priority badge
 *   Drag to Reposition — Click-and-drag pins to adjust position; saved immediately
 *   Zoom Controls     — Pinch/scroll zoom with fit-to-screen button
 *
 * PIN TYPES: Sensor | WorkOrder | Note | Measurement | SafetyHazard
 *
 * API CALLS:
 *   GET    /api/digital-twin/:assetId       Schematics and all pins for an asset
 *   POST   /api/digital-twin/schematic      Upload/register a schematic image
 *   POST   /api/digital-twin/pin            Add a new pin to a schematic
 *   PUT    /api/digital-twin/pin/:id        Update pin position or linked data
 *   GET    /api/digital-twin/pin/:id/live   Fetch live sensor value for a pin
 *
 * PRINT: Snapshot of schematic with pin overlay via PrintEngine camera capture.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Cpu, Upload, Plus, X, Save, Trash2, ZoomIn, ZoomOut, Maximize2, Activity, Wrench, Package, Eye, Crosshair, Layers, HelpCircle, Camera, Printer, Pencil } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';
import { useTranslation } from '../i18n/index.jsx';

const PIN_COLORS = {
    healthy: '#10b981',
    warning: '#f59e0b',
    critical: '#ef4444',
    unknown: '#6366f1'
};

const PIN_TYPES = [
    { value: 'component', label: 'Component', icon: '⚙️' },
    { value: 'sensor', label: 'Sensor', icon: '📡' },
    { value: 'lubrication', label: 'Lube Point', icon: '🛢️' },
    { value: 'electrical', label: 'Electrical', icon: '⚡' },
    { value: 'inspection', label: 'Inspection Pt', icon: '🔍' },
    { value: 'safety', label: 'Safety', icon: '🛡️' },
    { value: 'note', label: 'Note', icon: '📝' }
];

export default function DigitalTwinView({ assetId, assetDescription, onClose }) {
    const { t } = useTranslation();
    const [schematics, setSchematics] = useState([]);
    const [activeSch, setActiveSch] = useState(0);
    const [pins, setPins] = useState([]);
    const [selectedPin, setSelectedPin] = useState(null);
    const [pinLiveData, setPinLiveData] = useState(null);
    const [isPlacingPin, setIsPlacingPin] = useState(false);
    const [newPinForm, setNewPinForm] = useState({ pinLabel: '', pinType: 'component', notes: '' });
    const [pendingPos, setPendingPos] = useState(null);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [editingPin, setEditingPin] = useState(null);
    const [showFaq, setShowFaq] = useState(false);

    // Editing schematic state
    const [isEditingSch, setIsEditingSch] = useState(false);
    const [editSchForm, setEditSchForm] = useState({ label: '', schematicType: 'photo' });

    const [draggedPin, setDraggedPin] = useState(null);

    // Editing existing pin state
    const [isEditingPin, setIsEditingPin] = useState(false);
    const [editPinForm, setEditPinForm] = useState({ pinLabel: '', pinType: 'component', notes: '' });
    const canvasRef = useRef(null);
    const imgRef = useRef(null);
    const fileInputRef = useRef(null);
    const cameraInputRef = useRef(null);

    const headers = {
        'x-plant-id': localStorage.getItem('selectedPlant') || 'Demo_Plant_1'
    };

    // ── Fetch schematics ──
    const fetchTwin = useCallback(async () => {
        if (!assetId) return;
        try {
            const res = await fetch(`/api/digital-twin/${assetId}`, { headers });
            const data = await res.json();
            setSchematics(data.schematics || []);
            if (data.schematics?.length > 0) {
                setPins(data.schematics[activeSch]?.pins || []);
            }
        } catch (err) {
            console.error('Failed to fetch digital twin data');
        }
        setLoading(false);
    }, [assetId, activeSch]);

    useEffect(() => { fetchTwin(); }, [fetchTwin]);

    useEffect(() => {
        if (schematics[activeSch]) {
            setPins(schematics[activeSch].pins || []);
        }
    }, [activeSch, schematics]);

    // ── Upload schematic ──
    const handleUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploading(true);
        const formData = new FormData();
        formData.append('schematic', file);
        formData.append('assetId', assetId);
        formData.append('label', `View ${schematics.length + 1}`);
        formData.append('schematicType', file.type.includes('pdf') ? 'diagram' : 'photo');
        try {
            const res = await fetch('/api/digital-twin/schematic', {
                method: 'POST', headers: { ...headers }, body: formData
            });
            delete headers['Content-Type']; // multipart sets its own
            const data = await res.json();
            if (data.success) {
                await fetchTwin();
                setActiveSch(schematics.length);
            }
        } catch (err) {
            console.error('Upload failed');
        }
        setUploading(false);
    };

    // ── Delete schematic ──
    const handleDeleteSchematic = async (id) => {
        if (!await confirm('Delete this schematic view and all its pins?')) return;
        await fetch(`/api/digital-twin/schematic/${id}`, {
            method: 'DELETE', headers
        });
        setActiveSch(0);
        fetchTwin();
    };

    // ── Canvas click → place pin ──
    const handleCanvasClick = (e) => {
        if (!imgRef.current) return;
        const rect = imgRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width * 100)));
        const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height * 100)));

        if (isEditingPin && selectedPin) {
            setEditPinForm(prev => ({ ...prev, xPercent: x, yPercent: y }));
            return;
        }

        if (isPlacingPin) {
            setPendingPos({ x, y });
        }
    };

    // ── Save new pin ──
    const handleSavePin = async () => {
        if (!pendingPos || !newPinForm.pinLabel.trim()) return;
        const schematic = schematics[activeSch];
        if (!schematic) return;
        try {
            await fetch('/api/digital-twin/pin', {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    schematicId: schematic.ID,
                    pinLabel: newPinForm.pinLabel,
                    pinType: newPinForm.pinType,
                    xPercent: pendingPos.x,
                    yPercent: pendingPos.y,
                    notes: newPinForm.notes
                })
            });
            setIsPlacingPin(false);
            setPendingPos(null);
            setNewPinForm({ pinLabel: '', pinType: 'component', notes: '' });
            fetchTwin();
        } catch (err) {
            console.error('Pin save failed');
        }
    };

    // ── Update pin ──
    const handleUpdatePin = async (pinId, updates) => {
        await fetch(`/api/digital-twin/pin/${pinId}`, {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        
        if (selectedPin && selectedPin.ID === pinId) {
            setSelectedPin(prev => ({
                ...prev,
                PinLabel: updates.pinLabel !== undefined ? updates.pinLabel : prev.PinLabel,
                PinType: updates.pinType !== undefined ? updates.pinType : prev.PinType,
                XPercent: updates.xPercent !== undefined ? updates.xPercent : prev.XPercent,
                YPercent: updates.yPercent !== undefined ? updates.yPercent : prev.YPercent,
                Notes: updates.notes !== undefined ? updates.notes : prev.Notes,
                HealthStatus: updates.healthStatus !== undefined ? updates.healthStatus : prev.HealthStatus
            }));
        }

        fetchTwin();
        setEditingPin(null);
    };

    const handleSavePinEdits = async () => {
        if (!selectedPin || !editPinForm.pinLabel.trim()) return;
        await handleUpdatePin(selectedPin.ID, editPinForm);
        setIsEditingPin(false);
    };

    // ── Update Schematic ──
    const handleSaveSchEdits = async () => {
        const schematic = schematics[activeSch];
        if (!schematic || !editSchForm.label.trim()) return;
        await fetch(`/api/digital-twin/schematic/${schematic.ID}`, {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify(editSchForm)
        });
        setIsEditingSch(false);
        fetchTwin();
    };

    // ── Delete pin ──
    const handleDeletePin = async (pinId) => {
        if (!await confirm('Delete this pin?')) return;
        await fetch(`/api/digital-twin/pin/${pinId}`, {
            method: 'DELETE', headers
        });
        setSelectedPin(null);
        setPinLiveData(null);
        fetchTwin();
    };

    // ── Fetch live data for selected pin ──
    const fetchPinLive = async (pin) => {
        setIsEditingPin(false);
        setSelectedPin(pin);
        setPinLiveData(null);
        try {
            const res = await fetch(`/api/digital-twin/pin/${pin.ID}/live`, { headers });
            const data = await res.json();
            setPinLiveData(data);
        } catch (err) {
            console.error('Failed to fetch pin data');
        }
    };

    // ── Pan/Zoom handlers ──
    const handleWheel = useCallback((e) => {
        if (e.cancelable) {
            e.preventDefault();
        }
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setZoom(prev => Math.max(0.5, Math.min(4, prev + delta)));
    }, []);

    // Bind non-passive wheel event
    useEffect(() => {
        const currentCanvas = canvasRef.current;
        if (currentCanvas) {
            currentCanvas.addEventListener('wheel', handleWheel, { passive: false });
        }
        return () => {
            if (currentCanvas) {
                currentCanvas.removeEventListener('wheel', handleWheel);
            }
        };
    }, [handleWheel, loading, activeSch]);

    const handleMouseDown = (e) => {
        if (isPlacingPin) return;
        if (e.button === 0 && !e.target.closest('.dt-pin')) {
            setIsDragging(true);
            setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
        }
    };

    const handleMouseMove = (e) => {
        if (draggedPin && imgRef.current) {
            const rect = imgRef.current.getBoundingClientRect();
            const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width * 100)));
            const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height * 100)));
            
            if (isEditingPin && selectedPin?.ID === draggedPin.ID) {
                setEditPinForm(p => ({ ...p, xPercent: x, yPercent: y }));
            } else if (isEditingSch) {
                setPins(prev => prev.map(p => p.ID === draggedPin.ID ? { ...p, XPercent: x, YPercent: y } : p));
            }
            return;
        }

        if (isDragging && dragStart) {
            setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
        }
    };

    const handleMouseUp = async (e) => {
        if (draggedPin) {
            e.stopPropagation();
            if (isEditingSch) {
                const finalPin = pins.find(p => p.ID === draggedPin.ID);
                if (finalPin) {
                    await fetch(`/api/digital-twin/pin/${finalPin.ID}`, {
                        method: 'PUT',
                        headers: { ...headers, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ xPercent: finalPin.XPercent, yPercent: finalPin.YPercent })
                    });
                }
            }
            setDraggedPin(null);
            return;
        }

        setIsDragging(false);
        setDragStart(null);
    };

    const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

    const schematic = schematics[activeSch] || null;

    // ── Empty state: no schematics yet ──
    if (loading) return <LoadingSpinner message="Loading Digital Twin..." />;

    return (
        <div style={{
            display: 'flex', height: '100%', background: '#0a0e1a',
            borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)'
        }}>
            {/* ═══ MAIN CANVAS AREA ═══ */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
                {/* Toolbar */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 16px', background: 'rgba(0,0,0,0.4)',
                    borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap', gap: '8px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Cpu size={20} color="#6366f1" />
                        <div>
                            <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '0.95rem' }}>
                                Digital Twin — {assetDescription || assetId}
                            </div>
                            {isEditingSch ? (
                                <div style={{ marginTop: '4px', display: 'flex', gap: '6px' }}>
                                    <input 
                                        value={editSchForm.label} 
                                        onChange={e => setEditSchForm(p => ({ ...p, label: e.target.value }))} 
                                        style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', padding: '2px 6px', fontSize: '0.75rem', outline: 'none' }}
                                    />
                                </div>
                            ) : (
                                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                    {schematic ? `${schematic.Label} • ${pins.length} pin(s)` : 'No schematic loaded'}
                                </div>
                            )}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {/* Zoom controls */}
                        <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} style={btnStyle} title={t('digitalTwin.zoomOutTip')}><ZoomOut size={16} /></button>
                        <span style={{ color: '#94a3b8', fontSize: '0.75rem', minWidth: '40px', textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
                        <button onClick={() => setZoom(z => Math.min(4, z + 0.25))} style={btnStyle} title={t('digitalTwin.zoomInTip')}><ZoomIn size={16} /></button>
                        <button onClick={resetView} style={btnStyle} title={t('digitalTwin.resetViewTip')}><Maximize2 size={16} /></button>
                        
                        <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

                        {/* Print Schematic */}
                        <button 
                            onClick={() => window.triggerTrierPrint('digital-twin', { assetId, assetDescription, schematic, pins })}
                            style={btnStyle}
                            title="Print this schematic view"
                        >
                            <Printer size={16} /> Print
                        </button>
                        <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

                        {/* Pin placement toggle */}
                        <button 
                            onClick={() => { setIsPlacingPin(!isPlacingPin); setPendingPos(null); }}
                            style={{
                                ...btnStyle,
                                background: isPlacingPin ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.06)',
                                color: isPlacingPin ? '#818cf8' : '#94a3b8',
                                border: isPlacingPin ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.1)'
                            }}
                            title={isPlacingPin ? 'Cancel pin placement' : 'Add new pin — click on the schematic'}
                        >
                            <Crosshair size={16} /> {isPlacingPin ? 'Cancel' : 'Add Pin'}
                        </button>
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            style={btnStyle}
                            disabled={uploading}
                            title={t('digitalTwin.uploadASchematicImagePhotoTip')}
                        >
                            <Upload size={16} /> {uploading ? '...' : 'Upload'}
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleUpload}
                            style={{ display: 'none' }}
                            title={t('digitalTwin.chooseASchematicImageFileTip')}
                        />
                        {/* Camera */}
                        <button 
                            onClick={() => cameraInputRef.current?.click()}
                            style={{...btnStyle, color: '#10b981', borderColor: 'rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.08)'}}
                            disabled={uploading}
                            title="Take a photo with your device camera"
                        >
                            <Camera size={16} /> Photo
                        </button>
                        <input
                            ref={cameraInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handleUpload}
                            style={{ display: 'none' }}
                        />
                        
                        <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

                        {/* Top-Right Contextual Edit/Save */}
                        {isEditingPin ? (
                            <>
                                <button onClick={handleSavePinEdits} disabled={!editPinForm.pinLabel.trim()} style={{ ...btnStyle, color: '#10b981', borderColor: 'rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.1)' }}>
                                    <Save size={16} /> Save Pin
                                </button>
                                <button onClick={() => setIsEditingPin(false)} style={btnStyle}>Cancel</button>
                            </>
                        ) : selectedPin ? (
                            <button 
                                onClick={() => {
                                    setEditPinForm({ 
                                        pinLabel: selectedPin.PinLabel, 
                                        pinType: selectedPin.PinType, 
                                        notes: selectedPin.Notes || '',
                                        xPercent: selectedPin.XPercent,
                                        yPercent: selectedPin.YPercent
                                    });
                                    setIsEditingPin(true);
                                }} 
                                style={{ ...btnStyle, color: '#f59e0b', borderColor: 'rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.1)' }}
                            >
                                <Pencil size={16} /> Edit Pin
                            </button>
                        ) : isEditingSch ? (
                            <>
                                <button onClick={handleSaveSchEdits} disabled={!editSchForm.label.trim()} style={{ ...btnStyle, color: '#10b981', borderColor: 'rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.1)' }}>
                                    <Save size={16} /> Save View
                                </button>
                                <button onClick={() => setIsEditingSch(false)} style={btnStyle}>Cancel</button>
                            </>
                        ) : schematic ? (
                            <button 
                                onClick={() => {
                                    setEditSchForm({ label: schematic.Label, schematicType: schematic.SchematicType || 'photo' });
                                    setIsEditingSch(true);
                                }} 
                                style={{ ...btnStyle, color: '#94a3b8', borderColor: 'rgba(148,163,184,0.3)', background: 'rgba(148,163,184,0.05)' }}
                            >
                                <Pencil size={16} /> Edit View
                            </button>
                        ) : null}

                        {onClose && (
                            <button onClick={onClose} style={{ ...btnStyle, color: '#ef4444' }} title={t('digitalTwin.closeDigitalTwinViewTip')}><X size={16} /></button>
                        )}
                    </div>
                </div>

                {/* Schematic tabs */}
                {schematics.length > 1 && (
                    <div style={{
                        display: 'flex', gap: '4px', padding: '8px 16px',
                        background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.04)',
                        overflowX: 'auto'
                    }}>
                        {schematics.map((s, i) => (
                            <button 
                                key={s.ID}
                                onClick={() => setActiveSch(i)}
                                style={{
                                    padding: '5px 14px', borderRadius: '6px', border: 'none',
                                    cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                                    background: i === activeSch ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
                                    color: i === activeSch ? '#818cf8' : '#94a3b8',
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    whiteSpace: 'nowrap'
                                }}
                                title={`Switch to ${s.Label}`}
                            >
                                <Layers size={12} /> {s.Label}
                            </button>
                        ))}
                    </div>
                )}

                {/* Canvas */}
                <div
                    ref={canvasRef}
                    style={{
                        flex: 1, position: 'relative', overflow: 'hidden',
                        cursor: draggedPin ? 'grabbing' : (isPlacingPin ? 'crosshair' : (isDragging ? 'grabbing' : 'grab')),
                        background: 'repeating-conic-gradient(rgba(255,255,255,0.02) 0% 25%, transparent 0% 50%) 0 0 / 40px 40px'
                    }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                >
                    {schematic ? (
                        <div style={{
                            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                            transformOrigin: 'center center',
                            position: 'absolute', inset: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: isDragging ? 'none' : 'transform 0.15s ease-out'
                        }}>
                            <div style={{ position: 'relative', display: 'inline-block' }}>
                                <img ref={imgRef}
                                    src={schematic.SchematicPath}
                                    alt={schematic.Label}
                                    onClick={handleCanvasClick}
                                    style={{
                                        maxWidth: '100%', maxHeight: '70vh',
                                        borderRadius: '8px', display: 'block',
                                        boxShadow: '0 8px 40px rgba(0,0,0,0.5)'
                                    }}
                                    draggable={false}
                                />
                                {/* Render pins */}
                                {pins.map(pin => (
                                    <div
                                        key={pin.ID}
                                        className="dt-pin"
                                        onMouseDown={(e) => {
                                            if (isEditingSch || isEditingPin) {
                                                e.stopPropagation();
                                                setDraggedPin(pin);
                                            }
                                        }}
                                        onClick={(e) => { 
                                            e.stopPropagation(); 
                                            if (!isEditingSch && !draggedPin) fetchPinLive(pin); 
                                        }}
                                        title={`${pin.PinLabel} (${pin.PinType}) — ${pin.HealthStatus}`}
                                        style={{
                                            position: 'absolute',
                                            left: `${(isEditingPin && selectedPin?.ID === pin.ID && editPinForm.xPercent !== undefined) ? editPinForm.xPercent : pin.XPercent}%`,
                                            top: `${(isEditingPin && selectedPin?.ID === pin.ID && editPinForm.yPercent !== undefined) ? editPinForm.yPercent : pin.YPercent}%`,
                                            transform: 'translate(-50%, -50%)',
                                            width: '28px', height: '28px', borderRadius: '50%',
                                            background: `radial-gradient(circle, ${PIN_COLORS[pin.HealthStatus] || PIN_COLORS.unknown}, ${PIN_COLORS[pin.HealthStatus] || PIN_COLORS.unknown}88)`,
                                            border: `2px solid ${selectedPin?.ID === pin.ID ? '#fff' : 'rgba(0,0,0,0.5)'}`,
                                            boxShadow: `0 0 12px ${PIN_COLORS[pin.HealthStatus] || PIN_COLORS.unknown}60, ${selectedPin?.ID === pin.ID ? '0 0 0 3px rgba(255,255,255,0.3)' : ''}`,
                                            cursor: draggedPin?.ID === pin.ID ? 'grabbing' : (isEditingSch || isEditingPin ? 'grab' : 'pointer'),
                                            zIndex: draggedPin?.ID === pin.ID ? 50 : 10,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '12px',
                                            transition: 'all 0.2s',
                                            animation: pin.HealthStatus === 'critical' ? 'pulse 1.5s infinite' : 'none'
                                        }}
                                    >
                                        {PIN_TYPES.find(t => t.value === pin.PinType)?.icon || '⚙️'}
                                    </div>
                                ))}
                                {/* Pending pin placement */}
                                {pendingPos && (
                                    <div style={{
                                        position: 'absolute',
                                        left: `${pendingPos.x}%`, top: `${pendingPos.y}%`,
                                        transform: 'translate(-50%, -50%)',
                                        width: '32px', height: '32px', borderRadius: '50%',
                                        background: 'rgba(99,102,241,0.3)',
                                        border: '2px dashed #818cf8',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        animation: 'pulse 1s infinite', zIndex: 20
                                    }}>
                                        <Plus size={16} color="#818cf8" />
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        /* Empty state */
                        <div style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            justifyContent: 'center', height: '100%', gap: '20px', padding: '40px'
                        }}>
                            <div style={{
                                width: '120px', height: '120px', borderRadius: '24px',
                                background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.05))',
                                border: '2px dashed rgba(99,102,241,0.3)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                <Cpu size={48} color="#6366f1" />
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <h3 style={{ color: '#e2e8f0', margin: '0 0 8px 0' }}>Set Up Digital Twin</h3>
                                <p style={{ color: '#64748b', fontSize: '0.85rem', maxWidth: '400px', lineHeight: 1.6 }}>
                                    Upload a photo, P&ID diagram, or blueprint of this asset.
                                    Then place interactive pins on components to track health,
                                    link sensors, and create work orders.
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: '15px' }}>
                                <button 
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{
                                        padding: '14px 24px', borderRadius: '12px', border: 'none',
                                        cursor: 'pointer', fontWeight: 700, fontSize: '0.95rem',
                                        background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                                        color: '#fff', display: 'flex', alignItems: 'center', gap: '8px',
                                        boxShadow: '0 4px 20px rgba(99,102,241,0.3)'
                                    }}
                                    title={t('digitalTwin.uploadTheFirstSchematicImageTip')}
                                >
                                    <Upload size={18} /> Upload Image
                                </button>
                                <button 
                                    onClick={() => cameraInputRef.current?.click()}
                                    style={{
                                        padding: '14px 24px', borderRadius: '12px', border: 'none',
                                        cursor: 'pointer', fontWeight: 700, fontSize: '0.95rem',
                                        background: 'linear-gradient(135deg, #10b981, #059669)',
                                        color: '#fff', display: 'flex', alignItems: 'center', gap: '8px',
                                        boxShadow: '0 4px 20px rgba(16,185,129,0.3)'
                                    }}
                                >
                                    <Camera size={18} /> Take Photo
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Pin placement / Edit form */}
                {(pendingPos || isEditingPin) && (
                    <div style={{
                        position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
                        background: 'rgba(15,15,30,0.95)', border: `1px solid ${isEditingPin ? 'rgba(245,158,11,0.3)' : 'rgba(99,102,241,0.3)'}`,
                        borderRadius: '12px', padding: '16px', width: '380px',
                        backdropFilter: 'blur(20px)', zIndex: 30,
                        boxShadow: '0 8px 30px rgba(0,0,0,0.5)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <span style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '0.9rem' }}>
                                {isEditingPin ? '✏️ Edit Pin' : '📌 New Pin'}
                            </span>
                            <button onClick={() => { setPendingPos(null); setIsEditingPin(false); }} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }} title="Cancel"><X size={16} /></button>
                        </div>
                        <input
                            placeholder={t('digitalTwin.pinLabelEgDriveMotorPlaceholder', 'Pin Label')}
                            value={isEditingPin ? editPinForm.pinLabel : newPinForm.pinLabel}
                            onChange={e => isEditingPin 
                                ? setEditPinForm(p => ({ ...p, pinLabel: e.target.value }))
                                : setNewPinForm(p => ({ ...p, pinLabel: e.target.value }))}
                            style={inputStyle}
                            autoFocus
                            title={t('digitalTwin.enterANameForThisTip', 'Enter a name for this pin')}
                        />
                        <select
                            value={isEditingPin ? editPinForm.pinType : newPinForm.pinType}
                            onChange={e => isEditingPin
                                ? setEditPinForm(p => ({ ...p, pinType: e.target.value }))
                                : setNewPinForm(p => ({ ...p, pinType: e.target.value }))}
                            style={{ ...inputStyle, marginTop: '8px', cursor: 'pointer' }}
                            title={t('digitalTwin.selectTheTypeOfComponentTip', 'Select type of component')}
                        >
                            {PIN_TYPES.map(pt => (
                                <option key={pt.value} value={pt.value} style={{ background: '#1e293b' }}>
                                    {pt.icon} {pt.label}
                                </option>
                            ))}
                        </select>
                        <textarea
                            placeholder={t('digitalTwin.notesOptionalPlaceholder', 'Notes (optional)')}
                            value={isEditingPin ? editPinForm.notes : newPinForm.notes}
                            onChange={e => isEditingPin
                                ? setEditPinForm(p => ({ ...p, notes: e.target.value }))
                                : setNewPinForm(p => ({ ...p, notes: e.target.value }))}
                            style={{ ...inputStyle, marginTop: '8px', resize: 'vertical', minHeight: '80px' }}
                            title={t('digitalTwin.addOptionalNotesAboutThisTip', 'Add notes about this pin')}
                        />
                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                            <button
                                onClick={isEditingPin ? handleSavePinEdits : handleSavePin}
                                disabled={isEditingPin ? !editPinForm.pinLabel.trim() : !newPinForm.pinLabel.trim()}
                                style={{
                                    flex: 1, padding: '10px', borderRadius: '8px', border: 'none',
                                    cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
                                    background: isEditingPin 
                                        ? 'linear-gradient(135deg, #f59e0b, #d97706)' 
                                        : 'linear-gradient(135deg, #6366f1, #4f46e5)',
                                    color: '#fff', opacity: (isEditingPin ? editPinForm.pinLabel.trim() : newPinForm.pinLabel.trim()) ? 1 : 0.4,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                                }}
                                title={t('digitalTwin.saveThisPinToTheTip', 'Save Pin')}
                            >
                                <Save size={14} /> {isEditingPin ? 'Save Changes' : 'Save Pin'}
                            </button>
                            <button 
                                onClick={() => { setPendingPos(null); setIsEditingPin(false); }}
                                style={{
                                    padding: '10px 16px', borderRadius: '8px',
                                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                                    color: '#94a3b8', cursor: 'pointer', fontSize: '0.85rem'
                                }}
                                title={t('digitalTwin.cancelPinPlacementTip', 'Cancel')}
                            >{t('common.cancel', 'Cancel')}</button>
                        </div>
                        {isEditingPin && (
                            <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '0.75rem', color: '#94a3b8' }}>
                                Drag the pin on the diagram to move it!
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ═══ RIGHT PANEL — Pin Inspector ═══ */}
            <div style={{
                width: '320px', flexShrink: 0,
                background: 'rgba(0,0,0,0.3)',
                borderLeft: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden'
            }}>
                {/* Panel header */}
                <div style={{
                    padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
                    background: 'rgba(0,0,0,0.2)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'
                }}>
                    <div>
                        <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Eye size={16} color="#6366f1" /> Pin Inspector
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '4px' }}>
                            Click a pin on the schematic to inspect
                        </div>
                    </div>
                    <button 
                        onClick={() => setShowFaq(true)}
                        style={{
                            background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', color: '#818cf8', 
                            cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                            borderRadius: '50%', transition: 'all 0.2s'
                        }}
                        title="What is Digital Twin?"
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(99,102,241,0.1)'}
                    >
                        <HelpCircle size={18} />
                    </button>
                </div>

                {/* Pin list */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                    {pins.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '30px 10px', color: '#475569', fontSize: '0.8rem' }}>
                            No pins yet. Click "Add Pin" then click on the schematic to place one.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {pins.map(pin => (
                                <button 
                                    key={pin.ID}
                                    onClick={() => fetchPinLive(pin)}
                                    style={{
                                        padding: '10px 12px', borderRadius: '8px', border: 'none',
                                        cursor: 'pointer', textAlign: 'left',
                                        background: selectedPin?.ID === pin.ID ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)',
                                        display: 'flex', alignItems: 'center', gap: '10px',
                                        transition: 'all 0.2s'
                                    }}
                                    title={`Inspect ${pin.PinLabel}`}
                                >
                                    <div style={{
                                        width: '10px', height: '10px', borderRadius: '50%',
                                        background: PIN_COLORS[pin.HealthStatus] || PIN_COLORS.unknown,
                                        boxShadow: `0 0 6px ${PIN_COLORS[pin.HealthStatus] || PIN_COLORS.unknown}60`,
                                        flexShrink: 0
                                    }} />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e2e8f0' }}>{pin.PinLabel}</div>
                                        <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                                            {PIN_TYPES.find(t => t.value === pin.PinType)?.icon} {pin.PinType}
                                        </div>
                                    </div>
                                    <span style={{
                                        fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase',
                                        color: PIN_COLORS[pin.HealthStatus],
                                        letterSpacing: '0.5px'
                                    }}>{pin.HealthStatus}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Selected pin detail */}
                {selectedPin && (
                    <div style={{
                        borderTop: '1px solid rgba(255,255,255,0.06)',
                        padding: '14px', background: 'rgba(0,0,0,0.2)',
                        maxHeight: '40%', overflowY: 'auto'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '0.95rem' }}>{selectedPin.PinLabel}</div>
                                    <button 
                                        onClick={() => {
                                            setEditPinForm({ 
                                                pinLabel: selectedPin.PinLabel, 
                                                pinType: selectedPin.PinType, 
                                                notes: selectedPin.Notes || '',
                                                xPercent: selectedPin.XPercent,
                                                yPercent: selectedPin.YPercent
                                            });
                                            setIsEditingPin(true);
                                        }}
                                        style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '4px', padding: '2px 6px', fontSize: '0.65rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    >
                                        <Pencil size={10} /> Edit Notes
                                    </button>
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '4px' }}>
                                    {PIN_TYPES.find(t => t.value === selectedPin.PinType)?.icon} {selectedPin.PinType} • Pos: ({Math.round(selectedPin.XPercent)}%, {Math.round(selectedPin.YPercent)}%)
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                {/* Health status buttons (Always visible to quickly toggle status) */}
                                {['healthy', 'warning', 'critical'].map(status => (
                                    <button 
                                        key={status}
                                        onClick={() => handleUpdatePin(selectedPin.ID, { healthStatus: status })}
                                        title={`Set health to ${status}`}
                                        style={{
                                            width: '24px', height: '24px', borderRadius: '50%', border: 'none',
                                            cursor: 'pointer',
                                            background: selectedPin.HealthStatus === status
                                                ? PIN_COLORS[status]
                                                : `${PIN_COLORS[status]}30`,
                                            boxShadow: selectedPin.HealthStatus === status
                                                ? `0 0 8px ${PIN_COLORS[status]}60` : 'none'
                                        }}
                                    />
                                ))}
                                <button onClick={() => handleDeletePin(selectedPin.ID)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px', marginLeft: '6px' }} title={t('digitalTwin.deleteThisPinTip')}><Trash2 size={16} /></button>
                            </div>
                        </div>

                        {selectedPin.Notes && (
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', padding: '8px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', marginBottom: '8px' }}>
                                {selectedPin.Notes}
                            </div>
                        )}

                        {/* Live data */}
                        {pinLiveData && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {pinLiveData.sensor?.latestReading && (
                                    <div style={{ padding: '8px', background: 'rgba(16,185,129,0.08)', borderRadius: '6px', border: '1px solid rgba(16,185,129,0.2)' }}>
                                        <div style={{ fontSize: '0.65rem', color: '#10b981', fontWeight: 700, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Activity size={10} /> LIVE SENSOR
                                        </div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#e2e8f0' }}>
                                            {pinLiveData.sensor.latestReading.value} {pinLiveData.sensor.config?.unit || ''}
                                        </div>
                                    </div>
                                )}

                                {pinLiveData.recentWorkOrders?.length > 0 && (
                                    <div style={{ padding: '8px', background: 'rgba(245,158,11,0.08)', borderRadius: '6px', border: '1px solid rgba(245,158,11,0.2)' }}>
                                        <div style={{ fontSize: '0.65rem', color: '#f59e0b', fontWeight: 700, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Wrench size={10} /> RECENT WOs ({pinLiveData.recentWorkOrders.length})
                                        </div>
                                        {pinLiveData.recentWorkOrders.slice(0, 3).map((wo, i) => (
                                            <div key={i} style={{ fontSize: '0.7rem', color: '#94a3b8', padding: '3px 0', borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                                                <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{wo.WO}</span> — {wo.Description?.substring(0, 40)}
                                                <span style={{ color: '#64748b' }}> ({wo.Status})</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {pinLiveData.linkedPart && (
                                    <div style={{ padding: '8px', background: 'rgba(99,102,241,0.08)', borderRadius: '6px', border: '1px solid rgba(99,102,241,0.2)' }}>
                                        <div style={{ fontSize: '0.65rem', color: '#818cf8', fontWeight: 700, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Package size={10} /> LINKED PART
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: '#e2e8f0' }}>
                                            {pinLiveData.linkedPart.Description}
                                        </div>
                                        <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>
                                            Stock: {pinLiveData.linkedPart.QtyOnHand ?? '?'} • Min: {pinLiveData.linkedPart.MinStock ?? '?'}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ═══ FAQ Modal ═══ */}
            {showFaq && (
                <div 
                    onClick={() => setShowFaq(false)}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 99999,
                        background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                >
                    <div 
                        onClick={e => e.stopPropagation()}
                        className="glass-card"
                        style={{
                            width: '500px', maxWidth: '90vw', padding: '0', 
                            overflow: 'hidden', display: 'flex', flexDirection: 'column'
                        }}
                    >
                        <div style={{ padding: '20px', background: 'rgba(99,102,241,0.1)', borderBottom: '1px solid rgba(99,102,241,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Cpu size={24} color="#818cf8" /> {t('digitalTwin.whatIsDigitalTwinTitle', 'What is a Digital Twin?')}
                            </h2>
                            <button onClick={() => setShowFaq(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                                <X size={20} />
                            </button>
                        </div>
                        <div style={{ padding: '24px', color: '#cbd5e1', fontSize: '0.95rem', lineHeight: '1.6', overflowY: 'auto', maxHeight: '60vh' }}>
                            <p style={{ marginTop: 0 }}>
                                A <strong>Digital Twin</strong> is a virtual representation of your physical equipment. It allows maintenance teams to map out the exact topology of an asset visually.
                            </p>
                            
                            <h3 style={{ fontSize: '1rem', color: '#e2e8f0', marginTop: '20px', marginBottom: '10px' }}>How does it work?</h3>
                            <ol style={{ paddingLeft: '20px', margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <li><strong>Upload Schematics:</strong> Upload building blueprints, OEM P&ID diagrams, or even simply a smartphone photo of the machine. You can create multiple views (e.g. "Front View", "Electrical Panel").</li>
                                <li><strong>Drop Interactive Pins:</strong> Click <span style={{ color: '#818cf8' }}><Crosshair size={14} style={{ verticalAlign: 'middle' }} /> Add Pin</span> to drop markers onto specific sub-components, sensors, or lubrication points.</li>
                                <li><strong>Contextualize Data:</strong> The pins stay tethered to the image coordinates. Clicking a pin reveals its dedicated health status, recent targeted work orders, and real-time active IoT sensor telemetry associated with just that specific region.</li>
                            </ol>

                            <h3 style={{ fontSize: '1rem', color: '#e2e8f0', marginTop: '20px', marginBottom: '10px' }}>Why is this useful?</h3>
                            <ul style={{ paddingLeft: '20px', margin: 0 }}>
                                <li style={{ marginBottom: '6px' }}><strong>Accelerates Troubleshooting:</strong> New technicians don't have to hunt blindly for "Valve 4B". They can see it visually mapped on the diagram.</li>
                                <li style={{ marginBottom: '6px' }}><strong>Condition Monitoring:</strong> You can see at a glance if a specific drive motor is pulsing Red (Critical), rather than just knowing "the machine" is down.</li>
                                <li style={{ marginBottom: '0' }}><strong>Contextual tribal knowledge:</strong> Preserves exact geographical awareness of failing parts for future shifts.</li>
                            </ul>
                        </div>
                        <div style={{ padding: '16px 24px', background: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(255,255,255,0.05)', textAlign: 'right' }}>
                            <button 
                                onClick={() => setShowFaq(false)}
                                className="btn-save"
                                style={{ padding: '8px 24px', fontSize: '0.9rem' }}
                            >
                                Got it
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const btnStyle = {
    padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.06)', color: '#94a3b8', cursor: 'pointer',
    fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px'
};

const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: '8px',
    background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)',
    color: '#e2e8f0', fontSize: '0.85rem', boxSizing: 'border-box'
};
