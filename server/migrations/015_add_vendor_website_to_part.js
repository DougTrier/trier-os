// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Migration 015 — Add Vendor Website to Part
 * ==============================================================
 * Adds VendorWebsite column to the Part table for vendor link enrichment.
 */
/**
 * 015_add_vendor_website_to_part.js
 * Adds VendorWebsite column to the Part table and ensures AddrBook uses consistent naming.
 */

module.exports = {
    up: (db) => {
        // 1. Add VendorWebsite to Part table if missing
        const partCols = db.prepare('PRAGMA table_info(Part)').all().map(c => c.name);
        if (!partCols.includes('VendorWebsite')) {
            db.exec('ALTER TABLE Part ADD COLUMN VendorWebsite TEXT');
        }

        // 2. Ensure AddrBook has Website (only if AddrBook table exists in this database)
        const hasAddrBook = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='AddrBook'").get();
        if (hasAddrBook) {
            const addrCols = db.prepare('PRAGMA table_info(AddrBook)').all().map(c => c.name);
            if (!addrCols.includes('Website')) {
                db.exec('ALTER TABLE AddrBook ADD COLUMN Website TEXT');
            }
        }

        // 3. Fix potential confusion between VendID and VendorID in whitelist/code
        // We stick with VendID as the primary column name for Part table as per schema
    }
};
