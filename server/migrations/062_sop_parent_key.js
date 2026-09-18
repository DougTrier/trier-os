// Copyright © 2026 Doug Trier
// SPDX-License-Identifier: MIT
// Licensed under the MIT License. See LICENSE in the repository root.
/**
 * Migration 062 — make Procedures.ID a valid SOP acknowledgement parent key.
 * No HTTP routes. Preserves all procedure and acknowledgement rows; ambiguous
 * IDs or orphan acknowledgements stop the upgrade for operator recovery.
 */
'use strict';
module.exports = {
    up(db) {
        if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='Procedures'").get()) return;
        const duplicate = db.prepare('SELECT ID FROM Procedures WHERE ID IS NOT NULL GROUP BY ID HAVING COUNT(*) > 1 LIMIT 1').get();
        if (duplicate) throw new Error('[062] Duplicate Procedures.ID; resolve the ambiguous parent relationship before upgrading. No rows were deleted.');
        db.exec('CREATE UNIQUE INDEX IF NOT EXISTS uq_procedures_sop_parent ON Procedures(ID)');
        if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='SOPAcknowledgments'").get()) {
            const orphan = db.prepare('SELECT 1 FROM SOPAcknowledgments a WHERE a.ProcedureID IS NOT NULL AND NOT EXISTS (SELECT 1 FROM Procedures p WHERE p.ID = a.ProcedureID) LIMIT 1').get();
            if (orphan) throw new Error('[062] Orphan SOP acknowledgement; restore its procedure relationship before upgrading. No rows were deleted.');
            if (db.pragma('foreign_key_check(SOPAcknowledgments)').length) throw new Error('[062] SOP acknowledgement foreign-key validation failed.');
        }
    },
};
