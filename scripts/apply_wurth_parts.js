// Copyright © 2026 Trier OS. All Rights Reserved.
// Injects Würth Section 7 Service & Repair parts into mfg_master.db.
//
// Usage:
//   node scripts/apply_wurth_parts.js [--dry-run]

'use strict';

const fs       = require('fs');
const Database = require('better-sqlite3');

const SQL_PATH = 'scripts/wurth_s7_parts.sql';
const DB_PATH  = 'data/mfg_master.db';
const DRY_RUN  = process.argv.includes('--dry-run');

if (!fs.existsSync(SQL_PATH)) {
  console.error(`SQL file not found: ${SQL_PATH}`);
  console.error('Run: node scripts/extract_wurth.js first');
  process.exit(1);
}

const sql = fs.readFileSync(SQL_PATH, 'utf8');
const statements = sql.split('\n').filter(l => l.startsWith('INSERT OR IGNORE'));

console.log(`Statements to apply: ${statements.length}`);
if (DRY_RUN) { console.log('DRY RUN — no changes written'); process.exit(0); }

const db = new Database(DB_PATH);
let inserted = 0, skipped = 0;

const stmt = db.prepare(
  `INSERT OR IGNORE INTO MasterParts
   (MasterPartID, AlternatePartNumbers, Description, Category, Tags, Manufacturer)
   VALUES (?, ?, ?, ?, ?, ?)`
);

const insertMany = db.transaction((rows) => {
  for (const row of rows) {
    const r = stmt.run(row.id, row.itemNo, row.desc, row.cat, row.tags, row.mfr);
    if (r.changes > 0) inserted++; else skipped++;
  }
});

const rows = statements.map(s => {
  const m = s.match(/VALUES \('([^']+)', '([^']+)', '(.*?)', '([^']+)', '([^']+)', '([^']+)'\)/);
  if (!m) return null;
  return { id: m[1], itemNo: m[2], desc: m[3].replace(/''/g,"'"), cat: m[4], tags: m[5], mfr: m[6] };
}).filter(Boolean);

insertMany(rows);
db.close();

console.log(`Inserted : ${inserted}`);
console.log(`Skipped  : ${skipped} (already existed)`);
console.log(`\nNext: node scripts/auto_wurth_lookup.js`);
