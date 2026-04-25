// Copyright © 2026 Trier OS. All Rights Reserved.
// Migration 055 — WO Outcome Tracking (Phase 2, Better Scan Flow)
//
// Creates work_order_outcome in all plant DBs.
// Adds ResolutionWindowMin to MasterEquipment in mfg_master.db.
//
// Schema contract (Resolved column):
//   NULL  = provisional — window not expired yet
//   1     = resolved — no follow-up WO opened within window
//   0     = failed/reopened — follow-up WO opened within window
//
// Finalization is handled by the background pass in outcomeTracker.js,
// not inline on WO close. This keeps the signal honest.

'use strict';

const path     = require('path');
const Database = require('better-sqlite3');
const fs       = require('fs');

function migrateMfgMaster(dbPath) {
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    try {
        db.prepare('ALTER TABLE MasterEquipment ADD COLUMN ResolutionWindowMin INTEGER DEFAULT 60').run();
        console.log('[055] ResolutionWindowMin added → mfg_master.db');
    } catch {
        // column already exists — idempotent
    }
    db.close();
}

function migratePlant(dbPath) {
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    db.exec(`
        CREATE TABLE IF NOT EXISTS work_order_outcome (
            WorkOrderID         INTEGER PRIMARY KEY,
            AssetID             TEXT    NOT NULL,
            EquipmentTypeID     TEXT,
            CompletedAt         TEXT    NOT NULL,
            ResolutionWindowMin INTEGER NOT NULL,
            Resolved            INTEGER,
            FollowupWorkOrderID INTEGER,
            ResolutionTimeSec   INTEGER,
            CreatedAt           TEXT    DEFAULT CURRENT_TIMESTAMP,
            FinalizedAt         TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_outcome_asset
            ON work_order_outcome(AssetID);

        CREATE INDEX IF NOT EXISTS idx_outcome_pending
            ON work_order_outcome(AssetID, CompletedAt);
    `);

    db.close();
}

module.exports = function run() {
    const dataDir = path.join(__dirname, '..', '..', 'data');

    // mfg_master.db: add ResolutionWindowMin column
    const mfgPath = path.join(dataDir, 'mfg_master.db');
    if (fs.existsSync(mfgPath)) {
        try {
            migrateMfgMaster(mfgPath);
        } catch (e) {
            console.warn(`[055] mfg_master.db skipped: ${e.message}`);
        }
    }

    // Plant DBs: create work_order_outcome
    const EXCLUDE = ['mfg_master', 'trier_logistics', 'auth_db', 'schema_template', 'corporate_master'];
    const targets = fs.readdirSync(dataDir)
        .filter(f => f.endsWith('.db') && !EXCLUDE.some(ex => f.includes(ex)))
        .map(f => path.join(dataDir, f));

    for (const dbPath of targets) {
        try {
            migratePlant(dbPath);
            console.log(`[055] work_order_outcome created → ${path.basename(dbPath)}`);
        } catch (e) {
            console.warn(`[055] Skipped ${path.basename(dbPath)}: ${e.message}`);
        }
    }
};
