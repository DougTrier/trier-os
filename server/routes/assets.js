// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Assets Routes
 * ====================================
 * REST API for the Equipment/Asset Registry. Mounted at /api/assets.
 *
 * ENDPOINTS:
 *   GET    /                    List assets (paginated, filterable, searchable)
 *   GET    /stats               Asset counts, by-type breakdown, total value & depreciation
 *   GET    /downtime-logs       Aggregated downtime per asset from Work.ActDown column
 *   GET    /parts-used          Parts consumption history per asset from WorkParts
 *   GET    /:id/timeline        Digital Twin event timeline (WOs, labor, health score)
 *   GET    /:id/photos          List all photos uploaded for an asset
 *   POST   /:id/photos          Upload a new photo for an asset (multer, 15MB limit)
 *   DELETE /:id/photos/:fname   Delete a specific asset photo
 *   GET    /:id                 Single asset with linked parts, WO history, PM schedules
 *   POST   /                    Create asset (auto-upserts if ID already exists)
 *   PUT    /:id                 Update asset fields (whitelisted via validators.js)
 *   POST   /:id/delete          Soft-delete (sets IsDeleted=1, preserves for metrics)
 *   POST   /:id/restore         Restore soft-deleted asset
 *
 * SOFT DELETE: Assets are never hard-deleted. IsDeleted=1 hides the asset from
 * normal views but preserves it in WO history and cost calculations.
 *
 * DEPRECIATION: /stats calculates current depreciated value per asset using
 * straight-line depreciation: currentValue = cost - (ageInYears * (cost / usefulLife)).
 * PurchaseDate is tried first, then InstallDate. InstallCost first, then ReplacementCost.
 * This value drives the "Total Fleet Value" metric on the Asset Metrics dashboard.
 *
 * GLOBAL SYNC: On POST and PUT, syncGlobalAsset() from logistics_db.js writes
 * a summary of the asset to the enterprise corporate_master.db so that
 * CorporateAnalyticsView can display all assets without re-querying every plant DB.
 *
 * PHOTO UPLOAD: multer stores photos in data/uploads/assets/:safeId/. The asset ID
 * is sanitized to [a-zA-Z0-9_-] for filesystem safety before use as a directory name.
 */


const express = require('express');
const router = express.Router();
const db = require('../database');
const { whitelist } = require('../validators');
const { syncGlobalAsset } = require('../logistics_db');

