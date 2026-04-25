// Copyright © 2026 Trier OS. All Rights Reserved.
// Extracts SDP/SI (Stock Drive Products / Sterling Instrument) precision
// machine component part numbers from Catalog D815 (Metric) and the main
// inch catalog sections.
//
// Catalogs processed:
//   Catalogs/SDP SI/Metric/*.pdf    (D815 metric components)
//   Catalogs/SDP SI/*.pdf           (inch component catalogs)
//
// SDP/SI part number formats:
//   S-prefix (no spaces): S15S05M020P0800G, S99HDPM200525, S62GMRM0608
//   A-prefix (with spaces): "A 7C55MP1905", "A 7Z 5M1605" — spaces are
//   canonical and match the printed catalog numbers exactly.
//
// Strategy: scan product table rows (left-edge indented), extract part
// numbers by detecting the prefix type, track section heading context.
// Outputs INSERT OR IGNORE statements for mfg_master.db MasterParts table.
//
// Output: scripts/sdpsi_parts.sql
// Apply:  node scripts/apply_generic_parts.js --file=scripts/sdpsi_parts.sql
//
// Usage:
//   node scripts/extract_sdpsi_catalog.js
//   node scripts/extract_sdpsi_catalog.js --dry-run

'use strict';

const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const glob = require('child_process');

const METRIC_DIR = 'Catalogs/SDP SI/Metric';
const INCH_DIR   = 'Catalogs/SDP SI';
const SQL_PATH   = 'scripts/sdpsi_parts.sql';
const DRY_RUN    = process.argv.includes('--dry-run');

// S-prefix: starts with S + 2 digits + alphanumeric body (no spaces), 10-22 chars total
const S_RE = /\bS\d{2}[A-Z0-9]{7,19}\b/g;

// A-prefix: "A " + alphanumeric body that may include ONE internal space
// Matches: "A 7C55MP1905", "A 7Z 5M1605", "A 7Z40MFSB"
// Pattern: "A " + 2-char code + optional-space + alphanumeric suffix
const A_RE = /\bA (\d{1,2}[A-Z]\d{1,2}(?:\s?[A-Z0-9]{2,})(?:[A-Z0-9]*[A-Z0-9]))\b/g;

// Heading: ALL-CAPS line at page top (section name like "GROUND SPUR GEARS", "BALL BEARINGS")
// Includes em-dash (—) which SDP/SI uses in product page headings
const HEADING_RE = /^[A-Z][A-Z0-9 \-\/°&,\.—]{4,69}$/;
// Sub-spec: title-case or uppercase spec lines like "ISO CLASS 5", "MATERIAL:", "8 mm FACE"
const SPEC_RE = /^(?:[A-Z][A-Za-z0-9 \-\/°&,\.]{3,59}:|[A-Z]{2,}\s+[A-Z0-9\s]{2,30})$/;

// Noise: copyright, phone numbers, website, page numbers
const NOISE = /sdp-si\.com|stock drive|sterling instrument|designatronics|phone:|fax:|www\.|copyright|rev:|d815/i;

// Category map by section keyword
const SECTION_CATS = [
  { key: 'GEAR',       cat: 'MECHANICAL', mfr_tag: 'sdpsi,gear,metric' },
  { key: 'RACK',       cat: 'MECHANICAL', mfr_tag: 'sdpsi,rack,metric' },
  { key: 'PINION',     cat: 'MECHANICAL', mfr_tag: 'sdpsi,pinion,metric' },
  { key: 'BEARING',    cat: 'MECHANICAL', mfr_tag: 'sdpsi,bearing,metric' },
  { key: 'BELT',       cat: 'MECHANICAL', mfr_tag: 'sdpsi,belt,metric' },
  { key: 'CHAIN',      cat: 'MECHANICAL', mfr_tag: 'sdpsi,chain,metric' },
  { key: 'COUPLING',   cat: 'MECHANICAL', mfr_tag: 'sdpsi,coupling,metric' },
  { key: 'SHAFT',      cat: 'MECHANICAL', mfr_tag: 'sdpsi,shaft,metric' },
  { key: 'UNIVERSAL',  cat: 'MECHANICAL', mfr_tag: 'sdpsi,ujoint,metric' },
  { key: 'LINEAR',     cat: 'MECHANICAL', mfr_tag: 'sdpsi,linear,metric' },
  { key: 'CLUTCH',     cat: 'MECHANICAL', mfr_tag: 'sdpsi,clutch,metric' },
  { key: 'BRAKE',      cat: 'MECHANICAL', mfr_tag: 'sdpsi,brake,metric' },
  { key: 'GEARHEAD',   cat: 'MECHANICAL', mfr_tag: 'sdpsi,gearhead,metric' },
  { key: 'GEARMOTOR',  cat: 'MECHANICAL', mfr_tag: 'sdpsi,gearmotor,metric' },
  { key: 'VIBRATION',  cat: 'MECHANICAL', mfr_tag: 'sdpsi,vibration,metric' },
  { key: 'HARDWARE',   cat: 'MECHANICAL', mfr_tag: 'sdpsi,hardware,metric' },
  { key: 'SCREW',      cat: 'MECHANICAL', mfr_tag: 'sdpsi,lead-screw,metric' },
  { key: 'RIGHT-ANGLE',cat: 'MECHANICAL', mfr_tag: 'sdpsi,right-angle,metric' },
];

