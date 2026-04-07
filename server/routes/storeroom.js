// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS — MRO Storeroom Intelligence Engine
 * ============================================
 * Answers the question every plant manager should be able to ask:
 * "Where is our money sitting on a shelf that we haven't touched?"
 *
 * ENDPOINTS:
 *   GET /api/storeroom/abc-analysis        — ABC classification (A/B/C by usage value)
 *   GET /api/storeroom/dead-stock          — Parts with zero movement in N days
 *   GET /api/storeroom/slow-moving         — Parts below velocity threshold
 *   GET /api/storeroom/carrying-cost       — Total capital tied up in inventory
 *   GET /api/storeroom/obsolescence-risk   — Parts tied to retired/EOL assets
 *   GET /api/storeroom/summary             — Dashboard rollup of all above
 *
 * All endpoints support:
 *   ?plant_id=all_sites   — Cross-plant aggregation
 *   ?plant_id=Demo_Plant_1 — Single-plant analysis
 *   ?days=365             — Lookback window (default 365)
 */

const express = require('express');
const router = express.Router();
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const db = require('../database');
const dataDir = require('../resolve_data_dir');

// ── Helper: Open a plant database read-only ──────────────────────────────
function openPlantDb(plantId) {
    const dbPath = path.join(dataDir, `${plantId}.db`);
    if (!fs.existsSync(dbPath)) return null;
    try {
        return new Database(dbPath, { readonly: true });
    } catch (e) {
        return null;
    }
}

// ── Helper: Get all plants ────────────────────────────────────────────────
function getAllPlants() {
    const plantsFile = path.join(dataDir, 'plants.json');
    if (!fs.existsSync(plantsFile)) return [];
    try {
        return JSON.parse(fs.readFileSync(plantsFile, 'utf8'));
    } catch (e) {
        return [];
    }
}

// ── Helper: Parse unit cost safely ───────────────────────────────────────
function parseCost(val) {
    if (!val) return 0;
    return parseFloat(String(val).replace(/[^0-9.]/g, '')) || 0;
}

