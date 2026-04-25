// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS — Asset Parts Panel
 * ============================
 * Always-visible parts panel for active work orders. Shows:
 *   1. Parts issued to this WO (with return-to-stock controls)
 *   2. Suggested parts for this asset (from BOM + work history)
 *   3. Search All Parts fallback button
 *
 * After a tech adds a history-sourced part, prompts "Save as common
 * for this asset?" to improve future suggestions (self-learning BOM).
 *
 * API CALLS:
 *   GET  /api/scan/suggested-parts?assetId=&woId=  — issued + suggested parts
 *   POST /api/scan/parts-checkout                  — add suggested part to WO
 *   POST /api/scan/return-part                     — return issued part to stock
 *   POST /api/scan/save-asset-part                 — save part as common for asset
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    Package, RotateCcw, CheckCircle, AlertTriangle, RefreshCw,
    ChevronDown, ChevronUp, Plus, Search, Bookmark,
} from 'lucide-react';

// ── Status pill for issued parts ─────────────────────────────────────────────
const STATUS_COLOR = {
    issued:         '#60a5fa',
    partial_return: '#f59e0b',
    fully_returned: '#94a3b8',
    used:           '#10b981',
};
function StatusPill({ status }) {
    const color = STATUS_COLOR[status] || '#64748b';
    const label = { issued: 'Issued', partial_return: 'Partial', fully_returned: 'Returned', used: 'Used' }[status] || status;
    return (
        <span style={{
            fontSize: '0.62rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4,
            background: `${color}18`, color, border: `1px solid ${color}33`,
            textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0,
        }}>
            {label}
        </span>
    );
}

// ── Source badge for suggested parts ─────────────────────────────────────────
function SourceBadge({ source }) {
    const map = {
        bom:     { label: 'BOM',     color: '#06b6d4' },
        history: { label: 'History', color: '#8b5cf6' },
    };
    const { label, color } = map[source] || { label: source, color: '#64748b' };
    return (
        <span style={{
            fontSize: '0.6rem', fontWeight: 700, padding: '2px 5px', borderRadius: 3,
            background: `${color}15`, color, border: `1px solid ${color}28`,
            textTransform: 'uppercase', letterSpacing: '0.04em',
        }}>
            {label}
        </span>
    );
}

// ── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({ children }) {
    return (
        <div style={{
            fontSize: '0.68rem', fontWeight: 700, color: '#475569',
            letterSpacing: '0.07em', textTransform: 'uppercase',
            marginBottom: 6, marginTop: 4, paddingLeft: 2,
        }}>
            {children}
        </div>
    );
}

