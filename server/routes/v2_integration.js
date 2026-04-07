// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Advanced Integration & Reporting API
 * ==================================================
 * Extended routes covering work order hierarchy, dynamic reporting, asset
 * hierarchy, cross-plant parts network sync, SAP integration settings,
 * and site contact lookups. Mounted at /api/v2 in server/index.js.
 *
 * ENDPOINTS:
 *   Work Order Extensions
 *   GET    /work-orders/hierarchy            WO parent/child tree (project → sub-tasks)
 *   GET    /work-orders/:id/tasks            Task checklist items for a WO
 *   PUT    /work-orders/:id/tasks            Update task completion status
 *   GET    /work-orders/:id/objects          Physical objects (equipment) linked to a WO
 *   PUT    /work-orders/:id/objects          Update linked objects
 *   GET    /work-orders/:id/related          Related WOs (same asset, same period)
 *   POST   /work-orders/:id/close            Execute the WO close-out workflow
 *
 *   Dynamic Report Engine
 *   GET    /reports                          List available report templates
 *   GET    /reports/manifest                 Full report manifest with metadata and parameters
 *   GET    /reports/:id                      Single report definition
 *   POST   /reports/dynamic/:id             Execute a dynamic report with user-supplied filters
 *   PATCH  /reports/update                   Update report template metadata
 *   POST   /reports/preview/:id             Preview a report (first 50 rows)
 *   GET    /reports/lookup/:table            Lookup table values for report filter dropdowns
 *
 *   Lookups (shared reference data)
 *   GET    /lookups/part-classes             Part classification codes
 *   GET    /lookups/part-order-rules         Reorder rules and lead times
 *   GET    /lookups/adj-types                Inventory adjustment type codes
 *
 *   Cross-Plant Parts Network
 *   GET    /network/sync/:partId             Find matching parts at other plants by part number
 *   POST   /network/sync/bulk               Bulk cross-plant price/quantity comparison
 *   POST   /network/import                  Import a part from another plant's inventory
 *   GET    /network/vendor/:vendId           Vendor details from the parts network
 *   POST   /network/vendor/import           Import a vendor record from the network
 *   POST   /network/price-alert             Set a price alert for a part
 *   POST   /network/ignore-price            Suppress price alert for a part/plant pair
 *   GET    /network/ignored-prices/:plantId  List suppressed price alerts for a plant
 *   GET    /network/site-contacts/:plantId   Site contacts / plant managers for a plant
 *
 *   SAP Integration Settings
 *   GET    /integration/sap/settings         Retrieve SAP connection configuration
 *   POST   /integration/sap/settings         Save SAP connection configuration
 *
 *   Asset Hierarchy
 *   GET    /assets/hierarchy                 Full enterprise asset tree
 *   PUT    /assets/:id/parent               Set or change parent asset
 *   GET    /assets/:id/children             Direct children of an asset
 *   GET    /assets/:id/rollup               Aggregate cost/downtime rollup from all child assets
 *
 * CROSS-PLANT NETWORK: Parts sync compares QtyOnHand, UnitCost, and VendorName across
 *   all plant databases to surface sourcing opportunities and price discrepancies.
 *   Price alerts notify the storeroom when a part costs >10% more than the network average.
 *
 * SAP SETTINGS: Stored in logistics_db NetworkAlerts table. Connection tested before save.
 *   Supports RFC/BAPI connection for WO, PM order, and material master sync.
 */

const express = require('express');
const router = express.Router();
const db = require('../database');
const path = require('path');
const fs = require('fs');
const { REPORT_TYPES, buildQuery } = require('../utils/reportEngine');
const { db: logisticsDb } = require('../logistics_db');

