// Copyright © 2026 Trier OS. All Rights Reserved.
// Extracts Carr Lane Manufacturing part numbers from Catalog LXIV.
//
// Carr Lane makes jig/fixture tooling components: alignment pins, hoist rings,
// clamps, toggle clamps, drill bushings, locators, modular fixturing, etc.
//
// Part number formats:
//   CL-0-LP, CL-0A-CP  (alphanumeric middle + letter suffix)
//   CL-1000-SHR-1      (numeric middle + suffix + optional index)
//   CL-17215           (5-digit numeric, no suffix — miniature stainless straps etc.)
//   CL-254             (3-digit numeric, no suffix)
//
// Output: scripts/carr_lane_parts.sql
//
// Usage:
//   node scripts/extract_carr_lane.js
//   node scripts/extract_carr_lane.js --dry-run

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');

const PDF_PATH = 'Catalogs/Catalog LXIV.pdf';
const TXT_PATH = 'Catalogs/carr_lane_text.tmp';
const SQL_PATH = 'scripts/carr_lane_parts.sql';
const DRY_RUN  = process.argv.includes('--dry-run');

// Pattern 1: CL-{alphanum middle}-{LETTER suffix}-{optional index}
// CL-0-LP, CL-1000-SHR-1, CL-0-HKE-00, CL-0A-CP
const ITEM3_RE = /\bCL-[A-Z0-9]+-[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)?\b/g;

// Pattern 2: CL-{3-6 digits} with NO following hyphen+letter (pure numeric)
// CL-254, CL-17215 — excludes CL-1000-BNV style (those are caught by ITEM3_RE)
const ITEM2_RE = /\bCL-\d{3,6}(?!-[A-Z0-9])\b/g;

function isValid(itemNo) {
  if (itemNo.includes('.'))  return false;  // decimal = spec, not part no.
  if (/CL-X-/i.test(itemNo)) return false; // X = configure-to-order placeholder
  if (itemNo.length < 5)     return false;  // too short
  return true;
}

// Section heading detection — ALL-CAPS lines that name a product category
// Repeats as running headers, so last-seen value is always current section
const SECTION_WORDS = [
  'ALIGNMENT PINS', 'HOIST RINGS', 'HANDLES', 'KNOBS', 'SCREW CLAMPS',
  'SPRING-LOADED', 'SUPPORTS', 'RESTS', 'FEET', 'LOCATORS',
  'CLAMPS AND ACCESSORIES', 'THREADED FASTENERS', 'JIG AND FIXTURE',
  'MODULAR FIXTURING', 'TOGGLE CLAMPS', 'DRILL-JIG BUSHINGS', 'CLIP BUDDY',
];

// Sub-section and product headings — ALL-CAPS, no 3+ consecutive spaces (that's a table column header)
// Also reject lines that are purely dimension abbreviations
const ALL_CAPS_HEADING = /^[A-Z][A-Z ,\-\/&\.]{4,60}$/;
const COL_HEADER = /\b(NOMINAL|ACTUAL|DIA|DIAMETER|TORQUE|PART NO|CAPACITY|THREAD|LOAD|WEIGHT|STUD SIZE|BOLT SIZE)\b/i;

// Material/finish spec lines — great secondary context
const MATERIAL_RE = /^(PIN|SCREW|BODY|STEEL|STAINLESS|ALLOY|MATERIAL|FINISH|RING|BUSHING)\b.*?(STEEL|ALLOY|STAINLESS|HARDENED|FINISH|BRONZE|NYLON)[^a-z]{0,60}$/i;

// Noise — skip these lines for context tracking
const NOISE = /www\.carrlane|carrlane\.com|carr lane mfg|carr lane manufacturing|catalog|page \d|^\d+\s*\||\|\s*\d+$|info\+|patent|made in usa|see page|copyright|\d{1,3}\/\d{2}/i;

// ── Step 1: Extract PDF text ──────────────────────────────────────────────────
if (!fs.existsSync(PDF_PATH)) {
  console.error(`PDF not found: ${PDF_PATH}`);
  process.exit(1);
}

