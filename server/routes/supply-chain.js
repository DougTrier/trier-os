// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Production Supply Chain & Ingredient Inventory API
 * ===============================================================
 * Tracks NON-MAINTENANCE incoming materials: dairy ingredients, packaging,
 * CIP chemicals, and consumables. All routes plant-scoped via x-plant-id header.
 * Mounted at /api/supply-chain in server/index.js.
 *
 * ENDPOINTS:
 *   GET  /items               Inventory list (filter: ?category, ?lowStock=true)
 *   POST /items               Add new inventory item
 *   PUT  /items/:id           Update item details or adjust quantity
 *   GET  /vendors             Approved vendor list for supply chain items
 *   POST /vendors             Add a vendor record
 *   PUT  /vendors/:id         Update vendor contact or lead time
 *   GET  /po                  Purchase orders (filter: ?status=open|received)
 *   POST /po                  Create a purchase order
 *   PUT  /po/:id/receive      Mark PO received — updates QtyOnHand for all line items
 *   GET  /transactions        Receipt and usage transaction log
 *   POST /transactions        Log a usage event (subtract) or manual receipt (add)
 *   GET  /summary             KPI summary: total inventory value, low-stock count, PO spend
 *   GET  /all-sites           Cross-plant rollup: open POs, overdue, inventory value, top vendors (15-min cache)
 *
 * ITEM CATEGORIES: Dairy Ingredients | Packaging | Chemicals | Consumables
 *   Dairy Ingredients — cultures, chocolate powder, sugar, buttermilk powder, vitamins
 *   Packaging         — cartons, plastic resin, lids, labels, shrink wrap
 *   Chemicals         — Ecolab barrel chemicals, CIP acids/caustic, sanitizers
 *   Consumables       — light bulbs, gloves, hairnets, gaskets (non-WO items)
 *
 * PO RECEIVE: Receiving a PO triggers a QtyOnHand update for each line item
 *   and writes a transaction record for audit trail purposes.
 */
const express = require('express');
const router  = express.Router();
const { getDb } = require('../database');
const fs       = require('fs');
const path     = require('path');
const multer   = require('multer');
const Database = require('better-sqlite3');
const dataDir  = require('../resolve_data_dir');

// ── Multer setup for item photos ──────────────────────────────────────────────
const uploadDir = path.join(require('../resolve_data_dir'), 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const photoStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `sc_item_${req.params.id}_${Date.now()}${ext}`);
    }
});
const photoUpload = multer({
    storage: photoStorage,
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (/jpg|jpeg|png|gif|webp/.test(path.extname(file.originalname).toLowerCase())) return cb(null, true);
        cb(new Error('Only image files are allowed'));
    }
});

