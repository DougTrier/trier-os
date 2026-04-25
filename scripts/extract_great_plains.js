// Copyright © 2026 Trier OS. All Rights Reserved.
// Extracts Great Plains Manufacturing part numbers from Parts Manual 401-069P.
//
// GP part numbers: 3 digits + dash + 3 digits + 1 uppercase letter
// Examples: 890-611C, 401-078K, 802-076C, 807-073C, 500-064D
// Descriptions are captured from the same line as the part number.
// Output: scripts/great_plains_parts.sql
//
// Usage:
//   node scripts/extract_great_plains.js
//   node scripts/extract_great_plains.js --dry-run

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');

const PDF_PATH = 'Catalogs/Great Plains 401-069p.pdf';
const TXT_PATH = 'Catalogs/great_plains_401_069p_text.tmp';
const SQL_PATH = 'scripts/great_plains_parts.sql';
const DRY_RUN  = process.argv.includes('--dry-run');

// Primary Great Plains part number: 3 digits - 3 digits - 1 uppercase letter
// Examples: 401-078K, 890-611C, 802-076C, 500-064D, 116-037H
const GP_RE = /\b(\d{3}-\d{3}[A-Z])\b/g;

// Line format in parts tables (ref number, part number, description)
// "1. 890-611C      SQ TB JACK 10000 LB LOW MOUNT"
// "1. 401-078K      JACK REPLACED BY 890-611C"
const PARTS_LINE_RE = /^\s*\d+\.\s+(\d{3}-\d{3}[A-Z])\s{2,}([A-Z0-9][^\t\n]{3,60})/;

// Section → Trier OS category mapping
const SECTION_CAT_MAP = [
  { key: 'HYDRAUL',    cat: 'HYDRAULICS' },
  { key: 'ELECTRICAL', cat: 'ELECTRICAL' },
  { key: 'PLUMBING',   cat: 'MECHANICAL' },
  { key: 'FERTILIZER', cat: 'MECHANICAL' },
  { key: 'DECAL',      cat: 'MECHANICAL' },
  { key: 'DRIVE',      cat: 'MECHANICAL' },
  { key: 'WHEEL',      cat: 'MECHANICAL' },
  { key: 'FRAME',      cat: 'MECHANICAL' },
  { key: 'MARKER',     cat: 'MECHANICAL' },
  { key: 'OPTIONAL',   cat: 'MECHANICAL' },
];

// Section header pattern — short standalone lines with known section words
const SECTION_WORDS = ['FRAME', 'WHEEL', 'DRIVE', 'MARKER', 'HYDRAUL', 'ELECTRICAL',
                       'PLUMBING', 'FERTILIZER', 'DECAL', 'OPTIONAL'];

function mapCategory(section) {
  const up = section.toUpperCase();
  for (const { key, cat } of SECTION_CAT_MAP) {
    if (up.includes(key)) return cat;
  }
  return 'MECHANICAL';
}

// Noise lines to skip (including ToC dot-leader lines)
const NOISE = /table of contents|part number index|copyright|great plains mfg|printed in|applies to|s\/n aa\d|refer to|for breakdown|image no\.|rev\.|revision|\d{1,3}\/\d{2}\/\d{2}|\.{5,}/i;

// Parts that are catalog/manual identifiers, not orderable items
const SKIP_PARTS = new Set(['401-069P']);

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
// Descriptions map — captures description from parts-table lines when available
const descs = new Map();

let currentSection = 'Frame Assembly';
let currentCat     = 'MECHANICAL';

for (const page of pages) {
  const lines = page.split('\n');

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || NOISE.test(line)) continue;

    // Section detection: short lines with known section words but no embedded part numbers
    if (line.length < 70 && !NOISE.test(line) && !/\d{3}-\d{3}[A-Z]/.test(line) && !line.includes('(S/N')) {
      const up = line.toUpperCase();
      for (const word of SECTION_WORDS) {
        if (up.includes(word)) {
          currentSection = line.replace(/\s+/g, ' ').trim();
          currentCat = mapCategory(currentSection);
          break;
        }
      }
    }

    // Try structured parts-table line first for rich description
    const tableMatch = line.match(PARTS_LINE_RE);
    if (tableMatch) {
      const itemNo = tableMatch[1];
      if (SKIP_PARTS.has(itemNo)) continue;
      const desc = tableMatch[2].trim()
        .replace(/\s{2,}.*/,'')  // strip trailing columns
        .replace(/\.+\s*\d*\s*$/, '')  // strip ToC dot leaders + page numbers
        .trim();
      if (!parts.has(itemNo) && desc.length > 2) {
        parts.set(itemNo, { itemNo, cat: currentCat, desc: desc.replace(/'/g, "''").slice(0, 120) });
      }
      continue;
    }

    // Fallback: sweep line for any GP part numbers, use section as description
    GP_RE.lastIndex = 0;
    let m;
    while ((m = GP_RE.exec(raw)) !== null) {
      const itemNo = m[1];
      if (parts.has(itemNo) || SKIP_PARTS.has(itemNo)) continue;
      const desc = `Great Plains ${currentSection}`.replace(/'/g, "''").slice(0, 120);
      parts.set(itemNo, { itemNo, cat: currentCat, desc });
    }
  }
}

console.log(`Found ${parts.size} unique item numbers`);

// Category breakdown
const cats = {};
for (const p of parts.values()) cats[p.cat] = (cats[p.cat] || 0) + 1;
console.log('Category breakdown:');
Object.entries(cats).sort((a,b) => b[1]-a[1]).forEach(([c,n]) => console.log(`  ${c.padEnd(14)} ${n}`));

if (DRY_RUN) {
  console.log('\nSample parts:');
  [...parts.values()].slice(0, 30).forEach(p =>
    console.log(`  ${p.itemNo.padEnd(12)} [${p.cat.padEnd(12)}]  ${p.desc.slice(0, 60)}`)
  );
  process.exit(0);
}

// ── Step 3: Write SQL ─────────────────────────────────────────────────────────
console.log(`Writing SQL → ${SQL_PATH}`);

const out = [
  `-- Great Plains Manufacturing Parts Manual 401-069P — extracted ${new Date().toISOString().slice(0,10)}`,
  `-- ${parts.size} item numbers`,
  `-- Apply: node scripts/apply_generic_parts.js --file=${SQL_PATH}`,
  '',
];

for (const p of parts.values()) {
  const id = `GP-${p.cat}-${p.itemNo}`;
  out.push(
    `INSERT OR IGNORE INTO MasterParts ` +
    `(MasterPartID, AlternatePartNumbers, Description, Category, Tags, Manufacturer) VALUES ` +
    `('${id}', '${p.itemNo}', '${p.desc.replace(/'/g,"''")}', '${p.cat}', 'greatplains,401-069p', 'Great Plains Manufacturing');`
  );
}

fs.writeFileSync(SQL_PATH, out.join('\n') + '\n', 'utf8');
console.log(`Done — ${parts.size} parts written to ${SQL_PATH}`);
console.log(`\nNext: node scripts/apply_generic_parts.js --file=${SQL_PATH}`);
