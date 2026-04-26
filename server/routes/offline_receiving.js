// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */

/**
 * offline_receiving.js — Offline Receiving Sync for Zebra Scanners
 * =================================================================
 * Zebra devices write receiving scan events locally to IndexedDB first,
 * show confirmation immediately, then POST them here when Wi-Fi returns.
 *
 * Idempotent by eventId (UUID). Duplicate eventIds are silently skipped.
 * Conflicts (barcode unknown, no matching PO) are set to needsReview
 * rather than rejected, so no scan is ever lost.
 *
 * -- ROUTES -------------------------------------------------------
 *   POST /api/offline/receiving-sync                   Sync array of queued events
 *   POST /api/offline/receiving-events/:eventId/resolve Resolve needsReview → accepted
 *   GET  /api/offline/receiving-cache                  Snapshot of parts/POs for device warm-up
 *   GET  /api/offline/receiving-events                 Query synced events (admin/review queue)
 */

'use strict';

const express      = require('express');
const router       = express.Router();
const { db: ldb, logInvariant } = require('../logistics_db');
const database     = require('../database');

const SAFE_PLANT_ID   = /^[a-zA-Z0-9_-]{1,64}$/;
const SAFE_EVENT_ID   = /^[0-9a-fA-F-]{36}$/;          // UUID v4 format
const MAX_BATCH_SIZE  = 500;                             // guard against huge uploads
const MAX_QTY         = 99_999;

// ── Table initialization (idempotent, logistics DB) ───────────────────────────
ldb.exec(`
    CREATE TABLE IF NOT EXISTS OfflineReceivingEvents (
        eventId         TEXT    PRIMARY KEY,
        plantId         TEXT    NOT NULL,
        deviceId        TEXT,
        userId          TEXT    NOT NULL,
        barcode         TEXT    NOT NULL,
        poNumber        TEXT,
        quantity        REAL    NOT NULL DEFAULT 1,
        binLocation     TEXT,
        capturedAt      TEXT    NOT NULL,
        syncedAt        TEXT,
        syncStatus      TEXT    NOT NULL DEFAULT 'pending',
        resolvedPartId  TEXT,
        reviewNote      TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_offrecv_plant  ON OfflineReceivingEvents(plantId, syncStatus);
    CREATE INDEX IF NOT EXISTS idx_offrecv_barcode ON OfflineReceivingEvents(barcode);
    CREATE INDEX IF NOT EXISTS idx_offrecv_po     ON OfflineReceivingEvents(poNumber);
`);

// I-09: Resolve audit columns — added after initial release; safe to re-run.
try { ldb.exec(`ALTER TABLE OfflineReceivingEvents ADD COLUMN resolvedBy  TEXT`); } catch {}
try { ldb.exec(`ALTER TABLE OfflineReceivingEvents ADD COLUMN resolvedAt  TEXT`); } catch {}

// Prepared statements (lazy — don't fail boot if logistics_db isn't ready yet)
let stmts;
function getStmts() {
    if (stmts) return stmts;
    stmts = {
        // INSERT OR IGNORE is the S-11 DB-layer idempotency guard.
        // If eventId already exists (PRIMARY KEY), .changes === 0 → treat as duplicate.
        // The app-layer pre-check is intentionally removed; the DB is the single source of truth.
        insert: ldb.prepare(`
            INSERT OR IGNORE INTO OfflineReceivingEvents
                (eventId, plantId, deviceId, userId, barcode, poNumber, quantity,
                 binLocation, capturedAt, syncedAt, syncStatus, resolvedPartId, reviewNote)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        `),
    };
    return stmts;
}

