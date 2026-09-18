// Copyright © 2026 Doug Trier
// SPDX-License-Identifier: MIT
// Licensed under the MIT License. See LICENSE in the repository root.
/**
 * Historical migration regression on isolated real SQLite files. Reconstructs
 * each ordered prefix from the shipped base schema, then upgrades that prefix.
 * No HTTP dependencies; never opens source databases for writing.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const { spawnSync } = require('node:child_process');
const compat = require('../../server/migration_compat');
const migrate = require('../../server/migrator');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trier-migration-chain-'));
const migrationDir = path.resolve(__dirname, '../../server/migrations');
const files = fs.readdirSync(migrationDir).filter(f => /^\d+_.+\.(js|sql)$/.test(f)).sort((a,b) => parseInt(a)-parseInt(b) || a.localeCompare(b));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const created = new Set();
for (const file of files) for (const match of fs.readFileSync(path.join(migrationDir,file),'utf8').matchAll(/CREATE\s+(?:VIRTUAL\s+)?TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)/gi)) created.add(match[1].toLowerCase());
const template = new Database(path.resolve(__dirname,'../../data/schema_template.db'),{readonly:true});
const baseTables = template.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().filter(row => !created.has(row.name.toLowerCase()) && row.name !== 'schema_version');
template.close();
function fixture(dir) {
    fs.mkdirSync(dir,{recursive:true});
    for (const [name,scope] of [['Customer.db','plant'],['mfg_master.db','catalog'],['trier_logistics.db','logistics'],['trier_auth.db','auth']]) {
        const db = new Database(path.join(dir,name));
        if(scope==='plant') {
            for(const row of baseTables) db.exec(row.sql);
            db.prepare('INSERT INTO Asset(ID,Description) VALUES (?,?)').run('CUSTOM-ASSET','Keep asset');
            db.prepare('INSERT INTO Work(ID,WorkOrderNumber,Description) VALUES (?,?,?)').run(990001,'CUSTOM-WO','Keep history');
            db.prepare('INSERT INTO Part(ID,Description) VALUES (?,?)').run('CUSTOM-PART','Keep part');
            db.prepare('INSERT INTO Procedures(ID,Description) VALUES (?,?)').run('CUSTOM-SOP','Keep procedure');
        }
        if(scope==='catalog') db.exec('CREATE TABLE MasterEquipment(EquipmentTypeID TEXT PRIMARY KEY,UsefulLifeYears INTEGER); INSERT INTO MasterEquipment VALUES (\'CUSTOM-EQUIP\',17);');
        if(scope==='logistics') db.exec("CREATE TABLE api_keys(id INTEGER PRIMARY KEY, token TEXT); CREATE TABLE ITHardware(ID INTEGER PRIMARY KEY,PlantID TEXT,AssetName TEXT); INSERT INTO ITHardware VALUES(1,'Customer','Keep IT asset'); CREATE TABLE AuditLog(ID INTEGER PRIMARY KEY,Action TEXT); INSERT INTO AuditLog VALUES(1,'Keep history');");
        if(scope==='auth') db.exec("CREATE TABLE Users(UserID INTEGER PRIMARY KEY,Username TEXT,Role TEXT); INSERT INTO Users VALUES(1,'customer-admin','admin'); CREATE TABLE UserGroups(ID INTEGER PRIMARY KEY,Name TEXT); INSERT INTO UserGroups VALUES(2,'Customer group'); CREATE TABLE Membership(UserID INTEGER,GroupID INTEGER); INSERT INTO Membership VALUES(1,2); CREATE TABLE Grants(UserID INTEGER,Permission TEXT); INSERT INTO Grants VALUES(1,'customer-permission');");
        db.exec("CREATE TABLE CustomerSentinel(ID INTEGER PRIMARY KEY,Value TEXT); INSERT INTO CustomerSentinel VALUES(1,'never replace customer data');");
        db.close();
    }
    fs.writeFileSync(path.join(dir,'plants.json'),JSON.stringify([{id:'Customer',label:'Customer site'}]));
}
const scopes = { 'Customer.db':'plant','mfg_master.db':'catalog','trier_logistics.db':'logistics','trier_auth.db':'auth' };
function rows(dir) {
    const result={};
    for(const [file,scope] of Object.entries(scopes)) {
        const db=new Database(path.join(dir,file),{readonly:true});
        const tables={plant:['CustomerSentinel','Asset','Work','Part','Procedures'],catalog:['CustomerSentinel','MasterEquipment'],logistics:['CustomerSentinel','ITHardware','AuditLog'],auth:['CustomerSentinel','Users','UserGroups','Membership','Grants']}[scope];
        result[file]=Object.fromEntries(tables.map(table=>[table,db.prepare(`SELECT * FROM ${quote(table)}`).all()]));
        db.close();
    }
    return result;
}
function preserved(before,after) {
    for(const [file,tables] of Object.entries(before)) for(const [table,records] of Object.entries(tables)) {
        assert.equal(after[file][table].length,records.length,`${file}/${table} row count`);
        records.forEach((record,i)=> { for(const [key,value] of Object.entries(record)) assert.deepEqual(after[file][table][i][key],value,`${file}/${table}/${key}`); });
    }
}
const seed=path.join(root,'base'); fixture(seed);
const records=rows(seed), results=[];
try {
    // Prefix construction is itself performed against backed-up fixture copies.
    for(let count=0;count<=files.length;count++) {
        const dir=path.join(root,'level-'+String(count).padStart(2,'0'));
        fs.cpSync(seed,dir,{recursive:true});
        const prefix=files.slice(0,count);
        for(const [file,scope] of Object.entries(scopes)) {
            const db=new Database(path.join(dir,file));
            db.pragma('journal_mode=WAL');
            if(scope==='catalog') require('sqlite-vec').load(db);
            db.transaction(()=> {
                db.exec('CREATE TABLE schema_version(version INTEGER PRIMARY KEY,filename TEXT,applied_at TEXT DEFAULT CURRENT_TIMESTAMP)');
                for(const migration of prefix.filter(f=>compat.scopes(f).includes(scope))) {
                    compat.apply(path.join(migrationDir,migration),db,scope,dir);
                    db.prepare('INSERT OR IGNORE INTO schema_version(version,filename) VALUES (?,?)').run(parseInt(migration),migration);
                }
            }).immediate();
            db.close();
        }
        const before=rows(dir);
        const outcome=migrate({dataDir:dir});
        preserved(records,rows(dir)); preserved(before,rows(dir));
        const marker=JSON.parse(fs.readFileSync(path.join(dir,'.migration-backup.json')));
        require('../../server/preflight_backup').verifyBackup(marker.backup);
        assert.equal(migrate({dataDir:dir}).applied,0);
        const db=new Database(path.join(dir,'Customer.db'));
        assert.equal(db.prepare("SELECT COUNT(*) n FROM migration_history WHERE filename LIKE '017_%'").get().n,2);
        assert.equal(db.pragma('integrity_check',{simple:true}),'ok');
        assert.deepEqual(db.pragma('foreign_key_check'),[]); db.close();
        results.push({prefix, outcome, backup:marker.backup, status:'PASS'});
        console.log(`PASS prefix ${count}/${files.length}: ${prefix.at(-1)||'base schema'} -> current`);
    }
    // A failure after a write must roll back both customer data and its ledger.
    const failDir=path.join(root,'failed'); fs.cpSync(seed,failDir,{recursive:true});
    const badMigrations=path.join(root,'injected-migrations'); fs.mkdirSync(badMigrations);
    fs.writeFileSync(path.join(badMigrations,'063_failure.js'),"module.exports.up=db=>{db.exec(\"UPDATE CustomerSentinel SET Value='damaged'; CREATE TABLE Uncommitted(ID INTEGER)\");throw Error('injected failure');};");
    assert.throws(()=>migrate({dataDir:failDir,migrationsDir:badMigrations}),/injected failure/);
    assert.deepEqual(rows(failDir),records);
    const failed=new Database(path.join(failDir,'Customer.db'));
    assert.equal(failed.prepare("SELECT 1 FROM sqlite_master WHERE name IN ('migration_history','Uncommitted')").get(),undefined); failed.close();
    results.push({scenario:'injected failure rolls back schema, records and ledger',status:'PASS'});
    const interruptedDir=path.join(root,'interrupted'); fs.cpSync(seed,interruptedDir,{recursive:true});
    fs.writeFileSync(path.join(badMigrations,'063_failure.js'),"module.exports.up=db=>{db.exec(\"UPDATE CustomerSentinel SET Value='uncommitted crash'; CREATE TABLE Uncommitted(ID INTEGER)\");process.exit(99);};");
    const interrupted=spawnSync(process.execPath,['-e','require('+JSON.stringify(require.resolve('../../server/migrator'))+')('+JSON.stringify({dataDir:interruptedDir,migrationsDir:badMigrations})+')'],{windowsHide:true,encoding:'utf8'});
    assert.equal(interrupted.status,99);
    assert.deepEqual(rows(interruptedDir),records);
    const crash=new Database(path.join(interruptedDir,'Customer.db'));
    assert.equal(crash.prepare("SELECT 1 FROM sqlite_master WHERE name IN ('migration_history','Uncommitted')").get(),undefined); crash.close();
    const recovery=migrate({dataDir:interruptedDir});
    preserved(records,rows(interruptedDir));
    results.push({scenario:'process exit mid-transaction rolls back; complete upgrade resumes',recovery,status:'PASS'});
    const freshDir=path.join(root,'fresh-auth'); fs.cpSync(seed,freshDir,{recursive:true});
    fs.unlinkSync(path.join(freshDir,'trier_auth.db'));
    migrate({dataDir:freshDir});
    const freshAuth=new Database(path.join(freshDir,'trier_auth.db'));
    assert.ok(freshAuth.prepare("SELECT 1 FROM sqlite_master WHERE name='UserADGroups'").get()); freshAuth.close();
    results.push({scenario:'distribution without auth DB provisions group schema on first startup',status:'PASS'});
    fs.writeFileSync(path.join(root,'results.json'),JSON.stringify({root,files,results},null,2));
    console.log('PASS migration chain. Evidence: '+root);
} catch(error) {
    fs.writeFileSync(path.join(root,'results.json'),JSON.stringify({root,files,results,error:error.stack},null,2));
    console.error(error); console.error('Evidence: '+root); process.exitCode=1;
}
