// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * baseline_engine.js — Plant Behavioral Baseline Engine
 * =======================================================
 * Computes deterministic per-asset behavioral baselines from historical
 * Work Order and sensor data. Surfaces drift conditions when an asset's
 * recent behavior deviates significantly from its established baseline —
 * no black-box ML, only descriptive statistics from data already in the DB.
 *
 * Baselines computed:
 *   - Failure frequency (unplanned WOs per 90-day window)
 *   - Mean labor hours per WO close
 *   - Mean downtime cost per failure event
 *   - MTBF (days between unplanned failures)
 *
 * Drift detection: a metric is flagged when the 30-day rolling value
 * deviates more than one standard deviation from the 12-month baseline.
 * This is a statistical alarm, not a prediction.
 *
 * Baselines are stored in trier_logistics.db so the corporate view can
 * show cross-plant drift without querying every plant DB on the fly.
 *
 * -- ROUTES ----------------------------------------------------
 *   GET    /api/baseline/asset/:id        Baseline profile for one asset
 *   GET    /api/baseline/drift            Assets currently showing drift (plant-scoped)
 *   POST   /api/baseline/recalculate      Recalculate baselines for a plant
 *   GET    /api/baseline/dashboard        Drift summary counts per plant
 *
 * -- P7 ROADMAP ITEM COVERED ----------------------------------
 *   Plant Behavioral Baseline Engine
 */

'use strict';

const express     = require('express');
const router      = express.Router();
const logisticsDb = require('../logistics_db').db;
const db          = require('../database');

// ── Table initialization (idempotent) ─────────────────────────────────────────
logisticsDb.exec(`
    CREATE TABLE IF NOT EXISTS AssetBaselines (
        ID                  INTEGER PRIMARY KEY AUTOINCREMENT,
        PlantID             TEXT    NOT NULL,
        AssetID             TEXT    NOT NULL,
        AssetName           TEXT,
        BaselineWindowDays  INTEGER DEFAULT 365,
        FailureFreq         REAL,    -- Unplanned WOs per 90-day window (baseline)
        MeanLaborHours      REAL,    -- Avg actual hours per completed WO
        MeanDowntimeCost    REAL,    -- Avg downtime cost per failure WO
        MtbfDays            REAL,    -- Mean time between unplanned failures
        StdDevLaborHours    REAL,
        StdDevDowntimeCost  REAL,
        SampleSize          INTEGER, -- Number of WOs used
        RecentFailureFreq   REAL,    -- Last 30 days — used for drift comparison
        RecentLaborHours    REAL,
        DriftFlags          TEXT,    -- JSON array: which metrics are drifting
        DriftSeverity       TEXT    DEFAULT 'NONE', -- NONE | WARNING | ALERT
        CalculatedAt        TEXT    DEFAULT (datetime('now')),
        UNIQUE(PlantID, AssetID)
    );
    CREATE INDEX IF NOT EXISTS idx_baseline_plant  ON AssetBaselines(PlantID);
    CREATE INDEX IF NOT EXISTS idx_baseline_drift  ON AssetBaselines(DriftSeverity);
`);

// ── Baseline calculation helper ───────────────────────────────────────────────
function calcStats(values) {
    if (!values.length) return { mean: null, stdDev: null };
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    return { mean: Math.round(mean * 100) / 100, stdDev: Math.round(Math.sqrt(variance) * 100) / 100 };
}

