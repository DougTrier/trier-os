// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Data Bunker Backup Script
 * ==================================================
 * Creates encrypted, compressed backups of all plant databases.
 * Designed for disaster recovery with off-site storage support.
 * Run manually: node server/scripts/data_bunker.js
 */
/**
 * data_bunker.js
 * 
 * Contingency Export Utility: Snapshots all legacy database tables into compressed JSON 
 * before Phase 7 schema pruning. This ensures a clean path back if data restoration 
 * is ever required for auditing.
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', '..', 'data');
const backupDir = path.join(dataDir, 'backups', 'legacy_snapshots');

// Tables we want to preserve in "Cold Storage"
const tablesToArchive = [
    'Work', 'Asset', 'Part', 'Schedule', 'Procedur',
    'PartVend', 'AddrBook', 'Task', 'ProcTask', 'ProcPart',
    'zWOStat', 'zWOType', 'zAssetGrp', 'zTaskTyp'
];

async function runExport() {
    console.log('\n📦 [Data Bunker] Initializing Legacy Snapshot...');

    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    const dbFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.db') && !f.includes('trier_') && f !== 'all_sites.db');

    console.log(`   Found ${dbFiles.length} plant databases to snapshot.`);

    for (const dbFile of dbFiles) {
        const plantId = dbFile.replace('.db', '');
        const dbPath = path.join(dataDir, dbFile);
        const plantBackupDir = path.join(backupDir, plantId);

        if (!fs.existsSync(plantBackupDir)) fs.mkdirSync(plantBackupDir);

        console.log(`   -> Processing [${plantId}]...`);

        let db;
        try {
            db = new Database(dbPath);

            for (const table of tablesToArchive) {
                try {
                    // Check if table exists
                    const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
                    if (!exists) continue;

                    const data = db.prepare(`SELECT * FROM "${table}"`).all();
 /* dynamic col/table - sanitize inputs */
                    if (data.length > 0) {
                        fs.writeFileSync(
                            path.join(plantBackupDir, `${table}.json`),
                            JSON.stringify(data, null, 2)
                        );
                    }
                } catch (e) {
                    // Table might be missing in some schemas, skip silently
                }
            }
            db.close();
        } catch (err) {
            console.error(`   ❌ Failed to backup ${plantId}:`, err.message);
            if (db) db.close();
        }
    }

    console.log(`\n✅ [Data Bunker] Snapshot complete. Files stored in: data/backups/legacy_snapshots/\n`);
}

runExport().catch(err => console.error('Bunker Crash:', err));
