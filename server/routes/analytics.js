// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Analytics & Reporting API
 * ==================================================
 * Enterprise-grade analytics engine powering executive dashboards,
 * KPI cards, predictive maintenance alerts, and budget intelligence.
 * All routes are mounted at /api/analytics in server/index.js.
 *
 * ENDPOINTS:
 *   GET /narrative              Cross-plant DB sweep: workload, PM delays, shortages
 *   GET /pay-scales             Labor pay scale configuration per plant
 *   POST /pay-scales            Save/overwrite pay scale entries for a plant
 *   GET /audit                  Formatted inter-plant transfer trail (logistics ledger)
 *   GET /activity               Structured AuditLog entries (last 100)
 *   GET /predictive             MTBF risk assets from MasterAssetIndex
 *   GET /cost-forecast          6-month projection (age factor + risk multiplier)
 *   GET /technician-performance Cross-plant tech hours, WO completions, OT%
 *   GET /budget-forecast        12-month budget projection with confidence bands
 *   GET /plant-weather          Per-plant health "weather" map (sunny/cloudy/storm)
 *   ... (additional dashboard stat endpoints below)
 *
 * CACHING STRATEGY:
 *   narrativeCache (15 min) -- expensive multi-DB sweep, invalidated on plant change
 *   weatherCache (5 min)    -- plant weather map, refreshes on cron cycle
 *   Heavy stat endpoints use Cache(5) for per-request deduplication
 *
 * ALL-SITES DB SWEEP PATTERN: GET /narrative and GET /cost-forecast iterate
 * over all .db files in the data directory, opening each with better-sqlite3
 * in readonly mode, collecting stats, then closing immediately. This keeps
 * memory usage bounded and prevents file descriptor leaks on large fleets.
 *
 * BUDGET FORECAST ALGORITHM:
 *   baseProjection = (trailing12moAvg) x (ageFactor) x (failureFactor) x (seasonal)
 *   ageFactor     = 1 + max(avgAssetAge - 5, 0) * 0.03  (3% uplift per year over 5yr)
 *   failureFactor = 1.15 if >100 emergency WOs, 1.1 if >50, else 1.0
 *   seasonal[]    = monthly index array (Jan peaks +10%, Jul troughs -15%)
 *   Confidence bands: bestCase = projection * 0.8, worstCase = projection * 1.35
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { db: logisticsDb, logAudit } = require('../logistics_db');
const Cache = require('../cache');

const narrativeCache = new Cache(15); // 15 minute cache for expensive sweep

// SEC-05: Sanitize plant identifiers from query params and headers.
// Allows alphanumeric, underscores, hyphens, and spaces (plant names like "Plant 2").
// Returns null for anything that looks like a traversal or injection attempt.
function sanitizePlantId(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const s = raw.trim();
    // Allow all_sites and Corporate_Office as special sentinel values
    if (s === 'all_sites' || s === 'Corporate_Office') return s;
    return /^[a-zA-Z0-9 _-]{1,64}$/.test(s) ? s : null;
}

// ── GET /api/analytics/narrative ──────────────────────────────────────────
// Manager-only asynchronous query sweeping SQLite databases.
// When x-plant-id is set to a specific plant, only that plant's data is returned.
// Corporate_Office and all_sites see the full enterprise sweep.
router.get('/narrative', (req, res) => {
    const requestedPlant = req.headers['x-plant-id'] || 'all_sites';
    const isEnterprise = !requestedPlant || requestedPlant === 'all_sites' || requestedPlant === 'Corporate_Office';
    const cacheKey = isEnterprise ? 'enterprise_narrative' : `narrative_${requestedPlant}`;
    
    const cached = narrativeCache.get(cacheKey);
    if (cached) return res.json(cached);

    try {
        const dataDir = require('../resolve_data_dir');
        const NON_PLANT = new Set(['corporate_master','Corporate_Office','dairy_master','it_master','logistics','schema_template','schema_template']);
        let dbFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.db') && !f.includes('trier_') && !NON_PLANT.has(f.replace('.db','')));

        // Filter to single plant if not enterprise view
        if (!isEnterprise) {
            dbFiles = dbFiles.filter(f => f.replace('.db', '') === requestedPlant);
            if (dbFiles.length === 0) {
                // Try with the raw name
                dbFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.db') && !f.includes('trier_') && f.replace('.db', '').toLowerCase() === requestedPlant.toLowerCase());
            }
        }

        let totalDelayCount = 0;
        const insights = [];
        let enterpriseFinancials = {
            labor: 0,
            parts: 0,
            misc: 0,
            total: 0
        };
        const workloadDistribution = [];
        const partsShortage = [];

        // Sweep databases (single or all)
        for (const dbFile of dbFiles) {
            const plantName = dbFile.replace('.db', '').replace('_', ' ');

            try {
                const tempDb = new Database(path.join(dataDir, dbFile), { readonly: true });

                // Workload Distribution
                const wos = tempDb.prepare(`
                    SELECT COUNT(*) as cnt, SUM(CASE WHEN StatusID < 40 THEN 1 ELSE 0 END) as active 
                    FROM Work
                `).get() || { cnt: 0, active: 0 };

                workloadDistribution.push({ plant: plantName, total: wos.cnt, active: wos.active });

                // Enterprise Cost Aggregation
                try {
                    const laborCost = tempDb.prepare(`
                        SELECT SUM(
                            COALESCE(HrReg,0) * CAST(COALESCE(PayReg,'0') AS REAL) + 
                            COALESCE(HrOver,0) * CAST(COALESCE(PayOver,'0') AS REAL) + 
                            COALESCE(HrDouble,0) * CAST(COALESCE(PayDouble,'0') AS REAL)
                        ) as total 
                        FROM WorkLabor 
                    `).get().total || 0;
                    
                    const partsCost = tempDb.prepare(`
                        SELECT SUM(COALESCE(ActQty,0) * CAST(COALESCE(UnitCost,'0') AS REAL)) as total 
                        FROM WorkParts
                    `).get().total || 0;

                    const miscCost = tempDb.prepare(`
                        SELECT SUM(CAST(COALESCE(ActCost,'0') AS REAL)) as total 
                        FROM WorkMisc
                    `).get().total || 0;

                    enterpriseFinancials.labor += laborCost;
                    enterpriseFinancials.parts += partsCost;
                    enterpriseFinancials.misc += miscCost;
                } catch (ce) {
                    console.warn(`[Analytics] Cost aggregation skipped for ${plantName}: ${ce.message}`);
                }

                // Breakdown Patterns
                const breakdowns = tempDb.prepare(`
                    SELECT AstID, COUNT(*) as cnt FROM Work 
                    WHERE ReasonID IN (SELECT ID FROM Reason WHERE Description LIKE '%Breakdown%' OR Description LIKE '%Emergency%')
                    GROUP BY AstID 
                    ORDER BY cnt DESC LIMIT 1
                `).get();

                if (breakdowns && breakdowns.cnt > 0) {
                    insights.push({ type: 'breakdown', plant: plantName, msg: `${plantName} has recorded ${breakdowns.cnt} breakdowns on asset ${breakdowns.AstID}` });
                }

                // PM Compliance
                const pms = tempDb.prepare(`
                    SELECT COUNT(*) as delayed FROM Work 
                    WHERE TypeID IN (SELECT ID FROM WorkType WHERE Description LIKE '%PM%') 
                    AND AddDate < date('now', '-30 days') AND StatusID < 40
                `).get();

                if (pms && pms.delayed > 0) {
                    insights.push({ type: 'delays', plant: plantName, msg: `${plantName} has ${pms.delayed} PMs that are over 30 days overdue.` });
                }

                // Parts Shortages
                let shortageCount = 0;
                try {
                    const shortages = tempDb.prepare(`
                        SELECT COUNT(*) as delayed FROM Work 
                        WHERE ID IN (SELECT WoID FROM WorkParts WHERE Qty < 0)
                        OR Comment LIKE '%waiting%'
                    `).get();
                    shortageCount = shortages.delayed || 0;
                } catch (e) {
                    try {
                        const shortages = tempDb.prepare(`SELECT COUNT(*) as delayed FROM Work WHERE Comment LIKE '%waiting%'`).get();
                        shortageCount = shortages.delayed || 0;
                    } catch (e2) {
                        console.warn(`[Analytics] Parts shortage query failed for ${plantName}: ${e2.message}`);
                    }
                }

                if (shortageCount > 0) {
                    partsShortage.push({ plant: plantName, delayed: shortageCount });
                    totalDelayCount += shortageCount;
                }

                tempDb.close();
            } catch (err) {
                console.warn(`[Narrative] Skipping ${plantName}: ${err.message}`);
            }
        }

        // Inter-plant logistics stats
        let logisticsCount = 0;
        try {
            if (isEnterprise) {
                logisticsCount = logisticsDb.prepare("SELECT COUNT(*) as cnt FROM Transfers").get().cnt;
            } else {
                logisticsCount = logisticsDb.prepare("SELECT COUNT(*) as cnt FROM Transfers WHERE RequestingPlant = ? OR FulfillingPlant = ?").get(requestedPlant, requestedPlant).cnt;
            }
        } catch (le) {
            console.error('Logistics ledger read failed:', le.message);
        }

        if (totalDelayCount > 0 && partsShortage.length > 0) {
            const sortedShortages = [...partsShortage].sort((a, b) => b.delayed - a.delayed);
            const worstShortage = sortedShortages[0];
            if (worstShortage) {
                insights.unshift({ 
                    type: 'critical', 
                    plant: isEnterprise ? 'Enterprise' : worstShortage.plant, 
                    msg: `${worstShortage.plant} delayed ${worstShortage.delayed} WOs due to part shortages. Logistics ledger confirms ${isEnterprise ? 'enterprise' : 'plant'} requests are active.` 
                });
            }
        }

        enterpriseFinancials.total = enterpriseFinancials.labor + enterpriseFinancials.parts + enterpriseFinancials.misc;

        const finalResult = {
            scope: isEnterprise ? 'enterprise' : requestedPlant,
            workloadDistribution,
            insights,
            logisticsCount,
            enterpriseFinancials
        };

        narrativeCache.set(cacheKey, finalResult);
        res.json(finalResult);

    } catch (err) {
        console.error('Failed to compile narrative analytics:', err.message, err.stack);
        res.status(500).json({ error: 'Failed to crawl enterprise data' });
    }
});

