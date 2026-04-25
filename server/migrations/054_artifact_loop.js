// Copyright © 2026 Trier OS. All Rights Reserved.
// Migration 054 — Artifact intelligence feedback loop
//
// Adds three tables that close the artifact → action → outcome → learning loop:
//
//   mfg_master.db:
//     artifact_context_map  — triggers (failure_mode/procedure/state) → artifact_id or pattern rules
//     artifact_revision     — version history; only active+latest shown by default
//
//   per-plant DBs:
//     artifact_usage        — tracks each time an artifact was opened + whether it resolved the issue
//
// Also adds Version + IsActive columns to catalog_artifacts (soft revision support).

'use strict';

const path     = require('path');
const Database = require('better-sqlite3');
const fs       = require('fs');

// ── Failure mode → most useful artifact type for field techs ──────────────
// Used to seed artifact_context_map with class-level rules (artifact_id = NULL means
// "surface any artifact of this type for this equipment type").
const FAILURE_TYPE_MAP = {
    BEARING_FAILURE:       ['cad', 'manual'],
    SEAL_LEAK:             ['cad', 'schematic'],
    MISALIGNMENT:          ['manual', 'schematic'],
    BELT_FAILURE:          ['cad', 'manual'],
    CHAIN_SPROCKET_WEAR:   ['cad', 'manual'],
    GEARBOX_FAILURE:       ['cad', 'manual'],
    COUPLING_FAILURE:      ['cad'],
    SHAFT_FAILURE:         ['cad'],
    EXCESSIVE_VIBRATION:   ['schematic', 'nameplate'],
    GENERAL_WEAR:          ['manual'],
    MOTOR_BURNOUT:         ['manual', 'nameplate'],
    VFD_DRIVE_FAULT:       ['manual', 'nameplate'],
    WIRING_FAULT:          ['schematic'],
    SENSOR_FAILURE:        ['manual', 'nameplate'],
    CONTROL_SYSTEM_FAULT:  ['manual', 'schematic'],
    FUSE_BREAKER_TRIP:     ['schematic', 'nameplate'],
    LOSS_OF_PRESSURE:      ['schematic', 'cad'],
    LOSS_OF_FLOW:          ['schematic', 'cad'],
    TEMPERATURE_DEVIATION: ['nameplate', 'schematic'],
    HYDRAULIC_LEAK:        ['cad', 'schematic'],
    HYDRAULIC_PUMP_FAILURE:['cad', 'manual'],
    HYDRAULIC_VALVE_FAILURE:['cad', 'schematic'],
    AIR_LEAK:              ['schematic'],
    LOSS_OF_PRESSURE:      ['schematic', 'cad'],
    CONTAMINATION:         ['manual', 'schematic'],
    BLOCKAGE:              ['schematic', 'cad'],
    CORROSION:             ['manual', 'nameplate'],
    FATIGUE_CRACK:         ['cad', 'manual'],
    OVERTEMPERATURE:       ['nameplate', 'schematic'],
    COOLING_FAILURE:       ['cad', 'schematic'],
};

