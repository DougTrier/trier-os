// Copyright © 2026 Trier OS. All Rights Reserved.
// Extracts concrete plant parts from MP Plants / Mixer & Plant Parts catalog.
//
// Multi-brand catalog: Con-E-Co, McNeilus, Stephens, Liddell, WAM, Johnson-Ross,
// Terex, Rexcon, Erie Strayer, Vince Hagan, CMI Roadbuilding, Nordfab, Belgrade.
// Layout: BRAND  PART#  DESCRIPTION  link  (multi-column per page)
// Output: scripts/mp_plants_parts.sql
//
// Usage:
//   node scripts/extract_mp_plants.js
//   node scripts/extract_mp_plants.js --dry-run

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');

const PDF_PATH = 'Catalogs/MP Plants Concrete-Plant-Parts-Catalog.pdf';
const TXT_PATH = 'Catalogs/mp_plants_text.tmp';
const SQL_PATH = 'scripts/mp_plants_parts.sql';
const DRY_RUN  = process.argv.includes('--dry-run');

// Brand definitions — order matters (longer/more-specific first to avoid partial matches)
const BRAND_DEFS = [
  { re: 'CMI Roadbuilding', abbr: 'CMI', name: 'CMI Roadbuilding'   },
  { re: 'Erie Strayer',     abbr: 'ES',  name: 'Erie Strayer'       },
  { re: 'Johnson-Ross',     abbr: 'JR',  name: 'Johnson-Ross'       },
  { re: 'Vince Hagan',      abbr: 'VH',  name: 'Vince Hagan'        },
  { re: 'Con-E-Co',         abbr: 'CEC', name: 'Con-E-Co'           },
  { re: 'McNeilus',         abbr: 'MCN', name: 'McNeilus'           },
  { re: 'Stephens',         abbr: 'STH', name: 'Stephens'           },
  { re: 'Liddell',          abbr: 'LID', name: 'Liddell'            },
  { re: 'Nordfab',          abbr: 'NDF', name: 'Nordfab'            },
  { re: 'Belgrade',         abbr: 'BEL', name: 'Belgrade'           },
  { re: 'Badger',           abbr: 'BAD', name: 'Badger'             },
  { re: 'Rexcon',           abbr: 'RXC', name: 'Rexcon'             },
  { re: 'Terex',            abbr: 'TRX', name: 'Terex'              },
  { re: 'WAM',              abbr: 'WAM', name: 'WAM'                },
  { re: 'Hagan',            abbr: 'VH',  name: 'Vince Hagan'        }, // short form
];

// Build brand → meta lookup
const brandMeta = {};
for (const b of BRAND_DEFS) brandMeta[b.re] = { abbr: b.abbr, name: b.name };

// Entry regex: Brand  PartNo  Description (stops before "link"/LINK/3+ spaces)
const BRAND_PAT = BRAND_DEFS.map(b => b.re.replace(/[-]/g, '\\-')).join('|');
const ENTRY_RE = new RegExp(
  `(${BRAND_PAT})\\s+([A-Z0-9][A-Z0-9\\-\\.]{2,})\\*?\\s{2,}([A-Za-z0-9\\/][^\\n]{3,100}?)(?=\\s{3,}|\\s*[Ll]ink|\\s*LINK|$)`,
  'g'
);

// Section header detection — ALL CAPS lines on the page margins
const KNOWN_SECTIONS = [
  'AERATION BLOWERS', 'AERATION COMPONENTS', 'AIR CYLINDERS', 'AIR FITTINGS',
  'BEARINGS', 'BELTS', 'BOOTS', 'CONVEYORS', 'DUCTING', 'DUST BAGS',
  'DUST COLLECTORS', 'ELECTRICAL', 'FILL LINE', 'FILTER CARTRIDGES',
  'GATES', 'HANDLES', 'HEAD PULLEYS', 'HOPPERS', 'IDLERS',
];

const SECTION_CAT = [
  { key: 'BEARING',        cat: 'BEARINGS'   },
  { key: 'BELT',           cat: 'MECHANICAL' },
  { key: 'CONVEYOR',       cat: 'MECHANICAL' },
  { key: 'HEAD PULLEY',    cat: 'MECHANICAL' },
  { key: 'IDLER',          cat: 'MECHANICAL' },
  { key: 'GATE',           cat: 'MECHANICAL' },
  { key: 'BOOT',           cat: 'MECHANICAL' },
  { key: 'HOPPER',         cat: 'MECHANICAL' },
  { key: 'HANDLE',         cat: 'MECHANICAL' },
  { key: 'FILL LINE',      cat: 'MECHANICAL' },
  { key: 'ELECTRICAL',     cat: 'ELECTRICAL' },
  { key: 'DUST BAG',       cat: 'FILTRATION' },
  { key: 'DUST COLLECTOR', cat: 'FILTRATION' },
  { key: 'FILTER',         cat: 'FILTRATION' },
  { key: 'DUCT',           cat: 'PNEUMATICS' },
  { key: 'AERATION',       cat: 'PNEUMATICS' },
  { key: 'AIR CYLINDER',   cat: 'PNEUMATICS' },
  { key: 'AIR FITTING',    cat: 'PNEUMATICS' },
];

