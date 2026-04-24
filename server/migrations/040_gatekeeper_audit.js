// Copyright © 2026 Trier OS. All Rights Reserved.

module.exports = {
    up: () => {
        const logisticsDb = require('../logistics_db').db;
        
        logisticsDb.exec(`
            CREATE TABLE IF NOT EXISTS GatekeeperAuditLedger (
                LedgerID INTEGER PRIMARY KEY,
                RequestID TEXT NOT NULL UNIQUE,
                Timestamp TEXT NOT NULL,
                UserID TEXT NOT NULL,
                Username TEXT NOT NULL,
                PlantID TEXT,
                ActionClass TEXT NOT NULL,
                ActionType TEXT NOT NULL,
                TargetType TEXT,
                TargetID TEXT,
                ValidationResult TEXT NOT NULL,
                DenialReason TEXT,
                PTWRef TEXT,
                MOCRef TEXT,
                RoleAtDecision TEXT,
                ProcessingMs INTEGER
            );

            CREATE INDEX IF NOT EXISTS idx_gk_audit_plant ON GatekeeperAuditLedger(PlantID, Timestamp DESC);
            CREATE INDEX IF NOT EXISTS idx_gk_audit_user ON GatekeeperAuditLedger(UserID, Timestamp DESC);
            CREATE INDEX IF NOT EXISTS idx_gk_audit_request ON GatekeeperAuditLedger(RequestID);
        `);

        console.log('   -> Created GatekeeperAuditLedger table in trier_logistics.db.');
    }
};
