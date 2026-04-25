// Copyright © 2026 Trier OS. All Rights Reserved.
// Extracts Baldor-Reliance Food Safe motor part numbers from catalog FL491.
//
// FL491 covers stainless steel encapsulated washdown motors (½–10 Hp)
// with internal AEGIS bearing protection rings. Two mount styles:
//   CF... = C-Face foot-mounted
//   VF... = footless (vertical/face-mount)
//
// Part number format: {CF|VF}SWDM?{4-digit frame}{T?}-E-G
// Examples: CFSWDM3538-E-G, CFSWDNM3554T-E-G, VFSWDM3615T-E-G
//
// Output: scripts/baldor_fl491_parts.sql
//
// Usage:
//   node scripts/extract_baldor_fl491.js
//   node scripts/extract_baldor_fl491.js --dry-run

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');

const PDF_PATH = 'Catalogs/FL491.pdf';
const TXT_PATH = 'Catalogs/baldor_fl491_text.tmp';
const SQL_PATH = 'scripts/baldor_fl491_parts.sql';
const DRY_RUN  = process.argv.includes('--dry-run');

// CFSWDM3538-E-G, CFSWDNM3554T-E-G, VFSWDM3615T-E-G
const MOTOR_RE = /\b([CV]FSWD[A-Z]{1,2}\d{4}[A-Z]?-E-G)\b/g;

// ── Step 1: Extract PDF text ──────────────────────────────────────────────────
if (!fs.existsSync(PDF_PATH)) {
  console.error(`PDF not found: ${PDF_PATH}`);
  process.exit(1);
}

if (!fs.existsSync(TXT_PATH)) {
  console.log('Extracting text from PDF...');
  const result = spawnSync('pdftotext', ['-layout', PDF_PATH, TXT_PATH], { timeout: 60000 });
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
const lines = text.split('\n');

const parts = new Map();

// Build context from table rows: capture HP/RPM/enclosure info alongside part number
// Table format: HP  RPM  FRAME  ENCLOSURE  CATALOG_NUMBER  C_DIM  WEIGHT  EFF  VOLTAGE  AMPS
const TABLE_RE = /(\d[\d\.\/\-]*)\s+(\d{3,4})\s+\S+\s+(TENV|TEFC)\s+([CV]FSWD[A-Z]{1,2}\d{4}[A-Z]?-E-G)/;

for (const raw of lines) {
  // Structured table row — rich description
  const tableMatch = raw.match(TABLE_RE);
  if (tableMatch) {
    const hp     = tableMatch[1];
    const rpm    = tableMatch[2];
    const encl   = tableMatch[3];
    const itemNo = tableMatch[4];
    if (!parts.has(itemNo)) {
      const mount = itemNo.startsWith('CF') ? 'C-Face Foot Mounted' : 'Footless';
      const desc  = `Baldor Food Safe ${mount} ${hp} Hp ${rpm} RPM ${encl} Washdown Motor`;
      parts.set(itemNo, { itemNo, cat: 'ELECTRICAL', desc: desc.slice(0, 120) });
    }
    continue;
  }

  // Fallback sweep for any missed part numbers
  MOTOR_RE.lastIndex = 0;
  let m;
  while ((m = MOTOR_RE.exec(raw)) !== null) {
    const itemNo = m[1];
    if (parts.has(itemNo)) continue;
    const mount = itemNo.startsWith('CF') ? 'C-Face Foot Mounted' : 'Footless';
    parts.set(itemNo, {
      itemNo,
      cat:  'ELECTRICAL',
      desc: `Baldor Food Safe ${mount} Washdown Motor 316 SS`,
    });
  }
}

console.log(`Found ${parts.size} unique item numbers`);

if (DRY_RUN) {
  console.log('\nAll parts:');
  [...parts.values()].forEach(p =>
    console.log(`  ${p.itemNo.padEnd(24)} [${p.cat}]  ${p.desc}`)
  );
  process.exit(0);
}

// ── Step 3: Write SQL ─────────────────────────────────────────────────────────
console.log(`Writing SQL → ${SQL_PATH}`);

const out = [
  `-- Baldor-Reliance Food Safe Motors Catalog FL491 — extracted ${new Date().toISOString().slice(0,10)}`,
  `-- ${parts.size} item numbers (316 SS washdown motors ½–10 Hp, with AEGIS bearing protection)`,
  `-- Apply: node scripts/apply_generic_parts.js --file=${SQL_PATH}`,
  '',
];

for (const p of parts.values()) {
  const id = `BLD-${p.cat}-${p.itemNo}`;
  out.push(
    `INSERT OR IGNORE INTO MasterParts ` +
    `(MasterPartID, AlternatePartNumbers, Description, Category, Tags, Manufacturer) VALUES ` +
    `('${id}', '${p.itemNo}', '${p.desc.replace(/'/g,"''")}', '${p.cat}', 'baldor,reliance,foodsafe,washdown,fl491', 'Baldor-Reliance');`
  );
}

fs.writeFileSync(SQL_PATH, out.join('\n') + '\n', 'utf8');
console.log(`Done — ${parts.size} parts written to ${SQL_PATH}`);
console.log(`\nNext: node scripts/apply_generic_parts.js --file=${SQL_PATH}`);
