// Copyright © 2026 Trier OS. All Rights Reserved.

const { db: logisticsDb } = require('../logistics_db');

/**
 * Gatekeeper Audit Writer
 * Appends records to the GatekeeperAuditLedger table.
 */
async function writeAuditRecord(record) {
    try {
        const {
            requestId, userId, username, plantId, actionClass, actionType,
            targetType, targetId, validationResult, denialReason, ptwRef, mocRef,
            roleAtDecision, processingMs
        } = record;

        const stmt = logisticsDb.prepare(`
            INSERT INTO GatekeeperAuditLedger (
                RequestID, Timestamp, UserID, Username, PlantID, ActionClass, ActionType,
                TargetType, TargetID, ValidationResult, DenialReason, PTWRef, MOCRef, RoleAtDecision, ProcessingMs
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const timestamp = new Date().toISOString();

        const info = stmt.run(
            requestId, timestamp, userId, username, plantId || null, actionClass, actionType,
            targetType || null, targetId || null, validationResult, denialReason || null,
            ptwRef || null, mocRef || null, roleAtDecision || null, processingMs || 0
        );

        return info.lastInsertRowid;
    } catch (err) {
        // If the audit write itself fails, log the error to stderr and proceed.
        // A failed audit write must NOT flip the decision to allowed.
        console.error('[GATEKEEPER AUDIT] Failed to write audit record:', err.message);
        return null;
    }
}

module.exports = {
    writeAuditRecord
};
