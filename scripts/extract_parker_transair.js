// Copyright © 2026 Trier OS. All Rights Reserved.
// Extracts Parker Transair modular pipe system part numbers from Catalog 3515.
//
// Transair part numbers: 4 digits + 1 letter + 2 digits (e.g. 1012A17, 1016A50).
// Uses pdftotext for clean text extraction, then parses by page.
// Output: scripts/parker_transair_parts.sql
//
// Usage:
//   node scripts/extract_parker_transair.js
//   node scripts/extract_parker_transair.js --dry-run

'use strict';

const { spawnSync } = require('child_process');
const fs   = require('fs');

const PDF_PATH = 'Catalogs/Parker/Parker_Transair_Catalog_3515.pdf';
const TXT_PATH = 'Catalogs/parker_transair_text.tmp';
const SQL_PATH = 'scripts/parker_transair_parts.sql';
const DRY_RUN  = process.argv.includes('--dry-run');

// Transair part number: 4 digits + 1 uppercase letter + 2 digits
// Examples: 1012A17, 1014A17, 1016A25, 1012A40, 1013A63
const ITEM_RE = /\b(\d{4}[A-Z]\d{2})\b/g;

// All Transair products are compressed air piping → PNEUMATICS
const CATEGORY = 'PNEUMATICS';

const NOISE = /^(catalog|rev\.|working pressure|maximum flow|example|result:|www\.|parker\.|iso |asme |tssa|atex|eur|t.v|qualicoat|\*|note)/i;

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
const ALL_CAPS = /^[A-Z][A-Z &\/\-]{3,}$/;

let currentSection = 'Transair Modular Pipe System';
const descBuffer   = [];

for (const page of pages) {
  const lines = page.split('\n').map(l => l.trim()).filter(Boolean);

  for (const raw of lines) {
    const line = raw.split(/\s{3,}/)[0].trim();
    if (!line || NOISE.test(line)) continue;

    // Section tracking
    if (ALL_CAPS.test(line) && line.length < 80) {
      currentSection = line;
      descBuffer.length = 0;
      continue;
    }

    ITEM_RE.lastIndex = 0;
    const hasItems = ITEM_RE.test(raw);
    ITEM_RE.lastIndex = 0;

    if (!hasItems && line.length > 6 && line.length < 100) {
      descBuffer.push(line);
      if (descBuffer.length > 3) descBuffer.shift();
    }

    let m;
    while ((m = ITEM_RE.exec(raw)) !== null) {
      const itemNo = m[1];
      if (parts.has(itemNo)) continue;

      const desc = (descBuffer.slice(-1)[0] || currentSection).slice(0, 120).replace(/'/g, "''");
      parts.set(itemNo, { itemNo, cat: CATEGORY, desc });
    }
  }
}

console.log(`Found ${parts.size} unique item numbers`);

if (DRY_RUN) {
  [...parts.values()].slice(0, 20).forEach(p =>
    console.log(`  ${p.itemNo}  [${p.cat}]  ${p.desc.slice(0,60)}`)
  );
  process.exit(0);
}

// ── Step 3: Write SQL ─────────────────────────────────────────────────────────
console.log(`Writing SQL → ${SQL_PATH}`);

const out = [
  `-- Parker Transair Catalog 3515 — extracted ${new Date().toISOString().slice(0,10)}`,
  `-- ${parts.size} item numbers`,
  `-- Apply: node scripts/apply_generic_parts.js --file=${SQL_PATH}`,
  '',
];

for (const p of parts.values()) {
  const id = `PK-${p.cat}-${p.itemNo}`;
  out.push(
    `INSERT OR IGNORE INTO MasterParts ` +
    `(MasterPartID, AlternatePartNumbers, Description, Category, Tags, Manufacturer) VALUES ` +
    `('${id}', '${p.itemNo}', '${p.desc.replace(/'/g,"''")}', '${p.cat}', 'parker,transair3515', 'Parker Hannifin');`
  );
}

fs.writeFileSync(SQL_PATH, out.join('\n') + '\n', 'utf8');
console.log(`Done — ${parts.size} parts written to ${SQL_PATH}`);
console.log(`\nNext: node scripts/apply_generic_parts.js --file=${SQL_PATH}`);
