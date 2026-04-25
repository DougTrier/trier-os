// Copyright © 2026 Trier OS. All Rights Reserved.
// Extracts Carr Lane Manufacturing tooling component part numbers and
// descriptions from Catalog LXIV (carr_lane_text.tmp).
//
// Part number format: CL-{num}-{type}[-{suffix}] or CLM-{num}-{type}[-{suffix}]
// Examples: CL-1-LCP-B, CLM-8-LCP-B, CL-4-BLP, CL-82-KA-12
//
// Description format in catalog: "{SECTION HEADING} — {MATERIAL SPEC}"
// e.g., "LOCKING CLAMPING PINS — PIN: 1215 STEEL, CASE HARDENED, BLACK OXIDE FINISH"
//
// Output: scripts/carr_lane_updates.sql
// Apply:  node scripts/bulk_apply_updates.js --file=scripts/carr_lane_updates.sql
//
// Usage:
//   node scripts/extract_carr_lane_catalog.js
//   node scripts/extract_carr_lane_catalog.js --dry-run

'use strict';

const fs = require('fs');

const TXT_PATH = 'Catalogs/carr_lane_text.tmp';
const SQL_PATH = 'scripts/carr_lane_updates.sql';
const DRY_RUN  = process.argv.includes('--dry-run');

if (!fs.existsSync(TXT_PATH)) {
  console.error(`Not found: ${TXT_PATH}`); process.exit(1);
}

const lines = fs.readFileSync(TXT_PATH, 'utf8').split('\n');
console.log(`Lines: ${lines.length.toLocaleString()}`);

// Carr Lane part number: CL or CLM prefix + number + letters + optional suffix
const CL_RE = /\b(CL[M]?-[A-Z0-9]+-[A-Z0-9]+(?:-[A-Z0-9]+)*)\b/g;

// ALL-CAPS section heading: at least 4 chars, no leading whitespace noise
const HEADING_RE = /^[A-Z][A-Z ,\-\/&\(\)]{3,69}$/;

// Material spec lines: "PIN: MATERIAL, ..." or "BUSHING: ..." etc.
const MATERIAL_RE = /^((?:PIN|BUSHING|BODY|HANDLE|SCREW|RETAINER|SPRING|BALL|NUT|RING|WASHER|PLUNGER)\s*:\s*[A-Z0-9 ,\-\/\.]+)$/;

// Noise to skip
const NOISE = /carrlane\.com|carr lane|www\.|iso 9001|catalog|sectio/i;

const itemMap = new Map();
let section  = '';
let material = '';

for (const raw of lines) {
  const line = raw.trim();
  if (!line || NOISE.test(line)) continue;

  // Section heading detection
  if (HEADING_RE.test(line) && !/ {3,}/.test(raw) && line.length < 70) {
    // Reject page-number lines and table headers (contain digits or are too short)
    if (!/^\d/.test(line) && !/(PART\s+NO|NOMINAL|THREAD|WIDTH|HEIGHT|LENGTH|INCH|METRIC)\b/i.test(line)) {
      section  = line;
      material = '';
    }
    continue;
  }

  // Material spec line (appears right after section heading in Carr Lane catalog)
  const matMatch = line.match(MATERIAL_RE);
  if (matMatch && section) {
    if (!material) material = matMatch[1].replace(/\s+/g, ' ').trim();
    continue;
  }

  // Extract part numbers from this line
  if (!/\bCL/.test(raw)) continue;

  CL_RE.lastIndex = 0;
  let m;
  while ((m = CL_RE.exec(raw)) !== null) {
    const partNo = m[1];
    if (partNo.length < 5) continue;
    if (itemMap.has(partNo)) continue;

    let desc;
    if (section && material) {
      desc = `${section} — ${material}`.slice(0, 120);
    } else if (section) {
      desc = section.slice(0, 120);
    } else {
      continue; // no context yet
    }
    itemMap.set(partNo, desc);
  }
}

console.log(`Found ${itemMap.size.toLocaleString()} unique part numbers`);

if (DRY_RUN) {
  let n = 0;
  for (const [k, v] of itemMap) {
    if (n++ >= 25) break;
    console.log(`  ${k.padEnd(20)}  →  ${v}`);
  }
  process.exit(0);
}

const out = [
  `-- Carr Lane Catalog LXIV — extracted ${new Date().toISOString().slice(0,10)}`,
  `-- ${itemMap.size.toLocaleString()} part numbers`,
  `-- Apply: node scripts/bulk_apply_updates.js --file=${SQL_PATH}`,
  '',
];

for (const [partNo, desc] of itemMap) {
  // Only update if the existing description is clearly bad (< 20 chars means a column header or stub)
  out.push(
    `UPDATE MasterParts SET Description = '${desc.replace(/'/g,"''")}' WHERE AlternatePartNumbers = '${partNo.replace(/'/g,"''")}' AND length(Description) < 20;`
  );
}

fs.writeFileSync(SQL_PATH, out.join('\n') + '\n', 'utf8');
console.log(`Done — ${itemMap.size.toLocaleString()} UPDATE statements written → ${SQL_PATH}`);
console.log(`\nNext: node scripts/bulk_apply_updates.js --file=${SQL_PATH}`);