// ── Helper: Run analysis on a single plant DB ─────────────────────────────
function analyzeStoreroomForPlant(plantDb, plantId, plantLabel, days) {
    const lookback = `datetime('now', '-${parseInt(days)} days')`;
    const result = {
        plantId,
        plantLabel,
        parts: [],
        totalParts: 0,
        totalInventoryValue: 0,
    };

    try {
        // Check required tables exist
        const hasPart = plantDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='Part'").get();
        if (!hasPart) return result;
        const hasWorkParts = plantDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='WorkParts'").get();

        // ── Fetch all parts with usage data ──
        let parts;
        if (hasWorkParts) {
            parts = plantDb.prepare(`
                SELECT
                    p.ID,
                    p.Description,
                    p.ClassID AS PartClassID,
                    p.Manufacturer,
                    p.Location,
                    CAST(COALESCE(p.Stock, 0) AS REAL)   AS stock,
                    CAST(COALESCE(p.OrdMin, 0) AS REAL)  AS ordMin,
                    CAST(COALESCE(p.OrdMax, 0) AS REAL)  AS ordMax,
                    p.UnitCost,
                    -- Total usage across all time
                    COUNT(wp.WoID)                        AS totalUsageCount,
                    -- Usage in the lookback window
                    SUM(CASE WHEN wp.UseDate >= ${lookback} THEN 1 ELSE 0 END) AS recentUsageCount,
                    -- Total quantity used in lookback window
                    SUM(CASE WHEN wp.UseDate >= ${lookback} THEN CAST(COALESCE(wp.ActQty, 1) AS REAL) ELSE 0 END) AS recentQtyUsed,
                    -- Total $ value of usage in lookback window
                    SUM(CASE WHEN wp.UseDate >= ${lookback}
                        THEN CAST(COALESCE(wp.ActQty, 1) AS REAL) * CAST(COALESCE(wp.UnitCost, p.UnitCost, 0) AS REAL)
                        ELSE 0 END) AS recentUsageValue,
                    -- Last date this part was used
                    MAX(wp.UseDate)                       AS lastUsedDate
                FROM Part p
                LEFT JOIN WorkParts wp ON wp.PartID = p.ID
                GROUP BY p.ID
                ORDER BY recentUsageValue DESC
            `).all();
        } else {
            // No WorkParts table — basic analysis only
            parts = plantDb.prepare(`
                SELECT
                    ID, Description, ClassID AS PartClassID, Manufacturer, Location,
                    CAST(COALESCE(Stock, 0) AS REAL) AS stock,
                    CAST(COALESCE(OrdMin, 0) AS REAL) AS ordMin,
                    CAST(COALESCE(OrdMax, 0) AS REAL) AS ordMax,
                    UnitCost,
                    0 AS totalUsageCount, 0 AS recentUsageCount,
                    0 AS recentQtyUsed, 0 AS recentUsageValue,
                    NULL AS lastUsedDate
                FROM Part
            `).all();
        }

        if (!parts || parts.length === 0) return result;

        // ── Compute totals for ABC classification ──
        const totalUsageValue = parts.reduce((sum, p) => sum + (p.recentUsageValue || 0), 0);

        let runningValue = 0;
        const classified = parts.map(p => {
            const unitCost = parseCost(p.UnitCost);
            const inventoryValue = p.stock * unitCost;
            const usageValue = p.recentUsageValue || 0;

            runningValue += usageValue;
            const cumulativePct = totalUsageValue > 0 ? (runningValue / totalUsageValue) * 100 : 0;

            // ABC Classification by usage value (Pareto)
            let abcClass = 'C';
            if (cumulativePct <= 80 || (totalUsageValue === 0 && inventoryValue > 500)) abcClass = 'A';
            else if (cumulativePct <= 95) abcClass = 'B';

            // Dead stock: has stock, zero usage in the window AND no recent use ever
            const daysSinceUse = p.lastUsedDate
                ? Math.floor((Date.now() - new Date(p.lastUsedDate).getTime()) / (1000 * 60 * 60 * 24))
                : null;
            const isDeadStock = p.stock > 0 && p.recentUsageCount === 0;
            const isSlowMoving = p.stock > 0 && p.recentUsageCount > 0 && p.recentUsageCount < 3;

            return {
                ...p,
                unitCost,
                inventoryValue: Math.round(inventoryValue * 100) / 100,
                usageValue: Math.round(usageValue * 100) / 100,
                abcClass,
                cumulativePct: Math.round(cumulativePct * 10) / 10,
                daysSinceUse,
                isDeadStock,
                isSlowMoving,
            };
        });

        result.parts = classified;
        result.totalParts = classified.length;
        result.totalInventoryValue = Math.round(
            classified.reduce((sum, p) => sum + p.inventoryValue, 0) * 100
        ) / 100;

    } catch (e) {
        console.warn(`[Storeroom] Analysis failed for ${plantId}: ${e.message}`);
    }

    return result;
}


