// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Cross-Link Navigation API
 * =======================================
 * Read-only relationship graph between Work Orders, Assets, and Parts.
 * Powers the click-through navigation chains in the UI so users can
 * pivot from any entity to its related records without searching.
 * Mounted at /api/crosslinks in server/index.js.
 *
 * ENDPOINTS:
 *   GET  /work-order/:id   All links from a Work Order
 *                          Returns: { asset, partsUsed[], relatedWOs[] }
 *                          relatedWOs = other WOs on the same asset within ±90 days
 *   GET  /asset/:id        All links from an Asset
 *                          Returns: { recentWOs[], partsConsumed[], openWOs[], pmSchedules[] }
 *   GET  /part/:id         All links from a Part
 *                          Returns: { assetsUsingPart[], recentWOsUsingPart[], transferHistory[] }
 *
 * NAVIGATION CHAINS:
 *   WO → Asset → Parts consumed → other WOs that used those parts
 *   Part → Assets that use it → WO history on those assets
 *   Asset → All WO history → All parts consumed across those WOs
 *
 * READ-ONLY: This API makes no writes. All data is joined on the fly from
 *   Work, Asset, Part, WorkParts, and Schedule tables.
 *   Consumers: WorkOrderDetail.jsx, AssetView.jsx, StoreroomView.jsx cross-link panels.
 */
const express = require('express');
const router = express.Router();
const db = require('../database');

// ── GET /api/crosslinks/work-order/:id — Links from a Work Order ─────
// Returns: linked asset, parts used, related WOs on same asset
router.get('/work-order/:id', (req, res) => {
    try {
        const plantDb = db.getDb();
        const woId = req.params.id;

        // Get the work order
        let wo = null;
        try {
            wo = plantDb.prepare('SELECT ID, WorkOrderNumber, Description, AstID, StatusID, Priority, AddDate, CompDate, AssignToID, TypeID, ProcID FROM Work WHERE ID = ? OR WorkOrderNumber = ?').get(woId, woId);
        } catch(e) {}
        if (!wo) return res.status(404).json({ error: 'Work order not found' });

        const links = {};

        // 1. Linked Asset
        if (wo.AstID) {
            try {
                const asset = plantDb.prepare('SELECT ID, Description, AssetType, LocationID, Manufacturer, ModelNumber, SerialNumber FROM Asset WHERE ID = ?').get(wo.AstID);
                if (asset) links.asset = asset;
            } catch(e) {}
        }

        // 2. Parts Used on this WO (from WorkParts)
        try {
            links.partsUsed = plantDb.prepare(`
                SELECT wp.PartID, p.Description as partDesc, p.Descript as partShortDesc,
                       wp.ActQty as qty, wp.UnitCost, p.Stock, p.Location as partLocation,
                       p.Manufacturer as partMfg
                FROM WorkParts wp
                LEFT JOIN Part p ON wp.PartID = p.ID
                WHERE wp.WoID = ?
                ORDER BY wp.PartID
            `).all(wo.ID);
        } catch(e) { links.partsUsed = []; }

        // 3. Other WOs on same asset (sibling WOs)
        if (wo.AstID) {
            try {
                links.relatedWOs = plantDb.prepare(`
                    SELECT ID, WorkOrderNumber, Description, StatusID, Priority, AddDate, CompDate
                    FROM Work
                    WHERE AstID = ? AND ID != ?
                    ORDER BY AddDate DESC
                    LIMIT 20
                `).all(wo.AstID, wo.ID);
            } catch(e) { links.relatedWOs = []; }
        }

        // 4. Linked SOP/Procedure
        if (wo.ProcID) {
            try {
                links.procedure = plantDb.prepare('SELECT ID, Description FROM Procedure WHERE ID = ?').get(wo.ProcID);
            } catch(e) {}
        }

        res.json({ workOrder: wo, links });
    } catch (err) {
        console.error('[CrossLinks] WO error:', err.message);
        res.status(500).json({ error: 'Failed to fetch cross-links' });
    }
});

