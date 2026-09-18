// Copyright © 2026 Doug Trier
// SPDX-License-Identifier: MIT
// Licensed under the MIT License. See LICENSE in the repository root.
/**
 * Database-open preservation regression. Real SQLite fixtures exercise getDb()
 * through AsyncLocalStorage; existing files must never be replaced by size.
 * Actions: normal open, absent-file initialization, corruption refusal and an
 * existing supported normalization migration. No network/API dependencies.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const Database = require('better-sqlite3');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (process.argv[2] === '--case') {
    try {
        const id = process.argv[3];
        const file = path.join(process.env.DATA_DIR, id + '.db');
        const db = require('../../server/database');
        if (id === 'Corrupt') {
            const before = hash(file);
            assert.throws(() => db.asyncLocalStorage.run(id, () => db.getDb()));
            assert.equal(hash(file), before, 'Corrupt database must be retained byte-for-byte');
        } else {
            const connection = db.asyncLocalStorage.run(id, () => db.getDb());
            assert.equal(connection.pragma('integrity_check', { simple: true }), 'ok');
            if (['Small', 'Normal', 'Custom', 'Migrate'].includes(id)) {
                assert.deepEqual(connection.prepare('SELECT * FROM CustomerSentinel').all(), [{ ID: 1, Value: 'must survive opening' }]);
            }
            if (id === 'Missing') {
                assert.ok(connection.prepare("SELECT name FROM sqlite_master WHERE name='Work'").get());
                assert.equal(connection.prepare('SELECT checksum FROM migration_history WHERE filename=?').get('template-migration').checksum, 'preserve-ledger');
            }
            if (id === 'Migrate') {
                connection.transaction(() => require('../../server/migrations/001_initial_normalization').up(connection))();
                assert.equal(connection.prepare('SELECT Description FROM Part WHERE ID=?').get('CUSTOM-PART').Description, 'Customer description');
                assert.equal(connection.prepare('SELECT Value FROM CustomerSentinel').get().Value, 'must survive opening');
            }
            connection.close();
        }
        process.exit(0);
    } catch (error) { console.error(error); process.exit(1); }
} else {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trier-db-open-'));
    fs.copyFileSync(path.join(__dirname, '../../data/schema_template.db'), path.join(root, 'schema_template.db'));
    const template = new Database(path.join(root, 'schema_template.db'));
    template.exec("CREATE TABLE IF NOT EXISTS migration_history(filename TEXT PRIMARY KEY, checksum TEXT, disposition TEXT); INSERT OR REPLACE INTO migration_history VALUES('template-migration','preserve-ledger','applied');");
    template.close();
    for (const id of ['Small', 'Normal', 'Empty', 'Missing', 'Corrupt', 'Custom', 'Migrate']) {
        const file = path.join(root, id + '.db');
        if (id === 'Corrupt') fs.writeFileSync(file, 'corrupt customer database; never replace');
        else if (id !== 'Missing') {
            const db = new Database(file);
            if (id === 'Empty') db.exec('VACUUM');
            else {
                db.exec("CREATE TABLE CustomerSentinel(ID INTEGER PRIMARY KEY, Value TEXT); INSERT INTO CustomerSentinel VALUES(1,'must survive opening');");
                if (id === 'Normal') db.exec('CREATE TABLE Payload(Bytes BLOB); INSERT INTO Payload VALUES(zeroblob(131072));');
                if (id === 'Custom') db.exec('CREATE TABLE CustomerRelationship(ID INTEGER PRIMARY KEY, Parent INTEGER REFERENCES CustomerSentinel(ID)); INSERT INTO CustomerRelationship VALUES(1,1);');
                if (id === 'Migrate') db.exec("CREATE TABLE Part(ID TEXT PRIMARY KEY, Descript TEXT); INSERT INTO Part VALUES('CUSTOM-PART','Customer description');");
            }
            db.close();
        }
        const result = spawnSync(process.execPath, [__filename, '--case', id], {
            env: { ...process.env, DATA_DIR: root, NODE_ENV: 'test' }, windowsHide: true, encoding: 'utf8', timeout: 30000,
        });
        assert.equal(result.status, 0, `${id}: ${result.stdout}\n${result.stderr}`);
        console.log('PASS database preservation:', id);
    }
    console.log('Isolated evidence:', root);
}
