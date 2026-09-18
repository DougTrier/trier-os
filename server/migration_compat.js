// Copyright © 2026 Doug Trier
// SPDX-License-Identifier: MIT
// Licensed under the MIT License. See LICENSE in the repository root.
/**
 * Historical migration compatibility: immutable scripts execute against one
 * runner-owned connection and transaction. No HTTP routes. This is a trusted
 * code adapter, not a sandbox for customer scripts.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function scopes(file) {
    const n = parseInt(file, 10);
    if ([34, 47, 49].includes(n)) return ['catalog'];
    if (n === 41) return ['logistics', 'auth'];
    if ([36, 37, 38, 39, 40, 42, 43, 44, 46, 52, 61].includes(n)) return ['logistics'];
    if (n === 35) return ['plant', 'logistics'];
    if (n === 48) return ['catalog', 'logistics'];
    if ([33, 53, 54, 55, 56].includes(n)) return ['plant', 'catalog'];
    return ['plant'];
}

// Three historical files contain independent statements for two databases.
// The other scope is explicitly deferred to its own ledger/transaction.
const deferred = {
    exec() {}, pragma() {}, close() {},
    prepare() { return { run() { return { changes: 0 }; } }; },
};

function apply(filePath, db, scope, dataDir) {
    const file = path.basename(filePath), n = parseInt(file, 10);
    // A legacy database can already contain 045's invalid triggers when its
    // missing duplicate-017 backfill is recovered. Satisfy that known forward
    // prerequisite before the backfill; 063 is still recorded in the same atomic
    // upgrade at its normal position. No historical file is modified.
    if (file === '017_seed_cost_centers.js') require('./migrations/063_eventlog_required_columns').up(db);
    const errors = [];
    const existingTables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
    const normalized = n === 50 && ['failure_class', 'normalized_mode'].every(column => db.prepare('SELECT 1 FROM pragma_table_info(?) WHERE name=?').get('failure_modes', column));
    if (n === 50) {
        // The old migration assumed this request-lazy table already existed.
        // Use the unchanged schema from gap_features.ensureFailureCodesTable.
        db.exec(`CREATE TABLE IF NOT EXISTS FailureCodes (
            id INTEGER PRIMARY KEY AUTOINCREMENT, woId TEXT NOT NULL,
            failureCode TEXT, failureDesc TEXT, causeCode TEXT, causeDesc TEXT,
            remedyCode TEXT, remedyDesc TEXT, severity TEXT DEFAULT 'Medium',
            createdAt TEXT DEFAULT CURRENT_TIMESTAMP, createdBy TEXT
        )`);
    }
    function observed(fn) {
        return (...args) => { try { return fn(...args); } catch (e) {
            // Several immutable scripts deliberately catch duplicate-column
            // errors as their idempotency check. Other caught failures are fatal.
            if (!/^duplicate column name:/i.test(e.message)) errors.push(e);
            throw e;
        } };
    }
    // Only the historically unconditional ADD COLUMN statements need this
    // compatibility treatment. An existing column is retained without changes.
    function compatibleSql(sql) {
        if (n === 17 && /UPDATE Work SET WorkOrderNumber = ID WHERE WorkOrderNumber IS NULL/i.test(sql)) {
            // NULL IDs cannot supply a number. Updating them to NULL needlessly
            // fires EventLog's required AggregateID constraint on old demo rows.
            return sql + ' AND ID IS NOT NULL';
        }
        if (![2, 16, 20, 48, 55].includes(n)) return sql;
        return sql.replace(/ALTER TABLE ["`\[]?(\w+)["`\]]? ADD COLUMN ["`\[]?(\w+)["`\]]?[^;]*;?/gi, statement => {
            const [, table, column] = /ALTER TABLE ["`\[]?(\w+)["`\]]? ADD COLUMN ["`\[]?(\w+)/i.exec(statement);
            return db.prepare(`PRAGMA table_info("${table}")`).all().some(c => c.name.toLowerCase() === column.toLowerCase()) ? '' : statement;
        });
    }
    const connection = new Proxy(db, {
        get(target, key) {
            if (key === 'close') return () => {};
            if (key === 'exec') return observed(sql => { const text = compatibleSql(sql); return text.trim() ? target.exec(text) : target; });
            if (key === 'prepare') return observed(sql => {
                const seed = /^\s*INSERT OR IGNORE INTO (catalog_artifacts|plant_artifacts|artifact_context_map)\b/i.exec(sql);
                if (([53, 54].includes(n) && seed && existingTables.has(seed[1])) || (normalized && /^\s*UPDATE failure_modes SET failure_class/i.test(sql))) {
                    // Manual/partially recorded historic upgrades must not repeat
                    // non-unique seeds or replace customer classifications.
                    return { run: () => ({ changes: 0 }) };
                }
                const text = compatibleSql(sql);
                if (!text.trim()) return { run: () => ({ changes: 0 }) };
                const statement = target.prepare(text);
                return new Proxy(statement, { get(s, k) { return typeof s[k] === 'function' ? observed(s[k].bind(s)) : s[k]; } });
            });
            if (key === 'pragma') return observed((sql, options) => {
                if (/^journal_mode\s*=/i.test(sql)) return target.pragma('journal_mode', options);
                return target.pragma(sql, options);
            });
            return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
        },
    });
    const selectedName = scope === 'plant' ? 'migration_plant.db' : ({ catalog: 'mfg_master.db', logistics: 'trier_logistics.db', auth: 'trier_auth.db' })[scope];
    function selectDatabase(value) {
        if (value === connection || value === db || path.basename(String(value)) === selectedName) return connection;
        if ([35, 41, 48].includes(n)) return deferred;
        throw new Error(`Migration ${file} attempted an unexpected database: ${value}`);
    }
    const ordinaryRequire = createRequire(filePath);
    function scopedRequire(id) {
        if (id === 'better-sqlite3') return function Database(value) { return selectDatabase(value); };
        if (id === '../resolve_data_dir') return dataDir;
        if (id === '../logistics_db') return { db: scope === 'logistics' ? connection : deferred };
        if (id === '../auth_db') return scope === 'auth' ? connection : deferred;
        if (id === 'fs') return {
            readdirSync: () => scope === 'plant' ? [selectedName] : [],
            existsSync: value => path.basename(String(value)) === selectedName,
        };
        return ordinaryRequire(id);
    }
    if (file.endsWith('.sql')) { connection.exec(fs.readFileSync(filePath, 'utf8')); return; }
    // These files already expose single-database local functions. Invoke those
    // functions instead of their directory-wide legacy entry point.
    let entry = null;
    if ([50, 51].includes(n)) entry = 'runOnDb';
    if (n === 53) entry = scope === 'catalog' ? 'migrateGlobalCatalog' : 'migratePlantDb';
    if (n === 54) entry = scope === 'catalog' ? 'migrateGlobal' : 'migratePlant';
    if (n === 55) entry = scope === 'catalog' ? 'migrateMfgMaster' : 'migratePlant';
    const module = { exports: {} };
    const source = fs.readFileSync(filePath, 'utf8') + (entry ? `\nmodule.exports = ${entry};` : '');
    const wrapper = vm.runInThisContext(`(function(require,module,exports,__dirname,__filename){\n${source}\n})`, { filename: filePath });
    wrapper(scopedRequire, module, module.exports, path.dirname(filePath), filePath);
    const run = typeof module.exports === 'function' ? module.exports : module.exports.up;
    if (run) run(entry ? path.join(dataDir, selectedName) : connection);
    else if (file !== '017_seed_cost_centers.js') throw new Error(`Unsupported migration export: ${file}`);
    // Old scripts sometimes catch SQL failures and log success. A caught SQL
    // failure must still roll back the enclosing transaction and stop startup.
    if (errors.length) throw errors[0];
}
module.exports = { scopes, apply };