// ── Auto-create tables ────────────────────────────────────────────────────────
function ensureTables(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS SupplyVendor (
            ID          INTEGER PRIMARY KEY AUTOINCREMENT,
            VendorName  TEXT NOT NULL,
            Category    TEXT,
            ContactName TEXT,
            Phone       TEXT,
            Email       TEXT,
            Website     TEXT,
            AccountNum  TEXT,
            LeadDays    INTEGER DEFAULT 5,
            ActiveFlag  INTEGER DEFAULT 1,
            Notes       TEXT,
            CreatedAt   TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS SupplyItem (
            ID           INTEGER PRIMARY KEY AUTOINCREMENT,
            ItemCode     TEXT,
            Description  TEXT NOT NULL,
            Category     TEXT NOT NULL DEFAULT 'Other',
            SubCategory  TEXT,
            VendorID     INTEGER REFERENCES SupplyVendor(ID),
            VendorPartNo TEXT,
            UOM          TEXT DEFAULT 'lbs',
            PackSize     REAL DEFAULT 1,
            UnitCost     REAL DEFAULT 0,
            OnHand       REAL DEFAULT 0,
            MinStock     REAL DEFAULT 0,
            MaxStock     REAL DEFAULT 0,
            ReorderPt    REAL DEFAULT 0,
            StorageArea  TEXT,
            HazMat       INTEGER DEFAULT 0,
            ActiveFlag   INTEGER DEFAULT 1,
            Notes        TEXT,
            PhotoURL     TEXT,
            CreatedAt    TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS SupplyPO (
            ID           INTEGER PRIMARY KEY AUTOINCREMENT,
            PONumber     TEXT,
            VendorID     INTEGER REFERENCES SupplyVendor(ID),
            OrderDate    TEXT DEFAULT (date('now')),
            ExpectedDate TEXT,
            ReceivedDate TEXT,
            Status       TEXT DEFAULT 'Open',
            TotalValue   REAL DEFAULT 0,
            Tax          REAL DEFAULT 0,
            Shipping     REAL DEFAULT 0,
            Discount     REAL DEFAULT 0,
            Notes        TEXT,
            OrderedBy    TEXT,
            CreatedAt    TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS SupplyPOLine (
            ID        INTEGER PRIMARY KEY AUTOINCREMENT,
            POID      INTEGER NOT NULL REFERENCES SupplyPO(ID),
            ItemID    INTEGER REFERENCES SupplyItem(ID),
            ItemDesc  TEXT,
            Qty       REAL DEFAULT 0,
            QtyRcvd   REAL DEFAULT 0,
            UOM       TEXT,
            UnitCost  REAL DEFAULT 0,
            LineTotal REAL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS SupplyTransaction (
            ID          INTEGER PRIMARY KEY AUTOINCREMENT,
            ItemID      INTEGER NOT NULL REFERENCES SupplyItem(ID),
            TxDate      TEXT DEFAULT (date('now')),
            TxType      TEXT NOT NULL,
            Qty         REAL DEFAULT 0,
            UOM         TEXT,
            UnitCost    REAL DEFAULT 0,
            TotalCost   REAL DEFAULT 0,
            POID        INTEGER,
            Reference   TEXT,
            Notes       TEXT,
            EnteredBy   TEXT,
            CreatedAt   TEXT DEFAULT (datetime('now'))
        );
    `);

    // Seed vendors and items if empty
    const vendorCount = db.prepare('SELECT COUNT(*) as c FROM SupplyVendor').get().c;
    if (vendorCount === 0) seedVendors(db);
    const itemCount = db.prepare('SELECT COUNT(*) as c FROM SupplyItem').get().c;
    if (itemCount === 0) seedItems(db);

    // Expand with real dairy industry data (safe — skips existing records by ItemCode/VendorName)
    try { require('./supply_chain_seed').seedDairyExpanded(db); } catch (e) { console.warn('[supply-chain] Expanded seed error:', e.message); }

    // Safe schema migrations for missing modifiers
    try { db.prepare('ALTER TABLE SupplyPO ADD COLUMN Tax REAL DEFAULT 0').run(); } catch {}
    try { db.prepare('ALTER TABLE SupplyPO ADD COLUMN Shipping REAL DEFAULT 0').run(); } catch {}
    try { db.prepare('ALTER TABLE SupplyPO ADD COLUMN Discount REAL DEFAULT 0').run(); } catch {}
}

// ── Seed realistic dairy suppliers ───────────────────────────────────────────
function seedVendors(db) {
    const ins = db.prepare(`
        INSERT INTO SupplyVendor (VendorName, Category, ContactName, Phone, Email, Website, LeadDays, Notes)
        VALUES (?,?,?,?,?,?,?,?)
    `);
    const vendors = [
        ['Tate & Lyle', 'Dairy Ingredients', 'Sales Desk', '1-800-526-5728', 'dairysales@tatelyle.com', 'tateandlyle.com', 7, 'Sugar, HFCS, specialty sweeteners'],
        ['Ecolab', 'Chemicals', 'Service Rep', '1-800-352-5326', 'foodsafety@ecolab.com', 'ecolab.com', 5, 'CIP chemicals, sanitizers, barrel cleaners, Oxonia'],
        ['Chr. Hansen', 'Dairy Ingredients', 'Dairy Team', '1-414-607-5700', 'dairy@chr-hansen.com', 'chr-hansen.com', 10, 'Cultures, enzymes, probiotics, colors'],
        ['Kerry Group', 'Dairy Ingredients', 'Kerry Dairy', '1-800-KERRY-00', 'dairy@kerry.com', 'kerry.com', 7, 'Buttermilk powder, whey derivatives, flavors'],
        ['Hawkins Inc.', 'Chemicals', 'Chemical Sales', '1-612-331-6910', 'food@hawkinsinc.com', 'hawkinsinc.com', 5, 'Phosphoric acid, caustic soda, peracetic acid'],
        ['Sealed Air / Cryovac', 'Packaging', 'Packaging Rep', '1-800-498-2880', 'foodsolutions@sealedair.com', 'sealedair.com', 14, 'Vacuum pouches, shrink wrap, barrier films'],
        ['DS Smith', 'Packaging', 'Carton Sales', '1-800-832-8302', 'dairy@dssmith.com', 'dssmith.com', 10, 'Shelf cartons, gable tops, shipping cases'],
        ['LyondellBasell', 'Packaging', 'Resin Sales', '1-713-309-7200', 'plastics@lyb.com', 'lyb.com', 21, 'HDPE resin, PP resin for blow molding'],
        ['Grainger', 'Consumables', 'Account Mgr', '1-800-472-4643', 'dairy@grainger.com', 'grainger.com', 2, 'Light bulbs, gloves, hairnets, ear plugs, consumables'],
        ['Balchem / Albion', 'Dairy Ingredients', 'Human Nutrition', '1-845-326-5600', 'nutrition@balchem.com', 'balchem.com', 10, 'Vitamins A&D, mineral premix, chelated minerals'],
        ['Ventura Foods', 'Dairy Ingredients', 'Butter Sales', '1-302-421-1800', 'dairy@venturafoods.com', 'venturafoods.com', 5, 'Cultured butter blend, AMF, anhydrous milk fat'],
        ['International Flavors', 'Dairy Ingredients', 'Dairy R&D', '1-212-765-5500', 'dairy@iff.com', 'iff.com', 14, 'Vanilla, chocolate, strawberry, artificial flavors'],
    ];
    const tx = db.transaction(() => { vendors.forEach(v => ins.run(...v)); });
    tx();
}

// ── Seed realistic dairy ingredient items ─────────────────────────────────────
function seedItems(db) {
    // Get vendor IDs
    const vMap = {};
    db.prepare('SELECT ID, VendorName FROM SupplyVendor').all().forEach(v => { vMap[v.VendorName] = v.ID; });

    const ins = db.prepare(`
        INSERT INTO SupplyItem
            (ItemCode, Description, Category, SubCategory, VendorID, VendorPartNo, UOM, PackSize,
             UnitCost, OnHand, MinStock, MaxStock, ReorderPt, StorageArea, HazMat, Notes)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);

    const items = [
        // ── Dairy Ingredients ──
        ['ING-001', 'Granulated Cane Sugar', 'Dairy Ingredients', 'Sweeteners', vMap['Tate & Lyle'], 'T&L-SUGAR-GRN', 'lbs', 2000, 0.29, 12000, 4000, 30000, 6000, 'Dry Storage A', 0, '50lb bags, 2000lb super sacks'],
        ['ING-002', 'Buttermilk Powder (Sweet)', 'Dairy Ingredients', 'Dairy Powders', vMap['Kerry Group'], 'KER-BMP-SW', 'lbs', 50, 1.85, 3500, 1000, 10000, 2000, 'Dry Storage A', 0, '50lb bags, low-heat spray dried'],
        ['ING-003', 'Chocolate Powder (Dutch Process)', 'Dairy Ingredients', 'Cocoa & Flavors', vMap['International Flavors'], 'IFF-CHOC-DP', 'lbs', 50, 3.40, 2200, 500, 8000, 1000, 'Dry Storage B', 0, '50lb bags, 10-12% fat'],
        ['ING-004', 'Non-Fat Dry Milk (NFDM)', 'Dairy Ingredients', 'Dairy Powders', vMap['Kerry Group'], 'KER-NFDM-EX', 'lbs', 2000, 1.55, 8000, 2000, 20000, 4000, 'Dry Storage A', 0, 'Extra grade, bulk sack'],
        ['ING-005', 'Vitamin A Palmitate (30M IU/g)', 'Dairy Ingredients', 'Vitamins', vMap['Balchem / Albion'], 'BAL-VITA-30M', 'lbs', 5, 48.00, 25, 5, 100, 15, 'Ingredient Room', 0, 'Cold storage required, 5lb containers'],
        ['ING-006', 'Vitamin D3 (40M IU/g)', 'Dairy Ingredients', 'Vitamins', vMap['Balchem / Albion'], 'BAL-VITD-40M', 'lbs', 5, 52.00, 20, 5, 80, 10, 'Ingredient Room', 0, 'Cold storage required, 5lb containers'],
        ['ING-007', 'Mesophilic Starter Culture DVS', 'Dairy Ingredients', 'Cultures', vMap['Chr. Hansen'], 'CHR-MESO-DVS', 'units', 1, 185.00, 24, 6, 36, 12, 'Freezer Storage', 0, 'Keep frozen < -18°C, 500u dose'],
        ['ING-008', 'Thermophilic Culture (ST+LB)', 'Dairy Ingredients', 'Cultures', vMap['Chr. Hansen'], 'CHR-THERMO-SL', 'units', 1, 165.00, 12, 4, 24, 8, 'Freezer Storage', 0, 'Keep frozen, for yogurt/cultured dairy'],
        ['ING-009', 'Vanilla Extract (2-fold)', 'Dairy Ingredients', 'Cocoa & Flavors', vMap['International Flavors'], 'IFF-VAN-2F', 'gal', 1, 95.00, 40, 10, 100, 20, 'Ingredient Room', 0, '1 gallon containers, 35% alcohol'],
        ['ING-010', 'Strawberry Flavor Compound', 'Dairy Ingredients', 'Cocoa & Flavors', vMap['International Flavors'], 'IFF-STRAW-C', 'lbs', 5, 12.50, 150, 30, 400, 60, 'Ingredient Room', 0, '5lb pails, Brix match required'],
        ['ING-011', 'Anhydrous Milk Fat (AMF)', 'Dairy Ingredients', 'Dairy Fats', vMap['Ventura Foods'], 'VEN-AMF-STD', 'lbs', 30, 2.85, 600, 200, 2000, 400, 'Refrigerated Storage', 0, '30lb blocks, 99.8% butterfat'],
        ['ING-012', 'High Fructose Corn Syrup 42', 'Dairy Ingredients', 'Sweeteners', vMap['Tate & Lyle'], 'T&L-HFCS-42', 'lbs', 56, 0.32, 5000, 1500, 15000, 3000, 'Liquid Tank Farm', 0, 'Bulk tank delivery, 55-gal drums'],
        ['ING-013', 'Cocoa Butter', 'Dairy Ingredients', 'Cocoa & Flavors', vMap['International Flavors'], 'IFF-COCBUT', 'lbs', 50, 5.20, 400, 100, 1500, 200, 'Dry Storage B', 0, '50lb cases, natural deodorized'],
        ['ING-014', 'Pectin (LM Rapid Set)', 'Dairy Ingredients', 'Stabilizers', vMap['Chr. Hansen'], 'CHR-PECTIN-LM', 'lbs', 25, 6.80, 150, 25, 500, 50, 'Dry Storage B', 0, '25lb bags, for drinkable yogurt'],
        ['ING-015', 'Carrageenan (Food Grade)', 'Dairy Ingredients', 'Stabilizers', vMap['Chr. Hansen'], 'CHR-CARR-FG', 'lbs', 25, 8.40, 100, 20, 400, 40, 'Dry Storage B', 0, '25lb bags, kappa type for chocolate milk'],

        // ── Packaging ──
        ['PKG-001', 'Gable Top Carton 1/2 Gal Whole', 'Packaging', 'Cartons', vMap['DS Smith'], 'DSS-GT-HG-WH', 'each', 500, 0.185, 24000, 5000, 80000, 10000, 'Packaging Warehouse', 0, '500/case, fold-flat ship'],
        ['PKG-002', 'Gable Top Carton 1 Qt Whole', 'Packaging', 'Cartons', vMap['DS Smith'], 'DSS-GT-QT-WH', 'each', 500, 0.145, 18000, 4000, 60000, 8000, 'Packaging Warehouse', 0, '500/case, pre-creased'],
        ['PKG-003', 'Gable Top Carton 1 Gal 2%', 'Packaging', 'Cartons', vMap['DS Smith'], 'DSS-GT-GAL-2P', 'each', 250, 0.220, 12000, 3000, 40000, 6000, 'Packaging Warehouse', 0, '250/case, PE coated'],
        ['PKG-004', 'HDPE Resin (Bottle Grade)', 'Packaging', 'Plastic Resin', vMap['LyondellBasell'], 'LYB-HDPE-BG', 'lbs', 1000, 0.88, 8000, 2000, 25000, 4000, 'Resin Silo', 0, '1000lb bulk bags or rail car'],
        ['PKG-005', 'PP Resin (Cap Grade)', 'Packaging', 'Plastic Resin', vMap['LyondellBasell'], 'LYB-PP-CAP', 'lbs', 1000, 0.92, 3000, 800, 10000, 1500, 'Resin Silo', 0, 'For injection molded caps'],
        ['PKG-006', 'Shrink Wrap Film (Clear, 80ga)', 'Packaging', 'Film & Wrap', vMap['Sealed Air / Cryovac'], 'SEA-SHK-CLR80', 'rolls', 1, 68.00, 40, 10, 120, 20, 'Packaging Warehouse', 0, '5000ft rolls, pallet overwrap'],
        ['PKG-007', 'Vacuum Barrier Pouch 8oz', 'Packaging', 'Film & Wrap', vMap['Sealed Air / Cryovac'], 'SEA-VAC-8OZ', 'each', 1000, 0.095, 8000, 2000, 30000, 5000, 'Packaging Warehouse', 0, '1000/case, barrier nylon/PE'],
        ['PKG-008', 'Corrugated Shipping Case (12-qt)', 'Packaging', 'Corrugated', vMap['DS Smith'], 'DSS-CASE-12QT', 'each', 100, 1.85, 2000, 500, 8000, 1000, 'Packaging Warehouse', 0, 'RSC style, 200lb test'],
        ['PKG-009', 'Tamper Evident Cap 38mm', 'Packaging', 'Caps & Closures', vMap['LyondellBasell'], 'LYB-CAP-38TE', 'each', 5000, 0.028, 50000, 10000, 150000, 20000, 'Packaging Warehouse', 0, 'Snap-on TE band'],
        ['PKG-010', 'Product Label (Half Gal Whole)', 'Packaging', 'Labels', vMap['DS Smith'], 'DSS-LBL-HGW', 'rolls', 1, 42.00, 30, 8, 100, 15, 'Packaging Warehouse', 0, '2000 labels/roll, pressure sensitive'],

        // ── Chemicals (Ecolab & Hawkins) ──
        ['CHM-001', 'Ecolab Vortexx CIP Detergent', 'Chemicals', 'CIP Cleaners', vMap['Ecolab'], 'ECO-VORTEXX', 'gal', 5, 28.50, 60, 15, 200, 30, 'Chemical Room', 1, '5-gal pails, alkaline chlorinated CIP'],
        ['CHM-002', 'Ecolab Oxonia Active (15%)', 'Chemicals', 'Sanitizers', vMap['Ecolab'], 'ECO-OXONIA-15', 'gal', 2.5, 18.75, 40, 10, 160, 20, 'Chemical Room', 1, '2.5-gal jugs, PAA sanitizer'],
        ['CHM-003', 'Ecolab Solid Express Detergent', 'Chemicals', 'CIP Cleaners', vMap['Ecolab'], 'ECO-SOLID-EXP', 'lbs', 8, 22.00, 24, 6, 96, 12, 'Chemical Room', 1, '8lb solid, slow-dissolve CIP block'],
        ['CHM-004', 'Ecolab Klenzade LC-7 Acid Rinse', 'Chemicals', 'Acid Rinse', vMap['Ecolab'], 'ECO-LC7', 'gal', 5, 31.00, 20, 5, 80, 10, 'Chemical Room', 1, '5-gal pails, phosphoric-nitric blend'],
        ['CHM-005', 'Caustic Soda 50% Solution', 'Chemicals', 'CIP Cleaners', vMap['Hawkins Inc.'], 'HAW-CAUST-50', 'lbs', 330, 0.42, 2000, 500, 8000, 1000, 'Bulk Chemical Tank', 1, 'Bulk tote delivery, NaOH lye'],
        ['CHM-006', 'Phosphoric Acid 75%', 'Chemicals', 'Acid Rinse', vMap['Hawkins Inc.'], 'HAW-H3PO4-75', 'lbs', 330, 0.68, 1500, 300, 5000, 600, 'Bulk Chemical Tank', 1, 'Bulk tote, food grade, CIP acid'],
        ['CHM-007', 'Peracetic Acid 15% (Divosan)', 'Chemicals', 'Sanitizers', vMap['Hawkins Inc.'], 'HAW-PAA-15', 'gal', 5, 25.00, 30, 8, 120, 15, 'Chemical Room', 1, '5-gal carboy, equipment sanitizer'],
        ['CHM-008', 'Ecolab Quorum Hand Sanitizer', 'Chemicals', 'Personal Safety', vMap['Ecolab'], 'ECO-QUORUM', 'gal', 1, 12.50, 48, 12, 150, 24, 'Chemical Room', 0, '1-gal refill bottles'],
        ['CHM-009', 'Ecolab Sink & Surface Cleaner', 'Chemicals', 'Facility Clean', vMap['Ecolab'], 'ECO-SURF-CLN', 'gal', 1, 9.75, 36, 10, 100, 20, 'Chemical Room', 0, '1-gal spray, no-rinse'],
        ['CHM-010', 'Chlorine Dioxide Tablets (ClO2)', 'Chemicals', 'Sanitizers', vMap['Hawkins Inc.'], 'HAW-CLO2-TAB', 'lbs', 5, 18.00, 20, 5, 80, 10, 'Chemical Room', 1, '5lb bucket, plant & drain sanitation'],

        // ── Consumables ──
        ['CON-001', 'Nitrile Gloves Blue L (Box/100)', 'Consumables', 'PPE', vMap['Grainger'], 'GRA-NITR-BL-L', 'box', 1, 8.95, 80, 20, 300, 40, 'Breakroom Supply', 0, '100/box, powder-free food safe'],
        ['CON-002', 'Nitrile Gloves Blue M (Box/100)', 'Consumables', 'PPE', vMap['Grainger'], 'GRA-NITR-BL-M', 'box', 1, 8.95, 80, 20, 300, 40, 'Breakroom Supply', 0, '100/box, powder-free food safe'],
        ['CON-003', 'Hairnets White (Pkg/100)', 'Consumables', 'PPE', vMap['Grainger'], 'GRA-HAIR-WHT', 'pkg', 1, 4.50, 24, 6, 100, 12, 'Breakroom Supply', 0, '100 count/pkg, nylon mesh'],
        ['CON-004', 'Beard Nets Black (Pkg/100)', 'Consumables', 'PPE', vMap['Grainger'], 'GRA-BEARD-BLK', 'pkg', 1, 5.80, 12, 4, 60, 8, 'Breakroom Supply', 0, '100 count/pkg, required for all bearded staff'],
        ['CON-005', 'T8 LED Bulb 4ft 15W (Case/25)', 'Consumables', 'Lighting', vMap['Grainger'], 'GRA-LED-T8-4', 'case', 1, 78.00, 10, 3, 40, 6, 'Maintenance Supply', 0, '25/case, 5000K cool white, shatter-resistant'],
        ['CON-006', 'T8 LED Bulb 2ft 9W (Case/25)', 'Consumables', 'Lighting', vMap['Grainger'], 'GRA-LED-T8-2', 'case', 1, 55.00, 8, 2, 30, 4, 'Maintenance Supply', 0, '25/case, 5000K, cold storage rated'],
        ['CON-007', 'Food Grade Grease (14oz Cartridge)', 'Consumables', 'Lubrication', vMap['Grainger'], 'GRA-FGRS-14', 'each', 1, 14.50, 36, 12, 120, 24, 'Maintenance Supply', 0, 'NSF H1 approved, for conveyor bearings'],
        ['CON-008', 'Plastic Paddle Scraper 12in', 'Consumables', 'Sanitation', vMap['Grainger'], 'GRA-SCPR-12', 'each', 1, 6.25, 20, 6, 60, 12, 'Sanitation Supply', 0, 'Color-coded white, dairy plant compliant'],
        ['CON-009', 'Brush — Tank Cleaning 18in', 'Consumables', 'Sanitation', vMap['Grainger'], 'GRA-TANK-BRSH', 'each', 1, 22.00, 12, 4, 40, 8, 'Sanitation Supply', 0, 'White poly-fill, stainless handle'],
        ['CON-010', 'Ear Plugs Foam 33dB (Box/200)', 'Consumables', 'PPE', vMap['Grainger'], 'GRA-EARPLUGS', 'box', 1, 18.50, 10, 3, 40, 6, 'Breakroom Supply', 0, 'Uncorded, NRR 33, required on processing floor'],
    ];

    const tx = db.transaction(() => {
        items.forEach(r => ins.run(...r));
    });
    tx();
}

// ── Helper ────────────────────────────────────────────────────────────────────
function getPlantId(req) {
    const id = req.query.plantId || req.headers['x-plant-id'] || req.body?.plantId;
    return id;
}

// Returns true and sends a 200 "select a plant" stub when plantId is 'all_sites'
// (Corporate Analytics view), so the UI shows an empty state instead of crashing.
function guardAllSites(res, plantId) {
    if (!plantId || plantId === 'all_sites') {
        res.json({ rows: [], stub: true, message: 'Select a plant to view supply chain data.' });
        return true;
    }
    return false;
}


// ══════════════════════════════════════════════════════════════════════════════
// GET /api/supply-chain/vendors
// ══════════════════════════════════════════════════════════════════════════════
router.get('/vendors', (req, res) => {
    try {
        const plantId = getPlantId(req);
        if (guardAllSites(res, plantId)) return;
        const db = getDb(plantId); ensureTables(db);
        const rows = db.prepare('SELECT * FROM SupplyVendor WHERE ActiveFlag = 1 ORDER BY VendorName').all();
        res.json({ rows });
    } catch (e) { console.error('[supply/vendors]', e.message); res.status(500).json({ error: e.message }); }
});

// POST /api/supply-chain/vendors
router.post('/vendors', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const db = getDb(plantId); ensureTables(db);
        const { VendorName, Category, ContactName, Phone, Email, Website, AccountNum, LeadDays = 5, Notes } = req.body;
        if (!VendorName) return res.status(400).json({ error: 'VendorName required' });
        const r = db.prepare(`INSERT INTO SupplyVendor (VendorName,Category,ContactName,Phone,Email,Website,AccountNum,LeadDays,Notes)
            VALUES (?,?,?,?,?,?,?,?,?)`).run(VendorName, Category, ContactName, Phone, Email, Website, AccountNum, LeadDays, Notes);
        res.json({ id: r.lastInsertRowid, success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/supply-chain/vendors/:id
router.put('/vendors/:id', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const db = getDb(plantId); ensureTables(db);
        const { VendorName, Category, ContactName, Phone, Email, Website, AccountNum, LeadDays, Notes, ActiveFlag } = req.body;
        db.prepare(`UPDATE SupplyVendor SET VendorName=?,Category=?,ContactName=?,Phone=?,Email=?,Website=?,AccountNum=?,LeadDays=?,Notes=?,ActiveFlag=? WHERE ID=?`)
            .run(VendorName, Category, ContactName, Phone, Email, Website, AccountNum, LeadDays, Notes, ActiveFlag ?? 1, req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/supply-chain/items
// ══════════════════════════════════════════════════════════════════════════════
router.get('/items', (req, res) => {
    try {
        const plantId = getPlantId(req);
        if (guardAllSites(res, plantId)) return;
        const db = getDb(plantId); ensureTables(db);
        const { category, lowStock } = req.query;
        let sql = `
            SELECT i.*, v.VendorName,
                (i.OnHand * i.UnitCost) as StockValue,
                CASE WHEN i.ReorderPt > 0 AND i.OnHand <= i.ReorderPt THEN 1 ELSE 0 END as NeedsReorder
            FROM SupplyItem i
            LEFT JOIN SupplyVendor v ON v.ID = i.VendorID
            WHERE i.ActiveFlag = 1
        `;
        const params = [];
        if (category) { sql += ' AND i.Category = ?'; params.push(category); }
        if (lowStock === '1') { sql += ' AND i.OnHand <= i.ReorderPt AND i.ReorderPt > 0'; }
        sql += ' ORDER BY i.Category, i.Description';
        const rows = db.prepare(sql).all(...params);
        res.json({ rows });
    } catch (e) { console.error('[supply/items]', e.message); res.status(500).json({ error: e.message }); }
});

// POST /api/supply-chain/items
router.post('/items', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const db = getDb(plantId); ensureTables(db);
        const { ItemCode, Description, Category, SubCategory, VendorID, VendorPartNo, UOM = 'lbs',
                PackSize = 1, UnitCost = 0, OnHand = 0, MinStock = 0, MaxStock = 0, ReorderPt = 0,
                StorageArea, HazMat = 0, Notes } = req.body;
        if (!Description || !Category) return res.status(400).json({ error: 'Description and Category required' });
        const r = db.prepare(`INSERT INTO SupplyItem
            (ItemCode,Description,Category,SubCategory,VendorID,VendorPartNo,UOM,PackSize,UnitCost,
             OnHand,MinStock,MaxStock,ReorderPt,StorageArea,HazMat,Notes)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).run(ItemCode, Description, Category, SubCategory, VendorID, VendorPartNo, UOM, PackSize,
              UnitCost, OnHand, MinStock, MaxStock, ReorderPt, StorageArea, HazMat, Notes);
        res.json({ id: r.lastInsertRowid, success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/supply-chain/items/:id
router.put('/items/:id', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const db = getDb(plantId); ensureTables(db);
        const { Description, Category, SubCategory, VendorID, VendorPartNo, UOM, PackSize,
                UnitCost, MinStock, MaxStock, ReorderPt, StorageArea, HazMat, Notes, ActiveFlag } = req.body;
        db.prepare(`UPDATE SupplyItem SET Description=?,Category=?,SubCategory=?,VendorID=?,
            VendorPartNo=?,UOM=?,PackSize=?,UnitCost=?,MinStock=?,MaxStock=?,ReorderPt=?,
            StorageArea=?,HazMat=?,Notes=?,ActiveFlag=? WHERE ID=?`)
          .run(Description, Category, SubCategory, VendorID, VendorPartNo, UOM, PackSize,
               UnitCost, MinStock, MaxStock, ReorderPt, StorageArea, HazMat, Notes, ActiveFlag ?? 1, req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/supply-chain/items/:id/photo — upload product photo
router.post('/items/:id/photo', photoUpload.single('photo'), (req, res) => {
    try {
        const plantId = getPlantId(req);
        const db = getDb(plantId); ensureTables(db);
        // Safe migration: add column if not yet present on existing DBs
        try { db.prepare('ALTER TABLE SupplyItem ADD COLUMN PhotoURL TEXT').run(); } catch {}
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const photoUrl = '/uploads/' + req.file.filename;
        db.prepare('UPDATE SupplyItem SET PhotoURL=? WHERE ID=?').run(photoUrl, req.params.id);
        res.json({ success: true, photoUrl });
    } catch (e) { console.error('[supply/items/photo]', e.message); res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/supply-chain/po  — list POs
// ══════════════════════════════════════════════════════════════════════════════
router.get('/po', (req, res) => {
    try {
        const plantId = getPlantId(req);
        if (guardAllSites(res, plantId)) return;
        const db = getDb(plantId); ensureTables(db);
        const { status } = req.query;
        let sql = `SELECT p.*, v.VendorName,
            (SELECT COUNT(*) FROM SupplyPOLine l WHERE l.POID = p.ID) as LineCount
            FROM SupplyPO p LEFT JOIN SupplyVendor v ON v.ID = p.VendorID`;
        const params = [];
        if (status) { sql += ' WHERE p.Status = ?'; params.push(status); }
        sql += ' ORDER BY p.OrderDate DESC';
        const rows = db.prepare(sql).all(...params);
        // Attach lines
        const lines = db.prepare(`SELECT l.*, i.Description, i.UOM as ItemUOM FROM SupplyPOLine l LEFT JOIN SupplyItem i ON i.ID = l.ItemID`).all();
        const linesMap = {};
        lines.forEach(l => { if (!linesMap[l.POID]) linesMap[l.POID] = []; linesMap[l.POID].push(l); });
        rows.forEach(r => { r.lines = linesMap[r.ID] || []; });
        res.json({ rows });
    } catch (e) { console.error('[supply/po]', e.message); res.status(500).json({ error: e.message }); }
});

// POST /api/supply-chain/po — create PO
router.post('/po', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const db = getDb(plantId); ensureTables(db);
        const { VendorID, OrderDate, ExpectedDate, Notes, OrderedBy, Tax = 0, Shipping = 0, Discount = 0, lines = [] } = req.body;
        if (!VendorID) return res.status(400).json({ error: 'VendorID required' });

        // Auto-generate PO number
        const poYear = new Date().getFullYear();
        const lastPO = db.prepare("SELECT PONumber FROM SupplyPO ORDER BY ID DESC LIMIT 1").get();
        let seq = 1;
        if (lastPO?.PONumber) {
            const m = lastPO.PONumber.match(/(\d+)$/);
            if (m) seq = parseInt(m[1]) + 1;
        }
        const PONumber = `PO-SC-${poYear}-${String(seq).padStart(4, '0')}`;

        const lineTotalSum = lines.reduce((s, l) => s + ((l.Qty || 0) * (l.UnitCost || 0)), 0);
        const totalValue = (lineTotalSum + (parseFloat(Tax) || 0) + (parseFloat(Shipping) || 0)) - (parseFloat(Discount) || 0);

        const insert = db.transaction(() => {
            const poR = db.prepare(`INSERT INTO SupplyPO (PONumber,VendorID,OrderDate,ExpectedDate,Notes,OrderedBy,TotalValue,Status,Tax,Shipping,Discount)
                VALUES (?,?,?,?,?,?,?,'Open',?,?,?)`).run(PONumber, VendorID, OrderDate || new Date().toISOString().split('T')[0],
                ExpectedDate, Notes, OrderedBy, Math.round(totalValue * 100) / 100, parseFloat(Tax) || 0, parseFloat(Shipping) || 0, parseFloat(Discount) || 0);
            const poId = poR.lastInsertRowid;
            for (const l of lines) {
                const lineTotal = (l.Qty || 0) * (l.UnitCost || 0);
                db.prepare(`INSERT INTO SupplyPOLine (POID,ItemID,ItemDesc,Qty,UOM,UnitCost,LineTotal,QtyRcvd) VALUES (?,?,?,?,?,?,?,0)`)
                    .run(poId, l.ItemID || null, l.ItemDesc, l.Qty, l.UOM, l.UnitCost, lineTotal);
            }
            return poId;
        });
        const poId = insert();
        res.json({ id: poId, poNumber: PONumber, success: true });
    } catch (e) { console.error('[supply/po POST]', e.message); res.status(500).json({ error: e.message }); }
});

// PUT /api/supply-chain/po/:id/receive — receive all/partial lines
router.put('/po/:id/receive', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const db = getDb(plantId); ensureTables(db);
        const { receivedDate, lines = [], receivedBy } = req.body;
        const rcvDate = receivedDate || new Date().toISOString().split('T')[0];

        db.transaction(() => {
            for (const l of lines) {
                const qty = parseFloat(l.QtyRcvd) || 0;
                if (qty <= 0) continue;
                // Update PO line received qty
                db.prepare('UPDATE SupplyPOLine SET QtyRcvd = QtyRcvd + ? WHERE ID = ?').run(qty, l.ID);
                // Update item on-hand
                if (l.ItemID) {
                    db.prepare('UPDATE SupplyItem SET OnHand = OnHand + ? WHERE ID = ?').run(qty, l.ItemID);
                    // Log transaction
                    db.prepare(`INSERT INTO SupplyTransaction (ItemID,TxDate,TxType,Qty,UOM,UnitCost,TotalCost,POID,Reference,Notes,EnteredBy)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
                      .run(l.ItemID, rcvDate, 'Receipt', qty, l.UOM, l.UnitCost || 0,
                           Math.round(qty * (l.UnitCost || 0) * 100) / 100,
                           req.params.id, `PO Receipt`, `Received on ${rcvDate}`, receivedBy);
                }
            }
            // Check if all lines are fully received
            const openLines = db.prepare(
                'SELECT COUNT(*) as c FROM SupplyPOLine WHERE POID = ? AND QtyRcvd < Qty'
            ).get(req.params.id).c;
            const status = openLines === 0 ? 'Received' : 'Partial';
            db.prepare('UPDATE SupplyPO SET Status = ?, ReceivedDate = ? WHERE ID = ?').run(status, rcvDate, req.params.id);
        })();
        res.json({ success: true });
    } catch (e) { console.error('[supply/po/receive]', e.message); res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// PUT /api/supply-chain/po/:id — edit PO header + correct line items
// ══════════════════════════════════════════════════════════════════════════════
router.put('/po/:id', (req, res) => {
    try {
        const plantId = getPlantId(req);
        if (!plantId) return res.json({ error: 'Select a plant first' });
        const db = getDb(plantId);
        const { VendorID, OrderDate, ExpectedDate, Status, OrderedBy, Notes, Tax = 0, Shipping = 0, Discount = 0, lines = [] } = req.body;
        db.prepare(`UPDATE SupplyPO SET VendorID=?, OrderDate=?, ExpectedDate=?, Status=?, OrderedBy=?, Notes=?, Tax=?, Shipping=?, Discount=? WHERE ID=?`)
          .run(VendorID || null, OrderDate || null, ExpectedDate || null, Status || 'Open', OrderedBy || null, Notes || null, parseFloat(Tax) || 0, parseFloat(Shipping) || 0, parseFloat(Discount) || 0, req.params.id);
        // Update each line item qty and unit cost
        for (const l of lines) {
            if (l.ID) {
                db.prepare(`UPDATE SupplyPOLine SET Qty=?, UnitCost=?, UOM=?, LineTotal=? WHERE ID=?`)
                  .run(parseFloat(l.Qty) || 0, parseFloat(l.UnitCost) || 0, l.UOM || '', (parseFloat(l.Qty)||0)*(parseFloat(l.UnitCost)||0), l.ID);
            }
        }
        // Recalculate PO total
        const lineVal = db.prepare('SELECT SUM(LineTotal) as t FROM SupplyPOLine WHERE POID=?').get(req.params.id)?.t || 0;
        const finalTotal = (lineVal + (parseFloat(Tax) || 0) + (parseFloat(Shipping) || 0)) - (parseFloat(Discount) || 0);
        db.prepare('UPDATE SupplyPO SET TotalValue=? WHERE ID=?').run(finalTotal, req.params.id);
        res.json({ ok: true });
    } catch (e) { console.error('[supply/po/put]', e.message); res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/supply-chain/transactions
// ══════════════════════════════════════════════════════════════════════════════
router.get('/transactions', (req, res) => {
    try {
        const plantId = getPlantId(req);
        if (guardAllSites(res, plantId)) return;
        const db = getDb(plantId); ensureTables(db);
        const days = parseInt(req.query.days) || 30;
        const rows = db.prepare(`
            SELECT t.*, i.Description as ItemName, i.Category
            FROM SupplyTransaction t
            LEFT JOIN SupplyItem i ON i.ID = t.ItemID
            WHERE date(t.TxDate) >= date('now', ?)
            ORDER BY t.TxDate DESC, t.ID DESC LIMIT 300
        `).all(`-${days} days`);
        res.json({ rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/supply-chain/transactions — manual usage or adjustment
router.post('/transactions', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const db = getDb(plantId); ensureTables(db);
        const { ItemID, TxDate, TxType, Qty, UOM, UnitCost = 0, Reference, Notes, EnteredBy } = req.body;
        if (!ItemID || !TxType || !Qty) return res.status(400).json({ error: 'ItemID, TxType, Qty required' });
        const qty = parseFloat(Qty);
        const uc = parseFloat(UnitCost) || 0;
        // Adjust on-hand
        const delta = (TxType === 'Usage' || TxType === 'Adjustment Out' || TxType === 'Waste') ? -qty : qty;
        db.prepare('UPDATE SupplyItem SET OnHand = OnHand + ? WHERE ID = ?').run(delta, ItemID);
        const r = db.prepare(`INSERT INTO SupplyTransaction (ItemID,TxDate,TxType,Qty,UOM,UnitCost,TotalCost,Reference,Notes,EnteredBy)
            VALUES (?,?,?,?,?,?,?,?,?,?)`)
          .run(ItemID, TxDate || new Date().toISOString().split('T')[0], TxType, qty, UOM, uc,
               Math.round(qty * uc * 100) / 100, Reference, Notes, EnteredBy);
        res.json({ id: r.lastInsertRowid, success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/supply-chain/transactions/:id — edit transaction
router.put('/transactions/:id', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const db = getDb(plantId); ensureTables(db);
        const { TxDate, TxType, Qty, UOM, UnitCost = 0, Reference, Notes, EnteredBy } = req.body;
        if (!TxType || !Qty) return res.status(400).json({ error: 'TxType and Qty required' });

        db.transaction(() => {
            // 1. Get old transaction
            const oldTx = db.prepare('SELECT * FROM SupplyTransaction WHERE ID=?').get(req.params.id);
            if (!oldTx) throw new Error('Transaction not found');

            const oldQty = parseFloat(oldTx.Qty) || 0;
            const oldDelta = (oldTx.TxType === 'Usage' || oldTx.TxType === 'Adjustment Out' || oldTx.TxType === 'Waste') ? -oldQty : oldQty;
            
            const newQty = parseFloat(Qty);
            const newDelta = (TxType === 'Usage' || TxType === 'Adjustment Out' || TxType === 'Waste') ? -newQty : newQty;
            
            // 2. Reverse old delta and apply new delta to item
            db.prepare('UPDATE SupplyItem SET OnHand = OnHand - ? + ? WHERE ID=?').run(oldDelta, newDelta, oldTx.ItemID);

            // 3. Update transaction record
            const uc = parseFloat(UnitCost) || 0;
            const newTotalCost = Math.round(newQty * uc * 100) / 100;
            db.prepare(`UPDATE SupplyTransaction SET TxDate=?, TxType=?, Qty=?, UOM=?, UnitCost=?, TotalCost=?, Reference=?, Notes=?, EnteredBy=? WHERE ID=?`)
              .run(TxDate, TxType, newQty, UOM, uc, newTotalCost, Reference, Notes, EnteredBy, req.params.id);
        })();
        
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/supply-chain/summary
// ══════════════════════════════════════════════════════════════════════════════
// ── All-Sites Rollup ──────────────────────────────────────────────────────────
// System DBs excluded from the plant sweep
const SC_NON_PLANT_DBS = new Set([
    'schema_template', 'corporate_master', 'Corporate_Office', 'dairy_master',
    'it_master', 'logistics', 'trier_auth', 'trier_chat', 'trier_logistics',
    'examples'
]);

let _allSitesCache = null;
let _allSitesCacheTs = 0;
const ALL_SITES_TTL = 15 * 60 * 1000; // 15 minutes

function getAllSupplyChainDbs() {
    const plantDbs = [];
    try {
        const files = fs.readdirSync(dataDir).filter(f => {
            if (!f.endsWith('.db')) return false;
            const id = f.replace('.db', '');
            if (SC_NON_PLANT_DBS.has(id)) return false;
            if (f.startsWith('trier_') || f.startsWith('logistics')) return false;
            return true;
        });
        for (const f of files) {
            try {
                const plantId = f.replace('.db', '');
                const db = new Database(path.join(dataDir, f), { readonly: true });
                // Must have SupplyItem to be useful
                const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='SupplyItem'").get();
                if (hasTable) plantDbs.push({ plantId, db });
                else db.close();
            } catch { /* skip locked/broken */ }
        }
    } catch (e) { console.error('[supply-chain/all-sites]', e.message); }
    return plantDbs;
}

router.get('/all-sites', (req, res) => {
    try {
        const now = Date.now();
        if (_allSitesCache && (now - _allSitesCacheTs) < ALL_SITES_TTL) {
            return res.json(_allSitesCache);
        }

        const plants = getAllSupplyChainDbs();

        let openOrders = 0, overdueOrders = 0, totalInventoryValue = 0, totalItems = 0;
        const spendByPlant = [];
        const vendorSpend = {};     // vendorName → totalSpend
        const vendorOrders = {};    // vendorName → openOrderCount

        const today = new Date().toISOString().slice(0, 10);

        for (const { plantId, db } of plants) {
            try {
                // Open / overdue POs
                const open = db.prepare("SELECT COUNT(*) as c FROM SupplyPO WHERE Status IN ('Open','Partial')").get()?.c || 0;
                const overdue = db.prepare(
                    "SELECT COUNT(*) as c FROM SupplyPO WHERE Status IN ('Open','Partial') AND ExpectedDate IS NOT NULL AND ExpectedDate < ?"
                ).get(today)?.c || 0;
                const invValue = db.prepare(
                    'SELECT ROUND(COALESCE(SUM(OnHand*UnitCost),0),2) as v FROM SupplyItem WHERE ActiveFlag=1'
                ).get()?.v || 0;
                const items = db.prepare('SELECT COUNT(*) as c FROM SupplyItem WHERE ActiveFlag=1').get()?.c || 0;

                // MTD spend: received POs this month
                const mtdStart = today.slice(0, 7) + '-01';
                const mtdSpend = db.prepare(
                    "SELECT ROUND(COALESCE(SUM(TotalValue),0),2) as v FROM SupplyPO WHERE Status='Received' AND ReceivedDate >= ?"
                ).get(mtdStart)?.v || 0;

                openOrders += open;
                overdueOrders += overdue;
                totalInventoryValue += invValue;
                totalItems += items;

                spendByPlant.push({ plantId, openOrders: open, overdueOrders: overdue, mtdSpend, inventoryValue: invValue });

                // Per-vendor open order rollup
                try {
                    const vendorRows = db.prepare(`
                        SELECT v.VendorName, COUNT(po.ID) as orders,
                               ROUND(COALESCE(SUM(po.TotalValue),0),2) as spend
                        FROM SupplyPO po
                        JOIN SupplyVendor v ON v.ID = po.VendorID
                        WHERE po.Status IN ('Open','Partial')
                        GROUP BY v.VendorName
                    `).all();
                    for (const row of vendorRows) {
                        vendorSpend[row.VendorName] = (vendorSpend[row.VendorName] || 0) + row.spend;
                        vendorOrders[row.VendorName] = (vendorOrders[row.VendorName] || 0) + row.orders;
                    }
                } catch { /* vendor table may be missing */ }
            } catch { /* skip plant on error */ } finally {
                db.close();
            }
        }

        // Build top-vendor list sorted by open spend
        const topSpend = Object.entries(vendorSpend)
            .map(([name, spend]) => ({ name, spend, orders: vendorOrders[name] || 0 }))
            .sort((a, b) => b.spend - a.spend)
            .slice(0, 10);

        const result = {
            openOrders, overdueOrders, totalInventoryValue: Math.round(totalInventoryValue * 100) / 100,
            totalItems, spendByPlant, topSpend, plantCount: plants.length,
            asOf: new Date().toISOString()
        };
        _allSitesCache = result;
        _allSitesCacheTs = now;
        res.json(result);
    } catch (e) {
        console.error('[supply-chain/all-sites]', e.message);
        res.status(500).json({ error: e.message });
    }
});

router.get('/summary', (req, res) => {
    try {
        const plantId = getPlantId(req);
        if (guardAllSites(res, plantId)) return;
        const db = getDb(plantId); ensureTables(db);
        const totalItems   = db.prepare('SELECT COUNT(*) as c FROM SupplyItem WHERE ActiveFlag=1').get().c;
        const totalValue   = db.prepare('SELECT ROUND(COALESCE(SUM(OnHand*UnitCost),0), 2) as v FROM SupplyItem WHERE ActiveFlag=1').get().v;
        const lowStock     = db.prepare('SELECT COUNT(*) as c FROM SupplyItem WHERE ActiveFlag=1 AND ReorderPt>0 AND OnHand<=ReorderPt').get().c;
        const openPOs      = db.prepare("SELECT COUNT(*) as c FROM SupplyPO WHERE Status IN ('Open','Partial')").get().c;
        const openPOValue  = db.prepare("SELECT ROUND(COALESCE(SUM(TotalValue),0), 2) as v FROM SupplyPO WHERE Status IN ('Open','Partial')").get().v;
        const vendorCount  = db.prepare('SELECT COUNT(*) as c FROM SupplyVendor WHERE ActiveFlag=1').get().c;
        const hazMatCount  = db.prepare('SELECT COUNT(*) as c FROM SupplyItem WHERE HazMat=1 AND ActiveFlag=1').get().c;
        const byCategory   = db.prepare(`SELECT Category, COUNT(*) as items, ROUND(COALESCE(SUM(OnHand*UnitCost),0), 2) as value
            FROM SupplyItem WHERE ActiveFlag=1 GROUP BY Category ORDER BY value DESC`).all();
        const lowStockItems = db.prepare(`
            SELECT i.Description, i.Category, i.OnHand, i.ReorderPt, i.UOM, v.VendorName, i.MinStock
            FROM SupplyItem i LEFT JOIN SupplyVendor v ON v.ID=i.VendorID
            WHERE i.ActiveFlag=1 AND i.ReorderPt>0 AND i.OnHand<=i.ReorderPt
            ORDER BY (i.OnHand/NULLIF(i.ReorderPt,0)) ASC LIMIT 10`).all();
        res.json({ totalItems, totalValue, lowStock, openPOs, openPOValue, vendorCount, hazMatCount, byCategory, lowStockItems });
    } catch (e) { console.error('[supply/summary]', e.message); res.status(500).json({ error: e.message }); }
});

module.exports = router;
