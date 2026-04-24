// Copyright © 2026 Trier OS. All Rights Reserved.
/**
 * Vendor Scorecard Route
 * Calculates enterprise-wide or plant-specific performance metrics for vendors.
 * Queries cross-plant schemas to determine On-Time Delivery, Lead Times,
 * Spend Volume, and Quality Defects.
 * 
 * Routes:
 *   GET /api/vendors/scorecard - Retrieve worst performers and all scorecards
 */
'use strict';

const express = require('express');
const router = express.Router();
const { getDb } = require('../database');
const logisticsDb = require('../logistics_db').db;
const fs = require('fs');
const path = require('path');
const dataDir = require('../resolve_data_dir');

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
                const Database = require('better-sqlite3');
                const db = new Database(path.join(dataDir, f), { readonly: true });
                dbs.push({ plantId, db });
            } catch (e) {}
        }
    } catch (e) {}
    return dbs;
}

function parseCost(costStr) {
    if (!costStr) return 0;
    if (typeof costStr === 'number') return costStr;
    return parseFloat(costStr.replace(/[^0-9.-]+/g, '')) || 0;
}

function dateDiffDays(d1, d2) {
    if (!d1 || !d2) return 0;
    const diff = new Date(d1) - new Date(d2);
    return diff / (1000 * 60 * 60 * 24);
}

