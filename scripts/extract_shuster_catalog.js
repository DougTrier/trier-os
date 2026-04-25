// Copyright © 2026 Trier OS. All Rights Reserved.
// Extracts Shuster bearing part numbers from the Shuster bearings catalog.
//
// Part number format: 8-digit codes (e.g., 05606496)
// Table format: {series_name}   {open_PN}   {2RS_PN}   {ZZ_PN}   dimensions
// Example: "6000 JEM     05606496                        05606545   ..."
//
// Output: scripts/shuster_updates.sql
// Apply:  node scripts/bulk_apply_updates.js --file=scripts/shuster_updates.sql
//
// Usage:
//   node scripts/extract_shuster_catalog.js
//   node scripts/extract_shuster_catalog.js --dry-run

'use strict';

const fs = require('fs');

const TXT_PATH = 'Catalogs/shuster_bearings_text.tmp';
const SQL_PATH = 'scripts/shuster_updates.sql';
const DRY_RUN  = process.argv.includes('--dry-run');

if (!fs.existsSync(TXT_PATH)) {
  console.error(`Not found: ${TXT_PATH}`); process.exit(1);
}

const lines = fs.readFileSync(TXT_PATH, 'utf8').split('\n');
console.log(`Lines: ${lines.length.toLocaleString()}`);

// 8-digit Shuster part numbers
const PN_RE = /\b(\d{8})\b/g;

// Series heading: ALL-CAPS section (e.g., "RADIAL BALL BEARINGS | INCH DIMENSION")
// or mixed-case series name (e.g., "6000 JEM Series - Deep Groove Ball Bearings")
const SERIES_HEADING_RE = /^([A-Z][A-Z& |\-\/]{5,79})$/;
const SERIES_NAME_RE    = /^(\d{4}(?:\s+[A-Z0-9]+)*\s+(?:JEM|Series|series))/;

// Column type map: track which position corresponds to which seal type
// Header line: "Part #  ex. 60** JEM  ex. 60** 2RS JEM  ex. 60** ZZ JEM"
// Position 0 = open, position 1 = 2RS, position 2 = ZZ
const SEAL_TYPES = ['Open', '2RS Double-Sealed', 'ZZ Double-Shielded'];

const itemMap = new Map();
let section    = '';
let seriesName = '';

for (const raw of lines) {
  const line = raw.trim();
  if (!line) continue;

  // Section heading (ALL-CAPS product family)
  if (SERIES_HEADING_RE.test(line) && !/ {3,}/.test(raw)) {
    if (!/^(BEARINGS|Part\s+#|Ident|Weight|No\.|ex\.)/.test(line) && !/\d{8}/.test(line)) {
      section = line;
      seriesName = '';
    }
    continue;
  }

  // Series sub-heading: "6000 JEM Series - Electric Motor Quality"
  if (/^\d{3,4}/.test(line) && /JEM|Series/i.test(line) && !/\d{8}/.test(line)) {
    seriesName = line.replace(/\s*-\s*.+$/, '').trim(); // keep just the series designation
    continue;
  }

  // Skip if no 8-digit number on this line
  if (!/\d{8}/.test(raw)) continue;

  // Extract the line series from the start of the line (e.g., "6000 JEM" in "6000 JEM  05606496  ...")
  const lineSeriesMatch = raw.match(/^\s*(\d{3,4}\s+(?:JEM|[A-Z]\w+))\s/);
  const lineSeries = lineSeriesMatch ? lineSeriesMatch[1].trim() : (seriesName || '');

  // Extract all 8-digit part numbers from the line, track column position
  const cols = raw.split(/\s{2,}/);
  let colIdx = 0;
  for (const col of cols) {
    const numMatch = col.trim().match(/^(\d{8})$/);
    if (numMatch) {
      const partNo = numMatch[1];
      const sealType = SEAL_TYPES[colIdx] || '';
      const sname = lineSeries || seriesName || section;
      if (!sname) { colIdx++; continue; }

      const baseDesc = `${sname} Deep Groove Ball Bearing`;
      const desc = (sealType ? `${baseDesc} ${sealType}` : baseDesc).slice(0, 120);

      if (!itemMap.has(partNo)) {
        itemMap.set(partNo, desc);
      }
      colIdx++;
    } else if (col.trim()) {
      colIdx = 0; // reset on non-number columns
    }
  }

  // Fallback: also sweep with simple regex for any missed part numbers
  PN_RE.lastIndex = 0;
  let m;
  while ((m = PN_RE.exec(raw)) !== null) {
    const partNo = m[1];
    if (itemMap.has(partNo)) continue;
    const sname = lineSeries || seriesName || section;
    if (!sname) continue;
    const desc = `${sname} Deep Groove Ball Bearing`.slice(0, 120);
    itemMap.set(partNo, desc);
  }
}

console.log(`Found ${itemMap.size.toLocaleString()} unique part numbers`);

if (DRY_RUN) {
  let n = 0;
  for (const [k, v] of itemMap) {
    if (n++ >= 20) break;
    console.log(`  ${k.padEnd(12)}  →  ${v}`);
  }
  process.exit(0);
}

const out = [
  `-- Shuster Bearings Catalog — extracted ${new Date().toISOString().slice(0,10)}`,
  `-- ${itemMap.size.toLocaleString()} part numbers`,
  `-- Apply: node scripts/bulk_apply_updates.js --file=${SQL_PATH}`,
  '',
];

for (const [partNo, desc] of itemMap) {
  out.push(
    `UPDATE MasterParts SET Description = '${desc.replace(/'/g,"''")}' WHERE AlternatePartNumbers = '${partNo}';`
  );
}

fs.writeFileSync(SQL_PATH, out.join('\n') + '\n', 'utf8');
console.log(`Done — ${itemMap.size.toLocaleString()} UPDATE statements → ${SQL_PATH}`);
