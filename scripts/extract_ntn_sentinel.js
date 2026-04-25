// Copyright © 2026 Trier OS. All Rights Reserved.
// Extracts NTN Sentinel Series bearing part numbers from catalog A-2201-II.
//
// NTN Sentinel part numbers: SU prefix + housing type + 3 digits + optional bore/config suffix
// Examples: SUCP205-16, SUCP205-16CC, SUCP205-16FG1, SUFL205-16, SUCF205-16
// Output: scripts/ntn_sentinel_parts.sql
//
// Usage:
//   node scripts/extract_ntn_sentinel.js
//   node scripts/extract_ntn_sentinel.js --dry-run

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');

const PDF_PATH = 'Catalogs/Motion/Motion - NTN Sentinel A 2201 Food and Beverage Catalog .pdf';
const TXT_PATH = 'Catalogs/ntn_sentinel_text.tmp';
const SQL_PATH = 'scripts/ntn_sentinel_parts.sql';
const DRY_RUN  = process.argv.includes('--dry-run');

// NTN Sentinel pattern: SU + 2-4 uppercase letters + 3 digits + optional bore and config suffix
// SUCP205-16, SUCP205-16CC, SUCP205-16FG1, SUCP205-16CCFG1, SUCP205-16C0FG1
// Also variants: SUFL, SUCF, SUCT, SUCPA, SSUCPA
const ITEM_RE = /\b(SS?U[A-Z]{2,4}\d{3}(?:-\d{1,2}[A-Z0-9]*)?\b(?:[A-Z0-9]{1,6})?)\b/g;

// Section → description mapping
const SECTION_MAP = {
  'PILLOW BLOCK':           'Sentinel Pillow Block Unit',
  'TAPPED BASE':            'Sentinel Tapped Base Pillow Block',
  'FOUR-BOLT FLANGE':       'Sentinel Four-Bolt Flange Unit',
  'TWO-BOLT FLANGE':        'Sentinel Two-Bolt Flange Unit',
  'THREE-BOLT FLANGE':      'Sentinel Three-Bolt Flange Unit',
  'TAKE-UP':                'Sentinel Take-Up Unit',
  'STAINLESS STEEL':        'Sentinel Stainless Steel Insert Bearing',
  'ZINC':                   'Sentinel Zinc Insert Bearing',
  'INSERT':                 'Sentinel Insert Bearing',
  'THERMOPLASTIC':          'Sentinel Thermoplastic Housing Unit',
};

function getDesc(section) {
  for (const [key, val] of Object.entries(SECTION_MAP)) {
    if (section.toUpperCase().includes(key)) return val;
  }
  return 'NTN Sentinel Food & Beverage Bearing';
}

// ── Step 1: Extract PDF text ──────────────────────────────────────────────────
if (!fs.existsSync(PDF_PATH)) {
  console.error(`PDF not found: ${PDF_PATH}`);
  process.exit(1);
}

if (!fs.existsSync(TXT_PATH)) {
  console.log('Extracting text from PDF...');
  const result = spawnSync('pdftotext', ['-layout', PDF_PATH, TXT_PATH], { timeout: 120000 });
  if (result.status !== 0) {
    console.error('pdftotext failed:', result.stderr?.toString());
    process.exit(1);
  }
  console.log(`Text extracted → ${TXT_PATH}`);
} else {
  console.log(`Using cached text file: ${TXT_PATH}`);
}

// ── Step 2: Parse ─────────────────────────────────────────────────────────────
console.log('Parsing item numbers...');

const text  = fs.readFileSync(TXT_PATH, 'utf8');
const pages = text.split('\f');
console.log(`Pages: ${pages.length}`);

const parts = new Map();
let currentSection = 'Sentinel Series';

for (const page of pages) {
  const lines = page.split('\n').map(l => l.trim()).filter(Boolean);

  // Detect section from first few lines
  for (const l of lines.slice(0, 8)) {
    for (const key of Object.keys(SECTION_MAP)) {
      if (l.toUpperCase().includes(key)) {
        currentSection = l;
        break;
      }
    }
  }

  for (const raw of lines) {
    ITEM_RE.lastIndex = 0;
    let m;
    while ((m = ITEM_RE.exec(raw)) !== null) {
      const itemNo = m[1];
      if (itemNo.length < 6) continue;  // skip too-short matches
      if (parts.has(itemNo)) continue;

      const desc = getDesc(currentSection);
      parts.set(itemNo, { itemNo, cat: 'BEARINGS', desc: desc.replace(/'/g, "''") });
    }
  }
}

console.log(`Found ${parts.size} unique item numbers`);

if (DRY_RUN) {
  [...parts.values()].slice(0, 25).forEach(p =>
    console.log(`  ${p.itemNo.padEnd(22)} [${p.cat}]  ${p.desc}`)
  );
  process.exit(0);
}

// ── Step 3: Write SQL ─────────────────────────────────────────────────────────
console.log(`Writing SQL → ${SQL_PATH}`);

const out = [
  `-- NTN Sentinel Series Catalog A-2201-II — extracted ${new Date().toISOString().slice(0,10)}`,
  `-- ${parts.size} item numbers`,
  `-- Apply: node scripts/apply_generic_parts.js --file=${SQL_PATH}`,
  '',
];

for (const p of parts.values()) {
  const id = `NTN-${p.cat}-${p.itemNo}`;
  out.push(
    `INSERT OR IGNORE INTO MasterParts ` +
    `(MasterPartID, AlternatePartNumbers, Description, Category, Tags, Manufacturer) VALUES ` +
    `('${id}', '${p.itemNo}', '${p.desc}', '${p.cat}', 'ntn,sentinel,food-beverage', 'NTN Bearing');`
  );
}

fs.writeFileSync(SQL_PATH, out.join('\n') + '\n', 'utf8');
console.log(`Done — ${parts.size} parts written to ${SQL_PATH}`);
console.log(`\nNext: node scripts/apply_generic_parts.js --file=${SQL_PATH}`);
