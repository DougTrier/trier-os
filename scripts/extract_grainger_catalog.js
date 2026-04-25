// Copyright © 2026 Trier OS. All Rights Reserved.
// Extracts descriptions from the Grainger Catalog 417 and updates existing
// Grainger parts in mfg_master.db with accurate product descriptions.
//
// Grainger Catalog 417 covers motors, power transmission, electrical,
// lighting, hand/power tools, safety, fasteners, material handling,
// HVAC, hydraulics, pneumatics, hoses, pumps, and more (~3,100 pages).
//
// Grainger item number format: 1-3 leading digits + 1-5 uppercase letters +
// 1-5 trailing digits (total 4-10 chars, always ends in digits).
// Examples: 6XJ06, 5K283, 1NTK5, 812MB1824, 700KTF2659
//
// Strategy: same heading-context approach as extract_msc_bigbook.js —
// track section/sub-section headings line by line, associate every matched
// item number with the nearest heading or inline description text.
//
// Output: scripts/grainger_catalog_updates.sql
// Apply:  node scripts/apply_mcmaster_updates.js --file=scripts/grainger_catalog_updates.sql
//
// Usage:
//   node scripts/extract_grainger_catalog.js
//   node scripts/extract_grainger_catalog.js --dry-run

'use strict';

const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const PDF_PATH = 'Catalogs/Catalog 417.pdf';
const TXT_PATH = 'Catalogs/catalog417_text.tmp';
const SQL_PATH = 'scripts/grainger_catalog_updates.sql';
const DRY_RUN  = process.argv.includes('--dry-run');

// ── Step 1: Extract PDF text ──────────────────────────────────────────────────
if (!fs.existsSync(PDF_PATH)) {
  console.error(`PDF not found: ${PDF_PATH}`);
  process.exit(1);
}

if (!fs.existsSync(TXT_PATH)) {
  console.log('Extracting text from Grainger Catalog 417 (3,100+ pages — may take ~2 min)...');
  const result = spawnSync('pdftotext', ['-layout', PDF_PATH, TXT_PATH], { timeout: 600000 });
  if (result.status !== 0) {
    console.error('pdftotext failed:', result.stderr?.toString());
    process.exit(1);
  }
  console.log(`Text extracted → ${TXT_PATH}`);
} else {
  console.log(`Using cached text: ${TXT_PATH}`);
}

// ── Step 2: Parse ─────────────────────────────────────────────────────────────
console.log('Parsing item numbers and headings...');

const text  = fs.readFileSync(TXT_PATH, 'utf8');
const lines = text.split('\n');
console.log(`Lines: ${lines.length.toLocaleString()}`);

// Grainger item numbers: 1-3 digits + 1-5 uppercase letters + 1-5 digits
// Covers all formats in DB: 6XJ06, 5K283, 812MB1824, 700KTF2659, etc.
const ITEM_RE = /\b(\d{1,3}[A-Z]{1,5}\d{1,5})\b/g;

// Section heading: ALL-CAPS, 8-80 chars
const SECTION_RE = /^[A-Z][A-Z ,\-\/&\(\)\.]{7,79}$/;

