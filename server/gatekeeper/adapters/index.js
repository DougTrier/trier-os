// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * adapters/index.js — Control Adapter Dispatcher
 * ================================================
 * Routes a validated command to the correct hardware adapter based on
 * AdapterConfig for the plant. SimulationMode=1 (default) always uses
 * the simulated adapter regardless of AdapterType.
 *
 * If no AdapterConfig exists for the plant, defaults to SIMULATED.
 */

'use strict';

const { db: logisticsDb } = require('../../logistics_db');

const ADAPTER_DISPATCHED_ACTIONS = new Set([
    'SETPOINT_WRITE',
    'SAFETY_PARAM_CHANGE'
]);

async function dispatch(command) {
    try {
        if (!ADAPTER_DISPATCHED_ACTIONS.has(command.actionType)) {
            return { success: true, dispatched: false, reason: 'action not adapter-dispatched' };
        }

        const config = logisticsDb.prepare(
            'SELECT * FROM AdapterConfig WHERE PlantID = ?'
        ).get(command.plantId);

        // SimulationMode=1 (default) or no config → simulated adapter
        if (!config || config.SimulationMode === 1) {
            return require('./simulated').execute(command);
        }

        const adapterType = command.adapterType || config.AdapterType;
        const enriched = { ...command, ...config };

        switch (adapterType) {
            case 'OPC_UA':   return require('./opcua').execute(enriched);
            case 'MODBUS':   return require('./modbus').execute(enriched);
            case 'SIMULATED': return require('./simulated').execute(command);
            default:
                return { success: false, error: 'UNKNOWN_ADAPTER', adapterType };
        }
    } catch (err) {
        console.error('[DISPATCHER] Unhandled error:', err);
        return { success: false, error: 'DISPATCHER_ERROR' };
    }
}

module.exports = { dispatch, ADAPTER_DISPATCHED_ACTIONS };
