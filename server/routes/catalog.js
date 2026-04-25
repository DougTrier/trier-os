// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Master Data Catalog API
 * =====================================
 * Read-only endpoints exposing the enterprise dairy industry master catalog.
 * Contains curated reference data for equipment, parts, vendors, warranty
 * templates, and cross-reference tables sourced from the dairy industry.
 * Data lives in mfg_master.db (read-only, separate from plant databases).
 * Mounted at /api/catalog in server/index.js.
 *
 * ENDPOINTS:
 *   GET  /stats       Catalog summary: equipment count, part count, vendor count, warranty template count
 *   GET  /equipment   Browse master equipment records (filter: ?category, ?manufacturer, ?search)
 *                     Returns: [{ ID, Description, Model, Manufacturer, Category, TypicalLife }]
 *   GET  /parts       Browse master parts (filter: ?category, ?vendor, ?search, ?partNumber)
 *                     Returns: [{ PartNumber, Description, Category, UOM, Manufacturer, TypicalCost }]
 *   GET  /vendors     List approved vendors from the master catalog
 *                     Returns: [{ ID, Name, Category, ContactName, Phone, Email, Website, LeadDays }]
 *   GET  /warranties  Browse warranty templates for common equipment types
 *                     Returns: [{ ID, EquipmentType, WarrantyMonths, Coverage, VendorID }]
 *   GET  /crossref    Cross-reference table: maps OEM part numbers to master catalog equivalents
 *                     Query: ?oem=partNumber to look up a specific OEM number
 *   POST /cross-ref   Create OEM or vertical-to-core cross-reference mapping (auth required)
 *   GET  /search      Cross-vertical catalog search (parts + equipment + OEM cross-ref)
 *
 * DATABASE: mfg_master.db — an industry-wide reference database, not per-plant data.
 *   Tables: MasterEquipment, MasterParts, MasterVendors, MasterWarrantyTemplates, MasterCrossRef
 *   Opened in read-only mode; writes go through the catalog enrichment admin workflow.
 *
 * CONSUMERS: StoreroomView.jsx (part suggestions), AssetView.jsx (equipment specs),
 *   Warranty module (template defaults), Vendor Portal (approved vendor list).
 */
const express = require('express');
const router = express.Router();
const Database = require('better-sqlite3');
const path = require('path');
const dataDir = require('../resolve_data_dir');
const authMiddleware = require('../middleware/auth');
const { logAudit } = require('../logistics_db');

const VERTICAL_PREFIXES = {
    dairy:         null,   // no prefix filter — dairy data is the default
    manufacturing: 'MFG-',
    mining:        'MIN-',
    energy:        'ENR-',
    agro:          'AGR-',
    water:         'WWT-',
    logistics:     'LOG-',
};

function getMasterDb() {
    const dbPath = path.join(dataDir, 'mfg_master.db');
    const db = new Database(dbPath, { readonly: true });
    db.pragma('journal_mode = WAL');
    return db;
}

function getMasterDbWrite() {
    const dbPath = path.join(dataDir, 'mfg_master.db');
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    return db;
}

// ── Stats summary ──────────────────────────────────────────────
router.get('/stats', (req, res) => {
    let db;
    try {
        db = getMasterDb();
        const equipment = db.prepare('SELECT COUNT(*) as c FROM MasterEquipment').get().c;
        const parts = db.prepare('SELECT COUNT(*) as c FROM MasterParts').get().c;
        const vendors = db.prepare('SELECT COUNT(*) as c FROM MasterVendors').get().c;
        const warranties = db.prepare('SELECT COUNT(*) as c FROM MasterWarrantyTemplates').get().c;
        const crossRefs = db.prepare('SELECT COUNT(*) as c FROM MasterCrossRef').get().c;
        res.json({ equipment, parts, vendors, warranties, crossRefs });
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if (db) db.close();
    }
});

