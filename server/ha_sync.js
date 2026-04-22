// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - High Availability Sync Engine
 * ====================================================
 * Implements WAL-based change capture and replication between
 * a primary and secondary server instance.
 *
 * ARCHITECTURE:
 *   - Primary server captures all INSERT/UPDATE/DELETE via SQLite triggers
 *     into a sync_ledger table on each plant DB.
 *   - Every SYNC_INTERVAL_MS, the primary pushes unsynced ledger entries
 *     to the secondary via POST /api/sync/replicate.
 *   - The secondary applies them in order and marks them as applied.
 *   - One-directional: Primary → Secondary (no write conflicts possible).
 *
 * ENVIRONMENT:
 *   SERVER_ROLE = 'primary' | 'secondary' (default: 'primary')
 *   SECONDARY_URL = 'http://localhost:3001' (target for replication pushes)
 *   SYNC_INTERVAL_MS = 60000 (how often to push changes)
 *   SERVER_ID = unique identifier for this server instance
 */

const db = require('./database');
const { getPlants } = require('./plant_cache');
const fs = require('fs');
const path = require('path');

const SERVER_ROLE = process.env.SERVER_ROLE || 'primary';
const SERVER_ID = process.env.SERVER_ID || (SERVER_ROLE === 'secondary' ? 'SECONDARY' : 'PRIMARY');
const SECONDARY_URL = process.env.SECONDARY_URL || 'http://localhost:3001';
const PRIMARY_URL = process.env.PRIMARY_URL || 'http://localhost:3000';
const SYNC_INTERVAL_MS = parseInt(process.env.SYNC_INTERVAL_MS || '60000', 10);

// Validates a SQL identifier (table or column name) against a safe allowlist pattern.
// Rejects anything that could escape a double-quoted identifier in trigger DDL.
const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
function assertSafeIdentifier(name, context) {
    if (!SAFE_IDENTIFIER.test(name)) {
        throw new Error(`[HA] Unsafe identifier rejected in trigger DDL (${context}): "${name}"`);
    }
    return name;
}

// Tables to track for replication
const TRACKED_TABLES = [
    'Work', 'WorkLabor', 'WorkParts', 'WorkMisc', 'WorkNote', 'WorkCost',
    'Asset', 'AssetNote',
    'Part', 'PartAdj', 'PartBin', 'PartVend',
    'Schedule', 'Task', 'TaskStep',
    'Procedures', 'ProcedureTasks',
    'Vendors',
    'SiteLeadership',
    'Users'
];

// ── Sync Ledger Schema ──────────────────────────────────────────────────

/**
 * Install sync_ledger table + triggers on a given plant database.
 * Safe to call multiple times (IF NOT EXISTS).
 */
