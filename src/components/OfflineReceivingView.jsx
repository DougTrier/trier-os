// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */

/**
 * OfflineReceivingView.jsx — Offline-First Receiving for Zebra Scanners
 * ======================================================================
 * Techs scan parts barcodes into receiving. Events are written to IndexedDB
 * immediately (confirmed instantly), then synced to the server when Wi-Fi
 * returns. No internet required to scan.
 *
 * Flow:
 *   1. On mount: warm local IndexedDB cache from server (if online)
 *   2. Tech scans barcode → look up in local cache → confirm quantity
 *   3. saveEvent() writes to IDB → show confirmation
 *   4. On reconnect (or manual Sync): POST all pending → show results
 *
 * -- API DEPENDENCIES -----------------------------------------------
 *   GET  /api/offline/receiving-cache      Part+PO snapshot for IDB
 *   POST /api/offline/receiving-sync       Sync queued events
 *   GET  /api/offline/receiving-events     Review queue (admin)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Wifi, WifiOff, RefreshCw, CheckCircle, AlertTriangle, Package, Clock, X } from 'lucide-react';
import {
    saveEvent,
    getPendingEvents,
    getAllEvents,
    sync,
    warmCache,
    lookupPart,
    getCachedPOs,
    isOnline,
    registerAutoSync,
} from '../utils/offlineReceivingDB.js';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_QTY = 1;

export default function OfflineReceivingView({ plantId }) {
    const [online, setOnline]             = useState(isOnline());
    const [cacheReady, setCacheReady]     = useState(false);
    const [pendingCount, setPendingCount] = useState(0);
    const [events, setEvents]             = useState([]);
    const [syncing, setSyncing]           = useState(false);
    const [syncResult, setSyncResult]     = useState(null);
    const [openPOs, setOpenPOs]           = useState([]);
    const [selectedPO, setSelectedPO]     = useState('');

    // Scan state
    const [barcode, setBarcode]           = useState('');
    const [quantity, setQuantity]         = useState(String(DEFAULT_QTY));
    const [binLocation, setBinLocation]   = useState('');
    const [resolvedPart, setResolvedPart] = useState(null); // from local cache lookup
    const [lastConfirmed, setLastConfirmed] = useState(null); // brief confirmation flash
    const [lookupError, setLookupError]   = useState('');

    const barcodeRef  = useRef(null);
    const quantityRef = useRef(null);

    // ── Connectivity listeners ────────────────────────────────────────────────
    useEffect(() => {
        const setOn  = () => setOnline(true);
        const setOff = () => setOnline(false);
        window.addEventListener('online',  setOn);
        window.addEventListener('offline', setOff);
        return () => {
            window.removeEventListener('online',  setOn);
            window.removeEventListener('offline', setOff);
        };
    }, []);

    // ── Cache warm-up + auto-sync registration ────────────────────────────────
    useEffect(() => {
        (async () => {
            if (online) {
                const ok = await warmCache(plantId);
                setCacheReady(ok);
                const pos = await getCachedPOs();
                setOpenPOs(pos);
            }
            await refreshCounts();
        })();

        const cleanup = registerAutoSync(plantId, result => {
            setSyncResult(result);
            refreshCounts();
        });
        return cleanup;
    }, [plantId, online]);

    async function refreshCounts() {
        const pending = await getPendingEvents();
        setPendingCount(pending.length);
        const all = await getAllEvents();
        // Show most recent 50
        setEvents(all.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)).slice(0, 50));
    }

    // ── Barcode entry → cache lookup ──────────────────────────────────────────
    const handleBarcodeChange = useCallback(async (val) => {
        setBarcode(val);
        setLookupError('');
        setResolvedPart(null);
        if (val.trim().length >= 2) {
            const part = await lookupPart(val.trim());
            if (part) {
                setResolvedPart(part);
            }
        }
    }, []);

    const handleBarcodeKeyDown = useCallback(async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            // On Enter from barcode field, jump to quantity
            if (!barcode.trim()) return;
            if (!resolvedPart && cacheReady) {
                setLookupError(`"${barcode}" not in local cache — will be reviewed on sync`);
            }
            quantityRef.current?.focus();
            quantityRef.current?.select();
        }
    }, [barcode, resolvedPart, cacheReady]);

    // ── Confirm scan ──────────────────────────────────────────────────────────
    const handleConfirm = useCallback(async () => {
        const code = barcode.trim();
        if (!code) { barcodeRef.current?.focus(); return; }

        const qty = parseFloat(quantity);
        if (!isFinite(qty) || qty <= 0) {
            setLookupError('Enter a valid quantity');
            return;
        }

        const event = {
            eventId:     uuidv4(),
            plantId,
            barcode:     code,
            poNumber:    selectedPO || null,
            quantity:    qty,
            binLocation: binLocation.trim() || null,
            capturedAt:  new Date().toISOString(),
            deviceId:    navigator.userAgent.slice(0, 64),
        };

        await saveEvent(event);

        setLastConfirmed({ barcode: code, quantity: qty, part: resolvedPart });
        setTimeout(() => setLastConfirmed(null), 3000);

        // Reset scan fields; keep PO + bin selected for rapid multi-scan
        setBarcode('');
        setQuantity(String(DEFAULT_QTY));
        setResolvedPart(null);
        setLookupError('');

        await refreshCounts();
        barcodeRef.current?.focus();
    }, [barcode, quantity, selectedPO, binLocation, plantId, resolvedPart]);

    const handleQuantityKeyDown = useCallback((e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleConfirm();
        }
    }, [handleConfirm]);

    // ── Manual sync ───────────────────────────────────────────────────────────
    const handleSync = useCallback(async () => {
        if (syncing) return;
        setSyncing(true);
        setSyncResult(null);
        const result = await sync(plantId);
        setSyncing(false);
        if (result) {
            setSyncResult(result);
            await refreshCounts();
        } else {
            setSyncResult({ error: 'Sync failed — check connection and try again' });
        }
    }, [plantId, syncing]);

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-gray-950 text-white p-4 max-w-xl mx-auto">

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl font-bold tracking-tight">Receiving</h1>
                    <p className="text-xs text-gray-400 mt-0.5">{plantId}</p>
                </div>
                <ConnectivityBadge online={online} />
            </div>

            {/* Offline banner */}
            {!online && (
                <div className="bg-yellow-900/40 border border-yellow-700 rounded-lg p-3 mb-4 flex items-center gap-2 text-sm text-yellow-300">
                    <WifiOff size={16} />
                    <span>Working offline — scans are queued and will sync when Wi-Fi returns.</span>
                </div>
            )}

            {/* Cache not ready warning (online but cache hasn't loaded) */}
            {online && !cacheReady && (
                <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-3 mb-4 text-xs text-blue-300">
                    Loading local part catalog…
                </div>
            )}

            {/* Confirmation flash */}
            {lastConfirmed && (
                <div className="bg-green-900/50 border border-green-600 rounded-lg p-3 mb-4 flex items-center gap-2 text-sm text-green-300 animate-pulse">
                    <CheckCircle size={16} />
                    <span>
                        <strong>{lastConfirmed.quantity} ×</strong>{' '}
                        {lastConfirmed.part
                            ? (lastConfirmed.part.Descript || lastConfirmed.part.Description || lastConfirmed.barcode)
                            : lastConfirmed.barcode}{' '}
                        saved
                    </span>
                </div>
            )}

            {/* Scan form */}
            <div className="bg-gray-900 rounded-xl p-5 mb-4 space-y-4">
                <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Scan Part</h2>

                {/* Barcode */}
                <div>
                    <label className="block text-xs text-gray-400 mb-1">Barcode / Part ID</label>
                    <input
                        ref={barcodeRef}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-base focus:outline-none focus:border-blue-500"
                        placeholder="Scan or type barcode…"
                        value={barcode}
                        autoFocus
                        autoComplete="off"
                        onChange={e => handleBarcodeChange(e.target.value)}
                        onKeyDown={handleBarcodeKeyDown}
                    />
                    {resolvedPart && (
                        <p className="text-xs text-green-400 mt-1">
                            ✓ {resolvedPart.Descript || resolvedPart.Description}
                            {resolvedPart.Stock != null ? ` — current stock: ${resolvedPart.Stock}` : ''}
                        </p>
                    )}
                    {lookupError && (
                        <p className="text-xs text-yellow-400 mt-1">{lookupError}</p>
                    )}
                </div>

                {/* Quantity */}
                <div>
                    <label className="block text-xs text-gray-400 mb-1">Quantity</label>
                    <input
                        ref={quantityRef}
                        type="number"
                        min="0.001"
                        step="any"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-base focus:outline-none focus:border-blue-500"
                        value={quantity}
                        onChange={e => setQuantity(e.target.value)}
                        onKeyDown={handleQuantityKeyDown}
                    />
                </div>

                {/* PO selector */}
                {openPOs.length > 0 && (
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">PO (optional)</label>
                        <select
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                            value={selectedPO}
                            onChange={e => setSelectedPO(e.target.value)}
                        >
                            <option value="">— No PO —</option>
                            {openPOs.map(po => (
                                <option key={po.ID} value={po.PONumber}>
                                    {po.PONumber}{po.Description ? ` — ${po.Description}` : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Bin */}
                <div>
                    <label className="block text-xs text-gray-400 mb-1">Bin / Location (optional)</label>
                    <input
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                        placeholder="e.g. A-12-3"
                        value={binLocation}
                        onChange={e => setBinLocation(e.target.value)}
                    />
                </div>

                <button
                    className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 rounded-lg py-3 font-semibold text-white transition-colors"
                    onClick={handleConfirm}
                >
                    Confirm Scan
                </button>
            </div>

            {/* Sync panel */}
            <div className="bg-gray-900 rounded-xl p-5 mb-4">
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <h2 className="text-sm font-semibold text-gray-300">Sync Queue</h2>
                        {pendingCount > 0 ? (
                            <p className="text-xs text-yellow-400 mt-0.5">{pendingCount} pending</p>
                        ) : (
                            <p className="text-xs text-gray-500 mt-0.5">All synced</p>
                        )}
                    </div>
                    <button
                        onClick={handleSync}
                        disabled={syncing || !online || pendingCount === 0}
                        className="flex items-center gap-1.5 text-sm bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg px-3 py-2 transition-colors"
                    >
                        <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                        {syncing ? 'Syncing…' : 'Sync Now'}
                    </button>
                </div>

                {syncResult && (
                    <SyncResultBanner result={syncResult} onDismiss={() => setSyncResult(null)} />
                )}
            </div>

            {/* Recent events table */}
            {events.length > 0 && (
                <div className="bg-gray-900 rounded-xl p-5">
                    <h2 className="text-sm font-semibold text-gray-300 mb-3">Recent Scans</h2>
                    <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                        {events.map(ev => (
                            <EventRow key={ev.eventId} ev={ev} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function ConnectivityBadge({ online }) {
    return online ? (
        <span className="flex items-center gap-1 text-xs text-green-400 bg-green-900/30 border border-green-800 rounded-full px-2.5 py-1">
            <Wifi size={12} /> Online
        </span>
    ) : (
        <span className="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-900/30 border border-yellow-800 rounded-full px-2.5 py-1">
            <WifiOff size={12} /> Offline
        </span>
    );
}

function SyncResultBanner({ result, onDismiss }) {
    if (result.error) {
        return (
            <div className="flex items-start gap-2 text-sm text-red-300 bg-red-900/30 border border-red-800 rounded-lg p-3">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>{result.error}</span>
                <button onClick={onDismiss} className="ml-auto text-gray-400 hover:text-white"><X size={14} /></button>
            </div>
        );
    }
    return (
        <div className="flex items-start gap-2 text-sm text-green-300 bg-green-900/30 border border-green-800 rounded-lg p-3">
            <CheckCircle size={14} className="mt-0.5 shrink-0" />
            <span>
                Synced — {result.accepted} accepted
                {result.needsReview > 0 ? `, ${result.needsReview} need review` : ''}
                {result.rejected   > 0 ? `, ${result.rejected} rejected` : ''}
            </span>
            <button onClick={onDismiss} className="ml-auto text-gray-400 hover:text-white"><X size={14} /></button>
        </div>
    );
}

const STATUS_COLORS = {
    pending:    'text-yellow-400',
    accepted:   'text-green-400',
    needsReview: 'text-orange-400',
    rejected:   'text-red-400',
    synced:     'text-green-400',
};

function EventRow({ ev }) {
    const color = STATUS_COLORS[ev.syncStatus] || 'text-gray-400';
    const time  = new Date(ev.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return (
        <div className="flex items-center justify-between text-xs py-1.5 border-b border-gray-800 last:border-0">
            <div className="flex items-center gap-2 min-w-0">
                <Package size={12} className="text-gray-500 shrink-0" />
                <span className="truncate text-gray-200">{ev.barcode}</span>
                <span className="text-gray-500 shrink-0">× {ev.quantity}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-2">
                <span className="flex items-center gap-1 text-gray-500"><Clock size={10} />{time}</span>
                <span className={`font-medium ${color}`}>{ev.syncStatus}</span>
            </div>
        </div>
    );
}
