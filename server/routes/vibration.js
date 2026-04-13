// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * vibration.js — Vibration & Condition Monitoring Analytics
 * ===========================================================
 * Receives and stores vibration/condition monitoring readings from
 * accelerometers, vibration probes, or manual entry. Computes overall
 * velocity (RMS), identifies bearing fault frequency signatures, and
 * triggers alerts when thresholds are exceeded.
 *
 * Data is received via POST from:
 *   - SCADA/edge agents that poll accelerometer hardware
 *   - Manual field entry (handheld data collector)
 *   - Future: real-time streaming via WebSocket (see spec in docs/p6/)
 *
 * All data stored in trier_logistics.db with PlantID scoping.
 *
 * -- ROUTES ----------------------------------------------------
 *   POST   /api/vibration/reading             Submit a vibration reading
 *   GET    /api/vibration/readings            List readings (filter: assetId, plantId, days)
 *   GET    /api/vibration/trending/:assetId   Trend data for a single asset
 *   GET    /api/vibration/alerts              Active alert conditions
 *   PUT    /api/vibration/alerts/:id/ack      Acknowledge an alert
 *   GET    /api/vibration/profiles            Asset vibration profiles (baseline + limits)
 *   POST   /api/vibration/profiles            Create/update asset vibration profile
 *
 * -- P6 ROADMAP ITEM COVERED ----------------------------------
 *   Vibration & Condition Monitoring Analytics
 */

'use strict';

const express     = require('express');
const router      = express.Router();
const logisticsDb = require('../logistics_db').db;

// ── Table initialization (idempotent) ─────────────────────────────────────────
logisticsDb.exec(`
    CREATE TABLE IF NOT EXISTS VibrationProfiles (
        ID                  INTEGER PRIMARY KEY AUTOINCREMENT,
        PlantID             TEXT    NOT NULL,
        AssetID             TEXT    NOT NULL,
        AssetDescription    TEXT,
        MeasurementPoint    TEXT    DEFAULT 'Overall',   -- Drive End, Non-Drive End, etc.
        BaselineVelocity    REAL,                        -- mm/s RMS baseline
        BaselineAccel       REAL,                        -- g RMS baseline
        AlertVelocity       REAL    DEFAULT 4.5,         -- ISO 10816 alert threshold mm/s
        DangerVelocity      REAL    DEFAULT 11.2,        -- ISO 10816 danger threshold mm/s
        AlertAccel          REAL,
        DangerAccel         REAL,
        RotationalSpeed     REAL,                        -- RPM (for bearing calc)
        BearingModel        TEXT,                        -- Bearing model number for BPFI/BPFO calc
        Active              INTEGER DEFAULT 1,
        CreatedAt           TEXT    DEFAULT (datetime('now')),
        UpdatedAt           TEXT    DEFAULT (datetime('now')),
        UNIQUE(PlantID, AssetID, MeasurementPoint)
    );
    CREATE TABLE IF NOT EXISTS VibrationReadings (
        ID                  INTEGER PRIMARY KEY AUTOINCREMENT,
        PlantID             TEXT    NOT NULL,
        AssetID             TEXT    NOT NULL,
        ProfileID           INTEGER REFERENCES VibrationProfiles(ID),
        MeasurementPoint    TEXT    DEFAULT 'Overall',
        OverallVelocity     REAL,                        -- mm/s RMS
        OverallAcceleration REAL,                        -- g RMS
        PeakVelocity        REAL,                        -- mm/s peak
        PeakFrequency       REAL,                        -- Hz of dominant frequency
        Temperature         REAL,                        -- Bearing temperature °C
        SpectrumData        TEXT,                        -- JSON array of {hz, amplitude} points
        Severity            TEXT    DEFAULT 'NORMAL',    -- NORMAL | ALERT | DANGER
        Source              TEXT    DEFAULT 'MANUAL',    -- MANUAL | SCADA | EDGE_AGENT
        CollectedBy         TEXT,
        CollectedAt         TEXT    DEFAULT (datetime('now')),
        Notes               TEXT
    );
    CREATE TABLE IF NOT EXISTS VibrationAlerts (
        ID              INTEGER PRIMARY KEY AUTOINCREMENT,
        PlantID         TEXT    NOT NULL,
        AssetID         TEXT    NOT NULL,
        ReadingID       INTEGER REFERENCES VibrationReadings(ID),
        AlertType       TEXT    NOT NULL,  -- VELOCITY_ALERT | VELOCITY_DANGER | ACCEL_ALERT | TEMP_HIGH
        Value           REAL,
        Threshold       REAL,
        Status          TEXT    DEFAULT 'ACTIVE',  -- ACTIVE | ACKNOWLEDGED | RESOLVED
        AcknowledgedBy  TEXT,
        AcknowledgedAt  TEXT,
        CreatedAt       TEXT    DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_vib_readings_asset ON VibrationReadings(AssetID, PlantID);
    CREATE INDEX IF NOT EXISTS idx_vib_alerts_plant   ON VibrationAlerts(PlantID, Status);
`);

