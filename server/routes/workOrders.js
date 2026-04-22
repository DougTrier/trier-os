// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Work Orders Routes
 * ========================================
 * REST API for Work Order (WO) CRUD -- the core Enterprise System module. All routes
 * are mounted at /api/work-orders in server/index.js.
 *
 * ENDPOINTS:
 *   GET    /              List WOs with pagination, filtering, and search
 *   GET    /stats         Dashboard statistics (status counts, recent WOs)
 *   GET    /workforce-analytics  Expected vs Actual hours, tech benchmarks
 *   GET    /next-id       Auto-increment next WO ID
 *   GET    /:id           Single WO with parts, labor, tasks, and misc costs
 *   POST   /              Create a new WO (triggers webhook for Critical/Emergency)
 *   PUT    /:id           Update WO (maps GPS lat/lng to Start or Complete columns)
 *   DELETE /:id           Delete WO (blocked for completed WOs -- they are metrics)
 *
 * ALL-SITES PATTERN: When x-plant-id === 'all_sites', the GET / and GET /stats
 * endpoints iterate over plants.json and query each plant DB sequentially,
 * then merge, sort, and paginate the combined result in Node.js memory.
 * This is synchronous by design (better-sqlite3 is blocking) and safe for
 * up to ~50 plants. For 100+ plants, consider a parallel Promise pool.
 *
 * GPS LOGGING: PUT /:id maps the optional _gpsLat/_gpsLng fields from the
 * frontend to either StartLat/StartLng or CompleteLat/CompleteLng based on
 * the StatusID being applied. This builds a geo-trail of where WOs were
 * started and completed on the plant floor, feeding the floor plan heatmap.
 *
 * WEBHOOK: POST / fires a CRITICAL_WO_CREATED event via req.app.get('dispatchEvent')
 * for Priority 1/2/Critical/Emergency WOs. The webhook engine (registered in
 * server/index.js) forwards these to configured endpoints without blocking the response.
 */


const express = require('express');
const router = express.Router();
const db = require('../database');
const { whitelist, validateSort } = require('../validators');
const { insertOutboxEvent } = require('../services/erp-outbox');
const { logAudit } = require('../logistics_db');

