// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Migration 021 — Warranty Tracker Fields
 * ==========================================================
 * Adds warranty tracking columns to the Asset table:
 *   - WarrantyStart: Start date of warranty coverage
 *   - WarrantyEnd:   End date of warranty coverage
 *   - WarrantyVendor: Vendor/manufacturer providing the warranty
 *   - WarrantyTerms: Free-text description of warranty terms/conditions
 */

module.exports = {
    up: (db) => {
        const cols = [
            ['WarrantyStart', 'TEXT DEFAULT NULL'],
            ['WarrantyEnd',   'TEXT DEFAULT NULL'],
            ['WarrantyVendor','TEXT DEFAULT NULL'],
            ['WarrantyTerms', 'TEXT DEFAULT NULL']
        ];

        for (const [name, type] of cols) {
            try {
                db.exec(`ALTER TABLE Asset ADD COLUMN ${name} ${type}`);
                console.log(`   -> Added ${name} column to Asset`);
            } catch (e) {
                if (!e.message.includes('duplicate column')) {
                    console.warn(`   -> ${name} column:`, e.message);
                }
            }
        }
    }
};
