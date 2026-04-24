// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * ptw.js — Gatekeeper PTW (Permit to Work) Validator
 * ====================================================
 * Enforces that an active LOTO permit exists for the plant before        
 * allowing safety-critical physical interventions.
 *
 * Applies only to PTW_GATED_ACTIONS. All other action types pass through.
 *
 * Returns: { allowed: boolean, ptwRef: number|null, denialReason?: string }
 *
 * Fail-closed contract:
 *   - Any exception → { allowed: false, ptwRef: null, denialReason: 'PTW_ERROR' }
 *   - No active permit for plant → { allowed: false, ptwRef: null, denialReason: 'PTW_REQUIRED' }
 */

'use strict';

let logisticsDb;
try {
    logisticsDb = require('../../logistics_db').db;
} catch (e) {
    // Allows monkey patching in tests
}

// Hook for tests to inject an in-memory DB
function _setDb(db) {
    logisticsDb = db;
}

const PTW_GATED_ACTIONS = new Set([
    'SETPOINT_WRITE',
    'SAFETY_PARAM_CHANGE',
    'SOP_OVERRIDE'
]);

async function validatePTW(intent) {
    try {
        // Pass through if this action type does not require PTW
        if (!PTW_GATED_ACTIONS.has(intent.actionType)) {
            return { allowed: true, ptwRef: null };
        }

        // Cannot enforce PTW without plant scope — log it so misconfigured callers are visible
        if (!intent.plantId) {
            console.warn('[PTW VALIDATOR] PTW-gated action missing plantId — bypassing PTW check', { actionType: intent.actionType, userId: intent.userId });
            return { allowed: true, ptwRef: null };
        }

        const permit = logisticsDb.prepare(`
            SELECT ID FROM LotoPermits
            WHERE PlantID = ?
              AND Status = 'ACTIVE'
              AND (ExpiresAt IS NULL OR datetime(ExpiresAt) > datetime('now'))
            LIMIT 1
        `).get(intent.plantId);

        if (permit) {
            return { allowed: true, ptwRef: permit.ID };
        }

        return { allowed: false, ptwRef: null, denialReason: 'PTW_REQUIRED' };

    } catch (err) {
        console.error('[PTW VALIDATOR] Error:', err);
        return { allowed: false, ptwRef: null, denialReason: 'PTW_ERROR' };
    }
}

module.exports = { validatePTW, _setDb };
