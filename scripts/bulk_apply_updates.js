// Copyright © 2026 Trier OS. All Rights Reserved.
// Fast bulk applier for large UPDATE SQL files.
// Wraps all statements in a single transaction — orders of magnitude faster
// than apply_mcmaster_updates.js for files with 100k+ updates.
//
// Usage:
//   node scripts/bulk_apply_updates.js --file=scripts/grainger_catalog_updates.sql
//   node scripts/bulk_apply_updates.js --file=scripts/msc_bigbook_updates.sql

'use strict';

const fs       = require('fs');
const Database = require('better-sqlite3');

const SINGLE_FILE = process.argv.find(a => a.startsWith('--file='))?.split('=')[1];
const DRY_RUN     = process.argv.includes('--dry-run');
const RAW_MODE    = process.argv.includes('--raw'); // exec SQL file directly (supports custom WHERE clauses)
const DB_PATH     = 'data/mfg_master.db';

if (!SINGLE_FILE) {
  console.error('Usage: node scripts/bulk_apply_updates.js --file=path/to/file.sql');
  process.exit(1);
}
if (!fs.existsSync(SINGLE_FILE)) {
  console.error(`File not found: ${SINGLE_FILE}`);
  process.exit(1);
}
if (!fs.existsSync(DB_PATH)) {
  console.error(`Database not found: ${DB_PATH}`);
  process.exit(1);
}

console.log(`Reading ${SINGLE_FILE}...`);
const sql = fs.readFileSync(SINGLE_FILE, 'utf8');

// ── Raw mode: execute SQL file directly (supports custom WHERE clauses) ───────
if (RAW_MODE) {
  if (DRY_RUN) {
    console.log('DRY RUN — would exec SQL file directly');
    process.exit(0);
  }
  const db = new Database(DB_PATH);
  console.log('Executing SQL in single transaction (raw mode)...');
  const t0 = Date.now();
  const stmts = sql.split('\n').filter(l => l.trim() && !l.trim().startsWith('--')).join('\n');
  db.exec('BEGIN;\n' + stmts + '\nCOMMIT;');
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`Done in ${elapsed}s`);
  db.close();
  process.exit(0);
}

// Extract (partNum, description) from UPDATE statements
const re = /UPDATE\s+MasterParts\s+SET\s+Description\s*=\s*'((?:[^']|'')*)'\s+WHERE\s+AlternatePartNumbers\s*=\s*'([^']+)'\s*;/gi;

const updates = [];
let m;
while ((m = re.exec(sql)) !== null) {
  updates.push({ desc: m[1].replace(/''/g, "'"), partNum: m[2] });
}

console.log(`Parsed ${updates.length.toLocaleString()} UPDATE statements`);
if (updates.length === 0) {
  console.log('Nothing to apply.');
  process.exit(0);
}

if (DRY_RUN) {
  console.log('DRY RUN — first 10 entries:');
  updates.slice(0, 10).forEach(u => console.log(`  ${u.partNum.padEnd(14)} → ${u.desc.slice(0, 80)}`));
  process.exit(0);
}

const db = new Database(DB_PATH);
const stmt = db.prepare(`UPDATE MasterParts SET Description = ? WHERE AlternatePartNumbers = ?`);

console.log('Applying in single transaction...');
const t0 = Date.now();

let applied = 0;
let skipped = 0;

db.transaction(() => {
  for (const { desc, partNum } of updates) {
    if (!desc || desc.length < 4) { skipped++; continue; }
    const result = stmt.run(desc, partNum);
    if (result.changes > 0) applied++; else skipped++;
    if ((applied + skipped) % 50000 === 0) {
      process.stdout.write(`  ${(applied + skipped).toLocaleString()} / ${updates.length.toLocaleString()}\r`);
    }
  }
})();

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\nDone in ${elapsed}s — applied: ${applied.toLocaleString()}, no-match: ${skipped.toLocaleString()}`);
db.close();