// ── GET /api/analytics/pay-scales ──────────────────────────────────────────
router.get('/pay-scales', (req, res) => {
    try {
        const pId = req.headers['x-plant-id'] || 'Demo_Plant_1';
        if (!pId || pId === 'all_sites' || pId === 'Corporate_Office') {
            const rows = logisticsDb.prepare('SELECT * FROM pay_scales').all();
            res.json(rows);
        } else {
            const rows = logisticsDb.prepare('SELECT * FROM pay_scales WHERE PlantID = ?').all(pId);
            res.json(rows);
        }
    } catch(e) { res.status(500).json({error:e.message}); }
});

// ── POST /api/analytics/pay-scales ─────────────────────────────────────────
router.post('/pay-scales', (req, res) => {
    try {
        const pId = req.headers['x-plant-id'] || 'Demo_Plant_1';
        const items = req.body;
        logisticsDb.prepare('DELETE FROM pay_scales WHERE PlantID = ?').run(pId);
        const stmt = logisticsDb.prepare('INSERT INTO pay_scales (PlantID, Classification, HourlyRate, Headcount, IsSalary, SalaryRate, PayFrequency, EmployeeRef) VALUES (?,?,?,?,?,?,?,?)');
        logisticsDb.transaction(() => {
            for (let i of items) {
                if (i.Classification) stmt.run(pId, i.Classification, i.HourlyRate||0, i.Headcount||0, i.IsSalary||0, i.SalaryRate||0, i.PayFrequency||null, i.EmployeeRef||null);
            }
        })();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'An internal server error occurred' }); }
});

// ── GET /api/analytics/audit ──────────────────────────────────────────────
router.get('/audit', (req, res) => {
    try {
        const requestedPlant = req.headers['x-plant-id'] || 'all_sites';
        const isEnterprise = !requestedPlant || requestedPlant === 'all_sites' || requestedPlant === 'Corporate_Office';
        
        let transfers;
        if (isEnterprise) {
            transfers = logisticsDb.prepare(`
                SELECT RequestingPlant, FulfillingPlant, PartID, Quantity, Status, ReqDate 
                FROM Transfers 
                ORDER BY ReqDate DESC LIMIT 50
            `).all();
        } else {
            transfers = logisticsDb.prepare(`
                SELECT RequestingPlant, FulfillingPlant, PartID, Quantity, Status, ReqDate 
                FROM Transfers 
                WHERE RequestingPlant = ? OR FulfillingPlant = ?
                ORDER BY ReqDate DESC LIMIT 50
            `).all(requestedPlant, requestedPlant);
        }

        const trail = transfers.map(t =>
            `[${new Date(t.ReqDate).toLocaleString()}] ${t.RequestingPlant} initiated a ${t.Status} network transfer for ${t.Quantity}x of ${t.PartID} from ${t.FulfillingPlant}.`
        );

        res.json(trail);
    } catch (err) {
        res.status(500).json({ error: 'Failed to access audit ledger' });
    }
});

// ── GET /api/analytics/activity ──────────────────────────────────────────
// Detailed activity log from structured AuditLog table
router.get('/activity', (req, res) => {
    try {
        const logs = logisticsDb.prepare(`
            SELECT * FROM AuditLog 
            ORDER BY Timestamp DESC 
            LIMIT 100
        `).all();
        res.json(logs);
    } catch (err) {
        console.error('Failed to fetch activity logs:', err.message);
        res.status(500).json({ error: 'Failed to access activity ledger' });
    }
});

// ── GET /api/analytics/predictive ──────────────────────────────────────────
// Pulls combined risk data and MTBF alerts from the Corporate Master registry
router.get('/predictive', (req, res) => {
    try {
        const masterDb = require('../master_index');
        
        // 1. Get Assets with high failure patterns
        const priorityRisks = masterDb.prepare(`
            SELECT a.*, s.plantLabel
            FROM MasterAssetIndex a
            JOIN PlantStats s ON a.plantId = s.plantId
            WHERE a.riskLevel != 'Low' OR a.healthScore < 70
            ORDER BY a.healthScore ASC
            LIMIT 50
        `).all();

        // 2. Aggregate Enterprise MTBF Stats
        const globalStats = masterDb.prepare(`
            SELECT 
                AVG(healthScore) as avgHealth,
                COUNT(CASE WHEN riskLevel = 'High' THEN 1 END) as criticalCount,
                COUNT(CASE WHEN riskLevel = 'Medium' THEN 1 END) as warningCount
            FROM MasterAssetIndex
        `).get();

        res.json({
            assets: priorityRisks,
            stats: globalStats,
            lastCrawl: new Date().toISOString()
        });
    } catch (err) {
        console.error('Failed to fetch predictive analytics:', err.message);
        res.status(500).json({ error: 'Failed to access predictive engine' });
    }
});

// ── GET /api/analytics/cost-forecast ──────────────────────────────────────
// Projects 6-month maintenance costs per plant based on historical spend,
// equipment age curves, and MTBF-driven failure rate predictions.
router.get('/cost-forecast', (req, res) => {
    try {
        const dataDir = require('../resolve_data_dir');
        const dbFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.db') && !f.includes('trier_') && !f.includes('corporate_'));
        const masterDb = require('../master_index');

        const forecasts = [];
        let enterpriseTotal = { actual6mo: 0, projected6mo: 0, bestCase: 0, worstCase: 0 };

        for (const dbFile of dbFiles) {
            const plantId = dbFile.replace('.db', '');
            const plantLabel = plantId.replace(/_/g, ' ');

            try {
                const tempDb = new Database(path.join(dataDir, dbFile), { readonly: true });

                // 1. Trailing 6-month actual spend (labor + parts + misc)
                const sixMonthsAgo = new Date();
                sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
                const sixMonthStr = sixMonthsAgo.toISOString();

                let laborCost = 0, partsCost = 0, miscCost = 0;
                try {
                    laborCost = tempDb.prepare(`
                        SELECT COALESCE(SUM(ActHrs * ActRate), 0) as total FROM WorkLabor 
                        WHERE WoID IN (SELECT ID FROM Work WHERE AddDate >= ?)
                    `).get(sixMonthStr)?.total || 0;
                } catch(e) { console.warn(`[Forecast] Labor cost query failed for ${plantLabel}: ${e.message}`); }

                try {
                    partsCost = tempDb.prepare(`
                        SELECT COALESCE(SUM(wp.Qty * p.UnitCost), 0) as total 
                        FROM WorkParts wp JOIN Part p ON wp.PartID = p.ID
                        WHERE wp.WoID IN (SELECT ID FROM Work WHERE AddDate >= ?)
                    `).get(sixMonthStr)?.total || 0;
                } catch(e) { console.warn(`[Forecast] Parts cost query failed for ${plantLabel}: ${e.message}`); }

                try {
                    miscCost = tempDb.prepare(`
                        SELECT COALESCE(SUM(Cost), 0) as total FROM WorkMisc
                        WHERE WoID IN (SELECT ID FROM Work WHERE AddDate >= ?)
                    `).get(sixMonthStr)?.total || 0;
                } catch(e) { console.warn(`[Forecast] Misc cost query failed for ${plantLabel}: ${e.message}`); }

                const actual6mo = laborCost + partsCost + miscCost;

                // 2. Equipment age factor (older fleet = higher projected costs)
                let ageFactor = 1.0;
                try {
                    const avgAge = tempDb.prepare(`
                        SELECT AVG(CAST((julianday('now') - julianday(LifeDate)) / 365.25 AS REAL)) as avgYears
                        FROM Asset WHERE LifeDate IS NOT NULL AND LifeDate != ''
                    `).get()?.avgYears || 0;
                    if (avgAge > 20) ageFactor = 1.25;
                    else if (avgAge > 10) ageFactor = 1.10;
                } catch(e) { console.warn(`[Forecast] Age factor query failed for ${plantLabel}: ${e.message}`); }

                // 3. MTBF risk multiplier from predictive engine
                let riskMultiplier = 1.0;
                try {
                    const risks = masterDb.prepare(`
                        SELECT COUNT(CASE WHEN riskLevel = 'High' THEN 1 END) as critical,
                               COUNT(CASE WHEN riskLevel = 'Medium' THEN 1 END) as warning,
                               COUNT(*) as total
                        FROM MasterAssetIndex WHERE plantId = ?
                    `).get(plantId);
                    if (risks.total > 0) {
                        const riskRatio = ((risks.critical * 2) + risks.warning) / risks.total;
                        riskMultiplier = 1.0 + (riskRatio * 0.15);
                    }
                } catch(e) { console.warn(`[Forecast] Risk multiplier query failed for ${plantLabel}: ${e.message}`); }

                // 4. Calculate projections
                const baseProjection = actual6mo * ageFactor * riskMultiplier;
                const projected6mo = Math.round(baseProjection);
                const bestCase = Math.round(baseProjection * 0.8);
                const worstCase = Math.round(baseProjection * 1.35);

                forecasts.push({
                    plantId, plantLabel,
                    actual6mo: Math.round(actual6mo),
                    projected6mo, bestCase, worstCase,
                    ageFactor: Math.round(ageFactor * 100) / 100,
                    riskMultiplier: Math.round(riskMultiplier * 100) / 100,
                    breakdown: { labor: Math.round(laborCost), parts: Math.round(partsCost), misc: Math.round(miscCost) }
                });

                enterpriseTotal.actual6mo += Math.round(actual6mo);
                enterpriseTotal.projected6mo += projected6mo;
                enterpriseTotal.bestCase += bestCase;
                enterpriseTotal.worstCase += worstCase;

                tempDb.close();
            } catch (err) { console.warn(`[Forecast] Skipping ${plantLabel}: ${err.message}`); }
        }

        res.json({
            forecasts: forecasts.sort((a, b) => b.projected6mo - a.projected6mo),
            enterprise: enterpriseTotal,
            generatedAt: new Date().toISOString()
        });
    } catch (err) {
        console.error('Failed to generate cost forecast:', err.message);
        res.status(500).json({ error: 'Failed to generate cost forecast' });
    }
});

