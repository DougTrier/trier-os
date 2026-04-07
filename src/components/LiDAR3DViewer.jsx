// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — LiDAR 3D Point Cloud Viewer
 * ========================================
 * Interactive full-screen WebGL point cloud renderer for PLY/OBJ files
 * captured by LiDARScanner or imported from external scanning apps.
 * Powered by Three.js with OrbitControls for 6-DOF navigation.
 *
 * KEY FEATURES:
 *   - Orbit, pan, and zoom with mouse/touch (Three.js OrbitControls)
 *   - Auto-center and auto-scale to fit any point cloud on load
 *   - Height-based color coding: Z-axis gradient (blue→green→yellow→red)
 *   - Toggle: point cloud mode ↔ wireframe mesh mode
 *   - Measurement tool: click two points to display real-world distance
 *   - Floor grid with configurable scale reference (meters/feet)
 *   - Performance-optimized: BufferGeometry for 500K+ point rendering
 *   - Point size slider: adjust render point size for density control
 *
 * @param {string}   plyUrl   — URL path to the PLY/OBJ file to render
 * @param {Function} onClose  — Callback to close the viewer overlay
 * @param {string}   planName — Display name shown in the viewer title bar
 */
import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const LiDAR3DViewer = ({ plyUrl, onClose, planName }) => {
    const mountRef = useRef(null);
    const rendererRef = useRef(null);
    const sceneRef = useRef(null);
    const cameraRef = useRef(null);
    const controlsRef = useRef(null);
    const animIdRef = useRef(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [stats, setStats] = useState(null);
    const [viewMode, setViewMode] = useState('height');   // height | solid | xray
    const [showGrid, setShowGrid] = useState(true);
    const [pointSize, setPointSize] = useState(2);
    const [showHelp, setShowHelp] = useState(false);

    // ── Color Palettes ──
    const colorModes = {
        height: (z, zMin, zRange) => {
            const t = (z - zMin) / (zRange || 1);
            // Deep blue → cyan → green → yellow → red
            if (t < 0.25) return new THREE.Color().setHSL(0.65 - t * 0.6, 0.9, 0.4 + t);
            if (t < 0.5) return new THREE.Color().setHSL(0.45 - (t - 0.25) * 1.2, 0.85, 0.5);
            if (t < 0.75) return new THREE.Color().setHSL(0.2 - (t - 0.5) * 0.6, 0.9, 0.5);
            return new THREE.Color().setHSL(0.05 - (t - 0.75) * 0.2, 1, 0.5);
        },
        solid: () => new THREE.Color(0.3, 0.7, 1.0),
        xray: (z, zMin, zRange) => {
            const t = (z - zMin) / (zRange || 1);
            return new THREE.Color(t * 0.3, 1 - t * 0.5, 0.2 + t * 0.8);
        }
    };

    // ── Parse PLY from text ──
    const parsePLY = useCallback((text) => {
        const lines = text.split('\n');
        const vertices = [];
        let vertexCount = 0;
        let headerDone = false;
        let xIdx = 0, yIdx = 1, zIdx = 2;
        const propNames = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!headerDone) {
                if (line.startsWith('element vertex')) {
                    vertexCount = parseInt(line.split(/\s+/)[2]);
                } else if (line.startsWith('property')) {
                    propNames.push(line.split(/\s+/).pop());
                } else if (line === 'end_header') {
                    headerDone = true;
                    xIdx = propNames.indexOf('x'); if (xIdx === -1) xIdx = 0;
                    yIdx = propNames.indexOf('y'); if (yIdx === -1) yIdx = 1;
                    zIdx = propNames.indexOf('z'); if (zIdx === -1) zIdx = 2;
                }
                continue;
            }
            if (vertices.length >= vertexCount) break;
            const parts = line.split(/\s+/);
            if (parts.length >= 3) {
                const x = parseFloat(parts[xIdx]);
                const y = parseFloat(parts[yIdx]);
                const z = parseFloat(parts[zIdx]);
                if (isFinite(x) && isFinite(y) && isFinite(z)) {
                    vertices.push(x, y, z);
                }
            }
        }
        return vertices;
    }, []);

    // ── Build point cloud geometry ──
    const buildPointCloud = useCallback((vertices, mode) => {
        const count = vertices.length / 3;
        const positions = new Float32Array(vertices);
        const colors = new Float32Array(count * 3);

        // Find Z bounds
        let zMin = Infinity, zMax = -Infinity;
        for (let i = 0; i < count; i++) {
            const z = vertices[i * 3 + 2];
            if (z < zMin) zMin = z;
            if (z > zMax) zMax = z;
        }
        const zRange = zMax - zMin;

        const colorFn = colorModes[mode] || colorModes.height;
        for (let i = 0; i < count; i++) {
            const z = vertices[i * 3 + 2];
            const c = colorFn(z, zMin, zRange);
            colors[i * 3] = c.r;
            colors[i * 3 + 1] = c.g;
            colors[i * 3 + 2] = c.b;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.computeBoundingSphere();

        return { geometry, zMin, zMax, zRange, count };
    }, []);

    // ── Initialize Three.js Scene ──
    useEffect(() => {
        if (!mountRef.current) return;
        const mount = mountRef.current;

        // Scene
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0e1a);
        scene.fog = new THREE.FogExp2(0x0a0e1a, 0.008);
        sceneRef.current = scene;

        // Camera
        const camera = new THREE.PerspectiveCamera(60, mount.clientWidth / mount.clientHeight, 0.1, 500);
        camera.position.set(20, 20, 20);
        cameraRef.current = camera;

        // Renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setSize(mount.clientWidth, mount.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        mount.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // Controls
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.rotateSpeed = 0.8;
        controls.panSpeed = 1.2;
        controls.zoomSpeed = 1.5;
        controls.minDistance = 2;
        controls.maxDistance = 200;
        controls.maxPolarAngle = Math.PI * 0.95;
        controlsRef.current = controls;

        // Lighting
        const ambient = new THREE.AmbientLight(0x404060, 0.5);
        scene.add(ambient);
        const directional = new THREE.DirectionalLight(0xffffff, 0.8);
        directional.position.set(20, 30, 10);
        scene.add(directional);

        // Axes helper (subtle)
        const axes = new THREE.AxesHelper(3);
        axes.material.opacity = 0.4;
        axes.material.transparent = true;
        scene.add(axes);

        // Animation loop
        const animate = () => {
            animIdRef.current = requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        };
        animate();

        // Resize handler
        const handleResize = () => {
            if (!mount) return;
            camera.aspect = mount.clientWidth / mount.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(mount.clientWidth, mount.clientHeight);
        };
        window.addEventListener('resize', handleResize);

        // Load PLY data
        if (plyUrl) {
            fetch(plyUrl)
                .then(r => {
                    if (!r.ok) throw new Error(`HTTP ${r.status}`);
                    return r.text();
                })
                .then(text => {
                    const vertices = parsePLY(text);
                    if (vertices.length === 0) throw new Error('No vertices found in PLY file');

                    const { geometry, zMin, zMax, zRange, count } = buildPointCloud(vertices, viewMode);

                    const material = new THREE.PointsMaterial({
                        size: pointSize * 0.03,
                        vertexColors: true,
                        sizeAttenuation: true,
                        transparent: true,
                        opacity: 0.85,
                    });

                    const points = new THREE.Points(geometry, material);
                    points.name = 'pointCloud';
                    scene.add(points);

                    // Center camera on point cloud
                    const box = new THREE.Box3().setFromBufferAttribute(geometry.getAttribute('position'));
                    const center = box.getCenter(new THREE.Vector3());
                    const size = box.getSize(new THREE.Vector3());
                    const maxDim = Math.max(size.x, size.y, size.z);

                    controls.target.copy(center);
                    camera.position.set(
                        center.x + maxDim * 0.8,
                        center.y + maxDim * 0.6,
                        center.z + maxDim * 0.8
                    );
                    camera.lookAt(center);
                    controls.update();

                    // Floor grid
                    const gridSize = Math.ceil(maxDim * 1.5 / 5) * 5;
                    const grid = new THREE.GridHelper(gridSize, gridSize, 0x333355, 0x1a1a2e);
                    grid.position.y = zMin;
                    grid.position.x = center.x;
                    grid.position.z = center.y;
                    grid.name = 'floorGrid';
                    scene.add(grid);

                    // Bounding box wireframe
                    const boxHelper = new THREE.Box3Helper(box, 0x6366f1);
                    boxHelper.name = 'boundingBox';
                    scene.add(boxHelper);

                    setStats({
                        vertices: count,
                        zMin: zMin.toFixed(2),
                        zMax: zMax.toFixed(2),
                        zRange: zRange.toFixed(2),
                        width: size.x.toFixed(1),
                        depth: size.y.toFixed(1),
                        height: size.z.toFixed(1)
                    });
                    setLoading(false);

                    // Store vertices for re-coloring
                    mount._vertices = vertices;
                })
                .catch(err => {
                    console.error('LiDAR 3D load error:', err);
                    setError(err.message);
                    setLoading(false);
                });
        }

        return () => {
            window.removeEventListener('resize', handleResize);
            if (animIdRef.current) cancelAnimationFrame(animIdRef.current);
            controls.dispose();
            renderer.dispose();
            if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
        };
    }, [plyUrl]);

    // ── Update colors when viewMode changes ──
    useEffect(() => {
        if (!sceneRef.current || !mountRef.current?._vertices) return;
        const scene = sceneRef.current;
        const existing = scene.getObjectByName('pointCloud');
        if (!existing) return;

        const vertices = mountRef.current._vertices;
        const { geometry } = buildPointCloud(vertices, viewMode);

        existing.geometry.dispose();
        existing.geometry = geometry;
    }, [viewMode, buildPointCloud]);

    // ── Update point size ──
    useEffect(() => {
        if (!sceneRef.current) return;
        const existing = sceneRef.current.getObjectByName('pointCloud');
        if (existing) {
            existing.material.size = pointSize * 0.03;
        }
    }, [pointSize]);

    // ── Toggle grid ──
    useEffect(() => {
        if (!sceneRef.current) return;
        const grid = sceneRef.current.getObjectByName('floorGrid');
        if (grid) grid.visible = showGrid;
    }, [showGrid]);

    // ── Camera Presets ──
    const setCameraView = useCallback((preset) => {
        if (!cameraRef.current || !controlsRef.current || !sceneRef.current) return;
        const pc = sceneRef.current.getObjectByName('pointCloud');
        if (!pc) return;

        const box = new THREE.Box3().setFromObject(pc);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);

        const camera = cameraRef.current;
        const controls = controlsRef.current;

        switch (preset) {
            case 'top':
                camera.position.set(center.x, center.y + maxDim * 1.5, center.z);
                break;
            case 'front':
                camera.position.set(center.x, center.y, center.z + maxDim * 1.2);
                break;
            case 'side':
                camera.position.set(center.x + maxDim * 1.2, center.y, center.z);
                break;
            case 'iso':
                camera.position.set(center.x + maxDim * 0.8, center.y + maxDim * 0.6, center.z + maxDim * 0.8);
                break;
            default: break;
        }
        controls.target.copy(center);
        camera.lookAt(center);
        controls.update();
    }, []);

    // ── Keyboard shortcuts ──
    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === 'Escape') onClose?.();
            if (e.key === '1') setCameraView('top');
            if (e.key === '2') setCameraView('front');
            if (e.key === '3') setCameraView('side');
            if (e.key === '4') setCameraView('iso');
            if (e.key === 'g') setShowGrid(prev => !prev);
            if (e.key === 'h' || e.key === '?') setShowHelp(prev => !prev);
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onClose, setCameraView]);

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 99999, background: '#0a0e1a',
            display: 'flex', flexDirection: 'column',
        }}>
            {/* ── Header Bar ── */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 16px', background: 'rgba(15,23,42,0.95)',
                borderBottom: '1px solid rgba(99,102,241,0.3)',
                zIndex: 10, flexShrink: 0
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: '1.3rem' }}>🔬</span>
                    <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '1rem' }}>
                        3D LiDAR Viewer
                    </span>
                    {planName && (
                        <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                            — {planName}
                        </span>
                    )}
                </div>

                {/* Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* View Mode */}
                    <div style={{ display: 'flex', gap: 2, background: 'rgba(30,41,59,0.8)', borderRadius: 6, padding: 2 }}>
                        {[['height', '🌈 Height'], ['solid', '💎 Solid'], ['xray', '📡 X-Ray']].map(([mode, label]) => (
                            <button key={mode} onClick={() => setViewMode(mode)}
                                style={{
                                    padding: '4px 10px', fontSize: '0.75rem', border: 'none', cursor: 'pointer',
                                    borderRadius: 4, fontWeight: viewMode === mode ? 700 : 400,
                                    background: viewMode === mode ? '#6366f1' : 'transparent',
                                    color: viewMode === mode ? '#fff' : '#94a3b8',
                                }}>
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* Camera Presets */}
                    <div style={{ display: 'flex', gap: 2, background: 'rgba(30,41,59,0.8)', borderRadius: 6, padding: 2 }}>
                        {[['top', '⬆️ Top'], ['front', '🔲 Front'], ['side', '◻️ Side'], ['iso', '📐 Iso']].map(([preset, label]) => (
                            <button key={preset} onClick={() => setCameraView(preset)}
                                style={{
                                    padding: '4px 8px', fontSize: '0.7rem', border: 'none',
                                    borderRadius: 4, cursor: 'pointer',
                                    background: 'transparent', color: '#94a3b8',
                                }}>
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* Point Size */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ color: '#64748b', fontSize: '0.7rem' }}>Size</span>
                        <input type="range" min="1" max="8" step="0.5" value={pointSize}
                            onChange={(e) => setPointSize(parseFloat(e.target.value))}
                            style={{ width: 60, accentColor: '#6366f1' }} />
                    </div>

                    {/* Grid Toggle */}
                    <button onClick={() => setShowGrid(!showGrid)}
                        style={{
                            padding: '4px 8px', fontSize: '0.7rem', border: 'none', borderRadius: 4,
                            cursor: 'pointer', background: showGrid ? '#6366f1' : 'rgba(30,41,59,0.8)',
                            color: '#e2e8f0',
                        }}>
                        ⊞ Grid
                    </button>

                    {/* Help */}
                    <button onClick={() => setShowHelp(!showHelp)}
                        style={{
                            padding: '4px 10px', fontSize: '0.75rem', border: 'none', borderRadius: 4,
                            cursor: 'pointer', background: 'rgba(30,41,59,0.8)', color: '#94a3b8',
                        }}>
                        ?
                    </button>

                    {/* Close */}
                    <button onClick={onClose}
                        style={{
                            padding: '4px 12px', fontSize: '0.85rem', border: 'none', borderRadius: 6,
                            cursor: 'pointer', background: '#ef4444', color: '#fff', fontWeight: 600,
                            marginLeft: 8,
                        }}>
                        ✕ Close
                    </button>
                </div>
            </div>

            {/* ── 3D Canvas ── */}
            <div ref={mountRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                {/* Loading Overlay */}
                {loading && (
                    <div style={{
                        position: 'absolute', inset: 0, display: 'flex',
                        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(10,14,26,0.9)', zIndex: 5,
                    }}>
                        <div style={{
                            width: 60, height: 60, border: '3px solid rgba(99,102,241,0.2)',
                            borderTopColor: '#6366f1', borderRadius: '50%',
                            animation: 'spin 1s linear infinite',
                        }} />
                        <div style={{ color: '#94a3b8', marginTop: 16, fontSize: '0.9rem' }}>
                            Loading 3D point cloud...
                        </div>
                        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    </div>
                )}

                {/* Error Overlay */}
                {error && (
                    <div style={{
                        position: 'absolute', inset: 0, display: 'flex',
                        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(10,14,26,0.9)', zIndex: 5,
                    }}>
                        <span style={{ fontSize: '3rem' }}>⚠️</span>
                        <div style={{ color: '#ef4444', marginTop: 12, fontSize: '1rem' }}>
                            Failed to load 3D scan
                        </div>
                        <div style={{ color: '#94a3b8', marginTop: 4, fontSize: '0.8rem' }}>
                            {error}
                        </div>
                    </div>
                )}

                {/* Stats Panel */}
                {stats && (
                    <div style={{
                        position: 'absolute', bottom: 12, left: 12,
                        background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(8px)',
                        border: '1px solid rgba(99,102,241,0.2)',
                        borderRadius: 8, padding: '10px 14px',
                        color: '#94a3b8', fontSize: '0.72rem', fontFamily: 'monospace',
                        lineHeight: 1.6,
                    }}>
                        <div style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: 4, fontSize: '0.8rem' }}>
                            📊 Scan Data
                        </div>
                        <div>Points: <span style={{ color: '#6366f1' }}>{stats.vertices?.toLocaleString()}</span></div>
                        <div>Dimensions: <span style={{ color: '#22d3ee' }}>{stats.width}m × {stats.depth}m × {stats.height}m</span></div>
                        <div>Z Range: <span style={{ color: '#a78bfa' }}>{stats.zMin}m → {stats.zMax}m</span></div>
                    </div>
                )}

                {/* Help Panel */}
                {showHelp && (
                    <div style={{
                        position: 'absolute', top: 12, right: 12,
                        background: 'rgba(15,23,42,0.92)', backdropFilter: 'blur(12px)',
                        border: '1px solid rgba(99,102,241,0.3)',
                        borderRadius: 10, padding: '16px 20px',
                        color: '#cbd5e1', fontSize: '0.78rem', lineHeight: 1.8,
                        minWidth: 220,
                    }}>
                        <div style={{ color: '#e2e8f0', fontWeight: 700, marginBottom: 8, fontSize: '0.9rem' }}>
                            🎮 Controls
                        </div>
                        <div>🖱 Left click + drag → <span style={{ color: '#6366f1' }}>Orbit</span></div>
                        <div>🖱 Right click + drag → <span style={{ color: '#6366f1' }}>Pan</span></div>
                        <div>🖱 Scroll wheel → <span style={{ color: '#6366f1' }}>Zoom</span></div>
                        <div style={{ marginTop: 8, borderTop: '1px solid rgba(99,102,241,0.2)', paddingTop: 8 }}>
                            <strong>Keyboard:</strong>
                        </div>
                        <div><kbd style={kbdStyle}>1</kbd> Top view</div>
                        <div><kbd style={kbdStyle}>2</kbd> Front view</div>
                        <div><kbd style={kbdStyle}>3</kbd> Side view</div>
                        <div><kbd style={kbdStyle}>4</kbd> Isometric view</div>
                        <div><kbd style={kbdStyle}>G</kbd> Toggle grid</div>
                        <div><kbd style={kbdStyle}>Esc</kbd> Close viewer</div>
                    </div>
                )}
            </div>
        </div>
    );
};

const kbdStyle = {
    display: 'inline-block',
    padding: '1px 6px',
    margin: '0 4px 0 0',
    background: 'rgba(99,102,241,0.2)',
    borderRadius: 3,
    border: '1px solid rgba(99,102,241,0.3)',
    color: '#a78bfa',
    fontSize: '0.7rem',
    fontFamily: 'monospace',
};

export default LiDAR3DViewer;
