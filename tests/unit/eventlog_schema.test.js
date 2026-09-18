// Copyright © 2026 Doug Trier
// SPDX-License-Identifier: MIT
// Licensed under the MIT License. See LICENSE in the repository root.
/** Real SQLite EventLog prerequisite regression. No API dependencies. */
'use strict';
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const fix = require('../../server/migrations/063_eventlog_required_columns');
const db = new Database(':memory:');
db.exec(`CREATE TABLE Work(ID INTEGER PRIMARY KEY,Description TEXT); INSERT INTO Work VALUES(1,'keep work');
    CREATE TABLE Part(ID TEXT PRIMARY KEY,Description TEXT); INSERT INTO Part VALUES('P','keep part');
    CREATE TABLE ProductLoss(ID INTEGER PRIMARY KEY,Quantity REAL); INSERT INTO ProductLoss VALUES(1,2);
    CREATE TABLE EventLog(ID INTEGER PRIMARY KEY,Details TEXT); INSERT INTO EventLog VALUES(1,'keep history');
    CREATE TRIGGER el_work_update AFTER UPDATE ON Work BEGIN INSERT INTO EventLog(Details) VALUES(json_object('ActualHours',NEW.ActualHours)); END;
    CREATE TRIGGER el_part_update AFTER UPDATE ON Part BEGIN INSERT INTO EventLog(Details) VALUES(json_object('VendorName',NEW.VendorName,'VendorEmail',NEW.VendorEmail)); END;
    CREATE TRIGGER el_productloss_update AFTER UPDATE ON ProductLoss BEGIN INSERT INTO EventLog(Details) VALUES(json_object('EnteredDate',NEW.EnteredDate)); END;`);
assert.throws(()=>db.exec("UPDATE Work SET Description='changed' WHERE ID=1"),/NEW.ActualHours/);
assert.throws(()=>db.exec("UPDATE Part SET Description='changed' WHERE ID='P'"),/NEW.VendorName/);
assert.throws(()=>db.exec('UPDATE ProductLoss SET Quantity=3 WHERE ID=1'),/NEW.EnteredDate/);
const before = Object.fromEntries(['Work','Part','ProductLoss','EventLog'].map(table=>[table,db.prepare(`SELECT * FROM ${table}`).all()]));
db.transaction(()=>fix.up(db))();fix.up(db);
for(const [table,rows] of Object.entries(before)) for(const [column,value] of Object.entries(rows[0])) assert.equal(db.prepare(`SELECT "${column}" AS v FROM ${table}`).get().v,value);
db.exec("UPDATE Work SET ActualHours=2 WHERE ID=1; UPDATE Part SET VendorName='Customer Vendor',VendorEmail='fixture@example.invalid' WHERE ID='P'; UPDATE ProductLoss SET EnteredDate='2026-09-17' WHERE ID=1;");
assert.equal(db.prepare('SELECT COUNT(*) n FROM EventLog').get().n,4);
assert.equal(db.prepare('SELECT Details FROM EventLog WHERE ID=1').get().Details,'keep history');
assert.equal(db.pragma('integrity_check',{simple:true}),'ok');assert.deepEqual(db.pragma('foreign_key_check'),[]);db.close();
console.log('PASS: reproduced blocked writes; forward repair preserves rows/history and restores EventLog writes.');
