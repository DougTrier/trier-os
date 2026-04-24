// Copyright © 2026 Trier OS. All Rights Reserved.
/**
 * Spare Parts Inventory Optimization Route
 * Provides reorder recommendations based on current stock, reorder points,
 * historical lead times, and consumption rates.
 */
'use strict';

const express = require('express');
const router = express.Router();
const { getDb } = require('../database');
const fs = require('fs');
const path = require('path');
const dataDir = require('../resolve_data_dir');

const SAFE_PLANT_ID = /^[a-zA-Z0-9_-]{1,64}$/;

const NON_PLANT_DBS = new Set([
    'schema_template', 'corporate_master', 'Corporate_Office', 'dairy_master',
    'it_master', 'logistics', 'trier_auth', 'trier_chat', 'trier_logistics',
    'examples'
]);

function getAllPlantDbs() {
    const dbs = [];
    try {
        const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.db') && !NON_PLANT_DBS.has(f.replace('.db', '')) && !f.startsWith('trier_') && !f.startsWith('logistics'));
        for (const f of files) {
            try {
                const plantId = f.replace('.db', '');
                const db = getDb(plantId);
                dbs.push({ plantId, db });
            } catch (e) {
                console.warn('[SparePartsOpt] Failed to open DB', f, e.message);
            }
        }
    } catch (e) {
        console.warn('[SparePartsOpt] Failed reading data directory', e.message);
    }
    return dbs;
}

function dateDiffDays(d1, d2) {
    if (!d1 || !d2) return null;
    const diff = new Date(d1) - new Date(d2);
    if (isNaN(diff)) return null;
    return diff / (1000 * 60 * 60 * 24);
}