if (!fs.existsSync(TXT_PATH)) {
  console.log('Extracting text from PDF...');
  const result = spawnSync('pdftotext', ['-layout', PDF_PATH, TXT_PATH], { timeout: 300000 });
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

let currentSection    = 'Carr Lane Tooling Components';
let currentSubsection = '';
let currentMaterial   = '';

function buildDesc() {
  const base = currentSubsection || currentSection;
  if (currentMaterial) return `${base} — ${currentMaterial}`.slice(0, 120);
  return base.slice(0, 120);
}

for (const page of pages) {
  const lines = page.split('\n');

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || NOISE.test(line)) continue;

    // Update section context — ALL-CAPS, no wide column gaps, no table-header words
    if (ALL_CAPS_HEADING.test(line) && !/ {3,}/.test(line) && !COL_HEADER.test(line) && !/\bINCH\b|\bMETRIC\b/.test(line)) {
      // Check if it's a main section heading
      const up = line.toUpperCase();
      let isMainSection = false;
      for (const word of SECTION_WORDS) {
        if (up.includes(word)) { isMainSection = true; break; }
      }
      if (isMainSection) {
        currentSection    = line;
        currentSubsection = '';
        currentMaterial   = '';
      } else if (line.length < 60) {
        // Sub-section / product type heading
        currentSubsection = line;
        currentMaterial   = '';
      }
    }

    // Update material/finish context
    if (MATERIAL_RE.test(line) && line.length < 100) {
      currentMaterial = line.replace(/\s+/g, ' ').trim().slice(0, 60);
    }

    // Extract part numbers — scan the full raw line (handles two columns)
    const desc = buildDesc().replace(/'/g, "''");

    ITEM3_RE.lastIndex = 0;
    let m;
    while ((m = ITEM3_RE.exec(raw)) !== null) {
      const itemNo = m[0];
      if (!isValid(itemNo) || parts.has(itemNo)) continue;
      parts.set(itemNo, { itemNo, cat: 'TOOLING', desc });
    }

    ITEM2_RE.lastIndex = 0;
    while ((m = ITEM2_RE.exec(raw)) !== null) {
      const itemNo = m[0];
      if (!isValid(itemNo) || parts.has(itemNo)) continue;
      parts.set(itemNo, { itemNo, cat: 'TOOLING', desc });
    }
  }
}

console.log(`Found ${parts.size} unique item numbers`);

if (DRY_RUN) {
  console.log('\nSample parts:');
  [...parts.values()].slice(0, 30).forEach(p =>
    console.log(`  ${p.itemNo.padEnd(22)} [${p.cat}]  ${p.desc.slice(0, 65)}`)
  );
  // Show section variety
  const descSample = new Set([...parts.values()].map(p => p.desc.split(' — ')[0]));
  console.log(`\nSection variety (${descSample.size} unique):`);
  [...descSample].slice(0, 20).forEach(s => console.log('  ' + s));
  process.exit(0);
}

// ── Step 3: Write SQL ─────────────────────────────────────────────────────────
console.log(`Writing SQL → ${SQL_PATH}`);

const out = [
  `-- Carr Lane Manufacturing Catalog LXIV — extracted ${new Date().toISOString().slice(0,10)}`,
  `-- ${parts.size} item numbers (alignment pins, hoist rings, clamps, toggle clamps, bushings, etc.)`,
  `-- Apply: node scripts/apply_generic_parts.js --file=${SQL_PATH}`,
  '',
];

for (const p of parts.values()) {
  const id = `CLMFG-TOOLING-${p.itemNo}`;
  out.push(
    `INSERT OR IGNORE INTO MasterParts ` +
    `(MasterPartID, AlternatePartNumbers, Description, Category, Tags, Manufacturer) VALUES ` +
    `('${id}', '${p.itemNo}', '${p.desc.replace(/'/g,"''")}', '${p.cat}', 'carrlane,catalog64,lxiv', 'Carr Lane Manufacturing');`
  );
}

fs.writeFileSync(SQL_PATH, out.join('\n') + '\n', 'utf8');
console.log(`Done — ${parts.size} parts written to ${SQL_PATH}`);
console.log(`\nNext: node scripts/apply_generic_parts.js --file=${SQL_PATH}`);