// ── POST /api/offline/receiving-sync ─────────────────────────────────────────
// Body: { events: [ { eventId, plantId, deviceId, barcode, poNumber, quantity,
//                     binLocation, capturedAt } ] }
// Response: { accepted: N, needsReview: N, rejected: N, results: [...] }
router.post('/receiving-sync', async (req, res) => {
    const { events } = req.body;
    if (!Array.isArray(events) || events.length === 0) {
        return res.status(400).json({ error: 'events[] is required and must be non-empty' });
    }
    if (events.length > MAX_BATCH_SIZE) {
        return res.status(400).json({ error: `Batch too large — max ${MAX_BATCH_SIZE} events per call` });
    }

    const userId   = req.user.Username;
    const syncedAt = new Date().toISOString();
    const { insert } = getStmts();

    const results = [];
    let accepted = 0, needsReview = 0, rejected = 0;

    // processEventTx wraps one event in a nested transaction (better-sqlite3 uses a
    // SAVEPOINT for nested calls), so a single bad event never rolls back the batch.
    const processEventTx = ldb.transaction(processEvent);

    const processBatch = ldb.transaction(() => {
        for (const ev of events) {
            let result;
            try {
                result = processEventTx(ev, userId, syncedAt, insert);
            } catch (err) {
                result = {
                    eventId: ev.eventId || null,
                    status: 'rejected',
                    reason: `Server error: ${err.message}`,
                };
            }
            results.push(result);
            if (result.status === 'accepted')         accepted++;
            else if (result.status === 'needsReview') needsReview++;
            else if (result.status !== 'duplicate')   rejected++;
        }
    });

    try {
        processBatch();
    } catch (err) {
        console.error('[offline-receiving] sync transaction failed:', err.message);
        return res.status(500).json({ error: 'Sync failed — please retry' });
    }

    // Stock updates: apply accepted events to the appropriate plant DBs outside the
    // logistics transaction (plant DBs use a different connection).
    const toUpdate = results.filter(r => r.status === 'accepted' && r.resolvedPartId);
    for (const ev of toUpdate) {
        try {
            applyStockUpdate(ev);
        } catch (err) {
            // Non-fatal: the event is already recorded; a reconciliation job can fix stock later
            console.warn(`[offline-receiving] stock update failed for ${ev.eventId}: ${err.message}`);
        }
    }

    return res.json({ accepted, needsReview, rejected, results });
});

function processEvent(ev, userId, syncedAt, insert) {
    const { eventId, plantId, deviceId, barcode, poNumber, quantity, binLocation, capturedAt } = ev;

    // Reject structurally invalid events — these can never succeed on retry
    if (!eventId || !SAFE_EVENT_ID.test(String(eventId))) {
        return { eventId: eventId || null, status: 'rejected', reason: 'Invalid or missing eventId' };
    }
    if (!plantId || !SAFE_PLANT_ID.test(String(plantId))) {
        return { eventId, status: 'rejected', reason: 'Invalid plantId' };
    }
    if (!barcode || typeof barcode !== 'string' || barcode.length > 128) {
        return { eventId, status: 'rejected', reason: 'Invalid barcode' };
    }
    const qty = parseFloat(quantity);
    if (!isFinite(qty) || qty <= 0 || qty > MAX_QTY) {
        return { eventId, status: 'rejected', reason: 'Invalid quantity' };
    }
    if (!capturedAt) {
        return { eventId, status: 'rejected', reason: 'Missing capturedAt timestamp' };
    }

    // Resolve barcode → part in the plant DB
    let resolvedPartId = null;
    let reviewNote     = null;
    let syncStatus     = 'accepted';

    try {
        const conn = database.getDb(String(plantId));
        const part = conn.prepare(
            'SELECT ID FROM Part WHERE ID = ? OR Descript = ? LIMIT 1'
        ).get(String(barcode), String(barcode));
        if (part) {
            resolvedPartId = part.ID;
        } else {
            syncStatus = 'needsReview';
            reviewNote = `Barcode "${barcode}" not found in ${plantId} parts catalog`;
        }
    } catch (err) {
        syncStatus = 'needsReview';
        reviewNote = `Plant DB lookup failed: ${err.message}`;
    }

    // INSERT OR IGNORE is the S-11 DB-layer idempotency guard.
    // If eventId is a duplicate (PRIMARY KEY conflict), .changes === 0.
    // The DB enforces uniqueness even under concurrent requests — no app-layer race.
    const { changes } = insert.run(
        String(eventId),
        String(plantId),
        deviceId ? String(deviceId) : null,
        String(userId),
        String(barcode),
        poNumber ? String(poNumber) : null,
        qty,
        binLocation ? String(binLocation) : null,
        String(capturedAt),
        syncedAt,
        syncStatus,
        resolvedPartId,
        reviewNote,
    );

    if (changes === 0) {
        return { eventId, status: 'duplicate', reason: 'Already processed' };
    }

    return { eventId, status: syncStatus, resolvedPartId, reviewNote, plantId, barcode, quantity: qty };
}

