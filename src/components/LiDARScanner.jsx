// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — LiDAR Scanner
 * =========================
 * In-browser LiDAR point cloud capture using the WebXR Depth Sensing API.
 * Accesses the iPhone LiDAR sensor directly from Safari — no app needed.
 * Captures depth frames, accumulates a point cloud, and generates a PLY
 * file for upload to the Trier OS floor plan system.
 *
 * HARDWARE REQUIREMENTS:
 *   - iPhone 12 Pro or newer (has LiDAR scanner hardware)
 *   - iOS 16+ running Safari
 *   - HTTPS connection (Trier OS self-signed cert satisfies this)
 *
 * KEY FEATURES:
 *   - WebXR session with depth-sensing feature descriptor
 *   - Frame accumulation: captures N depth frames then merges into point cloud
 *   - Real-time point count display during scanning
 *   - Scan name input for organizing floor plan uploads
 *   - PLY export: generates standard PLY binary/ASCII for universal compatibility
 *   - Fallback: on non-LiDAR devices, shows guided file upload flow for
 *     externally captured PLY/OBJ files from apps like Polycam, Matterport, etc.
 *
 * STATES: ready → checking → scanning → processing → uploading → done | error | unsupported
 *
 * @param {string}   plantId    — Target plant for floor plan upload
 * @param {object}   headers    — Auth headers for upload API call
 * @param {Function} onComplete — Callback after successful scan upload
 * @param {Function} onClose    — Callback to close the scanner overlay
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from '../i18n/index.jsx';