// Sub-heading: mixed/title case, descriptive
const SUBHEAD_RE = /^[A-Z][a-zA-Z0-9 ,\-\/°&\(\)\.#"']{6,79}$/;

// Skip noise lines: Grainger header/footer boilerplate
const NOISE = /grainger\.com|1-800-GRAINGER|scan\.\s*order\.\s*done|sign in to|details on page|see your pricing/i;

// Column header terms — reject as sub-headings or section headings
const COL_HEADER = /\b(item\s*no|order|price|ea\.|model|brand|overall|length|width|height|weight|capacity|voltage|amps|hp|rpm|frame|type|color|finish|material|series|input|output|mounting|range|size|qty|pack|grade|pitch|diameter|stroke|bore|lock|swivel|rigid|travel|load|torque|speed|flow|pressure|current|throw|duty)\b/i;

// Dimension-only lines
const DIM_LINE = /^\s*[\d\/\s\.#]{4,}/;

// Known catalog noise prefixes to skip as item numbers
const FALSE_POS = /^(ABB|UL|NEC|NEMA|NFPA|ANSI|ASTM|OSHA|CSA)\d/;

// Manufacturer PN pattern: complex alphanumeric that looks like a mfr model number
// Used to reject left-context tokens that are manufacturer PNs, not descriptions
// Examples to reject: 048S17D2042, D16B3N4Z9, 5KH32FN3123X, VEL11304
const MFR_PN_RE = /[A-Z]\d{2,}[A-Z]|\d{5,}|[A-Z]{3,}\d{3,}|\d{3,}[A-Z]{3,}/;

const itemMap = new Map();

let section    = '';
let subSection = '';

function buildDesc() {
  if (subSection) return `${section} — ${subSection}`.slice(0, 120);
  return section.slice(0, 120);
}

let lineNum = 0;
for (const raw of lines) {
  lineNum++;
  if (lineNum % 100000 === 0) process.stdout.write(`  line ${(lineNum/1000).toFixed(0)}k / ${(lines.length/1000).toFixed(0)}k\r`);

  const line = raw.trim();
  if (!line || NOISE.test(line)) continue;

  // Section heading: ALL-CAPS, no dot-leaders, no column headers, no wide gaps
  // Also reject lines that look like comma-separated abbreviations (e.g., "C, G, R, RC")
  // or lines with repeated words (e.g., "MOUNT MOUNT")
  if (
    SECTION_RE.test(line) &&
    !COL_HEADER.test(line) &&
    !/ {3,}/.test(line) &&
    !line.includes('...') &&
    !/\b([A-Z]{1,3}),\s*([A-Z]{1,3}),/.test(line) &&   // reject "C, G, R" patterns
    !/\b(\w{4,})\s+\1\b/.test(line)                     // reject repeated words
  ) {
    section    = line;
    subSection = '';
    continue;
  }

  // Sub-heading: mixed case, readable, not dimension or column header line
  if (
    SUBHEAD_RE.test(line) &&
    !COL_HEADER.test(line) &&
    !DIM_LINE.test(line) &&
    !/ {3,}/.test(line) &&
    !line.includes('...') &&
    line.length < 80 &&
    section
  ) {
    subSection = line;
    continue;
  }

  // Fast skip: no potential item number pattern
  if (!/\d[A-Z]/.test(raw)) continue;

  ITEM_RE.lastIndex = 0;
  let m;

  while ((m = ITEM_RE.exec(raw)) !== null) {
    const itemNo = m[1];
    if (FALSE_POS.test(itemNo)) continue;

    let desc = '';

    // Priority 1: inline description to the LEFT of item number
    // Grainger tables have: specs ... description ... [mfr PN] [item no]
    // The description text is the nearest readable token before the item number,
    // but we skip tokens that look like manufacturer part numbers.
    const beforeItem = raw.slice(0, m.index).replace(/\s+$/, '');
    if (beforeItem.length > 4) {
      const tokens = beforeItem.split(/\s{2,}/).map(t => t.trim()).filter(t => t.length > 4);
      // Walk tokens right-to-left (nearest first), skip mfr PNs
      for (let i = tokens.length - 1; i >= 0; i--) {
        const leftText = tokens[i];
        const alphaCount = (leftText.match(/[A-Za-z]/g) || []).length;
        const alphaRatio = alphaCount / Math.max(leftText.length, 1);
        if (
          leftText.length >= 8 &&
          alphaRatio >= 0.4 &&
          /[A-Za-z]{3}/.test(leftText) &&
          /\s/.test(leftText) &&                             // must have at least 2 words
          !/^\d{1,3}[A-Z]{1,5}\d{1,5}$/.test(leftText) && // not another item number
          !MFR_PN_RE.test(leftText) &&                      // not a mfr PN pattern
          !/^(Price|Order|Item|Ea\.|See\s)/i.test(leftText) &&
          !/^\d/.test(leftText)                              // description starts with letter
        ) {
          desc = leftText.replace(/\s+/g, ' ').slice(0, 120);
          break;
        }
      }
    }

    // Priority 2: inline description to the RIGHT of item number
    if (!desc) {
      const afterItem = raw.slice(m.index + itemNo.length).replace(/^\s+/, '');
      const inlineRaw = afterItem.split(/\s{3,}/)[0].trim();
      const alphaCount = (inlineRaw.match(/[A-Za-z]/g) || []).length;
      const alphaRatio = alphaCount / Math.max(inlineRaw.length, 1);
      if (
        inlineRaw.length >= 10 &&
        alphaRatio >= 0.35 &&
        /[A-Za-z]{3}/.test(inlineRaw) &&
        !/^\d{1,3}[A-Z]{1,5}\d/.test(inlineRaw) &&
        !/^(Price|Order|Ea\.|See\s)/i.test(inlineRaw)
      ) {
        desc = inlineRaw.replace(/\s+/g, ' ').slice(0, 120);
      }
    }

    // Priority 3: heading context
    if (!desc) desc = buildDesc();
    if (!desc) continue;

    const existingDesc = itemMap.get(itemNo) || '';
    const isTechInfo   = /SELECTION GUIDE|TECHNICAL INFORMATION|CONTENTS|INDEX/i.test(desc);
    const prevTech     = /SELECTION GUIDE|TECHNICAL INFORMATION|CONTENTS|INDEX/i.test(existingDesc);

    // Never overwrite a good description with a technical/index context
    if (!existingDesc || !isTechInfo || prevTech) {
      itemMap.set(itemNo, desc);
    }
  }
}

console.log(`\nFound ${itemMap.size.toLocaleString()} unique item numbers in catalog`);

if (DRY_RUN) {
  let shown = 0;
  for (const [k, v] of itemMap) {
    if (shown++ >= 40) break;
    console.log(`  ${k.padEnd(12)}  →  ${v}`);
  }
  // Section breakdown
  const cats = {};
  for (const v of itemMap.values()) {
    const sec = v.split(' — ')[0].slice(0, 30);
    cats[sec] = (cats[sec] || 0) + 1;
  }
  console.log('\nTop sections:');
  Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,20).forEach(([s,n]) => console.log(`  ${n.toString().padStart(6)}  ${s}`));
  process.exit(0);
}

// ── Step 3: Write SQL UPDATE statements ───────────────────────────────────────
console.log(`Writing SQL → ${SQL_PATH}`);

const out = [
  `-- Grainger Catalog 417 — description extraction — ${new Date().toISOString().slice(0,10)}`,
  `-- ${itemMap.size.toLocaleString()} item numbers found in catalog`,
  `-- Apply: node scripts/apply_mcmaster_updates.js --file=${SQL_PATH}`,
  '',
];

for (const [itemNo, desc] of itemMap) {
  const safeDesc = desc.replace(/'/g, "''");
  out.push(
    `UPDATE MasterParts SET Description = '${safeDesc}' ` +
    `WHERE AlternatePartNumbers = '${itemNo}';`
  );
}

fs.writeFileSync(SQL_PATH, out.join('\n') + '\n', 'utf8');
console.log(`Done — ${itemMap.size.toLocaleString()} UPDATE statements written`);
console.log(`\nNext: node scripts/apply_mcmaster_updates.js --file=${SQL_PATH}`);
