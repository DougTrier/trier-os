// Copyright © 2026 Trier OS. All Rights Reserved.
// Migration 056 — Artifact local storage layer
//
// Adds local file ownership columns to catalog_artifacts (mfg_master.db)
// and plant_artifacts (per-plant DBs):
//
//   local_path   TEXT    — relative path under data/artifacts/
//   mime_type    TEXT    — detected MIME type
//   is_local     INT     — 1 = file is on this server, 0 = external reference only
//   external_url TEXT    — original scraped/discovered URL (preserved for reference)
//   file_name    TEXT    — original uploaded filename
//   file_size    INT     — bytes on disk
//
// FileURL is kept as-is for backwards compat; external_url mirrors it for new code.
// Runs against every DB; skips tables that don't exist in that DB.

'use strict';

module.exports = {
    up(db) {
        function addCols(table) {
            const exists = db.prepare(
                `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
            ).get(table);
            if (!exists) return;

            const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);

            if (!cols.includes('local_path'))   db.exec(`ALTER TABLE ${table} ADD COLUMN local_path   TEXT`);
            if (!cols.includes('mime_type'))    db.exec(`ALTER TABLE ${table} ADD COLUMN mime_type    TEXT`);
            if (!cols.includes('is_local'))     db.exec(`ALTER TABLE ${table} ADD COLUMN is_local     INTEGER DEFAULT 0`);
            if (!cols.includes('file_name'))    db.exec(`ALTER TABLE ${table} ADD COLUMN file_name    TEXT`);
            if (!cols.includes('file_size'))    db.exec(`ALTER TABLE ${table} ADD COLUMN file_size    INTEGER`);
            if (!cols.includes('external_url')) {
                db.exec(`ALTER TABLE ${table} ADD COLUMN external_url TEXT`);
                // Preserve existing FileURL as the external reference
                db.exec(`UPDATE ${table} SET external_url = FileURL WHERE external_url IS NULL AND FileURL IS NOT NULL`);
            }
        }

        addCols('catalog_artifacts');  // mfg_master.db
        addCols('plant_artifacts');    // per-plant DBs
    },
};
