// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Migration 012 — Add Manufacturer ID Column
 * ==============================================================
 * Adds Manufacturer column to the Asset and Part tables for equipment origin tracking.
 */
// Ensure ManufID exists in Part table for all plant databases
module.exports = {
    up: (db) => {
        try {
            db.prepare('ALTER TABLE Part ADD COLUMN ManufID TEXT').run();
            console.log('   -> Added ManufID column to Part table.');
        } catch (err) {
            if (err.message.includes('duplicate column name')) {
                // Already exists, ignore
            } else {
                console.warn('   -> Could not add ManufID column (table may be missing or column exists):', err.message);
            }
        }
    }
};