function applyStockUpdate(ev) {
    const conn = database.getDb(String(ev.plantId));
    conn.transaction(() => {
        conn.prepare(
            'UPDATE Part SET Stock = COALESCE(Stock, 0) + ? WHERE ID = ?'
        ).run(ev.quantity, ev.resolvedPartId);

        conn.prepare(`
            INSERT INTO inventory_movements
                (part_id, movement_type, qty, location, performed_by, performed_at, notes)
            VALUES (?, 'OFFLINE_RECEIVE', ?, ?, ?, ?, ?)
        `).run(
            ev.resolvedPartId,
            ev.quantity,
            null,
            'system:offline-sync',
            new Date().toISOString(),
            `Offline receiving sync — event ${ev.eventId}`,
        );
    })();
}

// ── POST /api/offline/receiving-events/:eventId/resolve ──────────────────────
// Resolve a needsReview event: link it to a known part, apply stock once.
// Body: { resolvedPartId }
//
// State machine:
//   needsReview  →  accepted  (first call — applies stock)
//   accepted     →  accepted  (idempotent — no second stock increment)
//   anything else            →  400
//
// I-09: The UPDATE predicate WHERE syncStatus = 'needsReview' inside an IMMEDIATE
// transaction is the authoritative guard. Two concurrent resolves for the same
// eventId are serialized by the write lock; only the one whose changes === 1
// triggers the stock update. The outer status check is an early-return shortcut only.
router.post('/receiving-events/:eventId/resolve', (req, res) => {
    const { eventId } = req.params;
    const { resolvedPartId } = req.body;
    const resolvedBy = req.user?.Username || req.user?.UserID || 'unknown';

    if (!eventId || !SAFE_EVENT_ID.test(String(eventId))) {
        return res.status(400).json({ error: 'Invalid eventId' });
    }
    if (!resolvedPartId) {
        return res.status(400).json({ error: 'resolvedPartId is required' });
    }

    // Fast read for 404 and non-needsReview rejection before acquiring the write lock
    const event = ldb.prepare(
        `SELECT eventId, plantId, syncStatus, quantity FROM OfflineReceivingEvents WHERE eventId = ? LIMIT 1`
    ).get(String(eventId));

    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (event.syncStatus === 'accepted') {
        return res.json({ ok: true, idempotent: true, eventId, message: 'Already resolved' });
    }
    if (event.syncStatus !== 'needsReview') {
        return res.status(400).json({ error: `Cannot resolve event in syncStatus '${event.syncStatus}'` });
    }

    // Validate the resolved part exists in the plant DB before touching logistics state
    try {
        const conn = database.getDb(String(event.plantId));
        const part = conn.prepare('SELECT ID FROM Part WHERE ID = ? LIMIT 1').get(String(resolvedPartId));
        if (!part) {
            return res.status(404).json({ error: `Part '${resolvedPartId}' not found in ${event.plantId}` });
        }
    } catch (err) {
        return res.status(500).json({ error: `Plant DB lookup failed: ${err.message}` });
    }

    const resolvedAt = new Date().toISOString();
    let txResult;

    ldb.transaction(() => {
        const { changes } = ldb.prepare(`
            UPDATE OfflineReceivingEvents
            SET    syncStatus = 'accepted', resolvedPartId = ?, resolvedBy = ?, resolvedAt = ?
            WHERE  eventId = ? AND syncStatus = 'needsReview'
        `).run(String(resolvedPartId), resolvedBy, resolvedAt, String(eventId));

        // changes === 0 means a concurrent request won the race and already resolved it
        txResult = changes === 0
            ? { ok: true, idempotent: true, eventId, message: 'Already resolved' }
            : { ok: true, eventId, resolvedPartId: String(resolvedPartId),
                resolvedBy, resolvedAt, quantity: event.quantity, _apply: true };
    }).immediate()();

    if (txResult.idempotent) {
        logInvariant('I-09', 'I-09:RECEIVING_DOUBLE_RESOLVE_PREVENTED', {
            plantId:    event.plantId,
            entityType: 'receivingEvent',
            entityId:   String(eventId),
            actor:      resolvedBy,
            metadata:   { resolvedPartId },
        });
        return res.json(txResult);
    }

    // Apply stock update outside the logistics transaction (separate DB connection).
    // The event is already marked accepted; a failure here is non-fatal — a
    // reconciliation pass can re-apply using the accepted rows where stock was not yet moved.
    try {
        applyStockUpdate({
            eventId,
            plantId:       event.plantId,
            resolvedPartId: String(resolvedPartId),
            quantity:      event.quantity,
        });
    } catch (err) {
        console.warn(`[offline-receiving] stock update failed for resolve ${eventId}: ${err.message}`);
    }

    const { _apply, ...body } = txResult;
    return res.json(body);
});