// ── GET /api/analytics/technician-performance ────────────────────────────
// Enterprise Technician Performance Metrics
router.get('/technician-performance', (req, res) => {
    try {
        const dataDir = require('../resolve_data_dir');
        const { getPlants } = require('../plant_cache');
        const plants = getPlants();
        const techMap = {}; // LaborID → aggregated stats

        for (const p of plants) {
            const dbPath = path.join(dataDir, `${p.id}.db`);
            if (!fs.existsSync(dbPath)) continue;
            try {
                const plantDb = new Database(dbPath, { readonly: true });

                // Labor hours per technician
                const laborRows = plantDb.prepare(`
                    SELECT 
                        LaborID,
                        COUNT(*) as entries,
                        SUM(COALESCE(HrReg, 0)) as totalRegHrs,
                        SUM(COALESCE(HrOver, 0)) as totalOTHrs,
                        MAX(WorkDate) as lastActivity
                    FROM WorkLabor 
                    WHERE LaborID IS NOT NULL AND LaborID != ''
                    GROUP BY LaborID
                `).all();

                laborRows.forEach(row => {
                    const id = row.LaborID;
                    if (!techMap[id]) {
                        techMap[id] = {
                            laborId: id,
                            plants: [],
                            totalEntries: 0,
                            totalRegHrs: 0,
                            totalOTHrs: 0,
                            woCount: 0,
                            lastActivity: null
                        };
                    }
                    techMap[id].plants.push(p.label);
                    techMap[id].totalEntries += row.entries || 0;
                    techMap[id].totalRegHrs += row.totalRegHrs || 0;
                    techMap[id].totalOTHrs += row.totalOTHrs || 0;
                    if (!techMap[id].lastActivity || (row.lastActivity && row.lastActivity > techMap[id].lastActivity)) {
                        techMap[id].lastActivity = row.lastActivity;
                    }
                });

                // WO completions per assignee
                const woRows = plantDb.prepare(`
                    SELECT AssignToID, COUNT(*) as completed
                    FROM Work 
                    WHERE (StatusID IN (3, 4) OR CompDate IS NOT NULL)
                    AND AssignToID IS NOT NULL AND AssignToID != ''
                    GROUP BY AssignToID
                `).all();

                woRows.forEach(row => {
                    const id = row.AssignToID;
                    if (!techMap[id]) {
                        techMap[id] = {
                            laborId: id,
                            plants: [p.label],
                            totalEntries: 0,
                            totalRegHrs: 0,
                            totalOTHrs: 0,
                            woCount: 0,
                            lastActivity: null
                        };
                    }
                    techMap[id].woCount += row.completed || 0;
                });

                plantDb.close();
            } catch (e) { console.warn(`[TechPerf] Skipping plant ${p.label}: ${e.message}`); }
        }

        // Calculate derived metrics (round hours to 2dp to prevent floating-point drift)
        const technicians = Object.values(techMap).map(t => ({
            ...t,
            plants: [...new Set(t.plants)],
            totalRegHrs: Math.round(t.totalRegHrs * 100) / 100,
            totalOTHrs: Math.round(t.totalOTHrs * 100) / 100,
            totalHrs: Math.round((t.totalRegHrs + t.totalOTHrs) * 100) / 100,
            avgHrsPerEntry: t.totalEntries > 0 ? Math.round((t.totalRegHrs + t.totalOTHrs) / t.totalEntries * 10) / 10 : 0,
            overtimePct: (t.totalRegHrs + t.totalOTHrs) > 0 
                ? Math.round(t.totalOTHrs / (t.totalRegHrs + t.totalOTHrs) * 100) 
                : 0
        }));

        // Sort by most active
        technicians.sort((a, b) => b.totalEntries - a.totalEntries);

        res.json({
            technicians,
            total: technicians.length,
            plantsScanned: plants.length
        });
    } catch (err) {
        console.error('Technician performance error:', err);
        res.status(500).json({ error: 'Failed to calculate performance metrics' });
    }
});

