// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS — Plant Setup & Configuration API
 * ===========================================
 * The "Plant DNA" module — everything that makes one facility different
 * from another: production model type, processing units, SKU catalog,
 * shift calendar, and third-party system integrations.
 * All data lives in trier_logistics.db keyed by PlantID.
 * Mounted at /api/plant-setup in server/index.js.
 *
 * ENDPOINTS:
 *   GET    /config                  Plant production model (fluid-process, discrete, batch…)
 *   PUT    /config                  Update production model
 *   GET    /units                   List all production units (pasteurizers, fillers, separators…)
 *   GET    /units/:id               Single production unit detail
 *   POST   /units                   Add a production unit
 *   PUT    /units/:id               Update a production unit
 *   GET    /products                List active SKUs for this plant
 *   GET    /products/:id            Single SKU detail
 *   POST   /products                Add a SKU (baseline qty, UOM, family)
 *   PUT    /products/:id            Update SKU targets (qty, holiday qty, active flag)
 *   GET    /calendar                Production calendar entries (runs, holidays)
 *   POST   /calendar                Add a calendar entry
 *   PUT    /calendar/:id            Update a calendar entry
 *   DELETE /calendar/:id            Remove a calendar entry
 *   POST   /seed                    Seed default units + products (new plant onboarding)
 *   GET    /summary                 Rollup: unit count, SKU count, next production date
 *   GET    /integrations            Configured third-party integrations (SAP, ERP, SCADA)
 *   POST   /integrations            Register a new integration endpoint
 *   POST   /integrations/test       Live HTTP probe to verify integration connectivity
 *   POST   /products/import         Bulk-insert pre-mapped SKU rows from CSV or DB import
 *   POST   /products/import-db      Upload a .db/.sqlite file; scans tables for SKU data, returns preview
 *   POST   /integrations/simulator/toggle  Start or stop the built-in Modbus TCP simulator for an integration
 *   POST   /integrations/worker/start      Launch an EdgeAgent sync worker for a plant × integration
 *   POST   /integrations/worker/stop       Stop a running EdgeAgent sync worker
 *   GET    /integrations/worker/status     All worker and simulator states for this plant
 *   GET    /integrations/worker/data       Recent SensorReadings from the plant DB (up to 200 rows)
 *
 * PRODUCTION MODELS:
 *   'fluid-process'  — Dairy/beverage (continuous flow, volume-based — the Trier default)
 *   'discrete'       — Packaged goods, count-based production
 *   'batch'          — Batch manufacturing with lot tracking
 *   'continuous'     — Non-stop continuous process
 *
 * CRITICALITY CLASSES (ProductionUnits.CriticalityClass):
 *   A = Critical — plant stops without it
 *   B = Important — degraded operations if down
 *   C = Non-critical — nice to have
 *
 * INTEGRATION TEST FLOW: POST /integrations/test makes a live HTTP probe to
 * the endpoint URL (5-second timeout) and returns { reachable, statusCode, latencyMs }.
 * Used by AdminConsole to validate config before committing to the database.
 */
const express = require('express');
const router = express.Router();
const { db: logisticsDb } = require('../logistics_db');
const integrationManager = require('../integrations/integration-manager');
const { TAG_DEFINITIONS } = require('../integrations/modbus-simulator');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const dataDir = require('../resolve_data_dir');
const multer = require('multer');

