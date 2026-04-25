// Copyright © 2026 Trier OS. All Rights Reserved.
// Extracts F/S Manufacturing part numbers from 2026 catalog.
//
// F/S makes agricultural spraying equipment, hoses, fittings, pumps, and boom
// components. Consistent Part# Description layout throughout the catalog.
//
// Part number formats (all start with uppercase letter):
//   EVA38B, BEVA12, SFHP6, PVCS100B  — hose product codes
//   M220CPG90, M300BRB, M100FPT      — manifold fittings (M-prefix)
//   EPDMSH38, SGH12, 390SD112        — specialty hoses
//   SP-3350-G13HFLG, CS-150-HA12     — pump model numbers
//   FSDAK-60, FSDAK-100-EC-TJ3       — UTV/ATV sprayer models
//   CN12SS, HB14SS, SE34SS           — stainless fittings
// Output: scripts/fs_mfg_parts.sql
//
// Usage:
//   node scripts/extract_fs_mfg.js
//   node scripts/extract_fs_mfg.js --dry-run

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');

const PDF_PATH = 'Catalogs/2026-FS-Manufacturing-Catalog-new-4-14-26.pdf';
const TXT_PATH = 'Catalogs/fs_mfg_text.tmp';
const SQL_PATH = 'scripts/fs_mfg_parts.sql';
const DRY_RUN  = process.argv.includes('--dry-run');

