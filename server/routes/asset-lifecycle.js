// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS - Asset Lifecycle & Capital Replacement Planning
 * ========================================================
 * REST API for calculating asset replacement recommendations based on
 * cumulative repair costs vs. replacement costs and expected useful life.
 */

const express = require('express');
const router = express.Router();
const db = require('../database');

// GET /api/asset-lifecycle/recommendations
router.get('/recommendations', (req, res) => {
    try {
        const plantDb = db.getDb();

        const query = `
            SELECT 
                a.ID as assetId,
                a.Description as description,
                a.AssetType as assetType,
                CAST(COALESCE(a.ReplacementCostUSD, a.ReplacementCost, a.InstallCost, 0) AS REAL) as replacementCost,
                a.InstallDate as installDate,
                a.PurchaseDate as purchaseDate,
                a.UsefulLife as usefulLifeYears,
                CAST(COALESCE(a.TdLbCst, 0) AS REAL) + 
                CAST(COALESCE(a.TdMisCst, 0) AS REAL) + 
                CAST(COALESCE(a.TdPrtCst, 0) AS REAL) as trackedCost
            FROM Asset a
            WHERE a.Active = 1 AND (a.IsDeleted IS NULL OR a.IsDeleted = 0)
        `;
        
        const assets = plantDb.prepare(query).all();
        
        // Fallback dynamic calculation for assets with 0 trackedCost but WO history
        const dynamicCosts = plantDb.prepare(`
            SELECT 
                w.AstID as assetId,
                SUM(CAST(COALESCE(wp.ActQty, 0) AS REAL) * CAST(COALESCE(wp.UnitCost, 0) AS REAL)) as partsCost,
                SUM(CAST(COALESCE(wl.HrReg, 0) AS REAL) * CAST(COALESCE(wl.PayReg, 0) AS REAL) + CAST(COALESCE(wl.HrOver, 0) AS REAL) * CAST(COALESCE(wl.PayOver, 0) AS REAL)) as laborCost,
                SUM(CAST(COALESCE(wm.ActCost, 0) AS REAL)) as miscCost
            FROM Work w
            LEFT JOIN WorkParts wp ON w.ID = wp.WoID
            LEFT JOIN WorkLabor wl ON w.ID = wl.WoID
            LEFT JOIN WorkMisc wm ON w.ID = wm.WoID
            WHERE w.AstID IS NOT NULL AND w.AstID != ''
            GROUP BY w.AstID
        `).all();

        const costMap = {};
        dynamicCosts.forEach(row => {
            costMap[row.assetId] = (row.partsCost || 0) + (row.laborCost || 0) + (row.miscCost || 0);
        });

        const recommendations = [];
        const now = new Date();

        assets.forEach(a => {
            const replCost = a.replacementCost || 0;
            if (replCost === 0) return; // Skip if no replacement cost is defined

            let repairCost = a.trackedCost || costMap[a.assetId] || 0;
            
            // Calculate age
            const baseDateStr = a.installDate || a.purchaseDate;
            let ageInYears = 0;
            if (baseDateStr) {
                const baseDate = new Date(baseDateStr);
                if (!isNaN(baseDate.getTime())) {
                    ageInYears = (now - baseDate) / (1000 * 60 * 60 * 24 * 365.25);
                }
            }

            const eul = a.usefulLifeYears || 10;
            
            // Payback period logic:
            // Annual repair cost = total repair cost / age
            const annualRepairCost = ageInYears > 0 ? (repairCost / ageInYears) : repairCost;
            // Annualized replacement cost = Replacement Cost / EUL
            const annualizedReplCost = replCost / eul;
            
            const paybackYears = annualRepairCost > 0 ? (replCost / annualRepairCost) : 999;
            const repairToReplaceRatio = repairCost / replCost;

            // Recommendation Logic:
            // If repair cost is > 60% of replacement cost, or age > EUL and repair > 40%
            let status = 'HEALTHY';
            if (repairToReplaceRatio >= 0.75) {
                status = 'REPLACE_IMMEDIATELY';
            } else if (repairToReplaceRatio >= 0.50 || (ageInYears >= eul && repairToReplaceRatio >= 0.30)) {
                status = 'PLAN_REPLACEMENT';
            } else if (repairToReplaceRatio >= 0.30) {
                status = 'MONITOR';
            }

            if (status !== 'HEALTHY' || repairToReplaceRatio > 0.1) {
                recommendations.push({
                    assetId: a.assetId,
                    description: a.description,
                    assetType: a.assetType,
                    replacementCost: replCost,
                    cumulativeRepairCost: repairCost,
                    repairToReplaceRatio: Math.round(repairToReplaceRatio * 100),
                    ageInYears: Math.round(ageInYears * 10) / 10,
                    expectedUsefulLife: eul,
                    annualRepairCost: Math.round(annualRepairCost),
                    annualizedReplacementCost: Math.round(annualizedReplCost),
                    paybackYears: paybackYears > 100 ? '>100' : Math.round(paybackYears * 10) / 10,
                    status
                });
            }
        });

        // Sort by risk (ratio)
        recommendations.sort((a, b) => b.repairToReplaceRatio - a.repairToReplaceRatio);

        res.json({
            recommendations,
            summary: {
                totalEvaluated: assets.length,
                totalRecommendations: recommendations.length,
                criticalReplacements: recommendations.filter(r => r.status === 'REPLACE_IMMEDIATELY').length,
                totalLiability: recommendations.reduce((sum, r) => sum + r.replacementCost, 0)
            }
        });

    } catch (err) {
        console.error('GET /api/asset-lifecycle/recommendations error:', err);
        res.status(500).json({ error: 'Failed to fetch asset lifecycle recommendations' });
    }
});

