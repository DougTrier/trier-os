// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * erp_sync.js — ERP Outbox Drain Worker (Standalone Runtime)
 * ===========================================================
 * Runs the ERP write-back outbox drain loop as an independent Node.js process,
 * extracted from server/index.js as part of P2-1 / F2 runtime isolation.
 * F4: Circuit breaker on ERP probe publishes trier.system.state via NATS.
 *
 * Start: node server/runtimes/erp_sync.js
 */

'use strict';

require('dotenv').config();

const CircuitBreaker = require('opossum');
const { startDrainWorker, stopDrainWorker } = require('../services/erp-outbox');
const { db: logDb } = require('../logistics_db');
const bus = require('../services/bus');
const http  = require('http');
const https = require('https');

// ── ERP connectivity probe ────────────────────────────────────────────────────
// Reads the first configured ERP baseUrl and makes a HEAD request.
// Throws on failure so opossum can count it. Returns early (no-op) if no ERP
// is configured — no ERP config means nothing to probe, breaker stays CLOSED.
async function probeErp() {
    let rows;
    try {
        rows = logDb.prepare('SELECT IntegrationConfig FROM PlantConfiguration').all();
    } catch (_) {
        return; // Table not yet created — not an ERP failure
    }

    const endpoints = [];
    for (const row of rows) {
        if (!row.IntegrationConfig) continue;
        try {
            const cfg = JSON.parse(row.IntegrationConfig);
            if (cfg?.erp?.baseUrl) endpoints.push(cfg.erp.baseUrl);
        } catch (_) {}
    }

    if (endpoints.length === 0) return; // No ERP configured — nothing to probe

    const url = new URL(endpoints[0]);
    await new Promise((resolve, reject) => {
        const lib = url.protocol === 'https:' ? https : http;
        const req = lib.request({
            hostname: url.hostname,
            port:     url.port || (url.protocol === 'https:' ? 443 : 80),
            path:     '/',
            method:   'HEAD',
            timeout:  5000,
        }, resolve);
        req.on('error',   reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('ERP probe timed out')); });
        req.end();
    });
}

// ── Circuit breaker ───────────────────────────────────────────────────────────
const erpBreaker = new CircuitBreaker(probeErp, {
    timeout:                  8000,
    errorThresholdPercentage: 50,
    resetTimeout:             30000,
    volumeThreshold:          3,
});

erpBreaker.on('open', () => {
    console.warn('[ERP_SYNC] Circuit breaker OPEN — ERP unreachable. Publishing ISOLATED.');
    bus.publish('trier.system.state', {
        mode:   'ISOLATED',
        source: 'erp_sync',
        reason: 'ERP connector unreachable',
    });
});
erpBreaker.on('halfOpen', () => console.log('[ERP_SYNC] Circuit breaker HALF-OPEN — probing recovery'));
erpBreaker.on('close',    () => {
    console.log('[ERP_SYNC] Circuit breaker CLOSED — ERP recovered. Publishing NORMAL.');
    bus.publish('trier.system.state', {
        mode:   'NORMAL',
        source: 'erp_sync',
        reason: 'ERP connector recovered',
    });
});

// ── Startup ───────────────────────────────────────────────────────────────────
(async () => {
    await bus.connect();
    startDrainWorker();
    // Probe runs on the same cadence as the drain — one heartbeat per minute
    setInterval(() => { erpBreaker.fire().catch(() => {}); }, 60 * 1000);
    console.log('[ERP_SYNC] Running. Drains every 60s. ERP probe every 60s.');
})();

async function shutdown() {
    console.log('[ERP_SYNC] Shutting down gracefully.');
    stopDrainWorker();
    await bus.drain();
    process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);
