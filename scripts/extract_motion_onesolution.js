// Copyright © 2026 Trier OS. All Rights Reserved.
// Extracts Motion Industries One Solution 2025 Catalog item numbers (Mi #) from PDF.
//
// Mi # column contains 8-digit numbers (e.g. 16799630) that appear on rows also
// containing a 5-digit Hunter SKU. Strategy:
//   - Primary: lines matching 5-digit + whitespace + 8-digit → extract 8-digit as Mi #
//   - Fallback: lines where an 8-digit number appears rightmost after 3+ spaces
//
// Category is detected from section headers (fans → ELECTRICAL, conveyors → MECHANICAL, etc.)
// Description uses the MODEL # column content near each part number.
//
// Output: scripts/motion_onesolution_parts.sql
//
// Usage:
//   node scripts/extract_motion_onesolution.js
//   node scripts/extract_motion_onesolution.js --dry-run
//
// API dependencies: none (reads local PDF via pdftotext CLI)

'use strict';

const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const PDF_PATH = 'Catalogs/Motion/Motion - One Solution 2025 Catalog.pdf';
const TXT_PATH = 'Catalogs/motion_onesolution_text.tmp';
const SQL_PATH = 'scripts/motion_onesolution_parts.sql';
const DRY_RUN  = process.argv.includes('--dry-run');

// Primary: 5-digit Hunter SKU followed by 8-digit Mi # on the same line
const SKU_MI_RE = /\b(\d{5})\s{1,10}(\d{8})\b/g;

// Fallback: 8-digit number at the rightmost position (preceded by 3+ spaces)
const RIGHTMOST_8_RE = /\s{3,}(\d{8})\s*$/;

// False positive filter for 8-digit numbers
function isFalsePositive(num) {
  if (/^(\d)\1{7}$/.test(num)) return true;       // all same digit
  if (/^(19|20)\d{6}$/.test(num)) return true;    // year-like date stamp
  return false;
}

// Category map — Motion One Solution covers a broad range of MRO products
const CAT_MAP = {
  'FAN':              'ELECTRICAL',
  'MOTOR':            'ELECTRICAL',
  'ELECTRICAL':       'ELECTRICAL',
  'DRIVE':            'ELECTRICAL',
  'INVERTER':         'ELECTRICAL',
  'VFD':              'ELECTRICAL',
  'SENSOR':           'ELECTRICAL',
  'CONVEYOR':         'MECHANICAL',
  'POWER TRANSMISSION': 'MECHANICAL',
  'BELT':             'MECHANICAL',
  'CHAIN':            'MECHANICAL',
  'COUPLING':         'MECHANICAL',
  'GEARBOX':          'MECHANICAL',
  'GEAR':             'MECHANICAL',
  'SPROCKET':         'MECHANICAL',
  'BEARING':          'BEARINGS',
  'LINEAR':           'BEARINGS',
  'HYDRAULIC':        'HYDRAULICS',
  'PNEUMATIC':        'PNEUMATICS',
  'AIR':              'PNEUMATICS',
  'FILTER':           'FILTRATION',
  'FILTRATION':       'FILTRATION',
  'SEAL':             'SEALS',
  'O-RING':           'SEALS',
  'GASKET':           'SEALS',
  'SAFETY':           'SAFETY',
  'LOCKOUT':          'SAFETY',
  'HOSE':             'FLUIDS',
  'VALVE':            'FLUIDS',
  'FITTING':          'FLUIDS',
  'PIPE':             'FLUIDS',
  'LUBRICANT':        'FLUIDS',
  'FLUID':            'FLUIDS',
  'FASTENER':         'MECHANICAL',
  'TOOL':             'TOOLING',
  'TOOLING':          'TOOLING',
  'ABRASIVE':         'TOOLING',
};

function mapCategory(sectionText) {
  const upper = sectionText.toUpperCase();
  for (const [key, val] of Object.entries(CAT_MAP)) {
    if (upper.includes(key)) return val;
  }
  return 'MECHANICAL'; // Motion One Solution skews toward mechanical MRO
}

