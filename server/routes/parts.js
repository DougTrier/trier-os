// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Parts & Inventory Routes
 * ===============================================
 * REST API for the Storeroom / Parts Catalog. Mounted at /api/parts.
 *
 * ENDPOINTS:
 *   GET    /stats                   Part counts, total inventory value, low-stock alerts
 *   GET    /                        List parts (usage-sorted by default, paginated)
 *   GET    /next-id                 Auto-increment next part ID
 *   GET    /enterprise/low-stock    Cross-plant low-stock alerts for corporate dashboard
 *   GET    /:id                     Single part with vendors, locations, adjustments
 *   GET    /:id/substitutes         Alternative parts from plant PartSub + Master Catalog
 *   POST   /:id/substitutes         Add a plant-level substitute link
 *   DELETE /:id/substitutes/:subId  Remove a substitute link
 *   POST   /                        Create part (blocks duplicates, auto-upserts)
 *   PUT    /:id                     Update part fields (whitelisted)
 *   POST   /:id/adjust              Record inventory adjustment (qty change or cost change)
 *   DELETE /:id                     Hard delete (IT Admin / Creator only)
 *
 * USAGE SORT: The default sort is 'usage' -- a correlated subquery that counts
 * how many times each part appears in WorkParts. This surfaces the highest-velocity
 * parts at the top of the list, making high-cost, high-usage parts immediately visible.
 *
 * MASTER DAIRY CATALOG INTERCEPT: Before creating a new local part, POST / checks
 * mfg_master.db for an existing OEM or aftermarket part number match. If found,
 * it blocks the creation with SKU_STANDARDIZATION_BLOCK to prevent fragmentation.
 * The user is directed to import from the Master Catalog instead. Override with
 * _forceOverrideSku=true in the request body if the block is incorrect.
 *
 * ADJUSTMENT LEDGER: POST /:id/adjust is transactional -- it atomically records
 * the adjustment in PartAdjustments (the historical ledger) AND updates the current
 * Stock or UnitCost in the Part table. AdjTypID=4 means 'Change Cost' (no stock change).
 * All other types are additive quantity adjustments (positive or negative).
 *
 * SUBSTITUTE CROSS-REF: GET /:id/substitutes merges two sources:
 *   1. Plant-level PartSub table (manually linked by technicians)
 *   2. mfg_master.db MasterCrossRef (OEM <-> Aftermarket verified equivalents)
 * Both directions of the PartSub link are checked (PartID=? OR SubID=?).
 */


const express = require('express');
const router = express.Router();
const db = require('../database');
const { whitelist } = require('../validators');
const { insertOutboxEvent } = require('../services/erp-outbox');