function mapCategory(section) {
  const up = section.toUpperCase();
  for (const { key, cat, mfr_tag } of SECTION_CATS) {
    if (up.includes(key)) return { cat, mfr_tag };
  }
  return { cat: 'MECHANICAL', mfr_tag: 'sdpsi,metric' };
}

// ── PDF text extraction helper ────────────────────────────────────────────────
function extractText(pdfPath) {
  const txtPath = pdfPath.replace(/\.pdf$/i, '_text.tmp');
  if (!fs.existsSync(txtPath)) {
    const result = spawnSync('pdftotext', ['-layout', pdfPath, txtPath], { timeout: 120000 });
    if (result.status !== 0) {
      console.error(`  pdftotext failed for ${pdfPath}`);
      return null;
    }
  }
  return fs.readFileSync(txtPath, 'utf8');
}

// ── Collect all PDFs to process ───────────────────────────────────────────────
const allPdfs = [];

// Metric subfolder
if (fs.existsSync(METRIC_DIR)) {
  fs.readdirSync(METRIC_DIR)
    .filter(f => f.toLowerCase().endsWith('.pdf') && !f.toLowerCase().includes('intro') && !f.toLowerCase().includes('ref') && !f.toLowerCase().includes('technical'))
    .forEach(f => allPdfs.push({ file: path.join(METRIC_DIR, f), isMetric: true }));
}

// Inch catalog (main dir — skip subfolders)
if (fs.existsSync(INCH_DIR)) {
  fs.readdirSync(INCH_DIR)
    .filter(f => f.toLowerCase().endsWith('.pdf') && !f.toLowerCase().includes('intro') && !f.toLowerCase().includes('ref') && !f.toLowerCase().includes('technical'))
    .forEach(f => {
      const full = path.join(INCH_DIR, f);
      // Skip subdirectory entries (dirs, not files)
      if (fs.statSync(full).isFile()) {
        allPdfs.push({ file: full, isMetric: false });
      }
    });
}

console.log(`Processing ${allPdfs.length} SDP/SI catalog PDFs...`);

// Derive product category description from filename
// e.g. "D815-Metric-Section5-Bearings.pdf" → "Metric Ball Bearings"
//      "Bearings.pdf" → "Inch Bearings"
function descFromFilename(filename, isMetric) {
  const base = path.basename(filename, '.pdf')
    .replace(/^D815-/i, '')
    .replace(/Metric-/i, '')
    .replace(/Section\d+-/i, '')
    .replace(/-SDPSI$/i, '')
    .replace(/-/g, ' ')
    .trim();
  const system = isMetric ? 'Metric' : 'Inch';
  return `SDP/SI ${system} ${base}`;
}

// ── Parse all PDFs ─────────────────────────────────────────────────────────────
const parts = new Map();

