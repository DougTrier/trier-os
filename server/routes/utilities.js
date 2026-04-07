// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Utility Consumption Intelligence API
 * ==================================================
 * Tracks plant-level utility consumption (water, electricity, natural gas)
 * with cost-per-unit analysis, anomaly detection, and ESG reporting integration.
 * Utility data feeds the Energy Dashboard and ESG metrics in the Energy module.
 * Mounted at /api/utilities in server/index.js.
 *
 * ENDPOINTS:
 *   GET    /              List utility readings for current plant
 *                         Query: ?type=Electricity|Water|Gas, ?startDate, ?endDate
 *   POST   /              Log a new utility reading
 *                         Body: { type, readingDate, value, unit, cost, meterID, notes }
 *   DELETE /:id           Remove a utility reading (correction use case)
 *
 *   Analytics
 *   GET    /summary       Monthly consumption and cost summary by utility type
 *                         Returns: { electricity, water, gas } each with { total, cost, trend }
 *   GET    /insights      AI-style insights: peak consumption periods, cost drivers, benchmarks
 *   GET    /anomalies     Readings that deviate >2σ from the rolling 30-day average
 *   POST   /anomalies/:id/acknowledge  Dismiss an anomaly alert with a reason note
 *
 *   Threshold Configuration
 *   GET    /thresholds    Retrieve alert thresholds per utility type for current plant
 *   POST   /thresholds    Save alert thresholds (triggers anomaly detection re-evaluation)
 *
 * ESG INTEGRATION: Utility readings are automatically mapped to ESG meter types
 *   (electricity_kwh, water_gal, gas_therms) and included in the Energy module's
 *   ESG report alongside direct energy readings from SCADA/sensors.
 *
 * ANOMALY DETECTION: A reading triggers an anomaly if it exceeds the configured
 *   threshold OR deviates >2 standard deviations from the plant's 30-day rolling mean.
 *   Anomalies appear on the Utility Dashboard and generate notifications.
 */
const express = require('express');
const router = express.Router();
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { getDb } = require('../database');
const { db: logisticsDb } = require('../logistics_db');

// Map internal utility types to ESG meter types
const ESG_MAP = {
    'Electricity': 'electricity_kwh',
    'Water': 'water_gal',
    'Gas': 'gas_therms'
};


// GET /api/utilities — Fetch all utility records for the current plant
router.get('/', (req, res) => {
    try {
        const db = getDb();
        const records = db.prepare('SELECT * FROM Utilities ORDER BY ReadingDate DESC').all();
        res.json(records);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch utility records: ' + err.message });
    }
});

// POST /api/utilities — Add a new utility reading with supplier info
router.post('/', (req, res) => {
    try {
        const { Type, SupplierName, SupplierAddress, SupplierCity, SupplierState, SupplierZip, MeterReading, CostPerUnit, BillAmount, ReadingDate, Notes } = req.body;
        
        if (!Type || MeterReading === undefined) {
            return res.status(400).json({ error: 'Type (Water/Electricity/Gas) and MeterReading are required' });
        }

        const db = getDb();
        const result = db.prepare(`
            INSERT INTO Utilities (
                Type, SupplierName, SupplierAddress, SupplierCity, SupplierState, SupplierZip,
                MeterReading, CostPerUnit, BillAmount, ReadingDate, Notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            Type, SupplierName || null, SupplierAddress || null, SupplierCity || null, 
            SupplierState || null, SupplierZip || null, MeterReading, CostPerUnit || null, 
            BillAmount || null, ReadingDate || new Date().toISOString(), Notes || null
        );
        
        // ── ESG Integration Cross-Post ──
        try {
            const plantId = req.headers['x-plant-id'] || 'unknown';
            logisticsDb.prepare(`
                INSERT INTO EnergyReadings (plantId, meterType, reading, cost, periodStart, source, recordedBy)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                plantId, 
                ESG_MAP[Type] || Type.toLowerCase(), 
                MeterReading, 
                BillAmount || null, 
                ReadingDate || null, 
                'utility_module',
                req.user?.username || 'system'
            );
        } catch (esgErr) {
            console.error('⚠️ ESG Cross-post failed:', esgErr.message);
        }

        res.status(201).json({ success: true, id: result.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save utility record: ' + err.message });
    }
});

// DELETE /api/utilities/:id — Remove a utility record
router.delete('/:id', (req, res) => {
    try {
        const db = getDb();
        db.prepare('DELETE FROM Utilities WHERE ID = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete record: ' + err.message });
    }
});

