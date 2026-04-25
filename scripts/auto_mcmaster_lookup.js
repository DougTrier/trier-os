// Copyright © 2026 Trier OS. All Rights Reserved.
// Automated McMaster-Carr product lookup via Gemini API with URL context.
//
// Reads unmapped parts from mfg_master.db, sends batches to Gemini API,
// saves SQL result files to Catalogs/Prompts/results/, then apply with:
//   node scripts/apply_mcmaster_updates.js
//
// Usage:
//   GEMINI_API_KEY=xxx node scripts/auto_mcmaster_lookup.js
//   GEMINI_API_KEY=xxx node scripts/auto_mcmaster_lookup.js --batch=50 --limit=5
//   GEMINI_API_KEY=xxx node scripts/auto_mcmaster_lookup.js --start=10  (resume from batch 10)
//   GEMINI_API_KEY=xxx node scripts/auto_mcmaster_lookup.js --dry-run   (show plan, no API calls)
//
// Get a free API key at: https://aistudio.google.com/app/apikey
// Free tier: 1,500 requests/day, 15 RPM — enough for all 10,000 parts in ~15 min

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
const MODEL      = 'gemini-2.5-flash';
const DELAY_MS   = 5000;  // 5s between batches → 12 RPM (free tier limit is 15 RPM)
const DB_PATH    = 'data/mfg_master.db';
const RESULTS_DIR = 'Catalogs/Prompts/results';

if (!API_KEY) {
  console.error('Error: GEMINI_API_KEY not set.');
  console.error('  Add GEMINI_API_KEY=your_key to your .env file');
  console.error('  Get a free key at: https://aistudio.google.com/app/apikey');
  process.exit(1);
}

if (!fs.existsSync(DB_PATH)) {
  console.error(`Database not found: ${DB_PATH}`);
  process.exit(1);
}

fs.mkdirSync(RESULTS_DIR, { recursive: true });

// ── Load parts that still need lookup ─────────────────────────────────────────
const db = new Database(DB_PATH, { readonly: true });
const rows = db.prepare(`
  SELECT AlternatePartNumbers as partNum, Description as desc
  FROM MasterParts
  WHERE Tags LIKE '%mcmaster%'
    AND AlternatePartNumbers IS NOT NULL AND AlternatePartNumbers != ''
    AND (Specifications NOT LIKE '%current_price_year%' OR Specifications LIKE '%2017%')
  ORDER BY Category, TypicalPriceMin DESC NULLS LAST
`).all();
db.close();

console.log(`Parts remaining: ${rows.length}`);

// ── Split into batches ─────────────────────────────────────────────────────────
const batches = [];
for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  batches.push(rows.slice(i, i + BATCH_SIZE));
}
const batchesToRun = batches.slice(START_AT - 1, START_AT - 1 + LIMIT);

console.log(`Batches total : ${batches.length} (${BATCH_SIZE} parts each)`);
console.log(`Running       : batches ${START_AT}–${START_AT + batchesToRun.length - 1}`);
console.log(`Model         : ${MODEL}`);
console.log(`Est. time     : ~${Math.ceil(batchesToRun.length * DELAY_MS / 60000)} minutes`);
if (DRY_RUN) console.log('DRY RUN — no API calls will be made\n');
else console.log('');

// ── Build prompt for a batch ───────────────────────────────────────────────────
function buildPrompt(parts) {
  const urlList = parts.map(p =>
    `  - https://www.mcmaster.com/${p.partNum}/  (current desc: "${(p.desc || '').slice(0, 55)}")`
  ).join('\n');
  const partNums = parts.map(p => p.partNum).join(', ');

  return `You are helping build an industrial parts catalog database (Trier OS).
Visit the current live mcmaster.com product page for every part number below and return accurate SQL UPDATE statements.

PART NUMBERS TO VISIT (${parts.length} total — visit ALL of them):
${urlList}

RULES:
1. Visit https://www.mcmaster.com/PARTNUMBER/ for each part number exactly as shown
2. Active product → use the exact product title, extract specs and current price
3. Discontinued → Description = "DISCONTINUED: [product name]", price = NULL, include replacement in Specifications if shown
4. 404 / not found → omit that part only

FIELD RULES:
- Description: exact product title including material, size, thread, voltage, rating
- StandardizedName: short version, 80 chars max, no pack size
- TypicalPriceMin / TypicalPriceMax: "each" price as a number, no $ sign. NULL if not shown.
- Specifications: JSON with material, dimensions, ratings, thread, voltage — always include "current_price_year": 2026

CRITICAL: Output ONLY a single SQL code block — no prose, no text outside the block, no explanations.

\`\`\`sql
UPDATE MasterParts SET Description = 'FULL PRODUCT NAME', StandardizedName = 'SHORT NAME', TypicalPriceMin = 0.00, TypicalPriceMax = 0.00, Specifications = '{"current_price_year": 2026, "material": "..."}' WHERE AlternatePartNumbers = 'PARTNUMBER';
\`\`\`

PART NUMBERS: ${partNums}`;
}

