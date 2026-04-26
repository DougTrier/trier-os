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
 *   GET  /search                        Cross-vertical catalog search (parts + equipment + OEM cross-ref)
 *   GET  /onboarding/equipment          Flat equipment array for Onboarding Console (mfg_master.db)
 *   GET  /onboarding/parts             Flat parts array for Onboarding Console (mfg_master.db)
 *   GET  /onboarding/vendors           Flat vendor array for Onboarding Console (mfg_master.db)
 *   GET  /equipment/:typeId/typical-parts  MasterParts linked to a given equipment type
 *
 * DATABASE: mfg_master.db — an industry-wide reference database, not per-plant data.
 *   Tables: MasterEquipment, MasterParts, MasterVendors, MasterWarrantyTemplates, MasterCrossRef
 *   Opened in read-only mode; writes go through the catalog enrichment admin workflow.
 *
 * CONSUMERS: StoreroomView.jsx (part suggestions), AssetView.jsx (equipment specs),
 *   Warranty module (template defaults), Vendor Portal (approved vendor list).
 */
const express    = require('express');
const router     = express.Router();
const Database   = require('better-sqlite3');
const path       = require('path');
const fs         = require('fs');
const { pipeline } = require('stream');
const { promisify } = require('util');
const multer     = require('multer');
const dataDir    = require('../resolve_data_dir');
const authMiddleware = require('../middleware/auth');
const { logAudit } = require('../logistics_db');

const pipelineAsync = promisify(pipeline);

// Artifact file storage — data/artifacts/{artifactId}/{filename}
const ARTIFACTS_DIR = path.join(dataDir, 'artifacts');
if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

const ALLOWED_MIME = new Set([
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
    'application/pdf',
    'model/stl', 'application/octet-stream',       // STL
    'application/step', 'model/step',              // STEP
    'application/dxf',                             // DXF
    'model/gltf+json', 'model/gltf-binary',        // GLTF/GLB
    'application/vnd.ms-pki.stl',                  // STL alt
]);
const ALLOWED_EXT = new Set([
    '.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg',
    '.pdf',
    '.stl', '.step', '.stp', '.dxf', '.obj', '.gltf', '.glb', '.ifc',
]);