// ── GET /api/crosslinks/asset/:id — Links from an Asset ──────────────
// Returns: WO history, parts on BOM, PM schedules, related assets at same location
router.get('/asset/:id', (req, res) => {
    try {
        const plantDb = db.getDb();
        const assetId = req.params.id;

        const asset = plantDb.prepare('SELECT * FROM Asset WHERE ID = ?').get(assetId);
        if (!asset) return res.status(404).json({ error: 'Asset not found' });

        const links = {};

        // 1. Work Order History
        try {
            links.workOrders = plantDb.prepare(`
                SELECT ID, WorkOrderNumber, Description, StatusID, Priority, AddDate, CompDate, AssignToID, TypeID
                FROM Work WHERE AstID = ?
                ORDER BY AddDate DESC LIMIT 30
            `).all(assetId);
        } catch(e) { links.workOrders = []; }

        // 2. BOM / Parts
        try {
            links.parts = plantDb.prepare(`
                SELECT ap.PartID, ap.Quantity, p.Description as partDesc, p.Descript as partShortDesc,
                       p.UnitCost, p.Stock, p.Reorder, p.Manufacturer, p.Location as partLocation
                FROM AssetParts ap
                LEFT JOIN Part p ON ap.PartID = p.ID
                WHERE ap.AstID = ?
                ORDER BY ap.PartID
            `).all(assetId);
        } catch(e) { links.parts = []; }

        // 3. PM Schedules
        try {
            links.pmSchedules = plantDb.prepare(`
                SELECT ID, Description, Frequency, LastDone, NextDue, Active
                FROM Schedule WHERE AstID = ?
            `).all(assetId);
        } catch(e) { links.pmSchedules = []; }

        // 4. Parts consumed (from WOs)
        try {
            links.partsConsumed = plantDb.prepare(`
                SELECT wp.PartID, p.Description as partDesc,
                       SUM(COALESCE(wp.ActQty, 0)) as totalQty,
                       COUNT(DISTINCT wp.WoID) as woCount,
                       MAX(wp.UseDate) as lastUsed
                FROM WorkParts wp
                JOIN Work w ON wp.WoID = w.ID
                LEFT JOIN Part p ON wp.PartID = p.ID
                WHERE w.AstID = ?
                GROUP BY wp.PartID
                ORDER BY totalQty DESC
                LIMIT 30
            `).all(assetId);
        } catch(e) { links.partsConsumed = []; }

        // 5. Nearby assets (same location)
        if (asset.LocationID) {
            try {
                links.nearbyAssets = plantDb.prepare(`
                    SELECT ID, Description, AssetType, Manufacturer
                    FROM Asset
                    WHERE LocationID = ? AND ID != ?
                    ORDER BY Description
                    LIMIT 20
                `).all(asset.LocationID, assetId);
            } catch(e) { links.nearbyAssets = []; }
        }

        res.json({ asset, links });
    } catch (err) {
        console.error('[CrossLinks] Asset error:', err.message);
        res.status(500).json({ error: 'Failed to fetch cross-links' });
    }
});

// ── GET /api/crosslinks/part/:id — Links from a Part ─────────────────
// Returns: assets using it, WOs that consumed it, where-used across network
router.get('/part/:id', (req, res) => {
    try {
        const plantDb = db.getDb();
        const partId = req.params.id;

        let part = null;
        try {
            part = plantDb.prepare('SELECT * FROM Part WHERE ID = ?').get(partId);
        } catch(e) {}
        if (!part) return res.status(404).json({ error: 'Part not found' });

        const links = {};

        // 1. Assets using this part (BOM)
        try {
            links.assets = plantDb.prepare(`
                SELECT ap.AstID, a.Description as assetDesc, a.AssetType, a.LocationID, a.Manufacturer,
                       ap.Quantity as bomQty
                FROM AssetParts ap
                LEFT JOIN Asset a ON ap.AstID = a.ID
                WHERE ap.PartID = ?
                ORDER BY a.Description
            `).all(partId);
        } catch(e) { links.assets = []; }

        // 2. WOs that consumed this part
        try {
            links.workOrders = plantDb.prepare(`
                SELECT w.ID, w.WorkOrderNumber, w.Description as woDesc, w.AstID, w.StatusID,
                       w.AddDate, w.CompDate,
                       a.Description as assetDesc,
                       wp.ActQty as qty, wp.UnitCost, wp.UseDate
                FROM WorkParts wp
                JOIN Work w ON wp.WoID = w.ID
                LEFT JOIN Asset a ON w.AstID = a.ID
                WHERE wp.PartID = ?
                ORDER BY wp.UseDate DESC
                LIMIT 30
            `).all(partId);
        } catch(e) { links.workOrders = []; }

        // 3. Consumption summary
        try {
            const consumption = plantDb.prepare(`
                SELECT
                    SUM(COALESCE(wp.ActQty, 0)) as totalConsumed,
                    COUNT(DISTINCT wp.WoID) as woCount,
                    COUNT(DISTINCT w.AstID) as assetCount,
                    MIN(wp.UseDate) as firstUsed,
                    MAX(wp.UseDate) as lastUsed
                FROM WorkParts wp
                JOIN Work w ON wp.WoID = w.ID
                WHERE wp.PartID = ?
            `).get(partId);
            links.consumption = consumption;
        } catch(e) { links.consumption = {}; }

        // 4. Alternative/substitute parts (same category/manufacturer)
        if (part.Category || part.Manufacturer) {
            try {
                let altSql = `SELECT ID, Description, Descript, UnitCost, Stock, Manufacturer FROM Part WHERE ID != ?`;
                const altParams = [partId];
                if (part.Category) {
                    altSql += ` AND Category = ?`;
                    altParams.push(part.Category);
                }
                altSql += ` LIMIT 10`;
                links.alternatives = plantDb.prepare(altSql).all(...altParams);
            } catch(e) { links.alternatives = []; }
        }

        res.json({ part, links });
    } catch (err) {
        console.error('[CrossLinks] Part error:', err.message);
        res.status(500).json({ error: 'Failed to fetch cross-links' });
    }
});

module.exports = router;
