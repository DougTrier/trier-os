// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */

/**
 * offlineReceivingDB.js — IndexedDB wrapper for offline Zebra receiving scans
 * ============================================================================
 * Write-first, sync-later pattern:
 *   1. saveEvent() writes to IDB immediately (confirmed to user right away)
 *   2. sync() POSTs all pending events to /api/offline/receiving-sync
 *   3. On success, marks events as synced in IDB
 *   4. Auto-sync fires whenever the browser regains connectivity
 *
 * API dependencies:
 *   POST /api/offline/receiving-sync
 *   GET  /api/offline/receiving-cache
 */

const DB_NAME    = 'TrierOfflineReceiving';
const DB_VERSION = 1;
const STORE_EVENTS  = 'events';
const STORE_CACHE   = 'partCache';

let _db = null;

async function openDB() {
    if (_db) return _db;
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_EVENTS)) {
                const s = db.createObjectStore(STORE_EVENTS, { keyPath: 'eventId' });
                s.createIndex('syncStatus', 'syncStatus', { unique: false });
            }
            if (!db.objectStoreNames.contains(STORE_CACHE)) {
                db.createObjectStore(STORE_CACHE, { keyPath: 'id' });
            }
        };
        req.onsuccess = e => { _db = e.target.result; resolve(_db); };
        req.onerror   = e => reject(e.target.error);
    });
}

function txGet(store, mode, fn) {
    return openDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(store, mode);
        tx.onerror = () => reject(tx.error);
        resolve(fn(tx.objectStore(store)));
    }));
}

function idbReq(req) {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
    });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Save one receiving scan event to IndexedDB (always succeeds locally).
 * @param {object} event  Must include eventId, plantId, barcode, quantity, capturedAt
 */
export async function saveEvent(event) {
    const record = { ...event, syncStatus: 'pending' };
    await txGet(STORE_EVENTS, 'readwrite', store => idbReq(store.put(record)));
    return record;
}

/** Return all pending events (not yet synced). */
export async function getPendingEvents() {
    return txGet(STORE_EVENTS, 'readonly', store =>
        idbReq(store.index('syncStatus').getAll('pending'))
    );
}

/** Return all events (for the queue display). */
export async function getAllEvents() {
    return txGet(STORE_EVENTS, 'readonly', store => idbReq(store.getAll()));
}

/** Mark a list of eventIds as synced with the given server status. */
export async function markSynced(results) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_EVENTS, 'readwrite');
        tx.oncomplete = resolve;
        tx.onerror    = () => reject(tx.error);
        const store   = tx.objectStore(STORE_EVENTS);
        for (const { eventId, status, resolvedPartId, reviewNote } of results) {
            const get = store.get(eventId);
            get.onsuccess = () => {
                if (!get.result) return;
                store.put({
                    ...get.result,
                    syncStatus:     status === 'duplicate' ? 'synced' : status,
                    resolvedPartId: resolvedPartId || null,
                    reviewNote:     reviewNote     || null,
                    syncedAt:       new Date().toISOString(),
                });
            };
        }
    });
}

/**
 * Sync all pending events to the server.
 * Returns { accepted, needsReview, rejected, results } from the server,
 * or null if offline / server unreachable.
 */
export async function sync(plantId, authHeaders = {}) {
    const pending = await getPendingEvents();
    if (pending.length === 0) return { accepted: 0, needsReview: 0, rejected: 0, results: [] };

    let resp;
    try {
        resp = await fetch('/api/offline/receiving-sync', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId, ...authHeaders },
            body:    JSON.stringify({ events: pending }),
        });
    } catch {
        return null; // offline
    }

    if (!resp.ok) return null;

    const data = await resp.json();
    await markSynced(data.results);
    return data;
}

/**
 * Warm the local part cache from the server.
 * Stores each part under its ID for O(1) barcode lookups.
 */
export async function warmCache(plantId, authHeaders = {}) {
    let resp;
    try {
        resp = await fetch(`/api/offline/receiving-cache`, {
            headers: { 'x-plant-id': plantId, ...authHeaders },
        });
    } catch {
        return false;
    }
    if (!resp.ok) return false;

    const { parts = [], openPOs = [] } = await resp.json();
    const db = await openDB();

    await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_CACHE, 'readwrite');
        tx.oncomplete = resolve;
        tx.onerror    = () => reject(tx.error);
        const store   = tx.objectStore(STORE_CACHE);
        store.clear();
        for (const p of parts) store.put({ id: p.ID, ...p });
        // Store POs under a synthetic key
        store.put({ id: '__openPOs', pos: openPOs });
    });

    return true;
}

/** Look up a part by barcode (Part.ID or Descript match) from local cache. */
export async function lookupPart(barcode) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(STORE_CACHE, 'readonly');
        const req = tx.objectStore(STORE_CACHE).get(barcode);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror   = () => reject(req.error);
    });
}

/** Return the cached open PO list. */
export async function getCachedPOs() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(STORE_CACHE, 'readonly');
        const req = tx.objectStore(STORE_CACHE).get('__openPOs');
        req.onsuccess = () => resolve(req.result?.pos || []);
        req.onerror   = () => reject(req.error);
    });
}

/** True when the browser believes it has network connectivity. */
export function isOnline() {
    return navigator.onLine;
}

/**
 * Register auto-sync: fires sync() whenever the browser goes online.
 * Returns a cleanup function to remove the listener.
 */
export function registerAutoSync(plantId, onSyncComplete, authHeaders = {}) {
    const handler = async () => {
        const result = await sync(plantId, authHeaders);
        if (result && onSyncComplete) onSyncComplete(result);
    };
    window.addEventListener('online', handler);
    return () => window.removeEventListener('online', handler);
}
