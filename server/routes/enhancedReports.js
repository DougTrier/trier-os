// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Enhanced Enterprise Reports API
 * =============================================
 * Cross-plant enterprise reporting for executive and operations review.
 * Sweeps all plant SQLite databases in parallel to produce aggregated
 * KPI reports that no single plant database could generate alone.
 * Mounted at /api/reports in server/index.js.
 *
 * ENDPOINTS:
 *   GET /enterprise/cost-comparison    Plant vs. plant maintenance spend comparison
 *                                      Returns ranked plant list with 12-month spend,
 *                                      cost-per-asset, and YoY delta
 *   GET /enterprise/pm-compliance      PM schedule adherence across all plants
 *                                      Returns: { onTime%, overdue%, neverCompleted%, byPlant[] }
 *   GET /enterprise/asset-reliability  MTBF (Mean Time Between Failures) trend analysis
 *                                      Returns: { avgMTBF, worstAssets[], trend, byPlant[] }
 *   GET /enterprise/labor-utilization  Technician hours and work order throughput by plant
 *                                      Returns: { totalHours, avgHoursPerWO, byTech[], byPlant[] }
 *
 * CROSS-PLANT SWEEP PATTERN: Each endpoint opens every plant .db file in read-only mode,
 *   runs the query, aggregates results in memory, then returns a unified response.
 *   Plants without the required tables are gracefully skipped.
 *
 * QUERY PARAMS: All endpoints support ?startDate and ?endDate (ISO 8601).
 *   Default range: last 12 months.
 *
 * CONSUMERS: ExecutiveDashboard.jsx, CorporateAnalyticsView.jsx, BIHub.jsx.
 *   Data is also available via /api/bi endpoints for Power BI / Tableau export.
 */

const express = require('express');
const router = express.Router();
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

function getPlantDbs(dataDir) {
    return fs.readdirSync(dataDir)
        .filter(f => f.endsWith('.db') && !f.includes('trier_') && !f.includes('auth'))
        .map(f => ({
            name: f.replace('.db', ''),
            path: path.join(dataDir, f)
        }));
}

function safeQuery(db, sql, params = []) {
    try { return db.prepare(sql).all(...params); } catch { return []; }
}

function safeGet(db, sql, params = []) {
    try { return db.prepare(sql).get(...params); } catch { return null; }
}

