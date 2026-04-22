// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Logistics Database Module
 * ==================================================
 * Initializes and manages the trier_logistics.db — the cross-site
 * logistics database used for enterprise-wide analytics, part transfers,
 * audit logging, and global search indexing.
 *
 * Tables managed:
 *   - GlobalAssets: Aggregated asset metrics from all plants
 *   - GlobalParts: Cross-plant part pricing and availability
 *   - PartTransfers: Inter-plant part transfer requests
 *   - AuditLog: System-wide audit trail for security events
 *   - BackupUsers: Authorized backup operators list
 *   - webhook_config: Slack/Teams webhook integrations
 *
 * This DB is separate from plant-specific databases to avoid
 * multi-tenant conflicts and to enable corporate-level queries.
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = require('./resolve_data_dir');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'trier_logistics.db');
const db = new Database(dbPath, { fileMustExist: false });

// Initialize strict WAL mode for concurrency
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000'); // Wait up to 5s on lock contention instead of throwing immediately
db.pragma('wal_autocheckpoint = 200'); // Checkpoint every 200 pages instead of default 1000 — keeps WAL file small under sustained E2E load

// ── Define Cross-Plant Logistics State Machine Ledger ─────────────────────────
console.log('📦 Verifying trier_logistics.db ledger integrity...');

