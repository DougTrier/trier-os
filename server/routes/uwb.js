/**
 * routes/uwb.js
 * --------------
 * UWB/RTLS -- Ultra-Wideband anchor configuration, tag registration, position calculation, and real-time location event streaming.
 *
 * All routes in this file are mounted under /api/ in server/index.js
 * and require a valid JWT Bearer token (enforced by middleware/auth.js)
 * unless explicitly listed in the auth middleware's public allowlist.
 */

// Copyright � 2026 Trier OS. All Rights Reserved.

/**
 * � 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS � Ultra-Wideband (UWB) Indoor Positioning Routes
 * ==========================================================
 * Full REST API for UWB tag registry, live position ingestion,
 * exclusion zone management, safety alerting, coordinate calibration,
 * and lone-worker check-in.
 *
 * All tables live in trier_logistics.db (cross-plant, initialized inline).
 *
 * ENDPOINTS:
 *   GET    /api/uwb/tags                   List tags (filter by ?plantId)
 *   POST   /api/uwb/tags                   Create/upsert tag
 *   PUT    /api/uwb/tags/:tagId            Update tag
 *   DELETE /api/uwb/tags/:tagId            Soft-delete (Active=0)
 *   GET    /api/uwb/tags/:tagId            Single tag with latest position
 *
 * Positions:
 *   GET    /api/uwb/live                   Latest position per active tag (last 60s)
 *   GET    /api/uwb/history/:tagId         Last 100 positions for a tag
 *   POST   /api/uwb/position               Ingest position update (broker)
 *   DELETE /api/uwb/positions              Admin purge positions older than 48h
 *
 * Exclusion Zones:
 *   GET    /api/uwb/zones                  List zones (filter ?plantId,floorId)
 *   POST   /api/uwb/zones                  Create zone
 *   PUT    /api/uwb/zones/:id              Update zone
 *   DELETE /api/uwb/zones/:id              Delete zone
 *   POST   /api/uwb/zones/:id/acknowledge  Acknowledge alerts for a zone
 *
 * Safety Alerts:
 *   GET    /api/uwb/alerts                 List alerts (?plantId, ?unacknowledged)
 *   POST   /api/uwb/alerts                 Insert alert (broker)
 *   PUT    /api/uwb/alerts/:id/acknowledge Acknowledge a single alert
 *
 * Calibration:
 *   GET    /api/uwb/calibration/:floorId   Get floor calibration
 *   PUT    /api/uwb/calibration/:floorId   Upsert floor calibration
 *
 * Lone Worker:
 *   POST   /api/uwb/checkin                Reset lone-worker timer for a tag
 */

const express = require('express');
const router = express.Router();
const { db: logisticsDb, logAudit } = require('../logistics_db');

// -- In-memory lone-worker check-in map ---------------------------------------
// Map<tagId, ISO timestamp>
const loneWorkerCheckins = new Map();

// -- Initialize tables ---------------------------------------------------------
function initUWBTables() {
    logisticsDb.exec(`
        CREATE TABLE IF NOT EXISTS uwb_tags (
            ID          INTEGER PRIMARY KEY AUTOINCREMENT,
            TagID       TEXT UNIQUE NOT NULL,
            EntityType  TEXT,
            EntityID    TEXT,
            PlantID     TEXT,
            Label       TEXT,
            AssignedTo  TEXT,
            AssignedAt  TEXT,
            Active      INTEGER DEFAULT 1,
            Notes       TEXT
        );

        CREATE TABLE IF NOT EXISTS uwb_positions (
            ID       INTEGER PRIMARY KEY AUTOINCREMENT,
            TagID    TEXT NOT NULL,
            X        REAL,
            Y        REAL,
            Z        REAL,
            FloorID  TEXT,
            PlantID  TEXT,
            Quality  REAL,
            Ts       TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS uwb_exclusion_zones (
            ID               INTEGER PRIMARY KEY AUTOINCREMENT,
            PlantID          TEXT,
            FloorID          TEXT,
            Label            TEXT,
            Polygon          TEXT,
            AssetID          TEXT,
            ActiveWhenLotoed INTEGER DEFAULT 0,
            Active           INTEGER DEFAULT 1,
            CreatedAt        TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS uwb_safety_alerts (
            ID           INTEGER PRIMARY KEY AUTOINCREMENT,
            TagID        TEXT,
            ZoneID       INTEGER,
            AlertType    TEXT,
            Message      TEXT,
            PlantID      TEXT,
            Ts           TEXT DEFAULT (datetime('now')),
            Acknowledged INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS uwb_calibration (
            ID        INTEGER PRIMARY KEY AUTOINCREMENT,
            PlantID   TEXT,
            FloorID   TEXT UNIQUE NOT NULL,
            OriginX   REAL DEFAULT 0,
            OriginY   REAL DEFAULT 0,
            ScaleX    REAL DEFAULT 100,
            ScaleY    REAL DEFAULT 100,
            UpdatedAt TEXT DEFAULT (datetime('now'))
        );
    `);
    console.log('[UWB] Tables initialized');
}
initUWBTables();

