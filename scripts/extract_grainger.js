// Copyright © 2026 Trier OS. All Rights Reserved.
// Extracts Grainger item numbers and descriptions from Catalog 417 PDF.
//
// Uses pdftotext (Poppler) to extract clean text, then parses for item numbers.
// Output: scripts/grainger_catalog417_parts.sql
//
// Usage:
//   node scripts/extract_grainger.js
//   node scripts/extract_grainger.js --dry-run   (count parts, no SQL file)

'use strict';

const { execSync, spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const PDF_PATH  = 'Catalogs/Catalog 417.pdf';
const TXT_PATH  = 'Catalogs/catalog417_text.tmp';
const SQL_PATH  = 'scripts/grainger_catalog417_parts.sql';
const DB_PATH   = 'data/mfg_master.db';
const DRY_RUN   = process.argv.includes('--dry-run');

// Grainger item number: 1-3 digits, 1-3 uppercase letters, 1-4 digits
// e.g. 4M298, 3HXH4, 462R82, 45GG35, 2ETP9, 32WR97
const ITEM_RE = /\b(\d{1,3}[A-Z]{1,3}\d{1,4})\b/g;

// Grainger category → Trier OS category
const CAT_MAP = {
  'MOTORS':              'ELECTRICAL',
  'ELECTRICAL':          'ELECTRICAL',
  'POWER TOOLS':         'TOOLING',
  'HAND TOOLS':          'TOOLING',
  'POWER TRANSMISSION':  'MECHANICAL',
  'BEARINGS':            'BEARINGS',
  'PNEUMATICS':          'PNEUMATICS',
  'HYDRAULICS':          'HYDRAULICS',
  'PUMPS':               'HYDRAULICS',
  'FLUID POWER':         'HYDRAULICS',
  'FILTRATION':          'FILTRATION',
  'PLUMBING':            'FLUIDS',
  'LUBRICATION':         'FLUIDS',
  'CHEMICALS':           'FLUIDS',
  'SAFETY':              'SAFETY',
  'MATERIAL HANDLING':   'MECHANICAL',
  'HVAC':                'MECHANICAL',
  'LIGHTING':            'ELECTRICAL',
  'TEST INSTRUMENTS':    'ELECTRICAL',
  'FASTENERS':           'MECHANICAL',
  'HARDWARE':            'MECHANICAL',
  'ABRASIVES':           'TOOLING',
  'WELDING':             'TOOLING',
  'LAB SUPPLIES':        'TOOLING',
  'CLEANING':            'FLUIDS',
  'PACKAGING':           'MECHANICAL',
  'STORAGE':             'MECHANICAL',
  'SHELVING':            'MECHANICAL',
  'OFFICE':              'MECHANICAL',
  'FOOD SERVICE':        'MECHANICAL',
};

function mapCategory(sectionText) {
  const upper = sectionText.toUpperCase();
  for (const [key, val] of Object.entries(CAT_MAP)) {
    if (upper.includes(key)) return val;
  }
  return 'MECHANICAL';
}

// ── Step 1: Extract text from PDF ────────────────────────────────────────────
if (!fs.existsSync(PDF_PATH)) {
  console.error(`PDF not found: ${PDF_PATH}`);
  process.exit(1);
}

if (!fs.existsSync(TXT_PATH)) {
  console.log(`Extracting text from PDF (this takes ~2 min for 365MB)...`);
  const result = spawnSync('pdftotext', ['-layout', PDF_PATH, TXT_PATH], { timeout: 300000 });
  if (result.status !== 0) {
    console.error('pdftotext failed:', result.stderr?.toString());
    process.exit(1);
  }
  console.log(`Text extracted → ${TXT_PATH}`);
} else {
  console.log(`Using cached text file: ${TXT_PATH}`);
}

// ── Step 2: Parse extracted text ──────────────────────────────────────────────
console.log('Parsing item numbers...');

const text  = fs.readFileSync(TXT_PATH, 'utf8');

// pdftotext separates pages with form feed (\f)
const pages = text.split('\f');
console.log(`Pages: ${pages.length}`);

const parts = new Map(); // itemNo → { category, subsection, desc }

const NOISE_LINE_RE = /^(Scan\.|Details on|www\.|grainger\.com|1-800|^\s*A\d+\s*$)/i;
const ALL_CAPS_RE   = /^[A-Z][A-Z &\/]{3,}$/;

for (const page of pages) {
  const lines = page.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 3) continue;

  // First non-noise ALL-CAPS line = section header
  let currentSection = 'GENERAL';
  let currentSubsection = '';
  for (const l of lines.slice(0, 5)) {
    const clean = l.split(/\s{3,}/)[0].trim(); // strip multi-space trailer (e.g. "MOTORS   Scan. Order.")
    if (ALL_CAPS_RE.test(clean) && clean.length < 50) {
      currentSection = clean;
      break;
    }
  }

  // Second distinct line after header = subsection
  let headerPassed = false;
  const descBuffer = [];

  for (const raw of lines) {
    const line = raw.split(/\s{3,}/)[0].trim(); // strip multi-column trailing content
    if (!line || line.length < 2) continue;
    if (NOISE_LINE_RE.test(line)) continue;

    // Skip the section header itself
    if (!headerPassed && ALL_CAPS_RE.test(line) && line.length < 50) {
      headerPassed = true;
      continue;
    }

    // Subsection: mixed-case heading, no item numbers, reasonable length
    ITEM_RE.lastIndex = 0;
    const hasItems = ITEM_RE.test(line);
    ITEM_RE.lastIndex = 0;

    if (!hasItems && /^[A-Z][a-zA-Z]/.test(line) && line.length > 8 && line.length < 80) {
      currentSubsection = line;
      descBuffer.length = 0;
    }

    // Accumulate description context
    if (line.length > 15 && line.length < 160 && !/^\d/.test(line) && !hasItems) {
      descBuffer.push(line);
      if (descBuffer.length > 4) descBuffer.shift();
    }

    // Extract item numbers from this line
    ITEM_RE.lastIndex = 0;
    let m;
    while ((m = ITEM_RE.exec(raw)) !== null) {
      const itemNo = m[1];

      if (itemNo.length < 4) continue;
      if (/^\d+$/.test(itemNo)) continue;
      if (/^\d{2,3}[VA]\d*$/.test(itemNo)) continue;   // 115V, 240V, 12A etc.
      if (/[A-Z]{2,}$/.test(itemNo) && !/\d$/.test(itemNo)) continue; // ends in all letters

      if (!parts.has(itemNo)) {
        const cat  = mapCategory(currentSection + ' ' + currentSubsection);
        const desc = [currentSubsection || currentSection, ...descBuffer.slice(-2)]
          .filter(Boolean)
          .join('; ')
          .slice(0, 120)
          .replace(/'/g, "''");
        parts.set(itemNo, { itemNo, cat, desc });
      }
    }
  }
}

console.log(`Found ${parts.size} unique item numbers`);

if (DRY_RUN) {
  // Show sample and category breakdown
  const sample = [...parts.values()].slice(0, 20);
  sample.forEach(p => console.log(`  ${p.itemNo.padEnd(10)} [${p.cat.padEnd(12)}] ${p.desc.slice(0,60)}`));
  const cats = {};
  for (const p of parts.values()) cats[p.cat] = (cats[p.cat] || 0) + 1;
  console.log('\nCategory breakdown:');
  Object.entries(cats).sort((a,b)=>b[1]-a[1]).forEach(([c,n])=>console.log(`  ${c.padEnd(14)} ${n}`));
  process.exit(0);
}

// ── Step 3: Write SQL ─────────────────────────────────────────────────────────
console.log(`Writing SQL → ${SQL_PATH}`);

const lines_out = [
  `-- Grainger Catalog 417 — extracted ${new Date().toISOString().slice(0,10)}`,
  `-- ${parts.size} item numbers`,
  `-- Run: node scripts/apply_grainger_parts.js`,
  '',
];

for (const p of parts.values()) {
  const id   = `GR-${p.cat}-${p.itemNo}`;
  const desc = p.desc || p.cat;
  lines_out.push(
    `INSERT OR IGNORE INTO MasterParts ` +
    `(MasterPartID, AlternatePartNumbers, Description, Category, Tags, Manufacturer) VALUES ` +
    `('${id}', '${p.itemNo}', '${desc.replace(/'/g,"''")}', '${p.cat}', 'grainger,catalog417', 'Grainger');`
  );
}

fs.writeFileSync(SQL_PATH, lines_out.join('\n') + '\n', 'utf8');
console.log(`Done — ${parts.size} parts written to ${SQL_PATH}`);
console.log(`\nNext steps:`);
console.log(`  1. node scripts/apply_grainger_parts.js          (inject into mfg_master.db)`);
console.log(`  2. node scripts/auto_grainger_lookup.js          (enrich with Gemini API)`);
