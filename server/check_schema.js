// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Schema Validation Utility
 * ==================================================
 * Dev-time utility that prints the column layout of a specified SQLite table.
 * Used during development to verify migration results and debug schema issues.
 * Not loaded at runtime — run manually via: node server/check_schema.js
 */
const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, '..', 'data', 'Demo_Plant_1.db');
console.log('Opening DB at:', dbPath);
const db = new Database(dbPath);
try {
    const info = db.prepare('PRAGMA table_info(Users)').all();
    console.log(JSON.stringify(info, null, 2));
} catch (e) {
    console.error(e);
}
db.close();