function computeBaseline(conn, assetId, plantId) {
    const STATUS_COMPLETED = 40;
    const cutoff365 = new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0];
    const cutoff30  = new Date(Date.now() -  30 * 86400000).toISOString().split('T')[0];

    // 12-month WO history for this asset (unplanned + completed)
    let wos = [];
    try {
        wos = conn.prepare(`
            SELECT CompDate, ActualHours, DowntimeCost, WOSource
            FROM Work
            WHERE AstID = ? AND StatusID = ${STATUS_COMPLETED}
              AND CompDate >= ? AND CompDate IS NOT NULL
            ORDER BY CompDate ASC
        `).all(assetId, cutoff365);
    } catch { return null; }

    if (wos.length < 2) return null;

    const unplanned = wos.filter(w => w.WOSource === 'UNPLANNED');
    const recent    = wos.filter(w => w.CompDate >= cutoff30);
    const recentUnplanned = recent.filter(w => w.WOSource === 'UNPLANNED');

    const laborStats = calcStats(wos.map(w => parseFloat(w.ActualHours) || 0).filter(v => v > 0));
    const costStats  = calcStats(unplanned.map(w => parseFloat(w.DowntimeCost) || 0).filter(v => v > 0));

    // MTBF from unplanned failure dates
    let mtbfDays = null;
    if (unplanned.length >= 2) {
        const sorted = unplanned.map(w => w.CompDate).sort();
        const intervals = [];
        for (let i = 1; i < sorted.length; i++) {
            intervals.push((new Date(sorted[i]) - new Date(sorted[i - 1])) / 86400000);
        }
        mtbfDays = Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length * 10) / 10;
    }

    // Failure frequency: unplanned WOs per 90-day window over the baseline period
    const failureFreq = Math.round((unplanned.length / (365 / 90)) * 100) / 100;
    const recentFreq  = recentUnplanned.length; // raw count for the 30-day window

    // Drift detection: flag if recent metric > mean + 1 std dev
    const driftFlags = [];
    const recentLaborMean = recent.length > 0
        ? recent.reduce((s, w) => s + (parseFloat(w.ActualHours) || 0), 0) / recent.length
        : null;

    if (recentFreq > failureFreq + 1) driftFlags.push('FAILURE_FREQUENCY');
    if (recentLaborMean !== null && laborStats.mean && laborStats.stdDev) {
        if (recentLaborMean > laborStats.mean + laborStats.stdDev) driftFlags.push('LABOR_HOURS');
    }

    const driftSeverity = driftFlags.length >= 2 ? 'ALERT' : driftFlags.length === 1 ? 'WARNING' : 'NONE';

    // Asset name
    let assetName = assetId;
    try {
        const a = conn.prepare('SELECT Description FROM Asset WHERE AstID = ? OR ID = ? LIMIT 1').get(assetId, assetId);
        if (a) assetName = a.Description;
    } catch { /* ok */ }

    return {
        plantId, assetId, assetName,
        sampleSize: wos.length,
        failureFreq, recentFailureFreq: recentFreq,
        meanLaborHours: laborStats.mean, stdDevLaborHours: laborStats.stdDev, recentLaborHours: recentLaborMean,
        meanDowntimeCost: costStats.mean, stdDevDowntimeCost: costStats.stdDev,
        mtbfDays,
        driftFlags, driftSeverity,
    };
}

