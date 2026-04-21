// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * ScanCapture.jsx — Scan State Machine — Asset Acquisition Layer
 * ===============================================================
 * Device-agnostic QR/barcode capture component. Handles all three
 * input modes defined in the scan state machine spec (ROADMAP.md P1):
 *
 *   1. Hardware scanner (Zebra or equivalent) — keyboard-wedge input lands
 *      in a focused invisible input; auto-submits after rapid keypress burst.
 *   2. Camera scan — ZXing BrowserMultiFormatReader decodes QR/barcode from
 *      the device rear camera. BarcodeDetector native API used as speedup
 *      where available; falls back to ZXing on all other platforms.
 *   3. Numeric fallback — user types a short asset code when camera fails
 *      or label is damaged.
 *
 * On successful decode the asset code is submitted to POST /api/scan.
 * A 1.0-second confirmation overlay shows asset name and current WO state
 * before surfacing the action prompt — this prevents wrong-asset errors,
 * especially on camera devices where aiming is less precise.
 *
 * The server owns all state logic — this component only acquires the asset
 * code and delivers the server's branch response to the parent via onResult.
 *
 * -- API DEPENDENCIES ------------------------------------------
 *   POST /api/scan     Submit scan event, receive branch response
 *
 * -- PROPS -----------------------------------------------------
 *   plantId      {string}   Plant DB scope for the API request
 *   userId       {string}   Authenticated user performing the scan
 *   onResult     {function} Called with server branch response + scanId
 *   onError      {function} Called with error string on hard failure
 *   className    {string}   Optional outer wrapper class
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, Hash, Scan, X, CheckCircle, AlertTriangle } from 'lucide-react';
import { BrowserMultiFormatReader } from '@zxing/library';
import { useTranslation } from '../i18n/index.jsx';

// Keyboard-wedge scanners burst a full barcode in <100ms then send Enter.
// We allow up to 80ms between characters to classify input as a scanner burst.
const WEDGE_BURST_MS = 80;

// Confirmation overlay stays visible for exactly 1.0 second then resolves.
const CONFIRM_FLASH_MS = 1000;

