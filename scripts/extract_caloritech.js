// Copyright © 2026 Trier OS. All Rights Reserved.
// Extracts Caloritech part numbers from all 5 Motion catalog PDFs.
//
// Covers: AR Thermostat Controllers, BX Convection Heaters,
//         FS Finned Strip Heaters, GE Forced Air Heaters, GX Forced Air Heaters.
// Part number format: 2-4 letter prefix + 3-6 digits + optional suffix (e.g. AR0464, BX2011ST)
// Output: scripts/caloritech_parts.sql
//
// Usage:
//   node scripts/extract_caloritech.js
//   node scripts/extract_caloritech.js --dry-run

'use strict';

const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const CATALOG_DIR = 'Catalogs/Motion';
const SQL_PATH    = 'scripts/caloritech_parts.sql';
const DRY_RUN     = process.argv.includes('--dry-run');

const CATALOGS = [
  { file: 'Motion - Caloritech AR Thermostat Controller Catalog - Motion.pdf', series: 'AR', cat: 'ELECTRICAL', desc: 'Caloritech AR Thermostat Controller' },
  { file: 'Motion - Caloritech BX Series Heavy-Duty Convection Heater Catalog - Motion.pdf', series: 'BX', cat: 'ELECTRICAL', desc: 'Caloritech BX Convection Heater' },
  { file: 'Motion - Caloritech FS Finned Strip Heater Catalog - Motion.pdf', series: 'FS', cat: 'ELECTRICAL', desc: 'Caloritech FS Finned Strip Heater' },
  { file: 'Motion - Caloritech GE Series Forced Air Heater Catalog - Motion.pdf', series: 'GE', cat: 'ELECTRICAL', desc: 'Caloritech GE Forced Air Heater' },
  { file: 'Motion - Caloritech GX Series Forced Air Heater Catalog - Motion.pdf', series: 'GX', cat: 'ELECTRICAL', desc: 'Caloritech GX Forced Air Heater' },
];

// Caloritech part number: 2-4 letter series prefix + 3-6 alphanumeric chars
// AR0464, AR1264, AR046843, BX2011ST, BX2011S, FS2001, GE022, GE022C, GX152, GX152C
const ITEM_RE = /\b([A-Z]{2,4}\d{3,6}[A-Z0-9]{0,4})\b/g;

// False positive filter
function isFalsePositive(code, series) {
  if (!code.startsWith(series)) return true;  // must match the catalog's series prefix
  if (code.length < 4) return true;
  return false;
}

const parts = new Map();

for (const catalog of CATALOGS) {
  const pdfPath = path.join(CATALOG_DIR, catalog.file);
  const txtPath = path.join('Catalogs', `caloritech_${catalog.series}_text.tmp`);

  if (!fs.existsSync(pdfPath)) {
    console.warn(`PDF not found: ${pdfPath}`);
    continue;
  }

  if (!fs.existsSync(txtPath)) {
    process.stdout.write(`Extracting ${catalog.series}...`);
    const result = spawnSync('pdftotext', ['-layout', pdfPath, txtPath], { timeout: 60000 });
    if (result.status !== 0) {
      console.error(`pdftotext failed: ${result.stderr?.toString()}`);
      continue;
    }
    console.log(' done');
  } else {
    console.log(`Using cached: ${path.basename(txtPath)}`);
  }

  const text  = fs.readFileSync(txtPath, 'utf8');
  const lines = text.split('\n');
  const descBuffer = [];

  for (const raw of lines) {
    const line = raw.trim();
    ITEM_RE.lastIndex = 0;
    const hasItems = ITEM_RE.test(raw);
    ITEM_RE.lastIndex = 0;

    if (!hasItems && line.length > 4 && line.length < 100) {
      descBuffer.push(line);
      if (descBuffer.length > 3) descBuffer.shift();
    }

    let m;
    while ((m = ITEM_RE.exec(raw)) !== null) {
      const itemNo = m[1];
      if (isFalsePositive(itemNo, catalog.series)) continue;
      if (parts.has(itemNo)) continue;

      const context = descBuffer.slice(-1)[0] || catalog.desc;
      const desc = `${catalog.desc}; ${context}`.slice(0, 120).replace(/'/g, "''");
      parts.set(itemNo, { itemNo, cat: catalog.cat, desc, series: catalog.series });
    }
  }

  console.log(`  ${catalog.series}: ${[...parts.values()].filter(p => p.series === catalog.series).length} items`);
}

console.log(`Total: ${parts.size} unique item numbers`);

if (DRY_RUN) {
  [...parts.values()].slice(0, 20).forEach(p =>
    console.log(`  ${p.itemNo.padEnd(14)} [${p.cat}]  ${p.desc.slice(0,55)}`)
  );
  process.exit(0);
}

// Write SQL
console.log(`Writing SQL → ${SQL_PATH}`);

const out = [
  `-- Caloritech Motion Catalogs — extracted ${new Date().toISOString().slice(0,10)}`,
  `-- ${parts.size} item numbers (AR, BX, FS, GE, GX series)`,
  `-- Apply: node scripts/apply_generic_parts.js --file=${SQL_PATH}`,
  '',
];

for (const p of parts.values()) {
  const id = `CAL-${p.cat}-${p.itemNo}`;
  out.push(
    `INSERT OR IGNORE INTO MasterParts ` +
    `(MasterPartID, AlternatePartNumbers, Description, Category, Tags, Manufacturer) VALUES ` +
    `('${id}', '${p.itemNo}', '${p.desc.replace(/'/g,"''")}', '${p.cat}', 'caloritech,motion', 'Caloritech');`
  );
}

fs.writeFileSync(SQL_PATH, out.join('\n') + '\n', 'utf8');
console.log(`Done — ${parts.size} parts written to ${SQL_PATH}`);
console.log(`\nNext: node scripts/apply_generic_parts.js --file=${SQL_PATH}`);