// GET /api/parts/optimization
router.get('/', (req, res) => {
    try {
        const plantId = req.query.plantId || req.headers['x-plant-id'];
        
        if (!plantId || !SAFE_PLANT_ID.test(plantId)) {
            return res.status(400).json({ error: 'Invalid plant ID' });
        }

        const db = getDb(plantId);

        // Fetch all parts with their stats to do calculation
        const parts = db.prepare(`
            SELECT ID, Descript, Description, Stock, OrdMin, OrdPoint, OrdUsual, OrdMax, YtdIssQty, UOM, CriticalSpare
            FROM Part 
            WHERE Stock IS NOT NULL
        `).all();

        const results = [];

        for (const p of parts) {
            const partId = p.ID;
            const ytdIssQty = parseFloat(p.YtdIssQty) || 0;
            const avgDailyUsage = ytdIssQty / 365;

            // Vendor lead time history
            const poHistory = db.prepare(`
                SELECT OrdDate, RecDate 
                FROM POPart 
                WHERE PartID = ? AND RecDate IS NOT NULL AND OrdDate IS NOT NULL
            `).all(partId);

            let totalDays = 0;
            let validLines = 0;
            
            for (const line of poHistory) {
                const days = dateDiffDays(line.RecDate, line.OrdDate);
                if (days !== null && days >= 0) {
                    totalDays += days;
                    validLines++;
                }
            }

            let avgLeadTime = null;
            if (validLines > 0) {
                avgLeadTime = Math.round(totalDays / validLines);
            } else {
                try {
                    const pv = db.prepare(`SELECT LeadDays FROM PartVendors WHERE PartID = ? AND LeadDays IS NOT NULL LIMIT 1`).get(partId);
                    if (pv && pv.LeadDays) {
                        avgLeadTime = pv.LeadDays;
                    }
                } catch(e) {}
            }

            const safeLeadTime = avgLeadTime || 7; // fallback if unknown for safety stock calculation

            const safetyFactor = 1.5;
            const safetyStock = avgDailyUsage * safeLeadTime * safetyFactor;
            
            // Check stockout risk for CriticalSpares
            const isStockoutRisk = (p.CriticalSpare === 1) && (parseFloat(p.Stock) < safetyStock);
            
            // Reorder threshold logic
            const ordPoint = parseFloat(p.OrdPoint || p.OrdMin) || 0;
            const isBelowReorder = (ordPoint > 0 && parseFloat(p.Stock) <= ordPoint);

            if (isStockoutRisk || isBelowReorder) {
                let suggestedQty = parseFloat(p.OrdUsual);
                if (!suggestedQty || suggestedQty <= 0) {
                    suggestedQty = (parseFloat(p.OrdMax) || 0) - (parseFloat(p.Stock) || 0);
                }
                if (suggestedQty <= 0) {
                    suggestedQty = parseFloat(p.OrdMin) || 1;
                }

                results.push({
                    partId: p.ID,
                    description: p.Descript || p.Description,
                    stock: parseFloat(p.Stock) || 0,
                    reorderPoint: ordPoint,
                    safetyStock: Math.ceil(safetyStock),
                    avgConsumptionRate: parseFloat(avgDailyUsage.toFixed(4)),
                    suggestedOrderQty: Math.ceil(suggestedQty),
                    estimatedLeadTimeDays: avgLeadTime,
                    uom: p.UOM || 'EA',
                    isCritical: p.CriticalSpare === 1,
                    isStockoutRisk
                });
            }
        }

        res.json({
            plantId,
            recommendations: results
        });
        
    } catch (err) {
        console.warn('[SparePartsOpt] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/parts/optimization/dead-stock
router.get('/dead-stock', (req, res) => {
    try {
        const plantId = req.query.plantId || req.headers['x-plant-id'];
        if (!plantId || !SAFE_PLANT_ID.test(plantId)) {
            return res.status(400).json({ error: 'Invalid plant ID' });
        }

        const db = getDb(plantId);
        
        // Parts with no WO consumption in last 12 months
        const parts = db.prepare(`
            SELECT p.ID, p.Descript, p.Description, p.Stock, p.UnitCost
            FROM Part p
            WHERE p.Stock > 0
              AND p.ID NOT IN (
                  SELECT PartID 
                  FROM WorkParts 
                  WHERE UseDate >= date('now', '-12 month')
              )
        `).all();

        const deadStock = parts.map(p => ({
            partId: p.ID,
            description: p.Descript || p.Description,
            stock: parseFloat(p.Stock) || 0,
            unitCost: parseFloat(p.UnitCost) || 0,
            totalValue: (parseFloat(p.Stock) || 0) * (parseFloat(p.UnitCost) || 0)
        }));

        res.json({
            plantId,
            deadStock
        });

    } catch (err) {
        console.warn('[SparePartsOpt] Dead Stock Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/parts/optimization/corporate
router.get('/corporate', (req, res) => {
    try {
        const dbs = getAllPlantDbs();
        const rollup = [];

        for (const { plantId, db } of dbs) {
            let deadStockValue = 0;
            let stockoutRiskCount = 0;

            try {
                // 1. Dead Stock Value
                const deadStockParts = db.prepare(`
                    SELECT p.Stock, p.UnitCost
                    FROM Part p
                    WHERE p.Stock > 0
                    AND p.ID NOT IN (
                        SELECT PartID 
                        FROM WorkParts 
                        WHERE UseDate >= date('now', '-12 month')
                    )
                `).all();

                for (const p of deadStockParts) {
                    deadStockValue += (parseFloat(p.Stock) || 0) * (parseFloat(p.UnitCost) || 0);
                }

                // 2. Stockout Risk Count
                const parts = db.prepare(`
                    SELECT ID, Stock, YtdIssQty, CriticalSpare
                    FROM Part
                    WHERE CriticalSpare = 1 AND Stock IS NOT NULL
                `).all();

                for (const p of parts) {
                    const avgDailyUsage = (parseFloat(p.YtdIssQty) || 0) / 365;
                    
                    let avgLeadTime = 7; // Default 7 days
                    const poHistory = db.prepare(`
                        SELECT OrdDate, RecDate 
                        FROM POPart 
                        WHERE PartID = ? AND RecDate IS NOT NULL AND OrdDate IS NOT NULL
                    `).all(p.ID);

                    let totalDays = 0;
                    let validLines = 0;
                    for (const line of poHistory) {
                        const days = dateDiffDays(line.RecDate, line.OrdDate);
                        if (days !== null && days >= 0) {
                            totalDays += days;
                            validLines++;
                        }
                    }

                    if (validLines > 0) {
                        avgLeadTime = totalDays / validLines;
                    } else {
                        const pv = db.prepare(`SELECT LeadDays FROM PartVendors WHERE PartID = ? AND LeadDays IS NOT NULL LIMIT 1`).get(p.ID);
                        if (pv && pv.LeadDays) {
                            avgLeadTime = pv.LeadDays;
                        }
                    }

                    const safetyStock = avgDailyUsage * avgLeadTime * 1.5;
                    if (parseFloat(p.Stock) < safetyStock) {
                        stockoutRiskCount++;
                    }
                }

                rollup.push({
                    plantId,
                    deadStockValue: parseFloat(deadStockValue.toFixed(2)),
                    stockoutRiskCount
                });
            } catch (err) {
                console.warn(`[SparePartsOpt] Corporate rollup error for ${plantId}:`, err.message);
                rollup.push({
                    plantId,
                    deadStockValue: 0,
                    stockoutRiskCount: 0,
                    error: true
                });
            }
        }

        res.json({ rollup });

    } catch (err) {
        console.warn('[SparePartsOpt] Corporate Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