// ── GET /api/assets ──────────────────────────────────────────────────────
router.get('/', (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            sort = 'ID',
            order = 'ASC',
            search = '',
            type = '',
            location = '',
            showDeleted = 'false'
        } = req.query;

        let where = [];
        let params = [];

        const searchStr = String(search || '').toLowerCase();

        // Handle logical deletion logic
        if (searchStr.includes('deleted')) {
            where.push(`"IsDeleted" = 1`);
        } else if (showDeleted !== 'true') {
            where.push(`("IsDeleted" IS NULL OR "IsDeleted" = 0)`);
        }

        if (searchStr && !searchStr.includes('deleted')) {
            where.push(`("ID" LIKE ? OR "Description" LIKE ? OR "Serial" LIKE ?)`);
            params.push(`%${searchStr}%`, `%${searchStr}%`, `%${searchStr}%`);
        }

        if (type) {
            where.push(`"AssetType" = ?`);
            params.push(type);
        }

        if (location) {
            where.push(`"LocationID" = ?`);
            params.push(location);
        }

        const whereClause = where.length ? where.join(' AND ') : '';
        console.log(`🔍 Assets Query: WHERE [${whereClause}] Params: [${params}]`);

        if (req.headers['x-plant-id'] === 'all_sites') {
            const path = require('path');
            const fs = require('fs');
            const dataDir = require('../resolve_data_dir');
            const plantsFile = path.join(dataDir, 'plants.json');
            const plants = JSON.parse(fs.readFileSync(plantsFile, 'utf8'));

            let allAssets = [];

            plants.forEach(p => {
                const dbPath = path.join(dataDir, `${p.id}.db`);
                if (fs.existsSync(dbPath)) {
                    try {
                        const tempDb = db.getDb(p.id);
                        const hasTbl = tempDb.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='Asset'`).get();
                        if (hasTbl) {
                            let sql = 'SELECT *, ? as plantId, ? as plantLabel FROM Asset';
                            let sqlParams = [p.id, p.label];
                            if (whereClause) {
                                sql += ' WHERE ' + whereClause;
                                sqlParams = [...sqlParams, ...params];
                            }
                            const siteAssets = tempDb.prepare(sql).all(...sqlParams);
                            allAssets.push(...siteAssets);
                        }
                    } catch (e) { console.warn(`[Assets] Skipping plant ${p.id}: ${e.message}`); }
                }
            });

            // Sorting
            allAssets.sort((a, b) => {
                const valA = a[sort] || '';
                const valB = b[sort] || '';
                return order === 'DESC' ? (valB > valA ? 1 : -1) : (valA > valB ? 1 : -1);
            });

            const total = allAssets.length;
            const start = (parseInt(page) - 1) * parseInt(limit);
            const paginated = allAssets.slice(start, start + parseInt(limit));

            return res.json({
                data: paginated,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    totalPages: Math.ceil(total / parseInt(limit))
                }
            });
        }

        const result = db.queryPaginated('Asset', {
            page: parseInt(page),
            limit: parseInt(limit),
            orderBy: sort,
            order,
            where: whereClause,
            params,
        });

        res.json(result);
    } catch (err) {
        console.error('GET /api/assets error:', err);
        res.status(500).json({ error: 'Failed to fetch assets' });
    }
});

// ── GET /api/assets/stats ────────────────────────────────────────────────
router.get('/stats', (req, res) => {
    try {
        const activePlant = req.headers['x-plant-id'] || 'Demo_Plant_1';

        // ── All Sites: Aggregate across every plant DB ──
        if (activePlant === 'all_sites') {
            const path = require('path');
            const fs = require('fs');
            const Database = require('better-sqlite3');
            const dataDir = require('../resolve_data_dir');
            const plantsFile = path.join(dataDir, 'plants.json');
            const plants = JSON.parse(fs.readFileSync(plantsFile, 'utf8'));

            let totalCount = 0, totalCost = 0, totalDepreciatedValue = 0;
            const typeMap = {};
            const locationMap = {};
            const now = new Date();

            plants.forEach(p => {
                const dbPath = path.join(dataDir, `${p.id}.db`);
                if (!fs.existsSync(dbPath)) return;
                try {
                    const tempDb = new Database(dbPath, { readonly: true });
                    const hasTbl = tempDb.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='Asset'`).get();
                    if (hasTbl) {
                        const t = tempDb.prepare('SELECT COUNT(*) as count FROM Asset WHERE "IsDeleted" IS NULL OR "IsDeleted" = 0').get();
                        totalCount += t.count || 0;

                        tempDb.prepare('SELECT AssetType, COUNT(*) as count FROM Asset WHERE AssetType IS NOT NULL AND AssetType != \'\' AND ("IsDeleted" IS NULL OR "IsDeleted" = 0) GROUP BY AssetType').all()
                            .forEach(r => { typeMap[r.AssetType] = (typeMap[r.AssetType] || 0) + r.count; });

                        tempDb.prepare('SELECT LocationID as Location, COUNT(*) as count FROM Asset WHERE LocationID IS NOT NULL AND LocationID != \'\' AND ("IsDeleted" IS NULL OR "IsDeleted" = 0) GROUP BY LocationID').all()
                            .forEach(r => { locationMap[r.Location] = (locationMap[r.Location] || 0) + r.count; });

                        const fin = tempDb.prepare('SELECT SUM(CAST(COALESCE(NULLIF("InstallCost",\'\'), NULLIF("ReplacementCost",\'\'), 0) AS FLOAT) * COALESCE("Quantity", 1)) as totalCost FROM Asset WHERE ("IsDeleted" IS NULL OR "IsDeleted" = 0)').get();
                        totalCost += fin.totalCost || 0;

                        // Depreciation calculation
                        const assets = tempDb.prepare('SELECT COALESCE(NULLIF("PurchaseDate",\'\'), NULLIF("InstallDate",\'\')) as CostDate, COALESCE(NULLIF("InstallCost",\'\'), NULLIF("ReplacementCost",\'\'), 0) as CostVal, "UsefulLife", "Quantity" FROM Asset WHERE ("IsDeleted" IS NULL OR "IsDeleted" = 0)').all();
                        assets.forEach(a => {
                            const cost = parseFloat(a.CostVal || 0);
                            const qty = parseInt(a.Quantity || 1);
                            if (!a.CostDate || cost === 0) return;
                            const purchaseDate = new Date(a.CostDate);
                            if (isNaN(purchaseDate.getTime())) return;
                            const ageInYears = (now - purchaseDate) / (1000 * 60 * 60 * 24 * 365.25);
                            const usefulLife = parseInt(a.UsefulLife || 10);
                            let currentValue = cost;
                            if (ageInYears >= 0) {
                                currentValue = cost - (ageInYears * (cost / usefulLife));
                                if (currentValue < 0) currentValue = 0;
                            }
                            totalDepreciatedValue += (currentValue * qty);
                        });
                    }
                    tempDb.close();
                } catch (e) { console.warn(`[Assets/stats] Skipping ${p.id}: ${e.message}`); }
            });

            const byType = Object.entries(typeMap).map(([AssetType, count]) => ({ AssetType, count })).sort((a, b) => b.count - a.count);
            const byLocation = Object.entries(locationMap).map(([Location, count]) => ({ Location, count })).sort((a, b) => b.count - a.count);

            return res.json({ total: totalCount, byType, byLocation, totalCost, totalDepreciatedValue });
        }

        // ── Single Plant: Auto-resolved via AsyncLocalStorage middleware ──
        const total = db.queryOne('SELECT COUNT(*) as count FROM Asset WHERE "IsDeleted" IS NULL OR "IsDeleted" = 0');
        const byType = db.queryAll(
            'SELECT AssetType, COUNT(*) as count FROM Asset WHERE AssetType IS NOT NULL AND AssetType != \'\' AND ("IsDeleted" IS NULL OR "IsDeleted" = 0) GROUP BY AssetType ORDER BY count DESC'
        );
        const byLocation = db.queryAll(
            'SELECT LocationID as Location, COUNT(*) as count FROM Asset WHERE LocationID IS NOT NULL AND LocationID != \'\' AND ("IsDeleted" IS NULL OR "IsDeleted" = 0) GROUP BY LocationID ORDER BY count DESC'
        );

        // Calculate direct sums for non-deleted assets
        // Use COALESCE to try InstallCost first, then fall back to ReplacementCost
        const finances = db.queryOne(`
            SELECT 
                SUM(CAST(COALESCE(NULLIF("InstallCost",''), NULLIF("ReplacementCost",''), 0) AS FLOAT) * COALESCE("Quantity", 1)) as totalCost,
                COUNT(*) as assetCount
            FROM Asset 
            WHERE ("IsDeleted" IS NULL OR "IsDeleted" = 0)
        `);

        // We'll calculate the total current value (depreciated) by fetching relevant data 
        // and using the same formula logic as frontend to be consistent
        // Use COALESCE to try PurchaseDate first, then InstallDate; InstallCost first, then ReplacementCost
        const assetsForDepreciation = db.queryAll(`
            SELECT 
                COALESCE(NULLIF("PurchaseDate",''), NULLIF("InstallDate",'')) as CostDate, 
                COALESCE(NULLIF("InstallCost",''), NULLIF("ReplacementCost",''), 0) as CostVal, 
                "UsefulLife", "Quantity" 
            FROM Asset 
            WHERE ("IsDeleted" IS NULL OR "IsDeleted" = 0)
        `);

        let totalDepreciatedValue = 0;
        const now = new Date();

        assetsForDepreciation.forEach(a => {
            const cost = parseFloat(a.CostVal || 0);
            const qty = parseInt(a.Quantity || 1);
            if (!a.CostDate || cost === 0) return;

            const purchaseDate = new Date(a.CostDate);
            if (isNaN(purchaseDate.getTime())) return;

            const ageInYears = (now - purchaseDate) / (1000 * 60 * 60 * 24 * 365.25);
            const usefulLife = parseInt(a.UsefulLife || 10);

            let currentValue = cost;
            if (ageInYears >= 0) {
                const yearlyDepreciation = cost / usefulLife;
                currentValue = cost - (ageInYears * yearlyDepreciation);
                if (currentValue < 0) currentValue = 0;
            }

            totalDepreciatedValue += (currentValue * qty);
        });

        res.json({
            total: total.count,
            byType,
            byLocation,
            totalCost: finances.totalCost || 0,
            totalDepreciatedValue
        });
    } catch (err) {
        console.error('GET /api/assets/stats error:', err);
        res.status(500).json({ error: 'Failed to fetch asset stats' });
    }
});

