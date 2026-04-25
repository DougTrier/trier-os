// Copyright © 2026 Trier OS. All Rights Reserved.
// Extracts Gates Industrial Power Transmission part numbers and descriptions
// from the Gates Master Products Catalog (gates_pt_text.tmp).
//
// Part number format: {4-digit}-{4-digit} internal product codes (e.g., 9274-2300)
// mapped to their belt designation (e.g., 8MGT-2400-36) via catalog tables.
//
// Table structure:
//   {designation}   {product_no}   {teeth}  {pitch_length}  {weight}   [second column]
// Two-column layout — both columns extracted from each line.
//
// Output: scripts/gates_catalog_updates.sql
// Apply:  node scripts/bulk_apply_updates.js --file=scripts/gates_catalog_updates.sql
//
// Usage:
//   node scripts/extract_gates_catalog.js
//   node scripts/extract_gates_catalog.js --dry-run

'use strict';

const fs   = require('fs');
const path = require('path');

const TXT_PATH = 'Catalogs/gates_pt_text.tmp';
const SQL_PATH = 'scripts/gates_catalog_updates.sql';
const DRY_RUN  = process.argv.includes('--dry-run');

if (!fs.existsSync(TXT_PATH)) {
  console.error(`Temp file not found: ${TXT_PATH}`);
  process.exit(1);
}

const text  = fs.readFileSync(TXT_PATH, 'utf8');
const lines = text.split('\n');
console.log(`Lines: ${lines.length.toLocaleString()}`);

// Internal product number: 4 digits dash 4 digits
const PROD_NO_RE = /\b(\d{4}-\d{4})\b/g;

// Belt designation immediately before a product number on the same line
// Format: DESIGNATION  PROD_NO  (designation = alphanumeric + hyphens, 4-25 chars)
// Handles: 8MGT-640-12, T5-150-4, 5VX1000, A68, 14ADV-1190-37, TP-1120-8MGT-20
const PAIR_RE = /\b([A-Z][A-Z0-9\-\/]{3,24})\s{2,}(\d{4}-\d{4})\b/g;

// Product family heading: mixed-case lines containing key Gates product names
// Appears above "Product No. Series" blocks in catalog
const FAMILY_KEYWORDS = [
  { re: /poly chain.*adv/i,             family: 'Poly Chain ADV Synchronous Belt' },
  { re: /poly chain.*volt/i,            family: 'Poly Chain GT Carbon Volt Synchronous Belt' },
  { re: /poly chain.*carbon.*extended/i,family: 'Poly Chain GT Carbon Extended Length Synchronous Belt' },
  { re: /poly chain.*gt.*carbon/i,      family: 'Poly Chain GT Carbon Synchronous Belt' },
  { re: /poly chain.*gt2/i,             family: 'Poly Chain GT2 Synchronous Belt' },
  { re: /poly chain.*curve saw/i,       family: 'Curve Saw Poly Chain GT2 Synchronous Belt' },
  { re: /powergript?.*gt4/i,            family: 'PowerGrip GT4 Synchronous Belt' },
  { re: /powergript?.*gt3/i,            family: 'PowerGrip GT3 Synchronous Belt' },
  { re: /powergript?.*htd/i,            family: 'PowerGrip HTD Synchronous Belt' },
  { re: /powergript?.*timing/i,         family: 'PowerGrip Timing Belt' },
  { re: /cotton cleaner/i,              family: 'Cotton Cleaner Synchronous Belt' },
  { re: /powergript?.*twin power/i,     family: 'PowerGrip Twin Power Synchronous Belt' },
  { re: /long.length/i,                 family: 'Long-Length Synchronous Belt' },
  { re: /synchro.power/i,               family: 'Synchro-Power Synchronous Belt' },
  { re: /predator/i,                    family: 'Predator V-Belt' },
  { re: /super hct?.*xp.*powerband/i,   family: 'Super HC XP PowerBand V-Belt' },
  { re: /super hct?.*xp/i,              family: 'Super HC XP V-Belt' },
  { re: /super hct?.*molded.*powerband/i,family: 'Super HC Molded Notch PowerBand V-Belt' },
  { re: /super hct?.*molded/i,          family: 'Super HC Molded Notch V-Belt' },
  { re: /super hct?.*powerband/i,       family: 'Super HC PowerBand V-Belt' },
  { re: /super hct?\b/i,                family: 'Super HC V-Belt' },
  { re: /tri.powert?.*powerband/i,      family: 'Tri-Power PowerBand V-Belt' },
  { re: /tri.powert?\b/i,               family: 'Tri-Power V-Belt' },
  { re: /hi.powert?.*ii.*powerband/i,   family: 'Hi-Power II PowerBand V-Belt' },
  { re: /hi.powert?.*ii/i,              family: 'Hi-Power II V-Belt' },
  { re: /hi.powert?.*dubl.v.*feather/i, family: 'Hi-Power Dubl-V Feather Picker V-Belt' },
  { re: /hi.powert?.*dubl.v/i,          family: 'Hi-Power Dubl-V V-Belt' },
  { re: /metric.powert?\b/i,            family: 'Metric-Power V-Belt' },
  { re: /xtreme v.force/i,              family: 'Xtreme V-Force Pro V-Belt' },
  { re: /truflext?\b/i,                 family: 'Tru-Flex Light Duty V-Belt' },
  { re: /powerated/i,                   family: 'Powerrated V-Belt' },
  { re: /multi.speed/i,                 family: 'Multi-Speed V-Belt' },
  { re: /polyflext?.*jbt?\b/i,          family: 'PolyFlex JB V-Belt' },
  { re: /polyflext?\b/i,                family: 'PolyFlex V-Belt' },
  { re: /micro.vt?\b/i,                 family: 'Micro-V Belt' },
  { re: /power round.*endless/i,        family: 'Power Round Endless Belt' },
  { re: /power round/i,                 family: 'Power Round Belt' },
  { re: /nu.t.link/i,                   family: 'Nu-T-Link V-Belt' },
  { re: /easy.splice/i,                 family: 'Easy-Splice V-Belt' },
  { re: /heavy duty v.belt/i,           family: 'Heavy Duty V-Belt' },
  { re: /light duty v.belt/i,           family: 'Light Duty V-Belt' },
  // Synchronous metal
  { re: /poly chain.*sprocket/i,        family: 'Poly Chain GT Sprocket' },
  { re: /powergript?.*sprocket.*pulley/i,family: 'PowerGrip Sprocket/Pulley' },
  { re: /powergript?.*sprocket/i,       family: 'PowerGrip Sprocket' },
  { re: /powergript?.*pulley/i,         family: 'PowerGrip Pulley' },
  { re: /taper.lock.*bushing/i,         family: 'Taper-Lock Bushing' },
  { re: /qd.*bushing/i,                 family: 'QD Bushing' },
];