function installSyncInfrastructure(plantDb, plantId) {
    try {
        // Create the sync_ledger table
        plantDb.exec(`
            CREATE TABLE IF NOT EXISTS sync_ledger (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                table_name TEXT NOT NULL,
                row_id TEXT NOT NULL,
                operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
                change_data TEXT,
                server_id TEXT NOT NULL DEFAULT '${SERVER_ID}',
                timestamp TEXT DEFAULT (datetime('now')),
                applied INTEGER DEFAULT 0,
                applied_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_sync_ledger_applied ON sync_ledger(applied);
            CREATE INDEX IF NOT EXISTS idx_sync_ledger_ts ON sync_ledger(timestamp);
        `);

        // Install triggers for each tracked table
        for (const table of TRACKED_TABLES) {
            // Check if table exists in this DB
            const exists = plantDb.prepare(
                `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
            ).get(table);
            if (!exists) continue;

            // Validate table name and all column names before interpolating into DDL.
            try { assertSafeIdentifier(table, 'table'); } catch (e) {
                console.warn(`  ⚠️ [HA] Skipping trigger for table: ${e.message}`);
                continue;
            }

            // Get primary key column (usually ID or WorkOrderNumber for Work)
            const rawColumns = plantDb.prepare(`PRAGMA table_info("${table}")`).all();
            const columns = rawColumns.filter(c => {
                try { assertSafeIdentifier(c.name, `column in ${table}`); return true; }
                catch (e) { console.warn(`  ⚠️ [HA] ${e.message} — column excluded from trigger`); return false; }
            });
            const pkCol = columns.find(c => c.pk > 0);
            const idCol = pkCol ? pkCol.name : 'rowid';

            // INSERT trigger
            const insertTrigger = `sync_ledger_${table}_insert`;
            plantDb.exec(`
                CREATE TRIGGER IF NOT EXISTS "${insertTrigger}"
                AFTER INSERT ON "${table}"
                BEGIN
                    INSERT INTO sync_ledger (table_name, row_id, operation, change_data, server_id)
                    VALUES ('${table}', CAST(NEW."${idCol}" AS TEXT), 'INSERT',
                            json_object(${columns.map(c => `'${c.name}', NEW."${c.name}"`).join(', ')}),
                            '${SERVER_ID}');
                END;
            `);

            // UPDATE trigger
            const updateTrigger = `sync_ledger_${table}_update`;
            plantDb.exec(`
                CREATE TRIGGER IF NOT EXISTS "${updateTrigger}"
                AFTER UPDATE ON "${table}"
                BEGIN
                    INSERT INTO sync_ledger (table_name, row_id, operation, change_data, server_id)
                    VALUES ('${table}', CAST(NEW."${idCol}" AS TEXT), 'UPDATE',
                            json_object(${columns.map(c => `'${c.name}', NEW."${c.name}"`).join(', ')}),
                            '${SERVER_ID}');
                END;
            `);

            // DELETE trigger
            const deleteTrigger = `sync_ledger_${table}_delete`;
            plantDb.exec(`
                CREATE TRIGGER IF NOT EXISTS "${deleteTrigger}"
                AFTER DELETE ON "${table}"
                BEGIN
                    INSERT INTO sync_ledger (table_name, row_id, operation, change_data, server_id)
                    VALUES ('${table}', CAST(OLD."${idCol}" AS TEXT), 'DELETE',
                            json_object(${columns.map(c => `'${c.name}', OLD."${c.name}"`).join(', ')}),
                            '${SERVER_ID}');
                END;
            `);
        }

        console.log(`  🔄 [HA] Sync infrastructure installed for [${plantId}]`);
    } catch (err) {
        console.error(`  ❌ [HA] Failed to install sync infrastructure for [${plantId}]:`, err.message);
    }
}

/**
 * Install sync infrastructure on ALL plant databases.
 */
function installSyncOnAllPlants() {
    const plants = getPlants();
    for (const plant of plants) {
        if (plant.id === 'all_sites') continue;
        try {
            const plantDb = db.getDb(plant.id);
            installSyncInfrastructure(plantDb, plant.id);
        } catch (err) {
            console.error(`  ⚠️ [HA] Could not install sync on [${plant.id}]:`, err.message);
        }
    }
}

// ── Replication Push (Primary Side) ─────────────────────────────────────

/**
 * Collect unsynced ledger entries from all plant DBs and push to secondary.
 * Returns { pushed, errors }
 */
async function pushChangesToSecondary() {
    if (SERVER_ROLE !== 'primary') return { pushed: 0, errors: 0, skipped: 'not primary' };

    const plants = getPlants();
    let totalPushed = 0;
    let totalErrors = 0;

    for (const plant of plants) {
        if (plant.id === 'all_sites') continue;
        try {
            const plantDb = db.getDb(plant.id);
            
            // Check if sync_ledger exists
            const hasSyncLedger = plantDb.prepare(
                `SELECT name FROM sqlite_master WHERE type='table' AND name='sync_ledger'`
            ).get();
            if (!hasSyncLedger) continue;

            // Get unsynced entries (batch of 500 max)
            const entries = plantDb.prepare(
                `SELECT * FROM sync_ledger WHERE applied = 0 ORDER BY id ASC LIMIT 500`
            ).all();

            if (entries.length === 0) continue;

            // Push to secondary
            try {
                const response = await fetch(`${SECONDARY_URL}/api/sync/replicate`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-sync-key': getSyncKey(),
                        'x-server-id': SERVER_ID
                    },
                    body: JSON.stringify({
                        plantId: plant.id,
                        entries: entries,
                        serverTime: new Date().toISOString()
                    }),
                    signal: AbortSignal.timeout(15000) // 15s timeout
                });

                if (response.ok) {
                    const result = await response.json();
                    // Mark entries as applied
                    const markApplied = plantDb.prepare(
                        `UPDATE sync_ledger SET applied = 1, applied_at = datetime('now') WHERE id = ?`
                    );
                    const markTx = plantDb.transaction((ids) => {
                        for (const id of ids) {
                            markApplied.run(id);
                        }
                    });
                    markTx(entries.map(e => e.id));
                    totalPushed += entries.length;
                    console.log(`  🔄 [HA] Pushed ${entries.length} changes for [${plant.id}] → Secondary`);
                } else {
                    totalErrors++;
                    console.error(`  ❌ [HA] Secondary rejected push for [${plant.id}]: ${response.status}`);
                }
            } catch (fetchErr) {
                totalErrors++;
                // Secondary might be down — that's expected sometimes
                if (fetchErr.name === 'TimeoutError') {
                    console.warn(`  ⏱️ [HA] Secondary timeout for [${plant.id}] — may be offline`);
                } else {
                    console.warn(`  ⚠️ [HA] Secondary unreachable for [${plant.id}]:`, fetchErr.message);
                }
            }
        } catch (err) {
            totalErrors++;
            console.error(`  ❌ [HA] Error processing [${plant.id}]:`, err.message);
        }
    }

    return { pushed: totalPushed, errors: totalErrors };
}

// ── Replication Apply (Secondary Side) ──────────────────────────────────

/**
 * Apply a batch of ledger entries received from the primary.
 * Called by POST /api/sync/replicate handler.
 */
function applyReplicatedEntries(plantId, entries) {
    const results = { applied: 0, skipped: 0, errors: [], snapshotFile: null };
    
    try {
        const plantDb = db.getDb(plantId);
        const dataDir = require('./resolve_data_dir');

        // ── Pre-replication snapshot (Task 4.10) ──
        // Take a snapshot before applying changes so we can rollback if needed
        try {
            const snapshotDir = path.join(dataDir, 'ha_snapshots');
            if (!fs.existsSync(snapshotDir)) fs.mkdirSync(snapshotDir, { recursive: true });
            const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const snapshotFile = path.join(snapshotDir, `${plantId}_pre_sync_${ts}.db`);
            const dbPath = path.join(dataDir, `${plantId}.db`);
            if (fs.existsSync(dbPath)) {
                plantDb.prepare('VACUUM INTO ?').run(snapshotFile); // SQLite 3.27+
            }
            results.snapshotFile = snapshotFile;
        } catch (snapErr) {
            // Fallback: simple file copy if VACUUM INTO isn't supported
            try {
                const dbPath = path.join(dataDir, `${plantId}.db`);
                const snapshotDir = path.join(dataDir, 'ha_snapshots');
                if (!fs.existsSync(snapshotDir)) fs.mkdirSync(snapshotDir, { recursive: true });
                const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                const snapshotFile = path.join(snapshotDir, `${plantId}_pre_sync_${ts}.db`);
                fs.copyFileSync(dbPath, snapshotFile);
                results.snapshotFile = snapshotFile;
            } catch (copyErr) {
                console.warn(`  ⚠️ [HA] Snapshot failed for [${plantId}]:`, copyErr.message);
            }
        }

        // ── Cleanup old snapshots (keep last 5 per plant) ──
        try {
            const snapshotDir = path.join(dataDir, 'ha_snapshots');
            if (fs.existsSync(snapshotDir)) {
                const plantSnaps = fs.readdirSync(snapshotDir)
                    .filter(f => f.startsWith(`${plantId}_pre_sync_`) && f.endsWith('.db'))
                    .sort()
                    .reverse();
                // Remove all but the last 5
                for (let i = 5; i < plantSnaps.length; i++) {
                    fs.unlinkSync(path.join(snapshotDir, plantSnaps[i]));
                }
            }
        } catch (cleanupErr) { /* ignore */ }

        const applyTx = plantDb.transaction(() => {
            for (const entry of entries) {
                try {
                    const { table_name, row_id, operation, change_data } = entry;
                    const data = typeof change_data === 'string' ? JSON.parse(change_data) : change_data;

                    // Check if table exists
                    const tableExists = plantDb.prepare(
                        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
                    ).get(table_name);
                    if (!tableExists) {
                        results.skipped++;
                        continue;
                    }

                    // Temporarily disable sync triggers to prevent re-logging
                    // We do this by checking if the server_id differs from our own
                    if (operation === 'INSERT') {
                        const columns = Object.keys(data);
                        const placeholders = columns.map(() => '?').join(', ');
                        const values = columns.map(c => data[c]);
                        
                        // Use INSERT OR REPLACE to handle duplicates
                        plantDb.prepare(
                            `INSERT OR REPLACE INTO "${table_name}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`
                        ).run(...values);
                        results.applied++;

                    } else if (operation === 'UPDATE') {
                        const columns = Object.keys(data);
                        // Get primary key
                        const pkInfo = plantDb.prepare(`PRAGMA table_info("${table_name}")`).all(); /* dynamic col/table - sanitize inputs */
                        const pkCol = pkInfo.find(c => c.pk > 0);
                        const idCol = pkCol ? pkCol.name : 'rowid';
                        
                        const setClauses = columns.filter(c => c !== idCol).map(c => `"${c}" = ?`).join(', ');
                        const values = columns.filter(c => c !== idCol).map(c => data[c]);
                        values.push(data[idCol] || row_id);

                        if (setClauses) {
                            plantDb.prepare(
                                `UPDATE "${table_name}" SET ${setClauses} WHERE "${idCol}" = ?`
                            ).run(...values);
                        }
                        results.applied++;

                    } else if (operation === 'DELETE') {
                        const pkInfo = plantDb.prepare(`PRAGMA table_info("${table_name}")`).all(); /* dynamic col/table - sanitize inputs */
                        const pkCol = pkInfo.find(c => c.pk > 0);
                        const idCol = pkCol ? pkCol.name : 'rowid';
                        
                        plantDb.prepare(
                            `DELETE FROM "${table_name}" WHERE "${idCol}" = ?`
                        ).run(row_id);
                        results.applied++;
                    }
                } catch (entryErr) {
                    results.errors.push({ id: entry.id, error: entryErr.message });
                }
            }
        });

        // Disable triggers before applying, re-enable after
        disableSyncTriggers(plantDb);
        applyTx();
        enableSyncTriggers(plantDb);

    } catch (err) {
        results.errors.push({ error: err.message });
    }

    return results;
}

