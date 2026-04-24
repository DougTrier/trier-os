// Copyright © 2026 Trier OS. All Rights Reserved.

const assert = require('assert');
const Database = require('better-sqlite3');

async function runTests() {
    let testDb;
    try {
        console.log('Running GatekeeperAuditLedger Immutability (G7) tests...');
        testDb = new Database(':memory:');

        // Create the minimal table (matching migration 040)
        testDb.exec(`
            CREATE TABLE IF NOT EXISTS GatekeeperAuditLedger (
                LedgerID INTEGER PRIMARY KEY AUTOINCREMENT,
                RequestId TEXT NOT NULL UNIQUE,
                Timestamp TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', 'utc') || 'Z'),
                PlantID TEXT NOT NULL,
                UserID TEXT NOT NULL,
                ActionType TEXT NOT NULL,
                TargetID TEXT NOT NULL,
                ValidationResult TEXT NOT NULL,
                DenialReason TEXT,
                RoleAtDecision TEXT,
                PTWRef TEXT,
                MOCRef TEXT,
                ProcessingMs INTEGER
            );
        `);

        // Apply migration 042 triggers
        testDb.exec(`
            CREATE TRIGGER IF NOT EXISTS prevent_audit_update
            BEFORE UPDATE ON GatekeeperAuditLedger
            BEGIN
                SELECT RAISE(ABORT, 'GatekeeperAuditLedger is immutable: updates not permitted');
            END;

            CREATE TRIGGER IF NOT EXISTS prevent_audit_delete
            BEFORE DELETE ON GatekeeperAuditLedger
            BEGIN
                SELECT RAISE(ABORT, 'GatekeeperAuditLedger is immutable: deletes not permitted');
            END;
        `);

        console.log('1. INSERT succeeds — insert a row into GatekeeperAuditLedger');
        const stmt = testDb.prepare(`
            INSERT INTO GatekeeperAuditLedger (
                RequestId, PlantID, UserID, ActionType, TargetID, ValidationResult
            ) VALUES (?, ?, ?, ?, ?, ?)
        `);
        const info = stmt.run('test-req-1', 'P_TEST', 'u1', 'test_action', 't1', 'ALLOWED');
        assert.ok(info.lastInsertRowid > 0);

        console.log('2. UPDATE throws — attempt UPDATE GatekeeperAuditLedger');
        assert.throws(
            () => testDb.prepare("UPDATE GatekeeperAuditLedger SET ValidationResult = ? WHERE LedgerID = ?").run('TAMPERED', 1),
            /immutable/
        );

        console.log('3. DELETE throws — attempt DELETE FROM GatekeeperAuditLedger');
        assert.throws(
            () => testDb.prepare("DELETE FROM GatekeeperAuditLedger WHERE LedgerID = ?").run(1),
            /immutable/
        );

        console.log('4. Trigger presence — query sqlite_master for both trigger names');
        const triggers = testDb.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type = 'trigger' 
              AND name IN ('prevent_audit_update', 'prevent_audit_delete')
        `).all();

        const triggerNames = triggers.map(t => t.name);
        assert.ok(triggerNames.includes('prevent_audit_update'));
        assert.ok(triggerNames.includes('prevent_audit_delete'));
        assert.strictEqual(triggerNames.length, 2);

        console.log('All audit_ledger.test.js tests passed.');
        if (testDb) testDb.close();
        process.exit(0);
    } catch (err) {
        console.error('Test failed:', err);
        if (testDb) testDb.close();
        process.exit(1);
    }
}

runTests();
