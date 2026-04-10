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
 *
 * EVENT TYPES:
 *   wo_close      — Fired when a WO reaches StatusID 40/50 (Completed/Closed)
 *   part_consume  — Fired when a negative quantity adjustment is recorded
 *   labor_post    — Fired when actual hours are updated on a WO (future)
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
        ID            INTEGER PRIMARY KEY AUTOINCREMENT,
        PlantID       TEXT NOT NULL,
        IntegrationID TEXT NOT NULL DEFAULT 'erp',
        EventType     TEXT NOT NULL,
        Payload       TEXT NOT NULL,
        Status        TEXT NOT NULL DEFAULT 'pending',
        Attempts      INTEGER DEFAULT 0,
        NextRetryAt   TEXT DEFAULT (datetime('now')),
        CreatedAt     TEXT DEFAULT (datetime('now')),
        SentAt        TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_outbox_status ON ERPOutbox(Status, NextRetryAt);
    CREATE INDEX IF NOT EXISTS idx_outbox_plant  ON ERPOutbox(PlantID);
`);

// ── Queue an event ────────────────────────────────────────────────────────────
function insertOutboxEvent(plantId, integrationId, eventType, payload) {
    try {
        logDb.prepare(`
            INSERT INTO ERPOutbox (PlantID, IntegrationID, EventType, Payload)
            VALUES (?, ?, ?, ?)
        `).run(plantId, integrationId || 'erp', eventType, JSON.stringify(payload));
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