// ── Issued part row (with return controls) ────────────────────────────────────
function IssuedPartRow({ part, woId, plantId, onReturned }) {
    const [returning, setReturning] = useState(false);
    const [qtyInput, setQtyInput]   = useState('');
    const [error, setError]         = useState('');
    const [showInput, setShowInput] = useState(false);

    const returnable = Math.max(0, Number(part.qty_returnable) || 0);
    const canReturn  = returnable > 0.001;
    const isFullyReturned = part.status === 'fully_returned';

    const doReturn = async (qty) => {
        if (!qty || qty <= 0) return;
        setReturning(true); setError('');
        try {
            const res = await fetch('/api/scan/return-part', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                body: JSON.stringify({ woId, partId: part.PartID, qty }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Return failed');
            setShowInput(false); setQtyInput(''); onReturned();
        } catch (e) { setError(e.message); }
        setReturning(false);
    };

    return (
        <div style={{
            padding: '10px 12px', marginBottom: 6, borderRadius: 9,
            background: isFullyReturned ? 'rgba(255,255,255,0.02)' : 'rgba(15,23,42,0.5)',
            border: `1px solid ${isFullyReturned ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.08)'}`,
            opacity: isFullyReturned ? 0.6 : 1,
        }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                <Package size={13} color="#60a5fa" style={{ marginTop: 2, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.84rem', color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {part.description || part.PartID}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 1 }}>
                        {part.PartID}{part.Location ? ` · ${part.Location}` : ''}{part.UOM ? ` · ${part.UOM}` : ''}
                    </div>
                </div>
                <StatusPill status={part.status} />
            </div>

            {/* Qty grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginBottom: canReturn ? 8 : 0 }}>
                {[
                    { label: 'Issued',   value: part.qty_issued,   color: '#60a5fa' },
                    { label: 'Used',     value: part.qty_used,     color: '#10b981' },
                    { label: 'Returned', value: part.qty_returned, color: '#94a3b8' },
                    { label: 'Remaining', value: returnable,        color: canReturn ? '#f59e0b' : '#334155' },
                ].map(({ label, value, color }) => (
                    <div key={label} style={{ textAlign: 'center', padding: '4px 2px', background: 'rgba(255,255,255,0.03)', borderRadius: 5 }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color }}>{Number(value || 0)}</div>
                        <div style={{ fontSize: '0.56rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                    </div>
                ))}
            </div>

            {/* Return controls */}
            {canReturn && !isFullyReturned && (
                <div>
                    {!showInput ? (
                        <div style={{ display: 'flex', gap: 5 }}>
                            {returnable > 1 && (
                                <button
                                    onClick={() => { setShowInput(true); setQtyInput(String(returnable)); }}
                                    disabled={returning}
                                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '6px 0', borderRadius: 7, cursor: 'pointer', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b', fontSize: '0.74rem', fontWeight: 600 }}
                                >
                                    <RotateCcw size={12} /> Partial
                                </button>
                            )}
                            <button
                                onClick={() => doReturn(returnable)}
                                disabled={returning}
                                style={{ flex: returnable > 1 ? 1 : undefined, minWidth: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '6px 10px', borderRadius: 7, cursor: returning ? 'not-allowed' : 'pointer', background: returning ? 'rgba(255,255,255,0.04)' : 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', color: returning ? '#475569' : '#10b981', fontSize: '0.74rem', fontWeight: 600 }}
                            >
                                <RotateCcw size={12} />
                                {returning ? 'Returning…' : `Return ${returnable > 1 ? 'All' : '1'}`}
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                            <input
                                type="number" min={1} max={returnable} step={1}
                                value={qtyInput} onChange={e => setQtyInput(e.target.value)}
                                style={{ width: 60, padding: '5px 8px', borderRadius: 6, fontSize: '0.84rem', background: 'rgba(30,41,59,0.9)', border: '1px solid rgba(245,158,11,0.4)', color: '#f1f5f9', outline: 'none', textAlign: 'center' }}
                                autoFocus
                            />
                            <span style={{ fontSize: '0.7rem', color: '#64748b' }}>of {returnable}</span>
                            <button onClick={() => doReturn(Number(qtyInput))} disabled={returning || !qtyInput || Number(qtyInput) <= 0}
                                style={{ flex: 1, padding: '6px 0', borderRadius: 7, cursor: 'pointer', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', color: '#10b981', fontSize: '0.74rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                <RotateCcw size={12} /> Return {qtyInput || '…'}
                            </button>
                            <button onClick={() => { setShowInput(false); setQtyInput(''); setError(''); }}
                                style={{ padding: '6px 8px', borderRadius: 6, background: 'none', border: '1px solid rgba(255,255,255,0.08)', color: '#64748b', cursor: 'pointer', fontSize: '0.72rem' }}>
                                Cancel
                            </button>
                        </div>
                    )}
                    {error && <div style={{ marginTop: 5, fontSize: '0.7rem', color: '#f87171' }}>{error}</div>}
                </div>
            )}

            {isFullyReturned && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', color: '#475569', marginTop: 3 }}>
                    <CheckCircle size={11} color="#475569" /> All returned to stock
                </div>
            )}
        </div>
    );
}

// ── Suggested part row (one-tap add) ─────────────────────────────────────────
function SuggestedPartRow({ part, onAdd, adding, disabled }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '9px 10px', marginBottom: 5, borderRadius: 8,
            background: 'rgba(15,23,42,0.4)', border: '1px solid rgba(255,255,255,0.06)',
        }}>
            <Package size={13} color="#475569" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {part.description || part.PartID}
                </div>
                <div style={{ fontSize: '0.65rem', color: '#475569', marginTop: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <SourceBadge source={part.source} />
                    <span>{part.PartID}</span>
                    {part.stock_available != null && <span>· {part.stock_available} in stock</span>}
                </div>
            </div>
            <button
                onClick={onAdd}
                disabled={adding || disabled}
                style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '6px 10px', borderRadius: 6, cursor: (adding || disabled) ? 'not-allowed' : 'pointer',
                    background: adding ? 'rgba(255,255,255,0.04)' : 'rgba(96,165,250,0.12)',
                    border: '1px solid rgba(96,165,250,0.25)',
                    color: adding ? '#475569' : '#60a5fa', fontSize: '0.74rem', fontWeight: 600, flexShrink: 0,
                }}
            >
                <Plus size={12} />
                {adding ? '…' : `Add ${part.suggested_qty > 1 ? part.suggested_qty : 1}`}
            </button>
        </div>
    );
}

// ── Save-as-common prompt ─────────────────────────────────────────────────────
function SaveAsCommonPrompt({ part, onSave, onSkip, saving }) {
    return (
        <div style={{
            margin: '8px 0', padding: '10px 12px', borderRadius: 8,
            background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                <Bookmark size={13} color="#8b5cf6" />
                <span style={{ fontSize: '0.76rem', fontWeight: 600, color: '#a78bfa' }}>
                    Save as common for this asset?
                </span>
            </div>
            <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: 8 }}>
                {part.description} will appear in suggestions next time.
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={onSave} disabled={saving}
                    style={{ flex: 1, padding: '6px 0', borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.35)', color: '#a78bfa', fontSize: '0.74rem', fontWeight: 600 }}>
                    {saving ? 'Saving…' : 'Yes, Save'}
                </button>
                <button onClick={onSkip}
                    style={{ padding: '6px 12px', borderRadius: 6, background: 'none', border: '1px solid rgba(255,255,255,0.07)', color: '#475569', cursor: 'pointer', fontSize: '0.74rem' }}>
                    Just this WO
                </button>
            </div>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function WorkOrderPartsCart({ woId, assetId, plantId, onOpenSearch }) {
    const [data, setData]       = useState(null);   // { issued, suggested }
    const [error, setError]     = useState('');
    const [loading, setLoading] = useState(false);
    const [open, setOpen]       = useState(false);
    const [addingPart, setAddingPart]   = useState(null);  // PartID being added
    const [justAdded, setJustAdded]     = useState(null);  // { partId, description, source }
    const [savingCommon, setSavingCommon] = useState(false);

    const load = useCallback(async () => {
        if (!assetId && !woId) return;
        setError('');
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (assetId) params.set('assetId', assetId);
            if (woId)    params.set('woId', woId);
            const res = await fetch(`/api/scan/suggested-parts?${params}`, {
                headers: { 'x-plant-id': plantId },
            });
            const json = await res.json();
            const result = { issued: json.issued || [], suggested: json.suggested || [] };
            setData(result);
            // Auto-expand when there's content
            if (result.issued.length > 0 || result.suggested.length > 0) setOpen(true);
        } catch (e) {
            setError(e.message);
        }
        setLoading(false);
    }, [assetId, woId, plantId]);

    useEffect(() => { load(); }, [load]);

    const addPart = async (part) => {
        if (!woId) return;
        setAddingPart(part.PartID);
        setError('');
        try {
            const res = await fetch('/api/scan/parts-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                body: JSON.stringify({ woId, partId: part.PartID, quantity: part.suggested_qty || 1 }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Add failed');
            if (part.source === 'history') {
                setJustAdded({ partId: part.PartID, description: part.description });
            }
            load();
        } catch (e) {
            setError(e.message);
        }
        setAddingPart(null);
    };

    const saveAsCommon = async () => {
        if (!justAdded || !assetId) { setJustAdded(null); return; }
        setSavingCommon(true);
        try {
            await fetch('/api/scan/save-asset-part', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                body: JSON.stringify({ assetId, partId: justAdded.partId, quantity: 1 }),
            });
        } catch (_) {}
        setJustAdded(null);
        setSavingCommon(false);
        load(); // refresh to show the part now under BOM
    };

    const issuedCount    = data?.issued?.length ?? 0;
    const suggestedCount = data?.suggested?.length ?? 0;
    const returnableCount = (data?.issued || []).filter(p => (p.qty_returnable || 0) > 0.001).length;
    const hasContent     = issuedCount > 0 || suggestedCount > 0;

    return (
        <div style={{ marginTop: 12 }}>
            {/* ── Toggle header ──────────────────────────────────────── */}
            <button
                onClick={() => setOpen(o => !o)}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '9px 12px', borderRadius: 9, cursor: 'pointer',
                    background: open ? 'rgba(96,165,250,0.07)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${open ? 'rgba(96,165,250,0.18)' : 'rgba(255,255,255,0.07)'}`,
                    color: '#f1f5f9', textAlign: 'left',
                }}
            >
                <Package size={15} color="#60a5fa" />
                <span style={{ fontWeight: 700, fontSize: '0.84rem' }}>Parts</span>

                {data !== null && (
                    <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                        {issuedCount > 0
                            ? `${issuedCount} issued`
                            : (suggestedCount > 0 ? `${suggestedCount} suggested` : 'none assigned')}
                    </span>
                )}

                {returnableCount > 0 && (
                    <span style={{
                        fontSize: '0.63rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                        background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)',
                    }}>
                        {returnableCount} returnable
                    </span>
                )}

                <span style={{ marginLeft: 'auto', color: '#475569' }}>
                    {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
            </button>

            {/* ── Panel body ─────────────────────────────────────────── */}
            {open && (
                <div style={{ marginTop: 7 }}>
                    {loading && (
                        <div style={{ color: '#64748b', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 7, padding: '10px 2px' }}>
                            <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Loading parts…
                        </div>
                    )}

                    {error && (
                        <div style={{ color: '#f87171', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <AlertTriangle size={12} /> {error}
                        </div>
                    )}

                    {/* Issued to WO */}
                    {issuedCount > 0 && (
                        <>
                            <SectionLabel>Issued to this Work Order</SectionLabel>
                            {data.issued.map(p => (
                                <IssuedPartRow
                                    key={p.PartID} part={p}
                                    woId={woId} plantId={plantId}
                                    onReturned={load}
                                />
                            ))}
                        </>
                    )}

                    {/* Save-as-common prompt */}
                    {justAdded && (
                        <SaveAsCommonPrompt
                            part={justAdded}
                            onSave={saveAsCommon}
                            onSkip={() => setJustAdded(null)}
                            saving={savingCommon}
                        />
                    )}

                    {/* Suggested parts */}
                    {suggestedCount > 0 && (
                        <>
                            <SectionLabel>{issuedCount > 0 ? 'Suggested Parts' : 'Suggested for this Asset'}</SectionLabel>
                            {data.suggested.map(p => (
                                <SuggestedPartRow
                                    key={p.PartID} part={p}
                                    onAdd={() => addPart(p)}
                                    adding={addingPart === p.PartID}
                                    disabled={!woId}
                                />
                            ))}
                        </>
                    )}

                    {/* Empty state */}
                    {!loading && !hasContent && !error && (
                        <div style={{ color: '#475569', fontSize: '0.78rem', padding: '10px 4px', textAlign: 'center' }}>
                            No parts mapped for this asset yet.
                        </div>
                    )}

                    {/* Search fallback */}
                    {onOpenSearch && (
                        <button
                            onClick={onOpenSearch}
                            style={{
                                width: '100%', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                padding: '8px 0', borderRadius: 7, cursor: 'pointer',
                                background: 'none', border: '1px solid rgba(255,255,255,0.07)',
                                color: '#475569', fontSize: '0.76rem',
                            }}
                        >
                            <Search size={13} /> Search All Parts
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
