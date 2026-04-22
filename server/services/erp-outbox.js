// Copyright © 2026 Trier OS. All Rights Reserved.
/**
 * Trier OS — ERP Write-Back Outbox Worker
 * ========================================
 * Queues events (WO close, part consumption, labor post) into trier_logistics.db
 * and drains them to the configured ERP endpoint via HTTP POST with exponential
 * back-off and a 5-attempt give-up cap.
 *
 * USAGE:
 *   const { insertOutboxEvent } = require('../services/erp-outbox');
 *   insertOutboxEvent(plantId, integrationId, 'wo_close', { woNumber, status, plantId });
 *   // Optional 5th argument: explicit idempotency key (overrides the default
 *   // derivation used for dedup).
 *
 * EVENT TYPES:
 *   wo_close      — Fired when a WO reaches StatusID 40/50 (Completed/Closed)
 *   part_consume  — Fired when a negative quantity adjustment is recorded
 *   labor_post    — Fired when actual hours are updated on a WO (future)
 *
 * IDEMPOTENCY (Audit 47 / H-4):
 *   Every queued event carries an IdempotencyKey derived from plant + event type
 *   + a natural discriminator (woNumber, partId + timestamp, etc.). A UNIQUE
 *   index on IdempotencyKey makes duplicate queues a silent no-op (INSERT OR
 *   IGNORE), and the same key is forwarded to the ERP as `X-Idempotency-Key`
 *   so downstream consumers can dedup on their side.
 *
 * DRAIN CYCLE (every 60 seconds):
 *   SELECT pending rows where NextRetryAt <= now()
 *   For each: POST JSON to ERP endpoint from PlantIntegrations config
 *   200 → mark Status='sent', SentAt=now()
 *   Failure → Attempts++, NextRetryAt = now + (2^Attempts * 60s)
 *   Attempts >= 5 → Status='failed', stop retrying
 */

'use strict';
const { db: logDb } = require('../logistics_db');

// ── Schema bootstrap ──────────────────────────────────────────────────────────
logDb.exec(`
    CREATE TABLE IF NOT EXISTS ERPOutbox (
        ID             INTEGER PRIMARY KEY AUTOINCREMENT,
        PlantID        TEXT NOT NULL,
        IntegrationID  TEXT NOT NULL DEFAULT 'erp',
        EventType      TEXT NOT NULL,
        Payload        TEXT NOT NULL,
        IdempotencyKey TEXT,
        Status         TEXT NOT NULL DEFAULT 'pending',
        Attempts       INTEGER DEFAULT 0,
        NextRetryAt    TEXT DEFAULT (datetime('now')),
        CreatedAt      TEXT DEFAULT (datetime('now')),
        SentAt         TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_outbox_status ON ERPOutbox(Status, NextRetryAt);
    CREATE INDEX IF NOT EXISTS idx_outbox_plant  ON ERPOutbox(PlantID);
`);

// Audit 47 / H-4: add IdempotencyKey to pre-existing deployments (idempotent —
// SQLite rejects the ADD COLUMN with "duplicate column name" on subsequent runs,
// which we catch and ignore).
try {
    logDb.exec(`ALTER TABLE ERPOutbox ADD COLUMN IdempotencyKey TEXT`);
} catch (e) { /* column already exists — safe to ignore */ }

// Backfill existing rows that lack a key so the upcoming UNIQUE index can be
// created without violating constraints. Rows where no discriminator is
// derivable remain NULL — SQLite treats NULLs as distinct in UNIQUE indexes,
// so they coexist.
try {
    const unkeyed = logDb.prepare(
        `SELECT ID, PlantID, EventType, Payload, CreatedAt FROM ERPOutbox WHERE IdempotencyKey IS NULL`
    ).all();
    if (unkeyed.length > 0) {
        const setKey = logDb.prepare(`UPDATE ERPOutbox SET IdempotencyKey = ? WHERE ID = ?`);
        const backfill = logDb.transaction(() => {
            for (const row of unkeyed) {
                let payload = {};
                try { payload = JSON.parse(row.Payload || '{}'); } catch { /* keep {} */ }
                // Include CreatedAt on legacy rows so two historical entries
                // that happened to share a discriminator (e.g., the same
                // wo_close queued twice before this fix shipped) get distinct
                // backfill keys instead of colliding on the new UNIQUE index.
                const k = deriveIdempotencyKey(row.PlantID, row.EventType, payload, row.CreatedAt);
                if (k) setKey.run(k, row.ID);
            }
        });
        backfill();
        console.log(`[ERP Outbox] Backfilled IdempotencyKey on ${unkeyed.length} existing row(s).`);
    }
} catch (e) {
    console.warn('[ERP Outbox] IdempotencyKey backfill skipped:', e.message);
}

