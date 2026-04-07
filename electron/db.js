// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS � Local SQLite Database (Electron Desktop Client)
 * 
 * This module manages a local SQLite database replica that enables
 * fully offline desktop operation. It mirrors the server's database
 * schema and includes a sync_queue for tracking changes.
 * 
 * Architecture:
 *   - On first launch: Downloads full snapshot from server
 *   - During operation: Reads/writes to local DB
 *   - All writes are also logged to sync_queue
 *   - Sync engine replays queue when online
 *   - Delta sync pulls server changes by timestamp
 * 
 * Storage: %APPDATA%/TrierOS/trier_local.db (Windows)
 *          ~/Library/Application Support/TrierOS/ (macOS)
 *          ~/.config/TrierOS/ (Linux)
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class LocalDatabase {
    constructor(dbPath) {
        this.dbPath = dbPath;
        this.db = null;
        this.isInitialized = false;
    }

    /**
     * Open (or create) the local database
     */
    open() {
        if (this.db) return this.db;

        console.log('[LOCAL-DB] Opening:', this.dbPath);
        this.db = new Database(this.dbPath);

        // Enable WAL mode for better concurrent access
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
        this.db.pragma('cache_size = -64000'); // 64MB cache

        // Initialize schema if needed
        this.initSchema();
        this.isInitialized = true;

        return this.db;
    }

    /**
     * Initialize the sync infrastructure tables
     */
    initSchema() {
        // Sync queue � tracks all local writes for replay to server
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS sync_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                operation TEXT NOT NULL,
                target_table TEXT NOT NULL,
                target_id TEXT,
                payload TEXT,
                timestamp TEXT DEFAULT (datetime('now')),
                synced INTEGER DEFAULT 0,
                sync_result TEXT,
                retry_count INTEGER DEFAULT 0,
                error_message TEXT
            );
        `);

        // Sync metadata � tracks last sync time per table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS sync_meta (
                table_name TEXT PRIMARY KEY,
                last_sync_timestamp TEXT,
                row_count INTEGER DEFAULT 0,
                checksum TEXT
            );
        `);

        // Local config store
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS local_config (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at TEXT DEFAULT (datetime('now'))
            );
        `);

        console.log('[LOCAL-DB] Sync schema initialized');
    }

    /**
     * Mirror the server's full database schema locally
     * Called on first launch or full re-sync
     */
    initMirrorSchema() {
        // Core tables that mirror the server
        const tables = [
            `CREATE TABLE IF NOT EXISTS work_orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT,
                description TEXT,
                status TEXT DEFAULT 'Open',
                priority TEXT DEFAULT 'Medium',
                type TEXT DEFAULT 'Corrective',
                assigned_to TEXT,
                requested_by TEXT,
                asset_id TEXT,
                location TEXT,
                plant_id TEXT DEFAULT 'Demo_Plant_1',
                due_date TEXT,
                completed_date TEXT,
                estimated_hours REAL,
                actual_hours REAL,
                notes TEXT,
                parts_used TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now')),
                approval_status TEXT DEFAULT 'approved',
                approved_by TEXT,
                failure_code TEXT,
                root_cause TEXT,
                corrective_action TEXT,
                downtime_hours REAL DEFAULT 0,
                safety_notes TEXT,
                permits_required TEXT,
                attachments TEXT
            )`,
            `CREATE TABLE IF NOT EXISTS assets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                asset_id TEXT UNIQUE,
                category TEXT,
                location TEXT,
                department TEXT,
                status TEXT DEFAULT 'Operational',
                manufacturer TEXT,
                model TEXT,
                serial_number TEXT,
                install_date TEXT,
                warranty_expiry TEXT,
                last_pm_date TEXT,
                next_pm_date TEXT,
                criticality TEXT DEFAULT 'Medium',
                plant_id TEXT DEFAULT 'Demo_Plant_1',
                notes TEXT,
                specifications TEXT,
                parent_asset_id TEXT,
                barcode TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            )`,
            `CREATE TABLE IF NOT EXISTS parts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                part_number TEXT,
                description TEXT,
                category TEXT,
                location TEXT,
                quantity INTEGER DEFAULT 0,
                min_quantity INTEGER DEFAULT 0,
                max_quantity INTEGER,
                unit_cost REAL DEFAULT 0,
                vendor TEXT,
                manufacturer TEXT,
                manufacturer_part_number TEXT,
                plant_id TEXT DEFAULT 'Demo_Plant_1',
                barcode TEXT,
                notes TEXT,
                last_ordered TEXT,
                last_used TEXT,
                shelf_life_days INTEGER,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            )`,
            `CREATE TABLE IF NOT EXISTS pm_schedules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT,
                description TEXT,
                asset_id TEXT,
                frequency TEXT DEFAULT 'Monthly',
                frequency_days INTEGER DEFAULT 30,
                last_completed TEXT,
                next_due TEXT,
                assigned_to TEXT,
                procedure_id TEXT,
                estimated_hours REAL,
                plant_id TEXT DEFAULT 'Demo_Plant_1',
                active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            )`,
            `CREATE TABLE IF NOT EXISTS contacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                title TEXT,
                department TEXT,
                phone TEXT,
                email TEXT,
                plant_id TEXT DEFAULT 'Demo_Plant_1',
                role TEXT,
                active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT (datetime('now'))
            )`,
            // ���� Sensor tables for PLC fallback and offline viewing ����
            `CREATE TABLE IF NOT EXISTS sensor_config (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sensor_id TEXT NOT NULL UNIQUE,
                sensor_name TEXT NOT NULL,
                asset_id TEXT DEFAULT '',
                asset_name TEXT DEFAULT '',
                plant_id TEXT DEFAULT '',
                plant_name TEXT DEFAULT '',
                metric TEXT NOT NULL DEFAULT 'temperature',
                unit TEXT DEFAULT '°F',
                location TEXT DEFAULT '',
                protocol TEXT DEFAULT 'http',
                enabled INTEGER DEFAULT 1,
                created_at TEXT DEFAULT (datetime('now')),
                last_reading_at TEXT,
                last_value REAL,
                status TEXT DEFAULT 'offline'
            )`,
            `CREATE TABLE IF NOT EXISTS sensor_readings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sensor_id TEXT NOT NULL,
                asset_id TEXT DEFAULT '',
                metric TEXT NOT NULL,
                value REAL NOT NULL,
                unit TEXT DEFAULT '',
                plant_id TEXT DEFAULT '',
                threshold_exceeded INTEGER DEFAULT 0,
                timestamp TEXT DEFAULT (datetime('now'))
            )`,
            `CREATE TABLE IF NOT EXISTS sensor_thresholds (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sensor_id TEXT NOT NULL,
                metric TEXT NOT NULL DEFAULT 'temperature',
                min_value REAL,
                max_value REAL,
                wo_priority INTEGER DEFAULT 1,
                cooldown_minutes INTEGER DEFAULT 30,
                auto_wo INTEGER DEFAULT 1,
                last_alert_at TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            )`
        ];

        tables.forEach(sql => {
            try {
                this.db.exec(sql);
            } catch (e) {
                console.error('[LOCAL-DB] Schema error:', e.message);
            }
        });

        // Create indexes for common queries
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_wo_plant ON work_orders(plant_id)',
            'CREATE INDEX IF NOT EXISTS idx_wo_status ON work_orders(status)',
            'CREATE INDEX IF NOT EXISTS idx_wo_updated ON work_orders(updated_at)',
            'CREATE INDEX IF NOT EXISTS idx_assets_plant ON assets(plant_id)',
            'CREATE INDEX IF NOT EXISTS idx_assets_updated ON assets(updated_at)',
            'CREATE INDEX IF NOT EXISTS idx_parts_plant ON parts(plant_id)',
            'CREATE INDEX IF NOT EXISTS idx_parts_updated ON parts(updated_at)',
            'CREATE INDEX IF NOT EXISTS idx_sync_queue_synced ON sync_queue(synced)',
            'CREATE INDEX IF NOT EXISTS idx_sync_queue_timestamp ON sync_queue(timestamp)',
            // Sensor indexes
            'CREATE INDEX IF NOT EXISTS idx_sensor_readings_sensor ON sensor_readings(sensor_id)',
            'CREATE INDEX IF NOT EXISTS idx_sensor_readings_ts ON sensor_readings(timestamp)',
            'CREATE INDEX IF NOT EXISTS idx_sensor_readings_plant ON sensor_readings(plant_id)',
            'CREATE INDEX IF NOT EXISTS idx_sensor_config_plant ON sensor_config(plant_id)'
        ];

        indexes.forEach(sql => {
            try { this.db.exec(sql); } catch (e) {}
        });

        console.log('[LOCAL-DB] Mirror schema initialized');
    }

    // ���� CRUD Operations (all writes go through sync_queue) ����������������������������

    /**
     * Queue a write operation for later sync to server
     */
    queueWrite(operation, targetTable, targetId, payload) {
        const stmt = this.db.prepare(`
            INSERT INTO sync_queue (operation, target_table, target_id, payload)
            VALUES (?, ?, ?, ?)
        `);
        return stmt.run(operation, targetTable, targetId, JSON.stringify(payload));
    }

    /**
     * Get all pending (unsynced) writes
     */
    getPendingWrites() {
        return this.db.prepare(`
            SELECT * FROM sync_queue 
            WHERE synced = 0 
            ORDER BY timestamp ASC
        `).all();
    }

    /**
     * Get count of pending writes
     */
    getPendingCount() {
        const row = this.db.prepare('SELECT COUNT(*) as count FROM sync_queue WHERE synced = 0').get();
        return row ? row.count : 0;
    }

    /**
     * Mark a sync queue entry as synced
     */
    markSynced(id, result) {
        this.db.prepare(`
            UPDATE sync_queue 
            SET synced = 1, sync_result = ? 
            WHERE id = ?
        `).run(result || 'OK', id);
    }

    /**
     * Mark a sync entry as failed with retry
     */
    markFailed(id, errorMessage) {
        this.db.prepare(`
            UPDATE sync_queue 
            SET retry_count = retry_count + 1, error_message = ?
            WHERE id = ?
        `).run(errorMessage, id);
    }

    /**
     * Clean up old synced entries (keep last 7 days)
     */
    cleanupSyncQueue() {
        const result = this.db.prepare(`
            DELETE FROM sync_queue 
            WHERE synced = 1 AND timestamp < datetime('now', '-7 days')
        `).run();
        if (result.changes > 0) {
            console.log(`[LOCAL-DB] Cleaned ${result.changes} old sync entries`);
        }
    }

    // ���� Bulk Data Import (for initial sync / full refresh) ����������������������������

    /**
     * Import a batch of records from the server into a local table
     * Uses a transaction for performance
     */
    bulkImport(tableName, records) {
        if (!records || records.length === 0) return 0;

        const columns = Object.keys(records[0]);
        const placeholders = columns.map(() => '?').join(', ');
        
        const insertSQL = `INSERT OR REPLACE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
        const stmt = this.db.prepare(insertSQL);

        const transaction = this.db.transaction((rows) => {
            let count = 0;
            for (const row of rows) {
                const values = columns.map(col => row[col] ?? null);
                stmt.run(...values);
                count++;
            }
            return count;
        });

        const imported = transaction(records);
        
        // Update sync meta
        this.db.prepare(`
            INSERT OR REPLACE INTO sync_meta (table_name, last_sync_timestamp, row_count)
            VALUES (?, datetime('now'), ?)
        `).run(tableName, imported);

        console.log(`[LOCAL-DB] Imported ${imported} records into ${tableName}`);
        return imported;
    }

    /**
     * Get last sync timestamp for a table
     */
    getLastSync(tableName) {
        const row = this.db.prepare('SELECT last_sync_timestamp FROM sync_meta WHERE table_name = ?').get(tableName);
        return row ? row.last_sync_timestamp : null;
    }

    // ���� Config Store ����

    getLocalConfig(key) {
        const row = this.db.prepare('SELECT value FROM local_config WHERE key = ?').get(key);
        return row ? row.value : null;
    }

    setLocalConfig(key, value) {
        this.db.prepare(`
            INSERT OR REPLACE INTO local_config (key, value, updated_at) 
            VALUES (?, ?, datetime('now'))
        `).run(key, typeof value === 'string' ? value : JSON.stringify(value));
    }

    // ���� Cleanup ����

    close() {
        if (this.db) {
            try {
                this.db.close();
                console.log('[LOCAL-DB] Database closed');
            } catch (e) {
                console.error('[LOCAL-DB] Error closing:', e.message);
            }
            this.db = null;
        }
    }
}

module.exports = LocalDatabase;