// ── Global catalog (mfg_master.db) ──────────────────────────────────────────
function migrateGlobal() {
    const mfgPath = path.join(__dirname, '..', '..', 'data', 'mfg_master.db');
    const db = new Database(mfgPath);
    db.pragma('journal_mode = WAL');

    // 1. Context map
    db.exec(`
        CREATE TABLE IF NOT EXISTS artifact_context_map (
            MapID           INTEGER PRIMARY KEY AUTOINCREMENT,
            ArtifactID      INTEGER,            -- NULL = class rule (match by ArtifactType below)
            EntityID        TEXT,               -- NULL = applies to all equipment
            ArtifactType    TEXT,               -- target type when ArtifactID is NULL
            TriggerType     TEXT NOT NULL,      -- failure_mode | failure_class | state | procedure
            TriggerValue    TEXT NOT NULL,      -- e.g. SEAL_LEAK | MECHANICAL | maintenance
            Priority        INTEGER DEFAULT 5,  -- 1 = highest (shown first)
            FOREIGN KEY(ArtifactID) REFERENCES catalog_artifacts(ArtifactID) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_acm_trigger ON artifact_context_map(TriggerType, TriggerValue);
        CREATE INDEX IF NOT EXISTS idx_acm_entity  ON artifact_context_map(EntityID);
    `);

    // 2. Revision support on catalog_artifacts
    const cols = db.prepare('PRAGMA table_info(catalog_artifacts)').all().map(c => c.name);
    if (!cols.includes('Version'))      db.exec(`ALTER TABLE catalog_artifacts ADD COLUMN Version TEXT DEFAULT '1.0'`);
    if (!cols.includes('IsActive'))     db.exec(`ALTER TABLE catalog_artifacts ADD COLUMN IsActive INTEGER DEFAULT 1`);
    if (!cols.includes('SupersededBy')) db.exec(`ALTER TABLE catalog_artifacts ADD COLUMN SupersededBy INTEGER`);

    // 3. Seed class-level context rules from failure taxonomy
    const insertRule = db.prepare(`
        INSERT OR IGNORE INTO artifact_context_map
            (ArtifactID, EntityID, ArtifactType, TriggerType, TriggerValue, Priority)
        VALUES (NULL, NULL, ?, ?, ?, ?)
    `);

    let seeded = 0;
    db.transaction(() => {
        let pri = 1;
        for (const [mode, types] of Object.entries(FAILURE_TYPE_MAP)) {
            for (const aType of types) {
                insertRule.run(aType, 'failure_mode', mode, pri);
                seeded++;
            }
            pri = pri >= 5 ? 5 : pri + 1;
        }
        // Failure class → reference artifacts (broad fallback)
        for (const cls of ['MECHANICAL','ELECTRICAL','HYDRAULIC','PNEUMATIC','THERMAL']) {
            insertRule.run('manual', 'failure_class', cls, 8);
            insertRule.run('cad',    'failure_class', cls, 9);
        }
        // State triggers
        for (const [state, aType, pri] of [
            ['maintenance', 'manual',    3],
            ['maintenance', 'cad',       3],
            ['overdue_pm',  'manual',    3],
            ['overdue_pm',  'schematic', 3],
            ['calibration', 'nameplate', 3],
            ['calibration', 'schematic', 3],
        ]) {
            insertRule.run(aType, 'state', state, pri);
        }
    })();

    const total = db.prepare('SELECT COUNT(*) AS n FROM artifact_context_map').get().n;
    console.log(`[054] artifact_context_map: ${seeded} rules seeded → ${total} total`);
    db.close();
}

// ── Per-plant DBs ────────────────────────────────────────────────────────────
function migratePlant(dbPath) {
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    db.exec(`
        CREATE TABLE IF NOT EXISTS artifact_usage (
            UsageID          INTEGER PRIMARY KEY AUTOINCREMENT,
            ArtifactID       INTEGER NOT NULL,   -- references catalog_artifacts.ArtifactID
            AssetID          TEXT,
            WorkOrderID      TEXT,
            ProcedureID      TEXT,
            FailureMode      TEXT,               -- normalized_mode that triggered surface
            OpenedBy         TEXT,
            OpenedAt         TEXT DEFAULT (datetime('now')),
            ResolvedIssue    INTEGER,            -- 1=yes 0=no NULL=unknown
            FeedbackNote     TEXT,
            EffectivenessScore REAL              -- computed column (update async)
        );

        CREATE INDEX IF NOT EXISTS idx_au_artifact ON artifact_usage(ArtifactID);
        CREATE INDEX IF NOT EXISTS idx_au_asset    ON artifact_usage(AssetID);
        CREATE INDEX IF NOT EXISTS idx_au_opened   ON artifact_usage(OpenedAt);
    `);

    db.close();
}

module.exports = function run() {
    migrateGlobal();

    const dataDir = path.join(__dirname, '..', '..', 'data');
    const targets = fs.readdirSync(dataDir)
        .filter(f => f.endsWith('.db') && !f.includes('mfg_master') && !f.includes('trier_logistics') && !f.includes('auth_db'))
        .map(f => path.join(dataDir, f));

    for (const dbPath of targets) {
        try {
            migratePlant(dbPath);
            console.log(`[054] artifact_usage created → ${path.basename(dbPath)}`);
        } catch (e) {
            console.warn(`[054] Skipped ${path.basename(dbPath)}: ${e.message}`);
        }
    }
};
