// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Offline Database (IndexedDB Wrapper)
 * ====================================================
 * Provides persistent client-side storage for offline operation.
 * Caches work orders, assets, parts, PM schedules, and contacts.
 * Manages a sync queue for offline writes.
 */

const DB_NAME = 'TrierCMMS_Offline';
const DB_VERSION = 3;

// Store names
const STORES = {
    WORK_ORDERS: 'work_orders',
    ASSETS: 'assets',
    PARTS: 'parts',
    PM_SCHEDULES: 'pm_schedules',
    CONTACTS: 'contacts',
    WORK_SEGMENTS: 'work_segments',
    SYNC_QUEUE: 'sync_queue',
    META: 'meta'
};

let dbInstance = null;

/**
 * Open or create the IndexedDB database
 */
function openDB() {
    if (dbInstance) return Promise.resolve(dbInstance);

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // Work Orders store
            if (!db.objectStoreNames.contains(STORES.WORK_ORDERS)) {
                const woStore = db.createObjectStore(STORES.WORK_ORDERS, { keyPath: '_id' });
                woStore.createIndex('status', 'StatusID', { unique: false });
                woStore.createIndex('priority', 'Priority', { unique: false });
            }

            // Assets store
            if (!db.objectStoreNames.contains(STORES.ASSETS)) {
                db.createObjectStore(STORES.ASSETS, { keyPath: '_id' });
            }

            // Parts store
            if (!db.objectStoreNames.contains(STORES.PARTS)) {
                db.createObjectStore(STORES.PARTS, { keyPath: '_id' });
            }

            // PM Schedules store
            if (!db.objectStoreNames.contains(STORES.PM_SCHEDULES)) {
                db.createObjectStore(STORES.PM_SCHEDULES, { keyPath: '_id' });
            }

            // Contacts/Vendors store
            if (!db.objectStoreNames.contains(STORES.CONTACTS)) {
                db.createObjectStore(STORES.CONTACTS, { keyPath: '_id' });
            }

            // Work Segments — active labor segments per tech per WO
            if (!db.objectStoreNames.contains(STORES.WORK_SEGMENTS)) {
                const segStore = db.createObjectStore(STORES.WORK_SEGMENTS, { keyPath: '_id' });
                segStore.createIndex('woId', 'woId', { unique: false });
                segStore.createIndex('userId', 'userId', { unique: false });
                segStore.createIndex('state', 'segmentState', { unique: false });
            }

            // Sync Queue — offline writes waiting to replay
            if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
                const syncStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id' });
                syncStore.createIndex('synced', 'synced', { unique: false });
                syncStore.createIndex('timestamp', 'timestamp', { unique: false });
            }

            // Meta store — timestamps, user info
            if (!db.objectStoreNames.contains(STORES.META)) {
                db.createObjectStore(STORES.META, { keyPath: 'key' });
            }
        };

        request.onsuccess = () => {
            dbInstance = request.result;
            resolve(dbInstance);
        };
    });
}

/**
 * Generic: Put multiple records into a store (bulk upsert)
 */
async function putAll(storeName, records) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        let count = 0;
        records.forEach(record => {
            store.put(record);
            count++;
        });
        tx.oncomplete = () => resolve(count);
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * Generic: Get all records from a store
 */
