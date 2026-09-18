// Copyright © 2026 Doug Trier
// SPDX-License-Identifier: MIT
// Licensed under the MIT License. See LICENSE in the repository root.
/**
 * Offline regression evidence: byte-verified persistent-data copies and SQLite
 * inventory. Opens only the copied databases; never initializes source databases.
 * Actions: capture(manifest, output), inventory(copy). No HTTP routes.
 * The operator must first establish that Trier OS writers are stopped.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const quote = value => '"' + value.replaceAll('"', '""') + '"';
function files(root) {
    if (!fs.existsSync(root)) return [];
    const stat = fs.lstatSync(root);
    if (stat.isSymbolicLink()) throw new Error(`Refusing linked evidence source: ${root}`);
    return stat.isDirectory() ? fs.readdirSync(root).flatMap(name => files(path.join(root, name))) : [root];
}
function inventory(file) {
    const result = { file, bytes: fs.statSync(file).size, tables: {} };
    if (!result.bytes) return { ...result, status: 'EMPTY_FILE' };
    let db;
    try {
        db = new Database(file, { readonly: true, fileMustExist: true });
        if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND lower(sql) LIKE '%using vec0%' LIMIT 1").get()) {
            require('sqlite-vec').load(db);
        }
        result.integrity = db.pragma('integrity_check');
        result.userVersion = db.pragma('user_version', { simple: true });
        result.schemaVersion = db.pragma('schema_version', { simple: true });
        try { result.foreignKeys = db.pragma('foreign_key_check'); } catch (error) { result.foreignKeyError = error.message; }
        for (const { name, type } of db.prepare("SELECT name,type FROM pragma_table_list WHERE schema='main' AND type IN ('table','virtual') AND name NOT LIKE 'sqlite_%'").all()) {
            try {
                const digest = crypto.createHash('sha256');
                let count = 0;
                for (const row of db.prepare(`SELECT * FROM ${quote(name)}`).iterate()) { digest.update(JSON.stringify(row)); count++; }
                result.tables[name] = { count, digest: digest.digest('hex'), type };
                if (/migration|schema_version/i.test(name)) result.tables[name].versions = db.prepare(`SELECT * FROM ${quote(name)}`).all();
                // Keep identifiable IDs, but no password hashes, secret values or personal details in the report.
                if (/^(Users|UserPlantRoles|ADGroupMappings|it_hardware|it_mobile|it_software|it_infrastructure|zGroups|zUserGroups)$/.test(name)) {
                    result.tables[name].examples = db.prepare(`SELECT * FROM ${quote(name)} LIMIT 3`).all().map(row => Object.fromEntries(Object.entries(row).filter(([key]) => /^(ID|UserID|PlantID|RoleLevel|DefaultRole|GroupID|AssetID)$/.test(key))));
                }
            } catch (error) { result.tables[name] = { error: error.message }; }
        }
    } catch (error) { result.error = error.message; }
    finally { db?.close(); }
    return result;
}
function capture(sources, output) {
    if (fs.existsSync(output)) throw new Error('Evidence output must be new.');
    fs.mkdirSync(output, { recursive: true });
    const result = { at: new Date().toISOString(), sources, files: [], databases: [] };
    for (const [label, source] of Object.entries(sources)) {
        for (const sourceFile of files(source)) {
            const relative = fs.statSync(source).isDirectory() ? path.relative(source, sourceFile) : path.basename(sourceFile);
            const target = path.join(output, 'raw', label, relative);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            const before = hash(sourceFile);
            fs.copyFileSync(sourceFile, target, fs.constants.COPYFILE_EXCL);
            if (before !== hash(target) || before !== hash(sourceFile)) throw new Error(`Unstable backup: ${sourceFile}`);
            result.files.push({ source: sourceFile, relative: path.relative(output, target), hash: before });
        }
    }
    // Validate a separate analysis copy so WAL recovery cannot change the raw backup.
    fs.cpSync(path.join(output, 'raw'), path.join(output, 'analysis'), { recursive: true });
    for (const file of files(path.join(output, 'analysis')).filter(file => /\.(db|sqlite|sqlite3)$/i.test(file))) {
        result.databases.push(inventory(file));
    }
    for (const file of result.files) if (hash(file.source) !== file.hash) throw new Error(`Source changed during backup: ${file.source}`);
    fs.writeFileSync(path.join(output, 'baseline.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ output, files: result.files.length, databases: result.databases.length,
        issues: result.databases.filter(db => db.error || db.foreignKeyError || db.foreignKeys?.length || db.integrity?.some(row => row.integrity_check !== 'ok')).map(db => ({ file: db.file, error: db.error, fkError: db.foreignKeyError, fkCount: db.foreignKeys?.length, integrity: db.integrity })) }, null, 2));
    return result;
}
module.exports = { capture, inventory, files, hash };
if (require.main === module) capture(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), path.resolve(process.argv[3]));