// MIME type by extension for files where browsers lie
const EXT_MIME = {
    '.stl': 'model/stl', '.step': 'application/step', '.stp': 'application/step',
    '.dxf': 'application/dxf', '.obj': 'model/obj', '.gltf': 'model/gltf+json',
    '.glb': 'model/gltf-binary', '.ifc': 'application/x-ifc',
    '.pdf': 'application/pdf', '.svg': 'image/svg+xml',
};

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
    fileFilter(req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, ALLOWED_EXT.has(ext));
    },
});

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

        if (req.query.category) {
            conditions.push('Category = ?');
            params.push(req.query.category);
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
        if (req.query.category) {
            conditions.push('Category = ?');
            params.push(req.query.category);
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

// ── Onboarding console endpoints (flat arrays, no {rows} wrapper) ───────────
// These serve the Enterprise Onboarding Console from mfg_master.db directly,
// replacing the old GlobalParts/GlobalAssets logistics endpoints which contained
// messy real-plant data (not curated master records).

router.get('/onboarding/equipment', (req, res) => {
    let db;
    try {
        db = getMasterDb();
        const { q, limit, offset } = req.query;
        const params = [];
        let sql = 'SELECT EquipmentTypeID, Description, Category, TypicalMakers, PMIntervalDays, ExpectedMTBF_Hours, ExpectedMTTR_Hours, UsefulLifeYears, TypicalWarrantyMonths, CommonFailureModes, Specifications FROM MasterEquipment';
        if (q) {
            sql += ' WHERE (EquipmentTypeID LIKE ? OR Description LIKE ? OR Category LIKE ? OR TypicalMakers LIKE ?)';
            const like = `%${q}%`;
            params.push(like, like, like, like);
        }
        sql += ' ORDER BY Category, Description';
        const lim = Math.min(parseInt(limit) || 500, 500);
        const off = parseInt(offset) || 0;
        sql += ' LIMIT ? OFFSET ?';
        params.push(lim, off);
        const rows = db.prepare(sql).all(...params);
        const enriched = rows.map(r => {
            let makers = [];
            try { makers = JSON.parse(r.TypicalMakers || '[]'); } catch {}
            return { ...r, primaryMaker: makers[0] || null, allMakers: makers };
        });
        res.json(enriched);
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if (db) db.close();
    }
});

router.get('/onboarding/parts', (req, res) => {
    let db;
    try {
        db = getMasterDb();
        const { q, limit, offset } = req.query;
        const params = [];
        let sql = 'SELECT MasterPartID, Description, StandardizedName, Manufacturer, Category, SubCategory, UOM, TypicalPriceMin, TypicalPriceMax, LeadTimeDays FROM MasterParts';
        if (q) {
            sql += ' WHERE (MasterPartID LIKE ? OR Description LIKE ? OR StandardizedName LIKE ? OR Manufacturer LIKE ? OR Category LIKE ?)';
            const like = `%${q}%`;
            params.push(like, like, like, like, like);
        }
        sql += ' ORDER BY Category, Description';
        const lim = Math.min(parseInt(limit) || 200, 500);
        const off = parseInt(offset) || 0;
        sql += ' LIMIT ? OFFSET ?';
        params.push(lim, off);
        res.json(db.prepare(sql).all(...params));
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if (db) db.close();
    }
});

router.get('/onboarding/vendors', (req, res) => {
    let db;
    try {
        db = getMasterDb();
        const { q, limit, offset } = req.query;
        const params = [];
        let sql = 'SELECT VendorID, CompanyName, Website, Phone, Address, Region, Categories, WarrantyPolicy, ServiceSLA, SalesRepName, SalesRepPhone, SalesRepEmail FROM MasterVendors';
        if (q) {
            sql += ' WHERE (VendorID LIKE ? OR CompanyName LIKE ? OR Categories LIKE ? OR Region LIKE ?)';
            const like = `%${q}%`;
            params.push(like, like, like, like);
        }
        sql += ' ORDER BY CompanyName';
        const lim = Math.min(parseInt(limit) || 300, 500);
        const off = parseInt(offset) || 0;
        sql += ' LIMIT ? OFFSET ?';
        params.push(lim, off);
        res.json(db.prepare(sql).all(...params));
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if (db) db.close();
    }
});

// Typical parts for a given equipment type — used in onboarding preview pane
// MasterParts.EquipmentTypes is a comma-separated or JSON list of EquipmentTypeIDs
router.get('/equipment/:typeId/typical-parts', (req, res) => {
    let db;
    try {
        const typeId = String(req.params.typeId || '').trim().slice(0, 100);
        if (!typeId) return res.status(400).json({ error: 'typeId required' });
        db = getMasterDb();
        const rows = db.prepare(`
            SELECT MasterPartID, Description, StandardizedName, Manufacturer, Category, UOM, TypicalPriceMin, TypicalPriceMax
            FROM MasterParts
            WHERE EquipmentTypes LIKE ?
            ORDER BY Category, Description
            LIMIT 50
        `).all(`%${typeId}%`);
        res.json(rows);
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

// ── Equipment search (text fallback or vector when Gemini key configured) ────

// GET /api/catalog/equipment/semantic?q=<query>&k=5
// Without GEMINI_API_KEY: full-text LIKE search across Description + Category.
// With GEMINI_API_KEY + populated equipment_vec_map: semantic vector search.
// Response includes searchMode:'text'|'vector' so the UI can label correctly.
router.get('/equipment/semantic', async (req, res) => {
    const query = (req.query.q || '').trim();
    const k     = Math.min(parseInt(req.query.k) || 5, 20);
    if (!query) return res.status(400).json({ error: 'q parameter required' });

    const GEMINI_KEY = process.env.GEMINI_API_KEY || (() => {
        try { return require('fs').readFileSync(require('path').join(__dirname, '../../.env'), 'utf8').match(/GEMINI_API_KEY=(.+)/)?.[1]?.trim(); } catch { return null; }
    })();

    // ── Text search fallback — always works, no API key needed ───────────────
    function textSearch(db) {
        const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
        if (terms.length === 0) return [];
        const clauses = terms.map(() =>
            `(LOWER(COALESCE(Description,'')) LIKE ? OR LOWER(COALESCE(Category,'')) LIKE ?)`
        ).join(' AND ');
        const params = terms.flatMap(t => [`%${t}%`, `%${t}%`]);
        const rows = db.prepare(
            `SELECT EquipmentTypeID, Description, Category, TypicalMakers, PMIntervalDays
             FROM MasterEquipment WHERE ${clauses} LIMIT ?`
        ).all(...params, k);
        return rows.map(eq => {
            let makers = [];
            try { makers = JSON.parse(eq.TypicalMakers || '[]'); } catch {}
            return { id: eq.EquipmentTypeID, description: eq.Description, category: eq.Category,
                     primaryMaker: makers[0] || null, pmIntervalDays: eq.PMIntervalDays, similarity: null };
        });
    }

    if (!GEMINI_KEY) {
        let db;
        try {
            db = getMasterDb();
            return res.json({ query, results: textSearch(db), searchMode: 'text' });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        } finally {
            if (db) db.close();
        }
    }

    // ── Vector search — requires Gemini key + pre-computed embeddings ─────────
    let db;
    try {
        const sqliteVec = require('sqlite-vec');
        db = getMasterDb();
        sqliteVec.load(db);

        // Fall back to text if embeddings table not yet populated
        let vecCount = 0;
        try { vecCount = db.prepare('SELECT COUNT(*) AS n FROM equipment_vec_map').get().n; } catch {}
        if (vecCount === 0) {
            return res.json({ query, results: textSearch(db), searchMode: 'text' });
        }

        const vecValues = await new Promise((resolve, reject) => {
            const https = require('https');
            const body  = JSON.stringify({ model: 'models/gemini-embedding-2', content: { parts: [{ text: query }] }, taskType: 'RETRIEVAL_QUERY' });
            const req2  = https.request({
                hostname: 'generativelanguage.googleapis.com',
                path: `/v1beta/models/gemini-embedding-2:embedContent?key=${GEMINI_KEY}`,
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
            }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { resolve(JSON.parse(d).embedding?.values || null); } catch { resolve(null); } }); });
            req2.on('error', reject);
            req2.setTimeout(8000, () => { req2.destroy(); reject(new Error('Embedding timeout')); });
            req2.write(body); req2.end();
        });

        // Embedding call failed — fall back gracefully
        if (!vecValues) {
            return res.json({ query, results: textSearch(db), searchMode: 'text' });
        }

        const queryBuf = Buffer.from(new Float32Array(vecValues).buffer);
        const hits = db.prepare(`
            SELECT m.typeId, v.distance
            FROM equipment_vec v
            JOIN equipment_vec_map m ON m.rowid = v.rowid
            WHERE v.embedding MATCH ? AND k = ?
            ORDER BY v.distance
        `).all(queryBuf, k);

        const results = hits.map(h => {
            const eq = db.prepare('SELECT EquipmentTypeID, Description, Category, TypicalMakers, PMIntervalDays FROM MasterEquipment WHERE EquipmentTypeID = ?').get(h.typeId);
            if (!eq) return null;
            let makers = [];
            try { makers = JSON.parse(eq.TypicalMakers || '[]'); } catch {}
            return {
                id: eq.EquipmentTypeID,
                description: eq.Description,
                category: eq.Category,
                primaryMaker: makers[0] || null,
                pmIntervalDays: eq.PMIntervalDays,
                similarity: Math.max(0, Math.round((1 - h.distance / 2) * 100)),
            };
        }).filter(Boolean);

        res.json({ query, results, searchMode: 'vector' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if (db) db.close();
    }
});

// ── Unified artifact intelligence layer ─────────────────────────────────────

// GET /api/catalog/artifacts
// Browse catalog_artifacts (the canonical unified layer) with filters.
// ?type=    artifact_type  (twin|cad|vector_drawing|manual|nameplate|photo|live_data)
// ?role=    artifact_role  (reference|operational|analytical)
// ?cad=1    shortcut: type=cad only
// ?format=  explicit format filter (STEP|DXF|SVG|...)
// ?q=       search on EntityID, FileURL, Source
// ?limit= ?offset= ?sort= ?order=
router.get('/artifacts', (req, res) => {
    const CAD_FORMATS = ['STEP','STP','DXF','IFC','OBJ','STL','DWG','IGES','IGS'];
    let db;
    try {
        db = getMasterDb();
        const limit   = Math.min(parseInt(req.query.limit) || 50, 200);
        const offset  = parseInt(req.query.offset) || 0;
        const q       = (req.query.q || '').trim();
        const type    = req.query.type || '';
        const role    = req.query.role || '';
        const format  = (req.query.format || '').toUpperCase();
        const cadOnly = req.query.cad === '1';
        const sort    = ['EntityID','ArtifactType','ArtifactRole','Format','Source','Confidence','CreatedAt'].includes(req.query.sort) ? req.query.sort : 'Confidence';
        const order   = req.query.order === 'asc' ? 'ASC' : 'DESC';

        const conditions = [];
        const params     = [];

        if (q) {
            conditions.push('(a.EntityID LIKE ? OR a.FileURL LIKE ? OR a.Source LIKE ?)');
            params.push(`%${q}%`, `%${q}%`, `%${q}%`);
        }
        if (cadOnly) {
            conditions.push(`upper(a.Format) IN (${CAD_FORMATS.map(() => '?').join(',')})`);
            params.push(...CAD_FORMATS);
        } else if (type) {
            conditions.push('a.ArtifactType = ?'); params.push(type);
        }
        if (role)   { conditions.push('a.ArtifactRole = ?');    params.push(role); }
        if (format && !cadOnly) { conditions.push('upper(a.Format) = ?'); params.push(format); }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const rows = db.prepare(`
            SELECT a.ArtifactID, a.EntityType, a.EntityID, a.ArtifactType, a.ArtifactRole,
                   a.Format, a.Source, a.FileURL, a.PreviewURL, a.Confidence, a.Verified,
                   a.CreatedAt, a.MetadataJSON, a.LinksJSON,
                   e.Description AS EquipmentDescription,
                   e.Category    AS EquipmentCategory
            FROM catalog_artifacts a
            LEFT JOIN MasterEquipment e ON e.EquipmentTypeID = a.EntityID AND a.EntityType = 'equipment_type'
            ${where}
            ORDER BY a.${sort} ${order}
            LIMIT ? OFFSET ?
        `).all(...params, limit, offset);

        const total = db.prepare(`SELECT COUNT(*) AS n FROM catalog_artifacts a ${where}`).get(...params).n;

        res.json({ rows, total });
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if (db) db.close();
    }
});

// GET /api/catalog/artifacts/stats
router.get('/artifacts/stats', (req, res) => {
    let db;
    try {
        db = getMasterDb();
        const total     = db.prepare('SELECT COUNT(*) AS n FROM catalog_artifacts').get().n;
        const verified  = db.prepare('SELECT COUNT(*) AS n FROM catalog_artifacts WHERE Verified = 1').get().n;
        const byType    = db.prepare('SELECT ArtifactType, COUNT(*) AS n FROM catalog_artifacts GROUP BY ArtifactType ORDER BY n DESC').all();
        const byRole    = db.prepare('SELECT ArtifactRole, COUNT(*) AS n FROM catalog_artifacts GROUP BY ArtifactRole ORDER BY n DESC').all();
        const byFormat  = db.prepare('SELECT Format, COUNT(*) AS n FROM catalog_artifacts WHERE Format IS NOT NULL GROUP BY Format ORDER BY n DESC LIMIT 10').all();
        res.json({ total, verified, byType, byRole, byFormat });
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if (db) db.close();
    }
});

// ── Digital Twin catalog endpoints (legacy — kept for backward compat) ────────

// GET /api/catalog/twins
// Browse all CatalogTwins with pagination, search, and filter.
// ?q=   full-text search on RefID + TwinURL
// ?submodel=   filter by SubmodelType (Geometry|Documentation|Nameplate|LiveData)
// ?format=     filter by TwinFormat (STEP|DXF|IFC|OBJ|PDF|...)
// ?cad=1       shortcut: only CAD-renderable formats (STEP|STP|DXF|IFC|OBJ|STL|DWG)
// ?limit= ?offset= ?sort= ?order=
router.get('/twins', (req, res) => {
    const CAD_FORMATS = ['STEP','STP','DXF','IFC','OBJ','STL','DWG','IGES','IGS'];
    let db;
    try {
        db = getMasterDb();
        const limit   = Math.min(parseInt(req.query.limit) || 50, 200);
        const offset  = parseInt(req.query.offset) || 0;
        const q       = (req.query.q || '').trim();
        const submodel = req.query.submodel || '';
        const format   = (req.query.format || '').toUpperCase();
        const cadOnly  = req.query.cad === '1';
        const sort     = ['RefID','Source','TwinFormat','SubmodelType','ConfScore','DiscoveredAt'].includes(req.query.sort) ? req.query.sort : 'ConfScore';
        const order    = req.query.order === 'asc' ? 'ASC' : 'DESC';

        const conditions = [];
        const params     = [];

        if (q) {
            conditions.push('(RefID LIKE ? OR TwinURL LIKE ? OR Source LIKE ?)');
            params.push(`%${q}%`, `%${q}%`, `%${q}%`);
        }
        if (submodel) { conditions.push('SubmodelType = ?'); params.push(submodel); }
        if (cadOnly) {
            conditions.push(`upper(TwinFormat) IN (${CAD_FORMATS.map(() => '?').join(',')})`);
            params.push(...CAD_FORMATS);
        } else if (format) {
            conditions.push('upper(TwinFormat) = ?'); params.push(format);
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        // Join MasterEquipment to get human-readable description
        const rows = db.prepare(`
            SELECT t.TwinID, t.RefType, t.RefID, t.Source, t.TwinURL, t.TwinFormat,
                   t.SubmodelType, t.ConfScore, t.Validated, t.DiscoveredAt, t.AAS_ID,
                   e.Description AS EquipmentDescription, e.Category AS EquipmentCategory
            FROM CatalogTwins t
            LEFT JOIN MasterEquipment e ON e.EquipmentTypeID = t.RefID AND t.RefType = 'equipment'
            ${where}
            ORDER BY t.${sort} ${order}
            LIMIT ? OFFSET ?
        `).all(...params, limit, offset);

        const total = db.prepare(`SELECT COUNT(*) AS n FROM CatalogTwins t ${where}`).get(...params).n;

        res.json({ rows, total });
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if (db) db.close();
    }
});

// GET /api/catalog/twins/:refType/:refId
// Returns all CatalogTwins for an equipment type or part, ordered by confidence.
router.get('/twins/:refType/:refId', (req, res) => {
    const { refType, refId } = req.params;
    if (!['equipment', 'part'].includes(refType)) return res.status(400).json({ error: 'refType must be equipment or part' });
    let db;
    try {
        db = getMasterDb();
        const twins = db.prepare(
            'SELECT TwinID, Source, TwinURL, TwinFormat, SubmodelType, AAS_ID, ConfScore, Validated, DiscoveredAt FROM CatalogTwins WHERE RefType = ? AND RefID = ? ORDER BY Validated DESC, ConfScore DESC'
        ).all(refType, refId);
        res.json(twins);
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if (db) db.close();
    }
});

// GET /api/catalog/twins/stats
// Summary counts for the CatalogTwins table.
router.get('/twins/stats', (req, res) => {
    let db;
    try {
        db = getMasterDb();
        const total    = db.prepare('SELECT COUNT(*) AS n FROM CatalogTwins').get().n;
        const validated = db.prepare('SELECT COUNT(*) AS n FROM CatalogTwins WHERE Validated = 1').get().n;
        const bySource = db.prepare('SELECT Source, COUNT(*) AS n FROM CatalogTwins GROUP BY Source ORDER BY n DESC').all();
        const bySubmodel = db.prepare('SELECT SubmodelType, COUNT(*) AS n FROM CatalogTwins GROUP BY SubmodelType ORDER BY n DESC').all();
        res.json({ total, validated, bySource, bySubmodel });
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if (db) db.close();
    }
});

// ── Context-aware artifact surfacing ─────────────────────────────────────────

// GET /api/catalog/artifacts/context
// Returns the highest-priority artifacts for a given trigger.
// ?triggerType=  failure_mode | failure_class | state | procedure
// ?triggerValue= SEAL_LEAK | MECHANICAL | maintenance | ...
// ?entityId=     equipment_type ID (optional — narrows to entity-specific first)
// ?k=            max results (default 5)
router.get('/artifacts/context', (req, res) => {
    let db;
    try {
        db = getMasterDb();
        const { triggerType, triggerValue, entityId } = req.query;
        if (!triggerType || !triggerValue) return res.status(400).json({ error: 'triggerType and triggerValue required' });
        const k = Math.min(parseInt(req.query.k) || 5, 20);

        // Phase 1: entity-specific rules (exact artifact_id matches)
        const specific = entityId ? db.prepare(`
            SELECT m.Priority, a.ArtifactID, a.EntityID, a.ArtifactType, a.ArtifactRole,
                   a.Format, a.Source, a.FileURL, a.Confidence, a.Verified, a.IsActive,
                   e.Description AS EquipmentDescription
            FROM artifact_context_map m
            JOIN catalog_artifacts a ON a.ArtifactID = m.ArtifactID
            LEFT JOIN MasterEquipment e ON e.EquipmentTypeID = a.EntityID
            WHERE m.TriggerType = ? AND m.TriggerValue = ?
              AND (m.EntityID = ? OR m.EntityID IS NULL)
              AND m.ArtifactID IS NOT NULL
              AND a.IsActive = 1
            ORDER BY m.Priority ASC
            LIMIT ?
        `).all(triggerType, triggerValue, entityId, k) : [];

        // Phase 2: class rules (match by ArtifactType pattern, optionally scoped to entityId)
        const classRules = db.prepare(`
            SELECT m.Priority, m.ArtifactType AS MatchType,
                   a.ArtifactID, a.EntityID, a.ArtifactType, a.ArtifactRole,
                   a.Format, a.Source, a.FileURL, a.Confidence, a.Verified, a.IsActive,
                   e.Description AS EquipmentDescription
            FROM artifact_context_map m
            JOIN catalog_artifacts a ON a.ArtifactType = m.ArtifactType
            LEFT JOIN MasterEquipment e ON e.EquipmentTypeID = a.EntityID
            WHERE m.TriggerType = ? AND m.TriggerValue = ?
              AND m.ArtifactID IS NULL
              AND a.IsActive = 1
              ${entityId ? 'AND a.EntityID = ?' : ''}
            ORDER BY m.Priority ASC, a.Confidence DESC
            LIMIT ?
        `).all(...(entityId ? [triggerType, triggerValue, entityId, k] : [triggerType, triggerValue, k]));

        // Merge: specific first, then class rules, deduplicate by ArtifactID
        const seen = new Set();
        const results = [];
        for (const r of [...specific, ...classRules]) {
            if (!seen.has(r.ArtifactID)) { seen.add(r.ArtifactID); results.push(r); }
            if (results.length >= k) break;
        }

        res.json({ triggerType, triggerValue, entityId: entityId || null, results });
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if (db) db.close();
    }
});

// ── Artifact usage feedback ───────────────────────────────────────────────────

// POST /api/catalog/artifacts/:id/usage
// Record that an artifact was opened (and optionally whether it resolved the issue).
// Body: { assetId?, workOrderId?, procedureId?, failureMode?, resolvedIssue?, feedbackNote? }
router.post('/artifacts/:id/usage', (req, res) => {
    const artifactId = parseInt(req.params.id);
    if (!artifactId) return res.status(400).json({ error: 'Invalid artifact ID' });
    try {
        const plantDb = require('../database');
        const plant = plantDb();
        const hasTable = plant.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='artifact_usage'"
        ).get();
        if (!hasTable) return res.status(503).json({ error: 'artifact_usage table not available' });

        const { assetId, workOrderId, procedureId, failureMode, resolvedIssue, feedbackNote } = req.body;
        const row = plant.prepare(`
            INSERT INTO artifact_usage
                (ArtifactID, AssetID, WorkOrderID, ProcedureID, FailureMode, OpenedBy, ResolvedIssue, FeedbackNote)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            artifactId,
            assetId || null,
            workOrderId || null,
            procedureId || null,
            failureMode || null,
            req.user?.Username || 'unknown',
            resolvedIssue != null ? (resolvedIssue ? 1 : 0) : null,
            feedbackNote || null
        );

        res.json({ success: true, usageId: row.lastInsertRowid });
    } catch (e) {
        console.error('[artifact usage]', e.message);
        res.status(500).json({ error: e.message });
    }
});

// GET /api/catalog/artifacts/ranked
// Top artifacts by effectiveness (resolution rate × recency).
// ?limit= default 20  ?minUses= default 3 (exclude rarely used)
router.get('/artifacts/ranked', (req, res) => {
    let mfg;
    try {
        mfg = getMasterDb();
        const limit    = Math.min(parseInt(req.query.limit) || 20, 100);
        const minUses  = parseInt(req.query.minUses) || 3;

        // Aggregate usage across all plant DBs
        const dataDir = require('path').join(__dirname, '..', '..', 'data');
        const plantFiles = require('fs').readdirSync(dataDir)
            .filter(f => f.endsWith('.db') && !f.includes('mfg_master') && !f.includes('trier_logistics') && !f.includes('auth_db'));

        const usageMap = {};
        for (const f of plantFiles) {
            try {
                const pdb = new (require('better-sqlite3'))(require('path').join(dataDir, f));
                const has = pdb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='artifact_usage'").get();
                if (!has) { pdb.close(); continue; }
                const rows = pdb.prepare(`
                    SELECT ArtifactID,
                           COUNT(*) AS totalUses,
                           SUM(CASE WHEN ResolvedIssue = 1 THEN 1 ELSE 0 END) AS resolutions,
                           MAX(OpenedAt) AS lastUsed
                    FROM artifact_usage GROUP BY ArtifactID
                `).all();
                for (const r of rows) {
                    if (!usageMap[r.ArtifactID]) usageMap[r.ArtifactID] = { totalUses: 0, resolutions: 0, lastUsed: null };
                    usageMap[r.ArtifactID].totalUses   += r.totalUses;
                    usageMap[r.ArtifactID].resolutions += r.resolutions;
                    if (!usageMap[r.ArtifactID].lastUsed || r.lastUsed > usageMap[r.ArtifactID].lastUsed) {
                        usageMap[r.ArtifactID].lastUsed = r.lastUsed;
                    }
                }
                pdb.close();
            } catch (_) {}
        }

        // Score: (resolutions / totalUses) * recency_weight
        const now = Date.now();
        const scored = Object.entries(usageMap)
            .filter(([, u]) => u.totalUses >= minUses)
            .map(([id, u]) => {
                const recencyMs = u.lastUsed ? (now - new Date(u.lastUsed).getTime()) : Infinity;
                const recencyWeight = Math.max(0.2, 1 - recencyMs / (1000 * 60 * 60 * 24 * 90)); // decays over 90 days
                const resolutionRate = u.resolutions / u.totalUses;
                return { artifactId: parseInt(id), ...u, resolutionRate, effectivenessScore: resolutionRate * recencyWeight };
            })
            .sort((a, b) => b.effectivenessScore - a.effectivenessScore)
            .slice(0, limit);

        // Enrich with artifact details
        const results = scored.map(s => {
            try {
                const a = mfg.prepare('SELECT ArtifactID, EntityID, ArtifactType, Format, Source, FileURL, Confidence, Verified FROM catalog_artifacts WHERE ArtifactID = ?').get(s.artifactId);
                return a ? { ...s, ...a } : s;
            } catch { return s; }
        });

        res.json({ results, totalTracked: Object.keys(usageMap).length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if (mfg) mfg.close();
    }
});

// ── Artifact local file upload ───────────────────────────────────────────────

// POST /api/catalog/artifacts/upload
// Attach a local file to a catalog_artifacts record (or create a new one).
// Body (multipart/form-data):
//   file        — the file
//   entityId    — equipment type ID (e.g. HTST_PASTEURIZER)
//   entityType  — 'equipment_type' (default) | 'part'
//   artifactType — 'twin' | 'cad' | 'manual' | 'photo' | 'schematic'
//   artifactId  — optional existing ArtifactID to update
router.post('/artifacts/upload', authMiddleware, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded or file type not allowed' });

    const { entityId, entityType = 'equipment_type', artifactType = 'twin', artifactId } = req.body;
    if (!entityId) return res.status(400).json({ error: 'entityId required' });

    const ext      = path.extname(req.file.originalname).toLowerCase();
    const mime     = EXT_MIME[ext] || req.file.mimetype;
    const format   = ext.replace('.', '').toUpperCase();

    let db;
    try {
        db = getMasterDbWrite();

        // Determine which artifact record to update or create
        let targetId = artifactId ? parseInt(artifactId, 10) : null;
        if (!targetId) {
            // Create new artifact record
            const ins = db.prepare(`
                INSERT INTO catalog_artifacts
                    (EntityType, EntityID, ArtifactType, ArtifactRole, Format, Source, is_local, CreatedBy, CreatedAt)
                VALUES (?, ?, ?, ?, ?, 'manual_upload', 1, ?, datetime('now'))
            `);
            const role = artifactType === 'cad' ? 'reference' : artifactType === 'twin' ? 'analytical' : 'reference';
            const result = ins.run(entityType, entityId, artifactType, role, format,
                req.user?.Username || 'admin');
            targetId = result.lastInsertRowid;
        }

        // Write file to data/artifacts/{targetId}/
        const artifactDir = path.join(ARTIFACTS_DIR, String(targetId));
        if (!fs.existsSync(artifactDir)) fs.mkdirSync(artifactDir, { recursive: true });
        const filePath = path.join(artifactDir, req.file.originalname);
        fs.writeFileSync(filePath, req.file.buffer);

        const relPath = path.join(String(targetId), req.file.originalname);
        db.prepare(`
            UPDATE catalog_artifacts
            SET local_path = ?, mime_type = ?, is_local = 1, file_name = ?, file_size = ?
            WHERE ArtifactID = ?
        `).run(relPath, mime, req.file.originalname, req.file.size, targetId);

        res.json({ ok: true, artifactId: targetId, localPath: relPath, mime, format });
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if (db) db.close();
    }
});

// ── Artifact serve (local files only) ───────────────────────────────────────

// GET /api/catalog/serve/:artifactId
// Streams the locally stored file. No external redirects — if not local, 404.
router.get('/serve/:artifactId', authMiddleware, (req, res) => {
    const artifactId = parseInt(req.params.artifactId, 10);
    if (!Number.isInteger(artifactId) || artifactId <= 0) return res.status(400).end();

    let db;
    try {
        db = getMasterDb();
        const row = db.prepare(
            'SELECT local_path, mime_type, file_name FROM catalog_artifacts WHERE ArtifactID = ? AND is_local = 1 LIMIT 1'
        ).get(artifactId);
        if (!row || !row.local_path) return res.status(404).json({ error: 'No local file for this artifact' });

        const filePath = path.join(ARTIFACTS_DIR, row.local_path);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });

        const stat = fs.statSync(filePath);
        const mime = row.mime_type || 'application/octet-stream';
        res.setHeader('Content-Type', mime);
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Content-Disposition', `inline; filename="${row.file_name || path.basename(filePath)}"`);
        res.setHeader('Cache-Control', 'private, max-age=3600');
        fs.createReadStream(filePath).pipe(res);
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if (db) db.close();
    }
});

// ── Restricted web fetch (direct image / PDF links only) ────────────────────

// POST /api/catalog/artifacts/fetch-url
// Downloads a file from a direct public URL and stores it locally.
// Restricted to image and PDF mime types only — no scraping behind auth.
// Body: { url, entityId, entityType?, artifactType?, artifactId? }
router.post('/artifacts/fetch-url', authMiddleware, async (req, res) => {
    const { url, entityId, entityType = 'equipment_type', artifactType = 'twin', artifactId } = req.body;
    if (!url || !entityId) return res.status(400).json({ error: 'url and entityId required' });

    // Only allow direct resource URLs — block login-gated pages like GrabCAD
    let parsed;
    try { parsed = new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL' }); }
    if (!['http:', 'https:'].includes(parsed.protocol)) return res.status(400).json({ error: 'Only http/https URLs allowed' });

    const FETCH_ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.pdf']);
    const urlExt = path.extname(parsed.pathname).toLowerCase();
    if (urlExt && !FETCH_ALLOWED_EXT.has(urlExt)) {
        return res.status(400).json({ error: 'Web fetch only supports images and PDFs. Upload CAD files manually.' });
    }

    let db;
    try {
        const https = require('https');
        const http  = require('http');
        const client = parsed.protocol === 'https:' ? https : http;

        const { buffer, contentType, fileName } = await new Promise((resolve, reject) => {
            const reqOptions = {
                hostname: parsed.hostname, port: parsed.port || undefined,
                path: parsed.pathname + parsed.search,
                headers: { 'User-Agent': 'TrierOS/3.6 (catalog-fetch; +internal)' },
                timeout: 15000,
            };
            client.get(reqOptions, (r) => {
                if (r.statusCode !== 200) return reject(new Error(`HTTP ${r.statusCode} from source`));
                const ct = r.headers['content-type'] || '';
                // Reject HTML pages — they're login walls, not files
                if (ct.includes('text/html')) return reject(new Error('Source returned an HTML page, not a file. This URL requires login or is a landing page — upload the file manually.'));
                const allowed = ['image/', 'application/pdf', 'image/svg'];
                if (!allowed.some(a => ct.includes(a))) return reject(new Error(`File type not allowed for web fetch: ${ct}`));
                const chunks = [];
                r.on('data', c => chunks.push(c));
                r.on('end', () => {
                    const fn = path.basename(parsed.pathname) || `artifact${urlExt || '.jpg'}`;
                    resolve({ buffer: Buffer.concat(chunks), contentType: ct.split(';')[0].trim(), fileName: fn });
                });
            }).on('error', reject).on('timeout', () => reject(new Error('Fetch timed out')));
        });

        if (buffer.length > 50 * 1024 * 1024) return res.status(400).json({ error: 'File too large (max 50 MB via web fetch)' });

        db = getMasterDbWrite();
        let targetId = artifactId ? parseInt(artifactId, 10) : null;
        if (!targetId) {
            const ext = path.extname(fileName).toUpperCase().replace('.', '') || 'JPEG';
            const role = artifactType === 'twin' ? 'analytical' : 'reference';
            targetId = db.prepare(`
                INSERT INTO catalog_artifacts
                    (EntityType, EntityID, ArtifactType, ArtifactRole, Format, Source,
                     external_url, is_local, CreatedBy, CreatedAt)
                VALUES (?, ?, ?, ?, ?, 'web_fetch', ?, 1, ?, datetime('now'))
            `).run(entityType, entityId, artifactType, role, ext, url,
                req.user?.Username || 'admin').lastInsertRowid;
        }

        const artifactDir = path.join(ARTIFACTS_DIR, String(targetId));
        if (!fs.existsSync(artifactDir)) fs.mkdirSync(artifactDir, { recursive: true });
        const filePath = path.join(artifactDir, fileName);
        fs.writeFileSync(filePath, buffer);

        const relPath = path.join(String(targetId), fileName);
        db.prepare(`
            UPDATE catalog_artifacts
            SET local_path = ?, mime_type = ?, is_local = 1, file_name = ?, file_size = ?
            WHERE ArtifactID = ?
        `).run(relPath, contentType, fileName, buffer.length, targetId);

        res.json({ ok: true, artifactId: targetId, localPath: relPath, mime: contentType, fileName });
    } catch (e) {
        res.status(400).json({ error: e.message });
    } finally {
        if (db) db.close();
    }
});

// ── Artifacts for a single equipment entity ──────────────────────────────────

// GET /api/catalog/artifacts/for/:entityId
// Returns all artifacts (local-first) for a given equipment type ID.
// I-13: each artifact carries a normalized source field so consumers never
// need to interpret raw is_local / Source DB values to determine availability.
router.get('/artifacts/for/:entityId', authMiddleware, (req, res) => {
    const entityId = req.params.entityId;
    let db;
    try {
        db = getMasterDb();
        const rows = db.prepare(`
            SELECT ArtifactID, ArtifactType, ArtifactRole, Format, Source,
                   is_local, local_path, mime_type, file_name, file_size,
                   external_url, FileURL, Confidence, Verified, CreatedAt
            FROM catalog_artifacts
            WHERE EntityID = ? AND IsActive != 0
            ORDER BY is_local DESC, Confidence DESC
        `).all(entityId);
        res.json(rows.map(r => ({
            ...r,
            source:           r.is_local ? 'local' : 'external',
            requiresInternet: !r.is_local,
        })));
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if (db) db.close();
    }
});

module.exports = router;