db.exec(`
    CREATE TABLE IF NOT EXISTS Transfers (
        ID INTEGER PRIMARY KEY AUTOINCREMENT,
        RequestingPlant TEXT NOT NULL,
        FulfillingPlant TEXT NOT NULL,
        PartID TEXT NOT NULL,
        Quantity INTEGER NOT NULL,
        Status TEXT DEFAULT 'PENDING' CHECK (Status IN ('PENDING', 'SHIPPED', 'RECEIVED', 'REJECTED')),
        RequestBy TEXT NOT NULL,
        FulfillBy TEXT,
        ReqDate DATETIME DEFAULT CURRENT_TIMESTAMP,
        ShippedDate DATETIME,
        ReceivedDate DATETIME,
        TrackingNumber TEXT,
        Notes TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_transfers_req_plant ON Transfers(RequestingPlant);
    CREATE INDEX IF NOT EXISTS idx_transfers_ful_plant ON Transfers(FulfillingPlant);
    CREATE INDEX IF NOT EXISTS idx_transfers_status ON Transfers(Status);

    CREATE TABLE IF NOT EXISTS AuditLog (
        ID INTEGER PRIMARY KEY AUTOINCREMENT,
        Timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        UserID TEXT NOT NULL,
        Action TEXT NOT NULL,
        PlantID TEXT,
        Details TEXT,
        IPAddress TEXT,
        Severity TEXT DEFAULT 'INFO' CHECK (Severity IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL'))
    );

    CREATE INDEX IF NOT EXISTS idx_audit_user ON AuditLog(UserID);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON AuditLog(Action);
    CREATE INDEX IF NOT EXISTS idx_audit_plant ON AuditLog(PlantID);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON AuditLog(Timestamp);

    CREATE TABLE IF NOT EXISTS IgnoredPriceAlerts (
        PlantID TEXT,
        PartID TEXT,
        UserID TEXT,
        CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (PlantID, PartID)
    );

    CREATE TABLE IF NOT EXISTS SystemSettings (
        Key TEXT PRIMARY KEY,
        Value TEXT,
        UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS GlobalVendors (
        ID TEXT PRIMARY KEY,
        Name TEXT,
        Address TEXT,
        City TEXT,
        State TEXT,
        Zip TEXT,
        Phone TEXT,
        Email TEXT,
        Website TEXT,
        LastSyncFromPlant TEXT,
        UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS GlobalAssets (
        ID TEXT,
        Description TEXT,
        Model TEXT,
        Manufacturer TEXT,
        AssetType TEXT,
        UsefulLife INTEGER,
        AssetTag TEXT,
        InstallDate DATETIME,
        CumulativeDowntime REAL DEFAULT 0,
        TotalLaborHours REAL DEFAULT 0,
        FailureCount INTEGER DEFAULT 0,
        LastSyncFromPlant TEXT,
        UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (ID, LastSyncFromPlant)
    );

    CREATE TABLE IF NOT EXISTS GlobalParts (
        ID TEXT PRIMARY KEY,
        Description TEXT,
        UnitCost REAL,
        ClassID TEXT,
        AvgUnitCost REAL,
        CheapestPrice REAL,
        CheapestPlant TEXT,
        TotalEnterpriseUsage INTEGER DEFAULT 0,
        LastSyncFromPlant TEXT,
        UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS GlobalSOPs (
        ID TEXT PRIMARY KEY,
        Description TEXT,
        TasksJSON TEXT, -- Store the array of steps/tasks as JSON
        LastSyncFromPlant TEXT,
        UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS SiteCodes (
        PlantID TEXT PRIMARY KEY,
        InviteCode TEXT UNIQUE NOT NULL,
        CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        CreatedBy TEXT
    );

    CREATE TABLE IF NOT EXISTS pay_scales (
        ID INTEGER PRIMARY KEY AUTOINCREMENT,
        PlantID TEXT NOT NULL,
        Classification TEXT NOT NULL,
        HourlyRate REAL DEFAULT 0,
        Headcount INTEGER DEFAULT 0,
        IsSalary INTEGER DEFAULT 0,
        SalaryRate REAL DEFAULT 0,
        PayFrequency TEXT,
        EmployeeRef TEXT,
        UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ═══════════════════════════════════════════════════════════════════════════
    
    -- Single-use invite codes for secure onboarding
    CREATE TABLE IF NOT EXISTS InviteCodes (
        ID INTEGER PRIMARY KEY AUTOINCREMENT,
        Code TEXT UNIQUE NOT NULL,
        PlantID TEXT,
        Status TEXT DEFAULT 'available' CHECK (Status IN ('available', 'used', 'revoked')),
        CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        CreatedBy TEXT,
        UsedAt DATETIME,
        UsedBy TEXT,
        RegisteredUsername TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_invite_code ON InviteCodes(Code);
    CREATE INDEX IF NOT EXISTS idx_invite_status ON InviteCodes(Status);

    -- PRAIRIE DATA BRIDGE — Import History & Failure Tracking
    -- ═══════════════════════════════════════════════════════════════════════════

    CREATE TABLE IF NOT EXISTS Import_Log (
        ImportID TEXT PRIMARY KEY,
        Timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        SourceSystem TEXT NOT NULL,           -- 'PMC', 'MP2', 'Express', 'PSI', 'Access', 'SQL', 'API', 'CSV'
        SourcePath TEXT,                      -- File path or connection string (sanitized)
        TargetPlant TEXT NOT NULL,
        ImportedBy TEXT NOT NULL,
        TotalRecords INTEGER DEFAULT 0,
        Inserted INTEGER DEFAULT 0,
        Updated INTEGER DEFAULT 0,
        AutoHealed INTEGER DEFAULT 0,
        Skipped INTEGER DEFAULT 0,
        TablesSelected TEXT,                  -- JSON array of selected table names
        TablesDeferred TEXT,                  -- JSON array of deferred table names
        SnapshotFile TEXT,                    -- Pre-import snapshot filename
        Status TEXT DEFAULT 'IN_PROGRESS' CHECK (Status IN ('IN_PROGRESS', 'COMPLETE', 'FAILED', 'PARTIAL')),
        ErrorMessage TEXT,
        CompletedAt DATETIME
    );

    CREATE TABLE IF NOT EXISTS Import_Failures (
        ID INTEGER PRIMARY KEY AUTOINCREMENT,
        ImportID TEXT NOT NULL,
        SourceTable TEXT NOT NULL,
        SourceID TEXT,
        FailReason TEXT NOT NULL,
        RawData TEXT,                         -- JSON blob of the original record
        HealAttempted INTEGER DEFAULT 0,      -- 1 if auto-heal was tried
        HealResult TEXT,                      -- 'SUCCESS', 'NO_MATCH', 'FAILED'
        HealSourcePlant TEXT,                 -- Which plant the healed data came from
        FOREIGN KEY (ImportID) REFERENCES Import_Log(ImportID)
    );

    CREATE INDEX IF NOT EXISTS idx_import_log_plant ON Import_Log(TargetPlant);
    CREATE INDEX IF NOT EXISTS idx_import_log_status ON Import_Log(Status);
    CREATE INDEX IF NOT EXISTS idx_import_log_timestamp ON Import_Log(Timestamp);
    CREATE INDEX IF NOT EXISTS idx_import_failures_importid ON Import_Failures(ImportID);

    CREATE INDEX IF NOT EXISTS idx_global_vendors_name ON GlobalVendors(Name);
    CREATE INDEX IF NOT EXISTS idx_global_assets_desc ON GlobalAssets(Description);
    CREATE INDEX IF NOT EXISTS idx_global_sops_desc ON GlobalSOPs(Description);
`);