async function getAll(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Generic: Get a single record by key
 */
async function getByKey(storeName, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const request = tx.objectStore(storeName).get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Generic: Delete a record by key
 */
async function deleteByKey(storeName, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * Clear all records from a store
 */
async function clearStore(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Data Caching — Fetch from server and store in IndexedDB
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Cache work orders from the server
 */
async function cacheWorkOrders() {
    try {
        const res = await fetch('/api/work-orders');
        if (!res.ok) return { cached: 0 };
        const data = await res.json();
        const records = (Array.isArray(data) ? data : data.workOrders || [])
            .map(r => ({ ...r, _id: r.ID || r.WorkOrderNumber || r.id || String(Math.random()) }));
        const count = await putAll(STORES.WORK_ORDERS, records);
        return { cached: count };
    } catch (e) {
        console.warn('[OfflineDB] Failed to cache work orders:', e.message);
        return { cached: 0, error: e.message };
    }
}

/**
 * Cache assets from the server
 */
async function cacheAssets() {
    try {
        const res = await fetch('/api/assets');
        if (!res.ok) return { cached: 0 };
        const data = await res.json();
        const records = (Array.isArray(data) ? data : [])
            .map(r => ({ ...r, _id: r.ID || r.id || String(Math.random()) }));
        const count = await putAll(STORES.ASSETS, records);
        return { cached: count };
    } catch (e) {
        console.warn('[OfflineDB] Failed to cache assets:', e.message);
        return { cached: 0, error: e.message };
    }
}

/**
 * Cache parts/inventory from the server
 */
async function cacheParts() {
    try {
        const res = await fetch('/api/parts');
        if (!res.ok) return { cached: 0 };
        const data = await res.json();
        const records = (Array.isArray(data) ? data : [])
            .map(r => ({ ...r, _id: r.ID || r.PartNumber || r.id || String(Math.random()) }));
        const count = await putAll(STORES.PARTS, records);
        return { cached: count };
    } catch (e) {
        console.warn('[OfflineDB] Failed to cache parts:', e.message);
        return { cached: 0, error: e.message };
    }
}

/**
 * Cache PM schedules from the server
 */
async function cachePMSchedules() {
    try {
        const res = await fetch('/api/pm-schedules');
        if (!res.ok) return { cached: 0 };
        const data = await res.json();
        const records = (Array.isArray(data) ? data : [])
            .map(r => ({ ...r, _id: r.ID || r.id || String(Math.random()) }));
        const count = await putAll(STORES.PM_SCHEDULES, records);
        return { cached: count };
    } catch (e) {
        console.warn('[OfflineDB] Failed to cache PM schedules:', e.message);
        return { cached: 0, error: e.message };
    }
}

/**
 * Cache contacts/vendors from the server
 */
async function cacheContacts() {
    try {
        const res = await fetch('/api/contacts');
        if (!res.ok) return { cached: 0 };
        const data = await res.json();
        const records = (Array.isArray(data) ? data : [])
            .map(r => ({ ...r, _id: r.ID || r.id || String(Math.random()) }));
        const count = await putAll(STORES.CONTACTS, records);
        return { cached: count };
    } catch (e) {
        console.warn('[OfflineDB] Failed to cache contacts:', e.message);
        return { cached: 0, error: e.message };
    }
}

/**
 * Cache active work segments — used for offline multi-tech branch prediction
 */
async function cacheWorkSegments() {
    try {
        const res = await fetch('/api/scan/active-segments');
        if (!res.ok) return { cached: 0 };
        const data = await res.json();
        const records = (data.segments || [])
            .map(r => ({ ...r, _id: r.segmentId }));
        await clearStore(STORES.WORK_SEGMENTS);
        const count = await putAll(STORES.WORK_SEGMENTS, records);
        return { cached: count };
    } catch (e) {
        console.warn('[OfflineDB] Failed to cache work segments:', e.message);
        return { cached: 0, error: e.message };
    }
}

// Fetch WorkStatuses from server and persist as meta.statusMap
async function cacheStatusMap() {
    const res = await fetch('/api/config/statuses');
    if (!res.ok) return;
    const data = await res.json();
    await setMeta('statusMap', { activeIds: data.activeIds, waitingIds: data.waitingIds });
}

// Returns { activeIds, waitingIds } from cache, with hardcoded fallback
async function getStatusIds() {
    const cached = await getMeta('statusMap').catch(() => null);
    if (cached?.activeIds?.length) return cached;
    return { activeIds: [20, 30], waitingIds: [31, 32, 35] };
}

/**
 * Full cache refresh — runs on login and every 15 minutes
 * @param {function} onProgress - Optional callback(percent, message)
 */
async function fullCacheRefresh(onProgress) {
    const steps = [
        { fn: cacheWorkOrders, label: 'Work Orders', store: STORES.WORK_ORDERS },
        { fn: cacheAssets, label: 'Assets', store: STORES.ASSETS },
        { fn: cacheParts, label: 'Parts & Inventory', store: STORES.PARTS },
        { fn: cachePMSchedules, label: 'PM Schedules', store: STORES.PM_SCHEDULES },
        { fn: cacheContacts, label: 'Contacts', store: STORES.CONTACTS },
        { fn: cacheWorkSegments, label: 'Active Segments', store: STORES.WORK_SEGMENTS },
    ];

    const results = {};
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const pct = Math.round(((i) / steps.length) * 100);
        if (onProgress) onProgress(pct, `Caching ${step.label}...`);

        try {
            const result = await step.fn();
            results[step.store] = result;
        } catch (e) {
            results[step.store] = { cached: 0, error: e.message };
        }
    }

    // Cache WorkStatuses so predictBranch uses real IDs, not hardcoded constants
    await cacheStatusMap().catch(() => {});

    // Save sync timestamp
    await setMeta('lastSync', new Date().toISOString());
    await setMeta('plantId', localStorage.getItem('selectedPlantId') || 'unknown');
    await setMeta('user', localStorage.getItem('currentUser') || 'unknown');

    if (onProgress) onProgress(100, 'Cache complete');
    console.log('[OfflineDB] Full cache refresh complete:', results);
    return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sync Queue — Store offline writes for later replay
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Add a write operation to the sync queue
 */
async function queueWrite(method, endpoint, payload) {
    const entry = {
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        method,
        endpoint,
        payload,
        timestamp: new Date().toISOString(),
        synced: false,
        syncResult: null,
        retries: 0
    };
    await putAll(STORES.SYNC_QUEUE, [entry]);
    console.log('[OfflineDB] Queued offline write:', method, endpoint);
    return entry;
}

/**
 * Get all pending (unsynced) writes
 */
async function getPendingWrites() {
    const all = await getAll(STORES.SYNC_QUEUE);
    // Skip hub-submitted entries — the hub owns replay for those scans
    return all
        .filter(e => !e.synced && e.syncResult !== 'hub-submitted')
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

// Mark a queued scan as hub-owned so replayQueue won't double-submit it
async function markHubSubmitted(scanId) {
    const all = await getAll(STORES.SYNC_QUEUE);
    const entry = all.find(e => e.payload?.scanId === scanId);
    if (!entry) return;
    entry.syncResult = 'hub-submitted';
    await putAll(STORES.SYNC_QUEUE, [entry]);
}

// Called when SERVER_ONLINE fires — hub has already replayed these, clean up
async function clearHubSubmitted() {
    const all = await getAll(STORES.SYNC_QUEUE);
    const done = all.filter(e => e.syncResult === 'hub-submitted');
    if (done.length > 0) {
        await putAll(STORES.SYNC_QUEUE, done.map(e => ({ ...e, synced: true })));
    }
}

/**
 * Get pending write count
 */
async function getPendingCount() {
    const pending = await getPendingWrites();
    return pending.length;
}

/**
 * Replay all pending writes to the server
 * @returns {{ sent: number, failed: number, conflicts: number }}
 */
async function replayQueue(onProgress) {
    const pending = await getPendingWrites();
    if (pending.length === 0) return { sent: 0, failed: 0, conflicts: 0 };

    let sent = 0, failed = 0, conflicts = 0;

    for (let i = 0; i < pending.length; i++) {
        const entry = pending[i];
        if (onProgress) onProgress(i + 1, pending.length, entry);

        try {
            const res = await fetch(entry.endpoint, {
                method: entry.method,
                headers: { 'Content-Type': 'application/json' },
                body: entry.payload ? JSON.stringify(entry.payload) : undefined
            });

            if (res.ok) {
                entry.synced = true;
                entry.syncResult = 'success';
                sent++;
            } else if (res.status === 401) {
                // Session cookie expired during the drain. The scan data is valid —
                // only the auth state is stale. Do NOT mark this item or any remaining
                // items as failed. Flush already-synced items, then halt and return
                // so the caller can prompt re-auth and resume.
                const partialAll = await getAll(STORES.SYNC_QUEUE);
                for (const e of partialAll) {
                    if (e.synced) await deleteByKey(STORES.SYNC_QUEUE, e.id);
                }
                console.warn(`[OfflineDB] Drain halted on 401 at item ${i}. ${pending.length - i} items preserved.`);
                return {
                    authExpired:    true,
                    processedCount: i,
                    remainingCount: pending.length - i,
                    sent, failed, conflicts,
                    total: pending.length,
                };
            } else if (res.status === 409) {
                entry.syncResult = 'conflict';
                conflicts++;
            } else {
                entry.retries++;
                entry.syncResult = `error-${res.status}`;
                if (entry.retries >= 3) {
                    entry.syncResult = 'failed-permanently';
                }
                failed++;
            }
        } catch (e) {
            entry.retries++;
            entry.syncResult = 'network-error';
            failed++;
        }

        await putAll(STORES.SYNC_QUEUE, [entry]);
    }

    // Clean up successful syncs
    const all = await getAll(STORES.SYNC_QUEUE);
    for (const entry of all) {
        if (entry.synced) {
            await deleteByKey(STORES.SYNC_QUEUE, entry.id);
        }
    }

    // Persist error details so OfflineStatusBar can surface them for review
    if (failed > 0 || conflicts > 0) {
        const errors = pending
            .filter(e => e.syncResult && e.syncResult !== 'success')
            .map(({ id, endpoint, payload, syncResult, timestamp }) => ({
                id,
                endpoint,
                scanId:   payload?.scanId   || null,
                assetId:  payload?.assetId  || null,
                syncResult,
                timestamp,
            }));
        await setMeta('syncErrors', errors);
    }

    return { sent, failed, conflicts, total: pending.length };
}

// Returns the error list persisted by the last replayQueue run.
// OfflineStatusBar reads this to populate the review panel without
// needing to re-run the replay or keep the errors in React state.
async function getSyncErrors() {
    return (await getMeta('syncErrors')) || [];
}

// Clears the stored error list once the user has reviewed and dismissed it,
// so the review panel doesn't reappear on the next offline→online cycle.
async function clearSyncErrors() {
    await setMeta('syncErrors', []);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Meta Store — Timestamps, user info
// ═══════════════════════════════════════════════════════════════════════════════

async function setMeta(key, value) {
    await putAll(STORES.META, [{ key, value }]);
}

async function getMeta(key) {
    const record = await getByKey(STORES.META, key);
    return record ? record.value : null;
}

// ── Device-bound HMAC helpers (C3) ───────────────────────────────────────────
// The device secret lives only in IndexedDB — never in localStorage — so it
// cannot be read or forged by code that only has localStorage access.  This
// asymmetry is what makes the HMAC tamper-evident: an attacker who modifies
// userRole in localStorage cannot regenerate the matching signature without
// the secret stored in the separate IDB store.

// Generates a 256-bit random secret on first call; returns the cached value
// on every subsequent call.  One secret per browser profile / origin.
async function getDeviceSecret() {
    let secret = await getMeta('_deviceSecret');
    if (!secret) {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        secret = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
        await setMeta('_deviceSecret', secret);
    }
    return secret;
}

// Signs an arbitrary string with the device secret using HMAC-SHA-256.
// Returns a lowercase hex digest suitable for localStorage storage.
async function hmacSign(data) {
    const secret   = await getDeviceSecret();
    const key      = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig      = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Verifies a hex HMAC signature produced by hmacSign.  Returns true only when
// the data and secret both match — constant-time comparison via SubtleCrypto.
async function hmacVerify(data, hexSig) {
    const secret   = await getDeviceSecret();
    const key      = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    // Convert hex string back to Uint8Array for SubtleCrypto verify
    const sigBytes = new Uint8Array(hexSig.match(/.{2}/g).map(b => parseInt(b, 16)));
    return crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(data));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Offline Branch Prediction
// ═══════════════════════════════════════════════════════════════════════════════

async function predictBranch(assetId, currentUserId) {
    // Use cached status IDs rather than hardcoded constants so the branch
    // logic stays accurate even if the plant's WorkStatuses table is customised.
    const { activeIds, waitingIds } = await getStatusIds();
    const allWos = await getAll(STORES.WORK_ORDERS);
    const assetWos = allWos.filter(w => String(w.AstID) === String(assetId));

    const activeWo = assetWos
        .filter(w => activeIds.includes(Number(w.StatusID)))
        .sort((a, b) => (b.ID || 0) - (a.ID || 0))[0];

    if (activeWo) {
        const allSegments = await getAll(STORES.WORK_SEGMENTS);
        const woSegments = allSegments.filter(
            s => String(s.woId) === String(activeWo.ID) && s.segmentState === 'Active'
        );
        const mySegment = currentUserId
            ? woSegments.find(s => s.userId === currentUserId)
            : null;
        const otherSegments = currentUserId
            ? woSegments.filter(s => s.userId !== currentUserId)
            : woSegments;

        let context, options;
        if (mySegment && otherSegments.length > 0) {
            context = 'MULTI_TECH';
            options = ['LEAVE_WORK', 'TEAM_CLOSE', 'WAITING', 'ESCALATE', 'CONTINUE_LATER'];
        } else if (!mySegment && otherSegments.length > 0) {
            context = 'OTHER_USER_ACTIVE';
            options = ['JOIN', 'TAKE_OVER', 'ESCALATE'];
        } else {
            context = 'RESUMED_NO_SEGMENT';
            options = ['CLOSE_WO', 'WAITING', 'ESCALATE', 'CONTINUE_LATER'];
        }

        return {
            branch: 'ROUTE_TO_ACTIVE_WO',
            context,
            wo: {
                id: activeWo.WorkOrderNumber,
                number: activeWo.WorkOrderNumber,
                description: activeWo.Description,
            },
            activeUsers: otherSegments.map(s => s.userId),
            options,
            _offlinePredicted: true,
        };
    }

    const waitingWo = assetWos
        .filter(w => waitingIds.includes(Number(w.StatusID)))
        .sort((a, b) => (b.ID || 0) - (a.ID || 0))[0];

    if (waitingWo) {
        return {
            branch: 'ROUTE_TO_WAITING_WO',
            wo: {
                id: waitingWo.WorkOrderNumber,
                number: waitingWo.WorkOrderNumber,
                description: waitingWo.Description,
                holdReason: waitingWo.holdReason,
                returnAt: waitingWo.returnAt,
            },
            options: ['RESUME_WAITING_WO', 'CREATE_NEW_WO', 'VIEW_STATUS'],
            _offlinePredicted: true,
        };
    }

    const assets = await getAll(STORES.ASSETS);
    const asset = assets.find(a => String(a.ID) === String(assetId));
    if (!asset) {
        return { branch: 'ASSET_NOT_FOUND', error: 'Asset not in offline cache', _offlinePredicted: true };
    }

    return {
        branch: 'AUTO_CREATE_WO',
        message: 'Work Started',
        wo: { description: asset.Description },
        _offlinePredicted: true,
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Connectivity Monitoring
// ═══════════════════════════════════════════════════════════════════════════════

let isOnline = navigator.onLine;
let onStatusChange = null;

/**
 * Start monitoring connectivity
 * @param {function} callback - Called with (isOnline: boolean)
 */
function startConnectivityMonitor(callback) {
    onStatusChange = callback;

    window.addEventListener('online', () => {
        isOnline = true;
        console.log('[OfflineDB] 🟢 Back online');
        if (onStatusChange) onStatusChange(true);
    });

    window.addEventListener('offline', () => {
        isOnline = false;
        console.log('[OfflineDB] 🔴 Gone offline');
        if (onStatusChange) onStatusChange(false);
    });

    // Also poll the server every 30 seconds as a fallback
    setInterval(async () => {
        try {
            const res = await fetch('/api/ping', { 
                method: 'GET',
                cache: 'no-store',
                signal: AbortSignal.timeout ? AbortSignal.timeout(3000) : undefined
            });
            const wasOffline = !isOnline;
            isOnline = res.ok;
            if (wasOffline && isOnline && onStatusChange) {
                onStatusChange(true);
            }
        } catch {
            const wasOnline = isOnline;
            isOnline = false;
            if (wasOnline && onStatusChange) {
                onStatusChange(false);
            }
        }
    }, 30000);

    return () => isOnline;
}

function getOnlineStatus() {
    return isOnline;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Export
// ═══════════════════════════════════════════════════════════════════════════════

export default {
    STORES,
    openDB,
    putAll,
    getAll,
    getByKey,
    deleteByKey,
    clearStore,
    // Data caching
    fullCacheRefresh,
    cacheStatusMap,
    getStatusIds,
    cacheWorkOrders,
    cacheAssets,
    cacheParts,
    cachePMSchedules,
    cacheContacts,
    cacheWorkSegments,
    // Sync queue
    queueWrite,
    getPendingWrites,
    getPendingCount,
    replayQueue,
    markHubSubmitted,
    clearHubSubmitted,
    // Offline branch prediction
    predictBranch,
    // Meta
    setMeta,
    getMeta,
    // Sync error review (M3)
    getSyncErrors,
    clearSyncErrors,
    // Device-bound HMAC auth (C3)
    getDeviceSecret,
    hmacSign,
    hmacVerify,
    // Connectivity
    startConnectivityMonitor,
    getOnlineStatus
};