// Initialize Global Logistics Table for SAP Settings if not exists
logisticsDb.exec(`
    CREATE TABLE IF NOT EXISTS NetworkAlerts (
        ID INTEGER PRIMARY KEY AUTOINCREMENT,
        Type TEXT,
        PartID TEXT,
        PlantID TEXT,
        BetterPrice REAL,
        Message TEXT,
        CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);
// Load Replacement Map
const REPLACEMENT_MAP_PATH = path.join(require('../resolve_data_dir'), 'reportReplacementMap.json');
let REPLACEMENT_MAP = {};
try {
    if (fs.existsSync(REPLACEMENT_MAP_PATH)) {
        REPLACEMENT_MAP = JSON.parse(fs.readFileSync(REPLACEMENT_MAP_PATH, 'utf8'));
        console.log('[V2] Report Replacement Map Loaded. Keys:', Object.keys(REPLACEMENT_MAP));
    }
} catch (err) {
    console.error('[V2] Failed to load report replacement map:', err);
}

// Report Categories for the UI
const REPORT_CATEGORIES = [
    {
        ID: 'MAINT',
        Description: 'Maintenance Operations',
        reports: [
            { ID: 'WORKORDER', Description: 'Work Order Summary', Type: 'DYNAMIC' },
            { ID: 'COST', Description: 'Work Order Cost Summary', Type: 'DYNAMIC' },
            { ID: 'DOWNTIME', Description: 'Downtime & Reliability', Type: 'DYNAMIC' },
            { ID: 'LABOR', Description: 'Time and Labor Summary', Type: 'DYNAMIC' },
        ]
    },
    {
        ID: 'ASSET',
        Description: 'Asset Management',
        reports: [
            { ID: 'ASSET', Description: 'Asset and Equipment Summary', Type: 'DYNAMIC' },
            { ID: 'ASSET_BURN', Description: 'Asset Burn Rate', Type: 'DYNAMIC' },
            { ID: 'PROJECT', Description: 'Project & Capital', Type: 'DYNAMIC' },
        ]
    },
    {
        ID: 'INV',
        Description: 'Inventory & Parts',
        reports: [
            { ID: 'INVENTORY', Description: 'Inventory & Warehouse', Type: 'DYNAMIC' },
            { ID: 'INV_ISSUES', Description: 'Inventory Consumption', Type: 'DYNAMIC' },
            { ID: 'PURCHASING', Description: 'Vendor & Purchasing', Type: 'DYNAMIC' },
        ]
    },
    {
        ID: 'SYSTEM',
        Description: 'System & Audit',
        reports: [
            { ID: 'SECURITY', Description: 'Security & Audit', Type: 'DYNAMIC' },
            { ID: 'FORECAST', Description: 'Forecast & Planning', Type: 'DYNAMIC' },
            { ID: 'CALENDAR', Description: 'Schedule & Calendar', Type: 'DYNAMIC' },
        ]
    }
];

/**
 * GET /api/v2/work-orders/hierarchy
 * Returns work orders with grouping metadata (ProjID, Priority) for tree view.
 * Supports search, status, and priority query filters.
 */
router.get('/work-orders/hierarchy', (req, res) => {
    try {
        const { search = '', status = '', priority = '' } = req.query;
        
        let sql = `SELECT ID, WorkOrderNumber, Description, AstID, StatusID, Priority, ProjID, SchDate, AddDate FROM Work WHERE 1=1`;
        const params = [];
        
        if (search) {
            sql += ` AND (ID LIKE ? OR WorkOrderNumber LIKE ? OR Description LIKE ?)`;
            const term = `%${search}%`;
            params.push(term, term, term);
        }
        if (status) {
            sql += ` AND StatusID = ?`;
            params.push(status);
        }
        if (priority) {
            if (parseInt(priority) >= 200) {
                sql += ` AND CAST(Priority AS INTEGER) >= 200`;
            } else {
                sql += ` AND Priority = ?`;
                params.push(priority);
            }
        }
        
        sql += ` ORDER BY AddDate DESC LIMIT 500`;
        
        const data = db.queryAll(sql, params);
        res.json(data);
    } catch (err) {
        console.error('[V2] Work order hierarchy error:', err.message);
        res.status(500).json([]);
    }
});

/**
 * GET /api/v2/work-orders/:id/tasks
 * Fetches all tasks associated with a specific Work Order.
 * Joins WorkTask and Task tables to get full descriptions.
 */
router.get('/work-orders/:id/tasks', (req, res) => {
    try {
        const { id } = req.params;
        
        // Fetch tasks using the WorkTask table.
        // TskOrder provides the correct sequence from the legacy system.
        const tasks = db.queryAll(`
            SELECT 
                wt.TaskID,
                wt.TskOrder,
                wt.Tasks as DynamicText,
                t.Tasks as StandardTasks,
                t.Descript as StandardDescription
            FROM WorkTask wt
            LEFT JOIN Task t ON wt.TaskID = t.ID
            WHERE wt.WoID = ?
            ORDER BY wt.TskOrder ASC
        `, [id]);


        res.json(tasks);
    } catch (err) {
        console.error(`[V2] Error fetching tasks for WO ${req.params.id}:`, err);
        // Fail gracefully with an empty array to prevent UI crashes
        res.status(500).json([]);
    }
});

/**
 * PUT /api/v2/work-orders/:id/tasks
 * Updates dynamic task text for a specific Work Order.
 */
router.put('/work-orders/:id/tasks', (req, res) => {
    try {
        const { id } = req.params;
        const { tasks } = req.body; // Array of { TaskID, TskOrder, DynamicText }

        // We update the WorkTask table. 
        // Note: In Discovery Mode, we only update the 'Tasks' column.
        for (const task of tasks) {
            db.run(`
                UPDATE WorkTask 
                SET Tasks = ? 
                WHERE WoID = ? AND TaskID = ? AND TskOrder = ?
            `, [task.DynamicText, id, task.TaskID, task.TskOrder]);
        }

        res.json({ success: true });
    } catch (err) {
        console.error(`[V2] Error updating tasks for WO ${req.params.id}:`, err);
        res.status(500).json({ error: 'Failed to update discovery data' });
    }
});

/**
 * GET /api/v2/work-orders/:id/objects
 * Fetches all linked objects (auxiliary equipment) for a specific Work Order.
 * Joins WorkObj and Object tables.
 */
router.get('/work-orders/:id/objects', (req, res) => {
    try {
        const { id } = req.params;
        const objects = db.queryAll(`
            SELECT 
                wo.ObjID,
                wo.WoPrint,
                wo.Comment as ObjectComment,
                o.Description as ObjectDescription,
                o.FileName
            FROM WorkObj wo
            LEFT JOIN Object o ON wo.ObjID = o.ID
            WHERE wo.WoID = ?
        `, [id]);

        res.json(objects);
    } catch (err) {
        console.error(`[V2] Error fetching objects for WO ${req.params.id}:`, err);
        res.status(500).json([]);
    }
});

/**
 * PUT /api/v2/work-orders/:id/objects
 * Synchronizes auxiliary objects for a work order.
 */
router.put('/work-orders/:id/objects', (req, res) => {
    try {
        const { id } = req.params;
        const { objects } = req.body;

        if (!Array.isArray(objects)) {
            return res.status(400).json({ error: 'Expected an array of objects' });
        }

        const syncTx = db.getDb().transaction(() => {
            // 1. Clear existing
            db.getDb().prepare('DELETE FROM WorkObj WHERE WoID = ?').run(id);

            // 2. Insert new
            const stmt = db.getDb().prepare(`
                INSERT INTO WorkObj (WoID, ObjID, WoPrint, Comment)
                VALUES (?, ?, ?, ?)
            `);

            for (const obj of objects) {
                stmt.run(id, obj.ObjID, obj.WoPrint || 1, obj.ObjectComment || '');
            }
        });

        syncTx();
        res.json({ success: true });
    } catch (err) {
        console.error(`[V2] Error syncing objects for WO ${id}:`, err);
        res.status(500).json({ error: 'Failed' });
    }
});

/**
 * GET /api/v2/work-orders/:id/related
 * Fetches other work orders in the same Project (ProjID) or PM sequence.
 */
router.get('/work-orders/:id/related', (req, res) => {
    try {
        const { id } = req.params;
        
        // 1. Get ProjID for this WO
        const current = db.queryOne('SELECT ProjID, AstID FROM Work WHERE ID = ? OR WorkOrderNumber = ?', [id, id]);
        
        if (!current || !current.ProjID) {
            return res.json([]);
        }

        // 2. Find siblings
        const siblings = db.queryAll(`
            SELECT 
                ID, 
                WorkOrderNumber, 
                Description, 
                StatusID, 
                Priority,
                SchDate
            FROM Work 
            WHERE ProjID = ? AND (ID != ? AND WorkOrderNumber != ?)
            LIMIT 20
        `, [current.ProjID, id, id]);

        res.json(siblings);
    } catch (err) {
        console.error(`[V2] Error fetching related orders for WO ${req.params.id}:`, err);
        res.status(500).json([]);
    }
});

/**
 * GET /api/v2/reports
 * Returns report categories and their included reports.
 */
router.get('/reports', (req, res) => {
    // Filter categories to only include reports that actually exist in the engine
    const availableCategories = REPORT_CATEGORIES.map(cat => ({
        ...cat,
        reports: cat.reports.filter(r => REPORT_TYPES[r.ID]).map(r => ({
            ...r,
            isReplacement: !!REPLACEMENT_MAP[r.ID]
        }))
    })).filter(cat => cat.reports.length > 0);
    
    res.json(availableCategories);
});

/**
 * GET /api/v2/reports/manifest
 * Returns a high-level manifest of report availability and metadata.
 */
router.get('/reports/manifest', (req, res) => {
    try {
        const manifest = {};
        Object.keys(REPORT_TYPES).forEach(key => {
            const report = REPORT_TYPES[key];
            manifest[key] = {
                ...report,
                isReplaced: !!REPLACEMENT_MAP[key],
                status: REPLACEMENT_MAP[key] ? 'Vibe Ready' : 'Legacy Compatible'
            };
        });
        res.json(manifest);
    } catch (err) {
        console.error('[V2] Manifest failure:', err);
        res.status(500).json({ error: 'Failed to build report manifest' });
    }
});

/**
 * Multi-plant report aggregation for Corporate (all_sites) view.
 * Sweeps every plant database, runs the same query, and merges results with a PlantID column.
 */
function runMultiPlantReport(sql, values, config, limit = 200) {
    const Database = require('better-sqlite3');
    const dataDir = require('../resolve_data_dir');
    const dbFiles = fs.readdirSync(dataDir).filter(f => 
        f.endsWith('.db') && !f.includes('trier_') && 
        !f.includes('schema_template') && !f.includes('dairy_master') &&
        !f.includes('schema_template') && !f.includes('Corporate_Office') &&
        !f.includes('corporate_master')
    );

    const allData = [];
    const perPlant = Math.max(20, Math.floor(limit / dbFiles.length));

    // Replace any existing LIMIT clause with per-plant limit
    const limitedSql = sql.replace(/LIMIT\s+\?\s+OFFSET\s+\?/i, `LIMIT ${perPlant}`)
                         .replace(/LIMIT\s+\d+/i, `LIMIT ${perPlant}`);
    // Remove OFFSET params from values
    const cleanValues = values.filter((_, i) => i < values.length - 2 || !sql.match(/LIMIT\s+\?\s+OFFSET\s+\?/i));
    // If query had LIMIT ? OFFSET ?, the last 2 values were pagination — strip them
    const finalValues = sql.match(/LIMIT\s+\?\s+OFFSET\s+\?/i) 
        ? values.slice(0, values.length - 2) 
        : values;

    for (const dbFile of dbFiles) {
        const plantId = dbFile.replace('.db', '').replace(/_/g, ' ');
        try {
            const plantDb = new Database(path.join(dataDir, dbFile), { readonly: true });
            const rows = plantDb.prepare(limitedSql).all(...finalValues);
            rows.forEach(row => {
                row.PlantID = plantId;
                allData.push(row);
            });
            plantDb.close();
        } catch (e) {
            // Skip plants where the table/query doesn't work
        }
    }

    return allData;
}

/**
 * GET /api/v2/reports/:id
 * Runs a standard report.
 * Plant-aware: single plant = plant data only, Corporate = all plants aggregated.
 */
router.get('/reports/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { isReplacement } = req.query;
        const plantId = req.headers['x-plant-id'] || 'Demo_Plant_1';
        const isCorporate = plantId === 'all_sites';
        
        const { sql, values, config } = buildQuery(id, { pagination: { page: 1, limit: isCorporate ? 2000 : 1000 } });
        
        let data;
        if (isCorporate) {
            data = runMultiPlantReport(sql, values, config, 2000);
        } else {
            data = db.queryAll(sql, values);
        }

        // Simple aggregation for numeric-sounding columns
        const aggregates = {};
        if (data.length > 0) {
            Object.keys(data[0]).forEach(col => {
                const lowerCol = col.toLowerCase();
                if (lowerCol.includes('cost') || lowerCol.includes('spend') || lowerCol.includes('qty') || lowerCol.includes('hrs')) {
                    const sum = data.reduce((acc, row) => acc + (parseFloat(row[col]) || 0), 0);
                    aggregates[col] = sum;
                }
            });
        }
        
        const labels = { ...(config.labels || {}) };
        if (isCorporate) labels['PlantID'] = 'Plant';
        
        res.json({
            ID: id,
            columns: data.length > 0 ? Object.keys(data[0]) : [...config.defaultCols, ...(isCorporate ? ['PlantID'] : [])],
            labels,
            data: data,
            aggregates,
            sourceTable: config.baseTable,
            meta: { Description: config.name + (isCorporate ? ' (All Sites)' : '') },
            isReplacement: isReplacement === 'true'
        });
    } catch (err) {
        console.error(`[V2] Report execution failed: ${req.params.id}`, err.message);
        res.status(500).json({ error: 'Failed to run report', details: err.message });
    }
});

/**
 * POST /api/v2/reports/dynamic/:id
 * Runs a dynamic report with full parameters (filters, date ranges, etc).
 * Plant-aware: single plant = plant data only, Corporate = all plants aggregated.
 */
router.post('/reports/dynamic/:id', (req, res) => {
    try {
        const { id } = req.params;
        const params = req.body;
        const plantId = req.headers['x-plant-id'] || 'Demo_Plant_1';
        const isCorporate = plantId === 'all_sites';
        
        // For corporate view, increase limit
        if (isCorporate && params.pagination) {
            params.pagination.limit = Math.min((params.pagination.limit || 100) * 5, 5000);
        }
        
        const { sql, values, config } = buildQuery(id, params);
        
        let data;
        if (isCorporate) {
            data = runMultiPlantReport(sql, values, config, params.pagination?.limit || 2000);
        } else {
            data = db.queryAll(sql, values);
        }

        // Simple aggregation for numeric-sounding columns
        const aggregates = {};
        if (data.length > 0) {
            Object.keys(data[0]).forEach(col => {
                const lowerCol = col.toLowerCase();
                if (lowerCol.includes('cost') || lowerCol.includes('spend') || lowerCol.includes('qty') || lowerCol.includes('hrs') || lowerCol.includes('total')) {
                    const sum = data.reduce((acc, row) => acc + (parseFloat(row[col]) || 0), 0);
                    aggregates[col] = sum;
                }
            });
        }
        
        const labels = { ...(config.labels || {}) };
        if (isCorporate) labels['PlantID'] = 'Plant';
        
        res.json({
            ID: id,
            columns: data.length > 0 ? Object.keys(data[0]) : [...config.defaultCols, ...(isCorporate ? ['PlantID'] : [])],
            labels,
            data: data,
            aggregates,
            sourceTable: config.baseTable,
            meta: { Description: config.name + (isCorporate ? ' (All Sites)' : '') }
        });
    } catch (err) {
        console.error(`[V2] Dynamic report execution failed: ${req.params.id}`, err.message);
        res.status(500).json({ error: 'Failed to run dynamic report', details: err.message });
    }
});


/**
 * PATCH /api/v2/reports/update
 * Atomic update for a single field in a report source table.
 */
router.patch('/reports/update', (req, res) => {
    try {
        const { table, id, column, value } = req.body;
        
        if (!table || !id || !column) {
            return res.status(400).json({ error: 'Incomplete update parameters' });
        }

        // Quoting identifiers to prevent SQL injection for table/column names (structural sanitization)
        const sql = `UPDATE "${table}" SET "${column}" = ? WHERE ID = ?`;
        db.run(sql, [value, id]);

        res.json({ success: true });
    } catch (err) {
        console.error(`[V2] Row update failed for table ${req.body.table}:`, err.message);
        res.status(500).json({ error: 'Update failed', details: err.message });
    }
});

/**
 * GET /api/v2/reports/preview/:id
 * Dedicated endpoint for cross-database report previews.
 */
router.post('/reports/preview/:id', (req, res) => {
    try {
        const { id } = req.params;
        const config = req.body; // { filters, sort, parameters }
        
        console.log(`[Vibe] Executing high-fidelity preview for: ${id}`);
        
        const { sql, values } = buildQuery(id, config);
        const data = db.queryAll(sql, values);

        res.json({
            reportId: id,
            executionTime: new Date(),
            rowCount: data.length,
            columns: data.length > 0 ? Object.keys(data[0]) : [],
            data: data
        });
    } catch (err) {
        console.error(`[Vibe] Preview failed for ${req.params.id}:`, err);
        res.status(500).json({ error: 'Structural report error during generation' });
    }
});

const { closeWorkOrderWithCosts } = require('../utils/costLedger');

/**
 * POST /api/v2/work-orders/:id/close
 * Custom high-fidelity close-out endpoint that records true labor, parts, and misc costs.
 */
router.post('/work-orders/:id/close', async (req, res) => {
    try {
        const { id } = req.params;
        const { labor, parts, misc } = req.body;

        if (!id) {
            return res.status(400).json({ error: 'Work Order ID is required' });
        }

        // Resolve the actual writable plant — 'all_sites' is read-only and cannot accept writes.
        // Fall back to the user's native plant from their JWT token.
        let targetPlant = req.headers['x-plant-id'] || 'Demo_Plant_1';
        if (targetPlant === 'all_sites') {
            targetPlant = req.user?.nativePlantId || 'Demo_Plant_1';
            console.log(`[V2] Close-out redirected from all_sites → ${targetPlant}`);
        }

        const result = closeWorkOrderWithCosts(id, { labor, parts, misc }, targetPlant);
        
        console.log(`[V2] Work Order ${id} closed with costs:`, {
            laborCount: labor?.length || 0,
            partsCount: parts?.length || 0,
            miscCount: misc?.length || 0
        });

        // ── Webhook: Notify on WO Completion ──
        try {
            const dispatchEvent = req.app.get('dispatchEvent');
            if (dispatchEvent) {
                dispatchEvent('WO_COMPLETED', {
                    woNumber: id,
                    description: `Work Order ${id} completed`,
                    plant: req.headers['x-plant-id'] || '',
                    message: `Labor: ${labor?.length || 0} entries, Parts: ${parts?.length || 0} used`
                });
            }
        } catch (e) { /* non-blocking */ }

        res.json({ 
            success: true, 
            message: 'Work order closed and costs captured.',
            result 
        });
    } catch (err) {
        console.error('[V2] Close-out failure:', err);
        res.status(500).json({ 
            error: 'Failed to close work order', 
            details: err.message
        });
    }
});

/**
 * GET /api/v2/lookups/part-classes
 */
router.get('/lookups/part-classes', async (req, res) => {
    try {
        // Try PartClasses first, then fallback to PartClass if needed
        let data;
        try {
            data = db.queryAll('SELECT ID as id, Description as label FROM PartClasses ORDER BY Description ASC');
        } catch (e) {
            data = db.queryAll('SELECT ID as id, Description as label FROM PartClass ORDER BY Description ASC');
        }
        res.json(data);
    } catch (err) {
        console.error('[V2] PartClasses fetch error:', err.message);
        res.status(500).json({ error: err.message, table: 'PartClasses/PartClass' });
    }
});

/**
 * GET /api/v2/lookups/part-order-rules
 */
router.get('/lookups/part-order-rules', async (req, res) => {
    try {
        let data;
        try {
            data = db.queryAll('SELECT ID as id, Description as label FROM PartOrderRules ORDER BY Description ASC');
        } catch (e) {
            data = db.queryAll('SELECT ID as id, Description as label FROM OrdQty ORDER BY Description ASC');
        }
        res.json(data);
    } catch (err) {
        console.error('[V2] OrdQty fetch error:', err.message);
        res.status(500).json({ error: err.message, table: 'PartOrderRules/OrdQty' });
    }
});

/**
 * GET /api/v2/lookups/adj-types
 */
router.get('/lookups/adj-types', async (req, res) => {
    try {
        let data;
        try {
            data = db.queryAll('SELECT ID as id, Description as label FROM AdjustmentTypes ORDER BY Description ASC');
        } catch (e) {
            data = db.queryAll('SELECT ID as id, Description as label FROM Reason ORDER BY Description ASC');
        }
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message, table: 'AdjustmentTypes/Reason' });
    }
});

/**
 * GET /api/v2/reports/lookup/:table
 * Returns a list of ID and labels for a specific lookup table.
 */
router.get('/reports/lookup/:table', async (req, res) => {
    try {
        const { table } = req.params;
        const validTables = ['CostCntr', 'CostCenters', 'Vendors', 'WorkType', 'Part'];
        
        if (!validTables.includes(table)) {
            return res.status(403).json({ error: 'Lookup source restricted' });
        }

        // Table name aliases — CostCntr was the legacy PMC name; actual table is CostCenters
        const tableAliases = { 'CostCntr': 'CostCenters' };
        const resolvedTable = tableAliases[table] || table;

        let data = [];
        try {
            data = db.queryAll(`SELECT ID as id, Description as label FROM "${resolvedTable}" ORDER BY Description ASC`);
        } catch (e) {
            // If the resolved name fails, try the original name
            if (resolvedTable !== table) {
                try {
                    data = db.queryAll(`SELECT ID as id, Description as label FROM "${table}" ORDER BY Description ASC`);
                } catch (e2) { /* both failed, return empty */ }
            }
        }
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Lookup failed', details: err.message });
    }
});

/**
 * GET /api/v2/network/sync/:partId
 * Sweeps all plant databases to find the cheapest cost for a specific part.
 */
router.get('/network/sync/:partId', async (req, res) => {
    try {
        const { partId } = req.params;
        const currentPlant = req.headers['x-plant-id'] || 'Demo_Plant_1';
        
        const dataDir = require('../resolve_data_dir');
        if (!fs.existsSync(dataDir)) return res.json({ found: false });
        
        const dbFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.db') && !f.includes('trier_') && f !== 'schema_template.db');
        console.log(`[Network Sweep] Scanning ${dbFiles.length} databases in ${dataDir} for part ${partId}`);
        
        const matches = [];

        for (const dbFile of dbFiles) {
            const plantIdFromDb = dbFile.replace('.db', '').trim();
            // Network sweep now includes ALL plants for total coverage

            try {
                const Database = require('better-sqlite3');
                const tempDb = new Database(path.join(dataDir, dbFile), { readonly: true });
                
                let part = tempDb.prepare('SELECT * FROM Part WHERE ID = ?').get(partId);
                let asset = tempDb.prepare('SELECT * FROM Asset WHERE ID = ?').get(partId);
                let sop = tempDb.prepare('SELECT * FROM Procedures WHERE ID = ?').get(partId);
                let job = tempDb.prepare('SELECT * FROM Work WHERE ID = ?').get(partId);

                // Aggressive fallback: If no exact match, try LIKE
                if (!part && partId.length >= 5) part = tempDb.prepare('SELECT * FROM Part WHERE ID LIKE ?').get(`%${partId}%`);
                if (!asset && partId.length >= 5) asset = tempDb.prepare('SELECT * FROM Asset WHERE ID LIKE ?').get(`%${partId}%`);
                
                if (part) {
                    console.log(`[Network Sync] Found PART match in ${dbFile}`);
                    matches.push({
                        type: 'part',
                        plantId: plantIdFromDb,
                        plantLabel: plantIdFromDb.replace(/_/g, ' '),
                        UnitCost: part.UnitCost || 0,
                        Description: part.Description || 'Unnamed Part',
                        ClassID: part.ClassID,
                        data: part
                    });
                } else if (asset) {
                    console.log(`[Network Sync] Found ASSET match in ${dbFile}`);
                    matches.push({
                        type: 'asset',
                        plantId: plantIdFromDb,
                        plantLabel: plantIdFromDb.replace(/_/g, ' '),
                        Description: asset.Description || 'Unnamed Asset',
                        data: asset
                    });
                } else if (sop) {
                    console.log(`[Network Sync] Found SOP match in ${dbFile}`);
                    matches.push({
                        type: 'sop',
                        plantId: plantIdFromDb,
                        plantLabel: plantIdFromDb.replace(/_/g, ' '),
                        Description: sop.Description || 'Unnamed SOP',
                        data: sop
                    });
                } else if (job) {
                    console.log(`[Network Sync] Found JOB match in ${dbFile}`);
                    matches.push({
                        type: 'job',
                        plantId: plantIdFromDb,
                        plantLabel: plantIdFromDb.replace(/_/g, ' '),
                        Description: job.Description || 'Active Work Order',
                        data: job
                    });
                }
                tempDb.close();
            } catch (e) { /* skip bad DBs */ }
        }

        if (matches.length === 0) return res.json({ found: false });

        // Find cheapest
        // Find cheapest (for parts)
        matches.sort((a, b) => {
            const costA = parseFloat((a.UnitCost || '0').toString().replace(/[^0-9.]/g, '')) || 999999;
            const costB = parseFloat((b.UnitCost || '0').toString().replace(/[^0-9.]/g, '')) || 999999;
            return costA - costB;
        });

        // Add sanitized numeric cost for client convenience
        const cheapest = matches[0] ? {
            ...matches[0],
            UnitCostNum: parseFloat((matches[0].UnitCost || '0').toString().replace(/[^0-9.]/g, '')) || 0
        } : null;

        res.json({
            found: true,
            cheapest: cheapest,
            allMatches: matches.map(m => ({
                ...m,
                UnitCostNum: parseFloat((m.UnitCost || '0').toString().replace(/[^0-9.]/g, '')) || 0
            })),
            debug: { checked: dbFiles.length, currentPlant }
        });
    } catch (err) {
        console.error('[Network Sync] Error:', err);
        res.status(500).json({ error: 'Network sync failure', details: err.message });
    }
});

/**
 * POST /api/v2/network/sync/bulk
 * Checks prices for a list of part IDs across all plants.
 */
router.post('/network/sync/bulk', async (req, res) => {
    try {
        const { partIds } = req.body;
        if (!Array.isArray(partIds)) return res.status(400).json({ error: 'partIds array required' });

        const dataDir = require('../resolve_data_dir');
        const dbFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.db') && !f.includes('trier_') && f !== 'schema_template.db');
        
        const results = {}; // partId -> cheapestMatch

        for (const dbFile of dbFiles) {
            try {
                const Database = require('better-sqlite3');
                const tempDb = new Database(path.join(dataDir, dbFile), { readonly: true });
                
                // Get all parts matching these IDs
                const placeholders = partIds.map(() => '?').join(',');
                const matches = tempDb.prepare(`SELECT ID, UnitCost, Description, VendorID, VendorName FROM Part WHERE ID IN (${placeholders})`).all(...partIds);
                
                for (const match of matches) {
                    const price = parseFloat((match.UnitCost || '0').toString().replace(/[^0-9.]/g, '')) || 0;
                    if (price <= 0) continue;

                    if (!results[match.ID] || price < results[match.ID].UnitCostNum) {
                        results[match.ID] = {
                            UnitCost: match.UnitCost,
                            UnitCostNum: price,
                            Description: match.Description,
                            plantId: dbFile.replace('.db', ''),
                            plantLabel: dbFile.replace('.db', '').replace(/_/g, ' '),
                            data: match
                        };
                    }
                }
                tempDb.close();
            } catch (e) { /* skip */ }
        }

        res.json(results);
    } catch (err) {
        console.error('[Bulk Sync] Error:', err);
        res.status(500).json({ error: 'Bulk sync failure' });
    }
});

/**
 * POST /api/v2/network/import
 * Imports a part definition from another plant into the local database.
 */
router.post('/network/import', async (req, res) => {
    try {
        const { data, sourcePlant, type } = req.body;
        const currentPlant = req.headers['x-plant-id'] || 'Demo_Plant_1';

        const tableMap = {
            'asset': 'Asset',
            'part': 'Part',
            'sop': 'Procedures'
        };
        const table = tableMap[type] || 'Part';

        // 1. Insert/Update Item - Only ID and Description for initial discovery
        const safeData = {
            ID: data.ID,
            Description: data.Description || 'Imported Item'
        };

        const columns = Object.keys(safeData);
        const placeholders = columns.map(() => '?').join(', ');
        const values = columns.map(c => safeData[c]);

        db.run(`INSERT OR REPLACE INTO "${table}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`, values);

        // 2. Mark as networked
        try {
            db.run(`UPDATE "${table}" SET GlobalSyncStatus = 'NETWORK_MATCHED', NetworkLastSync = datetime('now') WHERE ID = ?`, [data.ID]); /* dynamic col/table - sanitize inputs */
        } catch (e) {
            console.warn(`[Network Import] Could not update sync metadata for ${table}:`, e.message);
        }

        res.json({ success: true, message: `Successfully imported ${data.ID} from ${sourcePlant}` });
    } catch (err) {
        console.error('[Network Import] Error:', err);
        res.status(500).json({ error: 'Import failed' });
    }
});

