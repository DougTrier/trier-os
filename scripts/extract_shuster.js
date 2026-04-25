// Copyright © 2026 Trier OS. All Rights Reserved.
// Extracts Shuster ball bearing item numbers from the Motion Shuster Ball Bearings Catalog PDF.
//
// Shuster item numbers are exactly 8 digits, found in three columns per row:
//   Base Part# | Open - Item # | Sealed - Item # | Shielded - Item #
// The catalog is entirely ball bearings — all parts map to BEARINGS.
// Series context (e.g. "R Series", "6000 JEM Series") is captured from nearby headers.
//
// Output: scripts/shuster_bearings_parts.sql
//
// Usage:
//   node scripts/extract_shuster.js
//   node scripts/extract_shuster.js --dry-run
//
// API dependencies: none (reads local PDF via pdftotext CLI)

'use strict';

const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const PDF_PATH = 'Catalogs/Motion/Motion - Shuster_BallBearingsCatalog 11-2-20.pdf';
const TXT_PATH = 'Catalogs/shuster_bearings_text.tmp';
const SQL_PATH = 'scripts/shuster_bearings_parts.sql';
const DRY_RUN  = process.argv.includes('--dry-run');

// Shuster item numbers: exactly 8 digits
const ITEM_RE  = /\b(\d{8})\b/g;
// Base part# appears at the start of a row before the 8-digit item numbers
// Examples: R2, R4, 6000, 6000 JEM, 6001 JEM
const BASE_PART_RE = /^\s*([A-Z0-9][\w\s]{0,14}?)\s{2,}/;

// Known false positives for 8-digit numbers
function isFalsePositive(num) {
  // All same digit (e.g. 11111111)
  if (/^(\d)\1{7}$/.test(num)) return true;
  // Year-like: starts with 19xx or 20xx followed by 6 more digits — not possible for 8-digit
  // but guard anyway for 19xxxxxx / 20xxxxxx date-stamp style numbers
  if (/^(19|20)\d{6}$/.test(num)) return true;
  return false;
}

// Detect series name from ALL-CAPS or mixed-case headings
// Examples: "R Series", "6000 JEM Series", "R-X Series", "Extra Light Series"
const SERIES_RE = /\b([A-Z0-9][A-Za-z0-9 \-]{2,30}?)\s+[Ss]eries\b/;
const ALLCAPS_HEADING = /^[A-Z][A-Z0-9 \-\/&]{3,50}$/;

// ── Step 1: Extract PDF text ──────────────────────────────────────────────────
if (!fs.existsSync(PDF_PATH)) {
  console.error(`PDF not found: ${PDF_PATH}`);
  process.exit(1);
}

if (!fs.existsSync(TXT_PATH)) {
  console.log('Extracting text from PDF...');
  const result = spawnSync('pdftotext', ['-layout', PDF_PATH, TXT_PATH], { timeout: 360000 });
  if (result.status !== 0) {
    console.error('pdftotext failed:', result.stderr?.toString());
    process.exit(1);
  }
  console.log(`Text extracted → ${TXT_PATH}`);
} else {
  console.log(`Using cached text file: ${TXT_PATH}`);
}

// ── Step 2: Parse by page ─────────────────────────────────────────────────────
console.log('Parsing item numbers...');

const text  = fs.readFileSync(TXT_PATH, 'utf8');
const pages = text.split('\f');
console.log(`Pages: ${pages.length}`);

const parts = new Map();

for (const page of pages) {
  const lines = page.split('\n').map(l => l.trimEnd()).filter(l => l.trim());
  if (lines.length < 2) continue;

  let currentSeries = 'Ball Bearings';
  let recentLines   = [];

  for (let i = 0; i < lines.length; i++) {
    const raw  = lines[i];
    const trim = raw.trim();

    // Track last 3 non-item lines as context for series name
    ITEM_RE.lastIndex = 0;
    const hasItem = ITEM_RE.test(raw);
    ITEM_RE.lastIndex = 0;

    if (!hasItem) {
      // Try to detect a series name from this line
      const seriesMatch = trim.match(SERIES_RE);
      if (seriesMatch) {
        currentSeries = seriesMatch[0].trim();
      } else if (ALLCAPS_HEADING.test(trim) && trim.length < 55) {
        currentSeries = trim;
      }
      recentLines.push(trim);
      if (recentLines.length > 4) recentLines.shift();
      continue;
    }

    // This line has 8-digit numbers — extract base part# from beginning of line
    let basePart = '';
    const baseMatch = raw.match(BASE_PART_RE);
    if (baseMatch) {
      basePart = baseMatch[1].trim();
      // Sanity check: base parts are short alphanumeric codes, not 8-digit numbers themselves
      if (/^\d{8}$/.test(basePart)) basePart = '';
    }

    // Also look back 1-3 lines for a series name if we don't already have one
    if (currentSeries === 'Ball Bearings') {
      for (const prev of recentLines.slice().reverse()) {
        const sm = prev.match(SERIES_RE);
        if (sm) { currentSeries = sm[0].trim(); break; }
      }
    }

    const desc = [basePart, currentSeries].filter(Boolean).join(' — ').slice(0, 120).replace(/'/g, "''");

    // Extract all 8-digit item numbers from this line (Open, Sealed, Shielded columns)
    ITEM_RE.lastIndex = 0;
    let m;
    while ((m = ITEM_RE.exec(raw)) !== null) {
      const itemNo = m[1];
      if (isFalsePositive(itemNo)) continue;
      if (!parts.has(itemNo)) {
        parts.set(itemNo, { itemNo, desc });
      }
    }

    recentLines.push(trim);
    if (recentLines.length > 4) recentLines.shift();
  }
}

console.log(`Found ${parts.size} unique item numbers`);

if (DRY_RUN) {
  const sample = [...parts.values()].slice(0, 20);
  sample.forEach(p => console.log(`  ${p.itemNo}  [BEARINGS]  ${p.desc.slice(0, 60)}`));
  process.exit(0);
}

// ── Step 3: Write SQL ─────────────────────────────────────────────────────────
console.log(`Writing SQL → ${SQL_PATH}`);

const out = [
  `-- Shuster Ball Bearings Catalog — extracted ${new Date().toISOString().slice(0, 10)}`,
  `-- ${parts.size} item numbers`,
  `-- Apply: node scripts/apply_generic_parts.js --file=${SQL_PATH}`,
  '',
];

for (const p of parts.values()) {
  const id = `SH-BEARINGS-${p.itemNo}`;
  out.push(
    `INSERT OR IGNORE INTO MasterParts ` +
    `(MasterPartID, AlternatePartNumbers, Description, Category, Tags, Manufacturer) VALUES ` +
    `('${id}', '${p.itemNo}', '${p.desc}', 'BEARINGS', 'shuster,bearings', 'Shuster');`
  );
}

fs.writeFileSync(SQL_PATH, out.join('\n') + '\n', 'utf8');
console.log(`Done — ${parts.size} parts written to ${SQL_PATH}`);
console.log(`\nNext: node scripts/apply_generic_parts.js --file=${SQL_PATH}`);
