// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Migration 042 — GatekeeperAuditLedger Immutability Triggers
 * Adds BEFORE UPDATE and BEFORE DELETE triggers that RAISE(ABORT) on
 * GatekeeperAuditLedger, making it physically append-only at the DB layer.
 */
module.exports = {
    up: () => {
        const logisticsDb = require('../logistics_db').db;

        logisticsDb.exec(`
            CREATE TRIGGER IF NOT EXISTS prevent_audit_update
            BEFORE UPDATE ON GatekeeperAuditLedger
            BEGIN
                SELECT RAISE(ABORT, 'GatekeeperAuditLedger is immutable: updates not permitted');
            END;

            CREATE TRIGGER IF NOT EXISTS prevent_audit_delete
            BEFORE DELETE ON GatekeeperAuditLedger
            BEGIN
                SELECT RAISE(ABORT, 'GatekeeperAuditLedger is immutable: deletes not permitted');
            END;
        `);
    }
};
