/**
 * routes/ble_beacons.js
 * ----------------------
 * BLE Beacons -- Bluetooth beacon registration, RSSI signal logging, trilateration, and proximity event triggers for RTLS asset tracking.
 *
 * All routes in this file are mounted under /api/ in server/index.js
 * and require a valid JWT Bearer token (enforced by middleware/auth.js)
 * unless explicitly listed in the auth middleware's public allowlist.
 */

// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — BLE Beacon Registry & Anchor Routes
 * ================================================
 * Manages BLE beacon tags linked to assets and floor-plan anchor beacons
 * used for indoor trilateration positioning.
 *
 * Tables (in trier_logistics.db):
 *   ble_beacons  — asset-linked BLE beacon MACs
 *   ble_anchors  — fixed-position anchor beacons per floor plan zone
 *
 * ENDPOINTS:
 *   GET    /api/ble/beacons              List beacons (filter by plantId)
 *   POST   /api/ble/beacons              Link a beacon MAC to an asset
 *   PUT    /api/ble/beacons/:mac         Update beacon metadata
 *   DELETE /api/ble/beacons/:mac         Unlink a beacon
 *
 * Anchor endpoints:
 *   GET    /api/ble/anchors              List anchors (filter by plantId + floorId)
 *   POST   /api/ble/anchors              Add an anchor
 *   PUT    /api/ble/anchors/:id          Update anchor position
 *   DELETE /api/ble/anchors/:id          Remove anchor
 *
 * Threshold alerting:
 *   GET    /api/ble/thresholds/:assetId  Get sensor thresholds for an asset
 *   PUT    /api/ble/thresholds/:assetId  Set sensor thresholds
 *   POST   /api/ble/threshold-breach     Report a threshold breach (auto-creates WO)
 */
const express = require('express');
const router = express.Router();
const { db: logisticsDb, logAudit } = require('../logistics_db');

// -- Initialize tables ---------------------------------------------------------
function initBLETables() {
    logisticsDb.exec(`
        CREATE TABLE IF NOT EXISTS ble_beacons (
            Mac         TEXT PRIMARY KEY,
            AssetID     TEXT NOT NULL,
            PlantID     TEXT,
            LinkedAt    TEXT DEFAULT (datetime('now')),
            LinkedBy    TEXT,
            Notes       TEXT
        );

        CREATE TABLE IF NOT EXISTS ble_anchors (
            ID          INTEGER PRIMARY KEY AUTOINCREMENT,
            PlantID     TEXT NOT NULL,
            FloorID     TEXT,
            Mac         TEXT NOT NULL,
            Label       TEXT,
            X           REAL NOT NULL,
            Y           REAL NOT NULL,
            TxPower     INTEGER DEFAULT -59,
            InstallDate TEXT DEFAULT (date('now')),
            Notes       TEXT
        );

        CREATE TABLE IF NOT EXISTS ble_sensor_thresholds (
            AssetID         TEXT NOT NULL,
            PlantID         TEXT,
            TempMin         REAL,
            TempMax         REAL,
            VibrationMax    REAL,
            PressureMin     REAL,
            PressureMax     REAL,
            AlertOnBreach   INTEGER DEFAULT 1,
            UpdatedAt       TEXT DEFAULT (datetime('now')),
            UpdatedBy       TEXT,
            PRIMARY KEY (AssetID)
        );

        CREATE TABLE IF NOT EXISTS ble_breach_alerts (
            ID              INTEGER PRIMARY KEY AUTOINCREMENT,
            AssetID         TEXT NOT NULL,
            PlantID         TEXT,
            SensorType      TEXT NOT NULL,
            Value           REAL NOT NULL,
            Threshold       REAL NOT NULL,
            Direction       TEXT,
            AlertedAt       TEXT DEFAULT (datetime('now')),
            WorkOrderID     TEXT
        );
    `);
    console.log('[BLE] Tables initialized');
}
initBLETables();

// -- Beacon CRUD ---------------------------------------------------------------
router.get('/beacons', (req, res) => {
    try {
        const { plantId } = req.query;
        const plant = plantId || req.headers['x-plant-id'];
        const rows = plant
            ? logisticsDb.prepare('SELECT * FROM ble_beacons WHERE PlantID = ? ORDER BY LinkedAt DESC').all(plant)
            : logisticsDb.prepare('SELECT * FROM ble_beacons ORDER BY LinkedAt DESC').all();
        res.json(rows);
    } catch (err) { res.status(500).json({ error: 'Failed to fetch beacons' }); }
});