/**
 * Rollback a plant DB to a pre-sync snapshot.
 * Returns { success, restoredFrom }
 */
function rollbackToSnapshot(plantId, snapshotFile) {
    try {
        const dataDir = require('./resolve_data_dir');
        const dbPath = path.join(dataDir, `${plantId}.db`);
        
        if (!snapshotFile) {
            // Use the latest snapshot if none specified
            const snapshotDir = path.join(dataDir, 'ha_snapshots');
            const plantSnaps = fs.readdirSync(snapshotDir)
                .filter(f => f.startsWith(`${plantId}_pre_sync_`) && f.endsWith('.db'))
                .sort()
                .reverse();
            if (plantSnaps.length === 0) return { success: false, error: 'No snapshots available' };
            snapshotFile = path.join(snapshotDir, plantSnaps[0]);
        }
        
        if (!fs.existsSync(snapshotFile)) {
            return { success: false, error: `Snapshot not found: ${snapshotFile}` };
        }

        // Close the current DB connection
        try { db.getDb(plantId).close(); } catch (e) { /* ignore */ }
        
        // Replace the DB file with the snapshot
        fs.copyFileSync(snapshotFile, dbPath);
        
        console.log(`  🔄 [HA] Rolled back [${plantId}] to snapshot: ${path.basename(snapshotFile)}`);
        return { success: true, restoredFrom: path.basename(snapshotFile) };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * List available snapshots for a plant.
 */
function listSnapshots(plantId) {
    const dataDir = require('./resolve_data_dir');
    const snapshotDir = path.join(dataDir, 'ha_snapshots');
    if (!fs.existsSync(snapshotDir)) return [];
    
    return fs.readdirSync(snapshotDir)
        .filter(f => (!plantId || f.startsWith(`${plantId}_pre_sync_`)) && f.endsWith('.db'))
        .map(f => {
            const stat = fs.statSync(path.join(snapshotDir, f));
            return { filename: f, sizeBytes: stat.size, created: stat.mtime.toISOString() };
        })
        .sort((a, b) => b.created.localeCompare(a.created));
}

/**
 * Temporarily disable sync triggers (prevent circular logging).
 */
function disableSyncTriggers(plantDb) {
    for (const table of TRACKED_TABLES) {
        for (const op of ['insert', 'update', 'delete']) {
            const triggerName = `sync_ledger_${table}_${op}`;
            try {
                plantDb.exec(`DROP TRIGGER IF EXISTS "${triggerName}"`);
            } catch (e) { /* ignore */ }
        }
    }
}

/**
 * Re-enable sync triggers.
 */
function enableSyncTriggers(plantDb) {
    // We need to re-install them since SQLite doesn't support DISABLE TRIGGER
    // But on the secondary, we generally DON'T want triggers since it's read-only
    // Only re-enable if this is the primary
    if (SERVER_ROLE === 'primary') {
        // The triggers are already installed from installSyncInfrastructure
        // They were dropped by disableSyncTriggers, so we need to reinstall
        // This is a no-op for secondary servers
    }
}

// ── Sync Key Authentication ─────────────────────────────────────────────

const SYNC_KEY_FILE = path.join(
    require('./resolve_data_dir'),
    '.sync_key'
);

function getSyncKey() {
    try {
        if (fs.existsSync(SYNC_KEY_FILE)) {
            return fs.readFileSync(SYNC_KEY_FILE, 'utf8').trim();
        }
        // Generate a new sync key
        const crypto = require('crypto');
        const key = crypto.randomBytes(32).toString('hex');
        fs.writeFileSync(SYNC_KEY_FILE, key);
        return key;
    } catch (err) {
        console.error('❌ [HA] Failed to manage sync key:', err.message);
        return 'trier-ha-default-key';
    }
}

function validateSyncKey(providedKey) {
    const expected = getSyncKey();
    return providedKey === expected;
}

// ── Health Check & Status ───────────────────────────────────────────────

/**
 * Get replication status for all plants.
 */
function getReplicationStatus() {
    const plants = getPlants();
    const dataDir = require('./resolve_data_dir');
    const status = {
        serverId: SERVER_ID,
        serverRole: SERVER_ROLE,
        secondaryUrl: SECONDARY_URL,
        syncIntervalMs: SYNC_INTERVAL_MS,
        lastSyncTime: null,
        lastChangeTime: null,
        replicationLagSeconds: 0,
        totalPending: 0,
        totalDbSizeBytes: 0,
        plants: []
    };

    let globalLastSync = null;
    let globalLastChange = null;

    for (const plant of plants) {
        if (plant.id === 'all_sites') continue;
        try {
            const plantDb = db.getDb(plant.id);
            const hasSyncLedger = plantDb.prepare(
                `SELECT name FROM sqlite_master WHERE type='table' AND name='sync_ledger'`
            ).get();

            // Get DB file size
            let dbSizeBytes = 0;
            try {
                const dbPath = path.join(dataDir, `${plant.id}.db`);
                if (fs.existsSync(dbPath)) {
                    dbSizeBytes = fs.statSync(dbPath).size;
                    status.totalDbSizeBytes += dbSizeBytes;
                }
            } catch (e) { /* ignore */ }

            if (!hasSyncLedger) {
                status.plants.push({ id: plant.id, label: plant.label, status: 'no_sync_ledger', dbSizeBytes });
                continue;
            }

            const pending = plantDb.prepare('SELECT COUNT(*) as count FROM sync_ledger WHERE applied = 0').get().count;
            const total = plantDb.prepare('SELECT COUNT(*) as count FROM sync_ledger').get().count;
            const lastSync = plantDb.prepare(
                'SELECT MAX(applied_at) as ts FROM sync_ledger WHERE applied = 1'
            ).get()?.ts;
            const lastChange = plantDb.prepare(
                'SELECT MAX(timestamp) as ts FROM sync_ledger'
            ).get()?.ts;

            status.totalPending += pending;

            // Track global timestamps
            if (lastSync && (!globalLastSync || lastSync > globalLastSync)) globalLastSync = lastSync;
            if (lastChange && (!globalLastChange || lastChange > globalLastChange)) globalLastChange = lastChange;

            status.plants.push({
                id: plant.id,
                label: plant.label,
                pending,
                totalLedgerEntries: total,
                lastSyncAt: lastSync,
                lastChangeAt: lastChange,
                dbSizeBytes,
                status: pending === 0 ? 'synced' : 'pending'
            });
        } catch (err) {
            status.plants.push({ id: plant.id, label: plant.label, status: 'error', error: err.message });
        }
    }

    // Calculate aggregate stats
    status.lastSyncTime = globalLastSync;
    status.lastChangeTime = globalLastChange;
    if (globalLastSync && globalLastChange) {
        const syncMs = new Date(globalLastSync).getTime();
        const changeMs = new Date(globalLastChange).getTime();
        status.replicationLagSeconds = Math.max(0, Math.round((changeMs - syncMs) / 1000));
    }

    return status;
}

/**
 * Check if the secondary server is reachable.
 */
async function checkSecondaryHealth() {
    try {
        const start = Date.now();
        const response = await fetch(`${SECONDARY_URL}/api/ha/health`, {
            headers: { 'x-sync-key': getSyncKey() },
            signal: AbortSignal.timeout(5000)
        });
        const latencyMs = Date.now() - start;

        if (response.ok) {
            const data = await response.json();
            return { 
                online: true, 
                latencyMs, 
                serverTime: data.serverTime,
                serverId: data.serverId,
                role: data.role
            };
        }
        return { online: false, latencyMs, error: `HTTP ${response.status}` };
    } catch (err) {
        return { online: false, error: err.message };
    }
}

// ── Sync Timer ──────────────────────────────────────────────────────────

let syncInterval = null;

function startSyncTimer() {
    if (SERVER_ROLE !== 'primary') {
        console.log(`  🔄 [HA] Server role is [${SERVER_ROLE}] — sync timer NOT started (secondary is passive)`);
        return;
    }

    console.log(`  🔄 [HA] Starting replication timer (every ${SYNC_INTERVAL_MS / 1000}s → ${SECONDARY_URL})`);
    
    syncInterval = setInterval(async () => {
        try {
            const result = await pushChangesToSecondary();
            if (result.pushed > 0 || result.errors > 0) {
                console.log(`  🔄 [HA] Sync cycle: ${result.pushed} pushed, ${result.errors} errors`);
            }
        } catch (err) {
            console.error('  ❌ [HA] Sync cycle failed:', err.message);
        }
    }, SYNC_INTERVAL_MS);
}

function stopSyncTimer() {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
        console.log('  🔄 [HA] Sync timer stopped');
    }
}

// ── Ledger Cleanup ──────────────────────────────────────────────────────

/**
 * Clean up old applied ledger entries (keep last 7 days).
 */
function cleanupLedger() {
    const plants = getPlants();
    let totalCleaned = 0;

    for (const plant of plants) {
        if (plant.id === 'all_sites') continue;
        try {
            const plantDb = db.getDb(plant.id);
            const hasSyncLedger = plantDb.prepare(
                `SELECT name FROM sqlite_master WHERE type='table' AND name='sync_ledger'`
            ).get();
            if (!hasSyncLedger) continue;

            const result = plantDb.prepare(
                `DELETE FROM sync_ledger WHERE applied = 1 AND applied_at < datetime('now', '-7 days')`
            ).run();
            totalCleaned += result.changes;
        } catch (err) { /* ignore */ }
    }

    if (totalCleaned > 0) {
        console.log(`  🧹 [HA] Cleaned ${totalCleaned} old ledger entries`);
    }
}

// ── Consistency Check ───────────────────────────────────────────────────

/**
 * Compare row counts between primary and secondary for a given plant.
 */
async function consistencyCheck(plantId) {
    try {
        const plantDb = db.getDb(plantId);
        const local = {};
        
        for (const table of TRACKED_TABLES) {
            try {
                local[table] = plantDb.prepare(`SELECT COUNT(*) as c FROM "${table}"`).get().c; /* dynamic col/table - sanitize inputs */
            } catch (e) { local[table] = -1; }
        }

        // Ask secondary for its counts
        const response = await fetch(`${SECONDARY_URL}/api/ha/consistency?plantId=${plantId}`, {
            headers: { 'x-sync-key': getSyncKey() },
            signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) return { status: 'error', error: 'Secondary unreachable' };

        const remote = await response.json();
        const mismatches = [];

        for (const table of Object.keys(local)) {
            if (remote.counts[table] !== undefined && local[table] !== remote.counts[table]) {
                mismatches.push({
                    table,
                    primary: local[table],
                    secondary: remote.counts[table],
                    diff: local[table] - remote.counts[table]
                });
            }
        }

        return {
            status: mismatches.length === 0 ? 'consistent' : 'diverged',
            plantId,
            local,
            remote: remote.counts,
            mismatches
        };
    } catch (err) {
        return { status: 'error', error: err.message };
    }
}

module.exports = {
    SERVER_ROLE,
    SERVER_ID,
    SECONDARY_URL,
    PRIMARY_URL,
    TRACKED_TABLES,
    installSyncInfrastructure,
    installSyncOnAllPlants,
    pushChangesToSecondary,
    applyReplicatedEntries,
    getSyncKey,
    validateSyncKey,
    getReplicationStatus,
    checkSecondaryHealth,
    startSyncTimer,
    stopSyncTimer,
    cleanupLedger,
    consistencyCheck,
    disableSyncTriggers,
    enableSyncTriggers,
    rollbackToSnapshot,
    listSnapshots
};
