// Copyright © 2026 Trier OS. All Rights Reserved.
// Extracts Fastenal item numbers from Facility Maintenance Catalog PDF.
//
// Fastenal item numbers are exactly 7 digits starting with 0 (e.g. 0712315, 0804700).
// Some appear with a trailing footnote digit in the PDF (e.g. 07123156 = item 0712315 + note "6").
// Uses pdftotext for clean text extraction, then parses by page.
// Output: scripts/fastenal_catalog_parts.sql
//
// Usage:
//   node scripts/extract_fastenal.js
//   node scripts/extract_fastenal.js --dry-run

'use strict';

const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const PDF_PATH = 'Catalogs/Facility_Maintenance_Catalog.pdf';
const TXT_PATH = 'Catalogs/fastenal_fmc_text.tmp';
const SQL_PATH = 'scripts/fastenal_catalog_parts.sql';
const DRY_RUN  = process.argv.includes('--dry-run');

// Primary: exactly 7-digit starting with 0.
// Secondary: 8-digit starting with 0 where last digit is a footnote (not another real digit).
// We match 0\d{6} as the first 7 chars — whether followed by word boundary or a lone trailing digit.
const ITEM7_RE = /\b(0\d{6})\b/g;
const ITEM8_RE = /\b(0\d{6})\d\b/g;  // strip trailing footnote digit

// Fastenal section header → Trier OS category
const CAT_MAP = {
  'ELECTRICAL':           'ELECTRICAL',
  'LIGHTING':             'ELECTRICAL',
  'WIRING':               'ELECTRICAL',
  'PLUMBING':             'FLUIDS',
  'HVAC':                 'FLUIDS',
  'PUMP':                 'FLUIDS',
  'VALVE':                'FLUIDS',
  'HOSE':                 'FLUIDS',
  'PIPE':                 'FLUIDS',
  'FITTING':              'FLUIDS',
  'LUBRICANT':            'FLUIDS',
  'POWER TRANSMISSION':   'MECHANICAL',
  'MOTOR':                'ELECTRICAL',
  'BELT':                 'MECHANICAL',
  'CHAIN':                'MECHANICAL',
  'COUPLING':             'MECHANICAL',
  'GEAR':                 'MECHANICAL',
  'JANITORIAL':           'SAFETY',
  'CLEANING':             'SAFETY',
  'CHEMICAL':             'FLUIDS',
  'PAINT':                'FLUIDS',
  'WELDING':              'TOOLING',
  'ABRASIVE':             'TOOLING',
  'FASTENER':             'MECHANICAL',
  'SCREW':                'MECHANICAL',
  'BOLT':                 'MECHANICAL',
  'NUT':                  'MECHANICAL',
  'WASHER':               'MECHANICAL',
  'ANCHOR':               'MECHANICAL',
  'MATERIAL HANDLING':    'MECHANICAL',
  'STORAGE':              'MECHANICAL',
  'PACKAGING':            'MECHANICAL',
  'TOOL':                 'TOOLING',
  'EQUIPMENT':            'TOOLING',
  'HAND TOOL':            'TOOLING',
  'POWER TOOL':           'TOOLING',
  'SAFETY':               'SAFETY',
  'PERSONAL PROTECTION':  'SAFETY',
  'LOCKOUT':              'SAFETY',
  'FALL PROTECTION':      'SAFETY',
  'OFFICE':               'SAFETY',
  'LANDSCAPING':          'TOOLING',
  'OUTDOOR':              'TOOLING',
  'BEARING':              'BEARINGS',
  'FILTER':               'FILTRATION',
  'SEAL':                 'SEALS',
};

function mapCategory(sectionText) {
  const upper = sectionText.toUpperCase();
  for (const [key, val] of Object.entries(CAT_MAP)) {
    if (upper.includes(key)) return val;
  }
  return 'MECHANICAL'; // Fastenal is primarily a fastener/MRO catalog
}

const ALL_CAPS = /^[A-Z][A-Z :&\/\-]{3,}$/;
const NOISE    = /^(continued|refer to page|features:|how do you|value-added|visit fastenal|fastenal\.com|^\s*\d+\s*$)/i;

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