// -- Tag Registry --------------------------------------------------------------

router.get('/tags', (req, res) => {
    try {
        const { plantId } = req.query;
        let sql = 'SELECT * FROM uwb_tags WHERE 1=1';
        const params = [];
        if (plantId) { sql += ' AND PlantID = ?'; params.push(plantId); }
        sql += ' ORDER BY ID ASC';
        res.json({ tags: logisticsDb.prepare(sql).all(...params) });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch UWB tags: ' });
    }
});

router.post('/tags', (req, res) => {
    try {
        const { tagId, entityType, entityId, plantId, label, assignedTo, notes } = req.body;
        if (!tagId) return res.status(400).json({ error: 'tagId is required' });
        const now = new Date().toISOString();
        logisticsDb.prepare(`
            INSERT INTO uwb_tags (TagID, EntityType, EntityID, PlantID, Label, AssignedTo, AssignedAt, Notes, Active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
            ON CONFLICT(TagID) DO UPDATE SET
                EntityType = excluded.EntityType,
                EntityID   = excluded.EntityID,
                PlantID    = excluded.PlantID,
                Label      = excluded.Label,
                AssignedTo = excluded.AssignedTo,
                AssignedAt = excluded.AssignedAt,
                Notes      = excluded.Notes,
                Active     = 1
        `).run(tagId, entityType || null, entityId || null, plantId || null, label || null, assignedTo || null, now, notes || null);
        try { logAudit('UWB_TAG_CREATED', assignedTo, plantId, { tagId, entityType, entityId }); } catch { /**/ }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create UWB tag: ' });
    }
});

router.put('/tags/:tagId', (req, res) => {
    try {
        const { tagId } = req.params;
        const { entityType, entityId, plantId, label, assignedTo, notes } = req.body;
        const existing = logisticsDb.prepare('SELECT * FROM uwb_tags WHERE TagID = ?').get(tagId);
        if (!existing) return res.status(404).json({ error: 'Tag not found' });
        logisticsDb.prepare(`
            UPDATE uwb_tags SET
                EntityType = COALESCE(?, EntityType),
                EntityID   = COALESCE(?, EntityID),
                PlantID    = COALESCE(?, PlantID),
                Label      = COALESCE(?, Label),
                AssignedTo = COALESCE(?, AssignedTo),
                Notes      = COALESCE(?, Notes)
            WHERE TagID = ?
        `).run(entityType ?? null, entityId ?? null, plantId ?? null, label ?? null, assignedTo ?? null, notes ?? null, tagId);
        try { logAudit('UWB_TAG_UPDATED', assignedTo, plantId, { tagId }); } catch { /**/ }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update UWB tag: ' });
    }
});

router.delete('/tags/:tagId', (req, res) => {
    try {
        const { tagId } = req.params;
        const existing = logisticsDb.prepare('SELECT * FROM uwb_tags WHERE TagID = ?').get(tagId);
        if (!existing) return res.status(404).json({ error: 'Tag not found' });
        logisticsDb.prepare('UPDATE uwb_tags SET Active = 0 WHERE TagID = ?').run(tagId);
        try { logAudit('UWB_TAG_DEACTIVATED', null, existing.PlantID, { tagId }); } catch { /**/ }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to deactivate UWB tag: ' });
    }
});

router.get('/tags/:tagId', (req, res) => {
    try {
        const { tagId } = req.params;
        const tag = logisticsDb.prepare('SELECT * FROM uwb_tags WHERE TagID = ?').get(tagId);
        if (!tag) return res.status(404).json({ error: 'Tag not found' });
        const latest = logisticsDb.prepare(
            'SELECT * FROM uwb_positions WHERE TagID = ? ORDER BY Ts DESC LIMIT 1'
        ).get(tagId);
        res.json({ ...tag, latestPosition: latest || null });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch UWB tag: ' });
    }
});

