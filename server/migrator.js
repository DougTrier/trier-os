// Copyright © 2026 Doug Trier
// SPDX-License-Identifier: MIT
// Licensed under the MIT License. See LICENSE in the repository root.
/**
 * Schema migration runner. Number/filename ordering preserves both historical
 * 017 files. Each database owns its filename ledger and atomic upgrade.
 * Verified backup precedes writes; a failed upgrade stops startup. No routes.
 */
'use strict';
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const compat = require('./migration_compat');
const hasTable = (db, table) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
const hasColumn = (db, table, column) => db.prepare('SELECT name FROM pragma_table_info(?) WHERE name=?').get(table, column);
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

function alreadyApplied(db, file) {
    const n = parseInt(file, 10);
    if (hasTable(db, 'migration_history') && db.prepare('SELECT 1 FROM migration_history WHERE filename=?').get(file)) return 'recorded';
    if (hasTable(db, 'schema_version') && db.prepare('SELECT 1 FROM schema_version WHERE filename=?').get(file)) {
        // 022 swallowed a connection/path TypeError; check its actual column.
        if (n !== 22 || hasColumn(db, 'Asset', 'PartNumber')) return 'legacy ledger';
    }
    return null;
}

function runMigrations(options = {}) {
    const dataDir = path.resolve(options.dataDir || require('./resolve_data_dir'));
    const migrationsDir = options.migrationsDir || path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => /^\d+_.+\.(js|sql)$/.test(f))
        .sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || a.localeCompare(b));
    const registryPath = path.join(dataDir, 'plants.json');
    const registered = fs.existsSync(registryPath) ? new Set(JSON.parse(fs.readFileSync(registryPath, 'utf8')).map(plant => plant.id + '.db')) : null;
    const plans = [];
    for (const filename of fs.readdirSync(dataDir).filter(f => f.endsWith('.db')).sort()) {
        if (['corporate_master.db', 'trier_chat.db'].includes(filename) || /backup|snapshot|\.old\./i.test(filename)) continue;
        const db = new Database(path.join(dataDir, filename), { readonly: true, fileMustExist: true });
        try {
            const scope = filename === 'mfg_master.db' ? 'catalog' : filename === 'trier_logistics.db' ? 'logistics' : filename === 'trier_auth.db' ? 'auth' :
                ((!registered || registered.has(filename) || filename === 'schema_template.db') && hasTable(db, 'Asset') && hasTable(db, 'Part') && hasTable(db, 'Work') ? 'plant' : null);
            if (!scope) continue;
            if (scope === 'catalog') require('sqlite-vec').load(db);
            if (db.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('SQLite integrity check failed');
            const steps = files.filter(f => compat.scopes(f).includes(scope)).map(file => {
                const checksum = digest(fs.readFileSync(path.join(migrationsDir, file)));
                const reason = alreadyApplied(db, file);
                if (reason === 'recorded' && db.prepare('SELECT checksum FROM migration_history WHERE filename=?').get(file).checksum !== checksum) throw new Error(`Applied migration changed: ${file}`);
                return { file, checksum, reason };
            });
            if (steps.some(step => step.reason !== 'recorded')) plans.push({ filename, scope, steps });
        } finally { db.close(); }
    }
    // Auth data is intentionally absent from distribution seeds. Historically
    // 041 initialized its group table through auth_db; retain that fresh-install
    // behavior without running account seed code during migration planning.
    if (!fs.existsSync(path.join(dataDir, 'trier_auth.db')) && (registered || fs.existsSync(path.join(dataDir, 'schema_template.db')))) {
        plans.push({ filename: 'trier_auth.db', scope: 'auth', steps: files.filter(f => compat.scopes(f).includes('auth'))
            .map(file => ({ file, checksum: digest(fs.readFileSync(path.join(migrationsDir, file))), reason: null })) });
    }
    if (!plans.length) return { applied: 0, databases: [] };
    require('./preflight_backup').ensureBackup(dataDir, 'migration-' + digest(JSON.stringify(plans)));
    const report = { applied: 0, databases: [] };
    for (const plan of plans) {
        const db = new Database(path.join(dataDir, plan.filename), { fileMustExist: plan.filename !== 'trier_auth.db' });
        try {
            if (plan.scope === 'catalog') require('sqlite-vec').load(db);
            db.pragma('journal_mode = WAL');
            db.pragma('foreign_keys = ON');
            const completed = [];
            db.transaction(() => {
                db.exec('CREATE TABLE IF NOT EXISTS schema_version(version INTEGER PRIMARY KEY, filename TEXT NOT NULL, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP); CREATE TABLE IF NOT EXISTS migration_history(filename TEXT PRIMARY KEY, checksum TEXT NOT NULL, disposition TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);');
                for (const step of plan.steps) {
                    if (step.reason === 'recorded') continue;
                    if (!step.reason) {
                        compat.apply(path.join(migrationsDir, step.file), db, plan.scope, dataDir);
                        completed.push(step.file);
                    }
                    db.prepare('INSERT INTO migration_history(filename,checksum,disposition) VALUES (?,?,?)').run(step.file, step.checksum, step.reason || 'applied');
                    db.prepare('INSERT OR IGNORE INTO schema_version(version,filename) VALUES (?,?)').run(parseInt(step.file, 10), step.file);
                }
                if (db.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Post-migration integrity check failed');
                if (db.pragma('foreign_key_check').length) throw new Error('Post-migration foreign-key violations; upgrade rolled back without deleting rows');
            }).immediate();
            report.applied += completed.length;
            report.databases.push({ database: plan.filename, applied: completed });
            console.log(`[Migrations] ${plan.filename}: ${completed.length} applied; preservation checks passed.`);
        } catch (error) {
            throw new Error(`Migration failed for ${plan.filename}; startup stopped, verified backup retained: ${error.message}`, { cause: error });
        } finally { db.close(); }
    }
    return report;
}
module.exports = runMigrations;
