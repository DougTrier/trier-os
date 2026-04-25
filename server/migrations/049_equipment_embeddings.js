// Copyright © 2026 Trier OS. All Rights Reserved.
// Migration 049 — Equipment embedding table in mfg_master.db
// Stores 768-dim Gemini text-embedding-004 vectors for all MasterEquipment entries.
// Enables cosine-similarity fallback in the scan 404 path.

'use strict';

const path = require('path');
const Database = require('better-sqlite3');

module.exports = function run() {
    const mfgPath = path.join(__dirname, '..', '..', 'data', 'mfg_master.db');
    const mfg = new Database(mfgPath);
    mfg.pragma('journal_mode = WAL');

    const sqliteVec = require('sqlite-vec');
    sqliteVec.load(mfg);

    // Virtual KNN table — one row per MasterEquipment entry.
    // rowid maps to a lookup table so we can JOIN back to EquipmentTypeID.
    mfg.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS equipment_vec
            USING vec0(embedding float[3072]);

        CREATE TABLE IF NOT EXISTS equipment_vec_map (
            rowid   INTEGER PRIMARY KEY AUTOINCREMENT,
            typeId  TEXT NOT NULL UNIQUE,
            inputText TEXT
        );
    `);

    mfg.close();
    console.log('[049] equipment_vec + equipment_vec_map created in mfg_master.db');
};