// ── GET /api/analytics/budget-forecast ────────────────────────────────────
// Task 2.3b: 12-month budget projection with confidence bands
// Uses real Enterprise System schema: WorkLabor, WorkParts, WorkMisc for costs
router.get('/budget-forecast', (req, res) => {
    try {
        const dataDir = require('../resolve_data_dir');
        const requestedPlant = req.headers['x-plant-id'] || 'all_sites';
        const isEnterprise = !requestedPlant || requestedPlant === 'all_sites' || requestedPlant === 'Corporate_Office';
        let dbFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.db') && !f.includes('trier_') && !f.includes('corporate_'));
        
        if (!isEnterprise) {
            dbFiles = dbFiles.filter(f => f.replace('.db', '') === requestedPlant || f.replace('.db', '').toLowerCase() === requestedPlant.toLowerCase());
        }

        const plantSpend = [];
        let totalHistorical = 0;
        let totalAssets = 0;
        let avgAssetAge = 0;
        let totalWoCompleted = 0;

        for (const dbFile of dbFiles) {
            const plantName = dbFile.replace('.db', '');
            let db;
            try {
                db = new Database(path.join(dataDir, dbFile), { readonly: true });

                // ── Monthly WO volume (last 12 months) ──
                let monthlyWOs = [];
                try {
                    monthlyWOs = db.prepare(`
                        SELECT 
                            strftime('%Y-%m', w.CompDate) as month,
                            COUNT(DISTINCT w.ID) as wo_count
                        FROM Work w
                        WHERE w.CompDate IS NOT NULL 
                        AND w.CompDate >= date('now', '-12 months')
                        AND w.TypeID != 'PROJECT'
                        GROUP BY month ORDER BY month
                    `).all();
                } catch (e) {
                    try {
                        monthlyWOs = db.prepare(`SELECT strftime('%Y-%m', CompDate) as month, COUNT(*) as wo_count FROM Work WHERE CompDate IS NOT NULL AND CompDate >= date('now', '-12 months') GROUP BY month ORDER BY month`).all();
                    } catch(e2) {}
                }

                // ── Cost aggregation from sub-tables (12 months trailing OpEx) ──
                let laborCost = 0;
                try {
                    const lbr = db.prepare(`
                        SELECT COALESCE(SUM(
                            COALESCE(wl.HrReg,0) * CAST(COALESCE(wl.PayReg,'0') AS REAL) + 
                            COALESCE(wl.HrOver,0) * CAST(COALESCE(wl.PayOver,'0') AS REAL) +
                            COALESCE(wl.HrDouble,0) * CAST(COALESCE(wl.PayDouble,'0') AS REAL)
                        ),0) as total FROM WorkLabor wl
                        INNER JOIN Work w ON wl.WoID = w.ID
                        WHERE w.CompDate IS NOT NULL AND w.CompDate >= date('now', '-12 months')
                        AND w.TypeID != 'PROJECT'
                    `).get();
                    laborCost = lbr?.total || 0;
                } catch (e) {
                    try { laborCost = db.prepare(`SELECT COALESCE(SUM(COALESCE(HrReg,0)*CAST(COALESCE(PayReg,'0') AS REAL)+COALESCE(HrOver,0)*CAST(COALESCE(PayOver,'0') AS REAL)+COALESCE(HrDouble,0)*CAST(COALESCE(PayDouble,'0') AS REAL)),0) as v FROM WorkLabor`).get()?.v || 0; } catch {}
                }

                let partsCost = 0;
                try {
                    const prt = db.prepare(`
                        SELECT COALESCE(SUM(COALESCE(wp.ActQty,0) * CAST(COALESCE(wp.UnitCost,'0') AS REAL)),0) as total 
                        FROM WorkParts wp
                        INNER JOIN Work w ON wp.WoID = w.ID
                        WHERE w.CompDate IS NOT NULL AND w.CompDate >= date('now', '-12 months')
                        AND w.TypeID != 'PROJECT'
                    `).get();
                    partsCost = prt?.total || 0;
                } catch (e) {
                    try { partsCost = db.prepare(`SELECT COALESCE(SUM(COALESCE(ActQty,0)*CAST(COALESCE(UnitCost,'0') AS REAL)),0) as v FROM WorkParts`).get()?.v || 0; } catch{}
                }

                let miscCost = 0;
                try {
                    const msc = db.prepare(`
                        SELECT COALESCE(SUM(CAST(COALESCE(wm.ActCost,'0') AS REAL)),0) as total 
                        FROM WorkMisc wm
                        INNER JOIN Work w ON wm.WoID = w.ID
                        WHERE w.CompDate IS NOT NULL AND w.CompDate >= date('now', '-12 months')
                        AND w.TypeID != 'PROJECT'
                    `).get();
                    miscCost = msc?.total || 0;
                } catch (e) {
                    try { miscCost = db.prepare(`SELECT COALESCE(SUM(CAST(COALESCE(ActCost,'0') AS REAL)),0) as v FROM WorkMisc`).get()?.v || 0; } catch{}
                }

                const bestCost = laborCost + partsCost + miscCost;

                // ── Current Month Actual Spend (OpEx Only) ──
                let currentMonthActual = 0;
                try {
                    const cmLbr = db.prepare(`SELECT COALESCE(SUM(COALESCE(wl.HrReg,0)*CAST(COALESCE(wl.PayReg,'0') AS REAL)+COALESCE(wl.HrOver,0)*CAST(COALESCE(wl.PayOver,'0') AS REAL)+COALESCE(wl.HrDouble,0)*CAST(COALESCE(wl.PayDouble,'0') AS REAL)),0) as total FROM WorkLabor wl INNER JOIN Work w ON wl.WoID = w.ID WHERE w.CompDate IS NOT NULL AND strftime('%Y-%m', w.CompDate) = strftime('%Y-%m', 'now') AND w.TypeID != 'PROJECT'`).get()?.total || 0;
                    const cmPrt = db.prepare(`SELECT COALESCE(SUM(COALESCE(wp.ActQty,0)*CAST(COALESCE(wp.UnitCost,'0') AS REAL)),0) as total FROM WorkParts wp INNER JOIN Work w ON wp.WoID = w.ID WHERE w.CompDate IS NOT NULL AND strftime('%Y-%m', w.CompDate) = strftime('%Y-%m', 'now') AND w.TypeID != 'PROJECT'`).get()?.total || 0;
                    const cmMsc = db.prepare(`SELECT COALESCE(SUM(CAST(COALESCE(wm.ActCost,'0') AS REAL)),0) as total FROM WorkMisc wm INNER JOIN Work w ON wm.WoID = w.ID WHERE w.CompDate IS NOT NULL AND strftime('%Y-%m', w.CompDate) = strftime('%Y-%m', 'now') AND w.TypeID != 'PROJECT'`).get()?.total || 0;
                    currentMonthActual = cmLbr + cmPrt + cmMsc;
                } catch(e) {}

                // ── Asset stats ──
                let assetStats = { count: 0, avgAge: 5 };
                try {
                    const stats = db.prepare(`
                        SELECT 
                            COUNT(*) as count,
                            AVG(CASE 
                                WHEN InstallDate IS NOT NULL AND InstallDate != '' 
                                THEN (julianday('now') - julianday(InstallDate)) / 365.25
                                ELSE 5 
                            END) as avgAge
                        FROM Asset
                    `).get();
                    if (stats) assetStats = stats;
                } catch (e) {}

                // ── Parts inventory value ──
                let partsValue = 0;
                try {
                    partsValue = db.prepare(`SELECT SUM(CAST(COALESCE(UnitCost,0) AS REAL) * CAST(COALESCE(Stock,0) AS REAL)) as val FROM Part`).get()?.val || 0;
                } catch (e) {}

                // ── Failure indicator: emergency/breakdown WO count ──
                let failureWOs = 0;
                try {
                    failureWOs = db.prepare(`
                        SELECT COUNT(*) as c FROM Work 
                        WHERE Priority IN ('1','0','Emergency','Critical')
                        OR ReasonID IN (SELECT ID FROM Reason WHERE Description LIKE '%Breakdown%' OR Description LIKE '%Emergency%')
                    `).get()?.c || 0;
                } catch (e) {}

                const plantWoCount = monthlyWOs.reduce((sum, m) => sum + (m.wo_count || 0), 0);

                plantSpend.push({
                    plant: plantName,
                    monthlyData: monthlyWOs,
                    currentActualSpend: currentMonthActual,
                    totalSpend: Math.round(bestCost),
                    laborCost: Math.round(laborCost),
                    partsCost: Math.round(partsCost),
                    miscCost: Math.round(miscCost),
                    woCount: plantWoCount,
                    assetCount: assetStats.count || 0,
                    avgAssetAge: assetStats.avgAge || 5,
                    failureWOs,
                    partsValue: Math.round(partsValue)
                });

                totalHistorical += bestCost;
                totalAssets += (assetStats.count || 0);
                avgAssetAge += (assetStats.avgAge || 5);
                totalWoCompleted += plantWoCount;
                db.close();
            } catch (e) { console.warn(`[BudgetForecast] Skipping ${plantName}: ${e.message}`); if (db) try { db.close(); } catch(x){} }
        }

        const plantCount = plantSpend.length || 1;
        avgAssetAge = avgAssetAge / plantCount;

        // ── Build 12-month forward projection ──
        const monthlyAvg = totalHistorical / 12 || 0;
        const ageFactor = 1 + (Math.max(avgAssetAge - 5, 0) * 0.03); // 3% per year over 5
        const totalFailureWOs = plantSpend.reduce((s, p) => s + p.failureWOs, 0);
        const failureFactor = totalFailureWOs > 100 ? 1.15 : totalFailureWOs > 50 ? 1.1 : 1.0;

        const forecast = [];
        const now = new Date();
        for (let i = 0; i < 12; i++) {
            const forecastDate = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
            const monthStr = forecastDate.toISOString().slice(0, 7);
            const month = forecastDate.getMonth();
            const seasonal = [1.1, 1.08, 1.0, 0.95, 0.9, 0.88, 0.85, 0.88, 0.92, 0.98, 1.02, 1.12][month];
            const baseProjection = monthlyAvg * ageFactor * failureFactor * seasonal;

            forecast.push({
                month: monthStr,
                projected: Math.round(baseProjection),
                bestCase: Math.round(baseProjection * 0.8),
                worstCase: Math.round(baseProjection * 1.35),
                seasonal
            });
        }

        const currentMonth = now.toISOString().slice(0, 7);
        let currentActualSpend = 0;
        for (const ps of plantSpend) {
            currentActualSpend += ps.currentActualSpend || 0;
        }

        // Defect 4.2 Fix: negative budget variances are preserved (not defaulting to 0) to explicitly highlight deficits
        const projectedCurrent = forecast[0]?.projected || 0;
        const currentVariance = Math.round(currentActualSpend - projectedCurrent);
        const currentVariancePercent = projectedCurrent > 0 ? Math.round((currentVariance / projectedCurrent) * 100) : 0;

        res.json({
            summary: {
                totalPlants: plantCount,
                totalAssets,
                avgAssetAge: Math.round(avgAssetAge * 10) / 10,
                totalWoCompleted12m: totalWoCompleted,
                totalFailureWOs,
                historicalSpend12m: Math.round(totalHistorical),
                monthlyAverage: Math.round(monthlyAvg),
                ageFactor: Math.round(ageFactor * 100) / 100,
                annualProjection: Math.round(forecast.reduce((s, f) => s + f.projected, 0))
            },
            currentMonth: {
                month: currentMonth,
                actual: Math.round(currentActualSpend),
                projected: projectedCurrent,
                variance: currentVariance,
                variancePercent: currentVariancePercent
            },
            forecast,
            plantBreakdown: plantSpend.map(ps => ({
                plant: ps.plant,
                spend12m: ps.totalSpend,
                laborCost: ps.laborCost,
                partsCost: ps.partsCost,
                miscCost: ps.miscCost,
                woCount: ps.woCount,
                assetCount: ps.assetCount,
                avgAge: Math.round(ps.avgAssetAge * 10) / 10,
                failureWOs: ps.failureWOs,
                partsValue: ps.partsValue
            })).sort((a, b) => b.spend12m - a.spend12m)
        });
    } catch (err) {
        console.error('[Budget Forecast] Error:', err.message);
        res.status(500).json({ error: 'Forecast calculation failed' });
    }
});

