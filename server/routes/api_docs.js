// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — API Documentation & Integration Key Management
 * ===========================================================
 * Exposes auto-generated API documentation in OpenAPI-compatible format
 * and manages API keys for third-party integrations (Power BI, Tableau,
 * ERP connectors, external Enterprise System bridges).
 * Mounted at /api/docs in server/index.js.
 *
 * ENDPOINTS:
 *   GET    /           Full API documentation (OpenAPI-style JSON)
 *                      Lists all registered routes with methods, descriptions, and auth requirements
 *   GET    /keys       List active API keys (admin only)
 *                      Returns: [{ id, name, prefix, createdAt, lastUsed, expiresAt }]
 *   POST   /keys       Generate a new API key
 *                      Body: { name, expiresInDays? }
 *                      Returns: { key } — shown only once, store immediately
 *   DELETE /keys/:id   Revoke an API key immediately
 *
 * API KEY FORMAT: `pm_live_` prefix + 32 random hex bytes (crypto.randomBytes).
 *   Keys are stored hashed (SHA-256). Only the prefix is stored in plaintext
 *   for display purposes. The full key is shown only at generation time.
 *
 * AUTHENTICATION: Two paths depending on the client type:
 *   Browser sessions — auth token is stored in an httpOnly cookie set at login.
 *     The browser sends it automatically; no Authorization header needed.
 *     Cookie is invisible to JavaScript (not in localStorage, not in document.cookie).
 *   API integrations (Power BI, http-edge-agent, HA sync, scripts) — pass the token
 *     as a Bearer token in the Authorization header, or as ?token= query param for
 *     tools that don't support headers. Both paths are accepted by the auth middleware.
 *
 * INTEGRATION USE CASES:
 *   - Power BI Desktop: Web data source with Bearer token auth
 *   - Tableau: Web data connector using the JSON endpoints
 *   - ERP/SAP bridge: Machine-to-machine sync via scheduled jobs
 *   - External Enterprise System: Work order push/pull via the v2 API
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { db: logisticsDb, logAudit } = require('../logistics_db');

// ── Ensure api_keys table ────────────────────────────────────────────────────
try {
    logisticsDb.exec(`CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_hash TEXT NOT NULL UNIQUE,
        key_prefix TEXT NOT NULL,
        label TEXT DEFAULT '',
        created_by TEXT DEFAULT 'admin',
        created_at TEXT DEFAULT (datetime('now')),
        last_used_at TEXT,
        permissions TEXT DEFAULT 'read',
        enabled INTEGER DEFAULT 1,
        request_count INTEGER DEFAULT 0
    )`);
} catch (e) {
    console.error('[API Docs] Table init error:', e.message);
}

