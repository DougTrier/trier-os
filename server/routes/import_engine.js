// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Data Import Engine API
 * ====================================
 * Handles all Enterprise System data migration and import operations — the primary pathway
 * for onboarding existing maintenance data from legacy systems into Trier OS.
 * Supports Microsoft Access databases (.mdb/.accdb), SQL Server, and direct
 * SQLite file uploads. Mounted at /api/import in server/index.js.
 *
 * ENDPOINTS:
 *   Legacy Access Database Browsing
 *   GET    /browse-legacy              Browse the legacy network share for .mdb/.accdb files
 *   POST   /browse-custom             Browse a custom file path for Access databases
 *   POST   /upload-access             Upload an Access database file directly (multipart)
 *   POST   /open-access               Open and inspect an Access database (returns table list)
 *   POST   /browse-access-table       Preview rows from a table in an Access database
 *   POST   /auto-match                Auto-map Access columns to Trier OS schema fields
 *
 *   SQL Server / External DB Connectors
 *   GET    /connectors                List configured external database connectors
 *   GET    /connectors/:id            Single connector details and connection status
 *   POST   /connect-sql               Test and save a SQL Server connection
 *   POST   /browse-sql-table          Preview rows from a SQL Server table
 *
 *   Import Execution
 *   POST   /execute                   Execute a mapped import (field map → target plant DB)
 *                                     Strategy: "fullest record wins" — if multiple source rows
 *                                     map to the same target record, the row with the most
 *                                     non-null fields is kept
 *
 *   Import History & Audit
 *   GET    /history                   List all past import sessions with status and row counts
 *   GET    /history/:id               Single import session detail: rows imported, failed, skipped
 *
 * IMPORT STRATEGIES:
 *   fullest-record-wins  — When multiple source rows match one target: keep the richest row
 *   overwrite            — Source data replaces target unconditionally
 *   merge                — Non-null source fields fill empty target fields only
 *   append               — All source rows inserted; no duplicate checking
 *
 * ACCESS DB SUPPORT: Requires mdb-tools (Linux) or Windows JET/ACE OLEDB driver.
 *   File is opened via child_process exec of mdb-export for table extraction.
 *   Binary .mdb files are parsed to UTF-8; encoding issues logged to import history.
 *
 * FIELD AUTO-MATCH: Fuzzy column name matching (Levenshtein distance ≤ 3) maps
 *   legacy columns to Trier OS schema automatically. Confidence score shown in UI.
 *   Users review and adjust mappings before committing the import.
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../database');
const { 
    logAudit, 
    db: logisticsDb,
    createImportSession,
    completeImportSession,
    logImportFailure,
    getImportHistory,
    getImportFailures
} = require('../logistics_db');

// ── Access database reader (installed in Phase 3) ──
let MDBReader;
try {
    MDBReader = require('mdb-reader').default;
} catch (e) {
    console.warn('⚠️ mdb-reader not available — Access imports disabled');
}

// ── OLEDB fallback reader for .accdb files (Windows only) ──
let oledbReader;
try {
    oledbReader = require('../oledb_reader');
    if (oledbReader.isOledbAvailable()) {
        console.log('✅ OLEDB reader available — .accdb files supported');
    } else {
        oledbReader = null;
        console.warn('⚠️ OLEDB driver not available — .accdb files unsupported');
    }
} catch (e) {
    oledbReader = null;
    console.warn('⚠️ OLEDB reader module not found');
}

// ── SQL Server reader (installed in Phase 5) ──
let sql;
try {
    sql = require('mssql');
} catch (e) {
    console.warn('⚠️ mssql not available — SQL Server imports disabled');
}

const dataDir = require('../resolve_data_dir');

// ═══════════════════════════════════════════════════════════════════════════════
// PRIVILEGE CHECK
// ═══════════════════════════════════════════════════════════════════════════════

function hasImportPrivilege(user) {
    if (!user) return false;
    if (user.globalRole === 'creator' || user.globalRole === 'it_admin') return true;
    try {
        const row = logisticsDb.prepare('SELECT Value FROM SystemSettings WHERE Key = ?').get('allowed_import_users');
        if (!row) return false;
        const users = JSON.parse(row.Value);
        return Array.isArray(users) && users.includes(user.Username);
    } catch (e) {
        return false;
    }
}

// Middleware: all import routes require import privilege
router.use((req, res, next) => {
    if (!hasImportPrivilege(req.user)) {
        return res.status(403).json({ error: 'Import privileges required. Contact your IT Administrator.' });
    }
    next();
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3: Access Database Reader — Local File Browser
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/import/browse-legacy
 * 
 * Returns a file tree of .mdb and .accdb files in the configured legacy databases directory.
 * Also checks the PMC directory for PMC databases.
 */
router.get('/browse-legacy', (req, res) => {
    try {
        // Check known legacy database directories
        const searchDirs = [];
        
        // Check for configured legacy path in SystemSettings
        try {
            const row = logisticsDb.prepare('SELECT Value FROM SystemSettings WHERE Key = ?').get('legacy_database_path');
            if (row && row.Value && fs.existsSync(row.Value)) {
                searchDirs.push(row.Value);
            }
        } catch (e) { /* ignore */ }

        // Add common default paths (relative to application root)
        const appRoot = path.join(__dirname, '..', '..');
        const defaultPaths = [
            path.join(appRoot, 'Legacy Databases'),
            path.join(appRoot, 'data', 'legacy'),
            path.join(appRoot, '..', 'Legacy Databases'),
            path.join(appRoot, '..', 'PMC')
        ];
        for (const dp of defaultPaths) {
            if (fs.existsSync(dp) && !searchDirs.includes(dp)) {
                searchDirs.push(dp);
            }
        }

        const results = [];
        
        for (const baseDir of searchDirs) {
            scanForDatabaseFiles(baseDir, baseDir, results);
        }

        res.json({ directories: searchDirs, files: results });
    } catch (err) {
        console.error('Browse legacy failed:', err);
        res.status(500).json({ error: 'Failed to browse legacy database directory' });
    }
});

/**
 * POST /api/import/browse-custom
 * 
 * Browse any directory on the computer for .mdb / .accdb files.
 * Body: { directory: string }
 */
router.post('/browse-custom', (req, res) => {
    try {
        const { directory } = req.body;
        if (!directory) {
            return res.status(400).json({ error: 'Directory path is required' });
        }
        if (!fs.existsSync(directory)) {
            return res.status(404).json({ error: `Directory not found: ${directory}` });
        }

        const stats = fs.statSync(directory);
        if (!stats.isDirectory()) {
            return res.status(400).json({ error: 'Path is not a directory' });
        }

        const results = [];
        scanForDatabaseFiles(directory, directory, results, 0);
        res.json({ directory, files: results });
    } catch (err) {
        console.error('Browse custom failed:', err);
        res.status(500).json({ error: 'Failed to browse directory: ' + err.message });
    }
});

/**
 * POST /api/import/upload-access
 *
 * Accept a .mdb / .accdb file upload. Saves to a temp directory and returns the path.
 * The user can then use open-access with that path.
 */
const multer = require('multer');
const uploadStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(require('../resolve_data_dir'), 'uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Preserve original filename with timestamp prefix to avoid collisions
        const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, `${Date.now()}_${safeName}`);
    }
});
const dbUpload = multer({
    storage: uploadStorage,
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext === '.mdb' || ext === '.accdb') {
            cb(null, true);
        } else {
            cb(new Error('Only .mdb and .accdb files are allowed'));
        }
    },
    limits: { fileSize: 500 * 1024 * 1024 } // 500 MB max
});

