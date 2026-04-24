// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * simulated.js — Simulated Control Adapter
 * =========================================
 * The safe default adapter. Logs the command without executing any real
 * hardware write. Always succeeds. Used when SimulationMode=1 or no
 * AdapterConfig exists for the plant.
 *
 * No external dependencies.
 */

'use strict';

async function execute(command) {
    console.log('[GATEKEEPER-SIM]', JSON.stringify({
        requestId:  command.requestId,
        actionType: command.actionType,
        targetId:   command.targetId,
        plantId:    command.plantId,
        payload:    command.payload
    }));
    return { success: true, simulated: true, requestId: command.requestId };
}

async function testConnection(config) {
    return { success: true, simulated: true, message: 'Simulated adapter always available' };
}

module.exports = { execute, testConnection };