// Audit 47 / H-7: request-scoped "already audited" flag. The auditTrail
// middleware establishes a store for each /api/* mutation; any inline
// logAudit call the route makes sets store.audited = true, so the
// middleware's generic HTTP_MUTATION safety-net entry is suppressed and
// we don't double-log richly-audited endpoints.
const { AsyncLocalStorage } = require('async_hooks');
const auditContext = new AsyncLocalStorage();

// Audit 47 / L-3: audit failures used to be silent (console.error only),
// giving false assurance that compliance-critical events were recorded.
// Track failure counters + last error so /api/health can surface the
// condition, and CRITICAL/WARNING failures append to a flat-file fallback
// log the operator can recover from.
const fsAudit = require('fs');
const pathAudit = require('path');
const auditHealth = {
    total: 0,
    failed: 0,
    lastFailureAt: null,
    lastFailureReason: null,
};
function _emitAuditFailure(severity, entry, err) {
    auditHealth.failed += 1;
    auditHealth.lastFailureAt = new Date().toISOString();
    auditHealth.lastFailureReason = err.message;
    // Emit a process-level event for anyone who wants to hook it.
    try { process.emit('audit:failure', { severity, entry, error: err }); } catch (_) { /* no listeners */ }
    // CRITICAL / WARNING actions that failed to hit the AuditLog get a
    // fallback flat-file line so forensic reconstruction is still possible.
    if (severity === 'CRITICAL' || severity === 'WARNING') {
        try {
            const logPath = pathAudit.join(dataDir, 'audit-failover.log');
            const line = JSON.stringify({ at: auditHealth.lastFailureAt, severity, error: err.message, entry }) + '\n';
            fsAudit.appendFileSync(logPath, line);
        } catch (fileErr) {
            // If even the flat file fails we're out of options — at least
            // this goes to stderr which the operator is likely watching.
            console.error('[AuditLog] CRITICAL: fallback log write failed:', fileErr.message);
        }
    }
}
function getAuditHealth() {
    return { ...auditHealth };
}

/**
 * Structured Logging Helper
 * @param {string} userId - ID of the user performing the action
 * @param {string} action - Action slug (e.g. 'LOGIN', 'DELETE_WO')
 * @param {string} plantId - Optional plant ID context
 * @param {object} details - Optional object to be stringified
 * @param {string} severity - Severity level
 * @param {string} ip - Source IP
 */
