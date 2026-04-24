// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS - Migration 036 — SaaS Enablement Layer
 * ==============================================================
 * Adds UsageMeter and InstanceConfig tables to trier_logistics.db.
 * Adds scope_plants column to existing api_keys table.
 *
 * SCOPING DECISIONS (documented here):
 * - Tenant boundary: one Trier OS deployment = one tenant.
 * - Metered metrics: api_calls, active_users, storage_mb, seat_count.
 * - White-label scope: instanceName, primaryColor, secondaryColor,
 *   supportEmail, supportURL, poweredByVisible.
 * - Billing export: JSON or CSV, one row per metric per period.
 */
module.exports = {
    up: () => {
        const logisticsDb = require('../logistics_db').db;

        // Add plant scope to existing API keys (idempotent)
        const tableInfo = logisticsDb.prepare('PRAGMA table_info(api_keys)').all();
        if (!tableInfo.find(c => c.name === 'scope_plants')) {
            logisticsDb.exec('ALTER TABLE api_keys ADD COLUMN scope_plants TEXT DEFAULT NULL');
        }

        // Usage snapshot log
        logisticsDb.prepare(`
            CREATE TABLE IF NOT EXISTS UsageMeter (
                MeterID      INTEGER PRIMARY KEY,
                PeriodStart  TEXT NOT NULL,
                PeriodEnd    TEXT NOT NULL,
                Metric       TEXT NOT NULL,
                PlantID      TEXT,
                Value        REAL NOT NULL,
                Unit         TEXT NOT NULL,
                RecordedAt   TEXT NOT NULL
            )
        `).run();

        logisticsDb.prepare(`
            CREATE INDEX IF NOT EXISTS idx_usage_period ON UsageMeter(PeriodStart, Metric)
        `).run();

        // Instance white-label config (one row per instance)
        logisticsDb.prepare(`
            CREATE TABLE IF NOT EXISTS InstanceConfig (
                ConfigID         INTEGER PRIMARY KEY,
                InstanceName     TEXT NOT NULL DEFAULT 'Trier OS',
                PrimaryColor     TEXT NOT NULL DEFAULT '#2563eb',
                SecondaryColor   TEXT NOT NULL DEFAULT '#1e40af',
                SupportEmail     TEXT,
                SupportURL       TEXT,
                PoweredByVisible INTEGER NOT NULL DEFAULT 1,
                UpdatedBy        TEXT NOT NULL,
                UpdatedAt        TEXT NOT NULL
            )
        `).run();

        console.log('   -> Created UsageMeter, InstanceConfig tables and scope_plants column in trier_logistics.db.');
    }
};