// ── GET /api/assets/downtime-logs ────────────────────────────────────────
// Aggregates downtime data per asset from completed work orders.
// Uses the Work.ActDown (Actual Downtime Hours) column.
router.get('/downtime-logs', (req, res) => {
    try {
        const activePlant = req.headers['x-plant-id'] || 'Demo_Plant_1';

        const downtimeQuery = `
            SELECT 
                w.AstID as assetId,
                a.Description as assetName,
                COUNT(*) as woCount,
                ROUND(SUM(CAST(COALESCE(w.ActDown, 0) AS REAL)), 1) as totalDowntimeHrs,
                ROUND(AVG(CAST(COALESCE(w.ActDown, 0) AS REAL)), 1) as avgDowntimeHrs,
                MAX(CAST(COALESCE(w.ActDown, 0) AS REAL)) as maxDowntimeHrs,
                MAX(w.CompDate) as lastDowntimeDate,
                MIN(w.AddDate) as firstRecordedDate
            FROM Work w
            LEFT JOIN Asset a ON w.AstID = a.ID
            WHERE w.AstID IS NOT NULL AND w.AstID != ''
              AND CAST(COALESCE(w.ActDown, 0) AS REAL) > 0
            GROUP BY w.AstID
            ORDER BY totalDowntimeHrs DESC
        `;

        const detailQuery = `
            SELECT 
                w.ID as woId,
                w.WorkOrderNumber as woNumber,
                w.AstID as assetId,
                a.Description as assetName,
                w.Description as woDescription,
                CAST(COALESCE(w.ActDown, 0) AS REAL) as downtimeHrs,
                w.AddDate as dateOpened,
                w.CompDate as dateCompleted,
                w.StatusID as status,
                w.TypeID as type
            FROM Work w
            LEFT JOIN Asset a ON w.AstID = a.ID
            WHERE w.AstID IS NOT NULL AND w.AstID != ''
              AND CAST(COALESCE(w.ActDown, 0) AS REAL) > 0
            ORDER BY w.CompDate DESC, w.AddDate DESC
            LIMIT 200
        `;

        if (activePlant === 'all_sites') {
            const path = require('path');
            const fs = require('fs');
            const Database = require('better-sqlite3');
            const dataDir = require('../resolve_data_dir');
            const plantsFile = path.join(dataDir, 'plants.json');
            const plants = JSON.parse(fs.readFileSync(plantsFile, 'utf8'));

            const summaryMap = {};
            const allDetails = [];

            plants.forEach(p => {
                const dbPath = path.join(dataDir, `${p.id}.db`);
                if (!fs.existsSync(dbPath)) return;
                try {
                    const tempDb = new Database(dbPath, { readonly: true });
                    const hasWork = tempDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='Work'").get();
                    if (hasWork) {
                        try {
                            const rows = tempDb.prepare(downtimeQuery).all();
                            rows.forEach(r => {
                                const key = `${p.id}::${r.assetId}`;
                                if (!summaryMap[key]) {
                                    summaryMap[key] = { ...r, plantId: p.id, plantLabel: p.label };
                                } else {
                                    summaryMap[key].woCount += r.woCount;
                                    summaryMap[key].totalDowntimeHrs += r.totalDowntimeHrs;
                                }
                            });
                        } catch (e) {}
                        try {
                            const details = tempDb.prepare(detailQuery).all();
                            details.forEach(d => allDetails.push({ ...d, plantId: p.id, plantLabel: p.label }));
                        } catch (e) {}
                    }
                    tempDb.close();
                } catch (e) { console.warn(`[Downtime] Skipping ${p.id}: ${e.message}`); }
            });

            const summary = Object.values(summaryMap).sort((a, b) => b.totalDowntimeHrs - a.totalDowntimeHrs);
            const totalDowntime = summary.reduce((sum, r) => sum + r.totalDowntimeHrs, 0);
            const totalEvents = summary.reduce((sum, r) => sum + r.woCount, 0);

            return res.json({
                summary,
                details: allDetails.slice(0, 200),
                totals: {
                    totalDowntimeHrs: Math.round(totalDowntime * 10) / 10,
                    totalEvents,
                    assetsAffected: summary.length
                }
            });
        }

        // Single plant
        const plantDb = db.getDb();
        let summary = [], details = [];
        try { summary = plantDb.prepare(downtimeQuery).all(); } catch (e) {}
        try { details = plantDb.prepare(detailQuery).all(); } catch (e) {}

        const totalDowntime = summary.reduce((sum, r) => sum + r.totalDowntimeHrs, 0);
        const totalEvents = summary.reduce((sum, r) => sum + r.woCount, 0);

        res.json({
            summary,
            details,
            totals: {
                totalDowntimeHrs: Math.round(totalDowntime * 10) / 10,
                totalEvents,
                assetsAffected: summary.length
            }
        });
    } catch (err) {
        console.error('GET /api/assets/downtime-logs error:', err);
        res.status(500).json({ error: 'Failed to fetch downtime logs' });
    }
});

// ── PUT /api/assets/downtime-logs/:woId ──────────────────────────────────
// Update downtime hours directly for a specific event
router.put('/downtime-logs/:woId', (req, res) => {
    try {
        const woId = req.params.woId;
        const newDowntime = parseFloat(req.body.downtimeHrs);
        if (isNaN(newDowntime) || newDowntime < 0) {
            return res.status(400).json({ error: 'Invalid downtime hours' });
        }
        
        const activePlant = req.headers['x-plant-id'] || 'Demo_Plant_1';
        const dbInstance = require('../database').getDb();

        dbInstance.prepare('UPDATE Work SET ActDown = ? WHERE ID = ? OR WorkOrderNumber = ? OR rowid = ?')
            .run(newDowntime, woId, woId, woId);

        res.json({ success: true, message: 'Downtime updated' });
    } catch (err) {
        console.error('PUT /api/assets/downtime-logs/:woId error:', err);
        res.status(500).json({ error: 'Failed to update downtime' });
    }
});

