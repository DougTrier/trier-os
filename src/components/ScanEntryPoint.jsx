// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * ScanEntryPoint.jsx — Scan State Machine — Manual Asset Entry
 * =============================================================
 * Provides the manual / forgot-scanner recovery path into the scan state
 * machine. Placed on any asset detail page, it lets a technician:
 *
 *   1. See the asset's QR code (so another device can scan it, or to visually
 *      confirm they're on the right machine before starting work).
 *   2. Tap "Start Work" (or whatever the state machine decides) without
 *      needing a physical scanner — the assetId is already known from the
 *      page context, so it submits directly to POST /api/scan.
 *
 * The lifecycle from this point is identical to a physical scan:
 *   POST /api/scan  →  1s confirmation overlay  →  ScanActionPrompt
 *
 * No separate "manual workflow" exists — this is just a different input
 * path into the same deterministic state machine.
 *
 * -- API DEPENDENCIES ------------------------------------------
 *   POST /api/scan     Same endpoint as ScanCapture — asset is pre-identified
 *
 * -- PROPS -----------------------------------------------------
 *   assetId   {string}   The asset's canonical ID (already known from page)
 *   plantId   {string}   Plant DB scope
 *   userId    {string}   Authenticated user performing the action
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Scan, QrCode, CheckCircle, X, Users, Clock, AlertCircle, PauseCircle } from 'lucide-react';
import ScanActionPrompt from './ScanActionPrompt';

// Confirmation overlay duration — matches ScanCapture spec
const CONFIRM_FLASH_MS = 1000;

const WO_STATUS_LABEL = {
    20: { label: 'Open — Not Started',         color: '#60a5fa', icon: 'open'    },
    30: { label: 'In Progress',                 color: '#22c55e', icon: 'active'  },
    31: { label: 'On Hold — Waiting on Parts',  color: '#f59e0b', icon: 'hold'   },
    32: { label: 'On Hold — Waiting on Vendor', color: '#f59e0b', icon: 'hold'   },
    33: { label: 'Escalated',                   color: '#f87171', icon: 'alert'  },
    35: { label: 'On Hold',                     color: '#f59e0b', icon: 'hold'   },
};

function relativeTime(isoString) {
    if (!isoString) return null;
    const diff = Date.now() - new Date(isoString).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins < 1)   return 'just now';
    if (mins < 60)  return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
}

