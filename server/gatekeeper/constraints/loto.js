// Copyright © 2026 Trier OS. All Rights Reserved.

const { db: logisticsDb } = require('../../logistics_db');

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
                causalExplanation: \`Asset \${intent.targetId} already has active LOTO permit #\${row.PermitNumber}. Void the existing permit before issuing a new one.\`
            };
        }

        return {
            certified: true,
            passed: ['NO_EXISTING_LOTO'],
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
                causalExplanation: \`LOTO permit \${intent.targetId} not found.\`
            };
        }

        if (row.Status !== 'ACTIVE') {
            return {
                certified: false,
                passed: [],
                failed: ['PERMIT_EXISTS_ACTIVE'],
                causalExplanation: \`LOTO permit \${intent.targetId} is not active (current status: \${row.Status}). Cannot void a non-active permit.\`
            };
        }

        return {
            certified: true,
            passed: ['PERMIT_EXISTS_ACTIVE'],
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

module.exports = { checkActivate, checkVoid };