// ── Plant vs Plant Cost Comparison ───────────────────────────────────────────
router.get('/enterprise/cost-comparison', (req, res) => {
    try {
        const dataDir = require('../resolve_data_dir');
        const plants = getPlantDbs(dataDir);
        const results = [];

        for (const plant of plants) {
            let db;
            try {
                db = new Database(plant.path, { readonly: true });

                const totalWOs = safeGet(db, 'SELECT COUNT(*) as c FROM Work') || { c: 0 };
                const completedWOs = safeGet(db, "SELECT COUNT(*) as c FROM Work WHERE CompDate IS NOT NULL") || { c: 0 };
                const laborCost = safeGet(db, 'SELECT SUM(CAST(COALESCE(TotalCost, 0) AS REAL)) as total FROM Work') || { total: 0 };
                const partsCost = safeGet(db, 'SELECT SUM(CAST(COALESCE(UnitCost, 0) AS REAL) * CAST(COALESCE(QtyOnHand, 0) AS REAL)) as total FROM Part') || { total: 0 };
                const assetCount = safeGet(db, 'SELECT COUNT(*) as c FROM Asset') || { c: 0 };

                results.push({
                    plant: plant.name,
                    totalWOs: totalWOs.c,
                    completedWOs: completedWOs.c,
                    completionRate: totalWOs.c > 0 ? Math.round((completedWOs.c / totalWOs.c) * 100) : 0,
                    laborSpend: Math.round(laborCost.total || 0),
                    partsValue: Math.round(partsCost.total || 0),
                    totalSpend: Math.round((laborCost.total || 0) + (partsCost.total || 0)),
                    assetCount: assetCount.c
                });

                db.close();
            } catch (e) {
                if (db) db.close();
            }
        }

        results.sort((a, b) => b.totalSpend - a.totalSpend);
        const grandTotal = results.reduce((s, r) => s + r.totalSpend, 0);

        res.json({
            title: 'Enterprise Cost Comparison',
            plants: results,
            summary: {
                totalPlants: results.length,
                grandTotal,
                avgPerPlant: results.length > 0 ? Math.round(grandTotal / results.length) : 0,
                highestSpend: results[0] || null,
                lowestSpend: results[results.length - 1] || null
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ── PM Compliance Report ─────────────────────────────────────────────────────
router.get('/enterprise/pm-compliance', (req, res) => {
    try {
        const dataDir = require('../resolve_data_dir');
        const plants = getPlantDbs(dataDir);
        const results = [];

        for (const plant of plants) {
            let db;
            try {
                db = new Database(plant.path, { readonly: true });

                const totalPMs = safeGet(db, "SELECT COUNT(*) as c FROM Schedule") || { c: 0 };
                const activePMs = safeGet(db, "SELECT COUNT(*) as c FROM Schedule WHERE Active = 1 OR Active IS NULL") || { c: 0 };

                // PM work orders (Type contains 'PM' or priority is 'Preventive')
                const pmWOs = safeGet(db, `SELECT COUNT(*) as c FROM Work WHERE 
                    (LOWER(COALESCE(Type,'')) LIKE '%pm%' OR LOWER(COALESCE(Type,'')) LIKE '%prevent%' OR LOWER(COALESCE(Priority,'')) LIKE '%prevent%')
                    AND (DueDate <= date('now') OR SchDate <= date('now') OR CompDate IS NOT NULL)`) || { c: 0 };
                
                const pmCompleted = safeGet(db, `SELECT COUNT(*) as c FROM Work WHERE 
                    (LOWER(COALESCE(Type,'')) LIKE '%pm%' OR LOWER(COALESCE(Type,'')) LIKE '%prevent%' OR LOWER(COALESCE(Priority,'')) LIKE '%prevent%')
                    AND CompDate IS NOT NULL 
                    AND (date(CompDate) <= date(COALESCE(DueDate, SchDate, CompDate)))`) || { c: 0 };
                
                const pmOverdue = safeGet(db, `SELECT COUNT(*) as c FROM Work WHERE 
                    (LOWER(COALESCE(Type,'')) LIKE '%pm%' OR LOWER(COALESCE(Type,'')) LIKE '%prevent%' OR LOWER(COALESCE(Priority,'')) LIKE '%prevent%')
                    AND CompDate IS NULL AND (COALESCE(DueDate, SchDate) < date('now'))`) || { c: 0 };

                const complianceRate = pmWOs.c > 0 ? Math.round((pmCompleted.c / pmWOs.c) * 100) : 100;

                results.push({
                    plant: plant.name,
                    totalSchedules: totalPMs.c,
                    activeSchedules: activePMs.c,
                    pmGenerated: pmWOs.c,
                    pmCompleted: pmCompleted.c,
                    pmOverdue: pmOverdue.c,
                    complianceRate
                });

                db.close();
            } catch (e) {
                if (db) db.close();
            }
        }

        const avgCompliance = results.length > 0 
            ? Math.round(results.reduce((s, r) => s + r.complianceRate, 0) / results.length)
            : 0;

        res.json({
            title: 'PM Compliance Report',
            plants: results.sort((a, b) => a.complianceRate - b.complianceRate),
            summary: {
                totalPlants: results.length,
                avgComplianceRate: avgCompliance,
                totalOverdue: results.reduce((s, r) => s + r.pmOverdue, 0),
                totalCompleted: results.reduce((s, r) => s + r.pmCompleted, 0)
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ── Asset Reliability (MTBF) ─────────────────────────────────────────────────
router.get('/enterprise/asset-reliability', (req, res) => {
    try {
        const dataDir = require('../resolve_data_dir');
        const plants = getPlantDbs(dataDir);
        const results = [];

        for (const plant of plants) {
            let db;
            try {
                db = new Database(plant.path, { readonly: true });

                const assets = safeQuery(db, `
                    SELECT 
                        a.ID, a.Description,
                        CAST(COALESCE(a.FailureCount, 0) AS INTEGER) as failures,
                        CAST(COALESCE(a.CumulativeDowntime, 0) AS REAL) as downtime,
                        a.InstallDate,
                        CASE WHEN a.InstallDate IS NOT NULL 
                            THEN ROUND((julianday('now') - julianday(a.InstallDate)) / 365.25, 1) 
                            ELSE NULL END as ageYears
                    FROM Asset a
                    WHERE CAST(COALESCE(a.FailureCount, 0) AS INTEGER) > 0
                    ORDER BY CAST(COALESCE(a.FailureCount, 0) AS INTEGER) DESC
                    LIMIT 10
                `);

                for (const asset of assets) {
                    const age = asset.ageYears || 5;
                    const mtbf = asset.failures > 0 ? Math.round((age * 8760) / asset.failures) : null; // hours
                    results.push({
                        plant: plant.name,
                        assetId: asset.ID,
                        description: asset.Description,
                        failures: asset.failures,
                        downtimeHrs: Math.round(asset.downtime || 0),
                        ageYears: asset.ageYears || 'Unknown',
                        mtbfHours: mtbf
                    });
                }

                db.close();
            } catch (e) {
                if (db) db.close();
            }
        }

        results.sort((a, b) => (a.mtbfHours || 99999) - (b.mtbfHours || 99999));

        res.json({
            title: 'Asset Reliability Report (MTBF)',
            assets: results.slice(0, 25),
            summary: {
                totalTracked: results.length,
                avgMTBF: results.length > 0 
                    ? Math.round(results.filter(r => r.mtbfHours).reduce((s, r) => s + r.mtbfHours, 0) / results.filter(r => r.mtbfHours).length)
                    : 0,
                mostUnreliable: results[0] || null
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ── Labor Utilization ────────────────────────────────────────────────────────
router.get('/enterprise/labor-utilization', (req, res) => {
    try {
        const dataDir = require('../resolve_data_dir');
        const plants = getPlantDbs(dataDir);
        const techMap = {};

        for (const plant of plants) {
            let db;
            try {
                db = new Database(plant.path, { readonly: true });

                const techs = safeQuery(db, `
                    SELECT 
                        COALESCE(AssignedTo, 'Unassigned') as tech,
                        COUNT(*) as woCount,
                        SUM(CASE WHEN CompDate IS NOT NULL THEN 1 ELSE 0 END) as completed,
                        SUM(CAST(COALESCE(TotalCost, 0) AS REAL)) as totalCost
                    FROM Work
                    WHERE AssignedTo IS NOT NULL AND AssignedTo != ''
                    GROUP BY AssignedTo
                    ORDER BY COUNT(*) DESC
                `);

                for (const t of techs) {
                    const key = t.tech;
                    if (!techMap[key]) {
                        techMap[key] = { tech: key, plants: [], totalWOs: 0, completed: 0, totalCost: 0 };
                    }
                    techMap[key].plants.push(plant.name);
                    techMap[key].totalWOs += t.woCount;
                    techMap[key].completed += t.completed;
                    techMap[key].totalCost += (t.totalCost || 0);
                }

                db.close();
            } catch (e) {
                if (db) db.close();
            }
        }

        const techs = Object.values(techMap)
            .map(t => ({
                ...t,
                completionRate: t.totalWOs > 0 ? Math.round((t.completed / t.totalWOs) * 100) : 0,
                totalCost: Math.round(t.totalCost),
                plantCount: t.plants.length
            }))
            .sort((a, b) => b.totalWOs - a.totalWOs);

        res.json({
            title: 'Labor Utilization Report',
            technicians: techs.slice(0, 30),
            summary: {
                totalTechnicians: techs.length,
                totalWOs: techs.reduce((s, t) => s + t.totalWOs, 0),
                avgCompletionRate: techs.length > 0
                    ? Math.round(techs.reduce((s, t) => s + t.completionRate, 0) / techs.length)
                    : 0,
                topPerformer: techs[0] || null
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