// GET /api/asset-lifecycle/forecast
router.get('/forecast', (req, res) => {
    try {
        const plantDb = db.getDb();

        const assets = plantDb.prepare(`
            SELECT 
                a.ID as assetId,
                a.AssetType as assetType,
                CAST(COALESCE(a.ReplacementCostUSD, a.ReplacementCost, a.InstallCost, 0) AS REAL) as replacementCost,
                a.InstallDate as installDate,
                a.PurchaseDate as purchaseDate,
                a.UsefulLife as usefulLifeYears
            FROM Asset a
            WHERE a.Active = 1 AND (a.IsDeleted IS NULL OR a.IsDeleted = 0)
        `).all();

        const forecast = {
            year1: { count: 0, cost: 0, assets: [] },
            year3: { count: 0, cost: 0, assets: [] },
            year5: { count: 0, cost: 0, assets: [] },
            beyond: { count: 0, cost: 0, assets: [] }
        };

        const now = new Date();

        assets.forEach(a => {
            const replCost = a.replacementCost || 0;
            if (replCost === 0) return;

            const baseDateStr = a.installDate || a.purchaseDate;
            let ageInYears = 0;
            if (baseDateStr) {
                const baseDate = new Date(baseDateStr);
                if (!isNaN(baseDate.getTime())) {
                    ageInYears = (now - baseDate) / (1000 * 60 * 60 * 24 * 365.25);
                }
            }

            const eul = a.usefulLifeYears || 10;
            const yearsRemaining = eul - ageInYears;

            const entry = {
                assetId: a.assetId,
                type: a.assetType,
                cost: replCost,
                yearsRemaining: Math.round(yearsRemaining * 10) / 10
            };

            if (yearsRemaining <= 1) {
                forecast.year1.count++;
                forecast.year1.cost += replCost;
                if (forecast.year1.assets.length < 10) forecast.year1.assets.push(entry);
            } else if (yearsRemaining <= 3) {
                forecast.year3.count++;
                forecast.year3.cost += replCost;
                if (forecast.year3.assets.length < 10) forecast.year3.assets.push(entry);
            } else if (yearsRemaining <= 5) {
                forecast.year5.count++;
                forecast.year5.cost += replCost;
                if (forecast.year5.assets.length < 10) forecast.year5.assets.push(entry);
            } else {
                forecast.beyond.count++;
                forecast.beyond.cost += replCost;
            }
        });

        res.json({ forecast });
    } catch (err) {
        console.error('GET /api/asset-lifecycle/forecast error:', err);
        res.status(500).json({ error: 'Failed to fetch asset lifecycle forecast' });
    }
});

