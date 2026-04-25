// Copyright © 2026 Trier OS. All Rights Reserved.
// Extracts Gates Power Transmission item numbers from the Motion Gates PT Catalog PDF.
//
// Two item number patterns are extracted:
//   1. Product No. (numeric with dash): DDDD-DDDD  e.g. 9274-0080, 7420-1212
//   2. Part No.    (belt codes):        D[D]ALPHA-DDD[D[D]]-D[D]  e.g. 8MGT-640-12
//
// All parts map to MECHANICAL (power transmission).
// Section headers are tracked to build product descriptions.
//
// Output: scripts/gates_pt_parts.sql
//
// Usage:
//   node scripts/extract_gates.js
//   node scripts/extract_gates.js --dry-run
//
// API dependencies: none (reads local PDF via pdftotext CLI)

'use strict';

const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const PDF_PATH = 'Catalogs/Motion/Motion - Gates Power Transmission Catalog.pdf';
const TXT_PATH = 'Catalogs/gates_pt_text.tmp';
const SQL_PATH = 'scripts/gates_pt_parts.sql';
const DRY_RUN  = process.argv.includes('--dry-run');

// Pattern 1: Product No. — 4-digit dash 4-digit (e.g. 9274-0080)
const PRODUCT_NO_RE = /\b(\d{4}-\d{4})\b/g;

// Pattern 2: Belt Part No. — 1-2 digits + 2-5 uppercase letters + optional T + dash +
//            3-5 digits + dash + 1-3 digits (e.g. 8MGT-640-12, 5VX-1000-1, 3L260-1)
const PART_NO_RE = /\b(\d{1,2}[A-Z]{2,5}T?-\d{3,5}-\d{1,3})\b/g;

// Gates category map — section keywords → Trier OS category
// Everything in this catalog is power transmission → MECHANICAL
const CAT_MAP = {
  'BELT':             'MECHANICAL',
  'SHEAVE':           'MECHANICAL',
  'SPROCKET':         'MECHANICAL',
  'BUSHING':          'MECHANICAL',
  'COUPLING':         'MECHANICAL',
  'CHAIN':            'MECHANICAL',
  'TIMING':           'MECHANICAL',
  'POLY CHAIN':       'MECHANICAL',
  'POWERGRIP':        'MECHANICAL',
  'HI-POWER':         'MECHANICAL',
  'V-BELT':           'MECHANICAL',
  'SYNCHRONOUS':      'MECHANICAL',
  'COTTON CLEANER':   'MECHANICAL',
  'INDUSTRIAL':       'MECHANICAL',
  'POWER TRANSMISSION': 'MECHANICAL',
};

function mapCategory(sectionText) {
  const upper = sectionText.toUpperCase();
  for (const [key, val] of Object.entries(CAT_MAP)) {
    if (upper.includes(key)) return val;
  }
  return 'MECHANICAL';
}

// Skip product numbers that look like page references or standalone sizes
// (e.g. column separators like 1234-5678 that are pure sequential runs)
function isProductNoFalsePositive(num) {
  const [a, b] = num.split('-').map(Number);
  // Skip if both halves are round zeros like 0000 or 9999
  if (a === 0 || b === 0) return true;
  return false;
}

