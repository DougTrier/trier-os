// Copyright © 2026 Trier OS. All Rights Reserved.
// Automated Grainger product lookup via Gemini API with Google Search grounding.
//
// Reads unmapped Grainger parts from mfg_master.db, sends batches to Gemini,
// saves SQL result files to Catalogs/Prompts/results/grainger/, then apply with:
//   node scripts/apply_mcmaster_updates.js --dir=Catalogs/Prompts/results/grainger
//
// Usage:
//   GEMINI_API_KEY=xxx node scripts/auto_grainger_lookup.js
//   GEMINI_API_KEY=xxx node scripts/auto_grainger_lookup.js --batch=50 --limit=10
//   GEMINI_API_KEY=xxx node scripts/auto_grainger_lookup.js --cats=ELECTRICAL,HYDRAULICS
//   GEMINI_API_KEY=xxx node scripts/auto_grainger_lookup.js --start=5  (resume from batch 5)
//   GEMINI_API_KEY=xxx node scripts/auto_grainger_lookup.js --dry-run

'use strict';

require('dotenv').config();

const fs       = require('fs');
const path     = require('path');
const Database = require('better-sqlite3');
const { GoogleGenAI } = require('@google/genai');

// ── Config ────────────────────────────────────────────────────────────────────
const API_KEY    = process.env.GEMINI_API_KEY;
const BATCH_SIZE = parseInt(process.argv.find(a => a.startsWith('--batch='))?.split('=')[1]  || '50');
const START_AT   = parseInt(process.argv.find(a => a.startsWith('--start='))?.split('=')[1]  || '1');
const LIMIT      = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1]  || '999999');
const DRY_RUN    = process.argv.includes('--dry-run');
const CAT_FILTER = process.argv.find(a => a.startsWith('--cats='))?.split('=')[1]?.split(',') || null;
const MODEL      = 'gemini-2.5-flash';
const DELAY_MS   = 5000;
const DB_PATH    = 'data/mfg_master.db';
const RESULTS_DIR = 'Catalogs/Prompts/results/grainger';

if (!API_KEY) {
  console.error('Error: GEMINI_API_KEY not set in .env');
  process.exit(1);
}

fs.mkdirSync(RESULTS_DIR, { recursive: true });

// ── Load parts needing lookup ─────────────────────────────────────────────────
const db = new Database(DB_PATH, { readonly: true });
let query = `
  SELECT AlternatePartNumbers as itemNo, Description as desc, Category as cat
  FROM MasterParts
  WHERE Tags LIKE '%grainger%'
    AND AlternatePartNumbers IS NOT NULL AND AlternatePartNumbers != ''
    AND (Specifications IS NULL OR Specifications NOT LIKE '%current_price_year%' OR Specifications LIKE '%catalog417%')
`;
if (CAT_FILTER) {
  query += ` AND Category IN (${CAT_FILTER.map(() => '?').join(',')})`;
}
// Prioritise high-value industrial categories first
query += `
  ORDER BY
    CASE Category
      WHEN 'BEARINGS'    THEN 1
      WHEN 'HYDRAULICS'  THEN 2
      WHEN 'PNEUMATICS'  THEN 3
      WHEN 'ELECTRICAL'  THEN 4
      WHEN 'FILTRATION'  THEN 5
      WHEN 'SEALS'       THEN 6
      WHEN 'SAFETY'      THEN 7
      WHEN 'TOOLING'     THEN 8
      WHEN 'FLUIDS'      THEN 9
      ELSE                    10
    END,
    AlternatePartNumbers
`;

const rows = CAT_FILTER ? db.prepare(query).all(...CAT_FILTER) : db.prepare(query).all();
db.close();

console.log(`Grainger parts needing lookup: ${rows.length}`);
if (CAT_FILTER) console.log(`Category filter: ${CAT_FILTER.join(', ')}`);

// Category breakdown
const cats = {};
rows.forEach(r => { cats[r.cat] = (cats[r.cat] || 0) + 1; });
Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,8)
  .forEach(([c,n]) => console.log(`  ${c.padEnd(14)} ${n}`));

// ── Batches ───────────────────────────────────────────────────────────────────
const batches = [];
for (let i = 0; i < rows.length; i += BATCH_SIZE) batches.push(rows.slice(i, i + BATCH_SIZE));
const batchesToRun = batches.slice(START_AT - 1, START_AT - 1 + LIMIT);

console.log(`\nBatches total : ${batches.length}`);
console.log(`Running       : ${START_AT}–${START_AT + batchesToRun.length - 1}`);
console.log(`Model         : ${MODEL}`);
console.log(`Est. time     : ~${Math.ceil(batchesToRun.length * DELAY_MS / 60000)} min (delays only)`);
if (DRY_RUN) { console.log('DRY RUN\n'); batchesToRun.forEach((b,i) => console.log(`Batch ${START_AT+i}: ${b.length} parts`)); process.exit(0); }
console.log('');