function detectFamily(line) {
  for (const { re, family } of FAMILY_KEYWORDS) {
    if (re.test(line)) return family;
  }
  return null;
}

// Section-level heading from margin context (e.g., "POLY CHAIN BELTS", "LIGHT DUTY V-BELTS")
const MARGIN_SECTION_RE = /^((?:POLY CHAIN|HEAVY DUTY V-BELTS?|LIGHT DUTY V-BELTS?|SYNCHRONOUS METAL|SYNCHRONOUS BELTS?|V-BELTS?))\s+Product No/;

const itemMap = new Map(); // product_no → description
let currentFamily = 'Gates Power Transmission Belt';

for (const raw of lines) {
  const line = raw.trim();

  // Margin-annotated section (e.g., "POLY CHAIN BELTS   Product No. Series 9274")
  const marginMatch = raw.match(MARGIN_SECTION_RE);
  if (marginMatch) {
    // Use family already tracked — just helps context, don't override
  }

  // Product family heading detection (mixed-case lines with product names)
  if (line.length > 8 && line.length < 100 && /[a-z]/.test(line) && !/^\s*\d/.test(line)) {
    const fam = detectFamily(line);
    if (fam) currentFamily = fam;
  }

  // Fast skip: line must contain a product number pattern
  if (!/\d{4}-\d{4}/.test(raw)) continue;

  // Extract all (designation, product_no) pairs from the line
  PAIR_RE.lastIndex = 0;
  let m;
  while ((m = PAIR_RE.exec(raw)) !== null) {
    const designation = m[1].trim();
    const productNo   = m[2];

    // Skip if designation looks like a dimension, noise token, or plain word
    if (!/\d/.test(designation)) continue;            // must contain at least one digit
    if (/^\d+$/.test(designation)) continue;          // must not be all digits
    if (/^(Teeth|Part|Product|Weight|Pitch|Width|Lbs|No)\b/i.test(designation)) continue;
    if (designation.length < 3) continue;

    // Build description from family + designation
    // Designation encodes specs: 8MGT-640-12 = 8mm pitch, 640mm length, 12mm wide
    const desc = `Gates ${currentFamily} ${designation}`.slice(0, 120);

    if (!itemMap.has(productNo)) {
      itemMap.set(productNo, desc);
    }
  }
}

console.log(`Found ${itemMap.size.toLocaleString()} unique product codes`);

if (DRY_RUN) {
  let shown = 0;
  for (const [k, v] of itemMap) {
    if (shown++ >= 30) break;
    console.log(`  ${k.padEnd(12)}  →  ${v}`);
  }
  process.exit(0);
}

// Write SQL UPDATE statements
console.log(`Writing SQL → ${SQL_PATH}`);

const out = [
  `-- Gates Industrial Power Transmission Catalog — extracted ${new Date().toISOString().slice(0,10)}`,
  `-- ${itemMap.size.toLocaleString()} product codes`,
  `-- Apply: node scripts/bulk_apply_updates.js --file=${SQL_PATH}`,
  '',
];

for (const [productNo, desc] of itemMap) {
  const safeDesc = desc.replace(/'/g, "''");
  out.push(
    `UPDATE MasterParts SET Description = '${safeDesc}' WHERE AlternatePartNumbers = '${productNo}';`
  );
}

fs.writeFileSync(SQL_PATH, out.join('\n') + '\n', 'utf8');
console.log(`Done — ${itemMap.size.toLocaleString()} UPDATE statements written`);
console.log(`\nNext: node scripts/bulk_apply_updates.js --file=${SQL_PATH}`);
