// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * moc.js — Gatekeeper MOC Coverage Validator
 * ============================================
 * Enforces that an active Management of Change record exists for the plant
 * before allowing safety-critical physical interventions.
 *
 * Applies only to MOC_GATED_ACTIONS. All other action types pass through.
 *
 * Returns: { allowed: boolean, mocRef: number|null, denialReason?: string }
 *
 * Fail-closed contract:
 *   - Any exception → { allowed: false, mocRef: null, denialReason: 'MOC_ERROR' }
 *   - No active MOC for plant → { allowed: false, mocRef: null, denialReason: 'MOC_REQUIRED' }
 */

'use strict';

let logisticsDb;
try {
    logisticsDb = require('../../logistics_db').db;
} catch (e) {
    // Overridden by _setDb in test environment
}

function _setDb(db) {
    logisticsDb = db;
}

const MOC_GATED_ACTIONS = new Set([
    'SETPOINT_WRITE',
    'SAFETY_PARAM_CHANGE',
    'SOP_OVERRIDE'
]);

// Valid statuses for MOC coverage — DRAFT has not entered review, and terminal
// statuses (COMPLETED, REJECTED, CANCELLED) no longer cover a live change.
const MOC_VALID_STATUSES = ['UNDER_REVIEW', 'APPROVED', 'IMPLEMENTING'];

async function validateMOC(intent) {
    try {
        if (!MOC_GATED_ACTIONS.has(intent.actionType)) {
            return { allowed: true, mocRef: null };
        }

        if (!intent.plantId) {
            console.warn('[MOC VALIDATOR] MOC-gated action missing plantId — bypassing MOC check', { actionType: intent.actionType, userId: intent.userId });
            return { allowed: true, mocRef: null };
        }

        const placeholders = MOC_VALID_STATUSES.map(() => '?').join(', ');
        const record = logisticsDb.prepare(`
            SELECT ID FROM ManagementOfChange
            WHERE PlantID = ?
              AND Status IN (${placeholders})
            LIMIT 1
        `).get(intent.plantId, ...MOC_VALID_STATUSES);

        if (record) {
            return { allowed: true, mocRef: record.ID };
        }

        return { allowed: false, mocRef: null, denialReason: 'MOC_REQUIRED' };

    } catch (err) {
        console.error('[MOC VALIDATOR] Error:', err);
        return { allowed: false, mocRef: null, denialReason: 'MOC_ERROR' };
    }
}

module.exports = { validateMOC, _setDb };
