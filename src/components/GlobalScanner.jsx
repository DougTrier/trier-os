// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Global Logistics & Cross-Plant Parts Hub
 * ======================================================
 * Enterprise-wide parts logistics command center. Enables any plant to find,
 * request, and transfer parts from other facilities in the network — eliminating
 * emergency parts procurement delays. Also embeds the camera barcode scanner
 * and OCR tools for physical parts lookup.
 *
 * MODES / TABS:
 *   Cross-Plant Search    — Search MasterPartIndex across all 40+ facilities
 *                           Results show qty on hand, unit cost, and plant distance
 *   Transfer Requests     — Request → Approve → Ship workflow with status timeline
 *   Transfer Status       — Live tracking of active outbound and inbound transfers
 *   Price Comparison      — Side-by-side price matrix: cheapest source by part number
 *   Barcode Scanner       — Camera-based barcode scan (ZXing) for instant part lookup
 *   OCR Lookup            — Tesseract.js OCR on part labels for text extraction
 *   Asset Intelligence    — Enterprise fleet health overview and asset availability
 *
 * DATA SOURCE: MasterPartIndex and GlobalParts tables in prairie_logistics.db,
 *   populated by the Crawl Engine (server/crawl_engine.js) every 15 minutes.
 *
 * BARCODE FORMATS: QR Code, Code 128, Code 39, EAN-13, UPC-A (via @zxing/library).
 *
 * @param {Function} onClose     - Modal close callback
 * @param {string}   plantId     - Requesting plant identifier
 * @param {string}   plantLabel  - Requesting plant display name
 */
import React, { useState, useEffect, useRef } from 'react';
import { Camera, X, Scan as ScanIcon, Package, HardHat, Plus, Minus, Search, AlertCircle, CheckCircle2, Globe, TrendingDown, BookOpen, Wrench, User, Phone, Mail, AlertTriangle } from 'lucide-react';
import { BrowserMultiFormatReader, DecodeHintType } from '@zxing/library';
import Tesseract, { createWorker } from 'tesseract.js';
import SmartDialog from './SmartDialog';
import { useTranslation } from '../i18n/index.jsx';