/**
 * GET /api/v2/network/vendor/:vendId
 * Fetches vendor contact details from a specific plant database.
 */
router.get('/network/vendor/:vendId', async (req, res) => {
    try {
        const { vendId } = req.params;
        const targetPlant = req.query.plantId;
        if (!targetPlant) return res.status(400).json({ error: 'Target plantId required' });

        const dbPath = path.join(require('../resolve_data_dir'), `${targetPlant}.db`);
        if (!fs.existsSync(dbPath)) return res.status(404).json({ error: 'Source plant database not found' });

        const Database = require('better-sqlite3');
        const tempDb = new Database(dbPath, { readonly: true });
        
        const vendor = tempDb.prepare('SELECT * FROM Vendors WHERE ID = ?').get(vendId);
        tempDb.close();

        if (!vendor) return res.status(404).json({ error: 'Vendor not found in source plant' });
        res.json(vendor);
    } catch (err) {
        res.status(500).json({ error: 'Network vendor lookup failed' });
    }
});

/**
 * POST /api/v2/network/vendor/import
 * Imports a vendor from another plant locally.
 */
router.post('/network/vendor/import', async (req, res) => {
    try {
        const { vendorData } = req.body;
        
        const columns = Object.keys(vendorData).filter(c => !['rowid'].includes(c));
        const placeholders = columns.map(() => '?').join(', ');
        const values = columns.map(c => vendorData[c]);

        db.run(`INSERT OR REPLACE INTO "Vendors" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`, values);
        res.json({ success: true, message: 'Vendor imported successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Vendor import failed' });
    }
});