// ── GET /api/analytics/plant-weather ─────────────────────────────────────
// Plant Health Weather Map — aggregates per-plant health into weather conditions
const weatherCache = new Cache(5); // 5 minute cache
router.get('/plant-weather', (req, res) => {
    const cached = weatherCache.get('plant_weather');
    if (cached) return res.json(cached);

    try {
        const dataDir = require('../resolve_data_dir');
        const { getPlants } = require('../plant_cache');
        const masterDb = require('../master_index');
        const plants = getPlants();
        const plantWeather = [];

        for (const plant of plants) {
            const dbPath = path.join(dataDir, `${plant.id}.db`);
            if (!fs.existsSync(dbPath)) continue;

            let plantDb;
            try {
                plantDb = new Database(dbPath, { readonly: true });

                // 1. Asset health from MasterAssetIndex
                let avgHealth = 85, criticalAssets = 0, warningAssets = 0, totalAssets = 0;
                try {
                    const health = masterDb.prepare(`
                        SELECT 
                            AVG(healthScore) as avg,
                            COUNT(*) as total,
                            COUNT(CASE WHEN riskLevel = 'High' THEN 1 END) as critical,
                            COUNT(CASE WHEN riskLevel = 'Medium' THEN 1 END) as warning
                        FROM MasterAssetIndex WHERE plantId = ?
                    `).get(plant.id);
                    if (health && health.total > 0) {
                        avgHealth = Math.round(health.avg);
                        criticalAssets = health.critical;
                        warningAssets = health.warning;
                        totalAssets = health.total;
                    }
                } catch(e) { console.warn(`[Weather] Asset health query failed for ${plant.id}: ${e.message}`); }

                // 2. Open & urgent work orders
                let openWOs = 0, urgentWOs = 0, overdueWOs = 0;
                try {
                    const wos = plantDb.prepare(`
                        SELECT 
                            COUNT(*) as open,
                            COUNT(CASE WHEN Priority IN ('1','0','Emergency','Critical') THEN 1 END) as urgent,
                            COUNT(CASE WHEN ReqDate < date('now', '-7 days') AND StatusID < 40 THEN 1 END) as overdue
                        FROM Work WHERE StatusID < 40
                    `).get();
                    openWOs = wos?.open || 0;
                    urgentWOs = wos?.urgent || 0;
                    overdueWOs = wos?.overdue || 0;
                } catch(e) { console.warn(`[Weather] Open WO query failed for ${plant.id}: ${e.message}`); }

                // 3. PM compliance (last 30 days)
                let pmOnTime = 0, pmOverdue = 0, pmCompliance = 100;
                try {
                    const pms = plantDb.prepare(`
                        SELECT 
                            COUNT(CASE WHEN StatusID >= 40 AND date(CompDate) <= date(COALESCE(DueDate, SchDate, CompDate)) THEN 1 END) as onTime,
                            COUNT(CASE WHEN date(COALESCE(DueDate, SchDate, CompDate)) <= date('now') OR StatusID >= 40 THEN 1 END) as totalDue,
                            COUNT(CASE WHEN StatusID < 40 AND COALESCE(DueDate, SchDate, AddDate) < date('now') THEN 1 END) as overdue
                        FROM Work 
                        WHERE TypeID IN (SELECT ID FROM WorkType WHERE Description LIKE '%PM%')
                        AND AddDate >= date('now', '-30 days')
                    `).get();
                    pmOnTime = pms?.onTime || 0;
                    pmOverdue = pms?.overdue || 0;
                    const pmTotalDue = pms?.totalDue || 0;
                    pmCompliance = pmTotalDue > 0 ? Math.round((pmOnTime / pmTotalDue) * 100) : 100;
                } catch(e) { console.warn(`[Weather] PM compliance query failed for ${plant.id}: ${e.message}`); }

                // 4. Recent failures (emergency/breakdown WOs in past 30 days)
                let recentFailures = 0;
                try {
                    const fails = plantDb.prepare(`
                        SELECT COUNT(*) as cnt FROM Work 
                        WHERE AddDate >= date('now', '-30 days')
                        AND (Priority IN ('1','0','Emergency','Critical')
                            OR ReasonID IN (SELECT ID FROM Reason WHERE Description LIKE '%Breakdown%' OR Description LIKE '%Emergency%'))
                    `).get();
                    recentFailures = fails?.cnt || 0;
                } catch(e) { console.warn(`[Weather] Recent failures query failed for ${plant.id}: ${e.message}`); }

                // 5. WO completion rate (last 30 days)
                let completionRate = 100;
                try {
                    const cr = plantDb.prepare(`
                        SELECT 
                            COUNT(*) as total,
                            COUNT(CASE WHEN StatusID >= 40 THEN 1 END) as completed
                        FROM Work WHERE AddDate >= date('now', '-30 days')
                    `).get();
                    if (cr && cr.total > 0) {
                        completionRate = Math.round((cr.completed / cr.total) * 100);
                    }
                } catch(e) { console.warn(`[Weather] Completion rate query failed for ${plant.id}: ${e.message}`); }

                // 6. MTBF data
                let avgMTBF = 0;
                try {
                    const mtbf = masterDb.prepare(`
                        SELECT AVG(mtbfDays) as avg FROM MasterAssetIndex
                        WHERE plantId = ? AND mtbfDays > 0
                    `).get(plant.id);
                    avgMTBF = Math.round(mtbf?.avg || 0);
                } catch(e) { console.warn(`[Weather] MTBF query failed for ${plant.id}: ${e.message}`); }

                plantDb.close();

                // ── Calculate composite weather score (0-100) ──
                let score = 100;
                // Deductions
                score -= Math.min(30, criticalAssets * 10);       // Critical assets: up to -30
                score -= Math.min(15, warningAssets * 3);          // Warning assets: up to -15
                score -= Math.min(15, urgentWOs * 5);              // Urgent WOs: up to -15
                score -= Math.min(10, overdueWOs * 2);             // Overdue WOs: up to -10
                score -= Math.min(10, pmOverdue * 3);              // Overdue PMs: up to -10
                score -= Math.min(10, recentFailures * 2);         // Recent failures: up to -10
                score -= Math.min(10, Math.max(0, 100 - completionRate)); // Low completion: up to -10
                score = Math.max(0, Math.min(100, score));

                // ── Map score to weather condition ──
                let condition, icon, gradient;
                if (score >= 85) {
                    condition = 'Sunny'; icon = '☀️';
                    gradient = ['#fbbf24', '#f59e0b'];
                } else if (score >= 70) {
                    condition = 'Partly Cloudy'; icon = '🌤️';
                    gradient = ['#60a5fa', '#3b82f6'];
                } else if (score >= 55) {
                    condition = 'Cloudy'; icon = '⛅';
                    gradient = ['#9ca3af', '#6b7280'];
                } else if (score >= 40) {
                    condition = 'Rainy'; icon = '🌧️';
                    gradient = ['#f97316', '#ea580c'];
                } else {
                    condition = 'Stormy'; icon = '⛈️';
                    gradient = ['#ef4444', '#dc2626'];
                }

                plantWeather.push({
                    plantId: plant.id,
                    plantLabel: plant.label,
                    score,
                    condition,
                    icon,
                    gradient,
                    metrics: {
                        avgHealth,
                        totalAssets,
                        criticalAssets,
                        warningAssets,
                        openWOs,
                        urgentWOs,
                        overdueWOs,
                        pmOnTime,
                        pmOverdue,
                        pmCompliance,
                        recentFailures,
                        completionRate,
                        avgMTBF
                    }
                });
            } catch(e) {
                if (plantDb) try { plantDb.close(); } catch(x) {}
            }
        }

        // Sort: worst weather first for visibility
        plantWeather.sort((a, b) => a.score - b.score);

        // Enterprise aggregate
        const enterprise = {
            avgScore: plantWeather.length > 0 
                ? Math.round(plantWeather.reduce((s, p) => s + p.score, 0) / plantWeather.length)
                : 100,
            totalPlants: plantWeather.length,
            sunny: plantWeather.filter(p => p.condition === 'Sunny').length,
            partlyCloudy: plantWeather.filter(p => p.condition === 'Partly Cloudy').length,
            cloudy: plantWeather.filter(p => p.condition === 'Cloudy').length,
            rainy: plantWeather.filter(p => p.condition === 'Rainy').length,
            stormy: plantWeather.filter(p => p.condition === 'Stormy').length
        };

        const result = { plants: plantWeather, enterprise, generatedAt: new Date().toISOString() };
        weatherCache.set('plant_weather', result);
        res.json(result);
    } catch (err) {
        console.error('[Plant Weather] Error:', err.message);
        res.status(500).json({ error: 'Failed to generate plant weather map' });
    }
});

