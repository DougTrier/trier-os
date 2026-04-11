// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Interactive Facility Floor Plan (FloorPlanView.jsx)
 * ==============================================================
 * Multi-layer facility visualization tool combining floor plan imagery
 * with live asset placement, UWB personnel tracking, LiDAR point clouds,
 * and a full vector drawing toolkit. One of the most complex components
 * in the Trier OS UI — touch before reading this header in full.
 *
 * RENDER LAYERS (drawn in order on the canvas):
 *   1. Background image      — Uploaded satellite or blueprint image
 *   2. Draw layer            — User-drawn annotations (lines, shapes, text)
 *   3. Asset pins            — Equipment placed on the floor plan
 *   4. UWB position dots     — Live personnel/asset positions from WebSocket
 *   5. UWB trails            — Last 15 positions per tag (motion history)
 *   6. LiDAR point cloud     — Optional 3D point cloud overlay
 *
 * EDIT MODE TOOLS (toolbar, only visible when editMode=true):
 *   Select     — Click/drag to select and move placed assets
 *   Pan        — Click-drag to pan the canvas (also: hold Space)
 *   Line       — Draw polylines (route paths, cable runs)
 *   Arrow      — Draw directional arrows
 *   Rectangle  — Draw filled/outlined rectangles
 *   Circle     — Draw circles (e.g. safety radius indicators)
 *   Text       — Place text labels on the floor plan
 *   Ruler      — Measure pixel distances (calibrated via anchor calibration)
 *   Erase      — Remove individual draw elements
 *
 * UWB INTEGRATION:
 *   - Subscribes to window 'trier-uwb-positions' CustomEvent (broadcast by uwbBroker.js)
 *   - Positions are mapped from UWB meters → canvas pixels via uwbCalibration:
 *     canvasX = originX + (uwbX * scaleX)
 *     canvasY = originY + (uwbY * scaleY)
 *   - Calibration is stored per-floor in uwb_calibration table via /api/uwb/calibration/:floorId
 *   - The UWB Calibration admin panel (visible in editMode) lets admins set origin + scale
 *
 * LIDAR INTEGRATION:
 *   - LiDARScanner component handles WebRTC camera capture + point cloud generation
 *   - LiDAR3DViewer renders the .ply / .xyz point cloud as a 3D overlay
 *   - Imported LiDAR data is saved to /api/lidar-import and associated with the floor plan
 *
 * FLOOR PLAN TYPES: satellite | blueprint | schematic | electrical | plumbing | other
 *
 * DATA SOURCES:
 *   GET /api/floorplans       — List floor plans for this plant
 *   POST /api/floorplans      — Upload new floor plan image (multipart)
 *   PUT /api/floorplans/:id   — Save asset positions + draw layer data
 *   DELETE /api/floorplans/:id — Remove floor plan
 *   GET /api/uwb/calibration/:floorId — Load UWB coordinate calibration
 *   PUT /api/uwb/calibration/:floorId — Save UWB calibration values
 *
 * PERFORMANCE: The canvas redraws on every state change via useEffect.
 * For plants with 100+ assets, the asset list is filtered by planTypeFilter
 * before rendering to keep the pin count manageable. The UWB dot layer uses
 * requestAnimationFrame-style batching from the WebSocket event handler.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { MapPin, Upload, X, Edit3, Eye, Plus, Trash2, AlertTriangle, ZoomIn, ZoomOut, RotateCcw, Flame, CloudLightning, Droplets, DoorOpen, Wrench, Shield, Layers, ArrowRight, Route, Ruler, Type, MousePointer, ChevronRight, Package, Hexagon, Building, Clock, Smartphone, Navigation2, Thermometer, Activity, AlertOctagon, Printer } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';
import { getIconCategories, getEquipmentIcon, CATEGORY_LABEL_KEYS } from './EquipmentIcons.jsx';
import PhotoAssembly from './PhotoAssembly.jsx';
import LiDAR3DViewer from './LiDAR3DViewer.jsx';
import LiDARScanner from './LiDARScanner.jsx';