// -- Positions -----------------------------------------------------------------

router.get('/live', (req, res) => {
    try {
        const { plantId, floorId } = req.query;
        let sql = `
            SELECT p.*, t.Label, t.EntityType, t.EntityID, t.AssignedTo
            FROM uwb_positions p
            INNER JOIN uwb_tags t ON t.TagID = p.TagID AND t.Active = 1
            WHERE p.Ts >= datetime('now', '-60 seconds')
              AND p.ID IN (
                  SELECT MAX(ID) FROM uwb_positions
                  WHERE Ts >= datetime('now', '-60 seconds')
                  GROUP BY TagID
              )
        `;
        const params = [];
        if (plantId) { sql += ' AND p.PlantID = ?'; params.push(plantId); }
        if (floorId) { sql += ' AND p.FloorID = ?'; params.push(floorId); }
        sql += ' ORDER BY p.Ts DESC';
        res.json(logisticsDb.prepare(sql).all(...params));
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch live positions: ' });
    }
});

router.get('/history/:tagId', (req, res) => {
    try {
        const rows = logisticsDb.prepare(
            'SELECT * FROM uwb_positions WHERE TagID = ? ORDER BY Ts DESC LIMIT 100'
        ).all(req.params.tagId);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch position history: ' });
    }
});