// ── GET /api/parts/stats ─────────────────────────────────────────────────
router.get('/stats', (req, res) => {
    try {
        const activePlant = req.headers['x-plant-id'] || 'Demo_Plant_1';

        if (activePlant === 'all_sites') {
            const path = require('path');
            const fs = require('fs');
            const Database = require('better-sqlite3');
            const dataDir = require('../resolve_data_dir');
            const plantsFile = path.join(dataDir, 'plants.json');
            const plants = JSON.parse(fs.readFileSync(plantsFile, 'utf8'));

            let totalParts = 0, totalValue = 0;
            const allLowStock = [];

            plants.forEach(p => {
                const dbPath = path.join(dataDir, `${p.id}.db`);
                if (!fs.existsSync(dbPath)) return;
                try {
                    const tempDb = new Database(dbPath, { readonly: true });
                    const hasTbl = tempDb.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='Part'`).get();
                    if (hasTbl) {
                        const s = tempDb.prepare(`SELECT COUNT(*) as total, ROUND(SUM(CAST(Stock AS REAL) * CAST(UnitCost AS REAL)), 2) as totalValue FROM Part`).get();
                        totalParts += s.total || 0;
                        totalValue += s.totalValue || 0;
                        try {
                            const low = tempDb.prepare(`SELECT ID FROM Part WHERE Stock <= OrdMin AND OrdMin > 0`).all();
                            low.forEach(l => allLowStock.push(`${p.id}:${l.ID}`));
                        } catch(e) { /* skip */ }
                    }
                    tempDb.close();
                } catch(e) { console.warn(`[Parts/stats] Skipping ${p.id}: ${e.message}`); }
            });

            return res.json({ total: totalParts, totalValue, lowStock: allLowStock });
        }

        const stats = db.queryOne(`
            SELECT 
                COUNT(*) as total, 
                ROUND(SUM(CAST(Stock AS REAL) * CAST(UnitCost AS REAL)), 2) as totalValue
            FROM Part
        `) || { total: 0, totalValue: 0 };
        
        let lowStock = [];
        try {
            lowStock = db.queryAll(`SELECT ID FROM Part WHERE Stock <= OrdMin AND OrdMin > 0`) || [];
        } catch (e) {
            console.warn('[API] Schema mismatch for parts lowStock check');
        }

        res.json({
            total: stats.total || 0,
            totalValue: stats.totalValue || 0,
            lowStock: lowStock.map(p => p.ID)
        });
    } catch (err) {
        console.error('[API] Error fetching parts stats:', err);
        res.status(200).json({ total: 0, totalValue: 0, lowStock: [] });
    }
});

// ── GET /api/parts ───────────────────────────────────────────────────────
router.get('/', (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            sort: rawSort = 'usage',
            order = 'DESC',
            search = '',
            cls = '',
            classId = '',
            lowStock = '',
        } = req.query;

        const activePlant = req.headers['x-plant-id'] || 'Demo_Plant_1';
        const activeCls = cls || classId;

        // Map frontend lowercase keys to actual DB columns
        const sortMap = {
            'id': 'ID',
            'description': 'Description',
            'classid': 'PartClassID',
            'location': 'Location',
            'stock': 'Stock',
            'ordmin': 'OrdMin',
            'unitcost': 'UnitCost',
            'usage': 'usage'
        };
        const sort = sortMap[rawSort.toLowerCase()] || 'usage';

        let where = [];
        let params = [];

        if (search) {
            where.push(`(ID LIKE ? OR Description LIKE ?)`);
            params.push(`%${search}%`, `%${search}%`);
        }

        if (activeCls) {
            where.push(`PartClassID = ?`);
            params.push(activeCls);
        }

        if (lowStock === 'true') {
            where.push(`Stock <= OrdMin AND OrdMin > 0`);
        }

        // ── Corporate All-Sites Aggregation ──
        if (activePlant === 'all_sites') {
            const path = require('path');
            const fs = require('fs');
            const Database = require('better-sqlite3');
            const dataDir = require('../resolve_data_dir');
            const plantsFile = path.join(dataDir, 'plants.json');
            const plants = JSON.parse(fs.readFileSync(plantsFile, 'utf8'));

            let allParts = [];

            plants.forEach(p => {
                const dbPath = path.join(dataDir, `${p.id}.db`);
                if (!fs.existsSync(dbPath)) return;
                try {
                    const tempDb = new Database(dbPath, { readonly: true });
                    const hasTbl = tempDb.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='Part'`).get();
                    if (hasTbl) {
                        let sql = 'SELECT *, ? as plantId, ? as plantLabel FROM Part';
                        let sqlParams = [p.id, p.label];
                        const whereClause = where.length ? where.join(' AND ') : '';
                        if (whereClause) {
                            sql += ' WHERE ' + whereClause;
                            sqlParams = [...sqlParams, ...params];
                        }
                        const siteParts = tempDb.prepare(sql).all(...sqlParams);
                        allParts.push(...siteParts);
                    }
                    tempDb.close();
                } catch(e) { console.warn(`[Parts] Skipping plant ${p.id}: ${e.message}`); }
            });

            // Sort
            if (sort !== 'usage') {
                allParts.sort((a, b) => {
                    const valA = a[sort] || '';
                    const valB = b[sort] || '';
                    return order === 'DESC' ? (valB > valA ? 1 : -1) : (valA > valB ? 1 : -1);
                });
            }

            const total = allParts.length;
            const start = (parseInt(page) - 1) * parseInt(limit);
            const paginated = allParts.slice(start, start + parseInt(limit));

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

        if (sort === 'usage') {
            const offset = (parseInt(page) - 1) * parseInt(limit);
            let whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
            
            // Correlated subquery for usage count + highest linked asset criticality
            const dataSql = `
                SELECT *,
                    (SELECT COUNT(*) FROM WorkParts wp WHERE wp.PartID = Part.ID) as usageCount,
                    (SELECT MAX(a.CriticalityClass) FROM AssetParts ap
                     JOIN Asset a ON a.ID = ap.AstID
                     WHERE ap.PartID = Part.ID) as HighestCriticality
                FROM Part
                ${whereClause}
                ORDER BY usageCount ${order === 'ASC' ? 'ASC' : 'DESC'}, ID ASC
                LIMIT ? OFFSET ?
            `;
            
            const countSql = `SELECT COUNT(*) as total FROM Part ${whereClause}`;
            
            try {
                const totalRow = db.queryOne(countSql, params);
                const total = totalRow ? totalRow.total : 0;
                const data = db.queryAll(dataSql, [...params, parseInt(limit), offset]);
                
                return res.json({
                    data,
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total,
                        totalPages: Math.ceil(total / (parseInt(limit) || 50))
                    }
                });
            } catch (err) {
                console.error('Usage Sort Query Failed:', err);
                throw err;
            }
        }

        const result = db.queryPaginated('Part', {
            page: parseInt(page),
            limit: parseInt(limit),
            orderBy: sort,
            order,
            where: where.length ? where.join(' AND ') : '',
            params,
        });

        res.json(result);
    } catch (err) {
        const fs = require('fs');
        const errorDetail = `
--- ${new Date().toISOString()} ---
Error: ${err.message}
Stack: ${err.stack}
Query: ${JSON.stringify(req.query)}
-------------------------
`;
        fs.appendFileSync('error_debug.log', errorDetail);
        console.error('CRITICAL: GET /api/parts error:', err);
        res.status(500).json({ error: 'Failed to fetch parts' });
    }
});



