// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Migration 041 - Gatekeeper Role Map & User AD Groups
 * Creates tables for Gatekeeper RBAC mapping and cached user groups.
 */
module.exports = {
    up: () => {
        const logisticsDb = require('../logistics_db').db;

        logisticsDb.exec(`
            CREATE TABLE IF NOT EXISTS GatekeeperRoleMap (
                ID          INTEGER PRIMARY KEY AUTOINCREMENT,
                ADGroup     TEXT NOT NULL,
                ActionClass TEXT NOT NULL,
                PlantID     TEXT,
                Notes       TEXT,
                CreatedAt   TEXT DEFAULT (datetime('now')),
                UpdatedAt   TEXT DEFAULT (datetime('now')),
                UNIQUE(ADGroup, ActionClass, PlantID)
            );
            CREATE INDEX IF NOT EXISTS idx_grm_adgroup ON GatekeeperRoleMap(ADGroup);
            CREATE INDEX IF NOT EXISTS idx_grm_class   ON GatekeeperRoleMap(ActionClass);
        `);

        // UserADGroups lives in auth_db (user identity data)
        const authDb = require('../auth_db');

        authDb.exec(`
            CREATE TABLE IF NOT EXISTS UserADGroups (
                ID          INTEGER PRIMARY KEY AUTOINCREMENT,
                UserID      INTEGER NOT NULL,
                Username    TEXT    NOT NULL,
                ADGroup     TEXT    NOT NULL,
                SyncedAt    TEXT    DEFAULT (datetime('now')),
                UNIQUE(UserID, ADGroup)
            );
            CREATE INDEX IF NOT EXISTS idx_uag_userid ON UserADGroups(UserID);
        `);
    }
};