export default function GlobalScanner({ onClose, plantId, plantLabel, initialScan }) {
    const { t } = useTranslation();
    // ... initial states same ...
    const [scannedId, setScannedId] = useState('');
    const [scannedData, setScannedData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [manualInput, setManualInput] = useState('');
    const [invAdjust, setInvAdjust] = useState(0);
    const [cameraFailed, setCameraFailed] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [networkMatch, setNetworkMatch] = useState(null);
    const [registrationMode, setRegistrationMode] = useState(null); // 'part' or 'asset'
    const [regData, setRegData] = useState({});
    const [priceAlert, setPriceAlert] = useState(null);
    const [plantManagers, setPlantManagers] = useState([]);
    const [ignoredParts, setIgnoredParts] = useState([]);
    const [lookups, setLookups] = useState({ partClasses: [], assetTypes: [], locations: [] });
    const [dialog, setDialog] = useState(null);
    const [secondsLeft, setSecondsLeft] = useState(initialScan ? 120 : 60); // HW scans get more time since user didn't manually open
    const [isOCRProcessing, setIsOCRProcessing] = useState(false);
    const [ocrFeedback, setOcrFeedback] = useState(null);
    const inputRef = useRef(null);
    const codeReaderRef = useRef(null);
    const videoRef = useRef(null);
    const cameraStreamingRef = useRef(false); // true once camera is actually live (not just requesting permission)
    const processScanRef = useRef(null); // always points to latest processScan (avoids stale closure in hw-inject listener)
    const scanDetectedRef = useRef(false); // prevents double-fire between main stream and rotated-frame interval
    const rotatedIntervalRef = useRef(null);

    useEffect(() => {
        let active = true;
        if (inputRef.current) inputRef.current.focus();

        // Lock orientation to portrait on mobile so the scan UI stays usable
        if (screen.orientation?.lock) {
            screen.orientation.lock('portrait-primary').catch(() => {});
        }

        // ── ROBUST CAMERA RESOURCE MANAGEMENT ─────────────────────────────────
        // We use a ref to cache the MediaStream once ZXing attaches it to the DOM.
        // This allows us to hard-kill the stream even if the video element is 
        // destroyed during an abrupt unmount.
        let capturedNativeStream = null;
        let streamPollInterval = setInterval(() => {
            if (!active) {
                clearInterval(streamPollInterval);
                return;
            }
            const v = document.getElementById('video-preview');
            if (v && v.srcObject) {
                capturedNativeStream = v.srcObject;
                clearInterval(streamPollInterval);
            }
        }, 50);

        const hints = new Map();
        hints.set(DecodeHintType.TRY_HARDER, true);
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
            0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15
        ]);

        const codeReader = new BrowserMultiFormatReader(hints);
        codeReaderRef.current = codeReader;

        const startScanner = async () => {
            try {
                // Pre-check: mediaDevices API available at all?
                const isSecure = location.protocol === 'https:' || location.hostname === 'localhost';
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    setError(isSecure
                        ? "📷 Camera API not available in this browser. Use the 'Take Photo' button below."
                        : "Camera access requires HTTPS. Switch to a secure connection or use Manual Entry.");
                    setCameraFailed(true);
                    return;
                }

                scanDetectedRef.current = false;

                // ── MANUAL STREAM ACQUISITION ───────────────────────────────────────
                // ZXing's 'decodeFromConstraints' utilizes polyfills that clash with
                // iOS Safari Webkit and unpredictably abstracts the stream on Android.
                // We manually claim the core hardware stream for 100% governance.
                const stream = await navigator.mediaDevices.getUserMedia(
                    { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } }
                );
                
                // Fast-cancel check: Did the user close the UI while OS asked for perm?
                if (!active) {
                    stream.getTracks().forEach(t => t.stop());
                    return;
                }
                
                capturedNativeStream = stream;
                
                // Bind the stream to the iOS-safe video tag
                const videoEl = document.getElementById('video-preview');
                if (!videoEl) {
                    stream.getTracks().forEach(t => t.stop());
                    return;
                }
                videoEl.srcObject = stream;
                await videoEl.play().catch(e => { console.warn("Video play interrupted", e); });
                
                if (!active) return; // Second fast-cancel check

                // Bind ZXing to the now strongly-held video element
                codeReader.decodeFromVideoElement(
                    videoEl,
                    (result, err) => {
                        if (result && !scanDetectedRef.current) {
                            scanDetectedRef.current = true;
                            if (rotatedIntervalRef.current) clearInterval(rotatedIntervalRef.current);
                            if (navigator.vibrate) navigator.vibrate(200);
                            codeReader.reset();
                            cameraStreamingRef.current = false;
                            
                            // Safe tear down
                            if (videoEl && videoEl.srcObject) {
                                videoEl.srcObject.getTracks().forEach(t => t.stop());
                                videoEl.srcObject = null;
                            }
                            processScan(result.text);
                        }
                    }
                );

                // Camera is now live — safe to close on visibility change
                cameraStreamingRef.current = true;

                // ── Parallel rotated-frame scan ──────────────────────────────────
                // ZXing TRY_HARDER only scans more horizontal rows — it never rotates
                // the frame. A horizontal barcode (bars running top-to-bottom in the
                // camera view) has its bars parallel to every scan line ZXing tries,
                // so it will never be detected by the main stream. This interval
                // captures a frame every 400ms, rotates it 90°, and tries to decode.
                const rotHints = new Map();
                rotHints.set(DecodeHintType.TRY_HARDER, true);
                rotHints.set(DecodeHintType.POSSIBLE_FORMATS, [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]);
                let rotBusy = false;

                rotatedIntervalRef.current = setInterval(async () => {
                    if (!cameraStreamingRef.current || scanDetectedRef.current || rotBusy) return;
                    const video = document.getElementById('video-preview');
                    if (!video || !video.videoWidth) return;

                    rotBusy = true;
                    try {
                        const rot = document.createElement('canvas');
                        rot.width = video.videoHeight;
                        rot.height = video.videoWidth;
                        const ctx = rot.getContext('2d');
                        ctx.translate(rot.width / 2, rot.height / 2);
                        ctx.rotate(Math.PI / 2);
                        ctx.drawImage(video, -video.videoWidth / 2, -video.videoHeight / 2);

                        const img = document.createElement('img');
                        img.src = rot.toDataURL('image/jpeg', 0.85);
                        await new Promise(r => { img.onload = r; });

                        const rotReader = new BrowserMultiFormatReader(rotHints);
                        const result = await rotReader.decodeFromImageElement(img);

                        if (result && !scanDetectedRef.current && cameraStreamingRef.current) {
                            scanDetectedRef.current = true;
                            clearInterval(rotatedIntervalRef.current);
                            codeReader.reset();
                            cameraStreamingRef.current = false;
                            const v = document.getElementById('video-preview');
                            if (v && v.srcObject) v.srcObject.getTracks().forEach(t => t.stop());
                            if (navigator.vibrate) navigator.vibrate(200);
                            processScanRef.current?.(result.text);
                        }
                    } catch {} // NotFoundException is normal — just means no barcode in this frame
                    rotBusy = false;
                }, 400);
            } catch (err) {
                console.error("ZXing init error:", err);
                setCameraFailed(true);
                
                // Suppress the red error banner if we already have a hardware scan payload.
                // The camera feed isn't needed right now since we are processing the barcode.
                if (initialScan) return;

                const isSecure = location.protocol === 'https:' || location.hostname === 'localhost';
                if (err.name === 'NotAllowedError') {
                    setError("Camera permission denied. Please tap Allow when your browser asks for camera access, then re-open the scanner.");
                } else if (err.name === 'NotFoundError' || err.name === 'NotReadableError') {
                    setError("📷 No camera detected. Use the 'Take Photo' button below.");
                } else if (!isSecure) {
                    setError("Camera access requires HTTPS. Switch to a secure connection or use Manual Entry.");
                } else {
                    setError("Camera unavailable — check browser permissions or use Manual Entry.");
                }
            }
        };

        startScanner();

        // Fetch lookups for registration
        const fetchLookups = async () => {
            try {
                const [pcRes, atRes, locRes] = await Promise.all([
                    fetch('/api/v2/lookups/part-classes'),
                    fetch('/api/lookups/asset-types'),
                    fetch('/api/lookups/locations')
                ]);
                setLookups({
                    partClasses: await pcRes.json() || [],
                    assetTypes: await atRes.json() || [],
                    locations: await locRes.json() || []
                });
            } catch (e) { console.error("Reg lookups error:", e); }
        };
        fetchLookups();

        // Fetch ignored parts
        const currentSite = localStorage.getItem('selectedPlantId');
        if (currentSite) {
            fetch(`/api/v2/network/ignored-prices/${currentSite}`)
                .then(r => r.json())
                .then(setIgnoredParts)
                .catch(e => console.warn('[GlobalScanner] fetch error:', e));
        }
        return () => {
            active = false;
            cameraStreamingRef.current = false;
            clearInterval(streamPollInterval);
            if (rotatedIntervalRef.current) clearInterval(rotatedIntervalRef.current);
            if (codeReaderRef.current) {
                codeReaderRef.current.reset();
            }
            
            // Hard kill the exact OS camera stream we cached
            if (capturedNativeStream) {
                capturedNativeStream.getTracks().forEach(t => t.stop());
                capturedNativeStream = null;
            }
            
            // CRITICAL FOR IOS SAFARI: 
            // WebKit will eternally lock the camera hardware if the video element 
            // is destroyed while it still holds a reference to the srcObject!
            const previewNodes = document.querySelectorAll('#video-preview');
            previewNodes.forEach(node => {
                if (node.srcObject) {
                    node.srcObject.getTracks().forEach(t => t.stop());
                    node.srcObject = null;
                }
            });
            
            try { screen.orientation?.unlock?.(); } catch {}
        };
    }, [plantId]);

    // Battery & Network Health: Stop scanner if tab is hidden or minimized.
    // IMPORTANT: only close once the camera is actually streaming — not during the
    // browser permission dialog, which also briefly sets document.hidden = true on
    // mobile and would otherwise dismiss the scanner before the user can tap Allow.
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden && codeReaderRef.current && cameraStreamingRef.current) {
                codeReaderRef.current.reset();
                cameraStreamingRef.current = false;
                onClose();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [onClose]);

    // Listen for hardware scanner injections from the global wedge (App.jsx)
    useEffect(() => {
        const handleHwInject = (e) => {
            if (e.detail) {
                setSecondsLeft(120);
                processScanRef.current?.(e.detail);
            }
        };
        window.addEventListener('hw-scan-inject', handleHwInject);
        return () => window.removeEventListener('hw-scan-inject', handleHwInject);
    }, []);

    // Battery Saver / Energy Management: Timer to close if no scan detected
    useEffect(() => {
        // Only count down if we are actively scanning (not showing results or loading)
        const isScanning = !scannedData && !networkMatch && !registrationMode && !priceAlert && !loading;
        
        if (!isScanning) return;

        if (secondsLeft <= 0) {
            onClose();
            return;
        }

        const timer = setInterval(() => {
            setSecondsLeft(prev => prev - 1);
        }, 1000);

        return () => clearInterval(timer);
    }, [secondsLeft, scannedData, networkMatch, registrationMode, priceAlert, loading, onClose]);

    const processScan = async (id) => {
        setLoading(true);
        setError(null);
        setSuccess(null);
        setScannedId(id);
        const cleanId = id.trim();
        setScannedData(null);
        setNetworkMatch(null);
        setPriceAlert(null);
        setInvAdjust(0);

        try {
            const authHeaders = { 
                'x-plant-id': plantId
            };

            // Safe fetch wrapper: if the endpoint doesn't exist (returns HTML 404), do not crash on JSON.parse
            const safeFetch = async (url) => {
                const r = await fetch(url, { headers: authHeaders });
                try {
                    const txt = await r.text();
                    try { return [r, JSON.parse(txt)]; } catch { return [r, {}]; }
                } catch { return [r, {}]; }
            };

            let type = 'part';
            let [res, data] = await safeFetch(`/api/parts/${encodeURIComponent(cleanId)}`);

            if (!res.ok || !data.ID) {
                type = 'asset';
                [res, data] = await safeFetch(`/api/assets/${encodeURIComponent(cleanId)}`);
            }

            if (!res.ok || (!data.ID && !data.WorkOrderNumber)) {
                type = 'sop';
                [res, data] = await safeFetch(`/api/procedures/${encodeURIComponent(cleanId)}`);
            }

            if (!res.ok || (!data.ID && !data.WorkOrderNumber)) {
                type = 'job';
                [res, data] = await safeFetch(`/api/work-orders/${encodeURIComponent(cleanId)}`);
            }

            if (res.ok && (data.ID || data.WorkOrderNumber)) {
                setScannedData({ ...data, type });
                // Background price check across all plants — fire and forget, never blocks scan result
                if (type === 'part') {
                    fetch(`/api/v2/network/sync/${encodeURIComponent(cleanId)}`, { headers: authHeaders })
                        .then(r => r.text()).then(t => { try { return JSON.parse(t); } catch { return {}; } }).catch(() => ({}))
                        .then(netData => { if (netData && netData.found && netData.cheapest) setNetworkMatch(netData.cheapest); })
                        .catch(() => {});
                }
            } else {
                // Item not found locally — show unknown immediately, then check network in background
                const isSOP = cleanId.toUpperCase().startsWith('SOP');
                setScannedData({ 
                    type: 'unknown', 
                    ID: cleanId, 
                    Description: isSOP ? 'Unrecognized Procedure' : 'Unrecognized Item',
                    isSOPHint: isSOP
                });
                // Background: sweep all plants — if found, update the result
                const upperId = cleanId.toUpperCase();
                fetch(`/api/v2/network/sync/${encodeURIComponent(upperId)}`, { headers: authHeaders })
                    .then(r => r.text()).then(t => { try { return JSON.parse(t); } catch { return {}; } }).catch(() => ({}))
                    .then(netData => { if (netData && netData.found && netData.cheapest) setNetworkMatch(netData.cheapest); })
                    .catch(() => {});
            }
        } catch (err) {
            setError("Communication failure. Please check network.");
        } finally {
            setLoading(false);
        }
    };
    // Keep ref current so the hw-inject listener (registered once with [] deps) always
    // calls the latest processScan — avoids stale closure without adding it to effect deps.
    processScanRef.current = processScan;

    // Auto-process a hardware scan that was passed in before this component mounted,
    // OR one that arrives while the camera UI is already open.
    useEffect(() => {
        if (initialScan) processScanRef.current(initialScan);
    }, [initialScan]);

    const handleNetworkImport = async () => {
        if (!networkMatch) return;
        setIsSaving(true);
        try {
            const res = await fetch('/api/v2/network/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                body: JSON.stringify({
                    type: networkMatch.type,
                    data: networkMatch.data,
                    sourcePlant: networkMatch.plantLabel
                })
            });
            if (res.ok) {
                setSuccess(`ID and Description imported. Now set your local stock and price.`);
                setError(null);
                setRegistrationMode(networkMatch.type);
                setRegData({
                    Description: networkMatch.Description,
                    Stock: 0,
                    UnitCost: networkMatch.UnitCost || 0 // Pre-fill with network cost if available
                });
                // Note: We leave networkMatch set so handleSaveNew can compare prices
            }
        } catch (err) {
            setError("Import failed.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleAdjustment = async () => {
        if (!scannedData || invAdjust === 0) return;
        setIsSaving(true);
        try {
            const res = await fetch(`/api/parts/${scannedData.ID}/adjust`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'x-plant-id': plantId
                },
                body: JSON.stringify({ qty: invAdjust, reason: 'Global Scan Quick Adjust', type: invAdjust < 0 ? '1' : '2' })
            });
            if (res.ok) {
                setScannedData(prev => ({ ...prev, Stock: (prev.Stock || 0) + invAdjust }));
                setInvAdjust(0);
                setTimeout(() => setError("Inventory Updated Successfully"), 100);
                setTimeout(() => setError(null), 3000);
            }
        } catch (err) {
            setError("Failed to update inventory.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleImportVendor = async () => {
        if (!priceAlert || !priceAlert.vendId) {
            setError("No Vendor Information Available for import.");
            return;
        }
        setIsSaving(true);
        try {
            const res = await fetch(`/api/v2/network/vendor/${priceAlert.vendId}?plantId=${priceAlert.sourcePlantId}`);
            if (!res.ok) throw new Error("Failed to fetch vendor");
            const vendorData = await res.json();
            
            await fetch('/api/v2/network/vendor/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                body: JSON.stringify({ vendorData })
            });
            
            await fetch(`/api/parts/${scannedId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                body: JSON.stringify({ VendID: priceAlert.vendId, UnitCost: priceAlert.betterPrice })
            });
            
            setSuccess(`Vendor info and better price ($${priceAlert.betterPrice}) imported from ${priceAlert.sourcePlant}!`);
            setPriceAlert(null);
            processScan(scannedId);
        } catch (err) {
            setError("Vendor import failed.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleFallbackImage = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setLoading(true);
        setError(null);
        setOcrFeedback("Processing Photo...");
        setIsOCRProcessing(true);
        
        const imageUrl = URL.createObjectURL(file);
        const img = document.createElement('img');
        img.src = imageUrl;
        img.onload = async () => {
            try {
                const hints = new Map();
                hints.set(DecodeHintType.TRY_HARDER, true);
                hints.set(DecodeHintType.POSSIBLE_FORMATS, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
                const reader = new BrowserMultiFormatReader(hints);
                const result = await reader.decodeFromImageElement(img);
                URL.revokeObjectURL(imageUrl);
                setLoading(false);
                setIsOCRProcessing(false);
                processScan(result.text);
            } catch (err) {
                try {
                    setOcrFeedback("No Barcode Found. Trying Text OCR...");
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    canvas.getContext('2d').drawImage(img, 0, 0);
                    
                    const { data: { text } } = await Tesseract.recognize(
                        canvas.toDataURL('image/jpeg'), 'eng'
                    );
                    URL.revokeObjectURL(imageUrl);
                    
                    let cleanSerial = text.replace(/S\/N[:.\s]*/gi, '')
                        .replace(/SERIAL[:.\s]*/gi, '')
                        .replace(/MODEL[:.\s]*/gi, '')
                        .replace(/[^A-Z0-9-]/gi, '').trim();
                        
                    if (cleanSerial.length > 3) {
                        if (registrationMode) {
                            setRegData(prev => ({ ...prev, Serial: cleanSerial }));
                        } else {
                            setScannedData({ type: 'unknown', ID: cleanSerial, Description: 'Extracted from Photo' });
                            setSuccess(`OCR Extracted: [${cleanSerial}]`);
                        }
                    } else {
                        setError("No barcode or readable text found in photo.");
                    }
                } catch(ocrErr) {
                    URL.revokeObjectURL(imageUrl);
                    setError("Failed to process photo.");
                } finally {
                    setIsOCRProcessing(false);
                    setLoading(false);
                }
            }
        };
    };

    const handleOCRSerial = async () => {
        setIsOCRProcessing(true);
        setOcrFeedback("Initializing AI Engine...");
        
        try {
            const video = document.getElementById('video-preview');
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            
            // Draw current frame to canvas
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Crop to center rectangle to improve accuracy
            const cropWidth = canvas.width * 0.8;
            const cropHeight = canvas.height * 0.4;
            const cropX = (canvas.width - cropWidth) / 2;
            const cropY = (canvas.height - cropHeight) / 2;
            
            const croppedCanvas = document.createElement('canvas');
            croppedCanvas.width = cropWidth;
            croppedCanvas.height = cropHeight;
            croppedCanvas.getContext('2d').drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
            
            setOcrFeedback("Vibe Check: Analyzing Nameplate...");
            
            const { data: { text } } = await Tesseract.recognize(
                croppedCanvas.toDataURL('image/jpeg'),
                'eng',
                { logger: m => {
                    if (m.status === 'recognizing text') {
                        setOcrFeedback(`OCR: ${Math.round(m.progress * 100)}%`);
                    }
                }}
            );

            // Clean result: Remove common noise, spaces, and labels
            let cleanSerial = text
                .replace(/S\/N[:.\s]*/gi, '')
                .replace(/SERIAL[:.\s]*/gi, '')
                .replace(/MODEL[:.\s]*/gi, '')
                .replace(/[^A-Z0-9-]/gi, '')
                .trim();
            
            if (cleanSerial.length > 3) {
                if (registrationMode) {
                    setRegData(prev => ({ ...prev, Serial: cleanSerial }));
                } else {
                    setScannedData(prev => ({ ...prev, Serial: cleanSerial }));
                    // Prompt to save
                    setSuccess(`OCR Success: Extracted [${cleanSerial}]`);
                }
            } else {
                setError("Low confidence scan. Please try closer or enter manually.");
            }

        } catch (err) {
            console.error("OCR Error:", err);
            setError("Vision Engine failed. Using manual fallback.");
        } finally {
            setIsOCRProcessing(false);
            setOcrFeedback(null);
        }
    };

    // Manually capture the current video frame and try decoding it — including
    // a 90° rotated version — so horizontal barcodes that the continuous stream
    // misses can still be read.
    const handleForceScan = async () => {
        const video = document.getElementById('video-preview');
        if (!video || !video.videoWidth) return;

        const hints = new Map();
        hints.set(DecodeHintType.TRY_HARDER, true);
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);

        const tryDecode = async (canvas) => {
            const reader = new BrowserMultiFormatReader(hints);
            const img = document.createElement('img');
            img.src = canvas.toDataURL('image/jpeg');
            await new Promise(r => { img.onload = r; });
            return reader.decodeFromImageElement(img);
        };

        // Capture current frame
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);

        try {
            const result = await tryDecode(canvas);
            if (navigator.vibrate) navigator.vibrate(200);
            processScan(result.text);
            return;
        } catch {}

        // Rotate 90° and try again — handles barcodes perpendicular to normal orientation
        try {
            const rotated = document.createElement('canvas');
            rotated.width = canvas.height;
            rotated.height = canvas.width;
            const ctx = rotated.getContext('2d');
            ctx.translate(rotated.width / 2, rotated.height / 2);
            ctx.rotate(Math.PI / 2);
            ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
            const result = await tryDecode(rotated);
            if (navigator.vibrate) navigator.vibrate(200);
            processScan(result.text);
        } catch {
            setError("No barcode detected. Hold camera steady and tap Scan again.");
            setTimeout(() => setError(null), 3000);
        }
    };

    const handleContactManager = async () => {
        if (!priceAlert) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/v2/network/site-contacts/${encodeURIComponent(priceAlert.sourcePlantId)}`, {
                headers: {  }
            });
            if (!res.ok) throw new Error("Failed to fetch plant managers");
            const managers = await res.json();
            setPlantManagers(managers);
        } catch (err) {
            setError("Failed to load plant managers.");
        } finally {
            setLoading(false);
        }
    };

    const handleIgnorePrice = async () => {
        if (!scannedId || !plantId) return;
        setIsSaving(true);
        try {
            const res = await fetch('/api/v2/network/ignore-price', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ partId: scannedId, plantId: plantId })
            });
            if (res.ok) {
                setIgnoredParts(prev => [...prev, scannedId]);
                setSuccess("Price alert ignored for this item.");
                setPriceAlert(null);
            } else {
                throw new Error("Failed to ignore price alert.");
            }
        } catch (err) {
            setError(err.message || "Failed to ignore price alert.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveNew = async () => {
        const activeRole = localStorage.getItem('userRole');
        const isCreator = localStorage.getItem('PF_USER_IS_CREATOR') === 'true';
        const isAdminOrCreator = ['it_admin', 'creator'].includes(activeRole) || isCreator;

        if (isAdminOrCreator) {
            setDialog({
                type: 'question',
                title: 'Multi-Site Verification',
                message: `You are about to register this NEW ${registrationMode || 'item'} into the [${plantLabel}] database. Is this correct?`,
                confirmLabel: 'Yes, Register',
                onConfirm: () => performSaveNew(),
                onCancel: () => setDialog(null)
            });
            return;
        }

        await performSaveNew();
    };

    const performSaveNew = async () => {
        setDialog(null);
        setIsSaving(true);
        try {
            const endpointMap = {
                'part': '/api/parts',
                'asset': '/api/assets',
                'sop': '/api/procedures',
                'job': '/api/work-orders'
            };
            const endpoint = endpointMap[registrationMode] || '/api/parts';
            
            const payload = {
                ...regData,
                ID: scannedId,
                PF_Plant_ID: plantId
            };

            // Work Orders usually need WorkOrderNumber instead of ID in some contexts, but internal ID is primary
            if (registrationMode === 'job') {
                payload.WorkOrderNumber = scannedId;
            }

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                let message = "Item successfully registered localy.";
                
                // Price Intelligence Check - Now using sanitized UnitCostNum from system
                const localCost = parseFloat((regData.UnitCost || '0').toString().replace(/[^0-9.]/g, ''));
                const networkBest = networkMatch ? networkMatch.UnitCostNum : null;

                if (networkMatch && networkBest !== null && localCost > networkBest && !ignoredParts.includes(scannedId)) {
                    setPriceAlert({
                        betterPrice: networkBest,
                        sourcePlant: networkMatch.plantLabel,
                        sourcePlantId: networkMatch.plantId,
                        vendId: networkMatch.data.VendID
                    });
                } else if (networkMatch && networkBest !== null && localCost < networkBest) {
                    // Global Notification for better local price
                    fetch('/api/v2/network/price-alert', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ partId: scannedId, price: localCost, plantId })
                    });
                }
                
                setRegistrationMode(null);
                setSuccess(message);
                processScan(scannedId);
            }
            else {
                let errData = {};
                try { errData = JSON.parse(await res.text()); } catch(e) {}
                setError(errData.error || "Save failed.");
            }
        } catch (err) {
            setError("Communication error during save.");
        } finally {
            setIsSaving(false);
        }
    };

    const renderContent = () => {
        if (priceAlert) {
            return (
                <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#10b981', marginBottom: '20px' }}>
                        <TrendingDown size={32} />
                        <h2 style={{ margin: 0 }}>{t('global.scanner.betterPriceFound')}</h2>
                    </div>
                    
                    <div style={{ background: 'rgba(16, 185, 129, 0.05)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.3)', marginBottom: '20px' }}>
                        <p style={{ margin: '0 0 10px 0', fontSize: '1.1rem' }}>
                            <strong>{priceAlert.sourcePlant}</strong> {t('globalScanner.pays')} <strong>${Number(priceAlert.betterPrice).toFixed(2)}</strong> for this item.
                        </p>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {priceAlert.vendId ? (
                            <button onClick={handleImportVendor} disabled={isSaving} className="btn-save" style={{ padding: '12px' }} title={t('globalScanner.importVendorInformationAndBetterTip')}>
                                <Globe size={18} style={{ marginRight: '8px' }} /> {isSaving ? 'Importing...' : 'Import Vendor & Pricing'}
                            </button>
                        ) : (
                            <div style={{ 
                                padding: '15px', 
                                background: 'rgba(239, 68, 68, 0.1)', 
                                color: '#f87171', 
                                borderRadius: '12px', 
                                fontSize: '0.85rem', 
                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px'
                            }}>
                                <AlertTriangle size={24} />
                                <div>
                                    <strong>{t('global.scanner.noVendorInformationFound')}</strong> Pricing cannot be imported automatically. Please contact the site to verify procurement details.
                                </div>
                            </div>
                        )}
                        
                        <button onClick={handleContactManager} className="btn-secondary" title={t('globalScanner.viewContactInformationForThisTip')}>
                            <User size={18} style={{ marginRight: '8px' }} /> {t('global.scanner.openSiteContacts')}
                        </button>

                        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                            <button onClick={() => setPriceAlert(null)} className="btn-secondary" style={{ flex: 1, padding: '12px' }} title={t('globalScanner.dismissThisAlertAndReviewTip')}>{t('global.scanner.reviewLater')}</button>
                            <button onClick={handleIgnorePrice} className="btn-danger-glass" style={{ flex: 1, padding: '12px' }} title={t('globalScanner.permanentlyIgnorePriceAlertsForTip')}>{t('global.scanner.ignoreAlert')}</button>
                        </div>
                    </div>

                    {plantManagers.length > 0 && (
                        <div style={{ marginTop: '25px', padding: '15px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                            <h4 style={{ margin: '0 0 15px 0', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Site Contacts at {priceAlert.sourcePlant}</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {plantManagers.map((m, idx) => (
                                    <div key={m.Username || m.DisplayName || idx} style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
                                        <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}><User size={12} /> {m.DisplayName || m.Username}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{m.Title || 'Management'}</div>
                                        <div style={{ display: 'flex', gap: '15px', marginTop: '8px' }}>
                                            {m.Phone && <a href={`tel:${m.Phone}`} style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '5px', textDecoration: 'none', fontSize: '0.8rem' }}><Phone size={12} /> {t('global.scanner.call')}</a>}
                                            {m.Email && <a href={`mailto:${m.Email}`} style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '5px', textDecoration: 'none', fontSize: '0.8rem' }}><Mail size={12} /> {t('global.scanner.email')}</a>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            );
        }

        if (loading) {
            return (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                    <div className="spinning" style={{ border: '4px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', width: '40px', height: '40px', margin: '0 auto 15px auto' }} />
                    <p>{t('global.scanner.sweepingTrierNetwork')}</p>
                </div>
            );
        }

        if (registrationMode) {
            return (
                <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
                    <div style={{ background: 'rgba(99, 102, 241, 0.1)', padding: '20px', borderRadius: '12px', border: '1px solid #6366f1', marginBottom: '20px' }}>
                        <h3 style={{ margin: '0 0 10px 0' }}>Registering {registrationMode.toUpperCase()}</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '5px' }}>{t('global.scanner.description')}</label>
                                <input 
                                    type="text" 
                                    autoFocus
                                    value={regData.Description || ''} 
                                    onChange={(e) => setRegData({...regData, Description: e.target.value})}
                                    style={{ width: '100%', padding: '12px' }}
                                    placeholder={t('global.scanner.enterItemName')}
                                    title={t('globalScanner.enterADescriptionForThisTip')}
                                />
                            </div>

                            {registrationMode === 'part' ? (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '5px' }}>{t('global.scanner.initialStock')}</label>
                                        <input 
                                            type="number" 
                                            value={regData.Stock === 0 ? '' : (regData.Stock || '')} 
                                            onChange={(e) => setRegData({...regData, Stock: e.target.value === '' ? '' : parseInt(e.target.value, 10)})}
                                            style={{ width: '100%', padding: '12px' }}
                                            title={t('globalScanner.enterTheInitialStockQuantityTip')}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '5px' }}>Unit Cost ($)</label>
                                        <input 
                                            type="number" 
                                            value={regData.UnitCost === 0 ? '' : (regData.UnitCost || '')} 
                                            onChange={(e) => setRegData({...regData, UnitCost: e.target.value === '' ? '' : parseFloat(e.target.value)})}
                                            style={{ width: '100%', padding: '12px' }}
                                            title={t('globalScanner.enterTheUnitCostInTip')}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '5px' }}>Serial Number</label>
                                        <input 
                                            type="text" 
                                            value={regData.Serial || ''} 
                                            onChange={(e) => setRegData({...regData, Serial: e.target.value})}
                                            style={{ width: '100%', padding: '12px' }}
                                            title={t('globalScanner.enterTheSerialNumberForTip')}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '5px' }}>{t('global.scanner.modelId')}</label>
                                        <input 
                                            type="text" 
                                            value={regData.Model || ''} 
                                            onChange={(e) => setRegData({...regData, Model: e.target.value})}
                                            style={{ width: '100%', padding: '12px' }}
                                            title={t('globalScanner.enterTheModelNumberOrTip')}
                                        />
                                    </div>
                                </div>
                            )}

                            <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                                <button onClick={() => setRegistrationMode(null)} className="btn-secondary" style={{ flex: 1 }} title={t('globalScanner.goBackToThePreviousTip')}>{t('global.scanner.back')}</button>
                                <button 
                                    onClick={handleSaveNew} 
                                    disabled={isSaving || !regData.Description} 
                                    className="btn-save" 
                                    style={{ flex: 2 }}
                                    title={t('globalScanner.saveThisNewItemToTip')}
                                >
                                    {isSaving ? 'Saving...' : '✅ Save to System'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        if (scannedData) {
            if (scannedData.type === 'unknown') {
                return (
                    <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
                        <div style={{ background: 'rgba(251, 191, 36, 0.1)', padding: '20px', borderRadius: '12px', border: '1px solid #facc15', marginBottom: '20px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '10px', color: '#facc15' }}>
                                <AlertCircle size={24} /> <span style={{ fontWeight: 'bold' }}>{t('global.scanner.unrecognizedBarcode')}</span>
                            </div>
                            <h3 style={{ margin: '0 0 5px 0' }}>{scannedId}</h3>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('global.scanner.thisItemIsNot')}</p>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <button onClick={() => { setRegistrationMode('part'); setRegData({ Description: '', Stock: 0, UnitCost: 0 }); }} className="btn-primary" title={t('globalScanner.registerThisBarcodeAsATip')}>
                                <Package size={18} style={{ marginRight: '8px' }} /> {t('global.scanner.registerAsNewPart')}
                            </button>
                            <button onClick={() => { setRegistrationMode('asset'); setRegData({ Description: '', Serial: '', Model: '' }); }} className="btn-secondary" title={t('globalScanner.registerThisBarcodeAsATip')}>
                                <HardHat size={18} style={{ marginRight: '8px' }} /> {t('global.scanner.registerAsNewAsset')}
                            </button>
                            <button onClick={() => { setRegistrationMode('sop'); setRegData({ Description: '' }); }} className="btn-secondary" title={t('globalScanner.registerThisBarcodeAsATip')}>
                                <BookOpen size={18} style={{ marginRight: '8px' }} /> {t('global.scanner.registerAsNewSop')}
                            </button>
                            <button onClick={() => { setScannedData(null); setManualInput(''); }} className="btn-nav" style={{ marginTop: '10px' }} title={t('globalScanner.clearAndScanADifferentTip')}>{t('global.scanner.tryAnotherScan')}</button>
                        </div>
                    </div>
                );
            }

            return (
                <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
                    <div style={{ background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)', marginBottom: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                            {scannedData.type === 'part' && <Package color="#34d399" />}
                            {scannedData.type === 'asset' && <HardHat color="#facc15" />}
                            {scannedData.type === 'sop' && <BookOpen color="#ec4899" />}
                            {scannedData.type === 'job' && <Wrench color="#6366f1" />}
                            <span style={{ 
                                textTransform: 'uppercase', 
                                fontSize: '0.75rem', 
                                fontWeight: 'bold', 
                                color: scannedData.type === 'part' ? '#34d399' : 
                                       scannedData.type === 'asset' ? '#facc15' : 
                                       scannedData.type === 'job' ? '#6366f1' : '#ec4899' 
                            }}>{scannedData.type} FOUND</span>
                        </div>
                        <h3 style={{ margin: '0 0 5px 0' }}>{scannedData.Description || scannedData.Tasks || 'Active Item'}</h3>
                        <code style={{ color: 'var(--primary)', fontSize: '1.1rem' }}>ID: {scannedData.ID || scannedData.WorkOrderNumber}</code>
                    </div>
                    {scannedData.type === 'part' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            {/* NEW: Price comparison UI if found in network */}
                            {networkMatch && networkMatch.UnitCostNum > 0 && (
                                <div style={{ 
                                    background: 'rgba(16, 185, 129, 0.1)', 
                                    padding: '12px', 
                                    borderRadius: '12px', 
                                    border: '1px solid rgba(16, 185, 129, 0.3)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px'
                                }}>
                                    <TrendingDown size={24} color="#10b981" />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('global.scanner.networkSourcingAlert')}</div>
                                        <div style={{ fontSize: '0.9rem' }}>
                                            <strong>{networkMatch.plantLabel}</strong> {t('globalScanner.pays')} <strong>${networkMatch.UnitCostNum.toFixed(2)}</strong> (vs local ${parseFloat((scannedData.UnitCost || '0').toString().replace(/[^0-9.]/g, '')).toFixed(2)})
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{scannedData.Stock || 0} in stock</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '12px' }}>
                                    <button onClick={() => setInvAdjust(v => v - 1)} className="btn-nav" title={t('globalScanner.decreaseAdjustmentQuantityTip')}><Minus /></button>
                                    <span style={{ fontSize: '1.2rem', minWidth: '30px', textAlign: 'center' }}>{invAdjust > 0 ? `+${invAdjust}` : invAdjust}</span>
                                    <button onClick={() => setInvAdjust(v => v + 1)} className="btn-nav" title={t('globalScanner.increaseAdjustmentQuantityTip')}><Plus /></button>
                                </div>
                            </div>
                            <button disabled={invAdjust === 0 || isSaving} onClick={handleAdjustment} className="btn-save" style={{ width: '100%' }} title={t('globalScanner.applyTheInventoryAdjustmentTip')}>{t('global.scanner.commitChange')}</button>
                        </div>
                    )}

                    {scannedData.type === 'asset' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{t('global.scanner.serialNumber')}</div>
                                <div style={{ fontWeight: 'bold' }}>{scannedData.Serial || 'UNSET'}</div>
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button 
                                    onClick={() => {
                                        setRegistrationMode('asset');
                                        setRegData({ ...scannedData });
                                    }}
                                    className="btn-secondary" 
                                    style={{ flex: 1 }}
                                    title={t('globalScanner.manuallyEditThisAssetsDetailsTip')}
                                >
                                    {t('global.scanner.manualEdit')}
                                </button>
                                <button 
                                    onClick={() => {
                                        setScannedData(null);
                                        setRegistrationMode(null);
                                        // Resetting scannedData to null will trigger the camera view again
                                        // We can then use handleOCRSerial while the camera is active
                                        setError("Point camera at serial plate and tap OCR below.");
                                    }}
                                    className="btn-primary" 
                                    style={{ flex: 1 }}
                                    title={t('globalScanner.useCameraOcrToCaptureTip')}
                                >
                                    {t('global.scanner.ocrScan')}
                                </button>
                            </div>
                        </div>
                    )}
                    <button onClick={() => { setScannedData(null); setNetworkMatch(null); setManualInput(''); }} className="btn-nav" style={{ width: '100%', marginTop: '20px' }} title={t('globalScanner.clearResultsAndScanAnotherTip')}>{t('global.scanner.scanAnother')}</button>
                </div>
            );
        }

        if (networkMatch) {
            return (
                <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
                    <div style={{ background: 'rgba(52, 211, 153, 0.1)', padding: '20px', borderRadius: '12px', border: '1px solid #34d399', marginBottom: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', color: '#34d399' }}>
                            <Globe size={20} /> <span style={{ fontWeight: 'bold', fontSize: '0.8rem' }}>{t('global.scanner.networkMatchFound')}</span>
                        </div>
                        <h3 style={{ margin: '0 0 5px 0' }}>{networkMatch.Description}</h3>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{t('global.scanner.foundAt')} <strong>{networkMatch.plantLabel}</strong></div>
                        {networkMatch.type === 'part' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', color: '#34d399', fontSize: '1.1rem', fontWeight: 'bold' }}>
                                <TrendingDown size={18} /> Best Price: ${networkMatch.UnitCost}
                            </div>
                        )}
                    </div>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                        This {networkMatch.type.toUpperCase()} is not in your current inventory. Would you like to import it?
                    </p>
                    <button onClick={handleNetworkImport} disabled={isSaving} className="btn-save" style={{ width: '100%' }} title={t('globalScanner.importThisItemFromTheTip')}>
                        {isSaving ? 'Importing...' : `📥 Import from ${networkMatch.plantLabel}`}
                    </button>
                    <button onClick={() => { setNetworkMatch(null); setManualInput(''); }} className="btn-nav" style={{ width: '100%', marginTop: '10px' }} title={t('globalScanner.cancelNetworkImportTip')}>{t('global.scanner.cancel')}</button>
                </div>
            );
        }

        // Default: Camera scanning state
        return (
            <div style={{ position: 'relative' }}>
                <div style={{ position: 'relative', marginBottom: '20px' }}>
                    {!cameraFailed ? (
                        <>
                            <video id="video-preview" playsInline autoPlay muted controls={false} style={{ width: '100%', minHeight: '300px', borderRadius: '16px', background: '#000', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 1, border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px' }}>
                        <div className="scanning-line" style={{ position: 'absolute', width: '100%', height: '2px', background: 'var(--primary)', top: '50%', animation: 'scanMove 3s infinite ease-in-out' }} />
                        <div style={{ position: 'absolute', top: '20px', left: '20px', width: '30px', height: '30px', borderTop: '4px solid var(--primary)', borderLeft: '4px solid var(--primary)' }} />
                        <div style={{ position: 'absolute', top: '20px', right: '20px', width: '30px', height: '30px', borderTop: '4px solid var(--primary)', borderRight: '4px solid var(--primary)' }} />
                        <div style={{ position: 'absolute', bottom: '20px', left: '20px', width: '30px', height: '30px', borderBottom: '4px solid var(--primary)', borderLeft: '4px solid var(--primary)' }} />
                        <div style={{ position: 'absolute', bottom: '20px', right: '20px', width: '30px', height: '30px', borderBottom: '4px solid var(--primary)', borderRight: '4px solid var(--primary)' }} />
                    </div>
                    
                        </>
                    ) : (
                        <div style={{ width: '100%', minHeight: '300px', borderRadius: '16px', background: 'rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed rgba(255,255,255,0.2)' }}>
                            <Camera size={48} color="var(--text-muted)" style={{ marginBottom: '15px' }} />
                            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '0 20px', marginBottom: '20px' }}>
                                Live Camera is blocked by your browser's security settings.
                            </p>
                            <label className="btn-save" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px' }}>
                                <Camera size={18} /> Take Photo / Upload
                                <input type="file" accept="image/jpeg,image/png,image/heic,image/heif" capture="environment" onChange={handleFallbackImage} style={{ display: 'none' }} />
                            </label>
                        </div>
                    )}
                    
                    {/* Energy Saver UI */}
                    <div style={{ 
                        position: 'absolute', 
                        bottom: '15px', 
                        left: '50%', 
                        transform: 'translateX(-50%)', 
                        zIndex: 10,
                        background: 'rgba(0,0,0,0.8)',
                        padding: '8px 16px',
                        borderRadius: '25px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        border: secondsLeft < 15 ? '1px solid #ef4444' : '1px solid var(--primary)',
                        backdropFilter: 'blur(8px)',
                        boxShadow: secondsLeft < 15 ? '0 0 15px rgba(239, 68, 68, 0.4)' : 'none'
                    }}>
                        <div style={{ 
                            width: '12px', 
                            height: '12px', 
                            borderRadius: '50%', 
                            background: secondsLeft < 15 ? '#ef4444' : '#10b981',
                            boxShadow: secondsLeft < 15 ? '0 0 10px #ef4444' : '0 0 8px #10b981',
                            animation: secondsLeft < 15 ? 'pulse 1s infinite' : 'none'
                        }} />
                        <span style={{ fontSize: '0.8rem', color: secondsLeft < 15 ? '#ef4444' : '#fff', fontWeight: 'bold' }}>
                            {secondsLeft < 15 ? `Engine Auto-Shutoff: ${secondsLeft}s` : `Scanner Active (${secondsLeft}s)`}
                        </span>
                        <button 
                            onClick={(e) => { e.stopPropagation(); setSecondsLeft(90); }} 
                            style={{ background: 'var(--primary)', border: 'none', color: '#fff', fontSize: '0.7rem', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                            title={t('globalScanner.extendScannerActiveTimeTip')}
                        >
                            {t('global.scanner.keepOn')}
                        </button>
                    </div>

                    {/* SCAN / OCR TRIGGER BUTTONS */}
                    <div style={{ position: 'absolute', bottom: '70px', left: '0', right: '0', display: 'flex', justifyContent: 'center', gap: '10px', padding: '0 15px', zIndex: 10 }}>
                        <button
                            onClick={handleForceScan}
                            className="btn-primary"
                            style={{
                                flex: 1,
                                background: 'rgba(16, 185, 129, 0.9)',
                                backdropFilter: 'blur(10px)',
                                color: '#fff',
                                border: '2px solid rgba(255,255,255,0.2)',
                                padding: '12px',
                                borderRadius: '12px',
                                fontWeight: 'bold',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                boxShadow: '0 4px 15px rgba(0,0,0,0.3)'
                            }}
                            title="Tap to capture and decode barcode in any orientation"
                        >
                            <ScanIcon size={18} /> Tap to Scan
                        </button>
                        <button
                            onClick={handleOCRSerial}
                            disabled={isOCRProcessing}
                            className="btn-primary"
                            style={{
                                flex: 1,
                                background: 'rgba(99, 102, 241, 0.9)',
                                backdropFilter: 'blur(10px)',
                                color: '#fff',
                                border: '2px solid rgba(255,255,255,0.2)',
                                padding: '12px',
                                borderRadius: '12px',
                                fontWeight: 'bold',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                boxShadow: '0 4px 15px rgba(0,0,0,0.3)'
                            }}
                            title={t('globalScanner.useOcrToReadSerialTip')}
                        >
                            {isOCRProcessing ? (
                                <div className="spinning" style={{ border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', width: '16px', height: '16px' }} />
                            ) : <Camera size={18} />}
                            {isOCRProcessing ? (ocrFeedback || 'OCR...') : 'Capture Serial'}
                        </button>
                    </div>
                </div>

                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('global.scanner.positionBarcodeWithinThe')}</p>
                    {scannedId && (
                        <div style={{ marginTop: '10px', fontSize: '0.8rem', color: '#34d399' }}>
                            {t('global.scanner.lastSeen')} <strong>{scannedId}</strong>
                        </div>
                    )}
                </div>

                <div style={{ padding: '15px', borderTop: '1px solid var(--glass-border)' }}>
                    <div style={{ position: 'relative' }}>
                        <input 
                            type="text" 
                            placeholder={t('global.scanner.manualEntry')} 
                            value={manualInput} 
                            onChange={(e) => setManualInput(e.target.value)} 
                            onKeyDown={(e) => e.key === 'Enter' && processScan(manualInput)}
                            style={{ width: '100%', paddingLeft: '40px', height: '45px' }}
                            title={t('globalScanner.typeAPartNumberAssetTip')}
                        />
                        <Search size={18} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--text-muted)' }} />
                    </div>
                </div>

            </div>
        );
    };

    return (
        <div className="modal-overlay" style={{ zIndex: 10000 }}>
            <div className="glass-card" style={{ width: '90%', maxWidth: '600px', padding: '30px', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>

                {/*
                  * Android IME KeyTrap
                  * ───────────────────
                  * Zebra DataWedge "Keystroke Output" routes through Android's IME
                  * system, not the hardware keyboard path. Android silently drops
                  * IME injections when there is no focused <input> on the page —
                  * they never reach the browser's event system at all, so no amount
                  * of document-level keydown/keypress listeners will see them.
                  *
                  * This invisible off-screen input holds focus at all times during
                  * scanning so that Android has a valid IME target. Our document-level
                  * keypress listener in useHardwareScanner.js then catches the events.
                  *
                  * onBlur: re-focus the trap after a short delay UNLESS the user has
                  * intentionally focused another input/textarea (manual entry, reg form).
                  * Checking document.activeElement is more reliable than checking
                  * state values (e.g. !manualInput would steal focus on an empty field).
                  */}
                <input
                    ref={inputRef}
                    type="text"
                    inputMode="none"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    style={{ position: 'absolute', top: '-9999px', left: '-9999px', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' }}
                    aria-hidden="true"
                    tabIndex={-1}
                    onBlur={() => {
                        setTimeout(() => {
                            if (!inputRef.current) return;
                            const active = document.activeElement;
                            // Don't steal focus if the user is typing in a real input
                            const userIsTyping = active &&
                                (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') &&
                                active !== inputRef.current;
                            if (!userIsTyping) {
                                inputRef.current.focus();
                            }
                        }, 100);
                    }}
                />

                <button onClick={onClose} style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', zIndex: 10 }} title={t('globalScanner.closeTheScannerTip')}>
                    <X size={24} />
                </button>

                <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--primary)', marginBottom: '20px' }}>
                    <ScanIcon size={28} /> {t('global.scanner.smartScanner')}
                </h2>

                {renderContent()}

                {error && (
                    <div style={{ 
                        marginTop: '20px', 
                        padding: '12px 20px', 
                        borderRadius: '16px', 
                        background: 'rgba(239, 68, 68, 0.15)', 
                        color: '#f87171', 
                        textAlign: 'center', 
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        backdropFilter: 'blur(10px)',
                        boxShadow: '0 4px 15px rgba(239, 68, 68, 0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '10px',
                        fontWeight: 600,
                        animation: 'bounceIn 0.4s'
                    }}>
                        <AlertTriangle size={18} /> {error}
                    </div>
                )}
                {success && (
                    <div style={{ 
                        marginTop: '20px', 
                        padding: '12px 20px', 
                        borderRadius: '16px', 
                        background: 'rgba(16, 185, 129, 0.15)', 
                        color: '#34d399', 
                        textAlign: 'center', 
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        backdropFilter: 'blur(10px)',
                        boxShadow: '0 4px 15px rgba(16, 185, 129, 0.2)',
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        gap: '10px',
                        fontWeight: 600,
                        animation: 'bounceIn 0.4s'
                    }}>
                        <CheckCircle2 size={18} /> {success}
                    </div>
                )}
                <div style={{ marginTop: '30px', borderTop: '1px solid var(--glass-border)', paddingTop: '20px' }}>
                    <button 
                        onClick={onClose} 
                        className="btn-nav" 
                        style={{ width: '100%' }}
                        title={t('globalScanner.closeTheScannerAndReturnTip')}
                    >
                        {t('global.scanner.closeScanner')}
                    </button>
                </div>
            </div>
            <style>{`
                @keyframes scanMove { 0% { top: 10%; } 50% { top: 90%; } 100% { top: 10%; } }
                .spinning { animation: spin 1s linear infinite; }
                @keyframes spin { 100% { transform: rotate(360deg); } }
                @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes bounceIn {
                    from { transform: scale(0.9); opacity: 0; }
                    50% { transform: scale(1.05); }
                    to { transform: scale(1); opacity: 1; }
                }
            `}</style>
            {dialog && <SmartDialog {...dialog} />}
        </div>
    );
}