const ALLCAPS_HEADING = /^[A-Z][A-Z0-9 \-\/&()]{3,60}$/;
const NOISE = /^(continued|page \d|see page|^\s*\d+\s*$)/i;

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

  let currentSection    = 'Motion One Solution';
  let currentSubsection = '';
  const descBuffer = [];

  for (const raw of lines) {
    const trim = raw.trim();
    if (!trim || NOISE.test(trim)) continue;

    // Detect section headings
    if (ALLCAPS_HEADING.test(trim) && trim.length < 65) {
      currentSection    = trim;
      currentSubsection = '';
      descBuffer.length = 0;
      continue;
    }

    // Mixed-case product/model heading — track as subsection + description
    SKU_MI_RE.lastIndex = 0;
    const hasSku = SKU_MI_RE.test(raw);
    SKU_MI_RE.lastIndex = 0;

    const fallbackMatch = RIGHTMOST_8_RE.exec(raw);

    if (!hasSku && !fallbackMatch) {
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

    const cat = mapCategory(currentSection + ' ' + currentSubsection);

    // Build description: prefer subsection (model heading) + section context
    // The leading text on the same data row often contains the model number
    const rowPrefix = raw.replace(/\s{3,}\d{5}\s+\d{8}.*$/, '').trim();
    const modelText = rowPrefix.length > 2 && rowPrefix.length < 60 ? rowPrefix : currentSubsection;
    const contextDesc = [modelText || currentSection, ...descBuffer.slice(-1)]
      .filter(Boolean).join('; ').slice(0, 120).replace(/'/g, "''");

    // ── Primary: 5-digit + 8-digit pairs ─────────────────────────────────────
    SKU_MI_RE.lastIndex = 0;
    let m;
    while ((m = SKU_MI_RE.exec(raw)) !== null) {
      const miNo = m[2]; // 8-digit Mi #
      if (isFalsePositive(miNo)) continue;
      if (!parts.has(miNo)) {
        parts.set(miNo, { itemNo: miNo, hunterSku: m[1], desc: contextDesc, cat });
      }
    }

    // ── Fallback: rightmost 8-digit number ───────────────────────────────────
    if (fallbackMatch) {
      const miNo = fallbackMatch[1];
      if (!isFalsePositive(miNo) && !parts.has(miNo)) {
        parts.set(miNo, { itemNo: miNo, hunterSku: '', desc: contextDesc, cat });
      }
    }
  }
}

console.log(`Found ${parts.size} unique item numbers`);

if (DRY_RUN) {
  const sample = [...parts.values()].slice(0, 20);
  sample.forEach(p =>
    console.log(`  ${p.itemNo}  SKU:${(p.hunterSku || 'n/a').padEnd(6)}  [${p.cat.padEnd(12)}]  ${p.desc.slice(0, 45)}`)
  );
  const cats = {};
  for (const p of parts.values()) cats[p.cat] = (cats[p.cat] || 0) + 1;
  console.log('\nCategory breakdown:');
  Object.entries(cats).sort((a, b) => b[1] - a[1]).forEach(([c, n]) =>
    console.log(`  ${c.padEnd(14)} ${n}`)
  );
  process.exit(0);
}

// ── Step 3: Write SQL ─────────────────────────────────────────────────────────
console.log(`Writing SQL → ${SQL_PATH}`);

const out = [
  `-- Motion Industries One Solution 2025 Catalog — extracted ${new Date().toISOString().slice(0, 10)}`,
  `-- ${parts.size} item numbers`,
  `-- Apply: node scripts/apply_generic_parts.js --file=${SQL_PATH}`,
  '',
];

for (const p of parts.values()) {
  const id    = `MI-${p.cat}-${p.itemNo}`;
  // Store Hunter SKU as alternate part number if available
  const altNo = p.hunterSku || p.itemNo;
  out.push(
    `INSERT OR IGNORE INTO MasterParts ` +
    `(MasterPartID, AlternatePartNumbers, Description, Category, Tags, Manufacturer) VALUES ` +
    `('${id}', '${altNo}', '${p.desc}', '${p.cat}', 'motion,onesolution2025', 'Motion Industries');`
  );
}

fs.writeFileSync(SQL_PATH, out.join('\n') + '\n', 'utf8');
console.log(`Done — ${parts.size} parts written to ${SQL_PATH}`);
console.log(`\nNext: node scripts/apply_generic_parts.js --file=${SQL_PATH}`);