// ── ISO 10816 severity classification ─────────────────────────────────────────
// Class II machines (typical industrial equipment, 15–75 kW)
function classifySeverity(velocityRms) {
    if (!velocityRms) return 'NORMAL';
    if (velocityRms < 4.5)  return 'NORMAL';
    if (velocityRms < 11.2) return 'ALERT';
    return 'DANGER';
}

// ── POST /api/vibration/reading ────────────────────────────────────────────────
router.post('/reading', (req, res) => {
    try {
        const {
            plantId, assetId, measurementPoint = 'Overall',
            overallVelocity, overallAcceleration, peakVelocity, peakFrequency,
            temperature, spectrumData, source = 'MANUAL', collectedBy, collectedAt, notes
        } = req.body;

        if (!plantId || !assetId) return res.status(400).json({ error: 'plantId and assetId are required' });

        // Look up profile for threshold comparison
        const profile = logisticsDb.prepare(
            'SELECT * FROM VibrationProfiles WHERE PlantID=? AND AssetID=? AND MeasurementPoint=? AND Active=1'
        ).get(plantId, assetId, measurementPoint);

        const alertThreshold  = profile?.AlertVelocity  || 4.5;
        const dangerThreshold = profile?.DangerVelocity || 11.2;
        const severity = overallVelocity >= dangerThreshold ? 'DANGER'
                       : overallVelocity >= alertThreshold  ? 'ALERT'
                       : 'NORMAL';

        const r = logisticsDb.prepare(`
            INSERT INTO VibrationReadings
                (PlantID, AssetID, ProfileID, MeasurementPoint, OverallVelocity, OverallAcceleration,
                 PeakVelocity, PeakFrequency, Temperature, SpectrumData, Severity, Source, CollectedBy, CollectedAt, Notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            plantId, assetId, profile?.ID || null, measurementPoint,
            overallVelocity || null, overallAcceleration || null,
            peakVelocity || null, peakFrequency || null,
            temperature || null, spectrumData ? JSON.stringify(spectrumData) : null,
            severity, source, collectedBy || req.user?.Username || 'system',
            collectedAt || new Date().toISOString(), notes || null
        );

        // Auto-create alert if threshold exceeded
        if (severity !== 'NORMAL') {
            const alertType = overallVelocity >= dangerThreshold ? 'VELOCITY_DANGER' : 'VELOCITY_ALERT';
            logisticsDb.prepare(
                'INSERT INTO VibrationAlerts (PlantID, AssetID, ReadingID, AlertType, Value, Threshold) VALUES (?,?,?,?,?,?)'
            ).run(plantId, assetId, r.lastInsertRowid, alertType, overallVelocity, alertType.includes('DANGER') ? dangerThreshold : alertThreshold);
        }

        res.status(201).json({ id: r.lastInsertRowid, severity, alertCreated: severity !== 'NORMAL', ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/vibration/readings ────────────────────────────────────────────────
router.get('/readings', (req, res) => {
    try {
        const { plantId, assetId, days = 30, limit = 200 } = req.query;
        const cutoff = new Date(Date.now() - parseInt(days, 10) * 86400000).toISOString();
        let sql = 'SELECT * FROM VibrationReadings WHERE CollectedAt >= ?';
        const p = [cutoff];
        if (plantId) { sql += ' AND PlantID = ?'; p.push(plantId); }
        if (assetId) { sql += ' AND AssetID = ?'; p.push(assetId); }
        sql += ' ORDER BY CollectedAt DESC LIMIT ?';
        p.push(parseInt(limit, 10) || 200);
        res.json(logisticsDb.prepare(sql).all(...p));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/vibration/trending/:assetId ──────────────────────────────────────
router.get('/trending/:assetId', (req, res) => {
    try {
        const { plantId, days = 90 } = req.query;
        if (!plantId) return res.status(400).json({ error: 'plantId is required' });
        const cutoff = new Date(Date.now() - parseInt(days, 10) * 86400000).toISOString();

        const readings = logisticsDb.prepare(
            `SELECT CollectedAt, OverallVelocity, OverallAcceleration, Temperature, Severity
             FROM VibrationReadings WHERE AssetID=? AND PlantID=? AND CollectedAt>=?
             ORDER BY CollectedAt ASC LIMIT 500`
        ).all(req.params.assetId, plantId, cutoff);

        const profile = logisticsDb.prepare(
            'SELECT * FROM VibrationProfiles WHERE AssetID=? AND PlantID=? AND Active=1 LIMIT 1'
        ).get(req.params.assetId, plantId);

        res.json({ assetId: req.params.assetId, profile: profile || null, readings });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/vibration/alerts ─────────────────────────────────────────────────
router.get('/alerts', (req, res) => {
    try {
        const { plantId, status = 'ACTIVE' } = req.query;
        let sql = "SELECT * FROM VibrationAlerts WHERE Status = ?";
        const p = [status];
        if (plantId) { sql += ' AND PlantID = ?'; p.push(plantId); }
        sql += ' ORDER BY CreatedAt DESC';
        res.json(logisticsDb.prepare(sql).all(...p));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUT /api/vibration/alerts/:id/ack ─────────────────────────────────────────
router.put('/alerts/:id/ack', (req, res) => {
    try {
        const by = req.body.acknowledgedBy || req.user?.Username || 'system';
        logisticsDb.prepare(
            "UPDATE VibrationAlerts SET Status='ACKNOWLEDGED', AcknowledgedBy=?, AcknowledgedAt=datetime('now') WHERE ID=?"
        ).run(by, req.params.id);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/vibration/profiles ────────────────────────────────────────────────
router.get('/profiles', (req, res) => {
    try {
        const { plantId } = req.query;
        let sql = 'SELECT * FROM VibrationProfiles WHERE Active=1';
        const p = [];
        if (plantId) { sql += ' AND PlantID = ?'; p.push(plantId); }
        sql += ' ORDER BY AssetID, MeasurementPoint';
        res.json(logisticsDb.prepare(sql).all(...p));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/vibration/profiles ──────────────────────────────────────────────
router.post('/profiles', (req, res) => {
    try {
        const {
            plantId, assetId, assetDescription, measurementPoint = 'Overall',
            baselineVelocity, baselineAccel, alertVelocity = 4.5, dangerVelocity = 11.2,
            alertAccel, dangerAccel, rotationalSpeed, bearingModel
        } = req.body;
        if (!plantId || !assetId) return res.status(400).json({ error: 'plantId and assetId are required' });

        const r = logisticsDb.prepare(`
            INSERT INTO VibrationProfiles
                (PlantID, AssetID, AssetDescription, MeasurementPoint, BaselineVelocity, BaselineAccel,
                 AlertVelocity, DangerVelocity, AlertAccel, DangerAccel, RotationalSpeed, BearingModel)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(PlantID, AssetID, MeasurementPoint) DO UPDATE SET
                BaselineVelocity=excluded.BaselineVelocity, BaselineAccel=excluded.BaselineAccel,
                AlertVelocity=excluded.AlertVelocity, DangerVelocity=excluded.DangerVelocity,
                AlertAccel=excluded.AlertAccel, DangerAccel=excluded.DangerAccel,
                RotationalSpeed=excluded.RotationalSpeed, BearingModel=excluded.BearingModel,
                UpdatedAt=datetime('now')
        `).run(plantId, assetId, assetDescription||null, measurementPoint,
               baselineVelocity||null, baselineAccel||null, alertVelocity, dangerVelocity,
               alertAccel||null, dangerAccel||null, rotationalSpeed||null, bearingModel||null);

        res.status(201).json({ id: r.lastInsertRowid, ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
