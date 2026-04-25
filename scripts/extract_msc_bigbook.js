// Copyright © 2026 Trier OS. All Rights Reserved.
// Extracts descriptions from the MSC Big Book V24 catalog PDF and updates
// existing MSC parts in mfg_master.db with accurate product descriptions.
//
// The MSC Big Book has a consistent layout:
//   - SECTION HEADING (ALL-CAPS, e.g. "JOBBER LENGTH DRILL BITS")
//   - Sub-heading (mixed case, e.g. "HSS Oxide Coated 118° Jobber Drills")
//   - Product rows: size specs followed by 8-digit Order# columns
//
// Strategy: scan line-by-line, track the nearest heading context,
// map every 8-digit item number found to that heading, then UPDATE DB.
//
// Output: scripts/msc_bigbook_updates.sql
//
// Usage:
//   node scripts/extract_msc_bigbook.js
//   node scripts/extract_msc_bigbook.js --dry-run

'use strict';

const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const PDF_PATH = 'Catalogs/BigBookV24.pdf';
const TXT_PATH = 'Catalogs/msc_bigbook_text.tmp';
const SQL_PATH = 'scripts/msc_bigbook_updates.sql';
const DRY_RUN  = process.argv.includes('--dry-run');

// ── Step 1: Extract PDF text ──────────────────────────────────────────────────
if (!fs.existsSync(PDF_PATH)) {
  console.error(`PDF not found: ${PDF_PATH}`);
  process.exit(1);
}

if (!fs.existsSync(TXT_PATH)) {
  console.log('Extracting text from MSC Big Book (4,600+ pages — may take ~2 min)...');
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

// 8-digit MSC order numbers
const ITEM_RE = /\b(\d{8})\b/g;

// Section heading: ALL-CAPS, 8–80 chars, no digits (excludes column headers like "Order # Price Ea.")
const SECTION_RE = /^[A-Z][A-Z ,\-\/&\(\)\.]{7,79}$/;

// Sub-heading: mixed or title case, allows digits (e.g. "118° Jobber Drills", "1/4-20 Taps")
// Must start uppercase and have mostly alphabetic content
const SUBHEAD_RE = /^[A-Z][a-zA-Z0-9 ,\-\/°&\(\)\.#"']{6,79}$/;

// Skip noise lines
const NOISE = /mscdirect\.com|msc\s+today|continued\s+from|continued\s+on|call\s+msc|order\s+#\s+price|price\s+ea\.|^\s*\d+\s*$|^page\s+\d/i;

// Column header fragments to reject as headings
const COL_HEADER = /\b(order|price|ea\.|flute|length|overall|decimal|equiv|fractional|wire|letter|drill|tap|thread|pitch|OAL)\b/i;

// Dimension-only lines (size specs, no heading value)
const DIM_LINE = /^\s*[\d\/\s\.#]{4,}/;

const itemMap = new Map(); // itemNo → description

let section    = '';
let subSection = '';
let lastGoodDesc = '';

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

  // Detect section heading (ALL-CAPS, clean)
  if (SECTION_RE.test(line) && !COL_HEADER.test(line) && !/ {3,}/.test(line) && !line.includes('...')) {
    section    = line;
    subSection = '';
    continue;
  }

  // Detect sub-heading (mixed case, readable, not a dimension or column header)
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

  // Extract all 8-digit item numbers on this line
  if (!/\d{8}/.test(raw)) continue;  // fast skip
  ITEM_RE.lastIndex = 0;
  let m;

  while ((m = ITEM_RE.exec(raw)) !== null) {
    const itemNo = m[1];

    // Priority 1: inline description AFTER the item number on the same line
    const afterItem = raw.slice(m.index + 8).replace(/^\s+/, '');
    const inlineRaw = afterItem.split(/\s{3,}/)[0].trim();
    const alphaCount = (inlineRaw.match(/[A-Za-z]/g) || []).length;
    const alphaRatio = alphaCount / Math.max(inlineRaw.length, 1);
    let desc = '';
    if (inlineRaw.length >= 12 && alphaRatio >= 0.35 && /[A-Za-z]{3}/.test(inlineRaw)
        && !/^\d{8}/.test(inlineRaw)                  // not another item number
        && !/^(Price|Order|Ea\.|cont|See\s)/i.test(inlineRaw)) {
      desc = inlineRaw.replace(/\s+/g, ' ').slice(0, 120);
    }

    // Priority 2: left-context (description before item number, e.g. "2 Flute Single End   93031268")
    if (!desc) {
      const beforeItem = raw.slice(0, m.index).replace(/\s+$/, '');
      const leftTokens = beforeItem.split(/\s{2,}/).map(t => t.trim()).filter(t => t.length > 3);
      if (leftTokens.length > 0) {
        const leftText = leftTokens[leftTokens.length - 1];  // nearest preceding column
        const leftAlpha = (leftText.match(/[A-Za-z]/g)||[]).length / Math.max(leftText.length, 1);
        if (leftText.length >= 8 && leftAlpha >= 0.4 && /[A-Za-z]{3}/.test(leftText)
            && !/^\d{8}/.test(leftText)) {
          desc = leftText.replace(/\s+/g, ' ').slice(0, 120);
        }
      }
    }

    // Priority 3: heading context
    if (!desc) desc = buildDesc();
    if (!desc) continue;

    const existingDesc = itemMap.get(itemNo) || '';
    const isTechInfo  = desc.includes('TECHNICAL INFORMATION') || desc.includes('SELECTION GUIDE');
    const prevTech    = existingDesc.includes('TECHNICAL INFORMATION') || existingDesc.includes('SELECTION GUIDE');

    // Never downgrade from a good description to a tech-info heading
    if (!existingDesc || !isTechInfo || prevTech) {
      itemMap.set(itemNo, desc);
    }
  }
}

console.log(`\nFound ${itemMap.size.toLocaleString()} unique item numbers in catalog`);

if (DRY_RUN) {
  // Show sample
  let shown = 0;
  for (const [k, v] of itemMap) {
    if (shown++ >= 40) break;
    console.log(`  ${k}  →  ${v}`);
  }
  // Category breakdown
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
  `-- MSC Big Book V24 — description extraction — ${new Date().toISOString().slice(0,10)}`,
  `-- ${itemMap.size.toLocaleString()} item numbers found in catalog`,
  `-- Apply: node scripts/apply_mcmaster_updates.js --dir=scripts --file=${SQL_PATH}`,
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