// ── Equipment ──────────────────────────────────────────────────
router.get('/equipment', (req, res) => {
    let db;
    try {
        db = getMasterDb();
        const { q, sort, order, limit, offset, vertical } = req.query;
        let sql = 'SELECT * FROM MasterEquipment';
        const params = [];
        const verticalPrefix = VERTICAL_PREFIXES[vertical] ?? null;

        let conditions = [];
        if (verticalPrefix) {
            conditions.push('EquipmentTypeID LIKE ?');
            params.push(`${verticalPrefix}%`);
        }

        if (q) {
            conditions.push('(EquipmentTypeID LIKE ? OR Description LIKE ? OR Category LIKE ? OR TypicalMakers LIKE ?)');
            const like = `%${q}%`;
            params.push(like, like, like, like);
        }

        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }

        const validCols = ['EquipmentTypeID','Description','Category','PMIntervalDays','ExpectedMTBF_Hours','UsefulLifeYears'];
        if (sort && validCols.includes(sort)) {
            sql += ` ORDER BY ${sort} ${order === 'desc' ? 'DESC' : 'ASC'}`;
        } else {
            sql += ' ORDER BY Category, Description';
        }
        const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
        const total = db.prepare(countSql).get(...params).total;
        const lim = Math.min(parseInt(limit) || 100, 500);
        const off = parseInt(offset) || 0;
        sql += ' LIMIT ? OFFSET ?';
        params.push(lim, off);
        const rows = db.prepare(sql).all(...params);
        res.json({ rows, total, limit: lim, offset: off });
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if (db) db.close();
    }
});

// ── Parts ──────────────────────────────────────────────────────
router.get('/parts', (req, res) => {
    let db;
    try {
        db = getMasterDb();
        const { q, sort, order, limit, offset, vertical } = req.query;
        let sql = 'SELECT * FROM MasterParts';
        const params = [];
        const verticalPrefix = VERTICAL_PREFIXES[vertical] ?? null;
        const conditions = [];
        if (verticalPrefix) {
            conditions.push('MasterPartID LIKE ?');
            params.push(`${verticalPrefix}%`);
        }
        if (q) {
            conditions.push('(MasterPartID LIKE ? OR Description LIKE ? OR StandardizedName LIKE ? OR Manufacturer LIKE ? OR Category LIKE ?)');
            const like = `%${q}%`;
            params.push(like, like, like, like, like);
        }
        if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
        const validCols = ['MasterPartID','Description','Manufacturer','Category','SubCategory','TypicalPriceMin'];
        if (sort && validCols.includes(sort)) {
            sql += ` ORDER BY ${sort} ${order === 'desc' ? 'DESC' : 'ASC'}`;
        } else {
            sql += ' ORDER BY Category, Description';
        }
        const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
        const total = db.prepare(countSql).get(...params).total;
        const lim = Math.min(parseInt(limit) || 100, 500);
        const off = parseInt(offset) || 0;
        sql += ' LIMIT ? OFFSET ?';
        params.push(lim, off);
        const rows = db.prepare(sql).all(...params);
        res.json({ rows, total, limit: lim, offset: off });
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if (db) db.close();
    }
});

// ── Vendors ────────────────────────────────────────────────────
router.get('/vendors', (req, res) => {
    let db;
    try {
        db = getMasterDb();
        const { q, sort, order, limit, offset } = req.query;
        let sql = 'SELECT * FROM MasterVendors';
        const params = [];
        if (q) {
            sql += ' WHERE (VendorID LIKE ? OR CompanyName LIKE ? OR Categories LIKE ? OR Region LIKE ?)';
            const like = `%${q}%`;
            params.push(like, like, like, like);
        }
        const validCols = ['VendorID','CompanyName','Region','Categories'];
        if (sort && validCols.includes(sort)) {
            sql += ` ORDER BY ${sort} ${order === 'desc' ? 'DESC' : 'ASC'}`;
        } else {
            sql += ' ORDER BY CompanyName';
        }
        const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
        const total = db.prepare(countSql).get(...params).total;
        const lim = Math.min(parseInt(limit) || 100, 500);
        const off = parseInt(offset) || 0;
        sql += ' LIMIT ? OFFSET ?';
        params.push(lim, off);
        const rows = db.prepare(sql).all(...params);
        res.json({ rows, total, limit: lim, offset: off });
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if (db) db.close();
    }
});

