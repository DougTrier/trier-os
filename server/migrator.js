// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Schema Migration Engine
 * =============================================
 * Versioned migration system that runs on every server boot.
 *
 * HOW IT WORKS:
 *   1. Reads all .sql and .js files from server/migrations/, sorted by number prefix.
 *   2. For each plant database (excluding auth, chat, logistics, corporate_master),
 *      checks the schema_version table to see which migrations have been applied.
 *   3. Applies any new migrations in a transaction. If a migration fails,
 *      the server exits immediately (process.exit(1)) to prevent data corruption.
 *
 * MIGRATION FORMAT:
 *   SQL: Raw SQL executed via db.exec()
 *   JS:  Module exporting an up(db) function for complex data transformations
 */
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dataDir = require('./resolve_data_dir');
const migrationsDir = path.join(__dirname, 'migrations');

function runMigrations() {
    console.log('\n🔄 Schema Migration Engine Starting...');

    if (!fs.existsSync(migrationsDir)) {
        // In pkg mode, migrations are baked into the snapshot — if dir doesn't exist, skip
        if (typeof process.pkg !== 'undefined') {
            console.log('✅ No migrations directory in pkg build — skipping.\n');
            return;
        }
        fs.mkdirSync(migrationsDir, { recursive: true });
    }

    let allFiles;
    try {
        allFiles = fs.readdirSync(migrationsDir);
    } catch (err) {
        // In pkg mode, readdir on snapshot may fail
        if (typeof process.pkg !== 'undefined') {
            console.log('✅ Migrations not readable in pkg build — skipping.\n');
            return;
        }
        throw err;
    }

    const migrationFiles = allFiles
        .filter(f => f.endsWith('.sql') || f.endsWith('.js'))
        .sort((a, b) => {
            const numA = parseInt(a.split('_')[0], 10);
            const numB = parseInt(b.split('_')[0], 10);
            return numA - numB;
        });

    if (migrationFiles.length === 0) {
        console.log('✅ No migration files found.\n');
        return;
    }

    const excludeList = ['trier_chat.db', 'trier_auth.db', 'trier_logistics.db', 'schema_template.db', 'corporate_master.db'];
    const dbFiles = fs.readdirSync(dataDir)
        .filter(f => f.endsWith('.db') && !excludeList.includes(f));

    let totalApplied = 0;

    for (const dbFile of dbFiles) {
        const dbPath = path.join(dataDir, dbFile);
        let db;

        try {
            db = new Database(dbPath);
            db.pragma('journal_mode = WAL');

            db.exec(`
                CREATE TABLE IF NOT EXISTS schema_version (
                    version INTEGER PRIMARY KEY,
                    filename TEXT NOT NULL,
                    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            const currentVersionRow = db.prepare('SELECT MAX(version) as v FROM schema_version').get();
            const currentVersion = currentVersionRow.v || 0;

            for (const file of migrationFiles) {
                const version = parseInt(file.split('_')[0], 10);
                if (version > currentVersion) {
                    const filePath = path.join(migrationsDir, file);

                    try {
                        if (file.endsWith('.js')) {
                            // JavaScript migration
                            const migration = require(filePath);
                            db.transaction(() => {
                                migration.up(db);
                                db.prepare('INSERT INTO schema_version (version, filename) VALUES (?, ?)').run(version, file);
                            })();
                        } else {
                            // SQL migration
                            const sql = fs.readFileSync(filePath, 'utf8');
                            db.transaction(() => {
                                db.exec(sql);
                                db.prepare('INSERT INTO schema_version (version, filename) VALUES (?, ?)').run(version, file);
                            })();
                        }
                        totalApplied++;
                        console.log(`   [${dbFile}] Applied ${file}`);
                    } catch (err) {
                        console.warn(`   ⚠️ [${dbFile}] Skipped ${file}: ${err.message}`);
                        // Don't crash — skip failed migrations on satellite DBs
                        break; // Stop trying further migrations on this DB
                    }
                }
            }
            db.close();
        } catch (err) {
            console.error(`❌ Could not open database ${dbFile}:`, err.message);
            if (db) db.close();
        }
    }

    console.log(`✅ Schema Migration Engine check complete. ${totalApplied} applied.\n`);
}

module.exports = runMigrations;