// Entry regex: PartNo (1+ spaces) Description
// Two forms: starts with letter OR starts with digit+letter combo (e.g. 390SD114, 300S100)
// Description stops before 3+ spaces (next column) or end of line
const ENTRY_RE = /([A-Z][A-Z0-9\-\/\.]{2,}|[0-9][A-Z0-9]{1,}[A-Z][A-Z0-9\-\/\.]*)\s+([A-Za-z0-9"][^\n]{4,100}?)(?=\s{3,}|$)/g;

// Known non-part prefixes: spec values, unit abbreviations, generic labels
const SKIP_PREFIXES = /^(PSI|GPM|GPH|RPM|HP|GX|BX|TJ|EC|RFQ|GPS|UTV|ATV|SDS|NTP|PTO|OEM|USD|EXT|INC|MAX|MIN|STD|OPT)/;

function isValidPartNo(s) {
  if (s.length < 4)              return false;
  if (s.endsWith('-'))           return false;  // line-break fragment
  if (!/\d/.test(s))             return false;  // must contain a digit
  if (SKIP_PREFIXES.test(s))     return false;  // spec value or generic label
  if (s.includes('.') && /\d\.\d/.test(s)) return false;  // decimal spec like PSI-22.5
  return true;
}

function isValidDesc(s) {
  // Description must have some letter content, not just numbers/slashes
  return /[A-Za-z]{3,}/.test(s);
}

// Section → category
const SECTION_CAT = [
  { key: 'ELECTRON',  cat: 'ELECTRICAL' },
  { key: 'GPS',       cat: 'ELECTRICAL' },
  { key: 'PUMP',      cat: 'MECHANICAL' },
  { key: 'HOSE',      cat: 'MECHANICAL' },
  { key: 'TUBING',    cat: 'MECHANICAL' },
  { key: 'FITTING',   cat: 'MECHANICAL' },
  { key: 'FLANGE',    cat: 'MECHANICAL' },
  { key: 'MANIFOLD',  cat: 'MECHANICAL' },
  { key: 'VALVE',     cat: 'MECHANICAL' },
  { key: 'SPRAYER',   cat: 'MECHANICAL' },
  { key: 'BOOM',      cat: 'MECHANICAL' },
  { key: 'TANK',      cat: 'MECHANICAL' },
  { key: 'NOZZLE',    cat: 'MECHANICAL' },
  { key: 'FILTER',    cat: 'FILTRATION' },
];

function mapCategory(section) {
  const up = section.toUpperCase();
  for (const { key, cat } of SECTION_CAT) {
    if (up.includes(key)) return cat;
  }
  return 'MECHANICAL';
}

const NOISE = /www\.fsmfg|fsmfg\.com|f\/s manufacturing|800-333|business hours|monday|thank you|loyalty|limited space|cordially|due to/i;

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

let currentSection = 'F/S Manufacturing Agricultural Equipment';
let currentCat     = 'MECHANICAL';

// Section headings: ALL-CAPS, short, no wide gaps
const HEADING_RE = /^[A-Z][A-Z0-9 \-\/&\(\)\.]{3,60}$/;

for (const page of pages) {
  const lines = page.split('\n');

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || NOISE.test(line)) continue;

    // Track section heading
    if (HEADING_RE.test(line) && !/ {3,}/.test(line) && line.length < 60) {
      const up = line.toUpperCase();
      if (!up.includes('PART') && !up.includes('DESCR') && !up.includes('SPEC') && !up.includes('AVAIL')) {
        currentSection = line;
        currentCat = mapCategory(line);
      }
    }

    // Scan entire line for Part# Description entries (handles 2-column layout)
    ENTRY_RE.lastIndex = 0;
    let m;
    while ((m = ENTRY_RE.exec(raw)) !== null) {
      const itemNo = m[1];
      const rawDesc = m[2].trim().replace(/\s+/g, ' ');

      if (!isValidPartNo(itemNo)) continue;
      if (!isValidDesc(rawDesc) && !parts.has(itemNo)) {
        // No good description — use section name
        const desc = `F/S ${currentSection}`.replace(/'/g, "''").slice(0, 120);
        parts.set(itemNo, { itemNo, cat: currentCat, desc });
        continue;
      }
      if (parts.has(itemNo)) continue;

      const desc = rawDesc.replace(/'/g, "''").slice(0, 120);
      parts.set(itemNo, { itemNo, cat: currentCat, desc });
    }
  }
}

console.log(`Found ${parts.size} unique item numbers`);

// Category breakdown
const cats = {};
for (const p of parts.values()) cats[p.cat] = (cats[p.cat] || 0) + 1;
console.log('By category:');
Object.entries(cats).sort((a,b) => b[1]-a[1]).forEach(([c,n]) => console.log(`  ${c.padEnd(14)} ${n}`));

if (DRY_RUN) {
  console.log('\nSample parts:');
  [...parts.values()].slice(0, 30).forEach(p =>
    console.log(`  ${p.itemNo.padEnd(24)} [${p.cat.padEnd(12)}]  ${p.desc.slice(0, 60)}`)
  );
  process.exit(0);
}

// ── Step 3: Write SQL ─────────────────────────────────────────────────────────
console.log(`Writing SQL → ${SQL_PATH}`);

const out = [
  `-- F/S Manufacturing 2026 Catalog — extracted ${new Date().toISOString().slice(0,10)}`,
  `-- ${parts.size} item numbers (hoses, fittings, pumps, sprayers, boom components)`,
  `-- Apply: node scripts/apply_generic_parts.js --file=${SQL_PATH}`,
  '',
];

for (const p of parts.values()) {
  const id = `FSM-${p.cat}-${p.itemNo}`;
  out.push(
    `INSERT OR IGNORE INTO MasterParts ` +
    `(MasterPartID, AlternatePartNumbers, Description, Category, Tags, Manufacturer) VALUES ` +
    `('${id}', '${p.itemNo}', '${p.desc.replace(/'/g,"''")}', '${p.cat}', 'fsmfg,2026', 'F/S Manufacturing');`
  );
}

fs.writeFileSync(SQL_PATH, out.join('\n') + '\n', 'utf8');
console.log(`Done — ${parts.size} parts written to ${SQL_PATH}`);
console.log(`\nNext: node scripts/apply_generic_parts.js --file=${SQL_PATH}`);
