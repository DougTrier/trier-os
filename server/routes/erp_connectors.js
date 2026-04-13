// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * erp_connectors.js — ERP Connector Marketplace Registry
 * ========================================================
 * Connector catalog for ERP system integrations (SAP, Oracle EBS,
 * Dynamics 365, Infor CloudSuite). Manages connector profiles, field
 * mappings, health status, and test-connection results.
 *
 * This registry defines *what* each connector can sync. The actual
 * write-back mechanism uses the existing ERP outbox (erp-outbox.js).
 * Field mappings stored here tell the outbox how to translate Trier OS
 * events into the target ERP's data format.
 *
 * All data stored in trier_logistics.db (cross-plant connector pool).
 *
 * -- ROUTES ----------------------------------------------------
 *   GET    /api/erp-connectors              List configured connectors
 *   POST   /api/erp-connectors              Register a new connector
 *   PUT    /api/erp-connectors/:id          Update connector config
 *   DELETE /api/erp-connectors/:id          Remove connector
 *   POST   /api/erp-connectors/:id/test     Test connection (ping endpoint)
 *   GET    /api/erp-connectors/:id/mappings Get field mappings for a connector
 *   PUT    /api/erp-connectors/:id/mappings Upsert field mappings
 *   GET    /api/erp-connectors/catalog      List supported connector types + capabilities
 *
 * -- P6 ROADMAP ITEM COVERED ----------------------------------
 *   ERP Connector Marketplace
 */

'use strict';

const express     = require('express');
const router      = express.Router();
const logisticsDb = require('../logistics_db').db;

// ── Table initialization (idempotent) ─────────────────────────────────────────
logisticsDb.exec(`
    CREATE TABLE IF NOT EXISTS ERPConnectors (
        ID              INTEGER PRIMARY KEY AUTOINCREMENT,
        PlantID         TEXT,                        -- NULL = enterprise-wide
        ConnectorType   TEXT    NOT NULL,            -- SAP | ORACLE_EBS | DYNAMICS365 | INFOR_CS | CUSTOM
        Name            TEXT    NOT NULL,
        Description     TEXT,
        Host            TEXT,                        -- Base URL or hostname
        ApiVersion      TEXT,
        AuthType        TEXT    DEFAULT 'API_KEY',   -- API_KEY | OAUTH2 | BASIC | CERTIFICATE
        CredentialRef   TEXT,                        -- Reference to secret store key (never store plaintext)
        Status          TEXT    DEFAULT 'INACTIVE',  -- ACTIVE | INACTIVE | ERROR | TESTING
        LastTestedAt    TEXT,
        LastTestResult  TEXT,
        SyncDirection   TEXT    DEFAULT 'OUTBOUND',  -- OUTBOUND | INBOUND | BIDIRECTIONAL
        SyncEvents      TEXT,                        -- JSON array of event types this connector handles
        Active          INTEGER DEFAULT 1,
        CreatedBy       TEXT,
        CreatedAt       TEXT    DEFAULT (datetime('now')),
        UpdatedAt       TEXT    DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS ERPFieldMappings (
        ID              INTEGER PRIMARY KEY AUTOINCREMENT,
        ConnectorID     INTEGER NOT NULL REFERENCES ERPConnectors(ID) ON DELETE CASCADE,
        EventType       TEXT    NOT NULL,            -- wo_close | wo_create | asset_update | etc.
        TrierOSField    TEXT    NOT NULL,            -- Trier OS field name
        ERPField        TEXT    NOT NULL,            -- Target ERP field name / path
        Transform       TEXT,                        -- Optional: JS expression or preset (e.g. "toUpperCase")
        Required        INTEGER DEFAULT 0,
        Notes           TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_erpc_plant    ON ERPConnectors(PlantID);
    CREATE INDEX IF NOT EXISTS idx_erpc_mappings ON ERPFieldMappings(ConnectorID, EventType);
`);