// ── GET /api/assets/parts-used ───────────────────────────────────────────
// Aggregates parts consumption data per asset from WorkParts.
router.get('/parts-used', (req, res) => {
    try {
        const activePlant = req.headers['x-plant-id'] || 'Demo_Plant_1';

        const summaryQuery = `
            SELECT 
                w.AstID as assetId,
                a.Description as assetName,
                COUNT(DISTINCT wp.PartID) as uniqueParts,
                CAST(SUM(COALESCE(wp.ActQty, 0)) AS INTEGER) as totalQty,
                ROUND(SUM(CAST(COALESCE(wp.ActQty, 0) AS REAL) * CAST(COALESCE(wp.UnitCost, 0) AS REAL)), 2) as totalCost,
                COUNT(DISTINCT wp.WoID) as woCount,
                MAX(wp.UseDate) as lastUsedDate
            FROM WorkParts wp
            JOIN Work w ON wp.WoID = w.ID
            LEFT JOIN Asset a ON w.AstID = a.ID
            WHERE w.AstID IS NOT NULL AND w.AstID != ''
            GROUP BY w.AstID
            ORDER BY totalCost DESC
        `;

        const detailQuery = `
            SELECT 
                wp.PartID as partId,
                p.Description as partName,
                w.AstID as assetId,
                a.Description as assetName,
                w.WorkOrderNumber as woNumber,
                w.Description as woDescription,
                COALESCE(wp.ActQty, 0) as qty,
                COALESCE(wp.UnitCost, 0) as unitCost,
                ROUND(CAST(COALESCE(wp.ActQty, 0) AS REAL) * CAST(COALESCE(wp.UnitCost, 0) AS REAL), 2) as lineCost,
                wp.UseDate as useDate,
                wp.Comment as comment
            FROM WorkParts wp
            JOIN Work w ON wp.WoID = w.ID
            LEFT JOIN Asset a ON w.AstID = a.ID
            LEFT JOIN Part p ON wp.PartID = p.ID
            WHERE w.AstID IS NOT NULL AND w.AstID != ''
            ORDER BY wp.UseDate DESC
            LIMIT 300
        `;

        if (activePlant === 'all_sites') {
            const path = require('path');
            const fs = require('fs');
            const Database = require('better-sqlite3');
            const dataDir = require('../resolve_data_dir');
            const plantsFile = path.join(dataDir, 'plants.json');
            const plants = JSON.parse(fs.readFileSync(plantsFile, 'utf8'));

            const summaryMap = {};
            const allDetails = [];

            plants.forEach(p => {
                const dbPath = path.join(dataDir, `${p.id}.db`);
                if (!fs.existsSync(dbPath)) return;
                try {
                    const tempDb = new Database(dbPath, { readonly: true });
                    const hasWork = tempDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='WorkParts'").get();
                    if (hasWork) {
                        try {
                            const rows = tempDb.prepare(summaryQuery).all();
                            rows.forEach(r => {
                                const key = `${p.id}::${r.assetId}`;
                                if (!summaryMap[key]) {
                                    summaryMap[key] = { ...r, plantId: p.id, plantLabel: p.label };
                                } else {
                                    summaryMap[key].totalQty += r.totalQty;
                                    summaryMap[key].totalCost += r.totalCost;
                                }
                            });
                        } catch (e) {}
                        try {
                            const details = tempDb.prepare(detailQuery).all();
                            details.forEach(d => allDetails.push({ ...d, plantId: p.id, plantLabel: p.label }));
                        } catch (e) {}
                    }
                    tempDb.close();
                } catch (e) { console.warn(`[PartsUsed] Skipping ${p.id}: ${e.message}`); }
            });

            const summary = Object.values(summaryMap).sort((a, b) => b.totalCost - a.totalCost);
            const totalCost = summary.reduce((sum, r) => sum + r.totalCost, 0);
            const totalQty = summary.reduce((sum, r) => sum + r.totalQty, 0);

            return res.json({
                summary,
                details: allDetails.slice(0, 300),
                totals: {
                    totalCost: Math.round(totalCost * 100) / 100,
                    totalQty,
                    assetsAffected: summary.length,
                    uniqueParts: new Set(allDetails.map(d => d.partId)).size
                }
            });
        }

        // Single plant
        const plantDb = db.getDb();
        let summary = [], details = [];
        try { summary = plantDb.prepare(summaryQuery).all(); } catch (e) {}
        try { details = plantDb.prepare(detailQuery).all(); } catch (e) {}

        const totalCost = summary.reduce((sum, r) => sum + r.totalCost, 0);
        const totalQty = summary.reduce((sum, r) => sum + r.totalQty, 0);

        res.json({
            summary,
            details,
            totals: {
                totalCost: Math.round(totalCost * 100) / 100,
                totalQty,
                assetsAffected: summary.length,
                uniqueParts: new Set(details.map(d => d.partId)).size
            }
        });
    } catch (err) {
        console.error('GET /api/assets/parts-used error:', err);
        res.status(500).json({ error: 'Failed to fetch parts used data' });
    }
});