// ── GET /api/parts/next-id ──────────────────────────────────────────────
router.get('/next-id', (req, res) => {
    try {
        const row = db.queryOne('SELECT MAX(CAST(ID AS INTEGER)) as maxID FROM Part');
        const nextID = (row.maxID || 0) + 1;
        res.json({ nextID });
    } catch (err) {
        console.error('GET /api/parts/next-id error:', err);
        res.status(500).json({ error: 'Failed to fetch next ID' });
    }
});

// ── GET /api/parts/:id ──────────────────────────────────────────────────
router.get('/:id', (req, res) => {
    try {
        const part = db.queryOne('SELECT * FROM Part WHERE ID = ?', [req.params.id]);
        if (!part) {
            return res.status(404).json({ error: 'Part not found' });
        }

        const vendors = db.queryAll('SELECT * FROM PartVendors WHERE PartID = ?', [req.params.id]);
        const locations = db.queryAll('SELECT * FROM PartLocations WHERE PartID = ?', [req.params.id]);
        const adjustments = db.queryAll(
            'SELECT * FROM PartAdjustments WHERE PartID = ? ORDER BY rowid DESC LIMIT 50',
            [req.params.id]
        );

        res.json({ ...part, _vendors: vendors, _locations: locations, _adjustments: adjustments });
    } catch (err) {
        console.error('GET /api/parts/:id error:', err);
        res.status(500).json({ error: 'Failed to fetch part' });
    }
});