// ── Connector type catalog (static capabilities registry) ─────────────────────
const CONNECTOR_CATALOG = [
    {
        type: 'SAP',
        name: 'SAP ERP / S/4HANA',
        description: 'SAP Plant Maintenance (PM) and Materials Management (MM) integration via RFC/BAPI or SAP Business Connector REST APIs.',
        syncEvents: ['wo_close', 'wo_create', 'parts_consumed', 'asset_update'],
        authTypes: ['OAUTH2', 'CERTIFICATE', 'BASIC'],
        docsUrl: 'https://api.sap.com',
        status: 'CERTIFIED',
    },
    {
        type: 'ORACLE_EBS',
        name: 'Oracle E-Business Suite / Fusion',
        description: 'Oracle EAM and Inventory integration via Oracle REST APIs (Oracle Fusion) or XML Gateway (EBS 12.x).',
        syncEvents: ['wo_close', 'wo_create', 'parts_consumed'],
        authTypes: ['OAUTH2', 'BASIC'],
        docsUrl: 'https://docs.oracle.com/en/cloud/saas/maintenance',
        status: 'CERTIFIED',
    },
    {
        type: 'DYNAMICS365',
        name: 'Microsoft Dynamics 365',
        description: 'Dynamics 365 Field Service and Finance integration via Microsoft Graph API and Dataverse REST.',
        syncEvents: ['wo_close', 'wo_create', 'asset_update', 'contractor_job'],
        authTypes: ['OAUTH2'],
        docsUrl: 'https://learn.microsoft.com/en-us/dynamics365',
        status: 'CERTIFIED',
    },
    {
        type: 'INFOR_CS',
        name: 'Infor CloudSuite Industrial / EAM',
        description: 'Infor EAM (formerly Hansen/Datastream) integration via Infor ION REST APIs. Connector metadata: /server/connectors/mp2.json.',
        syncEvents: ['wo_close', 'wo_create', 'parts_consumed', 'pm_schedule_sync'],
        authTypes: ['OAUTH2', 'API_KEY'],
        docsUrl: 'https://docs.infor.com/eam',
        status: 'CERTIFIED',
    },
    {
        type: 'CUSTOM',
        name: 'Custom REST Connector',
        description: 'Generic REST/JSON connector for any ERP system. Configure host, auth, and field mappings manually.',
        syncEvents: ['wo_close', 'wo_create', 'asset_update'],
        authTypes: ['API_KEY', 'BASIC', 'OAUTH2', 'CERTIFICATE'],
        docsUrl: null,
        status: 'AVAILABLE',
    },
];

// ── GET /api/erp-connectors/catalog ──────────────────────────────────────────
router.get('/catalog', (req, res) => {
    res.json(CONNECTOR_CATALOG);
});