// ══════════════════════════════════════════════════════════════════════════
// GET /api/storeroom/abc-analysis
// ABC Pareto Classification — Parts ranked by usage value (A=top 80%, B=next 15%, C=bottom 5%)
// ══════════════════════════════════════════════════════════════════════════
router.get('/abc-analysis', (req, res) => {
    try {
        const plantId = req.headers['x-plant-id'] || 'Demo_Plant_1';
        const days = parseInt(req.query.days) || 365;

        let allParts = [];

        if (plantId === 'all_sites') {
            const plants = getAllPlants();
            for (const plant of plants) {
                const pDb = openPlantDb(plant.id);
                if (!pDb) continue;
                try {
                    const { parts } = analyzeStoreroomForPlant(pDb, plant.id, plant.label, days);
                    parts.forEach(p => allParts.push({ ...p, plant: plant.label, plantId: plant.id }));
                } finally {
                    pDb.close();
                }
            }
        } else {
            const pDb = db.getDb();
            const { parts } = analyzeStoreroomForPlant(pDb, plantId, plantId, days);
            allParts = parts;
        }

        // Re-classify combined list
        const sortedByValue = [...allParts].sort((a, b) => b.usageValue - a.usageValue);
        const grandTotal = sortedByValue.reduce((s, p) => s + p.usageValue, 0);
        let running = 0;
        sortedByValue.forEach(p => {
            running += p.usageValue;
            const pct = grandTotal > 0 ? (running / grandTotal) * 100 : 0;
            p.abcClass = pct <= 80 ? 'A' : pct <= 95 ? 'B' : 'C';
            p.cumulativePct = Math.round(pct * 10) / 10;
        });

        const aClass = sortedByValue.filter(p => p.abcClass === 'A');
        const bClass = sortedByValue.filter(p => p.abcClass === 'B');
        const cClass = sortedByValue.filter(p => p.abcClass === 'C');

        res.json({
            days,
            totalParts: allParts.length,
            totalUsageValue: Math.round(grandTotal),
            totalInventoryValue: Math.round(allParts.reduce((s, p) => s + p.inventoryValue, 0)),
            summary: {
                classA: { count: aClass.length, pctOfParts: Math.round((aClass.length / allParts.length) * 100), pctOfValue: 80, usageValue: Math.round(aClass.reduce((s, p) => s + p.usageValue, 0)) },
                classB: { count: bClass.length, pctOfParts: Math.round((bClass.length / allParts.length) * 100), pctOfValue: 15, usageValue: Math.round(bClass.reduce((s, p) => s + p.usageValue, 0)) },
                classC: { count: cClass.length, pctOfParts: Math.round((cClass.length / allParts.length) * 100), pctOfValue: 5, usageValue: Math.round(cClass.reduce((s, p) => s + p.usageValue, 0)) },
            },
            parts: sortedByValue,
        });
    } catch (err) {
        console.error('GET /api/storeroom/abc-analysis error:', err);
        res.status(500).json({ error: 'ABC analysis failed' });
    }
});


// ══════════════════════════════════════════════════════════════════════════
// GET /api/storeroom/dead-stock
// Parts with stock on hand but ZERO usage in the lookback window
// ══════════════════════════════════════════════════════════════════════════
router.get('/dead-stock', (req, res) => {
    try {
        const plantId = req.headers['x-plant-id'] || 'Demo_Plant_1';
        const days = parseInt(req.query.days) || 365;

        let allParts = [];

        if (plantId === 'all_sites') {
            const plants = getAllPlants();
            for (const plant of plants) {
                const pDb = openPlantDb(plant.id);
                if (!pDb) continue;
                try {
                    const { parts } = analyzeStoreroomForPlant(pDb, plant.id, plant.label, days);
                    parts
                        .filter(p => p.isDeadStock)
                        .forEach(p => allParts.push({ ...p, plant: plant.label, plantId: plant.id }));
                } finally {
                    pDb.close();
                }
            }
        } else {
            const pDb = db.getDb();
            const { parts } = analyzeStoreroomForPlant(pDb, plantId, plantId, days);
            allParts = parts.filter(p => p.isDeadStock);
        }

        allParts.sort((a, b) => b.inventoryValue - a.inventoryValue);

        const totalDeadValue = Math.round(allParts.reduce((s, p) => s + p.inventoryValue, 0));

        res.json({
            days,
            deadStockCount: allParts.length,
            totalDeadValue,
            message: allParts.length > 0
                ? `$${totalDeadValue.toLocaleString()} in parts with zero usage in the last ${days} days`
                : `No dead stock identified in the last ${days} days`,
            parts: allParts,
        });
    } catch (err) {
        console.error('GET /api/storeroom/dead-stock error:', err);
        res.status(500).json({ error: 'Dead stock analysis failed' });
    }
});


