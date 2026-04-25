// Copyright © 2026 Trier OS. All Rights Reserved.
// Generates batched Gemini prompts to look up real McMaster-Carr product data.
//
// Reads directly from mfg_master.db — automatically skips already-updated parts.
// Optimized for Gemini Ultra (50 parts/batch vs 15 for standard).
//
// Usage:
//   node scripts/generate_mcmaster_lookup_prompts.js [--top=N] [--batch=N] [--cats=CAT1,CAT2]
//   node scripts/generate_mcmaster_lookup_prompts.js --batch=50              (Ultra: 50/batch)
//   node scripts/generate_mcmaster_lookup_prompts.js --batch=50 --top=5000  (large run)
//
// Output: Catalogs/Prompts/mcmaster_lookup_batch_NNN.txt

'use strict';

const fs       = require('fs');
const path     = require('path');
const Database = require('better-sqlite3');

const DB_PATH  = 'data/mfg_master.db';
const OUT_DIR  = 'Catalogs/Prompts';

const TOP_N    = parseInt(process.argv.find(a => a.startsWith('--top='))?.split('=')[1] || '500');
const BATCH_SZ = parseInt(process.argv.find(a => a.startsWith('--batch='))?.split('=')[1] || '50');
const CAT_FILTER = process.argv.find(a => a.startsWith('--cats='))?.split('=')[1]?.split(',') || null;

