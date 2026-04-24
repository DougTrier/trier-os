// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * 044_proof_receipts.js — P7-2 Safe Action Certification Layer
 * ==============================================================
 * Creates the ProofReceipts table in the logistics database to track
 * cryptographic proof receipts generated during Gatekeeper constraints check.
 */

module.exports = {
    up: () => {
        const logisticsDb = require('../logistics_db').db;

        logisticsDb.prepare(`
            CREATE TABLE IF NOT EXISTS ProofReceipts (
                ReceiptID         INTEGER PRIMARY KEY,
                RequestID         TEXT    NOT NULL UNIQUE,
                CertAt            TEXT    NOT NULL,
                ConstraintsPassed TEXT    NOT NULL,
                ConstraintsFailed TEXT,
                CausalExplanation TEXT,
                CertHash          TEXT,
                Certified         INTEGER NOT NULL CHECK (Certified IN (0, 1))
            )
        `).run();

        logisticsDb.prepare('CREATE INDEX IF NOT EXISTS idx_proof_receipts_request ON ProofReceipts(RequestID)').run();

        console.log('   -> Created ProofReceipts table in trier_logistics.db.');
    }
};