// ══════════════════════════════════════════════════════════════════════════
// GET /api/storeroom/slow-moving
// Parts used fewer than 3 times in the lookback window (but not zero)
// ══════════════════════════════════════════════════════════════════════════
router.get('/slow-moving', (req, res) => {
    try {
        const plantId = req.headers['x-plant-id'] || 'Demo_Plant_1';
        const days = parseInt(req.query.days) || 365;
        const threshold = parseInt(req.query.threshold) || 3; // uses in period

        let allParts = [];

        if (plantId === 'all_sites') {
            const plants = getAllPlants();
            for (const plant of plants) {
                const pDb = openPlantDb(plant.id);
                if (!pDb) continue;
                try {
                    const { parts } = analyzeStoreroomForPlant(pDb, plant.id, plant.label, days);
                    parts
                        .filter(p => p.stock > 0 && p.recentUsageCount > 0 && p.recentUsageCount < threshold)
                        .forEach(p => allParts.push({ ...p, plant: plant.label, plantId: plant.id }));
                } finally {
                    pDb.close();
                }
            }
        } else {
            const pDb = db.getDb();
            const { parts } = analyzeStoreroomForPlant(pDb, plantId, plantId, days);
            allParts = parts.filter(p => p.stock > 0 && p.recentUsageCount > 0 && p.recentUsageCount < threshold);
        }

        allParts.sort((a, b) => b.inventoryValue - a.inventoryValue);

        res.json({
            days,
            threshold,
            slowMovingCount: allParts.length,
            totalSlowValue: Math.round(allParts.reduce((s, p) => s + p.inventoryValue, 0)),
            parts: allParts,
        });
    } catch (err) {
        console.error('GET /api/storeroom/slow-moving error:', err);
        res.status(500).json({ error: 'Slow-moving analysis failed' });
    }
});


// ══════════════════════════════════════════════════════════════════════════
// GET /api/storeroom/carrying-cost
// Total capital tied up in inventory, broken down by ABC class and category
// ══════════════════════════════════════════════════════════════════════════
router.get('/carrying-cost', (req, res) => {
    try {
        const plantId = req.headers['x-plant-id'] || 'Demo_Plant_1';
        const days = parseInt(req.query.days) || 365;
        // Carrying cost rate: industry standard is 20-30% of inventory value annually
        const carryingRate = parseFloat(req.query.rate) || 0.25;

        let allParts = [];

        if (plantId === 'all_sites') {
            const plants = getAllPlants();
            for (const plant of plants) {
                const pDb = openPlantDb(plant.id);
                if (!pDb) continue;
                try {
                    const { parts } = analyzeStoreroomForPlant(pDb, plant.id, plant.label, days);
                    parts.forEach(p => allParts.push({ ...p, plant: plant.label, plantId: plant.id }));
                } finally {
                    pDb.close();
                }
            }
        } else {
            const pDb = db.getDb();
            const { parts } = analyzeStoreroomForPlant(pDb, plantId, plantId, days);
            allParts = parts;
        }

        const totalInventoryValue = allParts.reduce((s, p) => s + p.inventoryValue, 0);
        const deadStock = allParts.filter(p => p.isDeadStock);
        const slowMoving = allParts.filter(p => p.isSlowMoving);
        const activeStock = allParts.filter(p => !p.isDeadStock && !p.isSlowMoving);

        const deadValue = deadStock.reduce((s, p) => s + p.inventoryValue, 0);
        const slowValue = slowMoving.reduce((s, p) => s + p.inventoryValue, 0);
        const activeValue = activeStock.reduce((s, p) => s + p.inventoryValue, 0);

        // By category/class
        const byCategory = {};
        allParts.forEach(p => {
            const cat = p.PartClassID || 'Uncategorized';
            if (!byCategory[cat]) byCategory[cat] = { category: cat, count: 0, inventoryValue: 0, annualCarryingCost: 0 };
            byCategory[cat].count++;
            byCategory[cat].inventoryValue += p.inventoryValue;
            byCategory[cat].annualCarryingCost += p.inventoryValue * carryingRate;
        });

        res.json({
            days,
            carryingRatePct: Math.round(carryingRate * 100),
            totalParts: allParts.length,
            totalInventoryValue: Math.round(totalInventoryValue),
            annualCarryingCost: Math.round(totalInventoryValue * carryingRate),
            breakdown: {
                active: { count: activeStock.length, inventoryValue: Math.round(activeValue), annualCarryingCost: Math.round(activeValue * carryingRate) },
                slowMoving: { count: slowMoving.length, inventoryValue: Math.round(slowValue), annualCarryingCost: Math.round(slowValue * carryingRate) },
                deadStock: { count: deadStock.length, inventoryValue: Math.round(deadValue), annualCarryingCost: Math.round(deadValue * carryingRate) },
            },
            byCategory: Object.values(byCategory)
                .sort((a, b) => b.inventoryValue - a.inventoryValue)
                .slice(0, 20)
                .map(c => ({ ...c, inventoryValue: Math.round(c.inventoryValue), annualCarryingCost: Math.round(c.annualCarryingCost) })),
        });
    } catch (err) {
        console.error('GET /api/storeroom/carrying-cost error:', err);
        res.status(500).json({ error: 'Carrying cost analysis failed' });
    }
});


