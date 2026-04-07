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

function getMasterDb() {
    const dbPath = path.join(dataDir, 'mfg_master.db');
    const db = new Database(dbPath, { readonly: true });
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
        const { q, sort, order, limit, offset } = req.query;
        let sql = 'SELECT * FROM MasterEquipment';
        const params = [];
        if (q) {
            sql += ' WHERE (EquipmentTypeID LIKE ? OR Description LIKE ? OR Category LIKE ? OR TypicalMakers LIKE ?)';
            const like = `%${q}%`;
            params.push(like, like, like, like);
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
        const { q, sort, order, limit, offset } = req.query;
        let sql = 'SELECT * FROM MasterParts';
        const params = [];
        if (q) {
            sql += ' WHERE (MasterPartID LIKE ? OR Description LIKE ? OR StandardizedName LIKE ? OR Manufacturer LIKE ? OR Category LIKE ?)';
            const like = `%${q}%`;
            params.push(like, like, like, like, like);
        }
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

module.exports = router;
