// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — IT Master Catalog API
 * ===================================
 * Read-only endpoints exposing the enterprise IT product master catalog.
 * Provides a curated library of approved IT products, vendors, and part numbers
 * for consistent procurement and asset tagging across all plants.
 * Data lives in it_master.db (separate from per-plant databases).
 * Mounted at /api/it-catalog in server/index.js.
 *
 * ENDPOINTS:
 *   GET  /stats                   Catalog summary: product count, vendor count, category breakdown
 *   GET  /products                Browse catalog products (filter: ?category, ?vendor, ?search)
 *   GET  /products/:partNumber    Lookup a single product by part number
 *   GET  /lookup/:partNumber      Quick part number lookup (returns first match; used by barcode scan)
 *   GET  /vendors                 List all approved IT vendors in the catalog
 *   GET  /manufacturers           List all manufacturers in the catalog
 *   POST /products                Add a new product to the master catalog (admin only)
 *
 * DATABASE: it_master.db — separate SQLite file maintained independently of plant data.
 *   Tables: ITMasterProducts, ITMasterAccessories, ITMasterVendors
 *
 * READ-ONLY DESIGN: Most endpoints are GET-only. The catalog is populated by IT admins
 *   and serves as the single source of truth for approved hardware/software SKUs.
 *   The POST /products endpoint is restricted to catalog administrators.
 *
 * BARCODE INTEGRATION: GET /lookup/:partNumber is called by the barcode scanner workflow
 *   in the IT asset module to pre-fill asset records when scanning equipment labels.
 */
const express = require('express');
const router = express.Router();
const Database = require('better-sqlite3');
const path = require('path');
const dataDir = require('../resolve_data_dir');

function getITMasterDb() {
    const dbPath = path.join(dataDir, 'it_master.db');
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    return db;
}

// ── Stats summary ──────────────────────────────────────────────
router.get('/stats', (req, res) => {
    let db;
    try {
        db = getITMasterDb();
        const products = db.prepare('SELECT COUNT(*) as c FROM ITMasterProducts').get().c;
        const accessories = db.prepare('SELECT COUNT(*) as c FROM ITMasterAccessories').get().c;
        const vendors = db.prepare('SELECT COUNT(*) as c FROM ITMasterVendors').get().c;
        const manufacturers = db.prepare('SELECT COUNT(DISTINCT Manufacturer) as c FROM ITMasterProducts').get().c;
        const categories = db.prepare('SELECT DISTINCT Category FROM ITMasterProducts ORDER BY Category').all().map(r => r.Category);
        res.json({ products, accessories, vendors, manufacturers, categories });
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if (db) db.close();
    }
});

// ── Products — full search ─────────────────────────────────────
router.get('/products', (req, res) => {
    let db;
    try {
        db = getITMasterDb();
        const { q, manufacturer, category, lifecycle, sort, order, limit, offset } = req.query;
        let sql = 'SELECT * FROM ITMasterProducts';
        const params = [];
        const where = [];

        if (q) {
            where.push('(PartNumber LIKE ? OR ProductName LIKE ? OR Manufacturer LIKE ? OR Description LIKE ? OR Tags LIKE ? OR Category LIKE ? OR SubCategory LIKE ?)');
            const like = `%${q}%`;
            params.push(like, like, like, like, like, like, like);
        }
        if (manufacturer) { where.push('Manufacturer = ?'); params.push(manufacturer); }
        if (category) { where.push('Category = ?'); params.push(category); }
        if (lifecycle) { where.push('LifecycleStatus = ?'); params.push(lifecycle); }

        if (where.length) sql += ' WHERE ' + where.join(' AND ');

        const validCols = ['PartNumber','ProductName','Manufacturer','Category','ListPriceMin','IntroducedYear','EOLYear'];
        if (sort && validCols.includes(sort)) {
            sql += ` ORDER BY ${sort} ${order === 'desc' ? 'DESC' : 'ASC'}`;
        } else {
            sql += ' ORDER BY Manufacturer, Category, ProductName';
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

// ── Single product with accessories ────────────────────────────
router.get('/products/:partNumber', (req, res) => {
    let db;
    try {
        db = getITMasterDb();
        const product = db.prepare('SELECT * FROM ITMasterProducts WHERE PartNumber = ?').get(req.params.partNumber);
        if (!product) return res.status(404).json({ error: 'Product not found' });

        const accessories = db.prepare('SELECT * FROM ITMasterAccessories WHERE ParentPartNumber = ?').all(req.params.partNumber);
        const supersededBy = product.SupersededBy
            ? db.prepare('SELECT PartNumber, ProductName, Manufacturer FROM ITMasterProducts WHERE PartNumber = ?').get(product.SupersededBy)
            : null;

        res.json({ ...product, accessories, supersededByProduct: supersededBy });
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if (db) db.close();
    }
});

// ── Lookup by part number (enrichment) ─────────────────────────
router.get('/lookup/:partNumber', (req, res) => {
    let db;
    try {
        db = getITMasterDb();
        const product = db.prepare('SELECT * FROM ITMasterProducts WHERE PartNumber = ? OR AlternatePartNumbers LIKE ?').get(
            req.params.partNumber, `%${req.params.partNumber}%`
        );
        if (!product) return res.json({ found: false });

        const accessories = db.prepare('SELECT * FROM ITMasterAccessories WHERE ParentPartNumber = ?').all(product.PartNumber);
        res.json({ found: true, product, accessories });
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
        db = getITMasterDb();
        const { q } = req.query;
        let sql = 'SELECT * FROM ITMasterVendors';
        const params = [];
        if (q) {
            sql += ' WHERE (VendorID LIKE ? OR CompanyName LIKE ? OR Categories LIKE ?)';
            const like = `%${q}%`;
            params.push(like, like, like);
        }
        sql += ' ORDER BY CompanyName';
        const rows = db.prepare(sql).all(...params);
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if (db) db.close();
    }
});

// ── Manufacturers list ─────────────────────────────────────────
router.get('/manufacturers', (req, res) => {
    let db;
    try {
        db = getITMasterDb();
        const rows = db.prepare('SELECT Manufacturer, COUNT(*) as count FROM ITMasterProducts GROUP BY Manufacturer ORDER BY Manufacturer').all();
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if (db) db.close();
    }
});

// ── Add New Master Catalog Product ─────────────────────────────
router.post('/products', (req, res) => {
    let db;
    try {
        db = getITMasterDb();
        const { PartNumber, ProductName, Manufacturer, Category, SubCategory, Description, LifecycleStatus, ListPriceMin, WarrantyMonths } = req.body;
        
        if (!PartNumber || !ProductName || !Manufacturer) {
            return res.status(400).json({ error: 'PartNumber, ProductName, and Manufacturer are required' });
        }

        // Check if exists
        const exists = db.prepare('SELECT PartNumber FROM ITMasterProducts WHERE PartNumber = ?').get(PartNumber);
        if (exists) return res.status(400).json({ error: 'This Part Number already exists in the master catalog' });

        const sql = `INSERT INTO ITMasterProducts (
            PartNumber, ProductName, Manufacturer, Category, SubCategory, Description, LifecycleStatus, ListPriceMin, WarrantyMonths
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        db.prepare(sql).run(
            PartNumber, ProductName, Manufacturer, 
            Category || 'Hardware', SubCategory || '', 
            Description || '', LifecycleStatus || 'Active', 
            ListPriceMin || 0, WarrantyMonths || 12
        );
        res.json({ success: true, message: 'Added to master catalog' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if (db) db.close();
    }
});

module.exports = router;
