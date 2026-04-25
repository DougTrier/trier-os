// Copyright © 2026 Trier OS. All Rights Reserved.
// Extracts Parker Quick Coupling part numbers from Catalog 3800.
//
// Parker coupling part numbers are alphanumeric codes with dashes.
// Pneumatic: H2C, BH2E, SH8C, H4-62-T10, SSH4-62Y-T10
// Hydraulic: H4-62-T10, BH12-60L, SH12-62L, SSH12-62LY
// Repair kits: 50001-013-0010, 50001-015-0010
// Uses pdftotext for clean text extraction, then parses by page.
// Output: scripts/parker_qc_parts.sql
//
// Usage:
//   node scripts/extract_parker_qc.js
//   node scripts/extract_parker_qc.js --dry-run

'use strict';

const { spawnSync } = require('child_process');
const fs   = require('fs');

const PDF_PATH = 'Catalogs/Parker/Parker Catalog_3800_Quick_Coupling_Products.pdf';
const TXT_PATH = 'Catalogs/parker_qc_text.tmp';
const SQL_PATH = 'scripts/parker_qc_parts.sql';
const DRY_RUN  = process.argv.includes('--dry-run');

// Pattern 1: Standard coupling codes — optional B/S/SS prefix + H + digits + letter combos + optional dash suffixes
// Covers: H2C, BH2C, SH2C, H4-62-T10, BH12-60L, SSH4-62Y-T10
const COUPLING_RE = /\b([BS]{0,2}H\d{1,4}(?:[A-Z]{1,2})?(?:-\d{1,2}(?:[A-Z]{1,3})?)?(?:-T\d{1,2})?(?:[A-Z])?)\b/g;

// Pattern 2: Repair kit numbers: 50001-NNN-NNNN
const REPAIR_KIT_RE = /\b(50001-\d{3}-\d{4})\b/g;

// Minimum length to filter noise
const MIN_LEN = 3;

// Page section → category
function mapCategory(section) {
  const s = section.toUpperCase();
  if (s.includes('HYDRAULIC')) return 'HYDRAULICS';
  if (s.includes('PNEUMATIC')) return 'PNEUMATICS';
  return 'HYDRAULICS'; // most quick couplings are hydraulic
}

// False positive filter for coupling codes
function isFalsePositive(code) {
  if (code.length < MIN_LEN) return true;
  // Skip if it's just H followed by a single letter (too generic)
  if (/^H[A-Z]$/.test(code)) return true;
  // Skip standalone letters or near-letter sequences
  if (/^[A-Z]{1,2}$/.test(code)) return true;
  return false;
}

const NOISE = /^(catalog|parker\.com|www\.|this product|california|warning|note:|see page|\* |contact qcd)/i;
const ALL_CAPS = /^[A-Z][A-Z &\/\-]{3,}$/;

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

// Track section (Pneumatic vs Hydraulic) across pages
let currentSection = 'Pneumatic Quick Couplings';
let currentSubsection = '';
const descBuffer = [];

for (const page of pages) {
  const lines = page.split('\n').map(l => l.trim()).filter(Boolean);

  // Detect section from page header: look for "Pneumatic" or "Hydraulic" in first 5 lines
  for (const l of lines.slice(0, 5)) {
    if (/pneumatic/i.test(l)) { currentSection = 'Pneumatic Quick Couplings'; break; }
    if (/hydraulic/i.test(l)) { currentSection = 'Hydraulic Quick Couplings'; break; }
  }

  for (const raw of lines) {
    const line = raw.split(/\s{3,}/)[0].trim();
    if (!line || NOISE.test(line)) continue;

    // Subsection headers
    if (ALL_CAPS.test(line) && line.length < 60) {
      currentSubsection = line;
      descBuffer.length = 0;
      continue;
    }

    // Check for couplings on this line
    COUPLING_RE.lastIndex = 0;
    const hasCouplings = COUPLING_RE.test(raw);
    REPAIR_KIT_RE.lastIndex = 0;
    const hasKits = REPAIR_KIT_RE.test(raw);

    if (!hasCouplings && !hasKits && line.length > 6 && line.length < 100) {
      descBuffer.push(line);
      if (descBuffer.length > 3) descBuffer.shift();
    }

    const cat  = mapCategory(currentSection);
    const desc = (currentSubsection || descBuffer.slice(-1)[0] || currentSection).slice(0, 120).replace(/'/g, "''");

    // Extract coupling codes
    COUPLING_RE.lastIndex = 0;
    let m;
    while ((m = COUPLING_RE.exec(raw)) !== null) {
      const itemNo = m[1];
      if (isFalsePositive(itemNo)) continue;
      if (!parts.has(itemNo)) {
        parts.set(itemNo, { itemNo, cat, desc });
      }
    }

    // Extract repair kit numbers
    REPAIR_KIT_RE.lastIndex = 0;
    while ((m = REPAIR_KIT_RE.exec(raw)) !== null) {
      const itemNo = m[1];
      if (!parts.has(itemNo)) {
        parts.set(itemNo, { itemNo, cat, desc });
      }
    }
  }
}

console.log(`Found ${parts.size} unique item numbers`);

if (DRY_RUN) {
  const sample = [...parts.values()].slice(0, 25);
  sample.forEach(p => console.log(`  ${p.itemNo}  [${p.cat}]  ${p.desc.slice(0,55)}`));
  const cats = {};
  for (const p of parts.values()) cats[p.cat] = (cats[p.cat] || 0) + 1;
  console.log('\nCategory breakdown:');
  Object.entries(cats).forEach(([c,n]) => console.log(`  ${c.padEnd(14)} ${n}`));
  process.exit(0);
}

// ── Step 3: Write SQL ─────────────────────────────────────────────────────────
console.log(`Writing SQL → ${SQL_PATH}`);

const out = [
  `-- Parker Quick Coupling Catalog 3800 — extracted ${new Date().toISOString().slice(0,10)}`,
  `-- ${parts.size} item numbers`,
  `-- Apply: node scripts/apply_generic_parts.js --file=${SQL_PATH}`,
  '',
];

for (const p of parts.values()) {
  const id = `PKQ-${p.cat}-${p.itemNo}`;
  out.push(
    `INSERT OR IGNORE INTO MasterParts ` +
    `(MasterPartID, AlternatePartNumbers, Description, Category, Tags, Manufacturer) VALUES ` +
    `('${id}', '${p.itemNo}', '${p.desc.replace(/'/g,"''")}', '${p.cat}', 'parker,qc3800', 'Parker Hannifin');`
  );
}

fs.writeFileSync(SQL_PATH, out.join('\n') + '\n', 'utf8');
console.log(`Done — ${parts.size} parts written to ${SQL_PATH}`);
console.log(`\nNext: node scripts/apply_generic_parts.js --file=${SQL_PATH}`);