export default function ScanCapture({ plantId, userId, onResult, onError, className = '', initialAssetId = null }) {
    const { t } = useTranslation();
    const [mode, setMode] = useState('idle');        // idle | camera | numeric | confirming | submitting
    const [manualInput, setManualInput] = useState('');
    const [confirmation, setConfirmation] = useState(null); // { assetId, assetName, woStatus }
    const [statusMsg, setStatusMsg] = useState('');
    const [cameraError, setCameraError] = useState('');

    // Refs for hardware scanner wedge detection
    const wedgeBufferRef = useRef('');
    const wedgeTimerRef  = useRef(null);
    const hiddenInputRef = useRef(null);
    const videoRef       = useRef(null);
    const zxingRef       = useRef(null);
    const cameraStreamRef = useRef(null);
    const confirmTimerRef = useRef(null);
    const autoSubmittedRef = useRef(false);

    // ── Hardware scanner: keep hidden input focused when idle ─────────────────
    useEffect(() => {
        if (mode === 'idle' && hiddenInputRef.current) {
            hiddenInputRef.current.focus();
        }
    }, [mode]);

    // ── Auto-submit when routed here from a hardware scan of a known asset ────
    useEffect(() => {
        if (initialAssetId && !autoSubmittedRef.current) {
            autoSubmittedRef.current = true;
            setTimeout(() => submitScan(initialAssetId), 150);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Cleanup on unmount ────────────────────────────────────────────────────
    useEffect(() => {
        return () => {
            stopCamera();
            clearTimeout(wedgeTimerRef.current);
            clearTimeout(confirmTimerRef.current);
        };
    }, []);

    // ── Hardware wedge: capture rapid keystroke bursts from barcode scanners ──
    // Characters arriving within WEDGE_BURST_MS of each other are buffered.
    // When the burst ends (Enter key or timeout), the buffer is treated as a scan.
    const handleWedgeKey = useCallback((e) => {
        if (mode !== 'idle') return;

        if (e.key === 'Enter') {
            e.preventDefault();
            const code = wedgeBufferRef.current.trim();
            wedgeBufferRef.current = '';
            if (code) submitScan(code);
            return;
        }

        if (e.key.length === 1) {
            wedgeBufferRef.current += e.key;
            clearTimeout(wedgeTimerRef.current);
            // If no new character arrives within WEDGE_BURST_MS, flush the buffer
            wedgeTimerRef.current = setTimeout(() => {
                const code = wedgeBufferRef.current.trim();
                wedgeBufferRef.current = '';
                if (code.length >= 3) submitScan(code); // ignore single stray keypresses
            }, WEDGE_BURST_MS);
        }
    }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Camera: open rear camera and start ZXing decode loop ─────────────────
    const startCamera = useCallback(async () => {
        setCameraError('');
        setMode('camera');
        try {
            // Request rear camera (environment) — standard for QR scanning on mobile
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' } }
            });
            cameraStreamRef.current = stream;
            if (videoRef.current) videoRef.current.srcObject = stream;

            // Try native BarcodeDetector (Chromium 83+) for faster decode
            if ('BarcodeDetector' in window) {
                const detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'upc_a'] });
                const detectFrame = async () => {
                    if (!cameraStreamRef.current) return;
                    try {
                        const barcodes = await detector.detect(videoRef.current);
                        if (barcodes.length > 0) {
                            stopCamera();
                            submitScan(barcodes[0].rawValue);
                            return;
                        }
                    } catch (_) { /* frame not ready yet */ }
                    requestAnimationFrame(detectFrame);
                };
                requestAnimationFrame(detectFrame);
            } else {
                // Fall back to ZXing BrowserMultiFormatReader
                zxingRef.current = new BrowserMultiFormatReader();
                zxingRef.current.decodeFromVideoElement(videoRef.current, (result, err) => {
                    if (result) {
                        stopCamera();
                        submitScan(result.getText());
                    }
                });
            }
        } catch (err) {
            setCameraError(err.name === 'NotAllowedError'
                ? 'Camera permission denied. Use numeric entry instead.'
                : `Camera unavailable: ${err.message}`);
            setMode('numeric');
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const stopCamera = useCallback(() => {
        if (zxingRef.current) {
            try { zxingRef.current.reset(); } catch (_) {}
            zxingRef.current = null;
        }
        if (cameraStreamRef.current) {
            cameraStreamRef.current.getTracks().forEach(t => t.stop());
            cameraStreamRef.current = null;
        }
        if (videoRef.current) videoRef.current.srcObject = null;
    }, []);

    // ── Numeric fallback submit ───────────────────────────────────────────────
    const handleManualSubmit = useCallback((e) => {
        e.preventDefault();
        const code = manualInput.trim();
        if (code) {
            setManualInput('');
            submitScan(code);
        }
    }, [manualInput]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Core: submit decoded asset code to POST /api/scan ────────────────────
    const submitScan = useCallback(async (rawCode) => {
        // Strip Trier OS QR URL format: extract asset ID from ?scan= param
        let assetId = (rawCode || '').trim();
        if (assetId.includes('?scan=')) {
            try {
                const qp = new URLSearchParams(assetId.includes('?') ? assetId.split('?')[1] : '');
                assetId = qp.get('scan') || assetId;
            } catch (_) {}
        }

        setMode('submitting');
        setStatusMsg('');

        const scanId = crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

        const deviceTimestamp = new Date().toISOString();

        try {
            const res = await fetch('/api/scan', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-plant-id': plantId,
                },
                body: JSON.stringify({ scanId, assetId, userId, deviceTimestamp }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `Server error ${res.status}`);
            }

            const data = await res.json();

            // Show 1.0s confirmation overlay before resolving to the action prompt.
            // Gives the tech a moment to verify correct asset before committing.
            setConfirmation({
                assetId,
                assetName: data.wo?.description || assetId,
                woStatus: data.wo ? `WO ${data.wo.number}` : 'New Work Order',
                branch: data.branch,
                offline: !!data._offlinePredicted,
            });
            setMode('confirming');

            confirmTimerRef.current = setTimeout(() => {
                setConfirmation(null);
                setMode('idle');
                onResult({ ...data, scanId, deviceTimestamp });
            }, CONFIRM_FLASH_MS);

        } catch (err) {
            setMode('idle');
            setStatusMsg(err.message);
            onError?.(err.message);
        }
    }, [plantId, userId, onResult, onError]);

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className={`scan-capture ${className}`} style={{ position: 'relative' }}>

            {/* Hidden input — always captures keyboard-wedge scanner input when mode=idle */}
            <input
                ref={hiddenInputRef}
                style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 }}
                onKeyDown={handleWedgeKey}
                readOnly
                aria-hidden="true"
                tabIndex={-1}
            />

            {/* ── Confirmation overlay (1.0s flash) ─────────────────────── */}
            {mode === 'confirming' && confirmation && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 9999,
                    background: 'rgba(0,0,0,0.75)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <div style={{
                        background: '#1a2236', border: '1px solid #2a3f5f',
                        borderRadius: 16, padding: '32px 40px', textAlign: 'center',
                        minWidth: 280, maxWidth: 360,
                    }}>
                        <CheckCircle size={40} color="#22c55e" style={{ marginBottom: 12 }} />
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9', marginBottom: 6 }}>
                            {confirmation.assetId}
                        </div>
                        <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 4 }}>
                            {confirmation.assetName}
                        </div>
                        <div style={{ fontSize: 13, color: '#64748b' }}>
                            {confirmation.woStatus}
                        </div>
                        {confirmation.offline && (
                            <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 8 }}>
                                Offline — will sync when connected
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Submitting state ──────────────────────────────────────── */}
            {mode === 'submitting' && (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: 14 }}>
                    Processing scan…
                </div>
            )}

            {/* ── Idle state: scan button cluster ──────────────────────── */}
            {(mode === 'idle' || mode === 'numeric') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {cameraError && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            background: '#3b1f1f', border: '1px solid #7f1d1d',
                            borderRadius: 8, padding: '10px 14px',
                            color: '#fca5a5', fontSize: 13,
                        }}>
                            <AlertTriangle size={16} />
                            {cameraError}
                        </div>
                    )}
                    {statusMsg && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            background: '#3b1f1f', border: '1px solid #7f1d1d',
                            borderRadius: 8, padding: '10px 14px',
                            color: '#fca5a5', fontSize: 13,
                        }}>
                            <AlertTriangle size={16} />
                            {statusMsg}
                        </div>
                    )}

                    {/* Camera scan button */}
                    <button
                        onClick={startCamera}
                        style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            gap: 10, padding: '16px 24px', borderRadius: 12,
                            background: '#1e3a5f', border: '1px solid #2563eb',
                            color: '#93c5fd', fontSize: 16, fontWeight: 600, cursor: 'pointer',
                        }}
                    >
                        <Camera size={22} />
                        Scan QR Code
                    </button>

                    {/* Numeric fallback */}
                    <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: 8 }}>
                        <input
                            value={manualInput}
                            onChange={e => setManualInput(e.target.value)}
                            placeholder="Enter asset number"
                            style={{
                                flex: 1, padding: '12px 14px', borderRadius: 8,
                                background: '#0f172a', border: '1px solid #334155',
                                color: '#f1f5f9', fontSize: 15,
                            }}
                        />
                        <button
                            type="submit"
                            disabled={!manualInput.trim()}
                            style={{
                                padding: '12px 18px', borderRadius: 8,
                                background: manualInput.trim() ? '#2563eb' : '#1e293b',
                                border: 'none', color: '#fff', cursor: manualInput.trim() ? 'pointer' : 'default',
                            }}
                        >
                            <Hash size={18} />
                        </button>
                    </form>

                    <div style={{ fontSize: 12, color: '#475569', textAlign: 'center' }}>
                        Hardware scanner auto-detects — just scan
                    </div>
                </div>
            )}

            {/* ── Camera active state ───────────────────────────────────── */}
            {mode === 'camera' && (
                <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#000' }}>
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        style={{ width: '100%', maxHeight: 360, display: 'block' }}
                    />
                    <button
                        onClick={() => { stopCamera(); setMode('idle'); }}
                        style={{
                            position: 'absolute', top: 12, right: 12,
                            background: 'rgba(0,0,0,0.6)', border: 'none',
                            borderRadius: '50%', padding: 8, cursor: 'pointer', color: '#fff',
                        }}
                    >
                        <X size={20} />
                    </button>
                    {cameraError && (
                        <div style={{
                            position: 'absolute', bottom: 12, left: 12, right: 12,
                            background: '#7f1d1d', color: '#fca5a5',
                            borderRadius: 8, padding: '8px 12px', fontSize: 13,
                        }}>
                            {cameraError}
                        </div>
                    )}
                    <div style={{
                        position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
                        color: '#94a3b8', fontSize: 13, whiteSpace: 'nowrap',
                    }}>
                        Point at asset QR code
                    </div>
                </div>
            )}
        </div>
    );
}
