// Copyright © 2026 Doug Trier
// SPDX-License-Identifier: MIT
// Licensed under the MIT License. See LICENSE in the repository root.
/** SOP parent-key regression. Real isolated SQLite databases; no API dependencies. */
'use strict';
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const migration = require('../../server/migrations/062_sop_parent_key');
for (const mode of ['valid', 'duplicate', 'orphan']) {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE Procedures(ID TEXT, Description TEXT); CREATE TABLE SOPAcknowledgments(ID INTEGER PRIMARY KEY, ProcedureID TEXT, Username TEXT, FOREIGN KEY(ProcedureID) REFERENCES Procedures(ID));');
    // Populate a valid FK first, then reproduce the missing parent index.
    // Foreign-key enforcement is never disabled.
    db.exec('CREATE UNIQUE INDEX fixture_parent ON Procedures(ID)');
    db.prepare('INSERT INTO Procedures VALUES (?,?)').run('customer-procedure', 'Keep exact procedure');
    if (mode === 'orphan') db.prepare('INSERT INTO Procedures VALUES (?,?)').run('missing', 'Temporary fixture parent');
    db.prepare('INSERT INTO SOPAcknowledgments VALUES (1,?,?)').run(mode === 'orphan' ? 'missing' : 'customer-procedure', 'customer-user');
    db.exec('DROP INDEX fixture_parent');
    // DELETE with a broken FK is rightly rejected. Create the orphan fixture
    // with its own valid parent table, then remove that parent before migration.
    if (mode === 'orphan') {
        db.exec('ALTER TABLE SOPAcknowledgments RENAME TO OrphanFixture; CREATE TABLE SOPAcknowledgments(ID INTEGER PRIMARY KEY, ProcedureID TEXT, Username TEXT); INSERT INTO SOPAcknowledgments SELECT * FROM OrphanFixture; DROP TABLE OrphanFixture; DELETE FROM Procedures WHERE ID=\'missing\';');
    }
    if (mode === 'duplicate') db.prepare('INSERT INTO Procedures VALUES (?,?)').run('customer-procedure', 'Keep duplicate too');
    if (mode === 'valid') assert.throws(() => db.pragma('foreign_key_check'), /foreign key mismatch/);
    const before = JSON.stringify([db.prepare('SELECT * FROM Procedures').all(), db.prepare('SELECT * FROM SOPAcknowledgments').all()]);
    const apply = db.transaction(() => migration.up(db));
    if (mode === 'valid') {
        apply(); apply();
        db.exec('CREATE TABLE EnforcedAcknowledgments(ID INTEGER PRIMARY KEY, ProcedureID TEXT REFERENCES Procedures(ID)); INSERT INTO EnforcedAcknowledgments VALUES (1,\'customer-procedure\');');
        assert.throws(() => db.exec("INSERT INTO EnforcedAcknowledgments VALUES (2,'missing')"), /FOREIGN KEY/);
        assert.equal(db.pragma('integrity_check')[0].integrity_check, 'ok');
        assert.deepEqual(db.pragma('foreign_key_check'), []);
    } else assert.throws(apply, mode === 'duplicate' ? /Duplicate/ : /Orphan/);
    assert.equal(JSON.stringify([db.prepare('SELECT * FROM Procedures').all(), db.prepare('SELECT * FROM SOPAcknowledgments').all()]), before);
    db.close();
}
console.log('PASS: SOP parent uniqueness, exact row preservation, valid relationship, orphan/duplicate rollback, idempotence.');