// ── GET /api/assets/:id/timeline ─────────────────────────────────────────
// Digital Twin: Asset Health Timeline
router.get('/:id/timeline', (req, res) => {
    try {
        const assetId = req.params.id;
        const plantDb = db.getDb();
        const events = [];

        // 1. Work Order history for this asset
        try {
            const wos = plantDb.prepare(`
                SELECT WorkOrderNumber, Description, TypeID, StatusID, AddDate, CompDate, Priority, AssignToID
                FROM Work WHERE AstID = ? ORDER BY AddDate DESC LIMIT 100
            `).all(assetId);

            wos.forEach(wo => {
                const desc = (wo.Description || '').toLowerCase();
                const typeId = (wo.TypeID || '').toString().toLowerCase();
                let type = 'wo';
                let typeLabel = 'Work Order';

                if (desc.includes('emergency') || wo.Priority <= 1) {
                    type = 'emergency'; typeLabel = 'Emergency';
                } else if (desc.includes('[pm-auto]') || typeId === 'pm') {
                    type = wo.CompDate ? 'completed' : 'pm'; typeLabel = wo.CompDate ? 'PM Completed' : 'Preventive';
                } else if (desc.includes('corrective') || typeId.includes('repair')) {
                    type = 'corrective'; typeLabel = 'Corrective';
                } else if (wo.CompDate) {
                    type = 'completed'; typeLabel = 'Completed';
                }

                events.push({
                    date: (wo.CompDate || wo.AddDate || '').split('T')[0].split(' ')[0],
                    type,
                    typeLabel,
                    description: wo.Description || 'Work Order',
                    woNumber: wo.WorkOrderNumber,
                    priority: wo.Priority,
                    assignedTo: wo.AssignToID
                });
            });
        } catch (e) { console.warn(`[Timeline] WO history query failed for asset ${assetId}: ${e.message}`); }

        // 2. Labor entries for this asset's WOs
        try {
            const labor = plantDb.prepare(`
                SELECT wl.LaborID, wl.HrReg, wl.HrOver, wl.WorkDate, w.WorkOrderNumber, w.Description
                FROM WorkLabor wl
                JOIN Work w ON w.rowid = wl.WoID
                WHERE w.AstID = ?
                ORDER BY wl.WorkDate DESC LIMIT 50
            `).all(assetId);

            labor.forEach(l => {
                // Check if we already have a WO event for this
                const existingEvent = events.find(e => e.woNumber === l.WorkOrderNumber);
                if (existingEvent) {
                    existingEvent.labor = l.LaborID;
                    existingEvent.hours = (l.HrReg || 0) + (l.HrOver || 0);
                }
            });
        } catch (e) { console.warn(`[Timeline] Labor entries query failed for asset ${assetId}: ${e.message}`); }

        // 3. Health summary from master index
        let health = null;
        try {
            const path = require('path');
            const Database = require('better-sqlite3');
            const fs = require('fs');
            const masterDbPath = path.join(require('../resolve_data_dir'), 'master_index.db');
            if (fs.existsSync(masterDbPath)) {
                const masterDb = new Database(masterDbPath, { readonly: true });
                health = masterDb.prepare(`
                    SELECT healthScore, riskLevel, mtbfDays, mtbfTrend, predictedFailureDate, repairCount
                    FROM MasterAssetIndex WHERE assetId = ? LIMIT 1
                `).get(assetId);
                masterDb.close();
            }
        } catch (e) { console.warn(`[Timeline] Health summary query failed for asset ${assetId}: ${e.message}`); }

        // Sort events by date descending (newest first)
        events.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        res.json({ events, health, assetId, total: events.length });
    } catch (err) {
        console.error('Asset timeline error:', err.message);
        res.status(500).json({ error: 'Failed to build asset timeline' });
    }
});

// ── GET /api/assets/:id ──────────────────────────────────────────────────
router.get('/:id', (req, res) => {
    try {
        const asset = db.queryOne('SELECT * FROM Asset WHERE ID = ?', [req.params.id]);
        if (!asset) {
            return res.status(404).json({ error: 'Asset not found' });
        }

        // Get linked parts
        const parts = db.queryAll('SELECT * FROM AssetParts WHERE AstID = ?', [req.params.id]);

        // Get work order history
        const workOrders = db.queryAll(
            'SELECT WorkOrderNumber as WONum, Description as Descr, StatusID as Status, Priority, AddDate as DateReq FROM Work WHERE AstID = ? ORDER BY AddDate DESC LIMIT 50',
            [req.params.id]
        );

        // Get PM schedules
        const schedules = db.queryAll(
            'SELECT * FROM Schedule WHERE AstID = ?',
            [req.params.id]
        );

        res.json({ ...asset, _parts: parts, _workOrders: workOrders, _schedules: schedules });
    } catch (err) {
        console.error('GET /api/assets/:id error:', err);
        res.status(500).json({ error: 'Failed to fetch asset' });
    }
});

// ── POST /api/assets ─────────────────────────────────────────────────────
router.post('/', (req, res) => {
    try {
        const fields = whitelist(req.body, 'asset');

        if (!fields.ID) {
            return res.status(400).json({ error: 'Asset ID is required for creation.' });
        }

        // Check if asset ID already exists to prevent duplicates (Legacy schema safety)
        const existing = db.queryOne('SELECT ID FROM Asset WHERE ID = ?', [fields.ID]);

        if (existing) {
            console.log(`[API] Asset ${fields.ID} already exists. Converting POST to UPDATE.`);
            const sets = Object.keys(fields).map(k => `"${k}" = ?`).join(', ');
            const values = [...Object.values(fields), fields.ID];
            db.run(`UPDATE "Asset" SET ${sets} WHERE ID = ?`, values);
            return res.json({ success: true, message: 'Asset updated', id: fields.ID });
        }

        const columns = Object.keys(fields);
        const placeholders = columns.map(() => '?').join(', ');
        const values = Object.values(fields);
        const colStr = columns.map(c => `"${c}"`).join(', ');

        const sql = `INSERT INTO "Asset" (${colStr}) VALUES (${placeholders})`;
        console.log('Executing Insert:', sql, values);

        const result = db.run(sql, values);

        res.status(201).json({ success: true, id: fields.ID || result.lastInsertRowid });

        // Proactive sync to global registry
        const plantId = req.headers['x-plant-id'];
        if (plantId && plantId !== 'all_sites') {
            syncGlobalAsset(fields, plantId);
        }
    } catch (err) {
        console.error('POST /api/assets error:', err);
        res.status(500).json({ error: 'Failed to create asset' });
    }
});

// ── PUT /api/assets/:id ──────────────────────────────────────────────────
router.put('/:id', (req, res) => {
    try {
        const fields = whitelist(req.body, 'asset');

        if (Object.keys(fields).length === 0) {
            return res.status(400).json({ error: 'No valid update fields provided.' });
        }

        const sets = Object.keys(fields).map(k => `"${k}" = ?`).join(', ');
        const values = [...Object.values(fields), req.params.id];

        db.run(`UPDATE "Asset" SET ${sets} WHERE ID = ?`, values);
        res.json({ success: true, message: 'Asset updated' });

        // Proactive sync to global registry
        const plantId = req.headers['x-plant-id'];
        if (plantId && plantId !== 'all_sites') {
            syncGlobalAsset({ ...fields, ID: req.params.id }, plantId);
        }
    } catch (err) {
        console.error('PUT /api/assets/:id error:', err);
        res.status(500).json({ error: 'Failed to update asset' });
    }
});