if (!fs.existsSync(DB_PATH)) {
  console.error(`Database not found: ${DB_PATH}`);
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
// Clear old batch files so numbering restarts cleanly
fs.readdirSync(OUT_DIR)
  .filter(f => f.startsWith('mcmaster_lookup_batch_') && f.endsWith('.txt'))
  .forEach(f => fs.unlinkSync(path.join(OUT_DIR, f)));

const db = new Database(DB_PATH, { readonly: true });

// ── Pull parts that still need lookup ────────────────────────────────────────
// Skip: already updated (Specifications contains 2026), or no AlternatePartNumbers
let query = `
  SELECT MasterPartID, AlternatePartNumbers as partNum, Description as desc,
         Category as cat, TypicalPriceMin as price
  FROM MasterParts
  WHERE Tags LIKE '%mcmaster%'
    AND AlternatePartNumbers IS NOT NULL AND AlternatePartNumbers != ''
    AND (Specifications NOT LIKE '%current_price_year%' OR Specifications LIKE '%2017%')
`;
if (CAT_FILTER) {
  query += ` AND Category IN (${CAT_FILTER.map(() => '?').join(',')})`;
}
query += ' ORDER BY Category, TypicalPriceMin DESC NULLS LAST';

const rows = CAT_FILTER ? db.prepare(query).all(...CAT_FILTER) : db.prepare(query).all();
db.close();

console.log(`Parts needing Gemini lookup: ${rows.length}`);

// ── Score and sort by priority ────────────────────────────────────────────────
function descScore(desc, cat, price) {
  let score = 0;
  const highPriCats = ['BEARINGS','SEALS','HYDRAULICS','PNEUMATICS','FILTRATION','ELECTRICAL'];
  if (highPriCats.includes(cat)) score += 30;
  if (price !== null) score += 20;
  const words = (desc || '').split(/\s+/);
  const letterWords = words.filter(w => /[a-zA-Z]{3,}/.test(w));
  if (letterWords.length < 3) score += 25;
  if (/\b(the|of|to|with|and|for|by|in|on|at|or|above)\s*$/i.test(desc)) score += 20;
  if (/\(see \d+\)/.test(desc)) score += 25;
  if (/^[A-Z][a-z].*[A-Za-z]{3}$/.test(desc) && letterWords.length >= 4) score -= 15;
  return score;
}

const parts = rows.map(r => ({ ...r, score: descScore(r.desc, r.cat, r.price) }));
parts.sort((a, b) => b.score - a.score);

const selected = parts.slice(0, TOP_N);
console.log(`Selected top ${selected.length} parts for lookup (batch size: ${BATCH_SZ})`);

// Category breakdown
const catCounts = {};
selected.forEach(p => { catCounts[p.cat] = (catCounts[p.cat] || 0) + 1; });
console.log('Category breakdown:');
Object.entries(catCounts).sort((a,b) => b[1]-a[1])
  .forEach(([c,n]) => console.log(`  ${c.padEnd(14)} ${n}`));

// ── Generate prompt batches ───────────────────────────────────────────────────
const batches = [];
for (let i = 0; i < selected.length; i += BATCH_SZ) {
  batches.push(selected.slice(i, i + BATCH_SZ));
}

console.log(`\nGenerating ${batches.length} prompt files (${BATCH_SZ} parts each) → ${OUT_DIR}/`);

const PROMPT_TEMPLATE = (batchNum, totalBatches, parts) => {
  const urlList = parts.map(p =>
    `  - https://www.mcmaster.com/${p.partNum}/  (current desc: "${(p.desc || '').slice(0, 55)}")`
  ).join('\n');

  const partNums = parts.map(p => p.partNum).join(', ');

  return `You are helping build an industrial parts catalog database (Trier OS).
I have ${parts.length} McMaster-Carr part numbers from a 2017 archive with poor OCR descriptions.
Visit the current live mcmaster.com product page for every part number listed below and return accurate SQL UPDATE statements.

PART NUMBERS TO VISIT (${parts.length} total — visit ALL of them):
${urlList}

RULES:
1. Visit https://www.mcmaster.com/PARTNUMBER/ for each part number exactly as shown
2. Active product → use the exact product title from the page, extract specs and current price
3. Discontinued / "no longer available" → Description = "DISCONTINUED: [product name]", price = NULL, include replacement part number in Specifications JSON if shown
4. 404 / not found → omit that part number only

FIELD RULES:
- Description: exact product title from page including material, size, thread, voltage, rating — be specific
- StandardizedName: short version of Description, 80 chars max, no pack size
- TypicalPriceMin: the "each" price or lowest unit price shown (number only, no $ sign). NULL if not shown.
- TypicalPriceMax: same as TypicalPriceMin unless a quantity price range is shown. NULL if not shown.
- Specifications: JSON object — include material, dimensions, pressure/temp ratings, voltage, thread size, compatibility notes — whatever specs appear on the page. Always include "current_price_year": 2026.

CRITICAL OUTPUT RULES:
- Output ONLY a single SQL code block — no prose, no explanations, no text outside the code block
- Do not split into multiple code blocks
- Do not summarize or add notes after the SQL block
- Every UPDATE statement must end with a semicolon

\`\`\`sql
-- Batch ${batchNum}/${totalBatches} — McMaster-Carr live lookup
-- Retrieved: [today's date]

UPDATE MasterParts SET Description = 'FULL PRODUCT NAME FROM PAGE', StandardizedName = 'SHORT NAME 80 CHARS MAX', TypicalPriceMin = 0.00, TypicalPriceMax = 0.00, Specifications = '{"current_price_year": 2026, "material": "...", "size": "..."}' WHERE AlternatePartNumbers = 'PARTNUMBER';
\`\`\`

PART NUMBERS: ${partNums}
`;
};

batches.forEach((batch, i) => {
  const batchNum = i + 1;
  const filename = path.join(OUT_DIR, `mcmaster_lookup_batch_${String(batchNum).padStart(3, '0')}.txt`);
  const content  = PROMPT_TEMPLATE(batchNum, batches.length, batch);
  fs.writeFileSync(filename, content, 'utf8');
});

console.log(`\n✓ Done. ${batches.length} prompt files written to ${OUT_DIR}/`);
console.log(`\nNext steps (Gemini Ultra — ${BATCH_SZ} parts per batch):`);
console.log(`  1. Open gemini.google.com — make sure web browsing is ON`);
console.log(`  2. Paste mcmaster_lookup_batch_001.txt → save SQL response as results/batch_001_results.sql`);
console.log(`  3. Continue through all ${batches.length} batches`);
console.log(`  4. node scripts/apply_mcmaster_updates.js  (applies all results at once)`);
console.log(`\n  At ${BATCH_SZ} parts/batch × ${batches.length} batches = ${selected.length} parts total`);