for (const { file, isMetric } of allPdfs) {
  const shortName = path.basename(file);
  process.stdout.write(`  ${shortName}...\n`);

  const text = extractText(file);
  if (!text) continue;

  // File-level base description (from filename, more reliable than PDF text headings
  // which use special/decorative characters that corrupt in pdftotext output)
  const fileDesc = descFromFilename(file, isMetric);
  const { cat, mfr_tag } = mapCategory(fileDesc);

  // Use file-level description — SDP/SI PDFs use decorative fonts for headings
  // that pdftotext can't cleanly extract (special characters corrupt as binary).
  // The filename reliably describes the product family.
  const baseDesc = fileDesc;

  const lines = text.split('\n');

  for (const raw of lines) {
    // Fast check: line must have at least one potential part number pattern
    const hasS = /\bS\d{2}[A-Z]/.test(raw);
    const hasA = /\bA \d/.test(raw);
    if (!hasS && !hasA) continue;

    // Skip index page lines (contain ellipsis fragments)
    const line = raw.trim();
    if (line.includes('...') || /\.\.$/.test(line)) continue;

    // Extract S-prefix part numbers
    if (hasS) {
      S_RE.lastIndex = 0;
      let m;
      while ((m = S_RE.exec(raw)) !== null) {
        const itemNo = m[0];
        if (itemNo.endsWith('...') || itemNo.endsWith('..')) continue;
        if (!parts.has(itemNo)) {
          parts.set(itemNo, { itemNo, cat, mfr_tag, desc: baseDesc });
        }
      }
    }

    // Extract A-prefix part numbers
    if (hasA) {
      // Split by 2+ spaces to find column chunks, then extract A-prefix tokens
      const chunks = raw.split(/\s{2,}/);
      for (const chunk of chunks) {
        const c = chunk.trim();
        if (!c.startsWith('A ')) continue;
        // One chunk may contain multiple A-prefix numbers (e.g. "A 7C55MP1905 A 7C55MPS1905")
        // Split on " A " boundaries
        const subParts = c.split(/(?<=\S) (?=A \d)/);
        for (const sp of subParts) {
          const t = sp.trim();
          if (!/^A \d/.test(t)) continue;
          // Normalize: remove extra internal spaces (pdftotext column padding)
          // "A 7Z 5M1605" → "A 7Z 5M1605" (keep as-is, SDP/SI uses these spaces)
          // Validate: after "A " must have digit(s) + letters + digits pattern
          const body = t.slice(2);                       // everything after "A "
          const normalized = body.replace(/\s+/g, ' ').trim();
          if (normalized.length < 5 || !/[A-Z]/.test(normalized) || !/\d/.test(normalized)) continue;
          if (/^\d+$/.test(normalized)) continue;  // all digits - not a PN
          if (normalized.endsWith('..') || normalized.includes('...') || normalized.endsWith('.')) continue;
          const itemNo = `A ${normalized}`;
          if (!parts.has(itemNo)) {
            parts.set(itemNo, { itemNo, cat, mfr_tag, desc: baseDesc });
          }
        }
      }
    }
  }

  // Clean up temp text file to save disk (large PDFs generate large .tmp files)
  // Uncomment if disk space is a concern:
  // const txtPath = file.replace(/\.pdf$/i, '_text.tmp');
  // if (fs.existsSync(txtPath)) fs.unlinkSync(txtPath);
}

console.log(`\nTotal unique SDP/SI part numbers: ${parts.size.toLocaleString()}`);

if (DRY_RUN) {
  let shown = 0;
  for (const [k, v] of parts) {
    if (shown++ >= 50) break;
    console.log(`  ${v.itemNo.padEnd(22)}  [${v.cat}]  ${v.desc.slice(0, 70)}`);
  }
  // Category breakdown
  const cats = {};
  for (const v of parts.values()) {
    const sec = v.desc.split(' — ')[0].slice(0, 30);
    cats[sec] = (cats[sec] || 0) + 1;
  }
  console.log('\nTop sections:');
  Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0, 20).forEach(([s,n]) => console.log(`  ${n.toString().padStart(6)}  ${s}`));
  process.exit(0);
}

// ── Write SQL ─────────────────────────────────────────────────────────────────
console.log(`Writing SQL → ${SQL_PATH}`);

const out = [
  `-- SDP/SI Catalog D815 (Metric) + Inch Sections — extracted ${new Date().toISOString().slice(0,10)}`,
  `-- ${parts.size.toLocaleString()} precision machine component part numbers`,
  `-- Apply: node scripts/apply_generic_parts.js --file=${SQL_PATH}`,
  '',
];

for (const p of parts.values()) {
  const id      = `SDPSI-${p.cat}-${p.itemNo.replace(/[\s']/g, '-')}`.slice(0, 80);
  const safePN  = p.itemNo.replace(/'/g, "''");
  const safeDesc = p.desc.replace(/'/g, "''");
  out.push(
    `INSERT OR IGNORE INTO MasterParts ` +
    `(MasterPartID, AlternatePartNumbers, Description, Category, Tags, Manufacturer) VALUES ` +
    `('${id}', '${safePN}', '${safeDesc}', '${p.cat}', '${p.mfr_tag}', 'SDP/SI');`
  );
}

fs.writeFileSync(SQL_PATH, out.join('\n') + '\n', 'utf8');
console.log(`Done — ${parts.size.toLocaleString()} parts written to ${SQL_PATH}`);
console.log(`\nNext: node scripts/apply_generic_parts.js --file=${SQL_PATH}`);
