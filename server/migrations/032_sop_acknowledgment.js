// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * 032_sop_acknowledgment.js — P5-4 SOP Re-Acknowledgment Schema
 * ==============================================================
 * Adds SOPAcknowledgmentRequired flag to Procedures table.
 * Creates SOPAcknowledgments table to track sign-offs.
 */

module.exports = {
    up: (db) => {
        // Add SOPAcknowledgmentRequired flag to Procedures table
        try {
            db.prepare('ALTER TABLE Procedures ADD COLUMN SOPAcknowledgmentRequired INTEGER DEFAULT 0').run();
        } catch (e) {
            // Column may already exist
        }

        // Create SOPAcknowledgments table
        db.prepare(`
            CREATE TABLE IF NOT EXISTS SOPAcknowledgments (
                ID TEXT PRIMARY KEY,
                ProcedureID TEXT NOT NULL,
                TechID TEXT NOT NULL,
                SOPVersion TEXT,
                MOC_ID TEXT,
                AcknowledgedAt TEXT NOT NULL
            )
        `).run();

        try {
            db.prepare('CREATE INDEX idx_sopack_tech ON SOPAcknowledgments(TechID)').run();
        } catch (e) {}
        try {
            db.prepare('CREATE INDEX idx_sopack_procedure ON SOPAcknowledgments(ProcedureID)').run();
        } catch (e) {}
    }
};