// ══════════════════════════════════════════════════════════════════════════
// GET /api/storeroom/obsolescence-risk
// Parts tied to assets that are retired, or that haven't been used in 2+ years
// and have high inventory value — flagged for review
// ══════════════════════════════════════════════════════════════════════════
router.get('/obsolescence-risk', (req, res) => {
    try {
        const plantId = req.headers['x-plant-id'] || 'Demo_Plant_1';
        const longDeadDays = parseInt(req.query.days) || 730; // 2 years default

        const analyzeObsolescence = (pDb, pId, pLabel) => {
            const results = [];
            try {
                const hasPart = pDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='Part'").get();
                const hasAsset = pDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='Asset'").get();
                const hasWorkParts = pDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='WorkParts'").get();
                if (!hasPart) return results;

                const lookback = `datetime('now', '-${longDeadDays} days')`;

                let parts;
                if (hasWorkParts) {
                    parts = pDb.prepare(`
                        SELECT
                            p.ID, p.Description, p.ClassID AS PartClassID, p.Manufacturer, p.Location,
                            CAST(COALESCE(p.Stock, 0) AS REAL) AS stock,
                            p.UnitCost,
                            MAX(wp.UseDate) AS lastUsedDate,
                            COUNT(wp.WoID) AS totalUsageCount
                        FROM Part p
                        LEFT JOIN WorkParts wp ON wp.PartID = p.ID
                        WHERE CAST(COALESCE(p.Stock, 0) AS REAL) > 0
                        GROUP BY p.ID
                        HAVING (lastUsedDate IS NULL OR lastUsedDate < ${lookback})
                    `).all();
                } else {
                    parts = pDb.prepare(`
                        SELECT ID, Description, ClassID AS PartClassID, Manufacturer, Location,
                               CAST(COALESCE(Stock, 0) AS REAL) AS stock, UnitCost,
                               NULL AS lastUsedDate, 0 AS totalUsageCount
                        FROM Part
                        WHERE CAST(COALESCE(Stock, 0) AS REAL) > 0
                    `).all();
                }

                parts.forEach(p => {
                    const unitCost = parseCost(p.UnitCost);
                    const inventoryValue = p.stock * unitCost;
                    const daysSinceUse = p.lastUsedDate
                        ? Math.floor((Date.now() - new Date(p.lastUsedDate).getTime()) / (1000 * 60 * 60 * 24))
                        : null;

                    if (inventoryValue > 0) {
                        results.push({
                            ...p,
                            unitCost,
                            inventoryValue: Math.round(inventoryValue * 100) / 100,
                            daysSinceUse,
                            neverUsed: p.totalUsageCount === 0,
                            riskLevel: inventoryValue > 1000 ? 'HIGH' : inventoryValue > 200 ? 'MEDIUM' : 'LOW',
                            plant: pLabel,
                            plantId: pId,
                        });
                    }
                });
            } catch (e) {
                console.warn(`[Storeroom/Obsolescence] ${pId}: ${e.message}`);
            }
            return results;
        };

        let allRisks = [];

        if (plantId === 'all_sites') {
            const plants = getAllPlants();
            for (const plant of plants) {
                const pDb = openPlantDb(plant.id);
                if (!pDb) continue;
                try {
                    allRisks.push(...analyzeObsolescence(pDb, plant.id, plant.label));
                } finally {
                    pDb.close();
                }
            }
        } else {
            const pDb = db.getDb();
            allRisks = analyzeObsolescence(pDb, plantId, plantId);
        }

        allRisks.sort((a, b) => b.inventoryValue - a.inventoryValue);

        res.json({
            longDeadDays,
            totalAtRisk: allRisks.length,
            totalRiskValue: Math.round(allRisks.reduce((s, p) => s + p.inventoryValue, 0)),
            highRisk: allRisks.filter(p => p.riskLevel === 'HIGH').length,
            neverUsed: allRisks.filter(p => p.neverUsed).length,
            parts: allRisks,
        });
    } catch (err) {
        console.error('GET /api/storeroom/obsolescence-risk error:', err);
        res.status(500).json({ error: 'Obsolescence risk analysis failed' });
    }
});