// ── API route registry ───────────────────────────────────────────────────────
const apiEndpoints = [
    // Core
    { method: 'POST', path: '/api/auth/login', desc: 'Authenticate and receive JWT token', auth: false, category: 'Authentication' },
    { method: 'POST', path: '/api/auth/register', desc: 'Register a new user account', auth: false, category: 'Authentication' },

    // Work Orders
    { method: 'GET', path: '/api/work-orders', desc: 'List all work orders for current plant', auth: true, category: 'Work Orders' },
    { method: 'GET', path: '/api/work-orders/:id', desc: 'Get single work order with parts, tasks, labor', auth: true, category: 'Work Orders' },
    { method: 'GET', path: '/api/work-orders/stats', desc: 'Work order statistics (counts by status, priority)', auth: true, category: 'Work Orders' },
    { method: 'GET', path: '/api/work-orders/next-id', desc: 'Get the next available work order ID', auth: true, category: 'Work Orders' },
    { method: 'POST', path: '/api/work-orders', desc: 'Create a new work order', auth: true, category: 'Work Orders' },
    { method: 'PUT', path: '/api/work-orders/:id', desc: 'Update an existing work order', auth: true, category: 'Work Orders' },
    { method: 'DELETE', path: '/api/work-orders/:id', desc: 'Delete a work order (completed WOs protected)', auth: true, category: 'Work Orders' },

    // V2 Integration
    { method: 'POST', path: '/api/v2/work-orders/:id/close', desc: 'Close work order with full cost capture', auth: true, category: 'Work Orders' },

    // Assets
    { method: 'GET', path: '/api/assets', desc: 'List all assets for current plant', auth: true, category: 'Assets' },
    { method: 'GET', path: '/api/assets/:id', desc: 'Get single asset details', auth: true, category: 'Assets' },
    { method: 'POST', path: '/api/assets', desc: 'Create a new asset', auth: true, category: 'Assets' },
    { method: 'PUT', path: '/api/assets/:id', desc: 'Update an asset', auth: true, category: 'Assets' },

    // Parts / Inventory
    { method: 'GET', path: '/api/parts', desc: 'List all parts for current plant', auth: true, category: 'Inventory' },
    { method: 'GET', path: '/api/parts/:id', desc: 'Get single part details', auth: true, category: 'Inventory' },
    { method: 'POST', path: '/api/parts', desc: 'Create a new part', auth: true, category: 'Inventory' },
    { method: 'PUT', path: '/api/parts/:id', desc: 'Update a part', auth: true, category: 'Inventory' },
    { method: 'GET', path: '/api/parts/enterprise/low-stock', desc: 'Cross-plant low stock alerts', auth: true, category: 'Inventory' },

    // PM Schedules
    { method: 'GET', path: '/api/pm-schedules', desc: 'List PM schedules for current plant', auth: true, category: 'PM Schedules' },
    { method: 'GET', path: '/api/pm-schedules/calendar/events', desc: 'Calendar event data for PM/WO items', auth: true, category: 'PM Schedules' },

    // Notifications
    { method: 'GET', path: '/api/notifications', desc: 'Get notifications for logged-in user', auth: true, category: 'Notifications' },

    // BI / Data Export
    { method: 'GET', path: '/api/bi/work-orders', desc: 'Export work orders (JSON or CSV)', auth: true, category: 'BI Export', params: '?format=csv&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD' },
    { method: 'GET', path: '/api/bi/assets', desc: 'Export assets (JSON or CSV)', auth: true, category: 'BI Export' },
    { method: 'GET', path: '/api/bi/pm-compliance', desc: 'Export PM compliance status (JSON or CSV)', auth: true, category: 'BI Export' },
    { method: 'GET', path: '/api/bi/parts-inventory', desc: 'Export parts inventory (JSON or CSV)', auth: true, category: 'BI Export' },
    { method: 'GET', path: '/api/bi/technician-performance', desc: 'Export technician metrics (JSON or CSV)', auth: true, category: 'BI Export' },
    { method: 'GET', path: '/api/bi/reminder-insights', desc: 'Export aggregated reminder metrics', auth: true, category: 'BI Export' },

    // Webhooks
    { method: 'GET', path: '/api/integrations/webhooks', desc: 'List configured webhooks', auth: true, category: 'Webhooks', role: 'admin' },
    { method: 'POST', path: '/api/integrations/webhooks', desc: 'Create a new webhook', auth: true, category: 'Webhooks', role: 'admin' },
    { method: 'PUT', path: '/api/integrations/webhooks/:id', desc: 'Update webhook config', auth: true, category: 'Webhooks', role: 'admin' },
    { method: 'DELETE', path: '/api/integrations/webhooks/:id', desc: 'Delete a webhook', auth: true, category: 'Webhooks', role: 'admin' },
    { method: 'POST', path: '/api/integrations/webhooks/:id/test', desc: 'Send test notification', auth: true, category: 'Webhooks', role: 'admin' },

    // Approvals
    { method: 'GET', path: '/api/approvals', desc: 'List approvals (filter by status, type)', auth: true, category: 'Approvals', params: '?status=pending&type=PO' },
    { method: 'GET', path: '/api/approvals/stats', desc: 'Approval queue statistics', auth: true, category: 'Approvals' },
    { method: 'POST', path: '/api/approvals', desc: 'Submit item for approval', auth: true, category: 'Approvals' },
    { method: 'PUT', path: '/api/approvals/:id/approve', desc: 'Approve a pending item', auth: true, category: 'Approvals', role: 'manager' },
    { method: 'PUT', path: '/api/approvals/:id/reject', desc: 'Reject a pending item (reason required)', auth: true, category: 'Approvals', role: 'manager' },
    { method: 'GET', path: '/api/approvals/settings', desc: 'Get approval threshold settings', auth: true, category: 'Approvals', role: 'admin' },
    { method: 'PUT', path: '/api/approvals/settings', desc: 'Update approval thresholds', auth: true, category: 'Approvals', role: 'admin' },

    // Logistics
    { method: 'GET', path: '/api/logistics/part-requests', desc: 'Part transfer requests across plants', auth: true, category: 'Logistics' },
    { method: 'POST', path: '/api/logistics/part-requests', desc: 'Create a part transfer request', auth: true, category: 'Logistics' },

    // Branding
    { method: 'GET', path: '/api/branding/logo', desc: 'Get current logo image', auth: false, category: 'Branding' },
    { method: 'POST', path: '/api/branding/logo', desc: 'Upload custom logo', auth: true, category: 'Branding', role: 'admin' },

    // Search
    { method: 'GET', path: '/api/search', desc: 'Global search across WOs, assets, parts', auth: true, category: 'Search', params: '?q=searchterm' },

    // Safety Incidents
    { method: 'GET', path: '/api/safety-incidents', desc: 'List safety incidents (supports ?status=open&type=Near-Miss)', auth: true, category: 'Safety & Compliance' },
    { method: 'GET', path: '/api/safety-incidents/:id', desc: 'Get single incident with full detail', auth: true, category: 'Safety & Compliance' },
    { method: 'POST', path: '/api/safety-incidents', desc: 'Log a new safety incident or near-miss', auth: true, category: 'Safety & Compliance' },
    { method: 'PUT', path: '/api/safety-incidents/:id', desc: 'Update incident details or close it out', auth: true, category: 'Safety & Compliance' },

    // Calibration
    { method: 'GET', path: '/api/calibration/instruments', desc: 'List calibration instruments (supports ?status=overdue)', auth: true, category: 'Safety & Compliance' },
    { method: 'GET', path: '/api/calibration/instruments/:id', desc: 'Get single instrument with calibration history', auth: true, category: 'Safety & Compliance' },
    { method: 'POST', path: '/api/calibration/instruments', desc: 'Add a new instrument to calibration tracking', auth: true, category: 'Safety & Compliance' },
    { method: 'PUT', path: '/api/calibration/instruments/:id', desc: 'Record calibration event or update instrument', auth: true, category: 'Safety & Compliance' },

    // LOTO Permits
    { method: 'GET', path: '/api/loto/permits', desc: 'List LOTO permits (supports ?status=open&assetId=)', auth: true, category: 'Safety & Compliance' },
    { method: 'GET', path: '/api/loto/permits/:id', desc: 'Get single LOTO permit with isolation points', auth: true, category: 'Safety & Compliance' },
    { method: 'POST', path: '/api/loto/permits', desc: 'Open a new LOTO permit', auth: true, category: 'Safety & Compliance' },
    { method: 'PUT', path: '/api/loto/permits/:id', desc: 'Update or close a LOTO permit', auth: true, category: 'Safety & Compliance' },

    // Risk Scoring (Phase 1 — Insurance & Compliance)
    { method: 'GET', path: '/api/risk-scoring', desc: 'Enterprise or per-plant risk score (0–100) with factor breakdown', auth: true, category: 'Risk Scoring', params: '?plantId=Demo_Plant_1' },
    { method: 'GET', path: '/api/risk-scoring/history', desc: '12-month risk score history for sparkline trend', auth: true, category: 'Risk Scoring', params: '?plantId=Demo_Plant_1' },
    { method: 'GET', path: '/api/risk-scoring/:plantId', desc: 'Risk score for a specific plant', auth: true, category: 'Risk Scoring' },
    { method: 'PUT', path: '/api/risk-scoring/:plantId', desc: 'Snapshot current score to RiskScoreHistory table', auth: true, category: 'Risk Scoring' },

    // Energy (Phase 2 — Arbitrage & TOU)
    { method: 'GET', path: '/api/energy/readings', desc: 'List energy readings for current plant (supports ?meterType=Electric&limit=)', auth: true, category: 'Energy & Utilities' },
    { method: 'POST', path: '/api/energy/readings', desc: 'Log a new energy reading', auth: true, category: 'Energy & Utilities' },
    { method: 'GET', path: '/api/energy/readings/:id', desc: 'Get single energy reading', auth: true, category: 'Energy & Utilities' },
    { method: 'PUT', path: '/api/energy/readings/:id', desc: 'Edit an existing energy reading', auth: true, category: 'Energy & Utilities' },
    { method: 'GET', path: '/api/energy/targets', desc: 'List monthly energy targets for current plant', auth: true, category: 'Energy & Utilities' },
    { method: 'PUT', path: '/api/energy/targets/:id', desc: 'Update energy target for a meter type', auth: true, category: 'Energy & Utilities' },
    { method: 'GET', path: '/api/energy/tou', desc: 'Get current time-of-use pricing tier and rate info', auth: true, category: 'Energy & Utilities' },
    { method: 'GET', path: '/api/energy/tou-config', desc: 'Get TOU configuration (PeakStart, PeakEnd, multipliers)', auth: true, category: 'Energy & Utilities' },
    { method: 'PUT', path: '/api/energy/tou-config', desc: 'Update TOU configuration for current plant', auth: true, category: 'Energy & Utilities' },
    { method: 'GET', path: '/api/energy/asset-loads', desc: 'List asset load weights for energy calculation', auth: true, category: 'Energy & Utilities' },
    { method: 'PUT', path: '/api/energy/asset-loads/:id', desc: 'Update asset load category and IsHighLoad flag', auth: true, category: 'Energy & Utilities' },
    { method: 'GET', path: '/api/energy/arbitrage', desc: '24h load-shift arbitrage recommendations for high-load assets', auth: true, category: 'Energy & Utilities' },
];

