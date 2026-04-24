// Copyright © 2026 Trier OS. All Rights Reserved.

const { db: logisticsDb } = require('../../logistics_db');

function checkUnderReview(intent) {
    try {
        const row = logisticsDb.prepare(`
            SELECT Status 
            FROM ManagementOfChange 
            WHERE ID = ?
        `).get(intent.targetId);

        if (!row) {
            return {
                certified: false,
                passed: [],
                failed: ['MOC_IN_REVIEW_STATE'],
                causalExplanation: \`MOC #\${intent.targetId} not found.\`
            };
        }

        if (row.Status !== 'UNDER_REVIEW') {
            return {
                certified: false,
                passed: [],
                failed: ['MOC_IN_REVIEW_STATE'],
                causalExplanation: \`MOC #\${intent.targetId} is in '\${row.Status}' state. Only UNDER_REVIEW records can be approved.\`
            };
        }

        return {
            certified: true,
            passed: ['MOC_IN_REVIEW_STATE'],
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

function checkCloseable(intent) {
    try {
        const row = logisticsDb.prepare(`
            SELECT Status 
            FROM ManagementOfChange 
            WHERE ID = ?
        `).get(intent.targetId);

        if (!row) {
            return {
                certified: false,
                passed: [],
                failed: ['MOC_IN_CLOSEABLE_STATE'],
                causalExplanation: \`MOC #\${intent.targetId} not found.\`
            };
        }

        const validStatuses = ['APPROVED', 'IMPLEMENTING'];
        if (!validStatuses.includes(row.Status)) {
            return {
                certified: false,
                passed: [],
                failed: ['MOC_IN_CLOSEABLE_STATE'],
                causalExplanation: \`MOC #\${intent.targetId} is in '\${row.Status}' state. Only APPROVED or IMPLEMENTING records can be closed.\`
            };
        }

        return {
            certified: true,
            passed: ['MOC_IN_CLOSEABLE_STATE'],
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

module.exports = { checkUnderReview, checkCloseable };