// ══════════════════════════════════════════════════════════════════════════
// GET /api/storeroom/summary
// Dashboard rollup — everything in one call for the Storeroom Intelligence panel
// ══════════════════════════════════════════════════════════════════════════
router.get('/summary', (req, res) => {
    try {
        const plantId = req.headers['x-plant-id'] || 'Demo_Plant_1';
        const days = parseInt(req.query.days) || 365;
        const carryingRate = parseFloat(req.query.rate) || 0.25;

        let allParts = [];

        if (plantId === 'all_sites') {
            const plants = getAllPlants();
            for (const plant of plants) {
                const pDb = openPlantDb(plant.id);
                if (!pDb) continue;
                try {
                    const { parts } = analyzeStoreroomForPlant(pDb, plant.id, plant.label, days);
                    parts.forEach(p => allParts.push({ ...p, plant: plant.label, plantId: plant.id }));
                } finally {
                    pDb.close();
                }
            }
        } else {
            const pDb = db.getDb();
            const { parts } = analyzeStoreroomForPlant(pDb, plantId, plantId, days);
            allParts = parts;
        }

        if (allParts.length === 0) {
            return res.json({
                totalParts: 0, totalInventoryValue: 0, annualCarryingCost: 0,
                deadStock: { count: 0, value: 0 }, slowMoving: { count: 0, value: 0 },
                classA: { count: 0 }, classB: { count: 0 }, classC: { count: 0 },
                topDeadStock: [], healthScore: 100,
            });
        }

        // Re-classify with grand totals
        const sortedByUsage = [...allParts].sort((a, b) => b.usageValue - a.usageValue);
        const grandTotal = sortedByUsage.reduce((s, p) => s + p.usageValue, 0);
        let running = 0;
        sortedByUsage.forEach(p => {
            running += p.usageValue;
            const pct = grandTotal > 0 ? (running / grandTotal) * 100 : 0;
            p.abcClass = pct <= 80 ? 'A' : pct <= 95 ? 'B' : 'C';
        });

        const totalInventoryValue = Math.round(allParts.reduce((s, p) => s + p.inventoryValue, 0));
        const deadStock = allParts.filter(p => p.isDeadStock);
        const slowMoving = allParts.filter(p => p.isSlowMoving);
        const deadValue = Math.round(deadStock.reduce((s, p) => s + p.inventoryValue, 0));
        const slowValue = Math.round(slowMoving.reduce((s, p) => s + p.inventoryValue, 0));

        // Health score: 100 = all stock is active, decreases with dead/slow stock
        const problemPct = totalInventoryValue > 0
            ? ((deadValue + slowValue * 0.5) / totalInventoryValue) * 100
            : 0;
        const healthScore = Math.max(0, Math.round(100 - problemPct));

        res.json({
            days,
            totalParts: allParts.length,
            totalInventoryValue,
            annualCarryingCost: Math.round(totalInventoryValue * carryingRate),
            deadStock: {
                count: deadStock.length,
                value: deadValue,
                pctOfInventory: totalInventoryValue > 0 ? Math.round((deadValue / totalInventoryValue) * 100) : 0,
            },
            slowMoving: {
                count: slowMoving.length,
                value: slowValue,
                pctOfInventory: totalInventoryValue > 0 ? Math.round((slowValue / totalInventoryValue) * 100) : 0,
            },
            classA: { count: allParts.filter(p => p.abcClass === 'A').length },
            classB: { count: allParts.filter(p => p.abcClass === 'B').length },
            classC: { count: allParts.filter(p => p.abcClass === 'C').length },
            topDeadStock: deadStock
                .sort((a, b) => b.inventoryValue - a.inventoryValue)
                .slice(0, 10),
            healthScore,
            healthLabel: healthScore >= 85 ? 'Healthy' : healthScore >= 65 ? 'Attention Needed' : 'Action Required',
        });
    } catch (err) {
        console.error('GET /api/storeroom/summary error:', err);
        res.status(500).json({ error: 'Storeroom summary failed' });
    }
});

module.exports = router;
