// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * ScanActionPrompt.jsx — Scan State Machine — Action Prompt Layer
 * ================================================================
 * Context-adaptive tap-only prompt shown after ScanCapture delivers a
 * branch response from POST /api/scan. Renders the correct option set
 * based on the server-resolved decision branch — the layout and choices
 * are fully driven by the branch response, not client-side state guessing.
 *
 * Covers all prompt surfaces defined in the scan state machine spec:
 *   ROUTE_TO_ACTIVE_WO / SOLO        → Close WO, Waiting, Escalate, Continue Later
 *   ROUTE_TO_ACTIVE_WO / MULTI_TECH  → Leave Work, Close for Team, Waiting, Escalate, Continue Later
 *   ROUTE_TO_ACTIVE_WO / OTHER_USER  → Join, Take Over, Escalate
 *   ROUTE_TO_WAITING_WO              → Resume Waiting WO, Create New WO, View Status
 *   ROUTE_TO_ESCALATED_WO            → Join Response, Take Over Response, View Status
 *   AUTO_CREATE_WO                   → Close WO, Waiting, Scan/Add Parts, Escalate, Continue Later
 *   AUTO_REJECT_DUPLICATE_SCAN       → Warning only
 *   ROUTE_TO_CHILD_SELECTOR          → Tap-list of sub-components + Add New Sub-Component
 *   ROUTE_TO_PART_CHECKOUT           → Part info + quantity picker (direct part QR scan)
 *
 * When the WAITING option is selected, a secondary picker surfaces the
 * hold reason taxonomy (tech-selectable codes only). SCHEDULED_RETURN
 * additionally prompts for a return window (tap-only, no keyboard).
 *
 * All choices submit to POST /api/scan/action. Result is passed to parent
 * via onActionComplete so the parent can refresh the WO list or close the modal.
 *
 * -- API DEPENDENCIES ------------------------------------------
 *   POST /api/scan/action    Submit user choice; receive next state
 *
 * -- PROPS -----------------------------------------------------
 *   plantId         {string}    Plant DB scope
 *   userId          {string}    Authenticated user
 *   scanId          {string}    scanId from the original scan event
 *   deviceTimestamp {string}    ISO timestamp from the original scan
 *   branchResponse  {object}    Full response from POST /api/scan
 *   onActionComplete {function} Called with action result when done
 *   onCancel        {function}  Called when user dismisses without action
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { CheckCircle, Clock, AlertTriangle, Users, UserCheck, UserX, Plus, Eye, ArrowLeft, Package, Camera, Search, Layers, RotateCcw } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';
import WorkOrderPartsCart from './WorkOrderPartsCart';

// ── Tech-selectable hold reason codes (never show UNKNOWN_HOLD on device) ────
const HOLD_REASONS = [
    { code: 'WAITING_ON_PARTS',     label: 'Waiting on Parts',        exempt: true  },
    { code: 'WAITING_ON_VENDOR',    label: 'Waiting on Vendor',       exempt: true  },
    { code: 'WAITING_ON_APPROVAL',  label: 'Waiting on Approval',     exempt: true  },
    { code: 'SCHEDULED_RETURN',     label: 'Scheduled Return',        exempt: true  },
    { code: 'CONTINUE_LATER',       label: 'Continue Later',          exempt: false },
    { code: 'SHIFT_END_UNRESOLVED', label: 'Shift End — Unresolved',  exempt: false },
];

// ── SCHEDULED_RETURN window options (no keyboard — tap only) ─────────────────
const RETURN_WINDOWS = [
    { code: 'LATER_THIS_SHIFT', label: 'Later This Shift' },
    { code: 'NEXT_SHIFT',       label: 'Next Shift'       },
    { code: 'TOMORROW',         label: 'Tomorrow'         },
];

// ── Shared tap button style ───────────────────────────────────────────────────
function TapBtn({ children, onClick, variant = 'default', disabled = false, number }) {
    const colors = {
        default:  { bg: '#1e3a5f', border: '#2563eb', text: '#93c5fd' },
        success:  { bg: '#14532d', border: '#16a34a', text: '#86efac' },
        warning:  { bg: '#431407', border: '#c2410c', text: '#fdba74' },
        danger:   { bg: '#3b0764', border: '#7c3aed', text: '#c4b5fd' },
        neutral:  { bg: '#1e293b', border: '#334155', text: '#94a3b8' },
    };
    const c = colors[variant] || colors.default;
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '16px 20px', borderRadius: 12, width: '100%',
                background: disabled ? '#0f172a' : c.bg,
                border: `1px solid ${disabled ? '#1e293b' : c.border}`,
                color: disabled ? '#475569' : c.text,
                fontSize: 16, fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
                textAlign: 'left', marginBottom: 8, transition: 'opacity 0.15s',
            }}
        >
            {number !== undefined && (
                <span style={{
                    minWidth: 28, height: 28, borderRadius: '50%',
                    background: disabled ? '#1e293b' : c.border,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0,
                }}>
                    {number}
                </span>
            )}
            {children}
        </button>
    );
}

