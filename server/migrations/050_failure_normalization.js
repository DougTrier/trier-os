// Copyright © 2026 Trier OS. All Rights Reserved.
// Migration 050 — Failure normalization layer (Tier 4 twin contract)
// Adds failure_class + normalized_mode to failure_modes,
// adds NormalizedFailureID linkage to FailureCodes,
// backfills class mappings for all 41 existing failure mode rows.

'use strict';

const path     = require('path');
const Database = require('better-sqlite3');

// Canonical failure class taxonomy
const CLASS_MAP = {
    'Mechanical':        'MECHANICAL',
    'Electrical':        'ELECTRICAL',
    'Thermal':           'THERMAL',
    'Hydraulic':         'HYDRAULIC',
    'Pneumatic':         'PNEUMATIC',
    'Instrumentation':   'INSTRUMENTATION',
    'Material':          'MATERIAL',
    'Piping':            'PIPING',
    'Process':           'PROCESS',
    'Software':          'SOFTWARE',
    'General':           'GENERAL',
};

// Normalized mode names keyed by existing code
const NORMALIZED_MODE = {
    'MECH-BRG':   'BEARING_FAILURE',
    'MECH-SEAL':  'SEAL_LEAK',
    'MECH-ALIGN': 'MISALIGNMENT',
    'MECH-BELT':  'BELT_FAILURE',
    'MECH-CHAIN': 'CHAIN_SPROCKET_WEAR',
    'MECH-GEAR':  'GEARBOX_FAILURE',
    'MECH-COUP':  'COUPLING_FAILURE',
    'MECH-SHAFT': 'SHAFT_FAILURE',
    'MECH-VIB':   'EXCESSIVE_VIBRATION',
    'MECH-WEAR':  'GENERAL_WEAR',
    'ELEC-MTR':   'MOTOR_BURNOUT',
    'ELEC-VFD':   'VFD_DRIVE_FAULT',
    'ELEC-WIRE':  'WIRING_FAULT',
    'ELEC-SENS':  'SENSOR_FAILURE',
    'ELEC-CTRL':  'CONTROL_SYSTEM_FAULT',
    'ELEC-FUSE':  'FUSE_BREAKER_TRIP',
    'ELEC-GROUND':'GROUND_FAULT',
    'PROC-PRESS': 'LOSS_OF_PRESSURE',
    'PROC-FLOW':  'LOSS_OF_FLOW',
    'PROC-TEMP':  'TEMPERATURE_DEVIATION',
    'PROC-CONT':  'CONTAMINATION',
    'PROC-BLOCK': 'BLOCKAGE',
    'PROC-FOAM':  'EXCESSIVE_FOAMING',
    'PROC-YIELD': 'YIELD_LOSS',
    'INSTR-CALIB':'CALIBRATION_DRIFT',
    'INSTR-PROBE':'PROBE_FAILURE',
    'INSTR-LOOP': 'LOOP_FAULT',
    'PNEU-COMP':  'COMPRESSOR_FAULT',
    'PNEU-VALVE': 'VALVE_FAILURE',
    'PNEU-LEAK':  'AIR_LEAK',
    'HYD-PUMP':   'HYDRAULIC_PUMP_FAILURE',
    'HYD-VALVE':  'HYDRAULIC_VALVE_FAILURE',
    'HYD-LEAK':   'HYDRAULIC_LEAK',
    'THERM-OVER': 'OVERTEMPERATURE',
    'THERM-COOL': 'COOLING_FAILURE',
    'MAT-CORR':   'CORROSION',
    'MAT-CRACK':  'FATIGUE_CRACK',
    'MAT-ERODE':  'EROSION',
    'SOFT-CRASH': 'SOFTWARE_CRASH',
    'SOFT-COMM':  'COMMUNICATION_FAULT',
    'MISC-UNKN':  'UNKNOWN',
};

function runOnDb(dbPath) {
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // 1. Add new columns to failure_modes (idempotent)
    const cols = db.prepare("PRAGMA table_info(failure_modes)").all().map(c => c.name);
    if (!cols.includes('failure_class')) {
        db.exec(`ALTER TABLE failure_modes ADD COLUMN failure_class TEXT NOT NULL DEFAULT 'GENERAL'`);
    }
    if (!cols.includes('normalized_mode')) {
        db.exec(`ALTER TABLE failure_modes ADD COLUMN normalized_mode TEXT`);
    }

    // 2. Add NormalizedFailureID to FailureCodes (idempotent)
    const fcCols = db.prepare("PRAGMA table_info(FailureCodes)").all().map(c => c.name);
    if (!fcCols.includes('NormalizedFailureID')) {
        db.exec(`ALTER TABLE FailureCodes ADD COLUMN NormalizedFailureID INTEGER REFERENCES failure_modes(id)`);
    }

    // 3. Backfill failure_class and normalized_mode for existing rows
    const updateFm = db.prepare(
        `UPDATE failure_modes SET failure_class = ?, normalized_mode = ? WHERE code = ?`
    );

    const rows = db.prepare('SELECT id, code, category FROM failure_modes').all();
    db.transaction(() => {
        for (const row of rows) {
            const cls  = CLASS_MAP[row.category] || 'GENERAL';
            const mode = NORMALIZED_MODE[row.code] || null;
            updateFm.run(cls, mode, row.code);
        }
    })();

    // 4. Create index for cross-plant analytics joins
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_failcodes_normalized
            ON FailureCodes(NormalizedFailureID);
        CREATE INDEX IF NOT EXISTS idx_failcodes_wo
            ON FailureCodes(woId);
    `);

    db.close();
}

module.exports = function run() {
    const dataDir = path.join(__dirname, '..', '..', 'data');
    const fs = require('fs');

    // Apply to schema_template + all plant DBs
    const targets = fs.readdirSync(dataDir)
        .filter(f => f.endsWith('.db') && !f.includes('mfg_master') && !f.includes('trier_logistics') && !f.includes('auth_db'))
        .map(f => path.join(dataDir, f));

    for (const dbPath of targets) {
        try {
            runOnDb(dbPath);
            console.log(`[050] failure_normalization applied → ${path.basename(dbPath)}`);
        } catch (e) {
            console.warn(`[050] Skipped ${path.basename(dbPath)}: ${e.message}`);
        }
    }
};
