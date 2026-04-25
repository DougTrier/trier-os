// Copyright © 2026 Trier OS. All Rights Reserved.
// Extracts MSC Industrial item numbers from Big Book V24 catalog PDF.
//
// MSC item numbers are exactly 8 digits (e.g. 77849974, 01165018).
// Uses pdftotext for clean text extraction, then parses by page.
// Output: scripts/msc_bigbook_parts.sql
//
// Usage:
//   node scripts/extract_msc.js
//   node scripts/extract_msc.js --dry-run

'use strict';

const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const PDF_PATH = 'Catalogs/BigBookV24.pdf';
const TXT_PATH = 'Catalogs/msc_bigbook_text.tmp';
const SQL_PATH = 'scripts/msc_bigbook_parts.sql';
const DRY_RUN  = process.argv.includes('--dry-run');

// MSC item numbers: exactly 8 digits
const ITEM_RE = /\b(\d{8})\b/g;

// MSC section header → Trier OS category
const CAT_MAP = {
  'HOLEMAKING':          'TOOLING',
  'DRILL':               'TOOLING',
  'THREADING':           'TOOLING',
  'TAPS':                'TOOLING',
  'MILLING':             'TOOLING',
  'TURNING':             'TOOLING',
  'TOOLHOLDING':         'TOOLING',
  'ABRASIVE':            'TOOLING',
  'GRINDING':            'TOOLING',
  'MEASURING':           'TOOLING',
  'INSPECTION':          'TOOLING',
  'HAND TOOL':           'TOOLING',
  'POWER TOOL':          'TOOLING',
  'CUTTING TOOL':        'TOOLING',
  'SAW':                 'TOOLING',
  'FLUID POWER':         'HYDRAULICS',
  'HYDRAULIC':           'HYDRAULICS',
  'PNEUMATIC':           'PNEUMATICS',
  'AIR TOOL':            'PNEUMATICS',
  'COMPRESSOR':          'PNEUMATICS',
  'BEARING':             'BEARINGS',
  'LINEAR MOTION':       'BEARINGS',
  'POWER TRANSMISSION':  'MECHANICAL',
  'BELT':                'MECHANICAL',
  'CHAIN':               'MECHANICAL',
  'COUPLING':            'MECHANICAL',
  'GEAR':                'MECHANICAL',
  'MOTOR':               'ELECTRICAL',
  'ELECTRICAL':          'ELECTRICAL',
  'ELECTRONIC':          'ELECTRICAL',
  'SENSOR':              'ELECTRICAL',
  'FILTER':              'FILTRATION',
  'FILTRATION':          'FILTRATION',
  'SEAL':                'SEALS',
  'O-RING':              'SEALS',
  'GASKET':              'SEALS',
  'SAFETY':              'SAFETY',
  'PERSONAL PROTECTION': 'SAFETY',
  'LOCKOUT':             'SAFETY',
  'MATERIAL HANDLING':   'MECHANICAL',
  'STORAGE':             'MECHANICAL',
  'FASTENER':            'MECHANICAL',
  'SCREW':               'MECHANICAL',
  'BOLT':                'MECHANICAL',
  'NUT':                 'MECHANICAL',
  'WASHER':              'MECHANICAL',
  'FITTING':             'FLUIDS',
  'PIPE':                'FLUIDS',
  'HOSE':                'FLUIDS',
  'VALVE':               'FLUIDS',
  'LUBRICANT':           'FLUIDS',
  'CHEMICAL':            'FLUIDS',
  'JANITORIAL':          'FLUIDS',
  'WELDING':             'TOOLING',
  'FINISHING':           'TOOLING',
};

function mapCategory(sectionText) {
  const upper = sectionText.toUpperCase();
  for (const [key, val] of Object.entries(CAT_MAP)) {
    if (upper.includes(key)) return val;
  }
  return 'TOOLING'; // MSC is primarily a tooling/machining catalog
}

// Known non-item 8-digit sequences to skip
function isFalsePositive(num) {
  // Year-like numbers
  if (/^(19|20)\d{6}$/.test(num)) return true;
  // All same digit
  if (/^(\d)\1{7}$/.test(num)) return true;
  return false;
}

// ── Step 1: Extract PDF text ──────────────────────────────────────────────────
if (!fs.existsSync(PDF_PATH)) {
  console.error(`PDF not found: ${PDF_PATH}`);
  process.exit(1);
}