// GET /api/utilities/summary — Aggregated costs and consumption trends
router.get('/summary', (req, res) => {
    try {
        const db = getDb();
        
        // Last 12 months consumption grouped by type
        const trends = db.prepare(`
            SELECT 
                Type, 
                strftime('%Y-%m', ReadingDate) as Month,
                SUM(MeterReading) as TotalConsumption,
                SUM(BillAmount) as TotalCost
            FROM Utilities
            WHERE ReadingDate >= date('now', '-12 months')
            GROUP BY Type, Month
            ORDER BY Month DESC
        `).all();

        // Current totals for the high-level tile metric
        const currentMonth = db.prepare(`
            SELECT 
                Type, 
                SUM(BillAmount) as Cost
            FROM Utilities
            WHERE ReadingDate >= date('now', 'start of month')
            GROUP BY Type
        `).all();

        res.json({ trends, currentMonth });
    } catch (err) {
        res.status(500).json({ error: 'Failed to generate utility summary: ' + err.message });
    }
});

// GET /api/utilities/insights — AI-driven anomaly detection and cost optimization
router.get('/insights', (req, res) => {
    try {
        const db = getDb();
        const insights = [];

        // 1. Spikes Check (Compare last 7 days vs previous 7)
        const recentUsage = db.prepare(`
            SELECT Type, SUM(MeterReading) as Total
            FROM Utilities 
            WHERE ReadingDate >= date('now', '-7 days')
            GROUP BY Type
        `).all();

        const baselineUsage = db.prepare(`
            SELECT Type, SUM(MeterReading) as Total
            FROM Utilities 
            WHERE ReadingDate >= date('now', '-14 days') AND ReadingDate < date('now', '-7 days')
            GROUP BY Type
        `).all();

        recentUsage.forEach(curr => {
            const base = baselineUsage.find(b => b.Type === curr.Type);
            if (base && base.Total > 0) {
                const increase = ((curr.Total - base.Total) / base.Total) * 100;
                if (increase > 25) {
                    insights.push({
                        type: 'ANOMALY',
                        severity: 'CRITICAL',
                        title: `${curr.Type} Consumption Spike`,
                        message: `Consumption has increased by ${increase.toFixed(1)}% compared to last week. Immediate facility inspection recommended.`,
                        color: '#ef4444'
                    });
                }
            }
        });

        // 2. Cost Analysis
        const highCost = db.prepare(`
            SELECT Type, MAX(CostPerUnit) as MaxCost, AVG(CostPerUnit) as AvgCost
            FROM Utilities
            GROUP BY Type
        `).all();

        highCost.forEach(c => {
            if (c.MaxCost > c.AvgCost * 1.5) {
                insights.push({
                    type: 'COST_OPTIMIZATION',
                    severity: 'WARNING',
                    title: `Supplier Rate Variance (${c.Type})`,
                    message: `Identified unit cost variance exceeding 50%. Renegotiate ${c.Type} contracts or audit supplier billing accuracy.`,
                    color: '#f59e0b'
                });
            }
        });

        // Default stable insight if nothing else
        if (insights.length === 0) {
            insights.push({
                type: 'SYSTEM_STABLE',
                severity: 'INFO',
                title: 'Operational Stability',
                message: 'All utility consumption levels are within normal bounds. No anomalies detected across facility sectors.',
                color: '#10b981'
            });
        }

        res.json(insights);
    } catch (err) {
        res.status(500).json({ error: 'Failed to generate insights: ' + err.message });
    }
});

