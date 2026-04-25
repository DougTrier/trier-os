// Copyright © 2026 Trier OS. All Rights Reserved.
// Migration 051 — AssetLiveState table (Tier 2 twin contract)
// Last-known-good telemetry snapshot per asset.
// Written by NATS/MQTT/OPC-UA subscribers; read by scan endpoint for instant context.
// One row per asset — UPSERT on new telemetry.

'use strict';

const path     = require('path');
const Database = require('better-sqlite3');

function runOnDb(dbPath) {
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    db.exec(`
        CREATE TABLE IF NOT EXISTS AssetLiveState (
            AssetID     TEXT PRIMARY KEY,
            Source      TEXT NOT NULL DEFAULT 'manual',  -- nats | mqtt | opcua | manual
            StateJSON   TEXT NOT NULL DEFAULT '{}',      -- arbitrary telemetry snapshot
            LastUpdated TEXT NOT NULL DEFAULT (datetime('now')),
            StaleAfterS INTEGER NOT NULL DEFAULT 300     -- seconds until considered stale
        );

        CREATE INDEX IF NOT EXISTS idx_als_updated ON AssetLiveState(LastUpdated);
    `);

    db.close();
}

module.exports = function run() {
    const dataDir = path.join(__dirname, '..', '..', 'data');
    const fs = require('fs');

    const targets = fs.readdirSync(dataDir)
        .filter(f => f.endsWith('.db') && !f.includes('mfg_master') && !f.includes('trier_logistics') && !f.includes('auth_db'))
        .map(f => path.join(dataDir, f));

    for (const dbPath of targets) {
        try {
            runOnDb(dbPath);
            console.log(`[051] AssetLiveState created → ${path.basename(dbPath)}`);
        } catch (e) {
            console.warn(`[051] Skipped ${path.basename(dbPath)}: ${e.message}`);
        }
    }
};
