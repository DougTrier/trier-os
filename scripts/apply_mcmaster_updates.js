// Copyright © 2026 Trier OS. All Rights Reserved.
// Applies Gemini-generated McMaster product lookup results to mfg_master.db.
//
// Workflow:
//   1. Gemini visits mcmaster.com for each part number and returns SQL UPDATE statements
//   2. Save Gemini's output to Catalogs/Prompts/results/batch_NNN_results.sql
//   3. Run this script to validate and apply all result files
//
// Usage:
//   node scripts/apply_mcmaster_updates.js [--dry-run] [--file=path/to/single.sql]
//   node scripts/apply_mcmaster_updates.js             -- applies all files in Catalogs/Prompts/results/
//   node scripts/apply_mcmaster_updates.js --dry-run   -- validate without writing to DB

'use strict';

const fs       = require('fs');
const path     = require('path');
const Database = require('better-sqlite3');

const DRY_RUN    = process.argv.includes('--dry-run');
const SINGLE_FILE = process.argv.find(a => a.startsWith('--file='))?.split('=')[1];
const RESULTS_DIR = process.argv.find(a => a.startsWith('--dir='))?.split('=')[1] || 'Catalogs/Prompts/results';
const DB_PATH     = 'data/mfg_master.db';

if (!fs.existsSync(DB_PATH)) {
  console.error(`Database not found: ${DB_PATH}`);
  process.exit(1);
}

// ── Find result files ─────────────────────────────────────────────────────────
let files;
if (SINGLE_FILE) {
  files = [SINGLE_FILE];
} else {
  if (!fs.existsSync(RESULTS_DIR)) {
    console.error(`Results directory not found: ${RESULTS_DIR}`);
    console.error(`Save Gemini SQL output to that folder first.`);
    process.exit(1);
  }
  files = fs.readdirSync(RESULTS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .map(f => path.join(RESULTS_DIR, f));
}

if (files.length === 0) {
  console.log('No result SQL files found. Paste Gemini output into Catalogs/Prompts/results/');
  process.exit(0);
}

console.log(`Found ${files.length} result file(s)`);
if (DRY_RUN) console.log('DRY RUN — no changes will be written to DB\n');

// ── Open database ─────────────────────────────────────────────────────────────
const db = new Database(DB_PATH, DRY_RUN ? { readonly: true } : {});

// ── Parse and apply each file ────────────────────────────────────────────────
let totalUpdates = 0;
let totalSkipped = 0;
let totalErrors  = 0;
const issues = [];

for (const file of files) {
  const sql = fs.readFileSync(file, 'utf8');
  console.log(`\nProcessing: ${path.basename(file)}`);

  // Extract UPDATE statements — look for UPDATE MasterParts ... WHERE AlternatePartNumbers = 'X'
  const updateRe = /UPDATE\s+MasterParts\s+SET\s+([\s\S]*?)WHERE\s+AlternatePartNumbers\s*=\s*'([^']+)'\s*;/gi;
  let m;
  let fileUpdates = 0;

  while ((m = updateRe.exec(sql)) !== null) {
    const setClause  = m[1].trim();
    const partNum    = m[2];

    // Check part exists in DB
    const existing = db.prepare(
      `SELECT MasterPartID, Description FROM MasterParts WHERE AlternatePartNumbers = ?`
    ).get(partNum);

    if (!existing) {
      issues.push(`  SKIP: part ${partNum} not found in MasterParts`);
      totalSkipped++;
      continue;
    }

    // Parse SET fields
    const setFields = {};
    const fieldRe = /(\w+)\s*=\s*('(?:[^']|'')*'|NULL|\d+(?:\.\d+)?)/g;
    let fm;
    while ((fm = fieldRe.exec(setClause)) !== null) {
      const field = fm[1];
      let   value = fm[2];
      // Unquote string values
      if (value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1).replace(/''/g, "'");
      } else if (value === 'NULL') {
        value = null;
      } else {
        value = parseFloat(value);
      }
      setFields[field] = value;
    }

    // Validate required fields
    if (!setFields.Description || setFields.Description.length < 5) {
      issues.push(`  WARN: ${partNum} — Description too short: "${setFields.Description}"`);
      totalSkipped++;
      continue;
    }

    // Skip if Gemini returned the same garbage description
    const desc = setFields.Description || '';
    if (desc.toLowerCase().includes('our current desc') ||
        desc.toLowerCase().includes('placeholder') ||
        desc.toLowerCase().includes('real description')) {
      issues.push(`  WARN: ${partNum} — Looks like unfilled template`);
      totalSkipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  ✓ WOULD UPDATE ${partNum}: "${desc.slice(0, 60)}"`);
    } else {
      try {
        // Build UPDATE statement dynamically from parsed fields
        const allowedFields = ['Description','StandardizedName','TypicalPriceMin','TypicalPriceMax','Specifications','Manufacturer'];
        const setClauses = Object.entries(setFields)
          .filter(([k]) => allowedFields.includes(k))
          .map(([k, v]) => `${k} = ?`);
        const values = Object.entries(setFields)
          .filter(([k]) => allowedFields.includes(k))
          .map(([, v]) => v);

        if (setClauses.length === 0) {
          issues.push(`  WARN: ${partNum} — No valid fields to update`);
          totalSkipped++;
          continue;
        }

        values.push(partNum); // for WHERE clause
        db.prepare(
          `UPDATE MasterParts SET ${setClauses.join(', ')} WHERE AlternatePartNumbers = ?`
        ).run(...values);

        console.log(`  ✓ Updated ${partNum}: "${desc.slice(0, 55)}"`);
      } catch (err) {
        issues.push(`  ERROR: ${partNum} — ${err.message}`);
        totalErrors++;
        continue;
      }
    }

    totalUpdates++;
    fileUpdates++;
  }

  console.log(`  → ${fileUpdates} updates from this file`);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════');
console.log(`Total updated : ${totalUpdates}`);
console.log(`Skipped       : ${totalSkipped}`);
console.log(`Errors        : ${totalErrors}`);
if (issues.length > 0) {
  console.log('\nIssues:');
  issues.forEach(i => console.log(i));
}
if (!DRY_RUN && totalUpdates > 0) {
  console.log(`\n✓ Applied to ${DB_PATH}`);
}
if (DRY_RUN) {
  console.log('\n(Dry run — re-run without --dry-run to apply changes)');
}

db.close();
