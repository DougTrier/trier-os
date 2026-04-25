// Copyright © 2026 Trier OS. All Rights Reserved.
// Generic SQL apply script — injects any vendor parts SQL file into data/mfg_master.db.
//
// Replaces per-vendor apply scripts. Works with any .sql file produced by the
// extract_*.js family of catalog extractors.
//
// Usage:
//   node scripts/apply_generic_parts.js --file=scripts/shuster_bearings_parts.sql
//   node scripts/apply_generic_parts.js --file=scripts/brady_loto_parts.sql [--dry-run]
//   node scripts/apply_generic_parts.js scripts/gates_pt_parts.sql

'use strict';

const fs       = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = 'data/mfg_master.db';
const DRY_RUN = process.argv.includes('--dry-run');

// Accept --file=path or positional argument
function resolveSqlPath() {
  const fileArg = process.argv.find(a => a.startsWith('--file='));
  if (fileArg) return fileArg.slice('--file='.length);

  // Positional: first arg that doesn't start with '--' and ends with .sql
  const positional = process.argv.slice(2).find(a => !a.startsWith('--') && a.endsWith('.sql'));
  if (positional) return positional;

  return null;
}

const SQL_PATH = resolveSqlPath();

if (!SQL_PATH) {
  console.error('Usage: node scripts/apply_generic_parts.js --file=<path/to/parts.sql>');
  console.error('       node scripts/apply_generic_parts.js <path/to/parts.sql>');
  process.exit(1);
}

if (!fs.existsSync(SQL_PATH)) {
  console.error(`SQL file not found: ${SQL_PATH}`);
  console.error('Run the corresponding extract_*.js script first to generate it.');
  process.exit(1);
}

if (!fs.existsSync(DB_PATH)) {
  console.error(`Database not found: ${DB_PATH}`);
  process.exit(1);
}

const sql = fs.readFileSync(SQL_PATH, 'utf8');
const statements = sql.split('\n').filter(l => l.startsWith('INSERT OR IGNORE'));

console.log(`SQL file  : ${SQL_PATH}`);
console.log(`Statements: ${statements.length}`);

if (DRY_RUN) {
  console.log('DRY RUN — no changes written');
  process.exit(0);
}

// Parse VALUES from each INSERT statement
const rows = statements.map(s => {
  // Match: VALUES ('id', 'itemNo', 'desc', 'cat', 'tags', 'mfr')
  // Description may contain escaped single quotes ('')
  const m = s.match(
    /VALUES \('([^']+)', '([^']+)', '((?:[^']|'')*)', '([^']+)', '([^']+)', '([^']+)'\)/
  );
  if (!m) return null;
  return {
    id:     m[1],
    itemNo: m[2],
    desc:   m[3].replace(/''/g, "'"),
    cat:    m[4],
    tags:   m[5],
    mfr:    m[6],
  };
}).filter(Boolean);

if (rows.length === 0) {
  console.error('No valid INSERT statements parsed from SQL file. Check the file format.');
  process.exit(1);
}

console.log(`Parsed rows: ${rows.length}`);

const db = new Database(DB_PATH);
let inserted = 0;
let skipped  = 0;

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

insertMany(rows);
db.close();

console.log(`Inserted : ${inserted}`);
console.log(`Skipped  : ${skipped} (already existed)`);
