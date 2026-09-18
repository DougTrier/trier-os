// Copyright © 2026 Doug Trier
// SPDX-License-Identifier: MIT
// Licensed under the MIT License. See LICENSE in the repository root.

/**
 * Preservation boundary tests: locked WAL databases, nondefault external stores,
 * unrecognized symlinks, safe build destinations and failed startup snapshots.
 * Real SQLite/filesystem fixtures live only under a generated TEMP directory.
 * CLI only; no HTTP routes or access to live deployment databases.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const Database = require('better-sqlite3');
const repo = path.resolve(__dirname, '../..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trier-preservation-edges-'));
function maintain(base, action, expected = 0) {
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', path.join(repo, 'electron/preserve-data.ps1'), '-Action', action,
        '-InstallDir', path.join(base, 'install'), '-StateRoot', path.join(base, 'state')], { encoding: 'utf8', windowsHide: true, timeout: 120000 });
    if (expected === 0) assert.equal(result.status, 0, result.stdout + result.stderr);
    else assert.notEqual(result.status, 0);
}
function fixture(base) {
    const dir = path.join(base, 'install/resources/data');
    fs.mkdirSync(dir, { recursive: true });
    const db = new Database(path.join(dir, 'trier_auth.db'));
    db.pragma('journal_mode=WAL');
    db.exec("CREATE TABLE Users (ID INTEGER, Name TEXT); INSERT INTO Users VALUES (1, 'retain-user');");
    return db;
}
async function main() {
    const locked = path.join(root, 'locked');
    const db = fixture(locked);
    maintain(locked, 'Prepare', 1);
    assert.equal(db.prepare('SELECT Name FROM Users').get().Name, 'retain-user');
    assert.ok(!fs.existsSync(path.join(locked, 'state/maintenance.json')));
    db.close();
    maintain(locked, 'Prepare'); maintain(locked, 'Commit');
    console.log('PASS Locked SQLite/WAL source aborts before any cleanup; retry succeeds');

    const external = path.join(root, 'external');
    fs.mkdirSync(path.join(external, 'install/resources/app'), { recursive: true });
    const externalData = path.join(external, 'operator-data');
    fs.mkdirSync(externalData);
    fs.writeFileSync(path.join(externalData, 'customer.json'), 'exact customer configuration');
    fs.writeFileSync(path.join(external, 'install/resources/app/.env'), 'DATA_DIR="' + externalData + '"');
    maintain(external, 'Prepare'); maintain(external, 'Commit');
    assert.equal(require('../../electron/storage').resolveDeployment(path.join(external, 'install')), externalData);
    maintain(external, 'Prepare'); maintain(external, 'Commit');
    assert.equal(fs.readFileSync(path.join(externalData, 'customer.json'), 'utf8'), 'exact customer configuration');
    console.log('PASS Explicit external DATA_DIR is backed up, reused and retained');

    const linked = path.join(root, 'linked');
    fixture(linked).close();
    fs.symlinkSync(externalData, path.join(linked, 'install/unrecognized-link'), 'junction');
    maintain(linked, 'Prepare', 1);
    assert.equal(fs.readFileSync(path.join(externalData, 'customer.json'), 'utf8'), 'exact customer configuration');
    console.log('PASS Unrecognized reparse points block destructive cleanup');

    const guard = path.join(root, 'guard.ps1');
    fs.writeFileSync(guard, `param([string]$Source,[string]$Destination)\n$ErrorActionPreference='Stop'\n. (Join-Path $Source 'scripts/build_directory_guard.ps1')\nNew-DistributionDirectory $Destination $Source\n`);
    const existing = path.join(root, 'existing-build'); fs.mkdirSync(existing);
    fs.writeFileSync(path.join(existing, 'customer.db'), 'do not delete');
    const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', guard, '-Source', repo, '-Destination', existing], { windowsHide: true });
    assert.notEqual(result.status, 0);
    assert.equal(fs.readFileSync(path.join(existing, 'customer.db'), 'utf8'), 'do not delete');
    console.log('PASS Build refuses existing destinations without deleting any files');

    const beforeStartup = path.join(root, 'preflight'); fs.mkdirSync(beforeStartup);
    const wal = new Database(path.join(beforeStartup, 'customer.db'));
    wal.pragma('journal_mode=WAL'); wal.pragma('wal_autocheckpoint=0');
    wal.exec("CREATE TABLE Saved (Value TEXT); INSERT INTO Saved VALUES ('committed WAL record');");
    const backup = require('../../server/preflight_backup');
    await backup.snapshot(beforeStartup, 'test-v1');
    const marker = JSON.parse(fs.readFileSync(path.join(beforeStartup, '.startup-backup.json')));
    const saved = new Database(path.join(marker.backup, 'customer.db'), { readonly: true });
    assert.equal(saved.prepare('SELECT Value FROM Saved').get().Value, 'committed WAL record'); saved.close(); wal.close();
    fs.writeFileSync(path.join(beforeStartup, 'corrupt.db'), 'not SQLite');
    await assert.rejects(() => backup.snapshot(beforeStartup, 'test-v2'));
    assert.equal(JSON.parse(fs.readFileSync(path.join(beforeStartup, '.startup-backup.json'))).fingerprint, 'test-v1');
    console.log('PASS Startup backup includes committed WAL and rejects corrupt SQLite without advancing the gate');
    console.log('Evidence: ' + root);
}
main().catch(error => { console.error(error); console.error('Fixture: ' + root); process.exitCode = 1; });