// ── POST /api/assets/:id/delete ──────────────────────────────────────────
router.post('/:id/delete', (req, res) => {
    try {
        const { reason } = req.body;
        const deleteDate = new Date().toISOString();

        db.run(
            `UPDATE "Asset" SET "IsDeleted" = 1, "DeleteReason" = ?, "DeleteDate" = ?, "Active" = 0 WHERE "ID" = ?`,
            [reason, deleteDate, req.params.id]
        );

        res.json({ success: true, message: 'Asset flagged as deleted' });
    } catch (err) {
        console.error('POST /api/assets/:id/delete error:', err);
        res.status(500).json({ error: 'Failed to delete asset' });
    }
});

// ── POST /api/assets/:id/restore ──────────────────────────────────────────
router.post('/:id/restore', (req, res) => {
    try {
        db.run(
            `UPDATE "Asset" SET "IsDeleted" = 0, "DeleteReason" = NULL, "DeleteDate" = NULL, "Active" = 1 WHERE "ID" = ?`,
            [req.params.id]
        );

        res.json({ success: true, message: 'Asset restored to active inventory' });
    } catch (err) {
        console.error('POST /api/assets/:id/restore error:', err);
        res.status(500).json({ error: 'Failed to restore asset' });
    }
});

// ── Asset Photo Management ───────────────────────────────────────────────
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dataDir = require('../resolve_data_dir');

const assetPhotoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Sanitize asset ID for filesystem safety
        const safeId = req.params.id.replace(/[^a-zA-Z0-9_\-]/g, '_');
        const dir = path.join(dataDir, 'uploads', 'assets', safeId);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname).toLowerCase());
    }
});

const assetUpload = multer({
    storage: assetPhotoStorage,
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
    fileFilter: (req, file, cb) => {
        const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic'];
        const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedExts.includes(ext) && allowedMimes.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Only image files are allowed (.jpg, .png, .gif, .webp, .heic)'));
    }
});

// GET /api/assets/:id/photos — list all photos for an asset
router.get('/:id/photos', (req, res) => {
    try {
        const safeId = req.params.id.replace(/[^a-zA-Z0-9_\-]/g, '_');
        const dir = path.join(dataDir, 'uploads', 'assets', safeId);

        if (!fs.existsSync(dir)) {
            return res.json([]);
        }

        const files = fs.readdirSync(dir)
            .filter(f => /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(f))
            .map(f => {
                const stats = fs.statSync(path.join(dir, f));
                return {
                    filename: f,
                    url: `/uploads/assets/${safeId}/${f}`,
                    size: stats.size,
                    uploadedAt: stats.mtime.toISOString()
                };
            })
            .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

        res.json(files);
    } catch (err) {
        console.error('GET /api/assets/:id/photos error:', err);
        res.status(500).json({ error: 'Failed to list photos' });
    }
});

// POST /api/assets/:id/photos — upload a photo
router.post('/:id/photos', assetUpload.single('photo'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No photo provided' });
        }

        const safeId = req.params.id.replace(/[^a-zA-Z0-9_\-]/g, '_');
        const photoUrl = `/uploads/assets/${safeId}/${req.file.filename}`;

        console.log(`📸 Asset photo uploaded: ${req.params.id} → ${photoUrl}`);

        res.json({
            success: true,
            photo: {
                filename: req.file.filename,
                url: photoUrl,
                size: req.file.size,
                uploadedAt: new Date().toISOString()
            }
        });
    } catch (err) {
        console.error('POST /api/assets/:id/photos error:', err);
        res.status(500).json({ error: 'Failed to upload photo' });
    }
});

// DELETE /api/assets/:id/photos/:filename — delete a specific photo
router.delete('/:id/photos/:filename', (req, res) => {
    try {
        const safeId = req.params.id.replace(/[^a-zA-Z0-9_\-]/g, '_');
        const safeFilename = path.basename(req.params.filename);
        const filePath = path.join(dataDir, 'uploads', 'assets', safeId, safeFilename);

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`🗑️ Asset photo deleted: ${req.params.id} → ${safeFilename}`);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Photo not found' });
        }
    } catch (err) {
        console.error('DELETE /api/assets/:id/photos/:filename error:', err);
        res.status(500).json({ error: 'Failed to delete photo' });
    }
});

// ── OCR Scan for Asset Photos ────────────────────────────────────────────
const Tesseract = require('tesseract.js');

