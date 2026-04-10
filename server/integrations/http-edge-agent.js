// Copyright © 2026 Trier OS. All Rights Reserved.
/**
 * Trier OS — HTTP/REST Edge Agent (ERP Pull Worker)
 * ==================================================
 * Polls a remote ERP or REST API on a configurable interval, normalizes
 * the JSON response using a field-mapping config, and upserts data into
 * the plant's SQLite database.
 *
 * Mirrors the EdgeAgent interface exactly so integration-manager.js can
 * manage both Modbus and HTTP workers through the same start/stop/status API.
 *
 * SUPPORTED AUTH TYPES:
 *   none        — no authentication
 *   apikey      — X-API-Key header
 *   bearer      — Authorization: Bearer <token>
 *   basic       — Authorization: Basic base64(user:pass)
 *   oauth2      — client_credentials grant, token auto-refreshed
 *
 * ERP PRESETS (pre-fill endpoint paths + field mappings):
 *   sap         — SAP S/4HANA REST APIs
 *   oracle      — Oracle EBS / Oracle Cloud
 *   dynamics365 — Microsoft Dynamics 365
 *   generic     — Custom REST with manual field maps
 *
 * RESPONSE NORMALIZATION:
 *   responseMap: [{ srcField, destTable, destColumn }]
 *   Handles dot-notation for nested JSON (e.g. "items[0].AUFNR")
 *
 * One instance per plant × integration. Managed by integration-manager.js.
 */

'use strict';
const path     = require('path');
const https    = require('https');
const http     = require('http');
const Database = require('better-sqlite3');
const dataDir  = require('../resolve_data_dir');

// ── ERP field name presets ────────────────────────────────────────────────────
const ERP_PRESETS = {
    sap: {
        workOrders: {
            path: '/sap/opu/odata/sap/API_ORDER_SRV/A_MaintenanceOrder',
            responseMap: [
                { srcField: 'AUFNR',      destTable: 'Work', destColumn: 'WorkOrderNumber' },
                { srcField: 'KTEXT',      destTable: 'Work', destColumn: 'Description' },
                { srcField: 'ERDAT',      destTable: 'Work', destColumn: 'AddDate' },
                { srcField: 'IPHAS',      destTable: 'Work', destColumn: 'Status' },
                { srcField: 'PRIOK',      destTable: 'Work', destColumn: 'Priority' },
                { srcField: 'EQUNR',      destTable: 'Work', destColumn: 'AstID' },
            ]
        },
        parts: {
            path: '/sap/opu/odata/sap/API_MATERIAL_DOCUMENT_SRV/A_MaterialDocItm',
            responseMap: [
                { srcField: 'MATNR', destTable: 'Parts', destColumn: 'PartNumber' },
                { srcField: 'MAKTX', destTable: 'Parts', destColumn: 'Description' },
                { srcField: 'LABST', destTable: 'Parts', destColumn: 'QtyOnHand' },
                { srcField: 'MEINS', destTable: 'Parts', destColumn: 'UOM' },
            ]
        }
    },
    oracle: {
        workOrders: {
            path: '/fscmRestApi/resources/11.13.18.05/maintenanceWorkOrders',
            responseMap: [
                { srcField: 'WorkOrderNumber',  destTable: 'Work', destColumn: 'WorkOrderNumber' },
                { srcField: 'WorkOrderName',    destTable: 'Work', destColumn: 'Description' },
                { srcField: 'CreationDate',     destTable: 'Work', destColumn: 'AddDate' },
                { srcField: 'StatusCode',       destTable: 'Work', destColumn: 'Status' },
                { srcField: 'PriorityCode',     destTable: 'Work', destColumn: 'Priority' },
            ]
        }
    },
    dynamics365: {
        workOrders: {
            path: '/api/data/v9.2/msdyn_workorders',
            responseMap: [
                { srcField: 'msdyn_name',             destTable: 'Work', destColumn: 'WorkOrderNumber' },
                { srcField: 'msdyn_serviceaccount',   destTable: 'Work', destColumn: 'Description' },
                { srcField: 'createdon',              destTable: 'Work', destColumn: 'AddDate' },
                { srcField: 'msdyn_systemstatus',     destTable: 'Work', destColumn: 'Status' },
                { srcField: 'msdyn_priority',         destTable: 'Work', destColumn: 'Priority' },
            ]
        }
    },
    generic: { workOrders: { path: '/api/workorders', responseMap: [] } }
};