// ── Inline QR code rendered to a <canvas> via the qrcode package ─────────────
// Uses dynamic import so the 40 KB qrcode bundle doesn't affect initial load.
function AssetQRCanvas({ assetId, size = 128 }) {
    const canvasRef = useRef(null);
    const [err, setErr] = useState('');

    useEffect(() => {
        if (!assetId || !canvasRef.current) return;
        let cancelled = false;
        import('qrcode').then(QRCode => {
            if (cancelled) return;
            QRCode.toCanvas(canvasRef.current, assetId, {
                width: size,
                margin: 1,
                color: { dark: '#f1f5f9', light: '#0f172a' },
            }, (error) => {
                if (error && !cancelled) setErr(error.message);
            });
        }).catch(e => { if (!cancelled) setErr(e.message); });
        return () => { cancelled = true; };
    }, [assetId, size]);

    if (err) return <div style={{ color: '#f87171', fontSize: 12 }}>QR unavailable</div>;
    return (
        <canvas
            ref={canvasRef}
            width={size}
            height={size}
            style={{ borderRadius: 8, display: 'block' }}
            title={`QR code for asset ${assetId}`}
        />
    );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ScanEntryPoint({ assetId, plantId, userId }) {
    const [scanning, setScanning]       = useState(false);  // waiting for /api/scan response
    const [confirming, setConfirming]   = useState(false);  // 1s flash overlay
    const [confirmation, setConfirmation] = useState(null); // { assetName, woStatus }
    const [branchResult, setBranchResult] = useState(null); // full POST /api/scan response
    const [error, setError]             = useState('');
    const [showQR, setShowQR]           = useState(false);
    const [assetStatus, setAssetStatus] = useState(null);   // { activeWo, activeTechs, lastWorked }
    const confirmTimerRef               = useRef(null);

    // Cleanup on unmount
    useEffect(() => () => clearTimeout(confirmTimerRef.current), []);

    // Fetch live work status — active WO, tech count, last activity timestamp
    useEffect(() => {
        if (!assetId || !plantId) return;
        fetch(`/api/scan/asset-status/${encodeURIComponent(assetId)}`, {
            headers: { 'x-plant-id': plantId },
        })
            .then(r => r.ok ? r.json() : null)
            .then(data => setAssetStatus(data ?? null))
            .catch(() => {}); // non-critical — degrades gracefully
    }, [assetId, plantId, branchResult]); // re-check after an action completes

    const activeWo = assetStatus?.activeWo ?? null;
    const activeTechs = assetStatus?.activeTechs ?? [];
    const lastWorked = assetStatus?.lastWorked ?? null;

    // ── Trigger the scan state machine with the known assetId ─────────────────
    const startWork = useCallback(async () => {
        if (scanning || confirming) return;
        setScanning(true);
        setError('');

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
            setScanning(false);

            // 1s confirmation flash — same behaviour as ScanCapture
            setConfirmation({
                assetName: data.wo?.description || assetId,
                woStatus:  data.wo ? `WO ${data.wo.number}` : 'New Work Order',
            });
            setConfirming(true);

            confirmTimerRef.current = setTimeout(() => {
                setConfirming(false);
                setConfirmation(null);
                setBranchResult({ ...data, scanId, deviceTimestamp });
            }, CONFIRM_FLASH_MS);

        } catch (err) {
            setScanning(false);
            setError(err.message);
        }
    }, [assetId, plantId, userId, scanning, confirming]);

    // Branches that come from POST /api/scan (not action results) and should
    // re-render the action prompt. Action results like PROMPT_TEAM_CLOSE,
    // STATE_WAITING_xxx, STATE_RESUMED, DESK_RESUME, etc. are NOT scan branches
    // and must NOT re-render — they should close the modal.
    const SCAN_BRANCHES = new Set([
        'AUTO_CREATE_WO', 'ROUTE_TO_ACTIVE_WO', 'ROUTE_TO_WAITING_WO',
        'ROUTE_TO_ESCALATED_WO', 'ROUTE_TO_CHILD_SELECTOR', 'ROUTE_TO_DIGITAL_TWIN',
        'ROUTE_TO_DIGITAL_TWIN_OFFLINE_BLOCKED', 'ROUTE_TO_PART_CHECKOUT',
        'REQUIRE_SOP_ACK', 'AUTO_REJECT_DUPLICATE_SCAN',
    ]);

    const handleActionComplete = useCallback((result) => {
        // Only chain if this is a real scan branch (e.g., child asset selected → new scan result).
        // Action completion results (WAITING, TEAM_CLOSE, RESUME, etc.) always close the modal.
        if (result?.branch && SCAN_BRANCHES.has(result.branch)) {
            setBranchResult(result);
        } else {
            setBranchResult(null);
        }
        setError('');
    }, []);

    // ── Confirmation overlay (1s flash) ───────────────────────────────────────
    const confirmOverlay = confirming && confirmation && createPortal(
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
                    {assetId}
                </div>
                <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 4 }}>
                    {confirmation.assetName}
                </div>
                <div style={{ fontSize: 13, color: '#64748b' }}>
                    {confirmation.woStatus}
                </div>
            </div>
        </div>,
        document.body
    );

    // ── Action prompt overlay ─────────────────────────────────────────────────
    const actionOverlay = branchResult && createPortal(
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(0,0,0,0.75)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 16px',
            }}
            onClick={handleActionComplete}
        >
            <div
                style={{
                    background: '#0f172a', border: '1px solid #1e293b',
                    borderRadius: 16, padding: '24px 20px',
                    width: '100%', maxWidth: 440,
                }}
                onClick={e => e.stopPropagation()}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <span style={{ color: '#94a3b8', fontSize: 13 }}>
                        <Scan size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                        {assetId}
                    </span>
                    <button
                        onClick={handleActionComplete}
                        style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 4 }}
                    >
                        <X size={18} />
                    </button>
                </div>
                <ScanActionPrompt
                    plantId={plantId}
                    userId={userId}
                    scanId={branchResult.scanId}
                    deviceTimestamp={branchResult.deviceTimestamp}
                    branchResponse={branchResult}
                    onActionComplete={handleActionComplete}
                    onCancel={handleActionComplete}
                />
            </div>
        </div>,
        document.body
    );

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <>
            {confirmOverlay}
            {actionOverlay}

            <div style={{
                background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)',
                borderRadius: 10, padding: '14px 16px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <Scan size={15} color="#10b981" />
                    <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 13 }}>
                        Work Order Actions
                    </span>
                    {/* QR toggle */}
                    <button
                        onClick={() => setShowQR(x => !x)}
                        title={showQR ? 'Hide QR code' : 'Show QR code for this asset'}
                        style={{
                            marginLeft: 'auto', background: 'none', border: 'none',
                            color: showQR ? '#10b981' : '#475569',
                            cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', gap: 5,
                            fontSize: 12,
                        }}
                    >
                        <QrCode size={14} />
                        {showQR ? 'Hide QR' : 'Show QR'}
                    </button>
                </div>

                {/* Inline QR code — toggle on demand */}
                {showQR && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 16,
                        marginBottom: 14, padding: '12px', borderRadius: 8,
                        background: 'rgba(0,0,0,0.3)',
                    }}>
                        <AssetQRCanvas assetId={assetId} size={128} />
                        <div>
                            <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                                {assetId}
                            </div>
                            <div style={{ color: '#64748b', fontSize: 12, lineHeight: 1.5 }}>
                                Scan this QR with any device to enter the work order flow.
                            </div>
                        </div>
                    </div>
                )}

                {error && (
                    <div style={{
                        background: '#3b1f1f', border: '1px solid #7f1d1d',
                        borderRadius: 8, padding: '8px 12px',
                        color: '#fca5a5', fontSize: 13, marginBottom: 10,
                    }}>
                        {error}
                    </div>
                )}

                {/* Asset work status panel — WO state, active techs, last worked */}
                {(activeWo || lastWorked) && (() => {
                    const statusMeta = activeWo ? (WO_STATUS_LABEL[activeWo.statusId] || { label: `Status ${activeWo.statusId}`, color: '#94a3b8', icon: 'open' }) : null;
                    const isOnHold   = statusMeta?.icon === 'hold';
                    const isEscalated = statusMeta?.icon === 'alert';
                    const accentColor = statusMeta?.color || '#94a3b8';
                    return (
                        <div style={{
                            marginBottom: 10, borderRadius: 8,
                            border: `1px solid ${accentColor}33`,
                            background: `${accentColor}0d`,
                            overflow: 'hidden',
                        }}>
                            {/* WO identity row */}
                            {activeWo && (
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '7px 12px', borderBottom: activeTechs.length > 0 || lastWorked ? `1px solid ${accentColor}22` : 'none',
                                }}>
                                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: accentColor, flexShrink: 0 }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ color: accentColor, fontSize: 12, fontWeight: 600 }}>
                                            {isEscalated && <AlertCircle size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />}
                                            {isOnHold && <PauseCircle size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />}
                                            {statusMeta.label}
                                        </div>
                                        <div style={{ color: '#64748b', fontSize: 11, marginTop: 1 }}>
                                            {activeWo.number || `WO #${activeWo.id}`}
                                            {activeWo.description ? ` — ${activeWo.description}` : ''}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Active technicians row */}
                            {activeTechs.length > 0 && (
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 7,
                                    padding: '6px 12px',
                                    borderBottom: lastWorked ? `1px solid ${accentColor}22` : 'none',
                                }}>
                                    <Users size={12} color="#22c55e" />
                                    <span style={{ color: '#22c55e', fontSize: 12, fontWeight: 600 }}>
                                        {activeTechs.length === 1
                                            ? `${activeTechs[0].userId} is actively working`
                                            : `${activeTechs.length} technicians currently working`}
                                    </span>
                                    {activeTechs.length > 1 && (
                                        <span style={{ color: '#64748b', fontSize: 11 }}>
                                            ({activeTechs.map(t => t.userId).join(', ')})
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* Last worked row */}
                            {lastWorked && (
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 7,
                                    padding: '6px 12px',
                                }}>
                                    <Clock size={12} color="#64748b" />
                                    <span style={{ color: '#64748b', fontSize: 11 }}>
                                        Last worked {relativeTime(lastWorked)}
                                    </span>
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* Primary action — calls the same state machine as a physical scan */}
                {(() => {
                    const sid = activeWo?.statusId;
                    const btnBg    = scanning || confirming ? '#1e293b'
                        : sid === 33 ? '#dc2626'   // escalated — red
                        : sid === 30 ? '#f59e0b'   // in progress — amber (manage)
                        : sid >= 31 && sid <= 35 ? '#3b82f6'  // on hold — blue (resume)
                        : sid === 20 ? '#6366f1'   // open/assigned — indigo
                        : '#10b981';               // no WO — green (start)
                    const btnColor = (sid === 30) ? '#1c1a00' : '#fff';
                    const btnLabel = scanning ? 'Loading…'
                        : sid === 33 ? 'Manage Escalated Work Order'
                        : sid === 30 ? 'Manage Active Work Order'
                        : (sid >= 31 && sid <= 35) ? 'Resume Work'
                        : sid === 20 ? 'Start Assigned Work'
                        : 'Start Work on This Asset';
                    return (
                        <button
                            onClick={startWork}
                            disabled={scanning || confirming}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                gap: 8, width: '100%', padding: '12px 16px', borderRadius: 8,
                                background: btnBg,
                                border: 'none', color: btnColor,
                                fontSize: 15, fontWeight: 700,
                                cursor: scanning || confirming ? 'default' : 'pointer',
                                opacity: scanning || confirming ? 0.6 : 1,
                                transition: 'background 0.2s, opacity 0.15s',
                            }}
                        >
                            <Scan size={18} />
                            {btnLabel}
                        </button>
                    );
                })()}
            </div>
        </>
    );
}