// GET /api/vendors/scorecard
router.get('/', (req, res) => {
    try {
        const targetPlant = req.query.plantId || req.headers['x-plant-id'];
        const isCorporate = !targetPlant || targetPlant === 'all_sites';
        const targetVendor = req.query.vendorId;
        
        const SAFE_PLANT_ID = /^[a-zA-Z0-9_-]{1,64}$/;
        if (targetPlant && targetPlant !== 'all_sites' && !SAFE_PLANT_ID.test(targetPlant)) {
            return res.status(400).json({ error: 'Invalid plant ID' });
        }

        let plants = [];
        if (isCorporate) {
            plants = getAllPlantDbs();
        } else {
            try {
                plants = [{ plantId: targetPlant, db: getDb(targetPlant) }];
            } catch(e) {
                console.warn(`[VendorScorecard] Failed to get db for plant ${targetPlant}:`, e.message);
                return res.status(400).json({ error: 'Invalid plant' });
            }
        }

        const stats = {}; 

        for (const { plantId, db } of plants) {
            try {
                let vendorQuery = 'SELECT ID, Description FROM Vendors WHERE Active = 1 OR Active IS NULL';
                let vendorParams = [];
                if (targetVendor) {
                    vendorQuery += ' AND ID = ?';
                    vendorParams.push(targetVendor);
                }
                const vendors = db.prepare(vendorQuery).all(...vendorParams);
                
                for (const v of vendors) {
                    const vKey = v.ID;
                    if (!stats[vKey]) {
                        stats[vKey] = {
                            vendorId: v.ID,
                            vendorName: v.Description,
                            spend: 0,
                            totalLines: 0,
                            onTimeLines: 0,
                            promisedLeadDaysSum: 0,
                            actualLeadDaysSum: 0,
                            ncrCount: 0,
                            plants: new Set()
                        };
                    }
                    stats[vKey].plants.add(plantId);

                    const poLines = db.prepare(`
                        SELECT pp.OrdDate, pp.DueDate, pp.RecDate, pp.RecQty, pp.RecCost
                        FROM POPart pp
                        JOIN PO p ON pp.PoID = p.ID
                        WHERE p.VendorID = ? AND pp.RecDate IS NOT NULL
                    `).all(v.ID);

                    for (const line of poLines) {
                        const recQty = parseFloat(line.RecQty) || 0;
                        const recCost = parseCost(line.RecCost);
                        stats[vKey].spend += (recQty * recCost);

                        if (line.DueDate && line.RecDate) {
                            stats[vKey].totalLines++;
                            
                            if (new Date(line.RecDate) <= new Date(line.DueDate)) {
                                stats[vKey].onTimeLines++;
                            }

                            if (line.OrdDate) {
                                const promised = dateDiffDays(line.DueDate, line.OrdDate);
                                const actual = dateDiffDays(line.RecDate, line.OrdDate);
                                stats[vKey].promisedLeadDaysSum += (promised > 0 ? promised : 0);
                                stats[vKey].actualLeadDaysSum += (actual > 0 ? actual : 0);
                            }
                        }
                    }

                    // Supply Chain POs (if applicable in this plant)
                    try {
                        const supplyLines = db.prepare(`
                            SELECT po.OrderDate as OrdDate, po.ExpectedDate as DueDate, po.ReceivedDate as RecDate,
                                   l.QtyRcvd, l.UnitCost
                            FROM SupplyPOLine l
                            JOIN SupplyPO po ON po.ID = l.POID
                            JOIN SupplyVendor sv ON sv.ID = po.VendorID
                            WHERE sv.VendorName = ? AND po.ReceivedDate IS NOT NULL
                        `).all(v.Description);

                        for (const line of supplyLines) {
                            const recQty = parseFloat(line.QtyRcvd) || 0;
                            const recCost = parseFloat(line.UnitCost) || 0;
                            stats[vKey].spend += (recQty * recCost);

                            if (line.DueDate && line.RecDate) {
                                stats[vKey].totalLines++;
                                
                                if (new Date(line.RecDate) <= new Date(line.DueDate)) {
                                    stats[vKey].onTimeLines++;
                                }

                                if (line.OrdDate) {
                                    const promised = dateDiffDays(line.DueDate, line.OrdDate);
                                    const actual = dateDiffDays(line.RecDate, line.OrdDate);
                                    stats[vKey].promisedLeadDaysSum += (promised > 0 ? promised : 0);
                                    stats[vKey].actualLeadDaysSum += (actual > 0 ? actual : 0);
                                }
                            }
                        }
                    } catch (e) {
                        // Supply chain tables might not exist in all plants, silently skip
                    }

                    const suppliedParts = db.prepare('SELECT PartID FROM PartVendors WHERE VendorID = ?').all(v.ID).map(r => r.PartID);
                    let allSuppliedIds = [...suppliedParts];
                    try {
                        const supplyItems = db.prepare('SELECT ItemCode FROM SupplyItem WHERE VendorID IN (SELECT ID FROM SupplyVendor WHERE VendorName = ?)').all(v.Description).map(r => r.ItemCode);
                        allSuppliedIds.push(...supplyItems);
                    } catch(e) {
                        // SupplyItem table might not exist
                    }

                    if (allSuppliedIds.length > 0) {
                        const placeholders = allSuppliedIds.map(() => '?').join(',');
                        const ncrCount = logisticsDb.prepare(`
                            SELECT COUNT(*) as c FROM QualityNCR 
                            WHERE PlantID = ? AND BatchLot IN (${placeholders})
                        `).get(plantId, ...allSuppliedIds).c;
                        
                        stats[vKey].ncrCount += ncrCount;
                    }
                }
            } catch (e) {
                console.warn(`[VendorScorecard] Error processing plant ${plantId}:`, e.message);
            } finally {
                if (isCorporate && db) {
                    try { db.close(); } catch(e){ console.warn(`[VendorScorecard] Error closing db:`, e.message); }
                }
            }
        }

        const results = Object.values(stats).map(s => {
            return {
                vendorId: s.vendorId,
                vendorName: s.vendorName,
                plants: Array.from(s.plants),
                spend: Math.round(s.spend * 100) / 100,
                onTimeDeliveryRate: s.totalLines > 0 ? Math.round((s.onTimeLines / s.totalLines) * 100) : null,
                avgPromisedLeadTime: s.totalLines > 0 ? Math.round(s.promisedLeadDaysSum / s.totalLines) : null,
                avgActualLeadTime: s.totalLines > 0 ? Math.round(s.actualLeadDaysSum / s.totalLines) : null,
                qualityDefectCount: s.ncrCount
            };
        });

        const worstPerformersBySpend = [...results]
            .filter(r => r.spend > 0)
            .sort((a, b) => b.spend - a.spend)
            .sort((a, b) => (a.onTimeDeliveryRate || 100) - (b.onTimeDeliveryRate || 100))
            .slice(0, 10);

        if (targetVendor) {
            return res.json(results[0] || null);
        }

        res.json({
            scorecards: results,
            worstPerformers: worstPerformersBySpend
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
