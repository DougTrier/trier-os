// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — IT Asset Management API
 * =====================================
 * Enterprise-wide IT asset lifecycle management across four categories:
 * Software (licenses), Hardware (endpoints), Infrastructure (servers/network),
 * and Mobile (phones/tablets/handhelds). All data lives in logistics_db
 * (cross-plant, corporate-level). Mounted at /api/it in server/index.js.
 *
 * ENDPOINTS:
 *   Asset CRUD (category = software | hardware | infrastructure | mobile)
 *   GET    /:category                        List assets in a category (filterable by plant, status)
 *   POST   /:category                        Add a new asset record
 *   PUT    /:category/:id                    Update asset fields
 *   DELETE /:category/:id                    Retire/remove an asset
 *
 *   Reporting & Analytics
 *   GET    /stats                            Counts by category, status, and plant
 *   GET    /depreciation/report              Depreciation schedule across all asset categories
 *   GET    /depreciation/:category/:id       Depreciation timeline for a single asset
 *   GET    /export/:category                 CSV export of any asset category
 *   GET    /analytics                        Utilization rates, cost trends, license waste metrics
 *   GET    /metrics                          KPI snapshot: total assets, value, compliance rate
 *   GET    /alerts                           Assets needing attention: expiring, overdue, low stock
 *
 *   Vendor Management
 *   GET    /vendors                          List IT vendors
 *   POST   /vendors                          Add vendor record
 *   PUT    /vendors/:id                      Update vendor contact/contract details
 *   DELETE /vendors/:id                      Remove vendor
 *
 *   Asset Movements (check-out / check-in / transfer)
 *   GET    /movements                        Movement history log (filterable by asset/user/date)
 *   POST   /movements                        Record a movement (checkout, return, transfer, disposal)
 *
 *   Barcode / RFID Scanning
 *   POST   /scan/lookup                      Look up asset by barcode or asset tag
 *   POST   /scan/receive                     Receive a new asset via scan
 *   POST   /scan/ship                        Ship/transfer an asset via scan
 *   POST   /scan/batch-receive               Batch receive multiple assets from a scan session
 *   POST   /scan/batch-ship                  Batch ship/transfer from a scan session
 *
 *   Linking (cross-entity relationships)
 *   GET    /links/software-hardware/:softwareId    Hardware running a software title
 *   GET    /links/hardware-software/:hardwareId    Software installed on hardware
 *   POST   /links/software-hardware                Link software → hardware
 *   DELETE /links/software-hardware/:id            Remove software-hardware link
 *   GET    /links/workorders/:category/:assetId    Work orders referencing this asset
 *   POST   /links/workorders                       Link asset to a work order
 *   DELETE /links/workorders/:id                   Remove work order link
 *   GET    /links/users/:category/:assetId         Users assigned to an asset
 *   POST   /links/users                            Assign user to asset
 *   DELETE /links/users/:id                        Remove user assignment
 *   PUT    /links/infrastructure-location/:id      Update rack/room location for infrastructure
 *
 *   Search & Import
 *   GET    /global-search                    Full-text search across all IT asset categories
 *   GET    /import/template/:category        Download CSV import template for a category
 *   POST   /import/:category                 Bulk import assets from CSV
 *   POST   /import/adapter/:adapter          Import from external system (soti|fortinet|ad)
 *   GET    /import/adapter/:adapter/fields   Preview available fields from an import adapter
 *
 * DEPRECIATION: Straight-line method by default. Each asset type has a configurable
 *   useful life (software: 3yr, hardware: 5yr, infrastructure: 7yr, mobile: 3yr).
 *   Salvage value default: 10% of purchase cost.
 *
 * IMPORT ADAPTERS:
 *   soti     — SOTI MobiControl MDM (mobile device inventory)
 *   fortinet — FortiGate firewall / FortiManager (infrastructure)
 *   ad       — Active Directory (user-linked hardware from AD computer objects)
 *
 * TABLES: it_software, it_hardware, it_infrastructure, it_mobile,
 *         it_asset_movements, it_depreciation_schedule, it_vendors,
 *         it_asset_links_sw_hw, it_asset_links_wo, it_asset_links_users
 */

const express = require('express');
const router = express.Router();
const { db: logDb } = require('../logistics_db');
const { calculateDepreciation } = require('../utils/calculateDepreciation');
const { filterValidColumns } = require('../utils/sql_sanitizer');

// ── Auto-create tables on first load ─────────────────────────────────────
try {
    logDb.exec(`
        CREATE TABLE IF NOT EXISTS it_software (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            Name TEXT NOT NULL,
            Vendor TEXT,
            Version TEXT,
            LicenseKey TEXT,
            LicenseType TEXT DEFAULT 'Perpetual',
            Seats INTEGER DEFAULT 1,
            SeatsUsed INTEGER DEFAULT 0,
            ExpiryDate TEXT,
            RenewalCost REAL DEFAULT 0,
            Category TEXT DEFAULT 'Other',
            Status TEXT DEFAULT 'Active',
            AssignedTo TEXT,
            Department TEXT,
            PurchaseDate TEXT,
            PurchaseOrder TEXT,
            Notes TEXT,
            PlantID TEXT,
            CreatedBy TEXT,
            CreatedAt TEXT DEFAULT (datetime('now')),
            UpdatedAt TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS it_hardware (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            Name TEXT NOT NULL,
            Type TEXT DEFAULT 'Other',
            Manufacturer TEXT,
            Model TEXT,
            SerialNumber TEXT,
            AssetTag TEXT,
            BarcodeID TEXT,
            AssignedTo TEXT,
            Location TEXT,
            Department TEXT,
            PlantID TEXT,
            PurchaseDate TEXT,
            WarrantyExpiry TEXT,
            PurchaseCost REAL DEFAULT 0,
            SalvageValue REAL DEFAULT 0,
            UsefulLifeYears INTEGER DEFAULT 5,
            DepreciationMethod TEXT DEFAULT 'Straight-Line',
            CurrentBookValue REAL DEFAULT 0,
            Status TEXT DEFAULT 'Active',
            Condition TEXT DEFAULT 'New',
            Notes TEXT,
            CreatedBy TEXT,
            CreatedAt TEXT DEFAULT (datetime('now')),
            UpdatedAt TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS it_infrastructure (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            Name TEXT NOT NULL,
            Type TEXT DEFAULT 'Other',
            Manufacturer TEXT,
            Model TEXT,
            SerialNumber TEXT,
            AssetTag TEXT,
            BarcodeID TEXT,
            IPAddress TEXT,
            MACAddress TEXT,
            Location TEXT,
            PlantID TEXT,
            RackPosition TEXT,
            PortCount INTEGER,
            FirmwareVersion TEXT,
            LastFirmwareUpdate TEXT,
            PurchaseDate TEXT,
            WarrantyExpiry TEXT,
            PurchaseCost REAL DEFAULT 0,
            SalvageValue REAL DEFAULT 0,
            UsefulLifeYears INTEGER DEFAULT 7,
            DepreciationMethod TEXT DEFAULT 'Straight-Line',
            CurrentBookValue REAL DEFAULT 0,
            Status TEXT DEFAULT 'Online',
            Criticality TEXT DEFAULT 'Medium',
            Notes TEXT,
            CreatedBy TEXT,
            CreatedAt TEXT DEFAULT (datetime('now')),
            UpdatedAt TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS it_mobile (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            Name TEXT NOT NULL,
            Type TEXT DEFAULT 'Other',
            Manufacturer TEXT,
            Model TEXT,
            SerialNumber TEXT,
            AssetTag TEXT,
            BarcodeID TEXT,
            IMEI TEXT,
            PhoneNumber TEXT,
            Carrier TEXT,
            PlanType TEXT,
            MonthlyCost REAL DEFAULT 0,
            AssignedTo TEXT,
            Department TEXT,
            PlantID TEXT,
            MDMEnrolled INTEGER DEFAULT 0,
            MDMProvider TEXT,
            OSVersion TEXT,
            PurchaseDate TEXT,
            WarrantyExpiry TEXT,
            PurchaseCost REAL DEFAULT 0,
            SalvageValue REAL DEFAULT 0,
            UsefulLifeYears INTEGER DEFAULT 3,
            DepreciationMethod TEXT DEFAULT 'Straight-Line',
            CurrentBookValue REAL DEFAULT 0,
            Status TEXT DEFAULT 'Active',
            Notes TEXT,
            CreatedBy TEXT,
            CreatedAt TEXT DEFAULT (datetime('now')),
            UpdatedAt TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS it_asset_movements (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            AssetCategory TEXT NOT NULL,
            AssetID INTEGER NOT NULL,
            MovementType TEXT NOT NULL,
            FromPlantID TEXT,
            ToPlantID TEXT,
            FromLocation TEXT,
            ToLocation TEXT,
            ScannedBy TEXT,
            ScannedAt TEXT DEFAULT (datetime('now')),
            ShippingMethod TEXT,
            TrackingNumber TEXT,
            Carrier TEXT,
            PurchaseOrder TEXT,
            Notes TEXT,
            CreatedAt TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS it_depreciation_schedule (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            AssetCategory TEXT NOT NULL,
            AssetID INTEGER NOT NULL,
            FiscalYear INTEGER,
            FiscalMonth INTEGER,
            BeginningValue REAL,
            DepreciationAmount REAL,
            AccumulatedDepreciation REAL,
            EndingBookValue REAL,
            ComputedAt TEXT DEFAULT (datetime('now'))
        );

        
        CREATE TABLE IF NOT EXISTS it_software_hardware_link (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            SoftwareID INTEGER NOT NULL,
            HardwareID INTEGER NOT NULL,
            InstalledDate TEXT,
            Notes TEXT,
            CreatedBy TEXT,
            CreatedAt TEXT DEFAULT (datetime('now')),
            UNIQUE(SoftwareID, HardwareID)
        );

        CREATE TABLE IF NOT EXISTS it_asset_workorder_link (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            AssetCategory TEXT NOT NULL,
            AssetID INTEGER NOT NULL,
            WorkOrderID INTEGER NOT NULL,
            PlantID TEXT,
            LinkType TEXT DEFAULT 'Related',
            Notes TEXT,
            CreatedBy TEXT,
            CreatedAt TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS it_asset_user_link (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            AssetCategory TEXT NOT NULL,
            AssetID INTEGER NOT NULL,
            UserEmail TEXT NOT NULL,
            UserName TEXT,
            AssignedDate TEXT,
            Notes TEXT,
            CreatedBy TEXT,
            CreatedAt TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS it_vendors_contracts (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            VendorName TEXT NOT NULL,
            ContactName TEXT,
            ContactEmail TEXT,
            ContactPhone TEXT,
            Website TEXT,
            Address TEXT,
            Category TEXT DEFAULT 'General',
            ContractType TEXT DEFAULT 'Support',
            ContractNumber TEXT,
            Description TEXT,
            StartDate TEXT,
            EndDate TEXT,
            RenewalDate TEXT,
            AutoRenew INTEGER DEFAULT 0,
            AnnualCost REAL DEFAULT 0,
            PaymentTerms TEXT,
            SLAResponseTime TEXT,
            SLAUptimeGuarantee TEXT,
            Status TEXT DEFAULT 'Active',
            Notes TEXT,
            PlantID TEXT,
            CreatedBy TEXT,
            CreatedAt TEXT DEFAULT (datetime('now')),
            UpdatedAt TEXT DEFAULT (datetime('now'))
        );
    `);
    console.log('[IT] ✅ IT Department tables initialized');
} catch (err) {
    console.error('[IT] ⚠️ Table creation error:', err.message);
}

// ── Helper: get table name from category ─────────────────────────────────
// SECURITY AUDIT ENFORCEMENT: Never bypass this allow-list structure! 
// Directly injecting variables like req.params.category into db.prepare(\`SELECT * FROM \${table}\`)
// exposes the application to catastrophic SQL Injection (sqlite_master dumps/RCE). The strict allow-list map MUST remain.
function getTable(category) {
    const map = {
        software: 'it_software',
        hardware: 'it_hardware',
        infrastructure: 'it_infrastructure',
        mobile: 'it_mobile',
    };
    return map[category] || null;
}

// ── Helper: calculateDepreciation imported from server/utils/calculateDepreciation.js ──

// ═══════════════════════════════════════════════════════════════════════════
// CRUD ROUTES — Software, Hardware, Infrastructure, Mobile
// ═══════════════════════════════════════════════════════════════════════════

