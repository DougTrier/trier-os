// Copyright © 2026 Trier OS. All Rights Reserved.

const assert = require('assert');
const Database = require('better-sqlite3');
const simulated = require('../../server/gatekeeper/adapters/simulated');
const Module = require('module');
const originalRequire = Module.prototype.require;

// We need an in-memory db with the AdapterConfig table
let testDb;

// Mock logisticsDb
Module.prototype.require = function(path) {
    if (path.includes('../../logistics_db')) {
        return { db: testDb };
    }
    return originalRequire.apply(this, arguments);
};

async function runTests() {
    try {
        console.log('Running Adapter Dispatcher & Simulated tests (G8)...');

        testDb = new Database(':memory:');
        testDb.exec(`
            CREATE TABLE IF NOT EXISTS AdapterConfig (
                ConfigID        INTEGER PRIMARY KEY AUTOINCREMENT,
                PlantID         TEXT    NOT NULL UNIQUE,
                AdapterType     TEXT    NOT NULL DEFAULT 'SIMULATED',
                Endpoint        TEXT    NOT NULL DEFAULT '',
                NodeID          TEXT,
                Register        INTEGER,
                UnitID          INTEGER DEFAULT 1,
                SecurityMode    TEXT    DEFAULT 'None',
                Credentials     TEXT,
                TimeoutMs       INTEGER NOT NULL DEFAULT 5000,
                SimulationMode  INTEGER NOT NULL DEFAULT 1,
                Notes           TEXT,
                CreatedBy       TEXT    NOT NULL DEFAULT 'system',
                CreatedAt       TEXT    DEFAULT (datetime('now')),
                UpdatedAt       TEXT    DEFAULT (datetime('now'))
            );
        `);

        // 1. simulated.execute() always returns success
        const r1 = await simulated.execute({ requestId: 'r1', actionType: 'SETPOINT_WRITE', targetId: 't1', plantId: 'p1', payload: 42 });
        assert.strictEqual(r1.success, true);
        assert.strictEqual(r1.simulated, true);

        // 2. simulated.testConnection() always returns success
        const r2 = await simulated.testConnection({});
        assert.strictEqual(r2.success, true);
        assert.strictEqual(r2.simulated, true);

        const dispatcher = require('../../server/gatekeeper/adapters/index');

        // 3. Non-adapter-dispatched action
        const r3 = await dispatcher.dispatch({ actionType: 'WORK_ORDER_CREATE', plantId: 'P1' });
        assert.strictEqual(r3.success, true);
        assert.strictEqual(r3.dispatched, false);

        // 4. No AdapterConfig in DB
        const r4 = await dispatcher.dispatch({ actionType: 'SETPOINT_WRITE', plantId: 'P_NONE', requestId: 'r4', targetId: 't4', payload: 42 });
        assert.strictEqual(r4.success, true);
        assert.strictEqual(r4.simulated, true);

        // 5. AdapterConfig exists but SimulationMode=1
        testDb.prepare("INSERT INTO AdapterConfig (PlantID, AdapterType, SimulationMode) VALUES (?, ?, ?)").run('P_SIM1', 'OPC_UA', 1);
        const r5 = await dispatcher.dispatch({ actionType: 'SETPOINT_WRITE', plantId: 'P_SIM1', requestId: 'r5', targetId: 't5', payload: 42 });
        assert.strictEqual(r5.success, true);
        assert.strictEqual(r5.simulated, true);

        // 6. AdapterConfig with SimulationMode=0, AdapterType='SIMULATED'
        testDb.prepare("INSERT INTO AdapterConfig (PlantID, AdapterType, SimulationMode) VALUES (?, ?, ?)").run('P_SIM0', 'SIMULATED', 0);
        const r6 = await dispatcher.dispatch({ actionType: 'SETPOINT_WRITE', plantId: 'P_SIM0', requestId: 'r6', targetId: 't6', payload: 42 });
        assert.strictEqual(r6.success, true);
        assert.strictEqual(r6.simulated, true);

        Module.prototype.require = originalRequire;

        console.log('All adapter_simulated tests passed.');
        if (testDb) testDb.close();
        process.exit(0);
    } catch (err) {
        console.error('Test failed:', err);
        Module.prototype.require = originalRequire;
        if (testDb) testDb.close();
        process.exit(1);
    }
}

runTests();
