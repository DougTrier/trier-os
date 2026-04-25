// Copyright © 2026 Trier OS. All Rights Reserved.
// Extracts Gibson Stainless & Specialty part numbers from product catalog.
//
// Gibson makes Type 316 SS electrical conduit, fittings, and support hardware:
// rigid conduit, nipples, elbows, couplings, conduit caps, floor flanges,
// conduit grips, U-bolt pipe clamps, grounding hardware, etc.
//
// Part number formats:
//   CND50, CND100, CND400          — rigid conduit (½" to 4")
//   NIP50, NIP75, NIP200           — conduit nipples
//   ELB50 through ELB400           — 90° elbows
//   CPL50 through CPL400           — couplings
//   TPC50 through TPC200           — three-piece couplings
//   CAP50 through CAP400           — conduit caps
//   FF50 through FF200             — floor flanges
//   PE100, PE200                   — pull elbows
//   CG100-375-438 through 938-1000 — conduit grips (by wire range)
//   CGM100-375-438 ...             — metal conduit grips
//   UBP0100 through UBP02000       — U-bolt pipe clamps
//   GR18, GR110, GR588, GR5810    — grounding rods
//   GRC625, GRC100                 — grounding clamps
//   SRC100, SRC200                 — set screw rod clamps
//   SRE375x2, SRE375x4, SRE375x6  — rod extenders
//   SRM375                         — rod mount
//   JTB375                         — J-box tee bolt
//   UNF100, UNY100                 — unions
//
// Output: scripts/gibson_stainless_parts.sql
//
// Usage:
//   node scripts/extract_gibson_stainless.js
//   node scripts/extract_gibson_stainless.js --dry-run

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');

const PDF_PATH = 'Catalogs/gibson-stainless-catalog.pdf';
const TXT_PATH = 'Catalogs/gibson_stainless_text.tmp';
const SQL_PATH = 'scripts/gibson_stainless_parts.sql';
const DRY_RUN  = process.argv.includes('--dry-run');

// Product family → description (all are ELECTRICAL — stainless conduit system)
const PRODUCT_MAP = {
  CND:  'Type 316 SS Rigid Conduit',
  NIP:  'Type 316 SS Conduit Nipple',
  ELB:  'Type 316 SS 90-Degree Conduit Elbow',
  CPL:  'Type 316 SS Conduit Coupling',
  TPC:  'Type 316 SS Three-Piece Coupling',
  CAP:  'Type 316 SS Conduit Cap',
  FF:   'Type 316 SS Floor Flange',
  PE:   'Type 316 SS Pull Elbow',
  UNF:  'Type 316 SS Union Fitting',
  UNY:  'Type 316 SS Union',
  CGM:  'SS Metal Conduit Grip',
  CG:   'SS Conduit Grip',
  SRC:  'Type 316 SS Set Screw Rod Clamp',
  SRE:  'Type 316 SS Set Screw Rod Extender',
  SRM:  'Type 316 SS Set Screw Rod Mount',
  JTB:  'Type 316 SS J-Box T-Bolt',
  GRC:  'SS Grounding Clamp',
  GR:   'SS Grounding Rod',
  UBP:  'Type 316 SS U-Bolt Pipe Clamp',
};

// Ordered patterns — more specific first (CGM before CG, GRC before GR)
const PATTERNS = [
  /\bCND\d{2,3}\b/g,
  /\bNIP\d{2,3}\b/g,
  /\bELB\d{2,3}\b/g,
  /\bCPL\d{2,3}\b/g,
  /\bTPC\d{2,3}\b/g,
  /\bCAP\d{2,3}\b/g,
  /\bFF\d{2,3}\b/g,
  /\bPE\d{2,3}\b/g,
  /\bUNF\d{2,3}\b/g,
  /\bUNY\d{2,3}\b/g,
  /\bCGM\d{2,3}-\d{3}-\d{3,4}\b/g,
  /\bCG\d{2,3}-\d{3}-\d{3,4}\b/g,
  /\bSRC\d{2,3}\b/g,
  /\bSRE\d{3}x\d+\b/g,
  /\bSRM\d{3}\b/g,
  /\bJTB\d{3}\b/g,
  /\bGRC\d{3}\b/g,
  /\bGR\d{2,4}\b/g,
  /\bUBP0\d{3,4}\b/g,
];

function getFamily(itemNo) {
  for (const prefix of Object.keys(PRODUCT_MAP)) {
    if (itemNo.startsWith(prefix)) return prefix;
  }
  return null;
}

// Skip known false positives: spec abbreviations, dimension codes
const FALSE_POS = /^(SS|UL|NPT|NPS|NEC|USA|ULC|NEMA|ASTM|ANSI|NFPA)\d/;

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

for (const page of pages) {
  for (const raw of page.split('\n')) {
    for (const re of PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(raw)) !== null) {
        const itemNo = m[0];
        if (FALSE_POS.test(itemNo)) continue;
        if (parts.has(itemNo)) continue;
        const family = getFamily(itemNo);
        if (!family) continue;
        const desc = PRODUCT_MAP[family];
        parts.set(itemNo, { itemNo, cat: 'ELECTRICAL', desc });
      }
    }
  }
}

console.log(`Found ${parts.size} unique item numbers`);

if (DRY_RUN) {
  console.log('\nSample parts:');
  [...parts.values()].slice(0, 40).forEach(p =>
    console.log(`  ${p.itemNo.padEnd(24)} [${p.cat}]  ${p.desc}`)
  );
  console.log('\nAll families found:');
  const families = {};
  for (const p of parts.values()) {
    const fam = getFamily(p.itemNo) || '?';
    families[fam] = (families[fam] || 0) + 1;
  }
  Object.entries(families).sort((a,b) => b[1]-a[1]).forEach(([f,n]) => console.log(`  ${f.padEnd(8)} ${n}`));
  process.exit(0);
}

// ── Step 3: Write SQL ─────────────────────────────────────────────────────────
console.log(`Writing SQL → ${SQL_PATH}`);

const out = [
  `-- Gibson Stainless & Specialty Product Catalog — extracted ${new Date().toISOString().slice(0,10)}`,
  `-- ${parts.size} item numbers (Type 316 SS conduit, fittings, support hardware)`,
  `-- Apply: node scripts/apply_generic_parts.js --file=${SQL_PATH}`,
  '',
];

for (const p of parts.values()) {
  const id = `GIB-${p.cat}-${p.itemNo}`;
  out.push(
    `INSERT OR IGNORE INTO MasterParts ` +
    `(MasterPartID, AlternatePartNumbers, Description, Category, Tags, Manufacturer) VALUES ` +
    `('${id}', '${p.itemNo}', '${p.desc}', '${p.cat}', 'gibson,316ss,conduit', 'Gibson Stainless');`
  );
}

fs.writeFileSync(SQL_PATH, out.join('\n') + '\n', 'utf8');
console.log(`Done — ${parts.size} parts written to ${SQL_PATH}`);
console.log(`\nNext: node scripts/apply_generic_parts.js --file=${SQL_PATH}`);
