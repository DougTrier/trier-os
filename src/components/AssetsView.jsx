// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * AssetsView.jsx — Asset Management View
 * =====================================
 * Full-featured equipment registry and lifecycle management interface.
 * One of the largest components in the application.
 *
 * -- API DEPENDENCIES ------------------------------------------
 *   GET  /api/assets                   — List paginated assets w/ search limits
 *   GET  /api/assets/:id               — Single asset detail query
 *   POST /api/assets                   — Create brand new asset profile
 *   PUT  /api/assets/:id               — Update asset fields inline
 *   POST /api/assets/:id/photos/ocr    — Hardware Camera OCR text extraction
 *   GET  /api/assets/:id/photos        — Fetch attachments and diagrams
 *   GET  /api/assets/:id/meter/history — Fetch run hours/counts
 *
 * -- KEY STATE -------------------------------------------------
 *   assets         — Paginated array of assets
 *   selectedAsset  — Currently open detail record model
 *   tab            — Active sub-tab rendered inside the detail modal
 *   cameraMode     — Invokes the custom native browser web-cam modal
 *   hierarchy      — Parent/child organizational arrays
 */
import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import SmartDialog from './SmartDialog';
import AssetTimeline from './AssetTimeline';
import TribalKnowledge from './TribalKnowledge';
import BomPanel from './BomPanel';
import DigitalTwinView from './DigitalTwinView';
import ScanEntryPoint from './ScanEntryPoint';
import { Search, RefreshCw, Plus, ChevronLeft, ChevronRight, X, PenTool, Printer, AlertTriangle, Eye, Network, ChevronDown, Info, CheckCircle, Activity, TrendingDown, TrendingUp, Trash2, Gauge, Camera, QrCode, Cpu, Cog, Scale } from 'lucide-react';
import SearchBar from './SearchBar';
import ActionBar from './ActionBar';
import { useTranslation } from '../i18n/index.jsx';
import { formatDate } from '../utils/formatDate';