// ── Schema bootstrap ──────────────────────────────────────────────────────────
function ensureSchema(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS ErpSyncLog (
            ID           INTEGER PRIMARY KEY AUTOINCREMENT,
            IntegrationID TEXT NOT NULL,
            Endpoint      TEXT,
            RecordsIn     INTEGER DEFAULT 0,
            RecordsUpserted INTEGER DEFAULT 0,
            Status        TEXT DEFAULT 'ok',
            ErrorMessage  TEXT,
            SyncedAt      TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_erpsync_time ON ErpSyncLog(SyncedAt);
    `);
}

// ── Deep-get a value from a nested object using dot-notation ─────────────────
function deepGet(obj, dotPath) {
    if (!dotPath || obj == null) return undefined;
    return dotPath.split('.').reduce((acc, key) => (acc != null ? acc[key] : undefined), obj);
}

// ── Normalize ERP row → Work upsert ──────────────────────────────────────────
function normalizeRow(row, responseMap) {
    const out = {};
    for (const { srcField, destColumn } of responseMap) {
        const val = deepGet(row, srcField);
        if (val !== undefined && val !== null) out[destColumn] = String(val);
    }
    return out;
}

// ── Upsert normalized row into destTable ─────────────────────────────────────
function upsertRow(db, destTable, normalized) {
    if (!Object.keys(normalized).length) return;
    try {
        const cols   = Object.keys(normalized);
        const vals   = Object.values(normalized);
        const sets   = cols.filter(c => c !== cols[0]).map(c => `${c} = excluded.${c}`).join(', ');
        const sql    = `
            INSERT INTO ${destTable} (${cols.join(', ')})
            VALUES (${cols.map(() => '?').join(', ')})
            ${sets ? `ON CONFLICT(${cols[0]}) DO UPDATE SET ${sets}` : ''}
        `;
        db.prepare(sql).run(...vals);
    } catch { /* table or column may not exist for this plant; skip */ }
}

// ── Worker class ──────────────────────────────────────────────────────────────
class HttpEdgeAgent {
    constructor(plantId, integrationId, config) {
        this.plantId       = plantId;
        this.integrationId = integrationId;
        this.baseUrl       = (config.baseUrl || '').replace(/\/$/, '');
        this.authType      = config.authType || 'none';
        this.apiKey        = config.apiKey || '';
        this.bearerToken   = config.bearerToken || '';
        this.basicUser     = config.basicUser || '';
        this.basicPass     = config.basicPass || '';
        this.oauthClientId     = config.oauthClientId || '';
        this.oauthClientSecret = config.oauthClientSecret || '';
        this.oauthTokenUrl     = config.oauthTokenUrl || '';
        this._oauthToken       = null;
        this._oauthExpiry      = 0;
        this.intervalMs    = (parseInt(config.pollIntervalSeconds) || 300) * 1000;
        this.preset        = config.preset || 'generic';
        // endpoints: { workOrders: { path, responseMap }, parts: {...}, ... }
        this.endpoints     = config.endpoints || ERP_PRESETS[this.preset] || ERP_PRESETS.generic;
        this.timer         = null;
        this.running       = false;
        this.lastPoll      = null;
        this.lastError     = null;
        this.pollCount     = 0;
        this._db           = null;
    }

    _getDb() {
        if (this._db) return this._db;
        const dbPath = path.join(dataDir, `${this.plantId}.db`);
        this._db = new Database(dbPath);
        ensureSchema(this._db);
        return this._db;
    }

    // ── Build auth headers ──────────────────────────────────────────────────
    async _authHeaders() {
        const h = { 'Content-Type': 'application/json', Accept: 'application/json' };
        switch (this.authType) {
            case 'apikey':
                h['X-API-Key'] = this.apiKey;
                break;
            case 'bearer':
                h['Authorization'] = `Bearer ${this.bearerToken}`;
                break;
            case 'basic': {
                const b64 = Buffer.from(`${this.basicUser}:${this.basicPass}`).toString('base64');
                h['Authorization'] = `Basic ${b64}`;
                break;
            }
            case 'oauth2':
                h['Authorization'] = `Bearer ${await this._getOAuthToken()}`;
                break;
        }
        return h;
    }

    // ── OAuth2 client_credentials flow with token caching ──────────────────
    async _getOAuthToken() {
        if (this._oauthToken && Date.now() < this._oauthExpiry - 30000) return this._oauthToken;
        const body = `grant_type=client_credentials&client_id=${encodeURIComponent(this.oauthClientId)}&client_secret=${encodeURIComponent(this.oauthClientSecret)}`;
        const resp = await this._fetch(this.oauthTokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body
        });
        const json = JSON.parse(resp);
        this._oauthToken  = json.access_token;
        this._oauthExpiry = Date.now() + (json.expires_in || 3600) * 1000;
        return this._oauthToken;
    }

    // ── Simple HTTP/HTTPS fetch (Node built-in, no external deps) ──────────
    _fetch(urlStr, opts = {}) {
        return new Promise((resolve, reject) => {
            const url    = new URL(urlStr);
            const lib    = url.protocol === 'https:' ? https : http;
            const reqOpts = {
                hostname: url.hostname,
                port:     url.port || (url.protocol === 'https:' ? 443 : 80),
                path:     url.pathname + url.search,
                method:   opts.method || 'GET',
                headers:  opts.headers || {},
                timeout:  15000,
            };
            const req = lib.request(reqOpts, (res) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
                    else reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
                });
            });
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
            if (opts.body) req.write(opts.body);
            req.end();
        });
    }

    // ── Poll a single endpoint, normalize, and upsert ──────────────────────
    async _pollEndpoint(endpointKey, epConfig) {
        if (!epConfig?.path) return { in: 0, upserted: 0 };
        const url  = this.baseUrl + epConfig.path;
        const hdrs = await this._authHeaders();
        const raw  = await this._fetch(url, { headers: hdrs });
        const json = JSON.parse(raw);

        // Support response at root array, or wrapped in .value / .results / .data
        const rows = Array.isArray(json) ? json
            : (json.value || json.results || json.data || json.items || []);

        if (!rows.length) return { in: 0, upserted: 0 };

        const responseMap = epConfig.responseMap || [];
        if (!responseMap.length) return { in: rows.length, upserted: 0 };

        const db = this._getDb();
        let upserted = 0;
        const doAll = db.transaction(() => {
            // Group by destTable (a single endpoint can map to multiple tables)
            const tableMap = {};
            for (const m of responseMap) {
                if (!tableMap[m.destTable]) tableMap[m.destTable] = [];
                tableMap[m.destTable].push(m);
            }
            for (const row of rows) {
                for (const [table, mappings] of Object.entries(tableMap)) {
                    const normalized = normalizeRow(row, mappings);
                    if (Object.keys(normalized).length) {
                        upsertRow(db, table, normalized);
                        upserted++;
                    }
                }
            }
        });
        doAll();
        return { in: rows.length, upserted };
    }

    async poll() {
        const db = this._getDb();
        let totalIn = 0, totalUpserted = 0;
        let pollError = null;
        try {
            for (const [key, epConfig] of Object.entries(this.endpoints)) {
                try {
                    const { in: n, upserted: u } = await this._pollEndpoint(key, epConfig);
                    totalIn += n;
                    totalUpserted += u;
                } catch (epErr) {
                    pollError = `${key}: ${epErr.message}`;
                    console.warn(`[HttpEdgeAgent] Endpoint error (${key}):`, epErr.message);
                }
            }
            db.prepare(`
                INSERT INTO ErpSyncLog (IntegrationID, Endpoint, RecordsIn, RecordsUpserted, Status, ErrorMessage)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(this.integrationId, Object.keys(this.endpoints).join(','), totalIn, totalUpserted,
                   pollError ? 'partial' : 'ok', pollError || null);

            this.lastPoll  = new Date().toISOString();
            this.lastError = pollError || null;
            this.pollCount++;
        } catch (err) {
            this.lastError = err.message;
            try {
                db.prepare(`
                    INSERT INTO ErpSyncLog (IntegrationID, Status, ErrorMessage)
                    VALUES (?, 'error', ?)
                `).run(this.integrationId, err.message);
            } catch { /* log table may not be ready */ }
        }
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.poll(); // immediate first poll
        this.timer = setInterval(() => this.poll(), this.intervalMs);
        console.log(`[HttpEdgeAgent] Started — plant=${this.plantId} integration=${this.integrationId} ${this.baseUrl} every ${this.intervalMs / 1000}s`);
    }

    stop() {
        this.running = false;
        clearInterval(this.timer);
        this.timer = null;
        if (this._db) { try { this._db.close(); } catch {} this._db = null; }
        console.log(`[HttpEdgeAgent] Stopped — plant=${this.plantId} integration=${this.integrationId}`);
    }

    status() {
        return {
            plantId:       this.plantId,
            integrationId: this.integrationId,
            type:          'http',
            running:       this.running,
            baseUrl:       this.baseUrl,
            preset:        this.preset,
            authType:      this.authType,
            lastPoll:      this.lastPoll,
            lastError:     this.lastError,
            pollCount:     this.pollCount,
            intervalMs:    this.intervalMs,
        };
    }
}

module.exports = HttpEdgeAgent;
module.exports.ERP_PRESETS = ERP_PRESETS;