function logAudit(userId, action, plantId = null, details = null, severity = 'INFO', ip = null) {
    auditHealth.total += 1;
    const entry = { userId: userId || 'SYSTEM', action, plantId, details, severity, ip };
    try {
        const stmt = db.prepare(`
            INSERT INTO AuditLog (UserID, Action, PlantID, Details, Severity, IPAddress)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
            entry.userId,
            action,
            plantId,
            details ? JSON.stringify(details) : null,
            severity,
            ip
        );
        // Mark the active HTTP request (if any) as audited so the auditTrail
        // middleware skips its generic safety-net entry for this request.
        const store = auditContext.getStore();
        if (store) store.audited = true;
    } catch (err) {
        console.error('❌ Failed to write to AuditLog:', err);
        _emitAuditFailure(severity, entry, err);
    }
}
function syncGlobalAsset(data, plantId) {
    try {
        const stmt = db.prepare(`
            INSERT INTO GlobalAssets (ID, Description, Model, Manufacturer, AssetType, UsefulLife, AssetTag, LastSyncFromPlant, UpdatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(ID, LastSyncFromPlant) DO UPDATE SET
                Description = excluded.Description,
                Model = excluded.Model,
                Manufacturer = excluded.Manufacturer,
                AssetType = excluded.AssetType,
                UsefulLife = excluded.UsefulLife,
                AssetTag = excluded.AssetTag,
                UpdatedAt = CURRENT_TIMESTAMP
        `);
        stmt.run(data.ID, data.Description, data.Model, data.Manufacturer, data.AstTypeID || data.AssetType, data.UsefulLife, data.AssetTag, plantId);
    } catch (err) {
        console.error('Failed to sync global asset:', err.message);
    }
}

function syncGlobalSOP(id, description, tasks, plantId) {
    try {
        const stmt = db.prepare(`
            INSERT INTO GlobalSOPs (ID, Description, TasksJSON, LastSyncFromPlant, UpdatedAt)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(ID) DO UPDATE SET
                Description = excluded.Description,
                TasksJSON = excluded.TasksJSON,
                LastSyncFromPlant = excluded.LastSyncFromPlant,
                UpdatedAt = CURRENT_TIMESTAMP
        `);
        // Handle various incoming task formats
        const taskArray = Array.isArray(tasks) ? tasks : (tasks?._tasks || tasks?.Steps || tasks?.Tasks || []);
        stmt.run(id, description, JSON.stringify(taskArray), plantId);
    } catch (err) {
        console.error('Failed to sync global SOP:', err.message);
    }
}

function isBackupAllowed(username) {
    try {
        const row = db.prepare('SELECT Value FROM SystemSettings WHERE Key = ?').get('allowed_backup_users');
        if (!row) return false;
        const users = JSON.parse(row.Value);
        return Array.isArray(users) && users.includes(username);
    } catch (e) {
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRAIRIE DATA BRIDGE — Import History Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a new import session log entry
 * @returns {string} The generated ImportID
 */
function createImportSession(sourceSystem, sourcePath, targetPlant, importedBy, tablesSelected = [], tablesDeferred = [], snapshotFile = null) {
    const importId = `IMP-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
    try {
        db.prepare(`
            INSERT INTO Import_Log (ImportID, SourceSystem, SourcePath, TargetPlant, ImportedBy, TablesSelected, TablesDeferred, SnapshotFile)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            importId,
            sourceSystem,
            sourcePath,
            targetPlant,
            importedBy,
            JSON.stringify(tablesSelected),
            JSON.stringify(tablesDeferred),
            snapshotFile
        );
    } catch (err) {
        console.error('❌ Failed to create import session:', err);
    }
    return importId;
}

/**
 * Update an import session with final results
 */
function completeImportSession(importId, stats = {}) {
    try {
        db.prepare(`
            UPDATE Import_Log 
            SET TotalRecords = ?, Inserted = ?, Updated = ?, AutoHealed = ?, Skipped = ?,
                Status = ?, ErrorMessage = ?, CompletedAt = CURRENT_TIMESTAMP
            WHERE ImportID = ?
        `).run(
            stats.total || 0,
            stats.inserted || 0,
            stats.updated || 0,
            stats.autoHealed || 0,
            stats.skipped || 0,
            stats.error ? 'FAILED' : (stats.skipped > 0 ? 'PARTIAL' : 'COMPLETE'),
            stats.error || null,
            importId
        );
    } catch (err) {
        console.error('❌ Failed to complete import session:', err);
    }
}

/**
 * Log a failed import record
 */
function logImportFailure(importId, sourceTable, sourceId, failReason, rawData = null, healResult = null, healSourcePlant = null) {
    try {
        db.prepare(`
            INSERT INTO Import_Failures (ImportID, SourceTable, SourceID, FailReason, RawData, HealAttempted, HealResult, HealSourcePlant)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            importId,
            sourceTable,
            sourceId,
            failReason,
            rawData ? JSON.stringify(rawData) : null,
            healResult ? 1 : 0,
            healResult,
            healSourcePlant
        );
    } catch (err) {
        console.error('❌ Failed to log import failure:', err);
    }
}

/**
 * Get all import sessions, optionally filtered by plant
 */
function getImportHistory(plantId = null) {
    try {
        if (plantId) {
            return db.prepare('SELECT * FROM Import_Log WHERE TargetPlant = ? ORDER BY Timestamp DESC').all(plantId);
        }
        return db.prepare('SELECT * FROM Import_Log ORDER BY Timestamp DESC').all();
    } catch (err) {
        return [];
    }
}

/**
 * Get failures for a specific import session
 */
function getImportFailures(importId) {
    try {
        return db.prepare('SELECT * FROM Import_Failures WHERE ImportID = ? ORDER BY ID').all(importId);
    } catch (err) {
        return [];
    }
}

module.exports = {
    db,
    logAudit,
    auditContext, // exported for auditTrail middleware
    getAuditHealth, // exported for /api/health subsystem view
    isBackupAllowed,
    syncGlobalAsset,
    syncGlobalSOP,
    // Trier Data Bridge exports
    createImportSession,
    completeImportSession,
    logImportFailure,
    getImportHistory,
    getImportFailures
};

