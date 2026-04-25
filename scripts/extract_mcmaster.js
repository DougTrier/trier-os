// Copyright © 2026 Trier OS. All Rights Reserved.
// McMaster-Carr Catalog 123 (2017) — chocr.html.gz streaming extractor
// Outputs INSERT OR IGNORE INTO MasterParts SQL for mfg_master.db
//
// Usage:
//   node scripts/extract_mcmaster.js [--limit=N] [--min-conf=N] [--out=file.sql]
//
// Data quality notes:
//   - Source is 2017 archive.org scan; prices are 2017 list prices
//   - Part numbers (AlternatePartNumbers) are real McMaster catalog numbers
//   - Descriptions depend on OCR quality of the scanned page layout

'use strict';

const zlib = require('zlib');
const fs   = require('fs');

const INPUT    = 'G:/Trier OS/Catalogs/Other/McMaster-Carr Catalog 123_chocr.html.gz';
const OUTFILE  = process.argv.find(a => a.startsWith('--out='))?.split('=')[1]
               || 'scripts/mcmaster_catalog123_parts.sql';
const LIMIT    = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0') || 0;
const CONF_MIN = parseInt(process.argv.find(a => a.startsWith('--min-conf='))?.split('=')[1] || '82');

// McMaster part numbers: 3-5 digits + 1-2 uppercase letters + 1 digit + 0-5 alphanumeric
// e.g. 5220K21, 4810T236, 91251A194, 6655K151
// The suffix MUST start with a digit (rules out "240VAC", "24VDC", etc.)
const PART_RE  = /^[0-9]{3,5}[A-Z]{1,2}[0-9][0-9A-Z]{0,5}$/;
const PRICE_RE = /^\$?(\d{1,4}\.\d{2})$/;
// Dimension-only descriptions (all tokens are numeric/measurement patterns)
const DIM_TOKEN_RE = /^[\d.,"'°\/\\+\-x]+$/;
// Minimum real English words in a description
const LETTER_RE = /[a-zA-Z]{3,}/;

// Trier OS category mapping by description keyword
const CATEGORY_MAP = [
  { words: ['bearing','bearings','ball bearing','roller bearing','thrust bearing','pillow'],  cat: 'BEARINGS'   },
  { words: ['seal','o-ring','o-rings','gasket','gland','packing','lip seal'],                 cat: 'SEALS'      },
  { words: ['hydraulic','ram','piston','manifold','accumulator'],                             cat: 'HYDRAULICS' },
  { words: ['pneumatic','air cylinder','solenoid','regulator','actuator'],                    cat: 'PNEUMATICS' },
  { words: ['motor','gearmotor','reducer','gearbox','vfd','inverter','sheave'],               cat: 'ELECTRICAL' },
  { words: ['sensor','proximity','photoeye','encoder','transducer','detector'],               cat: 'ELECTRICAL' },
  { words: ['filter','filtration','strainer','element','cartridge'],                          cat: 'FILTRATION' },
  { words: ['lubricant','grease','oil','coolant','fluid'],                                    cat: 'FLUIDS'     },
  { words: ['glove','glasses','goggles','harness','respirator','vest','ppe'],                 cat: 'SAFETY'     },
  { words: ['belt','chain','sprocket','coupling','sheave','pulley','bushing'],                cat: 'MECHANICAL' },
  { words: ['drill','tap','end mill','reamer','insert','carbide','burr','cutter'],            cat: 'TOOLING'    },
  { words: ['screw','bolt','nut','washer','stud','rivet','anchor','hex head'],                cat: 'MECHANICAL' },
  { words: ['pipe','tube','hose','elbow','tee','union','reducer','nipple','bushing','cap'],   cat: 'MECHANICAL' },
  { words: ['valve','fitting','flange','coupling','connector'],                               cat: 'MECHANICAL' },
];

function guessCategory(text) {
  const lower = text.toLowerCase();
  for (const { words, cat } of CATEGORY_MAP) {
    if (words.some(w => lower.includes(w))) return cat;
  }
  return 'MECHANICAL';
}

// ── Word extraction ───────────────────────────────────────────────────────────
// For each ocrx_word header, collect ocrx_cinfo character text up to next word header.
function extractWords(html) {
  const words = [];

  // Find all word header positions + y1, conf, fsize
  const wordHeaderRe = /class="ocrx_word"[^>]+title="bbox \d+ (\d+) \d+ \d+; x_wconf (\d+)(?:; x_fsize (\d+))?"/g;
  const headers = [];
  let m;
  while ((m = wordHeaderRe.exec(html)) !== null) {
    headers.push({
      afterTitle: m.index + m[0].length,
      y1:   parseInt(m[1]),
      conf: parseInt(m[2]),
      fsize: parseInt(m[3] || '0'),
    });
  }
  if (headers.length === 0) return words;

  const charRe = /class="ocrx_cinfo"[^>]*>([^<]{0,8})<\/span>/g;

  for (let i = 0; i < headers.length; i++) {
    const { afterTitle, conf, y1, fsize } = headers[i];
    if (conf < CONF_MIN) continue;

    const sliceEnd = i + 1 < headers.length ? headers[i + 1].afterTitle : html.length;
    const slice = html.slice(afterTitle, sliceEnd);

    charRe.lastIndex = 0;
    let text = '';
    let cm;
    while ((cm = charRe.exec(slice)) !== null) text += cm[1];

    // Clean noise characters
    text = text
      .replace(/\.{3,}/g, '')       // dot leaders
      .replace(/[_—–-]{3,}/g, '')   // long separator dashes
      .replace(/[|[\]{}]{2,}/g, '') // bracket/pipe noise
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (!text || text.length < 2) continue;
    words.push({ text, conf, y1, fsize });
  }
  return words;
}

// ── Line grouping ─────────────────────────────────────────────────────────────
function groupIntoLines(words) {
  if (words.length === 0) return [];
  words.sort((a, b) => a.y1 - b.y1);
  const lines = [[words[0]]];
  for (let i = 1; i < words.length; i++) {
    const last = lines[lines.length - 1];
    if (Math.abs(words[i].y1 - last[0].y1) <= 10) {
      last.push(words[i]);
    } else {
      lines.push([words[i]]);
    }
  }
  return lines;
}

// Stop words that indicate a partial sentence when the description ends with them
const TRAILING_STOP = /\b(the|of|to|with|and|for|a|an|is|are|be|by|in|on|at|or|if|as|it|its|than|that|this|these|their|them|they|which|who|not|has|have|from|was|were|will|can|may|also|both|each|into|onto|over|such|then|when|where|while|used|use|meet|meets|conform|listed)\s*$/i;
// Cross-reference pattern: description that IS mostly another part number
const XREF_ONLY_RE = /^[\d.]+[A-Z]\d+(?:\.\.|,|\s|$)/;
// Description starts with noise (spec code, number, dot-ref)
const STARTS_NOISE_RE = /^[\d]{4,}[A-Z]\d+\.\.|^\d+\.\d+"|^[^\w]/;

// Returns true if the description is worth keeping.
function isGoodDesc(desc) {
  if (desc.length < 6) return false;
  // Must contain at least one real word (3+ letters in sequence)
  if (!LETTER_RE.test(desc)) return false;
  // Skip dimension-only descriptions
  const tokens = desc.split(/\s+/);
  const dimCount = tokens.filter(t => DIM_TOKEN_RE.test(t)).length;
  if (dimCount / tokens.length > 0.6) return false;
  // Skip obvious OCR noise: very few unique characters
  const unique = new Set(desc.toLowerCase()).size;
  if (unique < 5) return false;
  // Skip partial sentences (end with stop word)
  if (TRAILING_STOP.test(desc)) return false;
  // Skip lines that are cross-references (start with another part number)
  if (XREF_ONLY_RE.test(desc)) return false;
  // Skip lines starting with obvious noise
  if (STARTS_NOISE_RE.test(desc)) return false;
  // Table rows are compact (3-15 tokens); longer text is explanatory paragraph
  if (tokens.length > 15) return false;
  // Require at least 2 tokens with 3+ letters (real words, not just spec codes)
  const wordTokens = tokens.filter(t => /[a-zA-Z]{3,}/.test(t));
  if (wordTokens.length < 2) return false;
  return true;
}

// ── Part record emitter ───────────────────────────────────────────────────────
let totalParts = 0;
let outputLines = [];

function esc(s) { return String(s || '').replace(/'/g, "''"); }

function emitPart(partNum, desc, price, section) {
  totalParts++;
  const category = guessCategory(desc + ' ' + section);
  const partId   = `MC-${category.slice(0, 4)}-${partNum}`;
  const stdName  = desc.slice(0, 80).replace(/[^A-Za-z0-9 ().,/\-'"°]/g, '').trim();
  const priceMin = price !== null ? price : 'NULL';
  const specs    = JSON.stringify({ section: section || '', catalog_year: 2017 });
  const tags     = `mcmaster,catalog123,2017,${category.toLowerCase()}`;

  outputLines.push(
    `INSERT OR IGNORE INTO MasterParts` +
    ` (MasterPartID,Description,StandardizedName,Manufacturer,Category,SubCategory,UOM,` +
    `TypicalPriceMin,TypicalPriceMax,LeadTimeDays,Specifications,AlternatePartNumbers,EquipmentTypes,Tags)` +
    ` VALUES ('${esc(partId)}','${esc(desc)}','${esc(stdName)}','McMaster-Carr',` +
    `'${category}','','EA',${priceMin},${priceMin},NULL,'${esc(specs)}','${esc(partNum)}','[]','${esc(tags)}');`
  );
}

// ── Page processor ────────────────────────────────────────────────────────────
let sectionHint = '';
let done = false;

function processPage(words, pageN) {
  if (words.length === 0 || done) return;
  const lines = groupIntoLines(words);

  for (const line of lines) {
    const texts    = line.map(w => w.text);
    const avgFsize = line.reduce((s, w) => s + w.fsize, 0) / line.length;

    // Detect section heading: large font (≥24pt), short line, no part number
    if (avgFsize >= 24 && line.length <= 6 && !texts.some(t => PART_RE.test(t))) {
      const candidate = texts.join(' ').replace(/[^A-Za-z0-9 ,&/\-]/g, '').trim();
      if (candidate.length >= 4 && LETTER_RE.test(candidate)) {
        sectionHint = candidate;
      }
      continue;
    }

    // Find McMaster part numbers on this line
    const partTokens = texts.filter(t => PART_RE.test(t));
    if (partTokens.length === 0) continue;

    // Price: first USD-looking decimal number
    const priceToken = texts.find(t => PRICE_RE.test(t));
    const price = priceToken ? parseFloat(priceToken.replace('$', '')) : null;

    // Description: non-part, non-price tokens joined
    const descTokens = texts.filter(t => !PART_RE.test(t) && !PRICE_RE.test(t));
    const desc = descTokens.join(' ').replace(/[,;.]+\s*$/, '').replace(/\s{2,}/g, ' ').trim();

    if (!isGoodDesc(desc)) continue;

    for (const partNum of partTokens) {
      emitPart(partNum, desc, price, sectionHint);
      if (LIMIT > 0 && totalParts >= LIMIT) { done = true; return; }
    }
  }
}

// ── Streaming buffer management ───────────────────────────────────────────────
// Algorithm:
//   buf = accumulated decompressed HTML chunks
//   On each flush: find page markers M0..Mk in buf
//     prevTail = buf[0 .. M0]          → tail of previous page → completes pageBuf
//     page i   = buf[Mi .. M(i+1)]     → complete pages 0..k-1 → process immediately
//     nextStart = buf[Mk ..]           → start of page k      → accumulate in pageBuf
//
// This guarantees each page is processed exactly once when fully received.

let buf     = '';
let pageBuf = [];    // words accumulated for the page currently being received
let pageNum = 0;

const PAGE_RE = /<div class="ocr_page"[^>]+ppageno (\d+)[^>]*>/g;

function processBuffer(isFinal) {
  PAGE_RE.lastIndex = 0;
  const markers = [];
  let m;
  while ((m = PAGE_RE.exec(buf)) !== null) {
    markers.push({ idx: m.index, num: parseInt(m[1]) });
  }

  if (markers.length === 0) {
    // No page boundaries yet — keep accumulating
    if (isFinal && buf.length > 0) {
      pageBuf.push(...extractWords(buf));
      processPage(pageBuf, pageNum);
      pageBuf = [];
      buf = '';
    }
    return;
  }

  // Step 1: prevTail (buf[0..M0]) = tail of the previous page → completes pageBuf
  const prevTail = buf.slice(0, markers[0].idx);
  if (prevTail.length > 0) pageBuf.push(...extractWords(prevTail));
  processPage(pageBuf, pageNum);       // flush the now-complete previous page
  pageBuf = [];
  if (done) { buf = ''; return; }

  // Step 2: process each complete interior page (Mi..M(i+1))
  for (let i = 0; i < markers.length - 1; i++) {
    pageNum = markers[i].num;
    if (pageNum % 200 === 0) process.stdout.write(`\r  Page ${pageNum}  ${totalParts} parts found   `);
    const pageHtml = buf.slice(markers[i].idx, markers[i + 1].idx);
    const words = extractWords(pageHtml);
    processPage(words, pageNum);
    if (done) { buf = ''; return; }
  }

  // Step 3: last marker starts the next page (may be incomplete)
  const lastMarker = markers[markers.length - 1];
  pageNum = lastMarker.num;
  if (pageNum % 200 === 0) process.stdout.write(`\r  Page ${pageNum}  ${totalParts} parts found   `);

  if (isFinal) {
    // Process the last page too
    const lastHtml = buf.slice(lastMarker.idx);
    pageBuf.push(...extractWords(lastHtml));
    processPage(pageBuf, pageNum);
    pageBuf = [];
    buf = '';
  } else {
    // Accumulate the start of the last page for the next chunk
    const nextStart = buf.slice(lastMarker.idx);
    pageBuf.push(...extractWords(nextStart));
    buf = '';  // fully consumed
  }
}

// ── Output file ───────────────────────────────────────────────────────────────
const outStream = fs.createWriteStream(OUTFILE);
outStream.write([
  `-- Source: McMaster-Carr Catalog 123 (2017 archive edition)`,
  `-- Extracted: ${new Date().toISOString().slice(0, 10)}`,
  `-- Vertical: Cross-vertical (all Trier OS industries)`,
  `-- Origin: archive.org/download/mcmastercarr123 (chocr.html.gz)`,
  `-- WARNING: Prices are 2017 list prices — use as TypicalPrice estimates only`,
  `-- AlternatePartNumbers = real McMaster catalog numbers from 2017 edition`,
  `-- OCR confidence min: ${CONF_MIN}% | Description quality filter: enabled`,
  `-- Total parts extracted: PLACEHOLDER`,
  ``, ``
].join('\n'));

// ── Main stream ───────────────────────────────────────────────────────────────
const FLUSH_AT = 3 * 1024 * 1024; // process every 3MB of decompressed HTML

const gunzip      = zlib.createGunzip();
const inputStream = fs.createReadStream(INPUT);
inputStream.pipe(gunzip);

gunzip.on('data', chunk => {
  if (done) return;
  buf += chunk.toString('utf8');
  if (buf.length >= FLUSH_AT) {
    processBuffer(false);
    if (outputLines.length > 500) {
      outStream.write(outputLines.splice(0).join('\n') + '\n');
    }
  }
});

gunzip.on('close', finish);
gunzip.on('error', err => {
  if (err.code !== 'ERR_STREAM_DESTROYED') console.error('\nGunzip error:', err.message);
  finish();
});

function finish() {
  if (!done) processBuffer(true);
  if (outputLines.length > 0) outStream.write(outputLines.join('\n') + '\n');
  outStream.end(() => {
    const sql = fs.readFileSync(OUTFILE, 'utf8').replace('PLACEHOLDER', String(totalParts));
    fs.writeFileSync(OUTFILE, sql);
    console.log(`\n\n✓ Done.`);
    console.log(`  Parts extracted : ${totalParts}`);
    console.log(`  Last page       : ${pageNum}`);
    console.log(`  Output file     : ${OUTFILE}`);
  });
}

console.log(`McMaster-Carr Catalog 123 extractor`);
console.log(`  OCR conf min: ${CONF_MIN}%  |  Limit: ${LIMIT || 'none'}  |  Out: ${OUTFILE}\n`);