// UNIQUE index supersedes a column-level UNIQUE so we can add it to an existing
// table without recreating the schema. NULL keys (events where no discriminator
// was derivable) are treated as distinct by SQLite, so they don't collide.
try {
    logDb.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_outbox_idempotency ON ERPOutbox(IdempotencyKey)`);
} catch (e) {
    console.warn('[ERP Outbox] Could not create UNIQUE index on IdempotencyKey — duplicate keys may exist:', e.message);
}

// ── Idempotency-key derivation ────────────────────────────────────────────────
// Returns a stable key for events with a natural discriminator; null otherwise.
// NULL keys are accepted by the UNIQUE index (SQLite NULL-distinct semantics)
// so unclassified events simply fall back to no-dedup, preserving old behavior.
function deriveIdempotencyKey(plantId, eventType, payload, legacyCreatedAt = null) {
    if (!plantId || !eventType) return null;
    if (eventType === 'wo_close' && payload?.woNumber) {
        return `${plantId}:wo_close:${payload.woNumber}${legacyCreatedAt ? ':' + legacyCreatedAt : ''}`;
    }
    if (eventType === 'part_consume' && payload?.partId) {
        // consumedAt is generated at call time in parts.js, so distinct real
        // consumptions have distinct timestamps. Retries of the same call do not.
        const ts = payload.consumedAt || legacyCreatedAt || '';
        return `${plantId}:part_consume:${payload.partId}:${ts}`;
    }
    if (eventType === 'labor_post' && payload?.woNumber) {
        const ts = payload.workDate || legacyCreatedAt || '';
        return `${plantId}:labor_post:${payload.woNumber}:${ts}`;
    }
    return null;
}

// ── Queue an event ────────────────────────────────────────────────────────────
function insertOutboxEvent(plantId, integrationId, eventType, payload, idempotencyKey = null) {
    try {
        const key = idempotencyKey || deriveIdempotencyKey(plantId, eventType, payload);
        // INSERT OR IGNORE makes a duplicate idempotency key a silent no-op.
        // The UNIQUE index on IdempotencyKey is the authoritative guard.
        const result = logDb.prepare(`
            INSERT OR IGNORE INTO ERPOutbox (PlantID, IntegrationID, EventType, Payload, IdempotencyKey)
            VALUES (?, ?, ?, ?, ?)
        `).run(plantId, integrationId || 'erp', eventType, JSON.stringify(payload), key);
        if (result.changes === 0 && key) {
            console.log(`[ERP Outbox] Duplicate suppressed (idempotencyKey=${key})`);
        }
    } catch (e) {
        console.error('[ERP Outbox] Failed to queue event:', e.message);
    }
}

// ── Internal: POST payload to ERP endpoint ────────────────────────────────────
async function sendToErp(erpConfig, event) {
    const https = require('https');
    const http  = require('http');

    const baseUrl = (erpConfig.baseUrl || '').replace(/\/$/, '');
    if (!baseUrl) throw new Error('No baseUrl configured for ERP integration');

    // Use a configurable outbox path, defaulting to /api/trier-outbox
    const outboxPath = erpConfig.outboxPath || '/api/trier-outbox';
    const urlStr     = baseUrl + outboxPath;
    const url        = new URL(urlStr);
    const body       = JSON.stringify({
        eventType:     event.EventType,
        plantId:       event.PlantID,
        integrationId: event.IntegrationID,
        payload:       JSON.parse(event.Payload),
        sentAt:        new Date().toISOString(),
    });

    // Build auth headers
    const headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
    };
    // Audit 47 / H-4: forward the idempotency key so ERPs that support it can
    // dedup on their side. Omit the header when we don't have one (legacy rows
    // or event types with no derivable discriminator).
    if (event.IdempotencyKey) {
        headers['X-Idempotency-Key'] = event.IdempotencyKey;
    }
    if (erpConfig.authType === 'apikey')  headers['X-API-Key'] = erpConfig.apiKey || '';
    if (erpConfig.authType === 'bearer')  headers['Authorization'] = `Bearer ${erpConfig.bearerToken || ''}`;
    if (erpConfig.authType === 'basic') {
        const b64 = Buffer.from(`${erpConfig.basicUser || ''}:${erpConfig.basicPass || ''}`).toString('base64');
        headers['Authorization'] = `Basic ${b64}`;
    }

    return new Promise((resolve, reject) => {
        const lib = url.protocol === 'https:' ? https : http;
        const req = lib.request({
            hostname: url.hostname,
            port:     url.port || (url.protocol === 'https:' ? 443 : 80),
            path:     url.pathname + url.search,
            method:   'POST',
            headers,
            timeout:  12000,
        }, (res) => {
            let data = '';
            res.on('data', c => { data += c; });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
                else reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('ERP request timed out')); });
        req.write(body);
        req.end();
    });
}

// ── Get ERP config for a plant from PlantConfiguration ───────────────────────
function getErpConfig(plantId, integrationId) {
    try {
        const row = logDb.prepare(
            'SELECT IntegrationConfig FROM PlantConfiguration WHERE PlantID=?'
        ).get(plantId);
        if (!row?.IntegrationConfig) return null;
        const all = JSON.parse(row.IntegrationConfig);
        return all[integrationId] || all['erp'] || null;
    } catch { return null; }
}

// ── Drain the outbox — called every 60 seconds ────────────────────────────────
async function drainOutbox() {
    const now = new Date().toISOString();
    const pending = logDb.prepare(`
        SELECT * FROM ERPOutbox
        WHERE Status = 'pending' AND NextRetryAt <= ?
        LIMIT 50
    `).all(now);

    if (!pending.length) return;

    for (const event of pending) {
        try {
            const erpConfig = getErpConfig(event.PlantID, event.IntegrationID);
            if (!erpConfig?.baseUrl) {
                // No ERP configured for this plant — mark failed after 1 attempt
                logDb.prepare(`
                    UPDATE ERPOutbox SET Status='failed', Attempts=1,
                    SentAt=datetime('now')
                    WHERE ID=?
                `).run(event.ID);
                continue;
            }

            await sendToErp(erpConfig, event);

            logDb.prepare(`
                UPDATE ERPOutbox SET Status='sent', SentAt=datetime('now') WHERE ID=?
            `).run(event.ID);
            console.log(`[ERP Outbox] Sent ${event.EventType} #${event.ID} → ${event.PlantID}`);
        } catch (err) {
            const attempts = (event.Attempts || 0) + 1;
            if (attempts >= 5) {
                logDb.prepare(`
                    UPDATE ERPOutbox SET Status='failed', Attempts=?, NextRetryAt=datetime('now')
                    WHERE ID=?
                `).run(attempts, event.ID);
                console.warn(`[ERP Outbox] Event #${event.ID} failed after 5 attempts: ${err.message}`);
            } else {
                // Exponential back-off: 2^attempts minutes
                const delayMinutes = Math.pow(2, attempts);
                logDb.prepare(`
                    UPDATE ERPOutbox SET Attempts=?,
                    NextRetryAt=datetime('now', '+${delayMinutes} minutes')
                    WHERE ID=?
                `).run(attempts, event.ID);
            }
        }
    }
}

// ── Start the drain loop ──────────────────────────────────────────────────────
let _drainTimer = null;
function startDrainWorker() {
    if (_drainTimer) return;
    drainOutbox(); // immediate first drain
    _drainTimer = setInterval(drainOutbox, 60 * 1000);
    console.log('[ERP Outbox] Drain worker started (60s interval)');
}

function stopDrainWorker() {
    if (_drainTimer) { clearInterval(_drainTimer); _drainTimer = null; }
}

module.exports = { insertOutboxEvent, drainOutbox, startDrainWorker, stopDrainWorker };
