// Copyright © 2026 Trier OS. All Rights Reserved.
// Extracts Brady Lockout/Tagout item numbers from the Motion Brady LOTO Catalog PDF.
//
// Brady item numbers appear in two forms:
//   1. Pure numeric 5-6 digit: 65396, 153672 (avoids years and measurement noise)
//   2. Alphanumeric Brady codes: LC584E, LC252M (two alpha + 3-4 digit + optional alpha)
//
// All parts map to SAFETY (the entire catalog is LOTO safety equipment).
// Description is captured from text appearing AFTER the item number on the same line.
//
// Output: scripts/brady_loto_parts.sql
//
// Usage:
//   node scripts/extract_brady_loto.js
//   node scripts/extract_brady_loto.js --dry-run
//
// API dependencies: none (reads local PDF via pdftotext CLI)

'use strict';

const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const PDF_PATH = 'Catalogs/Motion/Motion - Brady Lockout Tagout Catalog.pdf';
const TXT_PATH = 'Catalogs/brady_loto_text.tmp';
const SQL_PATH = 'scripts/brady_loto_parts.sql';
const DRY_RUN  = process.argv.includes('--dry-run');

// Pattern 1: pure numeric 5-6 digit item numbers
// Excludes numbers starting with 19 or 20 at 6 digits (year-like)
const NUMERIC_RE = /\b([1-9]\d{4,5})\b/g;

// Pattern 2: alphanumeric Brady codes — two uppercase letters + 3-4 digits + optional letter
const ALPHA_RE = /\b([A-Z]{2}[0-9]{3,4}[A-Z]?)\b/g;

// Measurement noise patterns — skip numbers that appear next to unit strings
const MEASUREMENT_CONTEXT = /\d+\s*(?:in|ft|mm|cm|m|lb|oz|kg|psi|vac|hp|amp|°|")\b/i;

function isNumericFalsePositive(num, line) {
  const n = parseInt(num, 10);
  // Year-like 6-digit starting with 19 or 20
  if (/^(19|20)\d{4}$/.test(num)) return true;
  // If number appears in a measurement context on the line
  if (MEASUREMENT_CONTEXT.test(line)) {
    // Only skip if the number itself looks like a measurement (e.g. 125000 near "psi")
    // This is a heuristic — we skip only numbers < 10000 in measurement lines
    if (n < 10000) return true;
  }
  return false;
}

// Brady alphanumeric false positives — skip common non-part tokens
const ALPHA_SKIP = new Set(['US', 'PA', 'CA', 'UK', 'EU', 'AC', 'DC', 'OK', 'ID', 'NO']);
function isAlphaFalsePositive(code) {
  if (ALPHA_SKIP.has(code)) return true;
  return false;
}

// Capture description text following the item number on the same line
function extractDescription(line, matchEnd) {
  const after = line.slice(matchEnd).trim();
  // Strip leading punctuation or whitespace separators
  const desc = after.replace(/^[\s\-\.\|:]+/, '').trim();
  return desc.slice(0, 120).replace(/'/g, "''");
}

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

// Track current section heading for fallback description
let currentSection = 'Lockout Tagout';

for (const page of pages) {
  const lines = page.split('\n').map(l => l.trimEnd()).filter(l => l.trim());
  if (lines.length < 2) continue;

  for (const raw of lines) {
    const trim = raw.trim();

    // Update section heading from ALL-CAPS lines
    if (/^[A-Z][A-Z &\/\-]{4,60}$/.test(trim) && trim.length < 65) {
      currentSection = trim;
      continue;
    }

    // ── Numeric item numbers ──────────────────────────────────────────────────
    NUMERIC_RE.lastIndex = 0;
    let m;
    while ((m = NUMERIC_RE.exec(raw)) !== null) {
      const itemNo = m[1];
      if (isNumericFalsePositive(itemNo, raw)) continue;
      if (!parts.has(itemNo)) {
        const desc = extractDescription(raw, m.index + m[0].length) || currentSection;
        parts.set(itemNo, { itemNo, desc, type: 'numeric' });
      }
    }

    // ── Alphanumeric Brady codes ──────────────────────────────────────────────
    ALPHA_RE.lastIndex = 0;
    while ((m = ALPHA_RE.exec(raw)) !== null) {
      const code = m[1];
      if (isAlphaFalsePositive(code)) continue;
      if (!parts.has(code)) {
        const desc = extractDescription(raw, m.index + m[0].length) || currentSection;
        parts.set(code, { itemNo: code, desc, type: 'alpha' });
      }
    }
  }
}

console.log(`Found ${parts.size} unique item numbers`);

if (DRY_RUN) {
  const sample = [...parts.values()].slice(0, 20);
  sample.forEach(p => console.log(`  ${p.itemNo.padEnd(12)}  [SAFETY]  ${p.desc.slice(0, 60)}`));
  const numeric = [...parts.values()].filter(p => p.type === 'numeric').length;
  const alpha   = [...parts.values()].filter(p => p.type === 'alpha').length;
  console.log(`\n  Numeric: ${numeric}  Alphanumeric: ${alpha}`);
  process.exit(0);
}

// ── Step 3: Write SQL ─────────────────────────────────────────────────────────
console.log(`Writing SQL → ${SQL_PATH}`);

const out = [
  `-- Brady Lockout Tagout Catalog — extracted ${new Date().toISOString().slice(0, 10)}`,
  `-- ${parts.size} item numbers`,
  `-- Apply: node scripts/apply_generic_parts.js --file=${SQL_PATH}`,
  '',
];

for (const p of parts.values()) {
  const id = `BR-SAFETY-${p.itemNo}`;
  out.push(
    `INSERT OR IGNORE INTO MasterParts ` +
    `(MasterPartID, AlternatePartNumbers, Description, Category, Tags, Manufacturer) VALUES ` +
    `('${id}', '${p.itemNo}', '${p.desc}', 'SAFETY', 'brady,loto', 'Brady');`
  );
}

fs.writeFileSync(SQL_PATH, out.join('\n') + '\n', 'utf8');
console.log(`Done — ${parts.size} parts written to ${SQL_PATH}`);
console.log(`\nNext: node scripts/apply_generic_parts.js --file=${SQL_PATH}`);