const ALLCAPS_HEADING = /^[A-Z][A-Z0-9 \-\/&()]{3,60}$/;
const NOISE = /^(continued|page|refer to|^\s*\d+\s*$|features|see also)/i;

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

  let currentSection    = 'Gates Power Transmission';
  let currentSubsection = '';
  const descBuffer = [];

  for (const raw of lines) {
    const trim = raw.trim();
    if (!trim || NOISE.test(trim)) continue;

    // Detect section and subsection headings
    if (ALLCAPS_HEADING.test(trim) && trim.length < 65) {
      currentSection    = trim;
      currentSubsection = '';
      descBuffer.length = 0;
      continue;
    }

    // Mixed-case product heading (e.g. "Poly Chain GT Carbon Belts 8mm")
    PRODUCT_NO_RE.lastIndex = 0;
    PART_NO_RE.lastIndex    = 0;
    const hasProductNo = PRODUCT_NO_RE.test(raw);
    const hasPartNo    = PART_NO_RE.test(raw);
    PRODUCT_NO_RE.lastIndex = 0;
    PART_NO_RE.lastIndex    = 0;

    if (!hasProductNo && !hasPartNo) {
      if (/^[A-Z][a-zA-Z]/.test(trim) && trim.length > 6 && trim.length < 90) {
        currentSubsection = trim;
        descBuffer.length = 0;
      }
      if (trim.length > 8 && trim.length < 150) {
        descBuffer.push(trim);
        if (descBuffer.length > 3) descBuffer.shift();
      }
      continue;
    }

    // Build description from section context
    const contextDesc = [currentSubsection || currentSection, ...descBuffer.slice(-1)]
      .filter(Boolean).join('; ').slice(0, 120).replace(/'/g, "''");
    const cat = mapCategory(currentSection + ' ' + currentSubsection);

    // ── Extract Product Nos. (DDDD-DDDD) ──────────────────────────────────────
    PRODUCT_NO_RE.lastIndex = 0;
    let m;
    while ((m = PRODUCT_NO_RE.exec(raw)) !== null) {
      const itemNo = m[1];
      if (isProductNoFalsePositive(itemNo)) continue;
      if (!parts.has(itemNo)) {
        parts.set(itemNo, { itemNo, desc: contextDesc, cat, type: 'product' });
      }
    }

    // ── Extract Belt Part Nos. (e.g. 8MGT-640-12) ─────────────────────────────
    PART_NO_RE.lastIndex = 0;
    while ((m = PART_NO_RE.exec(raw)) !== null) {
      const itemNo = m[1];
      if (!parts.has(itemNo)) {
        parts.set(itemNo, { itemNo, desc: contextDesc, cat, type: 'partno' });
      }
    }
  }
}

console.log(`Found ${parts.size} unique item numbers`);

if (DRY_RUN) {
  const sample = [...parts.values()].slice(0, 20);
  sample.forEach(p =>
    console.log(`  ${p.itemNo.padEnd(16)}  [${p.cat.padEnd(12)}]  ${p.desc.slice(0, 55)}`)
  );
  const byType = { product: 0, partno: 0 };
  for (const p of parts.values()) byType[p.type] = (byType[p.type] || 0) + 1;
  console.log(`\n  Product Nos.: ${byType.product}  Belt Part Nos.: ${byType.partno}`);
  process.exit(0);
}

// ── Step 3: Write SQL ─────────────────────────────────────────────────────────
console.log(`Writing SQL → ${SQL_PATH}`);

const out = [
  `-- Gates Power Transmission Catalog — extracted ${new Date().toISOString().slice(0, 10)}`,
  `-- ${parts.size} item numbers`,
  `-- Apply: node scripts/apply_generic_parts.js --file=${SQL_PATH}`,
  '',
];

for (const p of parts.values()) {
  // Sanitize itemNo for use in MasterPartID (replace dashes are fine, spaces not expected)
  const id = `GT-${p.cat}-${p.itemNo}`;
  out.push(
    `INSERT OR IGNORE INTO MasterParts ` +
    `(MasterPartID, AlternatePartNumbers, Description, Category, Tags, Manufacturer) VALUES ` +
    `('${id}', '${p.itemNo}', '${p.desc}', '${p.cat}', 'gates,powertransmission', 'Gates');`
  );
}

fs.writeFileSync(SQL_PATH, out.join('\n') + '\n', 'utf8');
console.log(`Done — ${parts.size} parts written to ${SQL_PATH}`);
console.log(`\nNext: node scripts/apply_generic_parts.js --file=${SQL_PATH}`);