// ── SKU Import — File Upload Middleware ───────────────────────────────────────
// Multer diskStorage for .db/.sqlite uploads from the SKUImportModal wizard.
// CSV files are parsed entirely client-side (PapaParse) and never hit this middleware.
// Uploaded files land in {dataDir}/uploads/sku-imports/ and are auto-deleted
// after 10 minutes by the import-db route handler.
const skuUploadDir = path.join(dataDir, 'uploads', 'sku-imports');
const skuUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            if (!fs.existsSync(skuUploadDir)) fs.mkdirSync(skuUploadDir, { recursive: true });
            cb(null, skuUploadDir);
        },
        filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`),
    }),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (['.db', '.sqlite', '.sqlite3'].includes(ext)) cb(null, true);
        else cb(new Error('Only .db / .sqlite files are accepted here'));
    },
});

// ── Table Init ───────────────────────────────────────────────────────────────
function initPlantSetupTables() {
    logisticsDb.exec(`
        CREATE TABLE IF NOT EXISTS PlantConfiguration (
            PlantID TEXT PRIMARY KEY,
            ProductionModel TEXT DEFAULT 'fluid-process',
            UpdatedAt TEXT DEFAULT (datetime('now')),
            UpdatedBy TEXT
        );
        CREATE TABLE IF NOT EXISTS ProductionUnits (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            PlantID TEXT NOT NULL,
            UnitName TEXT NOT NULL,
            UnitType TEXT DEFAULT 'Processing',
            Description TEXT,
            CapacityPerHour REAL,
            CapacityUnit TEXT DEFAULT 'units/hr',
            FloorSpaceSqFt REAL,
            CriticalityClass TEXT DEFAULT 'B',
            Status TEXT DEFAULT 'Active',
            SortOrder INTEGER DEFAULT 0,
            Notes TEXT,
            CreatedAt TEXT DEFAULT (datetime('now')),
            UpdatedAt TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS PlantProducts (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            PlantID TEXT NOT NULL,
            SKU TEXT NOT NULL,
            ProductName TEXT NOT NULL,
            ProductFamily TEXT,
            BaselineDailyQty REAL DEFAULT 0,
            HolidayQty REAL DEFAULT 0,
            UOM TEXT DEFAULT 'cases',
            Active INTEGER DEFAULT 1,
            Notes TEXT,
            CreatedAt TEXT DEFAULT (datetime('now')),
            UpdatedAt TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS PlantCalendar (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            PlantID TEXT NOT NULL,
            EventDate TEXT NOT NULL,
            EventType TEXT DEFAULT 'holiday',
            Label TEXT NOT NULL,
            ProductionCapacityPct REAL DEFAULT 0,
            AppliesToAll INTEGER DEFAULT 1,
            CreatedAt TEXT DEFAULT (datetime('now'))
        );
    `);
    console.log('[PLANT_SETUP] Tables initialized');
}
initPlantSetupTables();

// ── Safe column migrations ────────────────────────────────────────────────────
const addCols = [
    "ALTER TABLE PlantProducts ADD COLUMN ButterfatPct REAL DEFAULT 0",
    "ALTER TABLE PlantProducts ADD COLUMN LabelName TEXT",
    "ALTER TABLE PlantProducts ADD COLUMN SizeCode TEXT",
    "ALTER TABLE PlantProducts ADD COLUMN SizeOz REAL",
    "ALTER TABLE PlantProducts ADD COLUMN ProductionSequence INTEGER DEFAULT 0",
    "ALTER TABLE PlantProducts ADD COLUMN ChangeoverFromPrev TEXT DEFAULT 'none'",
];
for (const sql of addCols) { try { logisticsDb.exec(sql); } catch (_) {} }
try { logisticsDb.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_plantproducts_sku ON PlantProducts(PlantID, SKU)'); } catch (_) {}

const getPlantId = (req) => req.headers['x-plant-id'] || 'Plant_1';

// ── Plant Configuration ──────────────────────────────────────────────────────
router.get('/config', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const config = logisticsDb.prepare('SELECT * FROM PlantConfiguration WHERE PlantID=?').get(plantId);
        res.json(config || { PlantID: plantId, ProductionModel: null });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch config' }); }
});

router.put('/config', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const { productionModel } = req.body;
        if (!productionModel) return res.status(400).json({ error: 'productionModel required' });
        logisticsDb.prepare(`
            INSERT INTO PlantConfiguration (PlantID, ProductionModel, UpdatedAt) VALUES (?,?,datetime('now'))
            ON CONFLICT(PlantID) DO UPDATE SET ProductionModel=excluded.ProductionModel, UpdatedAt=datetime('now')
        `).run(plantId, productionModel);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to save config: ' + err.message }); }
});

// ── Production Units ─────────────────────────────────────────────────────────
router.get('/units', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const { status, type, search } = req.query;
        let sql = 'SELECT * FROM ProductionUnits WHERE PlantID=?';
        const p = [plantId];
        if (status) { sql += ' AND Status=?'; p.push(status); }
        if (type) { sql += ' AND UnitType=?'; p.push(type); }
        if (search) { sql += ' AND (UnitName LIKE ? OR UnitType LIKE ? OR Description LIKE ?)'; p.push(`%${search}%`, `%${search}%`, `%${search}%`); }
        sql += ' ORDER BY SortOrder ASC, UnitName ASC';
        res.json(logisticsDb.prepare(sql).all(...p));
    } catch (err) { res.status(500).json({ error: 'Failed to fetch units' }); }
});

router.get('/units/:id', (req, res) => {
    try {
        const unit = logisticsDb.prepare('SELECT * FROM ProductionUnits WHERE ID=?').get(req.params.id);
        if (!unit) return res.status(404).json({ error: 'Unit not found' });
        res.json(unit);
    } catch (err) { res.status(500).json({ error: 'Failed to fetch unit' }); }
});

router.post('/units', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const { unitName, unitType, description, capacityPerHour, capacityUnit, floorSpaceSqFt, criticalityClass, status, sortOrder, notes } = req.body;
        if (!unitName) return res.status(400).json({ error: 'Unit name required' });
        const r = logisticsDb.prepare(`
            INSERT INTO ProductionUnits (PlantID, UnitName, UnitType, Description, CapacityPerHour, CapacityUnit, FloorSpaceSqFt, CriticalityClass, Status, SortOrder, Notes)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
        `).run(plantId, unitName, unitType || 'Processing', description || null, capacityPerHour || null, capacityUnit || 'units/hr', floorSpaceSqFt || null, criticalityClass || 'B', status || 'Active', sortOrder || 0, notes || null);
        res.status(201).json({ success: true, id: r.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: 'Failed to create unit: ' + err.message }); }
});

router.put('/units/:id', (req, res) => {
    try {
        const allowed = ['UnitName', 'UnitType', 'Description', 'CapacityPerHour', 'CapacityUnit', 'FloorSpaceSqFt', 'CriticalityClass', 'Status', 'SortOrder', 'Notes'];
        const f = []; const v = [];
        for (const [k, val] of Object.entries(req.body)) { if (allowed.includes(k)) { f.push(`${k}=?`); v.push(val); } }
        if (f.length === 0) return res.json({ success: true });
        f.push("UpdatedAt=datetime('now')"); v.push(req.params.id);
        logisticsDb.prepare(`UPDATE ProductionUnits SET ${f.join(',')} WHERE ID=?`).run(...v);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to update unit' }); }
});

// ── Products / SKU Catalog ───────────────────────────────────────────────────
router.get('/products', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const { family, search, active } = req.query;
        let sql = 'SELECT * FROM PlantProducts WHERE PlantID=?';
        const p = [plantId];
        if (active !== undefined) { sql += ' AND Active=?'; p.push(active === 'false' ? 0 : 1); }
        if (family) { sql += ' AND ProductFamily=?'; p.push(family); }
        if (search) { sql += ' AND (SKU LIKE ? OR ProductName LIKE ? OR ProductFamily LIKE ?)'; p.push(`%${search}%`, `%${search}%`, `%${search}%`); }
        sql += ' ORDER BY ProductFamily ASC, SKU ASC';
        res.json(logisticsDb.prepare(sql).all(...p));
    } catch (err) { res.status(500).json({ error: 'Failed to fetch products' }); }
});

router.get('/products/:id', (req, res) => {
    try {
        const product = logisticsDb.prepare('SELECT * FROM PlantProducts WHERE ID=?').get(req.params.id);
        if (!product) return res.status(404).json({ error: 'Product not found' });
        res.json(product);
    } catch (err) { res.status(500).json({ error: 'Failed to fetch product' }); }
});

router.post('/products', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const { sku, productName, productFamily, baselineDailyQty, holidayQty, uom, notes } = req.body;
        if (!sku || !productName) return res.status(400).json({ error: 'SKU and product name required' });
        const r = logisticsDb.prepare(`
            INSERT INTO PlantProducts (PlantID, SKU, ProductName, ProductFamily, BaselineDailyQty, HolidayQty, UOM, Notes)
            VALUES (?,?,?,?,?,?,?,?)
        `).run(plantId, sku, productName, productFamily || null, baselineDailyQty || 0, holidayQty || 0, uom || 'cases', notes || null);
        res.status(201).json({ success: true, id: r.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: 'Failed to create product: ' + err.message }); }
});

router.put('/products/:id', (req, res) => {
    try {
        const allowed = ['SKU', 'ProductName', 'ProductFamily', 'LabelName', 'SizeCode', 'SizeOz', 'ButterfatPct', 'ProductionSequence', 'ChangeoverFromPrev', 'BaselineDailyQty', 'HolidayQty', 'UOM', 'Active', 'Notes'];
        const f = []; const v = [];
        for (const [k, val] of Object.entries(req.body)) { if (allowed.includes(k)) { f.push(`${k}=?`); v.push(val); } }
        if (f.length === 0) return res.json({ success: true });
        f.push("UpdatedAt=datetime('now')"); v.push(req.params.id);
        logisticsDb.prepare(`UPDATE PlantProducts SET ${f.join(',')} WHERE ID=?`).run(...v);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to update product' }); }
});

// ── Plant Calendar ───────────────────────────────────────────────────────────
router.get('/calendar', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const { year } = req.query;
        let sql = 'SELECT * FROM PlantCalendar WHERE PlantID=?';
        const p = [plantId];
        if (year) { sql += " AND EventDate LIKE ?"; p.push(`${year}%`); }
        sql += ' ORDER BY EventDate ASC';
        res.json(logisticsDb.prepare(sql).all(...p));
    } catch (err) { res.status(500).json({ error: 'Failed to fetch calendar' }); }
});

router.post('/calendar', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const { eventDate, eventType, label, productionCapacityPct, appliesToAll } = req.body;
        if (!eventDate || !label) return res.status(400).json({ error: 'Date and label required' });
        const r = logisticsDb.prepare(`
            INSERT INTO PlantCalendar (PlantID, EventDate, EventType, Label, ProductionCapacityPct, AppliesToAll)
            VALUES (?,?,?,?,?,?)
        `).run(plantId, eventDate, eventType || 'holiday', label, productionCapacityPct ?? 0, appliesToAll !== false ? 1 : 0);
        res.status(201).json({ success: true, id: r.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: 'Failed to create calendar event: ' + err.message }); }
});

router.put('/calendar/:id', (req, res) => {
    try {
        const allowed = ['EventDate', 'EventType', 'Label', 'ProductionCapacityPct', 'AppliesToAll'];
        const f = []; const v = [];
        for (const [k, val] of Object.entries(req.body)) { if (allowed.includes(k)) { f.push(`${k}=?`); v.push(val); } }
        if (f.length === 0) return res.json({ success: true });
        v.push(req.params.id);
        logisticsDb.prepare(`UPDATE PlantCalendar SET ${f.join(',')} WHERE ID=?`).run(...v);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to update calendar event' }); }
});

router.delete('/calendar/:id', (req, res) => {
    try {
        logisticsDb.prepare('DELETE FROM PlantCalendar WHERE ID=?').run(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to delete calendar event' }); }
});

// ── Seed Demo Data — Dairy Processing Plant ──────────────────────────────────
router.post('/seed', (req, res) => {
    try {
        const plantId = getPlantId(req);

        const existing = logisticsDb.prepare('SELECT COUNT(*) as c FROM ProductionUnits WHERE PlantID=?').get(plantId).c;
        if (existing > 0 && !req.query.force) {
            return res.json({ success: true, skipped: true, message: 'Already seeded. Use ?force=true to re-seed.' });
        }

        logisticsDb.prepare('DELETE FROM ProductionUnits WHERE PlantID=?').run(plantId);
        logisticsDb.prepare('DELETE FROM PlantProducts WHERE PlantID=?').run(plantId);
        logisticsDb.prepare('DELETE FROM PlantCalendar WHERE PlantID=?').run(plantId);
        logisticsDb.prepare(`
            INSERT INTO PlantConfiguration (PlantID, ProductionModel, UpdatedAt) VALUES (?,?,datetime('now'))
            ON CONFLICT(PlantID) DO UPDATE SET ProductionModel=excluded.ProductionModel, UpdatedAt=datetime('now')
        `).run(plantId, 'fluid-process');

        // ── Production Units ─────────────────────────────────────────────────
        const units = [
            { name: 'Raw Milk Receiving',              type: 'Receiving',  desc: 'Tanker truck unloading bay. Bulk raw milk receipt, sampling, and initial quality check before silo storage.',     capacity: 50000,  cunit: 'lbs/hr',       sqft: 3200,  crit: 'A', sort: 1  },
            { name: 'Silo 1 — Raw Milk',               type: 'Storage',    desc: '100,000 lb refrigerated vertical silo for raw whole milk. Primary holding before processing.',                     capacity: 100000, cunit: 'lbs',          sqft: 800,   crit: 'A', sort: 2  },
            { name: 'Silo 2 — Raw Milk',               type: 'Storage',    desc: '100,000 lb refrigerated vertical silo. Backup and overflow raw milk capacity.',                                    capacity: 100000, cunit: 'lbs',          sqft: 800,   crit: 'B', sort: 3  },
            { name: 'Silo 3 — Skim Milk',              type: 'Storage',    desc: '60,000 lb silo holding separated skim milk prior to standardization and HTST.',                                    capacity: 60000,  cunit: 'lbs',          sqft: 600,   crit: 'A', sort: 4  },
            { name: 'Cream Separator',                 type: 'Processing', desc: 'Centrifugal separator splits raw whole milk into skim milk and cream streams. Feeds standardization loop.',        capacity: 30000,  cunit: 'lbs/hr',       sqft: 640,   crit: 'A', sort: 5  },
            { name: 'Standardization Loop',            type: 'Processing', desc: 'Inline fat standardization blends cream back into skim to hit target butterfat: 0%, 1%, 2%, or 3.25%.',          capacity: 25000,  cunit: 'lbs/hr',       sqft: 480,   crit: 'A', sort: 6  },
            { name: 'HTST Pasteurizer #1',             type: 'Processing', desc: 'High-Temperature Short-Time pasteurizer. Whole milk and 2% lines. 161°F / 15 sec. PHE plate design.',            capacity: 25000,  cunit: 'lbs/hr',       sqft: 1200,  crit: 'A', sort: 7  },
            { name: 'HTST Pasteurizer #2',             type: 'Processing', desc: 'High-Temperature Short-Time pasteurizer. Skim, 1%, and low-fat lines. Dedicated to lighter fat products.',        capacity: 25000,  cunit: 'lbs/hr',       sqft: 1200,  crit: 'A', sort: 8  },
            { name: 'Homogenizer #1',                  type: 'Processing', desc: 'High-pressure homogenizer at 2,500 PSI. Prevents cream separation on whole milk, 2%, chocolate lines.',          capacity: 20000,  cunit: 'lbs/hr',       sqft: 480,   crit: 'A', sort: 9  },
            { name: 'Homogenizer #2',                  type: 'Processing', desc: 'Backup homogenizer. Runs on 1%, skim, and buttermilk lines. Cross-connected for surge capacity.',                capacity: 15000,  cunit: 'lbs/hr',       sqft: 480,   crit: 'B', sort: 10 },
            { name: 'Chocolate Blend Tank',            type: 'Processing', desc: 'Jacketed blend tank for cocoa and sugar slurry injection into chocolate milk lines. 5,000 gal capacity.',         capacity: 5000,   cunit: 'gal',          sqft: 640,   crit: 'B', sort: 11 },
            { name: 'Buttermilk Culture Tanks',        type: 'Processing', desc: 'Two 3,000-gal jacketed culture tanks for cultured buttermilk. 18–20 hr culture cycle at 72°F.',                  capacity: 6000,   cunit: 'gal/batch',    sqft: 800,   crit: 'B', sort: 12 },
            { name: 'Juice Blending System',           type: 'Processing', desc: 'Stainless blending manifold for juice and fruit drink production. Separate from milk circuit.',                    capacity: 8000,   cunit: 'gal/hr',       sqft: 720,   crit: 'C', sort: 13 },
            { name: 'UHT System',                      type: 'Processing', desc: 'Ultra-High Temperature for extended shelf-life milk. 280°F / 2 sec. Aseptic filling.',                           capacity: 12000,  cunit: 'lbs/hr',       sqft: 960,   crit: 'B', sort: 14 },
            { name: 'CIP Station #1',                  type: 'CIP',        desc: 'Clean-in-Place serving the fluid milk processing loop and HTST #1. 3-phase: caustic, acid, rinse.',              capacity: null,   cunit: null,           sqft: 560,   crit: 'A', sort: 15 },
            { name: 'CIP Station #2',                  type: 'CIP',        desc: 'CIP for HTST #2, homogenizers, standardization loop, and chocolate blend tank.',                                  capacity: null,   cunit: null,           sqft: 560,   crit: 'A', sort: 16 },
            { name: 'Packaging Line 1 — Gallons/HGL',  type: 'Packaging',  desc: 'High-speed HDPE gallon and half-gallon filler. All fat variants — sequenced Skim→1%→2%→Whole. Air blow between changes.', capacity: 180, cunit: 'cases/min',  sqft: 3200,  crit: 'A', sort: 17 },
            { name: 'Packaging Line 2 — Quarts/Pints', type: 'Packaging',  desc: 'Quart and pint filler. Fluid milk, chocolate milk, buttermilk, juice. Air blow required between product changes.', capacity: 120, cunit: 'cases/min',  sqft: 2400,  crit: 'A', sort: 18 },
            { name: 'Packaging Line 3 — Small Sizes',  type: 'Packaging',  desc: '10oz, ½ Pint (8oz), and 4oz small format filler. School lunch, foodservice, and club pack runs.',               capacity: 80,     cunit: 'cases/min',    sqft: 1800,  crit: 'B', sort: 19 },
            { name: 'Packaging Line 4 — Juice/Drinks', type: 'Packaging',  desc: 'Dedicated juice and fruit drink filling line. HDPE gallon through 8oz. Isolated from milk circuit.',             capacity: 60,     cunit: 'cases/min',    sqft: 1600,  crit: 'B', sort: 20 },
            { name: 'Cold Storage — Room A',           type: 'Storage',    desc: 'Primary finished goods cold storage at 34°F. Fluid milk, 48,000-case capacity. Direct truck dock.',              capacity: 48000,  cunit: 'cases',        sqft: 12000, crit: 'A', sort: 21 },
            { name: 'Cold Storage — Room B',           type: 'Storage',    desc: 'Secondary cold storage at 34°F. Juice, drinks, and overflow milk. 32,000-case capacity.',                        capacity: 32000,  cunit: 'cases',        sqft: 8000,  crit: 'A', sort: 22 },
            { name: 'Boiler Room',                     type: 'Utilities',  desc: 'Twin fire-tube boilers. Steam for HTST, CIP, pasteurization, and process heat. 150 PSI. N+1 redundancy.',        capacity: 20000,  cunit: 'lbs/hr steam', sqft: 1800,  crit: 'A', sort: 23 },
            { name: 'Compressed Air System',           type: 'Utilities',  desc: 'Plant-wide compressed air at 100 PSI. Feeds pneumatic valves, air blow manifolds, and instrument air.',           capacity: 1200,   cunit: 'SCFM',         sqft: 480,   crit: 'A', sort: 24 },
            { name: 'Refrigeration — Ammonia System',  type: 'Utilities',  desc: 'Central ammonia refrigeration plant. Feeds silo cooling jackets, cold storage rooms, and process chillers.',     capacity: 800,    cunit: 'tons',         sqft: 2400,  crit: 'A', sort: 25 },
            { name: 'QC Laboratory',                   type: 'Quality',    desc: 'On-site quality lab. Bacteria counts, somatic cells, butterfat analysis, CIP verification, and product release.', capacity: null,   cunit: null,           sqft: 1200,  crit: 'B', sort: 26 },
        ];

        const insertUnit = logisticsDb.prepare(`
            INSERT INTO ProductionUnits (PlantID, UnitName, UnitType, Description, CapacityPerHour, CapacityUnit, FloorSpaceSqFt, CriticalityClass, Status, SortOrder)
            VALUES (?,?,?,?,?,?,?,?,?,?)
        `);
        for (const u of units) {
            insertUnit.run(plantId, u.name, u.type, u.desc, u.capacity, u.cunit, u.sqft, u.crit, 'Active', u.sort);
        }

        // ── SKU Catalog — Full Dairy Matrix ──────────────────────────────────
        //
        // Production run sequence (ascending butterfat minimizes waste):
        //   Skim (0%) → 1% → 2% → Whole (3.25%) → Choc 2% → Choc Whole
        //   Air blow required between EVERY fat-content change.
        //   First 3–5 gallons after blow = "blend" diverted to animal feed.
        //   Buttermilk, Juice, Fruit Drinks run on separate equipment.
        //
        // Labels: 6 private-label / retail brands + house brand
        // Sizes: Gallon, ½ Gallon, Quart, Pint, 10oz, ½ Pint (8oz), 4oz

        const LABELS = [
            { code: 'LA', name: 'Label A',  share: 0.22 },
            { code: 'LB', name: 'Label B',  share: 0.20 },
            { code: 'LC', name: 'Label C',  share: 0.17 },
            { code: 'LD', name: 'Label D',  share: 0.15 },
            { code: 'LE', name: 'Label E',  share: 0.14 },
            { code: 'LF', name: 'Label F',  share: 0.12 },
        ];

        // Products in production run order within the fat content sequence
        // changeoverFromPrev: what changeover is needed from the previous product
        const FLUID_PRODUCTS = [
            { code: 'SKIM',  name: 'Skim Milk',           fat: 0.0,  seq: 1,  changeover: 'none',     sizes: ['GAL','HGL','QT','PT','HP','4OZ'], baseQty: 1200, hPct: 0.50, notes: 'Run first — zero butterfat. No air blow needed at start of run.' },
            { code: '1PCT',  name: '1% Low Fat Milk',      fat: 1.0,  seq: 2,  changeover: 'air-blow', sizes: ['GAL','HGL','QT','HP'],            baseQty: 800,  hPct: 0.40, notes: 'Air blow from skim. ~3 gal blend diverted. Rising fat content.' },
            { code: '2PCT',  name: '2% Reduced Fat Milk',  fat: 2.0,  seq: 3,  changeover: 'air-blow', sizes: ['GAL','HGL','QT','PT','HP'],       baseQty: 3200, hPct: 0.45, notes: 'Highest volume product. Air blow from 1%. ~3 gal blend diverted.' },
            { code: 'WHOLE', name: 'Whole Milk',           fat: 3.25, seq: 4,  changeover: 'air-blow', sizes: ['GAL','HGL','QT','PT','HP','4OZ'], baseQty: 2400, hPct: 0.40, notes: 'Last fluid milk in fat sequence. Air blow from 2%. ~5 gal blend.' },
        ];

        const CHOC_PRODUCTS = [
            { code: 'CHOC2',  name: 'Chocolate 2% Milk',   fat: 2.0,  seq: 5,  changeover: 'water-flush', sizes: ['GAL','HGL','QT','PT','HP','4OZ'], baseQty: 600, hPct: 0.35, labels: ['LA','LB','LC','LD'], notes: 'Chocolate run after whole milk. Water flush + air blow. Cocoa residue in first few gal.' },
            { code: 'CHOCW',  name: 'Chocolate Whole Milk', fat: 3.25, seq: 6,  changeover: 'air-blow',    sizes: ['GAL','HGL','QT','PT','HP','4OZ'], baseQty: 480, hPct: 0.30, labels: ['LA','LB','LC','LD'], notes: 'After choc 2%. Air blow only — same cocoa system. Highest fat chocolate.' },
        ];

        const OTHER_PRODUCTS = [
            { code: 'BTRMILK', name: 'Cultured Buttermilk', fat: 0.5,  seq: 7,  changeover: 'full-cip', sizes: ['GAL','QT','PT'], baseQty: 320, hPct: 0.20, labels: ['LA','LB','LC'], notes: 'Separate cultured run on dedicated line. Full CIP before and after. 18–20 hr culture cycle.' },
            { code: 'OJ',      name: 'Orange Juice',         fat: 0,    seq: 8,  changeover: 'full-cip', sizes: ['GAL','HGL','QT','HP'], baseQty: 280, hPct: 0.25, labels: ['LA','LB'], notes: 'Juice line — fully isolated from milk circuits. No cross-contamination risk.' },
            { code: 'APLDRK',  name: 'Apple Drink',          fat: 0,    seq: 9,  changeover: 'water-flush', sizes: ['HGL','QT','HP'], baseQty: 180, hPct: 0.20, labels: ['LA','LB'], notes: 'Fruit drink on juice line. Water flush between juice and drink runs.' },
            { code: 'PUNCH',   name: 'Fruit Punch Drink',    fat: 0,    seq: 10, changeover: 'water-flush', sizes: ['HGL','QT','HP'], baseQty: 160, hPct: 0.20, labels: ['LA','LB'], notes: 'Fruit drink. Water flush between products. Run after apple drink.' },
            { code: 'GRAPE',   name: 'Grape Drink',          fat: 0,    seq: 11, changeover: 'water-flush', sizes: ['QT','HP'],       baseQty: 120, hPct: 0.15, labels: ['LA'], notes: 'Grape drink. Water flush. Smallest volume SKU group.' },
        ];

        const SIZES = {
            'GAL':  { oz: 128, label: '1 Gallon',    qtyMult: 1.00 },
            'HGL':  { oz: 64,  label: '½ Gallon',   qtyMult: 0.55 },
            'QT':   { oz: 32,  label: '1 Quart',     qtyMult: 0.22 },
            'PT':   { oz: 16,  label: '1 Pint',      qtyMult: 0.14 },
            '10OZ': { oz: 10,  label: '10 oz',       qtyMult: 0.08 },
            'HP':   { oz: 8,   label: '½ Pint',     qtyMult: 0.10 },
            '4OZ':  { oz: 4,   label: '4 oz',        qtyMult: 0.05 },
        };

        const insertProduct = logisticsDb.prepare(`
            INSERT INTO PlantProducts
              (PlantID, SKU, ProductName, ProductFamily, LabelName, SizeCode, SizeOz,
               ButterfatPct, ProductionSequence, ChangeoverFromPrev,
               BaselineDailyQty, HolidayQty, UOM, Notes)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `);

        let totalProducts = 0;

        // Helper to generate SKUs for a product group
        const genSKUs = (products, family, allLabels) => {
            for (const prod of products) {
                const labels = prod.labels
                    ? LABELS.filter(l => prod.labels.includes(l.code))
                    : LABELS;
                for (const lbl of labels) {
                    for (const sizeCode of prod.sizes) {
                        const sz = SIZES[sizeCode];
                        const sku = `${prod.code}-${sizeCode}-${lbl.code}`;
                        const name = `${prod.name} — ${sz.label} [${lbl.name}]`;
                        const baseQty = Math.round(prod.baseQty * lbl.share * sz.qtyMult);
                        const holidayQty = Math.round(baseQty * prod.hPct);
                        insertProduct.run(
                            plantId, sku, name, family,
                            lbl.name, sizeCode, sz.oz,
                            prod.fat, prod.seq, prod.changeover,
                            baseQty, holidayQty, 'cases', prod.notes || null
                        );
                        totalProducts++;
                    }
                }
            }
        };

        genSKUs(FLUID_PRODUCTS, 'Fluid Milk', true);
        genSKUs(CHOC_PRODUCTS,  'Chocolate',  false);
        genSKUs(OTHER_PRODUCTS, null, false); // family set in loop below — fix
        // Re-run other with correct families
        logisticsDb.prepare("UPDATE PlantProducts SET ProductFamily='Buttermilk'    WHERE PlantID=? AND SKU LIKE 'BTRMILK%'").run(plantId);
        logisticsDb.prepare("UPDATE PlantProducts SET ProductFamily='Juice'         WHERE PlantID=? AND SKU LIKE 'OJ%'").run(plantId);
        logisticsDb.prepare("UPDATE PlantProducts SET ProductFamily='Fruit Drinks'  WHERE PlantID=? AND (SKU LIKE 'APLDRK%' OR SKU LIKE 'PUNCH%' OR SKU LIKE 'GRAPE%')").run(plantId);

        // ── Non-matrix products (cream, butter, cheese, ingredients) ─────────
        const extras = [
            { sku: 'HVYCREAM-PT',   name: 'Heavy Whipping Cream — Pint',        family: 'Cream',       fat: 36,  seq: 20, co: 'none', qty: 800,  hqty: 250, uom: 'cases', label: 'Label A', sz: 'PT',  oz: 16 },
            { sku: 'HVYCREAM-QT',   name: 'Heavy Whipping Cream — Quart',       family: 'Cream',       fat: 36,  seq: 20, co: 'none', qty: 400,  hqty: 120, uom: 'cases', label: 'Label A', sz: 'QT',  oz: 32 },
            { sku: 'HALFHALF-PT',   name: 'Half & Half — Pint',                 family: 'Cream',       fat: 12,  seq: 21, co: 'none', qty: 640,  hqty: 200, uom: 'cases', label: 'Label A', sz: 'PT',  oz: 16 },
            { sku: 'HALFHALF-QT',   name: 'Half & Half — Quart',                family: 'Cream',       fat: 12,  seq: 21, co: 'none', qty: 320,  hqty: 100, uom: 'cases', label: 'Label A', sz: 'QT',  oz: 32 },
            { sku: 'SRCREAM-16OZ',  name: 'Sour Cream — 16 oz',                 family: 'Cream',       fat: 20,  seq: 22, co: 'none', qty: 320,  hqty: 90,  uom: 'cases', label: 'Label A', sz: 'HP',  oz: 16 },
            { sku: 'BUTTER-SALT',   name: 'Salted Butter — 1 lb Print',         family: 'Butter',      fat: 80,  seq: 30, co: 'none', qty: 1200, hqty: 300, uom: 'cases', label: 'Label A', sz: 'LB',  oz: 16 },
            { sku: 'BUTTER-UNSALT', name: 'Unsalted Butter — 1 lb Print',       family: 'Butter',      fat: 80,  seq: 31, co: 'none', qty: 900,  hqty: 250, uom: 'cases', label: 'Label A', sz: 'LB',  oz: 16 },
            { sku: 'CHEDDAR-8OZ',   name: 'Shredded Cheddar — 8 oz',            family: 'Cheese',      fat: 30,  seq: 40, co: 'none', qty: 600,  hqty: 180, uom: 'cases', label: 'Label A', sz: '8OZ', oz: 8  },
            { sku: 'MOZZ-8OZ',      name: 'Shredded Mozzarella — 8 oz',         family: 'Cheese',      fat: 20,  seq: 41, co: 'none', qty: 480,  hqty: 150, uom: 'cases', label: 'Label A', sz: '8OZ', oz: 8  },
            { sku: 'COTTAGE-16OZ',  name: 'Cottage Cheese — 16 oz',             family: 'Cheese',      fat: 4,   seq: 42, co: 'none', qty: 360,  hqty: 100, uom: 'cases', label: 'Label A', sz: '16OZ',oz: 16 },
            { sku: 'CREAMCHS-8OZ',  name: 'Cream Cheese — 8 oz Block',          family: 'Cheese',      fat: 33,  seq: 43, co: 'none', qty: 280,  hqty: 80,  uom: 'cases', label: 'Label A', sz: '8OZ', oz: 8  },
            { sku: 'WPC34-5LB',     name: 'Whey Protein Concentrate 34% — 5 lb',family: 'Ingredients', fat: 4,   seq: 50, co: 'none', qty: 120,  hqty: 30,  uom: 'bags',  label: 'Label A', sz: '5LB', oz: 80 },
        ];
        for (const e of extras) {
            insertProduct.run(plantId, e.sku, e.name, e.family, e.label, e.sz, e.oz, e.fat, e.seq, e.co, e.qty, e.hqty, e.uom, null);
            totalProducts++;
        }

        // ── Plant Calendar — 2026 ────────────────────────────────────────────
        const calEvents = [
            { date: '2026-01-01', type: 'federal-holiday',     label: "New Year's Day",                         pct: 0   },
            { date: '2026-01-19', type: 'federal-holiday',     label: 'Martin Luther King Jr. Day',             pct: 0   },
            { date: '2026-02-16', type: 'federal-holiday',     label: "Presidents' Day",                        pct: 0   },
            { date: '2026-05-25', type: 'federal-holiday',     label: 'Memorial Day',                           pct: 0   },
            { date: '2026-07-03', type: 'shutdown',            label: 'Independence Day (observed) — Shutdown', pct: 0   },
            { date: '2026-07-04', type: 'federal-holiday',     label: 'Independence Day',                       pct: 0   },
            { date: '2026-09-07', type: 'federal-holiday',     label: 'Labor Day',                              pct: 0   },
            { date: '2026-11-11', type: 'reduced-production',  label: "Veterans' Day — Reduced Crew",           pct: 50  },
            { date: '2026-11-25', type: 'reduced-production',  label: 'Day Before Thanksgiving — Early Release',pct: 75  },
            { date: '2026-11-26', type: 'federal-holiday',     label: 'Thanksgiving Day',                       pct: 0   },
            { date: '2026-11-27', type: 'shutdown',            label: 'Day After Thanksgiving — Plant Shutdown',pct: 0   },
            { date: '2026-12-24', type: 'shutdown',            label: 'Christmas Eve — Plant Shutdown',         pct: 0   },
            { date: '2026-12-25', type: 'federal-holiday',     label: 'Christmas Day',                          pct: 0   },
            { date: '2026-12-26', type: 'shutdown',            label: 'Day After Christmas — Shutdown',         pct: 0   },
            { date: '2026-12-31', type: 'shutdown',            label: "New Year's Eve — Early Shutdown",        pct: 20  },
        ];

        const insertCal = logisticsDb.prepare(`
            INSERT INTO PlantCalendar (PlantID, EventDate, EventType, Label, ProductionCapacityPct, AppliesToAll)
            VALUES (?,?,?,?,?,?)
        `);
        for (const e of calEvents) {
            insertCal.run(plantId, e.date, e.type, e.label, e.pct, 1);
        }

        res.json({
            success: true,
            seeded: { productionUnits: units.length, products: totalProducts, calendarEvents: calEvents.length }
        });
    } catch (err) { res.status(500).json({ error: 'Seed failed: ' + err.message }); }
});

// ── Summary stats ────────────────────────────────────────────────────────────
router.get('/summary', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const config = logisticsDb.prepare('SELECT * FROM PlantConfiguration WHERE PlantID=?').get(plantId);
        const units = logisticsDb.prepare('SELECT COUNT(*) as c FROM ProductionUnits WHERE PlantID=? AND Status=?').get(plantId, 'Active').c;
        const products = logisticsDb.prepare('SELECT COUNT(*) as c FROM PlantProducts WHERE PlantID=? AND Active=1').get(plantId).c;
        const critA = logisticsDb.prepare("SELECT COUNT(*) as c FROM ProductionUnits WHERE PlantID=? AND CriticalityClass='A'").get(plantId).c;
        const calEvents = logisticsDb.prepare('SELECT COUNT(*) as c FROM PlantCalendar WHERE PlantID=?').get(plantId).c;
        const upcomingShutdowns = logisticsDb.prepare("SELECT * FROM PlantCalendar WHERE PlantID=? AND EventDate >= date('now') ORDER BY EventDate ASC LIMIT 3").all(plantId);
        res.json({ config, units, products, critA, calEvents, upcomingShutdowns });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch summary' }); }
});

// ── API Integration Configuration ────────────────────────────────────────────
// Configs stored as JSON blob in PlantConfiguration.IntegrationConfig column.
try { logisticsDb.exec("ALTER TABLE PlantConfiguration ADD COLUMN IntegrationConfig TEXT DEFAULT '{}'"); } catch(_) {}

router.get('/integrations', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const row = logisticsDb.prepare('SELECT IntegrationConfig FROM PlantConfiguration WHERE PlantID=?').get(plantId);
        res.json(row ? JSON.parse(row.IntegrationConfig || '{}') : {});
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/integrations', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const { integrationId, config } = req.body;
        if (!integrationId) return res.status(400).json({ error: 'integrationId required' });
        // Read existing blob
        const row = logisticsDb.prepare('SELECT IntegrationConfig FROM PlantConfiguration WHERE PlantID=?').get(plantId);
        const existing = row ? JSON.parse(row.IntegrationConfig || '{}') : {};
        // Mask password fields before storage (store as-is; in prod consider encryption)
        existing[integrationId] = config;
        const blob = JSON.stringify(existing);
        logisticsDb.prepare(`
            INSERT INTO PlantConfiguration (PlantID, IntegrationConfig, UpdatedAt) VALUES (?,?,datetime('now'))
            ON CONFLICT(PlantID) DO UPDATE SET IntegrationConfig=excluded.IntegrationConfig, UpdatedAt=datetime('now')
        `).run(plantId, blob);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Test connection — performs a lightweight reachability check for known providers
router.post('/integrations/test', async (req, res) => {
    const { integrationId, config } = req.body || {};
    if (!integrationId || !config) return res.json({ ok: false, message: 'No configuration provided.' });

    const host = config.host || config.endpoint || '';
    const hasCredentials = !!(config.apiKey || config.password || config.username);

    // For SFTP/TCP-based integrations, attempt a lightweight socket ping if host is provided
    if (host && /^[\d.]+$/.test(host.split(':')[0])) {
        const net = require('net');
        const port = parseInt(config.port) || (integrationId === 'erp' ? 21 : integrationId === 'scada' ? 4840 : 80);
        const result = await new Promise(resolve => {
            const sock = new net.Socket();
            sock.setTimeout(4000);
            sock.connect(port, host.split(':')[0], () => { sock.destroy(); resolve({ ok: true, message: `TCP reachable at ${host}:${port}` }); });
            sock.on('error', e => resolve({ ok: false, message: `Connection refused: ${e.message}` }));
            sock.on('timeout', () => { sock.destroy(); resolve({ ok: false, message: `Timeout connecting to ${host}:${port}` }); });
        });
        return res.json(result);
    }

    // For REST/API integrations with an endpoint URL
    if (host.startsWith('http')) {
        const https = require('https');
        const http = require('http');
        const mod = host.startsWith('https') ? https : http;
        const result = await new Promise(resolve => {
            const req2 = mod.request(host, { method: 'HEAD', timeout: 5000, headers: hasCredentials ? { 'Authorization': `Bearer ${config.apiKey}` } : {} }, r => {
                resolve({ ok: r.statusCode < 500, message: `HTTP ${r.statusCode}` });
            });
            req2.on('error', e => resolve({ ok: false, message: e.message }));
            req2.on('timeout', () => { req2.destroy(); resolve({ ok: false, message: 'Request timed out' }); });
            req2.end();
        });
        return res.json(result);
    }

    // Cannot test — no host/endpoint configured
    if (!host) return res.json({ ok: false, message: 'No host or endpoint configured — fill in connection details first.' });
    return res.json({ ok: true, message: 'Configuration saved. Live test requires a reachable host IP or URL.' });
});

// ── SKU Bulk Import ───────────────────────────────────────────────────────────

// POST /products/import — Bulk insert pre-mapped rows from the SKUImportModal wizard.
// Body: { rows: MappedRow[], mode: 'skip' | 'overwrite' }
//   skip      — duplicate (PlantID, SKU) pairs are silently skipped (safe default)
//   overwrite — duplicates are updated via ON CONFLICT DO UPDATE (intentional re-import)
// Returns: { inserted, skipped, errors[] } — first 20 errors included for UI feedback.
router.post('/products/import', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const { rows, mode = 'skip' } = req.body; // mode: 'skip' | 'overwrite'
        if (!Array.isArray(rows) || rows.length === 0)
            return res.status(400).json({ error: 'rows array required' });

        const insert = logisticsDb.prepare(`
            INSERT INTO PlantProducts
                (PlantID, SKU, ProductName, ProductFamily, BaselineDailyQty, HolidayQty, UOM, SizeCode, Notes, Active)
            VALUES (?,?,?,?,?,?,?,?,?,1)
        `);
        const upsert = logisticsDb.prepare(`
            INSERT INTO PlantProducts
                (PlantID, SKU, ProductName, ProductFamily, BaselineDailyQty, HolidayQty, UOM, SizeCode, Notes, Active)
            VALUES (?,?,?,?,?,?,?,?,?,1)
            ON CONFLICT(PlantID, SKU) DO UPDATE SET
                ProductName=excluded.ProductName,
                ProductFamily=excluded.ProductFamily,
                BaselineDailyQty=excluded.BaselineDailyQty,
                UOM=excluded.UOM,
                SizeCode=excluded.SizeCode,
                Notes=excluded.Notes,
                UpdatedAt=datetime('now')
        `);

        let inserted = 0, skipped = 0, errors = [];
        const stmt = mode === 'overwrite' ? upsert : insert;

        const run = logisticsDb.transaction(() => {
            for (const row of rows) {
                if (!row.sku || !row.productName) { errors.push(`Skipped: missing SKU or Name`); skipped++; continue; }
                try {
                    stmt.run(
                        plantId,
                        String(row.sku).trim(),
                        String(row.productName).trim(),
                        row.productFamily || null,
                        parseFloat(row.baselineDailyQty) || 0,
                        parseFloat(row.holidayQty) || 0,
                        row.uom || 'cases',
                        row.sizeCode || null,
                        row.notes || null,
                    );
                    inserted++;
                } catch (e) {
                    if (mode === 'skip' && e.message.includes('UNIQUE')) { skipped++; }
                    else { errors.push(`${row.sku}: ${e.message}`); skipped++; }
                }
            }
        });
        run();
        res.json({ success: true, inserted, skipped, errors: errors.slice(0, 20) });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /products/import-db — Upload a SQLite .db/.sqlite file and scan it for SKU data.
// Opens the file read-only, scores each table by name similarity to SKU/product/catalog
// keywords, and returns column headers + first 50 rows for the top 6 matching tables.
// The temp file is auto-deleted after 10 minutes regardless of outcome.
router.post('/products/import-db', skuUpload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const filePath = req.file.path;
    try {
        const db = new Database(filePath, { readonly: true });
        const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all().map(r => r.name);

        // Score tables by likelihood of containing SKU data
        const SKU_SIGNALS = ['sku', 'product', 'item', 'catalog', 'parts', 'inventory'];
        const scored = tables.map(name => {
            const lower = name.toLowerCase();
            const score = SKU_SIGNALS.reduce((s, sig) => s + (lower.includes(sig) ? 1 : 0), 0);
            return { name, score };
        }).sort((a, b) => b.score - a.score);

        const result = [];
        for (const { name } of scored.slice(0, 6)) {
            try {
                const cols = db.prepare(`PRAGMA table_info(${JSON.stringify(name)})`).all().map(c => c.name);
                const rows = db.prepare(`SELECT * FROM ${JSON.stringify(name)} LIMIT 50`).all();
                result.push({ table: name, columns: cols, rows });
            } catch {}
        }
        db.close();

        // Clean up temp file after 10 minutes
        setTimeout(() => { try { fs.unlinkSync(filePath); } catch {} }, 10 * 60 * 1000);
        res.json({ tables: result });
    } catch (err) {
        try { fs.unlinkSync(filePath); } catch {}
        res.status(500).json({ error: 'Could not read database file: ' + err.message });
    }
});

// ── Integration Simulator & Worker Control ────────────────────────────────────

// Toggle simulator on/off for a given integration
router.post('/integrations/simulator/toggle', async (req, res) => {
    try {
        const { integrationId, enable } = req.body;
        if (!integrationId) return res.status(400).json({ error: 'integrationId required' });
        const result = enable
            ? await integrationManager.startSimulator(integrationId)
            : await integrationManager.stopSimulator(integrationId);
        res.json(result);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Start a sync worker for a plant × integration
router.post('/integrations/worker/start', (req, res) => {
    try {
        const plantId       = req.headers['x-plant-id'] || 'Plant_1';
        const { integrationId, config } = req.body;
        if (!integrationId) return res.status(400).json({ error: 'integrationId required' });
        const cfg = config || {};
        // Merge saved integration config with request overrides
        try {
            const saved = logisticsDb.prepare('SELECT IntegrationConfig FROM PlantConfiguration WHERE PlantID=?').get(plantId);
            if (saved?.IntegrationConfig) {
                const all = JSON.parse(saved.IntegrationConfig);
                Object.assign(cfg, all[integrationId] || {}, config || {});
            }
        } catch {}
        const result = integrationManager.startWorker(plantId, integrationId, cfg);
        res.json(result);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Stop a sync worker
router.post('/integrations/worker/stop', (req, res) => {
    try {
        const plantId      = req.headers['x-plant-id'] || 'Plant_1';
        const { integrationId } = req.body;
        if (!integrationId) return res.status(400).json({ error: 'integrationId required' });
        res.json(integrationManager.stopWorker(plantId, integrationId));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get status of all workers + simulators for this plant
router.get('/integrations/worker/status', (req, res) => {
    try {
        const plantId = req.headers['x-plant-id'] || 'Plant_1';
        const workers = integrationManager.getAllStatuses(plantId);
        // Attach simulator status for each known integration
        const simStatus = {};
        ['scada','erp','lims','edi','coldchain','route'].forEach(id => {
            simStatus[id] = integrationManager.simulatorStatus(id);
        });
        res.json({ workers, simulators: simStatus });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get recent sensor readings from the plant DB
router.get('/integrations/worker/data', (req, res) => {
    try {
        const plantId = req.headers['x-plant-id'] || 'Plant_1';
        const limit   = Math.min(parseInt(req.query.limit) || 32, 200);
        const dbPath  = path.join(dataDir, `${plantId}.db`);
        const db      = new Database(dbPath, { readonly: true });
        let readings  = [];
        try {
            readings = db.prepare(`
                SELECT TagName, Value, Unit, ReadingTime, Source
                FROM SensorReadings
                ORDER BY ReadingTime DESC, ID DESC
                LIMIT ?
            `).all(limit);
        } catch { /* table may not exist yet */ }
        db.close();
        res.json({ readings, tagDefinitions: TAG_DEFINITIONS });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
