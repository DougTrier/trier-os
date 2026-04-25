// Copyright © 2026 Trier OS. All Rights Reserved.
// Migration 052 — Cross-plant failure analytics table in trier_logistics.db
// PlantFailureEvents aggregates normalized WO failures from all plants
// so the corporate analytics endpoint can query across sites.

'use strict';

const path     = require('path');
const Database = require('better-sqlite3');

module.exports = function run() {
    const logisticsPath = path.join(__dirname, '..', '..', 'data', 'trier_logistics.db');
    const db = new Database(logisticsPath);
    db.pragma('journal_mode = WAL');

    db.exec(`
        CREATE TABLE IF NOT EXISTS PlantFailureEvents (
            EventID         INTEGER PRIMARY KEY AUTOINCREMENT,
            PlantID         TEXT NOT NULL,
            WoID            TEXT NOT NULL,
            AssetID         TEXT,
            EquipmentTypeID TEXT,
            FailureMode     TEXT,          -- normalized_mode e.g. BEARING_FAILURE
            FailureClass    TEXT,          -- MECHANICAL | ELECTRICAL | ...
            Severity        TEXT,          -- Low | Medium | High | Critical
            OccurredAt      TEXT NOT NULL,
            ClosedAt        TEXT,
            GeminiConfidence REAL,         -- 0-1 confidence of Gemini normalization
            RawNotes        TEXT,
            CreatedAt       TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_pfe_plant     ON PlantFailureEvents(PlantID);
        CREATE INDEX IF NOT EXISTS idx_pfe_mode      ON PlantFailureEvents(FailureMode);
        CREATE INDEX IF NOT EXISTS idx_pfe_class     ON PlantFailureEvents(FailureClass);
        CREATE INDEX IF NOT EXISTS idx_pfe_equip     ON PlantFailureEvents(EquipmentTypeID);
        CREATE INDEX IF NOT EXISTS idx_pfe_occurred  ON PlantFailureEvents(OccurredAt);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_pfe_wo_plant
            ON PlantFailureEvents(PlantID, WoID);
    `);

    db.close();
    console.log('[052] PlantFailureEvents created in trier_logistics.db');
};