// ── Warranties ─────────────────────────────────────────────────
router.get('/warranties', (req, res) => {
    let db;
    try {
        db = getMasterDb();
        const { q, limit, offset } = req.query;
        let sql = 'SELECT * FROM MasterWarrantyTemplates';
        const params = [];
        if (q) {
            sql += ' WHERE (EquipmentType LIKE ? OR VendorID LIKE ? OR CoverageDescription LIKE ?)';
            const like = `%${q}%`;
            params.push(like, like, like);
        }
        sql += ' ORDER BY EquipmentType';
        const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
        const total = db.prepare(countSql).get(...params).total;
        const lim = Math.min(parseInt(limit) || 100, 500);
        const off = parseInt(offset) || 0;
        sql += ' LIMIT ? OFFSET ?';
        params.push(lim, off);
        const rows = db.prepare(sql).all(...params);
        res.json({ rows, total, limit: lim, offset: off });
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if (db) db.close();
    }
});

// ── Cross-References ───────────────────────────────────────────
router.get('/crossref', (req, res) => {
    let db;
    try {
        db = getMasterDb();
        const { q, limit, offset } = req.query;
        let sql = 'SELECT * FROM MasterCrossRef';
        const params = [];
        if (q) {
            sql += ' WHERE (OEMPartNumber LIKE ? OR OEMVendor LIKE ? OR AftermarketPartNumber LIKE ? OR AftermarketVendor LIKE ?)';
            const like = `%${q}%`;
            params.push(like, like, like, like);
        }
        sql += ' ORDER BY OEMVendor, OEMPartNumber';
        const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
        const total = db.prepare(countSql).get(...params).total;
        const lim = Math.min(parseInt(limit) || 100, 500);
        const off = parseInt(offset) || 0;
        sql += ' LIMIT ? OFFSET ?';
        params.push(lim, off);
        const rows = db.prepare(sql).all(...params);
        res.json({ rows, total, limit: lim, offset: off });
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if (db) db.close();
    }
});

