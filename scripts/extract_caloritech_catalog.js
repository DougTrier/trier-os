// Copyright © 2026 Trier OS. All Rights Reserved.
// Extracts Caloritech industrial heating component descriptions from 5 catalog PDFs:
//   AR — Type AR Thermostats
//   BX — Heavy Duty Convection Heaters
//   FS — Finned Strip Heaters
//   GE — Regular Duty Forced Air Heaters
//   GX — Heavy Duty Forced Air Heaters
//
// Part number format: {series}{4-6 digit code} (e.g., AR0464, FS2001, GX1000)
//
// Output: scripts/caloritech_updates.sql
// Apply:  node scripts/bulk_apply_updates.js --file=scripts/caloritech_updates.sql
//
// Usage:
//   node scripts/extract_caloritech_catalog.js
//   node scripts/extract_caloritech_catalog.js --dry-run

'use strict';

const fs = require('fs');

const SQL_PATH = 'scripts/caloritech_updates.sql';
const DRY_RUN  = process.argv.includes('--dry-run');

const SERIES = [
  {
    prefix: 'AR',
    file:   'Catalogs/caloritech_AR_text.tmp',
    base:   'Caloritech Type AR Industrial Thermostat',
    // AR0464, AR1264, ARR0464, AR046843 (with optional extra digits)
    pattern: /\b(ARR?\d{4,6})\b/g,
  },
  {
    prefix: 'BX',
    file:   'Catalogs/caloritech_BX_text.tmp',
    base:   'Caloritech BX Heavy Duty Convection Heater',
    // BX2021, BX2021S, BX2021T, BX2021ST
    pattern: /\b(BX\d{4}[A-Z]{0,2})\b/g,
  },
  {
    prefix: 'FS',
    file:   'Catalogs/caloritech_FS_text.tmp',
    base:   'Caloritech FS Finned Strip Heater',
    // FS1001, FS2001, FS2142 (4 digits)
    pattern: /\b(FS\d{4})\b/g,
  },
  {
    prefix: 'GE',
    file:   'Catalogs/caloritech_GE_text.tmp',
    base:   'Caloritech GE Regular Duty Forced Air Fan Heater',
    // GE022, GE022C, GE022T, GE022CT (3 digits + optional C/T/CT suffix)
    pattern: /\b(GE\d{3}[A-Z]{0,2})\b/g,
  },
  {
    prefix: 'GX',
    file:   'Catalogs/caloritech_GX_text.tmp',
    base:   'Caloritech GX Heavy Duty Forced Air Fan Heater',
    // GX152, GX152C, GX152T, GX152CT
    pattern: /\b(GX\d{3}[A-Z]{0,2})\b/g,
  },
];

const itemMap = new Map();

for (const { prefix, file, base, pattern: re } of SERIES) {
  if (!fs.existsSync(file)) { console.warn(`Missing: ${file}`); continue; }
  const lines = fs.readFileSync(file, 'utf8').split('\n');

  let currentWatts   = '';
  let currentVoltage = '';

  for (const raw of lines) {
    const line = raw.trim();

    // Extract wattage from lines like "1100" or "1100   29.7" (watts per foot)
    // Look for a standalone number >= 100 in the first few columns
    const wattsMatch = raw.match(/^\s+(\d{3,5})\s+\d{2,3}/);
    if (wattsMatch && !re.test(raw)) {
      const w = parseInt(wattsMatch[1]);
      if (w >= 100 && w <= 20000) currentWatts = `${w}W`;
    }

    // Extract voltage context from lines mentioning 120V, 240V, 277VAC, 600VAC etc.
    const voltMatch = line.match(/\b(120V?|240V?|277VAC?|480V?|600VAC?)\b/i);
    if (voltMatch && !re.test(raw)) {
      currentVoltage = voltMatch[1].toUpperCase();
    }

    // Extract part numbers
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(raw)) !== null) {
      const partNo = m[1];
      if (itemMap.has(partNo)) continue;

      // Build description: base + optional watts + optional voltage
      let desc = base;
      if (currentWatts && (prefix === 'FS' || prefix === 'BX' || prefix === 'GE' || prefix === 'GX')) {
        desc += ` ${currentWatts}`;
      }
      itemMap.set(partNo, desc.slice(0, 120));
    }

    // Reset voltage tracking when we hit a new voltage section
    if (re.test(raw)) re.lastIndex = 0;
  }
}

console.log(`Found ${itemMap.size.toLocaleString()} unique Caloritech part numbers`);

if (DRY_RUN) {
  let n = 0;
  for (const [k, v] of itemMap) {
    if (n++ >= 20) break;
    console.log(`  ${k.padEnd(14)}  →  ${v}`);
  }
  process.exit(0);
}

const out = [
  `-- Caloritech Industrial Heaters & Controls — extracted ${new Date().toISOString().slice(0,10)}`,
  `-- ${itemMap.size.toLocaleString()} part numbers across AR/BX/FS/GE/GX series`,
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