// ── Step 2: Parse by page ─────────────────────────────────────────────────────
console.log('Parsing item numbers...');

const text  = fs.readFileSync(TXT_PATH, 'utf8');
const pages = text.split('\f');
console.log(`Pages: ${pages.length}`);

const parts = new Map();

// Known section names in Fastenal catalog (checked against each line's first word/phrase)
const SECTION_KEYS = Object.keys(CAT_MAP).sort((a,b) => b.length - a.length);
// Fastenal places section tabs at the START of lines (e.g. "ELECTRICAL  Power Strips ...").
// The tab may have only 2 spaces before product content — we match on key at line start.
function detectSectionFromRaw(raw) {
  const upper = raw.trim().toUpperCase();
  for (const key of SECTION_KEYS) {
    if (upper.startsWith(key) && (upper.length === key.length || !/[A-Z]/.test(upper[key.length]))) {
      return key;
    }
  }
  return null;
}

let currentSection = 'MECHANICAL';
const descBuffer   = [];

for (const page of pages) {
  const lines = page.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 3) continue;

  for (const raw of lines) {
    // Strip multi-column noise — take only the leftmost column
    const line = raw.split(/\s{3,}/)[0].trim();
    if (!line || NOISE.test(line)) continue;

    // Update section: check raw line start for known section keywords
    const sectionHit = detectSectionFromRaw(raw);
    if (sectionHit) {
      currentSection = sectionHit;
      // Don't continue — the line may also contain item numbers
    } else if (ALL_CAPS.test(line) && line.length < 60 && !line.match(/^\d/)) {
      currentSection = line;
      continue;
    }

    // Check for item numbers in the raw line
    ITEM7_RE.lastIndex = 0;
    const has7 = ITEM7_RE.test(raw);
    ITEM8_RE.lastIndex = 0;
    const has8 = ITEM8_RE.test(raw);

    // Build description context from non-item lines
    if (!has7 && !has8 && line.length > 8 && line.length < 100) {
      descBuffer.push(line);
      if (descBuffer.length > 3) descBuffer.shift();
    }

    const cat      = mapCategory(currentSection);
    const desc     = descBuffer.slice(-1)[0] || currentSection;
    const descClean = desc.slice(0, 120).replace(/'/g, "''");

    // Extract 7-digit items
    ITEM7_RE.lastIndex = 0;
    let m;
    while ((m = ITEM7_RE.exec(raw)) !== null) {
      const itemNo = m[1];
      if (!parts.has(itemNo)) {
        parts.set(itemNo, { itemNo, cat, desc: descClean });
      }
    }

    // Extract from footnote-appended 8-digit runs (take first 7 digits)
    ITEM8_RE.lastIndex = 0;
    while ((m = ITEM8_RE.exec(raw)) !== null) {
      const itemNo = m[1];
      if (!parts.has(itemNo)) {
        parts.set(itemNo, { itemNo, cat, desc: descClean });
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
  `-- Fastenal Facility Maintenance Catalog — extracted ${new Date().toISOString().slice(0,10)}`,
  `-- ${parts.size} item numbers`,
  `-- Apply: node scripts/apply_fastenal_parts.js`,
  '',
];

for (const p of parts.values()) {
  const id = `FN-${p.cat}-${p.itemNo}`;
  out.push(
    `INSERT OR IGNORE INTO MasterParts ` +
    `(MasterPartID, AlternatePartNumbers, Description, Category, Tags, Manufacturer) VALUES ` +
    `('${id}', '${p.itemNo}', '${p.desc.replace(/'/g,"''")}', '${p.cat}', 'fastenal,fmc', 'Fastenal');`
  );
}

fs.writeFileSync(SQL_PATH, out.join('\n') + '\n', 'utf8');
console.log(`Done — ${parts.size} parts written to ${SQL_PATH}`);
console.log(`\nNext steps:`);
console.log(`  1. node scripts/apply_fastenal_parts.js`);
console.log(`  2. node scripts/auto_fastenal_lookup.js`);
