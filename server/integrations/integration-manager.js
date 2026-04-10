// Copyright © 2026 Trier OS. All Rights Reserved.
/**
 * Trier OS — Integration Manager
 * ================================
 * Singleton that owns all running EdgeAgent workers and simulator instances.
 * Exposes a clean start/stop/status API consumed by plant_setup.js routes.
 *
 * Worker key format: `${plantId}::${integrationId}`
 * Each plant × integration gets one worker and optionally one simulator.
 *
 * Simulator ports are auto-assigned starting at 5020, one per integration ID,
 * so multiple plants can run simulators simultaneously without port conflicts.
 */

'use strict';
const simulator    = require('./modbus-simulator');
const EdgeAgent    = require('./edge-agent');
const HttpEdgeAgent = require('./http-edge-agent');

// Simulator port allocation: one port per integrationId
const SIM_BASE_PORT = 5020;
const SIM_PORT_MAP  = { scada: 5020, erp: 5021, lims: 5022, edi: 5023, coldchain: 5024, route: 5025 };

// Active workers: key → EdgeAgent instance
const workers = new Map();

// Active simulators: integrationId → { running, port }
const simulators = new Map();

// ── Simulator control ─────────────────────────────────────────────────────────
async function startSimulator(integrationId) {
    if (simulators.get(integrationId)?.running) {
        return { ok: true, message: 'Already running', port: SIM_PORT_MAP[integrationId] || SIM_BASE_PORT };
    }
    const port = SIM_PORT_MAP[integrationId] || SIM_BASE_PORT;
    try {
        await simulator.start(port);
        simulators.set(integrationId, { running: true, port });
        return { ok: true, message: `Simulator started on port ${port}`, port };
    } catch (err) {
        return { ok: false, message: err.message };
    }
}

async function stopSimulator(integrationId) {
    if (!simulators.get(integrationId)?.running) {
        return { ok: true, message: 'Not running' };
    }
    await simulator.stop();
    simulators.set(integrationId, { running: false, port: null });
    return { ok: true, message: 'Simulator stopped' };
}

function simulatorStatus(integrationId) {
    return simulators.get(integrationId) || { running: false, port: null };
}

// ── Worker control ────────────────────────────────────────────────────────────
function workerKey(plantId, integrationId) {
    return `${plantId}::${integrationId}`;
}

function startWorker(plantId, integrationId, config) {
    const key = workerKey(plantId, integrationId);
    if (workers.has(key)) {
        return { ok: false, message: 'Worker already running — stop it first' };
    }
    // type: 'http' → HttpEdgeAgent (ERP/REST pull); default → EdgeAgent (Modbus)
    const AgentClass = config.type === 'http' ? HttpEdgeAgent : EdgeAgent;
    const agent = new AgentClass(plantId, integrationId, config);
    agent.start();
    workers.set(key, agent);
    return { ok: true, message: `Worker started for ${plantId} / ${integrationId}` };
}

function stopWorker(plantId, integrationId) {
    const key = workerKey(plantId, integrationId);
    const agent = workers.get(key);
    if (!agent) return { ok: false, message: 'Worker not running' };
    agent.stop();
    workers.delete(key);
    return { ok: true, message: `Worker stopped` };
}

function getWorkerStatus(plantId, integrationId) {
    const key = workerKey(plantId, integrationId);
    const agent = workers.get(key);
    return agent ? agent.status() : null;
}

function getAllStatuses(plantId) {
    const result = {};
    for (const [key, agent] of workers.entries()) {
        if (!plantId || key.startsWith(plantId + '::')) {
            result[key] = agent.status();
        }
    }
    return result;
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.on('SIGTERM', async () => {
    for (const agent of workers.values()) agent.stop();
    await simulator.stop();
});

module.exports = {
    startSimulator,
    stopSimulator,
    simulatorStatus,
    startWorker,
    stopWorker,
    getWorkerStatus,
    getAllStatuses,
};
