/**
 * audit_i18n_gaps.js
 * Compares all 11 language JSON files against en.json.
 * Reports: missing keys per language, duplicate keys in en.json.
 * Run: node scripts/audit_i18n_gaps.js
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const I18N = path.join(__dirname, '..', 'src', 'i18n');
const LANGS = ['es','fr','de','zh','pt','ja','ko','ar','hi','tr'];

function loadJson(lang) {
  const raw = fs.readFileSync(path.join(I18N, `${lang}.json`), 'utf8');
  // Parse allowing duplicate keys — we want to detect them
  const keys = new Map();
  const dupes = [];
  let pos = 0;
  const keyRe = /"([^"\\]*)"\s*:/g;
  let m;
  while ((m = keyRe.exec(raw)) !== null) {
    if (keys.has(m[1])) dupes.push(m[1]);
    else keys.set(m[1], true);
  }
  const obj = JSON.parse(raw); // may throw on true dupes but JSON.parse picks last value
  return { obj, dupes };
}

// Load en
const { obj: en, dupes: enDupes } = loadJson('en');
const enKeys = Object.keys(en);
const manualEnKeys = enKeys.filter(k => k.startsWith('manual.'));

console.log(`\n══ EN.JSON ══`);
console.log(`  Total keys:  ${enKeys.length}`);
console.log(`  manual.* :   ${manualEnKeys.length}`);
if (enDupes.length) console.log(`  ⚠  Duplicate keys: ${enDupes.join(', ')}`);
else console.log(`  ✓  No duplicate keys`);

console.log(`\n══ LANGUAGE GAP REPORT (manual.* keys only) ══`);
for (const lang of LANGS) {
  const { obj, dupes } = loadJson(lang);
  const missing = manualEnKeys.filter(k => !(k in obj));
  console.log(`\n  ${lang.toUpperCase()}`);
  console.log(`    manual.* present: ${Object.keys(obj).filter(k=>k.startsWith('manual.')).length}`);
  console.log(`    missing from en:  ${missing.length}`);
  if (dupes.length) console.log(`    ⚠  Duplicate keys: ${dupes.join(', ')}`);
  if (missing.length > 0 && missing.length <= 30) {
    missing.forEach(k => console.log(`      - ${k}`));
  } else if (missing.length > 30) {
    missing.slice(0, 10).forEach(k => console.log(`      - ${k}`));
    console.log(`      ... and ${missing.length - 10} more`);
  }
}

// Check for keys in any lang that are NOT in en (orphans)
console.log(`\n══ ORPHAN CHECK (keys in lang but NOT in en.json) ══`);
for (const lang of LANGS) {
  const { obj } = loadJson(lang);
  const orphans = Object.keys(obj).filter(k => k.startsWith('manual.') && !(k in en));
  if (orphans.length) {
    console.log(`  ${lang.toUpperCase()}: ${orphans.length} orphan manual.* keys`);
    orphans.slice(0,5).forEach(k => console.log(`    - ${k}`));
  }
}
console.log('\nDone.\n');
