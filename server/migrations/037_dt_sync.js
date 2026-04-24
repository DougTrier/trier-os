// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS - Migration 037 — Digital Twin External Platform Integration
 * ======================================================================
 * Adds DTSyncConfig and DTSyncLog tables to trier_logistics.db.
 *
 * SCOPING DECISIONS:
 * - Target platform: Bentley iTwin Platform first.
 * - Sync direction and data scope: Asset registry only for v1. OUTBOUND: push Trier OS asset fields. INBOUND: pull iTwin spatial/installation data.
 * - Conflict resolution: Trier OS is source of truth for operational fields. iTwin is source of truth for spatial fields. Merge, not overwrite.
 * - API availability: Bentley iTwin Platform REST API (OAuth2 client credentials).
 */

module.exports = {
    up: () => {
        const logisticsDb = require('../logistics_db').db;

        logisticsDb.prepare(`
            CREATE TABLE IF NOT EXISTS DTSyncConfig (
                ConfigID      INTEGER PRIMARY KEY,
                PlantID       TEXT NOT NULL,
                Platform      TEXT NOT NULL DEFAULT 'BENTLEY_ITWIN',
                InstanceURL   TEXT NOT NULL,
                TenantId      TEXT,
                ClientId      TEXT,
                ClientSecret  TEXT,
                IModelId      TEXT,
                SyncDirection TEXT NOT NULL DEFAULT 'OUTBOUND',
                Enabled       INTEGER NOT NULL DEFAULT 1,
                CreatedBy     TEXT NOT NULL,
                CreatedAt     TEXT NOT NULL,
                UpdatedAt     TEXT NOT NULL
            )
        `).run();

        logisticsDb.prepare(`
            CREATE UNIQUE INDEX IF NOT EXISTS uq_dt_sync_plant_platform
            ON DTSyncConfig(PlantID, Platform)
        `).run();

        logisticsDb.prepare(`
            CREATE TABLE IF NOT EXISTS DTSyncLog (
                LogID         INTEGER PRIMARY KEY,
                PlantID       TEXT NOT NULL,
                Platform      TEXT NOT NULL,
                Direction     TEXT NOT NULL,
                AssetCount    INTEGER DEFAULT 0,
                SuccessCount  INTEGER DEFAULT 0,
                ErrorCount    INTEGER DEFAULT 0,
                Status        TEXT NOT NULL DEFAULT 'PENDING',
                StartedAt     TEXT NOT NULL,
                CompletedAt   TEXT,
                ErrorDetails  TEXT,
                TriggeredBy   TEXT NOT NULL
            )
        `).run();

        logisticsDb.prepare(`
            CREATE INDEX IF NOT EXISTS idx_dt_sync_log_plant ON DTSyncLog(PlantID, StartedAt DESC)
        `).run();

        console.log('   -> Created DTSyncConfig and DTSyncLog tables in trier_logistics.db.');
    }
};