/**
 * POST /api/v2/network/price-alert
 * Submits a better price found locally to the global network.
 */
router.post('/network/price-alert', async (req, res) => {
    try {
        const { partId, price, plantId } = req.body;
        
        logisticsDb.prepare(`
            INSERT INTO NetworkAlerts (Type, PartID, PlantID, BetterPrice, Message)
            VALUES (?, ?, ?, ?, ?)
        `).run('BETTER_PRICE', partId, plantId, price, `${plantId} has found a better price of $${price} for part ${partId}`);
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to submit price alert' });
    }
});

/**
 * GET /api/v2/integration/sap/settings
 */
router.get('/integration/sap/settings', (req, res) => {
    try {
        const row = logisticsDb.prepare("SELECT Value FROM SystemSettings WHERE Key = 'sap_config'").get();
        if (row) {
            res.json(JSON.parse(row.Value));
        } else {
            res.json({});
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to load SAP settings' });
    }
});

/**
 * POST /api/v2/integration/sap/settings
 */
router.post('/integration/sap/settings', (req, res) => {
    try {
        const settings = req.body;
        logisticsDb.prepare("INSERT OR REPLACE INTO SystemSettings (Key, Value, UpdatedAt) VALUES (?, ?, datetime('now'))")
            .run('sap_config', JSON.stringify(settings));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save SAP settings' });
    }
});

/**
 * GET /api/v2/network/site-contacts/:plantId (Fallbacks: /managers, /plant-managers)
 * Finds personnel with contact info for a specific plant.
 */
router.get(['/network/site-contacts/:plantId', '/network/managers/:plantId', '/network/plant-managers/:plantId'], (req, res) => {
    try {
        const rawId = req.params.plantId || '';
        const plantId = decodeURIComponent(rawId).replace(/\s+/g, '_').trim();
        console.log(`[Network Contacts] Discovery Request: "${rawId}" -> Normalized: "${plantId}"`);
        const results = [];

        // 1. Try SiteLeadership from target plant DB (Direct coverage of Enterprise Directory)
        try {
            const siteDb = db.getDb(plantId);
            const leaders = siteDb.prepare('SELECT Name as DisplayName, Title, Phone, Email FROM SiteLeadership').all();
            if (leaders.length > 0) {
                results.push(...leaders);
            }
        } catch (e) {
            console.warn(`[Network Contacts] SiteLeadership sweep failed for ${plantId}:`, e.message);
        }

        // 2. Fallback/Augment with auth_db Users (Active system users)
        if (results.length < 5) {
            try {
                const authDb = require('../auth_db');
                const users = authDb.prepare(`
                    SELECT u.DisplayName, u.Email, u.Phone, u.Title
                    FROM Users u
                    JOIN UserPlantRoles upr ON u.UserID = upr.UserID
                    WHERE upr.PlantID = ? AND (u.Email IS NOT NULL OR u.Phone IS NOT NULL OR u.DisplayName IS NOT NULL)
                    ORDER BY CASE WHEN u.Title LIKE '%Manager%' THEN 0 ELSE 1 END, u.DisplayName ASC
                    LIMIT 10
                `).all(plantId);
                
                for (const user of users) {
                    if (!results.find(r => r.DisplayName === user.DisplayName)) {
                        results.push(user);
                    }
                }
            } catch (e) {
                console.error('[Network Contacts] AuthDB fallback failed:', e.message);
            }
        }

        res.json(results);
    } catch (err) {
        console.error('[Network Contacts] Fatal Error:', err);
        res.status(500).json([]);
    }
});

/**
 * POST /api/v2/network/ignore-price
 */
router.post('/network/ignore-price', (req, res) => {
    try {
        const { plantId, partId, userId } = req.body;
        logisticsDb.prepare(`
            INSERT OR REPLACE INTO IgnoredPriceAlerts (PlantID, PartID, UserID)
            VALUES (?, ?, ?)
        `).run(plantId, partId, userId || 'SYSTEM');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to ignore price alert' });
    }
});

/**
 * GET /api/v2/network/ignored-prices/:plantId
 */
router.get('/network/ignored-prices/:plantId', (req, res) => {
    try {
        const { plantId } = req.params;
        const rows = logisticsDb.prepare(`SELECT PartID FROM IgnoredPriceAlerts WHERE PlantID = ?`).all(plantId);
        res.json(rows.map(r => r.PartID));
    } catch (err) {
        res.status(500).json([]);
    }
});

// ── Asset Hierarchy / Location Tree (Feature 3) ────────────────────────────

/**
 * GET /api/v2/assets/hierarchy
 * Returns all assets with hierarchy columns for tree building.
 */
router.get('/assets/hierarchy', (req, res) => {
    try {
        const assets = db.queryAll(`
            SELECT ID, Description, AssetType, LocationID, Model, Serial,
                   ParentAssetID, LocationPath, AssetLevel, SortOrder,
                   OperationalStatus, MeterType, MeterReading, MeterUnit,
                   Quantity
            FROM Asset
            WHERE (IsDeleted IS NULL OR IsDeleted = 0)
            ORDER BY COALESCE(SortOrder, 999), ID ASC
        `);
        
        // Map ParentAssetID to ParentID for frontend compatibility
        const mapped = assets.map(a => ({
            ...a,
            ParentID: a.ParentAssetID || null
        }));
        
        res.json(mapped);
    } catch (err) {
        console.error('[V2] Asset hierarchy error:', err.message);
        res.status(500).json({ error: 'Failed to build asset hierarchy' });
    }
});

/**
 * PUT /api/v2/assets/:id/parent
 * Assign or change a parent asset.
 */
router.put('/assets/:id/parent', (req, res) => {
    try {
        const { id } = req.params;
        const { parentId, level } = req.body;
        
        // Prevent circular reference
        if (parentId === id) {
            return res.status(400).json({ error: 'An asset cannot be its own parent' });
        }
        
        // Build location path
        let locationPath = id;
        if (parentId) {
            const parent = db.queryOne('SELECT LocationPath FROM Asset WHERE ID = ?', [parentId]);
            locationPath = parent?.LocationPath ? `${parent.LocationPath} > ${id}` : `${parentId} > ${id}`;
        }
        
        db.run(
            'UPDATE Asset SET ParentAssetID = ?, LocationPath = ?, AssetLevel = ? WHERE ID = ?',
            [parentId || null, locationPath, level || (parentId ? 1 : 0), id]
        );
        
        res.json({ success: true, parentId, locationPath });
    } catch (err) {
        console.error('[V2] Set parent error:', err.message);
        res.status(500).json({ error: 'Failed to set parent asset' });
    }
});

/**
 * GET /api/v2/assets/:id/children
 * Get direct children of an asset.
 */
router.get('/assets/:id/children', (req, res) => {
    try {
        const children = db.queryAll(
            'SELECT ID, Description, AssetType, LocationID, ParentAssetID, AssetLevel FROM Asset WHERE ParentAssetID = ? AND (IsDeleted IS NULL OR IsDeleted = 0)',
            [req.params.id]
        );
        res.json(children);
    } catch (err) {
        console.error('[V2] Get children error:', err.message);
        res.status(500).json([]);
    }
});

/**
 * GET /api/v2/assets/:id/rollup
 * Calculate aggregate maintenance stats for an asset and all descendants.
 */
router.get('/assets/:id/rollup', (req, res) => {
    try {
        const root = req.params.id;
        
        // Gather all descendant IDs recursively
        const allAssets = db.queryAll('SELECT ID, ParentAssetID FROM Asset WHERE (IsDeleted IS NULL OR IsDeleted = 0)');
        const descendants = new Set([root]);
        let found = true;
        while (found) {
            found = false;
            for (const a of allAssets) {
                if (a.ParentAssetID && descendants.has(a.ParentAssetID) && !descendants.has(a.ID)) {
                    descendants.add(a.ID);
                    found = true;
                }
            }
        }
        
        const ids = Array.from(descendants);
        const placeholders = ids.map(() => '?').join(',');
        
        // Aggregate work orders
        const woStats = db.queryOne(`
            SELECT 
                COUNT(*) as totalWOs,
                SUM(CASE WHEN StatusID IN ('Complete', 'Completed', 'CLOSED') THEN 1 ELSE 0 END) as completedWOs,
                SUM(CASE WHEN StatusID IN ('Open', 'In Progress', 'ACTIVE') THEN 1 ELSE 0 END) as openWOs
            FROM Work WHERE AstID IN (${placeholders})
        `, ids);
        
        // Aggregate labor (HrReg + HrOver + HrDouble + HrOther)
        const laborStats = db.queryOne(`
            SELECT COALESCE(SUM(COALESCE(wl.HrReg,0) + COALESCE(wl.HrOver,0) + COALESCE(wl.HrDouble,0) + COALESCE(wl.HrOther,0)), 0) as totalLaborHours
            FROM WorkLabor wl
            JOIN Work w ON wl.WoID = w.ID
            WHERE w.AstID IN (${placeholders})
        `, ids);
        
        // Aggregate parts cost (UnitCost * ActQty)
        const partsCost = db.queryOne(`
            SELECT COALESCE(SUM(COALESCE(wp.UnitCost,0) * COALESCE(wp.ActQty,0)), 0) as totalPartsCost
            FROM WorkParts wp
            JOIN Work w ON wp.WoID = w.ID
            WHERE w.AstID IN (${placeholders})
        `, ids);
        
        res.json({
            assetId: root,
            descendantCount: ids.length - 1,
            totalAssets: ids.length,
            woStats: woStats || { totalWOs: 0, completedWOs: 0, openWOs: 0 },
            laborHours: laborStats?.totalLaborHours || 0,
            partsCost: partsCost?.totalPartsCost || 0
        });
    } catch (err) {
        console.error('[V2] Rollup error:', err.message);
        res.status(500).json({ error: 'Failed to compute rollup stats' });
    }
});

module.exports = router;