const LiDARScanner = ({ plantId, headers, onComplete, onClose }) => {
    const { t } = useTranslation();
    const [status, setStatus] = useState('ready');       // ready | checking | scanning | processing | uploading | done | error | unsupported
    const [pointCount, setPointCount] = useState(0);
    const [scanDuration, setScanDuration] = useState(0);
    const [progress, setProgress] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [scanName, setScanName] = useState('');
    const [showNameInput, setShowNameInput] = useState(false);
    const [deviceInfo, setDeviceInfo] = useState(null);

    const xrSessionRef = useRef(null);
    const pointsRef = useRef([]);           // accumulated [{x,y,z}]
    const frameCountRef = useRef(0);
    const startTimeRef = useRef(0);
    const animFrameRef = useRef(null);
    const canvasRef = useRef(null);
    const glRef = useRef(null);
    const timerRef = useRef(null);

    // ── Check WebXR + Depth Sensing Support ──
    useEffect(() => {
        checkSupport();
    }, []);

    const checkSupport = async () => {
        setStatus('checking');

        // Detect device
        const ua = navigator.userAgent;
        const isIOS = /iPhone|iPad/.test(ua);
        const isAndroid = /Android/.test(ua);
        const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);
        const isChrome = /Chrome/.test(ua);

        setDeviceInfo({
            isIOS, isAndroid, isSafari, isChrome,
            hasWebXR: !!navigator.xr,
        });

        if (!navigator.xr) {
            setStatus('unsupported');
            setErrorMsg('WebXR not available. Use iPhone 12 Pro+ with Safari on HTTPS.');
            return;
        }

        try {
            // Check if immersive-ar with depth-sensing is supported
            const supported = await navigator.xr.isSessionSupported('immersive-ar');
            if (!supported) {
                setStatus('unsupported');
                setErrorMsg('AR sessions not supported on this device. Requires iPhone with LiDAR sensor.');
                return;
            }
            setStatus('ready');
        } catch (e) {
            setStatus('unsupported');
            setErrorMsg(`WebXR check failed: ${e.message}`);
        }
    };

    // ── Start Scanning ──
    const startScan = async () => {
        if (!scanName.trim()) {
            setShowNameInput(true);
            return;
        }

        try {
            setStatus('scanning');
            setProgress('Initializing AR session...');
            pointsRef.current = [];
            frameCountRef.current = 0;
            startTimeRef.current = Date.now();

            // Request WebXR session with depth sensing
            const session = await navigator.xr.requestSession('immersive-ar', {
                requiredFeatures: ['local-floor'],
                optionalFeatures: ['depth-sensing', 'mesh-detection'],
                depthSensing: {
                    usagePreference: ['cpu-optimized', 'gpu-optimized'],
                    dataFormatPreference: ['luminance-alpha', 'float32'],
                },
            });

            xrSessionRef.current = session;

            // Set up WebGL context for depth rendering
            const canvas = canvasRef.current || document.createElement('canvas');
            canvasRef.current = canvas;
            const gl = canvas.getContext('webgl2', { xrCompatible: true });
            glRef.current = gl;

            await session.updateRenderState({
                baseLayer: new XRWebGLLayer(session, gl),
            });

            const refSpace = await session.requestReferenceSpace('local-floor');

            setProgress('Scanning... move your phone slowly around the facility');

            // Timer for duration display
            timerRef.current = setInterval(() => {
                setScanDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
            }, 1000);

            // Frame loop — capture depth data
            const onFrame = (time, frame) => {
                if (!xrSessionRef.current) return;
                animFrameRef.current = session.requestAnimationFrame(onFrame);

                const pose = frame.getViewerPose(refSpace);
                if (!pose) return;

                for (const view of pose.views) {
                    // Try to get depth information
                    let depthInfo = null;
                    try {
                        depthInfo = frame.getDepthInformation?.(view);
                    } catch (e) { /* depth not available this frame */ }

                    if (depthInfo) {
                        extractPointsFromDepth(depthInfo, view, pose.transform);
                    } else if (frame.detectedMeshes) {
                        // Fallback: use mesh detection if available
                        extractPointsFromMeshes(frame.detectedMeshes, refSpace, frame);
                    }
                }

                frameCountRef.current++;
                // Update point count every 10 frames for performance
                if (frameCountRef.current % 10 === 0) {
                    setPointCount(pointsRef.current.length);
                }
            };

            session.requestAnimationFrame(onFrame);

            session.addEventListener('end', () => {
                clearInterval(timerRef.current);
                if (pointsRef.current.length > 0) {
                    processScan();
                } else {
                    setStatus('ready');
                    setProgress('');
                }
            });

        } catch (e) {
            console.error('LiDAR scan error:', e);
            setStatus('error');
            setErrorMsg(`Scan failed: ${e.message}`);
            clearInterval(timerRef.current);
        }
    };

    // ── Extract Points from Depth Buffer ──
    const extractPointsFromDepth = (depthInfo, view, poseTransform) => {
        const { width, height } = depthInfo;
        const projMatrix = view.projectionMatrix;

        // Sample every Nth pixel for performance (full resolution would be too many points)
        const step = Math.max(4, Math.floor(Math.min(width, height) / 64));

        for (let y = 0; y < height; y += step) {
            for (let x = 0; x < width; x += step) {
                let depth;
                try {
                    depth = depthInfo.getDepthInMeters(x, y);
                } catch (e) { continue; }

                if (!depth || depth <= 0 || depth > 10) continue; // Filter bad readings (>10m away)

                // Convert pixel + depth to 3D point in local space
                const ndcX = (x / width) * 2 - 1;
                const ndcY = 1 - (y / height) * 2;

                // Unproject using inverse projection
                const fovX = 2 / projMatrix[0];
                const fovY = 2 / projMatrix[5];
                const localX = ndcX * depth * fovX * 0.5;
                const localY = ndcY * depth * fovY * 0.5;
                const localZ = -depth;

                // Transform to world space using pose
                const m = poseTransform.matrix;
                const wx = m[0]*localX + m[4]*localY + m[8]*localZ + m[12];
                const wy = m[1]*localX + m[5]*localY + m[9]*localZ + m[13];
                const wz = m[2]*localX + m[6]*localY + m[10]*localZ + m[14];

                pointsRef.current.push({ x: wx, y: wy, z: wz });
            }
        }
    };

    // ── Extract Points from Detected Meshes (fallback) ──
    const extractPointsFromMeshes = (meshes, refSpace, frame) => {
        for (const mesh of meshes) {
            try {
                const meshPose = frame.getPose(mesh.meshSpace, refSpace);
                if (!meshPose) continue;

                const vertices = mesh.vertices;
                const m = meshPose.transform.matrix;

                // Sample vertices (not all — meshes can be dense)
                const step = Math.max(1, Math.floor(vertices.length / 500));
                for (let i = 0; i < vertices.length; i += step) {
                    const v = vertices[i];
                    const wx = m[0]*v.x + m[4]*v.y + m[8]*v.z + m[12];
                    const wy = m[1]*v.x + m[5]*v.y + m[9]*v.z + m[13];
                    const wz = m[2]*v.x + m[6]*v.y + m[10]*v.z + m[14];
                    pointsRef.current.push({ x: wx, y: wy, z: wz });
                }
            } catch (e) { /* skip problematic mesh */ }
        }
    };

    // ── Stop Scanning ──
    const stopScan = async () => {
        clearInterval(timerRef.current);
        if (xrSessionRef.current) {
            try {
                await xrSessionRef.current.end();
            } catch (e) { /* session may already be ended */ }
            xrSessionRef.current = null;
        }
        if (animFrameRef.current) {
            cancelAnimationFrame(animFrameRef.current);
        }

        if (pointsRef.current.length > 0) {
            processScan();
        } else {
            setStatus('ready');
        }
    };

    // ── Process Captured Points → PLY → Upload ──
    const processScan = async () => {
        setStatus('processing');
        const points = pointsRef.current;
        setProgress(`Processing ${points.length.toLocaleString()} captured points...`);

        // Remove duplicate/close points (simple grid-based deduplication)
        const gridSize = 0.03; // 3cm resolution
        const seen = new Set();
        const deduped = [];
        for (const p of points) {
            const key = `${Math.round(p.x/gridSize)},${Math.round(p.y/gridSize)},${Math.round(p.z/gridSize)}`;
            if (!seen.has(key)) {
                seen.add(key);
                deduped.push(p);
            }
        }

        setProgress(`Deduplicated: ${points.length.toLocaleString()} → ${deduped.length.toLocaleString()} unique points`);
        setPointCount(deduped.length);

        // Generate PLY file
        const header = [
            'ply',
            'format ascii 1.0',
            `element vertex ${deduped.length}`,
            'property float x',
            'property float y',
            'property float z',
            'end_header',
        ].join('\n');

        const body = deduped.map(p => `${p.x.toFixed(4)} ${p.y.toFixed(4)} ${p.z.toFixed(4)}`).join('\n');
        const plyContent = header + '\n' + body;
        const blob = new Blob([plyContent], { type: 'application/octet-stream' });

        setProgress(`PLY file generated: ${(blob.size / 1024 / 1024).toFixed(2)} MB — uploading...`);
        setStatus('uploading');

        // Upload via LiDAR import API
        try {
            const formData = new FormData();
            formData.append('plantId', plantId);
            formData.append('name', scanName || `iPhone LiDAR Scan - ${new Date().toLocaleDateString()}`);
            formData.append('planType', 'facility');
            formData.append('lidarfile', blob, 'iphone_scan.ply');

            const res = await fetch('/api/floorplans/import-lidar', {
                method: 'POST',
                headers: { ...headers },
                body: formData,
            });

            const result = await res.json();
            if (res.ok && result.success) {
                setStatus('done');
                setProgress(`✅ Scan saved! ${deduped.length.toLocaleString()} points → Floor plan + 3D model`);
                setTimeout(() => onComplete?.(result), 2000);
            } else {
                throw new Error(result.error || 'Upload failed');
            }
        } catch (e) {
            setStatus('error');
            setErrorMsg(`Upload failed: ${e.message}`);
        }
    };

    // ── File Upload Fallback (for non-LiDAR devices) ──
    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!scanName.trim()) {
            setScanName(file.name.replace(/\.[^.]+$/, ''));
        }

        setStatus('uploading');
        setProgress('Uploading scan file...');

        try {
            const formData = new FormData();
            formData.append('plantId', plantId);
            formData.append('name', scanName || file.name.replace(/\.[^.]+$/, ''));
            formData.append('planType', 'facility');
            formData.append('lidarfile', file);

            const res = await fetch('/api/floorplans/import-lidar', {
                method: 'POST',
                headers: { ...headers },
                body: formData,
            });

            const result = await res.json();
            if (res.ok && result.success) {
                setStatus('done');
                setProgress(`✅ Imported! ${result.stats?.totalVertices?.toLocaleString() || '?'} vertices processed`);
                setTimeout(() => onComplete?.(result), 2000);
            } else {
                throw new Error(result.error || 'Import failed');
            }
        } catch (e) {
            setStatus('error');
            setErrorMsg(`Import failed: ${e.message}`);
        }
    };

    // ── Cleanup on unmount ──
    useEffect(() => {
        return () => {
            clearInterval(timerRef.current);
            if (xrSessionRef.current) {
                try { xrSessionRef.current.end(); } catch(e) {}
            }
        };
    }, []);

    const formatDuration = (s) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 99999, background: '#0a0e1a',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
            {/* Header */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0,
                padding: '12px 20px', background: 'rgba(15,23,42,0.95)',
                borderBottom: '1px solid rgba(99,102,241,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                zIndex: 10,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '1.4rem' }}>📱</span>
                    <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '1.1rem' }}>
                        {t('lidarScanner.title', 'LiDAR Scanner')}
                    </span>
                </div>
                <button onClick={onClose} style={{
                    padding: '6px 16px', borderRadius: 8, border: 'none',
                    background: '#ef4444', color: '#fff', fontWeight: 700,
                    fontSize: '0.85rem', cursor: 'pointer',
                }}>{t('lidarScanner.closeButton', '✕ Close')}</button>
            </div>

            {/* Main Content */}
            <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 20, padding: '80px 30px 30px', maxWidth: 500, width: '100%',
            }}>
                {/* Status Icon */}
                <div style={{ fontSize: '4rem', marginBottom: 10 }}>
                    {status === 'ready' && '📡'}
                    {status === 'checking' && '⏳'}
                    {status === 'scanning' && '🔴'}
                    {status === 'processing' && '⚙️'}
                    {status === 'uploading' && '☁️'}
                    {status === 'done' && '✅'}
                    {status === 'error' && '⚠️'}
                    {status === 'unsupported' && '📱'}
                </div>

                {/* Status Title */}
                <h2 style={{ color: '#e2e8f0', margin: 0, textAlign: 'center', fontSize: '1.3rem' }}>
                    {status === 'ready' && t('lidarScanner.statusReady', 'Ready to Scan')}
                    {status === 'checking' && t('lidarScanner.statusChecking', 'Checking Device...')}
                    {status === 'scanning' && t('lidarScanner.statusScanning', 'Scanning Facility')}
                    {status === 'processing' && t('lidarScanner.statusProcessing', 'Processing Point Cloud')}
                    {status === 'uploading' && t('lidarScanner.statusUploading', 'Uploading to Trier OS')}
                    {status === 'done' && t('lidarScanner.statusDone', 'Scan Complete!')}
                    {status === 'error' && t('lidarScanner.statusError', 'Scan Error')}
                    {status === 'unsupported' && t('lidarScanner.statusUnsupported', 'LiDAR Scanner')}
                </h2>

                {/* Scanning Stats */}
                {status === 'scanning' && (
                    <div style={{
                        display: 'flex', gap: 30, padding: '15px 25px',
                        background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                        borderRadius: 12,
                    }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ color: '#ef4444', fontSize: '1.5rem', fontWeight: 800, fontFamily: 'monospace' }}>
                                {pointCount.toLocaleString()}
                            </div>
                            <div style={{ color: '#94a3b8', fontSize: '0.7rem' }}>{t('lidarScanner.statsPoints', 'POINTS')}</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ color: '#ef4444', fontSize: '1.5rem', fontWeight: 800, fontFamily: 'monospace' }}>
                                {formatDuration(scanDuration)}
                            </div>
                            <div style={{ color: '#94a3b8', fontSize: '0.7rem' }}>{t('lidarScanner.statsDuration', 'DURATION')}</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ color: '#ef4444', fontSize: '1.5rem', fontWeight: 800, fontFamily: 'monospace' }}>
                                {frameCountRef.current}
                            </div>
                            <div style={{ color: '#94a3b8', fontSize: '0.7rem' }}>{t('lidarScanner.statsFrames', 'FRAMES')}</div>
                        </div>
                    </div>
                )}

                {/* Progress Message */}
                {progress && (
                    <p style={{
                        color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center',
                        margin: 0, lineHeight: 1.6,
                    }}>{progress}</p>
                )}

                {/* Error Message */}
                {errorMsg && (
                    <p style={{
                        color: '#ef4444', fontSize: '0.85rem', textAlign: 'center',
                        margin: 0, padding: '10px 16px', background: 'rgba(239,68,68,0.1)',
                        borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)',
                    }}>{errorMsg}</p>
                )}

                {/* Name Input */}
                {(showNameInput || status === 'ready') && (
                    <input
                        type="text"
                        value={scanName}
                        onChange={(e) => setScanName(e.target.value)}
                        placeholder={t('lidarScanner.scanNamePlaceholder', 'Name your scan (e.g., Processing Area)')}
                        style={{
                            width: '100%', padding: '12px 16px', borderRadius: 10,
                            background: 'rgba(30,41,59,0.8)', border: '1px solid rgba(99,102,241,0.3)',
                            color: '#e2e8f0', fontSize: '0.95rem', outline: 'none',
                        }}
                    />
                )}

                {/* Action Buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
                    {/* Start Scan (WebXR) */}
                    {(status === 'ready') && (
                        <button onClick={() => {
                            if (!scanName.trim()) {
                                setShowNameInput(true);
                                return;
                            }
                            startScan();
                        }} style={{
                            padding: '16px 30px', borderRadius: 14, border: 'none',
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            color: '#fff', fontSize: '1.1rem', fontWeight: 800,
                            cursor: 'pointer', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', gap: 10,
                            boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
                        }}>
                            {t('lidarScanner.startScanButton', '📡 Start LiDAR Scan')}
                        </button>
                    )}

                    {/* Stop Scan */}
                    {status === 'scanning' && (
                        <button onClick={stopScan} style={{
                            padding: '16px 30px', borderRadius: 14, border: 'none',
                            background: '#ef4444', color: '#fff', fontSize: '1.1rem',
                            fontWeight: 800, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                            animation: 'pulse 1.5s infinite',
                        }}>
                            {t('lidarScanner.stopScanButton', '⏹ Stop & Save Scan')}
                        </button>
                    )}

                    {/* Unsupported: Show upload fallback */}
                    {status === 'unsupported' && (
                        <>
                            <div style={{
                                color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center',
                                lineHeight: 1.8, padding: '10px 0',
                            }}>
                                <strong style={{ color: '#f59e0b' }}>{t('lidarScanner.unsupportedNoSensor', 'No LiDAR sensor detected on this device.')}</strong>
                                <br />
                                {t('lidarScanner.unsupportedImportPrompt', 'You can still import a scan file from a LiDAR app:')}
                            </div>

                            <label style={{
                                padding: '16px 30px', borderRadius: 14, border: 'none',
                                background: 'linear-gradient(135deg, #06b6d4, #0891b2)',
                                color: '#fff', fontSize: '1rem', fontWeight: 700,
                                cursor: 'pointer', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', gap: 10, textAlign: 'center',
                            }}>
                                {t('lidarScanner.importFileButton', '📂 Import Scan File (.ply / .obj)')}
                                <input type="file" accept=".ply,.obj" onChange={handleFileUpload}
                                    style={{ display: 'none' }} />
                            </label>

                            <div style={{
                                color: '#64748b', fontSize: '0.75rem', textAlign: 'center',
                                lineHeight: 1.8, padding: '10px 15px',
                                background: 'rgba(30,41,59,0.5)', borderRadius: 10,
                            }}>
                                <strong style={{ color: '#818cf8' }}>{t('lidarScanner.instructionsTitle', '📱 iPhone LiDAR Scan Instructions:')}</strong><br />
                                {t('lidarScanner.instructionsStep1', '1. Download')} <strong>3d Scanner App</strong> {t('lidarScanner.instructionsStep1Or', 'or')} <strong>Polycam</strong> ({t('lidarScanner.instructionsStep1Free', 'free')})<br />
                                {t('lidarScanner.instructionsStep2', '2. Scan your facility area')}<br />
                                {t('lidarScanner.instructionsStep3', '3. Export as')} <strong>.PLY</strong> {t('lidarScanner.instructionsStep3File', 'file')}<br />
                                {t('lidarScanner.instructionsStep4', '4. Import it here')}
                            </div>
                        </>
                    )}

                    {/* Processing/Uploading spinner */}
                    {(status === 'processing' || status === 'uploading') && (
                        <div style={{ textAlign: 'center' }}>
                            <div style={{
                                width: 50, height: 50, margin: '0 auto',
                                border: '3px solid rgba(99,102,241,0.2)',
                                borderTopColor: '#6366f1', borderRadius: '50%',
                                animation: 'spin 1s linear infinite',
                            }} />
                        </div>
                    )}

                    {/* Done — View in 3D */}
                    {status === 'done' && (
                        <button onClick={() => onComplete?.()} style={{
                            padding: '16px 30px', borderRadius: 14, border: 'none',
                            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                            color: '#fff', fontSize: '1.1rem', fontWeight: 800,
                            cursor: 'pointer', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', gap: 10,
                        }}>
                            {t('lidarScanner.viewIn3DButton', '🔬 View in 3D')}
                        </button>
                    )}
                </div>

                {/* Scanning Tips */}
                {status === 'scanning' && (
                    <div style={{
                        color: '#64748b', fontSize: '0.75rem', lineHeight: 1.8,
                        textAlign: 'center', padding: '12px 16px',
                        background: 'rgba(30,41,59,0.5)', borderRadius: 10,
                        maxWidth: 400,
                    }}>
                        <strong style={{ color: '#a78bfa' }}>{t('lidarScanner.tipsTitle', '📋 Scanning Tips:')}</strong><br />
                        • {t('lidarScanner.tip1', 'Move slowly and steadily')}<br />
                        • {t('lidarScanner.tip2', 'Point at walls, equipment, and floors')}<br />
                        • {t('lidarScanner.tip3', 'Keep 1-3 meters from surfaces')}<br />
                        • {t('lidarScanner.tip4', 'Overlap areas for better coverage')}<br />
                        • {t('lidarScanner.tip5', 'Well-lit areas scan better')}
                    </div>
                )}
            </div>

            {/* Hidden canvas for WebGL */}
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            <style>{`
                @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.7; } }
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
};

export default LiDARScanner;