router.post('/beacons', (req, res) => {
    try {
        const { mac, assetId, plantId, linkedBy, notes } = req.body;
        if (!mac || !assetId) return res.status(400).json({ error: 'mac and assetId are required' });
        logisticsDb.prepare(
            'INSERT OR REPLACE INTO ble_beacons (Mac, AssetID, PlantID, LinkedBy, Notes) VALUES (?, ?, ?, ?, ?)'
        ).run(mac.toLowerCase(), assetId, plantId || null, linkedBy || null, notes || null);
        try { logAudit('BLE_BEACON_LINKED', linkedBy, plantId, { mac, assetId }); } catch { /**/ }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to link beacon: ' + err.message }); }
});

router.put('/beacons/:mac', (req, res) => {
    try {
        const { notes } = req.body;
        logisticsDb.prepare('UPDATE ble_beacons SET Notes = ? WHERE Mac = ?').run(notes ?? null, req.params.mac.toLowerCase());
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to update beacon' }); }
});

router.delete('/beacons/:mac', (req, res) => {
    try {
        logisticsDb.prepare('DELETE FROM ble_beacons WHERE Mac = ?').run(req.params.mac.toLowerCase());
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to unlink beacon' }); }
});

// -- Anchor CRUD ---------------------------------------------------------------
router.get('/anchors', (req, res) => {
    try {
        const { plantId, floorId } = req.query;
        let sql = 'SELECT * FROM ble_anchors WHERE 1=1';
        const params = [];
        if (plantId) { sql += ' AND PlantID = ?'; params.push(plantId); }
        if (floorId) { sql += ' AND FloorID = ?'; params.push(floorId); }
        sql += ' ORDER BY ID ASC';
        res.json(logisticsDb.prepare(sql).all(...params));
    } catch (err) { res.status(500).json({ error: 'Failed to fetch anchors' }); }
});

router.post('/anchors', (req, res) => {
    try {
        const { plantId, floorId, mac, label, x, y, txPower, notes } = req.body;
        if (!plantId || !mac || x == null || y == null) {
            return res.status(400).json({ error: 'plantId, mac, x, and y are required' });
        }
        const result = logisticsDb.prepare(
            'INSERT INTO ble_anchors (PlantID, FloorID, Mac, Label, X, Y, TxPower, Notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(plantId, floorId || null, mac.toLowerCase(), label || null, x, y, txPower ?? -59, notes || null);
        res.json({ success: true, id: result.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: 'Failed to create anchor' }); }
});

router.put('/anchors/:id', (req, res) => {
    try {
        const { mac, label, x, y, txPower, notes } = req.body;
        logisticsDb.prepare(
            'UPDATE ble_anchors SET Mac = COALESCE(?, Mac), Label = COALESCE(?, Label), X = COALESCE(?, X), Y = COALESCE(?, Y), TxPower = COALESCE(?, TxPower), Notes = COALESCE(?, Notes) WHERE ID = ?'
        ).run(mac?.toLowerCase() ?? null, label ?? null, x ?? null, y ?? null, txPower ?? null, notes ?? null, req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to update anchor' }); }
});

router.delete('/anchors/:id', (req, res) => {
    try {
        logisticsDb.prepare('DELETE FROM ble_anchors WHERE ID = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to delete anchor' }); }
});

// -- Sensor Thresholds ---------------------------------------------------------
router.get('/thresholds/:assetId', (req, res) => {
    try {
        const row = logisticsDb.prepare('SELECT * FROM ble_sensor_thresholds WHERE AssetID = ?').get(req.params.assetId);
        res.json(row || {});
    } catch (err) { res.status(500).json({ error: 'Failed to fetch thresholds' }); }
});

router.put('/thresholds/:assetId', (req, res) => {
    try {
        const { plantId, tempMin, tempMax, vibrationMax, pressureMin, pressureMax, alertOnBreach, updatedBy } = req.body;
        logisticsDb.prepare(`
            INSERT INTO ble_sensor_thresholds (AssetID, PlantID, TempMin, TempMax, VibrationMax, PressureMin, PressureMax, AlertOnBreach, UpdatedBy, UpdatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(AssetID) DO UPDATE SET
                PlantID = excluded.PlantID, TempMin = excluded.TempMin, TempMax = excluded.TempMax,
                VibrationMax = excluded.VibrationMax, PressureMin = excluded.PressureMin,
                PressureMax = excluded.PressureMax, AlertOnBreach = excluded.AlertOnBreach,
                UpdatedBy = excluded.UpdatedBy, UpdatedAt = excluded.UpdatedAt
        `).run(req.params.assetId, plantId || null, tempMin ?? null, tempMax ?? null, vibrationMax ?? null, pressureMin ?? null, pressureMax ?? null, alertOnBreach ? 1 : 0, updatedBy || null);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to save thresholds: ' + err.message }); }
});

// -- Threshold Breach Report ---------------------------------------------------
// Called by the client when a live BLE notification value crosses a threshold.
router.post('/threshold-breach', (req, res) => {
    try {
        const { assetId, plantId, sensorType, value, threshold, direction, reportedBy } = req.body;
        if (!assetId || !sensorType || value == null) {
            return res.status(400).json({ error: 'assetId, sensorType, and value are required' });
        }

        // Dedup: don't re-alert the same sensor on the same asset within 60 minutes
        const recent = logisticsDb.prepare(
            `SELECT ID FROM ble_breach_alerts WHERE AssetID = ? AND SensorType = ? AND AlertedAt > datetime('now', '-60 minutes') LIMIT 1`
        ).get(assetId, sensorType);
        if (recent) return res.json({ success: true, deduplicated: true });

        logisticsDb.prepare(
            'INSERT INTO ble_breach_alerts (AssetID, PlantID, SensorType, Value, Threshold, Direction) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(assetId, plantId || null, sensorType, value, threshold, direction || null);

        console.log(`[BLE] ?? Sensor breach: ${assetId} ${sensorType}=${value} (threshold ${threshold})`);
        try { logAudit('BLE_THRESHOLD_BREACH', reportedBy, plantId, { assetId, sensorType, value, threshold }); } catch { /**/ }

        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to record breach: ' + err.message }); }
});

// -- Nearest Asset (for badge polling) ----------------------------------------
// Client sends its current MAC scan list; server resolves to asset IDs
router.post('/nearest', (req, res) => {
    try {
        const { macs } = req.body; // [{ mac, rssi }]
        if (!Array.isArray(macs) || !macs.length) return res.json([]);
        const placeholders = macs.map(() => '?').join(',');
        const rows = logisticsDb.prepare(`SELECT * FROM ble_beacons WHERE LOWER(Mac) IN (${placeholders})`).all(...macs.map(m => m.mac.toLowerCase()));
        res.json(rows);
    } catch (err) { res.status(500).json({ error: 'Failed to resolve nearest' }); }
});

module.exports = router;