// ── GET /api/docs ────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
    const grouped = {};
    for (const ep of apiEndpoints) {
        if (!grouped[ep.category]) grouped[ep.category] = [];
        grouped[ep.category].push(ep);
    }

    res.json({
        name: 'Trier OS API',
        version: '2.0',
        description: 'Enterprise Enterprise System REST API for maintenance operations across multi-site deployments',
        baseUrl: `${req.protocol}://${req.get('host')}`,
        authentication: {
            type: 'Bearer Token (JWT)',
            header: 'Authorization: Bearer <token>',
            loginEndpoint: 'POST /api/auth/login',
            alternativeAuth: 'API Key via ?api_key=<key> query parameter'
        },
        plantSelection: {
            header: 'x-plant-id',
            description: 'Set this header to the plant identifier (e.g., Demo_Plant_1) to scope requests to a specific site database'
        },
        totalEndpoints: apiEndpoints.length,
        categories: grouped,
        generatedAt: new Date().toISOString()
    });
});

// ── GET /api/docs/keys ───────────────────────────────────────────────────────
router.get('/keys', (req, res) => {
    try {
        const keys = logisticsDb.prepare(
            'SELECT id, key_prefix, label, created_by, created_at, last_used_at, permissions, enabled, request_count FROM api_keys ORDER BY created_at DESC'
        ).all();
        res.json(keys);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch keys' });
    }
});