// ── GET /api/work-orders ─────────────────────────────────────────────────
// List work orders with pagination, filtering, search
router.get('/', (req, res) => {
    try {
        let {
            page = 1,
            limit = 50,
            sort = 'WorkOrderNumber',
            order = 'DESC',
            search = '',
            status = '',
            asset = '',
            priority = '',
            type = '',
            startDate = '',
            endDate = '',
            user = '',
        } = req.query;

        page = Math.max(1, parseInt(page) || 1);
        limit = parseInt(limit) || 50;
        
        // Security: Sanitize sort column
        sort = validateSort(sort, 'work', 'WorkOrderNumber');
        const safeOrder = order === 'DESC' ? 'DESC' : 'ASC';

        let where = [];
        let params = [];

        if (search) {
            where.push(`(w."WorkOrderNumber" LIKE ? OR w."Description" LIKE ? OR w."AstID" LIKE ?)`);
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (status) {
            where.push(`w."StatusID" = ?`);
            params.push(status);
        }

        if (asset) {
            where.push(`w."AstID" LIKE ?`);
            params.push(`%${asset}%`);
        }

        if (priority) {
            where.push(`w."Priority" = ?`);
            params.push(priority);
        }

        if (type) {
            where.push(`w."TypeID" = ?`);
            params.push(type);
        }

        if (startDate && endDate) {
            where.push(`w."AddDate" >= ? AND w."AddDate" <= ?`);
            params.push(startDate, endDate);
        } else if (startDate) {
            where.push(`w."AddDate" >= ?`);
            params.push(startDate);
        } else if (endDate) {
            where.push(`w."AddDate" <= ?`);
            params.push(endDate);
        }

        if (user) {
            where.push(`w."AssignToID" = ?`);
            params.push(user);
        }

        const sql = `
            SELECT 
                w.rowid as ID_INTERNAL,
                w.*, 
                s.Description as StatusLabel
            FROM Work w
            LEFT JOIN WorkStatuses s ON w.StatusID = s.ID
            ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
            ORDER BY w."${sort}" ${safeOrder}
            LIMIT ? OFFSET ?
        `;

        const countSql = `
            SELECT COUNT(*) as total 
            FROM Work w
            ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        `;

        if (req.headers['x-plant-id'] === 'all_sites') {
            const path = require('path');
            const fs = require('fs');
            const dataDir = require('../resolve_data_dir');
            const plantsFile = path.join(dataDir, 'plants.json');
            const plants = JSON.parse(fs.readFileSync(plantsFile, 'utf8'));

            let allOrders = [];

            plants.forEach(p => {
                const dbPath = path.join(dataDir, `${p.id}.db`);
                if (fs.existsSync(dbPath)) {
                    try {
                        const tempDb = db.getDb(p.id);
                        const hasTbl = tempDb.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='Work'`).get();
                        if (hasTbl) {
                            let sql = `
                                SELECT 
                                    w.rowid as ID_INTERNAL,
                                    w.*, 
                                    s.Description as StatusLabel,
                                    ? as plantId,
                                    ? as plantLabel
                                FROM Work w
                                LEFT JOIN WorkStatuses s ON w.StatusID = s.ID
                            `;
                            let sqlParams = [p.id, p.label];
                            if (where.length) {
                                sql += ' WHERE ' + where.join(' AND ');
                                sqlParams = [...sqlParams, ...params];
                            }
                            
                            const siteOrders = tempDb.prepare(sql).all(...sqlParams);
                            allOrders.push(...siteOrders);
                        }
                    } catch (e) { console.warn(`[WorkOrders] Skipping plant ${p.id}: ${e.message}`); }
                }
            });

            // Aggregate sorting and pagination
            allOrders.sort((a, b) => {
                const valA = a[sort] || '';
                const valB = b[sort] || '';
                return safeOrder === 'DESC' ? (valB > valA ? 1 : -1) : (valA > valB ? 1 : -1);
            });

            const total = allOrders.length;
            const start = (parseInt(page) - 1) * parseInt(limit);
            const paginated = allOrders.slice(start, start + parseInt(limit));

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

        const countResult = db.queryOne(countSql, params);
        const total = countResult ? countResult.total : 0;
        
        const offset = Math.max(0, (parseInt(page) - 1) * parseInt(limit));
        const data = db.queryAll(sql, [...params, parseInt(limit), offset]);

        res.json({
            data: data || [],
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / (parseInt(limit) || 50)),
            }
        });
    } catch (err) {
        console.error('GET /api/work-orders error:', err);
        res.status(500).json({ error: 'Failed to fetch work orders' });
    }
});

// ── GET /api/work-orders/stats ───────────────────────────────────────────
// Dashboard statistics for work orders
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

            let totalCount = 0;
            const statusMap = {};
            const priorityMap = {};
            const allRecent = [];

            plants.forEach(p => {
                const dbPath = path.join(dataDir, `${p.id}.db`);
                if (!fs.existsSync(dbPath)) return;
                try {
                    const tempDb = new Database(dbPath, { readonly: true });
                    const hasTbl = tempDb.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='Work'`).get();
                    if (hasTbl) {
                        totalCount += tempDb.prepare('SELECT COUNT(*) as count FROM Work').get().count || 0;

                        tempDb.prepare('SELECT StatusID as Status, COUNT(*) as count FROM Work GROUP BY StatusID').all()
                            .forEach(s => { statusMap[s.Status] = (statusMap[s.Status] || 0) + s.count; });

                        tempDb.prepare('SELECT Priority, COUNT(*) as count FROM Work WHERE Priority IS NOT NULL AND Priority != "" GROUP BY Priority').all()
                            .forEach(pr => { priorityMap[pr.Priority] = (priorityMap[pr.Priority] || 0) + pr.count; });

                        const recent = tempDb.prepare(
                            'SELECT WorkOrderNumber as WONum, Description as Descr, StatusID as Status, AstID as AssetID, Priority, AddDate as DateReq FROM Work ORDER BY ID DESC LIMIT 10'
                        ).all();
                        recent.forEach(r => { r.plantId = p.id; r.plantLabel = p.label; });
                        allRecent.push(...recent);
                    }
                    tempDb.close();
                } catch (e) { console.warn(`[WO/stats] Skipping ${p.id}: ${e.message}`); }
            });

            const byStatus = Object.entries(statusMap).map(([Status, count]) => ({ Status, count })).sort((a, b) => b.count - a.count);
            const byPriority = Object.entries(priorityMap).map(([Priority, count]) => ({ Priority, count })).sort((a, b) => b.count - a.count);
            allRecent.sort((a, b) => (b.DateReq || '').localeCompare(a.DateReq || ''));

            return res.json({ total: totalCount, byStatus, byPriority, recent: allRecent.slice(0, 30) });
        }

        // ── Single Plant: Auto-resolved via AsyncLocalStorage middleware ──
        const total = db.queryOne('SELECT COUNT(*) as count FROM Work');

        // Count by status
        const byStatus = db.queryAll(
            'SELECT StatusID as Status, COUNT(*) as count FROM Work GROUP BY StatusID ORDER BY count DESC'
        ) || [];

        // Count by priority  
        const byPriority = db.queryAll(
            "SELECT Priority, COUNT(*) as count FROM Work WHERE Priority IS NOT NULL AND Priority != '' GROUP BY Priority ORDER BY count DESC"
        ) || [];

        // Recent work orders (last 30)
        let recent = [];
        try {
            recent = db.queryAll(
                'SELECT WorkOrderNumber as WONum, Description as Descr, StatusID as Status, AstID as AssetID, Priority, AddDate as DateReq FROM Work ORDER BY ID DESC LIMIT 30'
            ) || [];
        } catch (recentErr) {
            // Fallback for DBs without WorkOrderNumber column
            try {
                recent = db.queryAll('SELECT ID as WONum, Description as Descr, StatusID as Status FROM Work ORDER BY ID DESC LIMIT 30') || [];
            } catch (e2) { /* ignore */ }
        }

        res.json({
            total: total?.count || 0,
            byStatus,
            byPriority,
            recent,
        });
    } catch (err) {
        console.error('GET /api/work-orders/stats error:', err.message, err.stack);
        res.status(500).json({ error: 'Failed to fetch work order stats' });
    }
});

// ── GET /api/work-orders/workforce-analytics ─────────────────────────────
// Enterprise analytics: Expected vs Actual, Technician benchmarks, SOP effectiveness
router.get('/workforce-analytics', (req, res) => {
    try {
        const activePlant = req.headers['x-plant-id'] || 'Demo_Plant_1';
        const path = require('path');
        const fs = require('fs');
        const Database = require('better-sqlite3');
        const dataDir = require('../resolve_data_dir');

        const plantsFile = path.join(dataDir, 'plants.json');
        const plants = JSON.parse(fs.readFileSync(plantsFile, 'utf8'));
        const targetPlants = activePlant === 'all_sites'
            ? plants
            : plants.filter(p => p.id === activePlant);

        // Collect raw data from all target plants
        const allWOs = [];

        targetPlants.forEach(p => {
            const dbPath = path.join(dataDir, `${p.id}.db`);
            if (!fs.existsSync(dbPath)) return;
            try {
                const tempDb = new Database(dbPath, { readonly: true });
                const has = tempDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='Work'").get();
                if (!has) { tempDb.close(); return; }

                // Check if ActualHours column exists
                const cols = tempDb.prepare("PRAGMA table_info(Work)").all();
                const hasActualHours = cols.some(c => c.name === 'ActualHours');

                const sql = hasActualHours
                    ? "SELECT Description, TypeID, StatusID, AddDate, StartDate, CompDate, AssignToID, ProcID, ExpectedDuration, ActualHours, Priority FROM Work"
                    : "SELECT Description, TypeID, StatusID, AddDate, StartDate, CompDate, AssignToID, ProcID, ExpectedDuration, NULL as ActualHours, Priority FROM Work";

                const wos = tempDb.prepare(sql).all();
                wos.forEach(wo => {
                    wo.plantId = p.id;
                    wo.plantLabel = p.label;
                    allWOs.push(wo);
                });

                tempDb.close();
            } catch(e) { console.warn(`[WorkforceAnalytics] Skipping ${p.id}: ${e.message}`); }
        });

        // ── Analyze ──

        // 1. Technician Performance
        const techMap = {};
        allWOs.forEach(wo => {
            const tech = wo.AssignToID || 'Unassigned';
            if (!techMap[tech]) {
                techMap[tech] = { name: tech, completedWOs: 0, totalExpected: 0, totalActual: 0, onTime: 0, overTime: 0, plants: new Set(), sopCount: 0, totalWOs: 0 };
            }
            techMap[tech].totalWOs++;
            techMap[tech].plants.add(wo.plantLabel);

            if (wo.CompDate && wo.ExpectedDuration && wo.ActualHours) {
                const expected = parseFloat(wo.ExpectedDuration) || 0;
                const actual = wo.ActualHours || 0;
                if (expected > 0 && actual > 0) {
                    techMap[tech].completedWOs++;
                    techMap[tech].totalExpected += expected;
                    techMap[tech].totalActual += actual;
                    if (actual <= expected * 1.1) techMap[tech].onTime++;
                    else techMap[tech].overTime++;
                }
            }
            if (wo.ProcID) techMap[tech].sopCount++;
        });

        const techPerformance = Object.values(techMap)
            .filter(t => t.completedWOs >= 2)
            .map(t => ({
                name: t.name,
                completedWOs: t.completedWOs,
                totalWOs: t.totalWOs,
                avgExpected: Math.round((t.totalExpected / t.completedWOs) * 100) / 100,
                avgActual: Math.round((t.totalActual / t.completedWOs) * 100) / 100,
                efficiency: Math.round((t.totalExpected / t.totalActual) * 100),
                onTimeRate: Math.round((t.onTime / t.completedWOs) * 100),
                sopUsageRate: Math.round((t.sopCount / t.totalWOs) * 100),
                plants: [...t.plants],
            }))
            .sort((a, b) => b.efficiency - a.efficiency);

        // 2. Plant Performance
        const plantMap = {};
        allWOs.forEach(wo => {
            const plant = wo.plantLabel;
            if (!plantMap[plant]) {
                plantMap[plant] = { name: plant, plantId: wo.plantId, completedWOs: 0, totalExpected: 0, totalActual: 0, sopLinked: 0, totalWOs: 0, techCount: new Set() };
            }
            plantMap[plant].totalWOs++;
            plantMap[plant].techCount.add(wo.AssignToID);
            if (wo.ProcID) plantMap[plant].sopLinked++;

            if (wo.CompDate && wo.ExpectedDuration && wo.ActualHours) {
                const expected = parseFloat(wo.ExpectedDuration) || 0;
                const actual = wo.ActualHours || 0;
                if (expected > 0 && actual > 0) {
                    plantMap[plant].completedWOs++;
                    plantMap[plant].totalExpected += expected;
                    plantMap[plant].totalActual += actual;
                }
            }
        });

        const plantPerformance = Object.values(plantMap)
            .filter(p => p.completedWOs >= 2)
            .map(p => ({
                name: p.name,
                plantId: p.plantId,
                completedWOs: p.completedWOs,
                totalWOs: p.totalWOs,
                avgExpected: Math.round((p.totalExpected / p.completedWOs) * 100) / 100,
                avgActual: Math.round((p.totalActual / p.completedWOs) * 100) / 100,
                efficiency: Math.round((p.totalExpected / p.totalActual) * 100),
                sopCoverage: Math.round((p.sopLinked / p.totalWOs) * 100),
                techCount: p.techCount.size,
            }))
            .sort((a, b) => b.efficiency - a.efficiency);

        // 3. SOP Effectiveness — Which procedures correlate with faster completion?
        const sopMap = {};
        allWOs.forEach(wo => {
            if (!wo.ProcID || !wo.CompDate || !wo.ActualHours || !wo.ExpectedDuration) return;
            const expected = parseFloat(wo.ExpectedDuration) || 0;
            const actual = wo.ActualHours || 0;
            if (expected <= 0 || actual <= 0) return;

            if (!sopMap[wo.ProcID]) {
                sopMap[wo.ProcID] = { procId: wo.ProcID, count: 0, totalExpected: 0, totalActual: 0, plants: new Set(), techs: new Set() };
            }
            sopMap[wo.ProcID].count++;
            sopMap[wo.ProcID].totalExpected += expected;
            sopMap[wo.ProcID].totalActual += actual;
            sopMap[wo.ProcID].plants.add(wo.plantLabel);
            sopMap[wo.ProcID].techs.add(wo.AssignToID);
        });

        const sopEffectiveness = Object.values(sopMap)
            .filter(s => s.count >= 2)
            .map(s => ({
                procId: s.procId,
                timesUsed: s.count,
                avgExpected: Math.round((s.totalExpected / s.count) * 100) / 100,
                avgActual: Math.round((s.totalActual / s.count) * 100) / 100,
                efficiency: Math.round((s.totalExpected / s.totalActual) * 100),
                plantCount: s.plants.size,
                techCount: s.techs.size,
            }))
            .sort((a, b) => b.efficiency - a.efficiency);

        // 4. Summary stats
        const completedWOs = allWOs.filter(w => w.CompDate && w.ActualHours && w.ExpectedDuration);
        const totalExpected = completedWOs.reduce((s, w) => s + (parseFloat(w.ExpectedDuration) || 0), 0);
        const totalActual = completedWOs.reduce((s, w) => s + (w.ActualHours || 0), 0);

        res.json({
            summary: {
                totalWOs: allWOs.length,
                completedWOs: completedWOs.length,
                totalExpectedHours: Math.round(totalExpected * 100) / 100,
                totalActualHours: Math.round(totalActual * 100) / 100,
                overallEfficiency: totalActual > 0 ? Math.round((totalExpected / totalActual) * 100) : 0,
                avgTimeSaved: totalActual > 0 ? Math.round((totalExpected - totalActual) * 100) / 100 : 0,
                plantsAnalyzed: targetPlants.length,
            },
            techPerformance,
            plantPerformance,
            sopEffectiveness,
        });
    } catch (err) {
        console.error('Workforce analytics error:', err.message);
        res.status(500).json({ error: 'Failed to compute workforce analytics' });
    }
});

// ── GET /api/work-orders/next-id ─────────────────────────────────────────
router.get('/next-id', (req, res) => {
    try {
        const row = db.queryOne('SELECT MAX(CAST(ID AS INTEGER)) as maxID FROM Work');
        const nextID = (row.maxID || 0) + 1;
        res.json({ nextID });
    } catch (err) {
        console.error('GET /api/work-orders/next-id error:', err);
        res.status(500).json({ error: 'Failed to fetch next ID' });
    }
});

// ── GET /api/work-orders/:id ─────────────────────────────────────────────
// Get a single work order with related data
router.get('/:id', (req, res) => {
    try {
        const id = req.params.id;
        // Try searching by ID column first, then internal rowid
        let wo = db.queryOne('SELECT rowid as ID_INTERNAL, * FROM Work WHERE ID = ?', [id]);
        if (!wo) {
            wo = db.queryOne('SELECT rowid as ID_INTERNAL, * FROM Work WHERE rowid = ?', [id]);
        }

        if (!wo) {
            return res.status(404).json({ error: 'Work order not found' });
        }

        // Get related parts used with descriptions - USE ID_INTERNAL (rowid) for joined tables
        const parts = db.queryAll(`
            SELECT wp.*, p.Description as PartDesc,
              (SELECT pv.ManufNum FROM PartVendors pv
               WHERE pv.PartID = wp.PartID AND pv.ManufNum IS NOT NULL AND pv.ManufNum != ''
               LIMIT 1) as ManufNum
            FROM WorkParts wp
            LEFT JOIN Part p ON p.ID = wp.PartID
            WHERE wp.WoID = ?
        `, [wo.ID_INTERNAL]);

        // Get related tasks
        let tasks = [];
        try {
            tasks = db.queryAll('SELECT * FROM Task WHERE ID IN (SELECT TaskID FROM WorkTask WHERE WoID = ?)', [wo.ID_INTERNAL]);
        } catch (e) {
            console.error('Task fetch error:', e);
        }

        let labor = [];
        try {
            labor = db.queryAll(`
                SELECT wl.*, v.Description as LaborName 
                FROM WorkLabor wl
                LEFT JOIN Vendors v ON wl.LaborID = v.ID
                WHERE wl.WoID = ?
            `, [wo.ID_INTERNAL]);
        } catch (e) { console.warn(`[WorkOrders] Labor query failed for WO ${id}: ${e.message}`); }

        let misc = [];
        try {
            misc = db.queryAll('SELECT * FROM WorkMisc WHERE WoID = ?', [wo.ID_INTERNAL]);
        } catch (e) { console.warn(`[WorkOrders] Misc costs query failed for WO ${id}: ${e.message}`); }

        res.json({ ...wo, _parts: parts, _tasks: tasks, _labor: labor, _misc: misc });
    } catch (err) {
        console.error('GET /api/work-orders/:id error:', err);
        res.status(500).json({ error: 'Failed to fetch work order' });
    }
});
// ── POST /api/work-orders ────────────────────────────────────────────────
// Create a new work order
router.post('/', (req, res) => {
    try {
        const fields = whitelist(req.body, 'work');
        
        // Auto-inject current authenticated user for tracking
        if (req.user && req.user.Username) {
            fields.UserID = req.user.Username;
        }

        if (Object.keys(fields).length === 0) {
            return res.status(400).json({ error: 'No valid fields provided for creation.' });
        }

        const columns = Object.keys(fields);
        const placeholders = columns.map(() => '?').join(', ');
        const values = Object.values(fields);
        const colStr = columns.map(c => `"${c}"`).join(', ');

        const result = db.run(
            `INSERT INTO "Work" (${colStr}) VALUES (${placeholders})`,
            values
        );

        // ── Webhook: Notify on Critical/Emergency WO Creation ──
        const priority = String(fields.Priority || '').toLowerCase();
        if (priority === '1' || priority === '2' || priority === 'critical' || priority === 'emergency') {
            try {
                const dispatchEvent = req.app.get('dispatchEvent');
                if (dispatchEvent) {
                    dispatchEvent('CRITICAL_WO_CREATED', {
                        woNumber: fields.WorkOrderNumber || String(result.lastInsertRowid),
                        description: fields.Description || 'New Critical Work Order',
                        assetId: fields.AstID || '',
                        priority: fields.Priority || '1',
                        plant: req.headers['x-plant-id'] || '',
                        assignedTo: fields.UserID || ''
                    });
                }
            } catch (e) { console.warn(`[Webhook] Critical WO dispatch failed: ${e.message}`); /* webhook failure should never block WO creation */ }
        }

        res.status(201).json({
            success: true,
            id: result.lastInsertRowid,
            message: 'Work order created'
        });
    } catch (err) {
        console.error('POST /api/work-orders error:', err);
        res.status(500).json({ error: 'Failed to create work order' });
    }
});

// ── PUT /api/work-orders/:id ─────────────────────────────────────────────
// Update a work order (GPS-aware: maps lat/lng to Start or Complete columns)
router.put('/:id', (req, res) => {
    try {
        const fields = whitelist(req.body, 'work');
        
        // Track the last user who modified or "completed" the work order
        if (req.user && req.user.Username) {
            fields.UserID = req.user.Username;
        }

        // ── GPS Location Logging ──
        // Map generic lat/lng from the frontend to the correct columns
        // based on the status being set (Started → Start*, Completed → Complete*)
        const statusId = String(fields.StatusID || '').toLowerCase();
        const startStatuses = ['20', 'started', 'in progress', 'in-progress'];
        const completeStatuses = ['40', '50', 'completed', 'complete', 'closed'];

        if (req.body._gpsLat !== undefined && req.body._gpsLng !== undefined) {
            if (startStatuses.includes(statusId)) {
                fields.StartLat = req.body._gpsLat;
                fields.StartLng = req.body._gpsLng;
                fields.GPSAccuracy = req.body._gpsAccuracy || null;
            } else if (completeStatuses.includes(statusId)) {
                fields.CompleteLat = req.body._gpsLat;
                fields.CompleteLng = req.body._gpsLng;
                fields.GPSAccuracy = req.body._gpsAccuracy || null;
            }
        }

        if (Object.keys(fields).length === 0) {
            return res.status(400).json({ error: 'No valid update fields provided.' });
        }

        const sets = Object.keys(fields).map(k => `"${k}" = ?`).join(', ');
        const values = [...Object.values(fields), req.params.id, req.params.id, req.params.id];

        db.run(`UPDATE "Work" SET ${sets} WHERE ID = ? OR WorkOrderNumber = ? OR rowid = ?`, values);

        // ── ERP Write-Back: queue WO close event when completing a WO ──
        if (completeStatuses.includes(statusId)) {
            try {
                const plantId = req.headers['x-plant-id'] || 'Plant_1';
                const woRow = db.queryOne(
                    'SELECT WorkOrderNumber, Description, AstID, StatusID FROM Work WHERE ID = ? OR WorkOrderNumber = ? OR rowid = ?',
                    [req.params.id, req.params.id, req.params.id]
                );
                if (woRow) {
                    insertOutboxEvent(plantId, 'erp', 'wo_close', {
                        woNumber: woRow.WorkOrderNumber || req.params.id,
                        description: woRow.Description,
                        assetId: woRow.AstID,
                        status: fields.StatusID,
                        completedAt: new Date().toISOString(),
                        plantId,
                    });
                }
            } catch { /* non-blocking */ }

            // ── P3: Auto-calculate DowntimeCost on WO close ──
            // DowntimeCost = ActualHours × Asset.HourlyProductionValue (if not already set)
            try {
                if (!fields.DowntimeCost) {
                    const woData = db.queryOne(
                        'SELECT AstID, ActualHours, DowntimeCost FROM Work WHERE ID = ? OR WorkOrderNumber = ? OR rowid = ?',
                        [req.params.id, req.params.id, req.params.id]
                    );
                    if (woData && woData.AstID && !woData.DowntimeCost) {
                        const asset = db.queryOne(
                            'SELECT HourlyProductionValue FROM Asset WHERE AstID = ? OR ID = ?',
                            [woData.AstID, woData.AstID]
                        );
                        const hpv = parseFloat(asset?.HourlyProductionValue) || 0;
                        const hrs = parseFloat(woData.ActualHours) || 0;
                        if (hpv > 0 && hrs > 0) {
                            db.run(
                                'UPDATE Work SET DowntimeCost = ? WHERE ID = ? OR WorkOrderNumber = ? OR rowid = ?',
                                [Math.round(hpv * hrs * 100) / 100, req.params.id, req.params.id, req.params.id]
                            );
                        }
                    }
                }
            } catch { /* non-blocking — downtime cost calc is advisory only */ }
        }

        res.json({ success: true, message: 'Work order updated' });
    } catch (err) {
        console.error('PUT /api/work-orders/:id error:', err);
        res.status(500).json({ error: 'Failed to update work order' });
    }
});

// ── DELETE /api/work-orders/:id ──────────────────────────────────────────
router.delete('/:id', (req, res) => {
    try {
        const id = req.params.id;
        // Safety: prevent deleting completed/cancelled work orders.
        // Platform convention (costLedger.js:98, all analytics queries): 40 = Completed, 50 = Cancelled.
        // Legacy text values ('completed' / 'closed') kept as a belt-and-braces fallback.
        const wo = db.queryOne('SELECT StatusID, WorkOrderNumber FROM Work WHERE ID = ? OR WorkOrderNumber = ? OR rowid = ?', [id, id, id]);
        if (!wo) return res.status(404).json({ error: 'Work order not found' });

        const statusNum = Number(wo.StatusID);
        const statusStr = String(wo.StatusID || '').toLowerCase();
        const isTerminal = (Number.isFinite(statusNum) && statusNum >= 40)
            || statusStr === 'completed' || statusStr === 'complete' || statusStr === 'closed' || statusStr === 'cancelled' || statusStr === 'canceled';
        if (isTerminal) {
            return res.status(403).json({ error: 'Cannot delete completed work orders — they are part of your metrics.' });
        }

        // Delete by ID, WorkOrderNumber, or rowid
        db.run('DELETE FROM Work WHERE ID = ? OR WorkOrderNumber = ? OR rowid = ?', [id, id, id]);

        const plantId = req.headers['x-plant-id'] || null;
        logAudit(
            req.user?.Username || 'unknown',
            'WO_DELETED',
            plantId,
            { id, workOrderNumber: wo.WorkOrderNumber, statusId: wo.StatusID },
            'WARNING',
            req.ip
        );

        res.json({ success: true, message: 'Work order deleted' });
    } catch (err) {
        console.error('DELETE /api/work-orders/:id error:', err);
        res.status(500).json({ error: 'Failed to delete work order' });
    }
});

module.exports = router;
