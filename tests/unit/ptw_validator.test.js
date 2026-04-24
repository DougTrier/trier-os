// Copyright © 2026 Trier OS. All Rights Reserved.

const assert = require('assert');
const Database = require('better-sqlite3');

const testDb = new Database(':memory:');
testDb.exec(`
    CREATE TABLE IF NOT EXISTS LotoPermits (
        ID INTEGER PRIMARY KEY AUTOINCREMENT,
        PermitNumber TEXT UNIQUE,
        PlantID TEXT NOT NULL,
        Status TEXT DEFAULT 'ACTIVE',
        ExpiresAt TEXT
    );
`);

const { _setDb, validatePTW } = require('../../server/gatekeeper/validators/ptw');
_setDb(testDb);

async function runTests() {
    try {
        console.log('Running PTW Validator Tests...');

        // 1. Non-PTW action type -> allowed: true, ptwRef: null
        let res = await validatePTW({ actionType: 'WORK_ORDER_CREATE', plantId: 'P1' });
        assert.strictEqual(res.allowed, true);
        assert.strictEqual(res.ptwRef, null);

        // 2. PTW-gated action, no plantId -> allowed: true, ptwRef: null
        res = await validatePTW({ actionType: 'SETPOINT_WRITE', plantId: null });
        assert.strictEqual(res.allowed, true);
        assert.strictEqual(res.ptwRef, null);

        // 3. PTW-gated action, active permit exists -> allowed: true, ptwRef: <id>
        const stmt = testDb.prepare("INSERT INTO LotoPermits (PlantID, Status, ExpiresAt) VALUES (?, ?, ?)");
        const id1 = stmt.run('P_ACTIVE', 'ACTIVE', null).lastInsertRowid;
        
        res = await validatePTW({ actionType: 'SETPOINT_WRITE', plantId: 'P_ACTIVE' });
        assert.strictEqual(res.allowed, true);
        assert.strictEqual(res.ptwRef, id1);

        // 4. PTW-gated action, no permits at all -> empty table -> allowed: false, PTW_REQUIRED
        res = await validatePTW({ actionType: 'SETPOINT_WRITE', plantId: 'P_EMPTY' });
        assert.strictEqual(res.allowed, false);
        assert.strictEqual(res.denialReason, 'PTW_REQUIRED');

        // 5. PTW-gated action, only expired permits -> allowed: false, PTW_REQUIRED
        stmt.run('P_EXPIRED', 'ACTIVE', '2020-01-01T00:00:00.000Z');
        res = await validatePTW({ actionType: 'SETPOINT_WRITE', plantId: 'P_EXPIRED' });
        assert.strictEqual(res.allowed, false);
        assert.strictEqual(res.denialReason, 'PTW_REQUIRED');

        // 6. PTW-gated action, permit exists but Status = 'CLOSED' -> allowed: false, PTW_REQUIRED
        stmt.run('P_CLOSED', 'CLOSED', null);
        res = await validatePTW({ actionType: 'SETPOINT_WRITE', plantId: 'P_CLOSED' });
        assert.strictEqual(res.allowed, false);
        assert.strictEqual(res.denialReason, 'PTW_REQUIRED');

        console.log('All ptw_validator tests passed.');
        process.exit(0);
    } catch (err) {
        console.error('Test failed:', err);
        process.exit(1);
    }
}

runTests();
