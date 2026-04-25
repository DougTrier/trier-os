// Copyright © 2026 Trier OS. All Rights Reserved.
// Extracts Brady LOTO (Lockout/Tagout) part numbers and descriptions from
// the Brady LOTO catalog (brady_loto_text.tmp).
//
// Brady catalog # format: 5-6 digit numbers (e.g., 65672, 150556, 153674)
// Table format: "{catalog_no}  {description}  {size/qty specs}"
//
// Output: scripts/brady_updates.sql
// Apply:  node scripts/bulk_apply_updates.js --file=scripts/brady_updates.sql
//
// Usage:
//   node scripts/extract_brady_catalog.js
//   node scripts/extract_brady_catalog.js --dry-run

'use strict';

const fs = require('fs');

const TXT_PATH = 'Catalogs/brady_loto_text.tmp';
const SQL_PATH = 'scripts/brady_updates.sql';
const DRY_RUN  = process.argv.includes('--dry-run');

if (!fs.existsSync(TXT_PATH)) {
  console.error(`Not found: ${TXT_PATH}`); process.exit(1);
}

const lines = fs.readFileSync(TXT_PATH, 'utf8').split('\n');
console.log(`Lines: ${lines.length.toLocaleString()}`);

// Brady 5-6 digit catalog numbers
const BRADY_PN_RE = /\b(\d{5,6})\b/g;

// Pair pattern: {catalog_no}  {description} — catalog number followed by 2+ spaces then text
const PAIR_RE = /\b(\d{5,6})\s{2,}([A-Za-z][^\d\n]{4,80}?)(?:\s{3,}|$)/g;

// Product headings: specific Brady product family names
// Must end with a product noun (not sentence fragments)
const HEADING_KEYWORDS = [
  'Lockout Stations', 'Lockout Station', 'Group Lock Boxes', 'Group Lock Box',
  'Lock Boxes', 'Lock Box', 'Lockout Boxes', 'Lockout Box',
  'Safety Hasps', 'Safety Hasp', 'Padlocks', 'Padlock',
  'Safety Padlocks', 'Cable Lockouts', 'Cable Lockout',
  'Valve Lockouts', 'Valve Lockout', 'Circuit Breaker Lockouts',
  'Plug Lockouts', 'Plug Lockout', 'Electrical Lockouts', 'Electrical Lockout',
  'Switch Lockouts', 'Switch Lockout', 'Lockout Kits', 'Lockout Kit',
  'Lockout Tags', 'Lockout Tag', 'Safety Labels', 'Safety Label',
  'Permit Display Stations', 'Permit Display Station', 'Permit Display Cases',
  'Permit Display Case', 'Ultra Compact Group Lock Box', 'Portable Metal Group Lockout',
];

const itemMap = new Map();
let section = '';

for (const raw of lines) {
  const line = raw.trim();
  if (!line) continue;

  // Detect section headings: look for heading keywords in the line
  // Require the line ends with or starts with the keyword (not mid-sentence)
  for (const kw of HEADING_KEYWORDS) {
    if (!line.includes(kw)) continue;
    if (/\d{5,6}/.test(line)) continue;  // skip lines with part numbers
    const kwIdx = line.indexOf(kw);
    const heading = kw.trim();
    // Only update if keyword appears in a heading-like position (start or end of significant content)
    const before = line.slice(0, kwIdx).trim();
    const after  = line.slice(kwIdx + kw.length).trim();
    if (before.length < 30 || after.length < 5) {  // keyword near start, or at end
      section = `Brady ${heading}`;
      break;
    }
  }

  // Skip lines without 5-6 digit numbers
  if (!/\d{5,6}/.test(raw)) continue;

  // Extract {catalog_no}  {description} pairs
  PAIR_RE.lastIndex = 0;
  let m;
  while ((m = PAIR_RE.exec(raw)) !== null) {
    const partNo  = m[1];
    const rawDesc = m[2].replace(/\s+/g, ' ').trim();

    // Skip if description looks like just specs/dimensions
    if (/^[\d\s\.\-\/]+$/.test(rawDesc)) continue;
    if (/^(Red|Blue|Yellow|Green|Black|White|Orange)$/i.test(rawDesc)) continue;
    if (rawDesc.length < 4) continue;

    // Determine full description
    let desc;
    // If description is a size/language variant only, prepend section context
    const isSizeVariant = /^(Small|Medium|Large|Standard|Compact|Mini)\b/i.test(rawDesc) ||
                          /^(English|Spanish|French|Multilingual)\b/i.test(rawDesc);
    if (isSizeVariant && section) {
      desc = `${section} — ${rawDesc}`.slice(0, 120);
    } else if (section) {
      desc = `${section} — ${rawDesc}`.slice(0, 120);
    } else {
      desc = `Brady LOTO — ${rawDesc}`.slice(0, 120);
    }

    if (!itemMap.has(partNo)) {
      itemMap.set(partNo, desc);
    }
  }

  // Fallback: also capture {catalog_no}  at line end with context from section heading
  BRADY_PN_RE.lastIndex = 0;
  let mn;
  while ((mn = BRADY_PN_RE.exec(raw)) !== null) {
    const partNo = mn[1];
    if (itemMap.has(partNo)) continue;
    if (!section) continue;
    // Check if the part number appears at the end of a mostly-blank line (no desc)
    const after = raw.slice(mn.index + partNo.length).trim();
    if (!after || /^[\d\s\.]+$/.test(after.split(/\s{2,}/)[0])) {
      itemMap.set(partNo, section);
    }
  }
}

console.log(`Found ${itemMap.size.toLocaleString()} unique Brady part numbers`);

if (DRY_RUN) {
  let n = 0;
  for (const [k, v] of itemMap) {
    if (n++ >= 20) break;
    console.log(`  ${k.padEnd(10)}  →  ${v}`);
  }
  process.exit(0);
}

const out = [
  `-- Brady LOTO Catalog — extracted ${new Date().toISOString().slice(0,10)}`,
  `-- ${itemMap.size.toLocaleString()} part numbers`,
  `-- Apply: node scripts/bulk_apply_updates.js --file=${SQL_PATH}`,
  '',
];

for (const [partNo, desc] of itemMap) {
  // Only update if existing description is short or corrupt
  out.push(
    `UPDATE MasterParts SET Description = '${desc.replace(/'/g,"''")}' WHERE AlternatePartNumbers = '${partNo}' AND length(Description) < 25;`
  );
}

fs.writeFileSync(SQL_PATH, out.join('\n') + '\n', 'utf8');
console.log(`Done — ${itemMap.size.toLocaleString()} UPDATE statements → ${SQL_PATH}`);