// ── GET /api/analytics/mtbf-dashboard ────────────────────────────────────
// MTBF/MTTR Analytics: per-asset reliability metrics from actual WO history.
// Calculates Mean Time Between Failures (days between corrective WOs) and
// Mean Time To Repair (average ActDown or ActualHours on corrective WOs).
const mtbfCache = new Cache(5);
router.get('/mtbf-dashboard', (req, res) => {
    // SEC-05: sanitize both param sources before using in queries or cache key
    const rawPlant  = req.query.plantId || req.headers['x-plant-id'];
    const plantFilter = sanitizePlantId(rawPlant);
    if (rawPlant && !plantFilter) {
        return res.status(400).json({ error: 'Invalid plant identifier' });
    }
    const cacheKey = `mtbf_${plantFilter || 'enterprise'}`;
    const cached = mtbfCache.get(cacheKey);
    if (cached) return res.json(cached);

    try {
        const dataDir = require('../resolve_data_dir');
        const { getPlants } = require('../plant_cache');
        const plants = getPlants();
        
        const assetMap = {}; // assetId → { plant, failures: [{date, downtime, failureMode}], description }
        const plantStats = []; // per-plant MTBF/MTTR averages
        const failureModeCount = {}; // failureMode → count
        const monthlyFailures = {}; // "YYYY-MM" → count
        
        const targetPlants = plantFilter && plantFilter !== 'all_sites' 
            ? plants.filter(p => p.id === plantFilter) 
            : plants;

        for (const plant of targetPlants) {
            const dbPath = path.join(dataDir, `${plant.id}.db`);
            if (!fs.existsSync(dbPath)) continue;

            let plantDb;
            try {
                plantDb = new Database(dbPath, { readonly: true });

                // Get corrective/breakdown work orders with asset linkage
                const wos = plantDb.prepare(`
                    SELECT 
                        w.AstID, w.CompDate, w.StartDate, w.AddDate,
                        w.ActDown, w.ActualHours, w.FailureMode, w.Descript,
                        w.Description, w.TypeID, w.Priority
                    FROM Work w
                    WHERE w.AstID IS NOT NULL AND w.AstID != ''
                    AND (w.CompDate IS NOT NULL OR w.StatusID >= 30)
                    ORDER BY w.AstID, w.CompDate
                `).all();

                // Get asset descriptions
                const assetDescs = {};
                try {
                    const assets = plantDb.prepare('SELECT ID, Descript FROM Asset').all();
                    assets.forEach(a => { assetDescs[a.ID] = a.Descript || a.ID; });
                } catch (e) { /* no Asset table */ }

                wos.forEach(wo => {
                    const key = `${plant.id}::${wo.AstID}`;
                    if (!assetMap[key]) {
                        assetMap[key] = {
                            assetId: wo.AstID,
                            plantId: plant.id,
                            plantLabel: plant.label,
                            description: assetDescs[wo.AstID] || wo.AstID,
                            failures: []
                        };
                    }

                    const completedDate = wo.CompDate || wo.StartDate || wo.AddDate;
                    const downtime = wo.ActDown || wo.ActualHours || 0;
                    const failureMode = (wo.FailureMode || '').trim();

                    assetMap[key].failures.push({
                        date: completedDate,
                        downtime: parseFloat(downtime) || 0,
                        failureMode: failureMode,
                        type: wo.TypeID,
                        priority: wo.Priority,
                        description: wo.Description || wo.Descript || ''
                    });

                    // Track failure modes
                    if (failureMode) {
                        failureModeCount[failureMode] = (failureModeCount[failureMode] || 0) + 1;
                    }

                    // Track monthly failures
                    if (completedDate) {
                        const month = completedDate.substring(0, 7);
                        if (month.match(/^\d{4}-\d{2}$/)) {
                            monthlyFailures[month] = (monthlyFailures[month] || 0) + 1;
                        }
                    }
                });

                plantDb.close();
            } catch (e) {
                console.warn(`[MTBF] Skipping ${plant.label}: ${e.message}`);
                if (plantDb) try { plantDb.close(); } catch (_) {}
            }
        }

        // Calculate MTBF and MTTR per asset
        const assetReliability = [];
        
        for (const [key, asset] of Object.entries(assetMap)) {
            const failures = asset.failures
                .filter(f => f.date)
                .sort((a, b) => a.date.localeCompare(b.date));
            
            if (failures.length === 0) continue;

            // ── Defect 3.1: True MTBF Calculation (Total Uptime / Failures) ──
            const operatingDays = 1825; // Fallback: 5-year operating window if install date missing
            const totalDowntimeDays = failures.reduce((s, f) => s + (f.downtime / 24), 0);
            const totalOperatingUptime = Math.max(0, operatingDays - totalDowntimeDays);
            const mtbfDays = failures.length > 0 ? Math.round(totalOperatingUptime / failures.length) : null;

            // ── Defect 3.2: True MTTR (Include all repairs natively, even 0 hr) ──
            const downtimes = failures.map(f => f.downtime);
            const mttrHours = downtimes.length > 0
                ? Math.round((downtimes.reduce((s, d) => s + d, 0) / downtimes.length) * 100) / 100
                : null;

            // Reliability score (0-100): higher MTBF + lower MTTR = better
            let reliabilityScore = 50; // default
            if (mtbfDays !== null) {
                let mtbfScore = Math.min(mtbfDays / 3, 100); // 300+ days MTBF = perfect
                let mttrPenalty = mttrHours !== null ? Math.min(mttrHours * 2, 40) : 0; // each hour costs 2 pts
                reliabilityScore = Math.max(0, Math.min(100, Math.round(mtbfScore - mttrPenalty)));
            }

            // Top failure modes for this asset
            const assetFailureModes = {};
            failures.forEach(f => {
                if (f.failureMode) {
                    assetFailureModes[f.failureMode] = (assetFailureModes[f.failureMode] || 0) + 1;
                }
            });
            const topFailureMode = Object.entries(assetFailureModes)
                .sort((a, b) => b[1] - a[1])[0];

            assetReliability.push({
                assetId: asset.assetId,
                plantId: asset.plantId,
                plantLabel: asset.plantLabel,
                description: asset.description,
                totalFailures: failures.length,
                mtbfDays,
                mttrHours,
                reliabilityScore,
                riskLevel: reliabilityScore >= 70 ? 'Low' : reliabilityScore >= 40 ? 'Medium' : 'High',
                lastFailure: failures[failures.length - 1]?.date || null,
                topFailureMode: topFailureMode ? { mode: topFailureMode[0], count: topFailureMode[1] } : null
            });
        }

        // Sort: worst reliability first (lowest MTBF / most failures)
        assetReliability.sort((a, b) => a.reliabilityScore - b.reliabilityScore);

        // Enterprise summary
        const withMtbf = assetReliability.filter(a => a.mtbfDays !== null);
        const withMttr = assetReliability.filter(a => a.mttrHours !== null);
        const avgMtbf = withMtbf.length > 0 ? Math.round(withMtbf.reduce((s, a) => s + a.mtbfDays, 0) / withMtbf.length) : 0;
        const avgMttr = withMttr.length > 0 ? Math.round(withMttr.reduce((s, a) => s + a.mttrHours, 0) / withMttr.length * 100) / 100 : 0;

        // Plant comparison
        const plantGroups = {};
        assetReliability.forEach(a => {
            if (!plantGroups[a.plantId]) {
                plantGroups[a.plantId] = { plantId: a.plantId, plantLabel: a.plantLabel, assets: [] };
            }
            plantGroups[a.plantId].assets.push(a);
        });

        const plantComparison = Object.values(plantGroups).map(pg => {
            const pgMtbf = pg.assets.filter(a => a.mtbfDays !== null);
            const pgMttr = pg.assets.filter(a => a.mttrHours !== null);
            return {
                plantId: pg.plantId,
                plantLabel: pg.plantLabel,
                assetCount: pg.assets.length,
                totalFailures: pg.assets.reduce((s, a) => s + a.totalFailures, 0),
                avgMtbf: pgMtbf.length > 0 ? Math.round(pgMtbf.reduce((s, a) => s + a.mtbfDays, 0) / pgMtbf.length) : null,
                avgMttr: pgMttr.length > 0 ? Math.round(pgMttr.reduce((s, a) => s + a.mttrHours, 0) / pgMttr.length * 100) / 100 : null,
                avgReliability: Math.round(pg.assets.reduce((s, a) => s + a.reliabilityScore, 0) / pg.assets.length),
                criticalAssets: pg.assets.filter(a => a.riskLevel === 'High').length
            };
        }).sort((a, b) => a.avgReliability - b.avgReliability);

        // Failure mode distribution (top 15)
        const failureModeDistribution = Object.entries(failureModeCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 15)
            .map(([mode, count]) => ({ mode, count }));

        // Monthly trend (last 12 months)
        const months = [];
        const now = new Date();
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = d.toISOString().substring(0, 7);
            months.push({ month: key, failures: monthlyFailures[key] || 0 });
        }

        const result = {
            summary: {
                totalAssets: assetReliability.length,
                totalFailures: assetReliability.reduce((s, a) => s + a.totalFailures, 0),
                avgMtbf,
                avgMttr,
                avgReliability: assetReliability.length > 0
                    ? Math.round(assetReliability.reduce((s, a) => s + a.reliabilityScore, 0) / assetReliability.length)
                    : 100,
                criticalCount: assetReliability.filter(a => a.riskLevel === 'High').length,
                warningCount: assetReliability.filter(a => a.riskLevel === 'Medium').length,
                healthyCount: assetReliability.filter(a => a.riskLevel === 'Low').length
            },
            assets: assetReliability.slice(0, 100), // Top 100 worst
            plantComparison,
            failureModeDistribution,
            monthlyTrend: months,
            plantsScanned: targetPlants.length,
            generatedAt: new Date().toISOString()
        };

        mtbfCache.set(cacheKey, result);
        res.json(result);
    } catch (err) {
        console.error('[MTBF Dashboard] Error:', err.message, err.stack);
        res.status(500).json({ error: 'Failed to generate MTBF dashboard' });
    }
});