// ── Extract SQL from Gemini response ───────────────────────────────────────────
function extractSql(text) {
  // Try fenced code block first
  const fenced = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  // Fall back to raw UPDATE statements
  const lines = text.split('\n').filter(l => /^\s*UPDATE\s+MasterParts/i.test(l));
  if (lines.length > 0) return lines.join('\n');
  return null;
}

// ── Sleep helper ───────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Retry wrapper with exponential backoff ────────────────────────────────────
async function withRetry(fn, label, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit = err.message?.includes('429') || err.message?.includes('quota');
      const wait = isRateLimit ? 60000 : attempt * 10000;
      if (attempt === maxRetries) throw err;
      console.log(`  ↻ ${label} — attempt ${attempt} failed (${err.message?.slice(0,60)}), retrying in ${wait/1000}s...`);
      await sleep(wait);
    }
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  if (DRY_RUN) {
    batchesToRun.forEach((batch, i) => {
      const batchNum = START_AT + i;
      const outFile = path.join(RESULTS_DIR, `auto_batch_${String(batchNum).padStart(4,'0')}.sql`);
      const exists = fs.existsSync(outFile);
      console.log(`Batch ${batchNum}: ${batch.length} parts → ${path.basename(outFile)} ${exists ? '(EXISTS — would skip)' : ''}`);
    });
    return;
  }

  const ai = new GoogleGenAI({ apiKey: API_KEY });

  let totalUpdates = 0;
  let skippedBatches = 0;

  for (let i = 0; i < batchesToRun.length; i++) {
    const batchNum  = START_AT + i;
    const batch     = batchesToRun[i];
    const outFile   = path.join(RESULTS_DIR, `auto_batch_${String(batchNum).padStart(4,'0')}.sql`);

    // Skip if already processed with real updates
    if (fs.existsSync(outFile)) {
      const existing = fs.readFileSync(outFile, 'utf8').match(/UPDATE MasterParts/gi)?.length || 0;
      if (existing > 0) {
        console.log(`[${batchNum}/${batches.length}] SKIP — ${path.basename(outFile)} already exists (${existing} updates)`);
        skippedBatches++;
        continue;
      }
      // File exists but empty — delete and retry
      fs.unlinkSync(outFile);
    }

    const prompt = buildPrompt(batch);
    process.stdout.write(`[${batchNum}/${batches.length}] Sending ${batch.length} parts to Gemini...`);

    let sql = null;
    try {
      const response = await withRetry(async () => {
        return await ai.models.generateContent({
          model: MODEL,
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }],
            temperature: 0.1,
          }
        });
      }, `batch ${batchNum}`);

      const text = response?.text;
      if (!text) {
        console.log(` ✗ Empty response from API`);
        continue;
      }
      sql = extractSql(text);

      if (!sql) {
        console.log(` ✗ No SQL found in response`);
        fs.writeFileSync(outFile + '.raw.txt', text, 'utf8');
        continue;
      }

      const updateCount = (sql.match(/UPDATE MasterParts/gi) || []).length;
      if (updateCount === 0) {
        console.log(` ✗ SQL block empty (0 updates) — skipping file write`);
        fs.writeFileSync(outFile + '.raw.txt', text, 'utf8');
        continue;
      }

      console.log(` ✓ ${updateCount} updates`);
      totalUpdates += updateCount;

      // Write SQL file with header
      const header = `-- auto_batch_${batchNum} — McMaster-Carr live lookup via Gemini API\n-- Retrieved: ${new Date().toISOString().slice(0,10)}\n-- Parts: ${batch.map(p => p.partNum).join(', ')}\n\n`;
      fs.writeFileSync(outFile, header + sql + '\n', 'utf8');

    } catch (err) {
      console.log(` ✗ Failed: ${err.message?.slice(0, 80)}`);
    }

    // Rate limiting delay (skip after last batch)
    if (i < batchesToRun.length - 1) await sleep(DELAY_MS);
  }

  console.log('\n═══════════════════════════════════');
  console.log(`Batches run   : ${batchesToRun.length - skippedBatches}`);
  console.log(`Batches skipped (already done): ${skippedBatches}`);
  console.log(`Total updates : ${totalUpdates}`);
  console.log(`\nNext step: node scripts/apply_mcmaster_updates.js`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
