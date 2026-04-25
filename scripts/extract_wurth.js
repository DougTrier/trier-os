// Copyright © 2026 Trier OS. All Rights Reserved.
// Extracts Würth item numbers from Section 7 Service & Repair catalog PDF.
//
// Würth article numbers appear after "Art. No." label (5-10 digits).
// Examples: 19640463, 0893106026, 1964176406, 0502830
// Output: scripts/wurth_s7_parts.sql
//
// Usage:
//   node scripts/extract_wurth.js
//   node scripts/extract_wurth.js --dry-run

'use strict';

const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const PDF_PATH = 'Catalogs/Wurth Section_7_Service_and_Repair.pdf';
const TXT_PATH = 'Catalogs/wurth_s7_text.tmp';
const SQL_PATH = 'scripts/wurth_s7_parts.sql';
const DRY_RUN  = process.argv.includes('--dry-run');

// Match "Art. No." followed by 5+ digits (inline or with spaces)
const ART_RE = /Art\.\s*No\.\s+(\d{5,})/g;

// Würth section keywords → Trier OS category
const CAT_MAP = {
  'O-RING':        'SEALS',
  'O-RINGS':       'SEALS',
  'SEAL':          'SEALS',
  'SEALING':       'SEALS',
  'GASKET':        'SEALS',
  'HOSE':          'FLUIDS',
  'TUBING':        'FLUIDS',
  'LUBRIC':        'FLUIDS',
  'OIL':           'FLUIDS',
  'LUBRICANT':     'FLUIDS',
  'CLEANER':       'FLUIDS',
  'SPRAY':         'FLUIDS',
  'CLAMP':         'MECHANICAL',
  'THREAD':        'MECHANICAL',
  'WHEEL WEIGHT':  'MECHANICAL',
  'STUD':          'MECHANICAL',
  'NUT':           'MECHANICAL',
  'DRAIN PLUG':    'MECHANICAL',
  'FITTING':       'MECHANICAL',
  'BRAKE':         'MECHANICAL',
  'TIRE':          'MECHANICAL',
  'A/C':           'FLUIDS',
  'REFRIGERANT':   'FLUIDS',
  'ABRASIVE':      'TOOLING',
  'EMERY':         'TOOLING',
  'DISC':          'TOOLING',
};

function mapCategory(context) {
  const upper = context.toUpperCase();
  for (const [key, val] of Object.entries(CAT_MAP)) {
    if (upper.includes(key)) return val;
  }
  return 'MECHANICAL';
}

// False positives: skip very short numbers and page references
function isFalsePositive(num) {
  if (num.length < 6) return true;  // skip 5-digit numbers — too likely to be counts/sizes
  return false;
}

// Filter out lines that are noise (copyright, section headers, etc.)
const NOISE_LINE = /wurth usa|revision \d{2}\/\d{4}|^\s*\d{2}\.\d{4}|see tools|prefix#/i;

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

for (const page of pages) {
  const lines = page.split('\n').filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];

    ART_RE.lastIndex = 0;
    let m;
    while ((m = ART_RE.exec(raw)) !== null) {
      const itemNo = m[1];
      if (isFalsePositive(itemNo)) continue;
      if (parts.has(itemNo)) continue;

      // Description context: text before "Art. No." on the same line, or 1-2 lines above
      const beforeArtNo = raw.slice(0, m.index).trim().split(/\s{3,}/)[0].trim();
      const prevLine1   = i > 0 ? lines[i-1].trim().split(/\s{3,}/)[0].trim() : '';
      const prevLine2   = i > 1 ? lines[i-2].trim().split(/\s{3,}/)[0].trim() : '';

      const contextParts = [prevLine2, prevLine1, beforeArtNo].filter(s =>
        s.length > 4 && s.length < 80 && !/Art\.\s*No/i.test(s) && !NOISE_LINE.test(s)
      );
      const desc = contextParts.slice(-1)[0] || 'Würth Service & Repair';
      const cat  = mapCategory(contextParts.join(' ') + ' ' + desc);

      parts.set(itemNo, { itemNo, cat, desc: desc.slice(0, 120).replace(/'/g, "''") });
    }
  }
}

console.log(`Found ${parts.size} unique item numbers`);

if (DRY_RUN) {
  [...parts.values()].forEach(p => console.log(`  ${p.itemNo}  [${p.cat.padEnd(12)}]  ${p.desc.slice(0,60)}`));
  const cats = {};
  for (const p of parts.values()) cats[p.cat] = (cats[p.cat] || 0) + 1;
  console.log('\nCategory breakdown:');
  Object.entries(cats).sort((a,b)=>b[1]-a[1]).forEach(([c,n])=>console.log(`  ${c.padEnd(14)} ${n}`));
  process.exit(0);
}

// ── Step 3: Write SQL ─────────────────────────────────────────────────────────
console.log(`Writing SQL → ${SQL_PATH}`);

const out = [
  `-- Würth Section 7 Service & Repair — extracted ${new Date().toISOString().slice(0,10)}`,
  `-- ${parts.size} item numbers`,
  `-- Apply: node scripts/apply_wurth_parts.js`,
  '',
];

for (const p of parts.values()) {
  const id = `WU-${p.cat}-${p.itemNo}`;
  out.push(
    `INSERT OR IGNORE INTO MasterParts ` +
    `(MasterPartID, AlternatePartNumbers, Description, Category, Tags, Manufacturer) VALUES ` +
    `('${id}', '${p.itemNo}', '${p.desc.replace(/'/g,"''")}', '${p.cat}', 'wurth,s7repair', 'Würth');`
  );
}

fs.writeFileSync(SQL_PATH, out.join('\n') + '\n', 'utf8');
console.log(`Done — ${parts.size} parts written to ${SQL_PATH}`);
console.log(`\nNext steps:`);
console.log(`  1. node scripts/apply_wurth_parts.js`);
console.log(`  2. node scripts/auto_wurth_lookup.js`);