router.post('/position', (req, res) => {
    try {
        const { tagId, x, y, z, floorId, plantId, quality } = req.body;
        if (!tagId || x == null || y == null) {
            return res.status(400).json({ error: 'tagId, x, and y are required' });
        }
        logisticsDb.prepare(
            'INSERT INTO uwb_positions (TagID, X, Y, Z, FloorID, PlantID, Quality) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(tagId, x, y, z ?? null, floorId || null, plantId || null, quality ?? null);
        // Prune positions older than 24h for this tag
        logisticsDb.prepare(
            `DELETE FROM uwb_positions WHERE TagID = ? AND Ts < datetime('now', '-24 hours')`
        ).run(tagId);
        res.status(204).end();
    } catch (err) {
        res.status(500).json({ error: 'Failed to ingest position: ' });
    }
});

router.delete('/positions', (req, res) => {
    try {
        const result = logisticsDb.prepare(
            `DELETE FROM uwb_positions WHERE Ts < datetime('now', '-48 hours')`
        ).run();
        res.json({ success: true, deleted: result.changes });
    } catch (err) {
        res.status(500).json({ error: 'Failed to purge positions: ' });
    }
});

// -- Exclusion Zones -----------------------------------------------------------

router.get('/zones', (req, res) => {
    try {
        const { plantId, floorId } = req.query;
        let sql = 'SELECT * FROM uwb_exclusion_zones WHERE 1=1';
        const params = [];
        if (plantId) { sql += ' AND PlantID = ?'; params.push(plantId); }
        if (floorId) { sql += ' AND FloorID = ?'; params.push(floorId); }
        sql += ' ORDER BY ID ASC';
        res.json({ zones: logisticsDb.prepare(sql).all(...params) });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch exclusion zones: ' });
    }
});

router.post('/zones', (req, res) => {
    try {
        const { plantId, floorId, label, polygon, assetId, activeWhenLotoed } = req.body;
        if (!plantId || !polygon) return res.status(400).json({ error: 'plantId and polygon are required' });
        const result = logisticsDb.prepare(
            'INSERT INTO uwb_exclusion_zones (PlantID, FloorID, Label, Polygon, AssetID, ActiveWhenLotoed) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(plantId, floorId || null, label || null, typeof polygon === 'string' ? polygon : JSON.stringify(polygon), assetId || null, activeWhenLotoed ? 1 : 0);
        res.json({ success: true, id: result.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create exclusion zone: ' });
    }
});

router.put('/zones/:id', (req, res) => {
    try {
        const { label, polygon, assetId, activeWhenLotoed, active } = req.body;
        const polygonStr = polygon != null ? (typeof polygon === 'string' ? polygon : JSON.stringify(polygon)) : null;
        logisticsDb.prepare(`
            UPDATE uwb_exclusion_zones SET
                Label            = COALESCE(?, Label),
                Polygon          = COALESCE(?, Polygon),
                AssetID          = COALESCE(?, AssetID),
                ActiveWhenLotoed = COALESCE(?, ActiveWhenLotoed),
                Active           = COALESCE(?, Active)
            WHERE ID = ?
        `).run(label ?? null, polygonStr, assetId ?? null, activeWhenLotoed != null ? (activeWhenLotoed ? 1 : 0) : null, active != null ? (active ? 1 : 0) : null, req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update exclusion zone: ' });
    }
});

router.delete('/zones/:id', (req, res) => {
    try {
        logisticsDb.prepare('DELETE FROM uwb_exclusion_zones WHERE ID = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete exclusion zone: ' });
    }
});

router.post('/zones/:id/acknowledge', (req, res) => {
    try {
        const result = logisticsDb.prepare(
            'UPDATE uwb_safety_alerts SET Acknowledged = 1 WHERE ZoneID = ? AND Acknowledged = 0'
        ).run(req.params.id);
        res.json({ success: true, acknowledged: result.changes });
    } catch (err) {
        res.status(500).json({ error: 'Failed to acknowledge zone alerts: ' });
    }
});

// -- Safety Alerts -------------------------------------------------------------

router.get('/alerts', (req, res) => {
    try {
        const { plantId, unacknowledged, active } = req.query;
        let sql = 'SELECT * FROM uwb_safety_alerts WHERE 1=1';
        const params = [];
        if (plantId) { sql += ' AND PlantID = ?'; params.push(plantId); }
        if (unacknowledged === 'true' || active === 'true') { sql += ' AND Acknowledged = 0'; }
        sql += ' ORDER BY Ts DESC LIMIT 500';
        res.json({ alerts: logisticsDb.prepare(sql).all(...params) });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch safety alerts: ' });
    }
});

router.post('/alerts', (req, res) => {
    try {
        const { tagId, zoneId, alertType, message, plantId } = req.body;
        if (!tagId || !alertType) return res.status(400).json({ error: 'tagId and alertType are required' });
        const result = logisticsDb.prepare(
            'INSERT INTO uwb_safety_alerts (TagID, ZoneID, AlertType, Message, PlantID) VALUES (?, ?, ?, ?, ?)'
        ).run(tagId, zoneId ?? null, alertType, message || null, plantId || null);
        res.json({ success: true, id: result.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ error: 'Failed to insert safety alert: ' });
    }
});

const _ackAlert = (req, res) => {
    try {
        const result = logisticsDb.prepare(
            'UPDATE uwb_safety_alerts SET Acknowledged = 1 WHERE ID = ?'
        ).run(req.params.id);
        if (!result.changes) return res.status(404).json({ error: 'Alert not found' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to acknowledge alert: ' });
    }
};
router.put('/alerts/:id/acknowledge', _ackAlert);
router.post('/alerts/:id/acknowledge', _ackAlert);

// -- Coordinate Calibration ----------------------------------------------------

router.get('/calibration/:floorId', (req, res) => {
    try {
        const row = logisticsDb.prepare('SELECT * FROM uwb_calibration WHERE FloorID = ?').get(req.params.floorId);
        // Return defaults when no calibration has been saved yet � 404 would be misleading
        res.json(row || { FloorID: req.params.floorId, OriginX: 0, OriginY: 0, ScaleX: 100, ScaleY: 100 });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch calibration: ' });
    }
});

router.put('/calibration/:floorId', (req, res) => {
    try {
        const { floorId } = req.params;
        const { plantId, originX, originY, scaleX, scaleY } = req.body;
        logisticsDb.prepare(`
            INSERT INTO uwb_calibration (PlantID, FloorID, OriginX, OriginY, ScaleX, ScaleY, UpdatedAt)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(FloorID) DO UPDATE SET
                PlantID   = excluded.PlantID,
                OriginX   = excluded.OriginX,
                OriginY   = excluded.OriginY,
                ScaleX    = excluded.ScaleX,
                ScaleY    = excluded.ScaleY,
                UpdatedAt = excluded.UpdatedAt
        `).run(plantId || null, floorId, originX ?? 0, originY ?? 0, scaleX ?? 100, scaleY ?? 100);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save calibration: ' });
    }
});

// -- Lone Worker Check-in ------------------------------------------------------

router.post('/checkin', (req, res) => {
    try {
        const { tagId } = req.body;
        if (!tagId) return res.status(400).json({ error: 'tagId is required' });
        const now = new Date().toISOString();
        loneWorkerCheckins.set(tagId, now);
        res.json({ success: true, tagId, checkedInAt: now });
    } catch (err) {
        res.status(500).json({ error: 'Failed to record check-in: ' });
    }
});

// Expose the check-in map for the broker to query lone-worker status
router.loneWorkerCheckins = loneWorkerCheckins;

module.exports = router;