export default function FloorPlanView({ plantId, isAdmin }) {
    const { t } = useTranslation();
    const [plans, setPlans] = useState([]);
    const [activePlan, setActivePlan] = useState(null);
    const [viewMode, setViewMode] = useState('satellite'); // 'satellite' or 'blueprint'
    const [planTypeFilter, setPlanTypeFilter] = useState('all'); // filter plans by type
    const [showAddPlan, setShowAddPlan] = useState(false); // show add plan options
    const [pins, setPins] = useState([]);
    const [assets, setAssets] = useState([]);
    const [editMode, setEditMode] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [hoveredPin, setHoveredPin] = useState(null);
    const [placingPin, setPlacingPin] = useState(false);
    const [selectedAsset, setSelectedAsset] = useState('');
    const [pinLabel, setPinLabel] = useState('');
    const [uploading, setUploading] = useState(false);
    const [openWOs, setOpenWOs] = useState({});
    const imgRef = useRef(null);
    const containerRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);
    const lastPos = useRef({ x: 0, y: 0 });
    const [draggingPin, setDraggingPin] = useState(null); // { id, startX, startY }
    const [activeLayer, setActiveLayer] = useState('all');

    // ── Equipment Icon Palette State ──
    const [showIconPalette, setShowIconPalette] = useState(false);
    const [draggingIcon, setDraggingIcon] = useState(null); // equipment icon being dragged
    const iconGhostRef = useRef(null); // direct DOM element for ghost (bypasses React)

    // ── Drawing Tool State ──
    const [drawTool, setDrawTool] = useState(null); // null, 'arrow', 'route', 'measure', 'text'
    const [annotations, setAnnotations] = useState([]);
    const [drawingPoints, setDrawingPoints] = useState([]); // points being drawn
    const [drawColor, setDrawColor] = useState('#ef4444');
    const [drawLabel, setDrawLabel] = useState('');
    const [hoveredAnnotation, setHoveredAnnotation] = useState(null);
    const [scaleRef, setScaleRef] = useState(null);

    





    // ── Emergency Mode State ──
    const [emergencyMode, setEmergencyMode] = useState(false);
    const [headcount, setHeadcount] = useState({ total: 0, accounted: 0, missing: 0, entries: [] });
    const [nearestExit, setNearestExit] = useState(null);

    // ── Sensor Overlay State ──
    const [sensors, setSensors] = useState([]);
    const [sensorReadings, setSensorReadings] = useState([]);
    const [showSensors, setShowSensors] = useState(false);
    const [showHeatMap, setShowHeatMap] = useState(false);
    const [placingSensor, setPlacingSensor] = useState(null); // sensorType being placed
    const sensorPollRef = useRef(null);

    const SENSOR_TYPES = {
        temperature: { label: 'Temperature', emoji: '🌡️', unit: '°F', color: '#ef4444', minT: 32, maxT: 100, alertA: 90, alertB: 35 },
        pressure:    { label: 'Pressure',    emoji: '🔵', unit: 'PSI', color: '#3b82f6', minT: 10, maxT: 25, alertA: 22, alertB: 12 },
        vibration:   { label: 'Vibration',   emoji: '📳', unit: 'mm/s', color: '#f59e0b', minT: 0, maxT: 10, alertA: 7, alertB: 0 },
        humidity:    { label: 'Humidity',     emoji: '💧', unit: '%RH', color: '#06b6d4', minT: 20, maxT: 80, alertA: 70, alertB: 25 },
        motion:      { label: 'Motion',       emoji: '🚶', unit: '',   color: '#a855f7', minT: 0, maxT: 1, alertA: 1, alertB: 0 },
        occupancy:   { label: 'Occupancy',    emoji: '👥', unit: 'ppl', color: '#22c55e', minT: 0, maxT: 50, alertA: 40, alertB: 0 },
    };

    // ── Mobile & GPS State ──
    const [showYouAreHere, setShowYouAreHere] = useState(false);
    const [userGPS, setUserGPS] = useState(null); // { lat, lng }
    const [userPosOnPlan, setUserPosOnPlan] = useState(null); // { x, y } in percent
    const [gpsWatchId, setGpsWatchId] = useState(null);
    const [showARView, setShowARView] = useState(false);
    const touchRef = useRef({ dist: 0, mid: { x: 0, y: 0 }, zoom: 1, pan: { x: 0, y: 0 } });
    // ── Version History State ──
    const [showVersionHistory, setShowVersionHistory] = useState(false);
    const [versions, setVersions] = useState([]);
    // ── Fullscreen & 3D Viewer State ──
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [show3DViewer, setShow3DViewer] = useState(false);
    const [showLiDARScanner, setShowLiDARScanner] = useState(false);
    const [compareVersion, setCompareVersion] = useState(null);
    // ── Multi-Floor State ──
    const [activeBuilding, setActiveBuilding] = useState('all');
    const [activeFloor, setActiveFloor] = useState('all');
    // ── Zone Management State ──
    const [zones, setZones] = useState([]);
    const [hoveredZone, setHoveredZone] = useState(null);
    const [selectedZone, setSelectedZone] = useState(null);
    const [showZonePanel, setShowZonePanel] = useState(false);
    const [zoneType, setZoneType] = useState('production');


    const FLOOR_LEVELS = [
        { id: 'basement-2', label: 'B2', longLabel: 'Basement 2', order: -2 },
        { id: 'basement', label: 'B1', longLabel: 'Basement', order: -1 },
        { id: 'ground', label: 'G', longLabel: 'Ground Floor', order: 0 },
        { id: '1', label: '1F', longLabel: '1st Floor', order: 1 },
        { id: '2', label: '2F', longLabel: '2nd Floor', order: 2 },
        { id: '3', label: '3F', longLabel: '3rd Floor', order: 3 },
        { id: '4', label: '4F', longLabel: '4th Floor', order: 4 },
        { id: 'mezzanine', label: 'Mezz', longLabel: 'Mezzanine', order: 0.5 },
        { id: 'roof', label: 'Roof', longLabel: 'Roof Level', order: 99 },
    ];

    const ZONE_TYPES = {
        production: { label: 'Production', color: '#3b82f6', emoji: '🏭' },
        storage: { label: 'Storage', color: '#8b5cf6', emoji: '📦' },
        utility: { label: 'Utility', color: '#06b6d4', emoji: '⚡' },
        restricted: { label: 'Restricted', color: '#ef4444', emoji: '⛔' },
        hazard: { label: 'Hazard', color: '#f97316', emoji: '☢️' },
        emergency: { label: 'Emergency', color: '#22c55e', emoji: '🚨' },
        office: { label: 'Office', color: '#64748b', emoji: '🏢' },
        custom: { label: 'Custom', color: '#a855f7', emoji: '📎' },
    };

    // ── Crop Tool State ──
    const [cropState, setCropState] = useState(null); // { imageUrl, blob, crop: { x, y, w, h }, dragging, dragType }
    const [showPhotoAssembly, setShowPhotoAssembly] = useState(false);
    const cropCanvasRef = useRef(null);
    const cropContainerRef = useRef(null);

    // ── Styled Modal Dialog (replaces native prompt/alert/confirm) ──
    const [modalState, setModalState] = useState(null);
    // { type: 'input'|'confirm'|'info', title, message, placeholder, defaultValue, onConfirm, onCancel }
    const [modalInput, setModalInput] = useState('');

    const showModal = (type, title, message, opts = {}) => {
        return new Promise((resolve) => {
            setModalInput(opts.defaultValue || '');
            setModalState({
                type, title, message,
                placeholder: opts.placeholder || '',
                defaultValue: opts.defaultValue || '',
                onConfirm: (val) => { setModalState(null); resolve(val); },
                onCancel: () => { setModalState(null); resolve(null); },
            });
        });
    };

    const showInputModal = (title, message, opts = {}) => showModal('input', title, message, opts);
    const showConfirmModal = (title, message) => showModal('confirm', title, message);
    const showInfoModal = (title, message) => showModal('info', title, message);

    // Layer type definitions
    const LAYER_TYPES = [
        { id: 'all', label: 'All', icon: Layers, color: '#818cf8' },
        { id: 'assets', label: 'Assets', icon: Wrench, color: '#10b981' },
        { id: 'fire', label: 'Fire', icon: Flame, color: '#ef4444' },
        { id: 'tornado', label: 'Tornado', icon: CloudLightning, color: '#f59e0b' },
        { id: 'flood', label: 'Flood', icon: Droplets, color: '#3b82f6' },
        { id: 'emergency', label: 'Exits', icon: DoorOpen, color: '#22d3ee' },
        { id: 'utility', label: 'Utility', icon: Shield, color: '#a78bfa' },
    ];

    // Plan type definitions for categorizing floor plans
    const PLAN_TYPES = [
        { id: 'all', label: 'All Plans', color: '#818cf8', emoji: '📋' },
        { id: 'facility', label: 'Facility', color: '#10b981', emoji: '🏭' },
        { id: 'fire_safety', label: 'Fire Safety', color: '#ef4444', emoji: '🔥' },
        { id: 'emergency', label: 'Emergency', color: '#f59e0b', emoji: '🚨' },
        { id: 'utility', label: 'Utility', color: '#3b82f6', emoji: '⚡' },
        { id: 'engineering', label: 'CAD/Engineering', color: '#a855f7', emoji: '📐' },
        { id: 'custom', label: 'Custom', color: '#64748b', emoji: '📎' },
    ];

    // Filter plans by selected type
    const filteredPlans = planTypeFilter === 'all' ? plans : plans.filter(p => (p.planType || 'facility') === planTypeFilter);


    // Derive building names and floor levels from plan data
    const buildings = [...new Set(plans.filter(p => p.buildingName).map(p => p.buildingName))].sort();
    const hasMultiFloor = plans.some(p => p.floorLevel && p.floorLevel !== '');
    const hasMultiBuilding = buildings.length > 1;

    // Filter plans by building + floor (on top of planType filter)
    const buildingFloorFiltered = filteredPlans.filter(p => {
        if (activeBuilding !== 'all' && (p.buildingName || '') !== activeBuilding) return false;
        if (activeFloor !== 'all' && (p.floorLevel || '') !== activeFloor) return false;
        return true;
    });

    // Available floors for current building filter
    const availableFloors = [...new Set(
        (activeBuilding === 'all' ? filteredPlans : filteredPlans.filter(p => p.buildingName === activeBuilding))
            .filter(p => p.floorLevel && p.floorLevel !== '')
            .map(p => p.floorLevel)
    )];

    const headers = {
        'x-plant-id': plantId
    };

    useEffect(() => {
        fetchPlans();
        fetchAssets();
    }, [plantId]);

    useEffect(() => {
        if (activePlan) {
            fetchPins(activePlan.id);
            fetchAnnotations(activePlan.id);
        fetchZones(activePlan.id);
            fetchOpenWOs();
        }
    }, [activePlan]);

    const fetchPlans = async () => {
        try {
            const res = await fetch(`/api/floorplans?plantId=${plantId}`, { headers });
            if (!res.ok) return; // 403/401 etc — leave plans as empty array, avoid crash
            const data = await res.json();
            const list = Array.isArray(data.plans) ? data.plans : Array.isArray(data) ? data : [];
            setPlans(list);
            if (list.length > 0) setActivePlan(list[0]);
        } catch (e) { console.warn('[FloorPlanView] caught:', e); }
    };

    const fetchPins = async (planId) => {
        try {
            const res = await fetch(`/api/floorplans/${planId}/pins`, { headers });
            const data = await res.json();
            setPins(data.pins || data || []);
        } catch (e) { console.warn('[FloorPlanView] caught:', e); }
    };

    const fetchAssets = async () => {
        try {
            const res = await fetch('/api/assets?limit=500', { headers });
            const data = await res.json();
            setAssets(data.data || []);
        } catch (e) { console.warn('[FloorPlanView] caught:', e); }
    };

    const fetchOpenWOs = async () => {
        try {
            const res = await fetch('/api/work-orders?limit=200&status=open', { headers });
            const data = await res.json();
            const woMap = {};
            (data.data || []).forEach(wo => {
                const assetId = wo.AssetID || wo.Asset;
                if (assetId) {
                    if (!woMap[assetId]) woMap[assetId] = [];
                    woMap[assetId].push(wo);
                }
            });
            setOpenWOs(woMap);
        } catch (e) { console.warn('[FloorPlanView] caught:', e); }
    };

    const handleUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        // Ask for name and type
        const name = await showInputModal('Name Your Floor Plan', 'Enter a name for this floor plan:', { placeholder: 'e.g. Main Facility Layout', defaultValue: file.name.replace(/\.[^.]+$/, '') });
        if (!name) return;
        setUploading(true);
        const formData = new FormData();
        formData.append('plantId', plantId);
        formData.append('name', name);
        formData.append('planType', planTypeFilter !== 'all' ? planTypeFilter : 'facility');
        formData.append('floorplan', file);
        try {
            const res = await fetch('/api/floorplans', {
                method: 'POST', headers: { ...headers }, body: formData
            });
            if (res.ok) { fetchPlans(); setShowAddPlan(false); }
            else {
                const showInfoModalTitle0 = t('floorPlan.modal.uploadFailed', 'Upload Failed');
                const showInfoModalMsg0 = t('floorPlan.modal.theFloorPlanUploadFailed', 'The floor plan upload failed. Please try a different image file.');
                showInfoModal(showInfoModalTitle0, showInfoModalMsg0);
            }
        } catch (e) {
            const showInfoModalTitle1 = t('floorPlan.modal.uploadError', 'Upload Error');
            const showInfoModalMsg1 = t('floorPlan.modal.aNetworkErrorOccurredWhile', 'A network error occurred while uploading. Please try again.');
            showInfoModal(showInfoModalTitle1, showInfoModalMsg1);
        }
        setUploading(false);
    };

    // ── Import CAD/DXF file ──
    const handleDXFImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const name = await showInputModal('Name Your CAD Floor Plan', 'Enter a name for this AutoCAD floor plan:', { placeholder: 'e.g. Facility Layout - Engineering', defaultValue: file.name.replace(/\.[^.]+$/, '') });
        if (!name) return;
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('plantId', plantId);
            formData.append('name', name);
            formData.append('planType', 'engineering');
            formData.append('dxffile', file);
            const res = await fetch('/api/floorplans/import-dxf', {
                method: 'POST', headers: { ...headers }, body: formData
            });
            const data = await res.json();
            if (res.ok && data.success) {
                fetchPlans(); setShowAddPlan(false);
                const s = data.stats;
        const showInfoModalTitle2 = t('floorPlan.modal.cadImportComplete', 'CAD Import Complete');
        const entityTypesList2 = Object.entries(s.entityTypes).map(([k, v]) => k + '(' + v + ')').join(', ');
        const showInfoModalMsg2 = t('floorPlan.modal.successfullyImportedName', `Successfully imported "${name}"\n\n• ${s.totalEntities} entities processed\n• ${s.rendered} rendered\n• ${Object.keys(s.layers).length} layers detected\n• Output: ${s.imageSize} PNG\n\nEntity types: ${entityTypesList2}`);
                showInfoModal(showInfoModalTitle2, showInfoModalMsg2);
            } else {
        const showInfoModalTitle3 = t('floorPlan.modal.cadImportFailed', 'CAD Import Failed');
                showInfoModal(showInfoModalTitle3, data.error || 'The DXF file could not be processed.');
            }
        } catch (err) {
        const showInfoModalTitle4 = t('floorPlan.modal.importError', 'Import Error');
        const showInfoModalMsg4 = t('floorPlan.modal.failedToImportCadFile', 'Failed to import CAD file: ');
            showInfoModal(showInfoModalTitle4, showInfoModalMsg4 + err.message);
        }
        setUploading(false);
        e.target.value = ''; // reset input
    };

    // ── Import LiDAR 3D scan file (.ply, .obj) ──
    const handleLiDARImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const name = await showInputModal('Name Your LiDAR Floor Plan', 'Enter a name for this LiDAR-scanned floor plan:', { placeholder: 'e.g. Main Building - LiDAR Scan', defaultValue: file.name.replace(/\.[^.]+$/, '') });
        if (!name) return;
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('plantId', plantId);
            formData.append('name', name);
            formData.append('planType', 'facility');
            formData.append('lidarfile', file);
            const res = await fetch('/api/floorplans/import-lidar', {
                method: 'POST', headers: { ...headers }, body: formData
            });
            const data = await res.json();
            if (res.ok && data.success) {
                fetchPlans(); setShowAddPlan(false);
                const s = data.stats;
        const showInfoModalTitle5 = t('floorPlan.modal.lidarImportComplete', 'LiDAR Import Complete');
        const showInfoModalMsg5 = t('floorPlan.modal.successfullyImportedName', `Successfully imported "${name}"\n\n• ${s.totalVertices.toLocaleString()} 3D vertices processed\n• ${s.wallPoints.toLocaleString()} wall points detected\n• ${s.facesProcessed.toLocaleString()} mesh faces\n• Z range: ${s.zRange.min}m to ${s.zRange.max}m (${s.zRange.range}m)\n• Floor area: ~${s.bounds.width}m × ${s.bounds.height}m\n• Output: ${s.imageSize} PNG\n\nTip: Use Edit mode to add pins and annotations on top of the scan.`);
                showInfoModal(showInfoModalTitle5, showInfoModalMsg5);
            } else {
        const showInfoModalTitle6 = t('floorPlan.modal.lidarImportFailed', 'LiDAR Import Failed');
                showInfoModal(showInfoModalTitle6, data.error || 'The scan file could not be processed.');
            }
        } catch (err) {
        const showInfoModalTitle7 = t('floorPlan.modal.importError', 'Import Error');
        const showInfoModalMsg7 = t('floorPlan.modal.failedToImportLidarScan', 'Failed to import LiDAR scan: ');
            showInfoModal(showInfoModalTitle7, showInfoModalMsg7 + err.message);
        }
        setUploading(false);
        e.target.value = '';
    };

    // ── Build Floor Plan: Paste from clipboard → opens crop tool ──
    const handlePasteFromClipboard = async () => {
        try {
            const items = await navigator.clipboard.read();
            let imageBlob = null;
            for (const item of items) {
                for (const type of item.types) {
                    if (type.startsWith('image/')) {
                        imageBlob = await item.getType(type);
                        break;
                    }
                }
                if (imageBlob) break;
            }
            if (!imageBlob) {
        const showInfoModalTitle8 = t('floorPlan.modal.noImageInClipboard', 'No Image in Clipboard');
        const showInfoModalMsg8 = t('floorPlan.modal.noImageWasFoundInYourCli', 'No image was found in your clipboard.\n\nTo use this feature:\n1. Open Google Maps → go to your plant address → Satellite view\n2. Right-click → "Measure distance" → click around the building for scale reference\n3. Use Snipping Tool (Win+Shift+S) → drag to select just the map area\n4. Come back here and click "Paste from Clipboard"');
                showInfoModal(showInfoModalTitle8, showInfoModalMsg8);
                return;
            }
            // Show the crop tool instead of uploading directly
            const imageUrl = URL.createObjectURL(imageBlob);
            setCropState({ imageUrl, blob: imageBlob, crop: null, imgW: 0, imgH: 0 });
        } catch (e) {
        const showInfoModalTitle9 = t('floorPlan.modal.clipboardAccessDenied', 'Clipboard Access Denied');
        const showInfoModalMsg9 = t('floorPlan.modal.yourBrowserBlockedClipboard', 'Your browser blocked clipboard access.\n\nPlease allow clipboard permissions when prompted, or use the "Upload Floor Plan" option instead.');
            showInfoModal(showInfoModalTitle9, showInfoModalMsg9);
        }
    };

    // ── Crop tool: confirm and upload ──
    const handleCropConfirm = async () => {
        if (!cropState) return;
        const name = await showInputModal('Name Your Floor Plan', 'Enter a name for this floor plan:', { placeholder: 'e.g. Main Facility Satellite', defaultValue: 'Satellite View' });
        if (!name) return;

        setUploading(true);
        try {
            // Load the full image
            const img = new Image();
            img.src = cropState.imageUrl;
            await new Promise(r => { img.onload = r; });

            let blob;
            if (cropState.crop) {
                // Crop the image using Canvas
                const { x, y, w, h } = cropState.crop;
                // Convert crop percentages to pixel coordinates
                const sx = Math.round(x / 100 * img.naturalWidth);
                const sy = Math.round(y / 100 * img.naturalHeight);
                const sw = Math.round(w / 100 * img.naturalWidth);
                const sh = Math.round(h / 100 * img.naturalHeight);

                const canvas = document.createElement('canvas');
                canvas.width = sw;
                canvas.height = sh;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
                blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            } else {
                // No crop — use original
                blob = cropState.blob;
            }

            const formData = new FormData();
            formData.append('plantId', plantId);
            formData.append('name', name);
            formData.append('floorplan', blob, 'satellite.png');
            const res = await fetch('/api/floorplans', {
                method: 'POST', headers: { ...headers }, body: formData
            });
            if (res.ok) { fetchPlans(); }
            else {
                const showInfoModalTitle10 = t('floorPlan.modal.uploadFailed', 'Upload Failed');
                const showInfoModalMsg10 = t('floorPlan.modal.theImageCouldNotBeSaved', 'The image could not be saved. Please try again.');
                showInfoModal(showInfoModalTitle10, showInfoModalMsg10);
            }
        } catch (e) {
        const showInfoModalTitle11 = t('floorPlan.modal.uploadError', 'Upload Error');
        const showInfoModalMsg11 = t('floorPlan.modal.failedToProcessTheImage', 'Failed to process the image: ');
            showInfoModal(showInfoModalTitle11, showInfoModalMsg11 + e.message);
        }
        setUploading(false);
        URL.revokeObjectURL(cropState.imageUrl);
        setCropState(null);
        setShowBuildDialog(false);
    };

    const handleCropCancel = () => {
        if (cropState?.imageUrl) URL.revokeObjectURL(cropState.imageUrl);
        setCropState(null);
    };

    // ═══ SATELLITE → BLUEPRINT CONVERSION ═══
    // Saves as alternate view on the SAME floor plan (not a separate record)
    const convertToBlueprint = async () => {
        if (!activePlan) return;
        const confirmed = await showConfirmModal('Convert to Blueprint',
            'This will process the satellite image to extract building outlines and create a blueprint view.\n\n' +
            'The blueprint is saved on this same floor plan — you can toggle between Satellite and Blueprint views using the 🛰/📐 button.\n\n' +
            'Continue?');
        if (!confirmed) return;

        setUploading(true);
        try {
            // Step 1: Load the satellite image onto a hidden canvas
            const img = new Image();
            img.crossOrigin = 'anonymous';
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = activePlan.imagePath;
            });

            const w = img.naturalWidth;
            const h = img.naturalHeight;
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            // Step 2: Get pixel data
            const imageData = ctx.getImageData(0, 0, w, h);
            const data = imageData.data;

            // Step 3: Enhanced Sobel Edge Detection
            const grayScale = new Float32Array(w * h);
            for (let i = 0; i < data.length; i += 4) {
                grayScale[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            }

            // Step 4: Apply Sobel filter
            const edgeData = new Float32Array(w * h);
            for (let y = 1; y < h - 1; y++) {
                for (let x = 1; x < w - 1; x++) {
                    const idx = y * w + x;
                    const gx = -grayScale[(y-1)*w+(x-1)] + grayScale[(y-1)*w+(x+1)]
                              -2*grayScale[y*w+(x-1)]     + 2*grayScale[y*w+(x+1)]
                              -grayScale[(y+1)*w+(x-1)]   + grayScale[(y+1)*w+(x+1)];
                    const gy = -grayScale[(y-1)*w+(x-1)] - 2*grayScale[(y-1)*w+x] - grayScale[(y-1)*w+(x+1)]
                              +grayScale[(y+1)*w+(x-1)]  + 2*grayScale[(y+1)*w+x] + grayScale[(y+1)*w+(x+1)];
                    edgeData[idx] = Math.sqrt(gx * gx + gy * gy);
                }
            }

            // Step 5: Render blueprint
            const blueprintBg = { r: 15, g: 23, b: 42 };
            const lineColor = { r: 120, g: 180, b: 255 };
            const strongLine = { r: 200, g: 230, b: 255 };
            const gridColor = { r: 25, g: 38, b: 60 };
            const threshold = 30;

            const out = ctx.createImageData(w, h);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const idx = y * w + x;
                    const i = idx * 4;
                    const edge = edgeData[idx];
                    const isGrid = (x % 50 === 0 || y % 50 === 0);

                    if (edge > threshold * 2.5) {
                        out.data[i] = strongLine.r; out.data[i+1] = strongLine.g; out.data[i+2] = strongLine.b; out.data[i+3] = 255;
                    } else if (edge > threshold) {
                        const intensity = Math.min(1, (edge - threshold) / (threshold * 1.5));
                        out.data[i]   = blueprintBg.r + (lineColor.r - blueprintBg.r) * intensity;
                        out.data[i+1] = blueprintBg.g + (lineColor.g - blueprintBg.g) * intensity;
                        out.data[i+2] = blueprintBg.b + (lineColor.b - blueprintBg.b) * intensity;
                        out.data[i+3] = 255;
                    } else if (isGrid) {
                        out.data[i] = gridColor.r; out.data[i+1] = gridColor.g; out.data[i+2] = gridColor.b; out.data[i+3] = 255;
                    } else {
                        out.data[i] = blueprintBg.r; out.data[i+1] = blueprintBg.g; out.data[i+2] = blueprintBg.b; out.data[i+3] = 255;
                    }
                }
            }
            ctx.putImageData(out, 0, 0);

            // Compass rose
            ctx.save();
            ctx.translate(40, h - 40);
            ctx.strokeStyle = 'rgba(180,210,255,0.4)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = 'rgba(180,210,255,0.6)'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
            ctx.fillText('N', 0, -22);
            ctx.fillStyle = 'rgba(180,210,255,0.3)'; ctx.font = '9px monospace';
            ctx.fillText('S', 0, 30); ctx.fillText('E', 26, 4); ctx.fillText('W', -26, 4);
            ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(-4, -6); ctx.lineTo(4, -6); ctx.closePath();
            ctx.fillStyle = 'rgba(180,210,255,0.5)'; ctx.fill();
            ctx.restore();

            // Watermark
            ctx.save();
            ctx.font = `bold ${Math.max(14, Math.floor(w / 50))}px monospace`;
            ctx.fillStyle = 'rgba(100,130,200,0.15)'; ctx.textAlign = 'right';
            ctx.fillText('BLUEPRINT — ' + (activePlan.name || 'FACILITY').toUpperCase(), w - 20, h - 15);
            ctx.restore();

            // Step 6: Save blueprint to SAME plan via /blueprint endpoint
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            const formData = new FormData();
            formData.append('blueprint', blob, 'blueprint.png');

            const res = await fetch(`/api/floorplans/${activePlan.id}/blueprint`, {
                method: 'POST', headers: { ...headers }, body: formData
            });
            if (res.ok) {
                const result = await res.json();
                setActivePlan(prev => ({ ...prev, blueprintPath: result.blueprintPath }));
                setViewMode('blueprint');
                await fetchPlans();
        const showInfoModalTitle12 = t('floorPlan.modal.blueprintCreated', 'Blueprint Created!');
        const showInfoModalMsg12 = t('floorPlan.modal.blueprintViewHasBeenGenera', 'Blueprint view has been generated!\n\n');
                showInfoModal(showInfoModalTitle12, showInfoModalMsg12 +
                    'Use the 🛰️ / 📐 toggle button to switch between Satellite and Blueprint views.\n\n' +
                    'All your pins and annotations are shared between both views.');
            } else {
        const showInfoModalTitle13 = t('floorPlan.modal.conversionFailed', 'Conversion Failed');
        const showInfoModalMsg13 = t('floorPlan.modal.couldNotSaveTheBlueprintI', 'Could not save the blueprint image. Please try again.');
                showInfoModal(showInfoModalTitle13, showInfoModalMsg13);
            }
        } catch (e) {
            console.error('Blueprint conversion error:', e);
        const showInfoModalTitle14 = t('floorPlan.modal.conversionError', 'Conversion Error');
        const showInfoModalMsg14 = t('floorPlan.modal.failedToProcessTheSatellit', 'Failed to process the satellite image.\n\nError: ');
            showInfoModal(showInfoModalTitle14, showInfoModalMsg14 + e.message);
        }
        setUploading(false);
    };


    // ── Freehand drawing state ──
    const [isDrawingFreehand, setIsDrawingFreehand] = useState(false);
    const freehandRef = useRef([]);

    const handleSvgMouseDown = (e) => {
        if (drawTool !== 'route' || !imgRef.current) return;
        e.preventDefault();
        setIsDrawingFreehand(true);
        freehandRef.current = [];
        const rect = imgRef.current.getBoundingClientRect();
        const x = parseFloat(((e.clientX - rect.left) / rect.width * 100).toFixed(2));
        const y = parseFloat(((e.clientY - rect.top) / rect.height * 100).toFixed(2));
        freehandRef.current.push({ x, y });
        setDrawingPoints([{ x, y }]);
    };

    const handleSvgMouseMove = (e) => {
        if (!isDrawingFreehand || drawTool !== 'route' || !imgRef.current) return;
        const rect = imgRef.current.getBoundingClientRect();
        const x = parseFloat(((e.clientX - rect.left) / rect.width * 100).toFixed(2));
        const y = parseFloat(((e.clientY - rect.top) / rect.height * 100).toFixed(2));
        // Only add point if moved enough distance (simplification)
        const last = freehandRef.current[freehandRef.current.length - 1];
        const dist = Math.sqrt((x - last.x) ** 2 + (y - last.y) ** 2);
        if (dist > 1.5) { // ~1.5% threshold for smoothing
            freehandRef.current.push({ x, y });
            setDrawingPoints([...freehandRef.current]);
        }
    };

    const handleSvgMouseUp = async () => {
        if (!isDrawingFreehand) return;
        setIsDrawingFreehand(false);
        if (freehandRef.current.length >= 3) {
            // Simplify: keep every Nth point to reduce storage
            const simplified = freehandRef.current.filter((_, i) => i === 0 || i === freehandRef.current.length - 1 || i % 3 === 0);
            const label = drawLabel || await showInputModal('Route Label', 'Enter a name for this route:', { placeholder: 'e.g. Evacuation Route A', defaultValue: '' }) || '';
            saveAnnotation('route', simplified, label, drawColor);
            setDrawLabel('');
        }
        setDrawingPoints([]);
        freehandRef.current = [];
    };

    // Build dialog state
    const [showBuildDialog, setShowBuildDialog] = useState(false);

    const handleDeletePlan = async () => {
        if (!activePlan) return;
        const confirmed = await showConfirmModal('Delete Floor Plan', `Delete "${activePlan.name}" and all its pins and annotations?\n\nThis cannot be undone.`);
        if (!confirmed) return;
        try {
            await fetch(`/api/floorplans/${activePlan.id}`, { method: 'DELETE', headers });
            setActivePlan(null);
            fetchPlans();
        } catch (e) { console.warn('[FloorPlanView] caught:', e); }
    };

    const handleImageClick = async (e) => {
        if (!editMode || !placingPin || !imgRef.current) return;
        const currentLayer = activeLayer === 'all' ? 'assets' : activeLayer;
        const isAssetLayer = currentLayer === 'assets';
        // Asset layer requires a selected asset; other layers just need the layer type
        if (isAssetLayer && !selectedAsset) return;
        
        const rect = imgRef.current.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width * 100).toFixed(2);
        const y = ((e.clientY - rect.top) / rect.height * 100).toFixed(2);

        try {
            await fetch(`/api/floorplans/${activePlan.id}/pins`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    assetId: isAssetLayer ? selectedAsset : (pinLabel || currentLayer),
                    xPercent: parseFloat(x),
                    yPercent: parseFloat(y),
                    layerType: currentLayer,
                    label: isAssetLayer ? '' : (pinLabel || ''),
                })
            });
            fetchPins(activePlan.id);
            setPlacingPin(false);
            setSelectedAsset('');
            setPinLabel('');
        } catch (e) { console.warn('[FloorPlanView] caught:', e); }
    };

    // ── Equipment Icon Drag: custom mouse-based (not HTML5 drag) for smooth tracking ──
    const handleIconMouseUp = useCallback(async (e) => {
        if (!draggingIcon || !editMode || !imgRef.current || !activePlan) {
            setDraggingIcon(null); setDragGhost(null); return;
        }
        // Check if dropped over the floor plan image
        const rect = imgRef.current.getBoundingClientRect();
        const cx = e.clientX, cy = e.clientY;
        if (cx < rect.left || cx > rect.right || cy < rect.top || cy > rect.bottom) {
            // Dropped outside the image — cancel
            setDraggingIcon(null); setDragGhost(null); return;
        }
        const x = ((cx - rect.left) / rect.width * 100).toFixed(2);
        const y = ((cy - rect.top) / rect.height * 100).toFixed(2);

        const currentIcon = draggingIcon;
        setDraggingIcon(null);
        // Remove ghost DOM element
        if (iconGhostRef.current) { iconGhostRef.current.remove(); iconGhostRef.current = null; }

        // Ask for an optional asset link or label
        const iconDef = getEquipmentIcon(currentIcon);
        const label = await showInputModal(
            `Place ${iconDef?.label || 'Equipment'}`,
            `Enter a label or asset ID for this ${iconDef?.label}:`,
            { placeholder: `e.g. ${iconDef?.label} #1, or asset ID`, defaultValue: iconDef?.label || '' }
        );
        if (label === null) return;

        // Check if the label matches an asset ID
        const matchedAsset = assets.find(a => a.ID === label);
        try {
            await fetch(`/api/floorplans/${activePlan.id}/pins`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    assetId: matchedAsset ? matchedAsset.ID : (label || currentIcon),
                    xPercent: parseFloat(x),
                    yPercent: parseFloat(y),
                    layerType: 'assets',
                    label: label || iconDef?.label || '',
                    iconType: currentIcon,
                })
            });
            fetchPins(activePlan.id);
        } catch (e) { console.warn('[FloorPlanView] caught:', e); }
    }, [draggingIcon, editMode, activePlan, assets, headers]);

    // Document-level listeners for smooth icon dragging (direct DOM, no React state)
    useEffect(() => {
        if (!draggingIcon) return;
        const onMove = (e) => {
            e.preventDefault();
            if (iconGhostRef.current) {
                iconGhostRef.current.style.left = (e.clientX - 18) + 'px';
                iconGhostRef.current.style.top = (e.clientY - 18) + 'px';
            }
        };
        const onUp = (e) => handleIconMouseUp(e);
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            // Cleanup ghost if still around
            if (iconGhostRef.current) { iconGhostRef.current.remove(); iconGhostRef.current = null; }
        };
    }, [draggingIcon, handleIconMouseUp]);

    // ── Annotation Functions ──
    const fetchAnnotations = async (planId) => {
        try {
            const res = await fetch(`/api/floorplans/${planId}/annotations`, { headers });
            if (res.ok) setAnnotations(await res.json());
        } catch (e) { console.warn('[FloorPlanView] caught:', e); }
    };

    const saveAnnotation = async (type, points, label, color) => {
        try {
            await fetch(`/api/floorplans/${activePlan.id}/annotations`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type,
                    layerType: activeLayer === 'all' ? 'emergency' : activeLayer,
                    points,
                    label: label || '',
                    color: color || drawColor,
                    strokeWidth: type === 'measure' ? 2 : (type === 'arrow' ? 4 : 3),
                    fontSize: type === 'text' ? 16 : 13,
                })
            });
            fetchAnnotations(activePlan.id);
        } catch (e) { console.warn('[FloorPlanView] caught:', e); }
    };


    // ── Zone Functions ──
    const fetchZones = async (planId) => {
        try {
            const res = await fetch(`/api/floorplans/${planId}/zones`, { headers });
            if (res.ok) setZones(await res.json());
        } catch (e) { console.warn('[FloorPlanView] caught:', e); }
    };

    const saveZone = async (points, name, zt, color, hazardClass, capacity) => {
        try {
            await fetch(`/api/floorplans/${activePlan.id}/zones`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name || 'Unnamed Zone',
                    zoneType: zt || zoneType,
                    points,
                    color: color || ZONE_TYPES[zt || zoneType]?.color || '#3b82f6',
                    opacity: 0.25,
                    hazardClass: hazardClass || '',
                    capacity: capacity || 0,
                })
            });
            fetchZones(activePlan.id);
        } catch (e) { console.warn('[FloorPlanView] caught:', e); }
    };

    const handleDeleteZone = async (zoneId) => {
        const confirmed = await showConfirmModal('Delete Zone', 'Remove this zone? This cannot be undone.');
        if (!confirmed) return;
        try {
            await fetch(`/api/floorplans/${activePlan.id}/zones/${zoneId}`, { method: 'DELETE', headers });
            fetchZones(activePlan.id);
            setSelectedZone(null);
        } catch (e) { console.warn('[FloorPlanView] caught:', e); }
    };

    const finishZoneDrawing = async () => {
        if (drawingPoints.length < 3) return;
        const name = await showInputModal('Zone Name', 'Enter a name for this zone:', 'e.g., Processing Area A');
        if (name === null) { setDrawingPoints([]); return; }
        const zt = zoneType;
        const ztConfig = ZONE_TYPES[zt] || ZONE_TYPES.production;
        // Ask for hazard class if it's a hazard zone
        let hazardClass = '';
        if (zt === 'hazard') {
        const showInputModalTitle15 = t('floorPlan.modal.hazardClassification', 'Hazard Classification');
        const showInputModalMsg15 = t('floorPlan.modal.enterHazardClassification', 'Enter hazard classification:');
            hazardClass = await showInputModal(showInputModalTitle15, showInputModalMsg15, 
                'e.g., Ammonia, Electrical, Confined Space') || '';
        }
        await saveZone(drawingPoints, name || 'Unnamed Zone', zt, ztConfig.color, hazardClass, 0);
        setDrawingPoints([]);
        setDrawTool(null);
    };






    // ── Emergency Mode Functions ──
    const activateEmergencyMode = async () => {
        const confirmed = await showConfirmModal(
            '🚨 ACTIVATE EMERGENCY MODE',
            'This will:\n\n' +
            '• Show ALL fire extinguishers, emergency exits, and assembly points\n' +
            '• Highlight evacuation routes\n' +
            '• Start the headcount tracker\n' +
            '• Filter to emergency-relevant layers only\n\n' +
            'Activate Emergency Mode?'
        );
        if (!confirmed) return;
        setEmergencyMode(true);
        setActiveLayer('all'); // Show all layers
        // Initialize headcount from occupancy sensors or zone capacities
        const totalPeople = zones.reduce((sum, z) => sum + (z.capacity || 0), 0) || 25;
        setHeadcount({ total: totalPeople, accounted: 0, missing: totalPeople, entries: [] });
    };

    const deactivateEmergencyMode = () => {
        setEmergencyMode(false);
        setNearestExit(null);
        setHeadcount({ total: 0, accounted: 0, missing: 0, entries: [] });
    };

    const markPersonAccounted = (name) => {
        setHeadcount(prev => {
            const newEntries = [...prev.entries, { name, time: new Date().toLocaleTimeString() }];
            const accounted = newEntries.length;
            return { ...prev, accounted, missing: Math.max(0, prev.total - accounted), entries: newEntries };
        });
    };

    const handleAddToHeadcount = async () => {
        const name = await showInputModal('✅ Mark Person Accounted',
            'Enter the name of the person who has been accounted for:',
            { placeholder: 'e.g., John Smith' });
        if (name) markPersonAccounted(name);
    };

    // Find nearest exit from user GPS position or center of plan
    React.useEffect(() => {
        if (!emergencyMode) { setNearestExit(null); return; }
        const exitPins = pins.filter(p => p.layerType === 'emergency');
        if (exitPins.length === 0) return;
        
        // Use GPS position if available, otherwise center of plan
        const refX = userPosOnPlan?.x ?? 50;
        const refY = userPosOnPlan?.y ?? 50;
        
        let nearest = null;
        let minDist = Infinity;
        exitPins.forEach(pin => {
            const dx = pin.xPercent - refX;
            const dy = pin.yPercent - refY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDist) { minDist = dist; nearest = pin; }
        });
        setNearestExit(nearest);
    }, [emergencyMode, pins, userPosOnPlan]);

    // Emergency print function
    const handlePrintEmergencyPacket = () => {
        const printWindow = window.open('', '_blank');
        const emergencyPins = pins.filter(p => ['fire', 'emergency', 'tornado', 'flood'].includes(p.layerType));
        const emergencyAnnotations = annotations.filter(a => a.layerType === 'emergency' || a.type === 'route');
        
        printWindow.document.write(`
            <!DOCTYPE html>
            <html><head><title>EMERGENCY PACKET — ${activePlan?.name || 'Floor Plan'}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
                h1 { color: #dc2626; border-bottom: 3px solid #dc2626; padding-bottom: 10px; }
                h2 { color: #dc2626; margin-top: 30px; }
                .header { display: flex; justify-content: space-between; align-items: center; }
                .plan-img { max-width: 100%; border: 2px solid #dc2626; border-radius: 8px; margin: 15px 0; }
                .legend { display: flex; gap: 20px; flex-wrap: wrap; padding: 10px; background: #fef2f2; border-radius: 8px; margin: 10px 0; }
                .legend-item { display: flex; align-items: center; gap: 6px; font-size: 14px; }
                .dot { width: 12px; height: 12px; border-radius: 50%; }
                table { width: 100%; border-collapse: collapse; margin: 10px 0; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 13px; }
                th { background: #dc2626; color: white; }
                .headcount { margin-top: 20px; }
                .headcount td:first-child { width: 60%; }
                .footer { margin-top: 30px; color: #999; font-size: 11px; border-top: 1px solid #ddd; padding-top: 10px; }
                @media print { body { margin: 10px; } }
            </style></head><body>
            <div class="header">
                <h1>${t('floorPlan.emergencyEvacuationPacket')}</h1>
                <div style="text-align:right; font-size:12px; color:#666;">
                    Generated: ${new Date().toLocaleString()}<br/>${t('floorPlan.text.printedFromTrierOS', 'Printed from Trier OS')}</div>
            </div>
            <h2>📋 Floor Plan: ${activePlan?.name || 'Unknown'}</h2>
            <img src="${activePlan?.imagePath}" class="plan-img" alt="Floor Plan" />
            <div class="legend">
                <div class="legend-item"><div class="dot" style="background:#ef4444"></div> ${t('floorPlan.fireEquipment')}</div>
                <div class="legend-item"><div class="dot" style="background:#22d3ee"></div> ${t('floorPlan.emergencyExits')}</div>
                <div class="legend-item"><div class="dot" style="background:#f59e0b"></div> ${t('floorPlan.tornadoShelter')}</div>
                <div class="legend-item"><div class="dot" style="background:#3b82f6"></div> ${t('floorPlan.floodHazard')}</div>
                <div class="legend-item"><div class="dot" style="background:#a78bfa"></div> ${t('floorPlan.utilityShutoff')}</div>
            </div>
            <h2>${t('floorPlan.emergencyEquipmentLocations')}</h2>
            <table>
                <tr><th>${t('floorPlan.type')}</th><th>${t('floorPlan.labelid')}</th><th>${t('floorPlan.position')}</th></tr>
                ${emergencyPins.map(p => `<tr>
                    <td>${p.layerType?.toUpperCase() || 'UNKNOWN'}</td>
                    <td>${p.label || p.assetId || p.asset_id || '—'}</td>
                    <td>X: ${p.xPercent?.toFixed(0)}% · Y: ${p.yPercent?.toFixed(0)}%</td>
                </tr>`).join('')}
            </table>
            <h2>${t('floorPlan.evacuationRoutes')}</h2>
            <table>
                <tr><th>${t('floorPlan.route')}</th><th>${t('floorPlan.waypoints')}</th></tr>
                ${emergencyAnnotations.filter(a => a.type === 'route').map(a => `<tr>
                    <td>${a.label || 'Evacuation Route'}</td>
                    <td>${a.points?.length || 0} waypoints</td>
                </tr>`).join('') || `<tr><td colspan="2">${t('floorPlan.noEvacuationRoutesDefinedUse')}</td></tr>`}
            </table>
            <h2 class="headcount">${t('floorPlan.headcountTracker')}</h2>
            <table>
                <tr><th>${t('floorPlan.name')}</th><th>${t('floorPlan.timeAccounted')}</th></tr>
                ${headcount.entries.map(e => `<tr><td>${e.name}</td><td>${e.time}</td></tr>`).join('')}
                ${Array.from({ length: Math.max(10, headcount.total - headcount.entries.length) }, () => '<tr><td style="height:24px"></td><td></td></tr>').join('')}
            </table>
            <p><strong>${t('floorPlan.totalExpected')}</strong> ${headcount.total} | <strong>${t('floorPlan.accounted')}</strong> ${headcount.accounted} | <strong>${t('floorPlan.missing')}</strong> ${headcount.missing}</p>
            <div class="footer">
                Emergency Packet generated by Trier OS · © ${new Date().getFullYear()} · For internal use only
            </div>
            </body></html>
        `);
        printWindow.document.close();
        setTimeout(() => printWindow.print(), 500);
    };

    // ── Sensor Functions ──
    const fetchSensors = async (planId) => {
        try {
            const res = await fetch(`/api/floorplans/${planId}/sensors`, { headers });
            if (res.ok) setSensors(await res.json());
        } catch (e) { console.warn('Failed to fetch sensors:', e); }
    };

    const fetchSensorReadings = async (planId) => {
        try {
            const res = await fetch(`/api/floorplans/${planId}/sensors/live`, { headers });
            if (res.ok) setSensorReadings(await res.json());
        } catch (e) { console.warn('[FloorPlanView] caught:', e); }
    };

    // Fetch sensors when plan changes
    React.useEffect(() => {
        if (activePlan?.id) fetchSensors(activePlan.id);
    }, [activePlan?.id]);

    // Start/stop sensor polling
    React.useEffect(() => {
        if (showSensors && activePlan?.id) {
            fetchSensorReadings(activePlan.id);
            sensorPollRef.current = setInterval(() => fetchSensorReadings(activePlan.id), 5000);
        }
        return () => { if (sensorPollRef.current) clearInterval(sensorPollRef.current); };
    }, [showSensors, activePlan?.id]);

    const handlePlaceSensor = async (x, y) => {
        if (!placingSensor || !activePlan) return;
        const sType = SENSOR_TYPES[placingSensor];
        const name = await showInputModal(`Place ${sType.emoji} ${sType.label} Sensor`,
            'Enter a name for this sensor:', { placeholder: `e.g., ${sType.label} - Zone A` });
        if (!name) { setPlacingSensor(null); return; }

        try {
            await fetch(`/api/floorplans/${activePlan.id}/sensors`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name, sensorType: placingSensor,
                    xPercent: x, yPercent: y,
                    unit: sType.unit,
                    minThreshold: sType.minT, maxThreshold: sType.maxT,
                    alertAbove: sType.alertA, alertBelow: sType.alertB,
                })
            });
            fetchSensors(activePlan.id);
            if (showSensors) fetchSensorReadings(activePlan.id);
        } catch (e) { console.warn('[FloorPlanView] caught:', e); }
        setPlacingSensor(null);
    };

    const handleDeleteSensor = async (sensorId) => {
        const confirmed = await showConfirmModal('Remove Sensor', 'Remove this sensor from the floor plan?');
        if (!confirmed) return;
        try {
            await fetch(`/api/floorplans/${activePlan.id}/sensors/${sensorId}`, { method: 'DELETE', headers });
            fetchSensors(activePlan.id);
        } catch (e) { console.warn('[FloorPlanView] caught:', e); }
    };

    const getSensorStatusColor = (status) => {
        if (status === 'critical') return '#ef4444';
        if (status === 'warning') return '#f59e0b';
        return '#22c55e';
    };

    // ── Touch Pinch-to-Zoom & Pan ──
    const getTouchDist = (t1, t2) => Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    const getTouchMid = (t1, t2) => ({
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
    });

    const handleTouchStart = useCallback((e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const t = e.touches;
            touchRef.current = {
                dist: getTouchDist(t[0], t[1]),
                mid: getTouchMid(t[0], t[1]),
                zoom,
                pan: { ...pan },
            };
        } else if (e.touches.length === 1 && !placingPin && !drawTool) {
            // Single finger pan
            touchRef.current = {
                ...touchRef.current,
                startX: e.touches[0].clientX,
                startY: e.touches[0].clientY,
                panStart: { ...pan },
                singleTouch: true,
            };
        }
    }, [zoom, pan, placingPin, drawTool]);

    const handleTouchMove = useCallback((e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const t = e.touches;
            const newDist = getTouchDist(t[0], t[1]);
            const scale = newDist / touchRef.current.dist;
            const newZoom = Math.min(Math.max(touchRef.current.zoom * scale, 0.25), 5);
            
            // Zoom toward pinch center
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) {
                const mid = getTouchMid(t[0], t[1]);
                const cx = mid.x - rect.left;
                const cy = mid.y - rect.top;
                const scaleFactor = newZoom / touchRef.current.zoom;
                setPan({
                    x: cx - (cx - touchRef.current.pan.x) * scaleFactor,
                    y: cy - (cy - touchRef.current.pan.y) * scaleFactor,
                });
            }
            setZoom(newZoom);
        } else if (e.touches.length === 1 && touchRef.current.singleTouch) {
            // Single finger pan
            const dx = e.touches[0].clientX - touchRef.current.startX;
            const dy = e.touches[0].clientY - touchRef.current.startY;
            setPan({
                x: touchRef.current.panStart.x + dx,
                y: touchRef.current.panStart.y + dy,
            });
        }
    }, []);

    const handleTouchEnd = useCallback(() => {
        touchRef.current.singleTouch = false;
    }, []);

    // Attach touch handlers
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        el.addEventListener('touchstart', handleTouchStart, { passive: false });
        el.addEventListener('touchmove', handleTouchMove, { passive: false });
        el.addEventListener('touchend', handleTouchEnd);
        return () => {
            el.removeEventListener('touchstart', handleTouchStart);
            el.removeEventListener('touchmove', handleTouchMove);
            el.removeEventListener('touchend', handleTouchEnd);
        };
    }, [handleTouchStart, handleTouchMove, handleTouchEnd, activePlan]);

    // ── GPS "You Are Here" ──
    const startGPSTracking = () => {
        if (!navigator.geolocation) {
        const showInfoModalTitle16 = t('floorPlan.modal.gpsUnavailable', 'GPS Unavailable');
        const showInfoModalMsg16 = t('floorPlan.modal.geolocationIsNotSupportedB', 'Geolocation is not supported by your device.');
            showInfoModal(showInfoModalTitle16, showInfoModalMsg16);
            return;
        }
        setShowYouAreHere(true);
        const id = navigator.geolocation.watchPosition(
            (pos) => {
                setUserGPS({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            },
            (err) => {
                console.warn('GPS error:', err);
        const showInfoModalTitle17 = t('floorPlan.modal.gpsError', 'GPS Error');
        const showInfoModalMsg17 = t('floorPlan.modal.unableToGetYourPosition', 'Unable to get your position: ');
                showInfoModal(showInfoModalTitle17, showInfoModalMsg17 + err.message);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 }
        );
        setGpsWatchId(id);
    };

    const stopGPSTracking = () => {
        if (gpsWatchId !== null) navigator.geolocation.clearWatch(gpsWatchId);
        setGpsWatchId(null);
        setShowYouAreHere(false);
        setUserGPS(null);
        setUserPosOnPlan(null);
    };

    // Map GPS to floor plan position using pin GPS data as reference
    useEffect(() => {
        if (!userGPS || !showYouAreHere || pins.length === 0) return;
        // Find pins that have GPS data (from EXIF or manual entry)
        const gpsPins = pins.filter(p => p.gpsLat && p.gpsLng);
        if (gpsPins.length < 2) {
            // Use plan bounds if available, otherwise approximate from single pin
            if (gpsPins.length === 1) {
                // Rough estimate: center the dot near the single known GPS pin
                const refPin = gpsPins[0];
                const latDiff = (userGPS.lat - refPin.gpsLat) * 111000; // meters per degree
                const lngDiff = (userGPS.lng - refPin.gpsLng) * 111000 * Math.cos(refPin.gpsLat * Math.PI / 180);
                // Convert to pixels assuming ~2 meters per percent of plan
                const mPerPct = 2;
                setUserPosOnPlan({
                    x: Math.max(0, Math.min(100, refPin.xPercent + lngDiff / mPerPct)),
                    y: Math.max(0, Math.min(100, refPin.yPercent - latDiff / mPerPct)),
                });
            }
            return;
        }
        // Use two reference pins to triangulate position
        const p1 = gpsPins[0], p2 = gpsPins[1];
        const gpsRangeX = p2.gpsLng - p1.gpsLng || 0.0001;
        const gpsRangeY = p2.gpsLat - p1.gpsLat || 0.0001;
        const normX = (userGPS.lng - p1.gpsLng) / gpsRangeX;
        const normY = (userGPS.lat - p1.gpsLat) / gpsRangeY;
        setUserPosOnPlan({
            x: Math.max(0, Math.min(100, p1.xPercent + normX * (p2.xPercent - p1.xPercent))),
            y: Math.max(0, Math.min(100, p1.yPercent - normY * (p2.yPercent - p1.yPercent))),
        });
    }, [userGPS, pins, showYouAreHere]);

    // Cleanup GPS on unmount
    useEffect(() => {
        return () => { if (gpsWatchId !== null) navigator.geolocation.clearWatch(gpsWatchId); };
    }, [gpsWatchId]);

    // ── AR View ──
    const handleARView = async () => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const showInfoModalTitle18 = t('floorPlan.modal.arUnavailable', 'AR Unavailable');
        const showInfoModalMsg18 = t('floorPlan.modal.cameraAccessIsNotAvailable', 'Camera access is not available on this device. AR view requires a device with a camera.');
            showInfoModal(showInfoModalTitle18, showInfoModalMsg18);
            return;
        }
        setShowARView(true);
    };

    // ── Version History Functions ──
    const fetchVersions = async (planId) => {
        try {
            const res = await fetch(`/api/floorplans/${planId}/versions`, { headers });
            if (res.ok) setVersions(await res.json());
        } catch (e) { console.warn('Failed to fetch versions:', e); }
    };

    const handleSaveSnapshot = async () => {
        if (!activePlan) return;
        const note = await showInputModal('📸 Save Version Snapshot',
            'Enter a note describing the current state of this floor plan:',
            { placeholder: 'e.g., Added fire exit pins, Updated equipment layout' });
        if (note === null) return;
        try {
            await fetch(`/api/floorplans/${activePlan.id}/versions`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ changeNote: note || 'Manual snapshot' })
            });
            fetchVersions(activePlan.id);
        const showInfoModalTitle19 = t('floorPlan.modal.snapshotSaved', '✅ Snapshot Saved');
        const showInfoModalMsg19 = t('floorPlan.modal.versionSnapshotSavedToHist', 'Version snapshot saved to history. You can revert to this version at any time.');
            showInfoModal(showInfoModalTitle19, showInfoModalMsg19);
        } catch (e) { console.warn('[FloorPlanView] caught:', e); }
    };

    const handleRevert = async (version) => {
        if (!activePlan) return;
        const confirmed = await showConfirmModal('⏪ Revert to Version',
            `Revert this floor plan to v${version.versionNumber} from ${new Date(version.createdAt).toLocaleString()}?\n\nNote: ${version.changeNote || 'No note'}\n\nYour current state will be saved as a snapshot before reverting.`);
        if (!confirmed) return;
        try {
            await fetch(`/api/floorplans/${activePlan.id}/revert/${version.id}`, {
                method: 'POST', headers
            });
            // Refresh plan data
            const res = await fetch(`/api/floorplans?plantId=${plantId}`, { headers });
            if (res.ok) {
                const raw = await res.json();
                const updated = Array.isArray(raw.plans) ? raw.plans : Array.isArray(raw) ? raw : [];
                setPlans(updated);
                const updatedPlan = updated.find(p => p.id === activePlan.id);
                if (updatedPlan) setActivePlan(updatedPlan);
            }
            fetchVersions(activePlan.id);
        const showInfoModalTitle20 = t('floorPlan.modal.reverted', '✅ Reverted');
        const showInfoModalMsg20 = t('floorPlan.modal.floorPlanRevertedToVvers', `Floor plan reverted to v${version.versionNumber}.`);
            showInfoModal(showInfoModalTitle20, showInfoModalMsg20);
        } catch (e) { console.warn('[FloorPlanView] caught:', e); }
    };

    // Fetch versions when version panel opens
    React.useEffect(() => {
        if (showVersionHistory && activePlan) fetchVersions(activePlan.id);
    }, [showVersionHistory, activePlan?.id]);

    const handleAssignFloor = async (planId) => {
        const buildingName = await showInputModal('Building Name', 'Enter the building name for this plan:', 'e.g., Building A, Main Plant, Warehouse');
        if (buildingName === null) return;
        
        // Show floor level picker
        const floorOptions = FLOOR_LEVELS.map(f => f.longLabel).join(', ');
        const floorInput = await showInputModal('Floor Level', 
            'Enter the floor level for this plan:\n\nOptions: ' + floorOptions, 
            'e.g., Ground Floor, 2nd Floor, Basement, Mezzanine, Roof Level');
        if (floorInput === null) return;
        
        // Match input to floor level ID
        const matchedFloor = FLOOR_LEVELS.find(f => 
            f.longLabel.toLowerCase() === (floorInput || '').toLowerCase() ||
            f.label.toLowerCase() === (floorInput || '').toLowerCase() ||
            f.id.toLowerCase() === (floorInput || '').toLowerCase()
        );
        const floorLevel = matchedFloor ? matchedFloor.id : (floorInput || '');
        
        try {
            await fetch(`/api/floorplans/${planId}`, {
                method: 'PUT',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ buildingName: buildingName || '', floorLevel })
            });
            // Refresh plans
            const res = await fetch(`/api/floorplans?plantId=${plantId}`, { headers });
            if (res.ok) {
                const raw = await res.json();
                const updated = Array.isArray(raw.plans) ? raw.plans : Array.isArray(raw) ? raw : [];
                setPlans(updated);
                const updatedPlan = updated.find(p => p.id === planId);
                if (updatedPlan) setActivePlan(updatedPlan);
            }
        const showInfoModalTitle21 = t('floorPlan.modal.floorAssigned', 'Floor Assigned');
        const showInfoModalMsg21 = t('floorPlan.modal.planAssignedToBuildingna', `Plan assigned to "${buildingName || 'No Building'}" — ${matchedFloor?.longLabel || floorInput || 'No Floor'}`);
            showInfoModal(showInfoModalTitle21, showInfoModalMsg21);
        } catch (e) { console.warn('[FloorPlanView] caught:', e); }
    };


    // ── Polygon Area Calculation (Shoelace formula) ──
    const calcPolygonArea = (pts, imgW, imgH) => {
        if (pts.length < 3) return 0;
        let area = 0;
        const pixPts = pts.map(p => ({ x: (p.x / 100) * imgW, y: (p.y / 100) * imgH }));
        for (let i = 0; i < pixPts.length; i++) {
            const j = (i + 1) % pixPts.length;
            area += pixPts[i].x * pixPts[j].y;
            area -= pixPts[j].x * pixPts[i].y;
        }
        area = Math.abs(area) / 2;
        // Convert to real-world units if calibrated
        if (scaleRef && !scaleRef.pending && scaleRef.pixelsPerUnit > 0) {
            const realArea = area / (scaleRef.pixelsPerUnit * scaleRef.pixelsPerUnit);
            return { pixels: area, real: realArea, unit: scaleRef.unit };
        }
        return { pixels: area, real: null, unit: null };
    };

    // ── Distance between two pins ──
    const calcPinDistance = (pin1, pin2) => {
        const imgW = imgRef.current?.naturalWidth || 1000;
        const imgH = imgRef.current?.naturalHeight || 1000;
        const dx = ((pin1.xPercent - pin2.xPercent) / 100) * imgW;
        const dy = ((pin1.yPercent - pin2.yPercent) / 100) * imgH;
        const pixDist = Math.sqrt(dx * dx + dy * dy);
        if (scaleRef && !scaleRef.pending && scaleRef.pixelsPerUnit > 0) {
            return { pixels: pixDist, real: (pixDist / scaleRef.pixelsPerUnit).toFixed(1), unit: scaleRef.unit };
        }
        return { pixels: pixDist, real: null, unit: null };
    };

    // Find nearest pin to a given pin
    const findNearestPin = (targetPin, allPins) => {
        let nearest = null;
        let minDist = Infinity;
        for (const pin of allPins) {
            if (pin.id === targetPin.id) continue;
            const d = calcPinDistance(targetPin, pin);
            if (d.pixels < minDist) { minDist = d.pixels; nearest = { pin, dist: d }; }
        }
        return nearest;
    };

    const handleDeleteAnnotation = async (annId) => {
        const confirmed = await showConfirmModal('Remove Annotation', 'Delete this annotation? This cannot be undone.');
        if (!confirmed) return;
        try {
            await fetch(`/api/floorplans/${activePlan.id}/annotations/${annId}`, { method: 'DELETE', headers });
            fetchAnnotations(activePlan.id);
        } catch (e) { console.warn('[FloorPlanView] caught:', e); }
    };

    const handleSvgClick = async (e) => {
        // Sensor placement intercept
        if (placingSensor) {
            const svg = e.currentTarget;
            const rect = svg.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            handlePlaceSensor(x, y);
            return;
        }

        if (!drawTool || !imgRef.current) return;
        e.stopPropagation();
        const rect = imgRef.current.getBoundingClientRect();
        const x = parseFloat(((e.clientX - rect.left) / rect.width * 100).toFixed(2));
        const y = parseFloat(((e.clientY - rect.top) / rect.height * 100).toFixed(2));

        // Zone tool — multi-click polygon
        if (drawTool === 'zone') {
            setDrawingPoints(prev => [...prev, { x, y }]);
            return;
        }

        if (drawTool === 'arrow') {
            if (drawingPoints.length === 0) {
                setDrawingPoints([{ x, y }]);
            } else {
                // Second click — save arrow
                const pts = [drawingPoints[0], { x, y }];
                const label = drawLabel || await showInputModal('Arrow Label', 'Enter a label for this arrow (or leave empty):', { placeholder: 'e.g. EXIT →, Fire Exit' }) || '';
                saveAnnotation('arrow', pts, label, drawColor);
                setDrawingPoints([]);
                setDrawLabel('');
            }
        } else if (drawTool === 'route') {
            setDrawingPoints(prev => [...prev, { x, y }]);
        } else if (drawTool === 'measure') {
            if (drawingPoints.length === 0) {
                setDrawingPoints([{ x, y }]);
            } else {
                const pts = [drawingPoints[0], { x, y }];
                // Calculate pixel distance between points
                const imgW = imgRef.current?.naturalWidth || 1000;
                const imgH = imgRef.current?.naturalHeight || 1000;
                const dx = (pts[1].x - pts[0].x) * imgW / 100;
                const dy = (pts[1].y - pts[0].y) * imgH / 100;
                const pixelDist = Math.sqrt(dx * dx + dy * dy);

                let dist = '';
                if (scaleRef?.pending) {
                    // Complete calibration — calculate scale from known distance
                    const pixelsPerUnit = pixelDist / scaleRef.realDist;
                    setScaleRef({ pixelsPerUnit, unit: scaleRef.unit, realDist: scaleRef.realDist });
                    dist = `${scaleRef.realDist} ${scaleRef.unit} (REFERENCE)`;
        const showInfoModalTitle22 = t('floorPlan.modal.scaleCalibrated', '✅ Scale Calibrated!');
        const showInfoModalMsg22 = t('floorPlan.modal.scaleSetPixelsperunittof', `Scale set: ${pixelsPerUnit.toFixed(1)} pixels per ${scaleRef.unit}\n\n`);
                    showInfoModal(showInfoModalTitle22, showInfoModalMsg22 +
                        `All measurements will now auto-calculate in ${scaleRef.unit}.\n\n` +
                        `Reference: ${scaleRef.realDist} ${scaleRef.unit} = ${pixelDist.toFixed(0)} pixels`);
                } else if (scaleRef && !scaleRef.pending) {
                    // Auto-calculate using calibrated scale
                    const realDist = (pixelDist / scaleRef.pixelsPerUnit).toFixed(1);
                    dist = `${realDist} ${scaleRef.unit}`;
        const showInfoModalTitle23 = t('floorPlan.modal.measurement', '📏 Measurement');
        const showInfoModalMsg23 = t('floorPlan.modal.distanceRealdistScaler', `Distance: ${realDist} ${scaleRef.unit}\n\n(Calibrated: ${scaleRef.pixelsPerUnit.toFixed(1)} px/${scaleRef.unit})`);
                    showInfoModal(showInfoModalTitle23, showInfoModalMsg23);
                } else {
        const showInputModalTitle24 = t('floorPlan.modal.measurementDistance', 'Measurement Distance');
        const showInputModalMsg24 = t('floorPlan.modal.pixelDistancePixeldistto', `Pixel distance: ${pixelDist.toFixed(0)}px\n\nEnter the real-world distance, or use "⚙ Calibrate" from the toolbar to set a scale:`);
                    dist = await showInputModal(showInputModalTitle24, showInputModalMsg24, 
                        { placeholder: 'e.g. 50 ft, 20m, 150 yards' }) || '';
                }
                if (dist) saveAnnotation('measure', pts, dist, '#f59e0b');
                setDrawingPoints([]);
            }
        } else if (drawTool === 'text') {
            const text = await showInputModal('Text Annotation', 'Enter the text to display at this location:', { placeholder: 'e.g. Emergency Assembly Point' }) || '';
            if (text) {
                saveAnnotation('text', [{ x, y }], text, drawColor);
            }
        }
    };

    // ── Scale Calibration ──
    const handleCalibrateScale = async () => {
        // Ask for calibration input — reference a segment from Google Maps measurement
        const calibInput = await showInputModal('⚙ Calibrate Scale', 
            'Enter the distance of a known segment on your floor plan.\n\n' +
            'If you used Google Maps "Measure distance" tool before taking your screenshot, those distances are visible in the image — just pick any segment.\n\n' +
            'Example: If you see "800.00 ft" along one edge, enter that distance:', 
            { placeholder: 'e.g. 800 ft, 200m' });
        if (!calibInput) return;
        
        // Parse the distance value and unit
        const match = calibInput.match(/^([\d,.]+)\s*(.+)$/);
        if (!match) {
        const showInfoModalTitle25 = t('floorPlan.modal.invalidFormat', 'Invalid Format');
        const showInfoModalMsg25 = t('floorPlan.modal.pleaseEnterANumberFollowed', 'Please enter a number followed by a unit.\n\nExamples: 800 ft, 200m, 150 yards');
            showInfoModal(showInfoModalTitle25, showInfoModalMsg25);
            return;
        }
        
        const realDist = parseFloat(match[1].replace(',', ''));
        const unit = match[2].trim();
        
        // Now ask them to click the two endpoints of that segment
        const showInfoModalTitle26 = t('floorPlan.modal.clickTheTwoEndpoints', 'Click the Two Endpoints');
        const showInfoModalMsg26 = t('floorPlan.modal.nowClickTheTwoEndpointsOf', `Now click the two endpoints of the ${realDist} ${unit} segment on your floor plan.\n\n`);
        showInfoModal(showInfoModalTitle26, showInfoModalMsg26 +
            'The 📏 Measure tool will activate — click the start point, then the end point of that distance.');
        
        // Store pending calibration and switch to measure mode
        setScaleRef({ pending: true, realDist, unit, pixelsPerUnit: 0 });
        setDrawTool('measure');
    };

    // Finish route drawing (double-click or button)
    const finishRoute = async () => {
        if (drawTool === 'route' && drawingPoints.length >= 2) {
            const label = drawLabel || await showInputModal('Route Label', 'Enter a name for this route:', { placeholder: 'e.g. Evacuation Route A' }) || '';
            saveAnnotation('route', drawingPoints, label, drawColor);
            setDrawingPoints([]);
            setDrawLabel('');
        }
    };

    const handleDeletePin = async (pinId) => {
        const confirmed = await showConfirmModal('Remove Pin', 'Remove this pin from the floor plan?');
        if (!confirmed) return;
        try {
            await fetch(`/api/floorplans/${activePlan.id}/pins/${pinId}`, { method: 'DELETE', headers });
            fetchPins(activePlan.id);
        } catch (e) { console.warn('[FloorPlanView] caught:', e); }
    };

    const handleMouseDown = (e) => {
        if (placingPin || draggingPin) return;
        e.preventDefault();
        setIsDragging(true);
        lastPos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = useCallback((e) => {
        // Pin dragging takes priority
        if (draggingPin && imgRef.current) {
            e.preventDefault();
            const rect = imgRef.current.getBoundingClientRect();
            const newX = ((e.clientX - rect.left) / rect.width * 100);
            const newY = ((e.clientY - rect.top) / rect.height * 100);
            // Update pin position in state for real-time visual feedback
            setPins(prev => prev.map(p =>
                p.id === draggingPin.id
                    ? { ...p, xPercent: Math.max(0, Math.min(100, newX)), yPercent: Math.max(0, Math.min(100, newY)) }
                    : p
            ));
            return;
        }
        if (!isDragging) return;
        e.preventDefault();
        const dx = e.clientX - lastPos.current.x;
        const dy = e.clientY - lastPos.current.y;
        lastPos.current = { x: e.clientX, y: e.clientY };
        setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    }, [isDragging, draggingPin]);

    const handleMouseUp = useCallback(async () => {
        // Save dragged pin position
        if (draggingPin) {
            const pin = pins.find(p => p.id === draggingPin.id);
            if (pin) {
                try {
                    await fetch(`/api/floorplans/${activePlan.id}/pins/${pin.id}`, {
                        method: 'PUT',
                        headers: { ...headers, 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            xPercent: parseFloat(pin.xPercent.toFixed(2)),
                            yPercent: parseFloat(pin.yPercent.toFixed(2)),
                        })
                    });
                } catch (e) { /* silent */ }
            }
            setDraggingPin(null);
            return;
        }
        setIsDragging(false);
    }, [draggingPin, pins, activePlan, headers]);

    // Start dragging a pin (edit mode only)
    const handlePinDragStart = (e, pin) => {
        if (!editMode) return;
        e.stopPropagation();
        e.preventDefault();
        setDraggingPin({ id: pin.id });
    };

    // Attach document-level listeners during pin drag for smooth tracking
    useEffect(() => {
        if (!draggingPin) return;
        const onMove = (e) => handleMouseMove(e);
        const onUp = () => handleMouseUp();
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
    }, [draggingPin, handleMouseMove, handleMouseUp]);

    // ESC key cancels drawing
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') {
                if (drawingPoints.length > 0) setDrawingPoints([]);
                else if (drawTool) setDrawTool(null);
                else if (placingPin) setPlacingPin(false);
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [drawingPoints, drawTool, placingPin]);

    // Mousewheel zoom — zooms toward/away from cursor position (Google Maps style)
    const handleWheel = useCallback((e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.15 : 0.15;
        setZoom(prevZoom => {
            const newZoom = Math.min(Math.max(prevZoom + delta, 0.25), 5);
            // Adjust pan so zoom centers on cursor position
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) {
                const cx = e.clientX - rect.left; // cursor X in container
                const cy = e.clientY - rect.top;  // cursor Y in container
                const scaleFactor = newZoom / prevZoom;
                setPan(prev => ({
                    x: cx - (cx - prev.x) * scaleFactor,
                    y: cy - (cy - prev.y) * scaleFactor,
                }));
            }
            return newZoom;
        });
    }, []);

    // Attach wheel handler with passive:false so we can preventDefault
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        el.addEventListener('wheel', handleWheel, { passive: false });
        return () => el.removeEventListener('wheel', handleWheel);
    }, [handleWheel, activePlan]);

    const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

    const getPinColor = (pin) => {
        const wos = openWOs[pin.assetId || pin.asset_id] || [];
        if (wos.some(w => w.Priority === 1 || w.Priority === '1')) return '#ef4444';
        if (wos.length > 0) return '#f59e0b';
        return '#10b981';
    };

    const getWOCount = (pin) => (openWOs[pin.assetId || pin.asset_id] || []).length;

    // ═══ Reusable Modal Dialog JSX ═══
    const ModalDialog = modalState && (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
            zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => modalState.onCancel()}>
            <div onClick={e => e.stopPropagation()} style={{
                background: 'linear-gradient(135deg, rgba(30,32,55,0.98), rgba(20,22,40,0.98))',
                border: '1px solid rgba(99,102,241,0.3)',
                borderRadius: '16px', padding: '28px 32px', maxWidth: '440px', width: '90%',
                boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(99,102,241,0.1)',
            }}>
                <h3 style={{
                    margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700,
                    color: '#c7d2fe', letterSpacing: '0.01em',
                }}>{modalState.title}</h3>

                <div style={{
                    color: '#94a3b8', fontSize: '0.85rem', lineHeight: '1.6',
                    whiteSpace: 'pre-line', marginBottom: '20px',
                }}>{modalState.message}</div>

                {modalState.type === 'input' && (
                    <input
                        type="text"
                        autoFocus
                        value={modalInput}
                        onChange={e => setModalInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') modalState.onConfirm(modalInput); if (e.key === 'Escape') modalState.onCancel(); }}
                        placeholder={modalState.placeholder}
                        style={{
                            width: '100%', padding: '10px 14px', fontSize: '0.9rem',
                            borderRadius: '8px', border: '1px solid rgba(99,102,241,0.3)',
                            background: 'rgba(0,0,0,0.3)', color: '#e2e8f0',
                            outline: 'none', marginBottom: '20px', boxSizing: 'border-box',
                        }}
                    />
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    {modalState.type !== 'info' && (
                        <button onClick={modalState.onCancel} style={{
                            padding: '8px 20px', borderRadius: '8px', fontSize: '0.85rem',
                            fontWeight: 600, cursor: 'pointer',
                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                            color: '#94a3b8',
                        }} title="Cancel">{t('common.cancel', 'Cancel')}</button>
                    )}
                    <button 
                        onClick={() => {
                            if (modalState.type === 'input') modalState.onConfirm(modalInput);
                            else modalState.onConfirm(true);
                        }}
                        autoFocus={modalState.type !== 'input'}
                        style={{
                            padding: '8px 24px', borderRadius: '8px', fontSize: '0.85rem',
                            fontWeight: 700, cursor: 'pointer',
                            background: modalState.type === 'confirm' ? 'rgba(239,68,68,0.2)' : 'rgba(99,102,241,0.2)',
                            border: `1px solid ${modalState.type === 'confirm' ? 'rgba(239,68,68,0.4)' : 'rgba(99,102,241,0.4)'}`,
                            color: modalState.type === 'confirm' ? '#ef4444' : '#818cf8',
                        }} title="If">
                        {modalState.type === 'info' ? 'OK' : modalState.type === 'confirm' ? 'Confirm' : 'OK'}
                    </button>
                </div>
            </div>
        </div>
    );

    if (!activePlan && plans.length === 0) {
        return (
            <>
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <MapPin size={48} color="var(--text-muted)" style={{ marginBottom: '15px' }} />
                <h3 style={{ color: 'var(--text-muted)', margin: '0 0 8px 0' }}>{t('floor.plan.noFloorPlans')}</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '25px' }}>{t('floorPlan.text.uploadAFloorPlanImageOrPasteAG', 'Upload a floor plan image or paste a Google Maps satellite screenshot')}</p>
                {isAdmin && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                        {/* Upload file */}
                        <label style={{
                            padding: '12px 28px', borderRadius: '10px', cursor: 'pointer', width: '280px',
                            background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
                            color: '#818cf8', fontWeight: 600, fontSize: '0.9rem',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'
                        }}>
                            <Upload size={18} />{t('floorPlan.text.uploadFloorPlan', 'Upload Floor Plan')}<input type="file" accept="image/*" onChange={handleUpload} style={{ display: 'none' }} title={t('floorPlan.selectAFloorPlanImageTip')} />
                        </label>

                        {/* Paste from clipboard */}
                        <button onClick={handlePasteFromClipboard} style={{
                            padding: '12px 28px', borderRadius: '10px', cursor: 'pointer', width: '280px',
                            background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)',
                            color: '#22c55e', fontWeight: 600, fontSize: '0.9rem',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'
                        }} title={t('floorPlan.copyAScreenshotEgGoogleTip')}>
                            📋 Paste from Clipboard
                        </button>

                        {/* Import CAD/DXF */}
                        <label style={{
                            padding: '12px 28px', borderRadius: '10px', cursor: 'pointer', width: '280px',
                            background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)',
                            color: '#f59e0b', fontWeight: 600, fontSize: '0.9rem',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'
                        }}>
                            📐 Import CAD File (.dxf)
                            <input type="file" accept=".dxf" onChange={handleDXFImport} style={{ display: 'none' }} title={t('floorPlan.selectAnAutocadDxfFileTip')} />
                        </label>

                        {/* Import LiDAR Scan */}
                        <label style={{
                            padding: '12px 28px', borderRadius: '10px', cursor: 'pointer', width: '280px',
                            background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.3)',
                            color: '#06b6d4', fontWeight: 600, fontSize: '0.9rem',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'
                        }}>
                            📡 Import LiDAR Scan (.ply/.obj)
                            <input type="file" accept=".ply,.obj" onChange={handleLiDARImport} style={{ display: 'none' }} title={t('floorPlan.selectALidarScanFileTip')} />
                        </label>

                        {uploading && (
                            <div style={{ color: '#818cf8', fontSize: '0.85rem', marginTop: '10px' }}>
                                ⏳ Processing...
                            </div>
                        )}

                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', maxWidth: '380px', marginTop: '10px', lineHeight: '1.7', textAlign: 'left' }}>
                            <strong style={{ color: '#818cf8' }}>📐 Quick Start — Satellite Floor Plan:</strong>
                            <ol style={{ paddingLeft: '18px', margin: '6px 0 0 0' }}>
                                <li>{t('floorPlan.open')} <strong>{t('floorPlan.googleMaps')}</strong> {t('floorPlan.goToYourPlantAddress')}</li>
                                <li>{t('floorPlan.switchTo')} <strong>{t('floorPlan.satellite')}</strong> {t('floorPlan.view')}</li>
                                <li>{t('floorPlan.rightclick')} <strong>{t('floorPlan.measureDistance')}</strong> {t('floorPlan.clickPointsAroundTheBuilding')}</li>
                                <li>{t('floorPlan.use')} <strong>{t('floorPlan.snippingTool')}</strong> {t('floorPlan.winshiftsDragToSelectThe')}</li>
                                <li>{t('floorPlan.comeBackHereClick')} <strong>{t('floorPlan.pasteFromClipboard')}</strong> {t('floorPlan.cropIfNeeded')}</li>
                                <li>{t('floorPlan.use')}<strong>{t('floorPlan.calibrate')}</strong> + <strong>{t('floorPlan.blueprint')}</strong> {t('floorPlan.toFinishSetup')}</li>
                            </ol>
                        </div>
                    </div>
                )}
            </div>
            {ModalDialog}

            {/* Crop overlay — must be in early-return too so paste works on empty state */}
            {cropState && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.85)', zIndex: 10000,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                }}>
                    <div style={{
                        color: '#e2e8f0', fontSize: '1rem', fontWeight: 700, marginBottom: '12px',
                        display: 'flex', alignItems: 'center', gap: '10px',
                    }}>
                        ✂️ Crop & Adjust Image
                        <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#94a3b8' }}>
                            — Drag on the image to select the area you want, or click "Use Full Image" to skip
                        </span>
                    </div>

                    <div ref={cropContainerRef}
                        style={{
                            position: 'relative', maxWidth: '85vw', maxHeight: '70vh',
                            border: '2px solid rgba(99,102,241,0.4)', borderRadius: '8px', overflow: 'hidden',
                            cursor: cropState.crop ? 'default' : 'crosshair',
                        }}
                        onMouseDown={(e) => {
                            if (cropState.crop) return;
                            const rect = e.currentTarget.getBoundingClientRect();
                            const startX = (e.clientX - rect.left) / rect.width * 100;
                            const startY = (e.clientY - rect.top) / rect.height * 100;
                            setCropState(prev => ({
                                ...prev,
                                dragging: true, dragType: 'create', dragStart: { x: startX, y: startY },
                                crop: { x: startX, y: startY, w: 0, h: 0 }
                            }));
                        }}
                        onMouseMove={(e) => {
                            if (!cropState.dragging) return;
                            const rect = cropContainerRef.current.getBoundingClientRect();
                            const mx = Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width * 100));
                            const my = Math.max(0, Math.min(100, (e.clientY - rect.top) / rect.height * 100));
                            if (cropState.dragType === 'create') {
                                const { x: sx, y: sy } = cropState.dragStart;
                                setCropState(prev => ({
                                    ...prev,
                                    crop: { x: Math.min(sx, mx), y: Math.min(sy, my), w: Math.abs(mx - sx), h: Math.abs(my - sy) }
                                }));
                            } else if (cropState.dragType === 'move') {
                                const dx = mx - cropState.dragStart.x;
                                const dy = my - cropState.dragStart.y;
                                const c = cropState.originalCrop;
                                setCropState(prev => ({
                                    ...prev,
                                    crop: { x: Math.max(0, Math.min(100 - c.w, c.x + dx)), y: Math.max(0, Math.min(100 - c.h, c.y + dy)), w: c.w, h: c.h }
                                }));
                            } else {
                                const c = cropState.originalCrop;
                                const type = cropState.dragType;
                                let { x, y, w, h } = c;
                                if (type.includes('e')) { w = Math.max(5, mx - x); }
                                if (type.includes('w')) { w = Math.max(5, (x + w) - mx); x = Math.min(mx, x + w - 5); }
                                if (type.includes('s')) { h = Math.max(5, my - y); }
                                if (type.includes('n')) { h = Math.max(5, (y + h) - my); y = Math.min(my, y + h - 5); }
                                setCropState(prev => ({ ...prev, crop: { x, y, w, h } }));
                            }
                        }}
                        onMouseUp={() => { if (cropState.dragging) setCropState(prev => ({ ...prev, dragging: false })); }}
                    >
                        <img src={cropState.imageUrl} alt="Crop preview"
                            style={{ display: 'block', maxWidth: '85vw', maxHeight: '70vh', userSelect: 'none', pointerEvents: 'none' }}
                            draggable={false}
                        />
                        {cropState.crop && cropState.crop.w > 1 && (
                            <>
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${cropState.crop.y}%`, background: 'rgba(0,0,0,0.6)' }} />
                                <div style={{ position: 'absolute', top: `${cropState.crop.y + cropState.crop.h}%`, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)' }} />
                                <div style={{ position: 'absolute', top: `${cropState.crop.y}%`, left: 0, width: `${cropState.crop.x}%`, height: `${cropState.crop.h}%`, background: 'rgba(0,0,0,0.6)' }} />
                                <div style={{ position: 'absolute', top: `${cropState.crop.y}%`, left: `${cropState.crop.x + cropState.crop.w}%`, right: 0, height: `${cropState.crop.h}%`, background: 'rgba(0,0,0,0.6)' }} />
                                <div style={{
                                    position: 'absolute',
                                    left: `${cropState.crop.x}%`, top: `${cropState.crop.y}%`,
                                    width: `${cropState.crop.w}%`, height: `${cropState.crop.h}%`,
                                    border: '2px dashed #6366f1', boxSizing: 'border-box', pointerEvents: 'none',
                                }}>
                                    <div style={{ position: 'absolute', left: '33.3%', top: 0, bottom: 0, borderLeft: '1px dashed rgba(99,102,241,0.3)' }} />
                                    <div style={{ position: 'absolute', left: '66.6%', top: 0, bottom: 0, borderLeft: '1px dashed rgba(99,102,241,0.3)' }} />
                                    <div style={{ position: 'absolute', top: '33.3%', left: 0, right: 0, borderTop: '1px dashed rgba(99,102,241,0.3)' }} />
                                    <div style={{ position: 'absolute', top: '66.6%', left: 0, right: 0, borderTop: '1px dashed rgba(99,102,241,0.3)' }} />
                                </div>
                                {[
                                    { pos: 'nw', left: cropState.crop.x, top: cropState.crop.y, cursor: 'nw-resize' },
                                    { pos: 'ne', left: cropState.crop.x + cropState.crop.w, top: cropState.crop.y, cursor: 'ne-resize' },
                                    { pos: 'sw', left: cropState.crop.x, top: cropState.crop.y + cropState.crop.h, cursor: 'sw-resize' },
                                    { pos: 'se', left: cropState.crop.x + cropState.crop.w, top: cropState.crop.y + cropState.crop.h, cursor: 'se-resize' },
                                ].map(h => (
                                    <div key={h.pos}
                                        style={{
                                            position: 'absolute', left: `${h.left}%`, top: `${h.top}%`,
                                            width: '12px', height: '12px', marginLeft: '-6px', marginTop: '-6px',
                                            background: '#6366f1', border: '2px solid #c7d2fe', borderRadius: '2px',
                                            cursor: h.cursor, zIndex: 2,
                                        }}
                                        onMouseDown={(e) => {
                                            e.stopPropagation();
                                            setCropState(prev => ({ ...prev, dragging: true, dragType: h.pos, originalCrop: { ...prev.crop }, dragStart: { x: 0, y: 0 } }));
                                        }}
                                    />
                                ))}
                                <div style={{
                                    position: 'absolute',
                                    left: `${cropState.crop.x}%`, top: `${cropState.crop.y}%`,
                                    width: `${cropState.crop.w}%`, height: `${cropState.crop.h}%`,
                                    cursor: 'move', zIndex: 1,
                                }}
                                    onMouseDown={(e) => {
                                        e.stopPropagation();
                                        const rect = cropContainerRef.current.getBoundingClientRect();
                                        const startX = (e.clientX - rect.left) / rect.width * 100;
                                        const startY = (e.clientY - rect.top) / rect.height * 100;
                                        setCropState(prev => ({ ...prev, dragging: true, dragType: 'move', originalCrop: { ...prev.crop }, dragStart: { x: startX, y: startY } }));
                                    }}
                                />
                                <div style={{
                                    position: 'absolute',
                                    left: `${cropState.crop.x + cropState.crop.w / 2}%`,
                                    top: `${cropState.crop.y + cropState.crop.h}%`,
                                    transform: 'translate(-50%, 4px)',
                                    background: 'rgba(99,102,241,0.8)', color: '#fff', padding: '2px 8px',
                                    borderRadius: '4px', fontSize: '0.7rem', fontFamily: 'monospace', whiteSpace: 'nowrap',
                                    pointerEvents: 'none',
                                }}>
                                    {cropState.crop.w.toFixed(0)}% × {cropState.crop.h.toFixed(0)}%
                                </div>
                            </>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                        <button onClick={handleCropCancel} className="btn-nav" title={t('floorPlan.cancel', 'Cancel')}>✕ {t('floorPlan.cancel', 'Cancel')}</button>
                        <button onClick={() => { setCropState(prev => ({ ...prev, crop: null })); handleCropConfirm(); }} className="btn-save" title={t('floorPlan.cropStateTip', 'Crop State')}>{t('floorPlan.useFullImage', '📷 Use Full Image')}</button>
                        {cropState.crop && cropState.crop.w > 1 && (
                            <button onClick={() => setCropState(prev => ({ ...prev, crop: null }))} className="btn-edit" title={t('floorPlan.cropStateTip', 'Crop State')}>{t('floorPlan.resetCrop', '↺ Reset Crop')}</button>
                        )}
                        {cropState.crop && cropState.crop.w > 1 && (
                            <button onClick={handleCropConfirm} className="btn-primary" title={t('floorPlan.cropUploadTip', 'Crop & Upload')}>{t('floorPlan.cropUpload', '✅ Crop & Upload')}</button>
                        )}
                    </div>
                </div>
            )}
            </>
        );
    }

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', gap: '10px',
            height: 'calc(100vh - 140px)', minHeight: '600px',
            ...(isFullscreen ? {
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                height: '100vh', minHeight: '100vh',
                zIndex: 9999, background: 'var(--bg, #0a0a1a)',
                padding: '10px', overflow: 'auto',
            } : {})
        }}>
            {/* Plan Type Tabs — filter plans by category */}
            {plans.length > 1 && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap',
                    padding: '6px 12px', background: 'rgba(0,0,0,0.12)', borderRadius: '10px'
                }}>
                    {PLAN_TYPES.map(pt => {
                        const count = pt.id === 'all' ? plans.length : plans.filter(p => (p.planType || 'facility') === pt.id).length;
                        if (pt.id !== 'all' && count === 0) return null;
                        const isActive = planTypeFilter === pt.id;
                        return (
                            <button key={pt.id} onClick={() => {
                                setPlanTypeFilter(pt.id);
                                // Auto-select first plan in this category
                                const filtered = pt.id === 'all' ? plans : plans.filter(p => (p.planType || 'facility') === pt.id);
                                if (filtered.length > 0 && !filtered.find(p => p.id === activePlan?.id)) {
                                    setActivePlan(filtered[0]); setZoom(1); setPan({ x: 0, y: 0 });
                                }
                            }} style={{
                                padding: '4px 12px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: 700,
                                border: isActive ? `1px solid ${pt.color}` : '1px solid transparent',
                                background: isActive ? `${pt.color}18` : 'transparent',
                                color: isActive ? pt.color : '#64748b',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
                                transition: 'all 0.2s',
                            }} title={`Show ${pt.label} plans`}>
                                <span>{pt.emoji}</span> {t(`floorPlan.planType.${pt.id}`, pt.label)}
                                {count > 0 && (
                                    <span style={{ background: `${pt.color}22`, padding: '0 5px', borderRadius: '4px', fontSize: '0.6rem' }}>{count}</span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}


            {/* Building & Floor Selector — multi-floor navigation */}
            {(hasMultiFloor || hasMultiBuilding) && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
                    padding: '5px 12px', background: 'rgba(6,182,212,0.06)', borderRadius: '8px',
                    border: '1px solid rgba(6,182,212,0.15)',
                }}>
                    <Building size={14} color="#06b6d4" />
                    <span style={{ fontWeight: 700, fontSize: '0.7rem', color: '#06b6d4', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('floorPlan.text.buildingFloor', 'Building / Floor')}</span>

                    {/* Building selector */}
                    {hasMultiBuilding && (
                        <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                            <button onClick={() => { setActiveBuilding('all'); setActiveFloor('all'); }}
                                style={{
                                    padding: '3px 8px', borderRadius: '5px', fontSize: '0.65rem', fontWeight: 600,
                                    background: activeBuilding === 'all' ? 'rgba(6,182,212,0.2)' : 'rgba(255,255,255,0.04)',
                                    border: activeBuilding === 'all' ? '1px solid #06b6d4' : '1px solid rgba(255,255,255,0.08)',
                                    color: activeBuilding === 'all' ? '#06b6d4' : '#94a3b8', cursor: 'pointer',
                                }} title="Active Building">🏢 All</button>
                            {buildings.map(b => {
                                const count = filteredPlans.filter(p => p.buildingName === b).length;
                                return (
                                    <button key={b} onClick={() => { setActiveBuilding(b); setActiveFloor('all'); }}
                                        style={{
                                            padding: '3px 8px', borderRadius: '5px', fontSize: '0.65rem', fontWeight: 600,
                                            background: activeBuilding === b ? 'rgba(6,182,212,0.2)' : 'rgba(255,255,255,0.04)',
                                            border: activeBuilding === b ? '1px solid #06b6d4' : '1px solid rgba(255,255,255,0.08)',
                                            color: activeBuilding === b ? '#06b6d4' : '#94a3b8', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', gap: '3px',
                                        }} title={t('floorPlan.activeBuildingTip')}>
                                        🏢 {b}
                                        <span style={{ background: 'rgba(6,182,212,0.15)', padding: '0 4px', borderRadius: '3px', fontSize: '0.55rem' }}>{count}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Floor selector — vertical stack buttons */}
                    {(hasMultiFloor || availableFloors.length > 0) && (
                        <div style={{ display: 'flex', gap: '2px', alignItems: 'center', marginLeft: hasMultiBuilding ? '8px' : '0', borderLeft: hasMultiBuilding ? '1px solid rgba(255,255,255,0.08)' : 'none', paddingLeft: hasMultiBuilding ? '8px' : '0' }}>
                            <span style={{ fontSize: '0.6rem', color: '#64748b', marginRight: '3px' }}>{t('floorPlan.text.floor', 'Floor:')}</span>
                            <button onClick={() => setActiveFloor('all')}
                                style={{
                                    padding: '2px 6px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 600,
                                    background: activeFloor === 'all' ? 'rgba(6,182,212,0.2)' : 'rgba(255,255,255,0.04)',
                                    border: activeFloor === 'all' ? '1px solid #06b6d4' : '1px solid rgba(255,255,255,0.06)',
                                    color: activeFloor === 'all' ? '#06b6d4' : '#64748b', cursor: 'pointer',
                                }} title="All">{t('floorPlan.text.all', 'All')}</button>
                            {FLOOR_LEVELS.filter(fl => availableFloors.includes(fl.id))
                                .sort((a, b) => a.order - b.order)
                                .map(fl => {
                                    const count = (activeBuilding === 'all' ? filteredPlans : filteredPlans.filter(p => p.buildingName === activeBuilding))
                                        .filter(p => p.floorLevel === fl.id).length;
                                    return (
                                        <button key={fl.id} onClick={() => {
                                            setActiveFloor(fl.id);
                                            // Auto-select first plan on this floor
                                            const floorPlans = buildingFloorFiltered.filter(p => p.floorLevel === fl.id);
                                            if (floorPlans.length > 0 && !floorPlans.find(p => p.id === activePlan?.id)) {
                                                setActivePlan(floorPlans[0]); setZoom(1); setPan({ x: 0, y: 0 });
                                            }
                                        }}
                                            title={fl.longLabel}
                                            style={{
                                                padding: '2px 7px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 700,
                                                background: activeFloor === fl.id ? 'rgba(6,182,212,0.25)' : 'rgba(255,255,255,0.04)',
                                                border: activeFloor === fl.id ? '1px solid #06b6d4' : '1px solid rgba(255,255,255,0.06)',
                                                color: activeFloor === fl.id ? '#06b6d4' : '#64748b', cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', gap: '2px',
                                            }}>
                                            {fl.label}
                                            {count > 1 && <span style={{ fontSize: '0.5rem', opacity: 0.7 }}>({count})</span>}
                                        </button>
                                    );
                                })}
                        </div>
                    )}

                    {/* Quick stats */}
                    <span style={{ fontSize: '0.6rem', color: '#475569', marginLeft: 'auto' }}>
                        {buildingFloorFiltered.length} plan{buildingFloorFiltered.length !== 1 ? 's' : ''} shown
                    </span>
                </div>
            )}

            {/* Toolbar */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
                padding: '10px 15px', background: 'rgba(0,0,0,0.15)', borderRadius: '10px'
            }}>
                <MapPin size={18} color="#6366f1" />
                <span style={{ fontWeight: 700, color: '#fff', fontSize: '0.9rem' }}>{t('floor.plan.floorPlans')}</span>

                <select value={activePlan?.id || ''} onChange={e => {
                    const p = plans.find(pp => pp.id == e.target.value);
                    if (p) { setActivePlan(p); setZoom(1); setPan({ x: 0, y: 0 }); setViewMode(p.blueprintPath ? viewMode : 'satellite'); }
                }} style={{ padding: '5px 10px', fontSize: '0.8rem', borderRadius: '6px' }} title={t('floorPlan.selectAFloorPlanToTip')}>
                    {buildingFloorFiltered.map(p => {
                        const pt = PLAN_TYPES.find(t => t.id === (p.planType || 'facility'));
                        return <option key={p.id} value={p.id}>{pt?.emoji || ''} {p.name}{p.floorLevel ? ` [${(FLOOR_LEVELS.find(f => f.id === p.floorLevel) || {}).label || p.floorLevel}]` : ''}{p.buildingName ? ` — ${p.buildingName}` : ''}</option>;
                    })}
                </select>

                {/* Add Plan button */}
                {isAdmin && (
                    <div style={{ position: 'relative' }}>
                        <button onClick={() => setShowAddPlan(!showAddPlan)} style={{
                            padding: '4px 10px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700,
                            background: showAddPlan ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.08)',
                            border: '1px solid rgba(99,102,241,0.3)', color: '#818cf8', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '4px',
                        }} title={t('floorPlan.addAnotherFloorPlanToTip')}>
                            <Plus size={12} />{t('floorPlan.text.addPlan', 'Add Plan')}</button>
                        {showAddPlan && (
                            <div style={{
                                position: 'absolute', top: '110%', left: 0, zIndex: 100,
                                background: 'var(--card-bg, #1e1b4b)', border: '1px solid var(--glass-border)',
                                borderRadius: '12px', padding: '12px', minWidth: '220px',
                                boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
                            }}>
                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '8px', fontWeight: 600 }}>{t('floorPlan.text.addFloorPlan', 'Add Floor Plan')}</div>
                                <label style={{
                                    padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', width: '100%', marginBottom: '6px',
                                    background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
                                    color: '#818cf8', fontWeight: 600, fontSize: '0.78rem',
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                }}>
                                    <Upload size={14} />{t('floorPlan.text.uploadImage', 'Upload Image')}<input type="file" accept="image/*" onChange={(e) => { handleUpload(e); }} style={{ display: 'none' }} />
                                </label>
                                <label style={{
                                    padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', width: '100%', marginBottom: '6px',
                                    background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)',
                                    color: '#f59e0b', fontWeight: 600, fontSize: '0.78rem',
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                }}>
                                    📐 Import CAD (.dxf)
                                    <input type="file" accept=".dxf" onChange={(e) => { handleDXFImport(e); }} style={{ display: 'none' }} />
                                </label>
                                <label style={{
                                    padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', width: '100%', marginBottom: '6px',
                                    background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)',
                                    color: '#06b6d4', fontWeight: 600, fontSize: '0.78rem',
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                }}>
                                    📡 LiDAR Scan (.ply/.obj)
                                    <input type="file" accept=".ply,.obj" onChange={(e) => { handleLiDARImport(e); }} style={{ display: 'none' }} />
                                </label>
                                <button onClick={() => { handlePasteFromClipboard(); setShowAddPlan(false); }} style={{
                                    padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', width: '100%', marginBottom: '6px',
                                    background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)',
                                    color: '#22c55e', fontWeight: 600, fontSize: '0.78rem',
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                }} title={t('floorPlan.pasteFromClipboardTip')}>
                                    📋 Paste from Clipboard
                                </button>
                                <button onClick={() => { setShowLiDARScanner(true); setShowAddPlan(false); }} style={{
                                    padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', width: '100%',
                                    background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(168,85,247,0.15))',
                                    border: '1px solid rgba(99,102,241,0.3)',
                                    color: '#a78bfa', fontWeight: 700, fontSize: '0.78rem',
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                }}>
                                    📱 Scan Facility (iPhone LiDAR)
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Layer Type Filter Buttons */}
                <div style={{ display: 'flex', gap: '4px', marginLeft: '8px', flexWrap: 'wrap' }}>
                    {LAYER_TYPES.map(layer => {
                        const Icon = layer.icon;
                        const isActive = activeLayer === layer.id;
                        const filteredCount = layer.id === 'all' ? pins.length : pins.filter(p => (p.layerType || 'assets') === layer.id).length;
                        return (
                            <button 
                                key={layer.id}
                                onClick={() => setActiveLayer(layer.id)}
                                className="btn-primary"
                                title={`${t(`floorPlan.layer.${layer.id}`, layer.label)} layer${filteredCount > 0 ? ` (${filteredCount})` : ''}`}
                                style={{
                                    padding: '4px 10px',
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    background: isActive ? `${layer.color}22` : 'rgba(255,255,255,0.04)',
                                    border: isActive ? `1px solid ${layer.color}` : '1px solid rgba(255,255,255,0.08)',
                                    color: isActive ? layer.color : '#64748b',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.03em',
                                    transition: 'all 0.2s',
                                }}
                            >
                                <Icon size={12} />
                                {t(`floorPlan.layer.${layer.id}`, layer.label)}
                                {filteredCount > 0 && layer.id !== 'all' && (
                                    <span style={{ background: `${layer.color}33`, padding: '0 4px', borderRadius: '4px', fontSize: '0.6rem' }}>{filteredCount}</span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Print Floor Plan — always visible */}
                <button onClick={() => {
                    window.dispatchEvent(new CustomEvent('trier-print', {
                        detail: {
                            type: 'floor-plan',
                            data: {
                                plan: activePlan,
                                pins,
                                annotations,
                                zones,
                                viewMode,
                                assets,
                                activeLayer,
                                LAYER_TYPES,
                                ZONE_TYPES,
                            }
                        }
                    }));
                }} className="btn-primary" style={{
                    padding: '4px 10px', fontSize: '0.65rem', fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: '5px',
                    background: 'rgba(99,102,241,0.1)',
                    border: '1px solid rgba(99,102,241,0.3)',
                    color: '#818cf8',
                }} title="Print this floor plan">
                    <Printer size={12} />{t('floorPlan.text.print', 'Print')}</button>

                <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <button onClick={() => setZoom(z => Math.min(z + 0.25, 5))} className="btn-secondary btn-sm" title={t('floorPlan.zoomInOrUseMouseTip')}><ZoomIn size={14} /></button>
                    <span style={{ 
                        fontSize: '0.65rem', fontFamily: 'monospace', color: '#94a3b8', minWidth: '36px', textAlign: 'center',
                        cursor: 'pointer',
                    }} onClick={resetView} title={t('floorPlan.clickToReset100Tip')}>{Math.round(zoom * 100)}%</span>
                    <button onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))} className="btn-secondary btn-sm" title={t('floorPlan.zoomOutOrUseMouseTip')}><ZoomOut size={14} /></button>
                    <button onClick={resetView} className="btn-secondary btn-sm" title={t('floorPlan.resetZoomAndPositionTip')}><RotateCcw size={14} /></button>
                    {/* Fullscreen Toggle */}
                    <button onClick={() => setIsFullscreen(!isFullscreen)} className="btn-secondary btn-sm" title={isFullscreen ? 'Exit fullscreen' : 'Expand floor plan to fullscreen'} style={{
                        background: isFullscreen ? 'rgba(99,102,241,0.2)' : undefined,
                        border: isFullscreen ? '1px solid #6366f1' : undefined,
                        color: isFullscreen ? '#6366f1' : undefined,
                    }}>{isFullscreen ? '⊗' : '⛶'}</button>
                    {/* Print Floor Plan */}
                    <button onClick={() => {
                        window.dispatchEvent(new CustomEvent('trier-print', {
                            detail: {
                                type: 'floor-plan',
                                data: {
                                    plan: activePlan,
                                    pins,
                                    annotations,
                                    zones,
                                    viewMode,
                                    assets,
                                    activeLayer,
                                    LAYER_TYPES,
                                    ZONE_TYPES,
                                }
                            }
                        }));
                    }} className="btn-secondary btn-sm" title="Print this floor plan">
                        <Printer size={14} />
                    </button>
                    {/* 3D LiDAR Viewer — only shown when active plan has a LiDAR source */}
                    {activePlan?.lidarSourcePath && (
                        <button onClick={() => setShow3DViewer(true)} className="btn-primary" style={{
                            padding: '5px 12px', fontSize: '0.75rem', fontWeight: 700,
                            background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(6,182,212,0.2))',
                            border: '1px solid rgba(99,102,241,0.4)',
                            color: '#a78bfa', display: 'flex', alignItems: 'center', gap: '5px',
                        }} title="Open interactive 3D point cloud viewer for this LiDAR scan">
                            🔬 3D View
                        </button>
                    )}
                    {isAdmin && (
                        <>
                            <button onClick={() => { setEditMode(!editMode); setPlacingPin(false); }} className="btn-primary"
                                style={{
                                    padding: '5px 12px', fontSize: '0.75rem',
                                    background: editMode ? 'rgba(245,158,11,0.2)' : 'rgba(99,102,241,0.1)',
                                    border: `1px solid ${editMode ? '#f59e0b' : 'var(--glass-border)'}`,
                                    color: editMode ? '#f59e0b' : '#fff',
                                    display: 'flex', alignItems: 'center', gap: '5px'
                                }} title={editMode ? 'Exit edit mode' : 'Enter edit mode to place or remove pins'}>
                                {editMode ? <><Eye size={12} /> {t('floor.plan.done')}</> : <><Edit3 size={12} /> {t('floor.plan.edit')}</>}
                            </button>
                            <label style={{
                                padding: '5px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.75rem',
                                background: 'rgba(99,102,241,0.1)', border: '1px solid var(--glass-border)', color: '#fff',
                                display: 'flex', alignItems: 'center', gap: '5px'
                            }}>
                                <Upload size={12} /> {t('floor.plan.upload')}
                                <input type="file" accept="image/*" onChange={handleUpload} style={{ display: 'none' }} title={t('floorPlan.uploadANewFloorPlanTip')} />
                            </label>
                            <button onClick={convertToBlueprint} disabled={uploading} className="btn-primary" style={{
                                padding: '5px 12px', fontSize: '0.75rem',
                                background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.4)',
                                color: '#06b6d4', display: 'flex', alignItems: 'center', gap: '5px',
                                opacity: uploading ? 0.5 : 1,
                            }} title={t('floorPlan.convertCurrentSatelliteImageToTip')}>
                                {uploading ? '⏳' : '🔧'} {activePlan?.blueprintPath ? 'Re-gen Blueprint' : 'Blueprint'}
                            </button>
                            <button onClick={() => setShowPhotoAssembly(true)} className="btn-primary" style={{
                                padding: '5px 12px', fontSize: '0.75rem',
                                background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.4)',
                                color: '#a855f7', display: 'flex', alignItems: 'center', gap: '5px',
                            }} title={t('floorPlan.buildAFloorPlanFromTip')}>
                                📸 Photo Build
                            </button>

                            {/* Set Floor — assign building and floor level */}
                            {activePlan && (
                                <button onClick={() => handleAssignFloor(activePlan.id)} className="btn-primary" style={{
                                    padding: '5px 12px', fontSize: '0.75rem',
                                    background: activePlan?.buildingName ? 'rgba(6,182,212,0.2)' : 'rgba(6,182,212,0.08)',
                                    border: `1px solid ${activePlan?.buildingName ? 'rgba(6,182,212,0.5)' : 'rgba(6,182,212,0.2)'}`,
                                    color: '#06b6d4', display: 'flex', alignItems: 'center', gap: '5px',
                                }} title={t('floorPlan.assignThisPlanToATip')}>
                                    <Building size={12} /> {activePlan?.floorLevel ? `${(FLOOR_LEVELS.find(f => f.id === activePlan.floorLevel) || {}).label || activePlan.floorLevel}` : 'Set Floor'}
                                </button>
                            )}





                            {/* Emergency Mode */}
                            {activePlan && !emergencyMode && (
                                <button onClick={activateEmergencyMode} className="btn-primary" style={{
                                    padding: '5px 14px', fontSize: '0.75rem', fontWeight: 700,
                                    background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)',
                                    color: '#dc2626', display: 'flex', alignItems: 'center', gap: '5px',
                                }} title={t('floorPlan.activateEmergencyModeShowsAllTip')}>
                                    <AlertOctagon size={13} />{t('floorPlan.text.emergency', 'Emergency')}</button>
                            )}

                            {/* Sensor Overlay */}
                            {activePlan && (
                                <>
                                    <button onClick={() => { setShowSensors(!showSensors); if (!showSensors && activePlan) fetchSensorReadings(activePlan.id); }}
                                        className="btn-primary" style={{
                                            padding: '5px 12px', fontSize: '0.75rem',
                                            background: showSensors ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.08)',
                                            border: `1px solid ${showSensors ? 'rgba(239,68,68,0.5)' : 'rgba(239,68,68,0.2)'}`,
                                            color: '#ef4444', display: 'flex', alignItems: 'center', gap: '5px',
                                        }} title={t('floorPlan.toggleRealtimeSensorOverlayTip')}>
                                        <Thermometer size={12} /> Sensors
                                        {sensors.length > 0 && (
                                            <span style={{ background: 'rgba(239,68,68,0.2)', padding: '0 4px', borderRadius: '4px', fontSize: '0.55rem' }}>{sensors.length}</span>
                                        )}
                                    </button>
                                    {showSensors && (
                                        <button onClick={() => setShowHeatMap(!showHeatMap)}
                                            className="btn-primary" style={{
                                                padding: '5px 12px', fontSize: '0.75rem',
                                                background: showHeatMap ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.05)',
                                                border: `1px solid ${showHeatMap ? 'rgba(239,68,68,0.4)' : 'rgba(239,68,68,0.15)'}`,
                                                color: showHeatMap ? '#ef4444' : '#f87171',
                                                display: 'flex', alignItems: 'center', gap: '5px',
                                            }} title={t('floorPlan.toggleTemperatureHeatMapOverlayTip')}>
                                            <Activity size={12} />{t('floorPlan.text.heatMap', 'Heat Map')}</button>
                                    )}
                                </>
                            )}

                            {/* Mobile / GPS / AR */}
                            {activePlan && (
                                <>
                                    <button onClick={() => showYouAreHere ? stopGPSTracking() : startGPSTracking()}
                                        className="btn-primary" style={{
                                            padding: '5px 12px', fontSize: '0.75rem',
                                            background: showYouAreHere ? 'rgba(34,197,94,0.2)' : 'rgba(34,197,94,0.08)',
                                            border: `1px solid ${showYouAreHere ? 'rgba(34,197,94,0.5)' : 'rgba(34,197,94,0.2)'}`,
                                            color: '#22c55e', display: 'flex', alignItems: 'center', gap: '5px',
                                        }} title={showYouAreHere ? 'Stop GPS tracking' : 'Show your position on the floor plan (requires GPS)'}>
                                        <Navigation2 size={12} style={showYouAreHere ? { animation: 'pulse 2s infinite' } : {}} />
                                        {showYouAreHere ? 'GPS On' : 'GPS'}
                                    </button>
                                    <button onClick={handleARView} className="btn-primary" style={{
                                        padding: '5px 12px', fontSize: '0.75rem',
                                        background: 'rgba(236,72,153,0.08)', border: '1px solid rgba(236,72,153,0.2)',
                                        color: '#ec4899', display: 'flex', alignItems: 'center', gap: '5px',
                                    }} title={t('floorPlan.arOverlayViewAssetStatusTip')}>
                                        <Smartphone size={12} /> AR
                                    </button>
                                </>
                            )}

                            {/* Version History */}
                            {activePlan && (
                                <button onClick={() => setShowVersionHistory(!showVersionHistory)} className="btn-primary" style={{
                                    padding: '5px 12px', fontSize: '0.75rem',
                                    background: showVersionHistory ? 'rgba(168,85,247,0.2)' : 'rgba(168,85,247,0.08)',
                                    border: `1px solid ${showVersionHistory ? 'rgba(168,85,247,0.5)' : 'rgba(168,85,247,0.2)'}`,
                                    color: '#a855f7', display: 'flex', alignItems: 'center', gap: '5px',
                                }} title={t('floorPlan.viewVersionHistoryForThisTip')}>
                                    <Clock size={12} /> History
                                    {versions.length > 0 && (
                                        <span style={{ background: 'rgba(168,85,247,0.2)', padding: '0 4px', borderRadius: '4px', fontSize: '0.55rem' }}>{versions.length}</span>
                                    )}
                                </button>
                            )}

                            {/* Satellite ↔ Blueprint View Toggle */}
                            {activePlan?.blueprintPath && (
                                <button onClick={() => setViewMode(v => v === 'satellite' ? 'blueprint' : 'satellite')} className="btn-primary" style={{
                                    padding: '5px 12px', fontSize: '0.75rem',
                                    background: viewMode === 'blueprint' 
                                        ? 'rgba(99,102,241,0.2)' 
                                        : 'rgba(34,197,94,0.15)',
                                    border: `1px solid ${viewMode === 'blueprint' ? 'rgba(99,102,241,0.5)' : 'rgba(34,197,94,0.4)'}`,
                                    color: viewMode === 'blueprint' ? '#818cf8' : '#22c55e',
                                    display: 'flex', alignItems: 'center', gap: '5px',
                                    fontWeight: 700,
                                }} title={`Switch to ${viewMode === 'satellite' ? 'Blueprint' : 'Satellite'} view`}>
                                    {viewMode === 'satellite' ? '🛰️ Satellite' : '📐 Blueprint'}
                                </button>
                            )}
                            <button onClick={handleDeletePlan} className="btn-danger" style={{ padding: '5px 8px' }} title={t('floorPlan.deleteThisFloorPlanAndTip')}>
                                <Trash2 size={14} />
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Edit tools */}
            {editMode && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 15px',
                    background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)',
                    borderRadius: '8px', fontSize: '0.8rem'
                }}>
                    <Edit3 size={14} color="#f59e0b" />
                    <span style={{ color: '#f59e0b', fontWeight: 600 }}>{t('floor.plan.editMode')}</span>
                    {/* Layer type selector — first so user picks layer before pin details */}
                    <select value={activeLayer === 'all' ? 'assets' : activeLayer} onChange={e => setActiveLayer(e.target.value)}
                        style={{ padding: '4px 8px', fontSize: '0.75rem', maxWidth: '130px' }} title={t('floorPlan.layerTypeForThisPinTip')}>
                        {LAYER_TYPES.filter(l => l.id !== 'all').map(l => <option key={l.id} value={l.id}>{t(`floorPlan.layer.${l.id}`, l.label)}</option>)}
                    </select>
                    {/* Asset dropdown for Assets layer; label input for all other layers */}
                    {(activeLayer === 'all' || activeLayer === 'assets') ? (
                        <select value={selectedAsset} onChange={e => setSelectedAsset(e.target.value)}
                            style={{ padding: '4px 8px', fontSize: '0.75rem', flex: 1, maxWidth: '300px' }} title={t('floorPlan.selectAnAssetToPinTip')}>
                            <option value="">{t('floor.plan.selectAssetToPin')}</option>
                            {assets.map(a => <option key={a.ID} value={a.ID}>{a.ID} — {a.Description}</option>)}
                        </select>
                    ) : (
                        <input
                            type="text"
                            value={pinLabel}
                            onChange={e => setPinLabel(e.target.value)}
                            placeholder={`Label (e.g. "Fire Ext. #3", "Exit Door A")`}
                            style={{ padding: '4px 8px', fontSize: '0.75rem', flex: 1, maxWidth: '300px', borderRadius: '6px' }}
                            title={t('floorPlan.enterALabelForThisTip')}
                        />
                    )}
                    <button onClick={() => setPlacingPin(true)}
                        disabled={(activeLayer === 'all' || activeLayer === 'assets') ? !selectedAsset : false}
                        className="btn-primary" style={{
                            padding: '5px 12px', fontSize: '0.75rem',
                            background: placingPin ? '#f59e0b' : 'rgba(99,102,241,0.15)',
                            color: placingPin ? '#000' : '#fff',
                            display: 'flex', alignItems: 'center', gap: '5px'
                        }} title={placingPin ? 'Click on the image to place the pin' : 'Start placing a pin'}>
                        <Plus size={12} /> {placingPin ? 'Click on image...' : 'Place Pin'}
                    </button>
                </div>
            )}

            {/* Draw Tools Toolbar */}
            {editMode && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 15px',
                    background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.2)',
                    borderRadius: '8px', fontSize: '0.75rem'
                }}>
                    <span style={{ color: '#818cf8', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('floorPlan.text.drawTools', 'Draw Tools')}</span>

                    {/* Tool buttons */}
                    {[
                        { id: null, label: 'Select', icon: MousePointer, tip: 'Select & drag pins' },
                        { id: 'arrow', label: 'Arrow', icon: ArrowRight, tip: 'Draw evacuation arrows (2 clicks)' },
                        { id: 'route', label: 'Route', icon: Route, tip: 'Draw evacuation route path (multi-click, double-click to finish)' },
                        { id: 'measure', label: 'Measure', icon: Ruler, tip: 'Measure distance (2 clicks, enter distance)' },
                        { id: 'text', label: 'Text', icon: Type, tip: 'Place text annotation (1 click)' },
                        { id: 'zone', label: 'Zone', icon: Hexagon, tip: 'Draw zone polygon (multi-click, double-click to finish)' },
                    ].map(tool => {
                        const Icon = tool.icon;
                        const isActive = drawTool === tool.id;
                        return (
                            <button key={tool.id || 'select'} title={tool.tip}
                                onClick={() => { setDrawTool(tool.id); setDrawingPoints([]); setPlacingPin(false); }}
                                className="btn-primary"
                                style={{
                                    padding: '4px 10px', fontSize: '0.65rem', fontWeight: 600,
                                    display: 'flex', alignItems: 'center', gap: '4px',
                                    background: isActive ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
                                    border: isActive ? '1px solid #6366f1' : '1px solid rgba(255,255,255,0.08)',
                                    color: isActive ? '#818cf8' : '#94a3b8',
                                }}>
                                <Icon size={12} /> {tool.label}
                            </button>
                        );
                    })}

                    {/* Color selector */}
                    {drawTool && drawTool !== 'measure' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginLeft: '8px' }}>
                            <span style={{ color: '#64748b', fontSize: '0.65rem' }}>{t('floorPlan.text.color', 'Color:')}</span>
                            {['#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#ffffff'].map(c => (
                                <button key={c} title={c}
                                    onClick={() => setDrawColor(c)}
                                    style={{
                                        width: '18px', height: '18px', borderRadius: '50%',
                                        background: c, border: drawColor === c ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                                        cursor: 'pointer', padding: 0,
                                    }} />
                            ))}
                        </div>
                    )}

                    {/* Pre-fill label */}
                    {drawTool && (
                        <input type="text" value={drawLabel} onChange={e => setDrawLabel(e.target.value)}
                            placeholder={drawTool === 'arrow' ? 'Arrow label...' : drawTool === 'route' ? 'Route name...' : drawTool === 'text' ? 'Text...' : 'Distance...'}
                            style={{ padding: '3px 8px', fontSize: '0.7rem', borderRadius: '4px', maxWidth: '150px' }}
                            title={t('floorPlan.prefillLabelOptionalWillPromptTip')}
                        />
                    )}

                    {/* Calibrate scale button */}
                    <button onClick={handleCalibrateScale} className="btn-primary"
                        style={{
                            padding: '4px 10px', fontSize: '0.65rem', fontWeight: 600, marginLeft: '8px',
                            display: 'flex', alignItems: 'center', gap: '4px',
                            background: scaleRef && !scaleRef.pending ? 'rgba(34,197,94,0.15)' : 'rgba(6,182,212,0.15)',
                            border: `1px solid ${scaleRef && !scaleRef.pending ? 'rgba(34,197,94,0.4)' : 'rgba(6,182,212,0.4)'}`,
                            color: scaleRef && !scaleRef.pending ? '#22c55e' : '#06b6d4',
                        }}
                        title={scaleRef && !scaleRef.pending ? `Calibrated: ${scaleRef.pixelsPerUnit.toFixed(1)} px/${scaleRef.unit}` : 'Set a real-world scale for auto-measurements'}>
                        {scaleRef && !scaleRef.pending ? `✅ ${scaleRef.unit}` : '⚙ Calibrate'}
                    </button>

                    {/* Finish Route button (visible when drawing a route) */}
                    {drawTool === 'route' && drawingPoints.length >= 2 && (
                        <button onClick={finishRoute} className="btn-primary"
                            style={{ padding: '4px 10px', fontSize: '0.65rem', background: 'rgba(34,197,94,0.2)', border: '1px solid #22c55e', color: '#22c55e', fontWeight: 700 }} title={t('floorPlan.finishRouteTip')}>
                            ✓ Finish Route ({drawingPoints.length} pts)
                        </button>
                    )}

                    {/* Cancel drawing */}
                    {drawingPoints.length > 0 && (
                        <button title="Button action" onClick={() => setDrawingPoints([])} className="btn-primary"
                            style={{ padding: '4px 8px', fontSize: '0.65rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
                            ✕ Cancel
                        </button>
                    )}

                    
                    {/* Zone type selector — shown when zone tool active */}
                    {drawTool === 'zone' && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '6px' }}>
                            <span style={{ color: '#818cf8', fontWeight: 700, fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.05em', width: '100%' }}>{t('floorPlan.text.zoneType', 'Zone Type')}</span>
                            {Object.entries(ZONE_TYPES).map(([key, zt]) => (
                                <button key={key}
                                    onClick={() => setZoneType(key)}
                                    style={{
                                        padding: '2px 8px', fontSize: '0.6rem', fontWeight: 600,
                                        background: zoneType === key ? zt.color + '33' : 'rgba(255,255,255,0.04)',
                                        border: zoneType === key ? `1px solid ${zt.color}` : '1px solid rgba(255,255,255,0.08)',
                                        borderRadius: '4px', color: zoneType === key ? zt.color : '#94a3b8',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px',
                                    }} title={t('floorPlan.zoneTypeTip')}>
                                    <span>{zt.emoji}</span> {t(`floorPlan.zone.${key}`, zt.label)}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Annotation count */}
                    <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: '0.65rem' }}>
                        {annotations.length} annotation{annotations.length !== 1 ? 's' : ''} · {zones.length} zone{zones.length !== 1 ? 's' : ''}
                    </span>
                    {/* Print Floor Plan */}
                    <button onClick={() => {
                        window.dispatchEvent(new CustomEvent('trier-print', {
                            detail: {
                                type: 'floor-plan',
                                data: {
                                    plan: activePlan,
                                    pins,
                                    annotations,
                                    zones,
                                    viewMode,
                                    assets,
                                    activeLayer,
                                    LAYER_TYPES,
                                    ZONE_TYPES,
                                }
                            }
                        }));
                    }} className="btn-primary" style={{
                        padding: '4px 10px', fontSize: '0.65rem', fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: '4px',
                        background: 'rgba(99,102,241,0.1)',
                        border: '1px solid rgba(99,102,241,0.3)',
                        color: '#818cf8',
                    }} title="Print this floor plan with the Trier print engine">
                        <Printer size={12} />{t('floorPlan.text.print', 'Print')}</button>
                </div>
            )}

            {/* Floor Plan Image + Icon Palette */}
            <div style={{ display: 'flex', flex: 1, gap: '0', minHeight: 0, position: 'relative', overflow: 'hidden' }}>

                {/* ═══ Equipment Icon Palette Sidebar ═══ */}
                {editMode && showIconPalette && (
                    <div style={{
                        width: '200px', minWidth: '200px', overflow: 'auto',
                        background: 'rgba(15,23,42,0.95)', borderRight: '1px solid var(--glass-border)',
                        borderRadius: '12px 0 0 12px', padding: '10px 8px',
                        zIndex: 30, position: 'relative',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                            <span style={{ color: '#818cf8', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                <Package size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />{t('floorPlan.text.equipmentIcons', 'Equipment Icons')}</span>
                            <button onClick={() => setShowIconPalette(false)} style={{
                                background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '2px',
                            }} title={t('floorPlan.closePaletteTip')}><X size={14} /></button>
                        </div>
                        {Object.entries(getIconCategories()).map(([category, icons]) => (
                            <div key={category} style={{ marginBottom: '12px' }}>
                                <div style={{
                                    fontSize: '0.6rem', fontWeight: 700, color: '#64748b',
                                    textTransform: 'uppercase', letterSpacing: '0.06em',
                                    marginBottom: '6px', paddingLeft: '4px',
                                }}>{t(CATEGORY_LABEL_KEYS[category], category)}</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                                    {icons.map(eq => {
                                        const IconComp = eq.icon;

                                            // Emergency mode pin emphasis
                                            const isEmergencyRelevant = emergencyMode && ['fire', 'emergency', 'tornado', 'flood'].includes(layerType);
                                            const isNearestExitPin = emergencyMode && nearestExit?.id === pin.id;

                                        return (

                                            <div
                                                key={eq.id}
                                                onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    setDraggingIcon(eq.id);
                                                    // Create ghost DOM element directly on body
                                                    const ghost = document.createElement('div');
                                                    ghost.style.cssText = `position:fixed;left:${e.clientX - 18}px;top:${e.clientY - 18}px;pointer-events:none;z-index:999999;opacity:0.85;filter:drop-shadow(0 0 10px rgba(99,102,241,0.7));`;
                                                    // Clone the SVG from the clicked icon tile
                                                    const svgEl = e.currentTarget.querySelector('svg');
                                                    if (svgEl) {
                                                        const clone = svgEl.cloneNode(true);
                                                        clone.style.width = '36px';
                                                        clone.style.height = '36px';
                                                        ghost.appendChild(clone);
                                                    }
                                                    document.body.appendChild(ghost);
                                                    iconGhostRef.current = ghost;
                                                }}
                                                title={t(eq.labelKey, eq.label)}
                                                style={{
                                                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                                                    gap: '2px', padding: '6px 2px', borderRadius: '8px',
                                                    background: 'rgba(255,255,255,0.03)',
                                                    border: '1px solid rgba(255,255,255,0.06)',
                                                    cursor: 'grab', transition: 'all 0.15s',
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.background = 'rgba(99,102,241,0.15)';
                                                    e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)';
                                                    e.currentTarget.style.transform = 'scale(1.08)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                                                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                                                    e.currentTarget.style.transform = 'scale(1)';
                                                }}
                                            >
                                                <IconComp size={28} />
                                                <span style={{ fontSize: '0.55rem', color: '#94a3b8', textAlign: 'center', lineHeight: '1.1' }}>
                                                    {t(eq.labelKey, eq.label)}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Equipment Palette Toggle Tab (visible in edit mode) */}
                {editMode && !showIconPalette && (
                    <button 
                        onClick={() => setShowIconPalette(true)}
                        style={{
                            position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                            zIndex: 30, padding: '12px 4px', borderRadius: '0 8px 8px 0',
                            background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)',
                            borderLeft: 'none', color: '#818cf8', cursor: 'pointer',
                            writingMode: 'vertical-lr', fontSize: '0.65rem', fontWeight: 700,
                            display: 'flex', alignItems: 'center', gap: '4px',
                        }}
                        title={t('floorPlan.openEquipmentIconPaletteTip')}
                    >
                        <ChevronRight size={12} />
                        <Package size={12} />{t('floorPlan.text.icons', 'Icons')}</button>
                )}

                <div ref={containerRef}
                    style={{
                        flex: 1, overflow: 'hidden', position: 'relative',
                        borderRadius: showIconPalette && editMode ? '0 12px 12px 0' : '12px',
                        border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.3)',
                        cursor: draggingIcon ? 'copy' : (placingPin || drawTool) ? 'crosshair' : (isDragging ? 'grabbing' : 'grab'),
                    }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                >
                {activePlan && (
                    <div style={{
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                        transformOrigin: 'top left', position: 'relative', display: 'inline-block',
                        transition: isDragging ? 'none' : 'transform 0.2s ease'
                    }}>
                        <img ref={imgRef}
                            src={(() => {
                                // Pick image path based on viewMode
                                const path = (viewMode === 'blueprint' && activePlan.blueprintPath) 
                                    ? activePlan.blueprintPath 
                                    : activePlan.imagePath;
                                if (!path) return `/api/floorplans/${activePlan.id}/image`;
                                return path.startsWith('/') ? path : '/' + path;
                            })()}
                            alt={activePlan.name + (viewMode === 'blueprint' ? ' (Blueprint)' : '')}
                            onError={(e) => { e.target.src = ''; e.target.alt = 'Floor plan image not found'; }}
                            onClick={handleImageClick}
                            style={{ maxWidth: '100%', display: 'block', userSelect: 'none', pointerEvents: (placingPin || drawTool) ? 'auto' : 'none' }}
                            draggable={false}
                        />

                        {/* Pins — filtered by active layer */}
                        {pins.filter(pin => activeLayer === 'all' || (pin.layerType || 'assets') === activeLayer).map(pin => {
                            const layerType = pin.layerType || 'assets';
                            const layerDef = LAYER_TYPES.find(l => l.id === layerType) || LAYER_TYPES[1];
                            const LayerIcon = layerDef.icon;
                            const color = layerType === 'assets' ? getPinColor(pin) : layerDef.color;
                            const woCount = layerType === 'assets' ? getWOCount(pin) : 0;
                            return (
                                <div key={pin.id}
                                    style={{
                                        position: 'absolute', left: `${pin.xPercent || pin.x}%`, top: `${pin.yPercent || pin.y}%`,
                                        transform: 'translate(-50%, -100%)',
                                        cursor: editMode ? (draggingPin?.id === pin.id ? 'grabbing' : 'grab') : 'pointer',
                                        zIndex: (hoveredPin === pin.id || draggingPin?.id === pin.id) ? 50 : 10,
                                        transition: draggingPin?.id === pin.id ? 'none' : 'left 0.1s, top 0.1s',
                                        filter: draggingPin?.id === pin.id ? 'drop-shadow(0 0 8px rgba(99, 102, 241, 0.8))' : 'none',
                                    }}
                                    onMouseEnter={() => !draggingPin && setHoveredPin(pin.id)}
                                    onMouseLeave={() => !draggingPin && setHoveredPin(null)}
                                    onMouseDown={(e) => handlePinDragStart(e, pin)}
                                >
                                    {/* Pin Icon Rendering — equipment icon or generic */}
                                    {(() => {
                                        const eqIcon = pin.iconType ? getEquipmentIcon(pin.iconType) : null;
                                        if (eqIcon) {
                                            const EqComp = eqIcon.icon;
                                            return (
                                                <div style={{
                                                    background: 'rgba(15,23,42,0.85)',
                                                    border: `2px solid ${color}`,
                                                    borderRadius: '8px',
                                                    width: '36px',
                                                    height: '36px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    boxShadow: `0 0 10px ${color}44, 0 2px 8px rgba(0,0,0,0.5)`,
                                                }}>
                                                    <EqComp size={26} color={color} />
                                                </div>
                                            );
                                        }
                                        if (layerType === 'assets') {
                                            return <MapPin size={28} fill={color} color="#000" strokeWidth={1} />;
                                        }
                                        return (
                                            <div style={{
                                                background: `${color}33`,
                                                border: `2px solid ${color}`,
                                                borderRadius: '50%',
                                                width: '28px',
                                                height: '28px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                boxShadow: `0 0 8px ${color}55`,
                                            }}>
                                                <LayerIcon size={14} color={color} />
                                            </div>
                                        );
                                    })()}
                                    {woCount > 0 && (
                                        <div style={{
                                            position: 'absolute', top: '-6px', right: '-8px',
                                            background: '#ef4444', color: '#fff', fontSize: '0.6rem', fontWeight: 700,
                                            width: '16px', height: '16px', borderRadius: '50%',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>{woCount}</div>
                                    )}

                                    {/* Popup */}
                                    {hoveredPin === pin.id && (
                                        <div style={{
                                            position: 'absolute', bottom: '32px', left: '50%', transform: 'translateX(-50%)',
                                            background: 'rgba(15,23,42,0.95)', border: '1px solid var(--glass-border)',
                                            borderRadius: '10px', padding: '12px 16px', minWidth: '200px',
                                            backdropFilter: 'blur(8px)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                                            zIndex: 100, pointerEvents: 'auto'
                                        }} onClick={e => e.stopPropagation()}>
                                            {layerType === 'assets' ? (
                                                <>
                                                    <div style={{ fontWeight: 700, color, fontSize: '0.9rem', marginBottom: '4px' }}>
                                                        {pin.assetId || pin.asset_id}
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                                                        {pin.assetDescription || pin.asset_description || 'Equipment'}
                                                    </div>
                                                    {woCount > 0 && (
                                                        <div style={{ fontSize: '0.7rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <AlertTriangle size={10} /> {woCount} open WO{woCount > 1 ? 's' : ''}
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                                        <span style={{
                                                            background: `${layerDef.color}22`,
                                                            border: `1px solid ${layerDef.color}`,
                                                            color: layerDef.color,
                                                            padding: '1px 8px',
                                                            borderRadius: '4px',
                                                            fontSize: '0.65rem',
                                                            fontWeight: 700,
                                                            textTransform: 'uppercase',
                                                        }}>
                                                            {layerDef.label}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '0.85rem' }}>
                                                        {pin.label || pin.assetId || pin.asset_id || layerDef.label}
                                                    </div>
                                                </>
                                            )}

                                            {/* Distance to nearest pin */}
                                            {scaleRef && !scaleRef.pending && (() => {
                                                const nearest = findNearestPin(pin, filteredPins);
                                                if (!nearest) return null;
                                                return (
                                                    <div style={{ fontSize: '0.65rem', color: '#06b6d4', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px',
                                                        padding: '2px 6px', borderRadius: '4px', background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.15)' }}>
                                                        📏 {nearest.dist.real} {nearest.dist.unit} to nearest ({nearest.pin.label || nearest.pin.assetId || nearest.pin.asset_id || 'pin'})
                                                    </div>
                                                );
                                            })()}
                                            {editMode && (
                                                <button onClick={() => handleDeletePin(pin.id)} style={{
                                                    marginTop: '6px', padding: '3px 10px', borderRadius: '4px',
                                                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                                                    color: '#ef4444', fontSize: '0.65rem', cursor: 'pointer'
                                                }} title={t('floorPlan.removeThisPinFromTheTip')}>{t('floor.plan.removePin')}</button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}


                            {/* GPS "You Are Here" Dot */}
                            {showYouAreHere && userPosOnPlan && (
                                <div style={{
                                    position: 'absolute',
                                    left: `${userPosOnPlan.x}%`,
                                    top: `${userPosOnPlan.y}%`,
                                    transform: 'translate(-50%, -50%)',
                                    zIndex: 100,
                                    pointerEvents: 'none',
                                }}>
                                    {/* Pulsing outer ring */}
                                    <div style={{
                                        position: 'absolute', top: '50%', left: '50%',
                                        transform: 'translate(-50%, -50%)',
                                        width: '40px', height: '40px', borderRadius: '50%',
                                        background: 'rgba(59,130,246,0.15)',
                                        border: '2px solid rgba(59,130,246,0.3)',
                                        animation: 'pulse 2s ease-in-out infinite',
                                    }} />
                                    {/* Inner dot */}
                                    <div style={{
                                        width: '16px', height: '16px', borderRadius: '50%',
                                        background: '#3b82f6', border: '3px solid #fff',
                                        boxShadow: '0 0 10px rgba(59,130,246,0.6), 0 0 20px rgba(59,130,246,0.3)',
                                    }} />
                                    {/* Label */}
                                    <div style={{
                                        position: 'absolute', top: '-22px', left: '50%', transform: 'translateX(-50%)',
                                        background: 'rgba(59,130,246,0.9)', color: '#fff',
                                        padding: '1px 8px', borderRadius: '4px', fontSize: '0.55rem',
                                        fontWeight: 700, whiteSpace: 'nowrap',
                                    }}>📍 You</div>
                                </div>
                            )}


                            {/* Sensor Overlay — Live Data Pins */}
                            {showSensors && sensorReadings.map(s => {
                                const sType = SENSOR_TYPES[s.sensorType] || SENSOR_TYPES.temperature;
                                const statusColor = getSensorStatusColor(s.status);
                                return (
                                    <div key={`sensor-${s.id}`} style={{
                                        position: 'absolute',
                                        left: `${s.xPercent}%`, top: `${s.yPercent}%`,
                                        transform: 'translate(-50%, -50%)',
                                        zIndex: 30, pointerEvents: 'auto',
                                    }}>
                                        {/* Sensor badge */}
                                        <div style={{
                                            background: 'rgba(15,23,42,0.9)', backdropFilter: 'blur(6px)',
                                            border: `2px solid ${statusColor}`,
                                            borderRadius: '10px', padding: '4px 8px',
                                            display: 'flex', alignItems: 'center', gap: '5px',
                                            boxShadow: `0 0 12px ${statusColor}33`,
                                            cursor: 'pointer', whiteSpace: 'nowrap',
                                            animation: s.status === 'critical' ? 'pulse 1.5s infinite' : 'none',
                                        }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (editMode) handleDeleteSensor(s.id);
                                            }}
                                            title={editMode ? 'Click to remove sensor' : `${s.name}: ${s.value}${s.unit} (${s.status})`}
                                        >
                                            <span style={{ fontSize: '0.7rem' }}>{sType.emoji}</span>
                                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: statusColor, fontFamily: 'monospace' }}>
                                                {s.sensorType === 'motion' ? (s.value ? '●' : '○') : s.value}
                                            </span>
                                            <span style={{ fontSize: '0.5rem', color: '#94a3b8' }}>{s.unit}</span>
                                        </div>
                                        {/* Sensor name tooltip */}
                                        <div style={{
                                            position: 'absolute', top: '-16px', left: '50%', transform: 'translateX(-50%)',
                                            fontSize: '0.45rem', color: '#64748b', whiteSpace: 'nowrap', fontWeight: 600,
                                            background: 'rgba(0,0,0,0.5)', padding: '0 4px', borderRadius: '2px',
                                        }}>{s.name}</div>
                                    </div>
                                );
                            })}

                            {/* Heat Map Canvas Overlay */}
                            {showSensors && showHeatMap && sensorReadings.length > 0 && (
                                <canvas
                                    ref={(el) => {
                                        if (!el) return;
                                        const ctx = el.getContext('2d');
                                        const w = el.width = el.parentElement?.offsetWidth || 800;
                                        const h = el.height = el.parentElement?.offsetHeight || 600;
                                        ctx.clearRect(0, 0, w, h);

                                        // Draw heat spots for temperature sensors
                                        const tempSensors = sensorReadings.filter(s => s.sensorType === 'temperature' || s.sensorType === 'humidity');
                                        tempSensors.forEach(s => {
                                            const cx = (s.xPercent / 100) * w;
                                            const cy = (s.yPercent / 100) * h;
                                            const radius = Math.min(w, h) * 0.2;
                                            const normalized = Math.max(0, Math.min(1, (s.value - s.minThreshold) / (s.maxThreshold - s.minThreshold)));

                                            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
                                            if (s.sensorType === 'temperature') {
                                                const r = Math.round(normalized * 255);
                                                const b = Math.round((1 - normalized) * 255);
                                                grad.addColorStop(0, `rgba(${r}, ${Math.round(100 - normalized * 60)}, ${b}, 0.3)`);
                                                grad.addColorStop(0.7, `rgba(${r}, ${Math.round(100 - normalized * 60)}, ${b}, 0.08)`);
                                            } else {
                                                const g = Math.round(normalized * 200);
                                                grad.addColorStop(0, `rgba(6, ${100 + g}, 212, 0.25)`);
                                                grad.addColorStop(0.7, `rgba(6, ${100 + g}, 212, 0.05)`);
                                            }
                                            grad.addColorStop(1, 'rgba(0,0,0,0)');
                                            ctx.fillStyle = grad;
                                            ctx.fillRect(0, 0, w, h);
                                        });

                                        // Motion/occupancy zones
                                        const motionSensors = sensorReadings.filter(s => s.sensorType === 'motion' || s.sensorType === 'occupancy');
                                        motionSensors.forEach(s => {
                                            if ((s.sensorType === 'motion' && s.value) || (s.sensorType === 'occupancy' && s.value > 0)) {
                                                const cx = (s.xPercent / 100) * w;
                                                const cy = (s.yPercent / 100) * h;
                                                const intensity = s.sensorType === 'occupancy' ? Math.min(s.value / 15, 1) : 0.6;
                                                const radius = Math.min(w, h) * 0.12;
                                                const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
                                                grad.addColorStop(0, `rgba(168, 85, 247, ${intensity * 0.3})`);
                                                grad.addColorStop(1, 'rgba(0,0,0,0)');
                                                ctx.fillStyle = grad;
                                                ctx.fillRect(0, 0, w, h);
                                            }
                                        });
                                    }}
                                    style={{
                                        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                                        pointerEvents: 'none', zIndex: 2,
                                    }}
                                />
                            )}

                        {/* ═══ SVG Overlay — Annotations (arrows, routes, measurements, text) ═══ */}
                        {imgRef.current && (
                            <svg
                                style={{
                                    position: 'absolute', top: 0, left: 0,
                                    width: '100%', height: '100%',
                                    pointerEvents: (drawTool || zones.length > 0) ? 'auto' : 'none',
                                    zIndex: 5,
                                }}
                                viewBox={imgRef.current ? `0 0 ${imgRef.current.naturalWidth || 1000} ${imgRef.current.naturalHeight || 1000}` : '0 0 1000 1000'}
                                preserveAspectRatio="none"
                                onClick={handleSvgClick}
                                onDoubleClick={() => { if (drawTool === 'route') finishRoute(); if (drawTool === 'zone') finishZoneDrawing(); }}
                                onMouseDown={handleSvgMouseDown}
                                onMouseMove={handleSvgMouseMove}
                                onMouseUp={handleSvgMouseUp}
                            >
                                <defs>
                                    <marker id="arrowhead-red" markerWidth="12" markerHeight="8" refX="10" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                                        <path d="M0,0 L12,4 L0,8 Z" fill="#ef4444" />
                                    </marker>
                                    <marker id="arrowhead-green" markerWidth="12" markerHeight="8" refX="10" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                                        <path d="M0,0 L12,4 L0,8 Z" fill="#22c55e" />
                                    </marker>
                                    <marker id="arrowhead-yellow" markerWidth="12" markerHeight="8" refX="10" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                                        <path d="M0,0 L12,4 L0,8 Z" fill="#f59e0b" />
                                    </marker>
                                    <marker id="arrowhead-blue" markerWidth="12" markerHeight="8" refX="10" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                                        <path d="M0,0 L12,4 L0,8 Z" fill="#3b82f6" />
                                    </marker>
                                    <marker id="arrowhead-white" markerWidth="12" markerHeight="8" refX="10" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                                        <path d="M0,0 L12,4 L0,8 Z" fill="#ffffff" />
                                    </marker>
                                </defs>

                                

                                {/* Distance line to nearest pin on hover */}
                                {hoveredPin && scaleRef && !scaleRef.pending && (() => {
                                    const pin = filteredPins.find(p => p.id === hoveredPin);
                                    if (!pin) return null;
                                    const nearest = findNearestPin(pin, filteredPins);
                                    if (!nearest) return null;
                                    const imgW = imgRef.current?.naturalWidth || 1000;
                                    const imgH = imgRef.current?.naturalHeight || 1000;
                                    const x1 = (pin.xPercent / 100) * imgW;
                                    const y1 = (pin.yPercent / 100) * imgH;
                                    const x2 = (nearest.pin.xPercent / 100) * imgW;
                                    const y2 = (nearest.pin.yPercent / 100) * imgH;
                                    const midX = (x1 + x2) / 2;
                                    const midY = (y1 + y2) / 2;
                                    return (
                                        <g>
                                            <line x1={x1} y1={y1} x2={x2} y2={y2}
                                                stroke="#06b6d4" strokeWidth={1.5} strokeDasharray="6,4" opacity={0.6} />
                                            <rect x={midX - 30} y={midY - 8} width={60} height={16}
                                                rx={4} fill="rgba(0,0,0,0.8)" stroke="#06b6d4" strokeWidth={0.5} />
                                            <text x={midX} y={midY + 4}
                                                fill="#06b6d4" fontSize={9} fontWeight="700" textAnchor="middle"
                                            >{nearest.dist.real} {nearest.dist.unit}</text>
                                        </g>
                                    );
                                })()}

                                {/* ═══ Zone Polygons ═══ */}
                                {zones.map(zone => {
                                    const imgW = imgRef.current?.naturalWidth || 1000;
                                    const imgH = imgRef.current?.naturalHeight || 1000;
                                    const pts = zone.points.map(p => ({ x: (p.x / 100) * imgW, y: (p.y / 100) * imgH }));
                                    if (pts.length < 3) return null;
                                    const polyPoints = pts.map(p => `${p.x},${p.y}`).join(' ');
                                    const centroidX = pts.reduce((s, p) => s + p.x, 0) / pts.length;
                                    const centroidY = pts.reduce((s, p) => s + p.y, 0) / pts.length;
                                    const ztConfig = ZONE_TYPES[zone.zoneType] || ZONE_TYPES.production;
                                    const isHovered = hoveredZone === zone.id;
                                    const isSelected = selectedZone === zone.id;
                                    return (
                                        <g key={`zone-${zone.id}`}
                                            onMouseEnter={() => setHoveredZone(zone.id)}
                                            onMouseLeave={() => setHoveredZone(null)}
                                            onClick={(e) => { if (!drawTool) { e.stopPropagation(); setSelectedZone(isSelected ? null : zone.id); }}}
                                            style={{ cursor: drawTool ? 'crosshair' : 'pointer' }}
                                        >
                                            {/* Zone fill */}
                                            <polygon
                                                points={polyPoints}
                                                fill={zone.color || ztConfig.color}
                                                fillOpacity={isHovered || isSelected ? 0.4 : (zone.opacity || 0.25)}
                                                stroke={zone.color || ztConfig.color}
                                                strokeWidth={isSelected ? 3 : 2}
                                                strokeDasharray={zone.zoneType === 'hazard' ? '8,4' : zone.zoneType === 'restricted' ? '4,4' : 'none'}
                                                strokeOpacity={0.8}
                                            />
                                            {/* Zone label */}
                                            <rect
                                                x={centroidX - Math.max(40, zone.name.length * 4)} y={centroidY - 10}
                                                width={Math.max(80, zone.name.length * 8)} height={20}
                                                rx={4} fill="rgba(0,0,0,0.75)"
                                                stroke={zone.color || ztConfig.color} strokeWidth={1}
                                            />
                                            <text x={centroidX} y={centroidY + 4}
                                                fill="#fff" fontSize={11} fontWeight="700"
                                                textAnchor="middle"
                                            >{ztConfig.emoji} {zone.name}</text>
                                            {/* Hazard badge */}
                                            {zone.hazardClass && (
                                                <text x={centroidX} y={centroidY + 18}
                                                    fill="#f97316" fontSize={9} fontWeight="600"
                                                    textAnchor="middle"
                                                    style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.8)', strokeWidth: 2 }}
                                                >⚠ {zone.hazardClass}</text>
                                            )}
                                            {/* Area display */}
                                            {(() => {
                                                const imgW = imgRef.current?.naturalWidth || 1000;
                                                const imgH = imgRef.current?.naturalHeight || 1000;
                                                const areaResult = calcPolygonArea(zone.points, imgW, imgH);
                                                if (!areaResult.real && !isHovered && !isSelected) return null;
                                                const areaText = areaResult.real != null
                                                    ? `${areaResult.real.toFixed(0)} ${areaResult.unit}²`
                                                    : `${areaResult.pixels.toFixed(0)} px²`;
                                                return (
                                                    <text x={centroidX} y={centroidY + (zone.hazardClass ? 30 : 18)}
                                                        fill="#94a3b8" fontSize={9} fontWeight="600"
                                                        textAnchor="middle"
                                                        style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.7)', strokeWidth: 2 }}
                                                    >{areaText}</text>
                                                );
                                            })()}
                                            {/* Delete button on hover in edit mode */}
                                            {editMode && isHovered && (
                                                <text x={centroidX + Math.max(40, zone.name.length * 4) + 8} y={centroidY - 4}
                                                    fill="#ef4444" fontSize={14} fontWeight="700"
                                                    style={{ cursor: 'pointer' }}
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteZone(zone.id); }}
                                                >✕</text>
                                            )}
                                        </g>
                                    );
                                })}

                                {/* Render saved annotations */}
                                {annotations.filter(a => activeLayer === 'all' || a.layerType === activeLayer || a.layerType === 'emergency').map(ann => {
                                    const imgW = imgRef.current?.naturalWidth || 1000;
                                    const imgH = imgRef.current?.naturalHeight || 1000;
                                    const pts = ann.points.map(p => ({ x: (p.x / 100) * imgW, y: (p.y / 100) * imgH }));
                                    const isHovered = hoveredAnnotation === ann.id;

                                    if (ann.type === 'arrow' && pts.length >= 2) {
                                        const arrowColor = ann.color || '#ef4444';
                                        const markerId = `arrowhead-${arrowColor === '#ef4444' ? 'red' : arrowColor === '#22c55e' ? 'green' : arrowColor === '#f59e0b' ? 'yellow' : arrowColor === '#3b82f6' ? 'blue' : 'white'}`;
                                        return (
                                            <g key={ann.id}
                                                onMouseEnter={() => setHoveredAnnotation(ann.id)}
                                                onMouseLeave={() => setHoveredAnnotation(null)}
                                                style={{ cursor: editMode ? 'pointer' : 'default' }}
                                            >
                                                <line
                                                    x1={pts[0].x} y1={pts[0].y} x2={pts[1].x} y2={pts[1].y}
                                                    stroke={arrowColor} strokeWidth={ann.strokeWidth || 4}
                                                    markerEnd={`url(#${markerId})`}
                                                    opacity={isHovered ? 1 : 0.85}
                                                    strokeLinecap="round"
                                                />
                                                {/* Shadow for visibility */}
                                                <line
                                                    x1={pts[0].x} y1={pts[0].y} x2={pts[1].x} y2={pts[1].y}
                                                    stroke="rgba(0,0,0,0.3)" strokeWidth={(ann.strokeWidth || 4) + 3}
                                                    strokeLinecap="round"
                                                    style={{ pointerEvents: 'none' }}
                                                />
                                                <line
                                                    x1={pts[0].x} y1={pts[0].y} x2={pts[1].x} y2={pts[1].y}
                                                    stroke={arrowColor} strokeWidth={ann.strokeWidth || 4}
                                                    markerEnd={`url(#${markerId})`}
                                                    strokeLinecap="round"
                                                />
                                                {ann.label && (
                                                    <text
                                                        x={(pts[0].x + pts[1].x) / 2}
                                                        y={(pts[0].y + pts[1].y) / 2 - 8}
                                                        fill="#fff" fontSize={ann.fontSize || 14} fontWeight="700"
                                                        textAnchor="middle"
                                                        style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.7)', strokeWidth: 3 }}
                                                    >{ann.label}</text>
                                                )}
                                                {editMode && isHovered && (
                                                    <text
                                                        x={pts[1].x + 8} y={pts[1].y - 8}
                                                        fill="#ef4444" fontSize={12} fontWeight="700"
                                                        style={{ cursor: 'pointer' }}
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteAnnotation(ann.id); }}
                                                    >✕</text>
                                                )}
                                            </g>
                                        );
                                    }

                                    if (ann.type === 'route' && pts.length >= 2) {
                                        const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
                                        return (
                                            <g key={ann.id}
                                                onMouseEnter={() => setHoveredAnnotation(ann.id)}
                                                onMouseLeave={() => setHoveredAnnotation(null)}
                                            >
                                                <path d={pathD} fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth={(ann.strokeWidth || 3) + 3} strokeLinecap="round" strokeLinejoin="round" />
                                                <path d={pathD} fill="none" stroke={ann.color || '#22c55e'} strokeWidth={ann.strokeWidth || 3}
                                                    strokeDasharray="12,6" strokeLinecap="round" strokeLinejoin="round" />
                                                {/* Direction dots */}
                                                {pts.map((p, i) => (
                                                    <circle key={i} cx={p.x} cy={p.y} r={4} fill={ann.color || '#22c55e'} stroke="#000" strokeWidth={1} />
                                                ))}
                                                {ann.label && (
                                                    <text x={pts[0].x} y={pts[0].y - 10} fill="#fff" fontSize={ann.fontSize || 13} fontWeight="700"
                                                        textAnchor="start" style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.7)', strokeWidth: 3 }}
                                                    >{ann.label}</text>
                                                )}
                                                {editMode && isHovered && (
                                                    <text x={pts[pts.length - 1].x + 8} y={pts[pts.length - 1].y - 8} fill="#ef4444" fontSize={12} fontWeight="700"
                                                        style={{ cursor: 'pointer' }}
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteAnnotation(ann.id); }}
                                                    >✕</text>
                                                )}
                                            </g>
                                        );
                                    }

                                    if (ann.type === 'measure' && pts.length >= 2) {
                                        const dx = pts[1].x - pts[0].x;
                                        const dy = pts[1].y - pts[0].y;
                                        const midX = (pts[0].x + pts[1].x) / 2;
                                        const midY = (pts[0].y + pts[1].y) / 2;
                                        return (
                                            <g key={ann.id}
                                                onMouseEnter={() => setHoveredAnnotation(ann.id)}
                                                onMouseLeave={() => setHoveredAnnotation(null)}
                                            >
                                                <line x1={pts[0].x} y1={pts[0].y} x2={pts[1].x} y2={pts[1].y}
                                                    stroke="#f59e0b" strokeWidth={2} strokeDasharray="6,4" />
                                                {/* End caps */}
                                                <line x1={pts[0].x} y1={pts[0].y - 8} x2={pts[0].x} y2={pts[0].y + 8} stroke="#f59e0b" strokeWidth={2} />
                                                <line x1={pts[1].x} y1={pts[1].y - 8} x2={pts[1].x} y2={pts[1].y + 8} stroke="#f59e0b" strokeWidth={2} />
                                                {/* Distance label bg */}
                                                <rect x={midX - 30} y={midY - 12} width={60} height={20} rx={4}
                                                    fill="rgba(0,0,0,0.7)" stroke="#f59e0b" strokeWidth={1} />
                                                <text x={midX} y={midY + 2} fill="#f59e0b" fontSize={11} fontWeight="700"
                                                    textAnchor="middle">{ann.label || '?'}</text>
                                                {editMode && isHovered && (
                                                    <text x={pts[1].x + 8} y={pts[1].y - 8} fill="#ef4444" fontSize={12} fontWeight="700"
                                                        style={{ cursor: 'pointer' }}
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteAnnotation(ann.id); }}
                                                    >✕</text>
                                                )}
                                            </g>
                                        );
                                    }

                                    if (ann.type === 'text' && pts.length >= 1) {
                                        return (
                                            <g key={ann.id}
                                                onMouseEnter={() => setHoveredAnnotation(ann.id)}
                                                onMouseLeave={() => setHoveredAnnotation(null)}
                                            >
                                                <rect x={pts[0].x - 4} y={pts[0].y - (ann.fontSize || 14) - 2}
                                                    width={Math.max(60, (ann.label || '').length * 8)} height={(ann.fontSize || 14) + 8}
                                                    rx={4} fill="rgba(0,0,0,0.75)" stroke={ann.color || '#fff'} strokeWidth={1} />
                                                <text x={pts[0].x} y={pts[0].y} fill={ann.color || '#fff'}
                                                    fontSize={ann.fontSize || 14} fontWeight="600">{ann.label || 'Text'}</text>
                                                {editMode && isHovered && (
                                                    <text x={pts[0].x + Math.max(60, (ann.label || '').length * 8) + 4} y={pts[0].y - 6}
                                                        fill="#ef4444" fontSize={12} fontWeight="700"
                                                        style={{ cursor: 'pointer' }}
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteAnnotation(ann.id); }}
                                                    >✕</text>
                                                )}
                                            </g>
                                        );
                                    }
                                    return null;
                                })}

                                {/* Live drawing preview */}
                                {drawingPoints.length > 0 && drawTool && (() => {
                                    const imgW = imgRef.current?.naturalWidth || 1000;
                                    const imgH = imgRef.current?.naturalHeight || 1000;
                                    const pts = drawingPoints.map(p => ({ x: (p.x / 100) * imgW, y: (p.y / 100) * imgH }));
                                    if (drawTool === 'arrow' && pts.length >= 1) {
                                        return pts.length >= 2 ? (
                                            <line x1={pts[0].x} y1={pts[0].y} x2={pts[1].x} y2={pts[1].y}
                                                stroke={drawColor} strokeWidth={4} opacity={0.6}
                                                strokeDasharray="8,4" strokeLinecap="round" />
                                        ) : (
                                            <circle cx={pts[0].x} cy={pts[0].y} r={6} fill={drawColor} opacity={0.6} />
                                        );
                                    }
                                    if ((drawTool === 'route' || drawTool === 'measure') && pts.length >= 1) {
                                        const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
                                        return (
                                            <g>
                                                <path d={pathD} fill="none" stroke={drawTool === 'measure' ? '#f59e0b' : drawColor}
                                                    strokeWidth={3} strokeDasharray="8,4" opacity={0.6} />
                                                {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4} fill={drawTool === 'measure' ? '#f59e0b' : drawColor} opacity={0.7} />)}
                                            </g>
                                        );
                                    }

                                    if (drawTool === 'zone' && pts.length >= 1) {
                                        const polyPoints = pts.map(p => `${p.x},${p.y}`).join(' ');
                                        const ztColor = ZONE_TYPES[zoneType]?.color || '#3b82f6';
                                        return (
                                            <g>
                                                {pts.length >= 3 && (
                                                    <polygon points={polyPoints} fill={ztColor} fillOpacity={0.15}
                                                        stroke={ztColor} strokeWidth={2} strokeDasharray="6,3" />
                                                )}
                                                {pts.length >= 2 && pts.length < 3 && (
                                                    <polyline points={polyPoints} fill="none"
                                                        stroke={ztColor} strokeWidth={2} strokeDasharray="6,3" />
                                                )}
                                                {pts.map((p, i) => (
                                                    <circle key={i} cx={p.x} cy={p.y} r={5}
                                                        fill={ztColor} stroke="#fff" strokeWidth={1.5} opacity={0.8} />
                                                ))}
                                                {pts.length >= 3 && (
                                                    <text x={pts[0].x} y={pts[0].y - 12} fill={ztColor}
                                                        fontSize={11} fontWeight="700" textAnchor="middle"
                                                        style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.7)', strokeWidth: 3 }}
                                                    >{t('floorPlan.text.doubleClickToFinishZone', 'Double-click to finish zone')}</text>
                                                )}
                                            </g>
                                        );
                                    }

                                    if (drawTool === 'text' && pts.length >= 1) {
                                        return <circle cx={pts[0].x} cy={pts[0].y} r={6} fill="#fff" opacity={0.6} />;
                                    }
                                    return null;
                                })()}
                            </svg>
                        )}
                    </div>
                )}
            </div>

            </div>

            
            {/* Selected Zone Info Panel */}
            {selectedZone && (() => {
                const zone = zones.find(z => z.id === selectedZone);
                if (!zone) return null;
                const ztConfig = ZONE_TYPES[zone.zoneType] || ZONE_TYPES.production;
                return (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '12px',
                        padding: '6px 15px', fontSize: '0.7rem',
                        background: 'rgba(0,0,0,0.3)', borderTop: '1px solid rgba(255,255,255,0.06)',
                    }}>
                        <span style={{
                            padding: '2px 10px', borderRadius: '4px',
                            background: zone.color + '22', border: '1px solid ' + zone.color,
                            color: zone.color, fontWeight: 700,
                        }}>{ztConfig.emoji} {zone.name}</span>
                        <span style={{ color: '#94a3b8' }}>{t('floorPlan.text.type', 'Type:')}<b style={{ color: zone.color }}>{t(`floorPlan.zone.${zone.zoneType}`, ztConfig.label)}</b></span>
                        {zone.hazardClass && <span style={{ color: '#f97316' }}>⚠ {zone.hazardClass}</span>}
                        {zone.capacity > 0 && <span style={{ color: '#94a3b8' }}>Capacity: {zone.capacity}</span>}
                        {(() => {
                            const imgW = 1000; // approximate
                            const areaResult = calcPolygonArea(zone.points, imgW, imgW);
                            const areaText = areaResult.real != null
                                ? `${areaResult.real.toFixed(1)} ${areaResult.unit}²`  
                                : `${areaResult.pixels.toFixed(0)} px²`;
                            return <span style={{ color: '#64748b' }}>📐 Area: {areaText}</span>;
                        })()}

                        {editMode && (
                            <button onClick={() => handleDeleteZone(zone.id)}
                                style={{
                                    padding: '2px 8px', fontSize: '0.6rem', fontWeight: 700,
                                    background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
                                    borderRadius: '4px', color: '#ef4444', cursor: 'pointer', marginLeft: 'auto',
                                }} title="Delete Zone">🗑 Delete Zone</button>
                        )}
                        <button onClick={() => setSelectedZone(null)}
                            style={{
                                padding: '2px 6px', fontSize: '0.65rem',
                                background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '4px', color: '#94a3b8', cursor: 'pointer',
                            }} title={t('floorPlan.selectedZoneTip')}>✕</button>
                    </div>
                );
            })()}

            {/* Pin Legend */}
            <div style={{ display: 'flex', gap: '15px', padding: '6px 15px', fontSize: '0.7rem', color: 'var(--text-muted)', alignItems: 'center' }}>
                <span><MapPin size={10} fill="#10b981" style={{ marginRight: '4px' }} /> OK</span>
                <span><MapPin size={10} fill="#f59e0b" style={{ marginRight: '4px' }} /> {t('floor.plan.hasWo')}</span>
                <span><MapPin size={10} fill="#ef4444" style={{ marginRight: '4px' }} /> {t('floor.plan.critical')}</span>
                {activePlan?.buildingName && (
                    <span style={{ 
                        display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '10px',
                        padding: '2px 8px', borderRadius: '4px',
                        background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)',
                        color: '#06b6d4', fontSize: '0.65rem', fontWeight: 600,
                    }}>
                        🏢 {activePlan.buildingName}
                        {activePlan.floorLevel ? ` · ${(FLOOR_LEVELS.find(f => f.id === activePlan.floorLevel) || {}).longLabel || activePlan.floorLevel}` : ''}
                    </span>
                )}
                {scaleRef && !scaleRef.pending && (
                    <span style={{ 
                        display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '10px',
                        padding: '2px 8px', borderRadius: '4px',
                        background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)',
                        color: '#06b6d4', fontFamily: 'monospace', fontSize: '0.65rem',
                    }}>
                        📏 Scale: {scaleRef.pixelsPerUnit.toFixed(1)} px/{scaleRef.unit}
                        <span style={{ 
                            display: 'inline-block', width: '40px', height: '4px', 
                            borderLeft: '1px solid #06b6d4', borderRight: '1px solid #06b6d4',
                            borderBottom: '1px solid #06b6d4',
                        }} />
                    </span>
                )}
                <span style={{ marginLeft: 'auto' }}>{pins.length} pins placed</span>
            </div>

            {/* ═══ Styled Modal Dialog ═══ */}
            {ModalDialog}

            {/* ═══ CROP OVERLAY ═══ */}
            {cropState && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.85)', zIndex: 10000,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                }}>
                    {/* Header */}
                    <div style={{
                        color: '#e2e8f0', fontSize: '1rem', fontWeight: 700, marginBottom: '12px',
                        display: 'flex', alignItems: 'center', gap: '10px',
                    }}>
                        ✂️ Crop & Adjust Image
                        <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#94a3b8' }}>
                            — Drag on the image to select the area you want, or click "Use Full Image" to skip
                        </span>
                    </div>

                    {/* Crop canvas area */}
                    <div ref={cropContainerRef}
                        style={{
                            position: 'relative', maxWidth: '85vw', maxHeight: '70vh',
                            border: '2px solid rgba(99,102,241,0.4)', borderRadius: '8px', overflow: 'hidden',
                            cursor: cropState.crop ? 'default' : 'crosshair',
                        }}
                        onMouseDown={(e) => {
                            if (cropState.crop) return; // already has crop — use handles
                            const rect = e.currentTarget.getBoundingClientRect();
                            const startX = (e.clientX - rect.left) / rect.width * 100;
                            const startY = (e.clientY - rect.top) / rect.height * 100;
                            setCropState(prev => ({
                                ...prev,
                                dragging: true, dragType: 'create', dragStart: { x: startX, y: startY },
                                crop: { x: startX, y: startY, w: 0, h: 0 }
                            }));
                        }}
                        onMouseMove={(e) => {
                            if (!cropState.dragging) return;
                            const rect = cropContainerRef.current.getBoundingClientRect();
                            const mx = Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width * 100));
                            const my = Math.max(0, Math.min(100, (e.clientY - rect.top) / rect.height * 100));

                            if (cropState.dragType === 'create') {
                                const { x: sx, y: sy } = cropState.dragStart;
                                setCropState(prev => ({
                                    ...prev,
                                    crop: {
                                        x: Math.min(sx, mx), y: Math.min(sy, my),
                                        w: Math.abs(mx - sx), h: Math.abs(my - sy),
                                    }
                                }));
                            } else if (cropState.dragType === 'move') {
                                const dx = mx - cropState.dragStart.x;
                                const dy = my - cropState.dragStart.y;
                                const c = cropState.originalCrop;
                                setCropState(prev => ({
                                    ...prev,
                                    crop: {
                                        x: Math.max(0, Math.min(100 - c.w, c.x + dx)),
                                        y: Math.max(0, Math.min(100 - c.h, c.y + dy)),
                                        w: c.w, h: c.h,
                                    }
                                }));
                            } else {
                                // Handle corner drag
                                const c = cropState.originalCrop;
                                const type = cropState.dragType;
                                let { x, y, w, h } = c;
                                if (type.includes('e')) { w = Math.max(5, mx - x); }
                                if (type.includes('w')) { w = Math.max(5, (x + w) - mx); x = Math.min(mx, x + w - 5); }
                                if (type.includes('s')) { h = Math.max(5, my - y); }
                                if (type.includes('n')) { h = Math.max(5, (y + h) - my); y = Math.min(my, y + h - 5); }
                                setCropState(prev => ({ ...prev, crop: { x, y, w, h } }));
                            }
                        }}
                        onMouseUp={() => {
                            if (cropState.dragging) {
                                setCropState(prev => ({ ...prev, dragging: false }));
                            }
                        }}
                    >
                        <img src={cropState.imageUrl} alt="Crop preview"
                            style={{ display: 'block', maxWidth: '85vw', maxHeight: '70vh', userSelect: 'none', pointerEvents: 'none' }}
                            draggable={false}
                        />

                        {/* Crop overlay — darkens area OUTSIDE the crop rectangle */}
                        {cropState.crop && cropState.crop.w > 1 && (
                            <>
                                {/* Dark overlay on 4 sides */}
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${cropState.crop.y}%`, background: 'rgba(0,0,0,0.6)' }} />
                                <div style={{ position: 'absolute', top: `${cropState.crop.y + cropState.crop.h}%`, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)' }} />
                                <div style={{ position: 'absolute', top: `${cropState.crop.y}%`, left: 0, width: `${cropState.crop.x}%`, height: `${cropState.crop.h}%`, background: 'rgba(0,0,0,0.6)' }} />
                                <div style={{ position: 'absolute', top: `${cropState.crop.y}%`, left: `${cropState.crop.x + cropState.crop.w}%`, right: 0, height: `${cropState.crop.h}%`, background: 'rgba(0,0,0,0.6)' }} />

                                {/* Crop border */}
                                <div style={{
                                    position: 'absolute',
                                    left: `${cropState.crop.x}%`, top: `${cropState.crop.y}%`,
                                    width: `${cropState.crop.w}%`, height: `${cropState.crop.h}%`,
                                    border: '2px dashed #6366f1', boxSizing: 'border-box',
                                    pointerEvents: 'none',
                                }}>
                                    {/* Grid lines (rule of thirds) */}
                                    <div style={{ position: 'absolute', left: '33.3%', top: 0, bottom: 0, borderLeft: '1px dashed rgba(99,102,241,0.3)' }} />
                                    <div style={{ position: 'absolute', left: '66.6%', top: 0, bottom: 0, borderLeft: '1px dashed rgba(99,102,241,0.3)' }} />
                                    <div style={{ position: 'absolute', top: '33.3%', left: 0, right: 0, borderTop: '1px dashed rgba(99,102,241,0.3)' }} />
                                    <div style={{ position: 'absolute', top: '66.6%', left: 0, right: 0, borderTop: '1px dashed rgba(99,102,241,0.3)' }} />
                                </div>

                                {/* Corner handles */}
                                {[
                                    { pos: 'nw', left: cropState.crop.x, top: cropState.crop.y, cursor: 'nw-resize' },
                                    { pos: 'ne', left: cropState.crop.x + cropState.crop.w, top: cropState.crop.y, cursor: 'ne-resize' },
                                    { pos: 'sw', left: cropState.crop.x, top: cropState.crop.y + cropState.crop.h, cursor: 'sw-resize' },
                                    { pos: 'se', left: cropState.crop.x + cropState.crop.w, top: cropState.crop.y + cropState.crop.h, cursor: 'se-resize' },
                                ].map(h => (
                                    <div key={h.pos}
                                        style={{
                                            position: 'absolute', left: `${h.left}%`, top: `${h.top}%`,
                                            width: '12px', height: '12px', marginLeft: '-6px', marginTop: '-6px',
                                            background: '#6366f1', border: '2px solid #c7d2fe', borderRadius: '2px',
                                            cursor: h.cursor, zIndex: 2,
                                        }}
                                        onMouseDown={(e) => {
                                            e.stopPropagation();
                                            setCropState(prev => ({
                                                ...prev, dragging: true, dragType: h.pos,
                                                originalCrop: { ...prev.crop },
                                                dragStart: { x: 0, y: 0 },
                                            }));
                                        }}
                                    />
                                ))}

                                {/* Move handle (center of crop) */}
                                <div style={{
                                    position: 'absolute',
                                    left: `${cropState.crop.x}%`, top: `${cropState.crop.y}%`,
                                    width: `${cropState.crop.w}%`, height: `${cropState.crop.h}%`,
                                    cursor: 'move', zIndex: 1,
                                }}
                                    onMouseDown={(e) => {
                                        e.stopPropagation();
                                        const rect = cropContainerRef.current.getBoundingClientRect();
                                        const startX = (e.clientX - rect.left) / rect.width * 100;
                                        const startY = (e.clientY - rect.top) / rect.height * 100;
                                        setCropState(prev => ({
                                            ...prev, dragging: true, dragType: 'move',
                                            originalCrop: { ...prev.crop },
                                            dragStart: { x: startX, y: startY },
                                        }));
                                    }}
                                />

                                {/* Dimension label */}
                                <div style={{
                                    position: 'absolute',
                                    left: `${cropState.crop.x + cropState.crop.w / 2}%`,
                                    top: `${cropState.crop.y + cropState.crop.h}%`,
                                    transform: 'translate(-50%, 4px)',
                                    background: 'rgba(99,102,241,0.8)', color: '#fff', padding: '2px 8px',
                                    borderRadius: '4px', fontSize: '0.7rem', fontFamily: 'monospace', whiteSpace: 'nowrap',
                                    pointerEvents: 'none',
                                }}>
                                    {cropState.crop.w.toFixed(0)}% × {cropState.crop.h.toFixed(0)}%
                                </div>
                            </>
                        )}
                    </div>

                    {/* Buttons */}
                    <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                        <button onClick={handleCropCancel} style={{
                            padding: '10px 24px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8',
                        }} title={t('floorPlan.cancel', 'Cancel')}>✕ {t('floorPlan.cancel', 'Cancel')}</button>

                        <button onClick={() => { setCropState(prev => ({ ...prev, crop: null })); handleCropConfirm(); }} style={{
                            padding: '10px 24px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                            background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e',
                        }} title={t('floorPlan.cropStateTip', 'Crop State')}>{t('floorPlan.useFullImage', '📷 Use Full Image')}</button>

                        {cropState.crop && cropState.crop.w > 1 && (
                            <button onClick={() => setCropState(prev => ({ ...prev, crop: null }))} style={{
                                padding: '10px 24px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                                background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b',
                            }} title={t('floorPlan.cropStateTip', 'Crop State')}>{t('floorPlan.resetCrop', '↺ Reset Crop')}</button>
                        )}

                        {cropState.crop && cropState.crop.w > 1 && (
                            <button onClick={handleCropConfirm} style={{
                                padding: '10px 24px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer',
                                background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', color: '#818cf8',
                            }} title={t('floorPlan.cropUploadTip', 'Crop & Upload')}>{t('floorPlan.cropUpload', '✅ Crop & Upload')}</button>
                        )}
                    </div>
                </div>
            )}

            {/* Photo Assembly Overlay */}
            {showPhotoAssembly && (
                <PhotoAssembly
                    plantId={plantId}
                    headers={headers}
                    onSave={() => { setShowPhotoAssembly(false); fetchPlans(); }}
                    onCancel={() => setShowPhotoAssembly(false)}
                />
            )}

            {/* 3D LiDAR Viewer Overlay */}
            {show3DViewer && activePlan && (
                <LiDAR3DViewer
                    plyUrl={`/api/floorplans/${activePlan.id}/lidar-source`}
                    planName={activePlan.name}
                    onClose={() => setShow3DViewer(false)}
                />
            )}

            {/* LiDAR Scanner Overlay */}
            {showLiDARScanner && (
                <LiDARScanner
                    plantId={plantId}
                    headers={headers}
                    onComplete={() => { setShowLiDARScanner(false); fetchPlans(); }}
                    onClose={() => setShowLiDARScanner(false)}
                />
            )}
        </div>
    );
}