const CameraCaptureModal = ({ onClose, onCapture, title }) => {
    const videoRef = React.useRef(null);
    const [cameraError, setCameraError] = React.useState(false);

    React.useEffect(() => {
        let stream = null;
        async function startCamera() {
            try {
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    setCameraError(true);
                    return;
                }
                stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } 
                });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
            } catch (err) {
                console.error("Camera access denied or unavail", err);
                setCameraError(true);
            }
        }
        startCamera();
        return () => {
            if (stream) stream.getTracks().forEach(t => t.stop());
        };
    }, []);

    const handleCapture = () => {
        if (!videoRef.current) return;
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
        canvas.toBlob(blob => {
            if (blob) {
                const file = new File([blob], "nameplate_capture.jpg", { type: "image/jpeg" });
                onCapture(file);
            }
            onClose();
        }, 'image/jpeg', 0.95);
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 99999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            {title && <h3 style={{ color: 'white', marginBottom: '15px' }}>{title}</h3>}
            
            {cameraError ? (
                <div style={{ padding: '30px', background: '#334155', borderRadius: '12px', textAlign: 'center', color: '#fff', maxWidth: '400px', margin: '20px' }}>
                    <div style={{ marginBottom: '15px' }}><Camera size={48} color="#94a3b8" /></div>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '1.2rem' }}>Camera Unavailable</h4>
                    <p style={{ margin: '0 0 25px 0', fontSize: '0.95rem', color: '#cbd5e1', lineHeight: '1.5' }}>
                        We couldn't connect to your camera. You may need to grant permissions, or you can securely upload an image file directly from your computer instead.
                    </p>
                    <button type="button" onClick={() => onClose(true)} style={{ padding: '12px 24px', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem', width: '100%' }}>
                        Browse Files Instead
                    </button>
                </div>
            ) : (
                <video ref={videoRef} autoPlay playsInline style={{ maxWidth: '95%', maxHeight: '70vh', borderRadius: '8px', background: '#000' }} />
            )}

            <div style={{ display: 'flex', gap: '20px', marginTop: '30px' }}>
                <button type="button" onClick={() => onClose(false)} style={{ padding: '12px 24px', background: '#475569', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '1rem' }}>Cancel</button>
                {!cameraError && (
                    <button type="button" onClick={handleCapture} style={{ padding: '12px 24px', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', gap: '8px', alignItems: 'center', fontSize: '1rem', fontWeight: 'bold' }}>
                        <Camera size={20} /> Snap Photo
                    </button>
                )}
            </div>
        </div>
    );
};



export default function AssetsView({ plantId, plantLabel }) {
    const { t } = useTranslation();
    const dialogInputRef = React.useRef('');
    const activeRole = localStorage.getItem('userRole');
    const [timelineAssetId, setTimelineAssetId] = useState(null);
    const [showDigitalTwin, setShowDigitalTwin] = useState(null); // { id, desc }
    const isCreator = localStorage.getItem('PF_USER_IS_CREATOR') === 'true';
    const hasFullAdminAccess = ['it_admin', 'creator'].includes(activeRole) || isCreator;
    const isAdminOrCreator = hasFullAdminAccess;

    const [assets, setAssets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCameraModal, setShowCameraModal] = useState(false);
    const [cameraMode, setCameraMode] = useState(''); // 'create' or 'view'
    const fileFallbackRef = React.useRef(null);
    const [meta, setMeta] = useState({ page: 1, limit: 50, total: 0, totalPages: 1 });
    const [selectedAsset, setSelectedAsset] = useState(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [editData, setEditData] = useState({});
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'tree'
    const [hierarchy, setHierarchy] = useState([]);
    const [expandedNodes, setExpandedNodes] = useState(new Set());
    const [showHelp, setShowHelp] = useState(false);
    const [dialog, setDialog] = useState(null);

    // Asset Photo Management
    const [assetPhotos, setAssetPhotos] = useState([]);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [lightboxPhoto, setLightboxPhoto] = useState(null);
    const [ocrResults, setOcrResults] = useState(null); // { serial: [], model: [], partNumber: [], rawText: '' }
    const [ocrScanning, setOcrScanning] = useState(false);

    // Meter Reading State (Feature 2)
    const [meterReading, setMeterReading] = useState('');
    const [meterHistory, setMeterHistory] = useState([]);
    const [submittingMeter, setSubmittingMeter] = useState(false);
    const [showMeterInput, setShowMeterInput] = useState(false);

    // Hierarchy Roll-Up State (Feature 3)
    const [rollupData, setRollupData] = useState(null);


    const isForeignPlant = !hasFullAdminAccess &&
        localStorage.getItem('nativePlantId') &&
        localStorage.getItem('selectedPlantId') !== localStorage.getItem('nativePlantId');
    const [showUnlockModal, setShowUnlockModal] = useState(false);
    const [unlockPassword, setUnlockPassword] = useState('');
    const [unlockError, setUnlockError] = useState('');
    const [unlockAction, setUnlockAction] = useState(null);

    // Lookups
    const [assetTypes, setAssetTypes] = useState([]);
    const [locations, setLocations] = useState([]);
    const [departments, setDepartments] = useState([]);

    // Logic for "Add New" in lookups
    const [isAddingNew, setIsAddingNew] = useState({ type: false, location: false, department: false });
    const [newLookupValue, setNewLookupValue] = useState({ type: '', location: '', department: '' });

    // Filters
    const [search, setSearch] = useState(() => {
        const pending = localStorage.getItem('PF_NAV_SEARCH');
        if (pending) {
            localStorage.removeItem('PF_NAV_SEARCH');
            return pending;
        }
        return '';
    });
    const [typeFilter, setTypeFilter] = useState('');
    const [stats, setStats] = useState({ totalCost: 0, totalDepreciatedValue: 0 });

    useEffect(() => {
        // Fetch lookup data and stats
        Promise.all([
            fetch('/api/lookups/asset-types').then(r => r.json()),
            fetch('/api/lookups/locations').then(r => r.json()),
            fetch('/api/lookups/departments').then(r => r.json()),
            fetch('/api/assets/stats').then(r => r.json())
        ]).then(([typeData, locData, deptData, statsData]) => {
            setAssetTypes(Array.isArray(typeData) ? typeData : []);
            setLocations(Array.isArray(locData) ? locData : []);
            setDepartments(Array.isArray(deptData) ? deptData : []);
            setStats(statsData || { totalCost: 0, totalDepreciatedValue: 0 });
        }).catch(err => {
            console.error('Error fetching lookups/stats:', err);
        });
    }, []);

    const fetchAssets = useCallback(async (pageToLoad = meta.page) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: pageToLoad,
                limit: meta.limit,
                search,
                type: typeFilter
            });
            const activePlant = localStorage.getItem('selectedPlantId') || plantId || 'Demo_Plant_1';
            const res = await fetch(`/api/assets?${params}`, {
                headers: { 'x-plant-id': activePlant }
            });
            const data = await res.json();

            setAssets(data.data || []);
            setMeta(data.pagination || data.meta || { page: 1, limit: 50, total: 0, totalPages: 1 });
        } catch (err) {
            console.error('Failed to query assets:', err);
        } finally {
            setLoading(false);
        }
    }, [search, typeFilter, meta.limit, plantId]);
    
    // Logic for Asset Health Metrics (Seeded by Asset ID)
    const getHealthMetrics = (asset) => {
        if (!asset || !asset.ID) return null;
        
        // Simple deterministic hash of the Asset ID
        const seed = asset.ID.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const pseudoRand = (offset) => {
            const val = ((seed * (9301 + offset) + 49297) % 233280) / 233280;
            return val;
        };

        const reliability = 86 + (pseudoRand(1) * 13.5); // 86% to 99.5%
        const mtbf = 80 + Math.floor(pseudoRand(2) * 800); // 80h to 880h
        const cost = 150 + Math.floor(pseudoRand(3) * 4500); // $150 to $4650
        const isUp = pseudoRand(4) > 0.45;

        let triage = 'STABLE';
        let triageColor = '#10b981';
        if (reliability < 89) {
            triage = 'CRITICAL';
            triageColor = '#ef4444';
        } else if (reliability < 93) {
            triage = 'AT RISK';
            triageColor = '#f59e0b';
        }

        return {
            reliability: reliability.toFixed(1) + '%',
            reliabilityColor: reliability > 94 ? '#10b981' : (reliability > 90 ? '#f59e0b' : '#ef4444'),
            mtbf: mtbf + 'h',
            cost: '$' + cost.toLocaleString(),
            triage,
            triageColor,
            isUp
        };
    };

    const fetchHierarchy = useCallback(async () => {
        setLoading(true);
        try {
            const activePlant = localStorage.getItem('selectedPlantId') || plantId || 'Demo_Plant_1';
            const res = await fetch('/api/v2/assets/hierarchy', { headers: { 'x-plant-id': activePlant } });
            const data = await res.json();
            
            // Build actual tree structure
            const buildTree = (items, parentId = null) => {
                return items
                    .filter(item => {
                        const isChild = item.ParentID === parentId || (parentId === null && (!item.ParentID || !items.some(p => p.ID === item.ParentID)));
                        return isChild;
                    })
                    .map(item => ({
                        ...item,
                        children: buildTree(items, item.ID)
                    }));
            };

            const tree = buildTree(data);
            setHierarchy(tree);
        } catch (err) {
            console.error('Failed to load hierarchy:', err);
        } finally {
            setLoading(false);
        }
    }, [plantId]);

    useEffect(() => {
        if (viewMode === 'list') {
            fetchAssets(1);
        } else {
            fetchHierarchy();
        }
    }, [search, typeFilter, fetchAssets, fetchHierarchy, viewMode, plantId]);

    // PF_NAV: Specialized Auto-Open Logic
    useEffect(() => {
        const pendingViewId = localStorage.getItem('PF_NAV_VIEW');
        if (pendingViewId && assets.length > 0) {
            const found = assets.find(a => String(a.ID) === String(pendingViewId));
            if (found) {
                handleView(found.ID, found.plantId);
                localStorage.removeItem('PF_NAV_VIEW');
            }
        }
    }, [assets]);

    const handleNew = () => {
        if (isForeignPlant && !window.__TRIER_OVERRIDE_PASS__) {
            setUnlockAction('new');
            setShowUnlockModal(true);
            return;
        }

        const blankAsset = {
            ID: '',
            Description: '',
            AssetType: '',
            LocationID: '',
            Serial: '',
            Model: '',
            Active: true,
            CriticalityClass: 'C',
            InstDate: new Date().toISOString().split('T')[0],
            PurchDate: new Date().toISOString().split('T')[0],
            Manufacturer: '',
            VendorID: '',
            DeptID: '',
            Comment: '',
            Quantity: 1,
            _workOrders: [],
            _parts: [],
            _schedules: []
        };
        setSelectedAsset(blankAsset);
        setEditData(blankAsset);
        setIsEditing(true);
        setIsCreating(true);
    };

    const handleView = async (id, assetPlantId) => {
        setLoadingDetails(true);
        setIsEditing(false);
        setIsCreating(false);
        // Resolve the correct plant: prefer the asset's own plantId (populated in all_sites list),
        // then the UI-selected plant, then fall back to the server default.
        const resolvedPlant = assetPlantId || localStorage.getItem('selectedPlantId') || 'Demo_Plant_1';
        const plantHeaders = { 'x-plant-id': resolvedPlant };
        try {
            const res = await fetch(`/api/assets/${encodeURIComponent(id)}`, { headers: plantHeaders });
            if (!res.ok) {
                console.error(`[AssetsView] handleView: asset ${id} not found in plant ${resolvedPlant} (${res.status})`);
                setLoadingDetails(false);
                return;
            }
            const data = await res.json();
            setSelectedAsset(data);
            setEditData(data);
            // Fetch asset photos
            fetchAssetPhotos(id, plantHeaders);
            // Fetch meter history if asset has a meter
            if (data.MeterType) {
                fetchMeterHistory(id);
            } else {
                setMeterHistory([]);
            }
            // Fetch hierarchy roll-up stats (Feature 3)
            setRollupData(null);
            fetch(`/api/v2/assets/${encodeURIComponent(id)}/rollup`, { headers: plantHeaders })
                .then(r => r.json())
                .then(rollup => { if (rollup && !rollup.error) setRollupData(rollup); })
                .catch(e => console.warn('[AssetsView] fetch error:', e));
        } catch (err) {
            console.error('Failed to load asset details:', err);
        } finally {
            setLoadingDetails(false);
        }
    };

    const fetchAssetPhotos = async (assetId, extraHeaders) => {
        try {
            const res = await fetch(`/api/assets/${encodeURIComponent(assetId)}/photos`, { headers: extraHeaders });
            const data = await res.json();
            setAssetPhotos(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Failed to fetch asset photos:', err);
            setAssetPhotos([]);
        }
    };

    const fetchMeterHistory = async (assetId) => {
        try {
            const res = await fetch(`/api/assets/${encodeURIComponent(assetId)}/meter/history`);
            const data = await res.json();
            setMeterHistory(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Failed to fetch meter history:', err);
            setMeterHistory([]);
        }
    };

    const handlePreCreateOcrUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploadingPhoto(true);
        window.trierToast?.info('Scanning Nameplate (OCR)...');
        try {
            const formData = new FormData();
            formData.append('photo', file);
            formData.append('type', 'asset');

            const res = await fetch('/api/ocr/scan', {
                method: 'POST',
                headers: {
                    'x-plant-id': localStorage.getItem('selectedPlantId')
                },
                body: formData
            });

            if (res.ok) {
                const data = await res.json();
                
                const updates = {};
                let foundPart = null;

                if (data.asset?.serial) updates.Serial = data.asset.serial;
                if (data.asset?.model) updates.Model = data.asset.model;
                if (data.asset?.partNumber) updates.PartNumber = data.asset.partNumber;

                // Attempt to enrich from the master catalog if a PartNumber or Model is found
                const lookupTerm = data.asset?.partNumber || data.asset?.model;
                if (lookupTerm) {
                    try {
                        const partRes = await fetch(`/api/parts?search=${encodeURIComponent(lookupTerm)}&limit=1`, {
                            headers: {
                                'x-plant-id': localStorage.getItem('selectedPlantId')
                            }
                        });
                        if (partRes.ok) {
                            const partData = await partRes.json();
                            const partsList = partData.data || partData;
                            if (partsList && partsList.length > 0) {
                                foundPart = partsList[0];
                                updates.PartNumber = foundPart.ID || foundPart.PartID || updates.PartNumber;
                                if (foundPart.Manufacturer) updates.Manufacturer = foundPart.Manufacturer;
                                if (foundPart.VendorID) updates.VendorID = foundPart.VendorID;
                                if (foundPart.Description && !editData.Description) {
                                    updates.Description = foundPart.Description;
                                }
                                window.trierToast?.success(`Enriched specs from Master Catalog: ${foundPart.Description}`);
                            }
                        }
                    } catch (enrichErr) {
                        console.warn('Enrichment failed:', enrichErr);
                    }
                }

                if (!foundPart && data.asset?.description && (!editData || !editData.Description)) {
                    updates.Description = data.asset.description;
                }
                
                if (data.asset?.manufacturer && (!updates.Manufacturer && (!editData || !editData.Manufacturer))) {
                    updates.Manufacturer = data.asset.manufacturer;
                }

                setEditData(prev => ({ ...prev, ...updates }));
                window.trierToast?.success('Nameplate OCR processed.');
            } else {
                window.trierToast?.error('Failed to run OCR. Try again.');
            }
        } catch (err) {
            console.error('OCR scan error:', err);
            window.trierToast?.error('Network error during OCR');
        } finally {
            setUploadingPhoto(false);
            e.target.value = null; // reset input
        }
    };

    const handlePhotoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file || !selectedAsset) return;
        
        setUploadingPhoto(true);
        try {
            const formData = new FormData();
            formData.append('photo', file);
            
            const res = await fetch(`/api/assets/${encodeURIComponent(selectedAsset.ID)}/photos`, {
                method: 'POST',
                body: formData
            });
            
            if (res.ok) {
                const uploadData = await res.json();
                fetchAssetPhotos(selectedAsset.ID);
                
                // Auto-trigger OCR scan on the uploaded photo
                if (uploadData.photo?.filename) {
                    runOcrScan(selectedAsset.ID, uploadData.photo.filename);
                }
            } else {
                const data = await res.json();
                window.trierToast?.error(data.error || 'Failed to upload photo');
            }
        } catch (err) {
            console.error('Photo upload error:', err);
            window.trierToast?.error('Failed to upload photo');
        } finally {
            setUploadingPhoto(false);
            e.target.value = ''; // Reset file input
        }
    };

    const runOcrScan = async (assetId, filename) => {
        setOcrScanning(true);
        try {
            const res = await fetch(`/api/assets/${encodeURIComponent(assetId)}/photos/${filename}/ocr`, {
                method: 'POST'
            });
            if (res.ok) {
                const data = await res.json();
                const totalFinds = (data.serial?.length || 0) + (data.model?.length || 0) + (data.partNumber?.length || 0);
                if (totalFinds > 0) {
                    setOcrResults(data);
                }
            }
        } catch (err) {
            console.error('OCR scan error:', err);
        } finally {
            setOcrScanning(false);
        }
    };

    const applyOcrValues = async (values) => {
        // values = { Serial: 'xxx', Model: 'yyy' }
        if (!selectedAsset || Object.keys(values).length === 0) return;
        try {
            const res = await fetch(`/api/assets/${encodeURIComponent(selectedAsset.ID)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(values)
            });
            if (res.ok) {
                // Refresh the asset detail
                const refreshed = await fetch(`/api/assets/${encodeURIComponent(selectedAsset.ID)}`);
                const data = await refreshed.json();
                setSelectedAsset(data);
                setEditData(data);
            }
        } catch (err) {
            console.error('Failed to apply OCR values:', err);
        }
        setOcrResults(null);
    };

    const handlePhotoDelete = async (filename) => {
        if (!await confirm('Delete this photo?')) return;
        try {
            const res = await fetch(`/api/assets/${encodeURIComponent(selectedAsset.ID)}/photos/${filename}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                fetchAssetPhotos(selectedAsset.ID);
                if (lightboxPhoto?.filename === filename) setLightboxPhoto(null);
            }
        } catch (err) {
            console.error('Photo delete error:', err);
        }
    };

    const handleSave = async () => {
        try {
            // Remove linked array structures that aren't on the backend schema
            const { _parts, _workOrders, _schedules, ...payload } = editData;

            if (isCreating && !payload.ID) {
                window.trierToast?.warn('Asset ID is required');
                return;
            }

            // Verification Prompt for Corporate/IT users
            if (isCreating && isAdminOrCreator) {
                setDialog({
                    type: 'question',
                    title: 'Multi-Site Verification',
                    message: `You are about to add a NEW asset to the [${plantLabel}] project database. Is this correct?`,
                    confirmLabel: 'Yes, Proceed',
                    onConfirm: () => performSave(payload),
                    onCancel: () => setDialog(null)
                });
                return;
            }

            await performSave(payload);
        } catch (err) {
            console.error('Failed to update asset:', err);
        }
    };

    const performSave = async (payload) => {
        setDialog(null);
        try {
            const url = isCreating ? '/api/assets' : `/api/assets/${encodeURIComponent(payload.ID)}`;
            const method = isCreating ? 'POST' : 'PUT';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                if (isCreating) {
                    fetchAssets(1); // Refresh the list to show the new asset
                } else {
                    // Update the parent list in-place for efficiency
                    setAssets(assets.map(a => a.ID === payload.ID ? { ...a, ...payload } : a));
                }

                setSelectedAsset(prev => ({ ...prev, ...payload }));
                setIsEditing(false);
                setIsCreating(false);
            } else {
                const errData = await res.json();
                window.trierToast?.error(errData.error || 'Failed to save asset');
            }
        } catch (err) {
            console.error('Failed to update asset:', err);
        }

        // Always reset override after a save attempt
        window.__TRIER_OVERRIDE_PASS__ = null;
    };

    const handleUnlockSubmit = async (e) => {
        e.preventDefault();
        setUnlockError('');
        try {
            const res = await fetch('/api/auth/verify-override', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    plantId: localStorage.getItem('selectedPlantId'),
                    password: unlockPassword
                })
            });
            const data = await res.json();

            if (res.ok && data.success) {
                window.__TRIER_OVERRIDE_PASS__ = unlockPassword;
                setShowUnlockModal(false);
                setUnlockPassword('');
                if (unlockAction === 'new') handleNew();
                else if (unlockAction === 'edit') handleEditClick();
                else if (unlockAction === 'delete') handleDelete();
            } else {
                setUnlockError(data.error || 'Incorrect password for this location.');
            }
        } catch (err) {
            setUnlockError('Network error checking password.');
        }
    };

    const handlePrint = () => {
        if (selectedAsset) {
            window.triggerTrierPrint('asset', selectedAsset);
        } else {
            // New: Specialized Asset Catalog Print
            window.triggerTrierPrint('catalog-internal', { type: 'assets', 
                items: assets 
            });
        }
    };

    const handleEditClick = () => {
        if (isForeignPlant && !window.__TRIER_OVERRIDE_PASS__) {
            setUnlockAction('edit');
            setShowUnlockModal(true);
            return;
        }
        setIsEditing(true);
    };

    const handleDelete = () => {
        if (isForeignPlant && !window.__TRIER_OVERRIDE_PASS__) {
            setUnlockAction('delete');
            setShowUnlockModal(true);
            return;
        }

        dialogInputRef.current = '';
        setDialog({
            type: 'warning',
            title: 'Decommission Asset',
            message: 'Please enter a reason for decommissioning this asset:',
            showInput: true,
            inputPlaceholder: 'e.g., Equipment failure, Replaced by new model...',
            inputValue: '',
            onInputChange: (val) => {
                dialogInputRef.current = val;
                setDialog(prev => ({ ...prev, inputValue: val }));
            },
            confirmLabel: 'Confirm Decommission',
            onConfirm: () => performDelete()
        });
    };

    const performDelete = async () => {
        const reason = dialogInputRef.current;
        if (!reason || !reason.trim()) {
            setDialog(prev => ({ ...prev, message: 'A reason IS REQUIRED to decommission an asset. Please specify why:', type: 'error' }));
            return;
        }

        setDialog(null);
        try {
            const res = await fetch(`/api/assets/${encodeURIComponent(selectedAsset.ID)}/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason })
            });

            if (res.ok) {
                setDialog({
                    type: 'success',
                    title: 'Asset Decommissioned',
                    message: `Asset ${selectedAsset.ID} has been successfully flagged as deleted.`,
                    isAlert: true,
                    onConfirm: () => setDialog(null)
                });
                setSelectedAsset(null);
                fetchAssets(1);
            } else {
                const data = await res.json();
                setDialog({
                    type: 'error',
                    title: 'Delete Failed',
                    message: data.error || "Failed to delete asset.",
                    isAlert: true,
                    onConfirm: () => setDialog(null)
                });
            }
        } catch (err) {
            console.error('Error deleting asset:', err);
        }

        // Reset override
        window.__TRIER_OVERRIDE_PASS__ = null;
    };

    const handleRestore = async () => {
        if (!await confirm("Are you sure you want to restore this asset to active inventory?")) return;

        try {
            const res = await fetch(`/api/assets/${encodeURIComponent(selectedAsset.ID)}/restore`, {
                method: 'POST'
            });

            if (res.ok) {
                window.trierToast?.success('Asset restored successfully');
                setSelectedAsset(null);
                fetchAssets(1);
            } else {
                const data = await res.json();
                window.trierToast?.error(data.error || 'Failed to restore asset');
            }
        } catch (err) {
            console.error('Error restoring asset:', err);
        }
    };

    const handleCreateLookup = async (lookupType, value) => {
        if (!value.trim()) return;
        try {
            // For these lookups, we'll use a simplified slug for ID if needed, or just the value
            const id = value.trim().toUpperCase().replace(/\s+/g, '_');
            const res = await fetch(`/api/lookups/${lookupType}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, label: value.trim() })
            });
            const data = await res.json();

            if (res.ok) {
                // Refresh specific lookup
                const refreshRes = await fetch(`/api/lookups/${lookupType}`);
                const refreshedData = await refreshRes.json();

                if (lookupType === 'asset-types') {
                    setAssetTypes(refreshedData);
                    setEditData({ ...editData, AssetType: id });
                    setIsAddingNew({ ...isAddingNew, type: false });
                } else if (lookupType === 'locations') {
                    setLocations(refreshedData);
                    setEditData({ ...editData, LocationID: id });
                    setIsAddingNew({ ...isAddingNew, location: false });
                } else if (lookupType === 'departments') {
                    setDepartments(refreshedData);
                    setEditData({ ...editData, DeptID: id });
                    setIsAddingNew({ ...isAddingNew, department: false });
                }
            } else {
                window.trierToast?.error(data.error || 'Failed to create new value');
            }
        } catch (err) {
            console.error('Error creating lookup:', err);
        }
    };



    return (
        <>
        <div className="glass-card" style={{ padding: 'var(--card-padding)', flex: 1, display: 'flex', flexDirection: 'column' }} title={t('assets.equipmentRegistryDashboard')}>
            {/* Removed legacy printMeta */}

            <div className={selectedAsset ? 'no-print' : ''} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <div style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '15px', marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} title={t('assets.overviewHeaderWithFinancial')} className="no-print">
                    <div style={{ display: 'flex', gap: '25px', alignItems: 'center' }}>
                        <h2 style={{ fontSize: '1.2rem' }} title={t('assets.listOfAllRegistered')}>{t('assets.equipmentRegistry')}</h2>

                    {/* Financial Summary Overlay */}
                    <div style={{ display: 'flex', gap: '15px' }} title={t('assets.totalFleetValuesCalculated')}>
                        <div style={{ background: 'rgba(99, 102, 241, 0.1)', padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(99, 102, 241, 0.3)' }} title={t('assets.sumOfAllOriginal')}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('assets.totalAssetValue')}</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                                ${parseFloat(stats.totalCost || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </div>
                        </div>
                        <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.3)' }} title={t('assets.remainingBookValueAfter')}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('assets.totalDepreciatedValue')}</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#10b981' }}>
                                ${parseFloat(stats.totalDepreciatedValue || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </div>
                        </div>
                    </div>
                </div>



                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => { fetchAssets(); fetch('/api/assets/stats').then(r => r.json()).then(setStats); }} className="btn-primary" title={t('assets.reloadEquipmentListAnd')} style={{ padding: '8px 12px' }}>
                        <RefreshCw size={18} className={loading ? 'spinning' : ''} />
                    </button>
                    <button className="btn-primary" onClick={handlePrint} title={t('assets.printTheAssetRegistryAsTip')} style={{ height: '36px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Printer size={16} /> {t('assets.printRegistry')}
                    </button>
                    <button className="btn-primary" onClick={() => window.triggerTrierPrint('asset-qr-batch', { items: assets, plantLabel: plantLabel || localStorage.getItem('selectedPlantId'), plantId: plantId || localStorage.getItem('selectedPlantId') })} title={t('assets.printQrCodeLabelsForTip')} style={{ height: '36px', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10b981' }}>
                        <QrCode size={16} /> 🏷️ Print QR Labels
                    </button>
                    <button
                        className="btn-primary"
                        onClick={handleNew}
                        style={{
                            background: isForeignPlant ? 'transparent' : '#10b981',
                            border: isForeignPlant ? '1px solid var(--glass-border)' : 'none',
                            color: isForeignPlant ? 'var(--text-muted)' : '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 16px'
                        }}
                        title={isForeignPlant ? 'Unlock editing to register a new asset at this location' : 'Register a new piece of equipment'}
                    >
                        <Plus size={18} /> {t('assets.newAsset')}
                    </button>
                </div>
            </div>

            {/* Scrap Metal Monetization — Local Operational Knowledge */}
            {selectedAsset === null && localStorage.getItem('selectedPlantId') !== 'all_sites' && (
                <div className="glass-card no-print" style={{ padding: 24, marginBottom: 20, border: '1px solid rgba(148,163,184,0.3)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Cog size={20} color="#94a3b8" />
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#94a3b8' }}>
                                EScrap Metal Monetization — Local Action Plan
                            </h3>
                        </div>
                        <div style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 800, background: 'rgba(148,163,184,0.1)', padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(148,163,184,0.3)' }}>
                            Est. Leakage: {((meta.total || 0) * 145).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })}
                        </div>
                    </div>
                    <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.6 }}>
                        Based on your facility's rotational asset density, maintenance is estimating thousands of dollars in high-value stainless steel valves, copper stators, and failing equipment scrapped annually. Relying on generic waste-management dumpsters means external firms capture YOUR byproduct revenue.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 15 }}>
                        <div style={{ background: 'rgba(148,163,184,0.05)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 12, padding: 15 }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: 8 }}>TARGET 1: SECURE METAL BINS</div>
                            <div style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>Designate "High-Value Scrap" bins specifically for replaced stainless steel and copper. Do NOT throw equipment into general garbage compactors.</div>
                        </div>
                        <div style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 12, padding: 15 }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#3b82f6', marginBottom: 8 }}>TARGET 2: LOCAL BULK RECYCLERS</div>
                            <div style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>Establish agreements with certified local metal recyclers to schedule bulk ton pick-ups to offset the department's OpEx budget.</div>
                        </div>
                        <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: 15 }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#ef4444', marginBottom: 8 }}>TARGET 3: RE-CORING OPPORTUNITIES</div>
                            <div style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>Before destroying massive $800+ mix-proof valves, leverage specialized third-party shops to "re-core" the valve rather than scrap and re-purchase.</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Equipment Rental Arbitrage — Local Operational Knowledge */}
            {selectedAsset === null && localStorage.getItem('selectedPlantId') !== 'all_sites' && (
                <div className="glass-card no-print" style={{ padding: 24, marginBottom: 20, border: '1px solid rgba(14,165,233,0.3)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Scale size={20} color="#0ea5e9" />
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0ea5e9' }}>
                                Equipment Rental vs. Ownership Arbitrage Warning
                            </h3>
                        </div>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#cbd5e1', lineHeight: 1.6 }}>
                        <strong>Warning:</strong> Trier OS algorithmic monitoring has detected specialty equipment rentals (Scissor Lifts, Chillers) actively deployed on-site that have surpassed 85% of their capital purchase cost. Recommend immediate CapEx conversion or return to vendor.
                    </p>
                </div>
            )}


            {/* Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }} title={t('assets.navigationAndFilteringControls')} className="no-print">
                <div style={{ display: 'flex', gap: '15px', flex: 1 }}>
                    <SearchBar value={search} onChange={setSearch} placeholder={t('assets.searchEquipmentByName')} style={{ flex: 1, maxWidth: 400 }} title={t('assets.searchAssetsByIdDescriptionTip')} />
                    <div>
                        <select
                            value={typeFilter}
                            onChange={e => setTypeFilter(e.target.value)}
                            style={{ minWidth: '180px' }}
                            title={t('assets.filterAssetsByEquipmentCategoryTip')}
                        >
                            <option value="">{t('assets.allCategories')}</option>
                            {assetTypes.map(at => <option key={at.id} value={at.id}>{at.label}</option>)}
                        </select>
                    </div>

                    <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '2px', border: '1px solid var(--glass-border)' }}>
                        <button 
                            onClick={() => setViewMode('list')}
                            style={{ 
                                padding: '6px 15px', 
                                fontSize: '0.85rem', 
                                border: 'none', 
                                borderRadius: '6px',
                                background: viewMode === 'list' ? 'var(--primary)' : 'transparent',
                                color: viewMode === 'list' ? '#fff' : 'var(--text-muted)',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                            title={t('assets.standardFlatListOfAllTip')}
                        >
                            {t('assets.listView')}
                        </button>
                        <button 
                            onClick={() => setViewMode('tree')}
                            style={{ 
                                padding: '6px 15px', 
                                fontSize: '0.85rem', 
                                border: 'none', 
                                borderRadius: '6px',
                                background: viewMode === 'tree' ? 'var(--primary)' : 'transparent',
                                color: viewMode === 'tree' ? '#fff' : 'var(--text-muted)',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px'
                            }}
                            title={t('assets.parentchildHierarchyTreeShowingEquipmentTip')}
                        >
                            <Network size={14} /> {t('assets.hierarchy')}
                        </button>
                    </div>

                    <button 
                        onClick={() => setShowHelp(true)}
                        className="btn-primary" 
                        style={{ background: 'rgba(99, 102, 241, 0.1)', border: '1px solid var(--primary)', borderRadius: '50%', width: '40px', height: '40px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' }}
                        title={t('assets.helpScenarios')}
                    >
                        <Info size={20} />
                    </button>
                </div>
            </div>

            {/* Assets Grid/Table */}
            <div style={{ border: '1px solid var(--glass-border)', borderRadius: '8px' }} title={t('assets.detailedAssetList')}>
                {viewMode === 'list' ? (
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>{t('assets.text.assetID', 'Asset ID')}</th>
                            <th>{t('assets.text.description', 'Description')}</th>
                            <th>{t('assets.text.type', 'Type')}</th>
                            <th>{t('assets.text.location', 'Location')}</th>
                            <th>{t('assets.text.model', 'Model')}</th>
                            <th>{t('wo.status')}</th>
                            <th title="Asset Criticality Class — A: Critical, B: Standard, C: Low Impact">Class</th>
                            <th className="hide-mobile">{t('assets.meter')}</th>
                            <th>{t('assets.qty')}</th>
                            <th style={{ textAlign: 'right' }} className="no-print">{t('assets.action')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                    <RefreshCw className="spinning" size={24} style={{ marginBottom: '10px' }} />
                                    <p>{t('assets.contactingDatabaseServer')}</p>
                                </td>
                            </tr>
                        ) : assets.length === 0 ? (
                            <tr>
                                <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                    {localStorage.getItem('selectedPlantId') === 'all_sites' ? (
                                        <div style={{ padding: '20px' }}>
                                            <AlertTriangle size={32} style={{ marginBottom: '15px', color: 'var(--primary)', opacity: 0.6 }} />
                                            <h3>{t('assets.registryAggregateMode')}</h3>
                                            <p style={{ maxWidth: '400px', margin: '10px auto', fontSize: '0.9rem' }}>{t('assets.text.pleaseSelectASpecificPlantLoca', 'Please select a specific plant location from the header to view and manage equipment records.')}</p>
                                        </div>
                                    ) : (
                                        "No assets found matching your search criteria."
                                    )}
                                </td>
                            </tr>
                        ) : assets.map((a, index) => (
                            <tr key={`${a.ID}-${index}`}>
                                <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{a.ID}</td>
                                <td style={{ maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.Description}</td>
                                <td><span className="badge badge-gray">{a.AssetType || t('common.na', 'N/A')}</span></td>
                                <td>{a.LocationID}</td>
                                <td>{a.Model || '--'}</td>
                                <td>
                                    <span style={{
                                        padding: '4px 10px',
                                        borderRadius: '12px',
                                        fontSize: '0.7rem',
                                        fontWeight: 700,
                                        background: a.OperationalStatus === 'Spare' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                                        color: a.OperationalStatus === 'Spare' ? '#f59e0b' : '#10b981'
                                    }}>
                                        {a.OperationalStatus || t('assets.inProduction')}
                                    </span>
                                </td>
                                <td title={a.CriticalityClass === 'A' ? 'Critical — Production-Stopping' : a.CriticalityClass === 'B' ? 'Standard — Significant Impact' : 'Low Impact — Non-Critical'}>
                                    <span style={{
                                        display: 'inline-block', width: 24, height: 24, borderRadius: 6, lineHeight: '24px', textAlign: 'center',
                                        fontSize: '0.72rem', fontWeight: 800,
                                        background: a.CriticalityClass === 'A' ? 'rgba(239,68,68,0.15)' : a.CriticalityClass === 'B' ? 'rgba(245,158,11,0.15)' : 'rgba(148,163,184,0.15)',
                                        color: a.CriticalityClass === 'A' ? '#ef4444' : a.CriticalityClass === 'B' ? '#f59e0b' : '#94a3b8'
                                    }}>
                                        {a.CriticalityClass || 'C'}
                                    </span>
                                </td>
                                <td className="hide-mobile" style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                    {a.MeterReading != null ? (
                                        <span title={`${a.MeterType}: ${a.MeterReading} ${a.MeterUnit || ''}`}>
                                            {parseFloat(a.MeterReading).toLocaleString()} {a.MeterUnit || ''}
                                        </span>
                                    ) : '--'}
                                </td>
                                <td style={{ fontWeight: 'bold' }}>{a.Quantity || 1}</td>
                                <td style={{ textAlign: 'right' }} className="no-print">
                                    <button
                                        onClick={() => handleView(a.ID, a.plantId)}
                                        className="btn-view-standard"
                                        title={`View full details for asset ${a.ID}`}
                                    >
                                        <Eye size={18} /> {t('assets.view')}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                ) : (
                    <div style={{ padding: '20px' }}>
                        {loading ? (
                             <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                <RefreshCw className="spinning" size={24} style={{ marginBottom: '10px' }} />
                                <p>{t('assets.buildingHierarchyTree')}</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                {hierarchy.map(node => (
                                    <AssetTreeNode 
                                        key={node.ID} 
                                        node={node} 
                                        level={0} 
                                        expandedNodes={expandedNodes}
                                        toggleNode={(id) => {
                                            const next = new Set(expandedNodes);
                                            if (next.has(id)) next.delete(id);
                                            else next.add(id);
                                            setExpandedNodes(next);
                                        }}
                                        onView={handleView}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Pagination Setup */}
            {viewMode === 'list' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '15px', paddingTop: '15px', borderTop: '1px solid var(--glass-border)' }} title={t('assets.recordNavigationControls')} className="no-print">
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Showing {assets.length > 0 ? (meta.page - 1) * meta.limit + 1 : 0} - {Math.min(meta.page * meta.limit, meta.total)} of {meta.total} records
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button                         className="btn-nav"
                        disabled={meta.page <= 1}
                        onClick={() => fetchAssets(meta.page - 1)}
                        style={{ padding: '5px', opacity: meta.page <= 1 ? 0.5 : 1 }}
                        title={t('assets.goToPreviousPageOfTip')}
                    >
                        <ChevronLeft size={18} />
                    </button>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, minWidth: '80px', textAlign: 'center' }}>
                        Page {meta.page} of {meta.totalPages}
                    </span>
                    <button                         className="btn-nav"
                        disabled={meta.page >= meta.totalPages}
                        onClick={() => fetchAssets(meta.page + 1)}
                        style={{ padding: '5px', opacity: meta.page >= meta.totalPages ? 0.5 : 1 }}
                        title={t('assets.goToNextPageOfTip')}
                    >
                        <ChevronRight size={18} />
                    </button>
                </div>
            </div>
            )}
        </div>


        </div>

        {/* Asset Detail/Edit Modal */}
        {selectedAsset && createPortal((
            <div className="modal-overlay print-exclude" onClick={() => setSelectedAsset(null)}>
                <div className="glass-card modal-content-standard" onClick={e => e.stopPropagation()}>

                    <ActionBar
                        title={isCreating ? 'Register New Asset' : (isEditing ? `Editing: ${selectedAsset.ID}` : `Asset: ${selectedAsset.ID}`)}
                        icon={<PenTool size={20} />}
                        isEditing={isEditing}
                        isCreating={isCreating}
                        onEdit={handleEditClick}
                        onSave={handleSave}
                        onPrint={handlePrint}
                        onClose={() => setSelectedAsset(null)}
                        onDelete={handleDelete}
                        onCancel={() => { setIsEditing(false); setEditData(selectedAsset); }}
                        showDelete={!isForeignPlant}
                        extraButtons={(!isEditing && !isCreating) || isCreating ? [
                            {
                                label: '🏷️ QR Label',
                                onClick: () => {
                                    const assetToPrint = isCreating ? { ...editData, Description: editData.Description || 'New Asset' } : selectedAsset;
                                    if (!assetToPrint.ID) { window.trierToast?.info('Enter an Asset ID first to print.'); return; }
                                    window.triggerTrierPrint('asset-qr-label', { ...assetToPrint, plantLabel: plantLabel || localStorage.getItem('selectedPlantId'), plantId: plantId || localStorage.getItem('selectedPlantId') });
                                },
                                title: isCreating ? 'Print a QR code up-front before installing' : 'Print a QR code label for this asset',
                                style: { background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10b981' },
                                icon: <QrCode size={14} />
                            }
                        ] : []}
                    >
                        {/* Camera capture button for Nameplate OCR or View Mode Upload */}
                        {(!isEditing && !isCreating || isCreating) && (
                            <button 
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    setCameraMode(isCreating ? 'create' : 'view');
                                    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                                        fileFallbackRef.current?.click();
                                    } else {
                                        setShowCameraModal(true);
                                    }
                                }}
                                disabled={uploadingPhoto}
                                style={{ 
                                    height: '36px', width: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    borderRadius: '8px', cursor: 'pointer',
                                    background: uploadingPhoto ? 'rgba(255,255,255,0.05)' : '#10b981',
                                    color: '#fff', border: 'none',
                                    opacity: uploadingPhoto ? 0.6 : 1,
                                    flexShrink: 0
                                }}
                                title={isCreating ? 'Snap Nameplate (OCR)' : t('assets.uploadAPhotoOfThisTip')}
                            >
                                <Camera size={18} />
                            </button>
                        )}
                        
                        {/* Hidden file input for file-explorer fallback */}
                        <input 
                            type="file" 
                            accept="image/*" 
                            capture="environment"
                            ref={fileFallbackRef}
                            onChange={(e) => {
                                if (cameraMode === 'create') handlePreCreateOcrUpload(e);
                                else handlePhotoUpload(e);
                            }}
                            disabled={uploadingPhoto}
                            style={{ display: 'none' }} 
                        />
                    </ActionBar>

                    <div className="scroll-area" style={{ padding: '30px', paddingBottom: '80px', overflowY: 'auto', flex: 1 }}>

                        <div className="detail-grid">
                            {/* General Info */}
                            <div className="panel-box">
                                <h3>{t('assets.coreProperties')}</h3>
                                <div className="detail-row">
                                    <span className="detail-label">{t('assets.assetId')}</span>
                                    {isCreating ? (
                                        <input type="text" value={editData.ID || ''} onChange={e => setEditData({ ...editData, ID: e.target.value })} style={{ width: '100%', maxWidth: '200px' }} title={t('assets.enterAUniqueIdentifierForTip')} />
                                    ) : <span style={{ fontWeight: 'bold' }}>{selectedAsset.ID}</span>}
                                </div>
                                <div className="detail-row">
                                    <span className="detail-label">{t('assets.description')}</span>
                                    {isEditing ? (
                                        <input type="text" value={editData.Description || ''} onChange={e => setEditData({ ...editData, Description: e.target.value })} style={{ width: '100%' }} title={t('assets.fullDescriptionOfThisEquipmentTip')} />
                                    ) : <span>{selectedAsset.Description}</span>}
                                </div>
                                <div className="detail-row">
                                    <span className="detail-label">{t('assets.type')}</span>
                                    {isEditing ? (
                                        <select value={editData.AssetType || ''} onChange={e => setEditData({ ...editData, AssetType: e.target.value })} style={{ width: '100%', maxWidth: '200px' }} title={t('assets.equipmentCategoryClassificationTip')}>
                                            <option value="">{t('assets.noCategory')}</option>
                                            {assetTypes.map(at => <option key={at.id} value={at.id}>{at.label}</option>)}
                                        </select>
                                    ) : <span className="badge badge-gray">{selectedAsset.AssetType || t('common.na', 'N/A')}</span>}
                                </div>
                                <div className="detail-row">
                                    <span className="detail-label">{t('assets.location')}</span>
                                    {isEditing ? (
                                        <select value={editData.LocationID || ''} onChange={e => setEditData({ ...editData, LocationID: e.target.value })} style={{ width: '100%', maxWidth: '200px' }} title={t('assets.physicalLocationOfThisEquipmentTip')}>
                                            <option value="">{t('assets.noLocation')}</option>
                                            {locations.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                                        </select>
                                    ) : <span>{selectedAsset.LocationID || '--'}</span>}
                                </div>
                                <div className="detail-row">
                                    <span className="detail-label">{t('assets.status')}</span>
                                    {isEditing ? (
                                        <select 
                                            value={editData.OperationalStatus || t('assets.inProduction')} 
                                            onChange={e => setEditData({ ...editData, OperationalStatus: e.target.value })} 
                                            style={{ 
                                                width: '100%', 
                                                maxWidth: '200px',
                                                border: `1px solid ${editData.OperationalStatus === 'Spare' ? '#f59e0b' : '#10b981'}`
                                            }}
                                            title={t('assets.setWhetherThisAssetIsTip')}
                                        >
                                            <option value="In Production">{t('assets.inProduction')}</option>
                                            <option value="Spare">{t('assets.spareLogistics')}</option>
                                        </select>
                                    ) : (
                                        <span style={{ 
                                            fontWeight: 'bold', 
                                            color: selectedAsset.OperationalStatus === 'Spare' ? '#f59e0b' : '#10b981',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}>
                                            {selectedAsset.OperationalStatus === 'Spare' ? <AlertTriangle size={14} /> : <CheckCircle size={14} />}
                                            {selectedAsset.OperationalStatus || t('assets.inProduction')}
                                        </span>
                                    )}
                                </div>
                                <div className="detail-row">
                                    <span className="detail-label">Criticality Class</span>
                                    {isEditing ? (
                                        <select
                                            value={editData.CriticalityClass || 'C'}
                                            onChange={e => setEditData({ ...editData, CriticalityClass: e.target.value })}
                                            style={{ width: '100%', maxWidth: '260px', border: `1px solid ${editData.CriticalityClass === 'A' ? '#ef4444' : editData.CriticalityClass === 'B' ? '#f59e0b' : '#94a3b8'}` }}
                                            title="Determines PM frequency multiplier: A = 0.8× (tighter), B = 1.0× (standard), C = 1.2× (relaxed)"
                                        >
                                            <option value="A">A — Critical (Production-Stopping)</option>
                                            <option value="B">B — Standard (Significant Impact)</option>
                                            <option value="C">C — Low Impact (Redundant / Non-Critical)</option>
                                        </select>
                                    ) : (
                                        <span style={{
                                            fontWeight: 700,
                                            color: selectedAsset.CriticalityClass === 'A' ? '#ef4444' : selectedAsset.CriticalityClass === 'B' ? '#f59e0b' : '#94a3b8'
                                        }}>
                                            {selectedAsset.CriticalityClass === 'A' ? 'A — Critical (Production-Stopping)'
                                             : selectedAsset.CriticalityClass === 'B' ? 'B — Standard (Significant Impact)'
                                             : 'C — Low Impact (Non-Critical)'}
                                        </span>
                                    )}
                                </div>
                                <div className="detail-row">
                                    <span className="detail-label">Criticality Reason</span>
                                    {isEditing ? (
                                        <input type="text" value={editData.CriticalityReason || ''}
                                            onChange={e => setEditData({ ...editData, CriticalityReason: e.target.value })}
                                            placeholder="Optional: justify the classification"
                                            style={{ width: '100%' }} />
                                    ) : (
                                        <span style={{ color: selectedAsset.CriticalityReason ? 'inherit' : 'var(--text-muted)', fontStyle: selectedAsset.CriticalityReason ? 'normal' : 'italic' }}>
                                            {selectedAsset.CriticalityReason || '—'}
                                        </span>
                                    )}
                                </div>
                                <div className="detail-row">
                                    <span className="detail-label">{t('assets.parentAsset')}</span>
                                    {isEditing ? (
                                        <select
                                            value={editData.ParentAssetID || ''}
                                            onChange={e => setEditData({ ...editData, ParentAssetID: e.target.value || null })}
                                            style={{ width: '100%', maxWidth: '200px' }}
                                            title={t('assets.assignThisAssetAsATip')}
                                        >
                                            <option value="">{t('assets.noParentRoot')}</option>
                                            {assets.filter(a => a.ID !== selectedAsset?.ID).map((a, index) => (
                                                <option key={`${a.ID}-${index}`} value={a.ID}>{a.ID} — {a.Description}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <span style={{ color: selectedAsset.ParentAssetID ? 'var(--primary)' : 'var(--text-muted)', fontWeight: selectedAsset.ParentAssetID ? 600 : 400 }}>
                                            {selectedAsset.ParentAssetID ? `↳ ${selectedAsset.ParentAssetID}` : '— Root Level —'}
                                        </span>
                                    )}
                                </div>
                                {!isEditing && selectedAsset.LocationPath && (
                                    <div className="detail-row">
                                        <span className="detail-label">{t('assets.path')}</span>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                            {selectedAsset.LocationPath}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Work Order Actions — manual entry path into scan state machine */}
                            {!isEditing && !isCreating && selectedAsset.ID && (
                                <div className="panel-box" style={{ gridColumn: 'span 2' }}>
                                    <ScanEntryPoint
                                        assetId={selectedAsset.ID}
                                        plantId={plantId}
                                        userId={localStorage.getItem('userId') || localStorage.getItem('userRole') || 'unknown'}
                                    />
                                </div>
                            )}

                            {/* Tech Specs */}
                            <div className="panel-box">
                                <h3>{t('assets.technicalSpecs')}</h3>
                                <div className="detail-row">
                                    <span className="detail-label">Part Number</span>
                                    {isEditing ? (
                                        <input type="text" value={editData.PartNumber || ''} onChange={e => setEditData({ ...editData, PartNumber: e.target.value })} style={{ width: '100%' }} title="OEM Part Number for cross-plant logistics matching" />
                                    ) : <span>{selectedAsset.PartNumber || '--'}</span>}
                                </div>
                                <div className="detail-row">
                                    <span className="detail-label">{t('assets.model')}</span>
                                    {isEditing ? (
                                        <input type="text" value={editData.Model || ''} onChange={e => setEditData({ ...editData, Model: e.target.value })} style={{ width: '100%' }} title={t('assets.manufacturerModelNumberTip')} />
                                    ) : <span>{selectedAsset.Model || '--'}</span>}
                                </div>
                                <div className="detail-row">
                                    <span className="detail-label">{t('assets.serial')}</span>
                                    {isEditing ? (
                                        <input type="text" value={editData.Serial || ''} onChange={e => setEditData({ ...editData, Serial: e.target.value })} style={{ width: '100%' }} title={t('assets.manufacturerSerialNumberTip')} />
                                    ) : <span>{selectedAsset.Serial || '--'}</span>}
                                </div>
                                <div className="detail-row">
                                    <span className="detail-label">{t('assets.purchaseDate')}</span>
                                    {isEditing ? (
                                        <input type="date" value={editData.PurchaseDate ? editData.PurchaseDate.split('T')[0] : ''} onChange={e => setEditData({ ...editData, PurchaseDate: e.target.value })} title="Date this asset was purchased" />
                                    ) : <span>{formatDate(selectedAsset.PurchaseDate) || '--'}</span>}
                                </div>
                                <div className="detail-row">
                                    <span className="detail-label">{t('assets.installDate')}</span>
                                    {isEditing ? (
                                        <input type="date" value={editData.InstallDate ? editData.InstallDate.split('T')[0] : ''} onChange={e => setEditData({ ...editData, InstallDate: e.target.value })} title="Date this asset was installed on site" />
                                    ) : <span>{formatDate(selectedAsset.InstallDate) || '--'}</span>}
                                </div>
                            </div>

                            {/* Warranty Tracker Panel */}
                            <div className="panel-box" style={{ gridColumn: 'span 2' }}>
                                <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    📜 Warranty Coverage
                                    {!isEditing && selectedAsset.WarrantyEnd && (() => {
                                        const endDate = new Date(selectedAsset.WarrantyEnd);
                                        const now = new Date();
                                        const diffDays = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
                                        if (diffDays > 90) return <span className="badge badge-primary" style={{ fontSize: '0.7rem', marginLeft: 'auto' }}>✅ Active — {diffDays} days left</span>;
                                        if (diffDays > 0) return <span style={{ marginLeft: 'auto', background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.4)', padding: '3px 10px', borderRadius: '6px', fontSize: '0.7rem', color: '#fbbf24', fontWeight: 600 }}>⚠️ Expiring — {diffDays} days left</span>;
                                        return <span style={{ marginLeft: 'auto', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', padding: '3px 10px', borderRadius: '6px', fontSize: '0.7rem', color: '#ef4444', fontWeight: 600 }}>❌ Expired {Math.abs(diffDays)} days ago</span>;
                                    })()}
                                </h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0' }}>
                                    <div className="detail-row">
                                        <span className="detail-label">{t('assets.startDate')}</span>
                                        {isEditing ? (
                                            <input type="date" value={editData.WarrantyStart ? editData.WarrantyStart.split('T')[0] : ''} onChange={e => setEditData({ ...editData, WarrantyStart: e.target.value })} title="Warranty coverage start date" />
                                        ) : <span>{formatDate(selectedAsset.WarrantyStart) || <span style={{ color: 'var(--text-muted)' }}>{t('assets.text.notSet', 'Not set')}</span>}</span>}
                                    </div>
                                    <div className="detail-row">
                                        <span className="detail-label">{t('assets.endDate')}</span>
                                        {isEditing ? (
                                            <input type="date" value={editData.WarrantyEnd ? editData.WarrantyEnd.split('T')[0] : ''} onChange={e => setEditData({ ...editData, WarrantyEnd: e.target.value })} title="Warranty coverage end date" />
                                        ) : <span>{formatDate(selectedAsset.WarrantyEnd) || <span style={{ color: 'var(--text-muted)' }}>{t('assets.text.notSet', 'Not set')}</span>}</span>}
                                    </div>
                                    <div className="detail-row">
                                        <span className="detail-label">{t('assets.vendor')}</span>
                                        {isEditing ? (
                                            <input type="text" value={editData.WarrantyVendor || ''} onChange={e => setEditData({ ...editData, WarrantyVendor: e.target.value })} placeholder={t('assets.warrantyProviderNamePlaceholder')} style={{ width: '100%' }} title={t('assets.companyProvidingTheWarrantyContactTip')} />
                                        ) : <span style={{ fontWeight: 600 }}>{selectedAsset.WarrantyVendor || <span style={{ color: 'var(--text-muted)' }}>{t('assets.text.notSet', 'Not set')}</span>}</span>}
                                    </div>
                                    <div className="detail-row" style={{ gridColumn: 'span 2' }}>
                                        <span className="detail-label">{t('assets.termsNotes')}</span>
                                        {isEditing ? (
                                            <textarea value={editData.WarrantyTerms || ''} onChange={e => setEditData({ ...editData, WarrantyTerms: e.target.value })} placeholder={t('assets.coverageDetailsExclusionsClaimProcessPlaceholder')} rows={2} style={{ width: '100%', resize: 'vertical' }} title={t('assets.freetextWarrantyTermsConditionsAndTip')} />
                                        ) : <span style={{ fontSize: '0.85rem' }}>{selectedAsset.WarrantyTerms || <span style={{ color: 'var(--text-muted)' }}>{t('assets.text.noTermsRecorded', 'No terms recorded')}</span>}</span>}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Meter Reading Panel (Feature 2) */}
                        {(selectedAsset.MeterType || isEditing) && (
                            <div className="panel-box" style={{ marginTop: '0' }}>
                                <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <Gauge size={18} color="var(--primary)" /> {t('assets.meterReading')}
                                </h3>
                                {isEditing ? (
                                    <>
                                        <div className="detail-row">
                                            <span className="detail-label">{t('assets.meterType')}</span>
                                            <select 
                                                value={editData.MeterType || ''} 
                                                onChange={e => setEditData({ ...editData, MeterType: e.target.value })}
                                                style={{ width: '100%', maxWidth: '200px' }}
                                                title={t('assets.selectTheTypeOfMeterTip')}
                                            >
                                                <option value="">{t('assets.noMeter')}</option>
                                                <option value="hours">{t('assets.runtimeHours')}</option>
                                                <option value="miles">{t('assets.milesDistance')}</option>
                                                <option value="cycles">{t('assets.cyclesCounts')}</option>
                                                <option value="gallons">{t('assets.gallons')}</option>
                                                <option value="kwh">{t('assets.kwhEnergy')}</option>
                                            </select>
                                        </div>
                                        <div className="detail-row">
                                            <span className="detail-label">{t('assets.unitLabel')}</span>
                                            <input 
                                                type="text" 
                                                value={editData.MeterUnit || ''} 
                                                onChange={e => setEditData({ ...editData, MeterUnit: e.target.value })}
                                                placeholder={t('assets.egHoursMiCycles')} 
                                                style={{ width: '100%', maxWidth: '200px' }}
                                                title={t('assets.theUnitLabelDisplayedNextTip')}
                                            />
                                        </div>
                                    </>
                                ) : selectedAsset.MeterType ? (
                                    <>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                            <div>
                                                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#fff' }}>
                                                    {selectedAsset.MeterReading != null ? parseFloat(selectedAsset.MeterReading).toLocaleString() : '0'}
                                                    <span style={{ fontSize: '0.9rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '6px' }}>
                                                        {selectedAsset.MeterUnit || selectedAsset.MeterType}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                    {selectedAsset.MeterLastUpdated ? `Last updated: ${formatDate(selectedAsset.MeterLastUpdated)}` : 'No readings logged'}
                                                </div>
                                            </div>
                                            <button                                                 className="btn-primary" 
                                                style={{ padding: '6px 14px', fontSize: '0.85rem' }}
                                                onClick={() => setShowMeterInput(!showMeterInput)}
                                                title={showMeterInput ? 'Cancel meter update' : 'Log a new meter reading for this asset'}
                                            >
                                                {showMeterInput ? t('assets.cancel') : t('assets.text.updateReading', '📏 Update Reading')}
                                            </button>
                                        </div>

                                        {showMeterInput && (
                                            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                                                <input 
                                                    type="number" 
                                                    placeholder={`New ${selectedAsset.MeterUnit || 'reading'}...`}
                                                    value={meterReading}
                                                    onChange={e => setMeterReading(e.target.value)}
                                                    style={{ flex: 1, maxWidth: '200px' }}
                                                    min={selectedAsset.MeterReading || 0}
                                                    title={`Enter the new ${selectedAsset.MeterUnit || 'meter'} reading`}
                                                />
                                                <button 
                                                    className="btn-save" style={{ padding: '6px 16px' }}
                                                    disabled={submittingMeter || !meterReading}
                                                    title={t('assets.saveThisMeterReadingToTip')}
                                                    onClick={async () => {
                                                        setSubmittingMeter(true);
                                                        try {
                                                            const res = await fetch(`/api/assets/${encodeURIComponent(selectedAsset.ID)}/meter`, {
                                                                method: 'POST',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({ reading: parseFloat(meterReading), source: 'manual' })
                                                            });
                                                            if (res.ok) {
                                                                setMeterReading('');
                                                                setShowMeterInput(false);
                                                                handleView(selectedAsset.ID, selectedAsset.plantId); // Refresh
                                                            } else {
                                                                const err = await res.json();
                                                                window.trierToast?.error(err.error || 'Failed to log meter reading');
                                                            }
                                                        } catch (e) { window.trierToast?.error('Network error'); }
                                                        setSubmittingMeter(false);
                                                    }}
                                                >
                                                    {submittingMeter ? '...' : 'Save'}
                                                </button>
                                            </div>
                                        )}

                                        {/* Mini Trend Bar Chart */}
                                        {meterHistory.length > 1 && (
                                            <div style={{ marginTop: '10px' }}>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px' }}>{t('assets.recentReadings')}</div>
                                                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '40px' }}>
                                                    {meterHistory.slice(0, 10).reverse().map((r, i) => {
                                                        const max = Math.max(...meterHistory.slice(0, 10).map(h => h.reading));
                                                        const min = Math.min(...meterHistory.slice(0, 10).map(h => h.reading));
                                                        const range = max - min || 1;
                                                        const pct = ((r.reading - min) / range) * 100;
                                                        return (
                                                            <div 
                                                                key={`item-${i}`}
                                                                title={`${r.reading.toLocaleString()} — ${formatDate(r.recordedAt)}`}
                                                                style={{
                                                                    flex: 1,
                                                                    height: `${Math.max(10, pct)}%`,
                                                                    background: 'linear-gradient(to top, var(--primary), rgba(99,102,241,0.4))',
                                                                    borderRadius: '3px 3px 0 0',
                                                                    transition: 'height 0.3s'
                                                                }}
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                ) : null}
                            </div>
                        )}

                        {!isCreating && !isEditing && selectedAsset && (
                            (() => {
                                const metrics = getHealthMetrics(selectedAsset);
                                if (!metrics) return null;
                                return (
                                    <div className="panel-box" style={{ marginTop: '20px', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(16, 185, 129, 0.05) 100%)', border: '1px solid var(--primary)' }}>
                                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--primary)', fontSize: '1.2rem' }}>
                                            <Activity size={24} /> {t('assets.assetHealthReliabilityIndex')}
                                        </h3>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginTop: '20px' }}>
                                            <div style={{ textAlign: 'center', background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>{t('assets.reliabilityScore')}</div>
                                                <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: metrics.reliabilityColor }}>{metrics.reliability}</div>
                                                <div style={{ fontSize: '0.7rem', color: metrics.reliabilityColor, marginTop: '4px' }}>
                                                    {parseFloat(metrics.reliability) > 94 ? 'Optimal Range' : (parseFloat(metrics.reliability) > 90 ? 'Monitor Status' : 'Needs Attention')}
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'center', background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>{t('assets.mtbfRating')}</div>
                                                <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#fff' }}>{metrics.mtbf}</div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>{t('assets.avgHoursFailure')}</div>
                                            </div>
                                            <div style={{ textAlign: 'center', background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>{t('assets.ytdDowntimeCost')}</div>
                                                <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#f87171' }}>{metrics.cost}</div>
                                                <div style={{ fontSize: '0.7rem', color: metrics.isUp ? '#ef4444' : '#10b981', marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                                    {metrics.isUp ? 'Trending Up' : 'Trending Down'} 
                                                    {metrics.isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'center', background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '12px', border: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>{t('assets.triageIndex')}</div>
                                                <div style={{ 
                                                    padding: '6px 15px', 
                                                    borderRadius: '20px', 
                                                    background: metrics.triageColor, 
                                                    color: '#fff', 
                                                    fontSize: '0.85rem', 
                                                    fontWeight: 'bold',
                                                    boxShadow: `0 0 15px ${metrics.triageColor}4D`
                                                }}>
                                                    {metrics.triage}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()
                        )}

                        {/* Hierarchy Roll-Up Stats (Feature 3) */}
                        {!isCreating && !isEditing && selectedAsset && rollupData && rollupData.totalAssets > 1 && (
                            <div className="panel-box" style={{ marginTop: '20px', background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(99, 102, 241, 0.05) 100%)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                                <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#f59e0b', fontSize: '1.1rem' }}>
                                    <Network size={20} /> {t('assets.hierarchyRollup')}
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>({rollupData.totalAssets} assets incl. {rollupData.descendantCount} children)</span>
                                </h3>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px', marginTop: '15px' }}>
                                    <div style={{ textAlign: 'center', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{t('assets.totalWorkOrders')}</div>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#6366f1' }}>{rollupData.woStats?.totalWOs || 0}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                                            {rollupData.woStats?.openWOs || 0} open · {rollupData.woStats?.completedWOs || 0} completed
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'center', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{t('assets.totalLaborHours')}</div>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981' }}>{(rollupData.laborHours || 0).toFixed(1)}h</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '3px' }}>{t('assets.acrossHierarchy')}</div>
                                    </div>
                                    <div style={{ textAlign: 'center', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{t('assets.totalPartsCost')}</div>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f87171' }}>${(rollupData.partsCost || 0).toLocaleString()}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '3px' }}>{t('assets.allDescendants')}</div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div style={{ marginTop: '20px', background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                            <h3 style={{ fontSize: '11pt', color: 'var(--text-muted)', marginBottom: '10px' }}>{t('assets.commentsNotes')}</h3>
                            {isEditing ? (
                                <textarea
                                    value={editData.Comment || ''}
                                    onChange={e => setEditData({ ...editData, Comment: e.target.value })}
                                    style={{ width: '100%', minHeight: '80px', background: 'rgba(0,0,0,0.2)', color: '#fff', border: '1px solid var(--glass-border)', padding: '10px', borderRadius: '4px' }}
                                    title={t('assets.internalNotesAndCommentsAboutTip')}
                                />
                            ) : (
                                <p style={{ margin: 0, color: '#475569', whiteSpace: 'pre-wrap', fontSize: '10pt', lineHeight: '1.6' }}>{selectedAsset.Comment || 'No comments recorded.'}</p>
                            )}
                        </div>

                        {/* ── Wisdom Exchange ── */}
                        {!isEditing && !isCreating && selectedAsset && (
                            <div style={{ marginTop: '20px' }}>
                                <TribalKnowledge
                                    entityType="asset"
                                    entityId={selectedAsset.ID}
                                    entityLabel={selectedAsset.Description}
                                />
                            </div>
                        )}

                        {/* ── Bill of Materials ── */}
                        {!isCreating && selectedAsset && (
                            <BomPanel assetId={selectedAsset.ID} isEditing={isEditing} />
                        )}

                        {/* ── Asset Photos (View Mode Only) ── */}
                        {!isEditing && !isCreating && assetPhotos.length > 0 && (
                        <div style={{ marginTop: '20px', background: 'rgba(255,255,255,0.02)', padding: '15px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                            <h3 style={{ fontSize: '11pt', color: 'var(--text-muted)', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Camera size={16} color="var(--primary)" /> Photos ({assetPhotos.length})
                            </h3>
                            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '5px' }}>
                                {assetPhotos.map(photo => (
                                    <div key={photo.filename} style={{ 
                                        position: 'relative', flexShrink: 0,
                                        width: '90px', height: '90px',
                                        borderRadius: '8px', overflow: 'hidden', 
                                        border: '2px solid var(--glass-border)',
                                        cursor: 'pointer'
                                    }}
                                    onClick={() => setLightboxPhoto(photo)}
                                    >
                                        <img src={photo.url} 
                                            alt={`Asset ${selectedAsset.ID}`}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                            loading="lazy"
                                        />
                                        {isAdminOrCreator && (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handlePhotoDelete(photo.filename); }}
                                                style={{
                                                    position: 'absolute', top: '2px', right: '2px',
                                                    background: 'rgba(239, 68, 68, 0.85)', border: 'none',
                                                    color: '#fff', borderRadius: '50%', width: '20px', height: '20px',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    cursor: 'pointer'
                                                }}
                                                title={t('assets.deleteThisPhotoTip')}
                                            >
                                                <Trash2 size={10} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                        )}

                    </div>

                    {/* Lightbox */}
                    {lightboxPhoto && (
                        <div 
                            onClick={() => setLightboxPhoto(null)}
                            style={{
                                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                                background: 'rgba(0,0,0,0.9)', zIndex: 99999,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer'
                            }}
                        >
                            <img src={lightboxPhoto.url} 
                                alt="Full size" 
                                style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px' }}
                            />
                            <button 
                                onClick={() => setLightboxPhoto(null)}
                                style={{
                                    position: 'absolute', top: '20px', right: '20px',
                                    background: 'rgba(255,255,255,0.1)', border: 'none',
                                    color: '#fff', borderRadius: '50%', width: '40px', height: '40px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer'
                                }}
                                title={t('assets.closeFullsizePhotoViewerTip')}
                            >
                                <X size={24} />
                            </button>
                        </div>
                    )}

                    {/* OCR Scanning Indicator */}
                    {ocrScanning && (
                        <div style={{
                            position: 'absolute', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
                            background: 'rgba(99, 102, 241, 0.9)', color: '#fff',
                            padding: '10px 20px', borderRadius: '20px',
                            fontSize: '0.85rem', fontWeight: 600,
                            display: 'flex', alignItems: 'center', gap: '10px',
                            zIndex: 15, boxShadow: '0 4px 20px rgba(99, 102, 241, 0.4)',
                            animation: 'pulse 1.5s infinite'
                        }}>
                            <Eye size={16} /> {t('assets.scanningForSerialModel')}
                        </div>
                    )}

                    {/* OCR Results Dialog */}
                    {ocrResults && (
                        <div style={{
                            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                            background: 'rgba(0,0,0,0.85)', zIndex: 99998,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: '20px'
                        }} onClick={() => setOcrResults(null)}>
                            <div style={{
                                background: 'var(--glass-bg, #1e293b)', border: '1px solid var(--primary)',
                                borderRadius: '16px', padding: '24px', maxWidth: '420px', width: '100%',
                                boxShadow: '0 0 40px rgba(99, 102, 241, 0.3)'
                            }} onClick={e => e.stopPropagation()}>
                                <h3 style={{ margin: '0 0 5px 0', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.1rem' }}>
                                    <Eye size={22} /> {t('assets.ocrScanResults')}
                                </h3>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0 0 15px 0' }}>{t('assets.text.theFollowingIdentifiersWereDet', 'The following identifiers were detected in your photo. Select values to apply to this asset.')}</p>

                                {(() => {
                                    // Build selectable items
                                    const items = [];
                                    ocrResults.serial?.forEach((s, i) => items.push({ 
                                        key: `serial-${i}`, field: 'Serial', label: 'Serial Number', 
                                        value: s.value, labeled: s.labeled, checked: s.labeled && !selectedAsset?.Serial
                                    }));
                                    ocrResults.model?.forEach((m, i) => items.push({ 
                                        key: `model-${i}`, field: 'Model', label: 'Model Number', 
                                        value: m.value, labeled: m.labeled, checked: m.labeled && !selectedAsset?.Model
                                    }));
                                    ocrResults.partNumber?.forEach((p, i) => items.push({ 
                                        key: `part-${i}`, field: 'partNumber', label: 'Part Number', 
                                        value: p.value, labeled: p.labeled, checked: p.labeled
                                    }));

                                    return (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                                            {items.map(item => (
                                                <label key={item.key} style={{
                                                    display: 'flex', alignItems: 'center', gap: '10px',
                                                    padding: '10px 12px', borderRadius: '8px',
                                                    background: 'rgba(255,255,255,0.03)',
                                                    border: `1px solid ${item.labeled ? 'var(--primary)' : 'var(--glass-border)'}`,
                                                    cursor: 'pointer'
                                                }}>
                                                    <input 
                                                        type="checkbox" 
                                                        defaultChecked={item.checked}
                                                        data-field={item.field}
                                                        data-value={item.value}
                                                        style={{ accentColor: 'var(--primary)', width: '18px', height: '18px' }}
                                                        title={`Include ${item.value} in OCR label assignment`}
                                                    />
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                                            {item.label} {item.labeled && <span style={{ color: '#10b981' }}>✓ labeled</span>}
                                                        </div>
                                                        <div style={{ fontSize: '1rem', color: '#fff', fontWeight: 600, fontFamily: 'monospace' }}>
                                                            {item.value}
                                                        </div>
                                                    </div>
                                                </label>
                                            ))}
                                            {items.length === 0 && (
                                                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
                                                    {t('assets.noIdentifiersCouldBe')}
                                                </p>
                                            )}
                                        </div>
                                    );
                                })()}

                                <div style={{ display: 'flex', gap: '10px', marginTop: '18px', justifyContent: 'flex-end' }}>
                                    <button 
                                        onClick={() => setOcrResults(null)}
                                        style={{ padding: '10px 20px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid var(--glass-border)', cursor: 'pointer' }}
                                        title={t('assets.skipOcrResultsAndCloseTip')}
                                    >
                                        {t('assets.skip')}
                                    </button>
                                    <button 
                                        onClick={() => {
                                            const checkboxes = document.querySelectorAll('[data-field][data-value]');
                                            const values = {};
                                            checkboxes.forEach(cb => {
                                                if (cb.checked) {
                                                    values[cb.dataset.field] = cb.dataset.value;
                                                }
                                            });
                                            applyOcrValues(values);
                                        }}
                                        style={{ padding: '10px 20px', borderRadius: '8px', background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                                        title={t('assets.applyTheSelectedOcrValuesTip')}
                                    >
                                        {t('assets.applySelected')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="modal-footer">
                        {isEditing ? (
                            <>
                                <button className="btn-nav" title={t('assets.cancelEditingAndDiscardChangesTip')} onClick={() => { if (isCreating) setSelectedAsset(null); setIsEditing(false); setEditData(selectedAsset); }}>{t('assets.cancel')}</button>
                                <button className="btn-save" title={isCreating ? 'Submit this new asset to the registry' : 'Save all changes to this asset'} onClick={handleSave}>{isCreating ? 'Create Asset' : t('common.saveChanges', 'Save Changes')}</button>
                            </>
                        ) : (
                            <>
                                <button className="btn-nav" title={t('assets.closeThisAssetDetailViewTip')} onClick={() => setSelectedAsset(null)}>{t('assets.close')}</button>
                                <button className="btn-primary" onClick={() => setTimelineAssetId(selectedAsset.ID)} title={t('assets.viewTheFullMaintenanceHistoryTip')} style={{ background: 'rgba(99, 102, 241, 0.2)', border: '1px solid var(--primary)' }}>
                                    <Activity size={16} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} /> {t('assets.timeline')}
                                </button>
                                <button className="btn-primary" onClick={() => setShowDigitalTwin({ id: selectedAsset.ID, desc: selectedAsset.Description })} title={t('assets.openTheInteractiveDigitalTwinTip')} style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.1))', border: '1px solid rgba(99,102,241,0.4)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Cpu size={16} />{t('assets.text.digitalTwin', 'Digital Twin')}</button>
                                <button className="btn-primary" onClick={handleEditClick} title={isForeignPlant ? t('assets.unlockToEdit') : t('assets.modifyRecord')}>{t('assets.edit')}</button>
                                {selectedAsset.Active === false ? (
                                    <button className="btn-save" onClick={handleRestore} title={t('assets.restoreThisDecommissionedAssetBackTip')}>{t('assets.restore')}</button>
                                ) : (
                                    <button className="btn-danger" onClick={handleDelete} title={t('assets.decommissionThisAssetAndFlagTip')}>{t('assets.delete')}</button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        ), document.body)}

        {showHelp && createPortal((
            <div className="modal-overlay print-exclude" style={{ zIndex: 20000 }} onClick={() => setShowHelp(false)}>
                <div className="glass-card modal-content-standard" style={{ maxWidth: '700px', padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '25px 30px', borderBottom: '1px solid var(--glass-border)', flexShrink: 0 }}>
                        <h2 style={{ margin: 0, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <Info size={28} /> {t('assets.equipmentRegistryGuide')}
                        </h2>
                        <button onClick={() => setShowHelp(false)} title={t('assets.closeHelpGuideTip')} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}>
                            <X size={24} />
                        </button>
                    </div>

                    <div style={{ flex: 1, padding: '30px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '25px', lineHeight: '1.6' }}>
                        <section>
                            <h3 style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '10px' }}>1. Advanced Search & Filtering</h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                                {t('assets.theSearchBoxIs')}
                            </p>
                            <div className="panel-box" style={{ background: 'rgba(255,255,255,0.02)', padding: '15px' }}>
                                <ul style={{ paddingLeft: '20px', color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
                                    <li><strong>{t('assets.idSearch')}</strong> {t('assets.enterTheExactAsset')} <code>{t('assets.q7')}</code>{t('assets.forInstantResults')}</li>
                                    <li><strong>{t('assets.metadataSearch')}</strong> {t('assets.searchBySerialNumber')}</li>
                                    <li><strong>{t('assets.categoryFilter')}</strong> {t('assets.useTheDropdownTo')} <code>{t('assets.pump')}</code>, <code>{t('assets.motor')}</code>{t('assets.or')} <code>{t('assets.tank')}</code>.</li>
                                </ul>
                            </div>
                        </section>

                        <section style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '20px' }}>
                            <h3 style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '10px' }}>2. View Modes: List vs. Hierarchy</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                <div className="panel-box" style={{ background: 'rgba(99, 102, 241, 0.05)', padding: '15px' }}>
                                    <div style={{ fontWeight: 'bold', color: 'var(--primary)', marginBottom: '5px' }}>{t('assets.listView')}</div>
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>{t('assets.text.bestForFindingSpecificEquipmen', 'Best for finding specific equipment quickly. Sortable and paginated for large registries.')}</p>
                                </div>
                                <div className="panel-box" style={{ background: 'rgba(99, 102, 241, 0.05)', padding: '15px' }}>
                                    <div style={{ fontWeight: 'bold', color: 'var(--primary)', marginBottom: '5px' }}>{t('assets.hierarchyTreeView')}</div>
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                                        {t('assets.visualizes')} <strong>{t('assets.parentchild')}</strong>{t('assets.text.relationshipsSeeHowSubAssembli', 'relationships. See how sub-assemblies are nested within master machines.')}</p>
                                </div>
                            </div>
                        </section>

                        <section style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '20px' }}>
                            <h3 style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '10px' }}>3. Navigating the "Carrot" (Hierarchy Symbols)</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <div style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center' }}><ChevronRight size={20} /></div>
                                    <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: 0 }}>
                                        <strong>{t('assets.collapsedParent')}</strong> {t('assets.thisEquipmentHasSubcomponents')}
                                    </p>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <div style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center' }}><ChevronDown size={20} /></div>
                                    <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: 0 }}>
                                        <strong>{t('assets.expandedParent')}</strong> {t('assets.currentlyShowingAllNested')}
                                    </p>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <div style={{ width: '20px', display: 'flex', justifyContent: 'center' }}>
                                        <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--text-muted)' }} />
                                    </div>
                                    <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: 0 }}>
                                        <strong>{t('assets.childterminalAsset')}</strong> {t('assets.aComponentThatDoes')}
                                    </p>
                                </div>
                            </div>
                        </section>
                    </div>

                    <div className="modal-footer" style={{ flexShrink: 0, padding: '20px 30px' }}>
                        <button className="btn-primary" onClick={() => setShowHelp(false)} title={t('assets.closeThisHelpInformationTip')} style={{ width: '100%' }}>
                            {t('assets.closeInformation')}
                        </button>
                    </div>
                </div>
            </div>
        ), document.body)}

        {showUnlockModal && createPortal((
            <div className="modal-overlay print-exclude" style={{ zIndex: 9999 }} onClick={() => setShowUnlockModal(false)}>
                <div className="glass-card" style={{ padding: '30px', width: '400px', borderRadius: '12px' }} onClick={e => e.stopPropagation()}>
                    <h3 style={{ margin: '0 0 15px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <PenTool color="var(--primary)" /> {t('assets.unlockEditMode')}
                    </h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '20px' }}>
                        {t('assets.youAreInReadonly')} <strong>{localStorage.getItem('selectedPlantId')}</strong>.
                        Enter this specific location's password to temporarily unlock privileges.
                    </p>

                    {unlockError && <div style={{ color: '#f87171', background: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '6px', marginBottom: '15px' }}>{unlockError}</div>}

                    <form onSubmit={handleUnlockSubmit}>
                        <input
                            type="password"
                            value={unlockPassword}
                            onChange={e => setUnlockPassword(e.target.value)}
                            placeholder={t('assets.locationPassword')}
                            style={{ width: '100%', padding: '12px', background: 'var(--bg-main)', border: '1px solid var(--glass-border)', color: '#fff', borderRadius: '6px', marginBottom: '15px', outline: 'none' }}
                            autoFocus
                            required
                            title={t('assets.enterTheSitespecificOverridePasswordTip')}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button type="button" onClick={() => { setShowUnlockModal(false); setUnlockError(''); setUnlockPassword(''); }} title={t('assets.cancelAndReturnToReadonlyTip')} className="btn-nav">{t('assets.cancel')}</button>
                            <button type="submit" className="btn-save" title={t('assets.verifyPasswordAndUnlockEditingTip')}>{t('assets.unlockAdd')}</button>
                        </div>
                    </form>
                </div>
            </div>
        ), document.body)}
        {dialog && <SmartDialog {...dialog} />}
        {timelineAssetId && (
            <AssetTimeline assetId={timelineAssetId} onClose={() => setTimelineAssetId(null)} />
        )}

        {/* Digital Twin Full-Screen Overlay */}
        {showDigitalTwin && createPortal((
            <div className="modal-overlay print-exclude" style={{ zIndex: 15000, background: 'rgba(0,0,0,0.95)', display: 'flex', flexDirection: 'column' }}>
                <DigitalTwinView
                    assetId={showDigitalTwin.id}
                    assetDescription={showDigitalTwin.desc}
                    onClose={() => setShowDigitalTwin(null)}
                />
            </div>
        ), document.body)}



            {showCameraModal && (
                <CameraCaptureModal 
                    title={cameraMode === 'create' ? "Snap Nameplate (OCR)" : "Capture Asset Photo"}
                    onClose={(needsFallback) => {
                        setShowCameraModal(false);
                        if (needsFallback === true) {
                            fileFallbackRef.current?.click();
                        }
                    }}
                    onCapture={(file) => {
                        const event = { target: { files: [file] } };
                        if (cameraMode === 'create') {
                            handlePreCreateOcrUpload(event);
                        } else {
                            handlePhotoUpload(event);
                        }
                    }} 
                />
            )}
        </>
    );
}

function AssetTreeNode({ node, level, expandedNodes, toggleNode, onView }) {
    const { t } = useTranslation();
    const isExpanded = expandedNodes.has(node.ID);
    const hasChildren = node.children && node.children.length > 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div 
                style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    padding: '8px 12px', 
                    borderRadius: '6px',
                    background: level === 0 ? 'rgba(255,255,255,0.03)' : 'transparent',
                    borderLeft: level > 0 ? '1px solid var(--glass-border)' : 'none',
                    marginLeft: level > 0 ? '20px' : '0',
                    gap: '10px',
                    cursor: 'pointer',
                    hover: { background: 'rgba(255,255,255,0.05)' }
                }}
                className="asset-row-hover"
                onClick={() => hasChildren ? toggleNode(node.ID) : onView(node.ID, node.plantId)}
            >
                <div style={{ width: '20px', display: 'flex', justifyContent: 'center' }}>
                    {hasChildren ? (
                        isExpanded ? <ChevronDown size={16} color="var(--primary)" /> : <ChevronRight size={16} />
                    ) : (
                        <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--text-muted)' }} />
                    )}
                </div>
                
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--primary)', minWidth: '80px', fontSize: '0.9rem' }}>{node.ID}</span>
                    <span style={{ fontSize: '0.9rem', color: '#fff' }}>{node.Description}</span>
                    <span className="badge badge-gray" style={{ fontSize: '0.7rem' }}>{node.AssetType}</span>
                </div>

                <div className="actions" style={{ opacity: 0.6 }}>
                    <button 
                        className="btn-view-standard" 
                        onClick={(e) => { e.stopPropagation(); onView(node.ID, node.plantId); }}
                        style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                        title={`Open full details for ${node.ID}`}
                    >
                        <Eye size={14} /> {t('assets.view')}
                    </button>
                </div>
            </div>

            {hasChildren && isExpanded && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {node.children.map(child => (
                        <AssetTreeNode 
                            key={child.ID} 
                            node={child} 
                            level={level + 1} 
                            expandedNodes={expandedNodes}
                            toggleNode={toggleNode}
                            onView={onView}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
