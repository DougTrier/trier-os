// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Data Normalization Finalizer
 * ==================================================
 * One-time migration script that normalizes legacy MP2/Tabware data into
 * the standardized Trier OS schema. Handles column renaming, type
 * conversion, and lookup table population.
 *
 * Run manually: node server/finalize_normalization.js
 */
/**
 * Phase 7 - Final Global Normalization
 * Renames all 'Descript' columns to 'Description' across all tables in all databases.
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dataDir = require('./resolve_data_dir');
const dbFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.db') && !f.includes('trier_'));

console.log(`Starting global normalization on ${dbFiles.length} databases...`);

dbFiles.forEach(dbFile => {
    const dbPath = path.join(dataDir, dbFile);
    console.log(`Processing ${dbFile}...`);
    const db = new Database(dbPath);

    try {
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();

        for (const table of tables) {
            const cols = db.prepare(`PRAGMA table_info("${table.name}")`).all();
 /* dynamic col/table - sanitize inputs */
            const hasDescript = cols.some(c => c.name === 'Descript');

            if (hasDescript) {
                console.log(`  Normalizing table ${table.name}...`);
                try {
                    db.exec(`ALTER TABLE "${table.name}" RENAME COLUMN "Descript" TO "Description"`);
                } catch (e) {
                    console.error(`    Failed to rename column in ${table.name}: ${e.message}`);
                }
            }
        }

        // Also run VACUUM as part of Phase 7 Step 4
        console.log(`  Vacuuming ${dbFile}...`);
        db.exec('VACUUM');

    } catch (err) {
        console.error(`  Error processing ${dbFile}: ${err.message}`);
    } finally {
        db.close();
    }
});

console.log('Global normalization and vacuum complete.');
