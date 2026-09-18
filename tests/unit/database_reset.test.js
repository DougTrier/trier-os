// Copyright © 2026 Doug Trier
// SPDX-License-Identifier: MIT
// Licensed under the MIT License. See LICENSE in the repository root.

/**
 * Database reset and IT deletion HTTP regressions.
 * Runs real routers, JWT middleware and SQLite connections in a disposable DATA_DIR.
 * POST /api/database/reset-plant and /api/it/:category/bulk-delete are exercised
 * against foreign keys, rollback failures, authorization and two-site fixtures.
 * Run: node tests/unit/database_reset.test.js (stops at the first failure).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');

async function main() {
    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trier-reset-'));
    process.env.DATA_DIR = fixtureDir;
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
    fs.copyFileSync(path.join(__dirname, '../../data/schema_template.db'), path.join(fixtureDir, 'schema_template.db'));
    fs.writeFileSync(path.join(fixtureDir, 'plants.json'), JSON.stringify([
        { id: 'Corporate_Office', label: 'Corporate Office' },
        { id: 'Plant_2', label: 'Plant 2' },
    ]));
    const db = require('../../server/database');
    // The bootstrap prints a generated creator password; suppress it for this fixture.
    const originalLog = console.log;
    let authDb;
    try { console.log = () => {}; authDb = require('../../server/auth_db'); }
    finally { console.log = originalLog; }
    const { db: logistics } = require('../../server/logistics_db');
    const app = express();
    app.use(express.json());
    app.use('/api', (req, res, next) => db.asyncLocalStorage.run(req.headers['x-plant-id'], next));
    app.use('/api', require('../../server/middleware/auth'));
    app.use('/api/database', require('../../server/routes/database'));
    app.use('/api/it', require('../../server/routes/it'));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const tokens = {};
    for (const role of ['it_admin', 'technician']) {
        const result = authDb.prepare('INSERT INTO Users (Username, PasswordHash, DefaultRole) VALUES (?, ?, ?)')
            .run(`reset_${role}`, 'unused-test-password-hash', role);
        tokens[role] = jwt.sign({ UserID: result.lastInsertRowid, Username: `reset_${role}`, globalRole: role,
            plantRoles: { Corporate_Office: role, Plant_2: role }, tokenVersion: 0 }, process.env.JWT_SECRET);
    }
    const call = async (url, body, plant = 'Corporate_Office', role = 'it_admin') => {
        const response = await fetch(origin + url, { method: 'POST', headers: {
            'Content-Type': 'application/json', 'x-plant-id': plant, Authorization: `Bearer ${tokens[role]}`,
        }, body: JSON.stringify(body) });
        return { status: response.status, body: await response.json() };
    };
    const plantDb = plant => db.asyncLocalStorage.run(plant, () => db.getDb());
    try {
        const office = plantDb('Corporate_Office');
        const other = plantDb('Plant_2');
        for (const conn of [office, other]) conn.exec(`
            CREATE TABLE ResetParent (ID INTEGER PRIMARY KEY);
            CREATE TABLE ResetChild (ID INTEGER PRIMARY KEY, ParentID INTEGER REFERENCES ResetParent(ID));
            INSERT INTO ResetParent VALUES (1);
            INSERT INTO ResetChild VALUES (1, 1);
        `);
        logistics.prepare('INSERT INTO it_hardware (Name, PlantID) VALUES (?, ?)').run('Office test PC', 'Corporate_Office');
        logistics.prepare('INSERT INTO it_hardware (Name, PlantID) VALUES (?, ?)').run('Other site PC', 'Plant_2');
        const officeHardware = logistics.prepare('SELECT ID FROM it_hardware WHERE PlantID = ?').get('Corporate_Office').ID;
        const software = logistics.prepare('INSERT INTO it_software (Name, PlantID) VALUES (?, ?)').run('Office license', 'Corporate_Office').lastInsertRowid;
        for (const table of ['it_mobile', 'it_infrastructure']) logistics.prepare(`INSERT INTO ${table} (Name, PlantID) VALUES (?, ?)`).run('Office fixture', 'Corporate_Office');
        logistics.prepare('INSERT INTO it_vendors_contracts (VendorName, PlantID) VALUES (?, ?)').run('Office contract', 'Corporate_Office');
        logistics.prepare('INSERT INTO it_software_hardware_link (SoftwareID, HardwareID) VALUES (?, ?)').run(software, officeHardware);
        logistics.prepare("INSERT INTO it_asset_user_link (AssetCategory, AssetID, UserEmail) VALUES ('hardware', ?, 'fixture@example.invalid')").run(officeHardware);
        logistics.prepare("INSERT INTO it_asset_movements (AssetCategory, AssetID, MovementType, FromPlantID) VALUES ('hardware', ?, 'Receive', 'Corporate_Office')").run(officeHardware);
        logistics.prepare("INSERT INTO AuditLog (UserID, Action, PlantID) VALUES ('fixture', 'RETAIN_HISTORY', 'Corporate_Office')").run();
        const usersBefore = authDb.prepare('SELECT COUNT(*) AS n FROM Users').get().n;
        const lookupBefore = office.prepare('SELECT COUNT(*) AS n FROM WorkType').get().n;
        // Real deployments append history and HA tombstones on DELETE. Reset
        // must retain these rows instead of deleting the queue or failing its
        // empty-operational-table verification after triggers refill it.
        office.exec(`CREATE TRIGGER RegressionDeleteHistory AFTER DELETE ON ResetParent BEGIN
            INSERT INTO EventLog (TableName,AggregateType,AggregateID,EventType) VALUES ('ResetParent','Regression',OLD.ID,'DELETE');
            INSERT INTO sync_ledger (table_name,row_id,operation,change_data,server_id) VALUES ('ResetParent',OLD.ID,'DELETE','{}','PRIMARY');
        END;`);
        const historyBefore = office.prepare('SELECT COUNT(*) n FROM EventLog').get().n;
        const ledgerBefore = office.prepare('SELECT COUNT(*) n FROM sync_ledger').get().n;
        office.exec("CREATE TABLE migration_history(filename TEXT PRIMARY KEY,checksum TEXT,disposition TEXT); INSERT INTO migration_history VALUES('062_sop_parent_key.js','fixture-checksum','applied');");
        office.exec("CREATE VIRTUAL TABLE ResetSearch USING fts5(content); INSERT INTO ResetSearch VALUES ('fixture');");
        const preview = await call('/api/database/reset-plant', { dryRun: true });
        assert.equal(preview.status, 200);
        assert.equal(preview.body.counts['it.it_software_hardware_link'], 1, 'Overlapping asset links count once');
        assert.equal(preview.body.counts['plant.ResetParent'], 1);
        assert.equal(office.prepare('SELECT COUNT(*) AS n FROM ResetParent').get().n, 1, 'Preview is read-only');
        assert.equal((await call('/api/database/reset-plant', { confirmPlantName: 'Wrong site' })).status, 400);
        for (const plant of ['all_sites', '../Corporate_Office', 'trier_auth', 'Missing_Site']) {
            const denied = await call('/api/database/reset-plant', { dryRun: true }, plant);
            assert.ok([400, 404].includes(denied.status), JSON.stringify(denied));
        }
        assert.equal((await call('/api/database/reset-plant', { dryRun: true }, 'Corporate_Office', 'technician')).status, 403);
        const result = await call('/api/database/reset-plant', { confirmPlantName: 'Corporate Office' });
        assert.equal(result.status, 200, JSON.stringify(result.body));
        assert.equal(office.prepare('SELECT COUNT(*) AS n FROM ResetParent').get().n, 0,
            'A successful reset must remove parents after their children');
        assert.equal(logistics.prepare('SELECT COUNT(*) AS n FROM it_hardware WHERE PlantID = ?').get('Corporate_Office').n, 0,
            'A successful Corporate Office reset must remove its IT assets');
        assert.equal(other.prepare('SELECT COUNT(*) AS n FROM ResetParent').get().n, 1);
        assert.equal(logistics.prepare('SELECT COUNT(*) AS n FROM it_hardware WHERE PlantID = ?').get('Plant_2').n, 1);
        assert.equal(result.body.totalRowsDeleted, preview.body.totalRows);
        assert.equal(result.body.remainingRecords, 0);
        assert.ok(Object.values(result.body.remaining).every(n => n === 0));
        assert.equal(logistics.prepare('SELECT COUNT(*) AS n FROM it_software_hardware_link').get().n, 0);
        assert.equal(logistics.prepare('SELECT COUNT(*) AS n FROM it_asset_movements').get().n, 1);
        assert.equal(logistics.prepare("SELECT COUNT(*) AS n FROM AuditLog WHERE Action = 'RETAIN_HISTORY'").get().n, 1);
        assert.equal(logistics.prepare("SELECT COUNT(*) AS n FROM AuditLog WHERE Action = 'PLANT_RESET'").get().n, 1);
        assert.equal(authDb.prepare('SELECT COUNT(*) AS n FROM Users').get().n, usersBefore);
        assert.equal(office.prepare('SELECT COUNT(*) AS n FROM WorkType').get().n, lookupBefore);
        assert.equal(office.prepare('SELECT COUNT(*) n FROM EventLog').get().n, historyBefore + 1);
        assert.equal(office.prepare('SELECT COUNT(*) n FROM sync_ledger').get().n, ledgerBefore + 1);
        assert.deepEqual(office.prepare('SELECT * FROM migration_history').all(), [{ filename: '062_sop_parent_key.js', checksum: 'fixture-checksum', disposition: 'applied' }]);
        for (const file of [result.body.snapshotFile, result.body.logisticsSnapshotFile]) {
            assert.ok(fs.statSync(path.join(fixtureDir, file)).size > 0);
        }
        console.log('PASS: preview, scope validation, all IT categories, FK order, FTS storage, counts, backups and retained history.');

        office.exec("INSERT INTO ResetParent VALUES (2); CREATE TRIGGER BlockReset BEFORE DELETE ON ResetParent BEGIN SELECT RAISE(ABORT, 'injected reset failure'); END;");
        logistics.prepare('INSERT INTO it_hardware (Name, PlantID) VALUES (?, ?)').run('Rollback fixture', 'Corporate_Office');
        const failed = await call('/api/database/reset-plant', { confirmPlantName: 'Corporate Office' });
        assert.equal(failed.status, 500);
        assert.equal(office.prepare('SELECT COUNT(*) AS n FROM ResetParent').get().n, 1);
        assert.equal(logistics.prepare('SELECT COUNT(*) AS n FROM it_hardware WHERE PlantID = ?').get('Corporate_Office').n, 1, 'Shared deletes roll back with plant failure');
        assert.equal(logistics.prepare("SELECT COUNT(*) AS n FROM AuditLog WHERE Action = 'PLANT_RESET'").get().n, 1);
        office.exec('DROP TRIGGER BlockReset');
        logistics.exec("CREATE TRIGGER IgnoreITReset BEFORE DELETE ON it_hardware WHEN OLD.PlantID = 'Corporate_Office' BEGIN SELECT RAISE(IGNORE); END;");
        assert.equal((await call('/api/database/reset-plant', { confirmPlantName: 'Corporate Office' })).status, 500);
        assert.equal(office.prepare('SELECT COUNT(*) AS n FROM ResetParent').get().n, 1, 'Verification failure rolls back local deletes');
        logistics.exec('DROP TRIGGER IgnoreITReset');
        assert.equal((await call('/api/database/reset-plant', { confirmPlantName: 'Corporate Office' })).status, 200);
        assert.equal((await call('/api/database/reset-plant', { confirmPlantName: 'Corporate Office' })).body.totalRowsDeleted, 0, 'Empty reset reports zero honestly');
        console.log('PASS: SQL errors and ignored deletes roll back both databases; retries and empty reset work.');

        for (const category of ['hardware', 'software', 'infrastructure', 'mobile']) {
            const id = logistics.prepare(`INSERT INTO it_${category} (Name, PlantID) VALUES (?, ?)`).run('Bulk fixture', 'Corporate_Office').lastInsertRowid;
            const items = [{ ID: id, PlantID: 'Corporate_Office' }];
            assert.equal((await call(`/api/it/${category}/bulk-delete`, { items }, 'Corporate_Office', 'technician')).status, 403);
            const mismatch = await call(`/api/it/${category}/bulk-delete`, { items: [{ ID: id, PlantID: 'Plant_2' }] });
            assert.equal(mismatch.body.results[0].status, 'NOT_FOUND');
            const deleted = await call(`/api/it/${category}/bulk-delete`, { items });
            assert.equal(deleted.body.results[0].status, 'DELETED');
            assert.equal(logistics.prepare(`SELECT COUNT(*) AS n FROM it_${category} WHERE ID = ?`).get(id).n, 0);
            assert.equal((await call(`/api/it/${category}/bulk-delete`, { items })).body.results[0].status, 'NOT_FOUND');
        }
        const good = logistics.prepare("INSERT INTO it_hardware (Name, PlantID) VALUES ('Bulk good', NULL)").run().lastInsertRowid;
        const bad = logistics.prepare("INSERT INTO it_hardware (Name, PlantID) VALUES ('Bulk blocked', 'Corporate_Office')").run().lastInsertRowid;
        logistics.exec("CREATE TRIGGER BlockBulk BEFORE DELETE ON it_hardware WHEN OLD.Name = 'Bulk blocked' BEGIN SELECT RAISE(ABORT, 'injected bulk failure'); END;");
        const mixed = await call('/api/it/hardware/bulk-delete', { items: [{ ID: good, PlantID: null }, { ID: bad, PlantID: 'Corporate_Office' }] });
        assert.equal(mixed.status, 200); assert.equal(mixed.body.success, false); assert.equal(mixed.body.deletedCount, 1);
        assert.deepEqual(mixed.body.results.map(row => row.status), ['DELETED', 'FAILED']);
        assert.ok(logistics.prepare('SELECT ID FROM it_hardware WHERE ID = ?').get(bad));
        assert.equal((await call('/api/it/hardware/bulk-delete', { items: [{ ID: bad, PlantID: '../bad' }] })).status, 400);
        assert.equal((await call('/api/it/hardware/bulk-delete', { items: [{ ID: bad, PlantID: null }, { ID: bad, PlantID: null }] })).status, 400);
        logistics.exec('DROP TRIGGER BlockBulk');
        assert.equal(logistics.prepare("SELECT COUNT(*) AS n FROM AuditLog WHERE Action = 'IT_ASSET_DELETE'").get().n, 5);
        console.log('PASS: all bulk categories, permissions, moved/missing assets, partial failure, retries and actor audit.');
        if (process.argv.includes('--ui')) await require('./reset_ui')({ app, origin, tokens, logistics, fixtureDir });
    } finally {
        await new Promise(resolve => server.close(resolve));
        db.close(); logistics.close(); authDb.close();
        // Keep failed fixtures available for diagnosis; they contain only generated test data.
        console.log(`Disposable regression data: ${fixtureDir}`);
    }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
