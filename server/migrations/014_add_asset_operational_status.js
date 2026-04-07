// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Migration 014 — Add Asset Operational Status
 * ================================================================
 * Adds OperationalStatus column (In Production / Spare / Retired) to Assets.
 */
/**
 * 014_add_asset_operational_status.js
 * Adds 'OperationalStatus' to the Asset table to track 'In Production' vs 'Spare'.
 */

module.exports = {
    up: (db) => {
        try {
            const table = 'Asset';
            const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
            if (!tableExists) return;

            const columns = db.prepare(`PRAGMA table_info("${table}")`).all().map(c => c.name.toLowerCase()); /* dynamic col/table - sanitize inputs */

            if (!columns.includes('operationalstatus')) {
                console.log('   -> Adding [OperationalStatus] column to Asset table...');
                db.exec(`ALTER TABLE "${table}" ADD COLUMN OperationalStatus TEXT DEFAULT 'In Production'`);
            }
        } catch (err) {
            console.warn('   -> Potential schema mismatch in Asset table:', err.message);
        }
    }
};
