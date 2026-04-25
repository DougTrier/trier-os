// Copyright © 2026 Trier OS. All Rights Reserved.

const { db: logisticsDb } = require('../../logistics_db');

// prevents double-lockout: a second LOTO cannot be activated while one is already ACTIVE on the same asset
function checkActivate(intent) {
    try {
        const row = logisticsDb.prepare(`
            SELECT PermitNumber
            FROM LotoPermits
            WHERE AssetID = ? AND PlantID = ? AND Status = 'ACTIVE'
            LIMIT 1
        `).get(intent.targetId, intent.plantId);

        if (row) {
            return {
                certified: false,
                passed: [],
                failed: ['NO_EXISTING_LOTO'],
                causalExplanation: `Asset ${intent.targetId} already has active LOTO permit #${row.PermitNumber}. Void the existing permit before issuing a new one.`
            };
        }

        return {
            certified: true,
            passed: ['NO_EXISTING_LOTO'],
            failed: []
        };
    } catch (err) {
        // internal DB error — empty failed[] signals a crash, not a named constraint failure
        return {
            certified: false,
            passed: [],
            failed: [],
            causalExplanation: 'CONSTRAINT_CHECK_ERROR'
        };
    }
}

// void gate: only an ACTIVE permit can be voided — CLEARED or EXPIRED permits are already resolved
function checkVoid(intent) {
    try {
        const row = logisticsDb.prepare(`
            SELECT PermitNumber, Status
            FROM LotoPermits
            WHERE PermitNumber = ?
            LIMIT 1
        `).get(intent.targetId);

        if (!row) {
            return {
                certified: false,
                passed: [],
                failed: ['PERMIT_EXISTS_ACTIVE'],
                causalExplanation: `LOTO permit ${intent.targetId} not found.`
            };
        }

        if (row.Status !== 'ACTIVE') {
            return {
                certified: false,
                passed: [],
                failed: ['PERMIT_EXISTS_ACTIVE'],
                causalExplanation: `LOTO permit ${intent.targetId} is not active (current status: ${row.Status}). Cannot void a non-active permit.`
            };
        }

        return {
            certified: true,
            passed: ['PERMIT_EXISTS_ACTIVE'],
            failed: []
        };
    } catch (err) {
        // internal DB error — empty failed[] signals a crash, not a named constraint failure
        return {
            certified: false,
            passed: [],
            failed: [],
            causalExplanation: 'CONSTRAINT_CHECK_ERROR'
        };
    }
}

module.exports = { checkActivate, checkVoid };
