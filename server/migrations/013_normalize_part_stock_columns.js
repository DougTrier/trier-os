// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Migration 013 — Normalize Part Stock Columns
 * ================================================================
 * Standardizes inventory quantity column names across plant databases.
 */
/**
 * 013_normalize_part_stock_columns.js
 * Ensures 'Stock' exist in all Part tables and mirrors legacy 'OnHand' values.
 * This fixes the 401/Search errors caused by cross-site schema drift.
 */

module.exports = {
    up: (db) => {
        try {
            const table = 'Part';
            const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
            if (!tableExists) return;

            const columns = db.prepare(`PRAGMA table_info("${table}")`).all().map(c => c.name.toLowerCase()); /* dynamic col/table - sanitize inputs */

            if (!columns.includes('stock')) {
                console.log('   -> Missing [Stock] column. Adding it now...');
                db.exec(`ALTER TABLE "${table}" ADD COLUMN Stock REAL DEFAULT 0`);
                
                // If the old column exists, migrate the data
                if (columns.includes('onhand')) {
                    console.log('   -> Found [OnHand] data. Migrating to [Stock]...');
                    db.prepare(`UPDATE "${table}" SET Stock = OnHand`).run(); /* dynamic col/table - sanitize inputs */
                }
            } else {
                // If Stock exists but is empty/zero AND OnHand has data, we might want a one-time sync
                // but for now, the primary goal is preventing query crashes.
            }

        } catch (err) {
            console.warn('   -> Potential schema mismatch in Part table:', err.message);
        }
    }
};