// GET /api/asset-lifecycle/corporate-rollup
router.get('/corporate-rollup', (req, res) => {
    try {
        if (req.headers['x-plant-id'] !== 'all_sites') {
            return res.status(403).json({ error: 'Corporate rollup requires all_sites context' });
        }

        const path = require('path');
        const fs = require('fs');
        const Database = require('better-sqlite3');
        const dataDir = require('../resolve_data_dir');
        const plantsFile = path.join(dataDir, 'plants.json');
        const plants = JSON.parse(fs.readFileSync(plantsFile, 'utf8'));

        const rollupByPlant = {};
        const rollupByClass = {};
        let totalLiability = 0;

        plants.forEach(p => {
            const dbPath = path.join(dataDir, `${p.id}.db`);
            if (!fs.existsSync(dbPath)) return;
            try {
                const tempDb = new Database(dbPath, { readonly: true });
                const hasTbl = tempDb.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='Asset'`).get();
                if (hasTbl) {
                    const rows = tempDb.prepare(`
                        SELECT 
                            AssetType as assetType,
                            CAST(COALESCE(ReplacementCostUSD, ReplacementCost, InstallCost, 0) AS REAL) as replacementCost,
                            InstallDate as installDate,
                            PurchaseDate as purchaseDate,
                            UsefulLife as usefulLifeYears
                        FROM Asset
                        WHERE Active = 1 AND (IsDeleted IS NULL OR IsDeleted = 0)
                    `).all();

                    const now = new Date();
                    rows.forEach(a => {
                        const replCost = a.replacementCost || 0;
                        if (replCost === 0) return;

                        const baseDateStr = a.installDate || a.purchaseDate;
                        let ageInYears = 0;
                        if (baseDateStr) {
                            const baseDate = new Date(baseDateStr);
                            if (!isNaN(baseDate.getTime())) ageInYears = (now - baseDate) / (1000 * 60 * 60 * 24 * 365.25);
                        }

                        const eul = a.usefulLifeYears || 10;
                        const yearsRemaining = eul - ageInYears;

                        // Only count assets that are due within 5 years for "immediate liability"
                        if (yearsRemaining <= 5) {
                            totalLiability += replCost;

                            if (!rollupByPlant[p.label]) rollupByPlant[p.label] = 0;
                            rollupByPlant[p.label] += replCost;

                            const aType = a.assetType || 'UNCLASSIFIED';
                            if (!rollupByClass[aType]) rollupByClass[aType] = 0;
                            rollupByClass[aType] += replCost;
                        }
                    });
                }
                tempDb.close();
            } catch (e) { console.warn(`[AssetLifecycle] Skipping ${p.id}: ${e.message}`); }
        });

        res.json({
            total5YearLiability: totalLiability,
            byPlant: Object.keys(rollupByPlant).map(k => ({ plant: k, liability: rollupByPlant[k] })).sort((a,b) => b.liability - a.liability),
            byClass: Object.keys(rollupByClass).map(k => ({ assetClass: k, liability: rollupByClass[k] })).sort((a,b) => b.liability - a.liability)
        });

    } catch (err) {
        console.error('GET /api/asset-lifecycle/corporate-rollup error:', err);
        res.status(500).json({ error: 'Failed to fetch corporate rollup' });
    }
});

module.exports = function(database) {
    return router;
};