// ── Prompt builder ─────────────────────────────────────────────────────────────
function buildPrompt(parts) {
  const itemList = parts.map(p =>
    `  - Item# ${p.itemNo}  (current desc: "${(p.desc || '').slice(0, 55)}")`
  ).join('\n');
  const itemNos = parts.map(p => p.itemNo).join(', ');

  return `You are helping build an industrial parts catalog database (Trier OS).
Search grainger.com for each Grainger item number below and return accurate SQL UPDATE statements.

ITEMS TO LOOK UP (${parts.length} total — find ALL of them):
${itemList}

INSTRUCTIONS:
1. Search grainger.com for each item number (e.g. search "Grainger item 6XJ06" or visit grainger.com/product/ITEMNO)
2. Active product → use the exact product title, extract specs and current price
3. Discontinued / not found → Description = "DISCONTINUED: [product name if known]", price = NULL
4. Truly not findable → omit that item number only

FIELD RULES:
- Description: exact product title including brand, material, size, voltage, rating — be specific
- StandardizedName: short version, 80 chars max, no pack size
- TypicalPriceMin / TypicalPriceMax: list price as a number, no $ sign. NULL if not shown.
- Specifications: JSON — include brand, material, dimensions, ratings, voltage, model number — always include "current_price_year": 2026
- Manufacturer: brand name shown on product page (e.g. "Dayton", "Grainger Approved", "Milwaukee", "3M")

CRITICAL: Output ONLY a single SQL code block — no prose, no text outside the block.

\`\`\`sql
UPDATE MasterParts SET Description = 'FULL PRODUCT TITLE', StandardizedName = 'SHORT NAME', TypicalPriceMin = 0.00, TypicalPriceMax = 0.00, Manufacturer = 'BRAND', Specifications = '{"current_price_year": 2026, "brand": "...", "material": "..."}' WHERE AlternatePartNumbers = 'ITEMNO';
\`\`\`

ITEM NUMBERS: ${itemNos}`;
}

// ── Extract SQL ────────────────────────────────────────────────────────────────
function extractSql(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const lines = text.split('\n').filter(l => /^\s*UPDATE\s+MasterParts/i.test(l));
  if (lines.length > 0) return lines.join('\n');
  return null;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function withRetry(fn, label, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try { return await fn(); }
    catch (err) {
      const wait = err.message?.includes('429') ? 60000 : attempt * 10000;
      if (attempt === maxRetries) throw err;
      console.log(`  ↻ ${label} attempt ${attempt} failed (${err.message?.slice(0,50)}), retry in ${wait/1000}s...`);
      await sleep(wait);
    }
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  let totalUpdates = 0, skipped = 0;

  for (let i = 0; i < batchesToRun.length; i++) {
    const batchNum = START_AT + i;
    const batch    = batchesToRun[i];
    const outFile  = path.join(RESULTS_DIR, `grainger_batch_${String(batchNum).padStart(4,'0')}.sql`);

    if (fs.existsSync(outFile)) {
      const count = (fs.readFileSync(outFile,'utf8').match(/UPDATE MasterParts/gi)||[]).length;
      if (count > 0) {
        console.log(`[${batchNum}/${batches.length}] SKIP — ${path.basename(outFile)} (${count} updates)`);
        skipped++;
        continue;
      }
      fs.unlinkSync(outFile);
    }

    process.stdout.write(`[${batchNum}/${batches.length}] ${batch[0].cat} — ${batch.length} items...`);

    try {
      const response = await withRetry(async () =>
        ai.models.generateContent({
          model: MODEL,
          contents: buildPrompt(batch),
          config: { tools: [{ googleSearch: {} }], temperature: 0.1 }
        }), `batch ${batchNum}`);

      const text = response?.text;
      if (!text) { console.log(' ✗ Empty response'); continue; }

      const sql = extractSql(text);
      if (!sql) { console.log(' ✗ No SQL in response'); fs.writeFileSync(outFile+'.raw.txt', text); continue; }

      const count = (sql.match(/UPDATE MasterParts/gi)||[]).length;
      if (count === 0) { console.log(' ✗ 0 updates'); fs.writeFileSync(outFile+'.raw.txt', text); continue; }

      console.log(` ✓ ${count} updates`);
      totalUpdates += count;

      const header = `-- grainger_batch_${batchNum} — Grainger live lookup via Gemini API\n-- Retrieved: ${new Date().toISOString().slice(0,10)}\n-- Items: ${batch.map(p=>p.itemNo).join(', ')}\n\n`;
      fs.writeFileSync(outFile, header + sql + '\n', 'utf8');

    } catch (err) {
      console.log(` ✗ ${err.message?.slice(0,80)}`);
    }

    if (i < batchesToRun.length - 1) await sleep(DELAY_MS);
  }

  console.log('\n═══════════════════════════════════');
  console.log(`Batches run     : ${batchesToRun.length - skipped}`);
  console.log(`Batches skipped : ${skipped}`);
  console.log(`Total updates   : ${totalUpdates}`);
  console.log(`\nNext: node scripts/apply_mcmaster_updates.js --dir=Catalogs/Prompts/results/grainger`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