// ── Search ─────────────────────────────────────────────────────
router.get('/search', (req, res) => {
    let db;
    try {
        let { q, verticals, type, limit } = req.query;
        if (!q || q.trim() === '') {
            return res.status(400).json({ error: 'q is required' });
        }
        q = q.trim().slice(0, 100);
        const lim = Math.min(parseInt(limit) || 50, 200);
        if (lim <= 0) return res.status(400).json({ error: 'Invalid limit' });
        
        type = type || 'all';
        let filterParts = type === 'all' || type === 'parts';
        let filterEquip = type === 'all' || type === 'equipment';

        let verticalPrefixes = [];
        if (verticals) {
            verticalPrefixes = verticals.split(',').map(v => v.trim()).filter(v => v);
        }

        db = getMasterDb();
        const like = `%${q}%`;
        const parts = [];
        const equipment = [];
        
        if (filterParts) {
            let sql = 'SELECT * FROM MasterParts WHERE (Description LIKE ? OR Tags LIKE ? OR MasterPartID LIKE ?)';
            const params = [like, like, like];
            if (verticalPrefixes.length > 0) {
                const prefixClauses = verticalPrefixes.map(() => 'MasterPartID LIKE ?').join(' OR ');
                sql += ` AND (${prefixClauses})`;
                verticalPrefixes.forEach(v => params.push(`${v}-%`));
            }
            sql += ' LIMIT ?';
            params.push(lim);
            parts.push(...db.prepare(sql).all(...params));
            
            // OEM Join
            let oemSql = `
                SELECT MasterParts.* FROM MasterParts
                JOIN OEMCrossReference ON OEMCrossReference.MasterPartID = MasterParts.MasterPartID
                WHERE OEMCrossReference.OEMPartNumber LIKE ?
                LIMIT ?
            `;
            const oemParams = [like, lim];
            try {
                const oemMatches = db.prepare(oemSql).all(...oemParams);
                for (const match of oemMatches) {
                    match.matchedByOEM = true;
                    if (!parts.some(p => p.MasterPartID === match.MasterPartID)) {
                        parts.push(match);
                    }
                }
            } catch (e) {
                if (!e.message.includes('no such table')) {
                    throw e;
                }
            }
        }
        
        if (filterEquip) {
            let sql = 'SELECT * FROM MasterEquipment WHERE (Description LIKE ? OR EquipmentTypeID LIKE ? OR Category LIKE ?)';
            const params = [like, like, like];
            if (verticalPrefixes.length > 0) {
                const prefixClauses = verticalPrefixes.map(() => 'EquipmentTypeID LIKE ?').join(' OR ');
                sql += ` AND (${prefixClauses})`;
                verticalPrefixes.forEach(v => params.push(`${v}-%`));
            }
            sql += ' LIMIT ?';
            params.push(lim);
            equipment.push(...db.prepare(sql).all(...params));
        }

        // Deduplicate
        const uniqueParts = Array.from(new Map(parts.map(p => [p.MasterPartID, p])).values()).slice(0, lim);
        const uniqueEquip = Array.from(new Map(equipment.map(e => [e.EquipmentTypeID, e])).values()).slice(0, lim);

        res.json({ parts: uniqueParts, equipment: uniqueEquip, total: uniqueParts.length + uniqueEquip.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if (db) db.close();
    }
});

// ── Cross-Reference Create ─────────────────────────────────────
router.post('/cross-ref', authMiddleware, (req, res) => {
    let db;
    try {
        let { type, masterPartId, oemManufacturer, oemPartNumber, notes, verticalPartId, corePartId } = req.body;
        
        if (type !== 'OEM' && type !== 'VERTICAL_CORE') {
            return res.status(400).json({ error: "type must be exactly 'OEM' or 'VERTICAL_CORE'" });
        }
        
        db = getMasterDbWrite();

        if (type === 'OEM') {
            if (!masterPartId || !oemManufacturer || !oemPartNumber || typeof masterPartId !== 'string' || typeof oemManufacturer !== 'string' || typeof oemPartNumber !== 'string') {
                return res.status(400).json({ error: 'masterPartId, oemManufacturer, oemPartNumber are required' });
            }
            masterPartId = masterPartId.trim().slice(0, 100);
            oemManufacturer = oemManufacturer.trim().slice(0, 100);
            oemPartNumber = oemPartNumber.trim().slice(0, 100);
            notes = notes ? String(notes).trim().slice(0, 500) : null;
            
            if (!masterPartId || !oemManufacturer || !oemPartNumber) {
                return res.status(400).json({ error: 'masterPartId, oemManufacturer, oemPartNumber are required' });
            }

            db.prepare(`
                INSERT INTO OEMCrossReference (MasterPartID, OEMManufacturer, OEMPartNumber, Notes, CreatedAt, CreatedBy)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(masterPartId, oemManufacturer, oemPartNumber, notes, new Date().toISOString(), req.user.Username);
            
            logAudit(req.user.Username, 'CATALOG_CROSS_REF_CREATED', null, { type, masterPartId, oemManufacturer, oemPartNumber });
            const lastInsertRowid = db.prepare('SELECT last_insert_rowid() as id').get().id;
            return res.status(201).json({ success: true, id: lastInsertRowid });
        } else if (type === 'VERTICAL_CORE') {
            if (!verticalPartId || !corePartId || typeof verticalPartId !== 'string' || typeof corePartId !== 'string') {
                return res.status(400).json({ error: 'verticalPartId and corePartId are required' });
            }
            verticalPartId = verticalPartId.trim().slice(0, 100);
            corePartId = corePartId.trim().slice(0, 100);
            notes = notes ? String(notes).trim().slice(0, 500) : null;
            
            if (!verticalPartId || !corePartId) {
                return res.status(400).json({ error: 'verticalPartId and corePartId are required' });
            }

            const vpExists = db.prepare('SELECT 1 FROM MasterParts WHERE MasterPartID = ?').get(verticalPartId);
            if (!vpExists) return res.status(404).json({ error: `Part not found: ${verticalPartId}` });
            
            const cpExists = db.prepare('SELECT 1 FROM MasterParts WHERE MasterPartID = ?').get(corePartId);
            if (!cpExists) return res.status(404).json({ error: `Part not found: ${corePartId}` });

            db.prepare(`
                INSERT INTO VerticalCoreMapping (VerticalPartID, CorePartID, Notes, CreatedAt, CreatedBy)
                VALUES (?, ?, ?, ?, ?)
            `).run(verticalPartId, corePartId, notes, new Date().toISOString(), req.user.Username);
            
            logAudit(req.user.Username, 'CATALOG_CROSS_REF_CREATED', null, { type, verticalPartId, corePartId });
            const lastInsertRowid = db.prepare('SELECT last_insert_rowid() as id').get().id;
            return res.status(201).json({ success: true, id: lastInsertRowid });
        }
    } catch (e) {
        if (e.message.includes('UNIQUE constraint')) {
            return res.status(409).json({ error: 'Cross-reference already exists' });
        }
        res.status(500).json({ error: e.message });
    } finally {
        if (db) db.close();
    }
});

module.exports = router;
