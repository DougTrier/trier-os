// Copyright © 2026 Trier OS. All Rights Reserved.

const { db: logisticsDb } = require('../../logistics_db');

function checkNotLocked(intent) {
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
                failed: ['TARGET_NOT_LOTO_LOCKED'],
                causalExplanation: `Cannot write to asset ${intent.targetId} — active LOTO lockout is in effect (permit #${row.PermitNumber}). De-energize and void the LOTO permit before changing operating parameters.`
            };
        }

        return {
            certified: true,
            passed: ['TARGET_NOT_LOTO_LOCKED'],
            failed: []
        };
    } catch (err) {
        return {
            certified: false,
            passed: [],
            failed: [],
            causalExplanation: 'CONSTRAINT_CHECK_ERROR'
        };
    }
}

module.exports = { checkNotLocked };
