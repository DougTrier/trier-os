// Copyright © 2026 Trier OS. All Rights Reserved.
// Migration 047 — CatalogTwins table in mfg_master.db
// Stores discovered 3D models, STEP files, and spec-sheet links for equipment
// types in the master catalog. Separate from per-plant digital_twin_schematics,
// which stores uploaded photos of specific plant assets.

'use strict';

const path = require('path');
const Database = require('better-sqlite3');

module.exports = function run(/* plantDb unused — this migration targets mfg_master.db */) {
    const mfgPath = path.join(__dirname, '..', '..', 'data', 'mfg_master.db');
    const mfg = new Database(mfgPath);
    mfg.pragma('journal_mode = WAL');

    mfg.exec(`
        CREATE TABLE IF NOT EXISTS CatalogTwins (
            TwinID      TEXT PRIMARY KEY,
            RefType     TEXT NOT NULL CHECK(RefType IN ('equipment','part')),
            RefID       TEXT NOT NULL,
            Source      TEXT NOT NULL,
            TwinURL     TEXT NOT NULL,
            TwinFormat  TEXT,
            ConfScore   REAL DEFAULT 0.5,
            Metadata    TEXT DEFAULT '{}',
            Validated   INTEGER DEFAULT 0,
            DiscoveredAt TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_catalog_twins_ref
            ON CatalogTwins(RefType, RefID);

        CREATE INDEX IF NOT EXISTS idx_catalog_twins_source
            ON CatalogTwins(Source);
    `);

    mfg.close();
    console.log('[047] CatalogTwins table created in mfg_master.db');
};
