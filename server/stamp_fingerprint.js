// Copyright © 2026 Trier OS. All Rights Reserved.

/*
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Stamps the mfg_master.db with an UNTOUCHABLE fingerprint.
 * This creates a hidden integrity marker table that the server
 * checks on every startup. If this table is missing, the server
 * knows the database has been tampered with or replaced.
 */
const Database = require('better-sqlite3');
const path = require('path');
const dataDir = require('./resolve_data_dir');
const db = new Database(path.join(dataDir, 'mfg_master.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS _MASTER_DB_FINGERPRINT (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    guardian TEXT NOT NULL DEFAULT 'UNTOUCHABLE',
    description TEXT NOT NULL DEFAULT 'Dairy Industry Master Data Catalog - DO NOT DELETE',
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL DEFAULT 'Doug Trier / Trier OS Enterprise System',
    warning TEXT NOT NULL DEFAULT '🚨 THIS DATABASE IS PROTECTED. Deleting or truncating it will prevent the server from starting. Restore from git if damaged.'
);
`);

// Insert or verify the fingerprint
const existing = db.prepare('SELECT * FROM _MASTER_DB_FINGERPRINT WHERE id = 1').get();
if (!existing) {
    db.prepare(`INSERT INTO _MASTER_DB_FINGERPRINT (id, guardian, description, created_at, created_by, warning)
        VALUES (1, 'UNTOUCHABLE', 'Dairy Industry Master Data Catalog - 215 equipment types, 505 parts, 48 warranties, 50 vendors', ?, 'Doug Trier / Trier OS Enterprise System', '🚨 THIS DATABASE IS PROTECTED. Deleting or truncating will prevent server startup.')`)
        .run(new Date().toISOString());
    console.log('✅ UNTOUCHABLE fingerprint stamped into mfg_master.db');
} else {
    console.log('✅ UNTOUCHABLE fingerprint already present');
    console.log(`   Guardian: ${existing.guardian}`);
    console.log(`   Created: ${existing.created_at}`);
    console.log(`   By: ${existing.created_by}`);
}

// Final audit
const parts = db.prepare('SELECT COUNT(*) as c FROM MasterParts').get().c;
const equip = db.prepare('SELECT COUNT(*) as c FROM MasterEquipment').get().c;
const vendors = db.prepare('SELECT COUNT(*) as c FROM MasterVendors').get().c;
const warr = db.prepare('SELECT COUNT(*) as c FROM MasterWarrantyTemplates').get().c;
const xref = db.prepare('SELECT COUNT(*) as c FROM MasterCrossRef').get().c;
const specsFull = db.prepare(`SELECT COUNT(*) as c FROM MasterEquipment WHERE Specifications IS NOT NULL AND Specifications != ''`).get().c;
console.log(`\n🏆 MASTER DATA CATALOG — PROTECTED`);
console.log(`   🔧 ${parts} Parts`);
console.log(`   🏭 ${equip} Equipment Types (${specsFull} with specs)`);
console.log(`   🏢 ${vendors} Vendors`);
console.log(`   🛡️ ${warr} Warranty Templates`);
console.log(`   🔗 ${xref} Cross-References`);
console.log(`   🔒 Guardian: UNTOUCHABLE`);

db.close();