// ── GET /api/it/:category ────────────────────────────────────────────────
router.get('/:category(software|hardware|infrastructure|mobile)', (req, res) => {
    try {
        const table = getTable(req.params.category);
        const { search = '', status = '', type = '', plant = '' } = req.query;

        let where = [];
        let params = [];

        if (search) {
            where.push(`(Name LIKE ? OR SerialNumber LIKE ? OR AssetTag LIKE ? OR Notes LIKE ?)`);
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (status) { where.push('Status = ?'); params.push(status); }
        if (type) { where.push('Type = ?'); params.push(type); }
        if (plant) { where.push('PlantID = ?'); params.push(plant); }

        const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
        const rows = logDb.prepare(`SELECT * FROM ${table} ${whereClause} ORDER BY ID DESC`).all(...params); /* dynamic col/table - sanitize inputs */

        // Calculate live depreciation for physical assets
        if (['hardware', 'infrastructure', 'mobile'].includes(req.params.category)) {
            rows.forEach(row => {
                const dep = calculateDepreciation(row.PurchaseCost, row.SalvageValue, row.UsefulLifeYears, row.DepreciationMethod, row.PurchaseDate);
                row.CurrentBookValue = dep.currentBookValue;
                row._accumulatedDepreciation = dep.accumulatedDepreciation;
                row._monthlyExpense = dep.monthlyExpense;
            });
        }

        res.json(rows);
    } catch (err) {
        console.error(`GET /api/it/${req.params.category} error:`, err);
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});

// ── POST /api/it/:category ───────────────────────────────────────────────
router.post('/:category(software|hardware|infrastructure|mobile)', (req, res) => {
    try {
        const table = getTable(req.params.category);
        const data = { ...req.body };
        delete data.ID; // auto-increment

        data.CreatedAt = new Date().toISOString();
        data.UpdatedAt = new Date().toISOString();

        // Auto-generate BarcodeID if not provided (for physical assets)
        if (['hardware', 'infrastructure', 'mobile'].includes(req.params.category) && !data.BarcodeID) {
            const prefix = { hardware: 'IT-HW', infrastructure: 'IT-INF', mobile: 'IT-MOB' }[req.params.category];
            const count = logDb.prepare(`SELECT COUNT(*) as c FROM ${table}`).get().c; /* dynamic col/table - sanitize inputs */
            data.BarcodeID = `${prefix}-${String(count + 1).padStart(5, '0')}`;
        }

        const safeData = filterValidColumns(logDb, table, data);
        if (Object.keys(safeData).length === 0) return res.status(400).json({ error: 'No valid data provided for table' });

        const cols = Object.keys(safeData);
        const placeholders = cols.map(() => '?').join(', ');
        const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`;
        const result = logDb.prepare(sql).run(...Object.values(safeData));

        res.status(201).json({ success: true, id: result.lastInsertRowid, barcodeId: data.BarcodeID });
    } catch (err) {
        console.error(`POST /api/it/${req.params.category} error:`, err);
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});

// ── PUT /api/it/:category/:id ────────────────────────────────────────────
router.put('/:category(software|hardware|infrastructure|mobile)/:id', (req, res) => {
    try {
        const table = getTable(req.params.category);
        const data = { ...req.body };
        delete data.ID;
        data.UpdatedAt = new Date().toISOString();

        const safeData = filterValidColumns(logDb, table, data);
        if (Object.keys(safeData).length === 0) return res.status(400).json({ error: 'No valid data provided for table' });

        const sets = Object.keys(safeData).map(k => `${k} = ?`).join(', ');
        const values = [...Object.values(safeData), req.params.id];
        logDb.prepare(`UPDATE ${table} SET ${sets} WHERE ID = ?`).run(...values); /* dynamic col/table - sanitize inputs */

        res.json({ success: true });
    } catch (err) {
        console.error(`PUT /api/it/${req.params.category}/${req.params.id} error:`, err);
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});

// ── DELETE /api/it/:category/:id ─────────────────────────────────────────
router.delete('/:category(software|hardware|infrastructure|mobile)/:id', (req, res) => {
    try {
        const table = getTable(req.params.category);
        logDb.prepare(`DELETE FROM ${table} WHERE ID = ?`).run(req.params.id); /* dynamic col/table - sanitize inputs */
        res.json({ success: true });
    } catch (err) {
        console.error(`DELETE /api/it/${req.params.category}/${req.params.id} error:`, err);
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// STATS — Aggregate counts for tile metrics
// ═══════════════════════════════════════════════════════════════════════════

router.get('/stats', (req, res) => {
    try {
        const sw = logDb.prepare('SELECT COUNT(*) as total FROM it_software').get();
        const swExpiring = logDb.prepare(`SELECT COUNT(*) as c FROM it_software WHERE ExpiryDate IS NOT NULL AND ExpiryDate != '' AND ExpiryDate <= date('now', '+30 days') AND Status = 'Active'`).get();
        const hw = logDb.prepare('SELECT COUNT(*) as total FROM it_hardware').get();
        const infra = logDb.prepare('SELECT COUNT(*) as total FROM it_infrastructure').get();
        const infraOnline = logDb.prepare(`SELECT COUNT(*) as c FROM it_infrastructure WHERE Status = 'Online'`).get();
        const infraOffline = logDb.prepare(`SELECT COUNT(*) as c FROM it_infrastructure WHERE Status = 'Offline'`).get();
        const mob = logDb.prepare('SELECT COUNT(*) as total FROM it_mobile').get();
        const vendors = logDb.prepare('SELECT COUNT(*) as total FROM it_vendors_contracts').get();
        const vendorsExpiring = logDb.prepare(`SELECT COUNT(*) as c FROM it_vendors_contracts WHERE EndDate IS NOT NULL AND EndDate != '' AND EndDate <= date('now', '+60 days') AND Status = 'Active'`).get();
        const inTransit = logDb.prepare(`
            SELECT COUNT(*) as c FROM (
                SELECT 1 FROM it_hardware WHERE Status = 'In Transit'
                UNION ALL SELECT 1 FROM it_infrastructure WHERE Status = 'In Transit'
                UNION ALL SELECT 1 FROM it_mobile WHERE Status = 'In Transit'
            )
        `).get();

        // Depreciation analysis — total book value + alerts
        let totalBookValue = 0;
        let nearingEndOfLife = 0;    // < 6 months remaining
        let fullyDepreciated = 0;    // book value = salvage, still in service
        ['it_hardware', 'it_infrastructure', 'it_mobile'].forEach(table => {
            const rows = logDb.prepare(`SELECT PurchaseCost, SalvageValue, UsefulLifeYears, DepreciationMethod, PurchaseDate, Status FROM ${table}`).all(); /* dynamic col/table - sanitize inputs */
            rows.forEach(r => {
                const dep = calculateDepreciation(r.PurchaseCost, r.SalvageValue, r.UsefulLifeYears, r.DepreciationMethod, r.PurchaseDate);
                totalBookValue += dep.currentBookValue;
                const active = !['Retired', 'Disposed'].includes(r.Status);
                if (active && dep.fullyDepreciated) fullyDepreciated++;
                if (active && !dep.fullyDepreciated && dep.remainingMonths > 0 && dep.remainingMonths <= 6) nearingEndOfLife++;
            });
        });

        res.json({
            software: { total: sw.total, expiring: swExpiring.c },
            hardware: { total: hw.total },
            infrastructure: { total: infra.total, online: infraOnline.c, offline: infraOffline.c },
            mobile: { total: mob.total },
            vendors: { total: vendors.total, expiring: vendorsExpiring.c },
            inTransit: inTransit.c,
            totalBookValue: Math.round(totalBookValue * 100) / 100,
            depreciation: { nearingEndOfLife, fullyDepreciated },
        });
    } catch (err) {
        console.error('GET /api/it/stats error:', err);
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// VENDORS & CONTRACTS — Manage vendor relationships and service contracts
// ═══════════════════════════════════════════════════════════════════════════

router.get('/vendors', (req, res) => {
    try {
        const { search = '', status = '', category = '' } = req.query;
        let where = [];
        let params = [];

        if (search) {
            where.push(`(VendorName LIKE ? OR ContactName LIKE ? OR ContactEmail LIKE ? OR ContractNumber LIKE ? OR Description LIKE ? OR Notes LIKE ?)`);
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (status) { where.push('Status = ?'); params.push(status); }
        if (category) { where.push('Category = ?'); params.push(category); }

        const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
        const rows = logDb.prepare(`SELECT * FROM it_vendors_contracts ${whereClause} ORDER BY ID DESC`).all(...params);
        res.json(rows);
    } catch (err) {
        console.error('GET /api/it/vendors error:', err);
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});

router.post('/vendors', (req, res) => {
    try {
        const data = { ...req.body };
        delete data.ID;
        data.CreatedAt = new Date().toISOString();
        data.UpdatedAt = new Date().toISOString();

        const safeData = filterValidColumns(logDb, 'it_vendors_contracts', data);
        if (Object.keys(safeData).length === 0) return res.status(400).json({ error: 'No valid data provided for table' });

        const cols = Object.keys(safeData);
        const placeholders = cols.map(() => '?').join(', ');
        const sql = `INSERT INTO it_vendors_contracts (${cols.join(', ')}) VALUES (${placeholders})`;
        const result = logDb.prepare(sql).run(...Object.values(safeData));

        res.status(201).json({ success: true, id: result.lastInsertRowid });
    } catch (err) {
        console.error('POST /api/it/vendors error:', err);
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});

router.put('/vendors/:id', (req, res) => {
    try {
        const data = { ...req.body };
        delete data.ID;
        data.UpdatedAt = new Date().toISOString();

        const safeData = filterValidColumns(logDb, 'it_vendors_contracts', data);
        if (Object.keys(safeData).length === 0) return res.status(400).json({ error: 'No valid data provided for table' });

        const sets = Object.keys(safeData).map(k => `${k} = ?`).join(', ');
        const values = [...Object.values(safeData), req.params.id];
        logDb.prepare(`UPDATE it_vendors_contracts SET ${sets} WHERE ID = ?`).run(...values);

        res.json({ success: true });
    } catch (err) {
        console.error(`PUT /api/it/vendors/${req.params.id} error:`, err);
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});

router.delete('/vendors/:id', (req, res) => {
    try {
        logDb.prepare('DELETE FROM it_vendors_contracts WHERE ID = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error(`DELETE /api/it/vendors/${req.params.id} error:`, err);
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// MOVEMENTS — Chain of custody / transfer ledger
// ═══════════════════════════════════════════════════════════════════════════

router.get('/movements', (req, res) => {
    try {
        const { category = '', type = '', plant = '', limit = 100 } = req.query;
        let where = [];
        let params = [];
        if (category) { where.push('AssetCategory = ?'); params.push(category); }
        if (type) { where.push('MovementType = ?'); params.push(type); }
        if (plant) { where.push('(FromPlantID = ? OR ToPlantID = ?)'); params.push(plant, plant); }

        const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
        const rows = logDb.prepare(`SELECT * FROM it_asset_movements ${whereClause} ORDER BY CreatedAt DESC LIMIT ?`).all(...params, parseInt(limit));
        res.json(rows);
    } catch (err) {
        console.error('GET /api/it/movements error:', err);
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});

router.post('/movements', (req, res) => {
    try {
        const { AssetCategory, AssetID, MovementType, FromPlantID, ToPlantID, FromLocation, ToLocation, ScannedBy, ShippingMethod, TrackingNumber, Carrier, PurchaseOrder, Notes } = req.body;
        if (!AssetCategory || !AssetID || !MovementType) {
            return res.status(400).json({ error: 'AssetCategory, AssetID, and MovementType are required' });
        }

        const result = logDb.prepare(`
            INSERT INTO it_asset_movements (AssetCategory, AssetID, MovementType, FromPlantID, ToPlantID, FromLocation, ToLocation, ScannedBy, ShippingMethod, TrackingNumber, Carrier, PurchaseOrder, Notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(AssetCategory, AssetID, MovementType, FromPlantID, ToPlantID, FromLocation, ToLocation, ScannedBy, ShippingMethod, TrackingNumber, Carrier, PurchaseOrder, Notes);

        // Update asset status if shipping/receiving
        const table = getTable(AssetCategory);
        if (table) {
            if (MovementType === 'Shipped') {
                logDb.prepare(`UPDATE ${table} SET Status = 'In Transit', PlantID = ?, UpdatedAt = datetime('now') WHERE ID = ?`).run(ToPlantID, AssetID); /* dynamic col/table - sanitize inputs */
            } else if (MovementType === 'Received') {
                logDb.prepare(`UPDATE ${table} SET Status = 'Active', PlantID = ?, Location = ?, UpdatedAt = datetime('now') WHERE ID = ?`).run(ToPlantID, ToLocation || '', AssetID); /* dynamic col/table - sanitize inputs */
            }
        }

        res.status(201).json({ success: true, id: result.lastInsertRowid });
    } catch (err) {
        console.error('POST /api/it/movements error:', err);
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// DEPRECIATION — Report endpoint
// ═══════════════════════════════════════════════════════════════════════════

router.get('/depreciation/report', (req, res) => {
    try {
        const { plant, category: filterCat, year: filterYear } = req.query;
        const report = { hardware: [], infrastructure: [], mobile: [], totals: { originalCost: 0, bookValue: 0, accumulated: 0, monthlyExpense: 0 }, alerts: { nearingEndOfLife: [], fullyDepreciated: [] }, byPlant: {} };

        const categories = filterCat ? [filterCat] : ['hardware', 'infrastructure', 'mobile'];

        categories.forEach(cat => {
            const table = getTable(cat);
            if (!table) return;
            let query = `SELECT ID, Name, Type, PlantID, PurchaseCost, SalvageValue, UsefulLifeYears, DepreciationMethod, PurchaseDate, Status FROM ${table}`;
            const conditions = [];
            const params = [];
            if (plant && plant !== 'all_sites') { conditions.push('PlantID = ?'); params.push(plant); }
            if (filterYear) { conditions.push('strftime(\'%Y\', PurchaseDate) = ?'); params.push(String(filterYear)); }
            if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');

            const rows = logDb.prepare(query).all(...params);
            rows.forEach(r => {
                const dep = calculateDepreciation(r.PurchaseCost, r.SalvageValue, r.UsefulLifeYears, r.DepreciationMethod, r.PurchaseDate);
                const asset = {
                    ...r,
                    currentBookValue: dep.currentBookValue,
                    accumulatedDepreciation: dep.accumulatedDepreciation,
                    monthlyExpense: dep.monthlyExpense,
                    percentDepreciated: dep.percentDepreciated,
                    remainingMonths: dep.remainingMonths,
                    fullyDepreciated: dep.fullyDepreciated,
                };
                report[cat].push(asset);
                report.totals.originalCost += parseFloat(r.PurchaseCost || 0);
                report.totals.bookValue += dep.currentBookValue;
                report.totals.accumulated += dep.accumulatedDepreciation;
                report.totals.monthlyExpense += dep.monthlyExpense;

                // Alerts
                const active = !['Retired', 'Disposed'].includes(r.Status);
                if (active && dep.fullyDepreciated) report.alerts.fullyDepreciated.push({ id: r.ID, name: r.Name, category: cat, plantId: r.PlantID });
                if (active && !dep.fullyDepreciated && dep.remainingMonths > 0 && dep.remainingMonths <= 6) report.alerts.nearingEndOfLife.push({ id: r.ID, name: r.Name, category: cat, plantId: r.PlantID, remainingMonths: dep.remainingMonths });

                // By plant aggregation
                const pKey = r.PlantID || 'Unassigned';
                if (!report.byPlant[pKey]) report.byPlant[pKey] = { originalCost: 0, bookValue: 0, accumulated: 0, monthlyExpense: 0, count: 0 };
                report.byPlant[pKey].originalCost += parseFloat(r.PurchaseCost || 0);
                report.byPlant[pKey].bookValue += dep.currentBookValue;
                report.byPlant[pKey].accumulated += dep.accumulatedDepreciation;
                report.byPlant[pKey].monthlyExpense += dep.monthlyExpense;
                report.byPlant[pKey].count++;
            });
        });

        // Round totals
        Object.keys(report.totals).forEach(k => { report.totals[k] = Math.round(report.totals[k] * 100) / 100; });
        Object.keys(report.byPlant).forEach(pk => {
            Object.keys(report.byPlant[pk]).forEach(k => {
                if (k !== 'count') report.byPlant[pk][k] = Math.round(report.byPlant[pk][k] * 100) / 100;
            });
        });

        res.json(report);
    } catch (err) {
        console.error('GET /api/it/depreciation/report error:', err);
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// SCAN — Lookup, Receive, Ship endpoints for barcode/QR scanning
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/it/scan/lookup — Find IT asset by barcode, asset tag, or serial
router.post('/scan/lookup', (req, res) => {
    try {
        const { code } = req.body;
        if (!code) return res.status(400).json({ error: 'Scan code is required' });

        const cleanCode = code.trim();
        const tables = [
            { category: 'hardware', table: 'it_hardware' },
            { category: 'infrastructure', table: 'it_infrastructure' },
            { category: 'mobile', table: 'it_mobile' },
        ];

        for (const { category, table } of tables) {
            const row = logDb.prepare(
                `SELECT * FROM ${table} WHERE BarcodeID = ? OR AssetTag = ? OR SerialNumber = ? COLLATE NOCASE`
            ).get(cleanCode, cleanCode, cleanCode);

            if (row) {
                // Compute live depreciation
                const dep = calculateDepreciation(row.PurchaseCost, row.SalvageValue, row.UsefulLifeYears, row.DepreciationMethod, row.PurchaseDate);
                row.CurrentBookValue = dep.currentBookValue;
                row._accumulatedDepreciation = dep.accumulatedDepreciation;

                // Fetch recent movements
                const movements = logDb.prepare(
                    `SELECT * FROM it_asset_movements WHERE AssetCategory = ? AND AssetID = ? ORDER BY CreatedAt DESC LIMIT 10`
                ).all(category, row.ID);

                return res.json({ found: true, category, asset: row, movements });
            }
        }

        res.json({ found: false, code: cleanCode });
    } catch (err) {
        console.error('POST /api/it/scan/lookup error:', err);
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});

// POST /api/it/scan/receive — Receive an IT asset (create movement, update location)
router.post('/scan/receive', (req, res) => {
    try {
        const { category, assetId, plantId, location, condition, notes, scannedBy } = req.body;
        if (!category || !assetId) return res.status(400).json({ error: 'category and assetId required' });

        const table = getTable(category);
        if (!table) return res.status(400).json({ error: 'Invalid category' });

        // Get current asset data for movement record
        const asset = logDb.prepare(`SELECT PlantID, Location FROM ${table} WHERE ID = ?`).get(assetId); /* dynamic col/table - sanitize inputs */
        const fromPlant = asset?.PlantID || '';
        const fromLocation = asset?.Location || '';

        // Create movement record
        logDb.prepare(`
            INSERT INTO it_asset_movements (AssetCategory, AssetID, MovementType, FromPlantID, ToPlantID, FromLocation, ToLocation, ScannedBy, Notes)
            VALUES (?, ?, 'Received', ?, ?, ?, ?, ?, ?)
        `).run(category, assetId, fromPlant, plantId, fromLocation, location || '', scannedBy || '', notes || '');

        // Update asset
        const updates = { Status: 'Active', PlantID: plantId, UpdatedAt: new Date().toISOString() };
        if (location) updates.Location = location;
        if (condition) updates.Condition = condition;

        const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
        logDb.prepare(`UPDATE ${table} SET ${sets} WHERE ID = ?`).run(...Object.values(updates), assetId); /* dynamic col/table - sanitize inputs */

        res.json({ success: true, message: 'Asset received successfully' });
    } catch (err) {
        console.error('POST /api/it/scan/receive error:', err);
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});

// POST /api/it/scan/ship — Ship an IT asset (create movement, set In Transit)
router.post('/scan/ship', (req, res) => {
    try {
        const { category, assetId, destinationPlantId, trackingNumber, carrier, shippingMethod, notes, scannedBy } = req.body;
        if (!category || !assetId || !destinationPlantId) return res.status(400).json({ error: 'category, assetId, and destinationPlantId required' });

        const table = getTable(category);
        if (!table) return res.status(400).json({ error: 'Invalid category' });

        // Get current location
        const asset = logDb.prepare(`SELECT PlantID, Location FROM ${table} WHERE ID = ?`).get(assetId); /* dynamic col/table - sanitize inputs */

        // Create movement record
        logDb.prepare(`
            INSERT INTO it_asset_movements (AssetCategory, AssetID, MovementType, FromPlantID, ToPlantID, FromLocation, ShippingMethod, TrackingNumber, Carrier, ScannedBy, Notes)
            VALUES (?, ?, 'Shipped', ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(category, assetId, asset?.PlantID || '', destinationPlantId, asset?.Location || '', shippingMethod || '', trackingNumber || '', carrier || '', scannedBy || '', notes || '');

        // Update asset status to In Transit
        logDb.prepare(`UPDATE ${table} SET Status = 'In Transit', UpdatedAt = datetime('now') WHERE ID = ?`).run(assetId); /* dynamic col/table - sanitize inputs */

        res.json({ success: true, message: 'Asset shipped — status set to In Transit' });
    } catch (err) {
        console.error('POST /api/it/scan/ship error:', err);
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});

// POST /api/it/scan/batch-receive — Create multiple NEW assets from scanned serial numbers
// Use case: Receive 100 TC78 Zebra scanners, fill common fields once, scan serials rapidly
router.post('/scan/batch-receive', (req, res) => {
    try {
        const {
            category, plantId, common, serials,
            condition, scannedBy, notes
        } = req.body;

        if (!category || !plantId || !serials || !Array.isArray(serials) || serials.length === 0) {
            return res.status(400).json({ error: 'category, plantId, and serials[] are required' });
        }

        const table = getTable(category);
        if (!table || category === 'software') {
            return res.status(400).json({ error: 'Batch receive only supports hardware, infrastructure, and mobile' });
        }

        const results = { created: 0, failed: [], duplicates: [] };

        // Use a transaction for atomicity — all or nothing
        const batchInsert = logDb.transaction(() => {
            for (const serial of serials) {
                const cleanSerial = (serial || '').trim();
                if (!cleanSerial) continue;

                // Check for duplicate serial
                const exists = logDb.prepare(
                    `SELECT ID FROM ${table} WHERE SerialNumber = ? COLLATE NOCASE`
                ).get(cleanSerial);

                if (exists) {
                    results.duplicates.push(cleanSerial);
                    continue;
                }

                try {
                    // Auto-generate BarcodeID
                    const prefix = category === 'hardware' ? 'IT-HW' : category === 'infrastructure' ? 'IT-INF' : 'IT-MOB';
                    const maxId = logDb.prepare(`SELECT MAX(ID) as m FROM ${table}`).get()?.m || 0; /* dynamic col/table - sanitize inputs */
                    const barcodeID = `${prefix}-${String(maxId + results.created + 1).padStart(5, '0')}`;

                    // Build insert based on category
                    const name = common?.Name || `${common?.Manufacturer || ''} ${common?.Model || ''}`.trim() || 'Unnamed Asset';

                    if (category === 'hardware') {
                        logDb.prepare(`
                            INSERT INTO it_hardware (Name, Type, Manufacturer, Model, SerialNumber, AssetTag, BarcodeID, AssignedTo, Location, Department, PlantID, PurchaseDate, WarrantyExpiry, PurchaseCost, SalvageValue, UsefulLifeYears, DepreciationMethod, CurrentBookValue, Status, Condition, Notes, CreatedBy)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?, ?)
                        `).run(
                            name, common?.Type || 'Other', common?.Manufacturer || '', common?.Model || '',
                            cleanSerial, common?.AssetTag || '', barcodeID,
                            common?.AssignedTo || '', common?.Location || '', common?.Department || '', plantId,
                            common?.PurchaseDate || new Date().toISOString().split('T')[0],
                            common?.WarrantyExpiry || '',
                            parseFloat(common?.PurchaseCost || 0), parseFloat(common?.SalvageValue || 0),
                            parseInt(common?.UsefulLifeYears || 5), common?.DepreciationMethod || 'Straight-Line',
                            parseFloat(common?.PurchaseCost || 0), condition || 'New',
                            notes || '', scannedBy || ''
                        );
                    } else if (category === 'infrastructure') {
                        logDb.prepare(`
                            INSERT INTO it_infrastructure (Name, Type, Manufacturer, Model, SerialNumber, AssetTag, BarcodeID, IPAddress, MACAddress, Location, PlantID, PurchaseDate, WarrantyExpiry, PurchaseCost, SalvageValue, UsefulLifeYears, DepreciationMethod, CurrentBookValue, Status, Notes, CreatedBy)
                            VALUES (?, ?, ?, ?, ?, ?, ?, '', '', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Online', ?, ?)
                        `).run(
                            name, common?.Type || 'Other', common?.Manufacturer || '', common?.Model || '',
                            cleanSerial, common?.AssetTag || '', barcodeID,
                            common?.Location || '', plantId,
                            common?.PurchaseDate || new Date().toISOString().split('T')[0],
                            common?.WarrantyExpiry || '',
                            parseFloat(common?.PurchaseCost || 0), parseFloat(common?.SalvageValue || 0),
                            parseInt(common?.UsefulLifeYears || 7), common?.DepreciationMethod || 'Straight-Line',
                            parseFloat(common?.PurchaseCost || 0), notes || '', scannedBy || ''
                        );
                    } else if (category === 'mobile') {
                        logDb.prepare(`
                            INSERT INTO it_mobile (Name, Type, Manufacturer, Model, SerialNumber, AssetTag, BarcodeID, IMEI, PhoneNumber, Carrier, PlanType, MonthlyCost, AssignedTo, Department, PlantID, MDMEnrolled, OSVersion, PurchaseDate, WarrantyExpiry, PurchaseCost, SalvageValue, UsefulLifeYears, DepreciationMethod, CurrentBookValue, Status, Notes, CreatedBy)
                            VALUES (?, ?, ?, ?, ?, ?, ?, '', '', ?, '', 0, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?)
                        `).run(
                            name, common?.Type || 'Rugged Scanner', common?.Manufacturer || '', common?.Model || '',
                            cleanSerial, common?.AssetTag || '', barcodeID,
                            common?.Carrier || '', common?.AssignedTo || '', common?.Department || '', plantId,
                            common?.OSVersion || '',
                            common?.PurchaseDate || new Date().toISOString().split('T')[0],
                            common?.WarrantyExpiry || '',
                            parseFloat(common?.PurchaseCost || 0), parseFloat(common?.SalvageValue || 0),
                            parseInt(common?.UsefulLifeYears || 3), common?.DepreciationMethod || 'Straight-Line',
                            parseFloat(common?.PurchaseCost || 0), notes || '', scannedBy || ''
                        );
                    }

                    // Create a "Received" movement record for the new asset
                    const newAsset = logDb.prepare(`SELECT ID FROM ${table} WHERE SerialNumber = ? COLLATE NOCASE`).get(cleanSerial); /* dynamic col/table - sanitize inputs */
                    if (newAsset) {
                        logDb.prepare(`
                            INSERT INTO it_asset_movements (AssetCategory, AssetID, MovementType, ToPlantID, ToLocation, ScannedBy, Notes)
                            VALUES (?, ?, 'Received', ?, ?, ?, ?)
                        `).run(category, newAsset.ID, plantId, common?.Location || '', scannedBy || '', 'Batch receive: ' + (notes || ''));
                    }

                    results.created++;
                } catch (insertErr) {
                    results.failed.push({ serial: cleanSerial, error: insertErr.message });
                }
            }
        });

        batchInsert();

        res.json({
            success: true,
            created: results.created,
            duplicates: results.duplicates,
            failed: results.failed,
            total: serials.length,
            message: `${results.created} of ${serials.length} assets created` +
                (results.duplicates.length > 0 ? `, ${results.duplicates.length} duplicates skipped` : '') +
                (results.failed.length > 0 ? `, ${results.failed.length} failed` : ''),
        });
    } catch (err) {
        console.error('POST /api/it/scan/batch-receive error:', err);
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});

// POST /api/it/scan/batch-ship — Ship multiple EXISTING assets to a destination in one operation
// Use case: Ship 10 printers to Dallas plant
router.post('/scan/batch-ship', (req, res) => {
    try {
        const {
            items, destinationPlantId, trackingNumber,
            carrier, shippingMethod, notes, scannedBy
        } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0 || !destinationPlantId) {
            return res.status(400).json({ error: 'items[] and destinationPlantId are required' });
        }

        const results = { shipped: 0, failed: [], notFound: [] };

        const batchShip = logDb.transaction(() => {
            for (const item of items) {
                const { category, assetId, code } = item;

                let resolvedCategory = category;
                let resolvedId = assetId;

                // If we have a code but no category/id, look it up
                if (code && (!resolvedCategory || !resolvedId)) {
                    const tables = [
                        { cat: 'hardware', tbl: 'it_hardware' },
                        { cat: 'infrastructure', tbl: 'it_infrastructure' },
                        { cat: 'mobile', tbl: 'it_mobile' },
                    ];
                    for (const { cat, tbl } of tables) {
                        const row = logDb.prepare(
                            `SELECT ID FROM ${tbl} WHERE BarcodeID = ? OR AssetTag = ? OR SerialNumber = ? COLLATE NOCASE`
                        ).get(code, code, code);
                        if (row) {
                            resolvedCategory = cat;
                            resolvedId = row.ID;
                            break;
                        }
                    }
                }

                if (!resolvedCategory || !resolvedId) {
                    results.notFound.push(code || 'unknown');
                    continue;
                }

                const table = getTable(resolvedCategory);
                if (!table) {
                    results.failed.push({ code: code || resolvedId, error: 'Invalid category' });
                    continue;
                }

                try {
                    const asset = logDb.prepare(`SELECT PlantID, Location FROM ${table} WHERE ID = ?`).get(resolvedId); /* dynamic col/table - sanitize inputs */

                    logDb.prepare(`
                        INSERT INTO it_asset_movements (AssetCategory, AssetID, MovementType, FromPlantID, ToPlantID, FromLocation, ShippingMethod, TrackingNumber, Carrier, ScannedBy, Notes)
                        VALUES (?, ?, 'Shipped', ?, ?, ?, ?, ?, ?, ?, ?)
                    `).run(resolvedCategory, resolvedId, asset?.PlantID || '', destinationPlantId, asset?.Location || '', shippingMethod || '', trackingNumber || '', carrier || '', scannedBy || '', 'Batch ship: ' + (notes || ''));

                    logDb.prepare(`UPDATE ${table} SET Status = 'In Transit', UpdatedAt = datetime('now') WHERE ID = ?`).run(resolvedId); /* dynamic col/table - sanitize inputs */
                    results.shipped++;
                } catch (shipErr) {
                    results.failed.push({ code: code || resolvedId, error: shipErr.message });
                }
            }
        });

        batchShip();

        res.json({
            success: true,
            shipped: results.shipped,
            notFound: results.notFound,
            failed: results.failed,
            total: items.length,
            message: `${results.shipped} of ${items.length} assets shipped to ${destinationPlantId}` +
                (results.notFound.length > 0 ? `, ${results.notFound.length} not found` : '') +
                (results.failed.length > 0 ? `, ${results.failed.length} failed` : ''),
        });
    } catch (err) {
        console.error('POST /api/it/scan/batch-ship error:', err);
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});


// GET /api/it/depreciation/:category/:id — Per-asset depreciation schedule
router.get('/depreciation/:category(hardware|infrastructure|mobile)/:id', (req, res) => {
    try {
        const table = getTable(req.params.category);
        const asset = logDb.prepare(`SELECT * FROM ${table} WHERE ID = ?`).get(req.params.id); /* dynamic col/table - sanitize inputs */
        if (!asset) return res.status(404).json({ error: 'Asset not found' });

        const dep = calculateDepreciation(asset.PurchaseCost, asset.SalvageValue, asset.UsefulLifeYears, asset.DepreciationMethod, asset.PurchaseDate);

        // Generate year-by-year schedule
        const cost = parseFloat(asset.PurchaseCost || 0);
        const salvage = parseFloat(asset.SalvageValue || 0);
        const life = parseInt(asset.UsefulLifeYears || 5);
        const schedule = [];

        if (cost > 0 && asset.PurchaseDate) {
            const purchaseYear = new Date(asset.PurchaseDate).getFullYear();
            let bookValue = cost;

            for (let y = 0; y < life && bookValue > salvage; y++) {
                let annualDep;
                if (asset.DepreciationMethod === 'Declining Balance') {
                    const rate = 2 / life;
                    const straightLine = (cost - salvage) / life;
                    annualDep = Math.max(bookValue * rate, straightLine);
                } else {
                    annualDep = (cost - salvage) / life;
                }
                annualDep = Math.min(annualDep, bookValue - salvage);
                const endValue = Math.max(bookValue - annualDep, salvage);

                schedule.push({
                    year: purchaseYear + y,
                    beginningValue: Math.round(bookValue * 100) / 100,
                    depreciation: Math.round(annualDep * 100) / 100,
                    endingValue: Math.round(endValue * 100) / 100,
                });
                bookValue = endValue;
            }
        }

        res.json({
            asset,
            currentBookValue: dep.currentBookValue,
            accumulatedDepreciation: dep.accumulatedDepreciation,
            monthlyExpense: dep.monthlyExpense,
            schedule,
        });
    } catch (err) {
        console.error('GET /api/it/depreciation error:', err);
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});

// GET /api/it/export/:category — Export as CSV
router.get('/export/:category(software|hardware|infrastructure|mobile)', (req, res) => {
    try {
        const table = getTable(req.params.category);
        const rows = logDb.prepare(`SELECT * FROM ${table} ORDER BY ID DESC`).all(); /* dynamic col/table - sanitize inputs */

        if (rows.length === 0) return res.status(200).send('No data');

        // Calculate live depreciation for physical assets
        if (['hardware', 'infrastructure', 'mobile'].includes(req.params.category)) {
            rows.forEach(row => {
                const dep = calculateDepreciation(row.PurchaseCost, row.SalvageValue, row.UsefulLifeYears, row.DepreciationMethod, row.PurchaseDate);
                row.CurrentBookValue = dep.currentBookValue;
                row.AccumulatedDepreciation = dep.accumulatedDepreciation;
                row.MonthlyExpense = dep.monthlyExpense;
            });
        }

        const headers = Object.keys(rows[0]);
        const csv = [
            headers.join(','),
            ...rows.map(r => headers.map(h => {
                let val = r[h] ?? '';
                val = String(val).replace(/"/g, '""');
                return val.includes(',') || val.includes('"') || val.includes('\n') ? `"${val}"` : val;
            }).join(','))
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=it_${req.params.category}_export.csv`);
        res.send(csv);
    } catch (err) {
        console.error('GET /api/it/export error:', err);
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// METRICS — Financial intelligence aggregations for IT Metrics tile
// ═══════════════════════════════════════════════════════════════════════════

router.get('/metrics', (req, res) => {
    try {
        const { plant = '' } = req.query;
        const isAllSites = !plant || plant === 'all_sites';

        // Build WHERE clause for plant filtering
        const pWhere = isAllSites ? '' : ' WHERE PlantID = ?';
        const pAnd = isAllSites ? '' : ' AND PlantID = ?';
        const pParams = isAllSites ? [] : [plant];

        // ── Spend by Category ──
        const hwSpend = logDb.prepare('SELECT COALESCE(SUM(PurchaseCost),0) as total FROM it_hardware' + pWhere).get(...pParams);
        const infraSpend = logDb.prepare('SELECT COALESCE(SUM(PurchaseCost),0) as total FROM it_infrastructure' + pWhere).get(...pParams);
        const mobSpend = logDb.prepare('SELECT COALESCE(SUM(PurchaseCost),0) as total FROM it_mobile' + pWhere).get(...pParams);
        const swSpend = logDb.prepare("SELECT COALESCE(SUM(RenewalCost),0) as total FROM it_software WHERE Status = 'Active'" + (isAllSites ? '' : ' AND PlantID = ?')).get(...pParams);

        // ── Monthly Purchase Trend (last 12 months) ──
        const purchaseTrend = [];
        for (let i = 11; i >= 0; i--) {
            const monthStart = `date('now','start of month','-${i} months')`;
            const monthEnd = `date('now','start of month','-${i-1} months')`;
            const label = logDb.prepare(`SELECT strftime('%Y-%m', ${monthStart})`).pluck().get();
            let total = 0;
            // SECURITY: table names are a hard-coded allow-list — never derived from user input.
        // Do not refactor this to use req.params/query without adding the allow-list guard at line 313.
        const IT_ASSET_SPEND_TABLES = Object.freeze(['it_hardware', 'it_infrastructure', 'it_mobile']);
        IT_ASSET_SPEND_TABLES.forEach(table => {
                const sql = `SELECT COALESCE(SUM(PurchaseCost),0) as s FROM ${table} WHERE PurchaseDate >= ${monthStart} AND PurchaseDate < ${monthEnd}` + (isAllSites ? '' : ' AND PlantID = ?');
                const r = logDb.prepare(sql).get(...pParams);
                total += r.s;
            });
            purchaseTrend.push({ month: label, spend: Math.round(total * 100) / 100 });
        }

        // ── Vendor Contract Costs (vendors are cross-plant unless filtered) ──
        const vendorWhere = isAllSites ? "WHERE Status = 'Active'" : "WHERE Status = 'Active' AND PlantID = ?";
        const vendorCosts = logDb.prepare(`
            SELECT VendorName, Category, AnnualCost, Status, EndDate,
                   CASE WHEN EndDate IS NOT NULL AND EndDate != '' AND EndDate <= date('now','+60 days') THEN 1 ELSE 0 END as expiringSoon
            FROM it_vendors_contracts ${vendorWhere} ORDER BY AnnualCost DESC
        `).all(...pParams);
        const totalVendorCost = vendorCosts.reduce((s, v) => s + (v.AnnualCost || 0), 0);
        const vendorByCategory = {};
        vendorCosts.forEach(v => {
            vendorByCategory[v.Category] = (vendorByCategory[v.Category] || 0) + (v.AnnualCost || 0);
        });

        // ── Asset Lifecycle (additions this year vs last) ──
        const thisYear = new Date().getFullYear();
        let addedThisYear = 0, addedLastYear = 0, retiredThisYear = 0;
        ['it_hardware','it_infrastructure','it_mobile'].forEach(table => {
            const yearSql = `SELECT COUNT(*) as c FROM ${table} WHERE strftime('%Y', CreatedAt) = ?` + (isAllSites ? '' : ' AND PlantID = ?');
            const retSql = `SELECT COUNT(*) as c FROM ${table} WHERE Status IN ('Retired','Disposed','Decommissioned') AND strftime('%Y', UpdatedAt) = ?` + (isAllSites ? '' : ' AND PlantID = ?');
            addedThisYear += logDb.prepare(yearSql).get(String(thisYear), ...pParams).c;
            addedLastYear += logDb.prepare(yearSql).get(String(thisYear - 1), ...pParams).c;
            retiredThisYear += logDb.prepare(retSql).get(String(thisYear), ...pParams).c;
        });

        // ── Depreciation Summary ──
        let totalOriginalCost = 0, totalBookValue = 0, totalAccumDep = 0, totalMonthlyExp = 0;
        const depByCategory = {};
        ['hardware','infrastructure','mobile'].forEach(cat => {
            const table = 'it_' + cat;
            const rows = logDb.prepare(`SELECT PurchaseCost, SalvageValue, UsefulLifeYears, DepreciationMethod, PurchaseDate FROM ${table}` + pWhere).all(...pParams);
            let catCost = 0, catBook = 0;
            rows.forEach(r => {
                const dep = calculateDepreciation(r.PurchaseCost, r.SalvageValue, r.UsefulLifeYears, r.DepreciationMethod, r.PurchaseDate);
                catCost += parseFloat(r.PurchaseCost || 0);
                catBook += dep.currentBookValue;
                totalOriginalCost += parseFloat(r.PurchaseCost || 0);
                totalBookValue += dep.currentBookValue;
                totalAccumDep += dep.accumulatedDepreciation;
                totalMonthlyExp += dep.monthlyExpense;
            });
            depByCategory[cat] = { originalCost: Math.round(catCost * 100) / 100, bookValue: Math.round(catBook * 100) / 100, count: rows.length };
        });

        // ── License Renewal Forecast (next 12 months) ──
        const renewalSql = `SELECT Name, Vendor, RenewalCost, ExpiryDate, Seats, SeatsUsed
            FROM it_software
            WHERE Status = 'Active' AND ExpiryDate IS NOT NULL AND ExpiryDate != ''
                  AND ExpiryDate <= date('now','+365 days')` + (isAllSites ? '' : ' AND PlantID = ?') + ` ORDER BY ExpiryDate ASC`;
        const renewals = logDb.prepare(renewalSql).all(...pParams);
        const totalRenewalCost = renewals.reduce((s, r) => s + (r.RenewalCost || 0), 0);

        // ── Movement Activity (last 30 days) ──
        const recentMovements = logDb.prepare(`
            SELECT MovementType, COUNT(*) as count
            FROM it_asset_movements
            WHERE CreatedAt >= date('now','-30 days')` + (isAllSites ? '' : ' AND (FromPlantID = ? OR ToPlantID = ?)') + `
            GROUP BY MovementType
        `).all(...(isAllSites ? [] : [plant, plant]));

        // ── Warranty Status ──
        let warrantyExpiring = 0, warrantyExpired = 0;
        ['it_hardware','it_infrastructure','it_mobile'].forEach(table => {
            warrantyExpiring += logDb.prepare(`SELECT COUNT(*) as c FROM ${table} WHERE WarrantyExpiry IS NOT NULL AND WarrantyExpiry != '' AND WarrantyExpiry > date('now') AND WarrantyExpiry <= date('now','+90 days')` + (isAllSites ? '' : ' AND PlantID = ?')).get(...pParams).c;
            warrantyExpired += logDb.prepare(`SELECT COUNT(*) as c FROM ${table} WHERE WarrantyExpiry IS NOT NULL AND WarrantyExpiry != '' AND WarrantyExpiry < date('now')` + (isAllSites ? '' : ' AND PlantID = ?')).get(...pParams).c;
        });

        res.json({
            scope: isAllSites ? 'enterprise' : plant,
            spendByCategory: {
                hardware: Math.round(hwSpend.total * 100) / 100,
                infrastructure: Math.round(infraSpend.total * 100) / 100,
                mobile: Math.round(mobSpend.total * 100) / 100,
                softwareRenewals: Math.round(swSpend.total * 100) / 100,
                totalCapex: Math.round((hwSpend.total + infraSpend.total + mobSpend.total) * 100) / 100,
                totalOpex: Math.round(swSpend.total * 100) / 100,
            },
            purchaseTrend,
            vendors: { costs: vendorCosts.slice(0, 20), totalAnnualCost: Math.round(totalVendorCost * 100) / 100, byCategory: vendorByCategory },
            lifecycle: { addedThisYear, addedLastYear, retiredThisYear, growthRate: addedLastYear > 0 ? Math.round(((addedThisYear - addedLastYear) / addedLastYear) * 100) : 0 },
            depreciation: {
                totalOriginalCost: Math.round(totalOriginalCost * 100) / 100,
                totalBookValue: Math.round(totalBookValue * 100) / 100,
                totalAccumDep: Math.round(totalAccumDep * 100) / 100,
                totalMonthlyExp: Math.round(totalMonthlyExp * 100) / 100,
                byCategory: depByCategory,
            },
            renewals: { items: renewals, totalCost: Math.round(totalRenewalCost * 100) / 100, count: renewals.length },
            movements: recentMovements,
            warranty: { expiring: warrantyExpiring, expired: warrantyExpired },
        });
    } catch (err) {
        console.error('GET /api/it/metrics error:', err);
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// IMPORT — CSV import for IT asset categories
// ═══════════════════════════════════════════════════════════════════════════

const IMPORT_FIELDS = {
    software: ['Name','Vendor','Version','LicenseKey','LicenseType','Seats','SeatsUsed','ExpiryDate','RenewalCost','Category','Status','AssignedTo','Department','PurchaseDate','PurchaseOrder','Notes'],
    hardware: ['Name','Type','Manufacturer','Model','SerialNumber','AssetTag','BarcodeID','AssignedTo','Location','Department','PlantID','PurchaseDate','WarrantyExpiry','PurchaseCost','SalvageValue','UsefulLifeYears','DepreciationMethod','Status','Condition','Notes'],
    infrastructure: ['Name','Type','Manufacturer','Model','SerialNumber','AssetTag','BarcodeID','IPAddress','MACAddress','Location','PlantID','RackPosition','PortCount','FirmwareVersion','PurchaseDate','WarrantyExpiry','PurchaseCost','SalvageValue','UsefulLifeYears','DepreciationMethod','Status','Criticality','Notes'],
    mobile: ['Name','Type','Manufacturer','Model','SerialNumber','AssetTag','BarcodeID','IMEI','PhoneNumber','Carrier','PlanType','MonthlyCost','AssignedTo','Department','PlantID','MDMEnrolled','MDMProvider','OSVersion','PurchaseDate','WarrantyExpiry','PurchaseCost','SalvageValue','UsefulLifeYears','DepreciationMethod','Status','Notes'],
};

const VALID_ENUMS = {
    LicenseType: ['Perpetual','Subscription','Open Source'],
    'software.Category': ['OS','Productivity','Security','DevTools','ERP','Other'],
    'software.Status': ['Active','Expired','Pending'],
    'hardware.Type': ['Desktop','Laptop','Monitor','Printer','Peripheral','Other'],
    'hardware.Status': ['Active','In Storage','In Transit','Repair','Retired','Disposed'],
    Condition: ['New','Good','Fair','Poor'],
    DepreciationMethod: ['Straight-Line','Declining Balance'],
    'infrastructure.Type': ['Server','Switch','Router','Firewall','AP','UPS','Rack','Storage','Other'],
    'infrastructure.Status': ['Online','Offline','In Transit','Maintenance','Retired'],
    Criticality: ['Critical','High','Medium','Low'],
    'mobile.Type': ['Phone','Tablet','Hotspot','Rugged Device','Other'],
    'mobile.Status': ['Active','In Storage','In Transit','Lost','Repair','Retired'],
};

// GET /api/it/import/template/:category — Download CSV template
router.get('/import/template/:category(software|hardware|infrastructure|mobile)', (req, res) => {
    const fields = IMPORT_FIELDS[req.params.category];
    if (!fields) return res.status(400).json({ error: 'Invalid category' });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=it_${req.params.category}_template.csv`);
    res.send(fields.join(',') + '\n');
});

// POST /api/it/import/:category — Import CSV data
router.post('/import/:category(software|hardware|infrastructure|mobile)', (req, res) => {
    try {
        const category = req.params.category;
        const table = getTable(category);
        const { rows, mapping, plantId } = req.body;
        if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'No rows provided' });

        const fields = IMPORT_FIELDS[category];
        const results = { imported: 0, skipped: 0, duplicates: [], errors: [] };
        const isPhysical = ['hardware', 'infrastructure', 'mobile'].includes(category);

        // Build column mapping: mapping = { csvHeader: dbField }
        const colMap = mapping || {};

        // Duplicate detection sets
        const existingSerials = new Set();
        const existingTags = new Set();
        if (isPhysical) {
            logDb.prepare(`SELECT SerialNumber, AssetTag FROM ${table} WHERE SerialNumber IS NOT NULL OR AssetTag IS NOT NULL`).all().forEach(r => { /* dynamic col/table - sanitize inputs */
                if (r.SerialNumber) existingSerials.add(r.SerialNumber.trim().toLowerCase());
                if (r.AssetTag) existingTags.add(r.AssetTag.trim().toLowerCase());
            });
        }

        // Auto-barcode counter
        const prefix = category === 'hardware' ? 'IT-HW' : category === 'infrastructure' ? 'IT-INF' : 'IT-MOB';
        let maxId = 0;
        if (isPhysical) {
            const last = logDb.prepare(`SELECT BarcodeID FROM ${table} WHERE BarcodeID LIKE '${prefix}-%' ORDER BY ID DESC LIMIT 1`).get(); /* dynamic col/table - sanitize inputs */
            if (last?.BarcodeID) { const num = parseInt(last.BarcodeID.split('-').pop()); if (!isNaN(num)) maxId = num; }
        }

        const insertStmt = logDb.prepare(`INSERT INTO ${table} (${fields.join(',')},PlantID,CreatedBy,CreatedAt${isPhysical ? ',BarcodeID' : ''}) VALUES (${fields.map(() => '?').join(',')},?,?,?${isPhysical ? ',?' : ''})`); /* dynamic col/table - sanitize inputs */

        const now = new Date().toISOString();
        const createdBy = req.headers['x-user-name'] || 'Import';
        const importPlantId = plantId || req.headers['x-plant-id'] || 'all_sites';

        const tx = logDb.transaction(() => {
            rows.forEach((row, idx) => {
                try {
                    // Map columns
                    const mapped = {};
                    Object.entries(row).forEach(([csvCol, val]) => {
                        const dbField = colMap[csvCol] || csvCol;
                        if (fields.includes(dbField)) mapped[dbField] = val;
                    });

                    // Validation: Name is required
                    if (!mapped.Name) { results.errors.push({ row: idx + 1, error: 'Name is required' }); results.skipped++; return; }

                    // Duplicate detection
                    if (isPhysical) {
                        const sn = (mapped.SerialNumber || '').trim().toLowerCase();
                        const at = (mapped.AssetTag || '').trim().toLowerCase();
                        if (sn && existingSerials.has(sn)) { results.duplicates.push({ row: idx + 1, serial: mapped.SerialNumber }); results.skipped++; return; }
                        if (at && existingTags.has(at)) { results.duplicates.push({ row: idx + 1, tag: mapped.AssetTag }); results.skipped++; return; }
                        if (sn) existingSerials.add(sn);
                        if (at) existingTags.add(at);
                    }

                    // Build values array
                    const values = fields.map(f => {
                        let v = mapped[f] ?? null;
                        // Normalize boolean
                        if (f === 'MDMEnrolled') v = (v === 'true' || v === '1' || v === 'Yes') ? 1 : 0;
                        return v;
                    });

                    // PlantID override — if not in CSV, use the provided one
                    const rowPlant = mapped.PlantID || importPlantId;
                    values.push(rowPlant, createdBy, now);

                    // Auto-generate BarcodeID for physical assets
                    if (isPhysical) {
                        const barcodeId = mapped.BarcodeID || `${prefix}-${String(++maxId).padStart(5, '0')}`;
                        values.push(barcodeId);
                    }

                    insertStmt.run(...values);
                    results.imported++;
                } catch (e) {
                    results.errors.push({ row: idx + 1, error: e.message });
                    results.skipped++;
                }
            });
        });

        tx();
        res.json({ success: true, ...results });
    } catch (err) {
        console.error('POST /api/it/import error:', err);
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});



// ═══════════════════════════════════════════════════════════════════════════
// PHASE 9.1 — RELATIONSHIPS & LINKING
// ═══════════════════════════════════════════════════════════════════════════

// -- Software ↔ Hardware links --
router.get('/links/software-hardware/:softwareId', (req, res) => {
    try {
        const links = logDb.prepare(`
            SELECT l.*, h.Name as HardwareName, h.Type as HardwareType, h.SerialNumber, h.Status as HardwareStatus
            FROM it_software_hardware_link l
            JOIN it_hardware h ON l.HardwareID = h.ID
            WHERE l.SoftwareID = ?
        `).all(req.params.softwareId);
        res.json(links);
    } catch (err) { res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.get('/links/hardware-software/:hardwareId', (req, res) => {
    try {
        const links = logDb.prepare(`
            SELECT l.*, s.Name as SoftwareName, s.Vendor, s.Version, s.LicenseType, s.Status as SoftwareStatus
            FROM it_software_hardware_link l
            JOIN it_software s ON l.SoftwareID = s.ID
            WHERE l.HardwareID = ?
        `).all(req.params.hardwareId);
        res.json(links);
    } catch (err) { res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.post('/links/software-hardware', (req, res) => {
    try {
        const { softwareId, hardwareId, notes } = req.body;
        if (!softwareId || !hardwareId) return res.status(400).json({ error: 'softwareId and hardwareId required' });
        const createdBy = req.headers['x-user-name'] || 'System';
        logDb.prepare('INSERT OR IGNORE INTO it_software_hardware_link (SoftwareID, HardwareID, InstalledDate, Notes, CreatedBy) VALUES (?,?,datetime(\'now\'),?,?)').run(softwareId, hardwareId, notes || null, createdBy);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.delete('/links/software-hardware/:id', (req, res) => {
    try {
        logDb.prepare('DELETE FROM it_software_hardware_link WHERE ID = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'An internal server error occurred' }); }
});

// -- Asset ↔ Work Order links --
router.get('/links/workorders/:category/:assetId', (req, res) => {
    try {
        const links = logDb.prepare('SELECT * FROM it_asset_workorder_link WHERE AssetCategory = ? AND AssetID = ?').all(req.params.category, req.params.assetId);
        res.json(links);
    } catch (err) { res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.post('/links/workorders', (req, res) => {
    try {
        const { assetCategory, assetId, workOrderId, plantId, linkType, notes } = req.body;
        if (!assetCategory || !assetId || !workOrderId) return res.status(400).json({ error: 'assetCategory, assetId, workOrderId required' });
        const createdBy = req.headers['x-user-name'] || 'System';
        logDb.prepare('INSERT INTO it_asset_workorder_link (AssetCategory, AssetID, WorkOrderID, PlantID, LinkType, Notes, CreatedBy) VALUES (?,?,?,?,?,?,?)').run(assetCategory, assetId, workOrderId, plantId || null, linkType || 'Related', notes || null, createdBy);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.delete('/links/workorders/:id', (req, res) => {
    try {
        logDb.prepare('DELETE FROM it_asset_workorder_link WHERE ID = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'An internal server error occurred' }); }
});

// -- Asset ↔ User directory links (mobile ↔ user) --
router.get('/links/users/:category/:assetId', (req, res) => {
    try {
        const links = logDb.prepare('SELECT * FROM it_asset_user_link WHERE AssetCategory = ? AND AssetID = ?').all(req.params.category, req.params.assetId);
        res.json(links);
    } catch (err) { res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.post('/links/users', (req, res) => {
    try {
        const { assetCategory, assetId, userEmail, userName, notes } = req.body;
        if (!assetCategory || !assetId || !userEmail) return res.status(400).json({ error: 'assetCategory, assetId, userEmail required' });
        const createdBy = req.headers['x-user-name'] || 'System';
        logDb.prepare('INSERT INTO it_asset_user_link (AssetCategory, AssetID, UserEmail, UserName, AssignedDate, Notes, CreatedBy) VALUES (?,?,?,?,datetime(\'now\'),?,?)').run(assetCategory, assetId, userEmail, userName || null, notes || null, createdBy);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.delete('/links/users/:id', (req, res) => {
    try {
        logDb.prepare('DELETE FROM it_asset_user_link WHERE ID = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'An internal server error occurred' }); }
});

// -- Infrastructure ↔ FloorPlan location (stored as metadata in Notes/Location) --
// FloorPlan integration: update infrastructure asset's Location + rack info
router.put('/links/infrastructure-location/:id', (req, res) => {
    try {
        const { location, rackPosition, floorPlanId, floorPlanX, floorPlanY } = req.body;
        const notes = floorPlanId ? `FloorPlan:${floorPlanId}@${floorPlanX},${floorPlanY}` : null;
        logDb.prepare('UPDATE it_infrastructure SET Location = ?, RackPosition = ?, Notes = COALESCE(?, Notes), UpdatedAt = datetime(\'now\') WHERE ID = ?').run(location, rackPosition || null, notes, req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'An internal server error occurred' }); }
});


// ═══════════════════════════════════════════════════════════════════════════
// PHASE 9.2 — ALERTS & NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════

router.get('/alerts', (req, res) => {
    try {
        const alerts = [];
        const now = new Date();
        const fmt = d => d.toISOString().split('T')[0];
        const d30 = new Date(now); d30.setDate(d30.getDate() + 30);
        const d60 = new Date(now); d60.setDate(d60.getDate() + 60);
        const d90 = new Date(now); d90.setDate(d90.getDate() + 90);

        // License expiry alerts (30/60/90 days)
        const expiring = logDb.prepare(`
            SELECT ID, Name, Vendor, ExpiryDate, RenewalCost FROM it_software
            WHERE Status = 'Active' AND ExpiryDate IS NOT NULL AND ExpiryDate != '' AND ExpiryDate <= ?
            ORDER BY ExpiryDate ASC
        `).all(fmt(d90));
        expiring.forEach(s => {
            const days = Math.floor((new Date(s.ExpiryDate) - now) / 86400000);
            const severity = days < 0 ? 'critical' : days <= 30 ? 'high' : days <= 60 ? 'medium' : 'low';
            alerts.push({ type: 'license_expiry', severity, category: 'software', id: s.ID, name: s.Name, vendor: s.Vendor, date: s.ExpiryDate, daysRemaining: days, cost: s.RenewalCost, message: days < 0 ? s.Name + ' license expired ' + Math.abs(days) + ' days ago' : s.Name + ' expires in ' + days + ' days' });
        });

        // Warranty expiry alerts
        ['it_hardware', 'it_infrastructure', 'it_mobile'].forEach(table => {
            const catMap = { it_hardware: 'hardware', it_infrastructure: 'infrastructure', it_mobile: 'mobile' };
            const rows = logDb.prepare(`
                SELECT ID, Name, Type, WarrantyExpiry, PlantID FROM ${table}
                WHERE Status NOT IN ('Retired','Disposed') AND WarrantyExpiry IS NOT NULL AND WarrantyExpiry != '' AND WarrantyExpiry <= ?
                ORDER BY WarrantyExpiry ASC
            `).all(fmt(d90));
            rows.forEach(r => {
                const days = Math.floor((new Date(r.WarrantyExpiry) - now) / 86400000);
                const severity = days < 0 ? 'critical' : days <= 30 ? 'high' : 'medium';
                alerts.push({ type: 'warranty_expiry', severity, category: catMap[table], id: r.ID, name: r.Name, assetType: r.Type, date: r.WarrantyExpiry, daysRemaining: days, plantId: r.PlantID, message: days < 0 ? r.Name + ' warranty expired ' + Math.abs(days) + ' days ago' : r.Name + ' warranty expires in ' + days + ' days' });
            });
        });

        // Infrastructure offline alerts
        const offline = logDb.prepare(`SELECT ID, Name, Type, Criticality, PlantID FROM it_infrastructure WHERE Status = 'Offline'`).all();
        offline.forEach(r => {
            const severity = r.Criticality === 'Critical' ? 'critical' : r.Criticality === 'High' ? 'high' : 'medium';
            alerts.push({ type: 'infra_offline', severity, category: 'infrastructure', id: r.ID, name: r.Name, assetType: r.Type, criticality: r.Criticality, plantId: r.PlantID, message: r.Name + ' (' + r.Type + ') is offline' + (r.Criticality === 'Critical' ? ' — CRITICAL' : '') });
        });

        // MDM compliance alerts
        const nonMDM = logDb.prepare(`SELECT ID, Name, Type, AssignedTo, PlantID FROM it_mobile WHERE Status = 'Active' AND MDMEnrolled = 0`).all();
        nonMDM.forEach(r => {
            alerts.push({ type: 'mdm_compliance', severity: 'medium', category: 'mobile', id: r.ID, name: r.Name, assetType: r.Type, assignedTo: r.AssignedTo, plantId: r.PlantID, message: r.Name + ' is not enrolled in MDM' });
        });

        // In-Transit alerts (shipped > 7 days ago, not yet received)
        const transitDays = 7;
        const transitCutoff = new Date(now); transitCutoff.setDate(transitCutoff.getDate() - transitDays);
        ['it_hardware', 'it_infrastructure', 'it_mobile'].forEach(table => {
            const catMap = { it_hardware: 'hardware', it_infrastructure: 'infrastructure', it_mobile: 'mobile' };
            const rows = logDb.prepare(`SELECT ID, Name, Type, PlantID FROM ${table} WHERE Status = 'In Transit'`).all(); /* dynamic col/table - sanitize inputs */
            rows.forEach(r => {
                const lastShip = logDb.prepare('SELECT CreatedAt, ToPlantID FROM it_asset_movements WHERE AssetCategory = ? AND AssetID = ? AND MovementType = \'Shipped\' ORDER BY CreatedAt DESC LIMIT 1').get(catMap[table], r.ID);
                if (lastShip && new Date(lastShip.CreatedAt) < transitCutoff) {
                    const days = Math.floor((now - new Date(lastShip.CreatedAt)) / 86400000);
                    alerts.push({ type: 'in_transit', severity: days > 14 ? 'high' : 'medium', category: catMap[table], id: r.ID, name: r.Name, assetType: r.Type, destination: lastShip.ToPlantID, daysInTransit: days, plantId: r.PlantID, message: r.Name + ' has been in transit for ' + days + ' days (to ' + (lastShip.ToPlantID || 'unknown') + ')' });
                }
            });
        });

        // Depreciation milestones
        ['it_hardware', 'it_infrastructure', 'it_mobile'].forEach(table => {
            const catMap = { it_hardware: 'hardware', it_infrastructure: 'infrastructure', it_mobile: 'mobile' };
            const rows = logDb.prepare(`SELECT ID, Name, Type, PurchaseCost, SalvageValue, UsefulLifeYears, DepreciationMethod, PurchaseDate, Status, PlantID FROM ${table} WHERE Status NOT IN ('Retired','Disposed')`).all(); /* dynamic col/table - sanitize inputs */
            rows.forEach(r => {
                const dep = calculateDepreciation(r.PurchaseCost, r.SalvageValue, r.UsefulLifeYears, r.DepreciationMethod, r.PurchaseDate);
                if (dep.fullyDepreciated) {
                    alerts.push({ type: 'depreciation_full', severity: 'low', category: catMap[table], id: r.ID, name: r.Name, assetType: r.Type, plantId: r.PlantID, message: r.Name + ' is fully depreciated but still in service' });
                } else if (dep.percentDepreciated >= 50 && dep.percentDepreciated < 100) {
                    if (dep.remainingMonths <= 6) {
                        alerts.push({ type: 'depreciation_milestone', severity: 'medium', category: catMap[table], id: r.ID, name: r.Name, assetType: r.Type, percentDepreciated: dep.percentDepreciated, remainingMonths: dep.remainingMonths, plantId: r.PlantID, message: r.Name + ' is ' + dep.percentDepreciated + '% depreciated (' + dep.remainingMonths + ' months remaining)' });
                    }
                }
            });
        });

        // Sort by severity
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        alerts.sort((a, b) => (severityOrder[a.severity] || 4) - (severityOrder[b.severity] || 4));

        const summary = {
            total: alerts.length,
            critical: alerts.filter(a => a.severity === 'critical').length,
            high: alerts.filter(a => a.severity === 'high').length,
            medium: alerts.filter(a => a.severity === 'medium').length,
            low: alerts.filter(a => a.severity === 'low').length,
        };

        res.json({ alerts, summary });
    } catch (err) {
        console.error('GET /api/it/alerts error:', err);
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});


// ═══════════════════════════════════════════════════════════════════════════
// PHASE 9.3 — IT DASHBOARD & ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

router.get('/analytics', (req, res) => {
    try {
        const plantFilter = req.query.plant;
        const plantWhere = (col='PlantID') => plantFilter && plantFilter !== 'all_sites' ? ` AND ${col} = '${plantFilter}'` : '';

        // ── IT Spending Summary (by year, by plant) ──
        const spending = { byYear: {}, byPlant: {}, byCategory: {} };
        const curYear = new Date().getFullYear();
        ['it_software', 'it_hardware', 'it_infrastructure', 'it_mobile'].forEach(table => {
            const costCol = table === 'it_software' ? 'RenewalCost' : 'PurchaseCost';
            const catLabel = table.replace('it_', '');
            const rows = logDb.prepare(`SELECT ${costCol} as cost, PurchaseDate, PlantID FROM ${table} WHERE 1=1${plantWhere()}`).all(); /* dynamic col/table - sanitize inputs */
            let catTotal = 0;
            rows.forEach(r => {
                const cost = parseFloat(r.cost || 0);
                catTotal += cost;
                const year = r.PurchaseDate ? new Date(r.PurchaseDate).getFullYear() : curYear;
                if (!spending.byYear[year]) spending.byYear[year] = 0;
                spending.byYear[year] += cost;
                const plant = r.PlantID || 'Unassigned';
                if (!spending.byPlant[plant]) spending.byPlant[plant] = 0;
                spending.byPlant[plant] += cost;
            });
            spending.byCategory[catLabel] = Math.round(catTotal * 100) / 100;
        });
        // Round
        Object.keys(spending.byYear).forEach(k => { spending.byYear[k] = Math.round(spending.byYear[k] * 100) / 100; });
        Object.keys(spending.byPlant).forEach(k => { spending.byPlant[k] = Math.round(spending.byPlant[k] * 100) / 100; });

        // ── License Utilization ──
        const licenseUtil = logDb.prepare(`SELECT Name, Vendor, Seats, SeatsUsed, LicenseType, Status FROM it_software WHERE Status = 'Active'${plantWhere()}`).all().map(s => ({
            ...s,
            utilization: s.Seats > 0 ? Math.round((s.SeatsUsed / s.Seats) * 100) : 0,
            available: Math.max(0, s.Seats - s.SeatsUsed),
        }));
        const totalSeats = licenseUtil.reduce((s, l) => s + l.Seats, 0);
        const totalUsed = licenseUtil.reduce((s, l) => s + l.SeatsUsed, 0);

        // ── Hardware Lifecycle Analysis ──
        const hwRows = logDb.prepare(`SELECT ID, Name, Type, PurchaseDate, PurchaseCost, SalvageValue, UsefulLifeYears, DepreciationMethod, Status, Condition, PlantID FROM it_hardware WHERE Status NOT IN ('Retired','Disposed')${plantWhere()}`).all();
        const ageDistribution = { '0-1yr': 0, '1-3yr': 0, '3-5yr': 0, '5yr+': 0 };
        const refreshCandidates = [];
        hwRows.forEach(r => {
            const ageYears = r.PurchaseDate ? (new Date() - new Date(r.PurchaseDate)) / (365.25 * 86400000) : 0;
            if (ageYears < 1) ageDistribution['0-1yr']++;
            else if (ageYears < 3) ageDistribution['1-3yr']++;
            else if (ageYears < 5) ageDistribution['3-5yr']++;
            else ageDistribution['5yr+']++;

            const dep = calculateDepreciation(r.PurchaseCost, r.SalvageValue, r.UsefulLifeYears, r.DepreciationMethod, r.PurchaseDate);
            if (dep.percentDepreciated >= 80 || r.Condition === 'Poor') {
                refreshCandidates.push({ id: r.ID, name: r.Name, type: r.Type, age: Math.round(ageYears * 10) / 10, condition: r.Condition, percentDepreciated: dep.percentDepreciated, bookValue: dep.currentBookValue, plantId: r.PlantID });
            }
        });

        // Replacement forecast — how many assets reach end-of-life per year
        const replacementForecast = {};
        hwRows.forEach(r => {
            if (!r.PurchaseDate) return;
            const endDate = new Date(r.PurchaseDate);
            endDate.setFullYear(endDate.getFullYear() + (r.UsefulLifeYears || 5));
            const endYear = endDate.getFullYear();
            if (endYear >= curYear) {
                if (!replacementForecast[endYear]) replacementForecast[endYear] = { count: 0, estCost: 0 };
                replacementForecast[endYear].count++;
                replacementForecast[endYear].estCost += parseFloat(r.PurchaseCost || 0);
            }
        });

        // ── Infrastructure Health ──
        const infraRows = logDb.prepare(`SELECT Status, Criticality, Type FROM it_infrastructure WHERE 1=1${plantWhere()}`).all();
        const infraHealth = {
            total: infraRows.length,
            online: infraRows.filter(r => r.Status === 'Online').length,
            offline: infraRows.filter(r => r.Status === 'Offline').length,
            maintenance: infraRows.filter(r => r.Status === 'Maintenance').length,
            uptimeRate: 0,
            byCriticality: { Critical: 0, High: 0, Medium: 0, Low: 0 },
            byType: {},
        };
        infraRows.forEach(r => {
            infraHealth.byCriticality[r.Criticality] = (infraHealth.byCriticality[r.Criticality] || 0) + 1;
            infraHealth.byType[r.Type] = (infraHealth.byType[r.Type] || 0) + 1;
        });
        infraHealth.uptimeRate = infraHealth.total > 0 ? Math.round((infraHealth.online / infraHealth.total) * 100) : 0;

        // ── Asset Location Map ──
        const assetsByPlant = {};
        ['it_hardware', 'it_infrastructure', 'it_mobile'].forEach(table => {
            const catLabel = table.replace('it_', '');
            const rows = logDb.prepare(`SELECT PlantID FROM ${table} WHERE Status NOT IN ('Retired','Disposed')`).all(); /* dynamic col/table - sanitize inputs */
            rows.forEach(r => {
                const p = r.PlantID || 'Unassigned';
                if (!assetsByPlant[p]) assetsByPlant[p] = { hardware: 0, infrastructure: 0, mobile: 0, total: 0 };
                assetsByPlant[p][catLabel]++;
                assetsByPlant[p].total++;
            });
        });

        // ── Monthly Depreciation Expense Trend ──
        const depTrend = [];
        for (let m = 11; m >= 0; m--) {
            const d = new Date(); d.setMonth(d.getMonth() - m);
            const label = d.toLocaleString('en-US', { month: 'short', year: '2-digit' });
            let monthlyTotal = 0;
            ['it_hardware', 'it_infrastructure', 'it_mobile'].forEach(table => {
                const rows = logDb.prepare(`SELECT PurchaseCost, SalvageValue, UsefulLifeYears, DepreciationMethod, PurchaseDate FROM ${table} WHERE PurchaseDate IS NOT NULL AND PurchaseDate <= ? AND Status NOT IN ('Retired','Disposed')${plantWhere()}`).all(d.toISOString().split('T')[0]); /* dynamic col/table - sanitize inputs */
                rows.forEach(r => {
                    const dep = calculateDepreciation(r.PurchaseCost, r.SalvageValue, r.UsefulLifeYears, r.DepreciationMethod, r.PurchaseDate);
                    monthlyTotal += dep.monthlyExpense;
                });
            });
            depTrend.push({ month: label, expense: Math.round(monthlyTotal * 100) / 100 });
        }

        res.json({
            spending,
            licenses: { items: licenseUtil.slice(0, 50), totalSeats, totalUsed, overallUtilization: totalSeats > 0 ? Math.round((totalUsed / totalSeats) * 100) : 0 },
            hardware: { ageDistribution, refreshCandidates: refreshCandidates.slice(0, 30), replacementForecast, totalActive: hwRows.length },
            infrastructure: infraHealth,
            assetsByPlant,
            depreciationTrend: depTrend,
        });
    } catch (err) {
        console.error('GET /api/it/analytics error:', err);
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});


// ═══════════════════════════════════════════════════════════════════════════
// PHASE 9.4 — IT GLOBAL SEARCH (Enterprise Asset Link for IT)
// ═══════════════════════════════════════════════════════════════════════════

router.get('/global-search', (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.length < 2) return res.json({ results: [] });
        const term = '%' + q + '%';
        const results = [];

        // Search hardware
        logDb.prepare(`SELECT ID, Name, Type, Manufacturer, Model, SerialNumber, AssetTag, BarcodeID, Status, Condition, PlantID, PurchaseCost, CurrentBookValue
            FROM it_hardware WHERE Name LIKE ? OR SerialNumber LIKE ? OR AssetTag LIKE ? OR BarcodeID LIKE ? OR Manufacturer LIKE ? OR Model LIKE ? LIMIT 25`).all(term, term, term, term, term, term).forEach(r => {
            const dep = calculateDepreciation(r.PurchaseCost, 0, 5, 'Straight-Line', null);
            results.push({ ...r, category: 'hardware', bookValue: r.CurrentBookValue || dep.currentBookValue });
        });

        // Search infrastructure
        logDb.prepare(`SELECT ID, Name, Type, Manufacturer, Model, SerialNumber, AssetTag, BarcodeID, IPAddress, Status, Criticality, PlantID, PurchaseCost, CurrentBookValue
            FROM it_infrastructure WHERE Name LIKE ? OR SerialNumber LIKE ? OR AssetTag LIKE ? OR BarcodeID LIKE ? OR IPAddress LIKE ? OR Manufacturer LIKE ? LIMIT 25`).all(term, term, term, term, term, term).forEach(r => {
            results.push({ ...r, category: 'infrastructure', bookValue: r.CurrentBookValue });
        });

        // Search mobile
        logDb.prepare(`SELECT ID, Name, Type, Manufacturer, Model, SerialNumber, AssetTag, BarcodeID, IMEI, PhoneNumber, Status, PlantID, PurchaseCost, CurrentBookValue
            FROM it_mobile WHERE Name LIKE ? OR SerialNumber LIKE ? OR AssetTag LIKE ? OR BarcodeID LIKE ? OR IMEI LIKE ? OR PhoneNumber LIKE ? LIMIT 25`).all(term, term, term, term, term, term).forEach(r => {
            results.push({ ...r, category: 'mobile', bookValue: r.CurrentBookValue });
        });

        // Search software
        logDb.prepare(`SELECT ID, Name, Vendor, Version, LicenseType, Category, Status, PlantID
            FROM it_software WHERE Name LIKE ? OR Vendor LIKE ? OR LicenseKey LIKE ? LIMIT 15`).all(term, term, term).forEach(r => {
            results.push({ ...r, category: 'software' });
        });

        res.json({ results, total: results.length, query: q });
    } catch (err) {
        console.error('GET /api/it/global-search error:', err);
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});


// ═══════════════════════════════════════════════════════════════════════════
// PHASE 8b — NATIVE IMPORT ADAPTERS
// ═══════════════════════════════════════════════════════════════════════════

// SOTI MDM field mapping
const SOTI_FIELD_MAP = {
    'Device Name': 'Name', 'DeviceName': 'Name',
    'Device Type': 'Type', 'DeviceType': 'Type',
    'Manufacturer': 'Manufacturer', 'Make': 'Manufacturer',
    'Model': 'Model', 'Device Model': 'Model',
    'Serial Number': 'SerialNumber', 'SerialNo': 'SerialNumber', 'Serial': 'SerialNumber',
    'IMEI': 'IMEI', 'IMEI Number': 'IMEI',
    'Phone Number': 'PhoneNumber', 'Phone': 'PhoneNumber', 'PhoneNo': 'PhoneNumber',
    'Carrier': 'Carrier', 'Network': 'Carrier',
    'OS Version': 'OSVersion', 'Operating System': 'OSVersion', 'OS': 'OSVersion',
    'Enrolled': 'MDMEnrolled', 'MDM Enrolled': 'MDMEnrolled', 'Enrollment Status': 'MDMEnrolled',
    'User': 'AssignedTo', 'Assigned User': 'AssignedTo', 'Username': 'AssignedTo',
    'Department': 'Department', 'Group': 'Department',
    'Status': 'Status', 'Device Status': 'Status',
    'Asset Tag': 'AssetTag', 'AssetTag': 'AssetTag',
};

// Fortinet field mapping
const FORTINET_FIELD_MAP = {
    'Hostname': 'Name', 'Device Name': 'Name', 'Name': 'Name',
    'Device Type': 'Type', 'Type': 'Type',
    'Model': 'Model', 'Platform': 'Model',
    'Serial Number': 'SerialNumber', 'Serial': 'SerialNumber', 'SN': 'SerialNumber',
    'IP Address': 'IPAddress', 'IP': 'IPAddress', 'Management IP': 'IPAddress',
    'MAC Address': 'MACAddress', 'MAC': 'MACAddress',
    'Firmware': 'FirmwareVersion', 'Firmware Version': 'FirmwareVersion', 'OS Version': 'FirmwareVersion',
    'Location': 'Location', 'Site': 'Location',
    'Status': 'Status', 'Connection Status': 'Status',
    'HA Status': 'Notes',
    'Asset Tag': 'AssetTag',
};

// Active Directory field mapping
const AD_FIELD_MAP = {
    'cn': 'Name', 'name': 'Name', 'Name': 'Name', 'Computer Name': 'Name', 'Hostname': 'Name',
    'operatingSystem': 'Notes', 'Operating System': 'Notes', 'OS': 'Notes',
    'distinguishedName': 'Department', 'OU': 'Department', 'Organizational Unit': 'Department',
    'serialNumber': 'SerialNumber', 'Serial Number': 'SerialNumber',
    'description': 'Notes',
    'location': 'Location', 'Location': 'Location',
    'managedBy': 'AssignedTo', 'Managed By': 'AssignedTo', 'Owner': 'AssignedTo',
    'lastLogonTimestamp': 'Notes', 'Last Logon': 'Notes',
    'whenCreated': 'PurchaseDate', 'Created': 'PurchaseDate',
    'dNSHostName': 'Notes',
};

// POST /api/it/import/adapter/:adapter — SOTI, Fortinet, or AD import with auto-mapping
router.post('/import/adapter/:adapter(soti|fortinet|ad)', (req, res) => {
    try {
        const adapter = req.params.adapter;
        const { rows } = req.body;
        if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'No rows provided' });

        let fieldMap, targetCategory, table;
        if (adapter === 'soti') {
            fieldMap = SOTI_FIELD_MAP;
            targetCategory = 'mobile';
            table = 'it_mobile';
        } else if (adapter === 'fortinet') {
            fieldMap = FORTINET_FIELD_MAP;
            targetCategory = 'infrastructure';
            table = 'it_infrastructure';
        } else {
            fieldMap = AD_FIELD_MAP;
            targetCategory = 'hardware';
            table = 'it_hardware';
        }

        // Auto-map the rows
        const mappedRows = rows.map(row => {
            const mapped = {};
            Object.entries(row).forEach(([csvCol, val]) => {
                const dbField = fieldMap[csvCol] || fieldMap[csvCol.trim()];
                if (dbField) {
                    // Handle MDMEnrolled normalization
                    if (dbField === 'MDMEnrolled') {
                        mapped[dbField] = ['true','1','yes','enrolled','compliant'].includes(String(val).toLowerCase()) ? '1' : '0';
                    } else if (dbField === 'Status') {
                        // Normalize status values
                        const sv = String(val).toLowerCase();
                        if (adapter === 'fortinet') {
                            mapped[dbField] = sv.includes('up') || sv.includes('online') || sv.includes('connected') ? 'Online' : 'Offline';
                        } else {
                            mapped[dbField] = val;
                        }
                    } else {
                        // If field already mapped, concatenate (for Notes)
                        if (mapped[dbField] && dbField === 'Notes') {
                            mapped[dbField] += ' | ' + val;
                        } else {
                            mapped[dbField] = val;
                        }
                    }
                }
            });
            return mapped;
        });

        // Forward to the standard import endpoint logic
        // Build auto-mapping for the import
        const autoMapping = {};
        const sampleRow = mappedRows[0] || {};
        Object.keys(sampleRow).forEach(k => { autoMapping[k] = k; });

        // Set MDMProvider for SOTI imports
        if (adapter === 'soti') {
            mappedRows.forEach(r => { if (!r.MDMProvider) r.MDMProvider = 'SOTI MobileControl'; });
        }
        if (adapter === 'fortinet') {
            mappedRows.forEach(r => { r.Manufacturer = r.Manufacturer || 'Fortinet'; });
        }

        // Forward to actual import handler
        req.body = { rows: mappedRows, mapping: autoMapping, plantId: req.body.plantId };
        req.params.category = targetCategory;

        // Re-use import logic inline
        const IMPORT_FIELDS_MAP = {
            software: ['Name','Vendor','Version','LicenseKey','LicenseType','Seats','SeatsUsed','ExpiryDate','RenewalCost','Category','Status','AssignedTo','Department','PurchaseDate','PurchaseOrder','Notes'],
            hardware: ['Name','Type','Manufacturer','Model','SerialNumber','AssetTag','BarcodeID','AssignedTo','Location','Department','PlantID','PurchaseDate','WarrantyExpiry','PurchaseCost','SalvageValue','UsefulLifeYears','DepreciationMethod','Status','Condition','Notes'],
            infrastructure: ['Name','Type','Manufacturer','Model','SerialNumber','AssetTag','BarcodeID','IPAddress','MACAddress','Location','PlantID','RackPosition','PortCount','FirmwareVersion','PurchaseDate','WarrantyExpiry','PurchaseCost','SalvageValue','UsefulLifeYears','DepreciationMethod','Status','Criticality','Notes'],
            mobile: ['Name','Type','Manufacturer','Model','SerialNumber','AssetTag','BarcodeID','IMEI','PhoneNumber','Carrier','PlanType','MonthlyCost','AssignedTo','Department','PlantID','MDMEnrolled','MDMProvider','OSVersion','PurchaseDate','WarrantyExpiry','PurchaseCost','SalvageValue','UsefulLifeYears','DepreciationMethod','Status','Notes'],
        };
        const fields = IMPORT_FIELDS_MAP[targetCategory];
        const results = { imported: 0, skipped: 0, duplicates: [], errors: [], adapter, targetCategory };
        const isPhysical = targetCategory !== 'software';

        const existingSerials = new Set();
        const existingTags = new Set();
        if (isPhysical) {
            logDb.prepare(`SELECT SerialNumber, AssetTag FROM ${table} WHERE SerialNumber IS NOT NULL OR AssetTag IS NOT NULL`).all().forEach(r => { /* dynamic col/table - sanitize inputs */
                if (r.SerialNumber) existingSerials.add(r.SerialNumber.trim().toLowerCase());
                if (r.AssetTag) existingTags.add(r.AssetTag.trim().toLowerCase());
            });
        }

        const prefix = targetCategory === 'hardware' ? 'IT-HW' : targetCategory === 'infrastructure' ? 'IT-INF' : 'IT-MOB';
        let maxId = 0;
        if (isPhysical) {
            const last = logDb.prepare(`SELECT BarcodeID FROM ${table} WHERE BarcodeID LIKE '${prefix}-%' ORDER BY ID DESC LIMIT 1`).get(); /* dynamic col/table - sanitize inputs */
            if (last?.BarcodeID) { const num = parseInt(last.BarcodeID.split('-').pop()); if (!isNaN(num)) maxId = num; }
        }

        const insertStmt = logDb.prepare(`INSERT INTO ${table} (${fields.join(',')},PlantID,CreatedBy,CreatedAt${isPhysical ? ',BarcodeID' : ''}) VALUES (${fields.map(() => '?').join(',')},?,?,?${isPhysical ? ',?' : ''})`); /* dynamic col/table - sanitize inputs */
        const now = new Date().toISOString();
        const createdBy = (req.headers['x-user-name'] || 'Import') + ' (' + adapter.toUpperCase() + ')';
        const importPlantId = req.body.plantId || req.headers['x-plant-id'] || 'all_sites';

        const tx = logDb.transaction(() => {
            mappedRows.forEach((mapped, idx) => {
                try {
                    if (!mapped.Name) { results.errors.push({ row: idx + 1, error: 'Name is required' }); results.skipped++; return; }
                    if (isPhysical) {
                        const sn = (mapped.SerialNumber || '').trim().toLowerCase();
                        const at = (mapped.AssetTag || '').trim().toLowerCase();
                        if (sn && existingSerials.has(sn)) { results.duplicates.push({ row: idx + 1, serial: mapped.SerialNumber }); results.skipped++; return; }
                        if (at && existingTags.has(at)) { results.duplicates.push({ row: idx + 1, tag: mapped.AssetTag }); results.skipped++; return; }
                        if (sn) existingSerials.add(sn);
                        if (at) existingTags.add(at);
                    }
                    const values = fields.map(f => mapped[f] ?? null);
                    values.push(mapped.PlantID || importPlantId, createdBy, now);
                    if (isPhysical) values.push(mapped.BarcodeID || `${prefix}-${String(++maxId).padStart(5, '0')}`);
                    insertStmt.run(...values);
                    results.imported++;
                } catch (e) {
                    results.errors.push({ row: idx + 1, error: e.message });
                    results.skipped++;
                }
            });
        });
        tx();

        res.json({ success: true, ...results });
    } catch (err) {
        console.error('POST /api/it/import/adapter error:', err);
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});

// GET /api/it/import/adapter/:adapter/fields — Get field mapping for an adapter
router.get('/import/adapter/:adapter(soti|fortinet|ad)/fields', (req, res) => {
    const maps = { soti: SOTI_FIELD_MAP, fortinet: FORTINET_FIELD_MAP, ad: AD_FIELD_MAP };
    const targets = { soti: 'mobile', fortinet: 'infrastructure', ad: 'hardware' };
    res.json({ adapter: req.params.adapter, category: targets[req.params.adapter], mapping: maps[req.params.adapter] });
});


module.exports = router;
