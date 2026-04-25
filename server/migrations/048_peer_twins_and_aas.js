// Copyright © 2026 Trier OS. All Rights Reserved.
// Migration 048 — PeerTwins (trier_logistics.db) + AAS fields on CatalogTwins
//
// CatalogTwins gets SubmodelType to distinguish geometry from nameplate from docs.
// PeerTwins (in logistics_db) enables cross-plant twin shadowing: when Plant A's
// tech links a twin for equipment type X, all plants with that equipment type see it.

'use strict';

const path = require('path');
const Database = require('better-sqlite3');

module.exports = function run(/* plantDb unused */) {
    // ── 1. Extend mfg_master CatalogTwins with AAS submodel type ────────────
    const mfgPath = path.join(__dirname, '..', '..', 'data', 'mfg_master.db');
    const mfg = new Database(mfgPath);
    mfg.pragma('journal_mode = WAL');
    mfg.exec(`
        ALTER TABLE CatalogTwins ADD COLUMN SubmodelType TEXT DEFAULT 'Geometry';
        ALTER TABLE CatalogTwins ADD COLUMN AAS_ID TEXT;
    `);
    mfg.close();
    console.log('[048] CatalogTwins: added SubmodelType, AAS_ID columns');

    // ── 2. PeerTwins in trier_logistics.db (cross-plant shadowing) ───────────
    const logPath = path.join(__dirname, '..', '..', 'data', 'trier_logistics.db');
    const log = new Database(logPath);
    log.pragma('journal_mode = WAL');
    log.exec(`
        CREATE TABLE IF NOT EXISTS PeerTwins (
            TwinID          TEXT PRIMARY KEY,
            RefType         TEXT NOT NULL CHECK(RefType IN ('equipment','part')),
            RefID           TEXT NOT NULL,
            ContributorPlantID   TEXT NOT NULL,
            ContributorUserID    TEXT NOT NULL,
            TwinURL         TEXT NOT NULL,
            TwinFormat      TEXT,
            SubmodelType    TEXT DEFAULT 'Geometry',
            ConfScore       REAL DEFAULT 0.7,
            PeerVerified    INTEGER DEFAULT 0,
            VerifiedByPlants TEXT DEFAULT '[]',
            CreatedAt       TEXT DEFAULT (datetime('now')),
            UpdatedAt       TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_peer_twins_ref
            ON PeerTwins(RefType, RefID);

        CREATE INDEX IF NOT EXISTS idx_peer_twins_plant
            ON PeerTwins(ContributorPlantID);
    `);
    log.close();
    console.log('[048] PeerTwins table created in trier_logistics.db');
};