// ═══════════════════════════════════════════════════════════════
// OEE Dashboard — Availability × Performance × Quality
// ═══════════════════════════════════════════════════════════════
const oeeCache = new Map();
router.get('/oee-dashboard', async (req, res) => {
    try {
        const requestedPlant = req.headers['x-plant-id'] || 'all_sites';
        const isEnterprise = !requestedPlant || requestedPlant === 'all_sites' || requestedPlant === 'Corporate_Office';
        const cacheKey = isEnterprise ? 'oee-all' : `oee_${requestedPlant}`;
        const cached = oeeCache.get(cacheKey);
        if (cached && (Date.now() - cached.ts < 5 * 60 * 1000)) {
            return res.json(cached.data);
        }

        const path = require('path');
        const fs = require('fs');
        const Database = require('better-sqlite3');
        const dataDir = require('../resolve_data_dir');
        const plantsFile = path.join(dataDir, 'plants.json');
        if (!fs.existsSync(plantsFile)) return res.json({ assets: [], plants: [], trends: [] });
        let plants = JSON.parse(fs.readFileSync(plantsFile, 'utf8'));
        
        if (!isEnterprise) {
            plants = plants.filter(p => p.id === requestedPlant || p.id.toLowerCase() === requestedPlant.toLowerCase());
        }

        const assetMap = {};    // asset-level OEE
        const plantMap = {};    // plant-level OEE
        const monthMap = {};    // monthly trends

        // Planned hours per month per asset (assume 24/7 = 720 hrs/month for industrial)
        const PLANNED_HRS_MONTH = 720;

        plants.forEach(p => {
            const dbPath = path.join(dataDir, `${p.id}.db`);
            if (!fs.existsSync(dbPath)) return;
            try {
                const tempDb = new Database(dbPath, { readonly: true });
                const hasWork = tempDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='Work'").get();
                if (!hasWork) { tempDb.close(); return; }

                // Get all completed WOs with asset + downtime
                const wos = tempDb.prepare(`
                    SELECT w.AstID, a.Description as AstDesc,
                           CAST(COALESCE(w.ActDown, 0) AS REAL) as downHrs,
                           CAST(COALESCE(w.ActualHours, 0) AS REAL) as repairHrs,
                           CAST(COALESCE(w.EstDown, 0) AS REAL) as estDown,
                           w.CompDate, w.StartDate, w.FailureMode,
                           w.StatusID, w.TypeID
                    FROM Work w
                    LEFT JOIN Asset a ON w.AstID = a.ID
                    WHERE w.AstID IS NOT NULL AND w.AstID != ''
                `).all();

                // Count total assets for this plant
                let assetCount = 0;
                try { assetCount = tempDb.prepare("SELECT COUNT(*) as c FROM Asset WHERE (IsDeleted IS NULL OR IsDeleted = 0)").get().c; } catch(e) {}

                let plantDown = 0, plantRepairs = 0, plantWOs = 0, plantRepeatFails = 0;
                const plantFailMap = {};

                wos.forEach(wo => {
                    const key = `${p.id}::${wo.AstID}`;
                    if (!assetMap[key]) {
                        assetMap[key] = {
                            assetId: wo.AstID, assetDesc: wo.AstDesc || wo.AstID,
                            plant: p.label, plantId: p.id,
                            totalDown: 0, totalRepairHrs: 0, woCount: 0,
                            repeatFails: 0, failModes: {}, monthsActive: new Set()
                        };
                    }
                    const a = assetMap[key];
                    a.totalDown += wo.downHrs;
                    a.totalRepairHrs += wo.repairHrs;
                    a.woCount++;

                    // Track failure modes for quality (repeat = same failure mode)
                    if (wo.FailureMode) {
                        a.failModes[wo.FailureMode] = (a.failModes[wo.FailureMode] || 0) + 1;
                    }

                    // Monthly trend
                    const date = wo.CompDate || wo.StartDate || '';
                    const month = date.substring(0, 7); // YYYY-MM
                    if (month.length === 7) {
                        a.monthsActive.add(month);
                        if (!monthMap[month]) monthMap[month] = { month, totalDown: 0, totalRepairs: 0, woCount: 0 };
                        monthMap[month].totalDown += wo.downHrs;
                        monthMap[month].totalRepairs += wo.repairHrs;
                        monthMap[month].woCount++;
                    }

                    plantDown += wo.downHrs;
                    plantRepairs += wo.repairHrs;
                    plantWOs++;
                    if (wo.FailureMode) {
                        plantFailMap[wo.FailureMode] = (plantFailMap[wo.FailureMode] || 0) + 1;
                    }
                });

                // Count repeat failures (same failure mode > 1 occurrence)
                Object.values(assetMap).forEach(a => {
                    if (a.plantId === p.id) {
                        a.repeatFails = Object.values(a.failModes).filter(c => c > 1).length;
                    }
                });

                const plantRepeats = Object.values(plantFailMap).filter(c => c > 1).length;
                const monthsSpan = Math.max(1, new Set(wos.map(w => (w.CompDate || '').substring(0, 7)).filter(m => m.length === 7)).size);

                plantMap[p.id] = {
                    plantId: p.id, label: p.label, assetCount,
                    totalDown: Math.round(plantDown * 10) / 10,
                    totalRepairHrs: Math.round(plantRepairs * 10) / 10,
                    woCount: plantWOs, repeatFails: plantRepeats,
                    monthsSpan
                };

                tempDb.close();
            } catch (e) { console.warn(`[OEE] Skipping ${p.id}: ${e.message}`); }
        });

        // Calculate OEE per asset
        const assets = Object.values(assetMap).map(a => {
            const months = Math.max(1, a.monthsActive.size);
            const plannedHrs = months * PLANNED_HRS_MONTH;

            // Availability = (Planned - Downtime) / Planned
            const availability = Math.max(0, Math.min(1, (plannedHrs - a.totalDown) / plannedHrs));

            // ── Defect 3.3: True OEE Performance Baseline ──
            // OEE Performance = (Ideal Cycle Time * Total Units) / Run Time
            // Absent SCADA line throughput data, we enforce a strict 1.0 (100%) constant 
            // so Availability and Quality natively drive OEE without mechanic speed conflation.
            const performance = 1.0;

            // Quality = 1 - (repeat failures / total WOs)
            const repeatRatio = a.woCount > 0 ? a.repeatFails / a.woCount : 0;
            const quality = Math.max(0, Math.min(1, 1 - repeatRatio));

            const oee = availability * performance * quality;

            return {
                assetId: a.assetId, assetDesc: a.assetDesc,
                plant: a.plant, plantId: a.plantId,
                availability: Math.round(availability * 1000) / 10,
                performance: Math.round(performance * 1000) / 10,
                quality: Math.round(quality * 1000) / 10,
                oee: Math.round(oee * 1000) / 10,
                totalDown: Math.round(a.totalDown * 10) / 10,
                avgRepairHrs: Math.round((a.woCount > 0 ? a.totalRepairHrs / a.woCount : 0) * 10) / 10,
                woCount: a.woCount, repeatFails: a.repeatFails,
                topFailMode: Object.entries(a.failModes).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'
            };
        }).sort((a, b) => a.oee - b.oee);

        // Calculate OEE per plant
        const plantResults = Object.values(plantMap).map(p => {
            const plannedHrs = p.monthsSpan * PLANNED_HRS_MONTH * Math.max(p.assetCount, 1);
            const availability = Math.max(0, Math.min(1, (plannedHrs - p.totalDown) / plannedHrs));
            const performance = 1.0; // Defect 3.3 proxy for plant OEE line speed
            const repeatRatio = p.woCount > 0 ? p.repeatFails / p.woCount : 0;
            const quality = Math.max(0, Math.min(1, 1 - repeatRatio));
            const oee = availability * performance * quality;

            return {
                ...p,
                availability: Math.round(availability * 1000) / 10,
                performance: Math.round(performance * 1000) / 10,
                quality: Math.round(quality * 1000) / 10,
                oee: Math.round(oee * 1000) / 10
            };
        }).sort((a, b) => b.oee - a.oee);

        // Monthly trends (last 12 months)
        const trends = Object.values(monthMap)
            .sort((a, b) => a.month.localeCompare(b.month))
            .slice(-12)
            .map(m => {
                const plannedHrs = PLANNED_HRS_MONTH * assets.length;
                const avail = Math.max(0, Math.min(100, ((plannedHrs - m.totalDown) / plannedHrs) * 100));
                return { ...m, availability: Math.round(avail * 10) / 10 };
            });

        // Enterprise averages
        const avgOee = assets.length > 0 ? Math.round(assets.reduce((s, a) => s + a.oee, 0) / assets.length * 10) / 10 : 0;
        const avgAvail = assets.length > 0 ? Math.round(assets.reduce((s, a) => s + a.availability, 0) / assets.length * 10) / 10 : 0;
        const avgPerf = assets.length > 0 ? Math.round(assets.reduce((s, a) => s + a.performance, 0) / assets.length * 10) / 10 : 0;
        const avgQual = assets.length > 0 ? Math.round(assets.reduce((s, a) => s + a.quality, 0) / assets.length * 10) / 10 : 0;
        const worldClass = assets.filter(a => a.oee >= 85).length;

        const result = {
            summary: { avgOee, avgAvail, avgPerf, avgQual, totalAssets: assets.length, worldClass, plantsScanned: plants.length },
            assets,
            plants: plantResults,
            trends,
            generated: new Date().toISOString()
        };

        oeeCache.set(cacheKey, { data: result, ts: Date.now() });
        res.json(result);
    } catch (err) {
        console.error('[OEE Dashboard] Error:', err.message, err.stack);
        res.status(500).json({ error: 'Failed to generate OEE dashboard' });
    }
});

// ═══════════════════════════════════════════════════════════════
// Parts Where-Used — Which assets consume this part?
// ═══════════════════════════════════════════════════════════════
router.get('/parts-where-used/:partId', (req, res) => {
    try {
        const partId = req.params.partId;
        const path = require('path');
        const fs = require('fs');
        const Database = require('better-sqlite3');
        const dataDir = require('../resolve_data_dir');
        const plantsFile = path.join(dataDir, 'plants.json');
        if (!fs.existsSync(plantsFile)) return res.json({ assets: [], bom: [] });
        const plants = JSON.parse(fs.readFileSync(plantsFile, 'utf8'));

        const usedOn = [];   // From WorkParts — actual consumption
        const bomOn = [];    // From AssetParts — BOM linkage

        plants.forEach(p => {
            const dbPath = path.join(dataDir, `${p.id}.db`);
            if (!fs.existsSync(dbPath)) return;
            try {
                const tempDb = new Database(dbPath, { readonly: true });

                // WorkParts — actual usage history
                try {
                    const rows = tempDb.prepare(`
                        SELECT wp.PartID, p.Descript as partDesc,
                               w.AstID as assetId, a.Description as assetDesc,
                               COUNT(*) as timesUsed,
                               SUM(CAST(COALESCE(wp.ActQty, 0) AS REAL)) as totalQty,
                               ROUND(SUM(CAST(COALESCE(wp.ActQty, 0) AS REAL) * CAST(COALESCE(wp.UnitCost, 0) AS REAL)), 2) as totalCost,
                               MAX(wp.UseDate) as lastUsed
                        FROM WorkParts wp
                        JOIN Work w ON wp.WoID = w.ID
                        LEFT JOIN Asset a ON w.AstID = a.ID
                        LEFT JOIN Part p ON wp.PartID = p.ID
                        WHERE wp.PartID = ? AND w.AstID IS NOT NULL
                        GROUP BY w.AstID
                    `).all(partId);
                    rows.forEach(r => usedOn.push({ ...r, plant: p.label, plantId: p.id }));
                } catch (e) {}

                // AssetParts — BOM linkage
                try {
                    const rows = tempDb.prepare(`
                        SELECT ap.AstID as assetId, a.Description as assetDesc,
                               ap.PartID, ap.Quantity, ap.Comment
                        FROM AssetParts ap
                        LEFT JOIN Asset a ON ap.AstID = a.ID
                        WHERE ap.PartID = ?
                    `).all(partId);
                    rows.forEach(r => bomOn.push({ ...r, plant: p.label, plantId: p.id }));
                } catch (e) {}

                tempDb.close();
            } catch (e) {}
        });

        res.json({
            partId,
            usedOn: usedOn.sort((a, b) => b.timesUsed - a.timesUsed),
            bomOn: bomOn.sort((a, b) => (a.assetId || '').localeCompare(b.assetId || '')),
            totalAssets: new Set([...usedOn.map(u => `${u.plantId}::${u.assetId}`), ...bomOn.map(b => `${b.plantId}::${b.assetId}`)]).size,
            totalPlants: new Set([...usedOn.map(u => u.plantId), ...bomOn.map(b => b.plantId)]).size
        });
    } catch (err) {
        console.error('[Where-Used] Error:', err.message);
        res.status(500).json({ error: 'Failed to query where-used data' });
    }
});

