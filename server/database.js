// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Database Module
 * =====================================
 * Central database abstraction layer for the multi-tenant PMMS architecture.
 * Uses better-sqlite3 for synchronous, high-performance SQLite access.
 *
 * KEY DESIGN DECISIONS:
 * - Each physical plant facility has its own independent .db file (sharding).
 * - AsyncLocalStorage pins each HTTP request to its target plant DB.
 * - An in-memory connection pool caches open DB handles for performance.
 * - Path traversal is prevented via regex sanitization on plantId.
 * - The validateSort() function hardens ORDER BY against SQL injection.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { AsyncLocalStorage } = require('async_hooks');
const { validateSort } = require('./validators');

// AsyncLocalStorage stores the active plantId per-request without shared mutable state.
// The middleware in index.js calls asyncLocalStorage.run(plantId, next) so that
// any downstream call to getDb() automatically resolves to the correct plant DB.
const asyncLocalStorage = new AsyncLocalStorage();
const dataDir = require('./resolve_data_dir');

// In-memory connection pool: maps plantId -> { db, lastUsed }.
// Handles are reused across requests to avoid the overhead of opening/closing.
// A background health check prunes stale or broken connections.
const connections = {};
const CONNECTION_MAX_IDLE_MS = 30 * 60 * 1000; // 30 minutes

// Background health check: every 5 minutes, verify connections are alive
setInterval(() => {
    const now = Date.now();
    for (const [plantId, meta] of Object.entries(connections)) {
        // Skip virtual sites
        if (plantId === 'all_sites') continue;
        try {
            // Prune stale connections (idle > 30 min)
            if (now - meta.lastUsed > CONNECTION_MAX_IDLE_MS) {
                console.log(`  🧹 [Pool] Closing stale connection: ${plantId} (idle ${Math.round((now - meta.lastUsed) / 60000)}m)`);
                meta.db.close();
                delete connections[plantId];
                continue;
            }
            // Health probe — will throw if DB handle is dead
            meta.db.prepare('SELECT 1').get();
        } catch (err) {
            console.error(`  ❌ [Pool] Health check failed for ${plantId}: ${err.message}. Removing.`);
            try { meta.db.close(); } catch (_) {}
            delete connections[plantId];
        }
    }
}, 5 * 60 * 1000); // Every 5 minutes

/**
 * Validate a table name to prevent SQL injection via interpolation.
 * Only allows alphanumeric characters, underscores, and spaces.
 * Optionally verifies the table actually exists in the schema.
 */
function validateTableName(tableName, db = null) {
    if (!tableName || typeof tableName !== 'string') {
        throw new Error('Invalid table name: must be a non-empty string');
    }
    // Only allow safe characters: letters, digits, underscores, spaces
    if (!/^[a-zA-Z_][a-zA-Z0-9_ ]*$/.test(tableName)) {
        throw new Error(`Invalid table name: "${tableName}" contains unsafe characters`);
    }
    // If a DB handle is provided, verify the table actually exists
    if (db) {
        const exists = db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
        ).get(tableName);
        if (!exists) {
            throw new Error(`Table "${tableName}" does not exist`);
        }
    }
    return tableName;
}