router.post('/:id/photos/:filename/ocr', async (req, res) => {
    try {
        const safeId = req.params.id.replace(/[^a-zA-Z0-9_\-]/g, '_');
        const safeFilename = path.basename(req.params.filename);
        const filePath = path.join(dataDir, 'uploads', 'assets', safeId, safeFilename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Photo not found' });
        }

        console.log(`🔍 OCR scanning: ${filePath}`);
        const startTime = Date.now();

        const { data } = await Tesseract.recognize(filePath, 'eng', {
            logger: () => {} // Suppress progress logs
        });

        const rawText = data.text || '';
        const elapsed = Date.now() - startTime;
        console.log(`✅ OCR complete in ${elapsed}ms — ${rawText.length} chars extracted`);

        // ── Pattern Matching for Equipment Labels ──
        const results = {
            serial: [],
            model: [],
            partNumber: [],
            rawText: rawText.substring(0, 2000) // Cap for response size
        };

        // Normalize text for matching
        const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const fullText = lines.join(' ');

        // === Labeled patterns (highest confidence) ===
        // Serial number patterns
        const serialPatterns = [
            /(?:S\/N|SN|SERIAL|Serial\s*(?:No|Number|#)?)\s*[:\.\-]?\s*([A-Z0-9][A-Z0-9\-\.\/]{3,25})/gi,
            /(?:SERIAL\s*NUMBER)\s*[:\.\-]?\s*([A-Z0-9][A-Z0-9\-\.\/]{3,25})/gi,
        ];

        // Model number patterns
        const modelPatterns = [
            /(?:MODEL|MDL|MOD)\s*[:\.\-#]?\s*([A-Z0-9][A-Z0-9\-\.\/]{2,20})/gi,
            /(?:MODEL\s*(?:No|Number|#))\s*[:\.\-]?\s*([A-Z0-9][A-Z0-9\-\.\/]{2,20})/gi,
        ];

        // Part number patterns
        const partPatterns = [
            /(?:P\/N|PN|PART|Part\s*(?:No|Number|#)?)\s*[:\.\-]?\s*([A-Z0-9][A-Z0-9\-\.\/]{3,25})/gi,
            /(?:CAT(?:ALOG)?\s*(?:No|Number|#)?)\s*[:\.\-]?\s*([A-Z0-9][A-Z0-9\-\.\/]{3,25})/gi,
            /(?:ITEM|REF)\s*[:\.\-#]?\s*([A-Z0-9][A-Z0-9\-\.\/]{3,20})/gi,
        ];

        const extractMatches = (patterns, target) => {
            const seen = new Set();
            patterns.forEach(regex => {
                let match;
                while ((match = regex.exec(fullText)) !== null) {
                    const val = match[1].replace(/[\.\,]+$/, '').trim(); // strip trailing punctuation
                    if (val.length >= 3 && !seen.has(val.toUpperCase())) {
                        seen.add(val.toUpperCase());
                        target.push({ value: val, labeled: true });
                    }
                }
            });
        };

        extractMatches(serialPatterns, results.serial);
        extractMatches(modelPatterns, results.model);
        extractMatches(partPatterns, results.partNumber);

        // === Standalone alphanumeric codes (lower confidence) ===
        // Look for standalone codes that might be serial/model/part numbers
        // Must have both letters and numbers, 5+ chars, with optional dashes
        const standalonePattern = /\b([A-Z]{1,4}[\-\.]?[0-9]{2,}[A-Z0-9\-\.]*)\b/gi;
        let standalone;
        const allFound = new Set([
            ...results.serial.map(s => s.value.toUpperCase()),
            ...results.model.map(s => s.value.toUpperCase()),
            ...results.partNumber.map(s => s.value.toUpperCase()),
        ]);

        while ((standalone = standalonePattern.exec(fullText)) !== null) {
            const val = standalone[1].replace(/[\.\,]+$/, '').trim();
            if (val.length >= 5 && !allFound.has(val.toUpperCase())) {
                allFound.add(val.toUpperCase());
                // Classify: longer codes are likely serial numbers
                if (val.length >= 8) {
                    results.serial.push({ value: val, labeled: false });
                } else {
                    results.model.push({ value: val, labeled: false });
                }
            }
        }

        const totalFinds = results.serial.length + results.model.length + results.partNumber.length;
        console.log(`🔎 OCR found ${totalFinds} potential identifiers for asset ${req.params.id}`);

        res.json(results);
    } catch (err) {
        console.error('OCR scan error:', err);
        res.status(500).json({ error: 'OCR scan failed: ' });
    }
});

// ── Meter Reading API (Feature 2) ────────────────────────────────────────

// POST /api/assets/:id/meter — Log a new meter reading
router.post('/:id/meter', (req, res) => {
    try {
        const assetId = req.params.id;
        const { reading, source } = req.body;
        if (reading === undefined || reading === null) {
            return res.status(400).json({ error: 'reading is required' });
        }

        const numReading = parseFloat(reading);
        if (isNaN(numReading)) {
            return res.status(400).json({ error: 'reading must be a number' });
        }

        // Validate reading >= previous (meters don't go backwards)
        const asset = db.queryOne('SELECT MeterReading, MeterType, MeterUnit FROM Asset WHERE ID = ?', [assetId]);
        if (asset && asset.MeterReading !== null && numReading < asset.MeterReading) {
            return res.status(400).json({ 
                error: `Meter reading cannot decrease. Current: ${asset.MeterReading}, Submitted: ${numReading}` 
            });
        }

        // Insert into readings history
        db.run(
            'INSERT INTO MeterReadings (assetId, reading, source, recordedBy, recordedAt) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
            [assetId, numReading, source || 'manual', req.user?.Username || 'system']
        );

        // Update live reading on the Asset record
        db.run(
            'UPDATE Asset SET MeterReading = ?, MeterLastUpdated = CURRENT_TIMESTAMP WHERE ID = ?',
            [numReading, assetId]
        );

        res.status(201).json({ success: true, reading: numReading, assetId });
    } catch (err) {
        console.error('POST /api/assets/:id/meter error:', err);
        res.status(500).json({ error: 'Failed to log meter reading' });
    }
});

// GET /api/assets/:id/meter/history — Last 100 readings for charts
router.get('/:id/meter/history', (req, res) => {
    try {
        const rows = db.queryAll(
            'SELECT * FROM MeterReadings WHERE assetId = ? ORDER BY recordedAt DESC LIMIT 100',
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        console.error('GET /api/assets/:id/meter/history error:', err);
        res.status(500).json({ error: 'Failed to fetch meter history' });
    }
});



// ═══════════════════════════════════════════════════════════════
// Bill of Materials (BOM) — Asset → Parts List
// ═══════════════════════════════════════════════════════════════

// GET /api/assets/:id/bom — Full BOM for an asset with part details
router.get('/:id/bom', (req, res) => {
    try {
        const plantDb = db.getDb();
        const bom = plantDb.prepare(`
            SELECT ap.AstID, ap.PartID, ap.Quantity, ap.LUseDate, ap.Comment,
                   p.Descript as partDesc, p.Description as partFullDesc,
                   p.UnitCost, p.Stock, p.Reorder, p.VendorID, p.Manufacturer,
                   p.Location as partLocation
            FROM AssetParts ap
            LEFT JOIN Part p ON ap.PartID = p.ID
            WHERE ap.AstID = ?
            ORDER BY ap.PartID
        `).all(req.params.id);

        // Calculate totals
        const totalParts = bom.length;
        const totalCost = bom.reduce((sum, b) => sum + (parseFloat(b.UnitCost || 0) * (b.Quantity || 1)), 0);
        const outOfStock = bom.filter(b => (b.Stock || 0) <= 0).length;
        const belowReorder = bom.filter(b => b.Stock !== null && b.Reorder !== null && b.Stock <= b.Reorder).length;

        res.json({
            assetId: req.params.id,
            bom: bom.map(b => ({
                ...b,
                lineCost: Math.round(parseFloat(b.UnitCost || 0) * (b.Quantity || 1) * 100) / 100,
                stockStatus: (b.Stock || 0) <= 0 ? 'out' : (b.Stock <= (b.Reorder || 0)) ? 'low' : 'ok'
            })),
            totals: {
                totalParts,
                totalCost: Math.round(totalCost * 100) / 100,
                outOfStock,
                belowReorder
            }
        });
    } catch (err) {
        console.error('GET /api/assets/:id/bom error:', err);
        res.status(500).json({ error: 'Failed to fetch BOM' });
    }
});

// POST /api/assets/:id/bom — Add a part to BOM
router.post('/:id/bom', (req, res) => {
    try {
        const { partId, quantity, comment } = req.body;
        if (!partId) return res.status(400).json({ error: 'partId is required' });

        const plantDb = db.getDb();

        // Check if already in BOM
        const existing = plantDb.prepare('SELECT * FROM AssetParts WHERE AstID = ? AND PartID = ?').get(req.params.id, partId);
        if (existing) {
            // Update quantity
            plantDb.prepare('UPDATE AssetParts SET Quantity = ?, Comment = ? WHERE AstID = ? AND PartID = ?')
                .run(quantity || 1, comment || existing.Comment, req.params.id, partId);
            return res.json({ success: true, message: 'BOM entry updated', action: 'updated' });
        }

        plantDb.prepare('INSERT INTO AssetParts (AstID, PartID, Quantity, Comment) VALUES (?, ?, ?, ?)')
            .run(req.params.id, partId, quantity || 1, comment || null);
        res.status(201).json({ success: true, message: 'Part added to BOM', action: 'created' });
    } catch (err) {
        console.error('POST /api/assets/:id/bom error:', err);
        res.status(500).json({ error: 'Failed to add part to BOM' });
    }
});

// DELETE /api/assets/:id/bom/:partId — Remove a part from BOM
router.delete('/:id/bom/:partId', (req, res) => {
    try {
        const plantDb = db.getDb();
        plantDb.prepare('DELETE FROM AssetParts WHERE AstID = ? AND PartID = ?')
            .run(req.params.id, req.params.partId);
        res.json({ success: true, message: 'Part removed from BOM' });
    } catch (err) {
        console.error('DELETE /api/assets/:id/bom error:', err);
        res.status(500).json({ error: 'Failed to remove part from BOM' });
    }
});

// ── PUT /api/assets/:id/emission-factor ──────────────────────────────────
router.put('/:id/emission-factor', (req, res) => {
    try {
        const { scope1EmissionFactor, fuelType } = req.body;
        const validFuels = ['natural_gas', 'propane', 'diesel', 'fuel_oil', 'coal'];
        
        if (typeof scope1EmissionFactor !== 'number' || scope1EmissionFactor < 0) {
            return res.status(400).json({ error: 'scope1EmissionFactor must be a number >= 0' });
        }
        if (!validFuels.includes(fuelType)) {
            return res.status(400).json({ error: 'Invalid fuelType' });
        }

        const plantDb = db.getDb();
        plantDb.prepare('UPDATE Asset SET Scope1EmissionFactor = ?, FuelType = ? WHERE ID = ?')
            .run(scope1EmissionFactor, fuelType, req.params.id);

        const { logAudit } = require('../logistics_db');
        logAudit(req.user?.Username || 'admin', 'ASSET_EMISSION_FACTOR_SET', req.headers['x-plant-id'], { 
            assetId: req.params.id, 
            scope1EmissionFactor, 
            fuelType 
        });

        res.json({ success: true });
    } catch (err) {
        console.error('PUT /api/assets/:id/emission-factor error:', err);
        res.status(500).json({ error: 'Failed to set emission factor' });
    }
});

// ── GET /api/assets/:id/explain ──────────────────────────────────────────────
// "Explain This Asset" — deterministic snapshot: live state, recent failures,
// PM status, contextual artifacts, recommended actions.
//
// Cache path (warm): served from in-memory explainCache — zero DB queries.
// Miss path: computeExplain() runs synchronously, result is cached for next hit.
// Failure path: returns minimal deterministic payload + warmAsync for recovery.
const explainCache = require('../services/explainCache');

router.get('/:id/explain', (req, res) => {
    const assetId = req.params.id;
    const plantId = (req.headers['x-plant-id'] || 'Demo_Plant_1').trim();

    const debug = process.env.NODE_ENV !== 'production';

    // Cache hit — no DB queries
    const cached = explainCache.get(plantId, assetId);
    if (cached) return res.json(debug ? { ...cached, cacheStatus: 'hit' } : cached);

    // Cache miss — compute, cache, return
    try {
        const payload = explainCache.computeExplain(plantId, assetId);
        if (payload) {
            explainCache.set(plantId, assetId, payload);
            return res.json(debug ? { ...payload, cacheStatus: 'miss' } : payload);
        }
    } catch (err) {
        console.error('[assets/:id/explain]', err.message);
    }

    // Fallback: DB unavailable or schema mismatch — minimal payload, warm async
    explainCache.warmAsync(plantId, assetId);
    return res.json({
        assetId,
        identity:            { ID: assetId, Description: assetId },
        liveState:           null,
        recentFailures:      [],
        pmStatus:            null,
        contextualArtifacts: [],
        recommendedActions:  [],
        generatedAt:         new Date().toISOString(),
        ...(debug && { cacheStatus: 'fallback' }),
    });
});

// ── GET /api/assets/:id/artifacts/usage ─────────────────────────────────────
// Record or retrieve artifact usage for an asset (delegates to catalog route
// but scoped by assetId for simpler frontend calls).
router.get('/:id/artifacts', (req, res) => {
    const assetId = req.params.id;
    try {
        const plant = db();
        const has = plant.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='plant_artifacts'").get();
        if (!has) return res.json([]);
        const rows = plant.prepare(
            `SELECT * FROM plant_artifacts WHERE EntityID = ? AND IsDeleted = 0 ORDER BY CreatedAt DESC`
        ).all(String(assetId));
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
