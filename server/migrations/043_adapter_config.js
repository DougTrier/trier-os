// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Migration 043 — AdapterConfig table
 * Stores per-plant control system adapter configuration.
 * SimulationMode defaults to 1 — real writes require explicit opt-in.
 */
module.exports = {
    up: () => {
        const logisticsDb = require('../logistics_db').db;

        logisticsDb.exec(`
            CREATE TABLE IF NOT EXISTS AdapterConfig (
                ConfigID        INTEGER PRIMARY KEY AUTOINCREMENT,
                PlantID         TEXT    NOT NULL UNIQUE,
                AdapterType     TEXT    NOT NULL DEFAULT 'SIMULATED',
                    -- SIMULATED | OPC_UA | MODBUS
                Endpoint        TEXT    NOT NULL DEFAULT '',
                    -- OPC-UA: opc.tcp://host:port/path  |  Modbus: host:port
                NodeID          TEXT,
                    -- OPC-UA only: e.g. ns=2;i=1234
                Register        INTEGER,
                    -- Modbus only: register address
                UnitID          INTEGER DEFAULT 1,
                    -- Modbus only: slave/unit ID
                SecurityMode    TEXT    DEFAULT 'None',
                Credentials     TEXT,
                    -- TODO(encryption-at-rest): stored as plaintext in v1.
                    -- Encrypt before GA release using server-side key from env.
                TimeoutMs       INTEGER NOT NULL DEFAULT 5000,
                SimulationMode  INTEGER NOT NULL DEFAULT 1,
                    -- 1 = always use simulated adapter regardless of AdapterType
                    -- 0 = use AdapterType (real hardware writes)
                Notes           TEXT,
                CreatedBy       TEXT    NOT NULL DEFAULT 'system',
                CreatedAt       TEXT    DEFAULT (datetime('now')),
                UpdatedAt       TEXT    DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_adapter_plant ON AdapterConfig(PlantID);
        `);
    }
};
