// Copyright © 2026 Trier OS. All Rights Reserved.
/**
 * Trier OS — Usage Metering Cron Service
 * =========================================
 * Records daily usage snapshots into UsageMeter in trier_logistics.db.   
 * Runs once at startup (for yesterday) then nightly at midnight.
 * Idempotent: INSERT OR IGNORE prevents duplicate records.
 *
 * Metrics recorded per daily run:
 *   api_calls    — delta of SUM(request_count) from api_keys since last  
 * snapshot
 *   active_users — COUNT(DISTINCT UserID) from AuditLog for the period   
 *   storage_mb   — total size of all .db/.sqlite files in data dir       
 * (point-in-time)
 *   seat_count   — COUNT(*) from Users table (point-in-time)
 *
 * Per-plant rows also recorded for:
 *   active_users — per plant from AuditLog
 *   storage_mb   — per plant DB file size
 */

const fs = require('fs');
const path = require('path');
const logisticsDb = require('../logistics_db').db;
const authDb = require('../auth_db');
const dataDir = require('../resolve_data_dir');
const { getPlants } = require('../plant_cache');

function recordDailySnapshot(periodStart, periodEnd) {
    // ── api_calls (delta from last snapshot) ──────────────────────────────
    const currentTotalRow = logisticsDb.prepare(
        'SELECT COALESCE(SUM(request_count), 0) as total FROM api_keys'   
    ).get();
    const currentTotal = currentTotalRow ? currentTotalRow.total : 0;

    const lastSnap = logisticsDb.prepare(
        `SELECT Value FROM UsageMeter WHERE Metric = 'api_calls' AND PlantID IS NULL ORDER BY PeriodStart DESC LIMIT 1`
    ).get();
    
    // Delta: how many calls happened since the last snapshot.
    // First-ever run: record the running total as-is.
    const apiCallsDelta = lastSnap ? Math.max(0, currentTotal - lastSnap.Value) : currentTotal;

    // ── active_users (AuditLog distinct users in period) ──────────────────
    const activeUsersRow = logisticsDb.prepare(
        `SELECT COUNT(DISTINCT UserID) as c FROM AuditLog WHERE Timestamp >= ? AND Timestamp <= ? AND UserID IS NOT NULL`  
    ).get(periodStart, periodEnd);
    const activeUsers = activeUsersRow ? activeUsersRow.c : 0;

    // ── storage_mb (all DB files, point-in-time) ──────────────────────────
    let storageBytes = 0;
    try {
        for (const f of fs.readdirSync(dataDir)) {
            if (f.endsWith('.db') || f.endsWith('.sqlite')) {
                storageBytes += fs.statSync(path.join(dataDir, f)).size;  
            }
        }
        const uploadsDir = path.join(dataDir, 'uploads');
        if (fs.existsSync(uploadsDir)) {
            for (const f of fs.readdirSync(uploadsDir)) {
                const stat = fs.statSync(path.join(uploadsDir, f));       
                if (stat.isFile()) storageBytes += stat.size;
            }
        }
    } catch (e) { /* non-critical */ }
    const storageMb = parseFloat((storageBytes / (1024 * 1024)).toFixed(2));

    // ── seat_count (Users table, point-in-time) ───────────────────────────
    const seatCountRow = authDb.prepare('SELECT COUNT(*) as c FROM Users').get();
    const seatCount = seatCountRow ? seatCountRow.c : 0;

    // ── Write aggregate rows ──────────────────────────────────────────────
    const insert = logisticsDb.prepare(`
        INSERT OR IGNORE INTO UsageMeter
            (PeriodStart, PeriodEnd, Metric, PlantID, Value, Unit, RecordedAt)
        VALUES (?, ?, ?, NULL, ?, ?, datetime('now'))
    `);

    logisticsDb.transaction(() => {
        insert.run(periodStart, periodEnd, 'api_calls',    apiCallsDelta, 'requests');
        insert.run(periodStart, periodEnd, 'active_users', activeUsers,   'users');
        insert.run(periodStart, periodEnd, 'storage_mb',   storageMb,     'MB');
        insert.run(periodStart, periodEnd, 'seat_count',   seatCount,     'seats');
    })();

    // ── Write per-plant rows for active_users and storage_mb ─────────────
    const insertPlant = logisticsDb.prepare(`
        INSERT OR IGNORE INTO UsageMeter
            (PeriodStart, PeriodEnd, Metric, PlantID, Value, Unit, RecordedAt)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    const plants = getPlants().filter(p => p.id !== 'all_sites');
    for (const plant of plants) {
        const pid = plant.id;

        const plantUsersRow = logisticsDb.prepare(
            `SELECT COUNT(DISTINCT UserID) as c FROM AuditLog
             WHERE Timestamp >= ? AND Timestamp <= ? AND PlantID = ? AND UserID IS NOT NULL`
        ).get(periodStart, periodEnd, pid);
        const plantUsers = plantUsersRow ? plantUsersRow.c : 0;

        let plantMb = 0;
        try {
            const dbPath = path.join(dataDir, `${pid}.db`);
            if (fs.existsSync(dbPath)) {
                plantMb = parseFloat((fs.statSync(dbPath).size / (1024 * 1024)).toFixed(2));
            }
        } catch (e) { /* skip */ }

        logisticsDb.transaction(() => {
            insertPlant.run(periodStart, periodEnd, 'active_users', pid, plantUsers, 'users');
            insertPlant.run(periodStart, periodEnd, 'storage_mb',   pid, plantMb,    'MB');
        })();
    }

    console.log(`[USAGE_METER] Snapshot recorded for ${periodStart}`);    
}

function startMeteringCron() {
    // Run immediately for yesterday (covers server downtime gaps)        
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yDate = yesterday.toISOString().slice(0, 10);
    recordDailySnapshot(`${yDate}T00:00:00.000Z`, `${yDate}T23:59:59.999Z`);

    // Schedule nightly at midnight UTC
    function scheduleNextRun() {
        const now = new Date();
        const nextMidnight = new Date(Date.UTC(
            now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1 
        ));
        const msUntilMidnight = nextMidnight.getTime() - now.getTime();   

        setTimeout(() => {
            const d = new Date();
            d.setUTCDate(d.getUTCDate() - 1);
            const date = d.toISOString().slice(0, 10);
            try {
                recordDailySnapshot(`${date}T00:00:00.000Z`, `${date}T23:59:59.999Z`);
            } catch (err) {
                console.error('[USAGE_METER] Daily snapshot failed:', err.message);
            }
            scheduleNextRun();  // reschedule for the next midnight       
        }, msUntilMidnight);
    }

    scheduleNextRun();
    console.log('[USAGE_METER] Metering cron started');
}

module.exports = { startMeteringCron, recordDailySnapshot };