// ── POST /api/docs/keys ──────────────────────────────────────────────────────
router.post('/keys', (req, res) => {
    try {
        const { label, permissions = 'read' } = req.body;
        const rawKey = 'pm_' + crypto.randomBytes(24).toString('hex');
        const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
        // Audit 47 / L-2: bump the display prefix from 10 → 20 chars so admins
        // can uniquely identify which key to revoke at scale. The 'pm_' + 17
        // hex chars that fit in 20 total gives 68 bits of discriminator —
        // effectively zero collision risk across any realistic key population.
        const keyPrefix = rawKey.substring(0, 20) + '...';

        logisticsDb.prepare(`
            INSERT INTO api_keys (key_hash, key_prefix, label, created_by, permissions)
            VALUES (?, ?, ?, ?, ?)
        `).run(keyHash, keyPrefix, label || 'Unnamed Key', req.user?.username || 'admin', permissions);

        logAudit(req.user?.username || 'admin', 'API_KEY_CREATED', 'system', { label, permissions });

        res.status(201).json({
            success: true,
            key: rawKey,
            prefix: keyPrefix,
            warning: 'Save this key now — it will not be shown again.'
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create key' });
    }
});

// ── DELETE /api/docs/keys/:id ────────────────────────────────────────────────
router.delete('/keys/:id', (req, res) => {
    try {
        logisticsDb.prepare('DELETE FROM api_keys WHERE id = ?').run(req.params.id);
        logAudit(req.user?.username || 'admin', 'API_KEY_REVOKED', 'system', { keyId: req.params.id });
        res.json({ success: true, message: 'API key revoked' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to revoke key' });
    }
});

module.exports = router;
