// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Enterprise Logistics & Cross-Plant Transfer API
 * ===========================================================
 * The inter-plant nervous system: global parts search, plant-to-plant
 * transfer requests, enterprise asset intelligence, network onboarding
 * (invite codes + site codes), and vendor/SOP synchronization.
 * Mounted at /api/logistics in server/index.js.
 *
 * DATA SOURCE: GlobalParts, GlobalAssets, GlobalVendors, GlobalSOPs in
 * trier_logistics.db — populated by the Crawl Engine (crawl_engine.js)
 * which indexes all plant databases every 15 minutes.
 *
 * ENDPOINTS:
 *   GET  /transfers               Transfers for the current plant (requester or fulfiller)
 *   GET  /search-all              Full-text cross-plant part search (40+ plant DBs)
 *   GET  /search-assets           Cross-plant asset search
 *   POST /request                 Initiate a part transfer request
 *   PUT  /status/:id              Approve / reject / ship / receive a transfer
 *
 *   GET  /global-vendors/list     All vendors in the enterprise vendor directory
 *   GET  /global-vendors/:id      Single global vendor detail
 *   POST /global-vendors          Add a vendor to the global directory
 *   GET  /global-assets           Enterprise asset catalog (all plants)
 *   POST /global-assets           Add an asset to the global catalog
 *   GET  /global-sops             Enterprise SOP library (searchable)
 *   POST /global-sops             Publish an SOP to the enterprise library
 *   GET  /global-parts            Cross-plant parts catalog with pricing comparison
 *
 *   GET  /enterprise-insights     KPI rollup: lowest price, availability heatmap
 *
 *   POST /invite/generate         Generate a one-time plant invite code (onboarding)
 *   GET  /invite/validate/:code   Check if invite code is valid + not expired
 *   POST /invite/use              Consume an invite code (creates plant link)
 *   GET  /invite/list             List all outstanding invite codes
 *   POST /invite/revoke/:id       Revoke an invite code before it's used
 *   GET  /site-code/:plantId      Get the site code for a plant (QR onboarding)
 *   POST /site-code/generate      Generate a new site code for a plant
 *   GET  /site-standardization    Cross-plant naming + SKU standardization report
 *
 * TRANSFER STATUS WORKFLOW:
 *   PENDING → APPROVED → SHIPPED → RECEIVED (normal flow)
 *   PENDING → REJECTED (supplier can't fulfill)
 *   APPROVED → CANCELLED (requester cancels before ship)
 *
 * INVITE CODE FORMAT: 8-char alphanumeric, 72-hour expiry.
 * Used by the Network Onboarding Wizard to clone PMs, parts, vendors from a
 * sister plant without manual data entry.
 */
const express = require('express');
const router = express.Router();
const { db: logisticsDb, logAudit } = require('../logistics_db');
const localDb = require('../database'); // Normal plant DB context

// ── GET /api/logistics/transfers ──────────────────────────────────────────
// Fetch transfers involving the current plant (as either requester or fulfiller)
router.get('/transfers', (req, res) => {
    try {
        const plantId = localDb.asyncLocalStorage.getStore();
        if (!plantId) return res.status(400).json({ error: 'No plant context provided' });

        const transfers = logisticsDb.prepare(`
            SELECT * FROM Transfers
            WHERE RequestingPlant = ? OR FulfillingPlant = ?
            ORDER BY ReqDate DESC
            LIMIT 100
        `).all(plantId, plantId);

        res.json(transfers);
    } catch (err) {
        console.error('Failed to fetch transfers:', err.message);
        res.status(500).json({ error: 'Failed to access logistics ledger' });
    }
});

// ── GET /api/logistics/search-all ─────────────────────────────────────────
// Unified global search across Parts, Assets, and SOPs
router.get('/search-all', (req, res) => {
    try {
        const { query, partId, type = 'all' } = req.query;
        const searchTerm = query || partId;
        if (!searchTerm) return res.status(400).json({ error: 'Search term required' });

        const results = {
            parts: [],
            assets: [],
            sops: []
        };

        // 1. Search Global Registry (Fast)
        if (type === 'all' || type === 'assets') {
            results.assets = logisticsDb.prepare(`
                SELECT *, 'GLOBAL' as source 
                FROM GlobalAssets 
                WHERE ID LIKE ? OR Description LIKE ? OR Model LIKE ? 
                LIMIT 50
            `).all(`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`);
        }

        if (type === 'all' || type === 'sops') {
            results.sops = logisticsDb.prepare(`
                SELECT *, 'GLOBAL' as source 
                FROM GlobalSOPs 
                WHERE ID LIKE ? OR Description LIKE ? 
                LIMIT 50
            `).all(`%${searchTerm}%`, `%${searchTerm}%`);
        }

        // 2. Search Part Stock across all sites (Live)
        if (type === 'all' || type === 'parts') {
            const fs = require('fs');
            const path = require('path');
            const Database = require('better-sqlite3');
            const dataDir = require('../resolve_data_dir');
            const dbFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.db') && !f.includes('trier_'));

            // Normalize: strip hyphens/underscores/spaces for fuzzy matching
            const normalizedTerm = searchTerm.replace(/[-_\s]/g, '').toLowerCase();

            for (const dbFile of dbFiles) {
                const plantName = dbFile.replace('.db', '');
                try {
                    const tempDb = new Database(path.join(dataDir, dbFile), { readonly: true });
                    const partCols = tempDb.prepare("PRAGMA table_info(Part)").all().map(c => c.name);
                    const descField = partCols.includes('Descript') ? 'Descript' : (partCols.includes('Description') ? 'Description' : null);
                    const stockField = partCols.includes('Stock') ? 'Stock' : (partCols.includes('OnHand') ? 'OnHand' : null);

                    // Use LIKE with original term AND normalized variants
                    let sql = 'SELECT * FROM Part WHERE ID LIKE ? OR ID LIKE ?';
                    let params = [`%${searchTerm}%`, `%${normalizedTerm}%`];
                    if (descField) {
                        sql += ` OR ${descField} LIKE ? OR REPLACE(REPLACE(REPLACE(LOWER(${descField}), '-', ''), '_', ''), ' ', '') LIKE ?`;
                        params.push(`%${searchTerm}%`, `%${normalizedTerm}%`);
                    }
                    sql += ' LIMIT 20';

                    const rows = tempDb.prepare(sql).all(...params);
                    for (const row of rows) {
                        let usageCount = 0;
                        try {
                            const usageRow = tempDb.prepare('SELECT COUNT(*) as usageCount FROM WorkPart WHERE PartID = ?').get(row.ID);
                            usageCount = usageRow ? usageRow.usageCount : 0;
                        } catch(e) {}
                        const stock = stockField ? (row[stockField] || 0) : 0;
                        results.parts.push({
                            plant: plantName,
                            partId: row.ID,
                            description: row.Description || row.Descript || 'No Description',
                            onHand: stock,
                            usageCount: usageCount
                        });
                    }
                    tempDb.close();
                } catch (err) {
                    // Skip plants that fail
                }
            }
        }

        res.json(results);
    } catch (err) {
        console.error('Failed to query global network:', err.message);
        res.status(500).json({ error: 'Failed to query global network' });
    }
});

// ── GET /api/logistics/search-assets ──────────────────────────────────────
// Combined search across all plants for Assets (Spare vs In Production)
// AND Parts (with stock > 0). Results sorted so spares/in-stock come first.
router.get('/search-assets', (req, res) => {
    try {
        const { query } = req.query;
        if (!query) return res.status(400).json({ error: 'Search query required' });

        const fs = require('fs');
        const path = require('path');
        const Database = require('better-sqlite3');
        const dataDir = require('../resolve_data_dir');
        const dbFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.db') && !f.includes('trier_') && !f.includes('corporate'));

        const results = [];
        const searchPattern = `%${query}%`;

        for (const dbFile of dbFiles) {
            const plantName = dbFile.replace('.db', '');
            let tempDb;
            try {
                tempDb = new Database(path.join(dataDir, dbFile), { readonly: true });

                // ── Search Assets ──
                const assetCols = tempDb.prepare("PRAGMA table_info(Asset)").all().map(c => c.name);
                const hasOpStatus = assetCols.includes('OperationalStatus');
                const hasModel = assetCols.includes('Model');
                const hasSerial = assetCols.includes('Serial');
                const hasPartNumber = assetCols.includes('PartNumber');

                const whereParts = ['ID LIKE ?', 'Description LIKE ?'];
                const whereParams = [searchPattern, searchPattern];
                if (hasModel) { whereParts.push('Model LIKE ?'); whereParams.push(searchPattern); }
                if (hasPartNumber) { whereParts.push('PartNumber LIKE ?'); whereParams.push(searchPattern); }

                const selectFields = ['ID', 'Description'];
                if (hasModel) selectFields.push('Model');
                if (hasSerial) selectFields.push('Serial');
                if (hasOpStatus) selectFields.push('OperationalStatus');
                if (hasPartNumber) selectFields.push('PartNumber');

                const assets = tempDb.prepare(`
                    SELECT ${selectFields.join(', ')}
                    FROM Asset 
                    WHERE (${whereParts.join(' OR ')})
                    AND (IsDeleted IS NULL OR IsDeleted = 0)
                    ${hasOpStatus ? "AND OperationalStatus = 'Spare'" : "AND 1=0"}
                `).all(...whereParams);

                assets.forEach(a => {
                    const status = hasOpStatus ? (a.OperationalStatus || 'In Production') : 'In Production';
                    results.push({
                        type: 'asset',
                        plant: plantName,
                        assetId: a.ID,
                        description: a.Description || 'No Description',
                        model: a.Model || '',
                        serial: a.Serial || '',
                        partNumber: a.PartNumber || '',
                        status: status,
                        availability: status === 'Spare' ? 'Available' : 'In Use',
                        sortPriority: status === 'Spare' ? 0 : 2
                    });
                });

                // ── Search Parts ──
                const partCols = tempDb.prepare("PRAGMA table_info(Part)").all().map(c => c.name);
                const descCol = partCols.includes('Descript') ? 'Descript' :
                                partCols.includes('Description') ? 'Description' : null;
                const stockCol = partCols.includes('Stock') ? 'Stock' :
                                 partCols.includes('OnHand') ? 'OnHand' : null;
                const hasPartModel = partCols.includes('Model');

                const pWhere = ['ID LIKE ?'];
                const pParams = [searchPattern];
                if (descCol) { pWhere.push(`${descCol} LIKE ?`); pParams.push(searchPattern); }
                if (hasPartModel) { pWhere.push('Model LIKE ?'); pParams.push(searchPattern); }

                const pSelect = ['ID'];
                if (descCol) pSelect.push(`${descCol} as Description`);
                if (stockCol) pSelect.push(`${stockCol} as Stock`);
                if (hasPartModel) pSelect.push('Model');

                const parts = tempDb.prepare(`
                    SELECT ${pSelect.join(', ')}
                    FROM Part 
                    WHERE (${pWhere.join(' OR ')})
                    ${stockCol ? `AND ${stockCol} > 0` : "AND 1=0"}
                    LIMIT 20
                `).all(...pParams);

                parts.forEach(p => {
                    const stock = p.Stock || 0;
                    results.push({
                        type: 'part',
                        plant: plantName,
                        assetId: p.ID,
                        description: p.Description || p.ID,
                        model: p.Model || '',
                        serial: '',
                        status: stock > 0 ? `In Stock (${stock})` : 'Out of Stock',
                        availability: stock > 0 ? 'Available' : 'None',
                        stock: stock,
                        sortPriority: stock > 0 ? 1 : 3
                    });
                });

                tempDb.close();
            } catch (err) {
                if (tempDb) try { tempDb.close(); } catch(e) {}
            }
        }

        // Sort: Spare assets first, then in-stock parts, then the rest
        results.sort((a, b) => a.sortPriority - b.sortPriority);

        res.json(results);
    } catch (err) {
        console.error('Failed global asset/part search:', err.message);
        res.status(500).json({ error: 'Failed to query global network' });
    }
});

// ── POST /api/logistics/request ───────────────────────────────────────────
// Request a part from another plant
router.post('/request', (req, res) => {
    try {
        const requestingPlant = localDb.asyncLocalStorage.getStore();
        const requestBy = req.user?.Username || req.body.requestBy;
        const { fulfillingPlant, partId, quantity, notes } = req.body;

        if (!requestingPlant || !fulfillingPlant || !partId || !quantity || !requestBy) {
            return res.status(400).json({ error: 'Missing required transfer fields' });
        }

        const stmt = logisticsDb.prepare(`
            INSERT INTO Transfers (RequestingPlant, FulfillingPlant, PartID, Quantity, RequestBy, Notes, Status)
            VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
        `);

        const result = stmt.run(requestingPlant, fulfillingPlant, partId, quantity, requestBy, notes || null);

        logAudit(requestBy, 'PARTS_REQUEST', requestingPlant, {
            partId,
            quantity,
            fulfillingPlant,
            transferId: result.lastInsertRowid
        });

        res.status(201).json({ success: true, transferId: result.lastInsertRowid });
    } catch (err) {
        console.error('Failed to initiate transfer:', err.message);
        res.status(500).json({ error: 'Failed to write to logistics ledger' });
    }
});

// ── PUT /api/logistics/status/:id ─────────────────────────────────────────
// Update transfer status (SHIPPED, RECEIVED, REJECTED)
// Note: We enforce the two-phase commit warning here by NOT automatically mutating local 
// "on-hand" values. The logistics ledger merely handles the state narrative.
router.put('/status/:id', (req, res) => {
    try {
        const { status, trackingNumber, notes } = req.body;
        const fulfillBy = req.user?.Username || req.body.fulfillBy || 'SYSTEM';
        const transferId = req.params.id;
        const currentPlant = localDb.asyncLocalStorage.getStore();

        // Ensure valid status transition
        if (!['SHIPPED', 'RECEIVED', 'REJECTED'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status state' });
        }

        const transfer = logisticsDb.prepare('SELECT * FROM Transfers WHERE ID = ?').get(transferId);
        if (!transfer) return res.status(404).json({ error: 'Transfer not found' });

        let sql = 'UPDATE Transfers SET Status = ?';
        const params = [status];

        if (status === 'SHIPPED') {
            sql += ', ShippedDate = CURRENT_TIMESTAMP, FulfillBy = ?, TrackingNumber = ?';
            params.push(fulfillBy || transfer.FulfillBy, trackingNumber || transfer.TrackingNumber);
        } else if (status === 'RECEIVED') {
            sql += ', ReceivedDate = CURRENT_TIMESTAMP';
        }

        if (notes) {
            sql += ', Notes = ?';
            params.push(notes);
        }

        sql += ' WHERE ID = ?';
        params.push(transferId);

        logisticsDb.prepare(sql).run(...params);

        logAudit(fulfillBy || 'SYSTEM', `PARTS_TRANSFER_${status}`, currentPlant, {
            transferId,
            status,
            trackingNumber
        });

        res.json({ success: true, message: `Transfer marked as ${status}` });

    } catch (err) {
        console.error('Failed to update transfer status:', err.message);
        res.status(500).json({ error: 'Failed to update logistics ledger' });
    }
});

// PERF-02: Added server-side search + pagination. Max 250 per page.
// Supports: ?page=1&limit=50&search=term
router.get('/global-vendors/list', (req, res) => {
    try {
        const search = req.query.search ? `%${req.query.search}%` : null;
        const limit  = Math.min(parseInt(req.query.limit) || 100, 250);
        const offset = (Math.max(parseInt(req.query.page) || 1, 1) - 1) * limit;
        const sql = search
            ? 'SELECT * FROM GlobalVendors WHERE Name LIKE ? OR ID LIKE ? ORDER BY Name ASC LIMIT ? OFFSET ?'
            : 'SELECT * FROM GlobalVendors ORDER BY Name ASC LIMIT ? OFFSET ?';
        const params = search ? [search, search, limit, offset] : [limit, offset];
        const total  = logisticsDb.prepare(search ? 'SELECT COUNT(*) as n FROM GlobalVendors WHERE Name LIKE ? OR ID LIKE ?' : 'SELECT COUNT(*) as n FROM GlobalVendors').get(...(search ? [search, search] : []))?.n || 0;
        const vendors = logisticsDb.prepare(sql).all(...params);
        res.json({ vendors, total, page: parseInt(req.query.page) || 1, limit });
    } catch (err) {
        console.error('[Logistics] GET /global-vendors/list error:', err.message);
        res.status(500).json({ error: 'Failed to list global vendors' });
    }
});

router.get('/global-vendors/:id', (req, res) => {
    try {
        const vendor = logisticsDb.prepare('SELECT * FROM GlobalVendors WHERE ID = ?').get(req.params.id);
        if (!vendor) return res.status(204).send();
        res.json(vendor);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch global vendor' });
    }
});

router.post('/global-vendors', (req, res) => {
    try {
        const plantId = localDb.asyncLocalStorage.getStore();
        const data = req.body;
        
        const stmt = logisticsDb.prepare(`
            INSERT INTO GlobalVendors (ID, Name, Address, City, State, Zip, Phone, Email, Website, LastSyncFromPlant, UpdatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(ID) DO UPDATE SET
                Name = excluded.Name,
                Address = excluded.Address,
                City = excluded.City,
                State = excluded.State,
                Zip = excluded.Zip,
                Phone = excluded.Phone,
                Email = excluded.Email,
                Website = excluded.Website,
                LastSyncFromPlant = excluded.LastSyncFromPlant,
                UpdatedAt = CURRENT_TIMESTAMP
        `);

        stmt.run(
            data.ID, 
            data.Name, 
            data.Address, 
            data.City, 
            data.State, 
            data.Zip, 
            data.Phone, 
            data.Email, 
            data.Website, 
            plantId
        );

        res.json({ success: true, message: 'Vendor synchronized globally' });
    } catch (err) {
        console.error('Failed to sync global vendor:', err.message);
        res.status(500).json({ error: 'Failed to sync global vendor' });
    }
});

// ── Global Assets Integration ─────────────────────────────────────────────
router.get('/global-assets', (req, res) => {
    try {
        const assets = logisticsDb.prepare('SELECT * FROM GlobalAssets ORDER BY UpdatedAt DESC LIMIT 500').all();
        res.json(assets);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch global assets' });
    }
});

router.post('/global-assets', (req, res) => {
    try {
        const plantId = localDb.asyncLocalStorage.getStore();
        const data = req.body;
        
        const stmt = logisticsDb.prepare(`
            INSERT INTO GlobalAssets (ID, Description, Model, Manufacturer, AssetType, UsefulLife, AssetTag, LastSyncFromPlant, UpdatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(ID) DO UPDATE SET
                Description = excluded.Description,
                Model = excluded.Model,
                Manufacturer = excluded.Manufacturer,
                AssetType = excluded.AssetType,
                UsefulLife = excluded.UsefulLife,
                AssetTag = excluded.AssetTag,
                LastSyncFromPlant = excluded.LastSyncFromPlant,
                UpdatedAt = CURRENT_TIMESTAMP
        `);

        stmt.run(data.ID, data.Description, data.Model, data.Manufacturer, data.AssetType, data.UsefulLife, data.AssetTag, plantId);
        res.json({ success: true });
    } catch (err) {
        console.error('Failed to sync global asset:', err.message);
        res.status(500).json({ error: 'Failed to sync global asset' });
    }
});

// ── Global SOPs Integration ──────────────────────────────────────────────
router.get('/global-sops', (req, res) => {
    try {
        const sops = logisticsDb.prepare('SELECT * FROM GlobalSOPs ORDER BY UpdatedAt DESC LIMIT 500').all();
        res.json(sops);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch global SOPs' });
    }
});

router.post('/global-sops', (req, res) => {
    try {
        const plantId = localDb.asyncLocalStorage.getStore();
        const { ID, Description, Tasks } = req.body;

        const stmt = logisticsDb.prepare(`
            INSERT INTO GlobalSOPs (ID, Description, TasksJSON, LastSyncFromPlant, UpdatedAt)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(ID) DO UPDATE SET
                Description = excluded.Description,
                TasksJSON = excluded.TasksJSON,
                LastSyncFromPlant = excluded.LastSyncFromPlant,
                UpdatedAt = CURRENT_TIMESTAMP
        `);

        stmt.run(ID, Description, JSON.stringify(Tasks), plantId);
        res.json({ success: true });
    } catch (err) {
        console.error('Failed to sync global SOP:', err.message);
        res.status(500).json({ error: 'Failed to sync global SOP' });
    }
});

// ── Global Parts Integration ─────────────────────────────────────────────
// PERF-02: Added server-side search + pagination. Max 250 per page.
// Supports: ?page=1&limit=100&search=term
router.get('/global-parts', (req, res) => {
    try {
        const search = req.query.search ? `%${req.query.search}%` : null;
        const limit  = Math.min(parseInt(req.query.limit) || 100, 250);
        const offset = (Math.max(parseInt(req.query.page) || 1, 1) - 1) * limit;
        const sql = search
            ? 'SELECT * FROM GlobalParts WHERE ID LIKE ? OR Description LIKE ? ORDER BY ID ASC LIMIT ? OFFSET ?'
            : 'SELECT * FROM GlobalParts ORDER BY ID ASC LIMIT ? OFFSET ?';
        const params = search ? [search, search, limit, offset] : [limit, offset];
        const total  = logisticsDb.prepare(search ? 'SELECT COUNT(*) as n FROM GlobalParts WHERE ID LIKE ? OR Description LIKE ?' : 'SELECT COUNT(*) as n FROM GlobalParts').get(...(search ? [search, search] : []))?.n || 0;
        const parts  = logisticsDb.prepare(sql).all(...params);
        res.json({ parts, total, page: parseInt(req.query.page) || 1, limit });
    } catch (err) {
        console.error('[Logistics] GET /global-parts error:', err.message);
        res.status(500).json({ error: 'Failed to fetch global parts' });
    }
});

// ── GET /api/logistics/enterprise-insights ──────────────────────────────
// Aggregated intelligence across the entire fleet
router.get('/enterprise-insights', (req, res) => {
    try {
        // 1. Oldest Assets (show up to 20 to include all depreciated)
        const oldest = logisticsDb.prepare(`
            SELECT ID, Description, InstallDate, LastSyncFromPlant
            FROM GlobalAssets 
            WHERE InstallDate IS NOT NULL AND InstallDate != ''
            ORDER BY InstallDate ASC 
            LIMIT 20
        `).all();

        // 2. Downtime Leaders (Lost Production Kings)
        const downtime = logisticsDb.prepare(`
            SELECT ID, Description, CumulativeDowntime, FailureCount, LastSyncFromPlant
            FROM GlobalAssets 
            WHERE CumulativeDowntime > 0
            ORDER BY CumulativeDowntime DESC 
            LIMIT 20
        `).all();

        // 3. Labor Drains (Resource Intensity)
        const labor = logisticsDb.prepare(`
            SELECT ID, Description, TotalLaborHours, LastSyncFromPlant
            FROM GlobalAssets 
            WHERE TotalLaborHours > 0
            ORDER BY TotalLaborHours DESC 
            LIMIT 20
        `).all();

        // 4. Value Discoveries (Network Savings)
        const savings = logisticsDb.prepare(`
            SELECT ID, Description, AvgUnitCost, CheapestPrice, CheapestPlant
            FROM GlobalParts
            WHERE CheapestPrice < AvgUnitCost * 0.9 -- 10% or more cheaper
            ORDER BY (AvgUnitCost - CheapestPrice) DESC
            LIMIT 5
        `).all();

        res.json({
            oldest,
            downtime,
            labor,
            savings
        });
    } catch (err) {
        console.error('Enterprise insights failed:', err.message);
        res.status(500).json({ error: 'Failed to retrieve enterprise intelligence' });
    }
});

// ── INVITE CODES (Single-Use Secure Onboarding) ─────────────────────
// Generate a unique single-use invite code
router.post('/invite/generate', (req, res) => {
    const { plantId, createdBy } = req.body;
    if (!plantId) return res.status(400).json({ error: 'PlantID required' });

    try {
        // Generate unique 8-char alphanumeric code (e.g., TROS-A7X9-K3M2)
        const seg1 = 'TROS';
        const seg2 = Math.random().toString(36).substring(2, 6).toUpperCase();
        const seg3 = Math.random().toString(36).substring(2, 6).toUpperCase();
        const code = `${seg1}-${seg2}-${seg3}`;

        logisticsDb.prepare(`
            INSERT INTO InviteCodes (Code, PlantID, CreatedBy)
            VALUES (?, ?, ?)
        `).run(code, plantId, createdBy || 'SYSTEM');

        logAudit(createdBy || 'SYSTEM', 'INVITE_CODE_GENERATED', plantId, { code }, 'INFO');
        res.json({ success: true, code, plantId });
    } catch (err) {
        // Handle unlikely collision — retry once
        try {
            const seg2 = require('crypto').randomBytes(3).toString('hex').substring(0, 4).toUpperCase();
            const seg3 = require('crypto').randomBytes(3).toString('hex').substring(0, 4).toUpperCase();
            const code = `TROS-${seg2}-${seg3}`;
            logisticsDb.prepare('INSERT INTO InviteCodes (Code, PlantID, CreatedBy) VALUES (?, ?, ?)').run(code, plantId, createdBy || 'SYSTEM');
            res.json({ success: true, code, plantId });
        } catch (retryErr) {
            res.status(500).json({ error: 'Failed to generate invite code: ' + retryErr.message });
        }
    }
});

// Validate an invite code (used during registration)
router.get('/invite/validate/:code', (req, res) => {
    try {
        const row = logisticsDb.prepare('SELECT * FROM InviteCodes WHERE Code = ?').get(req.params.code);
        if (!row) return res.json({ valid: false, error: 'Code not found' });
        if (row.Status === 'used') return res.json({ valid: false, error: 'Code already used' });
        if (row.Status === 'revoked') return res.json({ valid: false, error: 'Code has been revoked' });
        res.json({ valid: true, plantId: row.PlantID });
    } catch (err) {
        res.status(500).json({ valid: false, error: 'An internal server error occurred' });
    }
});

// Mark an invite code as used (called after successful registration)
router.post('/invite/use', (req, res) => {
    const { code, username } = req.body;
    if (!code || !username) return res.status(400).json({ error: 'Code and username are required' });

    try {
        const row = logisticsDb.prepare('SELECT * FROM InviteCodes WHERE Code = ? AND Status = ?').get(code, 'available');
        if (!row) return res.status(400).json({ error: 'Invalid or already-used code' });

        logisticsDb.prepare(`
            UPDATE InviteCodes 
            SET Status = 'used', UsedAt = CURRENT_TIMESTAMP, UsedBy = ?, RegisteredUsername = ?
            WHERE Code = ?
        `).run(username, username, code);

        logAudit(username, 'INVITE_CODE_USED', row.PlantID, { code }, 'INFO');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});

// List all invite codes (admin only)
router.get('/invite/list', (req, res) => {
    try {
        const codes = logisticsDb.prepare(`
            SELECT * FROM InviteCodes 
            ORDER BY CreatedAt DESC 
            LIMIT 200
        `).all();
        res.json(codes);
    } catch (err) {
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});

// Revoke an invite code
router.post('/invite/revoke/:id', (req, res) => {
    try {
        logisticsDb.prepare("UPDATE InviteCodes SET Status = 'revoked' WHERE ID = ? AND Status = 'available'").run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});

// Legacy: keep old site-code endpoint for backwards compat
router.get('/site-code/:plantId', (req, res) => {
    try {
        const row = logisticsDb.prepare('SELECT InviteCode FROM SiteCodes WHERE PlantID = ?').get(req.params.plantId);
        res.json({ inviteCode: row ? row.InviteCode : null });
    } catch (err) {
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});
router.post('/site-code/generate', (req, res) => {
    const { plantId, userId } = req.body;
    if (!plantId) return res.status(400).json({ error: 'PlantID required' });
    try {
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        logisticsDb.prepare('INSERT INTO SiteCodes (PlantID, InviteCode, CreatedBy) VALUES (?, ?, ?) ON CONFLICT(PlantID) DO UPDATE SET InviteCode = excluded.InviteCode, CreatedAt = CURRENT_TIMESTAMP').run(plantId, code, userId || 'SYSTEM');
        res.json({ inviteCode: code });
    } catch (err) {
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});

// ── GET /api/logistics/site-standardization ────────────────────────────
// Calculate how many local records align with the Global Registry
router.get('/site-standardization', (req, res) => {
    try {
        const plantId = localDb.asyncLocalStorage.getStore();
        if (!plantId) return res.status(400).json({ error: 'No plant context' });

        const plantDb = localDb.getDb(plantId);
        
        // 1. Check Assets
        const localAssets = plantDb.prepare('SELECT ID FROM Asset WHERE IsDeleted = 0 OR IsDeleted IS NULL').all();
        const globalAssetIds = logisticsDb.prepare('SELECT ID FROM GlobalAssets').all().map(a => a.ID);
        const assetMatchCount = localAssets.filter(a => globalAssetIds.includes(a.ID)).length;
        
        // 2. Check SOPs
        const localSOPs = plantDb.prepare('SELECT ID FROM Procedures').all();
        const globalSOPIds = logisticsDb.prepare('SELECT ID FROM GlobalSOPs').all().map(s => s.ID);
        const sopMatchCount = localSOPs.filter(s => globalSOPIds.includes(s.ID)).length;

        // 3. Check Parts
        const localParts = plantDb.prepare('SELECT ID FROM Part').all();
        const globalPartIds = logisticsDb.prepare('SELECT ID FROM GlobalParts').all().map(p => p.ID);
        const partMatchCount = localParts.filter(p => globalPartIds.includes(p.ID)).length;

        res.json({
            assets: { local: localAssets.length, standardized: assetMatchCount, score: localAssets.length ? Math.round((assetMatchCount / localAssets.length) * 100) : 100 },
            sops: { local: localSOPs.length, standardized: sopMatchCount, score: localSOPs.length ? Math.round((sopMatchCount / localSOPs.length) * 100) : 100 },
            parts: { local: localParts.length, standardized: partMatchCount, score: localParts.length ? Math.round((partMatchCount / localParts.length) * 100) : 100 },
            overallScore: Math.round(((assetMatchCount + sopMatchCount + partMatchCount) / (localAssets.length + localSOPs.length + localParts.length || 1)) * 100)
        });
    } catch (err) {
        console.error('Standardization score failed:', err.message);
        res.status(500).json({ error: 'Failed to calculate standardization' });
    }
});

module.exports = router;