if (!fs.existsSync(TXT_PATH)) {
  console.log('Extracting text from PDF (this takes ~3 min for 394MB)...');
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

const parts    = new Map();
const ALL_CAPS = /^[A-Z][A-Z :&\/\-]{3,}$/;
const NOISE    = /^(continued|refer to page|need more|features:|coating|tool material|grade:|basics of|^\s*\d+\s*$)/i;

for (const page of pages) {
  const lines = page.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 3) continue;

  // Find section header — first ALL-CAPS line, strip trailing multi-space junk
  let currentSection    = 'TOOLING';
  let currentSubsection = '';

  for (const l of lines.slice(0, 6)) {
    const clean = l.split(/\s{3,}/)[0].trim();
    if (ALL_CAPS.test(clean) && clean.length < 60 && !NOISE.test(clean)) {
      currentSection = clean;
      break;
    }
  }

  const descBuffer = [];
  let headerDone = false;

  for (const raw of lines) {
    const line = raw.split(/\s{3,}/)[0].trim();
    if (!line || NOISE.test(line)) continue;

    if (!headerDone && ALL_CAPS.test(line) && line.length < 60) {
      headerDone = true;
      continue;
    }

    // Subsection: mixed-case product heading
    ITEM_RE.lastIndex = 0;
    const hasItems = ITEM_RE.test(line);
    ITEM_RE.lastIndex = 0;

    if (!hasItems && /^[A-Z][a-zA-Z]/.test(line) && line.length > 8 && line.length < 80) {
      currentSubsection = line;
      descBuffer.length = 0;
    }

    if (!hasItems && line.length > 10 && line.length < 150) {
      descBuffer.push(line);
      if (descBuffer.length > 3) descBuffer.shift();
    }

    // Extract 8-digit item numbers from the full raw line
    ITEM_RE.lastIndex = 0;
    let m;
    while ((m = ITEM_RE.exec(raw)) !== null) {
      const itemNo = m[1];
      if (isFalsePositive(itemNo)) continue;

      if (!parts.has(itemNo)) {
        const cat  = mapCategory(currentSection + ' ' + currentSubsection);
        const desc = [currentSubsection || currentSection, ...descBuffer.slice(-1)]
          .filter(Boolean).join('; ').slice(0, 120).replace(/'/g, "''");
        parts.set(itemNo, { itemNo, cat, desc });
      }
    }
  }
}

console.log(`Found ${parts.size} unique item numbers`);

if (DRY_RUN) {
  const sample = [...parts.values()].slice(0, 20);
  sample.forEach(p => console.log(`  ${p.itemNo}  [${p.cat.padEnd(12)}]  ${p.desc.slice(0,60)}`));
  const cats = {};
  for (const p of parts.values()) cats[p.cat] = (cats[p.cat] || 0) + 1;
  console.log('\nCategory breakdown:');
  Object.entries(cats).sort((a,b)=>b[1]-a[1]).forEach(([c,n])=>console.log(`  ${c.padEnd(14)} ${n}`));
  process.exit(0);
}

// ── Step 3: Write SQL ─────────────────────────────────────────────────────────
console.log(`Writing SQL → ${SQL_PATH}`);

const out = [
  `-- MSC Big Book V24 — extracted ${new Date().toISOString().slice(0,10)}`,
  `-- ${parts.size} item numbers`,
  `-- Apply: node scripts/apply_msc_parts.js`,
  '',
];

for (const p of parts.values()) {
  const id = `MSC-${p.cat}-${p.itemNo}`;
  out.push(
    `INSERT OR IGNORE INTO MasterParts ` +
    `(MasterPartID, AlternatePartNumbers, Description, Category, Tags, Manufacturer) VALUES ` +
    `('${id}', '${p.itemNo}', '${p.desc.replace(/'/g,"''")}', '${p.cat}', 'msc,bigbookv24', 'MSC Industrial');`
  );
}

fs.writeFileSync(SQL_PATH, out.join('\n') + '\n', 'utf8');
console.log(`Done — ${parts.size} parts written to ${SQL_PATH}`);
console.log(`\nNext steps:`);
console.log(`  1. node scripts/apply_msc_parts.js`);
console.log(`  2. node scripts/auto_msc_lookup.js`);
