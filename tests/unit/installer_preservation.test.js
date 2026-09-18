// Copyright © 2026 Doug Trier
// SPDX-License-Identifier: MIT
// Licensed under the MIT License. See LICENSE in the repository root.

/**
 * Offline installer preservation regressions using disposable installations and
 * real SQLite databases. Captures every record and file hash, including complete
 * Users rows, UserPlantRoles, UserADGroups and GatekeeperRoleMap group grants.
 * CLI: node tests/unit/installer_preservation.test.js [--installers]
 * No live install paths or production registry identifiers are used by tests.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const Database = require('better-sqlite3');
const repo = path.resolve(__dirname, '../..');
const script = path.join(repo, 'electron/preserve-data.ps1');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trier-preservation-'));
const install = path.join(root, 'installation');
const state = path.join(root, 'persistent');
const results = [];
function run(command, args, options = {}) {
    const result = spawnSync(command, args, { cwd: repo, encoding: 'utf8', timeout: 180000, windowsHide: true, ...options });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, `${command}: ${result.stdout}\n${result.stderr}`);
    return result.stdout;
}
function maintain(action, extra = [], success = true) {
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script,
        '-Action', action, '-InstallDir', install, '-StateRoot', state, ...extra], { encoding: 'utf8', timeout: 180000, windowsHide: true });
    if (success) assert.equal(result.status, 0, result.stdout + result.stderr);
    else assert.notEqual(result.status, 0, 'Operation should have failed closed');
    return result;
}
function write(file, data) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); }
function manifest() { return JSON.parse(fs.readFileSync(path.join(state, 'deployment.json'))); }
function inventory() { require('../../electron/program-inventory').writeInventory(install); }
function seed(dir) {
    fs.mkdirSync(dir, { recursive: true });
    run(process.execPath, ['-e', `console.log=()=>{};const d=require('./server/auth_db');d.close();`], {
        env: { ...process.env, DATA_DIR: dir, NODE_ENV: 'production' },
    });
    const auth = new Database(path.join(dir, 'trier_auth.db'));
    auth.exec(`CREATE TABLE UserADGroups (UserID INTEGER, ADGroup TEXT, PRIMARY KEY(UserID,ADGroup));`);
    const insert = auth.prepare('INSERT INTO Users (Username, PasswordHash, DefaultRole, TokenVersion, DisplayName) VALUES (?, ?, ?, ?, ?)');
    for (const [i, name] of ['it_admin', 'creator@trieros', 'customer_technician', 'customer_manager'].entries()) {
        const id = insert.run(name, 'exact-existing-password-hash-' + i, i === 3 ? 'plant_manager' : 'it_admin', 13, 'Customer profile').lastInsertRowid;
        auth.prepare('INSERT INTO UserPlantRoles VALUES (?, ?, ?)').run(id, 'Customer_Plant', 'technician');
        auth.prepare('INSERT INTO UserPlantRoles VALUES (?, ?, ?)').run(id, 'Second_Plant', 'manager');
        for (const group of ['CN=Maintenance,OU=Groups', 'CN=Safety,OU=Groups']) auth.prepare('INSERT INTO UserADGroups VALUES (?, ?)').run(id, group);
    }
    // Deliberately restricted administrator grants must also survive startup.
    auth.exec("UPDATE Users SET CanImport=0, CanViewAnalytics=0, GlobalAccess=0, Email='saved@example.invalid';");
    auth.pragma('journal_mode = DELETE');
    auth.close();
    const areas = {
        'Customer_Plant.db': ['Assets', 'WorkOrders', 'WorkOrderHistory', 'PMTasks', 'Training', 'QualityRecords', 'Inventory', 'CostCenters'],
        'Second_Plant.db': ['Assets', 'WorkOrders'],
        'trier_logistics.db': ['it_hardware', 'it_software', 'it_mobile', 'it_infrastructure', 'it_vendors_contracts', 'it_asset_user_link', 'AuditLog', 'SafetyPermits', 'LOTO', 'GatekeeperRoleMap'],
        'corporate_master.db': ['Departments', 'Sites', 'Employees'],
        'trier_chat.db': ['Messages'], 'custom-customer.db': ['CustomerExtension'],
    };
    for (const [file, tables] of Object.entries(areas)) {
        const db = new Database(path.join(dir, file));
        for (const table of tables) {
            db.exec(`CREATE TABLE "${table}" (ID INTEGER PRIMARY KEY, Content TEXT NOT NULL);`);
            const stmt = db.prepare(`INSERT INTO "${table}" VALUES (?, ?)`);
            db.transaction(() => {
                for (let i = 1; i <= (table === 'it_hardware' ? 10000 : 3); i++) stmt.run(i, `${table}:${i}:DO-NOT-DELETE-8675309`);
            })();
        }
        db.close();
    }
    write(path.join(dir, 'plants.json'), JSON.stringify([{ id: 'Customer_Plant', label: 'Customer plant' }, { id: 'Second_Plant' }]));
    for (const file of ['branding.json', 'network-config.json', '.sync_key', 'certs/customer.key', 'uploads/workorders/photo.jpg', 'edge_keys/device.key', 'backups/customer-backup.db']) write(path.join(dir, file), 'exact customer data: ' + file);
}
function snapshot(dir) {
    const files = {};
    const databases = {};
    function walk(folder) {
        for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
            const full = path.join(folder, entry.name);
            if (entry.isDirectory()) walk(full);
            else {
                if (/-(wal|shm)$/.test(entry.name)) continue; // SQLite reader coordination files are not records.
                const relative = path.relative(dir, full);
                files[relative] = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
                if (entry.name.endsWith('.db') && !relative.startsWith('backups')) {
                    const db = new Database(full, { readonly: true, fileMustExist: true });
                    assert.deepEqual(db.pragma('integrity_check'), [{ integrity_check: 'ok' }]);
                    databases[relative] = Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
                        .map(({ name }) => [name, db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`).all()]));
                    db.close();
                }
            }
        }
    }
    walk(dir);
    return { files, databases };
}
function pass(label) { results.push(label); console.log('PASS ' + label); }

try {
    const seedPath = path.join(install, 'resources/seed-data');
    seed(seedPath);
    write(path.join(install, 'program.txt'), 'version one');
    inventory();
    maintain('Prepare'); maintain('Commit');
    const data = manifest().DataDir;
    const expected = snapshot(data);
    assert.equal(Object.keys(expected.databases).length, 7);
    pass('Clean install initializes complete data structure');

    // Existing auth identities must survive production startup, including the
    // old it_admin account, restricted flags, token versions and group rows.
    write(path.join(data, 'auth.json'), JSON.stringify({ master: 'stale-password-must-not-replace' }));
    run(process.execPath, ['-e', `console.log=()=>{};const d=require('./server/auth_db');d.close();`], {
        env: { ...process.env, DATA_DIR: data, NODE_ENV: 'production' },
    });
    assert.deepEqual(snapshot(data).databases['trier_auth.db'], expected.databases['trier_auth.db']);
    let populated = snapshot(data);
    pass('Production startup retains exact users, password hashes, roles, groups and grants');

    for (const scenario of ['Upgrade with populated databases', 'Same-version reinstall']) {
        maintain('Prepare'); maintain('Verify');
        write(path.join(install, 'program.txt'), scenario);
        maintain('Commit');
        assert.deepEqual(snapshot(data), populated);
        pass(scenario);
    }
    maintain('Uninstall');
    assert.deepEqual(snapshot(data), populated);
    assert.ok(!fs.existsSync(path.join(install, 'program.txt')));
    pass('Uninstall retains all persistent records and files');
    maintain('Prepare');
    write(path.join(install, 'program.txt'), 'reinstalled');
    // Deliberately do not provide fresh seed data: retained installs never need it.
    maintain('Commit');
    assert.deepEqual(snapshot(data), populated);
    pass('Reinstall after retained-data uninstall reuses exact databases');

    maintain('Prepare');
    write(path.join(install, 'program.txt'), 'failed replacement');
    assert.throws(() => require('../../electron/storage').resolveDeployment(install), /interrupted/);
    maintain('Prepare'); // crash/retry uses verified existing transaction
    maintain('Rollback');
    assert.equal(fs.readFileSync(path.join(install, 'program.txt'), 'utf8'), 'reinstalled');
    assert.deepEqual(snapshot(data), populated);
    pass('Interrupted upgrade blocks startup, resumes safely, rolls back program files');

    maintain('Prepare');
    const pending = JSON.parse(fs.readFileSync(path.join(state, 'maintenance.json')));
    const backupFile = path.join(pending.Backup, pending.Files[0].Path);
    const original = fs.readFileSync(backupFile);
    fs.writeFileSync(backupFile, 'corrupted backup');
    maintain('Commit', [], false);
    assert.deepEqual(snapshot(data), populated);
    fs.writeFileSync(backupFile, original);
    maintain('Rollback');
    pass('Corrupt backup aborts update without changing persistent data');

    run(process.execPath, ['server/preflight_backup.js', '--snapshot', data, 'fixture-code-change']);
    const startup = JSON.parse(fs.readFileSync(path.join(data, '.startup-backup.json')));
    const migrated = new Database(path.join(data, 'Customer_Plant.db'));
    migrated.exec("ALTER TABLE Assets ADD COLUMN NewColumn TEXT; UPDATE Assets SET NewColumn='migration'; CREATE TABLE NewMigrationTable (ID INTEGER);");
    migrated.close();
    maintain('Restore', ['-Backup', startup.backup], false);
    maintain('Restore', ['-Backup', startup.backup, '-Confirmation', 'RESTORE TRIER OS DATA']);
    assert.deepEqual(snapshot(data).databases, populated.databases);
    populated = snapshot(data);
    pass('Verified SQLite pre-startup backup restores exact pre-migration records and schema');

    maintain('Reset', [], false);
    assert.deepEqual(snapshot(data), populated);
    maintain('Reset', ['-Confirmation', 'DELETE TRIER OS DATA']);
    assert.deepEqual(fs.readdirSync(data), []);
    const resetBackup = fs.readdirSync(path.join(state, 'backups')).find(n => /^reset-[0-9a-f]{32}$/.test(n));
    const resetRoot = path.join(state, 'backups', resetBackup, path.basename(data));
    assert.deepEqual(snapshot(resetRoot), populated);
    pass('Explicit destructive reset requires confirmation and preserves verified recovery copy');
    if (process.argv.includes('--installers')) require('./installer_packages').testPackages({ root, repo, seed, snapshot, pass, run });
    write(path.join(root, 'results.json'), JSON.stringify({ results, root }, null, 2));
    console.log('Evidence retained at ' + root);
} catch (error) {
    console.error(error.stack);
    console.error('Failed fixture retained at ' + root);
    process.exitCode = 1;
}