// ═══════════════════════════════════════════════════════════════
// Warranty Analytics & Cost Avoidance (Feature 9.4-9.7)
// ═══════════════════════════════════════════════════════════════

// GET /api/analytics/warranty-overview — Enterprise-wide warranty status
router.get('/warranty-overview', (req, res) => {
    try {
        const dataDir = require('../resolve_data_dir');
        const plantsFile = path.join(dataDir, 'plants.json');
        if (!fs.existsSync(plantsFile)) return res.json({ plants: [], totals: {} });
        const requestedPlant = req.headers['x-plant-id'] || 'all_sites';
        const isEnterprise = !requestedPlant || requestedPlant === 'all_sites' || requestedPlant === 'Corporate_Office';
        let plants = JSON.parse(fs.readFileSync(plantsFile, 'utf8'));
        
        if (!isEnterprise) {
            plants = plants.filter(p => p.id === requestedPlant || p.id.toLowerCase() === requestedPlant.toLowerCase());
        }
        
        const today = new Date().toISOString().split('T')[0];
        const now = new Date();
        const horizon = parseInt(req.query.days) || 90;
        const futureDate = new Date(Date.now() + horizon * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const results = [];
        let totalActive = 0, totalExpiringSoon = 0, totalExpired = 0, totalNoWarranty = 0;
        const allExpiring = [];

        plants.forEach(p => {
            const dbPath = path.join(dataDir, `${p.id}.db`);
            if (!fs.existsSync(dbPath)) return;
            try {
                const tempDb = new Database(dbPath, { readonly: true });
                const cols = tempDb.prepare(`PRAGMA table_info(Asset)`).all();
                if (!cols.some(c => c.name === 'WarrantyEnd')) { tempDb.close(); return; }

                const all = tempDb.prepare(`
                    SELECT ID, Description, AssetType, WarrantyStart, WarrantyEnd, WarrantyVendor,
                           COALESCE(NULLIF(InstallCost,''), NULLIF(ReplacementCost,''), 0) as AssetCost
                    FROM Asset
                    WHERE (IsDeleted IS NULL OR IsDeleted = 0)
                `).all();

                let pActive = 0, pExpiring = 0, pExpired = 0, pNone = 0;

                all.forEach(a => {
                    if (!a.WarrantyEnd || a.WarrantyEnd === '') { pNone++; return; }
                    const endDate = new Date(a.WarrantyEnd);
                    const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

                    if (daysLeft < 0) {
                        pExpired++;
                        // Feature 6.3 (Warranty Intelligence): Push negative days as Expired
                        allExpiring.push({
                            ...a, daysLeft: 'Expired', plantId: p.id, plantLabel: p.label,
                            assetCost: parseFloat(a.AssetCost || 0),
                            _sortDays: daysLeft
                        });
                    } else if (daysLeft <= horizon) {
                        pExpiring++;
                        allExpiring.push({
                            ...a, daysLeft, plantId: p.id, plantLabel: p.label,
                            assetCost: parseFloat(a.AssetCost || 0),
                            _sortDays: daysLeft
                        });
                    } else {
                        pActive++;
                    }
                });

                totalActive += pActive; totalExpiringSoon += pExpiring;
                totalExpired += pExpired; totalNoWarranty += pNone;

                results.push({
                    plantId: p.id, plantLabel: p.label,
                    active: pActive, expiringSoon: pExpiring, expired: pExpired, noWarranty: pNone,
                    total: all.length
                });
                tempDb.close();
            } catch (e) { /* skip */ }
        });

        // Sort expiring-soon by urgency
        allExpiring.sort((a, b) => a._sortDays - b._sortDays);

        res.json({
            plants: results,
            expiringSoon: allExpiring.slice(0, 25),
            totals: {
                active: totalActive, expiringSoon: totalExpiringSoon,
                expired: totalExpired, noWarranty: totalNoWarranty,
                totalAssets: totalActive + totalExpiringSoon + totalExpired + totalNoWarranty,
                horizon
            }
        });
    } catch (err) {
        console.error('[Warranty Overview] Error:', err.message);
        res.status(500).json({ error: 'Failed to generate warranty overview' });
    }
});

// GET /api/analytics/warranty-cost-avoidance — Cost avoidance report
// Calculates: WOs completed on assets while under warranty → those repair costs were "avoided"
router.get('/warranty-cost-avoidance', (req, res) => {
    try {
        const dataDir = require('../resolve_data_dir');
        const plantsFile = path.join(dataDir, 'plants.json');
        if (!fs.existsSync(plantsFile)) return res.json({ plants: [], totals: {} });
        const requestedPlant = req.headers['x-plant-id'] || 'all_sites';
        const isEnterprise = !requestedPlant || requestedPlant === 'all_sites' || requestedPlant === 'Corporate_Office';
        let plants = JSON.parse(fs.readFileSync(plantsFile, 'utf8'));
        
        if (!isEnterprise) {
            plants = plants.filter(p => p.id === requestedPlant || p.id.toLowerCase() === requestedPlant.toLowerCase());
        }

        const results = [];
        let totalWOs = 0, totalLaborSaved = 0, totalPartsSaved = 0;
        const details = [];

        plants.forEach(p => {
            const dbPath = path.join(dataDir, `${p.id}.db`);
            if (!fs.existsSync(dbPath)) return;
            try {
                const tempDb = new Database(dbPath, { readonly: true });
                const cols = tempDb.prepare(`PRAGMA table_info(Asset)`).all();
                if (!cols.some(c => c.name === 'WarrantyEnd')) { tempDb.close(); return; }

                // Find WOs completed on assets that had active warranty at the time of WO completion
                const warrantyWOs = tempDb.prepare(`
                    SELECT w.ID as woId, w.WorkOrderNumber, w.Description as woDesc,
                           w.AstID, a.Description as assetDesc, w.CompDate,
                           a.WarrantyStart, a.WarrantyEnd, a.WarrantyVendor,
                           COALESCE(w.ActualHours, 0) * 45.0 as laborCost,
                           0 as materialCost
                    FROM Work w
                    JOIN Asset a ON w.AstID = a.ID
                    WHERE w.CompDate IS NOT NULL
                      AND a.WarrantyEnd IS NOT NULL AND a.WarrantyEnd != ''
                      AND w.CompDate <= a.WarrantyEnd
                      AND (a.WarrantyStart IS NULL OR a.WarrantyStart = '' OR w.CompDate >= a.WarrantyStart)
                    ORDER BY w.CompDate DESC
                    LIMIT 100
                `).all();

                let pLaborSaved = 0, pPartsSaved = 0;

                warrantyWOs.forEach(wo => {
                    const labor = parseFloat(wo.laborCost) || 0;
                    const parts = parseFloat(wo.materialCost) || 0;

                    // Also check WorkParts for detailed parts cost
                    let wpCost = 0;
                    try {
                        const wp = tempDb.prepare(`
                            SELECT SUM(CAST(COALESCE(ActQty, 0) AS REAL) * CAST(COALESCE(UnitCost, 0) AS REAL)) as total
                            FROM WorkParts WHERE WoID = ?
                        `).get(wo.woId);
                        wpCost = parseFloat(wp?.total) || 0;
                    } catch (e) {}

                    const totalPartsCost = Math.max(parts, wpCost);
                    pLaborSaved += labor;
                    pPartsSaved += totalPartsCost;

                    if (labor > 0 || totalPartsCost > 0) {
                        details.push({
                            plantId: p.id, plantLabel: p.label,
                            workOrderNumber: wo.WorkOrderNumber,
                            woDescription: wo.woDesc,
                            assetId: wo.AstID,
                            assetDescription: wo.assetDesc,
                            completedDate: wo.CompDate,
                            warrantyEnd: wo.WarrantyEnd,
                            vendor: wo.WarrantyVendor,
                            laborSaved: Math.round(labor * 100) / 100,
                            partsSaved: Math.round(totalPartsCost * 100) / 100,
                            totalSaved: Math.round((labor + totalPartsCost) * 100) / 100
                        });
                    }
                });

                totalWOs += warrantyWOs.length;
                totalLaborSaved += pLaborSaved;
                totalPartsSaved += pPartsSaved;

                if (warrantyWOs.length > 0) {
                    results.push({
                        plantId: p.id, plantLabel: p.label,
                        warrantyWOs: warrantyWOs.length,
                        laborSaved: Math.round(pLaborSaved * 100) / 100,
                        partsSaved: Math.round(pPartsSaved * 100) / 100,
                        totalSaved: Math.round((pLaborSaved + pPartsSaved) * 100) / 100
                    });
                }

                tempDb.close();
            } catch (e) { /* skip */ }
        });

        // Sort details by savings descending
        details.sort((a, b) => b.totalSaved - a.totalSaved);

        res.json({
            plants: results,
            details: details.slice(0, 50),
            totals: {
                totalWarrantyWOs: totalWOs,
                laborSaved: Math.round(totalLaborSaved * 100) / 100,
                partsSaved: Math.round(totalPartsSaved * 100) / 100,
                totalSaved: Math.round((totalLaborSaved + totalPartsSaved) * 100) / 100
            }
        });
    } catch (err) {
        console.error('[Warranty Cost Avoidance] Error:', err.message);
        res.status(500).json({ error: 'Failed to generate cost avoidance report' });
    }
});

module.exports = router;