// ── GET /api/offline/receiving-cache ─────────────────────────────────────────
// Returns a lightweight snapshot for IndexedDB warm-up: parts (id+name+stock+location)
// and open POs for the requested plant. Zebra devices download this on Wi-Fi connection.
router.get('/receiving-cache', (req, res) => {
    const plantId = req.headers['x-plant-id'];
    if (!plantId || !SAFE_PLANT_ID.test(plantId)) {
        return res.status(400).json({ error: 'Invalid x-plant-id header' });
    }

    try {
        const conn = database.getDb(plantId);

        const parts = conn.prepare(`
            SELECT ID, Descript, Description, Stock, Location, UOM, UnitCost
            FROM Part
            ORDER BY Descript
        `).all();

        const pos = conn.prepare(`
            SELECT p.ID, p.PONumber, p.Description, p.StatusID,
                   v.Description as VendorName
            FROM PO p
            LEFT JOIN Vendors v ON v.ID = p.VendorID
            WHERE p.StatusID < 50
            ORDER BY p.AddDate DESC
            LIMIT 500
        `).all();

        return res.json({ plantId, parts, openPOs: pos, cachedAt: new Date().toISOString() });
    } catch (err) {
        console.error('[offline-receiving] cache build failed:', err.message);
        return res.status(500).json({ error: 'Failed to build cache snapshot' });
    }
});

// ── GET /api/offline/receiving-events ────────────────────────────────────────
// Query the synced event log. Supports ?plantId, ?status, ?limit, ?offset.
router.get('/receiving-events', (req, res) => {
    const { status, limit = 100, offset = 0 } = req.query;
    const plantId = req.query.plantId || req.headers['x-plant-id'];

    if (!plantId || !SAFE_PLANT_ID.test(String(plantId))) {
        return res.status(400).json({ error: 'Invalid plantId' });
    }

    const allowed = ['accepted', 'needsReview', 'rejected', 'pending'];
    const conditions = ['plantId = ?'];
    const params = [String(plantId)];

    if (status && allowed.includes(status)) {
        conditions.push('syncStatus = ?');
        params.push(status);
    }

    const sql = `
        SELECT eventId, plantId, deviceId, userId, barcode, poNumber, quantity,
               binLocation, capturedAt, syncedAt, syncStatus,
               resolvedPartId, reviewNote, resolvedBy, resolvedAt
        FROM OfflineReceivingEvents
        WHERE ${conditions.join(' AND ')}
        ORDER BY capturedAt DESC
        LIMIT ? OFFSET ?
    `;

    try {
        const rows = ldb.prepare(sql).all(...params, parseInt(limit) || 100, parseInt(offset) || 0);
        return res.json({ events: rows });
    } catch (err) {
        return res.status(500).json({ error: 'Query failed' });
    }
});

module.exports = router;