// ── POST /api/baseline/recalculate ────────────────────────────────────────────
// Recalculates baselines for all assets with ≥ 2 WOs in a plant.
router.post('/recalculate', (req, res) => {
    try {
        const plantId = req.body.plantId || req.headers['x-plant-id'];
        if (!plantId) return res.status(400).json({ error: 'plantId or x-plant-id header required' });

        const conn = db.getDb(plantId);
        const STATUS_COMPLETED = 40;
        const cutoff365 = new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0];

        const assets = conn.prepare(
            `SELECT DISTINCT AstID FROM Work WHERE StatusID=${STATUS_COMPLETED} AND CompDate>=? AND AstID IS NOT NULL`
        ).all(cutoff365);

        let calculated = 0, skipped = 0;
        const now = new Date().toISOString();

        const upsert = logisticsDb.prepare(`
            INSERT INTO AssetBaselines
                (PlantID, AssetID, AssetName, SampleSize, FailureFreq, RecentFailureFreq,
                 MeanLaborHours, StdDevLaborHours, RecentLaborHours, MeanDowntimeCost,
                 StdDevDowntimeCost, MtbfDays, DriftFlags, DriftSeverity, CalculatedAt)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(PlantID, AssetID) DO UPDATE SET
                AssetName=excluded.AssetName, SampleSize=excluded.SampleSize,
                FailureFreq=excluded.FailureFreq, RecentFailureFreq=excluded.RecentFailureFreq,
                MeanLaborHours=excluded.MeanLaborHours, StdDevLaborHours=excluded.StdDevLaborHours,
                RecentLaborHours=excluded.RecentLaborHours, MeanDowntimeCost=excluded.MeanDowntimeCost,
                StdDevDowntimeCost=excluded.StdDevDowntimeCost, MtbfDays=excluded.MtbfDays,
                DriftFlags=excluded.DriftFlags, DriftSeverity=excluded.DriftSeverity,
                CalculatedAt=excluded.CalculatedAt
        `);

        for (const { AstID } of assets) {
            const b = computeBaseline(conn, AstID, plantId);
            if (!b) { skipped++; continue; }
            upsert.run(
                plantId, AstID, b.assetName, b.sampleSize,
                b.failureFreq, b.recentFailureFreq,
                b.meanLaborHours, b.stdDevLaborHours, b.recentLaborHours,
                b.meanDowntimeCost, b.stdDevDowntimeCost, b.mtbfDays,
                JSON.stringify(b.driftFlags), b.driftSeverity, now
            );
            calculated++;
        }

        res.json({ ok: true, plantId, calculated, skipped, calculatedAt: now });
    } catch (err) {
        console.error('[baseline] recalculate error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/baseline/asset/:id ───────────────────────────────────────────────
router.get('/asset/:id', (req, res) => {
    try {
        const plantId = req.query.plantId || req.headers['x-plant-id'];
        if (!plantId) return res.status(400).json({ error: 'plantId or x-plant-id header required' });

        const stored = logisticsDb.prepare('SELECT * FROM AssetBaselines WHERE PlantID=? AND AssetID=?').get(plantId, req.params.id);
        if (stored) return res.json({ ...stored, driftFlags: JSON.parse(stored.DriftFlags || '[]') });

        // Compute on-the-fly if no cached baseline
        const conn = db.getDb(plantId);
        const b = computeBaseline(conn, req.params.id, plantId);
        if (!b) return res.status(404).json({ error: 'Insufficient WO history to compute baseline (minimum 2 WOs required)' });
        res.json(b);
    } catch (err) {
        console.error('[baseline] asset/:id error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/baseline/drift ────────────────────────────────────────────────────
router.get('/drift', (req, res) => {
    try {
        const { plantId, severity } = req.query;
        let sql = "SELECT * FROM AssetBaselines WHERE DriftSeverity != 'NONE'";
        const p = [];
        if (plantId)  { sql += ' AND PlantID = ?';      p.push(plantId); }
        if (severity) { sql += ' AND DriftSeverity = ?'; p.push(severity); }
        sql += ' ORDER BY DriftSeverity DESC, CalculatedAt DESC';
        const rows = logisticsDb.prepare(sql).all(...p);
        res.json(rows.map(r => ({ ...r, driftFlags: JSON.parse(r.DriftFlags || '[]') })));
    } catch (err) {
        console.error('[baseline] drift error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/baseline/dashboard ────────────────────────────────────────────────
router.get('/dashboard', (req, res) => {
    try {
        const { plantId } = req.query;
        let where = '1=1'; const p = [];
        if (plantId) { where = 'PlantID = ?'; p.push(plantId); }

        const totals = logisticsDb.prepare(
            `SELECT COUNT(*) AS total,
                    SUM(CASE WHEN DriftSeverity='ALERT'   THEN 1 ELSE 0 END) AS alerts,
                    SUM(CASE WHEN DriftSeverity='WARNING' THEN 1 ELSE 0 END) AS warnings,
                    SUM(CASE WHEN DriftSeverity='NONE'    THEN 1 ELSE 0 END) AS stable
             FROM AssetBaselines WHERE ${where}`
        ).get(...p);

        res.json({
            total:    totals?.total    || 0,
            alerts:   totals?.alerts   || 0,
            warnings: totals?.warnings || 0,
            stable:   totals?.stable   || 0,
            asOf:     new Date().toISOString(),
        });
    } catch (err) {
        console.error('[baseline] dashboard error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
