// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Corporate Index Crawl Engine
 * ==================================================
 * Aggregates data from ALL plant databases into the corporate_master.db and
 * trier_logistics.db for cross-site search, dashboards, and analytics.
 *
 * Runs on a 15-minute interval (set in index.js) and on server startup.
 *
 * Data Flow:
 *   PlantStats      -> Aggregate WO/Asset/Part/Schedule counts per plant
 *   MasterAssetIndex -> All assets with predictive health scores & MTBF
 *   MasterPartIndex  -> All parts for global search
 *   GlobalAssets     -> Asset metrics for Enterprise Intelligence
 *   GlobalParts      -> Part pricing for cross-site procurement comparison
 *
 * PREDICTIVE ANALYTICS:
 *   Health Score = 100 - (recentRepairs_6mo * 15), minimum 0
 *   MTBF = average days between corrective/emergency repairs
 *   Risk levels: Low (normal), Medium (degraded), High (MTBF < 14 days)
 */
const fs = require('fs');
const path = require('path');
const db = require('./database');
const masterDb = require('./master_index');
const { db: logisticsDb } = require('./logistics_db');
const { getPlants } = require('./plant_cache');

async function crawlAllPlants() {
    console.log('🏗️  Starting Corporate Index Crawl...');
    const start = Date.now();

    const plants = getPlants();
    if (!plants.length) return;
    
    // Clear old indices to ensure freshness (or we can upsert)
    // For stats we always overwrite. For assets/parts we might want to be more surgical, 
    // but for 1.0.24, full refresh is faster than complex diffing.
    masterDb.prepare('DELETE FROM MasterAssetIndex').run();
    masterDb.prepare('DELETE FROM MasterPartIndex').run();

    const _crawlDataDir = require('./resolve_data_dir');

    for (const p of plants) {
        const dbPath = path.join(_crawlDataDir, `${p.id}.db`);
        if (!fs.existsSync(dbPath)) continue;

        try {
            const plantDb = db.getDb(p.id);

            // 1. Calculate Stats
            const woCount = plantDb.prepare('SELECT COUNT(*) as count FROM Work').get().count;
            const assetCount = plantDb.prepare('SELECT COUNT(*) as count FROM Asset').get().count;
            const partCount = plantDb.prepare('SELECT COUNT(*) as count FROM Part').get().count;
            const scheduleCount = plantDb.prepare('SELECT COUNT(*) as count FROM Schedule').get().count;
            
            const urgentWOs = plantDb.prepare("SELECT COUNT(*) as count FROM Work WHERE Priority = 'Urgent'").get().count;
            
            // Calculate MTD Cost (Sum of part costs in work orders closed this month)
            const firstOfCurrentMonth = new Date();
            firstOfCurrentMonth.setDate(1);
            firstOfCurrentMonth.setHours(0,0,0,0);
            const currentMonthStr = firstOfCurrentMonth.toISOString();

            const costMTDResult = plantDb.prepare(`
                SELECT SUM(wp.ActQty * p.UnitCost) as total
                FROM WorkParts wp
                JOIN Part p ON wp.PartID = p.ID
                JOIN Work w ON wp.WoID = w.ID
                WHERE w.StatusID = 'CLOSED' AND w.AddDate >= ?
            `).get(currentMonthStr);
            const costMTD = costMTDResult?.total || 0;

            masterDb.prepare(`
                INSERT OR REPLACE INTO PlantStats (plantId, plantLabel, totalWOs, totalAssets, totalParts, totalSchedules, totalCostMTD, urgentWOs, lastUpdated)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `).run(p.id, p.label, woCount, assetCount, partCount, scheduleCount, costMTD, urgentWOs);

            // 2. Index Assets for Global Search & Predictive Analytics
            const assetCols = plantDb.prepare("PRAGMA table_info(Asset)").all().map(c => c.name);
            const hasOpStatus = assetCols.includes('OperationalStatus');
            const assetQuery = hasOpStatus
                ? 'SELECT Id, Description, Model, Serial, OperationalStatus FROM Asset'
                : "SELECT Id, Description, Model, Serial, 'In Production' as OperationalStatus FROM Asset";
            const assets = plantDb.prepare(assetQuery).all();
            const insertAsset = masterDb.prepare(`
                INSERT INTO MasterAssetIndex (assetId, plantId, assetName, model, serial, status, healthScore, mtbfDays, lastRepairDate, riskLevel, predictiveAlert, mtbfTrend, predictedFailureDate, repairCount) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            // PERF: Cache column names ONCE per plant (not per asset)
            const workColumns = plantDb.prepare("PRAGMA table_info(Work)").all().map(c => c.name);
            const typeCol = workColumns.includes('WorkTypeID') ? 'WorkTypeID' : (workColumns.includes('TypeID') ? 'TypeID' : null);

            const transactionAsset = masterDb.transaction((rows) => {
                for (const row of rows) {
                    // --- PREDICTIVE ANALYTICS ENGINE (v2) ---
                    let healthScore = 100;
                    let mtbfDays = 0;
                    let lastRepairDate = null;
                    let riskLevel = 'Low';
                    let alert = null;
                    let mtbfTrend = 'stable';
                    let predictedFailureDate = null;
                    let repairCount = 0;

                    if (typeCol) {
                        const repairs = plantDb.prepare(`
                            SELECT AddDate FROM Work 
                            WHERE AstID = ? AND ${typeCol} IN (
                                SELECT ID FROM WorkType WHERE Description LIKE '%Corrective%' OR Description LIKE '%Emergency%' OR Description LIKE '%Repair%'
                            )
                            ORDER BY AddDate ASC
                        `).all(row.Id);

                        repairCount = repairs.length;

                        if (repairs.length >= 2) {
                            let totalDiff = 0;
                            for (let i = 1; i < repairs.length; i++) {
                                const d1 = new Date(repairs[i-1].AddDate);
                                const d2 = new Date(repairs[i].AddDate);
                                totalDiff += (d2 - d1) / (1000 * 60 * 60 * 24);
                            }
                            mtbfDays = Math.round(totalDiff / (repairs.length - 1));

                            // --- TREND ANALYSIS (v2) ---
                            // Compare recent 3-month MTBF to overall MTBF
                            const threeMonthsAgo = new Date();
                            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
                            const recentRepairs = repairs.filter(r => new Date(r.AddDate) > threeMonthsAgo);
                            
                            if (recentRepairs.length >= 2) {
                                let recentDiff = 0;
                                for (let i = 1; i < recentRepairs.length; i++) {
                                    const d1 = new Date(recentRepairs[i-1].AddDate);
                                    const d2 = new Date(recentRepairs[i].AddDate);
                                    recentDiff += (d2 - d1) / (1000 * 60 * 60 * 24);
                                }
                                const recentMtbf = Math.round(recentDiff / (recentRepairs.length - 1));
                                
                                if (recentMtbf < mtbfDays * 0.7) {
                                    mtbfTrend = 'worsening';  // Recent failures are 30%+ more frequent
                                } else if (recentMtbf > mtbfDays * 1.3) {
                                    mtbfTrend = 'improving';  // Recent failures are 30%+ less frequent
                                }
                            }
                        }

                        if (repairs.length > 0) {
                            lastRepairDate = repairs[repairs.length - 1].AddDate;
                            
                            // Health Score Decay: -15 per repair in last 6 months
                            const sixMonthsAgo = new Date();
                            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
                            const recentCount = repairs.filter(r => new Date(r.AddDate) > sixMonthsAgo).length;
                            healthScore = Math.max(0, 100 - (recentCount * 15));

                            // --- FAILURE PREDICTION (v2) ---
                            // Predict next failure: lastRepair + MTBF days
                            if (mtbfDays > 0 && lastRepairDate) {
                                const lastRepair = new Date(lastRepairDate);
                                const predicted = new Date(lastRepair.getTime() + (mtbfDays * 24 * 60 * 60 * 1000));
                                predictedFailureDate = predicted.toISOString().split('T')[0];
                                
                                const daysUntil = Math.round((predicted - new Date()) / (1000 * 60 * 60 * 24));
                                
                                // Risk Escalation with failure countdown
                                if (mtbfDays < 14) {
                                    riskLevel = 'High';
                                    alert = `CRITICAL: Chronic failure pattern. MTBF is only ${mtbfDays} days. ${daysUntil <= 0 ? 'OVERDUE for failure.' : `Predicted failure in ${daysUntil} days.`}`;
                                } else if (daysUntil <= 7) {
                                    riskLevel = 'High';
                                    alert = `CRITICAL: Failure predicted within ${daysUntil <= 0 ? '0' : daysUntil} days based on ${mtbfDays}-day MTBF cycle.`;
                                } else if (daysUntil <= 30) {
                                    riskLevel = 'Medium';
                                    alert = `WARNING: Failure predicted in ${daysUntil} days. Health score: ${healthScore}/100.`;
                                } else if (healthScore < 60) {
                                    riskLevel = 'Medium';
                                    alert = `WARNING: Health degradation detected. ${recentCount} unplanned repairs in 6 months.`;
                                } else if (repairs.length > 10) {
                                    riskLevel = 'Medium';
                                    alert = `NOTE: High maintenance volume (${repairs.length} total repairs). Next predicted failure in ${daysUntil} days.`;
                                }
                            } else {
                                // No MTBF data but has repair history
                                if (healthScore < 60) {
                                    riskLevel = 'Medium';
                                    alert = 'WARNING: Significant health degradation. Maintenance frequency exceeding norms.';
                                } else if (repairs.length > 10) {
                                    riskLevel = 'Medium';
                                    alert = `NOTE: Aging asset with ${repairs.length} total repairs.`;
                                }
                            }
                        }
                    }

                    insertAsset.run(
                        row.Id, p.id, row.Description, row.Model, row.Serial, row.OperationalStatus,
                        healthScore, mtbfDays, lastRepairDate, riskLevel, alert,
                        mtbfTrend, predictedFailureDate, repairCount
                    );
                }
            });
            transactionAsset(assets);

            // 3. Index Parts for Global Search
            const parts = plantDb.prepare('SELECT ID, Description, Stock, Location, UnitCost FROM Part').all();
            const insertPart = masterDb.prepare('INSERT INTO MasterPartIndex (partId, plantId, partNumber, description, quantity, location) VALUES (?, ?, ?, ?, ?, ?)');
            
            const transactionPart = masterDb.transaction((rows) => {
                for (const row of rows) insertPart.run(row.ID, p.id, row.ID, row.Description, row.Stock, row.Location);
            });
            transactionPart(parts);

            // 4. Update Enterprise Logistics Tables (GlobalAssets, GlobalParts)
            // This populates the "Enterprise Intelligence" view cards
            const assetMetrics = plantDb.prepare(`
                SELECT 
                    a.ID, a.Description, a.Model, 
                    COALESCE(NULLIF(a.InstallDate,''), NULLIF(a.LifeDate,'')) as InstallDate,
                    SUM(COALESCE(w.ActDown, 0)) as Downtime,
                    COUNT(CASE WHEN w.StatusID = 'CLOSED' THEN 1 END) as Failures
                FROM Asset a
                LEFT JOIN Work w ON a.ID = w.AstID
                GROUP BY a.ID
            `).all();

            for (const am of assetMetrics) {
                const laborHoursResult = plantDb.prepare(`
                    SELECT SUM(HrReg + HrOver + HrDouble) as hours 
                    FROM WorkLabor 
                    WHERE WoID IN (SELECT ID FROM Work WHERE AstID = ?)
                `).get(am.ID);
                const laborHours = laborHoursResult?.hours || 0;

                logisticsDb.prepare(`
                    INSERT INTO GlobalAssets (ID, Description, Model, InstallDate, CumulativeDowntime, TotalLaborHours, FailureCount, LastSyncFromPlant, UpdatedAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(ID, LastSyncFromPlant) DO UPDATE SET
                        Description = excluded.Description,
                        Model = excluded.Model,
                        InstallDate = excluded.InstallDate,
                        CumulativeDowntime = excluded.CumulativeDowntime,
                        TotalLaborHours = excluded.TotalLaborHours,
                        FailureCount = excluded.FailureCount,
                        UpdatedAt = CURRENT_TIMESTAMP
                `).run(am.ID, am.Description, am.Model, am.InstallDate, am.Downtime, laborHours, am.Failures, p.id);
            }

            for (const part of parts) {
                const price = parseFloat(part.UnitCost) || 0;
                if (price > 0) {
                    logisticsDb.prepare(`
                        INSERT INTO GlobalParts (ID, Description, AvgUnitCost, CheapestPrice, CheapestPlant, LastSyncFromPlant, UpdatedAt)
                        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                        ON CONFLICT(ID) DO UPDATE SET
                            AvgUnitCost = (AvgUnitCost + excluded.AvgUnitCost) / 2,
                            CheapestPrice = CASE WHEN excluded.CheapestPrice < CheapestPrice OR CheapestPrice = 0 THEN excluded.CheapestPrice ELSE CheapestPrice END,
                            CheapestPlant = CASE WHEN excluded.CheapestPrice < CheapestPrice OR CheapestPrice = 0 THEN excluded.LastSyncFromPlant ELSE CheapestPlant END,
                            LastSyncFromPlant = excluded.LastSyncFromPlant,
                            UpdatedAt = CURRENT_TIMESTAMP
                    `).run(part.ID, part.Description, price, price, p.id, p.id);
                }
            }

            console.log(`✅ Indexed ${p.label}`);
        } catch (err) {
            console.error(`❌ Failed to index ${p.label}:`, err.message);
        }
    }

    const end = Date.now();
    console.log(`🚀 Corporate Index Sync Complete in ${end - start}ms`);
}

module.exports = { crawlAllPlants };