// ── GET /api/erp-connectors ───────────────────────────────────────────────────
router.get('/', (req, res) => {
    try {
        const { plantId } = req.query;
        let sql = 'SELECT * FROM ERPConnectors WHERE Active=1';
        const p = [];
        if (plantId) { sql += ' AND (PlantID = ? OR PlantID IS NULL)'; p.push(plantId); }
        sql += ' ORDER BY ConnectorType, Name';
        res.json(logisticsDb.prepare(sql).all(...p));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/erp-connectors ──────────────────────────────────────────────────
router.post('/', (req, res) => {
    try {
        const { plantId, connectorType, name, description, host, apiVersion,
                authType = 'API_KEY', credentialRef, syncDirection = 'OUTBOUND', syncEvents } = req.body;
        if (!connectorType || !name) return res.status(400).json({ error: 'connectorType and name are required' });

        const r = logisticsDb.prepare(`
            INSERT INTO ERPConnectors
                (PlantID, ConnectorType, Name, Description, Host, ApiVersion, AuthType,
                 CredentialRef, SyncDirection, SyncEvents, CreatedBy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(plantId || null, connectorType.toUpperCase(), name, description || null,
               host || null, apiVersion || null, authType,
               credentialRef || null, syncDirection,
               syncEvents ? JSON.stringify(syncEvents) : null,
               req.user?.Username || 'system');

        res.status(201).json({ id: r.lastInsertRowid, ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUT /api/erp-connectors/:id ───────────────────────────────────────────────
router.put('/:id', (req, res) => {
    try {
        const allowed = ['Name', 'Description', 'Host', 'ApiVersion', 'AuthType',
                         'CredentialRef', 'Status', 'SyncDirection', 'SyncEvents', 'Active'];
        const fields = {};
        for (const f of allowed) {
            if (Object.prototype.hasOwnProperty.call(req.body, f)) fields[f] = req.body[f];
        }
        if (!Object.keys(fields).length) return res.status(400).json({ error: 'No valid fields to update' });
        fields.UpdatedAt = new Date().toISOString();
        const sets = Object.keys(fields).map(k => `"${k}" = ?`).join(', ');
        logisticsDb.prepare(`UPDATE ERPConnectors SET ${sets} WHERE ID = ?`).run(...Object.values(fields), req.params.id);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE /api/erp-connectors/:id ────────────────────────────────────────────
router.delete('/:id', (req, res) => {
    try {
        logisticsDb.prepare('UPDATE ERPConnectors SET Active=0, UpdatedAt=datetime("now") WHERE ID=?').run(req.params.id);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/erp-connectors/:id/test ────────────────────────────────────────
// Validates connectivity to the configured host (non-blocking, advisory only).
router.post('/:id/test', async (req, res) => {
    try {
        const connector = logisticsDb.prepare('SELECT * FROM ERPConnectors WHERE ID=?').get(req.params.id);
        if (!connector) return res.status(404).json({ error: 'Connector not found' });
        if (!connector.Host) {
            return res.json({ ok: false, result: 'NO_HOST', message: 'No host configured — cannot test connection' });
        }

        // Attempt a basic HTTP HEAD/GET to the host root
        let result = 'UNKNOWN';
        let message = '';
        try {
            const https = require('https');
            const http  = require('http');
            const url   = new URL(connector.Host.startsWith('http') ? connector.Host : `https://${connector.Host}`);
            const lib   = url.protocol === 'https:' ? https : http;
            await new Promise((resolve) => {
                const req2 = lib.request({ hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80), path: '/', method: 'HEAD', timeout: 5000 }, (r2) => {
                    result  = r2.statusCode < 500 ? 'REACHABLE' : 'HTTP_ERROR';
                    message = `HTTP ${r2.statusCode}`;
                    resolve();
                });
                req2.on('error', (e) => { result = 'UNREACHABLE'; message = e.message; resolve(); });
                req2.on('timeout', () => { result = 'TIMEOUT'; message = 'Connection timed out after 5s'; req2.destroy(); resolve(); });
                req2.end();
            });
        } catch (e) { result = 'ERROR'; message = e.message; }

        const now = new Date().toISOString();
        logisticsDb.prepare(
            'UPDATE ERPConnectors SET LastTestedAt=?, LastTestResult=?, Status=?, UpdatedAt=? WHERE ID=?'
        ).run(now, result, result === 'REACHABLE' ? 'ACTIVE' : 'ERROR', now, req.params.id);

        res.json({ ok: result === 'REACHABLE', result, message, testedAt: now });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/erp-connectors/:id/mappings ─────────────────────────────────────
router.get('/:id/mappings', (req, res) => {
    try {
        const { eventType } = req.query;
        let sql = 'SELECT * FROM ERPFieldMappings WHERE ConnectorID=?';
        const p = [req.params.id];
        if (eventType) { sql += ' AND EventType=?'; p.push(eventType); }
        sql += ' ORDER BY EventType, TrierOSField';
        res.json(logisticsDb.prepare(sql).all(...p));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUT /api/erp-connectors/:id/mappings ─────────────────────────────────────
// Replaces all mappings for a given eventType on this connector.
router.put('/:id/mappings', (req, res) => {
    try {
        const { eventType, mappings = [] } = req.body;
        if (!eventType) return res.status(400).json({ error: 'eventType is required' });

        logisticsDb.prepare('DELETE FROM ERPFieldMappings WHERE ConnectorID=? AND EventType=?').run(req.params.id, eventType);

        const ins = logisticsDb.prepare(
            'INSERT INTO ERPFieldMappings (ConnectorID, EventType, TrierOSField, ERPField, Transform, Required, Notes) VALUES (?,?,?,?,?,?,?)'
        );
        for (const m of mappings) {
            ins.run(req.params.id, eventType, m.trierOSField, m.erpField, m.transform||null, m.required?1:0, m.notes||null);
        }

        res.json({ ok: true, count: mappings.length });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