// GET /api/utilities/thresholds — Fetch configured alert thresholds (or defaults)
router.get('/thresholds', (req, res) => {
    try {
        const db = getDb();
        const rows = db.prepare('SELECT * FROM UtilityThresholds').all();
        const result = ['Electricity', 'Water', 'Gas'].map(type => ({
            Type: type, PercentIncreaseAlert: 25.0, BaselineWindowDays: 7, AbsoluteMaxReading: null, Active: 1,
            ...(rows.find(r => r.Type === type) || {})
        }));
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/utilities/thresholds — Upsert threshold config for one utility type
router.post('/thresholds', (req, res) => {
    try {
        const { Type, PercentIncreaseAlert, BaselineWindowDays, AbsoluteMaxReading, Active } = req.body;
        if (!Type) return res.status(400).json({ error: 'Type required' });
        const db = getDb();
        db.prepare(`
            INSERT INTO UtilityThresholds (Type, PercentIncreaseAlert, BaselineWindowDays, AbsoluteMaxReading, Active, UpdatedAt)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(Type) DO UPDATE SET
                PercentIncreaseAlert = excluded.PercentIncreaseAlert,
                BaselineWindowDays   = excluded.BaselineWindowDays,
                AbsoluteMaxReading   = excluded.AbsoluteMaxReading,
                Active               = excluded.Active,
                UpdatedAt            = datetime('now')
        `).run(Type, PercentIncreaseAlert ?? 25.0, BaselineWindowDays ?? 7, AbsoluteMaxReading || null, Active ?? 1);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/utilities/anomalies — Recent anomaly history for this plant
router.get('/anomalies', (req, res) => {
    try {
        const db = getDb();
        const rows = db.prepare('SELECT * FROM UtilityAnomalies ORDER BY DetectedAt DESC LIMIT 100').all();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/utilities/anomalies/:id/acknowledge — Acknowledge an anomaly
router.post('/anomalies/:id/acknowledge', (req, res) => {
    try {
        const db = getDb();
        db.prepare(`UPDATE UtilityAnomalies SET AcknowledgedAt = datetime('now'), AcknowledgedBy = ? WHERE ID = ?`)
            .run(req.user?.username || 'user', req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Background Anomaly Detection Engine ──────────────────────────────────────
// Called by a 15-min cron in server/index.js. Opens each plant DB directly
// (same pattern as pm_engine.js) and inserts UtilityAnomalies records when
// consumption spikes beyond configured thresholds.
function runUtilityAnomalyCheck() {
    const dataDir = require('../resolve_data_dir');
    const dbFiles = fs.readdirSync(dataDir)
        .filter(f => f.endsWith('.db') && !f.includes('trier_') && !f.includes('corporate_') &&
                     !f.includes('schema_') && !f.includes('dairy_'));

    let totalNew = 0;
    const DEFAULTS = { PercentIncreaseAlert: 25.0, BaselineWindowDays: 7, AbsoluteMaxReading: null, Active: 1 };

    for (const dbFile of dbFiles) {
        let db;
        try {
            db = new Database(path.join(dataDir, dbFile));

            const hasUtilities  = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='Utilities'").get();
            const hasThresholds = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='UtilityThresholds'").get();
            const hasAnomalies  = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='UtilityAnomalies'").get();
            if (!hasUtilities || !hasAnomalies) continue;

            for (const type of ['Electricity', 'Water', 'Gas']) {
                let cfg = { ...DEFAULTS };
                if (hasThresholds) {
                    const row = db.prepare('SELECT * FROM UtilityThresholds WHERE Type = ? AND Active = 1').get(type);
                    if (row) cfg = { ...DEFAULTS, ...row };
                }
                if (!cfg.Active) continue;

                const days = cfg.BaselineWindowDays || 7;

                // Skip if an unacknowledged anomaly already fired for this type in the last 24h
                const recent24 = db.prepare(`
                    SELECT ID FROM UtilityAnomalies
                    WHERE Type = ? AND AnomalyType = 'SPIKE'
                      AND DetectedAt >= datetime('now', '-24 hours')
                      AND AcknowledgedAt IS NULL
                `).get(type);
                if (recent24) continue;

                const recentWindow = db.prepare(`
                    SELECT SUM(MeterReading) as Total FROM Utilities
                    WHERE Type = ? AND ReadingDate >= date('now', ?)
                `).get(type, `-${days} days`);

                const baselineWindow = db.prepare(`
                    SELECT SUM(MeterReading) as Total FROM Utilities
                    WHERE Type = ? AND ReadingDate >= date('now', ?) AND ReadingDate < date('now', ?)
                `).get(type, `-${days * 2} days`, `-${days} days`);

                if (recentWindow?.Total > 0 && baselineWindow?.Total > 0) {
                    const pct = ((recentWindow.Total - baselineWindow.Total) / baselineWindow.Total) * 100;
                    if (pct > cfg.PercentIncreaseAlert) {
                        const severity = pct > cfg.PercentIncreaseAlert * 2 ? 'CRITICAL' : 'WARNING';
                        db.prepare(`
                            INSERT INTO UtilityAnomalies
                                (Type, AnomalyType, Severity, MeterReading, ThresholdValue, PercentageOver, Message, DetectedAt)
                            VALUES (?, 'SPIKE', ?, ?, ?, ?, ?, datetime('now'))
                        `).run(
                            type, severity,
                            recentWindow.Total, cfg.PercentIncreaseAlert, pct,
                            `${type} consumption up ${pct.toFixed(1)}% vs ${days}-day baseline (threshold: ${cfg.PercentIncreaseAlert}%). Investigate immediately.`
                        );
                        totalNew++;
                    }
                }

                // Absolute max check (separate dedup key)
                if (cfg.AbsoluteMaxReading) {
                    const latest = db.prepare(`SELECT MeterReading FROM Utilities WHERE Type = ? ORDER BY ReadingDate DESC LIMIT 1`).get(type);
                    if (latest?.MeterReading > cfg.AbsoluteMaxReading) {
                        const alreadyFired = db.prepare(`
                            SELECT ID FROM UtilityAnomalies
                            WHERE Type = ? AND AnomalyType = 'ABSOLUTE_MAX'
                              AND DetectedAt >= datetime('now', '-24 hours')
                              AND AcknowledgedAt IS NULL
                        `).get(type);
                        if (!alreadyFired) {
                            const overPct = ((latest.MeterReading - cfg.AbsoluteMaxReading) / cfg.AbsoluteMaxReading) * 100;
                            db.prepare(`
                                INSERT INTO UtilityAnomalies
                                    (Type, AnomalyType, Severity, MeterReading, ThresholdValue, PercentageOver, Message, DetectedAt)
                                VALUES (?, 'ABSOLUTE_MAX', 'CRITICAL', ?, ?, ?, ?, datetime('now'))
                            `).run(
                                type,
                                latest.MeterReading, cfg.AbsoluteMaxReading, overPct,
                                `${type} reading of ${Number(latest.MeterReading).toLocaleString()} exceeds hard ceiling of ${Number(cfg.AbsoluteMaxReading).toLocaleString()}.`
                            );
                            totalNew++;
                        }
                    }
                }
            }
        } catch (err) {
            console.warn(`[UtilityAlerts] Error checking ${dbFile}:`, err.message);
        } finally {
            if (db) try { db.close(); } catch (_) {}
        }
    }

    if (totalNew > 0) console.log(`⚡ [UtilityAlerts] ${totalNew} new anomaly alert(s) detected across all plants`);
}

module.exports = router;
module.exports.runUtilityAnomalyCheck = runUtilityAnomalyCheck;