router.post('/upload-access', dbUpload.single('database'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No database file uploaded' });
        }
        const ext = path.extname(req.file.originalname).toLowerCase();
        const stats = fs.statSync(req.file.path);
        res.json({
            success: true,
            file: {
                name: req.file.originalname,
                path: req.file.path,
                relativePath: req.file.originalname,
                size: stats.size,
                sizeMB: (stats.size / 1024 / 1024).toFixed(2),
                modified: stats.mtime,
                format: ext === '.mdb' ? 'Access 97-2003' : 'Access 2007+'
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Upload failed: ' + err.message });
    }
});

/**
 * Recursively scan for .mdb/.accdb files
 */
function scanForDatabaseFiles(dir, baseDir, results, depth = 0) {
    if (depth > 3) return; // Prevent deep recursion
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                scanForDatabaseFiles(fullPath, baseDir, results, depth + 1);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (ext === '.mdb' || ext === '.accdb') {
                    const stats = fs.statSync(fullPath);
                    results.push({
                        name: entry.name,
                        path: fullPath,
                        relativePath: path.relative(baseDir, fullPath),
                        size: stats.size,
                        sizeMB: (stats.size / 1024 / 1024).toFixed(2),
                        modified: stats.mtime,
                        format: ext === '.mdb' ? 'Access 97-2003' : 'Access 2007+'
                    });
                }
            }
        }
    } catch (e) {
        // Permission denied or other FS error — skip silently
    }
}

/**
 * POST /api/import/open-access
 * 
 * Opens an Access database file and returns its table list with row counts.
 * Automatically handles password-protected files using known passwords
 * and XOR header recovery.
 */
router.post('/open-access', (req, res) => {
    try {
        const { filePath } = req.body;
        if (!filePath || !fs.existsSync(filePath)) {
            return res.status(400).json({ error: 'File not found: ' + filePath });
        }

        const ext = path.extname(filePath).toLowerCase();
        if (ext !== '.mdb' && ext !== '.accdb') {
            return res.status(400).json({ error: 'Unsupported file format. Only .mdb and .accdb files are supported.' });
        }

        let mdb = null;
        let useOledb = false;
        let oledbPassword = null;
        let oledbTables = null;

        // ── Step 1: Try mdb-reader (fast, in-process) ──
        if (MDBReader) {
            const buf = fs.readFileSync(filePath);
            try {
                mdb = new MDBReader(buf);
            } catch (err) {
                // Try known passwords with mdb-reader
                const knownPasswords = getKnownPasswords();
                for (const pwd of knownPasswords) {
                    try {
                        mdb = new MDBReader(buf, { password: pwd });
                        console.log(`🔓 Access DB opened with known password (mdb-reader): ${filePath}`);
                        break;
                    } catch (e2) { /* try next */ }
                }
            }
        }

        // ── Step 2: Fallback to OLEDB for .accdb files ──
        if (!mdb && oledbReader) {
            console.log(`⚡ mdb-reader failed, trying OLEDB fallback for: ${path.basename(filePath)}`);
            const knownPasswords = getKnownPasswords();
            const oledbResult = oledbReader.listTables(filePath, knownPasswords);
            
            if (oledbResult.success) {
                useOledb = true;
                oledbPassword = oledbResult.usedPassword || '';
                oledbTables = oledbResult.tables;
                console.log(`🔓 Access DB opened via OLEDB (pwd=${oledbPassword ? 'yes' : 'none'}): ${oledbResult.tables.length} tables`);
            } else {
                return res.status(403).json({
                    error: 'Database could not be opened. ' + (oledbResult.error || 'Unknown error.'),
                    passwordRequired: true
                });
            }
        }

        if (!mdb && !useOledb) {
            return res.status(500).json({ error: 'No database reader available. Install mdb-reader or ensure OLEDB driver is present.' });
        }

        // Get all user tables (exclude MSys internal tables)
        let userTables, tables;

        if (useOledb) {
            // OLEDB path — tables already loaded
            tables = oledbTables.map(t => ({
                name: t.name,
                columns: t.columns || [],
                columnCount: t.columnCount || (t.columns ? t.columns.length : 0)
            }));
            userTables = tables.map(t => t.name);
        } else {
            // mdb-reader path
            const allTables = mdb.getTableNames();
            userTables = allTables.filter(t => !t.startsWith('MSys'));
            tables = userTables.map(tableName => {
                try {
                    const table = mdb.getTable(tableName);
                    const columns = table.getColumnNames();
                    return { name: tableName, columns, columnCount: columns.length };
                } catch (e) {
                    return { name: tableName, columns: [], columnCount: 0, error: e.message };
                }
            });
        }

        // ── Enterprise System Fingerprinting ──
        // Check if this database matches a known Enterprise System system by its table signatures
        const tableNameSet = new Set(userTables.map(t => t.toUpperCase()));
        let detectedCmms = null;
        let detectedProfile = null;

        // MP2 / Datastream / Infor EAM fingerprint
        const mp2Signatures = ['WO', 'EQUIP', 'INVY', 'STOCK', 'VENDOR', 'TASK', 'SCHEDWO', 'EMP', 'CRAFTS', 'EQXREF'];
        const mp2Hits = mp2Signatures.filter(t => tableNameSet.has(t)).length;
        if (mp2Hits >= 4) {
            detectedCmms = 'mp2';
            console.log(`🔍 Fingerprint: Detected MP2 database (${mp2Hits}/${mp2Signatures.length} signature tables)`);
        }

        // PMC fingerprint (PMC uses mixed-case table names: Work, Asset, Part, Procedur, AddrBook, etc.)
        const tableNameSetMixed = new Set(userTables);
        const pmcSignatures = ['Work', 'Asset', 'Part', 'Schedule', 'Procedur', 'AddrBook', 'WorkLabr', 'WorkPart', 'AstPrt', 'PartVend'];
        const pmcHits = pmcSignatures.filter(t => tableNameSetMixed.has(t)).length;
        if (pmcHits >= 4 && pmcHits > mp2Hits) {
            detectedCmms = 'pmc';
            console.log(`🔍 Fingerprint: Detected PMC database (${pmcHits}/${pmcSignatures.length} signature tables)`);
        }

        // Express Maintenance fingerprint
        const expressSignatures = ['EQUIPMENT', 'WORKORDERS', 'INVENTORY', 'SUPPLIERS', 'EMPLOYEES', 'PREVENTIVE'];
        const expressHits = expressSignatures.filter(t => tableNameSet.has(t)).length;
        if (expressHits >= 3 && expressHits > mp2Hits && expressHits > pmcHits) {
            detectedCmms = 'express';
            console.log(`🔍 Fingerprint: Detected Express Maintenance database (${expressHits}/${expressSignatures.length} signature tables)`);
        }

        // Load connector profile if Enterprise System detected
        if (detectedCmms) {
            try {
                const profilePath = path.join(__dirname, '..', 'connectors', `${detectedCmms}.json`);
                if (fs.existsSync(profilePath)) {
                    detectedProfile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
                    console.log(`  ✅ Loaded connector profile: ${detectedProfile.name}`);
                }
            } catch (e) {
                console.warn('  ⚠️ Failed to load connector profile for', detectedCmms);
            }
        }

        res.json({
            file: path.basename(filePath),
            path: filePath,
            format: ext === '.mdb' ? 'Access 97-2003' : 'Access 2007+',
            reader: useOledb ? 'oledb' : 'mdb-reader',
            oledbPassword: useOledb ? oledbPassword : undefined,
            totalTables: userTables.length,
            tables,
            detectedCmms,
            detectedProfile
        });

    } catch (err) {
        console.error('Open Access DB failed:', err);
        res.status(500).json({ error: 'Failed to open Access database: ' + err.message });
    }
});

