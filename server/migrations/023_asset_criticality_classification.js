// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Migration 023 — Asset Criticality Classification
 * ==================================================
 * Adds CriticalityClass (A/B/C) and CriticalityReason to the Asset table.
 *   A = Critical  — production-stopping; PM frequency tightened 20%
 *   B = Standard  — significant impact; PM frequency unchanged
 *   C = Low Impact — redundant / non-critical; PM frequency relaxed 20%
 * Default is 'C' so existing assets are conservatively classified until reviewed.
 */
const Database = require('better-sqlite3');

module.exports = {
    up: (db) => {
        const columns = db.prepare('PRAGMA table_info(Asset)').all().map(c => c.name.toLowerCase());

        if (!columns.includes('criticalityclass')) {
            db.exec("ALTER TABLE Asset ADD COLUMN CriticalityClass TEXT DEFAULT 'C'");
            console.log('   -> Added CriticalityClass (A/B/C) to Asset');
        }

        if (!columns.includes('criticalityreason')) {
            db.exec('ALTER TABLE Asset ADD COLUMN CriticalityReason TEXT');
            console.log('   -> Added CriticalityReason to Asset');
        }
    }
};