function mapCategory(section) {
  const up = section.toUpperCase();
  for (const { key, cat } of SECTION_CAT) {
    if (up.includes(key)) return cat;
  }
  return 'MECHANICAL';
}

// False positive guard — skip noise tokens that look like part numbers
function isFalsePositive(itemNo) {
  if (itemNo.length < 3)  return true;
  if (/^[A-Z]{1,3}$/.test(itemNo)) return true;  // standalone letter codes
  if (/^BRAND|^PART|^DESC|^LINK$/i.test(itemNo)) return true;
  return false;
}

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

// key = brandAbbr + '-' + itemNo (dedup per brand)
const parts = new Map();

let currentSection = 'AERATION COMPONENTS';
let currentCat     = 'PNEUMATICS';

for (const page of pages) {
  const lines = page.split('\n');

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // Detect section from repeated ALL-CAPS page-margin labels
    const up = line.toUpperCase();
    for (const sec of KNOWN_SECTIONS) {
      if (up.includes(sec)) {
        currentSection = sec;
        currentCat = mapCategory(sec);
        break;
      }
    }

    // Scan line for all BRAND  PartNo  Description matches (handles multi-column)
    ENTRY_RE.lastIndex = 0;
    let m;
    while ((m = ENTRY_RE.exec(raw)) !== null) {
      const brandKey = m[1];
      const itemNo   = m[2].replace(/\*$/, '').trim();  // strip trailing *
      const desc     = m[3].trim().replace(/\s+/g, ' ').replace(/\s*link\s*$/i, '').trim();

      if (isFalsePositive(itemNo)) continue;

      const meta = brandMeta[brandKey];
      if (!meta) continue;

      const mapKey = `${meta.abbr}-${itemNo}`;
      if (parts.has(mapKey)) continue;

      const fullDesc = desc.length > 5
        ? `${desc}`.replace(/'/g, "''").slice(0, 120)
        : `${meta.name} ${currentSection}`.replace(/'/g, "''").slice(0, 120);

      parts.set(mapKey, {
        id:       `MPC-${currentCat}-${meta.abbr}-${itemNo}`,
        itemNo,
        cat:      currentCat,
        desc:     fullDesc,
        brand:    meta.name,
      });
    }
  }
}

console.log(`Found ${parts.size} unique item numbers`);

// Category + brand breakdown
const cats   = {};
const brands = {};
for (const p of parts.values()) {
  cats[p.cat]     = (cats[p.cat]   || 0) + 1;
  brands[p.brand] = (brands[p.brand] || 0) + 1;
}
console.log('By category:');
Object.entries(cats).sort((a,b) => b[1]-a[1]).forEach(([c,n]) => console.log(`  ${c.padEnd(16)} ${n}`));
console.log('By brand:');
Object.entries(brands).sort((a,b) => b[1]-a[1]).forEach(([b,n]) => console.log(`  ${b.padEnd(20)} ${n}`));

if (DRY_RUN) {
  console.log('\nSample parts:');
  [...parts.values()].slice(0, 30).forEach(p =>
    console.log(`  ${p.itemNo.padEnd(18)} [${p.cat.padEnd(12)}] ${p.brand.padEnd(16)} ${p.desc.slice(0,50)}`)
  );
  process.exit(0);
}

// ── Step 3: Write SQL ─────────────────────────────────────────────────────────
console.log(`Writing SQL → ${SQL_PATH}`);

const out = [
  `-- MP Plants Concrete Plant Parts Catalog — extracted ${new Date().toISOString().slice(0,10)}`,
  `-- ${parts.size} item numbers (multi-brand: Con-E-Co, McNeilus, Stephens, Liddell, WAM, etc.)`,
  `-- Apply: node scripts/apply_generic_parts.js --file=${SQL_PATH}`,
  '',
];

for (const p of parts.values()) {
  out.push(
    `INSERT OR IGNORE INTO MasterParts ` +
    `(MasterPartID, AlternatePartNumbers, Description, Category, Tags, Manufacturer) VALUES ` +
    `('${p.id}', '${p.itemNo}', '${p.desc.replace(/'/g,"''")}', '${p.cat}', 'mpparts,concrete-plant', '${p.brand.replace(/'/g,"''")}');`
  );
}

fs.writeFileSync(SQL_PATH, out.join('\n') + '\n', 'utf8');
console.log(`Done — ${parts.size} parts written to ${SQL_PATH}`);
console.log(`\nNext: node scripts/apply_generic_parts.js --file=${SQL_PATH}`);