// ── POST /api/parts ─────────────────────────────────────────────────────
router.post('/', (req, res) => {
    try {
        const fields = whitelist(req.body, 'part');

        if (!fields.ID) {
            return res.status(400).json({ error: 'Part ID is required for creation.' });
        }

        // ── Master Dairy Catalog Alignment Intercept ──
        const checkManufNum = String(fields.ManufNum || fields.VendNum || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        if (checkManufNum.length >= 4 && !req.body._forceOverrideSku) {
            const fs = require('fs');
            const path = require('path');
            const Database = require('better-sqlite3');
            const dataDir = require('../resolve_data_dir');
            
            try {
                const masterDbPath = path.join(dataDir, 'mfg_master.db');
                if (fs.existsSync(masterDbPath)) {
                    const masterDb = new Database(masterDbPath, { readonly: true });
                    // Check if OEM number already exists in the sacrosanct Master Dairy Catalog
                    const masterMatch = masterDb.prepare(`
                        SELECT OEMPartNumber, AftermarketPartNumber FROM MasterCrossRef 
                        WHERE REPLACE(REPLACE(REPLACE(UPPER(COALESCE(OEMPartNumber, AftermarketPartNumber, '')), ' ', ''), '-', ''), '.', '') LIKE ?
                        LIMIT 1
                    `).get('%' + checkManufNum + '%');
                    
                    masterDb.close();

                    if (masterMatch) {
                        return res.status(409).json({ 
                            error: 'SKU_STANDARDIZATION_BLOCK', 
                            message: `Enterprise Standardization Intercept: This part already exists in the Master Dairy Catalog as [${masterMatch.OEMPartNumber || masterMatch.AftermarketPartNumber}]. Please import this part directly from the Master Catalog instead of creating a rogue local entry.` 
                        });
                    }
                }
            } catch(e) { console.warn('Master Dairy Catalog intercept skipped:', e.message); }
        }

        // Check if part ID already exists to prevent duplicates (Legacy schema safety)
        const existing = db.queryOne('SELECT ID FROM Part WHERE ID = ?', [fields.ID]);
        
        if (existing) {
            console.log(`[API] Part ${fields.ID} already exists. Converting POST to UPDATE.`);
            const sets = Object.keys(fields).map(k => `"${k}" = ?`).join(', ');
            const values = [...Object.values(fields), fields.ID];
            db.run(`UPDATE "Part" SET ${sets} WHERE ID = ?`, values);
            return res.json({ success: true, message: 'Part updated', id: fields.ID });
        }

        const columns = Object.keys(fields);
        const placeholders = columns.map(() => '?').join(', ');
        const values = Object.values(fields);
        const colStr = columns.map(c => `"${c}"`).join(', ');

        const result = db.run(
            `INSERT INTO "Part" (${colStr}) VALUES (${placeholders})`,
            values
        );

        res.status(201).json({ success: true, id: fields.ID || result.lastInsertRowid });
    } catch (err) {
        console.error('POST /api/parts error:', err);
        res.status(500).json({ error: 'Failed to create part: ' });
    }
});

// ── PUT /api/parts/:id ──────────────────────────────────────────────────
router.put('/:id', (req, res) => {
    try {
        const fields = whitelist(req.body, 'part');

        if (Object.keys(fields).length === 0) {
            return res.status(400).json({ error: 'No valid update fields provided.' });
        }

        const sets = Object.keys(fields).map(k => `"${k}" = ?`).join(', ');
        const values = [...Object.values(fields), req.params.id];

        db.run(`UPDATE "Part" SET ${sets} WHERE ID = ?`, values);
        res.json({ success: true, message: 'Part updated' });
    } catch (err) {
        console.error('PUT /api/parts/:id error:', err);
        res.status(500).json({ error: 'Failed to update part' });
    }
});

// ── POST /api/parts/:id/adjust ──────────────────────────────────────────
// Inventory adjustment
router.post('/:id/adjust', (req, res) => {
    try {
        const { qty, reason, type, newCost } = req.body;
        const partId = req.params.id;
        const adjQty = parseFloat(qty) || 0;
        const adjCost = parseFloat(newCost) || 0;

        const plantDb = db.getDb();

        const tx = plantDb.transaction(() => {
            // 1. Record the adjustment in the historical ledger
            // Note: We use the actual schema columns: Qty, AdjTypID, Comment, UnitCost
            plantDb.prepare(
                `INSERT INTO "PartAdjustments" (PartID, UserID, Qty, AdjTypID, Comment, UnitCost, Updated) 
                 VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
            ).run(partId, req.user?.Username || 'SYSTEM', adjQty, type, reason || '', adjCost || null);

            // 2. Update the master Part table
            if (String(type) === '4') { // Change Cost
                plantDb.prepare(
                    `UPDATE "Part" SET "UnitCost" = ? WHERE "ID" = ?`
                ).run(adjCost, partId);
            } else {
                // Update stock level (additive logic)
                plantDb.prepare(
                    `UPDATE "Part" SET "Stock" = COALESCE("Stock", 0) + ? WHERE "ID" = ?`
                ).run(adjQty, partId);
            }
        });

        tx();

        // ── ERP Write-Back: queue part_consume event for negative adjustments ──
        if (adjQty < 0 && String(type) !== '4') {
            try {
                const plantId = req.headers['x-plant-id'] || 'Plant_1';
                const part = db.queryOne('SELECT PartNumber, Description, Stock FROM Part WHERE ID = ?', [partId]);
                insertOutboxEvent(plantId, 'erp', 'part_consume', {
                    partId,
                    partNumber: part?.PartNumber,
                    description: part?.Description,
                    qty: Math.abs(adjQty),
                    reason: reason || '',
                    consumedAt: new Date().toISOString(),
                    plantId,
                });
            } catch { /* non-blocking */ }
        }

        res.status(201).json({ success: true, message: 'Inventory adjusted successfully' });
    } catch (err) {
        console.error('POST /api/parts/:id/adjust error:', err);
        res.status(500).json({ error: 'Failed to record adjustment: ' });
    }
});

// ── DELETE /api/parts/:id ──────────────────────────────────────────────
router.delete('/:id', (req, res) => {
    try {
        const userRole = req.user?.DefaultRole || 'technician';
        const isCreator = req.user?.Username === 'Doug Trier';
        
        if (userRole !== 'it_admin' && !isCreator) {
            return res.status(403).json({ error: 'Only administrators can delete parts from the catalog.' });
        }

        const partId = req.params.id;
        const result = db.run('DELETE FROM Part WHERE ID = ?', [partId]);
        
        if (result.changes > 0) {
            res.json({ success: true, message: `Part ${partId} deleted.` });
        } else {
            res.status(404).json({ error: 'Part not found.' });
        }
    } catch (err) {
        console.error('DELETE /api/parts/:id error:', err);
        res.status(500).json({ error: 'Failed to delete part: ' });
    }
});

// ── GET /api/parts/enterprise/low-stock ──────────────────────────────────
// Cross-plant low stock alerts for enterprise dashboard
router.get('/enterprise/low-stock', (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const Database = require('better-sqlite3');
        const dataDir = require('../resolve_data_dir');
        const { getPlants } = require('../plant_cache');
        const plants = getPlants();
        const alerts = [];

        for (const p of plants) {
            const dbPath = path.join(dataDir, `${p.id}.db`);
            if (!fs.existsSync(dbPath)) continue;
            try {
                const tempDb = new Database(dbPath, { readonly: true });
                const low = tempDb.prepare(`
                    SELECT ID, Description, Stock, OrdMin, UnitCost, Location
                    FROM Part 
                    WHERE Stock <= OrdMin AND OrdMin > 0
                    ORDER BY (OrdMin - Stock) DESC
                    LIMIT 20
                `).all();

                low.forEach(part => {
                    alerts.push({
                        ...part,
                        plantId: p.id,
                        plantLabel: p.label,
                        deficit: (part.OrdMin || 0) - (part.Stock || 0),
                        reorderCost: ((part.OrdMin || 0) - (part.Stock || 0)) * (parseFloat(String(part.UnitCost || '0').replace(/[^0-9.]/g, '')) || 0)
                    });
                });

                tempDb.close();
            } catch(e) { console.warn(`[Parts] Low-stock scan failed for ${p.id}: ${e.message}`); }
        }

        res.json({
            alerts: alerts.sort((a, b) => b.deficit - a.deficit),
            totalAlerts: alerts.length,
            plantsScanned: plants.length
        });
    } catch (err) {
        console.error('GET /api/parts/enterprise/low-stock error:', err);
        res.status(500).json({ error: 'Failed to scan enterprise inventory' });
    }
});

// ── GET /api/parts/:id/substitutes ───────────────────────────────────────
// Returns merged cross-reference list: plant-level PartSub + Master Catalog MasterCrossRef
router.get('/:id/substitutes', (req, res) => {
    try {
        const partId = req.params.id;
        const plantDb = db.getDb();
        const results = [];

        // 1. Plant-level substitutes from PartSub table
        try {
            const subs = plantDb.prepare(`
                SELECT ps.SubID, ps.Comment, p.Description, p.Stock, p.OrdMin, p.UnitCost, p.Location, p.Manufacturer
                FROM PartSub ps
                LEFT JOIN Part p ON ps.SubID = p.ID
                WHERE ps.PartID = ?
            `).all(partId);

            subs.forEach(s => {
                results.push({
                    source: 'plant',
                    partNumber: s.SubID,
                    description: s.Description || 'Unknown',
                    notes: s.Comment || '',
                    stock: s.Stock || 0,
                    ordMin: s.OrdMin || 0,
                    unitCost: s.UnitCost || 0,
                    location: s.Location || '',
                    manufacturer: s.Manufacturer || '',
                    inStock: (s.Stock || 0) > 0
                });
            });

            // Also check reverse direction (where this part IS the substitute)
            const reverse = plantDb.prepare(`
                SELECT ps.PartID as SubID, ps.Comment, p.Description, p.Stock, p.OrdMin, p.UnitCost, p.Location, p.Manufacturer
                FROM PartSub ps
                LEFT JOIN Part p ON ps.PartID = p.ID
                WHERE ps.SubID = ?
            `).all(partId);

            reverse.forEach(s => {
                if (!results.find(r => r.partNumber === s.SubID)) {
                    results.push({
                        source: 'plant',
                        partNumber: s.SubID,
                        description: s.Description || 'Unknown',
                        notes: s.Comment || '(reverse link)',
                        stock: s.Stock || 0,
                        ordMin: s.OrdMin || 0,
                        unitCost: s.UnitCost || 0,
                        location: s.Location || '',
                        manufacturer: s.Manufacturer || '',
                        inStock: (s.Stock || 0) > 0
                    });
                }
            });
        } catch (e) { console.warn(`[Substitutes] PartSub query failed: ${e.message}`); }

        // 2. Master Catalog cross-references from mfg_master.db
        // Smart matching: search by Part ID AND description keywords
        try {
            const path = require('path');
            const Database = require('better-sqlite3');
            const dataDir = require('../resolve_data_dir');
            const masterPath = path.join(dataDir, 'mfg_master.db');
            const masterDb = new Database(masterPath, { readonly: true });

            // Get part description for smart matching
            let partDescription = '';
            try {
                const partRow = plantDb.prepare('SELECT Description, Manufacturer FROM Part WHERE ID = ?').get(partId);
                if (partRow) partDescription = (partRow.Description || '') + ' ' + (partRow.Manufacturer || '');
            } catch (e) { /* ignore */ }

            // Extract search tokens from description
            const searchTokens = new Set();
            searchTokens.add(partId);
            if (partDescription) {
                const partNumbers = partDescription.match(/[A-Z0-9][\w-]{3,}/gi) || [];
                partNumbers.forEach(pn => searchTokens.add(pn));
                const words = partDescription.split(/\s+/);
                for (let i = 0; i < words.length - 1; i++) {
                    if (words[i].length >= 2 && words[i + 1].match(/[0-9]/)) {
                        searchTokens.add(words[i] + ' ' + words[i + 1]);
                    }
                }
            }

            // Search each token against MasterCrossRef
            const seenIds = new Set();
            const allMasterRefs = [];
            for (const token of searchTokens) {
                if (token.length < 3) continue;
                const refs = masterDb.prepare('SELECT * FROM MasterCrossRef WHERE OEMPartNumber LIKE ? OR AftermarketPartNumber LIKE ?').all('%' + token + '%', '%' + token + '%');
                refs.forEach(ref => { if (!seenIds.has(ref.ID)) { seenIds.add(ref.ID); allMasterRefs.push(ref); } });
            }

            allMasterRefs.forEach(ref => {
                const matchesOEM = [...searchTokens].some(t => ref.OEMPartNumber.toUpperCase().includes(t.toUpperCase()));
                const crossPart = matchesOEM ? ref.AftermarketPartNumber : ref.OEMPartNumber;
                const crossVendor = matchesOEM ? ref.AftermarketVendor : ref.OEMVendor;
                if (!results.find(r => r.partNumber === crossPart)) {
                    let localStock = null;
                    try {
                        const crossTokens = crossPart.split(' ').filter(t => t.length >= 3);
                        for (const ct of crossTokens) {
                            const local = plantDb.prepare('SELECT ID, Stock, Location, UnitCost FROM Part WHERE Description LIKE ? OR ID LIKE ?').get('%' + ct + '%', '%' + ct + '%');
                            if (local) { localStock = local; break; }
                        }
                    } catch (e) { /* not in local inventory */ }
                    results.push({
                        source: 'master',
                        partNumber: crossPart,
                        description: crossVendor + ' \u2014 ' + (matchesOEM ? 'Aftermarket' : 'OEM') + ' equivalent',
                        notes: ref.CompatibilityNotes || '',
                        vendor: crossVendor,
                        verified: ref.Verified === 1,
                        stock: localStock ? localStock.Stock : null,
                        location: localStock ? localStock.Location : null,
                        unitCost: localStock ? localStock.UnitCost : null,
                        inStock: localStock ? (localStock.Stock || 0) > 0 : null
                    });
                }
            });
            masterDb.close();
        } catch (e) { console.warn('[Substitutes] Master catalog query failed: ' + e.message); }

        // Get current part's stock level for the out-of-stock banner
        let currentStock = 0;
        try {
            const current = plantDb.prepare('SELECT Stock FROM Part WHERE ID = ?').get(partId);
            currentStock = current ? current.Stock || 0 : 0;
        } catch (e) { /* ignore */ }

        const inStockSubs = results.filter(r => r.inStock === true);

        res.json({
            partId,
            currentStock,
            substitutes: results,
            hasInStockSubstitutes: inStockSubs.length > 0,
            inStockSubstitutes: inStockSubs
        });
    } catch (err) {
        console.error('GET /api/parts/:id/substitutes error:', err);
        res.status(500).json({ error: 'Failed to fetch substitutes' });
    }
});

// ── POST /api/parts/:id/substitutes ──────────────────────────────────────
// Add a plant-level substitute link
router.post('/:id/substitutes', (req, res) => {
    try {
        const { substituteId, comment } = req.body;
        if (!substituteId) return res.status(400).json({ error: 'substituteId is required' });

        const plantDb = db.getDb();

        // Verify both parts exist
        const part = plantDb.prepare('SELECT ID FROM Part WHERE ID = ?').get(req.params.id);
        const sub = plantDb.prepare('SELECT ID FROM Part WHERE ID = ?').get(substituteId);
        if (!part) return res.status(404).json({ error: 'Source part not found' });
        if (!sub) return res.status(404).json({ error: 'Substitute part not found' });

        // Check for existing link
        const existing = plantDb.prepare('SELECT rowid FROM PartSub WHERE PartID = ? AND SubID = ?').get(req.params.id, substituteId);
        if (existing) return res.status(409).json({ error: 'This substitute link already exists' });

        plantDb.prepare('INSERT INTO PartSub (PartID, SubID, Comment) VALUES (?, ?, ?)').run(req.params.id, substituteId, comment || '');

        res.status(201).json({ success: true, message: `Linked ${substituteId} as substitute for ${req.params.id}` });
    } catch (err) {
        console.error('POST /api/parts/:id/substitutes error:', err);
        res.status(500).json({ error: 'Failed to add substitute' });
    }
});

// ── DELETE /api/parts/:id/substitutes/:subId ─────────────────────────────
// Remove a plant-level substitute link
router.delete('/:id/substitutes/:subId', (req, res) => {
    try {
        const plantDb = db.getDb();
        const result = plantDb.prepare('DELETE FROM PartSub WHERE (PartID = ? AND SubID = ?) OR (PartID = ? AND SubID = ?)').run(
            req.params.id, req.params.subId, req.params.subId, req.params.id
        );
        if (result.changes > 0) {
            res.json({ success: true, message: 'Substitute link removed' });
        } else {
            res.status(404).json({ error: 'Link not found' });
        }
    } catch (err) {
        console.error('DELETE /api/parts/:id/substitutes error:', err);
        res.status(500).json({ error: 'Failed to remove substitute' });
    }
});

module.exports = router;