/**
 * POST /api/import/browse-access-table
 * 
 * Returns paginated data from a specific table in an Access database.
 * Column names are translated using connector profile mappings for the 
 * familiar Trier overlay view.
 */
router.post('/browse-access-table', (req, res) => {
    try {
        const { filePath, tableName, page = 1, limit = 50, oledbPassword: reqOledbPwd } = req.body;
        
        if (!filePath || !fs.existsSync(filePath)) {
            return res.status(400).json({ error: 'File not found' });
        }

        let columns, allRows;
        let mdb = null;

        // Step 1: Try mdb-reader
        if (MDBReader) {
            const buf = fs.readFileSync(filePath);
            try {
                mdb = new MDBReader(buf);
            } catch (err) {
                const knownPasswords = getKnownPasswords();
                for (const pwd of knownPasswords) {
                    try { mdb = new MDBReader(buf, { password: pwd }); break; } catch (e) { /* next */ }
                }
            }
        }

        if (mdb) {
            const table = mdb.getTable(tableName);
            columns = table.getColumnNames();
            allRows = table.getData();
        } else if (oledbReader) {
            // Step 2: OLEDB fallback
            let oledbPwd = reqOledbPwd || '';
            if (!oledbPwd) {
                const knownPasswords = getKnownPasswords();
                const probe = oledbReader.listTables(filePath, knownPasswords);
                if (probe.success) oledbPwd = probe.usedPassword || '';
                else return res.status(403).json({ error: 'Could not open database' });
            }
            const result = oledbReader.readTable(filePath, tableName, oledbPwd);
            if (!result.success) return res.status(500).json({ error: 'Failed to read table: ' + result.error });
            columns = result.columns;
            allRows = result.rows;
        } else {
            return res.status(500).json({ error: 'No database reader available.' });
        }

        const totalRows = allRows.length;
        const startIdx = (page - 1) * limit;
        const endIdx = Math.min(startIdx + limit, totalRows);
        const rows = allRows.slice(startIdx, endIdx);

        // Convert rows to plain objects
        const data = rows.map(row => {
            const obj = {};
            columns.forEach((col) => {
                obj[col] = row[col] !== undefined ? row[col] : null;
            });
            return obj;
        });

        res.json({
            tableName,
            columns,
            totalRows,
            page,
            limit,
            totalPages: Math.ceil(totalRows / limit),
            data
        });

    } catch (err) {
        console.error('Browse Access table failed:', err);
        res.status(500).json({ error: 'Failed to browse table: ' + err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMA AUTO-MATCHING — Intelligent table/column detection
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Common column name aliases across different Enterprise System systems.
 * Maps alternate names → Trier canonical column names.
 */
const COLUMN_ALIASES = {
    // Work table
    'WONUM': 'WorkOrderNumber', 'WO_NUM': 'WorkOrderNumber', 'WO': 'WorkOrderNumber', 'WONUMBER': 'WorkOrderNumber',
    'WORKORDER': 'WorkOrderNumber', 'WORK_ORDER_NUMBER': 'WorkOrderNumber', 'WO_NUMBER': 'WorkOrderNumber',
    'WOSTATUS': 'StatusID', 'WO_STATUS': 'StatusID', 'STATUS': 'StatusID', 'STATUSID': 'StatusID',
    'SCHDATE': 'SchDate', 'SCHEDULEDDATE': 'SchDate', 'SCHEDDATE': 'SchDate', 'SCHEDULED_DATE': 'SchDate',
    'DATEDUE': 'SchDate', 'DUEDATE': 'SchDate', 'DUE_DATE': 'SchDate',
    'REQDATE': 'ReqDate', 'REQUESTDATE': 'ReqDate', 'DATE_REQUESTED': 'ReqDate',
    'ADDDATE': 'AddDate', 'CREATEDATE': 'AddDate', 'CREATED': 'AddDate', 'DATECREATED': 'AddDate',
    'COMPLETEDDATE': 'CompletedDate', 'DATECOMP': 'CompletedDate', 'COMPDATE': 'CompletedDate',
    'PRIORITY': 'Priority', 'PRI': 'Priority',
    'ASSIGNTO': 'AssignToID', 'ASSIGNEE': 'AssignToID', 'ASSIGNED': 'AssignToID', 'ASSIGNTOID': 'AssignToID',
    'ASTID': 'AstID', 'ASSETID': 'AstID', 'ASSET_ID': 'AstID', 'EQNUM': 'AstID', 'EQUIPNUM': 'AstID',
    'EQUIPMENT': 'AstID', 'EQUIPMENT_ID': 'AstID', 'EQUIP_ID': 'AstID',

    // Asset table
    'EQDESC': 'Description', 'ASSETDESC': 'Description', 'ASSET_DESC': 'Description',
    'EQUIPDESC': 'Description', 'EQUIP_DESC': 'Description', 'EQUIP_DESCRIPTION': 'Description',
    'DESCRIPT': 'Description', 'DESC': 'Description', 'NAME': 'Description',
    'MODEL': 'Model', 'MODELNUM': 'Model', 'MODEL_NUMBER': 'Model', 'MODELNO': 'Model',
    'SERIAL': 'Serial', 'SERIALNUM': 'Serial', 'SERIAL_NUMBER': 'Serial', 'SERIALNO': 'Serial',
    'SN': 'Serial', 'S_N': 'Serial',
    'MANUFACTURER': 'Manufacturer', 'MAKE': 'Manufacturer', 'MFG': 'Manufacturer', 'MANUF': 'Manufacturer',
    'MFR': 'Manufacturer', 'VENDOR': 'Manufacturer',
    'LOCATION': 'LocationID', 'LOCATIONID': 'LocationID', 'LOC': 'LocationID', 'LOCID': 'LocationID',
    'LOC_ID': 'LocationID', 'LOCATION_ID': 'LocationID',
    'DEPARTMENT': 'DeptID', 'DEPTID': 'DeptID', 'DEPT': 'DeptID', 'DEPT_ID': 'DeptID',

    // Part table
    'PARTNO': 'ID', 'PARTNUM': 'ID', 'PART_NUMBER': 'ID', 'PARTNUMBER': 'ID',
    'PARTID': 'ID', 'PART_ID': 'ID', 'INVNUM': 'ID', 'ITEMNO': 'ID', 'ITEM_NO': 'ID',
    'INVDESC': 'Description', 'PARTDESC': 'Description', 'PART_DESC': 'Description',
    'ITEMDESC': 'Description', 'ITEM_DESC': 'Description', 'ITEM_DESCRIPTION': 'Description',
    'QTY': 'Quantity', 'QTYONHAND': 'Quantity', 'QTY_ON_HAND': 'Quantity', 'ONHAND': 'Quantity',
    'STOCK': 'Quantity', 'STOCKQTY': 'Quantity', 'STOCK_QTY': 'Quantity',
    'REORDER': 'ReorderPoint', 'REORDERPT': 'ReorderPoint', 'REORDER_POINT': 'ReorderPoint',
    'MINQTY': 'ReorderPoint', 'MIN_QTY': 'ReorderPoint', 'MINIMUM': 'ReorderPoint',
    'UNITCOST': 'UnitCost', 'UNIT_COST': 'UnitCost', 'COST': 'UnitCost', 'PRICE': 'UnitCost',

    // Vendors table
    'VENDORNAME': 'Description', 'VENDOR_NAME': 'Description', 'COMPANY': 'Description',
    'COMPANYNAME': 'Description', 'COMPANY_NAME': 'Description', 'SUPPLIERNAME': 'Description',
    'PHONE': 'Phone', 'PHONE1': 'Phone', 'PHONENUM': 'Phone', 'TELEPHONE': 'Phone',
    'FAX': 'Fax', 'FAXNUM': 'Fax', 'FAX_NUMBER': 'Fax',
    'EMAIL': 'Email', 'EMAILADDR': 'Email', 'EMAIL_ADDRESS': 'Email',
    'ADDRESS': 'Address', 'ADDRESS1': 'Address', 'ADDR': 'Address', 'STREET': 'Address',
    'CITY': 'City', 'STATE': 'State', 'ZIP': 'Zip', 'ZIPCODE': 'Zip', 'POSTALCODE': 'Zip',

    // Schedule table
    'FREQUENCY': 'Frequency', 'FREQ': 'Frequency', 'INTERVAL': 'Frequency',
    'LASTDATE': 'LastPMDate', 'LAST_PM_DATE': 'LastPMDate', 'LASTPMDATE': 'LastPMDate',
    'NEXTDATE': 'NextPMDate', 'NEXT_PM_DATE': 'NextPMDate', 'NEXTPMDATE': 'NextPMDate',

    // Universal
    'ID': 'ID', 'DESCRIPTION': 'Description'
};

/**
 * Table name aliases — maps common Enterprise System table names to Trier table names
 */
const TABLE_ALIASES = {
    // Work
    'WORKORDER': 'Work', 'WORKORDERS': 'Work', 'WORK_ORDER': 'Work', 'WORK_ORDERS': 'Work',
    'WO': 'Work', 'WOS': 'Work', 'WORKORDERMASTER': 'Work', 'WORK': 'Work',
    'WOMASTER': 'Work', 'WO_MASTER': 'Work',
    // Asset
    'ASSET': 'Asset', 'ASSETS': 'Asset', 'EQUIPMENT': 'Asset', 'EQUIP': 'Asset',
    'EQUIPMASTER': 'Asset', 'EQUIP_MASTER': 'Asset', 'EQMASTER': 'Asset', 'ASSETMASTER': 'Asset',
    'MACHINE': 'Asset', 'MACHINES': 'Asset',
    // Part / Inventory
    'PART': 'Part', 'PARTS': 'Part', 'INVENTORY': 'Part', 'INV': 'Part',
    'INVMASTER': 'Part', 'INV_MASTER': 'Part', 'PARTMASTER': 'Part', 'PART_MASTER': 'Part',
    'SPAREPART': 'Part', 'SPARE_PARTS': 'Part', 'STOCK': 'Part', 'STOCKMASTER': 'Part',
    'ITEM': 'Part', 'ITEMS': 'Part',
    // Vendors
    'VENDOR': 'Vendors', 'VENDORS': 'Vendors', 'SUPPLIER': 'Vendors', 'SUPPLIERS': 'Vendors',
    'VENDORMASTER': 'Vendors', 'VENDOR_MASTER': 'Vendors', 'ADDRBOOK': 'Vendors',
    'ADDRESS_BOOK': 'Vendors', 'CONTACTS': 'Vendors',
    // Schedule
    'SCHEDULE': 'Schedule', 'SCHEDULES': 'Schedule', 'PM': 'Schedule', 'PMSCHEDULE': 'Schedule',
    'PM_SCHEDULE': 'Schedule', 'PREVENTIVE': 'Schedule', 'PMMASTER': 'Schedule',
    // Procedures
    'PROCEDURE': 'Procedures', 'PROCEDURES': 'Procedures', 'SOP': 'Procedures', 'SOPS': 'Procedures',
    'PROCMASTER': 'Procedures', 'PROC_MASTER': 'Procedures',
    // Task
    'TASK': 'Task', 'TASKS': 'Task', 'TASKMASTER': 'Task', 'TASK_MASTER': 'Task',
    // Locations
    'LOCATION': 'Locations', 'LOCATIONS': 'Locations', 'LOC': 'Locations',
    // Departments
    'DEPARTMENT': 'Departments', 'DEPARTMENTS': 'Departments', 'DEPT': 'Departments',
    // Users
    'USER': 'Users', 'USERS': 'Users', 'EMPLOYEE': 'Users', 'EMPLOYEES': 'Users',
    'CRAFTPERSON': 'Users', 'CRAFTPERSONS': 'Users', 'TECHNICIAN': 'Users', 'TECHNICIANS': 'Users'
};

/**
 * POST /api/import/auto-match
 * 
 * Compares source Access DB tables/columns against Trier's actual schema.
 * Returns matched tables with column mappings and confidence scores.
 * 
 * Body: { filePath: string }
 * Returns: { matches: [{ sourceTable, prairieTable, confidence, columnMappings, matchedColumns, totalColumns }] }
 */
router.post('/auto-match', (req, res) => {
    try {
        if (!MDBReader) {
            return res.status(500).json({ error: 'Access database reader not available' });
        }

        const { filePath } = req.body;
        if (!filePath || !fs.existsSync(filePath)) {
            return res.status(400).json({ error: 'File not found' });
        }

        // Open the Access database
        const buf = fs.readFileSync(filePath);
        let mdb;
        try {
            mdb = new MDBReader(buf);
        } catch (err) {
            const knownPasswords = getKnownPasswords();
            for (const pwd of knownPasswords) {
                try { mdb = new MDBReader(buf, { password: pwd }); break; } catch (e) { /* next */ }
            }
            if (!mdb) return res.status(403).json({ error: 'Could not open database' });
        }

        // Get all source tables
        const sourceTables = mdb.getTableNames().filter(t => !t.startsWith('MSys'));

        // Get Trier DB schema (all tables + their columns)
        const plantId = db.asyncLocalStorage.getStore() || 'Demo_Plant_1';
        const connection = db.getDb();
        const prairieTableNames = connection.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_migration%'"
        ).all().map(r => r.name);

        const prairieSchema = {};
        for (const tableName of prairieTableNames) {
            try {
                const cols = connection.pragma(`table_info("${tableName}")`);
                prairieSchema[tableName] = cols.map(c => c.name);
            } catch (e) { /* skip */ }
        }

        console.log(`\n🔍 Auto-Match: ${sourceTables.length} source tables vs ${prairieTableNames.length} Trier tables`);

        const matches = [];

        for (const sourceTableName of sourceTables) {
            let sourceColumns;
            let sourceRowCount = 0;
            try {
                const table = mdb.getTable(sourceTableName);
                sourceColumns = table.getColumnNames();
                sourceRowCount = table.getData().length;
            } catch (e) { continue; }

            if (sourceColumns.length === 0) continue;

            // Step 1: Try table name matching (exact, alias, or fuzzy)
            let bestMatch = null;
            let bestScore = 0;
            let bestColumnMap = {};

            for (const [prairieTable, prairieCols] of Object.entries(prairieSchema)) {
                // Calculate table name similarity
                let tableNameScore = 0;
                const srcUpper = sourceTableName.toUpperCase().replace(/[_\s-]/g, '');
                const tgtUpper = prairieTable.toUpperCase().replace(/[_\s-]/g, '');

                if (srcUpper === tgtUpper) {
                    tableNameScore = 50; // Exact match
                } else if (TABLE_ALIASES[srcUpper] === prairieTable) {
                    tableNameScore = 45; // Known alias
                } else if (srcUpper.includes(tgtUpper) || tgtUpper.includes(srcUpper)) {
                    tableNameScore = 20; // Substring match
                }

                // Step 2: Column name matching
                const columnMap = {};
                let matchedCols = 0;

                for (const srcCol of sourceColumns) {
                    const srcColUpper = srcCol.toUpperCase().replace(/[_\s-]/g, '');

                    // Try exact match
                    if (prairieCols.includes(srcCol)) {
                        columnMap[srcCol] = { target: srcCol, type: 'exact' };
                        matchedCols++;
                        continue;
                    }

                    // Try case-insensitive match
                    const ciMatch = prairieCols.find(c => c.toUpperCase().replace(/[_\s-]/g, '') === srcColUpper);
                    if (ciMatch) {
                        columnMap[srcCol] = { target: ciMatch, type: 'case-insensitive' };
                        matchedCols++;
                        continue;
                    }

                    // Try alias match
                    const aliasTarget = COLUMN_ALIASES[srcColUpper];
                    if (aliasTarget && prairieCols.includes(aliasTarget)) {
                        columnMap[srcCol] = { target: aliasTarget, type: 'alias' };
                        matchedCols++;
                        continue;
                    }
                }

                // Calculate overall score
                const colRatio = sourceColumns.length > 0 ? matchedCols / sourceColumns.length : 0;
                const colScore = colRatio * 50; // Column matching is worth up to 50 points
                const totalScore = tableNameScore + colScore;

                if (totalScore > bestScore && matchedCols >= 1) {
                    bestScore = totalScore;
                    bestMatch = prairieTable;
                    bestColumnMap = columnMap;
                }
            }

            if (bestMatch && bestScore >= 15) {
                const mappedCount = Object.keys(bestColumnMap).length;
                const confidence = bestScore >= 70 ? 'high' : bestScore >= 40 ? 'medium' : 'low';

                matches.push({
                    sourceTable: sourceTableName,
                    prairieTable: bestMatch,
                    confidence,
                    score: Math.round(bestScore),
                    matchedColumns: mappedCount,
                    totalSourceColumns: sourceColumns.length,
                    totalTargetColumns: prairieSchema[bestMatch]?.length || 0,
                    sourceRowCount,
                    columnMappings: bestColumnMap
                });

                console.log(`  ✅ ${sourceTableName} → ${bestMatch} (score: ${Math.round(bestScore)}, ${confidence}, ${mappedCount}/${sourceColumns.length} cols, ${sourceRowCount} rows)`);
            }
        }

        // Sort by confidence score (highest first)
        matches.sort((a, b) => b.score - a.score);

        // Deduplicate: if multiple source tables map to the same Trier table, keep the best match
        const seen = new Set();
        const dedupedMatches = matches.filter(m => {
            if (seen.has(m.prairieTable)) return false;
            seen.add(m.prairieTable);
            return true;
        });

        console.log(`  📊 Auto-matched ${dedupedMatches.length} tables out of ${sourceTables.length} source tables\n`);

        res.json({
            success: true,
            totalSourceTables: sourceTables.length,
            totalTrierTables: prairieTableNames.length,
            matches: dedupedMatches,
            unmatchedSource: sourceTables.filter(t => !dedupedMatches.find(m => m.sourceTable === t)),
            unmatchedTrier: prairieTableNames.filter(t => !dedupedMatches.find(m => m.prairieTable === t))
        });

    } catch (err) {
        console.error('Auto-match failed:', err);
        res.status(500).json({ error: 'Auto-match failed: ' + err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 1: Import History Routes
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/import/history
 * Returns all import sessions, optionally filtered by plant
 */
router.get('/history', (req, res) => {
    try {
        const { plantId } = req.query;
        const history = getImportHistory(plantId || null);
        res.json(history);
    } catch (err) {
        res.status(500).json({ error: 'Failed to retrieve import history' });
    }
});

/**
 * GET /api/import/history/:id
 * Returns full details for a specific import session
 */
router.get('/history/:id', (req, res) => {
    try {
        const session = logisticsDb.prepare('SELECT * FROM Import_Log WHERE ImportID = ?').get(req.params.id);
        if (!session) return res.status(404).json({ error: 'Import session not found' });
        
        const failures = getImportFailures(req.params.id);
        
        res.json({
            ...session,
            TablesSelected: session.TablesSelected ? JSON.parse(session.TablesSelected) : [],
            TablesDeferred: session.TablesDeferred ? JSON.parse(session.TablesDeferred) : [],
            failures
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to retrieve import details' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONNECTOR PROFILES — Load from server/connectors/*.json
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/import/connectors
 * Returns list of available Enterprise System connector profiles
 */
router.get('/connectors', (req, res) => {
    try {
        const connectorsDir = path.join(__dirname, '..', 'connectors');
        if (!fs.existsSync(connectorsDir)) {
            fs.mkdirSync(connectorsDir, { recursive: true });
        }

        const files = fs.readdirSync(connectorsDir).filter(f => f.endsWith('.json'));
        const connectors = files.map(f => {
            try {
                const profile = JSON.parse(fs.readFileSync(path.join(connectorsDir, f), 'utf8'));
                return {
                    id: profile.id,
                    name: profile.name,
                    sourceType: profile.sourceType,
                    filename: f,
                    tableCount: Object.keys(profile.tables || {}).length
                };
            } catch (e) {
                return { filename: f, error: e.message };
            }
        });

        res.json(connectors);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load connectors' });
    }
});

/**
 * GET /api/import/connectors/:id
 * Returns full connector profile for a specific Enterprise System
 */
router.get('/connectors/:id', (req, res) => {
    try {
        const connectorsDir = path.join(__dirname, '..', 'connectors');
        const files = fs.readdirSync(connectorsDir).filter(f => f.endsWith('.json'));

        for (const f of files) {
            const profile = JSON.parse(fs.readFileSync(path.join(connectorsDir, f), 'utf8'));
            if (profile.id === req.params.id) {
                return res.json(profile);
            }
        }

        res.status(404).json({ error: 'Connector profile not found' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load connector' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 5: SQL Server Connector
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/import/connect-sql
 * 
 * Tests a SQL Server connection and returns the table list with column info.
 * Body: { server, database, user, password, port, encrypt }
 */
router.post('/connect-sql', async (req, res) => {
    if (!sql) {
        return res.status(500).json({ error: 'SQL Server driver not available. Install mssql package.' });
    }

    const { server, database, user, password, port = 1433, encrypt = true } = req.body;

    if (!server || !database) {
        return res.status(400).json({ error: 'Server and database are required' });
    }

    let pool;
    try {
        const config = {
            user: user || undefined,
            password: password || undefined,
            server: server,
            database: database,
            port: parseInt(port) || 1433,
            options: {
                encrypt: encrypt !== false,
                trustServerCertificate: true, // For self-signed certs common in plant environments
                connectTimeout: 10000,
                requestTimeout: 15000
            }
        };

        pool = await sql.connect(config);

        // Discover all user tables with column counts
        const tableResult = await pool.request().query(`
            SELECT 
                t.TABLE_NAME as name,
                COUNT(c.COLUMN_NAME) as columnCount
            FROM INFORMATION_SCHEMA.TABLES t
            LEFT JOIN INFORMATION_SCHEMA.COLUMNS c ON t.TABLE_NAME = c.TABLE_NAME AND t.TABLE_SCHEMA = c.TABLE_SCHEMA
            WHERE t.TABLE_TYPE = 'BASE TABLE'
            AND t.TABLE_SCHEMA = 'dbo'
            GROUP BY t.TABLE_NAME
            ORDER BY t.TABLE_NAME
        `);

        // Get columns for each table
        const tables = [];
        for (const row of tableResult.recordset) {
            const colResult = await pool.request().query(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = '${row.name}' AND TABLE_SCHEMA = 'dbo'
                ORDER BY ORDINAL_POSITION
            `);
            tables.push({
                name: row.name,
                columnCount: row.columnCount,
                columns: colResult.recordset.map(c => c.COLUMN_NAME)
            });
        }

        await pool.close();

        res.json({
            success: true,
            server,
            database,
            totalTables: tables.length,
            tables
        });
    } catch (err) {
        if (pool) try { await pool.close(); } catch (e) { /* ignore */ }
        console.error('SQL connection failed:', err.message);
        res.status(500).json({ error: 'SQL connection failed: ' + err.message });
    }
});

/**
 * POST /api/import/browse-sql-table
 * 
 * Returns paginated data from a SQL Server table.
 * Body: { server, database, user, password, port, encrypt, tableName, page, limit }
 */
router.post('/browse-sql-table', async (req, res) => {
    if (!sql) {
        return res.status(500).json({ error: 'SQL Server driver not available.' });
    }

    const { server, database, user, password, port = 1433, encrypt = true, tableName, page = 1, limit = 50 } = req.body;

    if (!server || !database || !tableName) {
        return res.status(400).json({ error: 'Server, database, and tableName are required' });
    }

    let pool;
    try {
        pool = await sql.connect({
            user: user || undefined,
            password: password || undefined,
            server, database,
            port: parseInt(port) || 1433,
            options: { encrypt: encrypt !== false, trustServerCertificate: true, connectTimeout: 10000, requestTimeout: 15000 }
        });

        // Get total row count
        const countResult = await pool.request().query(
            `SELECT COUNT(*) as total FROM [${tableName}]`
        );
        const totalRows = countResult.recordset[0].total;

        // Get columns
        const colResult = await pool.request().query(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${tableName}' AND TABLE_SCHEMA = 'dbo' ORDER BY ORDINAL_POSITION`
        );
        const columns = colResult.recordset.map(c => c.COLUMN_NAME);

        // Get paginated data
        const offset = (page - 1) * limit;
        const dataResult = await pool.request().query(
            `SELECT * FROM [${tableName}] ORDER BY (SELECT NULL) OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`
        );

        await pool.close();

        res.json({
            tableName,
            columns,
            totalRows,
            page,
            limit,
            totalPages: Math.ceil(totalRows / limit),
            data: dataResult.recordset
        });
    } catch (err) {
        if (pool) try { await pool.close(); } catch (e) { /* ignore */ }
        console.error('SQL browse failed:', err.message);
        res.status(500).json({ error: 'Failed to browse SQL table: ' + err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 1: Import Execution Engine (Tasks 1.1 & 1.2)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/import/execute
 * 
 * The core import execution route. Reads data from the source (Access DB),
 * maps columns using the connector profile, applies "fullest record wins"
 * for duplicates, and auto-heals failed records from corporate_master.db.
 * 
 * Body: {
 *   filePath: string,
 *   connectorId: string (optional, for Enterprise System connectors),
 *   selectedTables: string[] (Trier table names to import),
 *   deferredTables: string[] (tables skipped for later)
 * }
 */
router.post('/execute', (req, res) => {
    try {
        const { filePath, connectorId, selectedTables, deferredTables = [] } = req.body;

        if (!filePath || !fs.existsSync(filePath)) {
            return res.status(400).json({ error: 'Source file not found' });
        }
        if (!selectedTables || selectedTables.length === 0) {
            return res.status(400).json({ error: 'No tables selected for import' });
        }

        // Load connector profile
        let profile = null;
        if (connectorId) {
            const connectorsDir = path.join(__dirname, '..', 'connectors');
            const files = fs.readdirSync(connectorsDir).filter(f => f.endsWith('.json'));
            for (const f of files) {
                const p = JSON.parse(fs.readFileSync(path.join(connectorsDir, f), 'utf8'));
                if (p.id === connectorId) { profile = p; break; }
            }
        }

        // Open the Access database (Step 1: mdb-reader, Step 2: OLEDB fallback)
        let mdb = null;
        let useOledb = false;
        let oledbPassword = req.body.oledbPassword || null;
        let oledbTableData = {};  // Pre-read OLEDB data cache

        if (MDBReader) {
            const buf = fs.readFileSync(filePath);
            try {
                mdb = new MDBReader(buf);
            } catch (err) {
                const knownPasswords = getKnownPasswords();
                for (const pwd of knownPasswords) {
                    try { mdb = new MDBReader(buf, { password: pwd }); break; } catch (e) { /* next */ }
                }
            }
        }

        if (!mdb && oledbReader) {
            useOledb = true;
            console.log(`⚡ Using OLEDB reader for import: ${path.basename(filePath)}`);
            
            // Determine which source tables we need to read
            const sourceTableNames = selectedTables.map(pt => {
                if (profile && profile.tables[pt]) return profile.tables[pt].sourceTable;
                return pt;
            });

            // Read all needed source tables in one batch call
            if (!oledbPassword) {
                const knownPasswords = getKnownPasswords();
                // Quick probe to find the right password
                const probe = oledbReader.listTables(filePath, knownPasswords);
                if (probe.success) oledbPassword = probe.usedPassword || '';
                else return res.status(403).json({ error: 'Could not open source database via OLEDB' });
            }

            try {
                const batchResult = oledbReader.readMultipleTables(filePath, sourceTableNames, oledbPassword);
                if (batchResult.success) {
                    oledbTableData = batchResult.tables || {};
                    console.log(`  📦 Pre-read ${Object.keys(oledbTableData).length} source tables via OLEDB`);
                } else {
                    return res.status(500).json({ error: 'Failed to read source tables: ' + (batchResult.error || 'Unknown') });
                }
            } catch (e) {
                return res.status(500).json({ error: 'OLEDB batch read failed: ' + e.message });
            }
        }

        if (!mdb && !useOledb) {
            return res.status(500).json({ error: 'No database reader available for this file format' });
        }

        const plantId = db.asyncLocalStorage.getStore() || 'Demo_Plant_1';
        const connection = db.getDb();

        // ── Create pre-import snapshot ──
        let dbFileName = `${plantId}.db`;
        if (plantId === 'Demo_Plant_1' && fs.existsSync(path.join(dataDir, 'Trier OS.db'))) {
            dbFileName = 'Trier OS.db';
        }
        const sourcePath = path.join(dataDir, dbFileName);
        const snapshotName = `${dbFileName}.IMPORT_SNAP_${Date.now()}`;
        const snapshotPath = path.join(dataDir, snapshotName);

        if (fs.existsSync(sourcePath)) {
            connection.pragma('wal_checkpoint(TRUNCATE)');
            fs.copyFileSync(sourcePath, snapshotPath);
            console.log(`🛡️ Pre-Import Snapshot: ${snapshotName}`);
        }

        // ── Create import session ──
        const importId = createImportSession(
            connectorId || 'access',
            filePath,
            plantId,
            req.user?.Username || 'SYSTEM',
            selectedTables,
            deferredTables,
            snapshotName
        );

        // ── Process each selected table ──
        const stats = { total: 0, inserted: 0, updated: 0, autoHealed: 0, skipped: 0 };
        const tableResults = {};

        for (const prairieTable of selectedTables) {
            const tableResult = { inserted: 0, updated: 0, skipped: 0, autoHealed: 0, errors: [] };

            try {
                // Determine source table and column mappings
                let sourceTable, columnMap;
                if (profile && profile.tables[prairieTable]) {
                    const cfg = profile.tables[prairieTable];
                    sourceTable = cfg.sourceTable;
                    columnMap = cfg.columns;
                } else {
                    // No profile — assume source table has same name
                    sourceTable = prairieTable;
                    columnMap = null;
                }

                // Check if source table exists and read data
                let sourceColumns, sourceRows;

                if (useOledb) {
                    // OLEDB path — use pre-cached data
                    const oledbData = oledbTableData[sourceTable];
                    if (!oledbData || !oledbData.success) {
                        tableResult.errors.push(`Source table "${sourceTable}" not found or unreadable via OLEDB`);
                        logImportFailure(importId, sourceTable, null, 'Source table not found (OLEDB)');
                        tableResults[prairieTable] = tableResult;
                        continue;
                    }
                    sourceColumns = oledbData.columns || [];
                    sourceRows = oledbData.rows || [];
                } else {
                    // mdb-reader path
                    const availableTables = mdb.getTableNames().filter(t => !t.startsWith('MSys'));
                    if (!availableTables.includes(sourceTable)) {
                        tableResult.errors.push(`Source table "${sourceTable}" not found in database`);
                        logImportFailure(importId, sourceTable, null, 'Source table not found');
                        tableResults[prairieTable] = tableResult;
                        continue;
                    }
                    const table = mdb.getTable(sourceTable);
                    sourceColumns = table.getColumnNames();
                    sourceRows = table.getData();
                }

                if (sourceRows.length === 0) {
                    tableResults[prairieTable] = tableResult;
                    continue;
                }

                // Check if target table exists in Trier DB
                const targetExists = connection.prepare(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
                ).get(prairieTable);

                if (!targetExists) {
                    tableResult.errors.push(`Target table "${prairieTable}" not found in plant database`);
                    logImportFailure(importId, prairieTable, null, 'Target table not found in plant DB');
                    tableResults[prairieTable] = tableResult;
                    continue;
                }

                // Get target table columns
                const targetColumnsInfo = connection.pragma(`table_info("${prairieTable}")`);
                const targetColumnNames = targetColumnsInfo.map(c => c.name);

                // Map and import each row
                const importBatch = connection.transaction((rows) => {
                    for (const sourceRow of rows) {
                        try {
                            stats.total++;
                            const mappedRow = mapRow(sourceRow, sourceColumns, columnMap, targetColumnNames, prairieTable);

                            if (!mappedRow || Object.keys(mappedRow).length === 0) {
                                stats.skipped++;
                                tableResult.skipped++;
                                continue;
                            }

                            // Check for existing record (by ID)
                            const idField = mappedRow.ID || mappedRow.id;
                            let existingRecord = null;
                            if (idField) {
                                try {
                                    existingRecord = connection.prepare(`SELECT * FROM "${prairieTable}" WHERE ID = ?`).get(idField);
                                } catch (e) { /* ID column might not exist */ }
                            }

                            if (existingRecord) {
                                // "Fullest Record Wins" strategy
                                const existingFieldCount = countPopulatedFields(existingRecord);
                                const newFieldCount = countPopulatedFields(mappedRow);

                                if (newFieldCount > existingFieldCount) {
                                    // New record is fuller — update
                                    const setClauses = Object.keys(mappedRow)
                                        .filter(k => k !== 'ID' && k !== 'id' && targetColumnNames.includes(k))
                                        .map(k => `"${k}" = ?`);
                                    const values = Object.keys(mappedRow)
                                        .filter(k => k !== 'ID' && k !== 'id' && targetColumnNames.includes(k))
                                        .map(k => mappedRow[k]);

                                    if (setClauses.length > 0) {
                                        connection.prepare(
                                            `UPDATE "${prairieTable}" SET ${setClauses.join(', ')} WHERE ID = ?`
                                        ).run(...values, idField);
                                        stats.updated++;
                                        tableResult.updated++;
                                    }
                                } else {
                                    // Existing is fuller — skip
                                    stats.skipped++;
                                    tableResult.skipped++;
                                }
                            } else {
                                // Insert new record
                                const validColumns = Object.keys(mappedRow).filter(k => targetColumnNames.includes(k));
                                const placeholders = validColumns.map(() => '?').join(', ');
                                const values = validColumns.map(k => mappedRow[k]);

                                if (validColumns.length > 0) {
                                    connection.prepare(
                                        `INSERT OR IGNORE INTO "${prairieTable}" (${validColumns.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`
                                    ).run(...values);
                                    stats.inserted++;
                                    tableResult.inserted++;
                                }
                            }
                        } catch (rowErr) {
                            // Record failed — attempt auto-heal
                            stats.skipped++;
                            tableResult.skipped++;

                            const healResult = attemptAutoHeal(prairieTable, sourceRow, columnMap);
                            if (healResult.success) {
                                stats.autoHealed++;
                                tableResult.autoHealed++;
                                stats.skipped--; // Un-skip since it was healed
                                tableResult.skipped--;
                                
                                logImportFailure(importId, sourceTable, sourceRow.ID || sourceRow.WONUM || 'unknown',
                                    rowErr.message, sourceRow, 'SUCCESS', healResult.sourcePlant);
                            } else {
                                logImportFailure(importId, sourceTable, sourceRow.ID || sourceRow.WONUM || 'unknown',
                                    rowErr.message, sourceRow, healResult.attempted ? 'NO_MATCH' : null, null);
                            }
                        }
                    }
                });

                importBatch(sourceRows);

            } catch (tableErr) {
                tableResult.errors.push(tableErr.message);
                logImportFailure(importId, prairieTable, null, `Table-level error: ${tableErr.message}`);
            }

            tableResults[prairieTable] = tableResult;
        }

        // ── Complete import session ──
        completeImportSession(importId, stats);

        // ── Post-import normalization: sync Descript→Description, ID→WorkOrderNumber ──
        // Legacy systems (MP2, PMC) use 'Descript' but the Trier UI reads 'Description'
        try {
            const connection = db.getDb();
            const normalizations = [
                { table: 'Work', pairs: [['Descript', 'Description'], ['ID', 'WorkOrderNumber']] },
                { table: 'Part', pairs: [['Descript', 'Description']] },
                { table: 'Procedures', pairs: [['Descript', 'Description']] },
                { table: 'Schedule', pairs: [['Descript', 'Description']] },
                { table: 'WorkParts', pairs: [['Descript', 'Description']] }
            ];
            for (const { table, pairs } of normalizations) {
                for (const [src, dst] of pairs) {
                    try {
                        const r = connection.prepare(
                            `UPDATE "${table}" SET "${dst}" = "${src}" WHERE "${dst}" IS NULL AND "${src}" IS NOT NULL`
                        ).run();
                        if (r.changes > 0) {
                            console.log(`  📋 Normalized ${table}.${src}→${dst}: ${r.changes} rows`);
                        }
                    } catch (normErr) { /* column may not exist — skip */ }
                }
            }
        } catch (normErr) {
            console.warn('Post-import normalization warning:', normErr.message);
        }

        logAudit(
            req.user?.Username || 'SYSTEM',
            'IMPORT_EXECUTE',
            plantId,
            { importId, source: connectorId || 'access', tables: selectedTables, stats },
            'WARNING',
            req.ip
        );

        console.log(`\n✅ IMPORT COMPLETE: ${importId}`);
        console.log(`   Tables: ${selectedTables.join(', ')}`);
        console.log(`   Inserted: ${stats.inserted} | Updated: ${stats.updated} | Healed: ${stats.autoHealed} | Skipped: ${stats.skipped}`);

        res.json({
            success: true,
            importId,
            plant: 'TrierCMMS',
            snapshotFile: snapshotName,
            stats,
            tableResults
        });

    } catch (err) {
        console.error('❌ Import execution failed:', err);
        res.status(500).json({ error: 'Import failed: ' + err.message });
    }
});

/**
 * Map a source row to Trier schema using connector profile column mappings.
 * Returns a plain object with Trier column names as keys.
 */
function mapRow(sourceRow, sourceColumns, columnMap, targetColumnNames, prairieTable) {
    const mapped = {};

    if (columnMap) {
        // Use connector profile mapping
        for (const [prairieCol, cfg] of Object.entries(columnMap)) {
            let value = null;

            // Try primary source column
            if (cfg.source && sourceRow[cfg.source] !== undefined) {
                value = sourceRow[cfg.source];
            }
            // Try fallback column
            if ((value === null || value === undefined || value === '') && cfg.fallback && sourceRow[cfg.fallback] !== undefined) {
                value = sourceRow[cfg.fallback];
            }
            // Apply default
            if ((value === null || value === undefined || value === '') && cfg.default !== undefined) {
                value = cfg.default;
            }

            // Type coercion
            if (value !== null && value !== undefined) {
                if (cfg.type === 'integer') value = parseInt(value) || null;
                else if (cfg.type === 'real') value = parseFloat(value) || null;
                else if (cfg.type === 'date' && value instanceof Date) value = value.toISOString();
                else value = String(value);
            }

            if (value !== null && value !== undefined && value !== '') {
                mapped[prairieCol] = value;
            }
        }
    } else {
        // No profile — direct column name match
        for (const col of sourceColumns) {
            if (targetColumnNames.includes(col) && sourceRow[col] !== undefined && sourceRow[col] !== null) {
                mapped[col] = sourceRow[col] instanceof Date ? sourceRow[col].toISOString() : sourceRow[col];
            }
        }
    }

    return mapped;
}

/**
 * Count non-null, non-empty fields in a record (for "fullest record wins" strategy).
 */
function countPopulatedFields(record) {
    let count = 0;
    for (const [key, value] of Object.entries(record)) {
        if (value !== null && value !== undefined && value !== '' && key !== 'ID' && key !== 'id') {
            count++;
        }
    }
    return count;
}

/**
 * Attempt to auto-heal a failed record by finding a match in corporate_master.db.
 * If found, clones the record while stripping site-specific fields.
 */
function attemptAutoHeal(prairieTable, sourceRow, columnMap) {
    try {
        // Only attempt for tables that exist in the corporate master
        const masterTables = { 'Asset': 'GlobalAssets', 'Part': 'GlobalParts', 'Vendors': 'GlobalVendors' };
        const masterTable = masterTables[prairieTable];
        if (!masterTable) return { success: false, attempted: false };

        // Try to find a match by description or ID
        const description = sourceRow.Description || sourceRow.Descript || sourceRow.EQDESC || sourceRow.INVDESC || sourceRow.VENDORNAME;
        if (!description) return { success: false, attempted: true };

        const masterMatch = logisticsDb.prepare(
            `SELECT * FROM ${masterTable} WHERE Description LIKE ? LIMIT 1`
        ).get(`%${description}%`);

        if (!masterMatch) return { success: false, attempted: true };

        // Clone the match but strip site-specific data
        const cloned = { ...masterMatch };
        delete cloned.LastSyncFromPlant;
        delete cloned.UpdatedAt;
        // Strip serial numbers, user IDs, and location data (site-specific)
        if (cloned.Serial) cloned.Serial = null;
        if (cloned.AssetTag) cloned.AssetTag = null;

        return { success: true, attempted: true, data: cloned, sourcePlant: masterMatch.LastSyncFromPlant };
    } catch (e) {
        return { success: false, attempted: true };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get known Access database passwords from SystemSettings or hardcoded fallbacks.
 * Known passwords are stored encrypted in production; here we use the discovered ones.
 */
function getKnownPasswords() {
    const passwords = [];
    try {
        const row = logisticsDb.prepare('SELECT Value FROM SystemSettings WHERE Key = ?').get('known_access_passwords');
        if (row) {
            const parsed = JSON.parse(row.Value);
            if (Array.isArray(parsed)) passwords.push(...parsed);
        }
    } catch (e) { /* ignore */ }
    
    // Fallback: known PMC passwords (discovered during initial migration)
    if (passwords.length === 0) {
        passwords.push('D3pq@76R', 'At3!1734');
    }
    
    return passwords;
}

module.exports = router;