// getDb() resolves which SQLite file to use for the current request.
// Priority: explicit param > AsyncLocalStorage context > fallback to Demo_Plant_1.
// In production, missing context is a hard error — a misconfigured route hitting
// the wrong plant's data with no indication is worse than a visible crash.
function getDb(requestedPlantId = null) {
    const contextPlantId = asyncLocalStorage.getStore();
    if (!requestedPlantId && !contextPlantId) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('[getDb] No plant context — AsyncLocalStorage not set and no explicit plantId. Check middleware ordering.');
        }
        // Development: fall back to Demo_Plant_1 for convenience (e.g. startup migrations)
    }
    let plantId = requestedPlantId || contextPlantId || 'Demo_Plant_1';

    // SECURITY: Strip any characters that could be used for path traversal (../ etc.)
    // Only alphanumeric, underscores, spaces, and hyphens survive.
    plantId = plantId.replace(/[^a-zA-Z0-9_\s-]/g, '').trim();

    if (plantId.toLowerCase() === 'all sites' || plantId.toLowerCase() === 'corporate (all sites)') {
        plantId = 'all_sites';
    }

    if (!connections[plantId]) {
        let dbFileName = `${plantId}.db`;
        const dbPath = path.join(dataDir, dbFileName);
        let isNew = !fs.existsSync(dbPath);
        let savedLeaders = []; // hoisted so restore block below can access it without global
        if (!isNew) {
            const size = fs.statSync(dbPath).size;
            // Corrupt-DB threshold: legitimate plant DBs are bootstrapped from
            // schema_template.db (~19MB), so a fresh copy is always >> 32KB.
            // We compute the floor dynamically so the check stays correct if
            // the template ever shrinks: cap at 32KB but never exceed half the
            // template size (a valid fresh copy must be at least that large).
            let _corruptThreshold = 32768;
            try {
                const tmplSize = fs.statSync(path.join(dataDir, 'schema_template.db')).size;
                if (tmplSize > 0) _corruptThreshold = Math.min(32768, Math.floor(tmplSize / 2));
            } catch (_) { /* template missing — keep 32KB default */ }
            if (size < _corruptThreshold) { // only catch truly truncated/corrupt DBs
                console.log(`  📂 Site DB [${plantId}] is too small (${size} bytes). Forcing repair...`);
                // SAFEGUARD: Preserve SiteLeadership contacts before wiping
                try {
                    const oldDb = new Database(dbPath, { readonly: true });
                    const hasTable = oldDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='SiteLeadership'").get();
                    if (hasTable) {
                        savedLeaders = oldDb.prepare('SELECT Name, Title, Phone, Email FROM SiteLeadership').all();
                        if (savedLeaders.length > 0) {
                            console.log(`  💾 Preserved ${savedLeaders.length} contacts for ${plantId} before repair`);
                        }
                    }
                    oldDb.close();
                } catch (e) { /* DB may be too corrupt to read — that's OK */ }

                try {
                    fs.unlinkSync(dbPath);
                    isNew = true;
                } catch (e) {
                    console.error(`  ❌ Failed to remove corrupted DB [${plantId}]:`, e.message);
                }
            }
        } else {
            console.log(`  📂 Site DB [${plantId}] is new. Initializing...`);
        }

        // If it's a new plant, copy the existing DB as a schema template
        // VIRTUAL SITES: Never create a physical DB for all_sites
        if (plantId === 'all_sites') {
            const tempPath = fs.existsSync(path.join(dataDir, 'schema_template.db'))
                ? path.join(dataDir, 'schema_template.db')
                : path.join(dataDir, 'Demo_Plant_1.db'); // Fallback if schema doesn't exist yet
            const db = new Database(tempPath, { readonly: true });
            connections[plantId] = { db, lastUsed: Date.now() };
            return db;
        }

        if (isNew) {
            const templatePath = path.join(dataDir, 'schema_template.db');
            if (fs.existsSync(templatePath) && fs.statSync(templatePath).size > 0) {
                console.log(`  🌱 Bootstrapping [${plantId}] from master schema template...`);
                fs.copyFileSync(templatePath, dbPath);
            } else {
                // Absolute fallback to Demo_Plant_1 if master template is missing
                const masterPath = path.join(dataDir, 'Demo_Plant_1.db');
                console.log(`  ⚠️ Master schema template missing. Falling back to Demo_Plant_1 baseline for [${plantId}]...`);
                fs.copyFileSync(masterPath, dbPath);
            }
        }

        const db = new Database(dbPath, { verbose: process.env.NODE_ENV === 'development' ? console.log : null });
        // WAL (Write-Ahead Logging) allows concurrent reads during writes — critical
        // for a multi-user maintenance system where technicians hit the DB simultaneously.
        db.pragma('journal_mode = WAL');
        db.pragma('busy_timeout = 5000'); // Wait up to 5s on lock contention instead of throwing immediately
        db.pragma('wal_autocheckpoint = 200'); // Checkpoint every 200 pages instead of default 1000 — keeps WAL file small under sustained E2E load
        // Enforce referential integrity between tables (e.g., WorkParts -> Part)
        db.pragma('foreign_keys = ON');

        // ── Performance Indexes ─────────────────────────────────────────────
        // Created once per connection (IF NOT EXISTS = idempotent).
        // Covers the highest-frequency filter columns used in corporate rollup
        // and per-plant analytics queries. Matches the logistics_db.js pattern.
        try {
            db.exec(`
                CREATE INDEX IF NOT EXISTS idx_work_status    ON Work(Status);
                CREATE INDEX IF NOT EXISTS idx_work_statusid  ON Work(StatusID);
                CREATE INDEX IF NOT EXISTS idx_work_typeid    ON Work(TypeID);
                CREATE INDEX IF NOT EXISTS idx_work_schdate   ON Work(SchDate);
                CREATE INDEX IF NOT EXISTS idx_work_compdate  ON Work(CompDate);
                CREATE INDEX IF NOT EXISTS idx_part_stock     ON Part(Stock, OrdPoint);
                CREATE INDEX IF NOT EXISTS idx_asset_type     ON Asset(AssetType);
            `);
        } catch (_) { /* tables may not exist on non-plant DBs — safe to skip */ }

        // Ensure SiteLeadership table exists
        db.prepare(`
            CREATE TABLE IF NOT EXISTS SiteLeadership (
                ID INTEGER PRIMARY KEY AUTOINCREMENT,
                Name TEXT,
                Title TEXT,
                Phone TEXT,
                Email TEXT
            )
        `).run();

        // Ensure ChatProfile table exists for chat users
        db.prepare(`
            CREATE TABLE IF NOT EXISTS ChatProfile (
                ID INTEGER PRIMARY KEY AUTOINCREMENT,
                FirstName TEXT,
                LastName TEXT,
                Email TEXT UNIQUE,
                Phone TEXT,
                PlantId TEXT,
                Department TEXT,
                PasswordHash TEXT,
                CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `).run();

        // Ensure Users table exists for lookup/assignment management
        db.prepare(`
            CREATE TABLE IF NOT EXISTS Users (
                ID TEXT PRIMARY KEY,
                Description TEXT
            )
        `).run();

        // Ensure Utilities table exists
        db.prepare(`
            CREATE TABLE IF NOT EXISTS Utilities (
                ID INTEGER PRIMARY KEY AUTOINCREMENT,
                Type TEXT, -- Water, Electricity, Gas
                SupplierName TEXT,
                SupplierAddress TEXT,
                SupplierCity TEXT,
                SupplierState TEXT,
                SupplierZip TEXT,
                MeterReading REAL,
                CostPerUnit REAL,
                BillAmount REAL,
                ReadingDate DATETIME DEFAULT CURRENT_TIMESTAMP,
                Notes TEXT
            )
        `).run();

        // Ensure UtilityThresholds table exists (configurable alert thresholds per type)
        db.prepare(`
            CREATE TABLE IF NOT EXISTS UtilityThresholds (
                ID INTEGER PRIMARY KEY AUTOINCREMENT,
                Type TEXT UNIQUE NOT NULL,
                PercentIncreaseAlert REAL DEFAULT 25.0,
                BaselineWindowDays INTEGER DEFAULT 7,
                AbsoluteMaxReading REAL,
                Active INTEGER DEFAULT 1,
                UpdatedAt TEXT DEFAULT (datetime('now'))
            )
        `).run();

        // Ensure UtilityAnomalies table exists (persisted anomaly log)
        db.prepare(`
            CREATE TABLE IF NOT EXISTS UtilityAnomalies (
                ID INTEGER PRIMARY KEY AUTOINCREMENT,
                Type TEXT NOT NULL,
                AnomalyType TEXT NOT NULL,
                Severity TEXT NOT NULL,
                MeterReading REAL,
                ThresholdValue REAL,
                PercentageOver REAL,
                Message TEXT,
                DetectedAt TEXT DEFAULT (datetime('now')),
                AcknowledgedAt TEXT,
                AcknowledgedBy TEXT
            )
        `).run();

        // ── Scan State Machine Schema ────────────────────────────────────────
        // Tables and columns required by the POST /api/scan endpoint and the
        // WO lifecycle state machine defined in SCAN_STATE_MACHINE_SCHEMA_DELTA.md.
        // All additions are idempotent (IF NOT EXISTS / column existence check).
        // Wrapped in try/catch so non-plant DBs (no Work table) are skipped silently.
        try {
            // New columns on Work table — added only if absent to avoid re-run errors.
            // Each column maps directly to a field in the schema delta Section 1.
            const workCols = new Set(db.prepare('PRAGMA table_info(Work)').all().map(c => c.name));
            const scanWorkCols = [
                ['holdReason',           'TEXT'],                 // Hold reason code (exempt vs timeout-eligible)
                ['needsReview',          'INTEGER DEFAULT 0'],    // 1 = flagged for supervisor review
                ['reviewReason',         'TEXT'],                 // AUTO_TIMEOUT | OFFLINE_CONFLICT
                ['reviewStatus',         'TEXT'],                 // FLAGGED | ACKNOWLEDGED_BY_FIELD | RESOLVED_BY_FIELD | DISMISSED
                ['acknowledgedByUserId', 'TEXT'],                 // Tech who acknowledged on-device
                ['acknowledgedAt',       'TEXT'],                 // Server timestamp of acknowledgement
                ['returnAt',             'TEXT'],                 // SCHEDULED_RETURN target timestamp
                ['scheduledByUserId',    'TEXT'],                 // Who set the scheduled return
                ['scheduledAt',          'TEXT'],                 // When the scheduled return was set
                ['relatedOpenWoId',      'TEXT'],                 // FK → Work.ID (parallel open WO)
                ['relationshipType',     'TEXT'],                 // PARALLEL_OPEN_WHILE_WAITING
                ['closeMode',            'TEXT'],                 // SELF_ONLY | TEAM_CLOSE | LAST_ACTIVE_CLOSE
                ['closedByUserId',       'TEXT'],                 // User who performed the WO close
            ];
            for (const [col, type] of scanWorkCols) {
                if (!workCols.has(col)) {
                    db.prepare(`ALTER TABLE Work ADD COLUMN "${col}" ${type}`).run();
                }
            }

            // New WorkStatuses rows for scan state machine states.
            // WorkStatuses.ID is not a PRIMARY KEY, so existence-check before insert
            // to prevent duplicates on repeated connections.
            const wsIds = new Set(db.prepare('SELECT ID FROM WorkStatuses').all().map(r => r.ID));
            if (!wsIds.has(33)) db.prepare(`INSERT INTO WorkStatuses (ID, Description) VALUES (33, 'Escalated')`).run();
            if (!wsIds.has(35)) db.prepare(`INSERT INTO WorkStatuses (ID, Description) VALUES (35, 'On Hold')`).run();

            // WorkSegments — first-class labor time record per technician per WO.
            // One segment = one contiguous block of active work by one user.
            // Ownership (userId) is immutable after creation; use endedByUserId for team-close.
            db.prepare(`
                CREATE TABLE IF NOT EXISTS WorkSegments (
                    segmentId           TEXT PRIMARY KEY,          -- UUID, client-generated
                    woId                TEXT NOT NULL,             -- FK → Work.ID
                    userId              TEXT NOT NULL,             -- Owning technician (never mutated)
                    startTime           TEXT NOT NULL,             -- serverTimestamp at open
                    endTime             TEXT,                      -- serverTimestamp at close; NULL while active
                    segmentState        TEXT NOT NULL DEFAULT 'Active', -- Active | Ended | ReviewNeeded
                    segmentReason       TEXT,                      -- TAKEOVER | JOIN | RESUME | AUTO_TIMEOUT | null
                    holdReason          TEXT,                      -- mirrors WO holdReason at segment end
                    endedByUserId       TEXT,                      -- may differ from userId on team-close
                    origin              TEXT NOT NULL DEFAULT 'SCAN', -- SCAN | OFFLINE_SYNC
                    conflictAutoResolved INTEGER NOT NULL DEFAULT 0   -- 1 if Auto-Join applied on offline sync
                )
            `).run();
            db.prepare(`CREATE INDEX IF NOT EXISTS idx_segments_wo    ON WorkSegments(woId)`).run();
            db.prepare(`CREATE INDEX IF NOT EXISTS idx_segments_user  ON WorkSegments(userId)`).run();
            db.prepare(`CREATE INDEX IF NOT EXISTS idx_segments_state ON WorkSegments(segmentState)`).run();

            // ScanAuditLog — immutable append-only record of every scan event.
            // No UPDATE or DELETE path. Feeds the Explainable Operations Engine
            // and provides the full causality chain for any WO state change.
            db.prepare(`
                CREATE TABLE IF NOT EXISTS ScanAuditLog (
                    auditEventId        TEXT PRIMARY KEY,          -- UUID, server-generated
                    scanId              TEXT NOT NULL,             -- Client UUID; used for idempotency
                    woId                TEXT,                      -- NULL if scan rejected before WO resolution
                    assetId             TEXT NOT NULL,             -- Asset that was scanned
                    userId              TEXT NOT NULL,             -- Scanning user
                    previousState       TEXT,                      -- WO StatusID before scan; NULL if no WO
                    nextState           TEXT,                      -- WO StatusID after scan; NULL if rejected
                    decisionBranch      TEXT NOT NULL,             -- Formal Decision Branch enum value
                    deviceTimestamp     TEXT NOT NULL,             -- Device clock time (stored as-is)
                    serverTimestamp     TEXT NOT NULL,             -- Authoritative server receipt time
                    offlineCaptured     INTEGER NOT NULL DEFAULT 0, -- 1 if synced from offline queue
                    conflictAutoResolved INTEGER NOT NULL DEFAULT 0, -- 1 if Auto-Join applied
                    resolvedMode        TEXT                        -- AUTO_JOIN | NULL
                )
            `).run();
            db.prepare(`CREATE INDEX IF NOT EXISTS idx_scanaudit_scanid ON ScanAuditLog(scanId)`).run();
            db.prepare(`CREATE INDEX IF NOT EXISTS idx_scanaudit_asset  ON ScanAuditLog(assetId)`).run();
            db.prepare(`CREATE INDEX IF NOT EXISTS idx_scanaudit_wo     ON ScanAuditLog(woId)`).run();
            db.prepare(`CREATE INDEX IF NOT EXISTS idx_scanaudit_user   ON ScanAuditLog(userId)`).run();

            // WOCloseParticipants — child table tracking all users and segments
            // active at the moment of a WO close. Replaces any serialized closedSegmentIds
            // field on the Work table. Each row = one user/segment pair in the close event.
            db.prepare(`
                CREATE TABLE IF NOT EXISTS WOCloseParticipants (
                    closeEventId        TEXT NOT NULL,             -- Groups participants from one close action
                    woId                TEXT NOT NULL,             -- FK → Work.ID
                    userId              TEXT NOT NULL,             -- User whose segment was closed
                    segmentId           TEXT NOT NULL,             -- FK → WorkSegments.segmentId
                    closedByUserId      TEXT NOT NULL,             -- User who initiated the close
                    closeMode           TEXT NOT NULL,             -- SELF_ONLY | TEAM_CLOSE | LAST_ACTIVE_CLOSE
                    serverTimestamp     TEXT NOT NULL,
                    PRIMARY KEY (closeEventId, segmentId)
                )
            `).run();
            db.prepare(`CREATE INDEX IF NOT EXISTS idx_woclosep_wo ON WOCloseParticipants(woId)`).run();

            // PlantScanConfig — per-plant configuration for the scan state machine.
            // Governs auto-review thresholds and SCHEDULED_RETURN offset resolution.
            // One row per plant (plantId is the PK). Defaults are safe baselines only —
            // must be reviewed and overridden before go-live at each plant.
            db.prepare(`
                CREATE TABLE IF NOT EXISTS PlantScanConfig (
                    plantId                     TEXT PRIMARY KEY,
                    shiftLengthHours            INTEGER DEFAULT 8,
                    shiftChangeoverMinutes      INTEGER DEFAULT 30,
                    autoReviewThresholdHours    INTEGER DEFAULT 12,   -- Hours before needsReview flag on timeout-eligible WOs
                    returnOffset_laterThisShift INTEGER,              -- NULL = derive from shiftLengthHours / 2
                    returnOffset_nextShift      INTEGER,              -- NULL = derive from shiftLength + changeover
                    returnOffset_tomorrow       INTEGER DEFAULT 24,
                    updatedAt                   TEXT DEFAULT (datetime('now'))
                )
            `).run();

            // OfflineScanQueue — stores scan events captured while the device had no
            // connectivity. Synced to POST /api/scan when connection is restored.
            // scanId idempotency ensures replay safety — the same event can sync multiple
            // times without producing duplicate state transitions.
            db.prepare(`
                CREATE TABLE IF NOT EXISTS OfflineScanQueue (
                    queueId         TEXT PRIMARY KEY,              -- UUID, client-generated
                    scanId          TEXT NOT NULL UNIQUE,          -- Matches the scan payload scanId
                    assetId         TEXT NOT NULL,
                    userId          TEXT NOT NULL,
                    deviceTimestamp TEXT NOT NULL,
                    userAction      TEXT,                          -- Action user selected (if prompt was shown offline)
                    payload         TEXT NOT NULL,                 -- Full JSON scan payload
                    queuedAt        TEXT NOT NULL,                 -- Client timestamp when queued
                    syncedAt        TEXT,                          -- Server timestamp when processed; NULL = pending
                    syncStatus      TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | SYNCED | FAILED
                    failReason      TEXT                           -- Error message if syncStatus = FAILED
                )
            `).run();
            db.prepare(`CREATE INDEX IF NOT EXISTS idx_offlineq_status ON OfflineScanQueue(syncStatus)`).run();

        } catch (_) { /* Non-plant DBs lack a Work table — schema additions safely skipped */ }

        // Bootstrap SiteLeadership if empty
        const count = db.prepare('SELECT COUNT(*) as count FROM SiteLeadership').get().count;
        if (count === 0) {
            try {
                let seeded = false;
                const managersPath = path.join(__dirname, '..', 'extracted_managers.json');

                if (fs.existsSync(managersPath)) {
                    const allManagers = JSON.parse(fs.readFileSync(managersPath, 'utf8'));
                    const plantManagers = allManagers[plantId];

                    if (plantManagers && plantManagers.length > 0) {
                        const insert = db.prepare('INSERT INTO SiteLeadership (Name, Title, Phone, Email) VALUES (?, ?, ?, ?)');

                        // Sort by priority similar to the script
                        const sorted = plantManagers.sort((a, b) => {
                            const getScore = (role) => {
                                const r = role.toLowerCase();
                                if (r.includes('general manager')) return 1;
                                if (r.includes('plant manager')) return 2;
                                if (r.includes('maintenance manager')) return 3;
                                if (r.includes('branch manager')) return 4;
                                if (r.includes('maintenance supervisor')) return 5;
                                return 10;
                            };
                            return getScore(a.Role) - getScore(b.Role);
                        }).slice(0, 4);

                        for (const c of sorted) {
                            insert.run(c.Name, c.Role, c.Phone, c.Email);
                        }
                        seeded = true;
                        console.log(`[BOOTSTRAP] Seeded ${sorted.length} contacts from MooMap for ${plantId}`);
                    }
                }

                if (!seeded) {
                    // Fallback to Vendors table if no MooMap data
                    // First check if Vendors table exists and has the right columns
                    const hasVendors = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='Vendors'").get();
                    if (hasVendors) {
                        // Detect email column name (StandardEmail vs Email)
                        const cols = db.prepare("PRAGMA table_info(Vendors)").all().map(c => c.name);
                        const emailCol = cols.includes('StandardEmail') ? 'StandardEmail' : 
                                         cols.includes('Email') ? 'Email' : null;
                        
                        if (emailCol) {
                            const roles = [
                                { title: 'PLANT MANAGER', pattern: '%PLANT%MANAGER%' },
                                { title: 'GENERAL MANAGER', pattern: '%GENERAL%MANAGER%' },
                                { title: 'MAINTENANCE MANAGER', pattern: '%MAINTENANCE%MANAGER%' },
                                { title: 'MAINTENANCE SUPERVISOR', pattern: '%MAINTENANCE%SUPERVISOR%' }
                            ];

                            const insert = db.prepare('INSERT INTO SiteLeadership (Name, Title, Phone, Email) VALUES (?, ?, ?, ?)');

                            for (const r of roles) {
                                const found = db.prepare(`
                                    SELECT Description as Name, Title, Phone as Phone, "${emailCol}" as Email 
                                    FROM Vendors 
                                    WHERE Employee = 1 AND Title LIKE ?
                                    LIMIT 1
                                `).get(r.pattern);

                                if (found) {
                                    insert.run(found.Name, found.Title, found.Phone, found.Email);
                                }
                            }

                            // Generic fallback
                            const finalCount = db.prepare('SELECT COUNT(*) as count FROM SiteLeadership').get().count;
                            if (finalCount === 0) {
                                const fallback = db.prepare(`
                                    SELECT Description as Name, Title, Phone as Phone, "${emailCol}" as Email 
                                    FROM Vendors 
                                    WHERE Employee = 1 AND (
                                        Title LIKE '%MANAGER%' OR 
                                        Title LIKE '%SUPERVISOR%' OR 
                                        Title LIKE '%LEAD%'
                                    )
                                    LIMIT 3
                                `).all();
                                for (const l of fallback) {
                                    insert.run(l.Name, l.Title, l.Phone, l.Email);
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                console.error(`Error bootstrapping site leadership for ${plantId}:`, err);
            }
        }

        // Clear operational data for new plant DBs so they start as a "blank slate"
        if (isNew) {
            try {
                const tablesToClear = [
                    'Work', 'WorkLabor', 'WorkParts', 'WorkMisc', 'WorkNote', 'WorkCost', 'WorkUsr',
                    'Asset', 'AssetNote',
                    'Part', 'PartAdj', 'PartBin', 'PartVend', 'PartLoc',
                    'Procedures', 'ProcedureTasks', 'ProcedureParts', 'ProcUsr', 'ProcTool', 'ProcObj',
                    'Schedule', 'Task', 'TaskStep',
                    'AuditLog', 'zErrLog', 'Users'
                ];
                const clearTx = db.transaction(() => {
                    for (const table of tablesToClear) {
                        try {
                            db.prepare(`DELETE FROM "${table}"`).run();
 /* dynamic col/table - sanitize inputs */
                        } catch (e) { /* ignore if table missing */ }
                    }
                });
                clearTx();

                // Inject Standard Lookup Data
                const seedStandards = db.transaction(() => {
                    const classes = [
                        ['ELECTRICAL', 'Electrical Components & Controls'],
                        ['MECHANICAL', 'Mechanical Components & Drives'],
                        ['PNEUMATIC', 'Pneumatic Valves, Cylinders, & Fittings'],
                        ['FLUID', 'Fluid Handling & Hydraulics'],
                        ['HARDWARE', 'Hardware & Fasteners'],
                        ['BEARINGS', 'Bearings & Bushings'],
                        ['SEALS', 'Gaskets, Seals & O-Rings'],
                        ['SAFETY', 'Safety Equipment & PPE'],
                        ['MOTORS', 'Motors & Gearboxes'],
                        ['LUBRICANTS', 'Oils, Greases & Chemicals'],
                        ['TOOLS', 'Consumable Tools'],
                        ['FILTERS', 'Filtration Components'],
                        ['NONE', 'No Category Assigned']
                    ];
                    const delClass = db.prepare('DELETE FROM PartClasses WHERE ID = ?');
                    const insClass = db.prepare('INSERT INTO PartClasses (ID, Description) VALUES (?, ?)');
                    classes.forEach(c => { delClass.run(c[0]); insClass.run(c[0], c[1]); });

                    const types = [
                        ['PRODUCTION', 'Processing & Manufacturing Equipment'],
                        ['PACKAGING', 'Packaging, Filling & Labeling'],
                        ['FACILITY', 'Facility Systems (HVAC, Lighting)'],
                        ['UTILITY', 'Utility Systems (Steam, Air, Water Utilities)'],
                        ['LOGISTICS', 'Warehouse & Forklifts'],
                        ['FLEET', 'Transport Vehicles & Fleet'],
                        ['SAFETY', 'Safety & Environmental Systems'],
                        ['LAB', 'Laboratory & QC Equipment'],
                        ['IT', 'Information Technology / Office']
                    ];
                    const delType = db.prepare('DELETE FROM AssetTypes WHERE ID = ?');
                    const insType = db.prepare('INSERT INTO AssetTypes (ID, Description) VALUES (?, ?)');
                    types.forEach(t => { delType.run(t[0]); insType.run(t[0], t[1]); });

                    const workTypes = [
                        ['PM', 'Preventative Maintenance'],
                        ['CORRECTIVE', 'Corrective Repair'],
                        ['EMERGENCY', 'Emergency Breakdown'],
                        ['PROJECT', 'Project / Capital Work'],
                        ['SAFETY', 'Safety / Regulatory Inspection'],
                        ['FSP', 'Food Safety Program']
                    ];
                    const delWT = db.prepare('DELETE FROM WorkType WHERE ID = ?');
                    const insWT = db.prepare('INSERT INTO WorkType (ID, Description) VALUES (?, ?)');
                    workTypes.forEach(wt => { delWT.run(wt[0]); insWT.run(wt[0], wt[1]); });
                });
                seedStandards();

                console.log(`  🌱 Initialized deep blank slate and seeded standards for new plant: ${plantId}`);
            } catch (err) {
                console.error('Failed to clear template data or seed standards for new plant:', err);
            }
        }

        connections[plantId] = { db, lastUsed: Date.now() };
        console.log(`  📦 Database connected for plant [${plantId}]: ${dbFileName}`);

        // RESTORE: If contacts were saved before a repair, write them into the new DB now
        if (savedLeaders.length > 0) {
            try {
                db.prepare('DELETE FROM SiteLeadership').run();
                const ins = db.prepare('INSERT INTO SiteLeadership (Name, Title, Phone, Email) VALUES (?, ?, ?, ?)');
                const restoreTx = db.transaction(() => {
                    for (const l of savedLeaders) ins.run(l.Name, l.Title, l.Phone, l.Email);
                });
                restoreTx();
                console.log(`  ♻️ Restored ${savedLeaders.length} preserved contacts for ${plantId}`);
            } catch (e) {
                console.error(`  ❌ Failed to restore contacts for ${plantId}:`, e.message);
            }
        }
    }
    connections[plantId].lastUsed = Date.now();
    return connections[plantId].db;
}

/**
 * Get all rows from a query
 */
function queryAll(sql, params = []) {
    return getDb().prepare(sql).all(...(Array.isArray(params) ? params : [params]));
}

/**
 * Get a single row
 */
function queryOne(sql, params = []) {
    return getDb().prepare(sql).get(...(Array.isArray(params) ? params : [params]));
}

/**
 * Run a mutation (INSERT, UPDATE, DELETE)
 */
function run(sql, params = []) {
    return getDb().prepare(sql).run(...(Array.isArray(params) ? params : [params]));
}

/**
 * Get table info (column names, types)
 */
function getTableInfo(tableName) {
    const safeName = validateTableName(tableName);
    return getDb().prepare(`PRAGMA table_info("${safeName}")`).all();
}

/**
 * Get all user table names
 */
function getTableNames() {
    return getDb()
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .all()
        .map(r => r.name);
}

/**
 * Get row count for a table
 */
function getRowCount(tableName) {
    const safeName = validateTableName(tableName);
    const result = getDb().prepare(`SELECT COUNT(*) as count FROM "${safeName}"`).get();
    return result.count;
}

/**
 * Paginated query helper
 */
// Paginated query helper with SQL injection hardening.
// The orderBy column is validated against a whitelist (via validateSort) to prevent
// ORDER BY injection — a vulnerability discovered during the 2026 penetration test.
function queryPaginated(tableName, { page = 1, limit = 50, orderBy = null, order = 'ASC', where = '', params = [] } = {}) {
    const safeName = validateTableName(tableName);
    const offset = (page - 1) * limit;

    let countSql = `SELECT COUNT(*) as total FROM "${safeName}"`;
    let dataSql = `SELECT * FROM "${safeName}"`;

    if (where) {
        countSql += ` WHERE ${where}`;
        dataSql += ` WHERE ${where}`;
    }

    if (orderBy) {
        // Map table names to validator types
        const typeMap = {
            'Work': 'work',
            'Asset': 'asset',
            'Part': 'part'
        };
        const safeOrder = order === 'DESC' ? 'DESC' : 'ASC';
        const safeColumn = validateSort(orderBy, typeMap[tableName] || tableName);
        dataSql += ` ORDER BY "${safeColumn}" ${safeOrder}`;
    }

    dataSql += ` LIMIT ? OFFSET ?`;

    const total = getDb().prepare(countSql).get(...params).total;
    const data = getDb().prepare(dataSql).all(...params, limit, offset);

    return {
        data,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasNext: page * limit < total,
            hasPrev: page > 1,
        }
    };
}

/**
 * Search across text columns of a table
 */
function searchTable(tableName, searchTerm, textColumns) {
    const safeName = validateTableName(tableName);
    if (!searchTerm || !textColumns.length) return [];

    // Validate column names against actual table schema to prevent SQL injection
    const tableInfo = getDb().prepare(`PRAGMA table_info("${safeName}")`).all();
    const validColumns = new Set(tableInfo.map(c => c.name));
    const safeColumns = textColumns.filter(col => validColumns.has(col));
    if (!safeColumns.length) return [];

    const conditions = safeColumns.map(col => `"${col}" LIKE ?`).join(' OR ');
    const params = safeColumns.map(() => `%${searchTerm}%`);

    return getDb()
        .prepare(`SELECT * FROM "${safeName}" WHERE ${conditions} LIMIT 100`)
        .all(...params);
}

/**
 * Close all database connections in the pool
 */
function close() {
    Object.keys(connections).forEach(plantId => {
        if (connections[plantId]) {
            try { connections[plantId].db.close(); } catch (_) {}
            delete connections[plantId];
        }
    });
    console.log('  📦 All database connections in pool closed');
}

module.exports = {
    getDb,
    queryAll,
    queryOne,
    run,
    getTableInfo,
    getTableNames,
    getRowCount,
    queryPaginated,
    searchTable,
    validateTableName,
    close,
    asyncLocalStorage
};