export default function ScanActionPrompt({
    plantId, userId, scanId, deviceTimestamp, branchResponse,
    onActionComplete, onCancel,
}) {
    const { t } = useTranslation();
    const [submitting, setSubmitting] = useState(false);
    const [sopSuccess, setSopSuccess] = useState(false); // WO created after SOP ack — show confirmation before transition
    const [error, setError] = useState('');
    const [screen, setScreen] = useState('main'); // main | hold_reason | return_window | team_close_confirm | parts_search | parts_quantity | add_child | batch_scan | batch_confirm
    const [selectedHoldReason, setSelectedHoldReason] = useState(null);
    const [selectedPin, setSelectedPin] = useState(null);
    const [acknowledgedSops, setAcknowledgedSops] = useState([]);
    // Parts checkout state
    const [partsWoId, setPartsWoId] = useState(null);
    const [partSearchQuery, setPartSearchQuery] = useState('');
    const [partSearchResults, setPartSearchResults] = useState([]);
    const [partSearchLoading, setPartSearchLoading] = useState(false);
    const [selectedPart, setSelectedPart] = useState(null);
    const [partQty, setPartQty] = useState(1);
    const [partsAdded, setPartsAdded] = useState([]);
    const [woParts, setWoParts] = useState([]);          // parts already linked to this WO
    const [woPartsChecked, setWoPartsChecked] = useState(new Set()); // checked partIDs
    const [woPartsLoading, setWoPartsLoading] = useState(false);
    // Add sub-component state
    const [addChildName, setAddChildName] = useState('');
    const [addChildPhoto, setAddChildPhoto] = useState(null);
    const [childSaving, setChildSaving] = useState(false);
    const photoInputRef = useRef(null);
    // AUTO_ADDED_PART undo state
    const [autoAddUndone, setAutoAddUndone] = useState(false);
    // Batch scan state
    const [batchItems, setBatchItems] = useState([]); // [{ partId, description, qty }]
    const [batchInput, setBatchInput] = useState('');
    const [batchLookupLoading, setBatchLookupLoading] = useState(false);
    const [batchError, setBatchError] = useState('');
    const [batchSubmitting, setBatchSubmitting] = useState(false);
    const batchInputRef = useRef(null);

    const { branch, context, wo, options = [], activeUsers = [] } = branchResponse || {};

    // ── Debounced parts search ────────────────────────────────────────────────
    useEffect(() => {
        if (screen !== 'parts_search') return;
        if (!partSearchQuery.trim()) { setPartSearchResults([]); return; }
        const timer = setTimeout(async () => {
            setPartSearchLoading(true);
            try {
                const res = await fetch(`/api/scan/parts-search?q=${encodeURIComponent(partSearchQuery)}`, {
                    headers: { 'x-plant-id': plantId },
                });
                const data = await res.json();
                setPartSearchResults(data.parts || []);
            } catch (_) { setPartSearchResults([]); }
            setPartSearchLoading(false);
        }, 300);
        return () => clearTimeout(timer);
    }, [partSearchQuery, screen, plantId]);

    // ── Open parts screen for a given WO ─────────────────────────────────────
    const openPartsScreen = (woId) => {
        setPartsWoId(woId);
        setPartSearchQuery('');
        setPartSearchResults([]);
        setPartsAdded([]);
        setWoParts([]);
        setWoPartsChecked(new Set());
        setWoPartsLoading(true);
        setScreen('parts_search');
        fetch(`/api/scan/wo-parts?woId=${encodeURIComponent(woId)}`, {
            headers: { 'x-plant-id': plantId },
        })
            .then(r => r.ok ? r.json() : { parts: [] })
            .then(data => setWoParts(data.parts || []))
            .catch(() => setWoParts([]))
            .finally(() => setWoPartsLoading(false));
    };

    // ── Open batch scan mode ──────────────────────────────────────────────────
    const openBatchScan = (woId) => {
        setPartsWoId(woId);
        setBatchItems([]);
        setBatchInput('');
        setBatchError('');
        setScreen('batch_scan');
        setTimeout(() => batchInputRef.current?.focus(), 100);
    };

    // ── Batch: look up a barcode/part ID and add to session list ─────────────
    const handleBatchScan = async (rawInput) => {
        const q = rawInput.trim();
        if (!q) return;
        setBatchInput('');
        setBatchLookupLoading(true);
        setBatchError('');
        try {
            const res = await fetch(`/api/scan/parts-search?q=${encodeURIComponent(q)}`, {
                headers: { 'x-plant-id': plantId },
            });
            const data = await res.json();
            const parts = data.parts || [];
            // Exact ID match first, then first result
            const match = parts.find(p => p.ID === q || p.ID?.toLowerCase() === q.toLowerCase()) || parts[0];
            if (match) {
                setBatchItems(prev => {
                    const existing = prev.find(i => i.partId === match.ID);
                    if (existing) {
                        return prev.map(i => i.partId === match.ID ? { ...i, qty: i.qty + 1 } : i);
                    }
                    return [...prev, { partId: match.ID, description: match.description, qty: 1, status: 'matched' }];
                });
                if (navigator.vibrate) navigator.vibrate(80);
            } else {
                setBatchItems(prev => [...prev, { partId: null, description: q, qty: 1, status: 'unknown', raw: q }]);
            }
        } catch (_) {
            setBatchError('Lookup failed — check connection');
        }
        setBatchLookupLoading(false);
        setTimeout(() => batchInputRef.current?.focus(), 50);
    };

    // ── Batch: commit all matched items to the WO ─────────────────────────────
    const commitBatchScan = async () => {
        const matched = batchItems.filter(i => i.status === 'matched' && i.partId);
        if (!matched.length || !partsWoId) return;
        setBatchSubmitting(true);
        setBatchError('');
        const results = [];
        for (const item of matched) {
            try {
                const res = await fetch('/api/scan/parts-checkout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                    body: JSON.stringify({ woId: partsWoId, partId: item.partId, quantity: item.qty }),
                });
                const data = await res.json();
                results.push({ ...item, ok: res.ok, error: res.ok ? null : (data.error || 'Failed') });
            } catch (e) {
                results.push({ ...item, ok: false, error: e.message });
            }
        }
        setBatchItems(results);
        setBatchSubmitting(false);
        setScreen('batch_confirm');
    };

    // ── Commit parts checkout ─────────────────────────────────────────────────
    const handlePartCheckout = async () => {
        if (!selectedPart || !partQty || !partsWoId) return;
        setSubmitting(true);
        setError('');
        try {
            const res = await fetch('/api/scan/parts-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                body: JSON.stringify({ woId: partsWoId, partId: selectedPart.id, quantity: partQty }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
            setPartsAdded(prev => [...prev, { ...selectedPart, qty: partQty }]);
            setSelectedPart(null);
            setPartQty(1);
            setPartSearchQuery('');
            setPartSearchResults([]);
            setScreen('parts_search');
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    // ── Scan a child asset after selecting from picker ────────────────────────
    const handleChildSelect = async (child) => {
        setSubmitting(true);
        setError('');
        try {
            const newScanId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const newTimestamp = new Date().toISOString();
            const res = await fetch('/api/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                body: JSON.stringify({ scanId: newScanId, assetId: child.ID, userId, deviceTimestamp: newTimestamp }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
            onActionComplete({ ...data, scanId: newScanId, deviceTimestamp: newTimestamp });
        } catch (err) {
            setError(err.message);
            setSubmitting(false);
        }
    };

    // ── Create a new child asset then scan into it ────────────────────────────
    const handleAddChild = async () => {
        if (!addChildName.trim()) return;
        setChildSaving(true);
        setError('');
        try {
            const createRes = await fetch('/api/scan/add-child-asset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                body: JSON.stringify({
                    name: addChildName.trim(),
                    parentId: branchResponse?.parentAsset?.id,
                    photoDataUrl: addChildPhoto || null,
                }),
            });
            const created = await createRes.json();
            if (!createRes.ok) throw new Error(created.error || `Server error ${createRes.status}`);
            const newScanId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const newTimestamp = new Date().toISOString();
            const scanRes = await fetch('/api/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                body: JSON.stringify({ scanId: newScanId, assetId: created.id, userId, deviceTimestamp: newTimestamp }),
            });
            const scanData = await scanRes.json();
            if (!scanRes.ok) throw new Error(scanData.error || `Server error ${scanRes.status}`);
            onActionComplete({ ...scanData, scanId: newScanId, deviceTimestamp: newTimestamp });
        } catch (err) {
            setError(err.message);
            setChildSaving(false);
        }
    };

    // ── Submit an action to POST /api/scan/action ─────────────────────────────
    const submitAction = useCallback(async ({ action, holdReason, returnWindow }) => {
        setSubmitting(true);
        setError('');
        try {
            const res = await fetch('/api/scan/action', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-plant-id': plantId,
                },
                body: JSON.stringify({
                    scanId: scanId || crypto.randomUUID(),
                    woId: wo?.id, userId,
                    action, holdReason, returnWindow,
                    deviceTimestamp: deviceTimestamp || new Date().toISOString(),
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
            onActionComplete(data);
        } catch (err) {
            setError(err.message);
            setSubmitting(false);
        }
    }, [plantId, scanId, wo, userId, deviceTimestamp, onActionComplete]);

    // ── Hold reason picker screen ─────────────────────────────────────────────
    if (screen === 'hold_reason') {
        return (
            <div style={{ padding: '4px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <button onClick={() => setScreen('main')} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}>
                        <ArrowLeft size={20} />
                    </button>
                    <span style={{ color: '#94a3b8', fontSize: 15, fontWeight: 600 }}>Why are you pausing?</span>
                </div>
                {HOLD_REASONS.map((r, i) => (
                    <TapBtn
                        key={r.code}
                        number={i + 1}
                        variant={r.exempt ? 'neutral' : 'warning'}
                        onClick={() => {
                            if (r.code === 'SCHEDULED_RETURN') {
                                setSelectedHoldReason(r.code);
                                setScreen('return_window');
                            } else {
                                submitAction({ action: 'WAITING', holdReason: r.code });
                            }
                        }}
                        disabled={submitting}
                    >
                        {r.label}
                        {r.exempt && (
                            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#475569', fontWeight: 400 }}>
                                no timeout
                            </span>
                        )}
                    </TapBtn>
                ))}
                {error && <ErrorBanner msg={error} />}
            </div>
        );
    }

    // ── Scheduled return window picker ────────────────────────────────────────
    if (screen === 'return_window') {
        return (
            <div style={{ padding: '4px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <button onClick={() => setScreen('hold_reason')} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}>
                        <ArrowLeft size={20} />
                    </button>
                    <span style={{ color: '#94a3b8', fontSize: 15, fontWeight: 600 }}>When are you returning?</span>
                </div>
                {RETURN_WINDOWS.map((w, i) => (
                    <TapBtn
                        key={w.code}
                        number={i + 1}
                        variant="neutral"
                        onClick={() => submitAction({ action: 'WAITING', holdReason: 'SCHEDULED_RETURN', returnWindow: w.code })}
                        disabled={submitting}
                    >
                        {w.label}
                    </TapBtn>
                ))}
                {error && <ErrorBanner msg={error} />}
            </div>
        );
    }

    // ── Batch scan screen ────────────────────────────────────────────────────
    if (screen === 'batch_scan') {
        const matched  = batchItems.filter(i => i.status === 'matched');
        const unknown  = batchItems.filter(i => i.status === 'unknown');
        const canCommit = matched.length > 0 && !batchSubmitting;
        return (
            <div style={{ padding: '4px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <button onClick={() => setScreen('main')} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}>
                        <ArrowLeft size={20} />
                    </button>
                    <span style={{ color: '#94a3b8', fontSize: 15, fontWeight: 600 }}>Batch Add Parts</span>
                    {batchLookupLoading && <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: 12 }}>Looking up…</span>}
                </div>

                {/* Scanner input — autoFocus catches physical scanner keystrokes */}
                <div style={{ position: 'relative', marginBottom: 14 }}>
                    <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#475569', pointerEvents: 'none' }} />
                    <input
                        ref={batchInputRef}
                        autoFocus
                        type="text"
                        placeholder="Scan part barcode or type part ID…"
                        value={batchInput}
                        onChange={e => setBatchInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleBatchScan(batchInput); }}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '11px 12px 11px 34px', borderRadius: 8, background: '#1e293b', border: '1px solid #3b82f6', color: '#f1f5f9', fontSize: 14, outline: 'none' }}
                    />
                </div>
                {batchInput && (
                    <button onClick={() => handleBatchScan(batchInput)} style={{ width: '100%', padding: '9px', borderRadius: 8, background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', color: '#60a5fa', cursor: 'pointer', fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
                        Add "{batchInput}"
                    </button>
                )}

                {/* Scanned list */}
                {matched.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.07em', marginBottom: 6, textTransform: 'uppercase' }}>Scanned</div>
                        {matched.map((item) => (
                            <div key={item.partId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', marginBottom: 5, borderRadius: 8, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                                <Package size={14} color="#10b981" />
                                <div style={{ flex: 1, fontSize: 14, color: '#86efac', fontWeight: 600 }}>{item.description}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <button onClick={() => setBatchItems(prev => prev.map(p => p === item ? { ...p, qty: Math.max(1, p.qty - 1) } : p))} style={{ width: 26, height: 26, borderRadius: 6, background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                                    <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 16, minWidth: 20, textAlign: 'center' }}>{item.qty}</span>
                                    <button onClick={() => setBatchItems(prev => prev.map(p => p === item ? { ...p, qty: p.qty + 1 } : p))} style={{ width: 26, height: 26, borderRadius: 6, background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                                    <button onClick={() => setBatchItems(prev => prev.filter(p => p !== item))} style={{ width: 26, height: 26, borderRadius: 6, background: 'none', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Unknown barcodes */}
                {unknown.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', letterSpacing: '0.07em', marginBottom: 6, textTransform: 'uppercase' }}>Needs Review</div>
                        {unknown.map((item) => (
                            <div key={item.raw} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 4, borderRadius: 8, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                                <AlertTriangle size={13} color="#f59e0b" />
                                <span style={{ flex: 1, fontSize: 13, color: '#fbbf24' }}>{item.raw}</span>
                                <button onClick={() => setBatchItems(prev => prev.filter(p => p !== item))} style={{ padding: '3px 8px', borderRadius: 5, background: 'none', border: '1px solid rgba(255,255,255,0.08)', color: '#64748b', cursor: 'pointer', fontSize: 12 }}>Remove</button>
                            </div>
                        ))}
                    </div>
                )}

                {batchError && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={13} />{batchError}</div>}

                {batchItems.length === 0 && !batchLookupLoading && (
                    <div style={{ color: '#475569', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                        Scan or type part barcodes above
                    </div>
                )}

                {/* Commit */}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <TapBtn variant="success" onClick={commitBatchScan} disabled={!canCommit}>
                        <CheckCircle size={18} /> All Parts Added ({matched.length})
                    </TapBtn>
                </div>
                {batchItems.length > 0 && (
                    <button onClick={() => setBatchItems(prev => prev.slice(0, -1))} style={{ width: '100%', marginTop: 6, padding: '9px', borderRadius: 8, background: 'none', border: '1px solid #1e293b', color: '#475569', cursor: 'pointer', fontSize: 13 }}>
                        Undo Last
                    </button>
                )}
                <button onClick={() => setScreen('main')} style={{ width: '100%', marginTop: 5, padding: '8px', borderRadius: 8, background: 'none', border: 'none', color: '#334155', cursor: 'pointer', fontSize: 13 }}>
                    Cancel — discard session
                </button>
            </div>
        );
    }

    // ── Batch confirm screen ──────────────────────────────────────────────────
    if (screen === 'batch_confirm') {
        const committed = batchItems.filter(i => i.ok);
        const failed    = batchItems.filter(i => !i.ok && i.status === 'matched');
        return (
            <div style={{ padding: '4px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <CheckCircle size={22} color="#10b981" />
                    <span style={{ color: '#10b981', fontSize: 15, fontWeight: 700 }}>Parts Added to WO</span>
                </div>
                {committed.map(item => (
                    <div key={item.partId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', marginBottom: 5, borderRadius: 8, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                        <CheckCircle size={14} color="#10b981" />
                        <span style={{ flex: 1, color: '#86efac', fontSize: 14 }}>{item.description}</span>
                        <span style={{ color: '#10b981', fontWeight: 700, fontSize: 14 }}>×{item.qty}</span>
                    </div>
                ))}
                {failed.map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 5, borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                        <AlertTriangle size={13} color="#f87171" />
                        <span style={{ flex: 1, color: '#f87171', fontSize: 13 }}>{item.description}</span>
                        <span style={{ color: '#f87171', fontSize: 12 }}>{item.error}</span>
                    </div>
                ))}
                <button onClick={() => setScreen('main')} style={{ marginTop: 16, width: '100%', padding: '13px', borderRadius: 9, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.35)', color: '#10b981', cursor: 'pointer', fontSize: 15, fontWeight: 700 }}>
                    Continue Work
                </button>
            </div>
        );
    }

    // ── Parts search screen ───────────────────────────────────────────────────
    if (screen === 'parts_search') {
        const toggleWoPart = (partId) => {
            setWoPartsChecked(prev => {
                const next = new Set(prev);
                if (next.has(partId)) next.delete(partId); else next.add(partId);
                return next;
            });
        };
        const checkedCount = woPartsChecked.size + partsAdded.length;

        return (
            <div style={{ padding: '4px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <button onClick={() => setScreen('main')} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}>
                        <ArrowLeft size={20} />
                    </button>
                    <span style={{ color: '#94a3b8', fontSize: 15, fontWeight: 600 }}>Parts</span>
                </div>

                {/* WO-linked parts checklist */}
                {(woPartsLoading || woParts.length > 0) && (
                    <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.08em', marginBottom: 6, textTransform: 'uppercase' }}>
                            Parts on this Work Order
                        </div>
                        {woPartsLoading && <div style={{ color: '#64748b', fontSize: 13, padding: '8px 0' }}>Loading…</div>}
                        {woParts.map(p => {
                            const checked = woPartsChecked.has(p.PartID);
                            return (
                                <button key={p.PartID} onClick={() => toggleWoPart(p.PartID)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                                        padding: '10px 12px', marginBottom: 6, borderRadius: 8, cursor: 'pointer',
                                        background: checked ? 'rgba(16,185,129,0.12)' : 'rgba(30,41,59,0.6)',
                                        border: `1px solid ${checked ? 'rgba(16,185,129,0.4)' : '#334155'}`,
                                        textAlign: 'left',
                                    }}>
                                    <div style={{
                                        width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                                        background: checked ? '#10b981' : 'transparent',
                                        border: `2px solid ${checked ? '#10b981' : '#475569'}`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        {checked && <span style={{ color: '#fff', fontSize: 12, lineHeight: 1 }}>✓</span>}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, fontSize: 14, color: checked ? '#86efac' : '#f1f5f9' }}>{p.description}</div>
                                        <div style={{ fontSize: 12, color: '#64748b' }}>
                                            {p.PartID}{p.Location ? ` · ${p.Location}` : ''} · Est qty: {p.EstQty ?? 1} · {p.available ?? '?'} in stock
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Divider + search heading */}
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.08em', marginBottom: 6, textTransform: 'uppercase' }}>
                    {woParts.length > 0 ? 'Add More Parts' : 'Search Parts Catalog'}
                </div>

                <div style={{ position: 'relative', marginBottom: 12 }}>
                    <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
                    <input
                        autoFocus
                        type="text"
                        placeholder="Search by name or part ID…"
                        value={partSearchQuery}
                        onChange={e => setPartSearchQuery(e.target.value)}
                        style={{
                            width: '100%', boxSizing: 'border-box',
                            padding: '10px 12px 10px 34px', borderRadius: 8,
                            background: '#1e293b', border: '1px solid #334155',
                            color: '#f1f5f9', fontSize: 14,
                        }}
                    />
                </div>

                {partSearchLoading && <div style={{ color: '#64748b', fontSize: 13, textAlign: 'center', marginBottom: 8 }}>Searching…</div>}

                {partSearchResults.map(p => (
                    <TapBtn key={p.ID} variant="default"
                        onClick={() => { setSelectedPart({ id: p.ID, description: p.description }); setPartQty(1); setScreen('parts_quantity'); }}>
                        <Package size={16} />
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{p.description}</div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>{p.ID}{p.location ? ` · ${p.location}` : ''} · {p.available ?? '?'} in stock</div>
                        </div>
                    </TapBtn>
                ))}

                {partSearchQuery && !partSearchLoading && partSearchResults.length === 0 && (
                    <div style={{ color: '#64748b', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>No parts found</div>
                )}

                {/* Newly added parts confirmation */}
                {partsAdded.length > 0 && (
                    <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)' }}>
                        {partsAdded.map((p, i) => (
                            <div key={i} style={{ color: '#86efac', fontSize: 13 }}>✓ {p.description} × {p.qty}</div>
                        ))}
                    </div>
                )}

                {checkedCount > 0 && (
                    <button onClick={() => setScreen('main')} style={{ marginTop: 12, width: '100%', padding: '12px', borderRadius: 8, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: '#86efac', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                        Done — {checkedCount} part{checkedCount > 1 ? 's' : ''} selected
                    </button>
                )}
                {error && <ErrorBanner msg={error} />}
            </div>
        );
    }

    // ── Parts quantity picker screen ──────────────────────────────────────────
    if (screen === 'parts_quantity' && selectedPart) {
        const QTY_OPTIONS = [1, 2, 3, 4, 5, 10, 20];
        return (
            <div style={{ padding: '4px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <button onClick={() => setScreen('parts_search')} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}>
                        <ArrowLeft size={20} />
                    </button>
                    <span style={{ color: '#94a3b8', fontSize: 15, fontWeight: 600 }}>How many?</span>
                </div>
                <div style={{ marginBottom: 20, padding: '10px 14px', borderRadius: 8, background: '#1e293b', border: '1px solid #334155' }}>
                    <div style={{ color: '#f1f5f9', fontWeight: 600 }}>{selectedPart.description}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
                    {QTY_OPTIONS.map(q => (
                        <button key={q} onClick={() => setPartQty(q)}
                            style={{
                                padding: '16px 8px', borderRadius: 10, fontSize: 18, fontWeight: 700,
                                background: partQty === q ? '#2563eb' : '#1e293b',
                                border: `1px solid ${partQty === q ? '#3b82f6' : '#334155'}`,
                                color: partQty === q ? '#fff' : '#94a3b8', cursor: 'pointer',
                            }}>
                            {q}
                        </button>
                    ))}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, gridColumn: 'span 4' }}>
                        <button onClick={() => setPartQty(v => Math.max(1, v - 1))} style={{ flex: 1, padding: 10, borderRadius: 8, background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}>−</button>
                        <span style={{ flex: 2, textAlign: 'center', color: '#f1f5f9', fontSize: 20, fontWeight: 700 }}>{partQty}</span>
                        <button onClick={() => setPartQty(v => v + 1)} style={{ flex: 1, padding: 10, borderRadius: 8, background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}>+</button>
                    </div>
                </div>
                <TapBtn variant="success" onClick={handlePartCheckout} disabled={submitting}>
                    <CheckCircle size={18} /> Add {partQty} × {selectedPart.description}
                </TapBtn>
                {error && <ErrorBanner msg={error} />}
            </div>
        );
    }

    // ── Add sub-component screen ──────────────────────────────────────────────
    if (screen === 'add_child') {
        return (
            <div style={{ padding: '4px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <button onClick={() => setScreen('main')} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}>
                        <ArrowLeft size={20} />
                    </button>
                    <span style={{ color: '#94a3b8', fontSize: 15, fontWeight: 600 }}>Add Sub-Component</span>
                </div>

                <input
                    autoFocus
                    type="text"
                    placeholder="Name this sub-component…"
                    value={addChildName}
                    onChange={e => setAddChildName(e.target.value)}
                    style={{
                        width: '100%', boxSizing: 'border-box', marginBottom: 12,
                        padding: '12px 14px', borderRadius: 8,
                        background: '#1e293b', border: '1px solid #334155',
                        color: '#f1f5f9', fontSize: 15,
                    }}
                />

                {/* Camera capture */}
                <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = ev => setAddChildPhoto(ev.target.result);
                        reader.readAsDataURL(file);
                    }}
                />
                <button
                    onClick={() => photoInputRef.current?.click()}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                        marginBottom: 16, padding: '12px 14px', borderRadius: 8,
                        background: addChildPhoto ? 'rgba(16,185,129,0.1)' : '#1e293b',
                        border: `1px solid ${addChildPhoto ? 'rgba(16,185,129,0.4)' : '#334155'}`,
                        color: addChildPhoto ? '#86efac' : '#64748b', cursor: 'pointer', fontSize: 14,
                    }}
                >
                    <Camera size={18} />
                    {addChildPhoto ? 'Photo captured — tap to retake' : 'Take photo (optional)'}
                </button>

                {addChildPhoto && (
                    <img src={addChildPhoto} alt="preview" style={{ width: '100%', borderRadius: 8, marginBottom: 12, maxHeight: 160, objectFit: 'cover' }} />
                )}

                <TapBtn variant="success" onClick={handleAddChild} disabled={childSaving || !addChildName.trim()}>
                    <Layers size={18} /> {childSaving ? 'Saving…' : 'Save & Start Work on This Component'}
                </TapBtn>
                {error && <ErrorBanner msg={error} />}
            </div>
        );
    }

    // ── Team close confirmation screen ────────────────────────────────────────
    if (screen === 'team_close_confirm') {
        return (
            <div style={{ padding: '4px 0' }}>
                <div style={{
                    background: '#2d1b00', border: '1px solid #92400e',
                    borderRadius: 10, padding: '14px 16px', marginBottom: 20,
                }}>
                    <div style={{ color: '#fbbf24', fontWeight: 600, marginBottom: 6 }}>
                        Other technicians are still active on this work order.
                    </div>
                    <div style={{ color: '#d97706', fontSize: 13 }}>
                        Closing for the team will end all active sessions.
                    </div>
                </div>
                <TapBtn number={1} variant="danger" onClick={() => submitAction({ action: 'TEAM_CLOSE' })} disabled={submitting}>
                    Close Work Order for Everyone
                </TapBtn>
                <TapBtn number={2} variant="neutral" onClick={() => setScreen('main')} disabled={submitting}>
                    Cancel
                </TapBtn>
                {error && <ErrorBanner msg={error} />}
            </div>
        );
    }

    // ── Main prompt screen ────────────────────────────────────────────────────
    
    // Branch: AUTO_ADDED_PART — part scanned while WO active; already added 1 qty
    if (branch === 'AUTO_ADDED_PART') {
        const { part, qtyAdded = 1, totalQty, woId: addedWoId, woDescription, movementId } = branchResponse;

        const handleUndo = async () => {
            try {
                await fetch('/api/scan/undo-part-add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                    body: JSON.stringify({ woId: addedWoId, partId: part?.id, movementId, qty: qtyAdded }),
                });
                setAutoAddUndone(true);
                setTimeout(() => onCancel(), 1400);
            } catch (_) {}
        };

        if (autoAddUndone) {
            return (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                    <RotateCcw size={36} color="#64748b" style={{ marginBottom: 10 }} />
                    <div style={{ color: '#64748b', fontSize: 15, fontWeight: 600 }}>Undone</div>
                </div>
            );
        }

        return (
            <div style={{ textAlign: 'center', padding: '28px 8px' }}>
                <CheckCircle size={48} color="#10b981" style={{ marginBottom: 10 }} />
                <div style={{ color: '#10b981', fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Added</div>
                <div style={{ color: '#f1f5f9', fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{part?.description}</div>
                <div style={{ color: '#64748b', fontSize: 13 }}>
                    {totalQty > 1 ? `Qty ${totalQty} on WO` : 'Added to WO'}{part?.available != null ? ` · ${part.available} left in stock` : ''}
                </div>
                {woDescription && <div style={{ color: '#475569', fontSize: 12, marginTop: 6 }}>{woDescription}</div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
                    <button onClick={onCancel} style={{ flex: 2, padding: '13px', borderRadius: 9, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: '#10b981', cursor: 'pointer', fontSize: 15, fontWeight: 700 }}>
                        Done — Scan Next
                    </button>
                    <button onClick={handleUndo} style={{ flex: 1, padding: '13px', borderRadius: 9, background: 'none', border: '1px solid #334155', color: '#64748b', cursor: 'pointer', fontSize: 14 }}>
                        Undo
                    </button>
                </div>
            </div>
        );
    }

    // Branch: ROUTE_TO_DIGITAL_TWIN — schematic view with pins
    if (branch === 'ROUTE_TO_DIGITAL_TWIN') {
        const { schematic } = branchResponse;
        
        // If a pin is selected, show its failure modes
        if (screen === 'pin_selected' && selectedPin) {
            const pin = selectedPin;
            return (
                <div style={{ padding: '4px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                        <button onClick={() => { setScreen('main'); setSelectedPin(null); }} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}>
                            <ArrowLeft size={20} />
                        </button>
                        <span style={{ color: '#94a3b8', fontSize: 15, fontWeight: 600 }}>{pin?.PinLabel} — Select Issue</span>
                    </div>
                    {pin?.failureModes?.length > 0 ? (
                        pin.failureModes.map((mode, i) => (
                            <TapBtn
                                key={mode}
                                number={i + 1}
                                variant="warning"
                                onClick={async () => {
                                    // Make a NEW scan request against the child asset, passing the failure mode
                                    setSubmitting(true);
                                    setError('');
                                    try {
                                        const res = await fetch('/api/scan', {
                                            method: 'POST',
                                            headers: {
                                                'Content-Type': 'application/json',
                                                'x-plant-id': plantId,
                                            },
                                            body: JSON.stringify({
                                                scanId: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                                                assetId: pin.LinkedAssetID,
                                                userId,
                                                deviceTimestamp: new Date().toISOString(),
                                                segmentReason: mode
                                            }),
                                        });
                                        const data = await res.json();
                                        if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
                                        // The result of this new scan will be AUTO_CREATE_WO on the child asset.
                                        onActionComplete(data);
                                    } catch (err) {
                                        setError(err.message);
                                        setSubmitting(false);
                                    }
                                }}
                                disabled={submitting}
                            >
                                {mode}
                            </TapBtn>
                        ))
                    ) : (
                        <TapBtn
                            number={1}
                            variant="warning"
                            onClick={async () => {
                                setSubmitting(true);
                                setError('');
                                try {
                                    const res = await fetch('/api/scan', {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json',
                                            'x-plant-id': plantId,
                                        },
                                        body: JSON.stringify({
                                            scanId: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                                            assetId: pin.LinkedAssetID,
                                            userId,
                                            deviceTimestamp: new Date().toISOString(),
                                            segmentReason: 'General Maintenance'
                                        }),
                                    });
                                    const data = await res.json();
                                    if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
                                    onActionComplete(data);
                                } catch (err) {
                                    setError(err.message);
                                    setSubmitting(false);
                                }
                            }}
                            disabled={submitting}
                        >
                            Start General Maintenance
                        </TapBtn>
                    )}
                    {error && <ErrorBanner msg={error} />}
                </div>
            );
        }

        // Main schematic view
        return (
            <div style={{ textAlign: 'center', padding: '4px 0' }}>
                <div style={{ color: '#f1f5f9', fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
                    Select Component
                </div>
                <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>
                    {schematic?.label || 'Digital Twin'}
                </div>
                
                {/* Schematic Image Container */}
                <div style={{ 
                    position: 'relative', 
                    width: '100%', 
                    borderRadius: 8, 
                    overflow: 'hidden',
                    border: '1px solid #1e293b',
                    background: '#0f172a'
                }}>
                    <img 
                        src={schematic?.path} 
                        alt="Digital Twin" 
                        style={{ width: '100%', display: 'block' }}
                        onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'block';
                        }}
                    />
                    <div style={{ display: 'none', padding: '40px 20px', color: '#f87171' }}>
                        Image unavailable
                    </div>

                    {/* Pins */}
                    {schematic?.pins?.map(pin => (
                        <button
                            key={pin.ID}
                            onClick={() => {
                                setSelectedPin(pin);
                                setScreen('pin_selected');
                            }}
                            style={{
                                position: 'absolute',
                                left: `${pin.XPercent}%`,
                                top: `${pin.YPercent}%`,
                                transform: 'translate(-50%, -50%)',
                                width: 32,
                                height: 32,
                                borderRadius: '50%',
                                background: 'rgba(239, 68, 68, 0.8)',
                                border: '2px solid white',
                                cursor: 'pointer',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                            title={pin.PinLabel}
                        >
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'white' }} />
                        </button>
                    ))}
                </div>

                <button onClick={onCancel} style={{ marginTop: 20, width: '100%', padding: '12px', borderRadius: 8, background: 'none', border: '1px solid #1e293b', color: '#475569', cursor: 'pointer', fontSize: 14 }}>
                    Cancel
                </button>
            </div>
        );
    }
    
    // Branch: ROUTE_TO_DIGITAL_TWIN_OFFLINE_BLOCKED
    if (branch === 'ROUTE_TO_DIGITAL_TWIN_OFFLINE_BLOCKED') {
        return (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <AlertTriangle size={40} color="#f87171" style={{ marginBottom: 12 }} />
                <div style={{ color: '#f87171', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Connect to Network</div>
                <div style={{ color: '#94a3b8', fontSize: 13 }}>
                    This asset has sub-components. Please connect to the network to select a specific component.
                </div>
                <button onClick={onCancel} style={{ marginTop: 20, width: '100%', padding: '12px', borderRadius: 8, background: 'none', border: '1px solid #1e293b', color: '#475569', cursor: 'pointer', fontSize: 14 }}>
                    Dismiss
                </button>
            </div>
        );
    }

    // Branch: REQUIRE_SOP_ACK — tech must acknowledge updated SOPs before WO can be created
    if (branch === 'REQUIRE_SOP_ACK') {
        const { pendingSops, assetId } = branchResponse;
        const allDone = acknowledgedSops.length >= pendingSops.length;

        const handleAck = async (procId) => {
            try {
                const res = await fetch(`/api/sop-acknowledgment/${procId}/acknowledge`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                    body: JSON.stringify({ plantId }),
                });
                if (res.ok) setAcknowledgedSops(prev => [...prev, procId]);
            } catch (err) {
                setError('Failed to record acknowledgment. Check your connection.');
            }
        };

        const handleContinue = async () => {
            // Re-scan with a fresh scanId — will now pass Step 3.7 and create the WO
            setSubmitting(true);
            setError('');
            const newScanId = crypto.randomUUID
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const newTimestamp = new Date().toISOString();
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            try {
                const res = await fetch('/api/scan', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                    body: JSON.stringify({ scanId: newScanId, assetId, userId, deviceTimestamp: newTimestamp }),
                    signal: controller.signal,
                });
                clearTimeout(timeout);
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
                setSubmitting(false);
                if (data.branch !== 'REQUIRE_SOP_ACK') {
                    // WO was created — flash confirmation before transitioning
                    setSopSuccess(true);
                    setTimeout(() => {
                        setSopSuccess(false);
                        onActionComplete({ ...data, scanId: newScanId, deviceTimestamp: newTimestamp });
                    }, 1200);
                } else {
                    // Ack didn't register server-side — transition immediately, show error
                    setError('Acknowledgment not recorded — please try again.');
                    onActionComplete({ ...data, scanId: newScanId, deviceTimestamp: newTimestamp });
                }
            } catch (err) {
                clearTimeout(timeout);
                setError(err.name === 'AbortError' ? 'Request timed out — check your connection and try again.' : err.message);
                setSubmitting(false);
            }
        };

        return (
            <div style={{ padding: '4px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <AlertTriangle size={20} color="#f59e0b" />
                    <span style={{ color: '#f59e0b', fontSize: 15, fontWeight: 700 }}>
                        Procedure Acknowledgment Required
                    </span>
                </div>
                <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>
                    {branchResponse.message}
                </p>

                {pendingSops.map((sop, i) => {
                    const done = acknowledgedSops.includes(sop.ID);
                    return (
                        <div key={sop.ID} style={{
                            marginBottom: 12, padding: '12px 14px',
                            borderRadius: 8, border: `1px solid ${done ? '#10b981' : '#334155'}`,
                            background: done ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.03)',
                        }}>
                            <div style={{ color: '#f1f5f9', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                                {sop.ProcedureCode ? `${sop.ProcedureCode} — ` : ''}{sop.Descript || 'Unnamed Procedure'}
                            </div>
                            <div style={{ color: '#64748b', fontSize: 12, marginBottom: 10 }}>
                                Updated: {sop.Updated ? new Date(sop.Updated).toLocaleDateString() : 'Unknown'}
                            </div>
                            {!done ? (
                                <TapBtn
                                    number={i + 1}
                                    variant="warning"
                                    onClick={() => handleAck(sop.ID)}
                                >
                                    I have read and understood this procedure
                                </TapBtn>
                            ) : (
                                <div style={{ color: '#10b981', fontSize: 13, fontWeight: 600 }}>
                                    ✓ Acknowledged
                                </div>
                            )}
                        </div>
                    );
                })}

                {sopSuccess && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '14px 16px', borderRadius: 10, marginTop: 8,
                        background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.4)',
                    }}>
                        <CheckCircle size={20} color="#10b981" />
                        <div>
                            <div style={{ color: '#10b981', fontWeight: 700, fontSize: 14 }}>Work Order Created</div>
                            <div style={{ color: '#6ee7b7', fontSize: 12, marginTop: 2 }}>Loading work options…</div>
                        </div>
                    </div>
                )}

                {!sopSuccess && allDone && (
                    <TapBtn
                        number={pendingSops.length + 1}
                        variant="success"
                        onClick={handleContinue}
                        disabled={submitting}
                        style={{ marginTop: 8 }}
                    >
                        {submitting ? 'Starting work…' : 'Continue — Start Work Order'}
                    </TapBtn>
                )}
                {!sopSuccess && error && <ErrorBanner msg={error} />}

                {!sopSuccess && (
                    <button onClick={onCancel} style={{
                        marginTop: 12, width: '100%', padding: '10px',
                        borderRadius: 8, background: 'none', border: '1px solid #1e293b',
                        color: '#475569', cursor: 'pointer', fontSize: 13,
                    }}>
                        Cancel
                    </button>
                )}
            </div>
        );
    }

    // Branch: AUTO_CREATE_WO — WO created and segment opened; tech is now active
    if (branch === 'AUTO_CREATE_WO') {
        return (
            <PromptShell wo={wo} subtitle="In Progress" statePill={<StatePill label="STARTED" variant="started" />} onCancel={onCancel}>
                <TapBtn number={1} variant="success"
                    onClick={() => submitAction({ action: 'CLOSE_WO' })}
                    disabled={submitting}>
                    <CheckCircle size={18} /> Close Work Order
                </TapBtn>
                <TapBtn number={2} variant="default"
                    onClick={() => openBatchScan(wo?.id)}
                    disabled={submitting}>
                    <Package size={18} /> Add Parts
                </TapBtn>
                <MoreOptions>
                    <TapBtn number={3} variant="warning"
                        onClick={() => setScreen('hold_reason')}
                        disabled={submitting}>
                        <Clock size={18} /> Waiting…
                    </TapBtn>
                    <TapBtn number={4} variant="neutral"
                        onClick={() => submitAction({ action: 'ESCALATE' })}
                        disabled={submitting}>
                        <AlertTriangle size={18} /> Escalate
                    </TapBtn>
                    <TapBtn number={5} variant="neutral"
                        onClick={() => submitAction({ action: 'CONTINUE_LATER' })}
                        disabled={submitting}>
                        Continue Later
                    </TapBtn>
                </MoreOptions>
                {error && <ErrorBanner msg={error} />}
                <WorkOrderPartsCart woId={wo?.id} assetId={wo?.assetId} plantId={plantId} onOpenSearch={() => openBatchScan(wo?.id)} />
            </PromptShell>
        );
    }

    // Branch: AUTO_REJECT_DUPLICATE_SCAN
    if (branch === 'AUTO_REJECT_DUPLICATE_SCAN') {
        return (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <AlertTriangle size={40} color="#f59e0b" style={{ marginBottom: 12 }} />
                <div style={{ color: '#fbbf24', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Duplicate Scan</div>
                <div style={{ color: '#94a3b8', fontSize: 13 }}>This scan has already been processed. No changes made.</div>
                <button onClick={onCancel} style={{ marginTop: 20, background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14 }}>
                    Dismiss
                </button>
            </div>
        );
    }

    // Branch: ROUTE_TO_PM_ACKNOWLEDGE — a PM-generated WO awaits at StatusID=10
    // First eligible tech to acknowledge claims the work order.
    if (branch === 'ROUTE_TO_PM_ACKNOWLEDGE') {
        const pm = branchResponse?.pmInfo || {};
        const alreadyClaimed = !!pm.acknowledgedBy;
        const timeAgo = pm.acknowledgedAt
            ? (() => {
                const mins = Math.round((Date.now() - new Date(pm.acknowledgedAt).getTime()) / 60000);
                return mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : `${Math.round(mins/60)}h ago`;
              })()
            : null;

        return (
            <PromptShell
                wo={wo}
                subtitle={alreadyClaimed ? `Acknowledged by ${pm.acknowledgedBy}` : 'PM Due — Awaiting Acknowledgement'}
                statePill={<StatePill label="PM DUE" variant={alreadyClaimed ? 'active' : 'hold'} />}
                onCancel={onCancel}
            >
                {/* PM status card */}
                <div style={{
                    margin: '4px 0 16px', padding: '14px 16px', borderRadius: 10,
                    background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)',
                }}>
                    <div style={{ fontSize: 11, color: '#818cf8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                        PM Due
                    </div>
                    <div style={{ fontSize: 15, color: '#f1f5f9', fontWeight: 600, marginBottom: 10 }}>
                        {wo?.description?.replace(/^\[PM-(AUTO|METER)\]\s*/i, '') || 'Preventive Maintenance'}
                    </div>
                    <div style={{ display: 'flex', gap: 24, fontSize: 12 }}>
                        <div>
                            <div style={{ color: '#64748b', marginBottom: 2 }}>NOTIFIED</div>
                            <div style={{ color: '#94a3b8', fontWeight: 600 }}>
                                {pm.notifiedCount > 0 ? `${pm.notifiedCount} tech${pm.notifiedCount !== 1 ? 's' : ''}` : 'Maintenance / Engineering'}
                            </div>
                        </div>
                        <div>
                            <div style={{ color: '#64748b', marginBottom: 2 }}>STATUS</div>
                            <div style={{ color: alreadyClaimed ? '#10b981' : '#f59e0b', fontWeight: 700 }}>
                                {alreadyClaimed
                                    ? `${pm.acknowledgedBy} · ${timeAgo}`
                                    : 'Not yet acknowledged'}
                            </div>
                        </div>
                    </div>
                </div>

                {alreadyClaimed ? (
                    <TapBtn number={1} variant="success"
                        onClick={() => submitAction({ action: 'RESUME_WAITING_WO', woId: wo?.id })}
                        disabled={submitting}>
                        <CheckCircle size={18} /> Start PM Work Order
                    </TapBtn>
                ) : (
                    <TapBtn number={1} variant="success"
                        onClick={async () => {
                            setSubmitting(true);
                            setError('');
                            try {
                                const res = await fetch('/api/pm/acknowledge', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                                    body: JSON.stringify({ pmId: pm.pmId, woId: wo?.id, ackMethod: 'scan' }),
                                });
                                const data = await res.json();
                                if (!res.ok) throw new Error(data.error || 'Acknowledge failed');
                                // Re-scan to pick up the new active WO state
                                onCancel();
                            } catch (e) {
                                setError(e.message);
                            }
                            setSubmitting(false);
                        }}
                        disabled={submitting}>
                        <CheckCircle size={18} /> Acknowledge & Start PM
                    </TapBtn>
                )}

                <TapBtn number={2} variant="neutral" onClick={onCancel} disabled={submitting}>
                    <Eye size={18} /> View Status Only
                </TapBtn>
                {error && <ErrorBanner msg={error} />}
            </PromptShell>
        );
    }

    // Branch: ROUTE_TO_WAITING_WO — waiting WO exists, offer Resume or New
    if (branch === 'ROUTE_TO_WAITING_WO') {
        return (
            <PromptShell wo={wo} subtitle={`On Hold — ${wo?.holdReason || ''}`} statePill={<StatePill label="ON HOLD" variant="hold" />} onCancel={onCancel}>
                <TapBtn number={1} variant="success"
                    onClick={() => submitAction({ action: 'RESUME_WAITING_WO' })}
                    disabled={submitting}>
                    Resume Waiting WO
                </TapBtn>
                <TapBtn number={2} variant="default"
                    onClick={() => submitAction({ action: 'CREATE_NEW_WO' })}
                    disabled={submitting}>
                    <Plus size={18} /> Create New Work Order
                </TapBtn>
                <TapBtn number={3} variant="neutral" onClick={onCancel} disabled={submitting}>
                    <Eye size={18} /> View Status Only
                </TapBtn>
                {error && <ErrorBanner msg={error} />}
            </PromptShell>
        );
    }

    // Branch: ROUTE_TO_ESCALATED_WO — escalated WO, offer Join/Take Over
    if (branch === 'ROUTE_TO_ESCALATED_WO') {
        return (
            <PromptShell wo={wo} subtitle="Response Required" statePill={<StatePill label="ESCALATED" variant="escalated" />} onCancel={onCancel}>
                <TapBtn number={1} variant="danger"
                    onClick={() => submitAction({ action: 'JOIN' })}
                    disabled={submitting}>
                    <Users size={18} /> Join Response
                </TapBtn>
                <TapBtn number={2} variant="warning"
                    onClick={() => submitAction({ action: 'TAKE_OVER' })}
                    disabled={submitting}>
                    <UserCheck size={18} /> Take Over Response
                </TapBtn>
                <TapBtn number={3} variant="neutral" onClick={onCancel} disabled={submitting}>
                    <Eye size={18} /> View Status Only
                </TapBtn>
                {error && <ErrorBanner msg={error} />}
            </PromptShell>
        );
    }

    // Branch: ROUTE_TO_CHILD_SELECTOR — parent asset has sub-components, no schematic configured
    if (branch === 'ROUTE_TO_CHILD_SELECTOR') {
        const { parentAsset, children = [] } = branchResponse;
        return (
            <div style={{ padding: '4px 0' }}>
                <div style={{ marginBottom: 16 }}>
                    <div style={{ color: '#f1f5f9', fontSize: 16, fontWeight: 700 }}>{parentAsset?.description || parentAsset?.id}</div>
                    <div style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>Select the sub-component you're working on</div>
                </div>
                {children.map((child, i) => (
                    <TapBtn key={child.ID} number={i + 1} variant="default" onClick={() => handleChildSelect(child)} disabled={submitting}>
                        <Layers size={16} />
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600 }}>{child.Description}</div>
                            {child.Model && <div style={{ fontSize: 12, color: '#64748b' }}>{child.Model}</div>}
                        </div>
                    </TapBtn>
                ))}
                <TapBtn number={children.length + 1} variant="neutral" onClick={() => { setAddChildName(''); setAddChildPhoto(null); setScreen('add_child'); }} disabled={submitting}>
                    <Plus size={16} /> Add New Sub-Component
                </TapBtn>
                {error && <ErrorBanner msg={error} />}
                <button onClick={onCancel} style={{ marginTop: 8, width: '100%', padding: '12px', borderRadius: 8, background: 'none', border: '1px solid #1e293b', color: '#475569', cursor: 'pointer', fontSize: 14 }}>
                    Skip — Work on Whole Asset
                </button>
            </div>
        );
    }

    // Branch: ROUTE_TO_PART_CHECKOUT — scanned ID is a part barcode
    if (branch === 'ROUTE_TO_PART_CHECKOUT') {
        const { part, activeWo } = branchResponse;
        if (screen === 'parts_quantity' && selectedPart) {
            const QTY_OPTIONS = [1, 2, 3, 4, 5, 10, 20];
            return (
                <div style={{ padding: '4px 0' }}>
                    <div style={{ marginBottom: 20, padding: '10px 14px', borderRadius: 8, background: '#1e293b', border: '1px solid #334155' }}>
                        <div style={{ color: '#f1f5f9', fontWeight: 600 }}>{part.description}</div>
                        {activeWo ? <div style={{ color: '#64748b', fontSize: 13 }}>WO {activeWo.id}</div> : <div style={{ color: '#f87171', fontSize: 13 }}>No active work order — start work on an asset first</div>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
                        {QTY_OPTIONS.map(q => (
                            <button key={q} onClick={() => setPartQty(q)}
                                style={{ padding: '16px 8px', borderRadius: 10, fontSize: 18, fontWeight: 700, background: partQty === q ? '#2563eb' : '#1e293b', border: `1px solid ${partQty === q ? '#3b82f6' : '#334155'}`, color: partQty === q ? '#fff' : '#94a3b8', cursor: 'pointer' }}>
                                {q}
                            </button>
                        ))}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, gridColumn: 'span 4' }}>
                            <button onClick={() => setPartQty(v => Math.max(1, v - 1))} style={{ flex: 1, padding: 10, borderRadius: 8, background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}>−</button>
                            <span style={{ flex: 2, textAlign: 'center', color: '#f1f5f9', fontSize: 20, fontWeight: 700 }}>{partQty}</span>
                            <button onClick={() => setPartQty(v => v + 1)} style={{ flex: 1, padding: 10, borderRadius: 8, background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}>+</button>
                        </div>
                    </div>
                    {activeWo && (
                        <TapBtn variant="success" onClick={async () => {
                            setSubmitting(true);
                            setError('');
                            try {
                                const res = await fetch('/api/scan/parts-checkout', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                                    body: JSON.stringify({ woId: activeWo.id, partId: part.id, quantity: partQty }),
                                });
                                const data = await res.json();
                                if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
                                onActionComplete(data);
                            } catch (err) { setError(err.message); setSubmitting(false); }
                        }} disabled={submitting}>
                            <CheckCircle size={18} /> Add {partQty} to WO {activeWo.id}
                        </TapBtn>
                    )}
                    {error && <ErrorBanner msg={error} />}
                </div>
            );
        }
        return (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <Package size={44} color="#3b82f6" style={{ marginBottom: 12 }} />
                <div style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{part.description}</div>
                <div style={{ color: '#64748b', fontSize: 13, marginBottom: 4 }}>{part.id}{part.location ? ` · ${part.location}` : ''}</div>
                <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 20 }}>{part.available ?? '?'} in stock</div>
                {activeWo ? (
                    <TapBtn variant="success" onClick={() => { setSelectedPart({ id: part.id, description: part.description }); setPartQty(1); setScreen('parts_quantity'); }}>
                        <Plus size={18} /> Add to WO {activeWo.id}
                    </TapBtn>
                ) : (
                    <div style={{ color: '#f87171', fontSize: 13, padding: '12px 0' }}>No active work order — scan an asset first to start work, then scan parts to add them.</div>
                )}
                <button onClick={onCancel} style={{ marginTop: 12, background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14 }}>Dismiss</button>
            </div>
        );
    }

    // Branch: ROUTE_TO_ACTIVE_WO — active WO context
    if (branch === 'ROUTE_TO_ACTIVE_WO') {

        // Another user is active — Join / Take Over
        if (context === 'OTHER_USER_ACTIVE') {
            return (
                <PromptShell wo={wo} subtitle={`${activeUsers.length} technician(s) on this WO`} statePill={<StatePill label="ACTIVE" variant="active" />} activeUsers={activeUsers} onCancel={onCancel}>
                    <TapBtn number={1} variant="success"
                        onClick={() => submitAction({ action: 'JOIN' })}
                        disabled={submitting}>
                        <Users size={18} /> Join Existing Work
                    </TapBtn>
                    <TapBtn number={2} variant="warning"
                        onClick={() => submitAction({ action: 'TAKE_OVER' })}
                        disabled={submitting}>
                        <UserCheck size={18} /> Take Over
                    </TapBtn>
                    <MoreOptions>
                        <TapBtn number={3} variant="neutral"
                            onClick={() => setScreen('hold_reason')}
                            disabled={submitting}>
                            <Clock size={18} /> Put on Hold
                        </TapBtn>
                        <TapBtn number={4} variant="danger"
                            onClick={() => setScreen('team_close_confirm')}
                            disabled={submitting}>
                            <CheckCircle size={18} /> Close Work Order
                        </TapBtn>
                        <TapBtn number={5} variant="neutral"
                            onClick={() => submitAction({ action: 'ESCALATE' })}
                            disabled={submitting}>
                            <AlertTriangle size={18} /> Escalate
                        </TapBtn>
                    </MoreOptions>
                    {error && <ErrorBanner msg={error} />}
                </PromptShell>
            );
        }

        // This user is active, others also active — multi-tech prompt
        if (context === 'MULTI_TECH') {
            return (
                <PromptShell wo={wo} subtitle="Multiple Technicians" statePill={<StatePill label="IN PROGRESS" variant="active" />} onCancel={onCancel}>
                    <TapBtn number={1} variant="danger"
                        onClick={() => setScreen('team_close_confirm')}
                        disabled={submitting}>
                        <CheckCircle size={18} /> Close for Team
                    </TapBtn>
                    <TapBtn number={2} variant="default"
                        onClick={() => openBatchScan(wo?.id)}
                        disabled={submitting}>
                        <Package size={18} /> Add Parts
                    </TapBtn>
                    <MoreOptions>
                        <TapBtn number={3} variant="warning"
                            onClick={() => setScreen('hold_reason')}
                            disabled={submitting}>
                            <Clock size={18} /> Waiting…
                        </TapBtn>
                        <TapBtn number={4} variant="neutral"
                            onClick={() => submitAction({ action: 'LEAVE_WORK' })}
                            disabled={submitting}>
                            <UserX size={18} /> Leave Work
                        </TapBtn>
                        <TapBtn number={5} variant="neutral"
                            onClick={() => submitAction({ action: 'ESCALATE' })}
                            disabled={submitting}>
                            <AlertTriangle size={18} /> Escalate
                        </TapBtn>
                        <TapBtn number={6} variant="neutral"
                            onClick={() => submitAction({ action: 'CONTINUE_LATER' })}
                            disabled={submitting}>
                            Continue Later
                        </TapBtn>
                    </MoreOptions>
                    {error && <ErrorBanner msg={error} />}
                    <WorkOrderPartsCart woId={wo?.id} assetId={wo?.assetId} plantId={plantId} onOpenSearch={() => openBatchScan(wo?.id)} />
                </PromptShell>
            );
        }

        // Solo active (or RESUMED_NO_SEGMENT) — standard single-tech prompt
        return (
            <PromptShell wo={wo} subtitle="In Progress" statePill={<StatePill label="IN PROGRESS" variant="active" />} onCancel={onCancel}>
                <TapBtn number={1} variant="success"
                    onClick={() => submitAction({ action: 'CLOSE_WO' })}
                    disabled={submitting}>
                    <CheckCircle size={18} /> Close Work Order
                </TapBtn>
                <TapBtn number={2} variant="default"
                    onClick={() => openBatchScan(wo?.id)}
                    disabled={submitting}>
                    <Package size={18} /> Add Parts
                </TapBtn>
                <MoreOptions>
                    <TapBtn number={3} variant="warning"
                        onClick={() => setScreen('hold_reason')}
                        disabled={submitting}>
                        <Clock size={18} /> Waiting…
                    </TapBtn>
                    <TapBtn number={4} variant="neutral"
                        onClick={() => submitAction({ action: 'ESCALATE' })}
                        disabled={submitting}>
                        <AlertTriangle size={18} /> Escalate
                    </TapBtn>
                    <TapBtn number={5} variant="neutral"
                        onClick={() => submitAction({ action: 'CONTINUE_LATER' })}
                        disabled={submitting}>
                        Continue Later
                    </TapBtn>
                </MoreOptions>
                {error && <ErrorBanner msg={error} />}
                <WorkOrderPartsCart woId={wo?.id} assetId={wo?.assetId} plantId={plantId} onOpenSearch={() => openBatchScan(wo?.id)} />
            </PromptShell>
        );
    }

    // Branch: ASSET_NOT_FOUND — 404 path; catalogSuggestion/enrichment behind one tap
    if (branch === 'ASSET_NOT_FOUND') {
        return <NotFoundPrompt branchResponse={branchResponse} onCancel={onCancel} />;
    }

    // Fallback — unknown branch
    return (
        <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>
            Scan processed. Tap Done to continue.
            <br />
            <button onClick={onCancel} style={{ marginTop: 16, background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>Done</button>
        </div>
    );
}

// ── STATE pill ────────────────────────────────────────────────────────────────
function StatePill({ label, variant }) {
    const c = {
        started:   { bg: 'rgba(37,99,235,0.15)',   border: '#3b82f6', text: '#93c5fd'  },
        active:    { bg: 'rgba(16,185,129,0.15)',   border: '#10b981', text: '#6ee7b7'  },
        hold:      { bg: 'rgba(245,158,11,0.15)',   border: '#f59e0b', text: '#fbbf24'  },
        escalated: { bg: 'rgba(239,68,68,0.15)',    border: '#ef4444', text: '#f87171'  },
        unknown:   { bg: 'rgba(71,85,105,0.2)',     border: '#475569', text: '#94a3b8'  },
    }[variant] || { bg: 'rgba(71,85,105,0.2)', border: '#475569', text: '#94a3b8' };
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '3px 10px', borderRadius: 20,
            background: c.bg, border: `1px solid ${c.border}`,
            color: c.text, fontSize: 11, fontWeight: 700, letterSpacing: '0.07em',
        }}>
            {label}
        </span>
    );
}

// ── Collapsible secondary actions (buttons 3+) ────────────────────────────────
function MoreOptions({ children }) {
    const [open, setOpen] = React.useState(false);
    return (
        <>
            <button
                onClick={() => setOpen(o => !o)}
                style={{
                    width: '100%', marginTop: 4, padding: '10px 14px', borderRadius: 10,
                    background: 'none', border: '1px solid #1e293b',
                    color: '#475569', cursor: 'pointer', fontSize: 13, textAlign: 'left',
                }}
            >
                {open ? '▲ Fewer options' : '▾ More options'}
            </button>
            {open && children}
        </>
    );
}

// ── Unknown asset prompt (404 path) ──────────────────────────────────────────
function NotFoundPrompt({ branchResponse, onCancel }) {
    const [detailsOpen, setDetailsOpen] = React.useState(false);
    const { assetId, catalogSuggestion, enrichmentId, liveState, digitalTwin, peerTwin } = branchResponse || {};
    const hasContext = !!(catalogSuggestion || liveState || digitalTwin || peerTwin || enrichmentId);

    return (
        <div style={{ padding: '4px 0' }}>
            <div style={{ marginBottom: 20 }}>
                <StatePill label="UNKNOWN" variant="unknown" />
                <div style={{ color: '#f1f5f9', fontSize: 16, fontWeight: 700, marginTop: 10 }}>
                    {assetId}
                </div>
                <div style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>
                    Not registered in this plant
                </div>
            </div>

            {catalogSuggestion && (
                <div style={{
                    padding: '10px 14px', borderRadius: 8, marginBottom: 16,
                    background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.2)',
                }}>
                    <div style={{ color: '#64748b', fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', marginBottom: 4 }}>
                        CATALOG MATCH
                    </div>
                    <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600 }}>
                        {catalogSuggestion.description}
                    </div>
                    {(catalogSuggestion.category || catalogSuggestion.primaryMaker) && (
                        <div style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                            {[catalogSuggestion.category, catalogSuggestion.primaryMaker].filter(Boolean).join(' · ')}
                        </div>
                    )}
                </div>
            )}

            <div style={{ color: '#475569', fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', marginBottom: 4 }}>
                NEXT
            </div>
            <TapBtn number={1} variant="neutral" onClick={onCancel}>
                Try Another Scan
            </TapBtn>

            {hasContext && (
                <button
                    onClick={() => setDetailsOpen(o => !o)}
                    style={{
                        width: '100%', marginTop: 8, padding: '10px 14px', borderRadius: 10,
                        background: 'none', border: '1px solid #1e293b',
                        color: '#475569', cursor: 'pointer', fontSize: 13, textAlign: 'left',
                    }}
                >
                    {detailsOpen ? '▲ Hide details' : '▾ Additional context'}
                </button>
            )}

            {detailsOpen && (
                <div style={{
                    marginTop: 8, padding: '12px 14px', borderRadius: 8,
                    background: '#0f172a', border: '1px solid #1e293b',
                    fontSize: 13, color: '#94a3b8',
                }}>
                    {liveState && (
                        <div style={{ marginBottom: 6 }}>
                            <span style={{ color: '#64748b', fontWeight: 600 }}>Live state: </span>
                            {liveState.stale ? 'stale' : 'recent'} telemetry ({liveState.source})
                        </div>
                    )}
                    {digitalTwin && (
                        <div style={{ marginBottom: 6 }}>
                            <span style={{ color: '#64748b', fontWeight: 600 }}>Digital twin: </span>
                            {digitalTwin.format} · {digitalTwin.source}
                        </div>
                    )}
                    {peerTwin && (
                        <div style={{ marginBottom: 6 }}>
                            <span style={{ color: '#64748b', fontWeight: 600 }}>Peer twin: </span>
                            {peerTwin.format} from {peerTwin.contributedBy}
                        </div>
                    )}
                    {enrichmentId && (
                        <div style={{ color: '#475569', fontStyle: 'italic' }}>
                            Semantic analysis in progress…
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Shared prompt wrapper ─────────────────────────────────────────────────────
function PromptShell({ wo, subtitle, statePill, activeUsers, onCancel, children }) {
    // Derive LAST line: active users trump lastAction; show nothing if neither present
    let lastLine = null;
    if (activeUsers && activeUsers.length > 0) {
        lastLine = `Currently active: ${activeUsers.join(', ')}`;
    } else if (wo?.lastAction?.label) {
        lastLine = wo.lastAction.label;
    }

    return (
        <div style={{ padding: '4px 0' }}>
            {wo && (
                <div style={{ marginBottom: 20 }}>
                    {statePill && <div style={{ marginBottom: 8 }}>{statePill}</div>}
                    <div style={{ color: '#f1f5f9', fontSize: 16, fontWeight: 700 }}>
                        {wo.description || `WO ${wo.number}`}
                    </div>
                    <div style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>
                        {wo.number} · {subtitle}
                    </div>
                    {lastLine && (
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
                            <span style={{ color: '#475569', fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', flexShrink: 0 }}>LAST</span>
                            <span style={{ color: '#64748b', fontSize: 13 }}>{lastLine}</span>
                        </div>
                    )}
                </div>
            )}
            <div style={{ color: '#475569', fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', marginBottom: 4 }}>
                NEXT
            </div>
            {children}
            <button
                onClick={onCancel}
                style={{
                    marginTop: 8, width: '100%', padding: '12px', borderRadius: 8,
                    background: 'none', border: '1px solid #1e293b',
                    color: '#475569', cursor: 'pointer', fontSize: 14,
                }}
            >
                Cancel
            </button>
        </div>
    );
}

// ── Error banner ──────────────────────────────────────────────────────────────
function ErrorBanner({ msg }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginTop: 8,
            background: '#3b1f1f', border: '1px solid #7f1d1d',
            borderRadius: 8, padding: '10px 14px',
            color: '#fca5a5', fontSize: 13,
        }}>
            <AlertTriangle size={15} />
            {msg}
        </div>
    );
}
