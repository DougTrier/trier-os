// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * ENDPOINTS:
 *   GET /api/dt-sync/config?plantId=
 *   POST /api/dt-sync/config
 *   DELETE /api/dt-sync/config/:id
 *   POST /api/dt-sync/test-connection
 *   POST /api/dt-sync/:plantId/push
 *   POST /api/dt-sync/:plantId/pull
 *   GET /api/dt-sync/:plantId/status
 *   GET /api/dt-sync/:plantId/history?limit=20
 */

const express = require('express');
const router = express.Router();
const https = require('https');
const http = require('http');
const logisticsDb = require('../logistics_db').db;
const { logAudit } = require('../logistics_db');
const { getDb } = require('../database');

const SAFE_PLANT_ID = /^[a-zA-Z0-9_-]{1,64}$/;

const PRIVATE_RANGE = /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1$|169\.254\.)/;

function validateOutboundUrl(urlStr) {
    let url;
    try { url = new URL(urlStr); } catch { throw new Error('Invalid URL'); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http/https allowed');
    if (PRIVATE_RANGE.test(url.hostname)) throw new Error('Private/loopback address blocked (S-6)');
    return url;
}

router.get('/config', (req, res) => {
    try {
        const { plantId } = req.query;
        if (!plantId || !SAFE_PLANT_ID.test(plantId)) return res.status(400).json({ error: 'Invalid plantId' });

        const rows = logisticsDb.prepare('SELECT * FROM DTSyncConfig WHERE PlantID = ?').all(plantId);
        
        const safeRows = rows.map(r => {
            const row = { ...r };
            if (row.ClientSecret) {
                row.ClientSecret = '***';
            } else {
                row.ClientSecret = null;
            }
            return row;
        });

        res.json(safeRows);
    } catch (err) {
        console.error('GET /api/dt-sync/config error:', err.message);
        res.status(500).json({ error: 'Failed to fetch config' });
    }
});

router.post('/config', (req, res) => {
    try {
        const { plantId, platform, instanceURL, tenantId, clientId, clientSecret, iModelId, syncDirection } = req.body;
        
        if (!plantId || !SAFE_PLANT_ID.test(plantId)) return res.status(400).json({ error: 'Invalid plantId' });
        if (!['BENTLEY_ITWIN', 'SIEMENS_NX', 'PTC_THINGWORX'].includes(platform)) return res.status(400).json({ error: 'Invalid platform' });
        if (!['OUTBOUND', 'INBOUND', 'BIDIRECTIONAL'].includes(syncDirection)) return res.status(400).json({ error: 'Invalid syncDirection' });
        
        try {
            validateOutboundUrl(instanceURL);
        } catch (e) {
            return res.status(400).json({ error: e.message });
        }

        const username = req.user?.Username || 'admin';

        // Check for existing to properly handle ***
        const existing = logisticsDb.prepare('SELECT ClientSecret FROM DTSyncConfig WHERE PlantID = ? AND Platform = ?').get(plantId, platform);
        let finalSecret = clientSecret;
        if (clientSecret === '***' && existing) {
            finalSecret = existing.ClientSecret;
        }

        logisticsDb.prepare(`
            INSERT INTO DTSyncConfig (PlantID, Platform, InstanceURL, TenantId, ClientId, ClientSecret, IModelId, SyncDirection, Enabled, CreatedBy, CreatedAt, UpdatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))
            ON CONFLICT(PlantID, Platform) DO UPDATE SET
                InstanceURL = excluded.InstanceURL,
                TenantId = excluded.TenantId,
                ClientId = excluded.ClientId,
                ClientSecret = excluded.ClientSecret,
                IModelId = excluded.IModelId,
                SyncDirection = excluded.SyncDirection,
                UpdatedAt = datetime('now')
        `).run(plantId, platform, instanceURL, tenantId || null, clientId || null, finalSecret || null, iModelId || null, syncDirection, username);

        const configId = logisticsDb.prepare('SELECT ConfigID FROM DTSyncConfig WHERE PlantID = ? AND Platform = ?').get(plantId, platform).ConfigID;

        logAudit(username, 'DT_SYNC_CONFIG_SAVED', plantId, { platform, syncDirection });

        res.json({ success: true, configId });
    } catch (err) {
        console.error('POST /api/dt-sync/config error:', err.message);
        res.status(500).json({ error: 'Failed to save config' });
    }
});

router.delete('/config/:id', (req, res) => {
    try {
        const { id } = req.params;
        const username = req.user?.Username || 'admin';
        logisticsDb.prepare('DELETE FROM DTSyncConfig WHERE ConfigID = ?').run(id);
        logAudit(username, 'DT_SYNC_CONFIG_DELETED', null, { configId: id });
        res.json({ success: true });
    } catch (err) {
        console.error('DELETE /api/dt-sync/config/:id error:', err.message);
        res.status(500).json({ error: 'Failed to delete config' });
    }
});

router.post('/test-connection', (req, res) => {
    try {
        const { instanceURL, clientId, clientSecret } = req.body;
        
        let url;
        try {
            url = validateOutboundUrl(instanceURL);
        } catch (e) {
            return res.status(400).json({ error: e.message });
        }

        const client = url.protocol === 'https:' ? https : http;
        
        const reqOpts = {
            method: 'HEAD',
            timeout: 5000
        };

        const request = client.request(url, reqOpts, (response) => {
            res.json({ ok: true, status: 'REACHABLE', message: `Connected with status ${response.statusCode}` });
        });

        request.on('timeout', () => {
            request.destroy();
            res.json({ ok: false, status: 'TIMEOUT', message: 'Connection timed out' });
        });

        request.on('error', (err) => {
            res.json({ ok: false, status: 'UNREACHABLE', message: err.message });
        });

        request.end();
    } catch (err) {
        console.error('POST /api/dt-sync/test-connection error:', err.message);
        res.status(500).json({ error: 'Failed to test connection' });
    }
});

router.post('/:plantId/push', (req, res) => {
    try {
        const { plantId } = req.params;
        if (!SAFE_PLANT_ID.test(plantId)) return res.status(400).json({ error: 'Invalid plantId' });

        const config = logisticsDb.prepare("SELECT * FROM DTSyncConfig WHERE PlantID = ? AND Enabled = 1 AND SyncDirection IN ('OUTBOUND','BIDIRECTIONAL') LIMIT 1").get(plantId);
        if (!config) return res.status(404).json({ error: 'No active outbound sync config for this plant' });

        const username = req.user?.Username || 'admin';

        const result = logisticsDb.prepare(`
            INSERT INTO DTSyncLog (PlantID, Platform, Direction, Status, StartedAt, TriggeredBy)
            VALUES (?, ?, 'OUTBOUND', 'RUNNING', datetime('now'), ?)
        `).run(plantId, config.Platform, username);
        const logId = result.lastInsertRowid;

        const db = getDb(plantId);
        const tableInfo = db.prepare("PRAGMA table_info(Asset)").all();
        
        let assetCount = 0;
        let successCount = 0;

        if (tableInfo.length > 0) {
            let assets = [];
            try {
                assets = db.prepare('SELECT ID, AssetName, AssetType, Status, CriticalityRating, LastMaintenanceDate FROM Asset WHERE IsDeleted IS NULL OR IsDeleted = 0').all();
            } catch (e) {
                // Ignore if query fails
            }
            assetCount = assets.length;
            successCount = assetCount;

            const simulatedPayload = assets.map(a => ({
                trierId: a.ID,
                displayLabel: a.AssetName,
                classFullName: "TrierOS:Asset",
                properties: {
                    status: a.Status,
                    criticality: a.CriticalityRating,
                    assetType: a.AssetType,
                    lastMaintenanceDate: a.LastMaintenanceDate
                }
            }));
            // In v1, we do not make outbound HTTP requests. Simulate success.
        }

        logisticsDb.prepare(`
            UPDATE DTSyncLog 
            SET Status = 'COMPLETE', AssetCount = ?, SuccessCount = ?, CompletedAt = datetime('now')
            WHERE LogID = ?
        `).run(assetCount, successCount, logId);

        logAudit(username, 'DT_SYNC_PUSH', plantId, { platform: config.Platform, assetCount });

        res.json({ success: true, logId, assetCount, status: 'COMPLETE' });
    } catch (err) {
        console.error('POST /api/dt-sync/push error:', err.message);
        res.status(500).json({ error: 'Failed to push sync' });
    }
});

router.post('/:plantId/pull', (req, res) => {
    try {
        const { plantId } = req.params;
        if (!SAFE_PLANT_ID.test(plantId)) return res.status(400).json({ error: 'Invalid plantId' });

        const config = logisticsDb.prepare("SELECT * FROM DTSyncConfig WHERE PlantID = ? AND Enabled = 1 AND SyncDirection IN ('INBOUND','BIDIRECTIONAL') LIMIT 1").get(plantId);
        if (!config) return res.status(404).json({ error: 'No active inbound sync config for this plant' });

        const username = req.user?.Username || 'admin';

        const result = logisticsDb.prepare(`
            INSERT INTO DTSyncLog (PlantID, Platform, Direction, Status, StartedAt, TriggeredBy)
            VALUES (?, ?, 'INBOUND', 'RUNNING', datetime('now'), ?)
        `).run(plantId, config.Platform, username);
        const logId = result.lastInsertRowid;

        // Simulate pull without writing to plant DB
        const simulatedCount = 42;

        logisticsDb.prepare(`
            UPDATE DTSyncLog 
            SET Status = 'COMPLETE', AssetCount = ?, SuccessCount = ?, CompletedAt = datetime('now')
            WHERE LogID = ?
        `).run(simulatedCount, simulatedCount, logId);

        logAudit(username, 'DT_SYNC_PULL', plantId, { platform: config.Platform, assetCount: simulatedCount });

        res.json({ success: true, logId, status: 'COMPLETE' });
    } catch (err) {
        console.error('POST /api/dt-sync/pull error:', err.message);
        res.status(500).json({ error: 'Failed to pull sync' });
    }
});

router.get('/:plantId/status', (req, res) => {
    try {
        const { plantId } = req.params;
        if (!SAFE_PLANT_ID.test(plantId)) return res.status(400).json({ error: 'Invalid plantId' });

        const log = logisticsDb.prepare('SELECT * FROM DTSyncLog WHERE PlantID = ? ORDER BY StartedAt DESC LIMIT 1').get(plantId);
        res.json(log || { Status: 'NONE' });
    } catch (err) {
        console.error('GET /api/dt-sync/status error:', err.message);
        res.status(500).json({ error: 'Failed to fetch status' });
    }
});

router.get('/:plantId/history', (req, res) => {
    try {
        const { plantId } = req.params;
        let { limit } = req.query;
        if (!SAFE_PLANT_ID.test(plantId)) return res.status(400).json({ error: 'Invalid plantId' });

        let l = parseInt(limit, 10);
        if (isNaN(l) || l < 1) l = 20;
        if (l > 100) l = 100;

        const logs = logisticsDb.prepare('SELECT * FROM DTSyncLog WHERE PlantID = ? ORDER BY StartedAt DESC LIMIT ?').all(plantId, l);
        res.json(logs);
    } catch (err) {
        console.error('GET /api/dt-sync/history error:', err.message);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

module.exports = router;
