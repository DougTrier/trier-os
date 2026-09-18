// Copyright © 2026 Doug Trier
// SPDX-License-Identifier: MIT
// Licensed under the MIT License. See LICENSE in the repository root.

/**
 * Production startup backup gate. Before any application module can migrate or
 * seed data, snapshot every database when executable server code has changed.
 * SQLite's backup API includes committed WAL content; integrity and SHA-256 are
 * verified before startup is permitted. Failed snapshots never advance the gate.
 * ensureBackup(dataDir): startup gate; --snapshot: isolated backup worker.
 * No HTTP routes. These are offline/maintenance database paths, not route routing.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function filesUnder(root, codeOnly = false) {
    const files = [];
    function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (['backups', 'ha_snapshots', 'node_modules'].includes(entry.name)) continue;
            if (codeOnly && ['data', 'connectors'].includes(entry.name)) continue;
            const full = path.join(dir, entry.name);
            if (entry.isSymbolicLink()) throw new Error('Backup refuses an unregistered linked data directory: ' + full);
            if (entry.isDirectory()) walk(full);
            else files.push(full);
        }
    }
    walk(root);
    return files;
}
function codeFingerprint() {
    const digest = crypto.createHash('sha256');
    // Includes startup schema initialization and numbered migrations, even for
    // same-version repair builds. Version strings alone cannot detect changes.
    for (const file of filesUnder(__dirname, true).filter(f => /\.(js|sql)$/.test(f)).sort()) {
        digest.update(path.relative(__dirname, file)); digest.update(fs.readFileSync(file));
    }
    return digest.digest('hex');
}
function ensureBackup(dataDir, migrationFingerprint) {
    const fingerprint = migrationFingerprint ? migrationFingerprint + '-' + codeFingerprint() : codeFingerprint();
    const markerName = migrationFingerprint ? '.migration-backup.json' : '.startup-backup.json';
    const marker = path.join(dataDir, markerName);
    if (fs.existsSync(marker)) {
        const saved = JSON.parse(fs.readFileSync(marker));
        if (saved.fingerprint === fingerprint) {
            verifyBackup(saved.backup);
            return;
        }
    }
    const worker = spawnSync(process.execPath, [__filename, '--snapshot', dataDir, fingerprint, markerName], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', windowsHide: true,
        timeout: 30 * 60 * 1000, maxBuffer: 1024 * 1024,
    });
    if (worker.error || worker.status !== 0) throw new Error('Pre-upgrade backup failed; startup stopped. ' + (worker.error?.message || worker.stderr));
    console.log(worker.stdout.trim());
}
function verifyBackup(backup) {
    const manifest = JSON.parse(fs.readFileSync(path.join(backup, 'manifest.json')));
    for (const item of manifest.files) {
        const target = path.resolve(backup, item.path);
        if (!target.startsWith(path.resolve(backup) + path.sep) || hash(target) !== item.sha256) throw new Error('Pre-upgrade backup verification failed');
    }
    return manifest;
}
async function snapshot(dataDir, fingerprint, markerName = '.startup-backup.json') {
    const Database = require('better-sqlite3');
    const root = path.join(dataDir, 'backups');
    fs.mkdirSync(root, { recursive: true });
    const backup = fs.mkdtempSync(path.join(root, 'before-startup-'));
    const records = [];
    // No application DB handles have been opened in this process's parent yet.
    // Operators must stop all instances before an update for cross-DB consistency.
    for (const source of filesUnder(dataDir)) {
        if (['.startup-backup.json', '.migration-backup.json'].includes(path.basename(source)) || /-(wal|shm|journal)$/.test(source)) continue;
        const relative = path.relative(dataDir, source);
        const target = path.join(backup, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        if (/\.(db|sqlite|sqlite3)$/i.test(source)) {
            const db = new Database(source, { readonly: true, fileMustExist: true });
            try { await db.backup(target); } finally { db.close(); }
            const copy = new Database(target, { readonly: true, fileMustExist: true });
            try {
                if (copy.prepare("SELECT 1 FROM sqlite_master WHERE sql LIKE '%USING vec0%'").get()) require('sqlite-vec').load(copy);
                const check = copy.pragma('integrity_check');
                if (check.length !== 1 || check[0].integrity_check !== 'ok') throw new Error('SQLite integrity check failed: ' + relative);
            } finally { copy.close(); }
        } else fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
        records.push({ path: relative, sha256: hash(target) });
    }
    fs.writeFileSync(path.join(backup, 'manifest.json'), JSON.stringify({ fingerprint, files: records }, null, 2), { flag: 'wx' });
    verifyBackup(backup);
    const marker = path.join(dataDir, markerName);
    const temp = marker + '.' + crypto.randomUUID();
    fs.writeFileSync(temp, JSON.stringify({ fingerprint, backup }), { flag: 'wx' });
    fs.renameSync(temp, marker);
    console.log('Verified pre-startup backup: ' + backup);
}
module.exports = { ensureBackup, snapshot, verifyBackup };
if (require.main === module && process.argv[2] === '--snapshot') {
    snapshot(path.resolve(process.argv[3]), process.argv[4], process.argv[5]).catch(error => { console.error(error); process.exitCode = 1; });
}
