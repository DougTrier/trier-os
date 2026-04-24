// Copyright © 2026 Trier OS. All Rights Reserved.

const assert = require('assert');
const Database = require('better-sqlite3');

const testDb = new Database(':memory:');
testDb.exec(`
    CREATE TABLE IF NOT EXISTS ManagementOfChange (
        ID         INTEGER PRIMARY KEY AUTOINCREMENT,
        PlantID    TEXT    NOT NULL,
        Status     TEXT    NOT NULL,
        Title      TEXT    NOT NULL DEFAULT 'Test MOC'
    );
`);

const { _setDb, validateMOC } = require('../../server/gatekeeper/validators/moc');
_setDb(testDb);

async function runTests() {
    try {
        console.log('Running MOC Validator Tests...');

        // 1. Non-MOC-gated action -> allowed: true, mocRef: null
        let res = await validateMOC({ actionType: 'WORK_ORDER_CREATE', plantId: 'P1' });
        assert.strictEqual(res.allowed, true);
        assert.strictEqual(res.mocRef, null);

        // 2. MOC-gated action, no plantId -> allowed: true, mocRef: null
        res = await validateMOC({ actionType: 'SETPOINT_WRITE', plantId: null });
        assert.strictEqual(res.allowed, true);
        assert.strictEqual(res.mocRef, null);

        const stmt = testDb.prepare("INSERT INTO ManagementOfChange (PlantID, Status) VALUES (?, ?)");

        // 3. MOC-gated, MOC in APPROVED -> allowed: true, mocRef: <id>
        const idApp = stmt.run('P_APPROVED', 'APPROVED').lastInsertRowid;
        res = await validateMOC({ actionType: 'SETPOINT_WRITE', plantId: 'P_APPROVED' });
        assert.strictEqual(res.allowed, true);
        assert.strictEqual(res.mocRef, idApp);

        // 4. MOC-gated, MOC in UNDER_REVIEW -> allowed: true, mocRef: <id>
        const idRev = stmt.run('P_REVIEW', 'UNDER_REVIEW').lastInsertRowid;
        res = await validateMOC({ actionType: 'SETPOINT_WRITE', plantId: 'P_REVIEW' });
        assert.strictEqual(res.allowed, true);
        assert.strictEqual(res.mocRef, idRev);

        // 5. MOC-gated, MOC in IMPLEMENTING -> allowed: true, mocRef: <id>
        const idImp = stmt.run('P_IMPLEMENTING', 'IMPLEMENTING').lastInsertRowid;
        res = await validateMOC({ actionType: 'SETPOINT_WRITE', plantId: 'P_IMPLEMENTING' });
        assert.strictEqual(res.allowed, true);
        assert.strictEqual(res.mocRef, idImp);

        // 6. MOC-gated, no MOC at all -> empty table -> allowed: false, MOC_REQUIRED
        res = await validateMOC({ actionType: 'SETPOINT_WRITE', plantId: 'P_EMPTY' });
        assert.strictEqual(res.allowed, false);
        assert.strictEqual(res.denialReason, 'MOC_REQUIRED');

        // 7. MOC-gated, MOC in DRAFT -> allowed: false, MOC_REQUIRED
        stmt.run('P_DRAFT', 'DRAFT');
        res = await validateMOC({ actionType: 'SETPOINT_WRITE', plantId: 'P_DRAFT' });
        assert.strictEqual(res.allowed, false);
        assert.strictEqual(res.denialReason, 'MOC_REQUIRED');

        // 8. MOC-gated, MOC in COMPLETED -> allowed: false, MOC_REQUIRED
        stmt.run('P_COMPLETED', 'COMPLETED');
        res = await validateMOC({ actionType: 'SETPOINT_WRITE', plantId: 'P_COMPLETED' });
        assert.strictEqual(res.allowed, false);
        assert.strictEqual(res.denialReason, 'MOC_REQUIRED');

        console.log('All moc_validator tests passed.');
        process.exit(0);
    } catch (err) {
        console.error('Test failed:', err);
        process.exit(1);
    }
}

runTests();
